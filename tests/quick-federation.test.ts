import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  Site,
  Release,
  Subscription,
  LensService,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  DEDICATED_SITE_ARGS,
  ADMIN_SITE_ARGS,
} from '../src/index';
import type { ReleaseData, SubscriptionData } from '../src/types';
import type { WithContext } from '@peerbit/document';
import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { delay } from './utils';

describe('Quick Federation Test', () => {
  let peers: Peerbit[] = [];
  let services: LensService[] = [];
  let sites: Site[] = [];

  const createPeer = async (): Promise<{ peer: Peerbit; service: LensService; site?: Site }> => {
    const peer = await Peerbit.create();
    const service = new LensService(peer);
    peers.push(peer);
    services.push(service);
    return { peer, service };
  };

  const cleanup = async () => {
    console.log(`Cleaning up ${sites.length} sites, ${services.length} services, ${peers.length} peers...`);
    
    // Close all sites
    for (const site of sites) {
      try {
        await site.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    // Close all services
    for (const service of services) {
      try {
        if (service.siteProgram) {
          await service.siteProgram.close();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    // Stop all peers
    for (const peer of peers) {
      try {
        await peer.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    // Clear arrays
    peers = [];
    services = [];
    sites = [];
  };

  afterAll(async () => {
    await cleanup();
  });

  test('quick parallel sync test - 20 nodes', async () => {
    console.log('Starting Quick Parallel Sync Test...');
    
    const startTime = Date.now();
    const results = {
      nodesCreated: 0,
      releasesCreated: 0,
      connectionsEstablished: 0,
      subscriptionsCreated: 0,
      syncSuccess: 0,
    };

    try {
      const targetNodes = 20; // Smaller scale for quick test
      
      // ========== PRE-SETUP STAGE ==========
      console.log('\n========== PRE-SETUP STAGE ==========');
      console.log(`Creating ${targetNodes} nodes with releases in parallel...`);
      
      const nodeCreationPromises = [];
      for (let i = 0; i < targetNodes; i++) {
        nodeCreationPromises.push(
          (async (nodeId: number) => {
            try {
              const { peer, service } = await createPeer();
              const site = new Site(peer.identity.publicKey);
              await service.openSite(site, ADMIN_SITE_ARGS);
              
              // Pre-populate with 1-2 releases
              const releaseCount = Math.floor(Math.random() * 2) + 1;
              const releases = [];
              for (let r = 0; r < releaseCount; r++) {
                const release = await service.addRelease({
                  [RELEASE_NAME_PROPERTY]: `Node ${nodeId} Release ${r}`,
                  [RELEASE_CATEGORY_ID_PROPERTY]: 'quick-test',
                  [RELEASE_CONTENT_CID_PROPERTY]: `QmNode${nodeId}Release${r}`,
                });
                if (release.success && release.id) {
                  releases.push(release.id);
                }
              }
              
              return {
                nodeId,
                peer,
                service,
                site,
                releases,
                subscriptions: [],
                receivedContent: new Set<string>(),
              };
            } catch (error) {
              console.error(`Failed to create node ${nodeId}:`, error);
              return null;
            }
          })(i)
        );
      }
      
      const nodeResults = await Promise.all(nodeCreationPromises);
      const peersAndServices: Array<{ 
        peer: Peerbit; 
        service: LensService; 
        site: Site;
        releases: string[];
        subscriptions: string[];
        receivedContent: Set<string>;
      }> = [];
      
      for (let i = 0; i < targetNodes; i++) {
        const result = nodeResults[i];
        if (result && result.nodeId === i) {
          peersAndServices[i] = result;
          sites.push(result.site);
          results.nodesCreated++;
          results.releasesCreated += result.releases.length;
        }
      }
      
      console.log(`✓ Created ${results.nodesCreated} nodes with ${results.releasesCreated} releases`);

      // ========== SETUP RELATIONSHIPS ==========
      console.log('\n========== SETUP RELATIONSHIPS ==========');
      
      // Simple ring topology with some cross-connections
      const followGraph: Map<number, Set<number>> = new Map();
      const recursiveFollows: Map<number, Set<number>> = new Map();
      
      for (let i = 0; i < results.nodesCreated; i++) {
        followGraph.set(i, new Set());
        recursiveFollows.set(i, new Set());
        
        // Follow next 2 nodes in ring
        followGraph.get(i)!.add((i + 1) % results.nodesCreated);
        followGraph.get(i)!.add((i + 2) % results.nodesCreated);
        
        // Make first follow recursive
        recursiveFollows.get(i)!.add((i + 1) % results.nodesCreated);
        
        // Add one random cross-connection
        const randomTarget = Math.floor(Math.random() * results.nodesCreated);
        if (randomTarget !== i) {
          followGraph.get(i)!.add(randomTarget);
        }
      }
      
      console.log(`✓ Created follow graph with ring + cross connections`);

      // ========== PARALLEL SYNC SETUP ==========
      console.log('\n========== PARALLEL SYNC SETUP ==========');
      
      // Connect all peers
      const connectionPromises = [];
      for (let i = 0; i < results.nodesCreated; i++) {
        const toConnect = followGraph.get(i) || new Set();
        for (const targetIndex of toConnect) {
          connectionPromises.push(
            peersAndServices[i].peer.dial(peersAndServices[targetIndex].peer.getMultiaddrs())
              .then(() => results.connectionsEstablished++)
              .catch(() => {})
          );
        }
      }
      
      await Promise.all(connectionPromises);
      console.log(`✓ Established ${results.connectionsEstablished} connections`);
      
      // Create subscriptions
      const subscriptionPromises = [];
      for (let i = 0; i < results.nodesCreated; i++) {
        const toFollow = followGraph.get(i) || new Set();
        const recursiveTargets = recursiveFollows.get(i) || new Set();
        
        subscriptionPromises.push(
          (async () => {
            try {
              for (const targetIndex of toFollow) {
                const subscription: SubscriptionData = {
                  id: '',
                  [SUBSCRIPTION_SITE_ID_PROPERTY]: peersAndServices[targetIndex].site.address,
                  [SUBSCRIPTION_NAME_PROPERTY]: `Node ${targetIndex}`,
                  [SUBSCRIPTION_RECURSIVE_PROPERTY]: recursiveTargets.has(targetIndex),
                  subscriptionType: 'direct',
                  currentDepth: 0,
                  followChain: [peersAndServices[i].site.address],
                };
                
                await peersAndServices[i].service.addSubscription(subscription);
                results.subscriptionsCreated++;
              }
              return true;
            } catch (error) {
              return false;
            }
          })()
        );
      }
      
      const syncResults = await Promise.all(subscriptionPromises);
      results.syncSuccess = syncResults.filter(r => r).length;
      console.log(`✓ Setup sync for ${results.syncSuccess}/${results.nodesCreated} nodes`);

      // ========== VERIFY SYNC ==========
      console.log('\n========== VERIFY SYNC ==========');
      console.log('Waiting 5 seconds for sync...');
      await delay(5000);
      
      // Check content propagation
      let totalExpected = 0;
      let totalReceived = 0;
      
      for (let i = 0; i < results.nodesCreated; i++) {
        const releases = await peersAndServices[i].service.getReleases();
        const quickReleases = releases.filter(r => r[RELEASE_CATEGORY_ID_PROPERTY] === 'quick-test');
        
        // Calculate expected content
        const directFollows = followGraph.get(i) || new Set();
        let expectedCount = peersAndServices[i].releases.length; // Own content
        
        for (const followed of directFollows) {
          expectedCount += peersAndServices[followed].releases.length;
        }
        
        // Check recursive follows
        if (recursiveFollows.get(i)!.size > 0) {
          const nextNode = (i + 1) % results.nodesCreated;
          const nextFollows = followGraph.get(nextNode) || new Set();
          for (const deepFollowed of nextFollows) {
            if (deepFollowed !== i) { // Avoid cycles
              expectedCount += peersAndServices[deepFollowed].releases.length;
            }
          }
        }
        
        totalExpected += expectedCount;
        totalReceived += quickReleases.length;
      }
      
      const syncRatio = totalReceived / totalExpected;
      console.log(`✓ Sync ratio: ${(syncRatio * 100).toFixed(1)}% (${totalReceived}/${totalExpected} releases)`);

      // Final results
      const totalTime = Date.now() - startTime;
      console.log('\n========== QUICK TEST RESULTS ==========');
      console.log(`Total time: ${Math.round(totalTime / 1000)}s`);
      console.log(`Nodes: ${results.nodesCreated}`);
      console.log(`Releases: ${results.releasesCreated}`);
      console.log(`Connections: ${results.connectionsEstablished}`);
      console.log(`Subscriptions: ${results.subscriptionsCreated}`);
      console.log(`Sync success: ${(syncRatio * 100).toFixed(1)}%`);
      console.log('=====================================\n');

      // Test passes if sync is reasonably good
      expect(syncRatio).toBeGreaterThan(0.7); // 70% sync minimum
      expect(results.nodesCreated).toBe(targetNodes);

    } finally {
      await cleanup();
    }
  }, 60000); // 1 minute timeout
});