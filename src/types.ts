import type { Release, Site } from './schema';
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
import type { ReplicationOptions } from '@peerbit/shared-log';
import type { WithContext } from '@peerbit/document';

export type AnyObject = Record<string, unknown>;

export enum AccountType {
  GUEST = 0,
  MEMBER = 1,
  ADMIN = 2,
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

export interface AddReleaseResponse {
  id: string;
  hash: string;
}

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, openOptions?: SiteArgs) => Promise<void>;
  getPublicKey: () => Promise<string>;
  getPeerId: () => Promise<string>;
  getAccountStatus: () => Promise<AccountType>;
  dial: (address: string) => Promise<boolean>;
  getRelease: (id: string) => Promise<WithContext<Release> | undefined>;
  getLatestReleases: (size?: number) => Promise<WithContext<Release>[]>;
  addRelease: (releaseData: ReleaseData) => Promise<AddReleaseResponse>;
}

export type SiteArgs = {
  replicate?: ReplicationOptions
};

