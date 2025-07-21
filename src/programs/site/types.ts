import type { PublicSignKey } from '@peerbit/crypto';
import type { ReplicationLimitsOptions, ReplicationOptions } from '@peerbit/shared-log';

export type FederatedStoreKey = 'releases' | 'featuredReleases' | 'contentCategories' | 'blockedContent';

export enum AccountType {
  GUEST = 0,
  MEMBER = 1,
  ADMIN = 2,
}

export interface BaseData {
  id?: string;
  postedBy: PublicSignKey;
  siteAddress: string;
}

export type ReleaseData<T = string> = BaseData & {
  name: string;
  categoryId: string;
  contentCID: string;
  thumbnailCID?: string;
  metadata?: T;
};

export type BlockedContentData = BaseData & {
  cid: string;
};

export type ContentCategoryData = BaseData & {
  displayName: string;
  featured: boolean;
  description?: string;
  metadataSchema?: string;
};

export type FeaturedReleaseData = BaseData & {
  releaseId: string;
  startTime: string;
  endTime: string;
  promoted: boolean;
};

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