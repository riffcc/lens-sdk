import { variant, field, option } from '@dao-xyz/borsh';
import { concat } from 'uint8arrays';
import { PublicSignKey, sha256Base64Sync } from '@peerbit/crypto';
import type { FeaturedReleaseData, DocumentArgs } from '../types';

@variant('featured')
export class FeaturedRelease {
  @field({ type: 'string' })
  id: string;

  @field({ type: PublicSignKey })
  postedBy: PublicSignKey;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  releaseId: string;

  @field({ type: 'string' })
  startTime: string;

  @field({ type: 'string' })
  endTime: string;

  @field({ type: 'bool' })
  promoted: boolean;

  @field({ type: option('u32') })
  order?: number;

  constructor(props: DocumentArgs<FeaturedReleaseData>) {
    this.id = props.id ?? sha256Base64Sync(
      concat([
        new TextEncoder().encode(props.releaseId),
        new TextEncoder().encode(props.siteAddress)],
      ),
    );
    this.postedBy = props.postedBy;
    this.siteAddress = props.siteAddress;
    this.releaseId = props.releaseId;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.promoted = props.promoted;
    this.order = props.order;
  }
}

export class IndexedFeaturedRelease {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;

  @field({ type: 'string' })
  releaseId: string;

  @field({ type: 'string' })
  startTime: string;

  @field({ type: 'string' })
  endTime: string;

  @field({ type: 'bool' })
  promoted: boolean;

  @field({ type: option('u32') })
  order?: number;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: FeaturedRelease;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy.bytes;
    this.siteAddress = props.doc.siteAddress;
    this.releaseId = props.doc.releaseId;
    this.startTime = props.doc.startTime;
    this.endTime = props.doc.endTime;
    this.promoted = props.doc.promoted;
    this.order = props.doc.order;
    this.created = props.created;
    this.modified = props.modified;
  }
}