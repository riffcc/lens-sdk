import { describe, test, expect, beforeAll, afterEach } from '@jest/globals';
import {
  Site,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  ADMIN_SITE_ARGS,
} from '../src/index';
import type { ReleaseData, SubscriptionData } from '../src/types';
import { waitFor } from '@peerbit/time';
import { delay } from './utils';
import { SingleProcessPeerManager } from './multi-threaded-peer';
import { FederationTimingGraphBuilder } from './federation-timing-graph';

describe('Federation Spectrum Tests', () => {
  let manager: SingleProcessPeerManager;
  let graphBuilder: FederationTimingGraphBuilder;

  afterEach(async () => {
    if (graphBuilder) {
      await graphBuilder.generateFinalReport();
    }
    if (manager) {
      await manager.shutdownAll();
    }
  });

  test('1:1 basic federation - single follower', async () => {
    const basePort = 20000;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('1-1-basic-federation', 5000);
    
    await manager.createPeers(2);
    
    // Add nodes to graph
    manager.getAllPeers().forEach((peer, i) => {
      graphBuilder.addNode(peer.service, i === 0 ? 'Main Site' : 'Follower Site');
    });

    // Connect peers
    await manager.connectPeers('star', 0);
    await delay(1000);

    // Capture initial state
    await graphBuilder.captureSnapshot('initial');

    // Follower subscribes to main
    const subscription: SubscriptionData = {
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Main Site',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(1)],
    };

    const subResult = await manager.getService(1).addSubscription(subscription);
    expect(subResult.success).toBe(true);
    
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(1), manager.getSiteAddress(0));
    await graphBuilder.captureSnapshot('post-subscription');

    // Add content to main site
    const release = await manager.getService(0).addRelease({
      [RELEASE_NAME_PROPERTY]: '1:1 Test Content',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
      [RELEASE_CONTENT_CID_PROPERTY]: 'Qm1to1TestContent',
    });
    expect(release.success).toBe(true);
    
    graphBuilder.recordContentAdded(manager.getSiteAddress(0), release.id, '1:1 Test Content');

    // Wait for sync
    await waitFor(
      async () => {
        const releases = await manager.getService(1).getReleases();
        const synced = releases.some(r => r[RELEASE_NAME_PROPERTY] === '1:1 Test Content');
        
        if (synced && releases.length > 0) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(1),
            manager.getSiteAddress(0),
            releases[0].id,
            '1:1 Test Content'
          );
        }
        
        return synced;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify sync
    const followerReleases = await manager.getService(1).getReleases();
    expect(followerReleases).toHaveLength(1);
    expect(followerReleases[0][RELEASE_NAME_PROPERTY]).toBe('1:1 Test Content');
    expect(followerReleases[0].federatedFrom).toBe(manager.getSiteAddress(0));
  }, 30000);

  test('1:2 federation - two followers', async () => {
    const basePort = 20010;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('1-2-federation', 5000);
    
    await manager.createPeers(3);
    
    // Add nodes to graph
    manager.getAllPeers().forEach((peer, i) => {
      graphBuilder.addNode(peer.service, i === 0 ? 'Main Site' : `Follower ${i}`);
    });

    // Connect peers
    await manager.connectPeers('star', 0);
    await delay(1000);

    await graphBuilder.captureSnapshot('initial');

    // Both followers subscribe to main
    const subscribePromises = [];
    for (let i = 1; i <= 2; i++) {
      const subscription: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
        [SUBSCRIPTION_NAME_PROPERTY]: 'Main Site',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [manager.getSiteAddress(i)],
      };
      subscribePromises.push(manager.getService(i).addSubscription(subscription));
      graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(i), manager.getSiteAddress(0));
    }

    await Promise.all(subscribePromises);
    await graphBuilder.captureSnapshot('post-subscriptions');

    // Add content
    const release = await manager.getService(0).addRelease({
      [RELEASE_NAME_PROPERTY]: '1:2 Test Content',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
      [RELEASE_CONTENT_CID_PROPERTY]: 'Qm1to2TestContent',
    });
    expect(release.success).toBe(true);
    
    graphBuilder.recordContentAdded(manager.getSiteAddress(0), release.id, '1:2 Test Content');

    // Wait for sync to both followers
    await waitFor(
      async () => {
        const [releases1, releases2] = await Promise.all([
          manager.getService(1).getReleases(),
          manager.getService(2).getReleases()
        ]);
        
        const synced1 = releases1.some(r => r[RELEASE_NAME_PROPERTY] === '1:2 Test Content');
        const synced2 = releases2.some(r => r[RELEASE_NAME_PROPERTY] === '1:2 Test Content');
        
        if (synced1 && !graphBuilder['syncEvents'].some(e => e.targetNode === manager.getSiteAddress(1))) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(1),
            manager.getSiteAddress(0),
            release.id,
            '1:2 Test Content'
          );
        }
        
        if (synced2 && !graphBuilder['syncEvents'].some(e => e.targetNode === manager.getSiteAddress(2))) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(2),
            manager.getSiteAddress(0),
            release.id,
            '1:2 Test Content'
          );
        }
        
        return synced1 && synced2;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify both followers received the content
    const [releases1, releases2] = await Promise.all([
      manager.getService(1).getReleases(),
      manager.getService(2).getReleases()
    ]);

    expect(releases1).toHaveLength(1);
    expect(releases2).toHaveLength(1);
    expect(releases1[0][RELEASE_NAME_PROPERTY]).toBe('1:2 Test Content');
    expect(releases2[0][RELEASE_NAME_PROPERTY]).toBe('1:2 Test Content');
  }, 30000);

  test('1:5 federation - five followers', async () => {
    const basePort = 20020;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('1-5-federation', 3000);
    
    await manager.createPeers(6);
    
    // Add nodes to graph
    manager.getAllPeers().forEach((peer, i) => {
      graphBuilder.addNode(peer.service, i === 0 ? 'Main Site' : `Follower ${i}`);
    });

    // Connect all followers to main
    await manager.connectPeers('star', 0);
    await delay(2000);

    await graphBuilder.captureSnapshot('initial');

    // All 5 followers subscribe to site 0
    const subscribePromises = [];
    for (let i = 1; i < 6; i++) {
      const subscription: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
        [SUBSCRIPTION_NAME_PROPERTY]: 'Main Site',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [manager.getSiteAddress(i)],
      };
      subscribePromises.push(manager.getService(i).addSubscription(subscription));
      graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(i), manager.getSiteAddress(0));
    }

    await Promise.all(subscribePromises);
    await graphBuilder.captureSnapshot('post-subscriptions');

    // Add multiple pieces of content to main site
    const releasePromises = [];
    for (let i = 0; i < 3; i++) {
      const releaseData = {
        [RELEASE_NAME_PROPERTY]: `1:5 Content ${i}`,
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: `Qm1to5Test${i}`,
      };
      releasePromises.push(manager.getService(0).addRelease(releaseData));
    }

    const releases = await Promise.all(releasePromises);
    releases.forEach((r, i) => {
      expect(r.success).toBe(true);
      graphBuilder.recordContentAdded(manager.getSiteAddress(0), r.id, `1:5 Content ${i}`);
    });

    await graphBuilder.captureSnapshot('post-content-creation');

    // Wait for all content to sync to all followers
    let lastSyncCount = 0;
    await waitFor(
      async () => {
        const checkPromises = [];
        for (let i = 1; i < 6; i++) {
          checkPromises.push(manager.getService(i).getReleases());
        }
        const allReleases = await Promise.all(checkPromises);
        
        // Track sync progress
        allReleases.forEach((followerReleases, followerIndex) => {
          const followerId = followerIndex + 1;
          followerReleases.forEach(release => {
            const releaseId = release.id;
            const releaseName = release[RELEASE_NAME_PROPERTY];
            
            // Check if we've already recorded this sync
            const alreadyRecorded = graphBuilder['syncEvents'].some(e => 
              e.type === 'content-synced' && 
              e.targetNode === manager.getSiteAddress(followerId) &&
              e.releaseId === releaseId
            );
            
            if (!alreadyRecorded && release.federatedFrom) {
              graphBuilder.recordContentSynced(
                manager.getSiteAddress(followerId),
                manager.getSiteAddress(0),
                releaseId,
                releaseName
              );
            }
          });
        });
        
        const syncedCount = allReleases.filter(releases => releases.length === 3).length;
        if (syncedCount !== lastSyncCount) {
          console.log(`[1:5 Federation] Progress: ${syncedCount}/5 followers have all content`);
          lastSyncCount = syncedCount;
          await graphBuilder.captureSnapshot(`progress-${syncedCount}-of-5`);
        }
        
        return allReleases.every(releases => releases.length === 3);
      },
      { timeout: 30000, delayInterval: 2000 }
    );

    // Verify all followers have all content
    for (let i = 1; i < 6; i++) {
      const followerReleases = await manager.getService(i).getReleases();
      expect(followerReleases).toHaveLength(3);
      expect(followerReleases.map(r => r[RELEASE_NAME_PROPERTY]).sort()).toEqual([
        '1:5 Content 0',
        '1:5 Content 1',
        '1:5 Content 2'
      ]);
    }
  }, 60000);

  test('2:2 mutual federation - bidirectional sync', async () => {
    const basePort = 20030;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('2-2-mutual-federation', 3000);
    
    await manager.createPeers(2);
    
    // Add nodes to graph
    graphBuilder.addNode(manager.getService(0), 'Site A');
    graphBuilder.addNode(manager.getService(1), 'Site B');

    // Connect peers
    await manager.connectPeers('full-mesh');
    await delay(1000);

    await graphBuilder.captureSnapshot('initial');

    // Site A follows Site B
    const subscription1: SubscriptionData = {
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(1),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Site B',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(0)],
    };
    await manager.getService(0).addSubscription(subscription1);
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(0), manager.getSiteAddress(1));

    // Site B follows Site A
    const subscription2: SubscriptionData = {
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Site A',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(1)],
    };
    await manager.getService(1).addSubscription(subscription2);
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(1), manager.getSiteAddress(0));

    await graphBuilder.captureSnapshot('post-mutual-subscriptions');

    // Add content from both sites
    const [releaseA, releaseB] = await Promise.all([
      manager.getService(0).addRelease({
        [RELEASE_NAME_PROPERTY]: 'Content from Site A',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'mutual',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmContentA',
      }),
      manager.getService(1).addRelease({
        [RELEASE_NAME_PROPERTY]: 'Content from Site B',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'mutual',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmContentB',
      })
    ]);

    expect(releaseA.success).toBe(true);
    expect(releaseB.success).toBe(true);
    
    graphBuilder.recordContentAdded(manager.getSiteAddress(0), releaseA.id, 'Content from Site A');
    graphBuilder.recordContentAdded(manager.getSiteAddress(1), releaseB.id, 'Content from Site B');

    // Wait for mutual sync
    await waitFor(
      async () => {
        const [releasesA, releasesB] = await Promise.all([
          manager.getService(0).getReleases(),
          manager.getService(1).getReleases()
        ]);
        
        const aHasB = releasesA.some(r => r[RELEASE_NAME_PROPERTY] === 'Content from Site B');
        const bHasA = releasesB.some(r => r[RELEASE_NAME_PROPERTY] === 'Content from Site A');
        
        // Record sync events
        if (aHasB && !graphBuilder['syncEvents'].some(e => 
          e.type === 'content-synced' && e.targetNode === manager.getSiteAddress(0)
        )) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(0),
            manager.getSiteAddress(1),
            releaseB.id,
            'Content from Site B'
          );
        }
        
        if (bHasA && !graphBuilder['syncEvents'].some(e => 
          e.type === 'content-synced' && e.targetNode === manager.getSiteAddress(1)
        )) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(1),
            manager.getSiteAddress(0),
            releaseA.id,
            'Content from Site A'
          );
        }
        
        return aHasB && bHasA;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify both sites have both contents
    const [finalReleasesA, finalReleasesB] = await Promise.all([
      manager.getService(0).getReleases(),
      manager.getService(1).getReleases()
    ]);

    expect(finalReleasesA).toHaveLength(2);
    expect(finalReleasesB).toHaveLength(2);
  }, 30000);

  test('3-node chain with recursive following', async () => {
    const basePort = 20040;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('3-node-chain-recursive', 3000);
    
    await manager.createPeers(3);
    
    // Add nodes to graph
    graphBuilder.addNode(manager.getService(0), 'Node A');
    graphBuilder.addNode(manager.getService(1), 'Node B');
    graphBuilder.addNode(manager.getService(2), 'Node C');

    // Connect in chain: A -> B -> C
    await manager.connectPeers('chain');
    await delay(1000);

    await graphBuilder.captureSnapshot('initial');

    // B follows C (non-recursive)
    const subBC: SubscriptionData = {
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(2),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Node C',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(1)],
    };
    await manager.getService(1).addSubscription(subBC);
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(1), manager.getSiteAddress(2));

    // A follows B (recursive)
    const subAB: SubscriptionData = {
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(1),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Node B',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: true,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(0)],
    };
    await manager.getService(0).addSubscription(subAB);
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(0), manager.getSiteAddress(1));

    await graphBuilder.captureSnapshot('post-subscriptions');

    // Add content to C
    const releaseC = await manager.getService(2).addRelease({
      [RELEASE_NAME_PROPERTY]: 'Content from Node C',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'chain',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmNodeCContent',
    });
    expect(releaseC.success).toBe(true);
    graphBuilder.recordContentAdded(manager.getSiteAddress(2), releaseC.id, 'Content from Node C');

    // Wait for content to propagate through the chain
    await waitFor(
      async () => {
        const releasesB = await manager.getService(1).getReleases();
        const bHasC = releasesB.some(r => r[RELEASE_NAME_PROPERTY] === 'Content from Node C');
        
        if (bHasC && !graphBuilder['syncEvents'].some(e => 
          e.type === 'content-synced' && e.targetNode === manager.getSiteAddress(1)
        )) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(1),
            manager.getSiteAddress(2),
            releaseC.id,
            'Content from Node C'
          );
          await graphBuilder.captureSnapshot('b-received-c-content');
        }
        
        return bHasC;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Wait for A to receive C's content via recursive following
    await waitFor(
      async () => {
        const releasesA = await manager.getService(0).getReleases();
        const aHasC = releasesA.some(r => r[RELEASE_NAME_PROPERTY] === 'Content from Node C');
        
        if (aHasC && !graphBuilder['syncEvents'].some(e => 
          e.type === 'content-synced' && e.targetNode === manager.getSiteAddress(0)
        )) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(0),
            manager.getSiteAddress(1), // Via B
            releaseC.id,
            'Content from Node C'
          );
        }
        
        return aHasC;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify final state
    const [releasesA, releasesB, releasesC] = await Promise.all([
      manager.getService(0).getReleases(),
      manager.getService(1).getReleases(),
      manager.getService(2).getReleases()
    ]);

    expect(releasesA).toHaveLength(1); // C's content via recursive following
    expect(releasesB).toHaveLength(1); // C's content
    expect(releasesC).toHaveLength(1); // Original content
  }, 30000);

  test('star topology - 1 hub with 4 spokes', async () => {
    const basePort = 20050;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('star-topology', 3000);
    
    await manager.createPeers(5);
    
    // Add nodes to graph
    manager.getAllPeers().forEach((peer, i) => {
      graphBuilder.addNode(peer.service, i === 0 ? 'Hub' : `Spoke ${i}`);
    });

    // Connect all spokes to hub
    await manager.connectPeers('star', 0);
    await delay(2000);

    await graphBuilder.captureSnapshot('initial');

    // All spokes follow the hub
    const subscribePromises = [];
    for (let i = 1; i < 5; i++) {
      const subscription: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
        [SUBSCRIPTION_NAME_PROPERTY]: 'Hub',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [manager.getSiteAddress(i)],
      };
      subscribePromises.push(manager.getService(i).addSubscription(subscription));
      graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(i), manager.getSiteAddress(0));
    }

    await Promise.all(subscribePromises);

    // Hub also follows spoke 1 to test bidirectional
    await manager.getService(0).addSubscription({
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(1),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Spoke 1',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(0)],
    });
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(0), manager.getSiteAddress(1));

    await graphBuilder.captureSnapshot('post-subscriptions');

    // Add content from hub and spoke 1
    const [hubRelease, spokeRelease] = await Promise.all([
      manager.getService(0).addRelease({
        [RELEASE_NAME_PROPERTY]: 'Hub Broadcast',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'star',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmHubContent',
      }),
      manager.getService(1).addRelease({
        [RELEASE_NAME_PROPERTY]: 'Spoke 1 Content',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'star',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmSpokeContent',
      })
    ]);

    expect(hubRelease.success).toBe(true);
    expect(spokeRelease.success).toBe(true);
    
    graphBuilder.recordContentAdded(manager.getSiteAddress(0), hubRelease.id, 'Hub Broadcast');
    graphBuilder.recordContentAdded(manager.getSiteAddress(1), spokeRelease.id, 'Spoke 1 Content');

    // Wait for mutual sync between hub and spoke 1
    await waitFor(
      async () => {
        const hubReleases = await manager.getService(0).getReleases();
        const hasSpoke1Content = hubReleases.some(r => r[RELEASE_NAME_PROPERTY] === 'Spoke 1 Content');
        
        if (hasSpoke1Content && !graphBuilder['syncEvents'].some(e => 
          e.type === 'content-synced' && e.targetNode === manager.getSiteAddress(0)
        )) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(0),
            manager.getSiteAddress(1),
            spokeRelease.id,
            'Spoke 1 Content'
          );
        }
        
        return hasSpoke1Content;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    await graphBuilder.captureSnapshot('hub-received-spoke1-content');

    // Wait for hub content to reach all spokes
    await waitFor(
      async () => {
        const spokeChecks = await Promise.all(
          [1, 2, 3, 4].map(i => manager.getService(i).getReleases())
        );
        
        // Track sync to each spoke
        spokeChecks.forEach((releases, index) => {
          const spokeId = index + 1;
          const hasHubContent = releases.some(r => r[RELEASE_NAME_PROPERTY] === 'Hub Broadcast');
          
          if (hasHubContent && !graphBuilder['syncEvents'].some(e => 
            e.type === 'content-synced' && 
            e.targetNode === manager.getSiteAddress(spokeId) &&
            e.releaseId === hubRelease.id
          )) {
            graphBuilder.recordContentSynced(
              manager.getSiteAddress(spokeId),
              manager.getSiteAddress(0),
              hubRelease.id,
              'Hub Broadcast'
            );
          }
        });
        
        return spokeChecks.every(releases => 
          releases.some(r => r[RELEASE_NAME_PROPERTY] === 'Hub Broadcast')
        );
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify final state
    const hubReleases = await manager.getService(0).getReleases();
    expect(hubReleases).toHaveLength(2); // Own + Spoke 1's

    for (let i = 1; i < 5; i++) {
      const spokeReleases = await manager.getService(i).getReleases();
      if (i === 1) {
        expect(spokeReleases).toHaveLength(2); // Own + Hub's
      } else {
        expect(spokeReleases).toHaveLength(1); // Only Hub's
      }
    }
  }, 60000);

  test('deletion propagation - verify remove sync', async () => {
    const basePort = 20060;
    manager = new SingleProcessPeerManager(basePort);
    graphBuilder = new FederationTimingGraphBuilder('deletion-propagation', 3000);
    
    await manager.createPeers(2);
    
    // Add nodes to graph
    graphBuilder.addNode(manager.getService(0), 'Site 1');
    graphBuilder.addNode(manager.getService(1), 'Site 2');

    // Connect peers
    await manager.connectPeers('full-mesh');
    await delay(1000);

    await graphBuilder.captureSnapshot('initial');

    // Site 2 follows Site 1
    await manager.getService(1).addSubscription({
      id: '',
      [SUBSCRIPTION_SITE_ID_PROPERTY]: manager.getSiteAddress(0),
      [SUBSCRIPTION_NAME_PROPERTY]: 'Site 1',
      [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [manager.getSiteAddress(1)],
    });
    graphBuilder.recordSubscriptionAdded(manager.getSiteAddress(1), manager.getSiteAddress(0));

    // Add content to Site 1
    const release = await manager.getService(0).addRelease({
      [RELEASE_NAME_PROPERTY]: 'To Be Deleted',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmToBeDeleted',
    });
    expect(release.success).toBe(true);
    graphBuilder.recordContentAdded(manager.getSiteAddress(0), release.id, 'To Be Deleted');

    // Wait for sync
    await waitFor(
      async () => {
        const releases = await manager.getService(1).getReleases();
        const synced = releases.some(r => r[RELEASE_NAME_PROPERTY] === 'To Be Deleted');
        
        if (synced) {
          graphBuilder.recordContentSynced(
            manager.getSiteAddress(1),
            manager.getSiteAddress(0),
            release.id,
            'To Be Deleted'
          );
        }
        
        return synced;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    await graphBuilder.captureSnapshot('post-sync');

    // Delete the content from Site 1
    const deleteResult = await manager.getService(0).deleteRelease(release.id);
    expect(deleteResult.success).toBe(true);
    
    // Record deletion event
    graphBuilder['syncEvents'].push({
      timestamp: Date.now(),
      elapsedMs: Date.now() - graphBuilder['startTime'],
      type: 'content-added', // Using as proxy for deletion
      sourceNode: manager.getSiteAddress(0),
      releaseId: release.id,
      releaseName: 'To Be Deleted (DELETED)'
    });

    // Wait for deletion to propagate
    await waitFor(
      async () => {
        const releases = await manager.getService(1).getReleases();
        return releases.length === 0;
      },
      { timeout: 15000, delayInterval: 500 }
    );

    // Verify deletion propagated
    const site2Releases = await manager.getService(1).getReleases();
    expect(site2Releases).toHaveLength(0);
  }, 30000);
});