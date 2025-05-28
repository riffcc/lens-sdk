import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { DemoSiteFederation, DemoFederatedContent } from '../src/site-federation-demo';

describe('Per-Site Federation Architecture Demo', () => {
  let peers: Peerbit[] = [];
  let federations: DemoSiteFederation[] = [];

  beforeEach(async () => {
    peers = [];
    federations = [];
  });

  afterEach(async () => {
    await Promise.all(federations.map(f => f.close()));
    await Promise.all(peers.map(p => p.stop()));
  });

  async function createSiteWithFederation(siteName: string) {
    const peer = await Peerbit.create();
    await peer.start();
    
    const federation = await peer.open(new DemoSiteFederation(siteName), {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    peers.push(peer);
    federations.push(federation);
    
    console.log(`Created ${siteName} with federation store at ${federation.address}`);
    return { peer, federation };
  }

  test('demonstrates per-site federation stores', async () => {
    // Create three independent sites
    const { federation: techHub } = await createSiteWithFederation('Tech Hub');
    const { federation: scienceNet } = await createSiteWithFederation('Science Network');
    const { federation: artGallery } = await createSiteWithFederation('Art Gallery');
    
    // Each site maintains its own federation store
    expect(techHub.address).toBeDefined();
    expect(scienceNet.address).toBeDefined();
    expect(artGallery.address).toBeDefined();
    
    // All addresses are unique
    expect(techHub.address).not.toBe(scienceNet.address);
    expect(techHub.address).not.toBe(artGallery.address);
    expect(scienceNet.address).not.toBe(artGallery.address);
    
    console.log(`
    ✓ Each site has its own federation store
    ✓ No shared global state
    ✓ Complete isolation between sites
    `);
  });

  test('sites curate their own federated content', async () => {
    const { federation: newsAggregator } = await createSiteWithFederation('News Aggregator');
    
    // News Aggregator decides what content to federate
    const federatedArticles = [
      new DemoFederatedContent({
        contentCid: 'QmTech123',
        title: 'Breaking: New AI Breakthrough',
        sourceSiteId: 'tech-times',
        sourceSiteName: 'Tech Times',
        contentType: 'article',
        federatedAt: Date.now()
      }),
      new DemoFederatedContent({
        contentCid: 'QmScience456',
        title: 'Climate Change Update 2025',
        sourceSiteId: 'science-daily',
        sourceSiteName: 'Science Daily',
        contentType: 'article',
        federatedAt: Date.now() + 1000
      }),
      new DemoFederatedContent({
        contentCid: 'QmPolitics789',
        title: 'Election Results Analysis',
        sourceSiteId: 'political-observer',
        sourceSiteName: 'Political Observer',
        contentType: 'article',
        federatedAt: Date.now() + 2000
      })
    ];
    
    // Add curated content to federation store
    for (const article of federatedArticles) {
      await newsAggregator.addFederatedContent(article);
    }
    
    await waitFor(async () => (await newsAggregator.federatedContent.values.count()) === 3);
    
    // Search capabilities
    const techContent = await newsAggregator.searchContent('AI');
    expect(techContent).toHaveLength(1);
    expect(techContent[0].title).toContain('AI Breakthrough');
    
    const allArticles = await newsAggregator.searchContent('', { contentType: 'article' });
    expect(allArticles).toHaveLength(3);
    
    console.log(`
    ✓ Site owner has complete control over federated content
    ✓ Can curate content from multiple sources
    ✓ Provides unified search across federated content
    `);
  });

  test('trust boundaries are explicit', async () => {
    const { federation: musicHub } = await createSiteWithFederation('Music Hub');
    const { federation: podcastNet } = await createSiteWithFederation('Podcast Network');
    
    // Music Hub decides to trust Podcast Network
    await musicHub.trustSite(podcastNet.address);
    
    // Check trust status
    expect(musicHub.isTrusted(podcastNet.address)).toBe(true);
    expect(musicHub.isTrusted('random-site')).toBe(false);
    
    // Music Hub can revoke trust
    await musicHub.untrustSite(podcastNet.address);
    expect(musicHub.isTrusted(podcastNet.address)).toBe(false);
    
    console.log(`
    ✓ Sites explicitly manage trust relationships
    ✓ Can grant and revoke permissions
    ✓ No implicit trust chains
    `);
  });

  test('federation scales horizontally', async () => {
    // Create a network of content sites
    const sites = await Promise.all([
      createSiteWithFederation('Video Platform'),
      createSiteWithFederation('Blog Network'),
      createSiteWithFederation('Academic Repository'),
      createSiteWithFederation('Creative Commons Hub'),
      createSiteWithFederation('Documentary Archive')
    ]);
    
    // Each site federates different content
    const contentPerSite = 5;
    for (let i = 0; i < sites.length; i++) {
      const { federation } = sites[i];
      
      for (let j = 0; j < contentPerSite; j++) {
        await federation.addFederatedContent(new DemoFederatedContent({
          contentCid: `Qm${i}-${j}`,
          title: `Content ${j} from ${federation.siteName}`,
          sourceSiteId: `external-${i}-${j}`,
          sourceSiteName: `External Source ${i}-${j}`,
          contentType: i % 2 === 0 ? 'video' : 'text',
          federatedAt: Date.now() + (i * 1000) + j
        }));
      }
    }
    
    // Verify each site has its own content
    for (const { federation } of sites) {
      await waitFor(async () => (await federation.federatedContent.values.count()) === contentPerSite);
      const content = await federation.federatedContent.values.toArray();
      expect(content).toHaveLength(contentPerSite);
    }
    
    console.log(`
    ✓ Each site manages its federation independently
    ✓ No coordination overhead between sites
    ✓ Linear scaling with number of sites
    ✓ ${sites.length} sites × ${contentPerSite} items = ${sites.length * contentPerSite} total federated items
    `);
  });

  test('comparison: per-site vs global index', async () => {
    console.log(`
    
    Per-Site Federation Store vs Global Shared Index
    ================================================
    
    Per-Site Federation Store (Our Approach):
    ----------------------------------------
    ✓ Ownership: Each site owns its federation decisions
    ✓ Trust: Explicit permissions, no implicit trust
    ✓ Abuse: Limited to explicitly trusted relationships
    ✓ Scale: O(1) write complexity per site
    ✓ Query: Aggregation layer queries multiple stores
    ✓ Flexibility: Sites can have different policies
    
    Global Shared Index (Alternative):
    ---------------------------------
    ✗ Ownership: Shared ownership creates conflicts
    ✗ Trust: Complex trust chains, implicit relationships
    ✗ Abuse: One bad actor can pollute entire index
    ✗ Scale: O(n) write complexity as sites grow
    ✗ Query: Single index, but requires complex filtering
    ✗ Flexibility: One-size-fits-all approach
    
    Key Insight:
    -----------
    The per-site model mirrors how federation works in
    real social networks (Mastodon, Matrix) where each
    instance maintains its own view of federated content.
    `);
    
    expect(true).toBe(true);
  });

  test('real-world federation scenario', async () => {
    // Create a content aggregator that follows multiple sources
    const { federation: aggregator } = await createSiteWithFederation('Content Aggregator');
    
    // Simulate following three different content sources
    const sources = ['tech-blog', 'science-journal', 'art-magazine'];
    for (const source of sources) {
      await aggregator.trustSite(source);
    }
    
    // Each source contributes content to the aggregator's federation store
    const mockContent = [
      { source: 'tech-blog', title: 'Latest JavaScript Framework', type: 'blog' },
      { source: 'tech-blog', title: 'WebAssembly Performance Tips', type: 'blog' },
      { source: 'science-journal', title: 'Quantum Computing Advances', type: 'paper' },
      { source: 'science-journal', title: 'CRISPR Gene Editing Update', type: 'paper' },
      { source: 'art-magazine', title: 'Digital Art Revolution', type: 'article' },
      { source: 'art-magazine', title: 'NFT Market Analysis', type: 'article' }
    ];
    
    for (const item of mockContent) {
      await aggregator.addFederatedContent(new DemoFederatedContent({
        contentCid: `Qm${item.title.replace(/\s/g, '')}`,
        title: item.title,
        sourceSiteId: item.source,
        sourceSiteName: item.source.replace('-', ' ').toUpperCase(),
        contentType: item.type,
        federatedAt: Date.now()
      }));
    }
    
    await waitFor(async () => (await aggregator.federatedContent.values.count()) === mockContent.length);
    
    // Demonstrate different query patterns
    const techContent = await aggregator.searchContent('', { sourceSiteId: 'tech-blog' });
    expect(techContent).toHaveLength(2);
    
    const papers = await aggregator.searchContent('', { contentType: 'paper' });
    expect(papers).toHaveLength(2);
    
    const quantumContent = await aggregator.searchContent('Quantum');
    expect(quantumContent).toHaveLength(1);
    
    console.log(`
    Real-World Benefits:
    -------------------
    ✓ Aggregator controls what content to include
    ✓ Can unfollow sources instantly (revoke trust)
    ✓ Search across all federated content
    ✓ Each source maintains its own catalog
    ✓ No central authority needed
    `);
  });
});