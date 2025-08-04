import { variant, field, option, vec } from '@dao-xyz/borsh';
import { v4 as uuid } from 'uuid';
import type { DocumentArgs } from '../types';
import { PublicSignKey } from '@peerbit/crypto';

// Types of structures/groups
export type StructureType = 'artist' | 'series' | 'season' | 'album' | 'playlist' | 'collection' | 'custom';

// A unified structure that can represent any grouping or entity
@variant('structure')
export class Structure {
  @field({ type: 'string' })
  id: string;

  @field({ type: PublicSignKey })
  postedBy: PublicSignKey;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  name: string;

  @field({ type: 'string' })
  type: string; // 'artist', 'series', 'season', 'album', 'playlist', 'collection', etc.

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  thumbnailCID?: string;

  @field({ type: option('string') })
  bannerCID?: string;

  @field({ type: option('string') })
  parentId?: string; // Parent structure ID for hierarchical relationships

  @field({ type: vec('string') })
  itemIds: string[]; // IDs of releases/other structures contained in this structure

  @field({ type: option('string') })
  metadata?: string; // JSON string for type-specific data (theme, links, order, etc.)

  @field({ type: option('u32') })
  order?: number; // For ordering within parent structures

  constructor(props: DocumentArgs<{
    name: string;
    type: string;
    description?: string;
    thumbnailCID?: string;
    bannerCID?: string;
    parentId?: string;
    itemIds?: string[];
    metadata?: string;
    order?: number;
  }>) {
    this.id = props.id ?? uuid();
    this.postedBy = props.postedBy;
    this.siteAddress = props.siteAddress;
    this.name = props.name;
    this.type = props.type;
    this.description = props.description;
    this.thumbnailCID = props.thumbnailCID;
    this.bannerCID = props.bannerCID;
    this.parentId = props.parentId;
    this.itemIds = props.itemIds ?? [];
    this.metadata = props.metadata;
    this.order = props.order;
  }
}

// Indexed version for database storage
export class IndexedStructure {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  name: string;

  @field({ type: 'string' })
  type: string;

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  thumbnailCID?: string;

  @field({ type: option('string') })
  bannerCID?: string;

  @field({ type: option('string') })
  parentId?: string;

  @field({ type: vec('string') })
  itemIds: string[];

  @field({ type: option('string') })
  metadata?: string;

  @field({ type: option('u32') })
  order?: number;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: Structure;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy.bytes;
    this.siteAddress = props.doc.siteAddress;
    this.name = props.doc.name;
    this.type = props.doc.type;
    this.description = props.doc.description;
    this.thumbnailCID = props.doc.thumbnailCID;
    this.bannerCID = props.doc.bannerCID;
    this.parentId = props.doc.parentId;
    this.itemIds = props.doc.itemIds;
    this.metadata = props.doc.metadata;
    this.order = props.doc.order;
    this.created = props.created;
    this.modified = props.modified;
  }
}