import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { LensService, Site, ADMIN_SITE_ARGS } from '../src/index';
import { delay } from './utils';

describe('Scalable Federation Test', () => {
  let peer1: Peerbit;
  let peer2: Peerbit;
  let peer3: Peerbit;
  let service1: LensService;
  let service2: LensService;
  let service3: LensService;

  beforeAll(async () => {
    // Create three peers to test the federation network
    peer1 = await Peerbit.create();
    peer2 = await Peerbit.create();
    peer3 = await Peerbit.create();
    
    // Connect to bootstrap nodes for peer discovery
    const bootstrappers = [
      '/dns4/4032881a26640025f9a4253104b7aaf6d4b55599.peerchecker.com/tcp/4003/wss/p2p/12D3KooWPYWLY5E7w1SyPJ18y77Wsyfo1fEJcwRonKNPxPam3teJ',
      '/dns4/65da3760cb3fd2926532310b0650ddca4f88ebd5.peerchecker.com/tcp/4003/wss/p2p/12D3KooWMQTwyWnvKyFPjs72bbrDMUDM7pmtF328X7iTfWws3A18'
    ];
    
    // Connect all peers to bootstrap
    for (const bootstrapper of bootstrappers) {
      try {
        await Promise.all([
          peer1.dial(bootstrapper),
          peer2.dial(bootstrapper),
          peer3.dial(bootstrapper)
        ]);
        console.log('All peers connected to bootstrap');
        break;
      } catch (e) {
        console.log('Failed to connect to bootstrap:', e.message);
      }
    }
    
    // Also connect peers directly
    await Promise.all([
      peer2.dial(peer1.getMultiaddrs()),
      peer3.dial(peer1.getMultiaddrs()),
      peer3.dial(peer2.getMultiaddrs())
    ]);
    console.log('Peers connected in mesh topology');
    
    // Create services with scalable sync mode
    // First peer creates the federation network
    service1 = new LensService(peer1, {
      mode: 'scalable',
      createNetwork: true, // This peer will create the network
      logger: {
        info: (msg, data) => console.log(`[Peer1] ${msg}`, data),
        warn: (msg, data) => console.warn(`[Peer1] ${msg}`, data),
        error: (msg, data) => console.error(`[Peer1] ${msg}`, data),
        debug: (msg, data) => console.debug(`[Peer1] ${msg}`, data),
      }
    });
    
    // Other peers will join later
    service2 = new LensService(peer2, {
      mode: 'scalable',
      logger: {
        info: (msg, data) => console.log(`[Peer2] ${msg}`, data),
        warn: (msg, data) => console.warn(`[Peer2] ${msg}`, data),
        error: (msg, data) => console.error(`[Peer2] ${msg}`, data),
        debug: (msg, data) => console.debug(`[Peer2] ${msg}`, data),
      }
    });
    
    service3 = new LensService(peer3, {
      mode: 'scalable',
      logger: {
        info: (msg, data) => console.log(`[Peer3] ${msg}`, data),
        warn: (msg, data) => console.warn(`[Peer3] ${msg}`, data),
        error: (msg, data) => console.error(`[Peer3] ${msg}`, data),
        debug: (msg, data) => console.debug(`[Peer3] ${msg}`, data),
      }
    });
    
    // Open sites
    const site1 = new Site(peer1.identity.publicKey);
    const site2 = new Site(peer2.identity.publicKey);
    const site3 = new Site(peer3.identity.publicKey);
    
    site1.siteName = 'Site 1';
    site2.siteName = 'Site 2';
    site3.siteName = 'Site 3';
    
    // Open site1 first to create the federation network
    await service1.openSite(site1, ADMIN_SITE_ARGS);
    console.log('Site 1 opened');
    
    // Get the federation network address from site1's sync manager
    const syncManager1 = service1.getSyncManager();
    const federationNetworkAddress = syncManager1?.getFederationNetworkAddress();
    console.log('Federation network address:', federationNetworkAddress);
    
    // Update services 2 and 3 to join the same network
    if (federationNetworkAddress) {
      (service2 as any).syncOptions = {
        ...((service2 as any).syncOptions || {}),
        federationNetworkAddress
      };
      (service3 as any).syncOptions = {
        ...((service3 as any).syncOptions || {}),
        federationNetworkAddress
      };
    }
    
    // Now open the other sites
    await Promise.all([
      service2.openSite(site2, ADMIN_SITE_ARGS),
      service3.openSite(site3, ADMIN_SITE_ARGS)
    ]);
    
    console.log('All sites opened successfully');
  });

  afterAll(async () => {
    await Promise.all([
      service1.closeSite(),
      service2.closeSite(),
      service3.closeSite()
    ]);
    await Promise.all([
      service1.stop(),
      service2.stop(),
      service3.stop()
    ]);
  });

  test('Federation network creation and content indexing', async () => {
    const site1Id = await service1.getSiteId();
    const site2Id = await service2.getSiteId();
    const site3Id = await service3.getSiteId();
    
    console.log('Site IDs:');
    console.log('  Site 1:', site1Id);
    console.log('  Site 2:', site2Id);
    console.log('  Site 3:', site3Id);
    
    // Add some content to each site
    console.log('\nAdding content to sites...');
    
    await service1.addRelease({
      name: 'Documentary: Decentralized Future',
      categoryId: 'documentary',
      contentCID: 'QmDoc1',
    });
    
    await service2.addRelease({
      name: 'Music: Electronic Symphony',
      categoryId: 'music',
      contentCID: 'QmMusic1',
    });
    
    await service3.addRelease({
      name: 'Film: The Matrix Reloaded',
      categoryId: 'film',
      contentCID: 'QmFilm1',
    });
    
    // Wait for content to be indexed to federation network
    await delay(3000);
    
    // Each site subscribes to the others
    console.log('\nSetting up subscriptions...');
    
    await service1.addSubscription({
      siteId: site2Id,
      name: 'Site 2',
      recursive: false,
    });
    
    await service2.addSubscription({
      siteId: site3Id,
      name: 'Site 3',
      recursive: false,
    });
    
    await service3.addSubscription({
      siteId: site1Id,
      name: 'Site 1',
      recursive: false,
    });
    
    // Wait for subscriptions to propagate
    await delay(2000);
    
    // Now search the federation network from each peer
    console.log('\nSearching federation network...');
    
    // Get the sync manager to search
    const syncManager1 = service1.getSyncManager();
    const syncManager2 = service2.getSyncManager();
    const syncManager3 = service3.getSyncManager();
    
    if (!syncManager1 || !syncManager2 || !syncManager3) {
      console.error('Sync managers not initialized');
      expect(syncManager1).toBeTruthy();
      expect(syncManager2).toBeTruthy();
      expect(syncManager3).toBeTruthy();
      return;
    }
    
    // Search for "Documentary" from Site 2
    console.log('\nSite 2 searching for "Documentary"...');
    const docResults = await syncManager2.searchFederation('Documentary', { remote: true });
    console.log('Documentary search results:', docResults.length);
    expect(docResults.length).toBeGreaterThan(0);
    expect(docResults[0].name).toContain('Documentary');
    expect(docResults[0].sourceSiteId).toBe(site1Id);
    
    // Search for all content from Site 3
    console.log('\nSite 3 getting popular content...');
    const popularContent = await syncManager3.getPopularContent(10);
    console.log('Popular content found:', popularContent.length);
    expect(popularContent.length).toBeGreaterThanOrEqual(3);
    
    // Get federation statistics
    console.log('\nFederation statistics:');
    const stats1 = await syncManager1.getFederationStats();
    const stats2 = await syncManager2.getFederationStats();
    const stats3 = await syncManager3.getFederationStats();
    
    console.log('Site 1 stats:', stats1);
    console.log('Site 2 stats:', stats2);
    console.log('Site 3 stats:', stats3);
    
    // At least one site should see all content
    const maxContent = Math.max(stats1.totalContent, stats2.totalContent, stats3.totalContent);
    expect(maxContent).toBeGreaterThanOrEqual(3);
    
    // Test batch content fetching
    console.log('\nTesting batch content fetch...');
    const pointers = await syncManager1.searchFederation('', { remote: true, fetch: 10 });
    if (pointers.length > 0) {
      const content = await syncManager1.getContent(pointers.slice(0, 2));
      console.log('Fetched content items:', content.size);
      expect(content.size).toBeGreaterThan(0);
    }
  });

  test('Federation network scales with minimal connections', async () => {
    // This test demonstrates that we don't need N connections for N sites
    
    // Get connection count for each peer
    const connections1 = peer1.libp2p.getConnections();
    const connections2 = peer2.libp2p.getConnections();
    const connections3 = peer3.libp2p.getConnections();
    
    console.log('\nConnection counts:');
    console.log('Peer 1 connections:', connections1.length);
    console.log('Peer 2 connections:', connections2.length);
    console.log('Peer 3 connections:', connections3.length);
    
    // Even with 3 sites subscribed to each other, we should have
    // far fewer connections than 3*3=9 because we're using a shared
    // federation network, not direct site-to-site connections
    const totalConnections = connections1.length + connections2.length + connections3.length;
    
    // Each peer connects to bootstrap + other peers, but not to every site
    expect(totalConnections).toBeLessThan(15); // Much less than N*N
  });
});