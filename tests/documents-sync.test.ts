import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { LensService, Site, ADMIN_SITE_ARGS } from '../src/index';
import { delay } from './utils';

describe('Documents-based Sync Test', () => {
  let peer1: Peerbit;
  let peer2: Peerbit;
  let service1: LensService;
  let service2: LensService;

  beforeAll(async () => {
    // Create two peers
    peer1 = await Peerbit.create();
    peer2 = await Peerbit.create();
    
    // Connect to bootstrap nodes
    const bootstrappers = [
      '/dns4/4032881a26640025f9a4253104b7aaf6d4b55599.peerchecker.com/tcp/4003/wss/p2p/12D3KooWPYWLY5E7w1SyPJ18y77Wsyfo1fEJcwRonKNPxPam3teJ',
      '/dns4/65da3760cb3fd2926532310b0650ddca4f88ebd5.peerchecker.com/tcp/4003/wss/p2p/12D3KooWMQTwyWnvKyFPjs72bbrDMUDM7pmtF328X7iTfWws3A18'
    ];
    
    // Connect both peers to bootstrap nodes
    for (const bootstrapper of bootstrappers) {
      try {
        await peer1.dial(bootstrapper);
        console.log('Peer1 connected to bootstrap');
      } catch (e) {
        console.log('Peer1 failed to connect to bootstrap:', e.message);
      }
      try {
        await peer2.dial(bootstrapper);
        console.log('Peer2 connected to bootstrap');
      } catch (e) {
        console.log('Peer2 failed to connect to bootstrap:', e.message);
      }
    }
    
    // Also connect them directly
    const connected = await peer2.dial(peer1.getMultiaddrs());
    console.log('Peers directly connected:', connected);
    
    // Create services with documents sync mode
    service1 = new LensService(peer1, {
      mode: 'documents',
      logger: {
        info: (msg, data) => console.log(`[Peer1] ${msg}`, data),
        warn: (msg, data) => console.warn(`[Peer1] ${msg}`, data),
        error: (msg, data) => console.error(`[Peer1] ${msg}`, data),
        debug: (msg, data) => console.debug(`[Peer1] ${msg}`, data),
      }
    });
    
    service2 = new LensService(peer2, {
      mode: 'documents',
      logger: {
        info: (msg, data) => console.log(`[Peer2] ${msg}`, data),
        warn: (msg, data) => console.warn(`[Peer2] ${msg}`, data),
        error: (msg, data) => console.error(`[Peer2] ${msg}`, data),
        debug: (msg, data) => console.debug(`[Peer2] ${msg}`, data),
      }
    });
    
    // Open sites with sync enabled
    const site1 = new Site(peer1.identity.publicKey, { enableSync: true });
    const site2 = new Site(peer2.identity.publicKey, { enableSync: true });
    
    await service1.openSite(site1, {
      ...ADMIN_SITE_ARGS,
      syncMessagesArgs: { replicate: true }
    });
    await service2.openSite(site2, {
      ...ADMIN_SITE_ARGS,
      syncMessagesArgs: { replicate: true }
    });
  });

  afterAll(async () => {
    await service1.closeSite();
    await service2.closeSite();
    await service1.stop();
    await service2.stop();
  });

  test('Documents sync publishes and receives updates', async () => {
    // Peer2 subscribes to Peer1
    const site1Id = await service1.getSiteId();
    const site2Id = await service2.getSiteId();
    console.log('Site 1 ID:', site1Id);
    console.log('Site 2 ID:', site2Id);
    
    const subResult = await service2.addSubscription({
      siteId: site1Id,
      name: 'Test Site 1',
      recursive: false,
      subscriptionType: 'direct',
      currentDepth: 0,
      followChain: [await service2.getSiteId()],
    });
    console.log('Subscription result:', subResult);
    expect(subResult.success).toBe(true);
    
    // Wait for subscription to be set up
    await delay(2000);
    
    // Peer1 adds a release
    console.log('Adding release to site 1...');
    const releaseResult = await service1.addRelease({
      name: 'Test Release',
      categoryId: 'test',
      contentCID: 'QmTest123',
    });
    console.log('Release result:', releaseResult);
    expect(releaseResult.success).toBe(true);
    
    // Wait for sync message to propagate through Documents replication
    await delay(3000);
    
    // Check if Peer2 received the release
    const releases = await service2.getReleases();
    console.log('Peer2 releases:', releases.length);
    
    if (releases.length > 0) {
      console.log('First release:', {
        name: releases[0].name,
        federatedFrom: releases[0].federatedFrom,
      });
    }
    
    expect(releases.length).toBe(1);
    expect(releases[0].name).toBe('Test Release');
    expect(releases[0].federatedFrom).toBe(site1Id);
  });
});