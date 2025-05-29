import { Peerbit } from 'peerbit';
import { PerSiteFederationIndex, IndexableFederationEntry } from './per-site-federation-index';
import { Subscription, Site } from './schema';
import { Documents, SearchRequest } from '@peerbit/document';
import { Program } from '@peerbit/program';
import { field, variant, vec } from '@dao-xyz/borsh';
import { v4 as uuid } from 'uuid';
import { SUBSCRIPTION_RECURSIVE_PROPERTY, SUBSCRIPTION_SITE_ID_PROPERTY } from './constants';

/**
 * Sync claim for coordination document
 */
@variant('sync_claim')
export class SyncClaim {
  @field({ type: 'string' })
  claimId: string; // Unique ID for this claim
  
  @field({ type: 'string' })
  siteId: string; // Site being synced from
  
  @field({ type: 'string' })
  nodeId: string; // Node doing the syncing
  
  @field({ type: 'u64' })
  timestamp: bigint; // When claimed (for staleness detection)
  
  @field({ type: 'bool' })
  recursive: boolean; // Whether this is a recursive sync
  
  constructor(props: {
    siteId: string;
    nodeId: string;
    timestamp: bigint;
    recursive: boolean;
  }) {
    this.claimId = uuid();
    this.siteId = props.siteId;
    this.nodeId = props.nodeId;
    this.timestamp = props.timestamp;
    this.recursive = props.recursive;
  }
}

/**
 * Coordination document for a lens - shared by all nodes replicating this lens
 */
@variant('lens_coordination')
export class LensCoordinationDoc {
  @field({ type: 'string' })
  docId: string; // Document ID
  
  @field({ type: 'string' })
  lensId: string;
  
  @field({ type: vec(SyncClaim) })
  claims: SyncClaim[]; // Array of claims instead of Map
  
  constructor(lensId: string) {
    this.docId = uuid();
    this.lensId = lensId;
    this.claims = [];
  }
  
  // Helper methods to work with claims like a map
  getClaim(siteId: string): SyncClaim | undefined {
    return this.claims.find(c => c.siteId === siteId);
  }
  
  setClaim(claim: SyncClaim): void {
    const index = this.claims.findIndex(c => c.siteId === claim.siteId);
    if (index >= 0) {
      this.claims[index] = claim;
    } else {
      this.claims.push(claim);
    }
  }
  
  deleteClaim(siteId: string): void {
    this.claims = this.claims.filter(c => c.siteId !== siteId);
  }
}

/**
 * Coordination store wrapper for per-lens federation
 */
@variant('lens_coordination_store')
export class LensCoordinationStore extends Program {
  @field({ type: Documents })
  docs: Documents<LensCoordinationDoc>;
  
  constructor() {
    super();
    this.docs = new Documents<LensCoordinationDoc>();
  }
  
  async open(): Promise<void> {
    await this.docs.open({
      type: LensCoordinationDoc,
      replicate: true,
      canPerform: () => true,
      index: {
        canRead: () => true,
        idProperty: 'docId' // Tell indexer which field is the ID
      }
    });
  }
}

/**
 * Per-lens federation sync using a coordination Document
 * 
 * Each lens has ONE coordination document shared by:
 * - The lens node itself
 * - Dedicated replicator nodes for THIS lens
 */
export class PerLensFederationSync {
  private peer: Peerbit;
  private lensId: string;
  private nodeId: string;
  private myFederationIndex: PerSiteFederationIndex;
  private subscriptions: Documents<Subscription>;
  private coordinationDoc: LensCoordinationDoc;
  private coordinationStore: LensCoordinationStore;
  
  private activeWatchers: Map<string, {
    sourceFedIndex: PerSiteFederationIndex;
    unsubscribe?: () => void;
  }> = new Map();
  
  // Cache of opened source sites to avoid duplicates
  private sourceSiteCache: Map<string, Site> = new Map();
  
  private coordinationInterval?: NodeJS.Timeout;
  
  constructor(
    peer: Peerbit,
    lensId: string,
    nodeId: string,
    federationIndex: PerSiteFederationIndex,
    subscriptions: Documents<Subscription>,
    coordinationStore: LensCoordinationStore
  ) {
    this.peer = peer;
    this.lensId = lensId;
    this.nodeId = nodeId;
    this.myFederationIndex = federationIndex;
    this.subscriptions = subscriptions;
    this.coordinationStore = coordinationStore;
    this.coordinationDoc = new LensCoordinationDoc(lensId);
  }
  
  /**
   * Start participating in federation sync for this lens
   */
  async start(): Promise<void> {
    console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Starting federation sync`);
    
    // Try to get existing coordination doc
    const existingDocs = await this.coordinationStore.docs.index.search(new SearchRequest());
    if (existingDocs.length > 0) {
      this.coordinationDoc = (existingDocs[0] as any).value || existingDocs[0];
    } else {
      // Create new coordination doc
      await this.coordinationStore.docs.put(this.coordinationDoc);
    }
    
    // Start coordination loop immediately
    await this.coordinateSync();
    
    // Set up periodic coordination (every 10 seconds for faster updates)
    this.coordinationInterval = setInterval(async () => {
      await this.coordinateSync();
    }, 10000);
  }
  
  /**
   * Coordinate with other nodes replicating this lens using coordination Document
   */
  private async coordinateSync(): Promise<void> {
    try {
      // Get all current subscriptions for this lens
      const subs = await this.subscriptions.index.search(new SearchRequest());
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Found ${subs.length} subscriptions`);
      
      // Build desired state
      const desiredSites = new Map<string, boolean>();
      for (const sub of subs) {
        const subscription = (sub as any).value || sub;
        desiredSites.set(subscription[SUBSCRIPTION_SITE_ID_PROPERTY], subscription[SUBSCRIPTION_RECURSIVE_PROPERTY]);
        console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Subscription: ${subscription[SUBSCRIPTION_SITE_ID_PROPERTY]} (recursive: ${subscription[SUBSCRIPTION_RECURSIVE_PROPERTY]})`);
      }
      
      // Get latest coordination doc
      const docs = await this.coordinationStore.docs.index.search(new SearchRequest());
      if (docs.length > 0) {
        this.coordinationDoc = (docs[0] as any).value || docs[0];
      }
      
      const now = BigInt(Date.now());
      const currentlySyncing = new Set(this.activeWatchers.keys());
      const shouldSync = new Set<string>();
      
      // Check each desired site
      for (const [siteId] of desiredSites) {
        const claim = this.coordinationDoc.getClaim(siteId);
        
        if (!claim || claim.nodeId === this.nodeId) {
          // We own it or it's unclaimed
          shouldSync.add(siteId);
        } else if (now - claim.timestamp > 120000n) {
          // Claim is stale (2 minutes old), take it over
          shouldSync.add(siteId);
        }
      }
      
      // Update claims in coordination doc
      let docUpdated = false;
      
      // Remove our old claims that we're not syncing anymore
      for (const claim of this.coordinationDoc.claims) {
        if (claim.nodeId === this.nodeId && !shouldSync.has(claim.siteId)) {
          this.coordinationDoc.deleteClaim(claim.siteId);
          docUpdated = true;
        }
      }
      
      // Add/update our new claims
      for (const siteId of shouldSync) {
        const recursive = desiredSites.get(siteId) || false;
        const existingClaim = this.coordinationDoc.getClaim(siteId);
        
        if (!existingClaim || existingClaim.nodeId !== this.nodeId || now - existingClaim.timestamp > 30000n) {
          this.coordinationDoc.setClaim(new SyncClaim({
            siteId,
            nodeId: this.nodeId,
            timestamp: now,
            recursive
          }));
          docUpdated = true;
        }
      }
      
      // Update the document if changed
      if (docUpdated) {
        await this.coordinationStore.docs.put(this.coordinationDoc);
      }
      
      // Stop syncing sites we're no longer responsible for
      for (const siteId of currentlySyncing) {
        if (!shouldSync.has(siteId)) {
          console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Releasing sync for ${siteId}`);
          await this.stopSyncingFromSite(siteId);
        }
      }
      
      // Start syncing new sites in parallel
      const syncPromises = [];
      for (const siteId of shouldSync) {
        if (!currentlySyncing.has(siteId)) {
          const recursive = desiredSites.get(siteId) || false;
          console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Taking sync for ${siteId} (recursive: ${recursive})`);
          syncPromises.push(this.syncFromSite(siteId, recursive));
        }
      }
      
      // Wait for all syncs to start
      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
      }
      
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Currently syncing ${this.activeWatchers.size} sites`);
    } catch (error) {
      console.error(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Error in coordinateSync:`, error);
    }
  }
  
  /**
   * Sync from a specific site
   */
  private async syncFromSite(sourceSiteId: string, recursive: boolean): Promise<void> {
    // Don't sync from ourselves
    if (sourceSiteId === this.lensId) {
      return;
    }
    
    try {
      // Check cache first
      let sourceSite = this.sourceSiteCache.get(sourceSiteId);
      let sourceFedIndex: PerSiteFederationIndex;
      
      if (!sourceSite) {
        // Open the existing source site (don't create a new one)
        console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Opening existing site: ${sourceSiteId}`);
        sourceSite = await this.peer.open<Site>(
          sourceSiteId,  // Just pass the address string to open existing
          {
            args: {
              releasesArgs: { replicate: false },
              featuredReleasesArgs: { replicate: false },
              contentCategoriesArgs: { replicate: false },
              subscriptionsArgs: { replicate: false },
              blockedContentArgs: { replicate: false },
              membersArg: { replicate: false },
              administratorsArgs: { replicate: false },
              federationIndexArgs: { replicate: true }  // Only replicate federation index
            }
          }
        );
        
        // Cache it
        this.sourceSiteCache.set(sourceSiteId, sourceSite);
        console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Opened site ${sourceSiteId}`);
      } else {
        console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Reusing cached site for ${sourceSiteId}`);
      }
      
      sourceFedIndex = sourceSite.federationIndex;
      
      if (!sourceFedIndex) {
        console.error(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Site ${sourceSiteId} has no federation index!`);
        return;
      }
      
      // No delay - federation index should be ready
      
      // Initial sync of existing entries
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Getting entries from federation index at ${sourceFedIndex.address}`);
      const existingEntries = await sourceFedIndex.getAllEntries();
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Federation index ${sourceFedIndex.address} returned ${existingEntries.length} entries`);
      let syncedCount = 0;
      
      for (const entry of existingEntries) {
        try {
          // Check recursive setting
          if (!recursive && entry.sourceSiteId !== sourceSiteId) {
            continue;
          }
          
          // Create entry for our lens
          const ourEntry = new IndexableFederationEntry({
            ...entry,
            id: `${this.lensId}:${entry.contentCID}`,
          });
          
          await this.myFederationIndex.insertContent(ourEntry);
          syncedCount++;
        } catch (error) {
          // Likely a duplicate, ignore
        }
      }
      
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Initial sync from ${sourceSiteId}: ${syncedCount} entries`);
      
      // Set up real-time sync
      const handleChange = async (event: any) => {
        const change = event.detail;
        if (change?.type === 'put') {
          const entry = change.value;
          if (entry) {
            try {
              if (!recursive && entry.sourceSiteId !== sourceSiteId) {
                return;
              }
              
              const ourEntry = new IndexableFederationEntry({
                ...entry,
                id: `${this.lensId}:${entry.contentCID}`,
              });
              
              await this.myFederationIndex.insertContent(ourEntry);
              console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Synced: ${entry.title} from ${sourceSiteId}`);
            } catch (error) {
              // Ignore errors (likely duplicates)
            }
          }
        }
      };
      
      sourceFedIndex.events.addEventListener('change' as any, handleChange);
      
      // Store the watcher
      this.activeWatchers.set(sourceSiteId, {
        sourceFedIndex,
        unsubscribe: () => {
          sourceFedIndex.events.removeEventListener('change' as any, handleChange);
        }
      });
      
    } catch (error) {
      console.error(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Error syncing from ${sourceSiteId}:`, error);
    }
  }
  
  /**
   * Stop syncing from a specific site
   */
  private async stopSyncingFromSite(sourceSiteId: string): Promise<void> {
    const watcher = this.activeWatchers.get(sourceSiteId);
    if (watcher) {
      if (watcher.unsubscribe) {
        watcher.unsubscribe();
      }
      
      // Note: We don't close the site here as it might be used by other watchers
      // The site will be closed when the peer stops
      
      this.activeWatchers.delete(sourceSiteId);
      console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Stopped syncing from ${sourceSiteId}`);
    }
  }
  
  /**
   * Stop all syncing
   */
  async stop(): Promise<void> {
    console.log(`[PerLensFedSync ${this.lensId}/${this.nodeId}] Stopping federation sync`);
    
    if (this.coordinationInterval) {
      clearInterval(this.coordinationInterval);
    }
    
    // TODO: Release claims in coordination string once we implement it
    
    // Stop all watchers
    for (const [siteId] of this.activeWatchers) {
      await this.stopSyncingFromSite(siteId);
    }
  }
  
  /**
   * Get current sync statistics
   */
  getStats(): {
    lensId: string;
    nodeId: string;
    syncingFrom: string[];
    totalWatchers: number;
  } {
    return {
      lensId: this.lensId,
      nodeId: this.nodeId,
      syncingFrom: Array.from(this.activeWatchers.keys()),
      totalWatchers: this.activeWatchers.size
    };
  }
}

// Helper to create the per-lens coordination store
export async function createLensCoordinationStore(
  peer: Peerbit,
  _lensId: string
): Promise<LensCoordinationStore> {
  try {
    console.log('[createLensCoordinationStore] Creating coordination store...');
    
    // Create and open the coordination store wrapper
    const coordinationStore = await peer.open(new LensCoordinationStore(), {
      args: {
        replicate: true
      }
    });
    
    console.log('[createLensCoordinationStore] Coordination store created successfully');
    
    return coordinationStore;
  } catch (error) {
    console.error('[createLensCoordinationStore] Error:', error);
    throw error;
  }
}