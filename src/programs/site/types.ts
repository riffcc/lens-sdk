import type { PublicSignKey } from '@peerbit/crypto';
import type { ReplicationLimitsOptions, ReplicationOptions } from '@peerbit/shared-log';

export type ImmutableProps = {
  id: string;
  postedBy: PublicSignKey;
  siteAddress: string;
}

export type WithOptionalId<T> = T & { id?: string };
export type WithOptionalPostedBy<T> = T & { postedBy?: PublicSignKey };

export type DocumentArgs<T> = T & Omit<ImmutableProps, 'id'> & { id?: string };

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
}