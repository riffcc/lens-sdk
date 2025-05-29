import { describe, test, expect, afterAll } from '@jest/globals';
import { PerLensFederationSync, createLensCoordinationStore } from '../src/per-lens-federation-sync';
import { 
  Site, 
  LensService,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  ADMIN_SITE_ARGS,
} from '../src/index';
import { Peerbit } from 'peerbit';
import { delay } from './utils';
import { SearchRequest } from '@peerbit/document';

describe('Per-Lens Federation Simple', () => {
  let peers: Peerbit[] = [];
  let services: LensService[] = [];
  let syncManagers: PerLensFederationSync[] = [];

  const createPeer = async (): Promise<{ peer: Peerbit; service: LensService }> => {
    const peer = await Peerbit.create();
    const service = new LensService(peer);
    peers.push(peer);
    services.push(service);
    return { peer, service };
  };
  
  afterEach(async () => {
    // Stop sync managers
    await Promise.all(syncManagers.map(sm => sm.stop()));
    syncManagers = [];
    
    // Close all sites through services
    for (const service of services) {
      try {
        await service.closeSite();
      } catch (e) {
        // Ignore
      }
    }
    
    // Stop all services
    for (const service of services) {
      try {
        await service.stop();
      } catch (e) {
        // Ignore
      }
    }
    
    // Stop all peers
    for (const peer of peers) {
      try {
        await peer.stop();
      } catch (e) {
        // Ignore
      }
    }
    
    // Clear arrays
    peers = [];
    services = [];
  }, 30000);

  test('Basic per-lens federation between 3 sites', async () => {
    console.log('\n=== SIMPLE PER-LENS FEDERATION TEST ===\n');
    
    const startTime = Date.now();
    
    // Create 3 peers
    const { peer: peer1, service: service1 } = await createPeer();
    const { peer: peer2, service: service2 } = await createPeer();
    const { peer: peer3, service: service3 } = await createPeer();
    
    // Connect peers in mesh
    await peer2.dial(peer1.getMultiaddrs());
    await peer3.dial(peer1.getMultiaddrs());
    await peer3.dial(peer2.getMultiaddrs());
    
    console.log('✓ Peers connected');
    
    // Create sites
    const site1 = new Site(peer1.identity.publicKey);
    const site2 = new Site(peer2.identity.publicKey);
    const site3 = new Site(peer3.identity.publicKey);
    
    await service1.openSite(site1, ADMIN_SITE_ARGS);
    await service2.openSite(site2, ADMIN_SITE_ARGS);
    await service3.openSite(site3, ADMIN_SITE_ARGS);
    
    const site1Id = await service1.getSiteId();
    const site2Id = await service2.getSiteId();
    const site3Id = await service3.getSiteId();
    
    console.log(`✓ Created 3 sites: ${site1Id.slice(0, 8)}, ${site2Id.slice(0, 8)}, ${site3Id.slice(0, 8)}`);
    
    // Add content to site1 and site2
    await service1.addRelease({
      name: 'Site 1 Content',
      categoryId: 'test',
      contentCID: 'Qm1-content',
      thumbnailCID: 'Qm1-thumb'
    });
    
    await service2.addRelease({
      name: 'Site 2 Content',
      categoryId: 'test',
      contentCID: 'Qm2-content',
      thumbnailCID: 'Qm2-thumb'
    });
    
    console.log('✓ Added content to source sites');
    
    // Site3 follows site1 and site2
    await service3.addSubscription({
      [SUBSCRIPTION_SITE_ID_PROPERTY]: site1Id,
      [SUBSCRIPTION_NAME_PROPERTY]: 'Follow Site 1',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'content',
      currentDepth: 0,
      followChain: [site3Id]
    });
    
    await service3.addSubscription({
      [SUBSCRIPTION_SITE_ID_PROPERTY]: site2Id,
      [SUBSCRIPTION_NAME_PROPERTY]: 'Follow Site 2',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'content',
      currentDepth: 0,
      followChain: [site3Id]
    });
    
    console.log('✓ Site 3 now follows sites 1 and 2');
    
    // Wait for subscriptions to be indexed
    await delay(1000);
    
    // Start federation sync for site3
    const site3Program = service3.siteProgram!;
    const coordinationStore = await createLensCoordinationStore(peer3, site3Id);
    
    const syncManager = new PerLensFederationSync(
      peer3,
      site3Id,
      'site3-node',
      site3Program.federationIndex!,
      site3Program.subscriptions,
      coordinationStore
    );
    
    syncManagers.push(syncManager);
    await syncManager.start();
    
    console.log('✓ Started federation sync for site 3');
    
    // Wait for federation to complete
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    let federatedEntries = 0;
    
    while (attempts < maxAttempts) {
      const entries = await site3Program.federationIndex!.getAllEntries();
      federatedEntries = entries.length;
      
      if (federatedEntries >= 2) { // Expecting 2 entries from the 2 source sites
        console.log(`✓ Federation completed: ${federatedEntries} entries synced`);
        break;
      }
      
      console.log(`Waiting for federation... (${federatedEntries}/2 entries, attempt ${attempts + 1}/${maxAttempts})`);
      await delay(1000);
      attempts++;
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`\n✓ TEST COMPLETED IN ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
    
    // Verify results
    const finalEntries = await site3Program.federationIndex!.getAllEntries();
    console.log(`Final federation index contains ${finalEntries.length} entries`);
    
    for (const entry of finalEntries) {
      console.log(`- ${entry.title} (from ${entry.sourceSiteId.slice(0, 8)})`);
    }
    
    // Assertions
    expect(finalEntries.length).toBeGreaterThan(0);
    expect(totalTime).toBeLessThan(60000); // Should complete within 60 seconds
    
    // Get sync stats
    const stats = syncManager.getStats();
    console.log(`\nSync stats: syncing from ${stats.syncingFrom.length} sites`);
    
  }, 120000); // 2 minute timeout
});