import { field, variant } from '@dao-xyz/borsh';
import type { DocumentArgs, SubscriptionData } from '../types';
import { PublicSignKey, sha256Base64Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';

@variant('subscription')
export class Subscription {
  @field({ type: 'string' })
  id: string;

  @field({ type: PublicSignKey })
  postedBy: PublicSignKey;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  to: string;

  constructor(props: DocumentArgs<SubscriptionData>) {
    this.id = props.id ?? sha256Base64Sync(concat([
      new TextEncoder().encode(props.siteAddress),
      new TextEncoder().encode(props.to),
    ]));
    this.postedBy = props.postedBy;
    this.siteAddress = props.siteAddress;
    this.to = props.to;
  }
}

export class IndexedSubscription {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  to: string;

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
    this.postedBy = props.doc.postedBy.bytes;
    this.siteAddress = props.doc.siteAddress;
    this.to = props.doc.to;
    this.created = props.created;
    this.modified = props.modified;
  }
}

