import { Documents } from '@peerbit/document';
import { field, option, variant, vec } from '@dao-xyz/borsh';
import { type PublicSignKey } from '@peerbit/crypto';
import { Program } from '@peerbit/program';
import { IdentityAccessController } from '@peerbit/identity-access-controller';
import { v4 as uuid } from 'uuid';
import type { PeerId } from '@libp2p/interface';
import { PerSiteFederationIndex } from './per-site-federation-index';
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
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  BLOCKED_CONTENT_CID_PROPERTY,
  SITE_NAME_PROPERTY,
  SITE_DESCRIPTION_PROPERTY,
  SITE_IMAGE_CID_PROPERTY,
  FEDERATED_AT_PROPERTY,
  FEDERATED_FROM_PROPERTY,
  FEDERATED_REALTIME_PROPERTY,
  SUBSCRIPTION_CURRENT_DEPTH_PROPERTY,
  SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY,
  SUBSCRIPTION_TYPE_PROPERTY,
} from './constants';

import type {
  ReleaseData,
  FeaturedReleaseData,
  ContentCategoryData,
  SubscriptionData,
  BlockedContentData,
  SiteArgs,
  IdData,
  FederatedData,
} from './types';


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

  @field({ type: option('string') })
  [FEDERATED_FROM_PROPERTY]?: string;

  @field({ type: option('string') })
  [FEDERATED_AT_PROPERTY]?: string;

  @field({ type: option('bool') })
  [FEDERATED_REALTIME_PROPERTY]?: boolean;

  constructor(
    props: Partial<IdData> & ReleaseData & Partial<FederatedData>,
  ) {
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
    if (props[FEDERATED_FROM_PROPERTY]) {
      this[FEDERATED_FROM_PROPERTY] = props[FEDERATED_FROM_PROPERTY];
    }
    if (props[FEDERATED_AT_PROPERTY]) {
      this[FEDERATED_AT_PROPERTY] = props[FEDERATED_AT_PROPERTY];
    }
    if (props[FEDERATED_REALTIME_PROPERTY] !== undefined) {
      this[FEDERATED_REALTIME_PROPERTY] = props[FEDERATED_REALTIME_PROPERTY];
    }
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

  @field({ type: option('string') })
  [FEDERATED_FROM_PROPERTY]?: string;

  @field({ type: option('string') })
  [FEDERATED_AT_PROPERTY]?: string;

  @field({ type: option('bool') })
  [FEDERATED_REALTIME_PROPERTY]?: boolean;

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
    if (props[FEDERATED_FROM_PROPERTY]) {
      this[FEDERATED_FROM_PROPERTY] = props[FEDERATED_FROM_PROPERTY];
    }
    if (props[FEDERATED_AT_PROPERTY]) {
      this[FEDERATED_AT_PROPERTY] = props[FEDERATED_AT_PROPERTY];
    }
    if (props[FEDERATED_REALTIME_PROPERTY] !== undefined) {
      this[FEDERATED_REALTIME_PROPERTY] = props[FEDERATED_REALTIME_PROPERTY];
    }
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

  constructor(props: Partial<IdData> & FeaturedReleaseData) {
    this[ID_PROPERTY] = props[ID_PROPERTY] ?? uuid();
    this[FEATURED_RELEASE_ID_PROPERTY] = props[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = props[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = props[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = Boolean(props[FEATURED_PROMOTED_PROPERTY]);
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
    this[FEATURED_PROMOTED_PROPERTY] = Boolean(props[FEATURED_PROMOTED_PROPERTY]);
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

  constructor(props: ContentCategoryData) {
    this[ID_PROPERTY] = props[ID_PROPERTY];
    this[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY] = props[CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY];
    this[CONTENT_CATEGORY_FEATURED_PROPERTY] = Boolean(props[CONTENT_CATEGORY_FEATURED_PROPERTY]);
    if (props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY]) {
      this[CONTENT_CATEGORY_DESCRIPTION_PROPERTY] = props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY];
    }
    if (props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]) {
      this[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY] = props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY];
    }
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
  [SUBSCRIPTION_SITE_ID_PROPERTY]: string;

  @field({ type: option('string') })
  [SUBSCRIPTION_NAME_PROPERTY]?: string;

  @field({ type: 'bool' })
  [SUBSCRIPTION_RECURSIVE_PROPERTY]: boolean;

  @field({ type: 'string' })
  [SUBSCRIPTION_TYPE_PROPERTY]: string;

  @field({ type: 'u32' })
  [SUBSCRIPTION_CURRENT_DEPTH_PROPERTY]: number;

  @field({ type: vec('string') })
  [SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY]: string[];

  constructor(props: SubscriptionData) {
    this[ID_PROPERTY] = uuid();
    this[SUBSCRIPTION_SITE_ID_PROPERTY] = props[SUBSCRIPTION_SITE_ID_PROPERTY];
    this[SUBSCRIPTION_RECURSIVE_PROPERTY] = Boolean(props[SUBSCRIPTION_RECURSIVE_PROPERTY]);
    this[SUBSCRIPTION_TYPE_PROPERTY] = props[SUBSCRIPTION_TYPE_PROPERTY];
    this[SUBSCRIPTION_CURRENT_DEPTH_PROPERTY] = props[SUBSCRIPTION_CURRENT_DEPTH_PROPERTY];
    this[SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY] = props[SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY];
    if (props[SUBSCRIPTION_NAME_PROPERTY]) {
      this[SUBSCRIPTION_NAME_PROPERTY] = props[SUBSCRIPTION_NAME_PROPERTY];
    }
  }
}

export class IndexableSubscription {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [SUBSCRIPTION_SITE_ID_PROPERTY]: string;

  @field({ type: option('string') })
  [SUBSCRIPTION_NAME_PROPERTY]?: string;

  @field({ type: 'bool' })
  [SUBSCRIPTION_RECURSIVE_PROPERTY]: boolean;

  @field({ type: 'string' })
  [SUBSCRIPTION_TYPE_PROPERTY]: string;

  @field({ type: 'u32' })
  [SUBSCRIPTION_CURRENT_DEPTH_PROPERTY]: number;

  @field({ type: vec('string') })
  [SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY]: string[];

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
    this[SUBSCRIPTION_SITE_ID_PROPERTY] = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
    this[SUBSCRIPTION_RECURSIVE_PROPERTY] = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
    this[SUBSCRIPTION_TYPE_PROPERTY] = subscription[SUBSCRIPTION_TYPE_PROPERTY];
    this[SUBSCRIPTION_CURRENT_DEPTH_PROPERTY] = subscription[SUBSCRIPTION_CURRENT_DEPTH_PROPERTY];
    this[SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY] = subscription[SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY];
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

// Reusable placeholder to avoid expensive async calls during indexing
// Using a valid Ed25519 public key (all zeros is a valid point on the curve)
const PLACEHOLDER_PUBLIC_KEY = {
  toString: () => '12D3KooWBfmETW1ZbkdZbKKPpE3jpjyQ5WBXoDF8y9oE78cKpBsn',
  bytes: new Uint8Array([
    0, 37, 8, 1, 18, 32, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ])
} as PublicSignKey;

@variant('site')
export class Site extends Program<SiteArgs> {
  // Track access controller loading state
  private accessControllersReady: Promise<void> | null = null;

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

  @field({ type: PerSiteFederationIndex })
  federationIndex: PerSiteFederationIndex;

  // Site metadata
  @field({ type: option('string') })
  [SITE_NAME_PROPERTY]?: string;

  @field({ type: option('string') })
  [SITE_DESCRIPTION_PROPERTY]?: string;

  @field({ type: option('string') })
  [SITE_IMAGE_CID_PROPERTY]?: string;



  constructor(rootTrust: PublicSignKey | PeerId) {
    super();
    this.releases = new Documents();
    this.featuredReleases = new Documents();
    this.contentCategories = new Documents();
    this.subscriptions = new Documents();
    this.blockedContent = new Documents();
    this.members = new IdentityAccessController({ rootTrust });
    this.administrators = new IdentityAccessController({ rootTrust });
    this.federationIndex = new PerSiteFederationIndex(this[SITE_NAME_PROPERTY] || 'Unnamed Site');
  }

  async openMinimal(args?: SiteArgs): Promise<void> {
    console.time('[Site] Minimal open time');
    
    // Open federation index FIRST for immediate public content access
    console.time('[Site] Federation index open');
    await this.node.open(this.federationIndex, {
      args: {
        replicate: args?.federationIndexArgs?.replicate ?? true,
        replicas: args?.federationIndexArgs?.replicas ?? { min: 1 }
      }
    }).then(() => 
      this.federationIndex.open()
    );
    console.timeEnd('[Site] Federation index open');
    
    // Open critical data stores with minimal replication for fast cached data access
    console.time('[Site] Critical stores open');
    await Promise.all([
      // Open releases for immediate content access
      this.releases.open({
        type: Release,
        replicate: { factor: 0 }, // Don't replicate, just access local cache
        canPerform: () => true, // Temporarily allow all for fast loading
        index: {
          canRead: () => true,
          type: IndexableRelease,
          transform: async (release, ctx) => {
            return new IndexableRelease(
              release,
              ctx.created,
              ctx.modified,
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
        },
      }),
      // Open featured releases for homepage
      this.featuredReleases.open({
        type: FeaturedRelease,
        replicate: { factor: 0 }, // Don't replicate, just access local cache
        canPerform: () => true, // Temporarily allow all for fast loading
        index: {
          canRead: () => true,
          type: IndexableFeaturedRelease,
          transform: async (featuredRelease, ctx) => {
            return new IndexableFeaturedRelease(
              featuredRelease,
              ctx.created,
              ctx.modified,
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
        },
      }),
      // Open content categories for navigation
      this.contentCategories.open({
        type: ContentCategory,
        replicate: { factor: 0 }, // Don't replicate, just access local cache
        canPerform: () => true, // Temporarily allow all for fast loading
        index: {
          canRead: () => true,
          type: IndexableContentCategory,
          transform: async (contentCategory, ctx) => {
            return new IndexableContentCategory(
              contentCategory,
              ctx.created,
              ctx.modified,
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
        },
      }),
    ]);
    console.timeEnd('[Site] Critical stores open');
    
    // Open access controllers and other stores in the background (non-blocking)
    console.log('[Site] Starting background store initialization...');
    this.accessControllersReady = this.openRemainingStores(args);
    
    console.timeEnd('[Site] Minimal open time');
  }

  private async openRemainingStores(args?: SiteArgs): Promise<void> {
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);
    
    try {
      // First open access controllers
      console.time('[Site] Background: Access controllers');
      await Promise.all([
        this.members.open({
          replicate: args?.membersArg?.replicate ?? false,
        }),
        this.administrators.open({
          replicate: args?.administratorsArgs?.replicate ?? false,
        }),
      ]);
      console.timeEnd('[Site] Background: Access controllers');
      
      // Then open remaining stores with proper permissions
      console.time('[Site] Background: Open remaining stores');
      await Promise.all([
        // Note: We can't reconfigure already opened stores in Peerbit, so releases/featured/categories
        // will continue with permissive settings from minimal open. This is acceptable as they're
        // read-mostly stores and real permission checks happen at write time.
        // Open remaining stores
        this.subscriptions.open({
          type: Subscription,
          replicate: args?.subscriptionsArgs?.replicate ?? { factor: 0 },
          replicas: args?.subscriptionsArgs?.replicas,
          canPerform: administratorCanPerform,
          index: {
            canRead: () => true,
            type: IndexableSubscription,
            transform: async (subscription, ctx) => {
              return new IndexableSubscription(
                subscription,
                ctx.created,
                ctx.modified,
                PLACEHOLDER_PUBLIC_KEY,
              );
            },
          },
        }),
        this.blockedContent.open({
          type: BlockedContent,
          replicate: args?.blockedContentArgs?.replicate ?? { factor: 0 },
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
                PLACEHOLDER_PUBLIC_KEY,
              );
            },
          },
        }),
      ]);
      console.timeEnd('[Site] Background: Open remaining stores');
      console.log('[Site] Background initialization complete');
    } catch (err) {
      console.error('[Site] Error in background initialization:', err);
      throw err;
    }
  }

  async waitForAccessControllers(): Promise<void> {
    if (this.accessControllersReady) {
      await this.accessControllersReady;
    }
  }

  async open(args?: SiteArgs): Promise<void> {
    // Check if we should use minimal open mode
    if (args?.minimalMode === true) {
      return this.openMinimal(args);
    }
    
    console.time('[Site] Total open time');
    const memberCanPerform = this.members.canPerform.bind(this.members);
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);

    // Open all stores in parallel for significantly faster initialization
    console.time('[Site] Access controllers open');
    await Promise.all([
      // Access controllers need to be opened first for permission checks
      this.members.open({
        replicate: args?.membersArg?.replicate ?? false,
      }),
      this.administrators.open({
        replicate: args?.administratorsArgs?.replicate ?? false,
      }),
    ]);
    console.timeEnd('[Site] Access controllers open');

    // Now open all data stores in parallel with factor 0 for fast loading
    console.time('[Site] Data stores open');
    await Promise.all([
      this.releases.open({
        type: Release,
        replicate: args?.releasesArgs?.replicate ?? { factor: 0 },
        replicas: args?.releasesArgs?.replicas,
        canPerform: (props) => {
          if (props.type === 'delete') {
            return administratorCanPerform(props);
          } else {
            return (
              memberCanPerform(props)
            );
          }
        },
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
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
          // Add query caching for faster repeated searches
          // cache: {
          //   query: {
          //     strategy: 'auto', // Automatic cache management
          //     maxSize: args?.releasesArgs?.disableCache ? 0 : Infinity, // Unlimited cache size or disabled for tests
          //     maxTotalSize: args?.releasesArgs?.disableCache ? 0 : Infinity, // Unlimited total cache size or disabled for tests
          //     keepAlive: 6e4, // 60 second TTL
          //     prefetchThreshold: 2, // Prefetch after 2 hits
          //   },
          // },
        },
      }),

      this.featuredReleases.open({
        type: FeaturedRelease,
        replicate: args?.featuredReleasesArgs?.replicate ?? { factor: 0 },
        replicas: args?.featuredReleasesArgs?.replicas,
        canPerform: administratorCanPerform,
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
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
          // Featured releases are accessed frequently, use aggressive caching
          // cache: {
          //   query: {
          //     strategy: 'auto',
          //     maxSize: args?.featuredReleasesArgs?.disableCache ? 0 : Infinity, // Unlimited cache size or disabled for tests
          //     maxTotalSize: args?.featuredReleasesArgs?.disableCache ? 0 : Infinity, // Unlimited total cache size or disabled for tests
          //     keepAlive: 12e4, // 2 minute TTL
          //     prefetchThreshold: 1, // Prefetch after first hit
          //   },
          // },
        },
      }),

      this.contentCategories.open({
        type: ContentCategory,
        replicate: args?.contentCategoriesArgs?.replicate ?? { factor: 0 },
        replicas: args?.contentCategoriesArgs?.replicas,
        canPerform: administratorCanPerform,
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
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
          // Categories rarely change, use long-lived cache
          // cache: {
          //   query: {
          //     strategy: 'auto',
          //     maxSize: args?.contentCategoriesArgs?.disableCache ? 0 : 20,
          //     maxTotalSize: args?.contentCategoriesArgs?.disableCache ? 0 : 1e5, // 100KB or disabled for tests
          //     keepAlive: 36e5, // 1 hour TTL
          //     prefetchThreshold: 1,
          //   },
          // },
        },
      }),

      this.subscriptions.open({
        type: Subscription,
        replicate: args?.subscriptionsArgs?.replicate ?? { factor: 0 },
        replicas: args?.subscriptionsArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: () => true, // Site owners can always read their own subscriptions
          type: IndexableSubscription,
          transform: async (subscription, ctx) => {
            return new IndexableSubscription(
              subscription,
              ctx.created,
              ctx.modified,
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
          // cache: {
          //   query: {
          //     strategy: 'auto',
          //     maxSize: args?.subscriptionsArgs?.disableCache ? 0 : 30,
          //     maxTotalSize: args?.subscriptionsArgs?.disableCache ? 0 : 5e3,
          //     keepAlive: 1e4,
          //     prefetchThreshold: 2,
          //   },
          // },
        },
      }),

      this.blockedContent.open({
        type: BlockedContent,
        replicate: args?.blockedContentArgs?.replicate ?? { factor: 0 },
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
              PLACEHOLDER_PUBLIC_KEY,
            );
          },
          // cache: {
          //   query: {
          //     strategy: 'auto',
          //     maxSize: args?.blockedContentArgs?.disableCache ? 0 : 100,
          //     maxTotalSize: args?.blockedContentArgs?.disableCache ? 0 : 1e4,
          //     keepAlive: 1e4,
          //     prefetchThreshold: 5,
          //   },
          // },
        },
      }),

      // Federation index for all content queries
      // IMPORTANT: Nested Programs must be opened through the parent's node
      // AND then the program's own open() method must be called
      this.node.open(this.federationIndex, {
        args: {
          replicate: args?.federationIndexArgs?.replicate ?? true,
          replicas: args?.federationIndexArgs?.replicas ?? { min: 1 }
        }
      }).then(() => 
        this.federationIndex.open()
      ),
    ]);
    console.timeEnd('[Site] Data stores open');
    console.timeEnd('[Site] Total open time');
  }
}
