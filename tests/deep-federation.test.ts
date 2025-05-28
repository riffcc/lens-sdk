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

describe('Deep Federation and Scale Testing', () => {
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

  test('linear chain federation - 5 deep', async () => {
    try {
      const chainLength = 5;
      const peersAndServices: Array<{ peer: Peerbit; service: LensService; site: Site }> = [];

      // Create chain of peers: A -> B -> C -> D -> E
      for (let i = 0; i < chainLength; i++) {
        const { peer, service } = await createPeer();
        const site = new Site(peer.identity.publicKey);
        sites.push(site);
        await service.openSite(site, ADMIN_SITE_ARGS);
        peersAndServices.push({ peer, service, site });
      }

      // Connect peers in chain
      for (let i = 1; i < chainLength; i++) {
        await peersAndServices[i].peer.dial(peersAndServices[i - 1].peer.getMultiaddrs());
        
        // Create subscription
        const subscription: SubscriptionData = {
          id: '',
          [SUBSCRIPTION_SITE_ID_PROPERTY]: peersAndServices[i - 1].site.address,
          [SUBSCRIPTION_NAME_PROPERTY]: `Site ${i - 1}`,
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: true, // Enable recursive following
          subscriptionType: 'direct',
          currentDepth: 0,
          followChain: [peersAndServices[i].site.address],
        };
        
        await peersAndServices[i].service.addSubscription(subscription);
      }

      // Add content to the first site in chain
      const originalRelease = await peersAndServices[0].service.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Chain Test Content',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmChainTest123',
        federatedFrom: peersAndServices[0].site.address,
        federatedAt: new Date().toISOString(),
      });

      expect(originalRelease.success).toBe(true);

      // Wait for content to propagate through the chain
      await waitFor(
        async () => {
          const lastPeerReleases = await peersAndServices[chainLength - 1].service.getReleases();
          return lastPeerReleases.some(r => r[RELEASE_NAME_PROPERTY] === 'Chain Test Content');
        },
        { timeout: 30000, delayInterval: 1000 }
      );

      // Verify content reached the end of chain
      const lastPeerReleases = await peersAndServices[chainLength - 1].service.getReleases();
      const propagatedRelease = lastPeerReleases.find(r => r[RELEASE_NAME_PROPERTY] === 'Chain Test Content');
      expect(propagatedRelease).toBeDefined();
      expect(propagatedRelease?.federatedFrom).toBe(peersAndServices[0].site.address);

      // Test deletion propagation
      await peersAndServices[0].service.deleteRelease({ id: originalRelease.id! });

      // Wait for deletion to propagate
      await waitFor(
        async () => {
          const lastPeerReleases = await peersAndServices[chainLength - 1].service.getReleases();
          return !lastPeerReleases.some(r => r[RELEASE_NAME_PROPERTY] === 'Chain Test Content');
        },
        { timeout: 30000, delayInterval: 1000 }
      );

      // Verify deletion reached the end
      const finalReleases = await peersAndServices[chainLength - 1].service.getReleases();
      expect(finalReleases.find(r => r[RELEASE_NAME_PROPERTY] === 'Chain Test Content')).toBeUndefined();

    } finally {
      await cleanup();
    }
  }, 60000);

  test('mesh federation - fully connected 10 nodes', async () => {
    try {
      const nodeCount = 10;
      const peersAndServices: Array<{ peer: Peerbit; service: LensService; site: Site }> = [];

      // Create nodes
      for (let i = 0; i < nodeCount; i++) {
        const { peer, service } = await createPeer();
        const site = new Site(peer.identity.publicKey);
        sites.push(site);
        await service.openSite(site, ADMIN_SITE_ARGS);
        peersAndServices.push({ peer, service, site });
      }

      // Connect all nodes to each other (full mesh)
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          await peersAndServices[j].peer.dial(peersAndServices[i].peer.getMultiaddrs());
        }
      }

      // Each node subscribes to 3 random other nodes
      for (let i = 0; i < nodeCount; i++) {
        const subscribeToCount = 3;
        const alreadySubscribed = new Set<number>();
        
        for (let s = 0; s < subscribeToCount; s++) {
          let targetIndex: number;
          do {
            targetIndex = Math.floor(Math.random() * nodeCount);
          } while (targetIndex === i || alreadySubscribed.has(targetIndex));
          
          alreadySubscribed.add(targetIndex);
          
          const subscription: SubscriptionData = {
            id: '',
            [SUBSCRIPTION_SITE_ID_PROPERTY]: peersAndServices[targetIndex].site.address,
            [SUBSCRIPTION_NAME_PROPERTY]: `Node ${targetIndex}`,
            [SUBSCRIPTION_RECURSIVE_PROPERTY]: Math.random() > 0.5, // 50% recursive
            subscriptionType: 'direct',
            currentDepth: 0,
            followChain: [peersAndServices[i].site.address],
          };
          
          await peersAndServices[i].service.addSubscription(subscription);
        }
      }

      // Add content from multiple nodes simultaneously
      const releasePromises = [];
      for (let i = 0; i < 5; i++) {
        releasePromises.push(
          peersAndServices[i].service.addRelease({
            [RELEASE_NAME_PROPERTY]: `Mesh Content from Node ${i}`,
            [RELEASE_CATEGORY_ID_PROPERTY]: 'mesh-test',
            [RELEASE_CONTENT_CID_PROPERTY]: `QmMeshNode${i}`,
          })
        );
      }

      const releases = await Promise.all(releasePromises);
      releases.forEach(r => expect(r.success).toBe(true));

      // Wait for content to propagate across the mesh
      await delay(10000);

      // Check propagation coverage
      let totalPropagation = 0;
      for (let i = 0; i < nodeCount; i++) {
        const nodeReleases = await peersAndServices[i].service.getReleases();
        const meshReleases = nodeReleases.filter(r => 
          r[RELEASE_CATEGORY_ID_PROPERTY] === 'mesh-test'
        );
        totalPropagation += meshReleases.length;
      }

      // In a well-connected mesh, most nodes should see most content
      const expectedMinPropagation = nodeCount * 3; // At least 3 releases per node on average
      expect(totalPropagation).toBeGreaterThanOrEqual(expectedMinPropagation);

      console.log(`Mesh federation: ${totalPropagation} total content instances across ${nodeCount} nodes`);

    } finally {
      await cleanup();
    }
  }, 120000);

  test('tree federation - hierarchical structure', async () => {
    try {
      // Create a tree structure:
      //        Root
      //       /    \
      //      A      B
      //     / \    / \
      //    C   D  E   F
      
      const treeNodes: Array<{ peer: Peerbit; service: LensService; site: Site; children: number[] }> = [];
      const treeStructure = [
        { id: 0, parent: -1, name: 'Root' },
        { id: 1, parent: 0, name: 'A' },
        { id: 2, parent: 0, name: 'B' },
        { id: 3, parent: 1, name: 'C' },
        { id: 4, parent: 1, name: 'D' },
        { id: 5, parent: 2, name: 'E' },
        { id: 6, parent: 2, name: 'F' },
      ];

      // Create nodes
      for (const node of treeStructure) {
        const { peer, service } = await createPeer();
        const site = new Site(peer.identity.publicKey);
        sites.push(site);
        await service.openSite(site, ADMIN_SITE_ARGS);
        treeNodes.push({ peer, service, site, children: [] });
      }

      // Connect and subscribe based on tree structure
      for (const node of treeStructure) {
        if (node.parent >= 0) {
          // Connect to parent
          await treeNodes[node.id].peer.dial(treeNodes[node.parent].peer.getMultiaddrs());
          
          // Subscribe to parent with recursive following
          const subscription: SubscriptionData = {
            id: '',
            [SUBSCRIPTION_SITE_ID_PROPERTY]: treeNodes[node.parent].site.address,
            [SUBSCRIPTION_NAME_PROPERTY]: treeStructure[node.parent].name,
            [SUBSCRIPTION_RECURSIVE_PROPERTY]: true,
            subscriptionType: 'direct',
            currentDepth: 0,
            followChain: [treeNodes[node.id].site.address],
          };
          
          await treeNodes[node.id].service.addSubscription(subscription);
          treeNodes[node.parent].children.push(node.id);
        }
      }

      // Add content at root
      const rootRelease = await treeNodes[0].service.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Root Broadcast',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'tree-test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmRootBroadcast',
      });

      expect(rootRelease.success).toBe(true);

      // Wait for propagation to leaves
      await waitFor(
        async () => {
          const leafChecks = [3, 4, 5, 6].map(async (leafId) => {
            const releases = await treeNodes[leafId].service.getReleases();
            return releases.some(r => r[RELEASE_NAME_PROPERTY] === 'Root Broadcast');
          });
          const results = await Promise.all(leafChecks);
          return results.every(r => r === true);
        },
        { timeout: 30000, delayInterval: 1000 }
      );

      // Add content at a leaf and verify it doesn't propagate up
      const leafRelease = await treeNodes[6].service.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Leaf Content F',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'tree-test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmLeafF',
      });

      await delay(5000);

      // Root should not have leaf content
      const rootReleases = await treeNodes[0].service.getReleases();
      expect(rootReleases.find(r => r[RELEASE_NAME_PROPERTY] === 'Leaf Content F')).toBeUndefined();

      // But sibling through parent should have it if recursive is working
      // (F -> B -> E, if B has recursive subscription to F)

    } finally {
      await cleanup();
    }
  }, 90000);

  test('the big kahuna - maximum scale test', async () => {
    console.log('Starting Big Kahuna test - massive parallel sync test...');
    
    const startTime = Date.now();
    let maxSuccessfulNodes = 0;
    const results = {
      nodesCreated: 0,
      releasesCreated: 0,
      connectionsEstablished: 0,
      subscriptionsCreated: 0,
      syncSuccess: 0,
      memoryUsage: process.memoryUsage(),
    };

    try {
      const targetNodes = 100; // Try to create 100 nodes
      
      // ========== PRE-SETUP STAGE: Create all nodes, stores, and releases in parallel ==========
      console.log('\n========== PRE-SETUP STAGE ==========');
      console.log(`Creating ${targetNodes} nodes with stores and releases in parallel...`);
      
      const nodeCreationPromises = [];
      for (let i = 0; i < targetNodes; i++) {
        nodeCreationPromises.push(
          (async (nodeId: number) => {
            try {
              // Create peer and service
              const { peer, service } = await createPeer();
              const site = new Site(peer.identity.publicKey);
              await service.openSite(site, DEDICATED_SITE_ARGS);
              
              // Pre-populate with some releases
              const releaseCount = Math.floor(Math.random() * 3) + 1; // 1-3 releases per node
              const releases = [];
              for (let r = 0; r < releaseCount; r++) {
                const release = await service.addRelease({
                  [RELEASE_NAME_PROPERTY]: `Node ${nodeId} Release ${r}`,
                  [RELEASE_CATEGORY_ID_PROPERTY]: 'kahuna-test',
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
                followDepths: new Map<number, number>(), // Track follow depths
              };
            } catch (error) {
              console.error(`Failed to create node ${nodeId}:`, error);
              return null;
            }
          })(i)
        );
      }
      
      // Wait for all nodes to be created
      const nodeResults = await Promise.all(nodeCreationPromises);
      const peersAndServices: Array<{ 
        peer: Peerbit; 
        service: LensService; 
        site: Site;
        releases: string[];
        subscriptions: string[];
        receivedContent: Set<string>;
        followDepths: Map<number, number>;
      }> = [];
      
      // Process results and count successes
      for (let i = 0; i < targetNodes; i++) {
        const result = nodeResults[i];
        if (result && result.nodeId === i) {
          peersAndServices[i] = result;
          sites.push(result.site);
          results.nodesCreated++;
          results.releasesCreated += result.releases.length;
        }
      }
      
      console.log(`✓ Created ${results.nodesCreated} nodes with ${results.releasesCreated} total releases`);
      const memUsage1 = process.memoryUsage();
      console.log(`Memory usage: RSS ${Math.round(memUsage1.rss / 1024 / 1024)}MB, Heap ${Math.round(memUsage1.heapUsed / 1024 / 1024)}MB`);

      if (results.nodesCreated < 10) {
        throw new Error(`Could only create ${results.nodesCreated} nodes, need at least 10 for meaningful test`);
      }

      // ========== INTERMEDIATE STAGE: Calculate follow relationships and deep follows ==========
      console.log('\n========== INTERMEDIATE STAGE ==========');
      console.log('Calculating follow relationships and deep follow chains...');
      
      // Create follow graph with deep following possibilities
      const followGraph: Map<number, Set<number>> = new Map();
      const recursiveFollows: Map<number, Set<number>> = new Map();
      
      // Build a small-world network with some deep follow chains
      for (let i = 0; i < results.nodesCreated; i++) {
        followGraph.set(i, new Set());
        recursiveFollows.set(i, new Set());
        
        // Each node follows 2-5 others
        const followCount = Math.floor(Math.random() * 4) + 2;
        
        // Follow some nearby nodes (creates chains)
        for (let j = 1; j <= Math.min(2, followCount); j++) {
          const targetIndex = (i + j) % results.nodesCreated;
          followGraph.get(i)!.add(targetIndex);
          
          // 40% chance of recursive follow
          if (Math.random() < 0.4) {
            recursiveFollows.get(i)!.add(targetIndex);
          }
        }
        
        // Follow some random distant nodes (creates mesh)
        for (let j = followGraph.get(i)!.size; j < followCount; j++) {
          const targetIndex = Math.floor(Math.random() * results.nodesCreated);
          if (targetIndex !== i && !followGraph.get(i)!.has(targetIndex)) {
            followGraph.get(i)!.add(targetIndex);
            
            // 30% chance of recursive follow for distant nodes
            if (Math.random() < 0.3) {
              recursiveFollows.get(i)!.add(targetIndex);
            }
          }
        }
      }
      
      // Calculate deep follow depths (BFS to find all reachable nodes via recursive follows)
      console.log('Calculating deep follow depths...');
      for (let i = 0; i < results.nodesCreated; i++) {
        const visited = new Set<number>();
        const queue: Array<{node: number, depth: number}> = [{node: i, depth: 0}];
        
        while (queue.length > 0) {
          const {node, depth} = queue.shift()!;
          if (visited.has(node)) continue;
          visited.add(node);
          
          if (node !== i) {
            peersAndServices[i].followDepths.set(node, depth);
          }
          
          // Only follow recursive subscriptions for depth calculation
          if (recursiveFollows.has(node)) {
            for (const target of recursiveFollows.get(node)!) {
              if (!visited.has(target) && depth < 5) { // Max depth 5
                queue.push({node: target, depth: depth + 1});
              }
            }
          }
        }
      }
      
      const totalFollows = Array.from(followGraph.values()).reduce((sum, set) => sum + set.size, 0);
      const totalRecursive = Array.from(recursiveFollows.values()).reduce((sum, set) => sum + set.size, 0);
      console.log(`✓ Created follow graph: ${totalFollows} total follows, ${totalRecursive} recursive`);
      console.log(`Average follow degree: ${(totalFollows / results.nodesCreated).toFixed(1)}`);
      
      // ========== FINAL TEST STAGE: Establish all sync relationships in parallel ==========
      console.log('\n========== FINAL TEST STAGE ==========');
      console.log('Establishing all connections and sync relationships in parallel...');
      
      // Phase 1: Connect all peers in parallel
      const connectionPromises = [];
      for (let i = 0; i < results.nodesCreated; i++) {
        const toConnect = followGraph.get(i) || new Set();
        for (const targetIndex of toConnect) {
          connectionPromises.push(
            peersAndServices[i].peer.dial(peersAndServices[targetIndex].peer.getMultiaddrs())
              .then(() => {
                results.connectionsEstablished++;
              })
              .catch(() => {
                // Silent fail, will be reflected in sync success
              })
          );
        }
      }
      
      await Promise.all(connectionPromises);
      console.log(`✓ Established ${results.connectionsEstablished} P2P connections`);
      
      // Phase 2: Create all subscriptions with sync managers in parallel
      const subscriptionPromises = [];
      for (let i = 0; i < results.nodesCreated; i++) {
        const toFollow = followGraph.get(i) || new Set();
        const recursiveTargets = recursiveFollows.get(i) || new Set();
        
        // Build subscription batch for this node
        const subscriptions: SubscriptionData[] = [];
        for (const targetIndex of toFollow) {
          subscriptions.push({
            id: '',
            [SUBSCRIPTION_SITE_ID_PROPERTY]: peersAndServices[targetIndex].site.address,
            [SUBSCRIPTION_NAME_PROPERTY]: `Node ${targetIndex}`,
            [SUBSCRIPTION_RECURSIVE_PROPERTY]: recursiveTargets.has(targetIndex),
            subscriptionType: 'direct',
            currentDepth: 0,
            followChain: [peersAndServices[i].site.address],
          });
        }
        
        // Setup sync for all subscriptions at once
        subscriptionPromises.push(
          (async () => {
            try {
              // Add all subscriptions
              for (const sub of subscriptions) {
                await peersAndServices[i].service.addSubscription(sub);
                peersAndServices[i].subscriptions.push(sub[SUBSCRIPTION_SITE_ID_PROPERTY]);
                results.subscriptionsCreated++;
              }
              
              // Initialize sync manager if not already done
              if (peersAndServices[i].service.syncManager) {
                await peersAndServices[i].service.syncManager.setupSubscriptionSync(subscriptions);
              }
              
              return true;
            } catch (error) {
              console.debug(`Failed to setup sync for node ${i}:`, error);
              return false;
            }
          })()
        );
      }
      
      const syncResults = await Promise.all(subscriptionPromises);
      results.syncSuccess = syncResults.filter(r => r).length;
      console.log(`✓ Successfully setup sync for ${results.syncSuccess}/${results.nodesCreated} nodes`);
      console.log(`✓ Created ${results.subscriptionsCreated} total subscriptions`);

      // ========== VERIFICATION STAGE: Check sync success ==========
      console.log('\n========== VERIFICATION STAGE ==========');
      console.log('Waiting for sync to propagate and checking results...');
      
      // Give sync some time to work
      await delay(10000); // 10 seconds for initial sync
      
      // Check sync success by verifying content propagation
      console.log('Checking content propagation across the network...');
      
      const verificationPromises = [];
      for (let i = 0; i < results.nodesCreated; i++) {
        verificationPromises.push(
          (async (nodeIndex: number) => {
            try {
              const releases = await peersAndServices[nodeIndex].service.getReleases();
              const kahunaReleases = releases.filter(r => 
                r[RELEASE_CATEGORY_ID_PROPERTY] === 'kahuna-test'
              );
              
              // Count unique content received
              const uniqueContent = new Set<string>();
              for (const release of kahunaReleases) {
                uniqueContent.add(release[RELEASE_CONTENT_CID_PROPERTY]);
              }
              
              // Check expected vs actual based on follow graph
              const directFollows = followGraph.get(nodeIndex) || new Set();
              const expectedContent = new Set<string>();
              
              // Own content
              for (const releaseId of peersAndServices[nodeIndex].releases) {
                expectedContent.add(`QmNode${nodeIndex}Release${peersAndServices[nodeIndex].releases.indexOf(releaseId)}`);
              }
              
              // Direct follow content
              for (const followedNode of directFollows) {
                for (let r = 0; r < peersAndServices[followedNode].releases.length; r++) {
                  expectedContent.add(`QmNode${followedNode}Release${r}`);
                }
              }
              
              // Deep follow content (if recursive)
              const recursiveTargets = recursiveFollows.get(nodeIndex) || new Set();
              if (recursiveTargets.size > 0) {
                for (const [deepNode, depth] of peersAndServices[nodeIndex].followDepths) {
                  if (depth <= 3) { // Reasonable depth limit
                    for (let r = 0; r < (peersAndServices[deepNode]?.releases.length || 0); r++) {
                      expectedContent.add(`QmNode${deepNode}Release${r}`);
                    }
                  }
                }
              }
              
              return {
                nodeIndex,
                totalReleases: kahunaReleases.length,
                uniqueContent: uniqueContent.size,
                expectedContent: expectedContent.size,
                syncRatio: uniqueContent.size / Math.max(1, expectedContent.size),
                hasOwnContent: peersAndServices[nodeIndex].releases.every(id =>
                  kahunaReleases.some(r => r.id === id)
                ),
              };
            } catch (error) {
              console.debug(`Failed to verify node ${nodeIndex}:`, error);
              return {
                nodeIndex,
                totalReleases: 0,
                uniqueContent: 0,
                expectedContent: 0,
                syncRatio: 0,
                hasOwnContent: false,
              };
            }
          })(i)
        );
      }
      
      const verificationResults = await Promise.all(verificationPromises);
      
      // Analyze results
      let successfulNodes = 0;
      let partialSyncNodes = 0;
      let failedNodes = 0;
      let totalSyncRatio = 0;
      
      for (const result of verificationResults) {
        if (result.syncRatio >= 0.8) {
          successfulNodes++;
        } else if (result.syncRatio >= 0.5) {
          partialSyncNodes++;
        } else {
          failedNodes++;
        }
        totalSyncRatio += result.syncRatio;
      }
      
      maxSuccessfulNodes = successfulNodes;
      const avgSyncRatio = totalSyncRatio / results.nodesCreated;

      // Final results
      const totalTime = Date.now() - startTime;
      results.memoryUsage = process.memoryUsage();

      console.log('\n========== BIG KAHUNA RESULTS ==========');
      console.log(`Total test duration: ${Math.round(totalTime / 1000)}s`);
      console.log(`\nNetwork Statistics:`);
      console.log(`  • Nodes created: ${results.nodesCreated}`);
      console.log(`  • Total releases: ${results.releasesCreated}`);
      console.log(`  • P2P connections: ${results.connectionsEstablished}`);
      console.log(`  • Subscriptions: ${results.subscriptionsCreated}`);
      console.log(`  • Avg connections per node: ${(results.connectionsEstablished / results.nodesCreated).toFixed(1)}`);
      console.log(`  • Avg subscriptions per node: ${(results.subscriptionsCreated / results.nodesCreated).toFixed(1)}`);
      
      console.log(`\nSync Performance:`);
      console.log(`  • Successful sync (>80%): ${successfulNodes} nodes`);
      console.log(`  • Partial sync (50-80%): ${partialSyncNodes} nodes`);
      console.log(`  • Failed sync (<50%): ${failedNodes} nodes`);
      console.log(`  • Average sync ratio: ${(avgSyncRatio * 100).toFixed(1)}%`);
      
      console.log(`\nResource Usage:`);
      console.log(`  • Memory RSS: ${Math.round(results.memoryUsage.rss / 1024 / 1024)}MB`);
      console.log(`  • Memory Heap: ${Math.round(results.memoryUsage.heapUsed / 1024 / 1024)}MB`);
      
      console.log(`\n🏆 MAXIMUM SUCCESSFUL FEDERATION: ${maxSuccessfulNodes} nodes with >80% sync`);
      console.log('========================================\n');

      // The test passes if we can handle at least 10 nodes with good sync
      expect(maxSuccessfulNodes).toBeGreaterThanOrEqual(10);
      expect(avgSyncRatio).toBeGreaterThan(0.5); // At least 50% average sync
      
      // Warn if we couldn't reach our target
      if (results.nodesCreated < targetNodes) {
        console.warn(`⚠️  Could only create ${results.nodesCreated} out of ${targetNodes} target nodes`);
      }

    } finally {
      console.log('Cleaning up Big Kahuna test...');
      await cleanup();
    }
  }, 300000); // 5 minute timeout for the big test
});