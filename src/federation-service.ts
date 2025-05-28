import { SubscriptionSyncManager, SyncOptions } from './sync';
import { DirectSubSyncManager, DirectSubSyncOptions } from './sync-directsub';
// import { DocumentsSyncManager, DocumentsSyncOptions } from './sync-documents';
import { ReplicationSyncManager, ReplicationSyncOptions } from './sync-replication';
// import { ScalableSyncManager, ScalableSyncOptions } from './sync-scalable';
import type { Peerbit } from 'peerbit';
import type { Site } from './schema';
import type { SubscriptionData } from './types';
import { 
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
} from './constants';

// Type for DocumentsSyncOptions since we're commenting out the import
type DocumentsSyncOptions = any;

export class FederationService {
  syncManager: SubscriptionSyncManager | DirectSubSyncManager | ReplicationSyncManager | null = null;

  constructor(
    private client: Peerbit,
    private siteProgram: Site,
    private syncOptions?: SyncOptions & DirectSubSyncOptions & DocumentsSyncOptions & ReplicationSyncOptions
  ) {}

  async initializeSync(): Promise<void> {
    if (!this.syncManager) {
      if (this.syncOptions?.mode === 'directsub') {
        this.syncManager = new DirectSubSyncManager(
          this.client,
          this.siteProgram,
          undefined,
          this.syncOptions
        );
        await this.syncManager.initialize();
      } else if (this.syncOptions?.mode === 'documents') {
        // DocumentsSyncManager is currently disabled
        throw new Error('Documents sync mode is not currently available');
      } else if (this.syncOptions?.mode === 'replication') {
        this.syncManager = new ReplicationSyncManager(
          this.client,
          this.siteProgram,
          undefined,
          this.syncOptions
        );
        await this.syncManager.initialize();
      } else {
        this.syncManager = new SubscriptionSyncManager(
          this.client,
          this.siteProgram,
          undefined,
          this.syncOptions
        );
      }
    }
  }
  
  async initializeForPublishing(): Promise<void> {
    // For DirectSub mode, we need to initialize even without subscriptions
    // so that we can publish updates
    if (this.syncOptions?.mode === 'directsub' && !this.syncManager) {
      this.syncManager = new DirectSubSyncManager(
        this.client,
        this.siteProgram,
        undefined,
        this.syncOptions
      );
      await this.syncManager!.initialize();
    }
  }

  async setupSubscriptionSync(subscriptions: SubscriptionData[]): Promise<void> {
    await this.initializeSync();
    if (this.syncManager) {
      if (this.syncManager instanceof DirectSubSyncManager || 
          this.syncManager instanceof ReplicationSyncManager) {
        // These managers handle subscriptions individually
        for (const subscription of subscriptions) {
          const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
          const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
          const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
          await this.syncManager.subscribeToSite(siteId, siteName, isRecursive);
        }
      } else {
        // SubscriptionSyncManager uses setupSubscriptionSync
        await (this.syncManager as SubscriptionSyncManager).setupSubscriptionSync(subscriptions);
      }
    }
  }

  async addSubscriptionToSync(subscription: SubscriptionData): Promise<void> {
    await this.initializeSync();
    if (this.syncManager) {
      if (this.syncManager instanceof DirectSubSyncManager || 
          this.syncManager instanceof ReplicationSyncManager) {
        const siteId = subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
        const siteName = subscription[SUBSCRIPTION_NAME_PROPERTY];
        const isRecursive = subscription[SUBSCRIPTION_RECURSIVE_PROPERTY];
        await this.syncManager.subscribeToSite(siteId, siteName, isRecursive);
      } else {
        await (this.syncManager as SubscriptionSyncManager).setupSubscriptionSync([subscription]);
      }
    }
  }

  async removeSubscriptionFromSync(_subscriptionId: string): Promise<void> {
    // Note: UnifiedSyncManager doesn't have direct removeSubscription method
    // Will be handled when subscription is deleted from the store
  }

  async shutdown(): Promise<void> {
    if (this.syncManager) {
      await this.syncManager.shutdown();
      this.syncManager = null;
    }
  }

  isInitialized(): boolean {
    return this.syncManager !== null;
  }
}