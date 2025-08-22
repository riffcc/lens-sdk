import type { AbstractType } from '@dao-xyz/borsh';
import { deserialize, field, variant } from '@dao-xyz/borsh';
import type { PublicSignKey } from '@peerbit/crypto';
import type { CanPerformOperations } from '@peerbit/document';
import { Documents, isPutOperation, SearchRequest, StringMatch, StringMatchMethod } from '@peerbit/document';
import { Program } from '@peerbit/program';

import type { Role } from '../acl/rbac/index.js';
import { RoleBasedccessController } from '../acl/rbac/program.js';
import { defaultSiteContentCategories, defaultSiteRoles } from './defaults.js';
import { BlockedContent, IndexedBlockedContent } from './schemas/blocked-content.js';
import { ContentCategory, IndexedContentCategory } from './schemas/content-category.js';
import { FeaturedRelease, IndexedFeaturedRelease } from './schemas/featured-release.js';
import { IndexedRelease, Release } from './schemas/release.js';
import { IndexedSubscription, Subscription } from './schemas/subscription.js';
import type { ContentCategoryData, ContentCategoryMetadataField, ImmutableProps } from './types.js';
import { type SiteArgs } from './types.js';

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

  @field({ type: RoleBasedccessController })
  access: RoleBasedccessController;

  get federationTopic(): string {
    return `${this.address}/federation`;
  }

  constructor(props: { rootAdmin: PublicSignKey; defaultRoles?: Role[] }) {
    super();
    this.releases = new Documents();
    this.featuredReleases = new Documents();
    this.contentCategories = new Documents();
    this.subscriptions = new Documents();
    this.blockedContent = new Documents();
    this.access = new RoleBasedccessController({
      rootAdmin: props.rootAdmin,
      defaultRoles: props.defaultRoles ?? defaultSiteRoles,
    });
  }

  async open(args?: SiteArgs): Promise<void> {
    const getDoc = async <T extends ImmutableProps, I extends object = T>(
      props: CanPerformOperations<T>,
      store: Documents<T, I>,
      docClass: AbstractType<T>
    ): Promise<{
      doc: T;
      existingDoc?: T;
      signer: PublicSignKey;
    }> => {
      const signer = props.entry.signatures[0].publicKey;
      if (isPutOperation(props.operation)) {
        const doc = deserialize(props.operation.data, docClass);
        const existingDoc = await store.index.get(doc.id);
        return { doc, existingDoc, signer };
      }
      // Delete operation
      const doc = await store.index.get(props.operation.key.key);
      return { doc: doc!, existingDoc: doc, signer };
    };

    await Promise.all([
      this.access.open(),

      this.subscriptions.open({
        type: Subscription,
        replicate: args?.subscriptionsArgs?.replicate ?? { factor: 1 },
        replicas: args?.subscriptionsArgs?.replicas,
        canPerform: async (props) => {
          // Subscriptions are always local, no federation check needed.
          const { signer } = await getDoc(props, this.subscriptions, Subscription);
          return this.access.can({ permission: 'subscription:manage', identity: signer });
        },
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
        canPerform: async (props) => {
          const { doc, existingDoc, signer } = await getDoc(props, this.releases, Release);
          if (!doc) return false; // Delete on a non-existent doc

          // ROUTER: Check if local or federated
          if (doc.siteAddress !== this.address) {
            return this._isFederatedWriteAllowed(
              doc,
              signer,
              isPutOperation(props.operation) ? 'release:edit:any' : 'release:delete'
            );
          }

          // --- LOCAL RBAC LOGIC ---
          if (isPutOperation(props.operation)) {
            if (!signer.equals(doc.postedBy)) {
              // Impersonation attempt, must have 'edit:any' permission
              return this.access.can({ permission: 'release:edit:any', identity: signer });
            }
            if (existingDoc) {
              // Editing own release
              return this.access.can({ permission: 'release:edit:own', identity: signer });
            }
            // Creating new release
            return this.access.can({ permission: 'release:create', identity: signer });
          }
          // Local delete
          return this.access.can({ permission: 'release:delete', identity: signer });
        },
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
        canPerform: async (props) => {
          const requiredPermission = 'featured:manage';
          const { doc, signer } = await getDoc(props, this.featuredReleases, FeaturedRelease);
          if (!doc) return false;
          return doc.siteAddress !== this.address
            ? this._isFederatedWriteAllowed(doc, signer, requiredPermission)
            : this.access.can({ permission: requiredPermission, identity: signer });
        },
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
        canPerform: async (props) => {
          const requiredPermission = 'category:manage';
          const { doc, signer } = await getDoc(props, this.contentCategories, ContentCategory);
          if (!doc) return false;
          return doc.siteAddress !== this.address
            ? this._isFederatedWriteAllowed(doc, signer, requiredPermission)
            : this.access.can({ permission: requiredPermission, identity: signer });
        },
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
        canPerform: async (props) => {
          const requiredPermission = 'blocklist:manage';
          const { doc, signer } = await getDoc(props, this.blockedContent, BlockedContent);
          if (!doc) return false;
          return doc.siteAddress !== this.address
            ? this._isFederatedWriteAllowed(doc, signer, requiredPermission)
            : this.access.can({ permission: requiredPermission, identity: signer });
        },
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

  private async _isSubscribed(to: string): Promise<boolean> {
    const results = await this.subscriptions.index.search(
      new SearchRequest({
        query: [
          new StringMatch({
            key: 'to',
            value: to,
            caseInsensitive: false,
            method: StringMatchMethod.exact,
          }),
        ],
        fetch: 1,
      })
    );
    return results.length > 0;
  }

  /**
   * Checks if an operation on a foreign document is allowed based on federation rules.
   * @param doc The document from a remote site.
   * @param signer The public key of the peer who signed the operation.
   * @param permission The required permission for this action
   */
  private async _isFederatedWriteAllowed(
    doc: { siteAddress: string },
    signer: PublicSignKey,
    permission: string
  ): Promise<boolean> {
    const signerCanPerformLocally = await this.access.can({ permission, identity: signer });
    return (await this._isSubscribed(doc.siteAddress)) || signerCanPerformLocally;
  }

  /**
   * Idempotently creates the default content categories if they don't already exist.
   * This is a public method that can only be successfully called by the site's root administrator.
   * @param initialCategories An optional array of categories to use instead of the defaults.
   */
  async initContentCategories(
    initialCategories: ContentCategoryData<ContentCategoryMetadataField>[] = defaultSiteContentCategories
  ): Promise<void> {
    if (!this.node.identity.publicKey.equals(this.access.admins.rootTrust)) {
      throw new Error('Only the root administrator can initialize default content categories.');
    }

    if (!initialCategories || initialCategories.length === 0) {
      return;
    }

    for (const category of initialCategories) {
      // Check for existence by the stable categoryId
      const existingCategories = await this.contentCategories.index.search(
        new SearchRequest({
          query: [new StringMatch({ key: 'categoryId', value: category.categoryId, caseInsensitive: true })],
        })
      );

      if (existingCategories.length === 0) {
        try {
          const metadataSchemaString = JSON.stringify(category.metadataSchema);

          await this.contentCategories.put(
            new ContentCategory({
              postedBy: this.node.identity.publicKey,
              siteAddress: this.address,
              categoryId: category.categoryId,
              displayName: category.displayName,
              featured: category.featured,
              description: category.description,
              metadataSchema: metadataSchemaString,
            })
          );
        } catch (error) {
          // Ignore errors, as another instance of the same root admin might
          // have created the category in a race condition.
          console.warn(`Could not create default content category "${category.displayName}":`, error);
        }
      }
    }
  }
}
