import { Site, Release } from './schema';
import type { SubscriptionData } from './types';
import { 
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  DEDICATED_SITE_ARGS,
} from './constants';
import type { Peerbit } from 'peerbit';
import { SearchRequest } from '@peerbit/document';

export interface SyncOptions {
  onStatusUpdate?: (status: string) => void;
  onError?: (error: Error) => void;
  logger?: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
  mode?: 'direct-observation' | 'directsub' | 'documents' | 'replication' | 'scalable';
}

export interface ActiveSubscription {
  site: Site;
  siteName?: string;
  lastActivity: number;
  reconnectAttempts: number;
  healthCheckInterval?: NodeJS.Timeout;
}

export class SubscriptionSyncManager {
  private activeSubscriptions = new Map<string, ActiveSubscription>();
  private logger: SyncOptions['logger'];
  private onStatusUpdate: SyncOptions['onStatusUpdate'];

  constructor(
    private client: Peerbit,
    private localSite: Site,
    private lensService?: any,
    options: SyncOptions = {}
  ) {
    this.logger = options.logger || {
      info: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
    this.onStatusUpdate = options.onStatusUpdate || (() => {});
  }

  async setupSubscriptionSync(subscriptions: SubscriptionData[]): Promise<void> {
    this.logger?.info('Setting up event-driven real-time subscription sync', {
      subscriptionCount: subscriptions.length,
    });
    
    // Process subscriptions in parallel for faster startup
    const setupPromises = subscriptions.map(subscription => 
      this.setupSingleSubscription(subscription).catch(error => {
        this.logger?.warn('Failed to setup subscription during parallel init', {
          siteId: subscription[SUBSCRIPTION_SITE_ID_PROPERTY],
          error: error instanceof Error ? error.message : String(error),
        });
      })
    );
    
    await Promise.allSettled(setupPromises);
    
    if (this.onStatusUpdate) {
      this.onStatusUpdate(`🔄 Real-time sync active for ${this.activeSubscriptions.size}/${subscriptions.length} subscriptions`);
    }
  }

  private async setupSingleSubscription(subscription: SubscriptionData): Promise<void> {
    const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
    const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
    const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY] || false;
    
    // Skip if already active
    if (this.activeSubscriptions.has(siteId)) {
      this.logger?.debug('Subscription already active', { siteId, siteName });
      return;
    }

    this.logger?.info('Setting up subscription sync', { 
      siteId, 
      siteName,
      isRecursive 
    });
    
    // If using federation index, add this site to our followed sites
    if (this.localSite.federationIndex) {
      await this.localSite.federationIndex.followSite(siteId);
      this.logger?.info('Added site to federation index followed sites', { siteId });
    }
    
    const maxRetries = 5;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        
        const subscribedSite = await this.openSubscribedSite(siteId, attempt, maxRetries);
        if (!subscribedSite) continue;
        
        // Set up immediate event handling
        await this.setupEventHandlers(subscribedSite, siteId, siteName);
        
        // Store subscription info
        this.activeSubscriptions.set(siteId, {
          site: subscribedSite,
          siteName,
          lastActivity: Date.now(),
          reconnectAttempts: 0,
        });
        
        // Perform initial sync
        await this.performInitialSync(subscribedSite, siteId, siteName);
        
        // Set up health monitoring
        this.setupHealthMonitoring(siteId);
        
        if (this.onStatusUpdate) {
      this.onStatusUpdate(`✅ Subscription sync active: "${siteName || siteId}"`);
    }
        break;
        
      } catch (error) {
        this.logger?.warn(`Subscription setup attempt ${attempt} failed`, {
          siteId,
          siteName,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        
        if (attempt === maxRetries) {
          this.logger?.error('Failed to setup subscription after all retries', {
            siteId,
            siteName,
            maxRetries,
          });
          // Schedule retry in background
          setTimeout(() => this.retrySubscriptionSetup(subscription), 30000);
        } else {
          // Exponential backoff
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
  }

  private async openSubscribedSite(siteId: string, attempt: number, maxRetries: number): Promise<Site | null> {
    try {
      this.logger?.debug(`Opening subscription site (${attempt}/${maxRetries})`, { siteId });
      
      // Race against timeout with aggressive timeout reduction for faster feedback
      const timeoutMs = Math.max(5000, 15000 - (attempt * 2000));
      
      const subscribedSite = await Promise.race([
        this.client.open<Site>(siteId, { args: DEDICATED_SITE_ARGS }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Site open timeout')), timeoutMs)
        )
      ]) as Site;
      
      this.logger?.info('Subscription site opened successfully', {
        siteId,
        attempt,
        timeoutMs,
      });
      
      return subscribedSite;
      
    } catch (error) {
      this.logger?.debug('Failed to open subscription site', {
        siteId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async setupEventHandlers(subscribedSite: Site, siteId: string, siteName?: string): Promise<void> {
    // Check if event listener is already set up to prevent duplicates
    const existingListenerCount = subscribedSite.releases.events.listenerCount('change');
    if (existingListenerCount > 0) {
      this.logger?.debug('Event listener already exists for subscription', {
        siteId,
        siteName,
        existingListeners: existingListenerCount,
      });
      return;
    }
    
    // Set up immediate event handling - fully event-driven, no delays
    subscribedSite.releases.events.addEventListener('change', async (evt: any) => {
      const added = evt.detail.added || [];
      const removed = evt.detail.removed || [];
      
      // Skip processing if there's nothing to sync
      if (added.length === 0 && removed.length === 0) {
        return;
      }
      
      // Update last activity immediately
      const subscription = this.activeSubscriptions.get(siteId);
      if (subscription) {
        subscription.lastActivity = Date.now();
        subscription.reconnectAttempts = 0; // Reset on successful activity
      }
      
      this.logger?.info('Real-time subscription event', {
        siteId,
        siteName,
        addedCount: added.length,
        removedCount: removed.length,
        timestamp: Date.now(),
      });
      
      // Handle additions immediately - eventually consistent
      if (added.length > 0) {
        if (this.onStatusUpdate) {
      this.onStatusUpdate(`📥 ${added.length} new releases from "${siteName || siteId}" - syncing...`);
    }
        
        // Get subscription info to determine if recursive
        const subscription = await this.getSubscriptionBySiteId(siteId);
        const isRecursive = subscription && subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
        
        // Filter content based on subscription type
        const contentToSync = added.filter((release: any) => {
          if (isRecursive) {
            // Recursive: accept all content from this site
            return true;
          } else {
            // Non-recursive: only accept content that originated from this site
            return !release.federatedFrom;
          }
        });
        
        if (contentToSync.length === 0) {
          this.logger?.debug('No content to sync after filtering', {
            siteId,
            siteName,
            totalAdded: added.length,
            isRecursive,
          });
          return;
        }
        
        // Fire-and-forget for maximum speed, with error recovery
        this.handleContentAddition(contentToSync, siteId, siteName).catch(error => {
          this.logger?.warn('Content addition failed, will retry', {
            siteId,
            siteName,
            error: error instanceof Error ? error.message : String(error),
          });
          // Retry in background for eventual consistency
          setTimeout(() => {
            this.handleContentAddition(contentToSync, siteId, siteName).catch(() => {
              this.logger?.error('Content addition retry failed', { siteId, siteName });
            });
          }, 5000);
        });
      }
      
      // Handle removals immediately - eventually consistent
      if (removed.length > 0) {
        if (this.onStatusUpdate) {
      this.onStatusUpdate(`🗑️ ${removed.length} content removals from "${siteName || siteId}" - syncing...`);
    }
        // Fire-and-forget for maximum speed, with error recovery
        this.handleContentRemoval(removed, siteId, siteName).catch(error => {
          this.logger?.warn('Content removal failed, will retry', {
            siteId,
            siteName,
            error: error instanceof Error ? error.message : String(error),
          });
          // Retry in background for eventual consistency
          setTimeout(() => {
            this.handleContentRemoval(removed, siteId, siteName).catch(() => {
              this.logger?.error('Content removal retry failed', { siteId, siteName });
            });
          }, 5000);
        });
      }
    });
  }

  private async handleContentAddition(added: any[], siteId: string, siteName?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check if we should use federation index mode
      const useFederationIndex = this.localSite.federationIndex !== undefined;
      
      if (useFederationIndex) {
        // NEW: Insert lightweight pointers into federation index
        const indexPromises = added.map(async (release) => {
          try {
            // Skip if this is our own content coming back
            if (release.federatedFrom === this.localSite.address) {
              return false;
            }
            
            // Get the source site metadata
            const sourceSiteName = siteName || 'Unknown Site';
            
            // Extract metadata for the index entry
            const metadata = release[RELEASE_METADATA_PROPERTY] ? 
              (typeof release[RELEASE_METADATA_PROPERTY] === 'string' ? 
                JSON.parse(release[RELEASE_METADATA_PROPERTY]) : 
                release[RELEASE_METADATA_PROPERTY]) : {};
            
            // Create federation index entry
            const indexEntry = {
              contentCid: release[RELEASE_CONTENT_CID_PROPERTY],
              title: release[RELEASE_NAME_PROPERTY] || 'Untitled',
              sourceSiteId: release.federatedFrom || siteId,
              sourceSiteName: sourceSiteName,
              contentType: metadata.contentType || 'video', // Default to video
              categoryId: release[RELEASE_CATEGORY_ID_PROPERTY] || 'uncategorized',
              timestamp: Date.now(),
              description: metadata.description,
              thumbnailCid: release[RELEASE_THUMBNAIL_CID_PROPERTY],
              tags: metadata.tags || [],
            };
            
            // Insert into federation index
            await this.localSite.federationIndex!.insertContent(indexEntry);
            
            this.logger?.debug('Added to federation index', {
              title: indexEntry.title,
              contentCid: indexEntry.contentCid,
              sourceSiteId: indexEntry.sourceSiteId,
            });
            
            return true;
          } catch (error) {
            this.logger?.warn('Failed to add to federation index', {
              releaseId: release.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        });
        
        const results = await Promise.allSettled(indexPromises);
        const indexedCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const duration = Date.now() - startTime;
        
        if (indexedCount > 0) {
          if (this.onStatusUpdate) {
            this.onStatusUpdate(`📇 Indexed ${indexedCount}/${added.length} entries from "${siteName || siteId}" in ${duration}ms`);
          }
        }
        
        this.logger?.info('Federation index update completed', {
          siteId,
          siteName,
          totalAdded: added.length,
          indexedCount,
          duration,
        });
        
      } else {
        // LEGACY: Full release sync mode
        // Process additions in parallel for maximum speed
        const federationPromises = added.map(async (release) => {
          try {
            // Check for existing release by UUID first
            const existingRelease = await this.localSite.releases.index.get(release.id);
            
            if (existingRelease) {
              this.logger?.debug('Release already exists (same UUID), skipping', {
                releaseId: release.id,
                siteId,
                existingSource: existingRelease.federatedFrom,
              });
              return false;
            }
            
            // Check if this is our own content coming back (mutual sync protection)
            if (release.federatedFrom === this.localSite.address) {
              this.logger?.debug('Skipping our own federated content coming back', {
                releaseId: release.id,
                originalSource: release.federatedFrom,
                currentSource: siteId,
              });
              return false;
            }
            
            // For recursive sync: preserve the original source if it's already federated
            const originalSource = release.federatedFrom || siteId;
            
            // Prepare federated release with metadata
            const federatedRelease = new Release({
              ...release,
              federatedFrom: originalSource, // Preserve original source for recursive sync
              federatedAt: new Date().toISOString(),
              federatedRealtime: true,
            });
            
            // Try LensService first for UI consistency
            if (this.lensService && typeof this.lensService.addRelease === 'function') {
              const addResult = await this.lensService.addRelease(federatedRelease);
              if (addResult && addResult.success) {
                this.logger?.debug('Federated via LensService', {
                  releaseId: release.id,
                  title: release[RELEASE_NAME_PROPERTY] || 'Untitled',
                  siteId,
                });
                return true;
              }
            }
            
            // Fallback to direct Peerbit insertion for eventual consistency
            await this.localSite.releases.put(federatedRelease);
            this.logger?.debug('Federated via direct Peerbit', {
              releaseId: release.id,
              title: release[RELEASE_NAME_PROPERTY] || 'Untitled',
              siteId,
            });
            return true;
            
          } catch (releaseError) {
            this.logger?.warn('Failed to federate individual release', {
              releaseId: release.id,
              error: releaseError instanceof Error ? releaseError.message : String(releaseError),
            });
            return false;
          }
        });
        
        // Wait for all federation attempts to complete
        const results = await Promise.allSettled(federationPromises);
        const federatedCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const duration = Date.now() - startTime;
        
        if (federatedCount > 0) {
          if (this.onStatusUpdate) {
            this.onStatusUpdate(`✅ Federated ${federatedCount}/${added.length} releases from "${siteName || siteId}" in ${duration}ms`);
          }
        }
        
        this.logger?.info('Content addition completed', {
          siteId,
          siteName,
          totalAdded: added.length,
          federatedCount,
          duration,
          successRate: ((federatedCount / added.length) * 100).toFixed(1),
        });
      }
      
    } catch (error) {
      this.logger?.error('Federation batch error', {
        siteId,
        siteName,
        error: error instanceof Error ? error.stack : String(error),
        duration: Date.now() - startTime,
      });
      
      // Schedule recovery for failed operations
      this.scheduleSubscriptionRecovery(siteId);
    }
  }

  private async handleContentRemoval(removed: any[], siteId: string, siteName?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check if we should use federation index mode
      const useFederationIndex = this.localSite.federationIndex !== undefined;
      
      if (useFederationIndex) {
        // NEW: Remove from federation index
        const removePromises = removed.map(async (release) => {
          try {
            // Create the ID that would have been used in the index
            const indexId = `${release.federatedFrom || siteId}:${release[RELEASE_CONTENT_CID_PROPERTY]}`;
            await this.localSite.federationIndex!.removeContent(indexId);
            
            this.logger?.debug('Removed from federation index', {
              indexId,
              siteId,
            });
            
            return true;
          } catch (error) {
            this.logger?.warn('Failed to remove from federation index', {
              releaseId: release.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        });
        
        const results = await Promise.allSettled(removePromises);
        const removedCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const duration = Date.now() - startTime;
        
        if (removedCount > 0) {
          if (this.onStatusUpdate) {
            this.onStatusUpdate(`🧹 Removed ${removedCount} entries from index for "${siteName || siteId}" in ${duration}ms`);
          }
        }
        
        this.logger?.info('Federation index removal completed', {
          siteId,
          siteName,
          totalRemoved: removedCount,
          duration,
        });
        
      } else {
        // LEGACY: Full release removal mode
        // Process removals directly without pre-fetching all content
        const removedIds = new Set(removed.map((release: any) => release.id));
        let totalRemoved = 0;
        
        // Process in batches
        for (const removedId of removedIds) {
          try {
            // Check if this specific release exists and was federated from this site
            const existingRelease = await this.localSite.releases.index.get(removedId);
            
            if (existingRelease && existingRelease.federatedFrom === siteId) {
              // This is federated content from the site that needs removal
              if (this.lensService && typeof this.lensService.deleteRelease === 'function') {
                const deleteResult = await this.lensService.deleteRelease({ id: removedId });
                if (deleteResult && deleteResult.success) {
                  totalRemoved++;
                  this.logger?.debug('Removed via LensService', {
                    releaseId: removedId,
                    siteId,
                  });
                }
              } else {
                // Direct removal from Peerbit
                await this.localSite.releases.del(removedId);
                totalRemoved++;
                this.logger?.debug('Removed via direct Peerbit', {
                  releaseId: removedId,
                  siteId,
                });
              }
            }
          } catch (error) {
            this.logger?.warn('Failed to remove federated release', {
              releaseId: removedId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        
        const duration = Date.now() - startTime;
        
        if (totalRemoved > 0) {
          if (this.onStatusUpdate) {
            this.onStatusUpdate(`🧹 Cleaned ${totalRemoved} releases from "${siteName || siteId}" in ${duration}ms`);
          }
        }
        
        this.logger?.info('Content removal completed', {
          siteId,
          siteName,
          totalRemoved,
          checkedCount: removedIds.size,
          duration,
          successRate: removedIds.size > 0 ? ((totalRemoved / removedIds.size) * 100).toFixed(1) : '100',
        });
      }
      
    } catch (error) {
      this.logger?.error('Cleanup batch error', {
        siteId,
        siteName,
        error: error instanceof Error ? error.stack : String(error),
        duration: Date.now() - startTime,
      });
      
      // Schedule recovery for failed operations
      this.scheduleSubscriptionRecovery(siteId);
    }
  }

  private async performInitialSync(subscribedSite: Site, siteId: string, siteName?: string): Promise<void> {
    try {
      // Get subscription info to determine if recursive
      const subscription = await this.getSubscriptionBySiteId(siteId);
      const isRecursive = subscription && subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
      
      this.logger?.info('Performing initial sync', {
        siteId,
        siteName,
        isRecursive,
      });
      
      // Query intelligently based on subscription type
      let releasesToSync: any[] = [];
      
      if (isRecursive) {
        // Recursive: get all content from this site
        releasesToSync = await subscribedSite.releases.index.search(new SearchRequest({
          fetch: 1000
        }));
      } else {
        // Non-recursive: only get content that originated from this site
        // First, try to get content with no federatedFrom (original content)
        const originalContent = await subscribedSite.releases.index.search(new SearchRequest({
          fetch: 1000
        }));
        
        // Filter to only include content that originated from this site
        // For non-recursive: we want content where federatedFrom is null (original content)
        releasesToSync = originalContent.filter((release: any) => 
          !release.federatedFrom
        );
        
        this.logger?.debug('Filtered initial sync content', {
          siteId,
          siteName,
          totalContent: originalContent.length,
          filteredContent: releasesToSync.length,
        });
      }
      
      if (releasesToSync.length > 0) {
        const federatedCount = await this.federateNewContent(releasesToSync, siteId, siteName);
        if (federatedCount > 0) {
          if (this.onStatusUpdate) {
      this.onStatusUpdate(`📦 Initial sync: ${federatedCount} releases from "${siteName || siteId}"`);
    }
        }
      } else {
        this.logger?.debug('No content to sync during initial sync', {
          siteId,
          siteName,
          isRecursive,
        });
      }
    } catch (error) {
      this.logger?.warn('Initial sync failed', {
        siteId,
        siteName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async federateNewContent(newReleases: any[], siteId: string, siteName?: string): Promise<number> {
    this.logger?.info('Starting real-time content federation', {
      siteId,
      siteName,
      newReleasesCount: newReleases.length,
    });
    
    if (newReleases.length === 0) return 0;
    
    const BATCH_SIZE = 20;
    let totalFederated = 0;
    
    try {
      // Process in batches without pre-fetching all content
      for (let i = 0; i < newReleases.length; i += BATCH_SIZE) {
        const batch = newReleases.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (release) => {
          try {
            // Add federated metadata
            const federatedRelease = new Release({
              ...release,
              federatedFrom: siteId,
              federatedAt: new Date().toISOString(),
              federatedRealtime: true,
            });
            
            // Use LensService if available, otherwise fall back to direct insertion
            if (this.lensService && typeof this.lensService.addRelease === 'function') {
              const addResult = await this.lensService.addRelease(federatedRelease);
              if (addResult && addResult.success) {
                return true;
              } else if (addResult && !addResult.success && addResult.error?.includes('already exists')) {
                // Duplicate - that's fine
                return false;
              }
            } else {
              await this.localSite.releases.put(federatedRelease);
              return true;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
              // Duplicate - expected in concurrent scenarios
              return false;
            }
            this.logger?.warn('Failed to federate release', {
              releaseId: release.id,
              error: errorMsg,
            });
            return false;
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        const batchFederated = batchResults.filter(r => r.status === 'fulfilled' && r.value).length;
        totalFederated += batchFederated;
        
        if (batchFederated > 0) {
          this.logger?.debug('Batch federation progress', {
            batchStart: i,
            batchSize: batch.length,
            federated: batchFederated,
            totalProgress: `${i + batch.length}/${newReleases.length}`,
          });
        }
      }
      
      return totalFederated;
    } catch (error) {
      this.logger?.error('Federation batch failed', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
        federatedSoFar: totalFederated,
      });
      return totalFederated;
    }
  }

  private setupHealthMonitoring(siteId: string): void {
    const subscription = this.activeSubscriptions.get(siteId);
    if (!subscription) return;
    
    // Health check every 30 seconds
    subscription.healthCheckInterval = setInterval(() => {
      this.performHealthCheck(siteId);
    }, 30000);
  }

  private async performHealthCheck(siteId: string): Promise<void> {
    const subscription = this.activeSubscriptions.get(siteId);
    if (!subscription || !subscription.site) return;
    
    const timeSinceActivity = Date.now() - subscription.lastActivity;
    const maxIdleTime = 5 * 60 * 1000; // 5 minutes
    
    // Check for inactivity
    if (timeSinceActivity > maxIdleTime) {
      this.logger?.warn('Subscription appears inactive, scheduling recovery', {
        siteId,
        siteName: subscription.siteName,
        timeSinceActivity,
        maxIdleTime,
      });
      this.scheduleSubscriptionRecovery(siteId);
    }
  }

  private scheduleSubscriptionRecovery(siteId: string): void {
    const subscription = this.activeSubscriptions.get(siteId);
    if (!subscription) return;
    
    subscription.reconnectAttempts++;
    
    // Exponential backoff for recovery attempts
    const backoffTime = Math.min(1000 * Math.pow(2, subscription.reconnectAttempts - 1), 60000);
    
    this.logger?.info('Scheduling subscription recovery', {
      siteId,
      siteName: subscription.siteName,
      attempt: subscription.reconnectAttempts,
      backoffTime,
    });
    
    setTimeout(async () => {
      try {
        await this.recoverSubscription(siteId);
      } catch (error) {
        this.logger?.error('Subscription recovery failed', {
          siteId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, backoffTime);
  }

  private async recoverSubscription(siteId: string): Promise<void> {
    const subscription = this.activeSubscriptions.get(siteId);
    if (!subscription) return;
    
    this.logger?.info('Attempting subscription recovery', {
      siteId,
      siteName: subscription.siteName,
      attempt: subscription.reconnectAttempts,
    });
    
    try {
      // Close old connection
      await subscription.site.close().catch(() => {});
      
      // Clear health check
      if (subscription.healthCheckInterval) {
        clearInterval(subscription.healthCheckInterval);
      }
      
      // Remove from active subscriptions
      this.activeSubscriptions.delete(siteId);
      
      // Retry setup
      const subscriptionData: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: siteId,
        [SUBSCRIPTION_NAME_PROPERTY]: subscription.siteName,
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [],
      };
      
      await this.setupSingleSubscription(subscriptionData);
      
    } catch (error) {
      this.logger?.error('Subscription recovery failed', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async retrySubscriptionSetup(subscription: SubscriptionData): Promise<void> {
    this.logger?.info('Retrying subscription setup in background', {
      siteId: subscription[SUBSCRIPTION_SITE_ID_PROPERTY],
    });
    
    await this.setupSingleSubscription(subscription);
  }

  // Get an already-open site if available
  getOpenSite(siteId: string): Site | undefined {
    const subscription = this.activeSubscriptions.get(siteId);
    return subscription?.site;
  }
  
  // Get subscription data by site ID
  private async getSubscriptionBySiteId(siteId: string): Promise<SubscriptionData | null> {
    try {
      const allSubscriptions = await this.localSite.subscriptions.index.search(new SearchRequest({
        fetch: 1000
      }));
      
      return allSubscriptions.find(sub => 
        sub[SUBSCRIPTION_SITE_ID_PROPERTY] === siteId
      ) || null;
    } catch (error) {
      this.logger?.warn('Failed to get subscription by site ID', {
        siteId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async removeSubscription(subscriptionId: string): Promise<void> {
    this.logger?.info('Removing subscription from sync manager', { subscriptionId });
    
    // Find the subscription by ID in the local site
    try {
      const subscription = await this.localSite.subscriptions.index.get(subscriptionId);
      if (subscription) {
        const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
        const activeSubscription = this.activeSubscriptions.get(siteId);
        
        if (activeSubscription) {
          // Clear health check interval
          if (activeSubscription.healthCheckInterval) {
            clearInterval(activeSubscription.healthCheckInterval);
          }
          
          // Close the site connection
          try {
            await activeSubscription.site.close();
          } catch (error) {
            this.logger?.debug('Error closing site during subscription removal', { siteId });
          }
          
          // Remove from active subscriptions
          this.activeSubscriptions.delete(siteId);
          
          this.logger?.info('Subscription removed from sync', { 
            subscriptionId, 
            siteId,
            siteName: activeSubscription.siteName 
          });
          
          if (this.onStatusUpdate) {
      this.onStatusUpdate(`❌ Stopped sync for "${activeSubscription.siteName || siteId}"`);
    }
        }
      }
    } catch (error) {
      this.logger?.warn('Error removing subscription from sync manager', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async shutdown(): Promise<void> {
    this.logger?.info('Shutting down subscription sync manager');
    
    const shutdownPromises = Array.from(this.activeSubscriptions.entries()).map(async ([siteId, subscription]) => {
      try {
        if (subscription.healthCheckInterval) {
          clearInterval(subscription.healthCheckInterval);
        }
        await subscription.site.close();
      } catch (error) {
        this.logger?.debug('Error closing subscription during shutdown', { siteId });
      }
    });
    
    await Promise.allSettled(shutdownPromises);
    this.activeSubscriptions.clear();
  }
}