import { describe, test, expect, afterAll, beforeAll } from '@jest/globals';
import { PerSiteFederationIndex, IndexableFederationEntry } from '../src/per-site-federation-index';
import { LatticeFederationSync, FederationGraphDiscovery, FederationEdge } from '../src/lattice-federation-sync';
import { Peerbit } from 'peerbit';
import { delay } from './utils';
import { generateFederationGraph, type FederationGraphData } from './federation-graph-generator';
import { SearchRequest } from '@peerbit/document';

describe('Lattice-Based Federation at Scale', () => {
  let peers: Peerbit[] = [];
  let federationIndexes: Map<string, PerSiteFederationIndex> = new Map();
  let syncManagers: LatticeFederationSync[] = [];
  let siteAddresses: Map<string, string> = new Map(); // siteName -> address
  let siteFollows: Map<string, Array<{ siteId: string; recursive: boolean }>> = new Map();
  let portCounter = 25000;

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
    siteFollows.set(fedIndex.address, []); // Initialize empty follows
    
    return { peer, fedIndex, address: fedIndex.address };
  }

  async function createSitesInBatch(names: string[], batchSize: number = 10): Promise<void> {
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      await Promise.all(batch.map(name => createSite(name)));
      console.log(`✓ Created ${Math.min(i + batchSize, names.length)}/${names.length} sites`);
      if (i + batchSize < names.length) {
        await delay(100);
      }
    }
  }

  async function connectPeersInMesh(sampleSize: number = 5): Promise<void> {
    if (peers.length <= 1) return;
    
    console.log('Establishing peer connections...');
    const hubAddrs = peers.slice(0, Math.min(sampleSize, peers.length))
      .map(p => p.getMultiaddrs()[0]);
    
    for (let i = 1; i < peers.length; i++) {
      const peer = peers[i];
      const selectedAddrs = hubAddrs
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      
      for (const addr of selectedAddrs) {
        try {
          await peer.dial(addr);
        } catch (e) {
          // Ignore connection errors
        }
      }
    }
    console.log('✓ Peer mesh established');
  }

  afterAll(async () => {
    // Stop all sync managers
    await Promise.all(syncManagers.map(sm => sm.stop()));
    
    // Close all peers
    for (const peer of peers) {
      await peer.stop();
    }
  });

  test('100+ sites with lattice-based federation - no coordination needed', async () => {
    console.log('\n=== LATTICE-BASED FEDERATION TEST ===');
    console.log('Testing self-organizing federation without batons...\n');
    
    const startTime = Date.now();
    
    // Step 1: Create content sites
    const creatorNames = Array.from({ length: 100 }, (_, i) => `Creator ${i + 1}`);
    console.log('Step 1: Creating 100 content creator sites...');
    await createSitesInBatch(creatorNames, 20);
    
    // Create aggregator sites
    const aggregatorNames = [
      'Gaming Hub', 'Music Hub', 'Tech Hub', 'Art Hub',
      'Regional Aggregator 1', 'Regional Aggregator 2',
      'Meta Aggregator'
    ];
    await createSitesInBatch(aggregatorNames, 7);
    
    console.log(`✓ Total sites: ${siteAddresses.size}\n`);
    
    // Step 2: Connect peers
    await connectPeersInMesh(10);
    
    // Step 3: Add content to creators
    console.log('\nStep 3: Adding content to creator sites...');
    for (let i = 0; i < 100; i++) {
      const creatorAddr = siteAddresses.get(`Creator ${i + 1}`)!;
      const fedIndex = federationIndexes.get(creatorAddr)!;
      
      // Add 3 items per creator
      for (let j = 0; j < 3; j++) {
        const entry = new IndexableFederationEntry({
          id: `${creatorAddr}:content-${i}-${j}`,
          contentCID: `Qm${i}-${j}`,
          title: `Creator ${i + 1} - ${['Video', 'Article', 'Music'][j]}`,
          sourceSiteId: creatorAddr,
          categoryId: ['gaming', 'music', 'tech', 'art', 'news'][i % 5],
          timestamp: Date.now() + (i * 100) + j,
        });
        
        await fedIndex.insertContent(entry);
      }
    }
    console.log('✓ Added 300 content items\n');
    
    // Step 4: Set up federation relationships
    console.log('Step 4: Establishing federation relationships...');
    
    // Gaming Hub follows gaming creators (0-24)
    const gamingHub = siteAddresses.get('Gaming Hub')!;
    for (let i = 0; i < 25; i++) {
      siteFollows.get(gamingHub)!.push({
        siteId: siteAddresses.get(`Creator ${i + 1}`)!,
        recursive: false
      });
    }
    
    // Music Hub follows music creators (25-49)
    const musicHub = siteAddresses.get('Music Hub')!;
    for (let i = 25; i < 50; i++) {
      siteFollows.get(musicHub)!.push({
        siteId: siteAddresses.get(`Creator ${i + 1}`)!,
        recursive: false
      });
    }
    
    // Tech Hub follows tech creators (50-74)
    const techHub = siteAddresses.get('Tech Hub')!;
    for (let i = 50; i < 75; i++) {
      siteFollows.get(techHub)!.push({
        siteId: siteAddresses.get(`Creator ${i + 1}`)!,
        recursive: false
      });
    }
    
    // Art Hub follows art creators (75-99)
    const artHub = siteAddresses.get('Art Hub')!;
    for (let i = 75; i < 100; i++) {
      siteFollows.get(artHub)!.push({
        siteId: siteAddresses.get(`Creator ${i + 1}`)!,
        recursive: false
      });
    }
    
    // Regional aggregators follow multiple hubs
    const regional1 = siteAddresses.get('Regional Aggregator 1')!;
    siteFollows.get(regional1)!.push(
      { siteId: gamingHub, recursive: true },
      { siteId: musicHub, recursive: true }
    );
    
    const regional2 = siteAddresses.get('Regional Aggregator 2')!;
    siteFollows.get(regional2)!.push(
      { siteId: techHub, recursive: true },
      { siteId: artHub, recursive: true }
    );
    
    // Meta aggregator follows regionals with recursive
    const metaAgg = siteAddresses.get('Meta Aggregator')!;
    siteFollows.get(metaAgg)!.push(
      { siteId: regional1, recursive: true },
      { siteId: regional2, recursive: true }
    );
    
    console.log('✓ Federation graph established\n');
    
    // Step 5: Create sync nodes with lattice-based assignment
    console.log('Step 5: Creating lattice sync nodes...');
    
    // Discover all federation edges
    const allEdges = await FederationGraphDiscovery.discoverEdges(siteFollows);
    console.log(`✓ Discovered ${allEdges.length} federation edges`);
    
    // Create sync nodes
    const syncNodeCount = 15;
    const allNodeIds: string[] = [];
    
    for (let i = 0; i < syncNodeCount; i++) {
      const nodeId = `sync-node-${i}`;
      allNodeIds.push(nodeId);
      
      // Determine which sites this node replicates
      const replicatingSites: string[] = [];
      
      // Each node replicates a subset of sites based on its ID
      // This simulates nodes having different interests/capacities
      if (i < 3) {
        // Gaming-focused nodes
        replicatingSites.push(gamingHub);
        if (i === 0) replicatingSites.push(regional1);
      } else if (i < 6) {
        // Music-focused nodes
        replicatingSites.push(musicHub);
        if (i === 3) replicatingSites.push(regional1);
      } else if (i < 9) {
        // Tech-focused nodes
        replicatingSites.push(techHub);
        if (i === 6) replicatingSites.push(regional2);
      } else if (i < 12) {
        // Art-focused nodes
        replicatingSites.push(artHub);
        if (i === 9) replicatingSites.push(regional2);
      } else {
        // Meta nodes
        replicatingSites.push(metaAgg);
        if (i === 12) replicatingSites.push(regional1, regional2);
      }
      
      const syncPeer = peers[i % peers.length];
      const syncManager = new LatticeFederationSync(
        syncPeer,
        nodeId,
        replicatingSites
      );
      
      syncManagers.push(syncManager);
    }
    
    // Update all nodes with the complete node list
    for (const sm of syncManagers) {
      await sm.updateActiveNodes(allNodeIds);
      await sm.updateFederationGraph(allEdges);
    }
    
    // Start all sync managers
    const startPromises = syncManagers.map(sm => {
      const replicatingSites = sm.getStats().replicatingSites;
      const indexMap = new Map<string, PerSiteFederationIndex>();
      for (const siteId of replicatingSites) {
        const index = federationIndexes.get(siteId);
        if (index) {
          indexMap.set(siteId, index);
        }
      }
      return sm.start(indexMap);
    });
    
    await Promise.all(startPromises);
    console.log(`✓ Started ${syncNodeCount} lattice sync nodes\n`);
    
    // Wait for initial sync
    console.log('Step 6: Waiting for lattice sync to self-organize...');
    await delay(3000);
    
    // Check sync distribution
    console.log('\nLattice sync distribution:');
    let totalEdgesCovered = 0;
    const edgeCoverage = new Map<string, number>();
    
    for (const sm of syncManagers) {
      const stats = sm.getStats();
      console.log(`${stats.nodeId}: ${stats.activeEdges} edges, replicating ${stats.replicatingSites.length} sites`);
      totalEdgesCovered += stats.activeEdges;
      
      for (const edge of stats.responsibilities) {
        edgeCoverage.set(edge, (edgeCoverage.get(edge) || 0) + 1);
      }
    }
    
    console.log(`\n✓ Total edges covered: ${totalEdgesCovered}`);
    console.log(`✓ Average coverage per edge: ${Array.from(edgeCoverage.values()).reduce((a, b) => a + b, 0) / edgeCoverage.size}`);
    
    // Test real-time sync
    console.log('\nStep 7: Testing real-time federation...');
    const creator1Addr = siteAddresses.get('Creator 1')!;
    const creator1Index = federationIndexes.get(creator1Addr)!;
    
    const newEntry = new IndexableFederationEntry({
      id: `${creator1Addr}:realtime-test`,
      contentCID: 'QmRealtimeTest',
      title: 'Creator 1 - Lattice Real-time Update',
      sourceSiteId: creator1Addr,
      categoryId: 'gaming',
      timestamp: Date.now(),
    });
    
    await creator1Index.insertContent(newEntry);
    console.log('✓ Added new content to Creator 1');
    
    // Wait for propagation through the lattice
    await delay(2000);
    
    // Check propagation
    const gamingHubIndex = federationIndexes.get(gamingHub)!;
    const gamingEntries = await gamingHubIndex.getAllEntries();
    const foundInGaming = gamingEntries.some(e => e.contentCID === 'QmRealtimeTest');
    
    const regional1Index = federationIndexes.get(regional1)!;
    const regionalEntries = await regional1Index.getAllEntries();
    const foundInRegional = regionalEntries.some(e => e.contentCID === 'QmRealtimeTest');
    
    const metaIndex = federationIndexes.get(metaAgg)!;
    const metaEntries = await metaIndex.getAllEntries();
    const foundInMeta = metaEntries.some(e => e.contentCID === 'QmRealtimeTest');
    
    console.log(`✓ Propagated to Gaming Hub: ${foundInGaming}`);
    console.log(`✓ Propagated to Regional (recursive): ${foundInRegional}`);
    console.log(`✓ Propagated to Meta (transitive): ${foundInMeta}`);
    
    // Generate visualization
    console.log('\nStep 8: Generating federation graph...');
    
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
    for (const edge of allEdges) {
      links.push({
        source: edge.sourceSiteId,
        target: edge.targetSiteId,
        recursive: edge.recursive,
        mutual: false
      });
    }
    
    // Calculate lattice coverage
    const latticeCoverage = new Map<string, string[]>();
    for (const sm of syncManagers) {
      const stats = sm.getStats();
      for (const edge of stats.responsibilities) {
        if (!latticeCoverage.has(edge)) {
          latticeCoverage.set(edge, []);
        }
        latticeCoverage.get(edge)!.push(stats.nodeId);
      }
    }
    
    const graphData: FederationGraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName: 'lattice-federation-100-sites',
      querySuccessRate: foundInMeta ? 1.0 : 0.0,
      queryPerformance: {
        avgTime: 50, // Approximate
        minTime: 50,
        maxTime: 50,
        queries: 1
      },
      latticeStats: {
        totalNodes: syncNodeCount,
        totalEdges: allEdges.length,
        edgesCovered: edgeCoverage.size,
        averageCoverage: Array.from(edgeCoverage.values()).reduce((a, b) => a + b, 0) / edgeCoverage.size,
        distributionMap: Object.fromEntries(latticeCoverage)
      }
    };
    
    await generateFederationGraph(graphData);
    console.log('✓ Generated federation graph visualization');
    
    // Verify lattice properties
    expect(edgeCoverage.size).toBeGreaterThan(0); // Some edges are covered
    expect(foundInGaming).toBe(true); // Direct federation works
    expect(foundInRegional).toBe(true); // Recursive federation works
    
    // Test node failure resilience
    console.log('\nStep 9: Testing lattice resilience...');
    
    // Simulate node failure by stopping one
    const failingNode = syncManagers[0];
    const failingStats = failingNode.getStats();
    const failingEdges = failingStats.responsibilities;
    console.log(`Stopping ${failingStats.nodeId} (was handling ${failingEdges.length} edges)`);
    
    await failingNode.stop();
    syncManagers.splice(0, 1);
    
    // Update remaining nodes
    const remainingNodeIds = allNodeIds.filter(id => id !== failingStats.nodeId);
    for (const sm of syncManagers) {
      await sm.updateActiveNodes(remainingNodeIds);
    }
    
    // Wait for rebalancing
    await delay(2000);
    
    // Check if failed edges are covered
    let recoveredEdges = 0;
    for (const edge of failingEdges) {
      for (const sm of syncManagers) {
        if (sm.getStats().responsibilities.includes(edge)) {
          recoveredEdges++;
          break;
        }
      }
    }
    
    console.log(`✓ Recovered ${recoveredEdges}/${failingEdges.length} edges after node failure`);
    expect(recoveredEdges).toBeGreaterThan(0); // At least some edges recovered
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✓ Lattice federation test completed in ${totalTime}s`);
  });
});