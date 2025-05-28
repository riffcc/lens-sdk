import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { SiteFederationIndex, IndexedContentPointer } from '../src/site-federation-index';
import { getUsablePort } from './utils';

describe('SiteFederationIndex', () => {
  let peers: Peerbit[];
  let indexes: SiteFederationIndex[];

  beforeEach(async () => {
    jest.setTimeout(60000);
    peers = [];
    indexes = [];
  });

  afterEach(async () => {
    await Promise.all(indexes.map(index => index.close()));
    await Promise.all(peers.map(peer => peer.stop()));
  });

  async function createPeerWithIndex(name: string) {
    const peer = await Peerbit.create({
      libp2p: {
        addresses: {
          listen: [`/ip4/127.0.0.1/tcp/${await getUsablePort()}/ws`]
        }
      }
    });
    await peer.start();
    
    const index = await peer.open(new SiteFederationIndex(), {
      args: {
        replicate: true,
        replicas: {
          min: 1
        }
      }
    });
    
    peers.push(peer);
    indexes.push(index);
    
    console.log(`Created ${name} with index at ${index.address}`);
    return { peer, index };
  }

  test('sites maintain their own federation indexes', async () => {
    const { index: indexA } = await createPeerWithIndex('Site A');
    const { index: indexB } = await createPeerWithIndex('Site B');
    
    expect(indexA.address).toBeDefined();
    expect(indexB.address).toBeDefined();
    expect(indexA.address).not.toBe(indexB.address);
  });

  test('sites can grant write permissions to followed sites', async () => {
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    
    // Site A grants index write permission to Site B (A follows B)
    await indexA.grantIndexWritePermission(peerB.identity.publicKey);
    
    // Wait for permission to propagate
    await waitFor(() => indexA.indexWriters.access.values.length === 1);
    
    // Verify Site B has write permission
    const hasPermission = await indexA.hasIndexWritePermission(peerB.identity.publicKey);
    expect(hasPermission).toBe(true);
  });

  test('followed sites can add their content to followers index', async () => {
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    
    // Site A follows Site B - grants write permission
    await indexA.grantIndexWritePermission(peerB.identity.publicKey);
    await waitFor(() => indexA.indexWriters.access.values.length === 1);
    
    // Site B opens Site A's index
    const indexAFromB = await peerB.open<SiteFederationIndex>(indexA.address);
    
    // Site B adds its content to Site A's index
    const contentFromB = new IndexedContentPointer({
      contentCid: 'QmBContent123',
      title: 'Amazing Tutorial from Site B',
      sourceSiteId: indexB.address,
      sourceSiteName: 'Site B',
      description: 'Learn how to build distributed systems',
      contentType: 'video',
      federatedAt: Date.now(),
      originalCreatedAt: Date.now() - 86400000, // 1 day ago
      originalReleaseId: 'release-123'
    });
    
    await indexAFromB.indexContent(contentFromB);
    
    // Verify content appears in Site A's index
    await waitFor(() => indexA.contentIndex.values.length === 1);
    const indexed = await indexA.contentIndex.values.toArray();
    expect(indexed).toHaveLength(1);
    expect(indexed[0].title).toBe('Amazing Tutorial from Site B');
    expect(indexed[0].sourceSiteId).toBe(indexB.address);
  });

  test('unified search across all followed sites content', async () => {
    const { peer: hubPeer, index: hubIndex } = await createPeerWithIndex('Hub');
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    const { peer: peerC, index: indexC } = await createPeerWithIndex('Site C');
    
    // Connect all peers to hub
    await peerA.dial(hubPeer.getMultiaddrs()[0]);
    await peerB.dial(hubPeer.getMultiaddrs()[0]);
    await peerC.dial(hubPeer.getMultiaddrs()[0]);
    
    // Hub follows all sites
    await hubIndex.grantIndexWritePermission(peerA.identity.publicKey);
    await hubIndex.grantIndexWritePermission(peerB.identity.publicKey);
    await hubIndex.grantIndexWritePermission(peerC.identity.publicKey);
    await waitFor(() => hubIndex.indexWriters.access.values.length === 3);
    
    // Each site adds content to hub's index
    const hubIndexFromA = await peerA.open<SiteFederationIndex>(hubIndex.address);
    const hubIndexFromB = await peerB.open<SiteFederationIndex>(hubIndex.address);
    const hubIndexFromC = await peerC.open<SiteFederationIndex>(hubIndex.address);
    
    // Site A adds video content
    await hubIndexFromA.indexContent(new IndexedContentPointer({
      contentCid: 'QmVideoA1',
      title: 'Introduction to Distributed Systems',
      sourceSiteId: indexA.address,
      sourceSiteName: 'Site A',
      contentType: 'video',
      federatedAt: Date.now()
    }));
    
    await hubIndexFromA.indexContent(new IndexedContentPointer({
      contentCid: 'QmVideoA2',
      title: 'Advanced Distributed Algorithms',
      sourceSiteId: indexA.address,
      sourceSiteName: 'Site A',
      contentType: 'video',
      federatedAt: Date.now() + 1000
    }));
    
    // Site B adds audio content
    await hubIndexFromB.indexContent(new IndexedContentPointer({
      contentCid: 'QmAudioB1',
      title: 'Distributed Systems Podcast Episode 1',
      sourceSiteId: indexB.address,
      sourceSiteName: 'Site B',
      contentType: 'audio',
      federatedAt: Date.now() + 2000
    }));
    
    // Site C adds mixed content
    await hubIndexFromC.indexContent(new IndexedContentPointer({
      contentCid: 'QmVideoC1',
      title: 'Building Distributed Applications',
      sourceSiteId: indexC.address,
      sourceSiteName: 'Site C',
      contentType: 'video',
      federatedAt: Date.now() + 3000
    }));
    
    await waitFor(() => hubIndex.contentIndex.values.length === 4);
    
    // Search for "Distributed" content across all sites
    const distributedContent = await hubIndex.searchContent('Distributed');
    expect(distributedContent).toHaveLength(4);
    
    // Search for videos only
    const videos = await hubIndex.searchContent('', { contentType: 'video' });
    expect(videos).toHaveLength(3);
    
    // Search for content from Site A
    const siteAContent = await hubIndex.getContentFromSite(indexA.address);
    expect(siteAContent).toHaveLength(2);
    
    // Get recent content
    const recent = await hubIndex.getRecentContent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].sourceSiteName).toBe('Site C'); // Most recent
    expect(recent[1].sourceSiteName).toBe('Site B'); // Second most recent
  });

  test('index and store work together for complete federation', async () => {
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    
    // Site A follows Site B
    await indexA.grantIndexWritePermission(peerB.identity.publicKey);
    await waitFor(() => indexA.indexWriters.access.values.length === 1);
    
    // Site B adds multiple releases to A's index
    const indexAFromB = await peerB.open<SiteFederationIndex>(indexA.address);
    
    const releases = [
      {
        contentCid: 'QmDoc1',
        title: 'Documentation: Getting Started',
        contentType: 'document',
        description: 'Learn the basics'
      },
      {
        contentCid: 'QmVideo1',
        title: 'Video Tutorial: Advanced Topics',
        contentType: 'video',
        description: 'Deep dive into complex features'
      },
      {
        contentCid: 'QmCode1',
        title: 'Code Example: Best Practices',
        contentType: 'code',
        description: 'Production-ready patterns'
      }
    ];
    
    for (const release of releases) {
      await indexAFromB.indexContent(new IndexedContentPointer({
        ...release,
        sourceSiteId: indexB.address,
        sourceSiteName: 'Site B',
        federatedAt: Date.now()
      }));
    }
    
    await waitFor(() => indexA.contentIndex.values.length === 3);
    
    // Site A can now search its index for content from all followed sites
    const tutorials = await indexA.searchContent('Tutorial');
    expect(tutorials).toHaveLength(1);
    expect(tutorials[0].title).toBe('Video Tutorial: Advanced Topics');
    
    // Site A can filter by content type
    const videos = await indexA.searchContent('', { contentType: 'video' });
    expect(videos).toHaveLength(1);
    
    const documents = await indexA.searchContent('', { contentType: 'document' });
    expect(documents).toHaveLength(1);
  });

  test('revoke permissions removes write access', async () => {
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    
    // Grant permission
    await indexA.grantIndexWritePermission(peerB.identity.publicKey);
    await waitFor(() => indexA.indexWriters.access.values.length === 1);
    
    // Site B adds content
    const indexAFromB = await peerB.open<SiteFederationIndex>(indexA.address);
    await indexAFromB.indexContent(new IndexedContentPointer({
      contentCid: 'QmTest1',
      title: 'Test Content',
      sourceSiteId: indexB.address,
      sourceSiteName: 'Site B',
      federatedAt: Date.now()
    }));
    
    await waitFor(() => indexA.contentIndex.values.length === 1);
    
    // Revoke permission
    await indexA.revokeIndexWritePermission(peerB.identity.publicKey);
    await waitFor(() => indexA.indexWriters.access.values.length === 0);
    
    // Site B should no longer be able to add content
    await expect(
      indexAFromB.indexContent(new IndexedContentPointer({
        contentCid: 'QmTest2',
        title: 'Should Fail',
        sourceSiteId: indexB.address,
        sourceSiteName: 'Site B',
        federatedAt: Date.now()
      }))
    ).rejects.toThrow();
    
    // Verify only the first content exists
    const content = await indexA.contentIndex.values.toArray();
    expect(content).toHaveLength(1);
    expect(content[0].title).toBe('Test Content');
  });

  test('sites can maintain bi-directional federation', async () => {
    const { peer: peerA, index: indexA } = await createPeerWithIndex('Site A');
    const { peer: peerB, index: indexB } = await createPeerWithIndex('Site B');
    
    // Connect peers
    await peerB.dial(peerA.getMultiaddrs()[0]);
    
    // A follows B, B follows A (bi-directional)
    await indexA.grantIndexWritePermission(peerB.identity.publicKey);
    await indexB.grantIndexWritePermission(peerA.identity.publicKey);
    
    await waitFor(() => indexA.indexWriters.access.values.length === 1);
    await waitFor(() => indexB.indexWriters.access.values.length === 1);
    
    // Open each other's indexes
    const indexAFromB = await peerB.open<SiteFederationIndex>(indexA.address);
    const indexBFromA = await peerA.open<SiteFederationIndex>(indexB.address);
    
    // B adds content to A's index
    await indexAFromB.indexContent(new IndexedContentPointer({
      contentCid: 'QmFromB',
      title: 'Content from B in A index',
      sourceSiteId: indexB.address,
      sourceSiteName: 'Site B',
      federatedAt: Date.now()
    }));
    
    // A adds content to B's index
    await indexBFromA.indexContent(new IndexedContentPointer({
      contentCid: 'QmFromA',
      title: 'Content from A in B index',
      sourceSiteId: indexA.address,
      sourceSiteName: 'Site A',
      federatedAt: Date.now()
    }));
    
    // Verify both indexes have the other's content
    await waitFor(() => indexA.contentIndex.values.length === 1);
    await waitFor(() => indexB.contentIndex.values.length === 1);
    
    const contentInA = await indexA.contentIndex.values.toArray();
    expect(contentInA[0].sourceSiteName).toBe('Site B');
    
    const contentInB = await indexB.contentIndex.values.toArray();
    expect(contentInB[0].sourceSiteName).toBe('Site A');
  });
});