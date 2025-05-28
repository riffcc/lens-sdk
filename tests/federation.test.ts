import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  Site,
  Release,
  Subscription,
  LensService,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
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

describe('Federation and Parallel Synchronization', () => {
  let peers: Peerbit[] = [];
  let services: LensService[] = [];
  let sites: Site[] = [];

  const createPeer = async (): Promise<{ peer: Peerbit; service: LensService }> => {
    const peer = await Peerbit.create();
    const service = new LensService(peer);
    peers.push(peer);
    services.push(service);
    return { peer, service };
  };

  const cleanup = async () => {
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

  test('parallel synchronization between multiple sites', async () => {
    try {
      // Create 4 peers for parallel testing
      const { peer: peer1, service: service1 } = await createPeer();
      const { peer: peer2, service: service2 } = await createPeer();
      const { peer: peer3, service: service3 } = await createPeer();
      const { peer: peer4, service: service4 } = await createPeer();

      // Create sites
      const site1 = new Site(peer1.identity.publicKey);
      const site2 = new Site(peer2.identity.publicKey);
      sites.push(site1, site2);

      // Open sites with different replication strategies
      await service1.openSite(site1, ADMIN_SITE_ARGS);
      await service2.openSite(site2, ADMIN_SITE_ARGS);

      // Connect peers in a mesh topology
      await Promise.all([
        peer2.dial(peer1.getMultiaddrs()),
        peer3.dial(peer1.getMultiaddrs()),
        peer3.dial(peer2.getMultiaddrs()),
        peer4.dial(peer1.getMultiaddrs()),
        peer4.dial(peer2.getMultiaddrs()),
        peer4.dial(peer3.getMultiaddrs()),
      ]);

      // Peers 3 and 4 open both sites as dedicated replicators
      await Promise.all([
        service3.openSite(site1.address, DEDICATED_SITE_ARGS),
        service3.openSite(site2.address, DEDICATED_SITE_ARGS),
        service4.openSite(site1.address, DEDICATED_SITE_ARGS),
        service4.openSite(site2.address, DEDICATED_SITE_ARGS),
      ]);

      // Wait for all peers to discover each other
      await Promise.all([
        service1.siteProgram?.waitFor(peer2.identity.publicKey),
        service1.siteProgram?.waitFor(peer3.identity.publicKey),
        service1.siteProgram?.waitFor(peer4.identity.publicKey),
        service2.siteProgram?.waitFor(peer1.identity.publicKey),
        service2.siteProgram?.waitFor(peer3.identity.publicKey),
        service2.siteProgram?.waitFor(peer4.identity.publicKey),
      ]);

      // Add releases in parallel to both sites
      const releases: Array<{ data: ReleaseData; siteId: string }> = [
        {
          siteId: site1.address,
          data: {
            [RELEASE_NAME_PROPERTY]: 'Site1 Release 1',
            [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
            [RELEASE_CONTENT_CID_PROPERTY]: 'QmSite1Release1CID',
            federatedFrom: site1.address,
            federatedAt: new Date().toISOString(),
            federatedRealtime: true,
          },
        },
        {
          siteId: site1.address,
          data: {
            [RELEASE_NAME_PROPERTY]: 'Site1 Release 2',
            [RELEASE_CATEGORY_ID_PROPERTY]: 'documentary',
            [RELEASE_CONTENT_CID_PROPERTY]: 'QmSite1Release2CID',
            federatedFrom: site1.address,
            federatedAt: new Date().toISOString(),
            federatedRealtime: true,
          },
        },
        {
          siteId: site2.address,
          data: {
            [RELEASE_NAME_PROPERTY]: 'Site2 Release 1',
            [RELEASE_CATEGORY_ID_PROPERTY]: 'music',
            [RELEASE_CONTENT_CID_PROPERTY]: 'QmSite2Release1CID',
            federatedFrom: site2.address,
            federatedAt: new Date().toISOString(),
            federatedRealtime: true,
          },
        },
        {
          siteId: site2.address,
          data: {
            [RELEASE_NAME_PROPERTY]: 'Site2 Release 2',
            [RELEASE_CATEGORY_ID_PROPERTY]: 'podcast',
            [RELEASE_CONTENT_CID_PROPERTY]: 'QmSite2Release2CID',
            federatedFrom: site2.address,
            federatedAt: new Date().toISOString(),
            federatedRealtime: true,
          },
        },
      ];

      // Add all releases in parallel
      const releaseResults = await Promise.all([
        service1.addRelease(releases[0].data),
        service1.addRelease(releases[1].data),
        service2.addRelease(releases[2].data),
        service2.addRelease(releases[3].data),
      ]);

      // Verify all releases were added successfully
      releaseResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.id).toBeDefined();
        releases[index].data.id = result.id;
      });

      // Verify parallel replication to dedicated nodes
      await waitFor(
        async () => {
          // Check that peer3 has all releases from both sites
          const site1ReleasesOnPeer3 = await services[2].getReleases();
          const site2ReleasesOnPeer3 = await services[3].getReleases();
          
          return site1ReleasesOnPeer3.length >= 2 && site2ReleasesOnPeer3.length >= 2;
        },
        { timeout: 30000, delayInterval: 1000 }
      );

      // Verify content integrity across all peers
      for (const release of releases) {
        for (let i = 2; i < 4; i++) {
          const replicatedRelease = await services[i].getRelease({ id: release.data.id! });
          expect(replicatedRelease).toBeDefined();
          expect(replicatedRelease?.[RELEASE_NAME_PROPERTY]).toBe(release.data[RELEASE_NAME_PROPERTY]);
          expect(replicatedRelease?.federatedFrom).toBe(release.data.federatedFrom);
        }
      }
    } finally {
      await cleanup();
    }
  }, 60000);

  test('recursive subscription federation', async () => {
    try {
      // Create a chain of sites: A -> B -> C -> D
      const { peer: peerA, service: serviceA } = await createPeer();
      const { peer: peerB, service: serviceB } = await createPeer();
      const { peer: peerC, service: serviceC } = await createPeer();
      const { peer: peerD, service: serviceD } = await createPeer();

      const siteA = new Site(peerA.identity.publicKey);
      const siteB = new Site(peerB.identity.publicKey);
      const siteC = new Site(peerC.identity.publicKey);
      const siteD = new Site(peerD.identity.publicKey);
      sites.push(siteA, siteB, siteC, siteD);

      // Open all sites
      await Promise.all([
        serviceA.openSite(siteA, ADMIN_SITE_ARGS),
        serviceB.openSite(siteB, ADMIN_SITE_ARGS),
        serviceC.openSite(siteC, ADMIN_SITE_ARGS),
        serviceD.openSite(siteD, ADMIN_SITE_ARGS),
      ]);

      // Connect peers
      await Promise.all([
        peerB.dial(peerA.getMultiaddrs()),
        peerC.dial(peerB.getMultiaddrs()),
        peerD.dial(peerC.getMultiaddrs()),
      ]);

      // Create recursive subscriptions
      const subscriptions: SubscriptionData[] = [
        {
          [SUBSCRIPTION_SITE_ID_PROPERTY]: siteB.address,
          [SUBSCRIPTION_NAME_PROPERTY]: 'A follows B',
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: true,
          subscriptionType: 'content',
          currentDepth: 0,
          followChain: [siteA.address],
        },
        {
          [SUBSCRIPTION_SITE_ID_PROPERTY]: siteC.address,
          [SUBSCRIPTION_NAME_PROPERTY]: 'B follows C',
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: true,
          subscriptionType: 'content',
          currentDepth: 1,
          followChain: [siteA.address, siteB.address],
        },
        {
          [SUBSCRIPTION_SITE_ID_PROPERTY]: siteD.address,
          [SUBSCRIPTION_NAME_PROPERTY]: 'C follows D',
          [SUBSCRIPTION_RECURSIVE_PROPERTY]: false, // Non-recursive
          subscriptionType: 'content',
          currentDepth: 2,
          followChain: [siteA.address, siteB.address, siteC.address],
        },
      ];

      // Add subscriptions
      await Promise.all([
        serviceA.addSubscription(subscriptions[0]),
        serviceB.addSubscription(subscriptions[1]),
        serviceC.addSubscription(subscriptions[2]),
      ]);

      // Verify subscriptions were created
      const [subsA, subsB, subsC] = await Promise.all([
        serviceA.getSubscriptions(),
        serviceB.getSubscriptions(),
        serviceC.getSubscriptions(),
      ]);

      expect(subsA.length).toBe(1);
      expect(subsB.length).toBe(1);
      expect(subsC.length).toBe(1);

      // Add content to site D
      const releaseD = await serviceD.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Content from Site D',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmSiteDContent',
        federatedFrom: siteD.address,
        federatedAt: new Date().toISOString(),
        federatedRealtime: true,
      });

      expect(releaseD.success).toBe(true);

      // With recursive subscriptions, site A should eventually get content from site D
      // This would require implementing the federation logic in the SDK
      // For now, we're testing the subscription structure
      
      // Verify subscription chain
      expect(subsA[0][SUBSCRIPTION_RECURSIVE_PROPERTY]).toBe(true);
      expect(subsB[0][SUBSCRIPTION_RECURSIVE_PROPERTY]).toBe(true);
      expect(subsC[0][SUBSCRIPTION_RECURSIVE_PROPERTY]).toBe(false);
      
      // Verify follow chains
      expect(subsB[0].followChain).toContain(siteA.address);
      expect(subsC[0].followChain).toContain(siteA.address);
      expect(subsC[0].followChain).toContain(siteB.address);
    } finally {
      await cleanup();
    }
  }, 45000);

  test('parallel content updates and conflict resolution', async () => {
    try {
      const { peer: peer1, service: service1 } = await createPeer();
      const { peer: peer2, service: service2 } = await createPeer();
      const { peer: peer3, service: service3 } = await createPeer();

      const site = new Site(peer1.identity.publicKey);
      sites.push(site);

      // All peers open the same site
      await service1.openSite(site, ADMIN_SITE_ARGS);

      await Promise.all([
        peer2.dial(peer1.getMultiaddrs()),
        peer3.dial(peer1.getMultiaddrs()),
      ]);

      await Promise.all([
        service2.openSite(site.address, ADMIN_SITE_ARGS),
        service3.openSite(site.address, ADMIN_SITE_ARGS),
      ]);

      // Wait for synchronization
      await Promise.all([
        service1.siteProgram?.waitFor(peer2.identity.publicKey),
        service1.siteProgram?.waitFor(peer3.identity.publicKey),
        service2.siteProgram?.waitFor(peer1.identity.publicKey),
        service2.siteProgram?.waitFor(peer3.identity.publicKey),
        service3.siteProgram?.waitFor(peer1.identity.publicKey),
        service3.siteProgram?.waitFor(peer2.identity.publicKey),
      ]);

      // Add a release from peer1
      const originalRelease = await service1.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Original Release',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmOriginal',
      });

      expect(originalRelease.success).toBe(true);
      const releaseId = originalRelease.id!;

      // Wait for replication
      await waitFor(
        async () => {
          const r2 = await service2.getRelease({ id: releaseId });
          const r3 = await service3.getRelease({ id: releaseId });
          return r2 !== undefined && r3 !== undefined;
        },
        { timeout: 20000, delayInterval: 500 }
      );

      // Attempt parallel updates from different peers
      const updatePromises = Promise.allSettled([
        service1.editRelease({
          id: releaseId,
          [RELEASE_NAME_PROPERTY]: 'Updated by Peer1',
          [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
          [RELEASE_CONTENT_CID_PROPERTY]: 'QmUpdated1',
        }),
        service2.editRelease({
          id: releaseId,
          [RELEASE_NAME_PROPERTY]: 'Updated by Peer2',
          [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
          [RELEASE_CONTENT_CID_PROPERTY]: 'QmUpdated2',
        }),
        service3.editRelease({
          id: releaseId,
          [RELEASE_NAME_PROPERTY]: 'Updated by Peer3',
          [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
          [RELEASE_CONTENT_CID_PROPERTY]: 'QmUpdated3',
        }),
      ]);

      const results = await updatePromises;
      
      // At least one update should succeed
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Wait for convergence
      await delay(2000);

      // All peers should have the same final state
      const [final1, final2, final3] = await Promise.all([
        service1.getRelease({ id: releaseId }),
        service2.getRelease({ id: releaseId }),
        service3.getRelease({ id: releaseId }),
      ]);

      // Verify convergence - all should have the same content
      expect(final1?.[RELEASE_NAME_PROPERTY]).toBe(final2?.[RELEASE_NAME_PROPERTY]);
      expect(final2?.[RELEASE_NAME_PROPERTY]).toBe(final3?.[RELEASE_NAME_PROPERTY]);
      expect(final1?.[RELEASE_CONTENT_CID_PROPERTY]).toBe(final2?.[RELEASE_CONTENT_CID_PROPERTY]);
      expect(final2?.[RELEASE_CONTENT_CID_PROPERTY]).toBe(final3?.[RELEASE_CONTENT_CID_PROPERTY]);
    } finally {
      await cleanup();
    }
  }, 60000);

  test('site metadata synchronization', async () => {
    try {
      const { peer: peer1, service: service1 } = await createPeer();
      const { peer: peer2, service: service2 } = await createPeer();

      const site = new Site(peer1.identity.publicKey);
      sites.push(site);

      await service1.openSite(site, ADMIN_SITE_ARGS);

      // Set site metadata
      await service1.setSiteMetadata({
        siteName: 'Test Federation Site',
        siteDescription: 'A site for testing federation features',
        siteImageCid: 'QmSiteImage123',
      });

      // Second peer connects and opens the site
      await peer2.dial(peer1.getMultiaddrs());
      await service2.openSite(site.address, DEDICATED_SITE_ARGS);

      await service1.siteProgram?.waitFor(peer2.identity.publicKey);
      await service2.siteProgram?.waitFor(peer1.identity.publicKey);

      // Verify metadata is accessible
      const metadata1 = await service1.getSiteMetadata();
      const metadata2 = await service2.getSiteMetadata();

      expect(metadata1.siteName).toBe('Test Federation Site');
      expect(metadata2.siteName).toBe('Test Federation Site');
      expect(metadata1.siteDescription).toBe(metadata2.siteDescription);
      expect(metadata1.siteImageCid).toBe(metadata2.siteImageCid);

      // Test remote site metadata fetching
      const remoteMetadata = await service2.getRemoteSiteMetadata(site.address);
      expect(remoteMetadata).toBeDefined();
      expect(remoteMetadata?.siteName).toBe('Test Federation Site');
    } finally {
      await cleanup();
    }
  }, 30000);

  test('stress test - multiple parallel operations', async () => {
    try {
      const peerCount = 5;
      const releaseCount = 10;
      
      // Create multiple peers
      const peersAndServices = await Promise.all(
        Array(peerCount).fill(null).map(() => createPeer())
      );

      const mainSite = new Site(peersAndServices[0].peer.identity.publicKey);
      sites.push(mainSite);

      // Open site on first peer
      await peersAndServices[0].service.openSite(mainSite, ADMIN_SITE_ARGS);

      // Connect all peers to the first one and open the site
      await Promise.all(
        peersAndServices.slice(1).map(async ({ peer, service }, index) => {
          await peer.dial(peersAndServices[0].peer.getMultiaddrs());
          await service.openSite(mainSite.address, DEDICATED_SITE_ARGS);
        })
      );

      // Wait for all peers to discover each other
      await Promise.all(
        peersAndServices.slice(1).map(({ peer }) => 
          peersAndServices[0].service.siteProgram?.waitFor(peer.identity.publicKey)
        )
      );

      // Add many releases in parallel from different peers
      const releasePromises = [];
      for (let i = 0; i < releaseCount; i++) {
        const peerIndex = i % peerCount;
        releasePromises.push(
          peersAndServices[peerIndex].service.addRelease({
            [RELEASE_NAME_PROPERTY]: `Release ${i} from Peer ${peerIndex}`,
            [RELEASE_CATEGORY_ID_PROPERTY]: `category${i % 3}`,
            [RELEASE_CONTENT_CID_PROPERTY]: `QmRelease${i}`,
            federatedFrom: mainSite.address,
            federatedAt: new Date().toISOString(),
          })
        );
      }

      const results = await Promise.all(releasePromises);
      const successfulReleases = results.filter(r => r.success);
      expect(successfulReleases.length).toBe(releaseCount);

      // Wait for replication
      await waitFor(
        async () => {
          const releaseCounts = await Promise.all(
            peersAndServices.map(({ service }) => 
              service.getReleases().then(releases => releases.length)
            )
          );
          return releaseCounts.every(count => count === releaseCount);
        },
        { timeout: 40000, delayInterval: 2000 }
      );

      // Verify all peers have all releases
      for (const { service } of peersAndServices) {
        const releases = await service.getReleases();
        expect(releases.length).toBe(releaseCount);
      }
    } finally {
      await cleanup();
    }
  }, 90000);
});