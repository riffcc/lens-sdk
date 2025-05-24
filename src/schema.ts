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
  IdData,
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

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  @field({ type: Uint8Array })
  author: Uint8Array;

  constructor(
    release: IdData & ReleaseData,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = release[ID_PROPERTY];
    this[RELEASE_NAME_PROPERTY] = release[RELEASE_NAME_PROPERTY];
    this[RELEASE_CATEGORY_ID_PROPERTY] = release[RELEASE_CATEGORY_ID_PROPERTY];
    this[RELEASE_CONTENT_CID_PROPERTY] = release[RELEASE_CONTENT_CID_PROPERTY];
    if (release[RELEASE_THUMBNAIL_CID_PROPERTY]) {
      this[RELEASE_THUMBNAIL_CID_PROPERTY] = release[RELEASE_THUMBNAIL_CID_PROPERTY];
    }
    if (release[RELEASE_METADATA_PROPERTY]) {
      this[RELEASE_METADATA_PROPERTY] = release[RELEASE_METADATA_PROPERTY];
    }
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
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

  constructor(props: Partial<IdData> & FeaturedReleaseData) {
    this[ID_PROPERTY] = props[ID_PROPERTY] ?? uuid();
    this[FEATURED_RELEASE_ID_PROPERTY] = props[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = props[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = props[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = props[FEATURED_PROMOTED_PROPERTY];
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
    featuredRelease: IdData & FeaturedReleaseData,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this[ID_PROPERTY] = featuredRelease[ID_PROPERTY];
    this[FEATURED_RELEASE_ID_PROPERTY] = featuredRelease[FEATURED_RELEASE_ID_PROPERTY];
    this[FEATURED_START_TIME_PROPERTY] = featuredRelease[FEATURED_START_TIME_PROPERTY];
    this[FEATURED_END_TIME_PROPERTY] = featuredRelease[FEATURED_END_TIME_PROPERTY];
    this[FEATURED_PROMOTED_PROPERTY] = featuredRelease[FEATURED_PROMOTED_PROPERTY];

    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
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

    const defaultReplicateOption = false;

    await this.members.open({
      replicate: args?.membersArg?.replicate ?? defaultReplicateOption,
    });
    await this.administrators.open({
      replicate: args?.administratorsArgs?.replicate ?? defaultReplicateOption,
    });

    const memberCanPerform = this.members.canPerform.bind(this.members);
    const administratorCanPerform = this.administrators.canPerform.bind(this.administrators);

    await this.releases.open({
      type: Release,
      replicate: args?.releasesArgs?.replicate ?? defaultReplicateOption,
      replicas: args?.releasesArgs?.replicas,
      timeUntilRoleMaturity: 6e4, // 60 seconds role maturity
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
        prefetch: { strict: false }, // More flexible prefetching
        cache: {
          query: {
            strategy: "auto",
            maxSize: 50,
            maxTotalSize: 1e4,
            keepAlive: 1e4,
            prefetchThreshold: 3,
          }
        },
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
    });

    await this.featuredReleases.open({
      type: FeaturedRelease,
      replicate: args?.featuredReleasesArgs?.replicate ?? defaultReplicateOption,
      replicas: args?.featuredReleasesArgs?.replicas,
      timeUntilRoleMaturity: 6e4, // 60 seconds role maturity
      canPerform: administratorCanPerform,
      index: {
        canRead: () => {
          return true;
        },
        type: IndexableFeaturedRelease,
        prefetch: { strict: false }, // More flexible prefetching
        cache: {
          query: {
            strategy: "auto",
            maxSize: 50,
            maxTotalSize: 1e4,
            keepAlive: 1e4,
            prefetchThreshold: 3,
          }
        },
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
    });

    await this.contentCategories.open({
      type: ContentCategory,
      replicate: args?.contentCategoriesArgs?.replicate ?? defaultReplicateOption,
      replicas: args?.contentCategoriesArgs?.replicas,
      timeUntilRoleMaturity: 6e4, // 60 seconds role maturity
      canPerform: administratorCanPerform,
      index: {
        canRead: () => {
          return true;
        },
        prefetch: { strict: false }, // More flexible prefetching
        cache: {
          query: {
            strategy: "auto",
            maxSize: 20,
            maxTotalSize: 5e3,
            keepAlive: 1e4,
            prefetchThreshold: 2,
          }
        },
      },
    });

    await this.subscriptions.open({
      type: Subscription,
      replicate: args?.subscriptionsArgs?.replicate ?? defaultReplicateOption,
      replicas: args?.subscriptionsArgs?.replicas,
      canPerform: administratorCanPerform,
      index: {
        canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
      },
    });

    await this.blockedContent.open({
      type: BlockedContent,
      replicate: args?.blockedContentArgs?.replicate ?? defaultReplicateOption,
      replicas: args?.blockedContentArgs?.replicas,
      canPerform: administratorCanPerform,
      index: {
        canRead: (props) => this.administrators.canRead(props, this.node.identity.publicKey),
      },
    });
  }

}
