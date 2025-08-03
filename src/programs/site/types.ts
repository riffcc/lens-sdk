import type { PublicSignKey } from '@peerbit/crypto';
import type { ReplicationLimitsOptions, ReplicationOptions } from '@peerbit/shared-log';
import type { JSONSchemaType } from 'ajv';

export type ImmutableProps = {
  id: string;
  postedBy: PublicSignKey;
  siteAddress: string;
}

export type DocumentArgs<T> = T & Omit<ImmutableProps, 'id'> & { id?: string };

export type ReleaseData<T = string> = {
  name: string;
  categoryId: string;
  contentCID: string;
  thumbnailCID?: string;
  artistIds?: string[];
  metadata?: T;
};

export type BlockedContentData = {
  cid: string;
};

export type ContentCategoryData<T = string> = {
  categoryId: string;
  displayName: string;
  featured?: boolean;
  description?: string;
  metadataSchema?: T;
};

export type FeaturedReleaseData = {
  releaseId: string;
  startTime: string;
  endTime: string;
  promoted: boolean;
  order?: number;
};

export type SubscriptionData = {
  to: string;
};

export type ArtistData<T = string> = {
  name: string;
  bio?: string;
  avatarCID?: string;
  bannerCID?: string;
  links?: string[];
  metadata?: T;
};

export type FederatedStoreKey = 'releases' | 'featuredReleases' | 'contentCategories' | 'blockedContent' | 'artists';

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
  artistsArgs?: StoreArgs;
}


// Defines the structure for a field within a category's metadata schema.
export type ContentCategoryMetadataField = Record<string, {
  type: 'string' | 'number' | 'array';
  description: string;
  options?: string[];
}>;

// JSON Schema for validating an array of content categories, using simple string keys.
export const categoriesFileSchema: JSONSchemaType<ContentCategoryData<ContentCategoryMetadataField>[]> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      categoryId: { type: 'string' },
      displayName: { type: 'string' },
      featured: { type: 'boolean', nullable: true },
      description: { type: 'string', nullable: true },
      metadataSchema: {
        type: 'object',
        nullable: true,
        additionalProperties: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['string', 'number', 'array'],
            },
            description: { type: 'string' },
            options: { 
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
          },
          required: ['type', 'description'],
        },
        required: [],
      },
    },
    required: ['categoryId', 'displayName'],
  },
};