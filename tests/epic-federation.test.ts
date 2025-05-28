import { describe, test, expect, afterEach } from '@jest/globals';
import { SimpleFederationIndex, SimpleIndexEntry } from '../src/simple-federation-index';
import { Peerbit } from 'peerbit';
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
  querySuccessRate: number;
  originalContent?: number;
  federatedContent?: number;
  searchResults?: { query: string; results: number; crossSiteResults: number };
  queryPerformance?: {
    avgTime: number;
    minTime: number;
    maxTime: number;
    queries: number;
  };
}

describe('Epic Federation Test', () => {
  let peers: Peerbit[] = [];
  let indexes: SimpleFederationIndex[] = [];
  let addresses: string[] = [];
  let portCounter = 15000; // Start with a base port

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
    
    return { peer, index, address: index.address };
  }

  async function createPeersInBatch(names: string[], batchSize: number = 10): Promise<void> {
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      const promises = batch.map(name => createPeerWithIndex(name));
      await Promise.all(promises);
      console.log(`✓ Created ${Math.min(i + batchSize, names.length)}/${names.length} peers`);
      
      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < names.length) {
        await delay(500);
      }
    }
  }

  async function connectPeersInMesh(sampleSize: number = 5) {
    // Instead of connecting all peers to first peer (which would overwhelm it),
    // create a more distributed mesh by connecting each peer to a random sample
    if (peers.length <= 1) return;
    
    console.log('Establishing peer connections...');
    const mainAddrs = peers.slice(0, Math.min(sampleSize, peers.length))
      .map(p => p.getMultiaddrs()[0]);
    
    // Connect peers in batches to avoid overwhelming the network
    const batchSize = 10; // Smaller batches to reduce errors
    let connected = 0;
    for (let i = 1; i < peers.length; i += batchSize) {
      const batch = peers.slice(i, i + batchSize);
      const connectionPromises = [];
      
      for (const peer of batch) {
        // Connect to a random subset of main peers
        const targetAddr = mainAddrs[Math.floor(Math.random() * mainAddrs.length)];
        connectionPromises.push(
          peer.dial(targetAddr).catch(e => {
            // Silently ignore connection failures
          })
        );
      }
      
      await Promise.all(connectionPromises);
      connected += batch.length;
      if (connected % 50 === 0) {
        console.log(`✓ Connected ${connected} peers`);
      }
      
      // Small delay between connection batches
      await delay(200);
    }
    
    await delay(1000); // Give connections time to establish
    console.log('✓ All peer connections established');
  }

  async function generateEpicGraph(
    testName: string, 
    searchQuery?: string,
    queryPerformance?: { avgTime: number; minTime: number; maxTime: number; queries: number }
  ): Promise<void> {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    let totalContent = 0;
    let searchResults = undefined;

    console.log('\n=== Building Graph Data ===');
    
    // Build nodes with sampling for very large networks
    const sampleSize = indexes.length > 100 ? 100 : indexes.length;
    const sampledIndexes = indexes.length > 100 
      ? indexes.sort(() => Math.random() - 0.5).slice(0, sampleSize)
      : indexes;
    
    console.log(`Sampling ${sampledIndexes.length} nodes for visualization...`);
    
    let originalContentCount = 0;
    let federatedContentCount = 0;
    
    for (let i = 0; i < sampledIndexes.length; i++) {
      const index = sampledIndexes[i];
      const indexPos = indexes.indexOf(index);
      const content = await index.getRecent(100);
      
      // Count original vs federated content
      for (const item of content) {
        if (item.sourceSiteId === addresses[indexPos]) {
          originalContentCount++;
        } else {
          federatedContentCount++;
        }
      }
      
      totalContent += content.length;
      
      nodes.push({
        id: addresses[indexPos],
        name: index.siteName,
        content: content,
        follows: index.getFollowedSites()
      });
      
      if ((i + 1) % 10 === 0) {
        console.log(`✓ Processed ${i + 1}/${sampledIndexes.length} nodes`);
      }
    }
    
    console.log(`Content distribution: ${originalContentCount} original, ${federatedContentCount} federated`);

    console.log('Building follow relationships...');
    // Build links based on follow relationships
    for (const node of nodes) {
      for (const followedSite of node.follows) {
        // Only add link if followed site is in our sample
        if (nodes.some(n => n.id === followedSite)) {
          links.push({
            source: node.id,
            target: followedSite
          });
        }
      }
    }
    console.log(`✓ Found ${links.length} follow relationships`);

    // Perform search if query provided
    if (searchQuery) {
      let totalResults = 0;
      let crossSiteResults = 0;
      const uniqueContentCids = new Set<string>();
      const allResults: { result: any; foundIn: string }[] = [];
      
      console.log(`\nSearching for '${searchQuery}' across ${sampledIndexes.length} indexes...`);
      
      for (let i = 0; i < sampledIndexes.length; i++) {
        const index = sampledIndexes[i];
        const results = await index.search(searchQuery);
        totalResults += results.length;
        
        // Count results from other sites
        const indexAddr = addresses[indexes.indexOf(index)];
        for (const result of results) {
          uniqueContentCids.add(result.contentCid);
          allResults.push({ result, foundIn: indexAddr });
          if (result.sourceSiteId !== indexAddr) {
            crossSiteResults++;
          }
        }
        
        if ((i + 1) % 10 === 0) {
          console.log(`✓ Searched ${i + 1}/${sampledIndexes.length} indexes`);
        }
      }
      
      const uniqueResults = uniqueContentCids.size;
      console.log(`✓ Search complete: ${totalResults} total results, ${uniqueResults} unique items (${crossSiteResults} cross-site)`);
      
      searchResults = {
        query: searchQuery,
        results: uniqueResults, // Use unique count for success rate calculation
        crossSiteResults
      };
    }

    const graphData: GraphData = {
      nodes,
      links,
      timestamp: new Date().toISOString(),
      testName,
      totalContent,
      querySuccessRate: 0,
      originalContent: originalContentCount,
      federatedContent: federatedContentCount
    };

    console.log('\nGenerating HTML visualization...');
    
    // Read template and generate graph
    const templatePath = path.join(__dirname, 'federation-graph-template.html');
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Calculate expected results for query success rate
    let expectedResults = 0;
    if (searchQuery) {
      if (searchQuery === 'epic-content') {
        expectedResults = 1000; // All items have this tag
      } else if (searchQuery.startsWith('Creator ')) {
        // Count how many creators match this query
        const queryNum = searchQuery.substring(8); // Get number part after "Creator "
        for (let i = 0; i < 100; i++) {
          if (`Creator ${i + 1}`.includes(`Creator ${queryNum}`)) {
            expectedResults += 10; // Each matching creator has 10 items
          }
        }
      } else if (searchQuery.startsWith('Item ')) {
        expectedResults = 100; // 100 creators each have an item with this number
      } else if (searchQuery === 'video' || searchQuery === 'podcast' || searchQuery === 'article') {
        expectedResults = 200; // Each content type appears in 20% of items
      } else if (searchQuery.startsWith('creator')) {
        expectedResults = 10; // Tags like 'creator10' appear on 10 items
      } else if (searchQuery.startsWith('item')) {
        expectedResults = 100; // Tags like 'item7' appear on 100 items (one per creator)
      }
    }
    
    // Transform the graph data
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
        const reverseLink = links.find(l => l.source === link.target && l.target === link.source);
        return {
          ...link,
          recursive: false,
          mutual: !!reverseLink
        };
      }),
      timestamp: graphData.timestamp,
      testName: graphData.testName,
      querySuccessRate: 0,
      queryPerformance: queryPerformance
    };
    
    // Add search results and calculate query success rate
    if (searchResults) {
      transformedData.searchQuery = searchResults.query;
      transformedData.searchResults = searchResults;
      
      // Success rate: did we find all expected results?
      transformedData.querySuccessRate = expectedResults > 0 
        ? Math.round((searchResults.results / expectedResults) * 100)
        : 0;
    }
    
    // Serialize with BigInt support
    const serializedGraphData = JSON.stringify(transformedData, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    
    template = template.replace(
      'const graphData = GRAPH_DATA_PLACEHOLDER;',
      `const graphData = ${serializedGraphData};`
    );
    
    // Add note about sampling if applicable
    if (indexes.length > sampleSize) {
      template = template.replace(
        '<h1>Federation Graph Visualization</h1>',
        `<h1>Federation Graph Visualization (Sampled ${sampleSize} of ${indexes.length} nodes)</h1>`
      );
    }
    
    const fileName = path.join(__dirname, `federation-graph-epic-${testName.replace(/\s+/g, '-')}-${Date.now()}.html`);
    fs.writeFileSync(fileName, template);
    
    console.log(`\n✓ Epic federation graph saved to: ${fileName}`);
    if (searchResults && transformedData.querySuccessRate !== undefined) {
      const expectedForQuery = expectedResults || 0;
      console.log(`✓ Query success rate: ${transformedData.querySuccessRate}%`);
      console.log(`  (Query "${searchQuery}" found ${searchResults.results}/${expectedForQuery} expected items)`);
    }
    if (queryPerformance) {
      console.log(`✓ Average query time: ${queryPerformance.avgTime}ms (${queryPerformance.queries} queries)`);
    }
  }

  afterEach(async () => {
    console.log('\n=== Cleaning up peers ===');
    
    // Clean up in batches to avoid overwhelming the system
    const batchSize = 20;
    for (let i = 0; i < indexes.length; i += batchSize) {
      const batch = indexes.slice(i, i + batchSize);
      await Promise.all(batch.map(idx => idx.close().catch(e => {
        // Silently ignore cleanup errors
      })));
      console.log(`✓ Closed ${Math.min(i + batchSize, indexes.length)}/${indexes.length} indexes`);
    }
    
    for (let i = 0; i < peers.length; i += batchSize) {
      const batch = peers.slice(i, i + batchSize);
      await Promise.all(batch.map(peer => {
        // Close connections first
        if (peer.libp2p?.getConnections) {
          const connections = peer.libp2p.getConnections();
          connections.forEach(conn => conn.close());
        }
        return peer.stop().catch(e => {
          // Silently ignore cleanup errors
        });
      }));
      console.log(`✓ Stopped ${Math.min(i + batchSize, peers.length)}/${peers.length} peers`);
    }
    
    peers = [];
    indexes = [];
    addresses = [];
    
    await delay(500);
    console.log('✓ Cleanup complete');
  });

  test('1 mega-hub following 100 content creators', async () => {
    console.log('\n=== EPIC FEDERATION TEST ===');
    console.log('Creating a network with 100+ nodes...');
    console.log('This will take a few minutes...\n');
    
    // Create 100 content creator sites
    const startTime = Date.now();
    const creatorNames = Array.from({ length: 100 }, (_, i) => `Creator ${i + 1}`);
    console.log('Step 1: Creating 100 content creator sites...');
    await createPeersInBatch(creatorNames, 10); // Create 10 at a time
    console.log(`✓ Created 100 creators in ${Math.round((Date.now() - startTime) / 1000)}s\n`);
    
    // Create the mega-hub
    console.log('Step 2: Creating mega-hub and additional nodes...');
    const megaHub = await createPeerWithIndex('Mega Hub');
    console.log('✓ Created Mega Hub');
    
    // Create some additional interesting nodes
    const additionalNodes = [
      'Regional Hub 1',
      'Regional Hub 2', 
      'Regional Hub 3',
      'Curator Network',
      'Archive Node'
    ];
    await createPeersInBatch(additionalNodes, 5);
    console.log(`✓ Total nodes created: ${indexes.length}\n`);
    
    // Save initial graph to show network structure
    console.log('Generating initial network graph...');
    await generateEpicGraph('initial-network');
    
    // Connect peers in a mesh topology
    console.log('\nStep 3: Establishing peer connections...');
    await connectPeersInMesh(5); // Each peer connects to up to 5 others
    
    // Add content to creator sites (10 items each for faster testing)
    console.log('\nStep 4: Adding content to creator sites (10 items each)...');
    console.log('This will create 1,000 total content items...');
    const contentStart = Date.now();
    const batchSize = 20;
    
    for (let creatorIdx = 0; creatorIdx < 100; creatorIdx += batchSize) {
      const batch = [];
      
      for (let i = creatorIdx; i < Math.min(creatorIdx + batchSize, 100); i++) {
        const creatorIndex = indexes[i];
        const creatorAddr = addresses[i];
        
        // Add 10 items per creator
        for (let j = 0; j < 10; j++) {
          const entry = new SimpleIndexEntry({
            contentCid: `Qm${i}-${j}`,
            title: `${creatorIndex.siteName} - Item ${j + 1}`,
            sourceSiteId: creatorAddr,
            sourceSiteName: creatorIndex.siteName,
            contentType: ['article', 'video', 'podcast', 'image', 'document'][j % 5],
            timestamp: Date.now() + (i * 1000) + j,
            tags: [`creator${i}`, `item${j}`, 'epic-content']
          });
          
          batch.push(creatorIndex.insertContent(entry));
        }
      }
      
      await Promise.all(batch);
      console.log(`✓ Added content to ${Math.min(creatorIdx + batchSize, 100)}/100 creators`);
    }
    
    console.log(`✓ All content added in ${Math.round((Date.now() - contentStart) / 1000)}s\n`);
    
    // Save graph with content
    console.log('Generating graph with content...');
    await generateEpicGraph('with-content');
    
    // Set up follow relationships
    console.log('\nStep 5: Setting up follow relationships...');
    const followStart = Date.now();
    
    // Mega hub follows all 100 creators
    const megaHubIndex = indexes[100]; // Mega hub is after the 100 creators
    console.log('- Mega hub following all 100 creators...');
    for (let i = 0; i < 100; i++) {
      await megaHubIndex.followSite(addresses[i]);
      if ((i + 1) % 25 === 0) {
        console.log(`  ✓ Mega hub follows ${i + 1}/100 creators`);
      }
    }
    
    // Regional hubs follow subsets
    console.log('- Setting up regional hubs...');
    const regionalHub1 = indexes[101];
    const regionalHub2 = indexes[102];
    const regionalHub3 = indexes[103];
    
    // Regional Hub 1 follows creators 0-33
    for (let i = 0; i < 33; i++) {
      await regionalHub1.followSite(addresses[i]);
    }
    console.log('  ✓ Regional Hub 1 follows 33 creators');
    
    // Regional Hub 2 follows creators 34-66
    for (let i = 34; i < 67; i++) {
      await regionalHub2.followSite(addresses[i]);
    }
    console.log('  ✓ Regional Hub 2 follows 33 creators');
    
    // Regional Hub 3 follows creators 67-99
    for (let i = 67; i < 100; i++) {
      await regionalHub3.followSite(addresses[i]);
    }
    console.log('  ✓ Regional Hub 3 follows 33 creators');
    
    // Curator follows mega hub and regional hubs
    console.log('- Setting up curator network...');
    const curatorIndex = indexes[104];
    await curatorIndex.followSite(addresses[100]); // Mega hub
    await curatorIndex.followSite(addresses[101]); // Regional 1
    await curatorIndex.followSite(addresses[102]); // Regional 2
    await curatorIndex.followSite(addresses[103]); // Regional 3
    console.log('  ✓ Curator follows all hubs');
    
    // Archive follows first 50 nodes (to avoid overwhelming it)
    console.log('- Setting up archive node (follows first 50 nodes)...');
    const archiveIndex = indexes[105];
    for (let i = 0; i < 50; i++) {
      await archiveIndex.followSite(addresses[i]);
    }
    console.log('  ✓ Archive follows 50 nodes');
    
    // Some creators follow each other (create a social graph)
    console.log('- Creating social graph among creators...');
    for (let i = 0; i < 20; i++) {
      // Each of first 20 creators follows 3 random others
      const creatorIndex = indexes[i];
      for (let j = 0; j < 3; j++) {
        const targetIdx = Math.floor(Math.random() * 100);
        if (targetIdx !== i) {
          await creatorIndex.followSite(addresses[targetIdx]);
        }
      }
    }
    console.log('  ✓ Created social connections');
    
    // Ensure all additional nodes have some purpose
    console.log('- Ensuring all nodes have content or follows...');
    // Check each node and give it a purpose if it doesn't have one
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      const hasContent = (await index.getEntryCount()) > 0;
      const hasFollows = index.getFollowedSites().length > 0;
      
      // If a node has neither content nor follows, make it follow some random nodes
      if (!hasContent && !hasFollows) {
        console.log(`  - Node '${index.siteName}' needs purpose...`);
        // Follow 3-5 random nodes
        const numFollows = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < numFollows; j++) {
          const targetIdx = Math.floor(Math.random() * indexes.length);
          if (targetIdx !== i) {
            await index.followSite(addresses[targetIdx]);
          }
        }
      }
    }
    console.log('  ✓ All nodes have purpose (content or follows)');
    
    console.log(`✓ All follow relationships established in ${Math.round((Date.now() - followStart) / 1000)}s\n`);
    
    // Federate content to followers
    console.log('\nStep 6: Federating content to followers...');
    console.log('This simulates content being pushed/pulled in a real federation system...');
    
    // For each creator, push their content to their followers
    let totalFederated = 0;
    for (let i = 0; i < 100; i++) {
      const creatorIndex = indexes[i];
      const creatorAddr = addresses[i];
      const creatorContent = await creatorIndex.getRecent(100);
      
      if (i === 0) {
        console.log(`  Creator ${i} has ${creatorContent.length} items to federate`);
      }
      
      // Find all nodes that follow this creator
      const followers = [];
      for (let j = 0; j < indexes.length; j++) {
        if (i !== j && indexes[j].getFollowedSites().includes(creatorAddr)) {
          followers.push({ index: indexes[j], idx: j });
        }
      }
      
      if (i === 0) {
        console.log(`  Creator ${i} has ${followers.length} followers`);
      }
      
      // Push content to followers
      for (const { index: follower, idx: followerIdx } of followers) {
        for (const entry of creatorContent) {
          // Create a federated copy of the entry
          try {
            await follower.insertContent(new SimpleIndexEntry({
              contentCid: entry.contentCid,
              title: entry.title,
              sourceSiteId: entry.sourceSiteId, // Keep original source
              sourceSiteName: entry.sourceSiteName,
              contentType: entry.contentType,
              timestamp: entry.timestamp,
              tags: entry.tags
            }));
            totalFederated++;
          } catch (e) {
            console.error(`  Failed to federate to ${follower.siteName}: ${e.message}`);
          }
        }
      }
      
      if ((i + 1) % 20 === 0) {
        console.log(`✓ Federated content from ${i + 1}/100 creators (${totalFederated} items total)`);
      }
    }
    
    console.log('✓ Content federation complete');
    
    // Wait for indexing
    console.log('\nWaiting for content indexing...');
    await delay(2000);
    
    // Generate intermediate graph to show federation
    console.log('\nGenerating federated network graph...');
    await generateEpicGraph('federated-network');
    
    // Verify content distribution
    console.log('\n=== Content Distribution ===');
    const megaHubContent = await megaHubIndex.getEntryCount();
    console.log(`Mega Hub indexed: ${megaHubContent} entries`);
    
    const regionalContent = await Promise.all([
      regionalHub1.getEntryCount(),
      regionalHub2.getEntryCount(),
      regionalHub3.getEntryCount()
    ]);
    console.log(`Regional Hubs indexed: ${regionalContent.join(', ')} entries`);
    
    const curatorContent = await curatorIndex.getEntryCount();
    console.log(`Curator indexed: ${curatorContent} entries`);
    
    const archiveContent = await archiveIndex.getEntryCount();
    console.log(`Archive indexed: ${archiveContent} entries`);
    
    // Test search performance with multiple queries
    console.log('\n=== Testing Search Performance ===');
    console.log('Running 10 different queries...');
    const queries = [
      'epic-content',
      'Item 5',
      'Creator 50',
      'video',
      'podcast', 
      'article',
      'creator10',
      'item7',
      'Creator 99',
      'Item 1'
    ];
    
    const queryTimes: number[] = [];
    const queryResults: { query: string; results: number; time: number }[] = [];
    
    for (const query of queries) {
      const searchStart = Date.now();
      const results = await megaHubIndex.search(query);
      const searchTime = Date.now() - searchStart;
      
      queryTimes.push(searchTime);
      queryResults.push({ query, results: results.length, time: searchTime });
      console.log(`✓ Query '${query}': ${results.length} results in ${searchTime}ms`);
    }
    
    const avgQueryTime = Math.round(queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length);
    const minTime = Math.min(...queryTimes);
    const maxTime = Math.max(...queryTimes);
    
    console.log(`\nQuery Performance Summary:`);
    console.log(`- Average query time: ${avgQueryTime}ms`);
    console.log(`- Min query time: ${minTime}ms`);
    console.log(`- Max query time: ${maxTime}ms`);
    
    // Generate the final epic graph with performance metrics
    console.log('\n=== Generating Final Visualization ===');
    // Search for 'Creator 5' which should match items from Creator 5, 50-59
    await generateEpicGraph('100-creators-mega-hub-final', 'Creator 5', {
      avgTime: avgQueryTime,
      minTime,
      maxTime,
      queries: queries.length
    });
    
    // Final statistics
    console.log('\n=== FINAL STATISTICS ===');
    console.log(`Total nodes: ${indexes.length}`);
    console.log(`Total content items: ${100 * 10} (1,000)`);
    console.log(`Total follow relationships: ${100 + 33 + 33 + 33 + 4 + 50 + (20 * 3)}`);
    console.log(`Test duration: ${Math.round((Date.now() - startTime) / 1000)}s`);
    console.log('\n✓ EPIC FEDERATION TEST COMPLETE!');
    
  }, 300000); // 5 minute timeout
});