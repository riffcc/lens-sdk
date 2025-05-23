import type { SiteArgs } from './types';

export const ID_PROPERTY = 'id';

export const RELEASE_NAME_PROPERTY = 'name';
export const RELEASE_CATEGORY_ID_PROPERTY = 'categoryId';
export const RELEASE_CONTENT_CID_PROPERTY = 'contentCID';
export const RELEASE_THUMBNAIL_CID_PROPERTY = 'thumbnailCID';
export const RELEASE_METADATA_PROPERTY = 'metadata';

export const FEATURED_RELEASE_ID_PROPERTY = 'releaseId';
export const FEATURED_START_TIME_PROPERTY = 'startTime';
export const FEATURED_END_TIME_PROPERTY = 'endTime';
export const FEATURED_PROMOTED_PROPERTY = 'promoted';

export const CONTENT_CATEGORY_DISPLAY_NAME_PROPERTY = 'displayName';
export const CONTENT_CATEGORY_DESCRIPTION_PROPERTY = 'description';
export const CONTENT_CATEGORY_FEATURED_PROPERTY = 'featured';
export const CONTENT_CATEGORY_METADATA_SCHEMA_PROPERTY = 'metadataSchema';

export const SUBSCRIPTION_SITE_ID_PROPERTY = 'siteId';
export const SUBSCRIPTION_NAME_PROPERTY = 'name';

export const BLOCKED_CONTENT_CID_PROPERTY = 'cid';


export const MEMBER_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: { factor: 1, limits: { storage: 500 * 1024 * 1024 } }, 
  },
};
export const ADMIN_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: { factor: 1, limits: { storage: 5 * 1024 * 1024 * 1024 } }, 
  },
  featuredReleasesArgs: {
    replicate: { factor: 1, limits: { storage: 2 * 1024 * 1024 * 1024 } },
  },
  contentCategoriesArgs: {
    replicate: true,
  },
  subscriptionsArgs: {
    replicate: true,
  },
  blockedContentArgs: {
    replicate: true,
  },
  membersArg: {
    replicate: { factor: 1 },
  },
  administratorsArgs: {
    replicate: { factor: 1 },
  },
};
export const DEDICATED_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: { factor: 1, limits: { storage: 10 * 1024 * 1024 * 1024 } },
  },
  featuredReleasesArgs: {
    replicate: { factor: 1, limits: { storage: 5 * 1024* 1024 * 1024 } },
  },
  contentCategoriesArgs: {
    replicate: true,
  },
  subscriptionsArgs: {
    replicate: true,
  },
  blockedContentArgs: {
    replicate: true,
  },
};


