import type {
  CanPerformOperations,
  DocumentsChange,
  Operation,
  WithContext,
} from '@peerbit/document';
import {
  Documents,
  isDeleteOperation,
  isPutOperation,
  SearchRequest,
  StringMatch,
  StringMatchMethod,
} from '@peerbit/document';
import type { AbstractType } from '@dao-xyz/borsh';
import { deserialize, field, option, serialize, variant, vec } from '@dao-xyz/borsh';
import type { MaybePromise } from '@peerbit/crypto';
import { type PublicSignKey } from '@peerbit/crypto';
import { Program } from '@peerbit/program';
import { IdentityAccessController } from '@peerbit/identity-access-controller';
import { v4 as uuid } from 'uuid';
import type { PeerId } from '@libp2p/interface';
import { Entry } from '@peerbit/log';
import {
  Access,
  AccessType,
  PublicKeyAccessCondition,
} from '@peerbit/identity-access-controller';
import { publicSignKeyFromString } from './utils';

import {
  ID_PROPERTY,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
  FEATURED_RELEASE_ID_PROPERTY,
  FEATURED_START_TIME_PROPERTY,
  FEATURED_END_TIME_PROPERTY,
  FEATURED_PROMOTED_PROPERTY,
  CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY,
  CONTENT_CATEGORY_DESCRIPTION_PROPERTY,
  CONTENT_CATEGORY_FEATURED_PROPERTY,
  CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  BLOCKED_CONTENT_CID_PROPERTY,
  SITE_NAME_PROPERTY,
  SITE_DESCRIPTION_PROPERTY,
  SITE_IMAGE_CID_PROPERTY,
  SITE_ADDRESS_PROPERTY,
} from './constants';

import type {
  ReleaseData,
  FeaturedReleaseData,
  ContentCategoryData,
  SubscriptionData,
  BlockedContentData,
  SiteArgs,
  IdData,
} from './types';
import { AccountType } from './types';

@variant('release')
export class Release {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_NAME_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_CATEGORY_ID_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_CONTENT_CID_PROPERTY]: string;

  @field({ type: option('string') })
  [RELEASE_THUMBNAIL_CID_PROPERTY]?: string;

  @field({ type: option('string') })
  [RELEASE_METADATA_PROPERTY]?: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  constructor(props: Partial<IdData> & ReleaseData) {
    this[ID_PROPERTY] = props[ID_PROPERTY] ?? uuid();
    this[RELEASE_NAME_PROPERTY] = props[RELEASE_NAME_PROPERTY];
    this[RELEASE_CATEGORY_ID_PROPERTY] = props[RELEASE_CATEGORY_ID_PROPERTY];
    this[RELEASE_CONTENT_CID_PROPERTY] = props[RELEASE_CONTENT_CID_PROPERTY];
    if (props[RELEASE_THUMBNAIL_CID_PROPERTY]) {
      this[RELEASE_THUMBNAIL_CID_PROPERTY] = props[RELEASE_THUMBNAIL_CID_PROPERTY];
    }
    if (props[RELEASE_METADATA_PROPERTY]) {
      this[RELEASE_METADATA_PROPERTY] = props[RELEASE_METADATA_PROPERTY];
    }
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
  }
}

export class IndexableRelease {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_NAME_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_CATEGORY_ID_PROPERTY]: string;

  @field({ type: 'string' })
  [RELEASE_CONTENT_CID_PROPERTY]: string;

  @field({ type: option('string') })
  [RELEASE_THUMBNAIL_CID_PROPERTY]?: string;

  @field({ type: option('string') })
  [RELEASE_METADATA_PROPERTY]?: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    props: Release,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = props[ID_PROPERTY];
    this[RELEASE_NAME_PROPERTY] = props[RELEASE_NAME_PROPERTY];
    this[RELEASE_CATEGORY_ID_PROPERTY] = props[RELEASE_CATEGORY_ID_PROPERTY];
    this[RELEASE_CONTENT_CID_PROPERTY] = props[RELEASE_CONTENT_CID_PROPERTY];
    if (props[RELEASE_THUMBNAIL_CID_PROPERTY]) {
      this[RELEASE_THUMBNAIL_CID_PROPERTY] = props[RELEASE_THUMBNAIL_CID_PROPERTY];
    }
    if (props[RELEASE_METADATA_PROPERTY]) {
      this[RELEASE_METADATA_PROPERTY] = props[RELEASE_METADATA_PROPERTY];
    }
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

@variant('featured_release')
export class FeaturedRelease {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_RELEASE_ID_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_START_TIME_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_END_TIME_PROPERTY]: string;

  @field({ type: 'bool' })
  [FEATURED_PROMOTED_PROPERTY]: boolean;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  constructor(props: Partial<IdData> & FeaturedReleaseData) {
    this[ID_PROPERTY] = props[ID_PROPERTY] ?? uuid();
    this[FEATURED_RELEASE_ID_PROPERTY] = props[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = props[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = props[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = props[FEATURED_PROMOTED_PROPERTY];
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
  }
}

export class IndexableFeaturedRelease {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_RELEASE_ID_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_START_TIME_PROPERTY]: string;

  @field({ type: 'string' })
  [FEATURED_END_TIME_PROPERTY]: string;

  @field({ type: 'bool' })
  [FEATURED_PROMOTED_PROPERTY]: boolean;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    props: FeaturedRelease,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = props[ID_PROPERTY];
    this[FEATURED_RELEASE_ID_PROPERTY] = props[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = props[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = props[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = props[FEATURED_PROMOTED_PROPERTY];
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

@variant('content_category')
export class ContentCategory {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY]: string;

  @field({ type: 'bool' })
  [CONTENT_CATEGORY_FEATURED_PROPERTY]: boolean;

  @field({ type: option('string') })
  [CONTENT_CATEGORY_DESCRIPTION_PROPERTY]?: string;

  @field({ type: option('string') })
  [CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]?: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  constructor(props: ContentCategoryData) {
    this[ID_PROPERTY] = props[ID_PROPERTY];
    this[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY] = props[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY];
    this[CONTENT_CATEGORY_FEATURED_PROPERTY] = props[CONTENT_CATEGORY_FEATURED_PROPERTY];
    if (props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY]) {
      this[CONTENT_CATEGORY_DESCRIPTION_PROPERTY] = props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY];
    }
    if (props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]) {
      this[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY] = props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY];
    }
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
  }
}

export class IndexableContentCategory {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY]: string;

  @field({ type: 'bool' })
  [CONTENT_CATEGORY_FEATURED_PROPERTY]: boolean;

  @field({ type: option('string') })
  [CONTENT_CATEGORY_DESCRIPTION_PROPERTY]?: string;

  @field({ type: option('string') })
  [CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]?: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    contentCategory: ContentCategory,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = contentCategory[ID_PROPERTY];
    this[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY] = contentCategory[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY];
    this[CONTENT_CATEGORY_FEATURED_PROPERTY] = contentCategory[CONTENT_CATEGORY_FEATURED_PROPERTY];
    if (contentCategory[CONTENT_CATEGORY_DESCRIPTION_PROPERTY]) {
      this[CONTENT_CATEGORY_DESCRIPTION_PROPERTY] = contentCategory[CONTENT_CATEGORY_DESCRIPTION_PROPERTY];
    }
    if (contentCategory[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]) {
      this[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY] = contentCategory[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY];
    }
    this[SITE_ADDRESS_PROPERTY] = contentCategory[SITE_ADDRESS_PROPERTY];
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

@variant('subscription')
export class Subscription {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  @field({ type: option('string') })
  [SUBSCRIPTION_NAME_PROPERTY]?: string;

  constructor(props: Partial<IdData> & SubscriptionData) {
    this[ID_PROPERTY] = props[ID_PROPERTY] ?? uuid();
    this[SITE_ADDRESS_PROPERTY] = props[SITE_ADDRESS_PROPERTY];
    if (props[SUBSCRIPTION_NAME_PROPERTY]) {
      this[SUBSCRIPTION_NAME_PROPERTY] = props[SUBSCRIPTION_NAME_PROPERTY];
    }
  }
}

export class IndexableSubscription {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [SITE_ADDRESS_PROPERTY]: string;

  @field({ type: option('string') })
  [SUBSCRIPTION_NAME_PROPERTY]?: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    subscription: Subscription,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = subscription[ID_PROPERTY];
    this[SITE_ADDRESS_PROPERTY] = subscription[SITE_ADDRESS_PROPERTY];
    if (subscription[SUBSCRIPTION_NAME_PROPERTY]) {
      this[SUBSCRIPTION_NAME_PROPERTY] = subscription[SUBSCRIPTION_NAME_PROPERTY];
    }
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

@variant('blocked_content')
export class BlockedContent {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [BLOCKED_CONTENT_CID_PROPERTY]: string;

  constructor(props: BlockedContentData) {
    this[ID_PROPERTY] = uuid();
    this[BLOCKED_CONTENT_CID_PROPERTY] = props[BLOCKED_CONTENT_CID_PROPERTY];
  }
}

export class IndexableBlockedContent {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [BLOCKED_CONTENT_CID_PROPERTY]: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    blockedContent: BlockedContent,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = blockedContent[ID_PROPERTY];
    this[BLOCKED_CONTENT_CID_PROPERTY] = blockedContent[BLOCKED_CONTENT_CID_PROPERTY];
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

// // Reusable placeholder to avoid expensive async calls during indexing
// // Using a valid Ed25519 public key (all zeros is a valid point on the curve)
// const PLACEHOLDER_PUBLIC_KEY = {
//   toString: () => '12D3KooWBfmETW1ZbkdZbKKPpE3jpjyQ5WBXoDF8y9oE78cKpBsn',
//   bytes: new Uint8Array([
//     0, 37, 8, 1, 18, 32, 0, 0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
//   ]),
// } as PublicSignKey;

  // Cache for subscription checks to improve performance
  const subscriptionCache = new Map<string, { isSubscribed: boolean; timestamp: number }>();
  const CACHE_TTL = 60000; // 1 minute cache TTL

const isSubscribed = async (originSiteAddress: string, subscriptionsStore: Documents<Subscription, IndexableSubscription>): Promise<boolean> => {
  const cached = subscriptionCache.get(originSiteAddress);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.isSubscribed;
  }

  const results = await subscriptionsStore.index.search(new SearchRequest({
    query: [
      new StringMatch({
        key: SITE_ADDRESS_PROPERTY,
        value: originSiteAddress,
        caseInsensitive: false,
        method: StringMatchMethod.exact,
      }),
    ],
    fetch: 1,
  }));

  const isSubscribed = results.length > 0;
  subscriptionCache.set(originSiteAddress, { isSubscribed, timestamp: Date.now() });
  return isSubscribed;
};

const canPerformFederatedWrite = async<
  T extends { [SITE_ADDRESS_PROPERTY]: string },
  I extends object = T
>(
  localSiteAddress: string,
  props: CanPerformOperations<T>,
  subscriptionsStore: Documents<Subscription, IndexableSubscription>,
  targetSstore: Documents<T, I>,
  docClass: AbstractType<T>,
  localPermissionCheck: (props: CanPerformOperations<T>) => MaybePromise<boolean>,
): Promise<boolean> => {
  // For a 'put' operation, deserialize the incoming data to check its origin
  if (isPutOperation(props.operation)) {
    const doc = deserialize(props.operation.data, docClass);
    const originSiteAddress = doc[SITE_ADDRESS_PROPERTY];
    if (originSiteAddress === localSiteAddress) {
      return localPermissionCheck(props);
    }
    return isSubscribed(originSiteAddress, subscriptionsStore);
  }

  // For a 'delete' operation, we must first fetch the document being deleted
  // from the index to check its origin.
  if (isDeleteOperation(props.operation)) {
    const docToDelete = await targetSstore.index.get(props.operation.key.key);
    if (!docToDelete) {
      return true; // Allow delete if the document doesn't exist (idempotent)
    }
    const originSiteAddress = docToDelete[SITE_ADDRESS_PROPERTY];
    if (originSiteAddress === localSiteAddress) {
      return localPermissionCheck(props);
    }
    return isSubscribed(originSiteAddress, subscriptionsStore);
  }

  // Fallback to local permission checks for any other operation types.
  return localPermissionCheck(props);
};



@variant('federation_update')
export class FederationUpdate {
  @field({ type: 'string' })
  store: 'releases' | 'featuredReleases' | 'contentCategories'; // Which store was updated

  @field({ type: vec(Entry) }) // Sending full entries preserves all metadata and signatures
  added: Entry<Operation>[];

  @field({ type: vec(Entry) })
  removed: Entry<Operation>[];

  constructor(props: {
    store: 'releases' | 'featuredReleases' | 'contentCategories';
    added?: Entry<Operation>[];
    removed?: Entry<Operation>[];
  }) {
    this.store = props.store;
    this.added = props.added || [];
    this.removed = props.removed || [];
  }
}

@variant('site')
export class Site extends Program<SiteArgs> {

  @field({ type: Documents })
  releases: Documents<Release, IndexableRelease>;

  @field({ type: Documents })
  featuredReleases: Documents<FeaturedRelease, IndexableFeaturedRelease>;

  @field({ type: Documents })
  contentCategories: Documents<ContentCategory, IndexableContentCategory>;

  @field({ type: Documents })
  subscriptions: Documents<Subscription, IndexableSubscription>;

  @field({ type: Documents })
  blockedContent: Documents<BlockedContent, IndexableBlockedContent>;

  @field({ type: IdentityAccessController })
  members: IdentityAccessController;

  @field({ type: IdentityAccessController })
  administrators: IdentityAccessController;

  // Site metadata
  @field({ type: option('string') })
  [SITE_NAME_PROPERTY]?: string;

  @field({ type: option('string') })
  [SITE_DESCRIPTION_PROPERTY]?: string;

  @field({ type: option('string') })
  [SITE_IMAGE_CID_PROPERTY]?: string;

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
    this.members = new IdentityAccessController({ rootTrust });
    this.administrators = new IdentityAccessController({ rootTrust });
  }

  async open(args?: SiteArgs): Promise<void> {
    console.time('[Site] Total open time');
    const memberCanPerform = this.members.canPerform.bind(this.members);
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);

    // Open all stores in parallel for significantly faster initialization
    console.time('[Site] Access controllers open');
    await Promise.all([
      // Access controllers need to be opened first for permission checks
      this.members.open({
        replicate: args?.membersArg?.replicate ?? true,
      }),
      this.administrators.open({
        replicate: args?.administratorsArgs?.replicate ?? true,
      }),
    ]);
    console.timeEnd('[Site] Access controllers open');

    console.time('[Site] Data stores open');
    await Promise.all([
      this.releases.open({
        type: Release,
        replicate: args?.releasesArgs?.replicate ?? true,
        replicas: args?.releasesArgs?.replicas,
        canPerform: (props) => canPerformFederatedWrite(
          this.address,
          props,
          this.subscriptions,
          this.releases,
          Release,
          (localProps) => props.type === 'put' ? memberCanPerform(localProps) : administratorCanPerform(localProps),
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexableRelease,
          transform: async (release, ctx) => {
            return new IndexableRelease(
              release,
              ctx.created,
              ctx.modified,
              (await this.releases.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
        },
      }),

      this.featuredReleases.open({
        type: FeaturedRelease,
        replicate: args?.featuredReleasesArgs?.replicate ?? true,
        replicas: args?.featuredReleasesArgs?.replicas,
        canPerform: (props) => canPerformFederatedWrite(
          this.address,
          props,
          this.subscriptions,
          this.contentCategories, 
          ContentCategory, 
          administratorCanPerform,
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexableFeaturedRelease,
          transform: async (featuredRelease, ctx) => {
            return new IndexableFeaturedRelease(
              featuredRelease,
              ctx.created,
              ctx.modified,
              (await this.featuredReleases.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
        },
      }),

      this.contentCategories.open({
        type: ContentCategory,
        replicate: args?.contentCategoriesArgs?.replicate ?? true,
        replicas: args?.contentCategoriesArgs?.replicas,
        canPerform: (props) => canPerformFederatedWrite(
          this.address,
          props, 
          this.subscriptions,
          this.contentCategories, 
          ContentCategory, 
          administratorCanPerform,
        ),
        index: {
          canRead: () => {
            return true;
          },
          type: IndexableContentCategory,
          transform: async (contentCategory, ctx) => {
            return new IndexableContentCategory(
              contentCategory,
              ctx.created,
              ctx.modified,
              (await this.contentCategories.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
        },
      }),

      this.subscriptions.open({
        type: Subscription,
        replicate: args?.subscriptionsArgs?.replicate ?? true,
        replicas: args?.subscriptionsArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
          type: IndexableSubscription,
          transform: async (subscription, ctx) => {
            return new IndexableSubscription(
              subscription,
              ctx.created,
              ctx.modified,
              (await this.subscriptions.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
        },
      }),

      this.blockedContent.open({
        type: BlockedContent,
        replicate: args?.blockedContentArgs?.replicate ?? true,
        replicas: args?.blockedContentArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
          type: IndexableBlockedContent,
          transform: async (blockedContent, ctx) => {
            return new IndexableBlockedContent(
              blockedContent,
              ctx.created,
              ctx.modified,
              (await this.blockedContent.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
        },
      }),
    ]);
    console.timeEnd('[Site] Data stores open');
    this.setupFederationBroadcasts();
    console.timeEnd('[Site] Total open time');
  }


  async authorise(
    accountType: AccountType,
    stringPublicKey: string,
  ): Promise<void> {
    const publicSignKey = publicSignKeyFromString(stringPublicKey);
    const accessCondition = new PublicKeyAccessCondition({ key: publicSignKey });
    const accessTypes: AccessType[] = [AccessType.Read, AccessType.Write];

    if (accountType === AccountType.MEMBER) {
      const access = new Access({
        accessCondition,
        accessTypes,
      });
      await this.members.access.put(access);

    } else if (accountType === AccountType.ADMIN) {
      const access = new Access({
        accessCondition,
        accessTypes,
      });
      await this.members.access.put(access);
      await this.administrators.access.put(access);

    } else {
      throw new Error('authorization for this account type is not implemented yet.');
    }
  }

  private setupFederationBroadcasts() {
    // Listen for local changes and broadcast them
    this.releases.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('releases', event.detail);
    });

    this.featuredReleases.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('featuredReleases', event.detail);
    });

    this.contentCategories.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('contentCategories', event.detail);
    });
  }

  private async broadcastFederationUpdate(storeName: 'releases' | 'featuredReleases' | 'contentCategories', change: DocumentsChange<unknown, unknown>) {
    // We need the full Entry<Operation> object to broadcast
    // This requires fetching them from the log based on the change set
    const getEntriesFromChange = async (docs: WithContext<unknown>[]) => {
      const entries: Entry<Operation>[] = [];
      for (const doc of docs) {
        const entry = await this[storeName].log.log.get(doc.__context.head);
        if (entry) entries.push(entry);
      }
      return entries;
    };

    const addedEntries = await getEntriesFromChange(change.added);
    const removedEntries = await getEntriesFromChange(change.removed);

    if (addedEntries.length === 0 && removedEntries.length === 0) {
      return;
    }

    const updateMessage = new FederationUpdate({
      store: storeName,
      added: addedEntries,
      removed: removedEntries,
    });

    // Publish to this site's unique federation topic
    await this.node.services.pubsub.publish(serialize(updateMessage), { topics: [this.federationTopic] });
  }
}
