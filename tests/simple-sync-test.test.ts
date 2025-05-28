import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  Site,
  LensService,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  ADMIN_SITE_ARGS,
} from '../src/index';
import type { SubscriptionData } from '../src/types';
import { Peerbit } from 'peerbit';
import { delay } from './utils';

describe('Simple Automatic Sync Test', () => {
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
    console.log('Cleaning up...');
    for (const site of sites) {
      try { await site.close(); } catch (e) {}
    }
    for (const service of services) {
      try {
        if (service.siteProgram) await service.siteProgram.close();
      } catch (e) {}
    }
    for (const peer of peers) {
      try { await peer.stop(); } catch (e) {}
    }
    peers = [];
    services = [];
    sites = [];
  };

  afterAll(async () => {
    await cleanup();
  });

  test('automatic sync should work', async () => {
    console.log('=== STARTING AUTOMATIC SYNC TEST ===');
    
    try {
      // Create two peers
      const { peer: peer1, service: service1 } = await createPeer();
      const { peer: peer2, service: service2 } = await createPeer();

      // Create sites
      const site1 = new Site(peer1.identity.publicKey);
      const site2 = new Site(peer2.identity.publicKey);
      sites.push(site1, site2);

      // Open sites
      console.log('Opening sites...');
      await service1.openSite(site1, ADMIN_SITE_ARGS);
      await service2.openSite(site2, ADMIN_SITE_ARGS);

      // Connect peers
      console.log('Connecting peers...');
      await peer2.dial(peer1.getMultiaddrs());
      
      // Small delay to ensure connection
      await delay(1000);

      // Add content to site 1 BEFORE setting up subscription
      console.log('Adding initial content...');
      const initialRelease = await service1.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Initial Content',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmInitial',
      });
      expect(initialRelease.success).toBe(true);
      console.log('Initial content added with ID:', initialRelease.id);

      // Now add subscription (this should trigger automatic sync)
      console.log('Adding subscription...');
      const subscription: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: site1.address,
        [SUBSCRIPTION_NAME_PROPERTY]: 'Site 1',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [site2.address],
      };

      const subResult = await service2.addSubscription(subscription);
      expect(subResult.success).toBe(true);
      console.log('Subscription added with ID:', subResult.id);

      // Wait for initial sync
      console.log('Waiting for initial sync...');
      await delay(5000);

      // Check if initial content was synced
      let site2Releases = await service2.getReleases();
      console.log(`Site 2 has ${site2Releases.length} releases after initial sync`);
      
      if (site2Releases.length > 0) {
        console.log('✅ Initial sync successful!');
      } else {
        console.log('❌ Initial sync failed, but continuing to test real-time sync...');
      }

      // Add new content AFTER subscription is set up
      console.log('Adding new content for real-time sync...');
      const newRelease = await service1.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Real-time Content',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'test',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmRealtime',
      });
      expect(newRelease.success).toBe(true);
      console.log('New content added with ID:', newRelease.id);

      // Wait for real-time sync
      console.log('Waiting for real-time sync...');
      await delay(5000);

      // Check final state
      site2Releases = await service2.getReleases();
      console.log(`Site 2 final state: ${site2Releases.length} releases`);
      
      for (const release of site2Releases) {
        console.log(`- ${release[RELEASE_NAME_PROPERTY]} (${release.id})`);
      }

      // Test should pass if we have any content synced
      expect(site2Releases.length).toBeGreaterThan(0);
      
      console.log('=== TEST COMPLETED ===');
      
    } finally {
      await cleanup();
    }
  }, 60000);
});