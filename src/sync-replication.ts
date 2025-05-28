import { Site, Release } from './schema';
import type { SubscriptionData } from './types';
import { 
  ID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
} from './constants';
import type { Peerbit } from 'peerbit';
import { SearchRequest } from '@peerbit/document';
import { v4 as uuid } from 'uuid';

export interface ReplicationSyncOptions {
  onStatusUpdate?: (status: string) => void;
  onError?: (error: Error) => void;
  logger?: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
}

interface ReplicatedSite {
  site: Site;
  subscription: SubscriptionData;
  cleanup: () => void;
}

export class ReplicationSyncManager {
  private client: Peerbit;
  private localSite: Site;
  private replicatedSites: Map<string, ReplicatedSite> = new Map();
  private logger?: any;
  private onStatusUpdate?: (status: string) => void;

  constructor(
    client: Peerbit,
    localSite: Site,
    _lensService?: any,
    options?: ReplicationSyncOptions
  ) {
    this.client = client;
    this.localSite = localSite;
    this.logger = options?.logger;
    this.onStatusUpdate = options?.onStatusUpdate;
  }

  async initialize(): Promise<void> {
    this.logger?.info('Initializing replication sync manager');
    
    // Subscribe to sites we follow
    await this.setupSubscriptions();
    
    this.logger?.info('Replication sync manager initialized');
  }

  private async setupSubscriptions(): Promise<void> {
    const subscriptions = await this.getLocalSubscriptions();
    
    this.logger?.info('Setting up replication for subscribed sites', { 
      count: subscriptions.length 
    });
    
    // Open each subscribed site in parallel
    const setupPromises = subscriptions.map(subscription => 
      this.replicateSite(subscription)
    );
    
    await Promise.allSettled(setupPromises);
  }

  async subscribeToSite(
    siteId: string, 
    siteName?: string, 
    isRecursive?: boolean,
    subscription?: SubscriptionData
  ): Promise<void> {
    const sub = subscription || {
      [ID_PROPERTY]: uuid(),
      [SUBSCRIPTION_SITE_ID_PROPERTY]: siteId,
      [SUBSCRIPTION_NAME_PROPERTY]: siteName || siteId,
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: isRecursive || false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: []
    };
    
    await this.replicateSite(sub);
  }

  private async replicateSite(subscription: SubscriptionData): Promise<void> {
    const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
    const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
    const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
    
    this.logger?.info('Replicating site', { siteId, siteName });
    
    // Don't replicate ourselves
    if (siteId === this.localSite.address) {
      this.logger?.warn('Cannot replicate own site', { siteId });
      return;
    }
    
    // Check if already replicating
    if (this.replicatedSites.has(siteId)) {
      this.logger?.info('Already replicating site', { siteId });
      return;
    }
    
    try {
      // Open the remote site with FULL REPLICATION
      const remoteSite = await this.client.open<Site>(siteId, {
        args: {
          releasesArgs: { 
            replicate: true, // Full replication!
          },
          // Only replicate other stores if we want full site mirror
          featuredReleasesArgs: { replicate: true },
          contentCategoriesArgs: { replicate: true },
          subscriptionsArgs: { replicate: isRecursive }, // Only if recursive
          blockedContentArgs: { replicate: true },
        },
      });
      
      this.logger?.info('Successfully opened site for replication', { 
        siteId,
        address: remoteSite.address 
      });
      
      // Watch for changes and federate them to our local site
      const changeHandler = async (evt: any) => {
        try {
          const added = evt.detail?.added || [];
          const removed = evt.detail?.removed || [];
          
          if (added.length > 0) {
            await this.handleRemoteAdditions(added, siteId, siteName, isRecursive);
          }
          
          if (removed.length > 0) {
            await this.handleRemoteRemovals(removed, siteId);
          }
        } catch (error) {
          this.logger?.error('Error handling remote changes', {
            siteId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };
      
      // Attach change listener
      remoteSite.releases.events.addEventListener('change', changeHandler);
      
      // Store the replicated site
      this.replicatedSites.set(siteId, {
        site: remoteSite,
        subscription,
        cleanup: () => {
          remoteSite.releases.events.removeEventListener('change', changeHandler);
        },
      });
      
      // Process existing content
      await this.syncExistingContent(remoteSite, siteId, siteName, isRecursive);
      
      this.onStatusUpdate?.(`✅ Now replicating content from "${siteName || siteId}"`);
      
    } catch (error) {
      this.logger?.error('Failed to replicate site', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.onStatusUpdate?.(`❌ Failed to replicate "${siteName || siteId}": ${error}`);
    }
  }

  private async syncExistingContent(
    remoteSite: Site, 
    siteId: string, 
    siteName?: string,
    isRecursive?: boolean
  ): Promise<void> {
    this.logger?.info('Syncing existing content from site', { siteId });
    
    try {
      // Get all releases from the remote site
      const remoteReleases = await remoteSite.releases.index.search(
        new SearchRequest({ fetch: 1000 })
      );
      
      this.logger?.info('Found existing releases', { 
        siteId, 
        count: remoteReleases.length 
      });
      
      await this.handleRemoteAdditions(remoteReleases, siteId, siteName, isRecursive);
      
    } catch (error) {
      this.logger?.error('Failed to sync existing content', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleRemoteAdditions(
    releases: Release[],
    sourceSiteId: string,
    siteName?: string,
    isRecursive?: boolean
  ): Promise<void> {
    // Filter content based on recursive setting
    const contentToFederate = releases.filter(release => {
      // Skip our own content that somehow came back
      if (release.federatedFrom === this.localSite.address) {
        return false;
      }
      
      // If recursive, accept all content
      if (isRecursive) {
        return true;
      }
      
      // Otherwise, only accept original content from this site
      return !release.federatedFrom || release.federatedFrom === sourceSiteId;
    });
    
    if (contentToFederate.length === 0) {
      return;
    }
    
    this.logger?.info('Federating releases to local site', {
      sourceSiteId,
      count: contentToFederate.length,
    });
    
    let federatedCount = 0;
    
    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 20;
    for (let i = 0; i < contentToFederate.length; i += BATCH_SIZE) {
      const batch = contentToFederate.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (release) => {
        try {
          // Check if we already have this release
          const existing = await this.localSite.releases.index.get(release.id);
          if (existing) {
            return false;
          }
          
          // Create federated version
          const federatedRelease = new Release({
            ...release,
            federatedFrom: release.federatedFrom || sourceSiteId,
            federatedAt: release.federatedAt || new Date().toISOString(),
            federatedRealtime: true,
          });
          
          await this.localSite.releases.put(federatedRelease);
          return true;
          
        } catch (error) {
          this.logger?.warn('Failed to federate release', {
            releaseId: release.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      });
      
      const results = await Promise.all(batchPromises);
      federatedCount += results.filter(r => r).length;
    }
    
    if (federatedCount > 0) {
      this.onStatusUpdate?.(
        `✅ Federated ${federatedCount} releases from "${siteName || sourceSiteId}"`
      );
    }
  }

  private async handleRemoteRemovals(
    removed: Release[],
    sourceSiteId: string
  ): Promise<void> {
    this.logger?.info('Handling remote removals', {
      sourceSiteId,
      count: removed.length,
    });
    
    let removedCount = 0;
    
    for (const removedRelease of removed) {
      try {
        // Only remove if it was federated from this source
        const existing = await this.localSite.releases.index.get(removedRelease.id);
        if (existing && existing.federatedFrom === sourceSiteId) {
          await this.localSite.releases.del(removedRelease.id);
          removedCount++;
        }
      } catch (error) {
        this.logger?.warn('Failed to remove federated release', {
          releaseId: removedRelease.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    if (removedCount > 0) {
      this.logger?.info('Removed federated releases', {
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
    this.logger?.info('Shutting down replication sync manager');
    
    // Clean up all replicated sites
    for (const [siteId, replicated] of this.replicatedSites) {
      try {
        // Remove event listener
        replicated.cleanup();
        
        // Close the site
        await replicated.site.close();
        
        this.logger?.info('Closed replicated site', { siteId });
      } catch (error) {
        this.logger?.error('Error closing replicated site', {
          siteId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    this.replicatedSites.clear();
  }
}