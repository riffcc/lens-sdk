import { Peerbit } from 'peerbit';
import { Ed25519PublicKey } from '@peerbit/crypto';
import { waitFor } from '@peerbit/time';
import { SiteFederationStore, FederatedContentPointer } from '../src/site-federation-store';
import { getUsablePort } from './utils';
import { AccessType } from '@peerbit/document';

describe('SiteFederationStore', () => {
  let peers: Peerbit[];
  let stores: SiteFederationStore[];

  beforeEach(async () => {
    jest.setTimeout(60000);
    peers = [];
    stores = [];
  });

  afterEach(async () => {
    await Promise.all(stores.map(store => store.close()));
    await Promise.all(peers.map(peer => peer.stop()));
  });

  async function createPeerWithStore(name: string) {
    const peer = await Peerbit.create({
      libp2p: {
        addresses: {
          listen: [`/ip4/127.0.0.1/tcp/${await getUsablePort()}/ws`]
        }
      }
    });
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

  test('sites can grant write permissions to trusted sites', async () => {
    const { peer: peerA, store: storeA } = await createPeerWithStore('Site A');
    const { peer: peerB, store: storeB } = await createPeerWithStore('Site B');
    
    // Site A grants permission to Site B
    await storeA.grantFederationPermission(peerB.identity.publicKey);
    
    // Wait for permission to propagate
    await waitFor(() => storeA.trustedFederators.access.values.length === 1);
    
    // Verify Site B has write permission
    const hasPermission = await storeA.hasFederationPermission(peerB.identity.publicKey);
    expect(hasPermission).toBe(true);
  });

  test('only authorized sites can write federated content', async () => {
    const { peer: peerA, store: storeA } = await createPeerWithStore('Site A');
    const { peer: peerB, store: storeB } = await createPeerWithStore('Site B');
    const { peer: peerC, store: storeC } = await createPeerWithStore('Site C');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    await peerC.dial(peerA.getMultiaddrs()[0]);
    
    // Site B opens Site A's federation store
    const storeAFromB = await peerB.open<SiteFederationStore>(storeA.address);
    const storeAFromC = await peerC.open<SiteFederationStore>(storeA.address);
    
    // Site A grants permission only to Site B
    await storeA.grantFederationPermission(peerB.identity.publicKey);
    await waitFor(() => storeA.trustedFederators.access.values.length === 1);
    
    // Site B should be able to add content
    const contentFromB = new FederatedContentPointer({
      contentCid: 'QmTest123',
      title: 'Content from Site B',
      sourceSiteId: storeB.address,
      sourceSiteName: 'Site B',
      federatedAt: Date.now()
    });
    
    await expect(storeAFromB.federatedContent.put(contentFromB)).resolves.not.toThrow();
    
    // Site C should NOT be able to add content
    const contentFromC = new FederatedContentPointer({
      contentCid: 'QmTest456',
      title: 'Content from Site C',
      sourceSiteId: storeC.address,
      sourceSiteName: 'Site C',
      federatedAt: Date.now()
    });
    
    await expect(storeAFromC.federatedContent.put(contentFromC)).rejects.toThrow();
    
    // Verify only B's content was added
    await waitFor(() => storeA.federatedContent.values.length === 1);
    const content = await storeA.federatedContent.values.toArray();
    expect(content).toHaveLength(1);
    expect(content[0].title).toBe('Content from Site B');
  });

  test('sites can revoke federation permissions', async () => {
    const { peer: peerA, store: storeA } = await createPeerWithStore('Site A');
    const { peer: peerB, store: storeB } = await createPeerWithStore('Site B');
    
    // Grant permission
    await storeA.grantFederationPermission(peerB.identity.publicKey);
    await waitFor(() => storeA.trustedFederators.access.values.length === 1);
    
    let hasPermission = await storeA.hasFederationPermission(peerB.identity.publicKey);
    expect(hasPermission).toBe(true);
    
    // Revoke permission
    await storeA.revokeFederationPermission(peerB.identity.publicKey);
    await waitFor(() => storeA.trustedFederators.access.values.length === 0);
    
    hasPermission = await storeA.hasFederationPermission(peerB.identity.publicKey);
    expect(hasPermission).toBe(false);
  });

  test('federation scales with multiple sites', async () => {
    // Create a hub site and multiple spoke sites
    const { peer: hubPeer, store: hubStore } = await createPeerWithStore('Hub');
    const spokes: Array<{ peer: Peerbit; store: SiteFederationStore }> = [];
    
    // Create 5 spoke sites
    for (let i = 0; i < 5; i++) {
      const spoke = await createPeerWithStore(`Spoke ${i}`);
      spokes.push(spoke);
      
      // Connect to hub
      await spoke.peer.dial(hubPeer.getMultiaddrs()[0]);
      
      // Hub grants permission to spoke
      await hubStore.grantFederationPermission(spoke.peer.identity.publicKey);
    }
    
    // Wait for all permissions
    await waitFor(() => hubStore.trustedFederators.access.values.length === 5);
    
    // Each spoke adds content to hub's federation store
    for (let i = 0; i < spokes.length; i++) {
      const spoke = spokes[i];
      const hubFromSpoke = await spoke.peer.open<SiteFederationStore>(hubStore.address);
      
      const content = new FederatedContentPointer({
        contentCid: `QmSpoke${i}`,
        title: `Content from Spoke ${i}`,
        sourceSiteId: spoke.store.address,
        sourceSiteName: `Spoke ${i}`,
        federatedAt: Date.now()
      });
      
      await hubFromSpoke.federatedContent.put(content);
    }
    
    // Verify hub has all content
    await waitFor(() => hubStore.federatedContent.values.length === 5);
    const allContent = await hubStore.federatedContent.values.toArray();
    expect(allContent).toHaveLength(5);
    
    // Verify content is properly indexed
    for (let i = 0; i < 5; i++) {
      const found = allContent.find(c => c.title === `Content from Spoke ${i}`);
      expect(found).toBeDefined();
      expect(found!.sourceSiteName).toBe(`Spoke ${i}`);
    }
  });

  test('sites can query federated content', async () => {
    const { peer: peerA, store: storeA } = await createPeerWithStore('Site A');
    const { peer: peerB, store: storeB } = await createPeerWithStore('Site B');
    
    // Connect and grant permission
    await peerB.dial(peerA.getMultiaddrs()[0]);
    await storeA.grantFederationPermission(peerB.identity.publicKey);
    await waitFor(() => storeA.trustedFederators.access.values.length === 1);
    
    // Site B adds multiple content items
    const storeAFromB = await peerB.open<SiteFederationStore>(storeA.address);
    
    const contentItems = [
      new FederatedContentPointer({
        contentCid: 'QmVideo1',
        title: 'Amazing Video Tutorial',
        sourceSiteId: storeB.address,
        sourceSiteName: 'Site B',
        federatedAt: Date.now()
      }),
      new FederatedContentPointer({
        contentCid: 'QmVideo2',
        title: 'Cooking Show Episode',
        sourceSiteId: storeB.address,
        sourceSiteName: 'Site B',
        federatedAt: Date.now() + 1000
      }),
      new FederatedContentPointer({
        contentCid: 'QmAudio1',
        title: 'Amazing Podcast Episode',
        sourceSiteId: storeB.address,
        sourceSiteName: 'Site B',
        federatedAt: Date.now() + 2000
      })
    ];
    
    for (const item of contentItems) {
      await storeAFromB.federatedContent.put(item);
    }
    
    await waitFor(() => storeA.federatedContent.values.length === 3);
    
    // Query for "Amazing" content
    const results = await storeA.federatedContent.index.search(
      new SearchRequest({
        query: ['title'],
        value: 'Amazing'
      })
    );
    
    expect(results).toHaveLength(2);
    expect(results.map(r => r.title).sort()).toEqual([
      'Amazing Podcast Episode',
      'Amazing Video Tutorial'
    ]);
  });

  test('trust chains: B trusts A, C trusts B scenario', async () => {
    const { peer: peerA, store: storeA } = await createPeerWithStore('Site A');
    const { peer: peerB, store: storeB } = await createPeerWithStore('Site B');
    const { peer: peerC, store: storeC } = await createPeerWithStore('Site C');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    await peerC.dial(peerB.getMultiaddrs()[0]);
    
    // B trusts A (B adds A's content to its federation store)
    await storeB.grantFederationPermission(peerA.identity.publicKey);
    
    // C trusts B (C adds B's content to its federation store)
    await storeC.grantFederationPermission(peerB.identity.publicKey);
    
    // A adds content to B's federation store
    const storeBFromA = await peerA.open<SiteFederationStore>(storeB.address);
    await waitFor(() => storeB.trustedFederators.access.values.length === 1);
    
    const contentFromA = new FederatedContentPointer({
      contentCid: 'QmFromA',
      title: 'Original content from A',
      sourceSiteId: storeA.address,
      sourceSiteName: 'Site A',
      federatedAt: Date.now()
    });
    
    await storeBFromA.federatedContent.put(contentFromA);
    await waitFor(() => storeB.federatedContent.values.length === 1);
    
    // B adds content to C's federation store (including reference to A's content)
    const storeCFromB = await peerB.open<SiteFederationStore>(storeC.address);
    await waitFor(() => storeC.trustedFederators.access.values.length === 1);
    
    // B can choose to re-federate A's content to C
    const contentFromBAboutA = new FederatedContentPointer({
      contentCid: 'QmFromA', // Same content
      title: 'Original content from A (via B)',
      sourceSiteId: storeA.address, // Original source
      sourceSiteName: 'Site A (federated by B)',
      federatedAt: Date.now()
    });
    
    await storeCFromB.federatedContent.put(contentFromBAboutA);
    await waitFor(() => storeC.federatedContent.values.length === 1);
    
    // C now has A's content through B's curation
    const contentInC = await storeC.federatedContent.values.toArray();
    expect(contentInC).toHaveLength(1);
    expect(contentInC[0].contentCid).toBe('QmFromA');
    expect(contentInC[0].sourceSiteId).toBe(storeA.address);
  });
});