import { variant, field } from '@dao-xyz/borsh';
import { v4 as uuid } from 'uuid';
import { Documents } from '@peerbit/document';
import { PublicSignKey } from '@peerbit/crypto';

// Message types for federation sync
@variant('federation_sync_message')
export class FederationSyncMessage {
  @field({ type: 'string' })
  id: string;
  
  @field({ type: 'string' })
  sourceSiteId: string;
  
  @field({ type: 'string' })
  messageType: 'releases_added' | 'releases_removed' | 'sync_request';
  
  @field({ type: 'string' })
  payload: string; // JSON stringified data
  
  @field({ type: 'u64' })
  timestamp: bigint;
  
  constructor(props?: {
    sourceSiteId: string;
    messageType: 'releases_added' | 'releases_removed' | 'sync_request';
    payload: any;
  }) {
    this.id = props ? uuid() : '';
    this.sourceSiteId = props?.sourceSiteId || '';
    this.messageType = props?.messageType || 'sync_request';
    this.payload = props ? JSON.stringify(props.payload) : '';
    this.timestamp = BigInt(props ? Date.now() : 0);
  }
}

// Indexable version for queries
export class IndexableFederationSyncMessage {
  @field({ type: 'string' })
  id: string;
  
  @field({ type: 'string' })
  sourceSiteId: string;
  
  @field({ type: 'string' })
  messageType: string;
  
  @field({ type: 'u64' })
  timestamp: bigint;
  
  @field({ type: 'u64' })
  created: bigint;
  
  @field({ type: 'u64' })
  modified: bigint;
  
  @field({ type: Uint8Array })
  author: Uint8Array;
  
  constructor(
    message: FederationSyncMessage,
    created: bigint,
    modified: bigint,
    author: PublicSignKey,
  ) {
    this.id = message.id;
    this.sourceSiteId = message.sourceSiteId;
    this.messageType = message.messageType;
    this.timestamp = message.timestamp;
    this.created = created;
    this.modified = modified;
    this.author = author.bytes;
  }
}

// Extended Site with sync messages store
export interface SiteWithSync {
  syncMessages?: Documents<FederationSyncMessage, IndexableFederationSyncMessage>;
}