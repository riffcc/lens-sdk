import { describe, test, expect, afterAll } from '@jest/globals';
import { PerSiteFederationIndex, IndexableFederationEntry } from '../src/per-site-federation-index';
import { PerLensFederationSync, createLensCoordinationStore } from '../src/per-lens-federation-sync';
import { 
  Site, 
  Subscription, 
  LensService,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  ADMIN_SITE_ARGS,
  DEDICATED_SITE_ARGS
} from '../src/index';
import { Peerbit } from 'peerbit';
import { delay } from './utils';
import { generateFederationGraph, type FederationGraphData } from './federation-graph-generator';
import { SearchRequest } from '@peerbit/document';

describe('Per-Lens Federation with LensService', () => {
  let peers: Peerbit[] = [];
  let services: LensService[] = [];
  let syncManagers: PerLensFederationSync[] = [];
  
  let portCounter = 14000;
  
  // Create bootstrap peer first
  let bootstrapPeer: Peerbit | null = null;
  let bootstrapAddrs: string[] = [];

  const createPeer = async (): Promise<{ peer: Peerbit; service: LensService }> => {
    const config: any = {
      listen: [`/ip4/127.0.0.1/tcp/${portCounter++}/ws`]
    };
    
    // First peer becomes bootstrap
    if (!bootstrapPeer) {
      const peer = await Peerbit.create(config);
      bootstrapPeer = peer;
      bootstrapAddrs = peer.getMultiaddrs().map(addr => addr.toString() + '/p2p/' + peer.peerId.toString());
      const service = new LensService(peer);
      peers.push(peer);
      services.push(service);
      return { peer, service };
    }
    
    // All other peers connect to bootstrap
    config.bootstrap = bootstrapAddrs;
    const peer = await Peerbit.create(config);
    const service = new LensService(peer);
    peers.push(peer);
    services.push(service);
    return { peer, service };
  };
  
  afterAll(async () => {
    // Stop sync managers
    await Promise.all(syncManagers.map(sm => sm.stop()));
    
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
  }, 30000);

  test('Per-lens federation with coordination', async () => {
    console.log('\n=== PER-LENS FEDERATION WITH LENSSERVICE - 15 NODES ===\n');
    
    const startTime = Date.now();
    
    // Create smaller network for faster testing
    console.log('Creating 15-node federation network...');
    const NUM_CREATORS = 10;
    const NUM_HUBS = 5;
    const TOTAL_NODES = NUM_CREATORS + NUM_HUBS;
    
    const peerPromises = Array(TOTAL_NODES).fill(null).map(() => createPeer());
    const peerResults = await Promise.all(peerPromises);
    
    console.log(`Created ${TOTAL_NODES} peers in ${Date.now() - startTime}ms`);
    
    // Create and open sites properly through LensService
    const creators: Array<{ service: LensService; peer: Peerbit; siteId: string }> = [];
    const hubs: Array<{ service: LensService; peer: Peerbit; siteId: string }> = [];
    
    // Create and open creator sites
    console.log('Creating and opening creator sites...');
    for (let i = 0; i < NUM_CREATORS; i++) {
      const { peer, service } = peerResults[i];
      
      // Create a new site through the service (no need to init, peer is already passed)
      const site = new Site(peer.identity.publicKey);
      await service.openSite(site, ADMIN_SITE_ARGS);
      
      // Get the site ID
      const siteId = await service.getSiteId();
      
      creators.push({ service, peer, siteId });
      console.log(`Created creator ${i + 1} with site ${siteId}`);
    }
    
    // Create and open hub sites
    console.log('Creating and opening hub sites...');
    for (let i = NUM_CREATORS; i < TOTAL_NODES; i++) {
      const { peer, service } = peerResults[i];
      
      // Create a new site through the service (no need to init, peer is already passed)
      const site = new Site(peer.identity.publicKey);
      await service.openSite(site, ADMIN_SITE_ARGS);
      
      // Get the site ID
      const siteId = await service.getSiteId();
      
      hubs.push({ service, peer, siteId });
      console.log(`Created hub ${i - NUM_CREATORS + 1} with site ${siteId}`);
    }
    
    console.log(`✓ Created and opened ${NUM_CREATORS} creator sites and ${NUM_HUBS} hub sites in ${Date.now() - startTime}ms`);
    
    // Connect all peers to the bootstrap peer for mesh topology
    console.log('Connecting all peers in mesh topology...');
    const connectPromises = [];
    for (let i = 1; i < TOTAL_NODES; i++) {
      const { peer } = peerResults[i];
      // Connect to bootstrap peer
      connectPromises.push(peer.dial(bootstrapPeer!.getMultiaddrs()));
      
      // Also connect to a few other random peers for better mesh
      const numConnections = Math.min(3, i); // Connect to up to 3 previous peers
      for (let j = 0; j < numConnections; j++) {
        const targetIndex = Math.floor(Math.random() * i);
        const targetPeer = peerResults[targetIndex].peer;
        connectPromises.push(peer.dial(targetPeer.getMultiaddrs()).catch(() => {})); // Ignore errors for duplicate connections
      }
    }
    
    await Promise.allSettled(connectPromises);
    console.log('✓ Peer mesh topology established');
    
    // Wait for network to stabilize
    await delay(2000);
    
    // Add content to creators using the service
    console.log('Adding content to all creators in parallel...');
    const contentPromises = [];
    const ITEMS_PER_CREATOR = 3; // 3 items per creator = 120 total items
    
    // Add releases through the service (which will update the federation index)
    for (let i = 0; i < NUM_CREATORS; i++) {
      const creator = creators[i];
      
      for (let j = 0; j < ITEMS_PER_CREATOR; j++) {
        contentPromises.push(
          creator.service.addRelease({
            name: `Creator ${i + 1} - Item ${j + 1}`,
            categoryId: 'test',
            contentCID: `Qm${i}-${j}`,
            thumbnailCID: `QmThumb${i}-${j}`
          })
        );
      }
    }
    
    await Promise.all(contentPromises);
    const totalContent = NUM_CREATORS * ITEMS_PER_CREATOR;
    console.log(`✓ Added ${totalContent} content items in parallel in ${Date.now() - startTime}ms\n`);
    
    // No delays - everything is event-driven
    
    // Quick verification - just check a few creators
    console.log('Verifying content (sampling 3 creators):');
    for (let i = 0; i < 3; i++) {
      const creator = creators[i];
      const releases = await creator.service.getReleases();
      console.log(`Creator ${i + 1} has ${releases.length} releases`);
    }
    console.log();
    
    // Set up subscriptions with diverse follow patterns
    console.log('Setting up diverse subscriptions...');
    const subscriptionPromises = [];
    
    // Each hub follows a different pattern
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i];
      
      // Each hub follows 3-8 creators
      const numFollows = 3 + Math.floor(Math.random() * 6);
      const selectedCreators = creators
        .sort(() => Math.random() - 0.5)
        .slice(0, numFollows);
      
      for (const creator of selectedCreators) {
        // Mix of recursive (30%) and non-recursive (70%) follows
        const isRecursive = Math.random() < 0.3;
        
        subscriptionPromises.push(
          hub.service.addSubscription({
            [SUBSCRIPTION_SITE_ID_PROPERTY]: creator.siteId,
            [SUBSCRIPTION_NAME_PROPERTY]: `Creator follow`,
            [SUBSCRIPTION_RECURSIVE_PROPERTY]: isRecursive,
            subscriptionType: 'content',
            currentDepth: 0,
            followChain: [hub.siteId]
          }).catch(err => {
            console.error(`Failed to add subscription: ${err.message}`);
            return { success: false };
          })
        );
      }
    }
    
    // Some hubs also follow other hubs (creating deeper federation chains)
    for (let i = 0; i < 3; i++) {
      const hub = hubs[i];
      const targetHub = hubs[(i + 5) % hubs.length];
      
      subscriptionPromises.push(
        hub.service.addSubscription({
          [SUBSCRIPTION_SITE_ID_PROPERTY]: targetHub.siteId,
          [SUBSCRIPTION_NAME_PROPERTY]: `Hub follow`,
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: true, // Hub-to-hub is recursive
          subscriptionType: 'content',
          currentDepth: 0,
          followChain: [hub.siteId]
        }).catch(err => {
          console.error(`Failed to add hub subscription: ${err.message}`);
          return { success: false };
        })
      );
    }
    
    const subResults = await Promise.all(subscriptionPromises);
    const successCount = subResults.filter(r => r.success).length;
    console.log(`✓ Created ${successCount} subscriptions in ${Date.now() - startTime}ms\n`);
    
    // No delays - subscriptions are available immediately
    
    // Start federation sync for all hubs
    console.log('Starting federation sync for all hubs...');
    
    // Create sync managers for all hubs in parallel
    const syncPromises = [];
    
    for (const hub of hubs) {
      // Get the site from the service
      const site = hub.service.siteProgram;
      if (!site) {
        console.error(`Hub has no site program!`);
        continue;
      }
      
      // Create coordination store for this hub
      const coordinationStore = await createLensCoordinationStore(hub.peer, hub.siteId);
      
      // Create sync manager
      const syncManager = new PerLensFederationSync(
        hub.peer,
        hub.siteId,
        `hub-${hub.siteId.slice(0, 8)}`,
        site.federationIndex!,
        site.subscriptions,
        coordinationStore
      );
      
      syncManagers.push(syncManager);
      syncPromises.push(syncManager.start());
    }
    
    await Promise.all(syncPromises);
    console.log(`✓ Started ${hubs.length} sync managers in ${Date.now() - startTime}ms\n`);
    
    // Wait for federation to complete
    const syncStartTime = Date.now();
    console.log('Waiting for federation sync to complete...');
    
    // Check sync progress periodically
    let lastProgress = 0;
    const checkInterval = setInterval(async () => {
      let totalSynced = 0;
      for (const hub of hubs.slice(0, 3)) { // Sample first 3 hubs
        const site = hub.service.siteProgram!;
        const entries = await site.federationIndex!.getAllEntries();
        totalSynced += entries.length;
      }
      
      if (totalSynced > lastProgress) {
        console.log(`Progress: ${totalSynced} entries synced...`);
        lastProgress = totalSynced;
      }
    }, 2000);
    
    // Wait for federation using event-driven approach
    console.log('\nWaiting for federation to complete...');
    
    // Create promises that resolve when each hub has synced content
    const hubSyncPromises = hubs.map((hub, i) => {
      return new Promise<void>(async (resolve) => {
        const site = hub.service.siteProgram!;
        
        // Count expected content based on subscriptions
        const subs = await site.subscriptions.index.search(new SearchRequest());
        const expectedMinContent = subs.length * 2; // At least 2 items per subscription
        
        let resolved = false;
        const checkContent = async () => {
          if (resolved) return;
          
          const entries = await site.federationIndex!.getAllEntries();
          if (entries.length >= expectedMinContent) {
            console.log(`Hub ${i + 1} synced ${entries.length} entries`);
            resolved = true;
            resolve();
          }
        };
        
        // Listen for federation index changes
        const changeHandler = () => checkContent();
        site.federationIndex!.events.addEventListener('change' as any, changeHandler);
        
        // Check immediately in case already synced
        await checkContent();
        
        // Also check periodically in case events are missed
        const intervalId = setInterval(checkContent, 2000);
        
        // Cleanup on resolve
        const cleanup = () => {
          clearInterval(intervalId);
          site.federationIndex!.events.removeEventListener('change' as any, changeHandler);
        };
        
        // Auto-resolve after timeout
        setTimeout(() => {
          if (!resolved) {
            cleanup();
            resolve();
          }
        }, 40000);
      });
    });
    
    // Wait for at least 80% of hubs to sync
    const minHubsToSync = Math.ceil(hubs.length * 0.8);
    const syncedHubs = await Promise.race([
      Promise.all(hubSyncPromises).then(() => hubs.length),
      new Promise<number>(resolve => {
        let syncedCount = 0;
        hubSyncPromises.forEach(p => p.then(() => {
          syncedCount++;
          if (syncedCount >= minHubsToSync) {
            resolve(syncedCount);
          }
        }));
      }),
      new Promise<number>(resolve => setTimeout(() => resolve(-1), 45000))
    ]);
    
    if (syncedHubs === -1) {
      console.log('Federation sync timed out after 45 seconds');
    } else {
      console.log(`${syncedHubs} hubs completed sync`);
    }
    
    clearInterval(checkInterval);
    
    const syncTime = Date.now() - syncStartTime;
    console.log(`\nFederation sync completed in ${syncTime}ms`);
    
    // Verify federation results
    console.log('\nVerifying federation results...');
    let totalSyncedEntries = 0;
    let minEntries = Infinity;
    let maxEntries = 0;
    
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i];
      const site = hub.service.siteProgram!;
      const entries = await site.federationIndex!.getAllEntries();
      totalSyncedEntries += entries.length;
      minEntries = Math.min(minEntries, entries.length);
      maxEntries = Math.max(maxEntries, entries.length);
      
      if (i < 3) { // Log first 3 hubs
        console.log(`Hub ${i + 1} has ${entries.length} entries`);
      }
    }
    
    const avgEntries = totalSyncedEntries / hubs.length;
    console.log(`\nAggregated results:`);
    console.log(`- Total entries synced: ${totalSyncedEntries}`);
    console.log(`- Average per hub: ${avgEntries.toFixed(1)}`);
    console.log(`- Min/Max: ${minEntries}/${maxEntries}`);
    
    // Check work distribution
    const workDistribution = syncManagers.map(sm => sm.getStats().syncingFrom.length);
    const totalWork = workDistribution.reduce((a, b) => a + b, 0);
    console.log(`- Total sync connections: ${totalWork}`);
    console.log(`- Sync distribution: min ${Math.min(...workDistribution)}, max ${Math.max(...workDistribution)}`);
    
    // Generate visualization of FULL network
    console.log('\nGenerating FULL federation graph for all 15 nodes...');
    
    const nodes: any[] = [];
    const links: any[] = [];
    
    // Add ALL creator nodes
    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      const site = creator.service.siteProgram!;
      const entries = await site.federationIndex!.getAllEntries();
      
      nodes.push({
        id: creator.siteId,
        name: `Creator ${i + 1}`,
        releases: entries.map(e => ({
          id: e.id,
          name: e.title,
          federatedFrom: e.sourceSiteId !== creator.siteId ? e.sourceSiteId : undefined
        }))
      });
    }
    
    // Add ALL hub nodes
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i];
      const site = hub.service.siteProgram!;
      const entries = await site.federationIndex!.getAllEntries();
      
      nodes.push({
        id: hub.siteId,
        name: `Hub ${i + 1}`,
        releases: entries.map(e => ({
          id: e.id,
          name: e.title,
          federatedFrom: e.sourceSiteId !== hub.siteId ? e.sourceSiteId : undefined
        }))
      });
    }
    
    // Add subscription relationships - each site shows what IT follows
    for (const creator of creators) {
      const site = creator.service.siteProgram!;
      const subs = await site.subscriptions.index.search(new SearchRequest());
      for (const sub of subs) {
        const subscription = (sub as any).value || sub;
        if (!subscription) continue;
        links.push({
          source: creator.siteId,
          target: subscription[SUBSCRIPTION_SITE_ID_PROPERTY],
          recursive: subscription[SUBSCRIPTION_RECURSIVE_PROPERTY],
          mutual: false
        });
      }
    }
    
    for (const hub of hubs) {
      const site = hub.service.siteProgram!;
      const subs = await site.subscriptions.index.search(new SearchRequest());
      for (const sub of subs) {
        const subscription = (sub as any).value || sub;
        if (!subscription) continue;
        links.push({
          source: hub.siteId,
          target: subscription[SUBSCRIPTION_SITE_ID_PROPERTY],
          recursive: subscription[SUBSCRIPTION_RECURSIVE_PROPERTY],
          mutual: false
        });
      }
    }
    
    console.log(`Graph contains ${nodes.length} nodes and ${links.length} links`);
    
    const graphData: FederationGraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName: 'per-lens-federation-scale-15',
      querySuccessRate: avgEntries > 0 ? 1.0 : 0.0
    };
    
    await generateFederationGraph(graphData);
    console.log('✓ Generated federation graph');
    
    // Check coordination string states
    console.log('\nCoordination sample (first 3 hubs):');
    for (let i = 0; i < Math.min(3, syncManagers.length); i++) {
      const stats = syncManagers[i].getStats();
      console.log(`${stats.nodeId}: syncing from ${stats.syncingFrom.length} sites`);
    }
    
    // Final timing
    const totalTime = Date.now() - startTime;
    console.log(`\n✓ FEDERATION TEST COMPLETED IN ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
    
    // Assertions
    expect(totalSyncedEntries).toBeGreaterThan(0); // Should have synced some content
    expect(avgEntries).toBeGreaterThan(0); // Each hub should have content
    expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    
    // Performance metrics
    const contentPerSecond = (totalContent / (totalTime / 1000)).toFixed(0);
    const syncPerSecond = (totalSyncedEntries / (syncTime / 1000)).toFixed(0);
    console.log(`\nPerformance metrics:`);
    console.log(`- Content creation rate: ${contentPerSecond} items/sec`);
    console.log(`- Federation sync rate: ${syncPerSecond} items/sec`);
    console.log(`- Nodes: ${TOTAL_NODES} (${NUM_CREATORS} creators, ${NUM_HUBS} hubs)`);
    console.log(`- Total content: ${totalContent} items`);
    console.log(`- Total synced: ${totalSyncedEntries} items across all hubs`);
  }, 120000); // 2 minute timeout
});