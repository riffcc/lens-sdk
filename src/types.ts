import type { FeaturedRelease, Release, Site } from './schema';
import type {
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
import type { ReplicationLimitsOptions, ReplicationOptions } from '@peerbit/shared-log';
import type { Query, SearchRequest, Sort, WithContext } from '@peerbit/document';

export type AnyObject = Record<string, unknown>;

export enum AccountType {
  GUEST = 0,
  MEMBER = 1,
  ADMIN = 2,
}

export type SearchOptions = {
  request?: SearchRequest;
  query?:
    | Query[]
    | Query
    | Record<
        string,
        string | number | bigint | Uint8Array | boolean | null | undefined
      >;
  sort?: Sort[] | Sort;
  fetch?: number;
}
export type IdData = {
  [ID_PROPERTY]: string
};

export type ReleaseData<T = string> = {
  [RELEASE_NAME_PROPERTY]: string;
  [RELEASE_CATEGORY_ID_PROPERTY]: string;
  [RELEASE_CONTENT_CID_PROPERTY]: string;
  [RELEASE_THUMBNAIL_CID_PROPERTY]?: string;
  [RELEASE_METADATA_PROPERTY]?: T;
}

export type FeaturedReleaseData = {
  [FEATURED_RELEASE_ID_PROPERTY]: string;
  [FEATURED_START_TIME_PROPERTY]: string;
  [FEATURED_END_TIME_PROPERTY]: string;
  [FEATURED_PROMOTED_PROPERTY]: boolean;
}

export type ContentCategoryData<T = string> = IdData & {
  [CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY]: string;
  [CONTENT_CATEGORY_FEATURED_PROPERTY]: boolean;
  [CONTENT_CATEGORY_DESCRIPTION_PROPERTY]?: string;
  [CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY]?: T;
}

export type ContentCategoryMetadata = Record<string, {
  type: 'string' | 'number' | 'array';
  description: string;
  options?: string[];
}>;

export type SubcriptionData = {
  [SUBSCRIPTION_SITE_ID_PROPERTY]: string;
  [SUBSCRIPTION_NAME_PROPERTY]?: string;
}

export type BlockedContentData = {
  [BLOCKED_CONTENT_CID_PROPERTY]: string;
}

export interface BaseResponse {
  success: boolean;
  error?: string;
}

export interface IdResponse extends BaseResponse {
  id?: string;
}

export interface HashResponse extends IdResponse {
  hash?: string;
}

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, openOptions?: SiteArgs) => Promise<void>;
  getPublicKey: () => Promise<string>;
  getPeerId: () => Promise<string>;
  getAccountStatus: () => Promise<AccountType>;
  dial: (address: string) => Promise<boolean>;
  getRelease: (data: IdData) => Promise<WithContext<Release> | undefined>;
  getReleases: (options?: SearchOptions) => Promise<WithContext<Release>[]>;
  getFeaturedRelease: (data: IdData) => Promise<WithContext<FeaturedRelease> | undefined>;
  getFeaturedReleases: (options?: SearchOptions) => Promise<WithContext<FeaturedRelease>[]>;
  addRelease: (data: ReleaseData) => Promise<HashResponse>;
  // Admin methods
  editRelease: (data: IdData & ReleaseData) => Promise<HashResponse>;
  deleteRelease: (data: IdData) => Promise<IdResponse>;
  addFeaturedRelease: (data: FeaturedReleaseData) => Promise<HashResponse>;
  editFeaturedRelease: (data: IdData & FeaturedReleaseData) => Promise<HashResponse>;
  deleteFeaturedRelease: (data: IdData) => Promise<IdResponse>;

}

export interface SiteArgs {
  replicate?: ReplicationOptions;
  replicas?: ReplicationLimitsOptions;

  releasesReplicate?: ReplicationOptions;
  releasesReplicas?: ReplicationLimitsOptions;

  featuredReleasesReplicate?: ReplicationOptions;
  featuredReleasesReplicas?: ReplicationLimitsOptions;

  contentCategoriesReplicate?: ReplicationOptions;
  contentCategoriesReplicas?: ReplicationLimitsOptions;

  subscriptionsReplicate?: ReplicationOptions;
  subscriptionsReplicas?: ReplicationLimitsOptions;

  blockedContentReplicate?: ReplicationOptions;
  blockedContentReplicas?: ReplicationLimitsOptions;

  membersReplicate?: ReplicationOptions;
  administratorsReplicate?: ReplicationOptions;
}

