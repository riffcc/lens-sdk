import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { SiteFederationStore, FederatedContentPointer } from '../src/site-federation-store-v2';

describe('SiteFederationStore Simple', () => {
  let peers: Peerbit[];
  let stores: SiteFederationStore[];

  beforeEach(async () => {
    peers = [];
    stores = [];
  });

  afterEach(async () => {
    await Promise.all(stores.map(store => store.close()));
    await Promise.all(peers.map(peer => peer.stop()));
  });

  async function createPeerWithStore(name: string) {
    const peer = await Peerbit.create();
    await peer.start();
    
    const store = await peer.open(new SiteFederationStore(), {
      args: {
        replicate: true,
        replicas: {
          min: 1
        }
      }
    });
    
    peers.push(peer);
    stores.push(store);
    
    console.log(`Created ${name} with store at ${store.address}`);
    return { peer, store };
  }

  test('sites can create their own federation stores', async () => {
    const { store: storeA } = await createPeerWithStore('Site A');
    const { store: storeB } = await createPeerWithStore('Site B');
    
    expect(storeA.address).toBeDefined();
    expect(storeB.address).toBeDefined();
    expect(storeA.address).not.toBe(storeB.address);
  });

  test('site owner can add federated content', async () => {
    const { store: storeA } = await createPeerWithStore('Site A');
    
    // Site A adds federated content
    const content = new FederatedContentPointer({
      contentCid: 'QmTest123',
      title: 'Federated Content',
      sourceSiteId: 'some-other-site',
      sourceSiteName: 'Other Site',
      federatedAt: Date.now()
    });
    
    await storeA.federatedContent.put(content);
    
    // Verify content was added
    await waitFor(() => storeA.federatedContent.values.length === 1);
    const items = await storeA.federatedContent.values.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Federated Content');
  });

  test('federated content can be searched', async () => {
    const { store: storeA } = await createPeerWithStore('Site A');
    
    // Add multiple content items
    const contentItems = [
      new FederatedContentPointer({
        contentCid: 'QmVideo1',
        title: 'Amazing Video Tutorial',
        sourceSiteId: 'site-b',
        sourceSiteName: 'Site B',
        contentType: 'video',
        federatedAt: Date.now()
      }),
      new FederatedContentPointer({
        contentCid: 'QmVideo2',
        title: 'Cooking Show Episode',
        sourceSiteId: 'site-c',
        sourceSiteName: 'Site C',
        contentType: 'video',
        federatedAt: Date.now() + 1000
      }),
      new FederatedContentPointer({
        contentCid: 'QmAudio1',
        title: 'Amazing Podcast Episode',
        sourceSiteId: 'site-b',
        sourceSiteName: 'Site B',
        contentType: 'audio',
        federatedAt: Date.now() + 2000
      })
    ];
    
    for (const item of contentItems) {
      await storeA.federatedContent.put(item);
    }
    
    await waitFor(() => storeA.federatedContent.values.length === 3);
    
    // Search for "Amazing" content
    const results = await storeA.federatedContent.index.search({
      query: ['title'],
      value: 'Amazing'
    });
    
    expect(results).toHaveLength(2);
    expect(results.map(r => r.title).sort()).toEqual([
      'Amazing Podcast Episode',
      'Amazing Video Tutorial'
    ]);
  });

  test('multiple sites can maintain separate federation stores', async () => {
    const { store: storeA } = await createPeerWithStore('Site A');
    const { store: storeB } = await createPeerWithStore('Site B');
    const { store: storeC } = await createPeerWithStore('Site C');
    
    // Each site adds different federated content
    await storeA.federatedContent.put(new FederatedContentPointer({
      contentCid: 'QmFromA',
      title: 'Content federated by A',
      sourceSiteId: 'external-1',
      sourceSiteName: 'External Site 1',
      federatedAt: Date.now()
    }));
    
    await storeB.federatedContent.put(new FederatedContentPointer({
      contentCid: 'QmFromB',
      title: 'Content federated by B',
      sourceSiteId: 'external-2',
      sourceSiteName: 'External Site 2',
      federatedAt: Date.now()
    }));
    
    await storeC.federatedContent.put(new FederatedContentPointer({
      contentCid: 'QmFromC',
      title: 'Content federated by C',
      sourceSiteId: 'external-3',
      sourceSiteName: 'External Site 3',
      federatedAt: Date.now()
    }));
    
    // Wait for all content to be added
    await waitFor(() => storeA.federatedContent.values.length === 1);
    await waitFor(() => storeB.federatedContent.values.length === 1);
    await waitFor(() => storeC.federatedContent.values.length === 1);
    
    // Verify each store has only its own federated content
    const contentA = await storeA.federatedContent.values.toArray();
    const contentB = await storeB.federatedContent.values.toArray();
    const contentC = await storeC.federatedContent.values.toArray();
    
    expect(contentA[0].title).toBe('Content federated by A');
    expect(contentB[0].title).toBe('Content federated by B');
    expect(contentC[0].title).toBe('Content federated by C');
  });

  test('federation store scales with multiple content items', async () => {
    const { store } = await createPeerWithStore('Hub Site');
    
    // Add 20 federated content items
    const contentItems = [];
    for (let i = 0; i < 20; i++) {
      contentItems.push(new FederatedContentPointer({
        contentCid: `Qm${i}`,
        title: `Content ${i} from Site ${Math.floor(i / 5)}`,
        sourceSiteId: `site-${Math.floor(i / 5)}`,
        sourceSiteName: `Site ${Math.floor(i / 5)}`,
        contentType: i % 2 === 0 ? 'video' : 'audio',
        federatedAt: Date.now() + i * 1000
      }));
    }
    
    // Add all content
    for (const item of contentItems) {
      await store.federatedContent.put(item);
    }
    
    await waitFor(() => store.federatedContent.values.length === 20);
    
    // Search by source site
    const site0Content = await store.federatedContent.index.search({
      query: ['sourceSiteId'],
      value: 'site-0'
    });
    expect(site0Content).toHaveLength(5);
    
    // Search by content type
    const videos = await store.federatedContent.index.search({
      query: ['contentType'],
      value: 'video'
    });
    expect(videos).toHaveLength(10);
    
    // Search by title pattern
    const content1X = await store.federatedContent.index.search({
      query: ['title'],
      value: 'Content 1'
    });
    expect(content1X.length).toBeGreaterThanOrEqual(2); // At least "Content 1" and "Content 1X"
  });

  test('federation architecture summary', async () => {
    console.log(`
    
    Per-Site Federation Store Architecture:
    ======================================
    
    1. Each site maintains its own federation store
       - Complete control over what content to federate
       - No shared global state that can be abused
       
    2. Trust boundaries are explicit
       - Site owner has full control
       - Can grant write permissions to trusted sites
       - Can revoke permissions at any time
       
    3. Scales better than global index
       - No single bottleneck
       - Each site manages its own federation decisions
       - Natural sharding by site ownership
       
    4. Query aggregation pattern
       - Clients can query multiple federation stores
       - Combine results for unified view
       - Respect each site's curation decisions
       
    5. Benefits over global shared index:
       - No spam/abuse from untrusted sources
       - Clear ownership and responsibility
       - Better performance through distribution
       - Simpler trust model
    
    `);
    
    expect(true).toBe(true); // Test passes, this is just documentation
  });
});