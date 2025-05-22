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


export const GUEST_REPLICATION_ARGS: SiteArgs = {
  replicate: false,
};

export const MEMBER_REPLICATION_ARGS: SiteArgs = {
  releasesReplicate: { factor: 0.2, limits: { storage: 500 * 1024 * 1024 } }, 
  releasesReplicas: { min: 2, max: 5 },

  featuredReleasesReplicate: false,
  contentCategoriesReplicate: false,

  subscriptionsReplicate: false,
  blockedContentReplicate: false,

  membersReplicate: false,
  administratorsReplicate: false,
};


export const ADMIN_REPLICATION_ARGS: SiteArgs = {
  releasesReplicate: { factor: 0.5, limits: { storage: 2 * 1024 * 1024 * 1024 } },
  releasesReplicas: { min: 2, max: 5 },

  contentCategoriesReplicate: { factor: 1 },
  contentCategoriesReplicas: { min: 2, max: 3 },

  featuredReleasesReplicate: { factor: 1 },
  featuredReleasesReplicas: { min: 2, max: 3 },

  blockedContentReplicate: { factor: 1 },
  blockedContentReplicas: { min: 2, max: 3 },

  subscriptionsReplicate: { factor: 1 },
  subscriptionsReplicas: { min: 2, max: 3 },

  membersReplicate: { factor: 1 },
  administratorsReplicate: { factor: 1 },
};

export const DEDICATED_REPLICATOR_ARGS: SiteArgs = {
  replicate: { factor: 1 },
  replicas: { min: 2 },
};


