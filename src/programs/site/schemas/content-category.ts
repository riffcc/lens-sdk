import { variant, field, option } from '@dao-xyz/borsh';
import type { ContentCategoryData, DocumentArgs } from '../types';
import { PublicSignKey, sha256Base64Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';

@variant('content_category')
export class ContentCategory {
  @field({ type: 'string' })
  id: string;

  @field({ type: PublicSignKey })
  postedBy: PublicSignKey;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  categoryId: string;

  @field({ type: 'string' })
  displayName: string;

  @field({ type: 'bool' })
  featured: boolean;

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  metadataSchema?: string;

  constructor(props: DocumentArgs<ContentCategoryData>) {
    this.id = props.id ?? sha256Base64Sync(concat([
      new TextEncoder().encode(props.siteAddress),
      new TextEncoder().encode(props.categoryId),
    ]));
    this.postedBy = props.postedBy;
    this.siteAddress = props.siteAddress;
    this.categoryId = props.categoryId;
    this.displayName = props.displayName;
    this.featured = props.featured ?? false;
    if (props.description) {
      this.description = props.description;
    }
    if (props.metadataSchema) {
      this.metadataSchema = props.metadataSchema;
    }
  }
}

export class IndexedContentCategory {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  categoryId: string;

  @field({ type: 'string' })
  displayName: string;

  @field({ type: 'bool' })
  featured: boolean;

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  metadataSchema?: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: ContentCategory;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy.bytes;
    this.siteAddress = props.doc.siteAddress;
    this.categoryId = props.doc.categoryId;
    this.displayName = props.doc.displayName;
    this.featured = props.doc.featured;
    this.description = props.doc.description;
    this.metadataSchema = props.doc.metadataSchema;
    this.created = props.created;
    this.modified = props.modified;
  }
}