import { field, variant } from '@dao-xyz/borsh';
import { Program } from '@peerbit/program';
import { Documents } from '@peerbit/document';
import { Access, AccessType, IdentityAccessController, PublicKeyAccessCondition } from '@peerbit/identity-access-controller';
import type { PublicSignKey } from '@peerbit/crypto';
import type { PeerId } from '@libp2p/interface';
import { AccountType, type SiteArgs } from './types';
import { BlockedContent, ContentCategory, FeaturedRelease, IndexedBlockedContent, IndexedContentCategory, IndexedFeaturedRelease, IndexedRelease, IndexedSubscription, Release, Subscription } from './schemas';
import { findAccessGrant, publicSignKeyFromString } from '../../common/utils';
import { canPerformFederatedWrite } from './lib';

@variant('site')
export class Site extends Program<SiteArgs> {
  @field({ type: Documents })
  releases: Documents<Release, IndexedRelease>;

  @field({ type: Documents })
  featuredReleases: Documents<FeaturedRelease, IndexedFeaturedRelease>;

  @field({ type: Documents })
  contentCategories: Documents<ContentCategory, IndexedContentCategory>;

  @field({ type: Documents })
  subscriptions: Documents<Subscription, IndexedSubscription>;

  @field({ type: Documents })
  blockedContent: Documents<BlockedContent, IndexedBlockedContent>;

  @field({ type: IdentityAccessController })
  administrators: IdentityAccessController;

  @field({ type: IdentityAccessController })
  members: IdentityAccessController;
  
  get federationTopic(): string {
    return `${this.address}/federation`;
  }

  constructor(rootTrust: PublicSignKey | PeerId) {
    super();
    this.releases = new Documents();
    this.featuredReleases = new Documents();
    this.contentCategories = new Documents();
    this.subscriptions = new Documents();
    this.blockedContent = new Documents();
    this.administrators = new IdentityAccessController({ rootTrust });
    this.members = new IdentityAccessController({ rootTrust });
  }

  async open(args?: SiteArgs): Promise<void> {
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);
    const memberCanPerform = this.members.canPerform.bind(this.members);

    
    await Promise.all([
      // Access controllers need to be opened first for permission checks
      this.administrators.open({
        replicate: args?.administratorsArgs?.replicate ?? { factor: 1 },
      }),
      this.members.open({
        replicate: args?.membersArg?.replicate ?? { factor: 1 },
      }),
      this.subscriptions.open({
        type: Subscription,
        replicate: args?.subscriptionsArgs?.replicate ?? { factor: 1 },
        replicas: args?.subscriptionsArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: () => {
            return true;
          },
          type: IndexedSubscription,
          transform: (release, ctx) => {
            return new IndexedSubscription({
              doc: release,
              created: ctx.created,
              modified: ctx.modified,
            });
          },
        },
      }),
    ]);

    await Promise.all([
      this.releases.open({
        type: Release,
        replicate: args?.releasesArgs?.replicate ?? { factor: 1 },
        replicas: args?.releasesArgs?.replicas,
        canPerform: async (props) => await canPerformFederatedWrite(
          this,
          props,
          this.releases,
          Release,
          (localProps) => props.type === 'put' ? memberCanPerform(localProps) : administratorCanPerform(localProps),
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexedRelease,
          transform: async (release, ctx) => {
            return new IndexedRelease({
              doc: release,
              created: ctx.created,
              modified: ctx.modified,
            });
          },
        },
      }),

      this.featuredReleases.open({
        type: FeaturedRelease,
        replicate: args?.featuredReleasesArgs?.replicate ?? { factor: 1 },
        replicas: args?.featuredReleasesArgs?.replicas,
        canPerform: async (props) => await canPerformFederatedWrite(
          this,
          props,
          this.featuredReleases,
          FeaturedRelease,
          administratorCanPerform,
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexedFeaturedRelease,
          transform: (release, ctx) => {
            return new IndexedFeaturedRelease({
              doc: release,
              created: ctx.created,
              modified: ctx.modified,
            });
          },
        },
      }),

      this.contentCategories.open({
        type: ContentCategory,
        replicate: args?.contentCategoriesArgs?.replicate ?? { factor: 1 },
        replicas: args?.contentCategoriesArgs?.replicas,
        canPerform: async (props) => await canPerformFederatedWrite(
          this,
          props,
          this.contentCategories,
          ContentCategory,
          administratorCanPerform,
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexedContentCategory,
          transform: (release, ctx) => {
            return new IndexedContentCategory({
              doc: release,
              created: ctx.created,
              modified: ctx.modified,
            });
          },
        },
      }),

      this.blockedContent.open({
        type: BlockedContent,
        replicate: args?.blockedContentArgs?.replicate ?? true,
        replicas: args?.blockedContentArgs?.replicas,
        canPerform: async (props) => await canPerformFederatedWrite(
          this,
          props,
          this.blockedContent,
          BlockedContent,
          administratorCanPerform,
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexedBlockedContent,
          transform: (release, ctx) => {
            return new IndexedBlockedContent({
              doc: release,
              created: ctx.created,
              modified: ctx.modified,
            });
          },
        },
      }),
    ]);

  }

  /**
   * @internal
   * Grants a role to a user. Called by the service layer.
   * This is the low-level method that performs the database write.
   */
  async _authorise(accountType: AccountType, stringPublicKey: string): Promise<void> {
    const publicSignKey = publicSignKeyFromString(stringPublicKey);
    const accessCondition = new PublicKeyAccessCondition({ key: publicSignKey });
    const accessTypes: AccessType[] = [AccessType.Read, AccessType.Write];

    if (accountType === AccountType.MEMBER) {
      const access = new Access({ accessCondition, accessTypes });
      await this.members.access.put(access);
    } else if (accountType === AccountType.ADMIN) {
      const access = new Access({ accessCondition, accessTypes });
      await this.members.access.put(access);
      await this.administrators.access.put(access);
    } else {
      throw new Error('Authorization for this account type is not implemented yet.');
    }
  }

  /**
   * @internal
   * Revokes a role from a user. Called by the service layer.
   * This is the low-level method that performs the database search and delete.
   */
  async _revoke(accountType: AccountType, stringPublicKey: string): Promise<void> {
    const publicSignKey = publicSignKeyFromString(stringPublicKey);

    // Helper to find and delete the grant.
    const findAndDel = async (acl: IdentityAccessController['access'], key: PublicSignKey) => {
      const grant = await findAccessGrant(acl, key); // Use the new common utility!
      if (grant) {
        await acl.del(grant.id);
      }
    };

    if (accountType === AccountType.MEMBER) {
      await findAndDel(this.members.access, publicSignKey);
    } else if (accountType === AccountType.ADMIN) {
      // Revoking ADMIN must revoke from both lists.
      await findAndDel(this.administrators.access, publicSignKey);
      await findAndDel(this.members.access, publicSignKey);
    } else {
      throw new Error('Revocation for this account type is not implemented or invalid.');
    }
  }
}
