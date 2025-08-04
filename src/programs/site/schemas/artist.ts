import { variant, field, option, vec } from '@dao-xyz/borsh';
import { v4 as uuid } from 'uuid';
import type { ArtistData, DocumentArgs } from '../types';
import { PublicSignKey } from '@peerbit/crypto';

@variant('artist')
export class Artist {
  @field({ type: 'string' })
  id: string;

  @field({ type: PublicSignKey })
  postedBy: PublicSignKey;

  @field({ type: 'string' })
  siteAddress: string;
  
  @field({ type: 'string' })
  name: string;

  @field({ type: option('string') })
  bio?: string;

  @field({ type: option('string') })
  avatarCID?: string;

  @field({ type: option('string') })
  bannerCID?: string;

  @field({ type: vec('string') })
  links: string[];

  @field({ type: option('string') })
  metadata?: string;

  constructor(props: DocumentArgs<ArtistData>) {
    this.id = props.id ?? uuid();
    this.postedBy = props.postedBy;
    this.siteAddress = props.siteAddress;
    this.name = props.name;
    if (props.bio) {
      this.bio = props.bio;
    }
    if (props.avatarCID) {
      this.avatarCID = props.avatarCID;
    }
    if (props.bannerCID) {
      this.bannerCID = props.bannerCID;
    }
    this.links = props.links ?? [];
    if (props.metadata) {
      this.metadata = props.metadata;
    }
  }
}

export class IndexedArtist {
  @field({ type: 'string' })
  id: string;

  @field({ type: Uint8Array })
  postedBy: Uint8Array;

  @field({ type: 'string' })
  siteAddress: string;
  
  @field({ type: 'string' })
  name: string;

  @field({ type: option('string') })
  bio?: string;

  @field({ type: option('string') })
  avatarCID?: string;

  @field({ type: option('string') })
  bannerCID?: string;

  @field({ type: vec('string') })
  links: string[];

  @field({ type: option('string') })
  metadata?: string;

  @field({ type: 'u64' })
  created: bigint;

  @field({ type: 'u64' })
  modified: bigint;

  constructor(props: {
    doc: Artist;
    created: bigint;
    modified: bigint;
  }) {
    this.id = props.doc.id;
    this.postedBy = props.doc.postedBy.bytes;
    this.siteAddress = props.doc.siteAddress;
    this.name = props.doc.name;
    this.bio = props.doc.bio;
    this.avatarCID = props.doc.avatarCID;
    this.bannerCID = props.doc.bannerCID;
    this.links = props.doc.links;
    this.metadata = props.doc.metadata;
    this.created = props.created;
    this.modified = props.modified;
  }
}