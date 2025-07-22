import { field, variant } from '@dao-xyz/borsh';
import type { BaseData } from '../types';
import { sha256Base64Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';

@variant('subscription')
export class Subscription {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  constructor(props: BaseData & { subcriberSiteAddress: string }) {
    this.id = props.id ?? sha256Base64Sync(concat([
      new TextEncoder().encode(props.siteAddress),
      new TextEncoder().encode(props.subcriberSiteAddress),
    ]));
    this.postedBy = props.postedBy.bytes;
    this.siteAddress = props.siteAddress;
  }
}

export class IndexedSubscription {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: Subscription;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy;
    this.siteAddress = props.doc.siteAddress;
    this.created = props.created;
    this.modified = props.modified;
  }
}

