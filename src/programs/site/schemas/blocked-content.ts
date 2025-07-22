import { variant, field } from '@dao-xyz/borsh';
import type { BlockedContentData, DocumentArgs } from '../types';
import { v4 as uuid } from 'uuid';

@variant('blocked_content')
export class BlockedContent {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  cid: string;

  constructor(props: DocumentArgs<BlockedContentData>) {
    this.id = props.id ?? uuid();
    this.postedBy = (props.postedBy instanceof Uint8Array) ? props.postedBy : props.postedBy.bytes;;
    this.siteAddress = props.siteAddress;
    this.cid = props.cid;
  }
}

export class IndexedBlockedContent {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  cid: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: BlockedContent;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy;
    this.siteAddress = props.doc.siteAddress;
    this.cid = props.doc.cid;
    this.created = props.created;
    this.modified = props.modified;
  }
}
