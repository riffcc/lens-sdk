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

export const SUBSCRIPTION_NAME_PROPERTY = 'name';
export const SUBSCRIPTION_RECURSIVE_PROPERTY = 'recursive';

export const BLOCKED_CONTENT_CID_PROPERTY = 'cid';

// Site metadata properties
export const SITE_NAME_PROPERTY = 'siteName';
export const SITE_DESCRIPTION_PROPERTY = 'siteDescription';
export const SITE_IMAGE_CID_PROPERTY = 'siteImageCid';

export const SITE_ADDRESS_PROPERTY = 'siteAddress';


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
  membersArg: {
    replicate: true, // Full replication for access control
  },
  administratorsArgs: {
    replicate: true, // Full replication for access control
  },
};


