import { Documents } from '@peerbit/document';
import { field, option, variant } from '@dao-xyz/borsh';
import { type PublicSignKey } from '@peerbit/crypto';
import { Program } from '@peerbit/program';
import { IdentityAccessController } from '@peerbit/identity-access-controller';
import { v4 as uuid } from 'uuid';
import type { PeerId } from '@libp2p/interface';
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
  BLOCKED_CONTENT_CID_PROPERTY,
} from './constants';

import type {
  ReleaseData,
  FeaturedReleaseData,
  ContentCategoryData,
  SubcriptionData,
  BlockedContentData,
  SiteArgs,
} from './types';


@variant(0)
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

  constructor(props: ReleaseData) {
    this[ID_PROPERTY] = uuid();
    this[RELEASE_NAME_PROPERTY] = props[RELEASE_NAME_PROPERTY];
    this[RELEASE_CATEGORY_ID_PROPERTY] = props[RELEASE_CATEGORY_ID_PROPERTY];
    this[RELEASE_CONTENT_CID_PROPERTY] = props[RELEASE_CONTENT_CID_PROPERTY];
    if (props[RELEASE_THUMBNAIL_CID_PROPERTY]) {
      this[RELEASE_THUMBNAIL_CID_PROPERTY] = props[RELEASE_THUMBNAIL_CID_PROPERTY];
    }
    if (props[RELEASE_METADATA_PROPERTY]) {
      this[RELEASE_METADATA_PROPERTY] = props[RELEASE_METADATA_PROPERTY];
    }
  }
}

@variant(0)
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

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: 'string' })
  author: string;

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
    this[RELEASE_THUMBNAIL_CID_PROPERTY] = props[RELEASE_THUMBNAIL_CID_PROPERTY];
    this[RELEASE_METADATA_PROPERTY] = props[RELEASE_METADATA_PROPERTY];
    this.created = created;
    this.modified = modified;
    this.author = author.toString();
  }
}

@variant(0)
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

  constructor(props: FeaturedReleaseData) {
    this[ID_PROPERTY] = uuid();
    this[FEATURED_RELEASE_ID_PROPERTY] = props[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = props[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = props[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = props[FEATURED_PROMOTED_PROPERTY];
  }
}

@variant(0)
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

  @field({ type: 'string' })
  author: string;

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
    this.created = created;
    this.modified = modified;
    this.author = author.toString();
  }
}

@variant(0)
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
    this[CONTENT_CATEGORY_FEATURED_PROPERTY] = props[CONTENT_CATEGORY_FEATURED_PROPERTY];
    if (props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY]) {
      this[CONTENT_CATEGORY_DESCRIPTION_PROPERTY] = props[CONTENT_CATEGORY_DESCRIPTION_PROPERTY];
    }
    if (props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]) {
      this[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY] = props[CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY];
    }
  }
}

@variant(0)
export class Subscription {
  @field({ type: 'string' })
  [ID_PROPERTY]: string;

  @field({ type: 'string' })
  [SUBSCRIPTION_SITE_ID_PROPERTY]: string;

  @field({ type: option('string') })
  [SUBSCRIPTION_NAME_PROPERTY]?: string;

  constructor(props: SubcriptionData) {
    this[ID_PROPERTY] = uuid();
    this[SUBSCRIPTION_SITE_ID_PROPERTY] = props[SUBSCRIPTION_SITE_ID_PROPERTY];
    if (props[SUBSCRIPTION_NAME_PROPERTY]) {
      this[SUBSCRIPTION_NAME_PROPERTY] = props[SUBSCRIPTION_NAME_PROPERTY];
    }
  }
}

@variant(0)
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

@variant('site')
export class Site extends Program<SiteArgs> {

  @field({ type: Documents })
  releases: Documents<Release, IndexableRelease>;

  @field({ type: Documents })
  featuredReleases: Documents<FeaturedRelease, IndexableFeaturedRelease>;

  @field({ type: Documents })
  contentCategories: Documents<ContentCategory>;

  @field({ type: Documents })
  subscriptions: Documents<Subscription>;

  @field({ type: Documents })
  blockedContent: Documents<BlockedContent>;

  @field({ type: IdentityAccessController })
  members: IdentityAccessController;

  @field({ type: IdentityAccessController })
  administrators: IdentityAccessController;

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

    // Pre-bind performance functions to avoid repeated lookups
    const memberCanPerform = this.members.canPerform.bind(this.members);
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);

    // Open all stores in parallel for significantly faster initialization
    await Promise.all([
      // Access controllers need to be opened first for permission checks
      this.members.open({
        replicate: args?.membersArg?.replicate ?? false,
      }),
      this.administrators.open({
        replicate: args?.administratorsArgs?.replicate ?? false,
      }),
    ]);

    // Now open all data stores in parallel with factor 0 for fast loading
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
              (await this.releases.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
          // Add query caching for faster repeated searches
          cache: {
            query: {
              strategy: 'auto', // Automatic cache management
              maxSize: 100, // Cache up to 100 queries
              maxTotalSize: 1e6, // 1MB total cache size
              keepAlive: 6e4, // 60 second TTL
              prefetchThreshold: 2, // Prefetch after 2 hits
            },
          },
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
              (await this.featuredReleases.log.log.get(
                ctx.head,
              ))!.signatures[0].publicKey,
            );
          },
          // Featured releases are accessed frequently, use aggressive caching
          cache: {
            query: {
              strategy: 'auto',
              maxSize: 50,
              maxTotalSize: 5e5, // 500KB
              keepAlive: 12e4, // 2 minute TTL
              prefetchThreshold: 1, // Prefetch after first hit
            },
          },
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
          // Categories rarely change, use long-lived cache
          cache: {
            query: {
              strategy: 'auto',
              maxSize: 20,
              maxTotalSize: 1e5, // 100KB
              keepAlive: 36e5, // 1 hour TTL
              prefetchThreshold: 1,
            },
          },
        },
      }),

      this.subscriptions.open({
        type: Subscription,
        replicate: args?.subscriptionsArgs?.replicate ?? { factor: 0 },
        replicas: args?.subscriptionsArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
        },
      }),

      this.blockedContent.open({
        type: BlockedContent,
        replicate: args?.blockedContentArgs?.replicate ?? { factor: 0 },
        replicas: args?.blockedContentArgs?.replicas,
        canPerform: administratorCanPerform,
        index: {
          canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
        },
      }),
    ]);
  }

}