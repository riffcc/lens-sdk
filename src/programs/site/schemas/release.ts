import { variant, field, option } from '@dao-xyz/borsh';
import { v4 as uuid } from 'uuid';
import type { ReleaseData, DocumentArgs } from '../types';

@variant('release')
export class Release {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;
  
  @field({ type: 'string' })
  name: string;

  @field({ type: 'string' })
  categoryId: string;

  @field({ type: 'string' })
  contentCID: string;

  @field({ type: option('string') })
  thumbnailCID?: string;

  @field({ type: option('string') })
  metadata?: string;

  constructor(props: DocumentArgs<ReleaseData>) {
    this.id = props.id ?? uuid();
    this.postedBy = (props.postedBy instanceof Uint8Array) ? props.postedBy : props.postedBy.bytes;;
    this.siteAddress = props.siteAddress;
    this.name = props.name;
    this.categoryId = props.categoryId;
    this.contentCID = props.contentCID;
    if (props.thumbnailCID) {
      this.thumbnailCID = props.thumbnailCID;
    }
    if (props.metadata) {
      this.metadata = props.metadata;
    }
  }
}

export class IndexedRelease {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;
  
  @field({ type: 'string' })
  name: string;

  @field({ type: 'string' })
  categoryId: string;

  @field({ type: 'string' })
  contentCID: string;

  @field({ type: option('string') })
  thumbnailCID?: string;

  @field({ type: option('string') })
  metadata?: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: Release;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy;
    this.siteAddress = props.doc.siteAddress;
    this.name = props.doc.name;
    this.categoryId = props.doc.categoryId;
    this.contentCID = props.doc.contentCID;
    this.thumbnailCID = props.doc.thumbnailCID;
    this.metadata = props.doc.metadata;
    this.created = props.created;
    this.modified = props.modified;
  }
}