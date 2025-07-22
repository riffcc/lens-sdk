import { variant, field, option } from '@dao-xyz/borsh';
import type { ContentCategoryData, DocumentArgs } from '../types';
import { v4 as uuid } from 'uuid';

@variant('content_category')
export class ContentCategory {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  displayName: string;

  @field({ type: 'bool' })
  featured: boolean;

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  metadataSchema?: string;

  constructor(props: DocumentArgs<ContentCategoryData>) {
    this.id = props.id ?? uuid();
    this.postedBy = (props.postedBy instanceof Uint8Array) ? props.postedBy : props.postedBy.bytes;;
    this.siteAddress = props.siteAddress;
    this.displayName = props.displayName;
    this.featured = props.featured;
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
    this.postedBy = props.doc.postedBy;
    this.siteAddress = props.doc.siteAddress;
    this.displayName = props.doc.displayName;
    this.featured = props.doc.featured;
    this.description = props.doc.description;
    this.metadataSchema = props.doc.metadataSchema;
    this.created = props.created;
    this.modified = props.modified;
  }
}