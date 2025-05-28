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

describe('Debug Sync Issues', () => {
  test('minimal sync test with debug logging', async () => {
    let peer1: Peerbit | null = null;
    let peer2: Peerbit | null = null;
    let service1: LensService | null = null;
    let service2: LensService | null = null;
    let site1: Site | null = null;
    let site2: Site | null = null;

    try {
      console.log('=== STARTING DEBUG TEST ===');
      
      // Step 1: Create peers
      console.log('Step 1: Creating peers...');
      peer1 = await Peerbit.create();
      peer2 = await Peerbit.create();
      console.log('✓ Peers created');

      // Step 2: Create services
      console.log('Step 2: Creating services...');
      service1 = new LensService(peer1);
      service2 = new LensService(peer2);
      console.log('✓ Services created');

      // Step 3: Create and open sites
      console.log('Step 3: Creating sites...');
      site1 = new Site(peer1.identity.publicKey);
      site2 = new Site(peer2.identity.publicKey);
      console.log('✓ Sites created');

      console.log('Step 4: Opening sites...');
      await service1.openSite(site1, ADMIN_SITE_ARGS);
      await service2.openSite(site2, ADMIN_SITE_ARGS);
      console.log('✓ Sites opened');

      // Step 5: Connect peers
      console.log('Step 5: Connecting peers...');
      const multiaddrs = peer1.getMultiaddrs();
      console.log(`Peer1 multiaddrs: ${multiaddrs.length} addresses`);
      if (multiaddrs.length > 0) {
        console.log(`First address: ${multiaddrs[0].toString()}`);
      }
      
      const connected = await peer2.dial(multiaddrs);
      console.log(`✓ Connection result: ${connected}`);
      
      // Give connection time to establish
      await delay(2000);

      // Step 6: Add initial content BEFORE subscription
      console.log('Step 6: Adding initial content to site1...');
      const release1 = await service1.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Test Content 1',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'debug',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmDebug1',
      });
      console.log(`✓ Release added: ${release1.success}, id: ${release1.id}`);

      // Step 7: Create subscription
      console.log('Step 7: Creating subscription...');
      const subscription: SubscriptionData = {
        id: '',
        [SUBSCRIPTION_SITE_ID_PROPERTY]: site1.address,
        [SUBSCRIPTION_NAME_PROPERTY]: 'Debug Site 1',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [site2.address],
      };

      console.log(`Subscribing to site: ${site1.address}`);
      const subResult = await service2.addSubscription(subscription);
      console.log(`✓ Subscription result: ${subResult.success}, id: ${subResult.id}`);

      // Step 8: Check sync manager status
      console.log('Step 8: Checking sync manager...');
      console.log(`Service2 syncManager exists: ${!!service2.syncManager}`);
      
      // Step 9: Wait and check for sync
      console.log('Step 9: Waiting 5 seconds for sync...');
      await delay(5000);

      // Step 10: Check results
      console.log('Step 10: Checking sync results...');
      const site2Releases = await service2.getReleases();
      console.log(`Site2 releases count: ${site2Releases.length}`);
      
      if (site2Releases.length > 0) {
        console.log('✓ SYNC SUCCESSFUL!');
        site2Releases.forEach(r => {
          console.log(`  - ${r[RELEASE_NAME_PROPERTY]} (${r.id})`);
        });
      } else {
        console.log('✗ SYNC FAILED - No releases found');
        
        // Additional debugging
        console.log('\nAdditional debug info:');
        console.log(`Site1 address: ${site1.address}`);
        console.log(`Site2 address: ${site2.address}`);
        
        // Check site1 releases
        const site1Releases = await service1.getReleases();
        console.log(`Site1 has ${site1Releases.length} releases`);
        
        // Check subscriptions
        const site2Subs = await service2.getSubscriptions();
        console.log(`Site2 has ${site2Subs.length} subscriptions`);
      }

      // Step 11: Test real-time sync
      console.log('\nStep 11: Testing real-time sync...');
      const release2 = await service1.addRelease({
        [RELEASE_NAME_PROPERTY]: 'Test Content 2',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'debug',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmDebug2',
      });
      console.log(`✓ Release 2 added: ${release2.success}`);

      await delay(3000);
      
      const finalReleases = await service2.getReleases();
      console.log(`\nFinal site2 releases count: ${finalReleases.length}`);
      
      // Expect at least one release to be synced
      expect(finalReleases.length).toBeGreaterThan(0);
      
    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    } finally {
      // Cleanup
      console.log('\nCleaning up...');
      try {
        if (site1) await site1.close();
        if (site2) await site2.close();
        if (peer1) await peer1.stop();
        if (peer2) await peer2.stop();
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }
  }, 60000);
});