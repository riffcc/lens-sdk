import type { SiteArgs } from './types';

export const ID_PROPERTY = 'id';

export const FEDERATED_FROM_PROPERTY = 'federatedFrom';
export const FEDERATED_AT_PROPERTY = 'federatedAt';
export const FEDERATED_REALTIME_PROPERTY = 'federatedRealtime';

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
export const SUBSCRIPTION_RECURSIVE_PROPERTY = 'recursive';
export const SUBSCRIPTION_TYPE_PROPERTY = 'type';
export const SUBSCRIPTION_CURRENT_DEPTH_PROPERTY = 'currentDepth';
export const SUBSCRIPTION_FOLLOW_CHAIN_PROPERTY = 'followChain';

export const BLOCKED_CONTENT_CID_PROPERTY = 'cid';

// Site metadata properties
export const SITE_NAME_PROPERTY = 'siteName';
export const SITE_DESCRIPTION_PROPERTY = 'siteDescription';
export const SITE_IMAGE_CID_PROPERTY = 'siteImageCid';

export const SYNC_SITE_TARGET_ID_PROPERTY = 'targetSiteId';
export const SYNC_SITE_STATUS_PROPERTY = 'status';
export const SYNC_SITE_LAST_SYNC_PROPERTY = 'lastSync';
export const SYNC_SITE_RECURSIVE_PROPERTY = 'recursive';
export const SYNC_SITE_FOLLOW_CHAIN_PROPERTY = 'followChain';

export const RELEASE_SOURCE_SITE_ID_PROPERTY = 'sourceSiteId';


export const MEMBER_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: true, // Full replication for maximum availability
  },
};
export const ADMIN_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: true, // Full replication for metadata
  },
  featuredReleasesArgs: {
    replicate: true, // Full replication for metadata
  },
  contentCategoriesArgs: {
    replicate: true, // Full replication for metadata
  },
  subscriptionsArgs: {
    replicate: true,
  },
  blockedContentArgs: {
    replicate: true,
  },
  syncSitesArgs: {
    replicate: true, // Lens nodes participate in sync coordination
  },
  federationIndexArgs: {
    replicate: true, // Full replication for federation index
  },
  membersArg: {
    replicate: true, // Full replication for access control
  },
  administratorsArgs: {
    replicate: true, // Full replication for access control
  },
};
export const DEDICATED_SITE_ARGS: SiteArgs = {
  releasesArgs: {
    replicate: true, // Full replication - dedicated nodes store everything
  },
  featuredReleasesArgs: {
    replicate: true, // Full replication - dedicated nodes store everything
  },
  contentCategoriesArgs: {
    replicate: true, // Full replication - dedicated nodes store everything
  },
  subscriptionsArgs: {
    replicate: true,
  },
  blockedContentArgs: {
    replicate: true,
  },
  syncSitesArgs: {
    replicate: true, // Replicators manage sync coordination
  },
  federationIndexArgs: {
    replicate: true, // Full replication - dedicated nodes store everything
  },
  membersArg: {
    replicate: true, // Full replication for access control
  },
  administratorsArgs: {
    replicate: true, // Full replication for access control
  },
};


