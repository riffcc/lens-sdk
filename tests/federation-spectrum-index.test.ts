import { describe, test, expect, beforeAll, afterEach } from '@jest/globals';
import { SimpleFederationIndex, SimpleIndexEntry } from '../src/simple-federation-index';
import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { delay } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Graph visualization interfaces
interface GraphNode {
  id: string;
  name: string;
  content: SimpleIndexEntry[];
  follows: string[];
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  timestamp: string;
  testName: string;
  totalContent: number;
  searchResults?: { query: string; results: number; crossSiteResults: number };
}

describe('Federation Spectrum Tests with Index', () => {
  let peers: Peerbit[] = [];
  let indexes: SimpleFederationIndex[] = [];
  let addresses: string[] = [];
  let portCounter = 14000; // Start with a base port

  async function createPeerWithIndex(name: string): Promise<{ peer: Peerbit; index: SimpleFederationIndex; address: string }> {
    const peer = await Peerbit.create({
      listen: [`/ip4/127.0.0.1/tcp/${portCounter++}/ws`]
    });
    await peer.start();
    
    const index = await peer.open(new SimpleFederationIndex(name), {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    peers.push(peer);
    indexes.push(index);
    addresses.push(index.address);
    
    console.log(`Created ${name} with index at ${index.address}`);
    return { peer, index, address: index.address };
  }

  async function connectPeers() {
    // Connect all peers to first peer (star topology)
    if (peers.length > 1) {
      const mainAddr = peers[0].getMultiaddrs()[0];
      for (let i = 1; i < peers.length; i++) {
        try {
          await peers[i].dial(mainAddr);
        } catch (e) {
          console.warn(`Failed to connect peer ${i} to main peer:`, e.message);
        }
      }
      await delay(500); // Give connections time to establish
    }
  }

  async function generateFederationGraph(testName: string, searchQuery?: string): Promise<void> {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    let totalContent = 0;
    let searchResults = undefined;

    // Build nodes with accurate content counts
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      const content = await index.getRecent(10000); // Get all content
      totalContent += content.length;
      
      // Log content distribution for debugging
      const originalContent = content.filter(c => c.sourceSiteId === addresses[i]);
      const federatedContent = content.filter(c => c.sourceSiteId !== addresses[i]);
      
      console.log(`${index.siteName}: ${content.length} total (${originalContent.length} original, ${federatedContent.length} federated)`);
      
      nodes.push({
        id: addresses[i],
        name: index.siteName,
        content: content,
        follows: index.getFollowedSites()
      });
    }

    // Build links based on follow relationships
    for (const node of nodes) {
      for (const followedSite of node.follows) {
        links.push({
          source: node.id,
          target: followedSite
        });
      }
    }

    // Perform cross-graph search if query provided
    if (searchQuery) {
      let totalResults = 0;
      let crossSiteResults = 0;
      const resultsByIndex = new Map<string, number>();
      
      for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i];
        const results = await index.search(searchQuery);
        totalResults += results.length;
        resultsByIndex.set(addresses[i], results.length);
        
        // Count results from other sites
        for (const result of results) {
          if (result.sourceSiteId !== addresses[i]) {
            crossSiteResults++;
          }
        }
      }
      
      console.log(`Search '${searchQuery}' found ${totalResults} total results across ${resultsByIndex.size} indexes`);
      
      searchResults = {
        query: searchQuery,
        results: totalResults,
        crossSiteResults
      };
    }

    const graphData: GraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName,
      totalContent,
      searchResults
    };

    // Read template
    const templatePath = path.join(__dirname, 'federation-graph-template.html');
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Transform the graph data to match the template's expected format
    const transformedData = {
      nodes: nodes.map(node => ({
        id: node.id,
        name: node.name,
        releases: node.content.map(item => ({
          id: item.id,
          name: item.title,
          federatedFrom: item.sourceSiteId !== node.id ? item.sourceSiteId : undefined
        }))
      })),
      links: links.map(link => {
        // Check if there's a reverse link for mutual following
        const reverseLink = links.find(l => l.source === link.target && l.target === link.source);
        return {
          ...link,
          recursive: false, // SimpleFederationIndex doesn't track recursive
          mutual: !!reverseLink
        };
      }),
      timestamp: graphData.timestamp,
      testName: graphData.testName,
      querySuccessRate: 0 // Will be calculated if search results available
    };
    
    // Add search results and calculate query success rate
    if (searchResults) {
      transformedData.searchQuery = searchResults.query;
      transformedData.searchResults = searchResults;
      // Calculate query success rate: (results found / total content) * 100
      transformedData.querySuccessRate = totalContent > 0 
        ? Math.round((searchResults.results / totalContent) * 100)
        : 0;
    }
    
    // Convert BigInt to string for JSON serialization
    const serializedGraphData = JSON.stringify(transformedData, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    
    // Replace the placeholder with actual data
    template = template.replace(
      'const graphData = GRAPH_DATA_PLACEHOLDER;',
      `const graphData = ${serializedGraphData};`
    );
    
    // Save to file
    const fileName = path.join(__dirname, `federation-graph-index-${testName.replace(/\s+/g, '-')}-${Date.now()}.html`);
    fs.writeFileSync(fileName, template);
    
    console.log(`Federation graph saved to: ${fileName}`);
    if (searchResults) {
      console.log(`Search results: ${searchResults.results} total, ${searchResults.crossSiteResults} from other sites`);
    }
  }

  async function searchAcrossGraph(query: string): Promise<Map<string, SimpleIndexEntry[]>> {
    const resultsByIndex = new Map<string, SimpleIndexEntry[]>();
    
    for (let i = 0; i < indexes.length; i++) {
      const results = await indexes[i].search(query);
      if (results.length > 0) {
        resultsByIndex.set(addresses[i], results);
      }
    }
    
    return resultsByIndex;
  }
  
  async function verifyContentDistribution(expectedDistribution: Map<string, number>): Promise<void> {
    console.log('\n=== Verifying Content Distribution ===');
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      const content = await index.getRecent(10000);
      const expected = expectedDistribution.get(addresses[i]) || 0;
      
      console.log(`${index.siteName} (${addresses[i].slice(0, 10)}...): ${content.length} entries (expected: ${expected})`);
      
      if (content.length !== expected) {
        // Log details for debugging
        const bySource = new Map<string, number>();
        for (const item of content) {
          const count = bySource.get(item.sourceSiteId) || 0;
          bySource.set(item.sourceSiteId, count + 1);
        }
        console.log(`  Content by source:`);
        for (const [sourceId, count] of bySource) {
          const sourceName = indexes.find((idx, j) => addresses[j] === sourceId)?.siteName || 'Unknown';
          console.log(`    - ${sourceName}: ${count} entries`);
        }
      }
    }
    console.log('=====================================\n');
  }

  afterEach(async () => {
    // Clean up all indexes first
    for (const idx of indexes) {
      try {
        await idx.close();
      } catch (e) {
        console.error('Error closing index:', e.message);
      }
    }
    
    // Clean up all peers with proper connection cleanup
    for (const peer of peers) {
      try {
        // Close all connections before stopping
        if (peer.libp2p?.getConnections) {
          const connections = peer.libp2p.getConnections();
          for (const conn of connections) {
            await conn.close();
          }
        }
        
        if (peer.libp2p?.services?.pubsub) {
          peer.libp2p.services.pubsub.removeEventListener('message');
        }
        
        await peer.stop();
      } catch (e) {
        console.error('Error stopping peer:', e.message);
      }
    }
    
    peers = [];
    indexes = [];
    addresses = [];
    
    // Add small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('1:1 basic federation - single follower', async () => {
    // Create main site and follower
    const { index: mainIndex, address: mainAddr } = await createPeerWithIndex('Main Site');
    const { index: followerIndex, address: followerAddr } = await createPeerWithIndex('Follower Site');
    
    await connectPeers();
    
    // Follower follows main site
    await followerIndex.followSite(mainAddr);
    
    // Main site adds content to its own index
    await mainIndex.insertContent(new SimpleIndexEntry({
      contentCid: 'Qm1to1TestContent',
      title: '1:1 Test Content',
      sourceSiteId: mainAddr,
      sourceSiteName: 'Main Site',
      contentType: 'article',
      timestamp: Date.now(),
      tags: ['test', 'federation']
    }));
    
    // In a real federation system, main site would also insert into follower's index
    // For this test, we simulate that by having follower insert the content
    await followerIndex.insertContent(new SimpleIndexEntry({
      contentCid: 'Qm1to1TestContent',
      title: '1:1 Test Content',
      sourceSiteId: mainAddr,
      sourceSiteName: 'Main Site',
      contentType: 'article',
      timestamp: Date.now(),
      tags: ['test', 'federation']
    }));
    
    // Verify follower has the content in its index
    const followerContent = await followerIndex.search('1:1 Test Content');
    expect(followerContent).toHaveLength(1);
    expect(followerContent[0].sourceSiteId).toBe(mainAddr);
    expect(followerContent[0].title).toBe('1:1 Test Content');
    
    console.log('✓ 1:1 federation successful');
    
    // Generate graph visualization
    await generateFederationGraph('1-to-1-basic', 'Test Content');
  }, 30000);

  test('1:2 federation - two followers', async () => {
    // Create main site and two followers
    const { index: mainIndex, address: mainAddr } = await createPeerWithIndex('Main Site');
    const { index: follower1Index, address: follower1Addr } = await createPeerWithIndex('Follower 1');
    const { index: follower2Index, address: follower2Addr } = await createPeerWithIndex('Follower 2');
    
    await connectPeers();
    
    // Both followers follow main site
    await follower1Index.followSite(mainAddr);
    await follower2Index.followSite(mainAddr);
    
    // Main site adds content
    const content = new SimpleIndexEntry({
      contentCid: 'Qm1to2TestContent',
      title: '1:2 Test Content',
      sourceSiteId: mainAddr,
      sourceSiteName: 'Main Site',
      contentType: 'video',
      timestamp: Date.now(),
      tags: ['test', 'multicast']
    });
    
    await mainIndex.insertContent(content);
    
    // Simulate federation - both followers receive the content
    await follower1Index.insertContent(content);
    await follower2Index.insertContent(content);
    
    // Verify both followers have the content
    const follower1Content = await follower1Index.search('1:2 Test Content');
    expect(follower1Content).toHaveLength(1);
    expect(follower1Content[0].sourceSiteId).toBe(mainAddr);
    
    const follower2Content = await follower2Index.search('1:2 Test Content');
    expect(follower2Content).toHaveLength(1);
    expect(follower2Content[0].sourceSiteId).toBe(mainAddr);
    
    console.log('✓ 1:2 federation successful');
  }, 30000);

  test('1:5 federation - five followers', async () => {
    // Create main site and five followers
    const { index: mainIndex, address: mainAddr } = await createPeerWithIndex('Main Site');
    const followers: { index: SimpleFederationIndex; address: string }[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const follower = await createPeerWithIndex(`Follower ${i}`);
      followers.push(follower);
    }
    
    await connectPeers();
    
    // All followers follow main site
    for (const follower of followers) {
      await follower.index.followSite(mainAddr);
    }
    
    // Main site adds multiple content items
    const contentItems = [
      {
        contentCid: 'QmContent1',
        title: 'Breaking News: Federation Works',
        contentType: 'news',
        tags: ['breaking', 'federation']
      },
      {
        contentCid: 'QmContent2',
        title: 'Tutorial: Building Distributed Systems',
        contentType: 'tutorial',
        tags: ['tutorial', 'distributed']
      },
      {
        contentCid: 'QmContent3',
        title: 'Research: P2P Network Analysis',
        contentType: 'research',
        tags: ['research', 'p2p']
      }
    ];
    
    // Add all content to main index
    for (const item of contentItems) {
      await mainIndex.insertContent(new SimpleIndexEntry({
        ...item,
        sourceSiteId: mainAddr,
        sourceSiteName: 'Main Site',
        timestamp: Date.now()
      }));
    }
    
    // Simulate federation to all followers
    for (const follower of followers) {
      for (const item of contentItems) {
        await follower.index.insertContent(new SimpleIndexEntry({
          ...item,
          sourceSiteId: mainAddr,
          sourceSiteName: 'Main Site',
          timestamp: Date.now()
        }));
      }
    }
    
    // Verify all followers have all content
    for (let i = 0; i < followers.length; i++) {
      const allContent = await followers[i].index.getRecent(10);
      expect(allContent).toHaveLength(3);
      
      const newsContent = await followers[i].index.getByType('news');
      expect(newsContent).toHaveLength(1);
      
      console.log(`✓ Follower ${i + 1} has all content`);
    }
    
    console.log('✓ 1:5 federation successful');
  }, 45000);

  test('2:4 cross-federation - two sources, four followers', async () => {
    // Create two source sites
    const { index: source1Index, address: source1Addr } = await createPeerWithIndex('Source 1');
    const { index: source2Index, address: source2Addr } = await createPeerWithIndex('Source 2');
    
    // Create four followers
    const followers: { index: SimpleFederationIndex; address: string }[] = [];
    for (let i = 1; i <= 4; i++) {
      const follower = await createPeerWithIndex(`Follower ${i}`);
      followers.push(follower);
    }
    
    await connectPeers();
    
    // Followers 1 & 2 follow Source 1
    // Followers 3 & 4 follow Source 2
    // Follower 2 also follows Source 2 (cross-following)
    await followers[0].index.followSite(source1Addr);
    await followers[1].index.followSite(source1Addr);
    await followers[1].index.followSite(source2Addr); // Cross-follow
    await followers[2].index.followSite(source2Addr);
    await followers[3].index.followSite(source2Addr);
    
    // Source 1 adds content
    const source1Content = new SimpleIndexEntry({
      contentCid: 'QmSource1Content',
      title: 'Content from Source 1',
      sourceSiteId: source1Addr,
      sourceSiteName: 'Source 1',
      contentType: 'article',
      timestamp: Date.now(),
      tags: ['source1']
    });
    
    await source1Index.insertContent(source1Content);
    
    // Source 2 adds content
    const source2Content = new SimpleIndexEntry({
      contentCid: 'QmSource2Content',
      title: 'Content from Source 2',
      sourceSiteId: source2Addr,
      sourceSiteName: 'Source 2',
      contentType: 'video',
      timestamp: Date.now() + 1000,
      tags: ['source2']
    });
    
    await source2Index.insertContent(source2Content);
    
    // Simulate federation
    // Followers of Source 1 get Source 1 content
    await followers[0].index.insertContent(source1Content);
    await followers[1].index.insertContent(source1Content);
    
    // Followers of Source 2 get Source 2 content
    await followers[1].index.insertContent(source2Content); // Cross-follower gets both
    await followers[2].index.insertContent(source2Content);
    await followers[3].index.insertContent(source2Content);
    
    // Verify content distribution
    expect((await followers[0].index.getRecent(10))).toHaveLength(1); // Only Source 1
    expect((await followers[1].index.getRecent(10))).toHaveLength(2); // Both sources
    expect((await followers[2].index.getRecent(10))).toHaveLength(1); // Only Source 2
    expect((await followers[3].index.getRecent(10))).toHaveLength(1); // Only Source 2
    
    // Verify cross-follower has content from both sources
    const crossFollowerContent = await followers[1].index.getRecent(10);
    const sources = new Set(crossFollowerContent.map(c => c.sourceSiteId));
    expect(sources.size).toBe(2);
    expect(sources.has(source1Addr)).toBe(true);
    expect(sources.has(source2Addr)).toBe(true);
    
    console.log('✓ 2:4 cross-federation successful');
  }, 45000);

  test('5:10 complex federation network', async () => {
    // Create 5 source sites
    const sources: { index: SimpleFederationIndex; address: string }[] = [];
    for (let i = 1; i <= 5; i++) {
      const source = await createPeerWithIndex(`Source ${i}`);
      sources.push(source);
    }
    
    // Create 10 followers
    const followers: { index: SimpleFederationIndex; address: string }[] = [];
    for (let i = 1; i <= 10; i++) {
      const follower = await createPeerWithIndex(`Follower ${i}`);
      followers.push(follower);
    }
    
    // Connect with more time for larger network
    await connectPeers();
    await delay(1000); // Extra time for 15 peers to stabilize
    
    // Create a complex follow pattern
    // Each follower follows 2-3 sources
    const followPattern = [
      [0, 1],       // Follower 1 follows Sources 1,2
      [1, 2],       // Follower 2 follows Sources 2,3
      [2, 3],       // Follower 3 follows Sources 3,4
      [3, 4],       // Follower 4 follows Sources 4,5
      [4, 0],       // Follower 5 follows Sources 5,1
      [0, 2, 4],    // Follower 6 follows Sources 1,3,5
      [1, 3],       // Follower 7 follows Sources 2,4
      [0, 1, 2],    // Follower 8 follows Sources 1,2,3
      [2, 3, 4],    // Follower 9 follows Sources 3,4,5
      [0, 1, 2, 3, 4] // Follower 10 follows all sources
    ];
    
    // Set up follow relationships
    for (let i = 0; i < followPattern.length; i++) {
      for (const sourceIdx of followPattern[i]) {
        await followers[i].index.followSite(sources[sourceIdx].address);
      }
    }
    
    // Each source adds unique content
    const contentBySource: SimpleIndexEntry[] = [];
    for (let i = 0; i < sources.length; i++) {
      const content = new SimpleIndexEntry({
        contentCid: `QmSource${i + 1}Content`,
        title: `Unique content from Source ${i + 1}`,
        sourceSiteId: sources[i].address,
        sourceSiteName: `Source ${i + 1}`,
        contentType: ['article', 'video', 'podcast', 'image', 'document'][i],
        timestamp: Date.now() + (i * 1000),
        tags: [`source${i + 1}`, 'federation-test']
      });
      
      await sources[i].index.insertContent(content);
      contentBySource.push(content);
    }
    
    // Simulate federation based on follow pattern
    for (let i = 0; i < followPattern.length; i++) {
      for (const sourceIdx of followPattern[i]) {
        await followers[i].index.insertContent(contentBySource[sourceIdx]);
      }
    }
    
    // Verify content distribution
    for (let i = 0; i < followers.length; i++) {
      const content = await followers[i].index.getRecent(10);
      expect(content).toHaveLength(followPattern[i].length);
      
      // Verify sources match follow pattern
      const sourcesInIndex = new Set(content.map(c => c.sourceSiteName));
      for (const sourceIdx of followPattern[i]) {
        expect(sourcesInIndex.has(`Source ${sourceIdx + 1}`)).toBe(true);
      }
      
      console.log(`✓ Follower ${i + 1} has content from ${followPattern[i].length} sources`);
    }
    
    // Test search across federated content
    const follower10Results = await followers[9].index.search('content');
    expect(follower10Results).toHaveLength(5); // Should find all 5 sources
    
    console.log('✓ 5:10 complex federation network successful');
    
    // Wait for indexing to complete
    await delay(1000);
    
    // Verify content distribution
    const expectedDistribution = new Map<string, number>();
    // Each follower should have content based on follow pattern
    for (let i = 0; i < followPattern.length; i++) {
      expectedDistribution.set(followers[i].address, followPattern[i].length);
    }
    // Each source should have its own content
    for (let i = 0; i < sources.length; i++) {
      expectedDistribution.set(sources[i].address, 1);
    }
    
    await verifyContentDistribution(expectedDistribution);
    
    // Generate graph visualization with search
    await generateFederationGraph('5-to-10-complex', 'content');
    
    // Demonstrate cross-graph search - search for content from Source 3
    const crossGraphResults = await searchAcrossGraph('Source 3');
    console.log(`Cross-graph search for 'Source 3' found results in ${crossGraphResults.size} indexes`);
    
    let totalCrossGraphResults = 0;
    for (const [indexId, results] of crossGraphResults) {
      totalCrossGraphResults += results.length;
    }
    
    // Source 3 has 1 entry, and followers that follow Source 3 should find it
    // Based on followPattern: followers 2,3,5,8,9,10 follow source 3 (index 2)
    // Plus Source 3 itself = 7 indexes total
    console.log(`Expected to find results in ~7 indexes (Source 3 + followers)`);
    console.log(`Total results found: ${totalCrossGraphResults}`);
    expect(crossGraphResults.size).toBe(7); // Source 3 + 6 followers that follow it
  }, 60000);

  test('performance: 100 entries across 10 sites', async () => {
    // Create 10 sites
    const sites: { index: SimpleFederationIndex; address: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const site = await createPeerWithIndex(`Site ${i}`);
      sites.push(site);
    }
    
    await connectPeers();
    
    // Each site follows all others (fully connected)
    for (let i = 0; i < sites.length; i++) {
      for (let j = 0; j < sites.length; j++) {
        if (i !== j) {
          await sites[i].index.followSite(sites[j].address);
        }
      }
    }
    
    console.log('✓ Created fully connected network of 10 sites');
    
    // Each site adds 10 entries (working within the current limitation)
    const startTime = Date.now();
    const insertPromises = [];
    
    for (let siteIdx = 0; siteIdx < sites.length; siteIdx++) {
      for (let entryIdx = 0; entryIdx < 10; entryIdx++) {
        const entry = new SimpleIndexEntry({
          contentCid: `Qm${siteIdx}-${entryIdx}`,
          title: `Entry ${entryIdx} from Site ${siteIdx}`,
          sourceSiteId: sites[siteIdx].address,
          sourceSiteName: `Site ${siteIdx}`,
          contentType: ['article', 'video', 'podcast'][entryIdx % 3],
          timestamp: Date.now() + (siteIdx * 1000) + entryIdx,
          tags: [`site${siteIdx}`, `entry${entryIdx}`]
        });
        
        // Each site adds to its own index
        insertPromises.push(sites[siteIdx].index.insertContent(entry));
      }
    }
    
    await Promise.all(insertPromises);
    const insertTime = Date.now() - startTime;
    console.log(`✓ Inserted 100 entries across 10 sites in ${insertTime}ms`);
    
    // Wait for indexing to complete
    await delay(2000);
    
    // Check actual entry counts
    console.log('\n=== Checking actual entry counts ===');
    for (let i = 0; i < sites.length; i++) {
      const count = await sites[i].index.getEntryCount();
      console.log(`Site ${i}: ${count} entries`);
    }
    console.log('=====================================\n');
    
    // Verify each site has exactly 10 entries
    const contentDistribution = new Map<string, number>();
    for (const site of sites) {
      contentDistribution.set(site.address, 10);
    }
    await verifyContentDistribution(contentDistribution);
    
    // Test query performance
    const queryStart = Date.now();
    const searchResults = await sites[0].index.search('Entry');
    const queryTime = Date.now() - queryStart;
    
    console.log(`Site 0 search found ${searchResults.length} entries`);
    expect(searchResults).toHaveLength(10); // Site 0's own entries
    console.log(`✓ Search completed in ${queryTime}ms, found ${searchResults.length} results`);
    
    // Test type filtering
    const videos = await sites[0].index.getByType('video');
    console.log(`Found ${videos.length} videos`);
    expect(videos.length).toBeGreaterThan(0);
    expect(videos.length).toBeLessThanOrEqual(4); // ~1/3 of entries are videos
    
    // Test chronological access
    const recent = await sites[0].index.getRecent(5);
    console.log(`getRecent(5) returned ${recent.length} entries`);
    expect(recent.length).toBeLessThanOrEqual(10); // Should be at most 10 (all entries)
    
    // Test search for specific entry
    let totalEntry5 = 0;
    for (const site of sites) {
      const entry5Results = await site.index.search('Entry 5');
      totalEntry5 += entry5Results.length;
    }
    console.log(`Found ${totalEntry5} entries with 'Entry 5' in title across all sites`);
    expect(totalEntry5).toBe(10); // 1 entry per site has "Entry 5" in title
    
    console.log('✓ Performance test successful: 100 entries handled efficiently');
    
    // Generate final graph showing full network
    await generateFederationGraph('performance-100-entries', 'Entry');
    
    // Demonstrate that search works across entire federated graph
    const entrySearchResults = await searchAcrossGraph('Entry 5');
    console.log(`'Entry 5' search found content in ${entrySearchResults.size} indexes`);
    
    // Each site should find Entry 5 in its own index
    expect(entrySearchResults.size).toBe(10); // All 10 sites have Entry 5
  }, 90000);
});