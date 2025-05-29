import { describe, test, expect, afterAll, beforeAll } from '@jest/globals';
import { PerSiteFederationIndex, IndexableFederationEntry } from '../src/per-site-federation-index';
import { EventFederationSync, FederationSyncBatonStore, FederationSyncBaton } from '../src/event-federation-sync';
import { Peerbit } from 'peerbit';
import { delay } from './utils';
import { generateFederationGraph } from './federation-graph';
import type { FederationGraphData } from './federation-graph';

describe('Event-Driven Federation at Scale', () => {
  let peers: Peerbit[] = [];
  let federationIndexes: Map<string, PerSiteFederationIndex> = new Map();
  let batonStore: FederationSyncBatonStore;
  let syncManagers: EventFederationSync[] = [];
  let siteAddresses: Map<string, string> = new Map(); // siteName -> address
  let portCounter = 20000;

  async function createSite(name: string): Promise<{
    peer: Peerbit;
    fedIndex: PerSiteFederationIndex;
    address: string;
  }> {
    const peer = await Peerbit.create({
      listen: [`/ip4/127.0.0.1/tcp/${portCounter++}/ws`]
    });
    await peer.start();
    
    const fedIndex = new PerSiteFederationIndex();
    await peer.open(fedIndex, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    peers.push(peer);
    federationIndexes.set(fedIndex.address, fedIndex);
    siteAddresses.set(name, fedIndex.address);
    
    return { peer, fedIndex, address: fedIndex.address };
  }

  async function createSitesInBatch(names: string[], batchSize: number = 10): Promise<void> {
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(name => createSite(name)));
      console.log(`✓ Created ${Math.min(i + batchSize, names.length)}/${names.length} sites`);
      if (i + batchSize < names.length) {
        await delay(100); // Small delay between batches
      }
    }
  }

  async function connectPeersInMesh(sampleSize: number = 5): Promise<void> {
    if (peers.length <= 1) return;
    
    console.log('Establishing peer connections...');
    const hubAddrs = peers.slice(0, Math.min(sampleSize, peers.length))
      .map(p => p.getMultiaddrs()[0]);
    
    const batchSize = 20;
    for (let i = 1; i < peers.length; i += batchSize) {
      const batch = peers.slice(i, Math.min(i + batchSize, peers.length));
      
      await Promise.all(batch.map(async (peer) => {
        // Connect to 2-3 random hub peers
        const selectedAddrs = hubAddrs
          .sort(() => Math.random() - 0.5)
          .slice(0, 2 + Math.floor(Math.random() * 2));
        
        for (const addr of selectedAddrs) {
          try {
            await peer.dial(addr);
          } catch (e) {
            // Ignore connection errors
          }
        }
      }));
      
      console.log(`✓ Connected ${Math.min(i + batchSize, peers.length)}/${peers.length} peers`);
    }
  }

  beforeAll(async () => {
    // Create the shared baton store
    const coordinatorPeer = await Peerbit.create({
      listen: [`/ip4/127.0.0.1/tcp/${portCounter++}/ws`]
    });
    await coordinatorPeer.start();
    peers.push(coordinatorPeer);
    
    batonStore = new FederationSyncBatonStore();
    await coordinatorPeer.open(batonStore, {
      args: {
        replicate: true,
        replicas: { min: 3 }
      }
    });
    
    console.log('✓ Created shared baton store');
  });

  afterAll(async () => {
    // Stop all sync managers
    await Promise.all(syncManagers.map(sm => sm.stop()));
    
    // Close all peers
    for (const peer of peers) {
      await peer.stop();
    }
  });

  test('100+ sites with event-driven federation and dedicated sync nodes', async () => {
    console.log('\n=== EVENT-DRIVEN FEDERATION TEST ===');
    console.log('Creating a network with 100+ content sites...\n');
    
    const startTime = Date.now();
    
    // Step 1: Create content creator sites
    const creatorNames = Array.from({ length: 100 }, (_, i) => `Creator ${i + 1}`);
    console.log('Step 1: Creating 100 content creator sites...');
    await createSitesInBatch(creatorNames, 20);
    
    // Step 2: Create hub sites
    console.log('\nStep 2: Creating hub and aggregator sites...');
    const hubNames = [
      'Gaming Hub',
      'Music Hub', 
      'Tech Hub',
      'Art Hub',
      'News Aggregator',
      'Entertainment Portal'
    ];
    await createSitesInBatch(hubNames, 6);
    
    console.log(`✓ Total sites created: ${siteAddresses.size} in ${Math.round((Date.now() - startTime) / 1000)}s\n`);
    
    // Step 3: Connect peers
    console.log('Step 3: Establishing peer connections...');
    await connectPeersInMesh(10);
    
    // Step 4: Add content to creator sites
    console.log('\nStep 4: Adding content to creator sites...');
    const contentStart = Date.now();
    const contentPromises = [];
    
    for (let i = 0; i < 100; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      const fedIndex = federationIndexes.get(creatorAddr)!;
      
      // Add 5 items per creator (500 total)
      for (let j = 0; j < 5; j++) {
        const entry = new IndexableFederationEntry({
          id: `${creatorAddr}:content-${i}-${j}`,
          contentCID: `Qm${i}-${j}`,
          title: `Creator ${i + 1} - ${['Video', 'Article', 'Music', 'Image', 'Stream'][j]}`,
          sourceSiteId: creatorAddr, // Original creator
          categoryId: ['gaming', 'music', 'tech', 'art', 'news'][i % 5],
          timestamp: Date.now() + (i * 1000) + j,
        });
        
        contentPromises.push(fedIndex.insertContent(entry));
      }
      
      if ((i + 1) % 20 === 0) {
        await Promise.all(contentPromises);
        contentPromises.length = 0;
        console.log(`✓ Added content to ${i + 1}/100 creators`);
      }
    }
    
    await Promise.all(contentPromises);
    console.log(`✓ All content added in ${Math.round((Date.now() - contentStart) / 1000)}s\n`);
    
    // Step 5: Set up federation relationships using batons
    console.log('Step 5: Setting up federation relationships...');
    
    // Gaming Hub follows gaming creators (0-19)
    const gamingHub = siteAddresses.get('Gaming Hub')!;
    for (let i = 0; i < 20; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      await batonStore.createBaton(creatorAddr, gamingHub);
    }
    
    // Music Hub follows music creators (20-39)
    const musicHub = siteAddresses.get('Music Hub')!;
    for (let i = 20; i < 40; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      await batonStore.createBaton(creatorAddr, musicHub);
    }
    
    // Tech Hub follows tech creators (40-59)
    const techHub = siteAddresses.get('Tech Hub')!;
    for (let i = 40; i < 60; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      await batonStore.createBaton(creatorAddr, techHub);
    }
    
    // Art Hub follows art creators (60-79)
    const artHub = siteAddresses.get('Art Hub')!;
    for (let i = 60; i < 80; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      await batonStore.createBaton(creatorAddr, artHub);
    }
    
    // News Aggregator follows news creators (80-99)
    const newsAgg = siteAddresses.get('News Aggregator')!;
    for (let i = 80; i < 100; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      await batonStore.createBaton(creatorAddr, newsAgg);
    }
    
    // Entertainment Portal follows ALL hubs with RECURSIVE federation
    // This means it gets content from the hubs AND all creators they follow
    const entertainmentPortal = siteAddresses.get('Entertainment Portal')!;
    await batonStore.createBaton(gamingHub, entertainmentPortal, true);  // recursive = true
    await batonStore.createBaton(musicHub, entertainmentPortal, true);   // recursive = true
    await batonStore.createBaton(techHub, entertainmentPortal, true);    // recursive = true
    await batonStore.createBaton(artHub, entertainmentPortal, true);     // recursive = true
    await batonStore.createBaton(newsAgg, entertainmentPortal, false);  // recursive = false (only news hub content)
    
    console.log('✓ Created all federation batons\n');
    
    // Step 6: Create dedicated sync nodes
    console.log('Step 6: Creating dedicated sync nodes...');
    const syncNodeCount = 10;
    
    for (let i = 0; i < syncNodeCount; i++) {
      const syncPeer = peers[i % peers.length]; // Reuse existing peers as sync nodes
      const nodeId = `sync-node-${i}`;
      
      // Create a map of sites this node can sync TO
      const targetSites = new Map<string, PerSiteFederationIndex>();
      
      // Each sync node handles a subset of target sites
      if (i < 2) {
        // Gaming sync nodes
        targetSites.set(gamingHub, federationIndexes.get(gamingHub)!);
      } else if (i < 4) {
        // Music sync nodes
        targetSites.set(musicHub, federationIndexes.get(musicHub)!);
      } else if (i < 6) {
        // Tech sync nodes
        targetSites.set(techHub, federationIndexes.get(techHub)!);
      } else if (i < 8) {
        // Art sync nodes
        targetSites.set(artHub, federationIndexes.get(artHub)!);
      } else {
        // News and Entertainment sync nodes
        targetSites.set(newsAgg, federationIndexes.get(newsAgg)!);
        targetSites.set(entertainmentPortal, federationIndexes.get(entertainmentPortal)!);
      }
      
      const syncManager = new EventFederationSync(syncPeer, nodeId, batonStore);
      await syncManager.start(targetSites, 5); // Each node handles up to 5 batons
      syncManagers.push(syncManager);
    }
    
    console.log(`✓ Created ${syncNodeCount} dedicated sync nodes\n`);
    
    // Wait for initial sync to complete
    console.log('Step 7: Waiting for federation sync to complete...');
    await delay(5000); // Give time for initial sync
    
    // Check sync progress
    let totalSynced = 0;
    for (const sm of syncManagers) {
      const stats = await sm.getStats();
      totalSynced += stats.totalSynced;
      if (stats.activeBatons > 0) {
        console.log(`Sync node: ${stats.activeBatons} active batons, ${stats.totalSynced} entries synced`);
      }
    }
    console.log(`✓ Total entries synced across network: ${totalSynced}\n`);
    
    // Step 8: Test real-time federation by adding new content
    console.log('Step 8: Testing real-time federation...');
    const creator1Addr = siteAddresses.get('Creator 1')!;
    const creator1Index = federationIndexes.get(creator1Addr)!;
    
    const newEntry = new IndexableFederationEntry({
      id: `${creator1Addr}:realtime-test`,
      contentCID: 'QmRealtimeTest',
      title: 'Creator 1 - Real-time Update',
      sourceSiteId: creator1Addr,
      categoryId: 'gaming',
      timestamp: Date.now(),
    });
    
    await creator1Index.insertContent(newEntry);
    console.log('✓ Added new content to Creator 1');
    
    // Wait for propagation
    await delay(2000);
    
    // Check if it propagated to Gaming Hub
    const gamingHubIndex = federationIndexes.get(gamingHub)!;
    const gamingHubEntries = await gamingHubIndex.getAllEntries();
    const foundInHub = gamingHubEntries.some(e => e.contentCID === 'QmRealtimeTest');
    console.log(`✓ Real-time update propagated to Gaming Hub: ${foundInHub}`);
    
    // Check if it propagated transitively to Entertainment Portal
    const portalIndex = federationIndexes.get(entertainmentPortal)!;
    const portalEntries = await portalIndex.getAllEntries();
    const foundInPortal = portalEntries.some(e => e.contentCID === 'QmRealtimeTest');
    console.log(`✓ Transitive federation to Entertainment Portal: ${foundInPortal}`);
    
    // Step 9: Generate performance metrics
    console.log('\nStep 9: Analyzing federation performance...');
    
    // Test query performance
    const queryStart = Date.now();
    const searchResults = await portalIndex.complexQuery({
      searchQuery: 'Video',
      limit: 100
    });
    const queryTime = Date.now() - queryStart;
    
    console.log(`✓ Query performance: Found ${searchResults.length} results in ${queryTime}ms`);
    
    // Count content distribution
    const contentBySource = new Map<string, number>();
    for (const entry of portalEntries) {
      contentBySource.set(entry.sourceSiteId, (contentBySource.get(entry.sourceSiteId) || 0) + 1);
    }
    
    console.log(`✓ Entertainment Portal federates from ${contentBySource.size} unique sources`);
    console.log(`✓ Total federated content: ${portalEntries.length} entries`);
    
    // Generate visualization
    console.log('\nStep 10: Generating federation graph...');
    
    // Build graph data
    const nodes: any[] = [];
    const links: any[] = [];
    
    // Add all sites as nodes
    for (const [name, addr] of siteAddresses) {
      const fedIndex = federationIndexes.get(addr)!;
      const entries = await fedIndex.getAllEntries();
      
      nodes.push({
        id: addr,
        name: name,
        releases: entries.map(e => ({
          id: e.id,
          name: e.title,
          federatedFrom: e.sourceSiteId !== addr ? e.sourceSiteId : undefined
        }))
      });
    }
    
    // Add federation relationships as links
    const allBatons = await batonStore.batons.index.search(new SearchRequest({ query: [] }));
    for (const baton of allBatons) {
      links.push({
        source: baton.sourceSiteId,
        target: baton.targetSiteId,
        recursive: false, // We track direct relationships
        mutual: false
      });
    }
    
    const graphData: FederationGraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName: 'event-driven-100-sites',
      querySuccessRate: searchResults.length / 100, // We searched for "Video", expect ~100 results
      queryPerformance: {
        avgTime: queryTime,
        minTime: queryTime,
        maxTime: queryTime,
        queries: 1
      },
      eventDrivenStats: {
        totalSyncNodes: syncNodeCount,
        activeBatons: allBatons.filter(b => b.status === 'watching').length,
        totalEntriesSynced: totalSynced,
        transitiveContent: portalEntries.filter(e => 
          ![gamingHub, musicHub, techHub, artHub, newsAgg, entertainmentPortal].includes(e.sourceSiteId)
        ).length
      }
    };
    
    await generateFederationGraph(graphData);
    console.log('✓ Generated federation graph visualization');
    
    // Assertions
    expect(nodes.length).toBe(106); // 100 creators + 6 hubs
    expect(foundInHub).toBe(true); // Real-time sync worked
    expect(foundInPortal).toBe(true); // Transitive federation worked
    expect(portalEntries.length).toBeGreaterThan(0); // Portal has federated content
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✓ Test completed in ${totalTime}s`);
  });
});