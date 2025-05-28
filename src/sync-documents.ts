import { Site, Release } from './schema';
import { FederationSyncMessage } from './sync-messages';
import type { SubscriptionData } from './types';
import { 
  ID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
} from './constants';
import type { Peerbit } from 'peerbit';
import { SearchRequest, Sort, SortDirection } from '@peerbit/document';
import { v4 as uuid } from 'uuid';

export interface DocumentsSyncOptions {
  onStatusUpdate?: (status: string) => void;
  onError?: (error: Error) => void;
  logger?: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
}

export class DocumentsSyncManager {
  private client: Peerbit;
  private localSite: Site;
  private followedSites: Map<string, { site: Site; subscription: SubscriptionData }> = new Map();
  // private lensService?: any;
  private onStatusUpdate?: (status: string) => void;
  private logger?: any;
  private cleanupFunctions: Map<string, () => void> = new Map();

  constructor(
    client: Peerbit,
    localSite: Site,
    _lensService?: any,
    options?: DocumentsSyncOptions
  ) {
    this.client = client;
    this.localSite = localSite;
    // this.lensService = _lensService;
    this.onStatusUpdate = options?.onStatusUpdate;
    this.logger = options?.logger;
  }

  async initialize(): Promise<void> {
    this.logger?.info('Initializing Documents sync manager');
    
    // Ensure our site has sync messages enabled
    if (!this.localSite.syncMessages) {
      throw new Error('Site must have syncMessages store enabled for federation');
    }
    
    // Set up local publishing - when our releases change, publish sync messages
    this.setupLocalPublishing();
    
    // Subscribe to sites we follow
    await this.setupSubscriptions();
    
    this.logger?.info('Documents sync manager initialized');
  }

  private setupLocalPublishing(): void {
    this.logger?.info('Setting up local publishing for site', { 
      siteAddress: this.localSite.address,
    });
    
    // Listen to our own releases changes and publish sync messages
    const changeHandler = async (evt: any) => {
      try {
        const added = evt.detail?.added || [];
        const removed = evt.detail?.removed || [];
        
        if (added.length === 0 && removed.length === 0) {
          return;
        }
        
        this.logger?.info('Publishing sync message for changes', {
          added: added.length,
          removed: removed.length,
        });
        
        // Create sync messages for additions
        if (added.length > 0) {
          // Only publish original content (not already federated)
          const originalContent = added.filter((r: Release) => !r.federatedFrom);
          
          if (originalContent.length > 0) {
            const message = new FederationSyncMessage({
              sourceSiteId: this.localSite.address!,
              messageType: 'releases_added',
              payload: originalContent.map((r: Release) => ({
                id: r.id,
                name: r.name,
                categoryId: r.categoryId,
                contentCID: r.contentCID,
                thumbnailCID: r.thumbnailCID,
                metadata: r.metadata,
                federatedFrom: r.federatedFrom,
                federatedAt: r.federatedAt,
                federatedRealtime: r.federatedRealtime,
              })),
            });
            
            await this.localSite.syncMessages!.put(message);
          }
        }
        
        // Create sync messages for removals
        if (removed.length > 0) {
          const message = new FederationSyncMessage({
            sourceSiteId: this.localSite.address!,
            messageType: 'releases_removed',
            payload: removed.map((r: Release) => ({ id: r.id })),
          });
          
          await this.localSite.syncMessages!.put(message);
        }
      } catch (error) {
        this.logger?.error('Failed to publish sync message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    
    this.localSite.releases.events.addEventListener('change', changeHandler);
    this.cleanupFunctions.set('local-publishing', () => {
      this.localSite.releases.events.removeEventListener('change', changeHandler);
    });
  }

  private async setupSubscriptions(): Promise<void> {
    const subscriptions = await this.getLocalSubscriptions();
    
    this.logger?.info('Setting up subscriptions', { count: subscriptions.length });
    
    for (const subscription of subscriptions) {
      const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
      const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
      const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
      
      await this.subscribeToSite(siteId, siteName, isRecursive, subscription);
    }
  }

  async subscribeToSite(
    siteId: string, 
    siteName?: string, 
    isRecursive?: boolean, 
    subscription?: SubscriptionData
  ): Promise<void> {
    this.logger?.info('Subscribing to site', { 
      siteId, 
      siteName,
      isRecursive,
    });
    
    // Don't subscribe to ourselves
    if (siteId === this.localSite.address) {
      this.logger?.warn('Cannot subscribe to own site', { siteId });
      return;
    }
    
    // Check if already subscribed
    if (this.followedSites.has(siteId)) {
      this.logger?.info('Already subscribed to site', { siteId });
      return;
    }
    
    try {
      // Open the remote site
      const remoteSite = await this.client.open<Site>(siteId, {
        args: {
          releasesArgs: { replicate: { factor: 0 } }, // Don't replicate their releases directly
          syncMessagesArgs: { replicate: true }, // DO replicate their sync messages
        },
      });
      
      if (!remoteSite.syncMessages) {
        this.logger?.warn('Remote site does not support sync messages', { siteId });
        return;
      }
      
      // Store the site reference
      this.followedSites.set(siteId, { 
        site: remoteSite, 
        subscription: subscription || {
          [ID_PROPERTY]: uuid(),
          [SUBSCRIPTION_SITE_ID_PROPERTY]: siteId,
          [SUBSCRIPTION_NAME_PROPERTY]: siteName || siteId,
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: isRecursive || false,
          subscriptionType: 'direct',
          currentDepth: 0,
          followChain: []
        }
      });
      
      // Listen for sync messages from this site
      const messageHandler = async (evt: any) => {
        const added = evt.detail?.added || [];
        
        for (const message of added) {
          // Only process messages from the site we're subscribed to
          if (message.sourceSiteId === siteId) {
            await this.processSyncMessage(message, isRecursive);
          }
        }
      };
      
      remoteSite.syncMessages.events.addEventListener('change', messageHandler);
      this.cleanupFunctions.set(`subscription-${siteId}`, () => {
        remoteSite.syncMessages!.events.removeEventListener('change', messageHandler);
      });
      
      // Process any existing sync messages we haven't seen
      await this.processExistingSyncMessages(remoteSite, siteId, isRecursive);
      
      this.logger?.info('Successfully subscribed to site', { siteId });
      
    } catch (error) {
      this.logger?.error('Failed to subscribe to site', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processExistingSyncMessages(
    remoteSite: Site, 
    siteId: string, 
    isRecursive?: boolean
  ): Promise<void> {
    // Get the latest sync messages we haven't processed
    const messages = await remoteSite.syncMessages!.index.search(
      new SearchRequest({
        sort: [new Sort({ key: 'timestamp', direction: SortDirection.DESC })],
        fetch: 100, // Process last 100 messages
      })
    );
    
    // Process them in chronological order
    for (const message of messages.reverse()) {
      if (message.sourceSiteId === siteId) {
        await this.processSyncMessage(message, isRecursive);
      }
    }
  }

  private async processSyncMessage(
    message: FederationSyncMessage, 
    isRecursive?: boolean
  ): Promise<void> {
    const { sourceSiteId, messageType, payload } = message;
    const data = JSON.parse(payload);
    
    this.logger?.info('Processing sync message', {
      sourceSiteId,
      messageType,
      itemCount: Array.isArray(data) ? data.length : 1,
    });
    
    switch (messageType) {
      case 'releases_added':
        await this.handleReleasesAdded(data, sourceSiteId, isRecursive);
        break;
        
      case 'releases_removed':
        await this.handleReleasesRemoved(data, sourceSiteId);
        break;
        
      case 'sync_request':
        // Future: Handle sync requests
        break;
    }
  }

  private async handleReleasesAdded(
    releases: any[], 
    sourceSiteId: string, 
    isRecursive?: boolean
  ): Promise<void> {
    const contentToSync = releases.filter((release) => {
      if (isRecursive) {
        return true; // Accept all content
      } else {
        return !release.federatedFrom; // Only original content
      }
    });
    
    if (contentToSync.length === 0) {
      return;
    }
    
    let syncedCount = 0;
    
    for (const releaseData of contentToSync) {
      try {
        // Skip if it's our own content coming back
        if (releaseData.federatedFrom === this.localSite.address) {
          continue;
        }
        
        // Check if we already have this release
        const existing = await this.localSite.releases.index.get(releaseData.id);
        if (existing) {
          continue;
        }
        
        const federatedRelease = new Release({
          ...releaseData,
          federatedFrom: releaseData.federatedFrom || sourceSiteId,
          federatedAt: releaseData.federatedAt || new Date().toISOString(),
          federatedRealtime: true,
        });
        
        await this.localSite.releases.put(federatedRelease);
        syncedCount++;
        
      } catch (error) {
        this.logger?.warn('Failed to sync release', {
          releaseId: releaseData.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    if (syncedCount > 0 && this.onStatusUpdate) {
      const sub = this.followedSites.get(sourceSiteId);
      const siteName = sub?.subscription[SUBSCRIPTION_NAME_PROPERTY] || sourceSiteId;
      this.onStatusUpdate(`✅ Synced ${syncedCount} releases from "${siteName}"`);
    }
  }

  private async handleReleasesRemoved(
    removed: any[], 
    sourceSiteId: string
  ): Promise<void> {
    let removedCount = 0;
    
    for (const removedItem of removed) {
      try {
        const existingRelease = await this.localSite.releases.index.get(removedItem.id);
        
        if (existingRelease && existingRelease.federatedFrom === sourceSiteId) {
          await this.localSite.releases.del(removedItem.id);
          removedCount++;
        }
      } catch (error) {
        this.logger?.warn('Failed to remove release', {
          releaseId: removedItem.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    if (removedCount > 0) {
      this.logger?.info('Removed federated content', {
        sourceSiteId,
        count: removedCount,
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
  
  async shutdown(): Promise<void> {
    // Clean up all event listeners
    for (const [, cleanup] of this.cleanupFunctions) {
      cleanup();
    }
    this.cleanupFunctions.clear();
    
    // Close followed sites
    for (const [, { site }] of this.followedSites) {
      await site.close();
    }
    this.followedSites.clear();
  }
}