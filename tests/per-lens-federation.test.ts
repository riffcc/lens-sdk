import { describe, test, expect, afterAll } from '@jest/globals';
import { PerSiteFederationIndex, IndexableFederationEntry } from '../src/per-site-federation-index';
import { PerLensFederationSync, createLensCoordinationString } from '../src/per-lens-federation-sync';
import { Site, Subscription } from '../src/schema';
import { Peerbit } from 'peerbit';
import { delay } from './utils';
import { generateFederationGraph, type FederationGraphData } from './federation-graph-generator';
import { SearchRequest } from '@peerbit/document';

describe('Per-Lens Federation Sync', () => {
  let peers: Peerbit[] = [];
  let sites: Map<string, Site> = new Map();
  let federationIndexes: Map<string, PerSiteFederationIndex> = new Map();
  let syncManagers: PerLensFederationSync[] = [];
  
  async function createSite(name: string): Promise<{
    peer: Peerbit;
    site: Site;
    fedIndex: PerSiteFederationIndex;
  }> {
    const peer = await Peerbit.create();
    await peer.start();
    
    const site = new Site({ 
      rootTrust: peer.identity.publicKey,
      name: name 
    });
    await peer.open(site, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    const fedIndex = site.federationIndex!;
    
    peers.push(peer);
    sites.set(name, site);
    federationIndexes.set(site.address, fedIndex);
    
    return { peer, site, fedIndex };
  }
  
  afterAll(async () => {
    await Promise.all(syncManagers.map(sm => sm.stop()));
    for (const peer of peers) {
      await peer.stop();
    }
  }, 30000);

  test('Per-lens federation with dedicated replicators', async () => {
    console.log('\n=== PER-LENS FEDERATION TEST ===\n');
    
    // Create content creator sites
    console.log('Creating content sites...');
    const creator1 = await createSite('Creator 1');
    const creator2 = await createSite('Creator 2');
    const creator3 = await createSite('Creator 3');
    
    // Create hub sites
    const hub1 = await createSite('Hub 1');
    const hub2 = await createSite('Hub 2');
    
    console.log(`✓ Created ${sites.size} sites\n`);
    
    // Add content to creators
    console.log('Adding content...');
    const creatorData = [creator1, creator2, creator3];
    for (let i = 0; i < 3; i++) {
      const { site, fedIndex } = creatorData[i];
      
      for (let j = 0; j < 3; j++) {
        const entry = new IndexableFederationEntry({
          id: `${site.address}:content-${i}-${j}`,
          contentCID: `Qm${i}-${j}`,
          title: `Creator ${i + 1} - Item ${j + 1}`,
          sourceSiteId: site.address,
          categoryId: 'test',
          timestamp: Date.now()
        });
        
        await fedIndex.insertContent(entry);
      }
    }
    console.log('✓ Added 9 content items\n');
    
    // Set up subscriptions
    console.log('Setting up subscriptions...');
    
    // Hub 1 follows creators 1 and 2
    await hub1.site.subscriptions.put(new Subscription({
      siteId: creator1.site.address,
      name: 'Creator 1',
      subscriptionType: 'normal'
    }));
    
    await hub1.site.subscriptions.put(new Subscription({
      siteId: creator2.site.address,
      name: 'Creator 2',
      subscriptionType: 'recursive'  // Recursive follow
    }));
    
    // Hub 2 follows creator 2 and 3
    await hub2.site.subscriptions.put(new Subscription({
      siteId: creator2.site.address,
      name: 'Creator 2',
      subscriptionType: 'normal'
    }));
    
    await hub2.site.subscriptions.put(new Subscription({
      siteId: creator3.site.address,
      name: 'Creator 3',
      subscriptionType: 'normal'
    }));
    
    console.log('✓ Subscriptions established\n');
    
    // Create dedicated replicator nodes for Hub 1
    console.log('Creating dedicated replicators for Hub 1...');
    
    // Create Hub 1's coordination string (shared by all its replicators)
    const hub1Coordination = await createLensCoordinationString(hub1.peer, hub1.site.address);
    
    // Hub 1's main node participates in sync
    const hub1Sync = new PerLensFederationSync(
      hub1.peer,
      hub1.site.address,
      'hub1-main',
      hub1.fedIndex,
      hub1.site.subscriptions,
      hub1Coordination
    );
    
    // Create 2 dedicated replicator nodes for Hub 1
    const replicator1 = await Peerbit.create();
    await replicator1.start();
    peers.push(replicator1);
    
    // Replicator 1 opens Hub 1's stores
    const hub1SiteReplica1 = await replicator1.open(hub1.site, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    const hub1CoordReplica1 = await replicator1.open(hub1Coordination, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    const hub1SyncReplica1 = new PerLensFederationSync(
      replicator1,
      hub1.site.address,
      'hub1-replica1',
      hub1SiteReplica1.federationIndex!,
      hub1SiteReplica1.subscriptions,
      hub1CoordReplica1
    );
    
    const replicator2 = await Peerbit.create();
    await replicator2.start();
    peers.push(replicator2);
    
    const hub1SiteReplica2 = await replicator2.open(hub1.site, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    const hub1CoordReplica2 = await replicator2.open(hub1Coordination, {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    const hub1SyncReplica2 = new PerLensFederationSync(
      replicator2,
      hub1.site.address,
      'hub1-replica2',
      hub1SiteReplica2.federationIndex!,
      hub1SiteReplica2.subscriptions,
      hub1CoordReplica2
    );
    
    syncManagers = [hub1Sync, hub1SyncReplica1, hub1SyncReplica2];
    
    console.log('✓ Created 3 nodes for Hub 1 (main + 2 replicas)\n');
    
    // Start all sync managers
    console.log('Starting federation sync...');
    await Promise.all(syncManagers.map(sm => sm.start()));
    
    // Wait for sync
    console.log('Waiting for federation sync...');
    await delay(3000);
    
    // Check coordination
    console.log('\nHub 1 federation coordination:');
    for (const sm of syncManagers) {
      const stats = sm.getStats();
      console.log(`${stats.nodeId}: syncing from ${stats.syncingFrom.join(', ') || 'none'}`);
    }
    
    // Verify federation worked
    const hub1Entries = await hub1.fedIndex.getAllEntries();
    console.log(`\nHub 1 has ${hub1Entries.length} entries (expected 6)`);
    
    // Check that work was distributed
    const workDistribution = syncManagers.map(sm => sm.getStats().syncingFrom.length);
    const totalWork = workDistribution.reduce((a, b) => a + b, 0);
    console.log(`Work distribution: ${workDistribution.join(', ')} (total: ${totalWork})`);
    
    // Test real-time sync
    console.log('\nTesting real-time sync...');
    const newEntry = new IndexableFederationEntry({
      id: `${creator1.site.address}:realtime`,
      contentCID: 'QmRealtime',
      title: 'Real-time Test',
      sourceSiteId: creator1.site.address,
      categoryId: 'test',
      timestamp: Date.now()
    });
    
    await creator1.fedIndex.insertContent(newEntry);
    await delay(1500);
    
    const hub1After = await hub1.fedIndex.getAllEntries();
    const foundRealtime = hub1After.some(e => e.contentCID === 'QmRealtime');
    console.log(`Real-time sync: ${foundRealtime}`);
    
    // Test adding a new subscription
    console.log('\nAdding new subscription to Creator 3...');
    await hub1.site.subscriptions.put(new Subscription({
      siteId: creator3.site.address,
      name: 'Creator 3',
      subscriptionType: 'normal'
    }));
    
    // Wait for coordination to pick it up
    await delay(2000);
    
    console.log('Updated coordination:');
    for (const sm of syncManagers) {
      const stats = sm.getStats();
      console.log(`${stats.nodeId}: syncing from ${stats.syncingFrom.join(', ') || 'none'}`);
    }
    
    // Generate visualization
    console.log('\nGenerating federation graph...');
    
    const nodes: any[] = [];
    const links: any[] = [];
    
    // Add all sites as nodes
    for (const [name, site] of sites) {
      const fedIndex = federationIndexes.get(site.address)!;
      const entries = await fedIndex.getAllEntries();
      
      nodes.push({
        id: site.address,
        name: name,
        releases: entries.map(e => ({
          id: e.id,
          name: e.title,
          federatedFrom: e.sourceSiteId !== site.address ? e.sourceSiteId : undefined
        }))
      });
    }
    
    // Add subscription relationships as links
    for (const [name, site] of sites) {
      const subs = await site.subscriptions.index.search(new SearchRequest());
      for (const sub of subs) {
        links.push({
          source: sub.value.siteId,
          target: site.address,
          recursive: sub.value.subscriptionType === 'recursive',
          mutual: false
        });
      }
    }
    
    const graphData: FederationGraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName: 'per-lens-federation',
      querySuccessRate: foundRealtime ? 1.0 : 0.0
    };
    
    await generateFederationGraph(graphData);
    console.log('✓ Generated federation graph');
    
    // Assertions
    expect(hub1Entries.length).toBeGreaterThanOrEqual(6); // Should have content from creators 1 and 2
    expect(totalWork).toBe(2); // Should be syncing from 2 creators initially
    expect(foundRealtime).toBe(true); // Real-time sync should work
    
    console.log('\n✓ Per-lens federation test completed!');
  }, 60000);
});