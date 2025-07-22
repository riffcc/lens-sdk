import type { PublicSignKey } from '@peerbit/crypto';
import type { ReplicationLimitsOptions, ReplicationOptions } from '@peerbit/shared-log';

export type WithId<T> = T & { id: string };
export type WithOptionalId<T> = T & { id?: string };
export type WithSiteAddress<T> = T & { siteAddress: string };
export type WithPostedBy<T> = T & { postedBy: PublicSignKey | Uint8Array };
export type WithOptionalPostedBy<T> = T & { postedBy?: PublicSignKey | Uint8Array };

export type DocumentArgs<T> = WithOptionalId<T> & WithSiteAddress<T> & WithPostedBy<T>;

export type ReleaseData<T = string> = {
  name: string;
  categoryId: string;
  contentCID: string;
  thumbnailCID?: string;
  metadata?: T;
};

export type BlockedContentData = {
  cid: string;
};

export type ContentCategoryData = {
  displayName: string;
  featured: boolean;
  description?: string;
  metadataSchema?: string;
};

export type FeaturedReleaseData = {
  releaseId: string;
  startTime: string;
  endTime: string;
  promoted: boolean;
};

export type SubscriptionData = {
  to: string;
};

// --- Unchanged Types ---
export type FederatedStoreKey = 'releases' | 'featuredReleases' | 'contentCategories' | 'blockedContent';

export enum AccountType {
  GUEST = 0,
  MEMBER = 1,
  ADMIN = 2,
}

export type StoreArgs = {
  replicate?: ReplicationOptions;
  replicas?: ReplicationLimitsOptions;
  disableCache?: boolean;
}

export interface SiteArgs {
  releasesArgs?: StoreArgs;
  featuredReleasesArgs?: StoreArgs;
  contentCategoriesArgs?: StoreArgs
  subscriptionsArgs?: StoreArgs;
  blockedContentArgs?: StoreArgs;
  syncSitesArgs?: StoreArgs;
  membersArg?: StoreArgs;
  administratorsArgs?: StoreArgs;
}