import { Site, Release } from './schema';
import type { SubscriptionData } from './types';
import { 
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  SITE_NAME_PROPERTY,
} from './constants';
import type { Peerbit } from 'peerbit';
import { serialize, deserialize, variant, field, option } from '@dao-xyz/borsh';
import { SearchRequest } from '@peerbit/document';
import { getOrCreateDirectSub } from './directsub-singleton';

@variant('sync_update_message')
export class SyncUpdateMessage {
  @field({ type: 'string' })
  siteId!: string;

  @field({ type: option('string') })
  siteName?: string;

  @field({ type: Uint8Array })
  addedData!: Uint8Array; // Serialized array of releases

  @field({ type: Uint8Array })
  removedData!: Uint8Array; // Serialized array of removed IDs

  @field({ type: 'u64' })
  timestamp!: bigint;

  constructor(properties?: {
    siteId: string;
    siteName?: string;
    addedData: Uint8Array;
    removedData: Uint8Array;
    timestamp: bigint;
  }) {
    if (properties) {
      this.siteId = properties.siteId;
      this.siteName = properties.siteName;
      this.addedData = properties.addedData;
      this.removedData = properties.removedData;
      this.timestamp = properties.timestamp;
    }
  }
}

export interface DirectSubSyncOptions {
  onStatusUpdate?: (status: string) => void;
  onError?: (error: Error) => void;
  logger?: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
}

export class DirectSubSyncManager {
  private client: Peerbit;
  private localSite: Site;
  private pubsub?: any; // DirectSub instance
  private subscribedTopics: Set<string> = new Set();
  private subscriptionMetadata: Map<string, { siteId: string; siteName?: string; isRecursive?: boolean }> = new Map();
  private topicSubscribers: Map<string, Set<string>> = new Map(); // Track subscribers per topic
  private lensService?: any;
  private onStatusUpdate?: (status: string) => void;
  private logger?: any;
  private dataListener?: (event: any) => void;
  private initialized: boolean = false;

  constructor(
    client: Peerbit,
    localSite: Site,
    lensService?: any,
    options?: DirectSubSyncOptions
  ) {
    this.client = client;
    this.localSite = localSite;
    this.lensService = lensService;
    this.onStatusUpdate = options?.onStatusUpdate;
    this.logger = options?.logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger?.debug('DirectSub already initialized');
      return;
    }
    
    try {
      this.logger?.info('Getting DirectSub instance...');
      
      // Get or create DirectSub instance (singleton per client)
      this.pubsub = await getOrCreateDirectSub(this.client);
      
      this.initialized = true;
      
      // Set up data listener
      this.dataListener = (event: any) => {
        this.logger?.info('DirectSub data event fired', { 
          eventType: 'data',
          hasDetail: !!event.detail,
          detailKeys: event.detail ? Object.keys(event.detail) : [],
          detailType: typeof event.detail,
          eventKeys: Object.keys(event),
          eventType2: typeof event,
          fullEvent: JSON.stringify(event, null, 2)
        });
        this.handleIncomingMessage(event);
      };
      this.pubsub.addEventListener('data', this.dataListener);
      
      // Log all events for debugging
      const eventTypes = ['subscribe', 'unsubscribe', 'data', 'publish'];
      eventTypes.forEach(eventType => {
        if (eventType !== 'data') { // We already handle data above
          this.pubsub.addEventListener(eventType, (evt: any) => {
            this.logger?.debug(`DirectSub event: ${eventType}`, { detail: evt.detail });
          });
        }
      });
      
      // Listen for subscription events
      this.pubsub.addEventListener('subscribe', (event: any) => {
        const { from, topics } = event.detail || {};
        this.logger?.info('Peer subscribed to topics', { 
          peerId: from?.hashcode(), 
          topics 
        });
        
        // Track subscribers
        if (topics && from) {
          for (const topic of topics) {
            if (!this.topicSubscribers.has(topic)) {
              this.topicSubscribers.set(topic, new Set());
            }
            this.topicSubscribers.get(topic)!.add(from.hashcode());
          }
        }
      });
      
      this.pubsub.addEventListener('unsubscribe', (event: any) => {
        const { from, topics } = event.detail || {};
        this.logger?.info('Peer unsubscribed from topics', { 
          peerId: from?.hashcode(), 
          topics 
        });
        
        // Remove subscribers
        if (topics && from) {
          for (const topic of topics) {
            this.topicSubscribers.get(topic)?.delete(from.hashcode());
          }
        }
      });
      
      // Set up publishing for our own site's changes
      this.setupLocalPublishing();
      
      // Subscribe to sites we follow
      await this.setupSubscriptions();
      
      // Also subscribe to our own topic to track subscribers
      const ourTopic = `lens/site/${this.localSite.address}/updates`;
      await this.pubsub.subscribe(ourTopic);
      this.subscribedTopics.add(ourTopic);
      this.logger?.info('Subscribed to own topic for tracking', { topic: ourTopic });
      
      // Request subscriber information for our topic
      if (typeof this.pubsub.requestSubscribers === 'function') {
        await this.pubsub.requestSubscribers(ourTopic);
        this.logger?.info('Requested subscriber info for our topic');
      }
      
      this.logger?.info('DirectSub sync manager initialized');
    } catch (error) {
      this.logger?.error('Failed to initialize DirectSub', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private setupLocalPublishing(): void {
    this.logger?.info('Setting up local publishing for site', { 
      siteAddress: this.localSite.address,
      hasEvents: !!this.localSite.releases.events 
    });
    
    // Listen to our own releases changes and publish them
    this.localSite.releases.events.addEventListener('change', async (evt: any) => {
      try {
        this.logger?.info('Releases change event fired', {
          hasDetail: !!evt.detail,
          added: evt.detail?.added?.length || 0,
          removed: evt.detail?.removed?.length || 0,
        });
        
        const added = evt.detail.added || [];
        const removed = evt.detail.removed || [];
        
        if (added.length === 0 && removed.length === 0) {
          this.logger?.debug('No changes to publish');
          return;
        }
        
        // Convert releases to simple objects for serialization
        const addedSimple = added.map((r: any) => ({
          id: r.id,
          name: r.name,
          categoryId: r.categoryId,
          contentCID: r.contentCID,
          thumbnailCID: r.thumbnailCID,
          metadata: r.metadata,
          federatedFrom: r.federatedFrom,
          federatedAt: r.federatedAt,
          federatedRealtime: r.federatedRealtime,
        }));
        
        const removedSimple = removed.map((r: any) => ({ id: r.id }));
        
        // Serialize as JSON for now (we can optimize later)
        const addedData = new TextEncoder().encode(JSON.stringify(addedSimple));
        const removedData = new TextEncoder().encode(JSON.stringify(removedSimple));
        
        const update = new SyncUpdateMessage({
          siteId: this.localSite.address,
          siteName: this.localSite[SITE_NAME_PROPERTY] || undefined,
          addedData,
          removedData,
          timestamp: BigInt(Date.now()),
        });
        
        const topic = `lens/site/${this.localSite.address}/updates`;
        const message = serialize(update);
        
        this.logger?.info('Publishing update to DirectSub', {
          topic,
          addedCount: added.length,
          removedCount: removed.length,
          messageSize: message.length,
        });
        
        // Get current subscribers from DirectSub
        let currentSubscribers = this.pubsub!.getSubscribers ? this.pubsub!.getSubscribers(topic) : [];
        let subscriberCount = currentSubscribers?.length || 0;
        
        // If no subscribers yet, request discovery and wait briefly
        if (subscriberCount === 0 && typeof this.pubsub!.requestSubscribers === 'function') {
          this.logger?.info('No subscribers found, requesting discovery', { topic });
          await this.pubsub!.requestSubscribers(topic);
          
          // Poll for a short time to see if subscribers appear
          const discoveryStart = Date.now();
          while (Date.now() - discoveryStart < 2000) {
            currentSubscribers = this.pubsub!.getSubscribers?.(topic) || [];
            subscriberCount = currentSubscribers?.length || 0;
            if (subscriberCount > 0) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        this.logger?.info('Publishing to DirectSub', { 
          topic,
          subscriberCount,
          hasSubscribers: subscriberCount > 0
        });
        
        const publishResult = await this.pubsub!.publish(message, {
          topics: [topic],
        });
        
        this.logger?.info('Published update to DirectSub successfully', {
          topic,
          publishResult,
        });
      } catch (error) {
        this.logger?.error('Failed to publish DirectSub update', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });
  }

  private async setupSubscriptions(): Promise<void> {
    // Get all subscriptions
    const subscriptions = await this.getLocalSubscriptions();
    
    this.logger?.info('Setting up DirectSub subscriptions', { count: subscriptions.length });
    
    for (const subscription of subscriptions) {
      const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
      const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
      const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
      
      await this.subscribeToSite(siteId, siteName, isRecursive);
    }
  }

  async subscribeToSite(siteId: string, siteName?: string, isRecursive?: boolean): Promise<void> {
    const topic = `lens/site/${siteId}/updates`;
    
    // Avoid duplicate subscriptions
    if (this.subscribedTopics.has(topic)) {
      this.logger?.info('Already subscribed to topic', { topic });
      return;
    }
    
    this.logger?.info('Subscribing to DirectSub topic', { 
      topic, 
      siteId, 
      siteName,
      isRecursive,
      pubsubReady: !!this.pubsub 
    });
    
    // Subscribe to the topic
    await this.pubsub!.subscribe(topic);
    this.subscribedTopics.add(topic);
    
    // Store metadata for this subscription
    this.subscriptionMetadata.set(topic, { siteId, siteName, isRecursive });
    
    // Also subscribe to our own topic to know when others are listening
    const ourTopic = `lens/site/${this.localSite.address}/updates`;
    if (!this.subscribedTopics.has(ourTopic)) {
      await this.pubsub!.subscribe(ourTopic);
      this.subscribedTopics.add(ourTopic);
    }
    
    // Request subscriber information and wait for discovery
    if (typeof this.pubsub!.requestSubscribers === 'function') {
      await this.pubsub!.requestSubscribers([topic, ourTopic]);
      this.logger?.info('Requested subscriber info for topics', { topics: [topic, ourTopic] });
      
      // Wait for subscription discovery to complete
      await this.waitForSubscriptionDiscovery(topic);
      
      // Additional delay to ensure subscription state is fully propagated
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async handleIncomingMessage(event: any): Promise<void> {
    try {
      this.logger?.info('handleIncomingMessage called', {
        event: event,
        detail: event.detail,
        detailType: typeof event.detail,
        hasDetail: !!event.detail,
        hasData: !!event.detail?.data,
        topics: event.detail?.topics,
        messageSize: event.detail?.data?.length,
        from: event.detail?.from,
      });
      
      const message = event.detail.data?.data; // The actual message payload  
      const topics = event.detail.data?.topics || []; // Topics from PubSubData
      
      // Find which topic this message is for
      let matchedTopic: string | undefined;
      for (const topic of topics) {
        if (this.subscribedTopics.has(topic)) {
          matchedTopic = topic;
          break;
        }
      }
      
      if (!matchedTopic) {
        this.logger?.debug('Ignoring message - no matching subscribed topic', {
          topics,
          subscribedTopics: Array.from(this.subscribedTopics),
        });
        return; // Ignore messages for topics we're not subscribed to
      }
      
      // Deserialize the message
      let update;
      try {
        update = deserialize(message, SyncUpdateMessage);
      } catch (deserializeError) {
        this.logger?.error('Failed to deserialize message', {
          error: deserializeError instanceof Error ? deserializeError.message : String(deserializeError),
          messageLength: message?.length,
          messageType: typeof message
        });
        return;
      }
      
      // Get subscription metadata
      const metadata = this.subscriptionMetadata.get(matchedTopic);
      if (!metadata) {
        this.logger?.warn('No metadata for topic', { topic: matchedTopic });
        return;
      }
      
      // Verify the update is from the expected site
      if (update.siteId !== metadata.siteId) {
        this.logger?.warn('Received update from wrong site', {
          expected: metadata.siteId,
          received: update.siteId,
        });
        return;
      }
      
      // Process the update
      await this.processUpdate(update, metadata.isRecursive);
      
    } catch (error) {
      this.logger?.error('Failed to process DirectSub message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processUpdate(update: SyncUpdateMessage, isRecursive?: boolean): Promise<void> {
    const { siteId, siteName, addedData, removedData } = update;
    
    // Deserialize the release data as JSON (not Borsh)
    const added = addedData.length > 0 ? JSON.parse(new TextDecoder().decode(addedData)) : [];
    const removed = removedData.length > 0 ? JSON.parse(new TextDecoder().decode(removedData)) : [];
    
    this.logger?.info('Processing DirectSub update', {
      siteId,
      siteName,
      addedCount: added.length,
      removedCount: removed.length,
      timestamp: update.timestamp,
    });
    
    // Handle additions
    if (added.length > 0) {
      const contentToSync = added.filter((release: any) => {
        if (isRecursive) {
          return true; // Accept all content
        } else {
          return !release.federatedFrom; // Only original content
        }
      });
      
      if (contentToSync.length > 0) {
        await this.syncContent(contentToSync, siteId, siteName);
      }
    }
    
    // Handle removals
    if (removed.length > 0) {
      await this.removeContent(removed, siteId);
    }
  }

  private async syncContent(releases: any[], siteId: string, siteName?: string): Promise<void> {
    const BATCH_SIZE = 20;
    let totalSynced = 0;
    
    for (let i = 0; i < releases.length; i += BATCH_SIZE) {
      const batch = releases.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (release) => {
        try {
          // Skip if it's our own content coming back
          if (release.federatedFrom === this.localSite.address) {
            return false;
          }
          
          const federatedRelease = new Release({
            ...release,
            federatedFrom: release.federatedFrom || siteId,
            federatedAt: new Date().toISOString(),
            federatedRealtime: true,
          });
          
          if (this.lensService && typeof this.lensService.addRelease === 'function') {
            const result = await this.lensService.addRelease(federatedRelease);
            return result && result.success;
          } else {
            await this.localSite.releases.put(federatedRelease);
            return true;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes('already exists')) {
            this.logger?.warn('Failed to sync release', {
              releaseId: release.id,
              error: errorMsg,
            });
          }
          return false;
        }
      });
      
      const results = await Promise.allSettled(batchPromises);
      const batchSynced = results.filter(r => r.status === 'fulfilled' && r.value).length;
      totalSynced += batchSynced;
    }
    
    if (totalSynced > 0 && this.onStatusUpdate) {
      this.onStatusUpdate(`✅ Synced ${totalSynced}/${releases.length} releases from "${siteName || siteId}" via DirectSub`);
    }
    
    this.logger?.info('Content sync completed', {
      siteId,
      siteName,
      total: releases.length,
      synced: totalSynced,
    });
  }

  private async removeContent(removed: any[], siteId: string): Promise<void> {
    let totalRemoved = 0;
    
    for (const removedItem of removed) {
      try {
        const existingRelease = await this.localSite.releases.index.get(removedItem.id);
        
        if (existingRelease && existingRelease.federatedFrom === siteId) {
          if (this.lensService && typeof this.lensService.deleteRelease === 'function') {
            const result = await this.lensService.deleteRelease({ id: removedItem.id });
            if (result && result.success) totalRemoved++;
          } else {
            await this.localSite.releases.del(removedItem.id);
            totalRemoved++;
          }
        }
      } catch (error) {
        this.logger?.warn('Failed to remove release', {
          releaseId: removedItem.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    if (totalRemoved > 0) {
      this.logger?.info('Content removal completed', {
        siteId,
        totalRemoved,
      });
    }
  }

  private async getLocalSubscriptions(): Promise<SubscriptionData[]> {
    try {
      const subs = await this.localSite.subscriptions.index.search(
        new SearchRequest({ fetch: 100 })
      );
      return subs;
    } catch (error) {
      this.logger?.error('Failed to get local subscriptions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async waitForSubscriptionDiscovery(topic: string, timeout = 5000): Promise<void> {
    const start = Date.now();
    
    // First, request subscribers for this topic
    if (typeof this.pubsub!.requestSubscribers === 'function') {
      await this.pubsub!.requestSubscribers(topic);
    }
    
    // Then wait for discovery
    while (Date.now() - start < timeout) {
      const subscribers = this.pubsub!.getSubscribers?.(topic);
      if (subscribers && subscribers.length > 0) {
        this.logger?.info('Subscription discovery completed', { 
          topic, 
          subscriberCount: subscribers.length 
        });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.logger?.warn('Subscription discovery timed out', { topic });
  }
  
  async shutdown(): Promise<void> {
    // Remove data listener
    if (this.dataListener && this.pubsub) {
      this.pubsub.removeEventListener('data', this.dataListener);
    }
    
    // Unsubscribe from all topics
    for (const topic of this.subscribedTopics) {
      await this.pubsub?.unsubscribe(topic);
      this.logger?.debug('Unsubscribed from topic', { topic });
    }
    this.subscribedTopics.clear();
    this.subscriptionMetadata.clear();
  }
}