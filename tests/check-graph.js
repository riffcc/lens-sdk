const fs = require('fs');
const path = require('path');

// Get the most recent graph file
const testDir = path.join(__dirname);
const files = fs.readdirSync(testDir)
  .filter(f => f.startsWith('federation-graph-index-') && f.endsWith('.html'))
  .sort((a, b) => {
    const timeA = parseInt(a.match(/(\d+)\.html$/)[1]);
    const timeB = parseInt(b.match(/(\d+)\.html$/)[1]);
    return timeB - timeA;
  });

if (files.length === 0) {
  console.log('No graph files found');
  process.exit(1);
}

const latestFile = files[0];
console.log(`Checking ${latestFile}...`);

const content = fs.readFileSync(path.join(testDir, latestFile), 'utf-8');

// Extract the graph data
const dataMatch = content.match(/const graphData = ({[\s\S]*?});/);
if (!dataMatch) {
  console.log('Could not find graph data');
  process.exit(1);
}

try {
  const graphData = eval('(' + dataMatch[1] + ')');
  
  console.log('\nGraph Statistics:');
  console.log(`- Nodes: ${graphData.nodes.length}`);
  console.log(`- Links: ${graphData.links.length}`);
  console.log(`- Total content: ${graphData.nodes.reduce((sum, n) => sum + (n.releases ? n.releases.length : 0), 0)}`);
  console.log(`- Expected syncs: ${graphData.expectedSyncs || 0}`);
  console.log(`- Successful syncs: ${graphData.successfulSyncs || 0}`);
  
  if (graphData.searchResults) {
    console.log(`\nSearch Results:`);
    console.log(`- Query: "${graphData.searchQuery}"`);
    console.log(`- Total results: ${graphData.searchResults.results}`);
    console.log(`- Cross-site results: ${graphData.searchResults.crossSiteResults}`);
  }
  
  console.log('\nNode Details:');
  graphData.nodes.forEach(node => {
    const releases = node.releases || [];
    const original = releases.filter(r => !r.federatedFrom).length;
    const federated = releases.length - original;
    console.log(`- ${node.name}: ${releases.length} total (${original} original, ${federated} federated)`);
  });
  
  console.log('\nLink Details:');
  const mutualLinks = graphData.links.filter(l => l.mutual).length / 2; // Divide by 2 as mutual links are counted twice
  const oneWayLinks = graphData.links.length - (mutualLinks * 2);
  console.log(`- One-way subscriptions: ${oneWayLinks}`);
  console.log(`- Mutual subscriptions: ${mutualLinks}`);
  
} catch (e) {
  console.error('Error parsing graph data:', e.message);
}