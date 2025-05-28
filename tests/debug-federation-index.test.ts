import { describe, test, expect, afterEach } from '@jest/globals';
import { SimpleFederationIndex, SimpleIndexEntry } from '../src/simple-federation-index';
import { Peerbit } from 'peerbit';
import { delay } from './utils';

describe('Debug Federation Index', () => {
  let peer: Peerbit;
  let index: SimpleFederationIndex;

  afterEach(async () => {
    if (index) await index.close();
    if (peer) await peer.stop();
  });

  test('verify 100 entries can be stored and retrieved', async () => {
    // Create a single peer and index
    peer = await Peerbit.create();
    await peer.start();
    
    index = await peer.open(new SimpleFederationIndex('Test Site'), {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
    
    console.log('Index opened, inserting 100 entries...');
    
    // Insert 100 entries sequentially to debug
    for (let i = 0; i < 100; i++) {
      const entry = new SimpleIndexEntry({
        contentCid: `Qm${i}`,
        title: `Entry ${i}`,
        sourceSiteId: index.address,
        sourceSiteName: 'Test Site',
        contentType: ['article', 'video', 'podcast'][i % 3],
        timestamp: Date.now() + i,
        tags: [`batch${Math.floor(i / 10)}`]
      });
      
      await index.insertContent(entry);
      
      // Check count and last entries
      if ((i + 1) % 10 === 0) {
        const count = await index.getEntryCount();
        console.log(`After inserting ${i + 1} entries, count is: ${count}`);
        
        // Get the last few entries to see what's stored
        const recent = await index.getRecent(5);
        console.log(`  Recent entries:`, recent.map(e => e.contentCid).join(', '));
      }
    }
    console.log('All entries inserted');
    
    // Wait for indexing
    await delay(2000);
    
    // Check total count
    const totalCount = await index.getEntryCount();
    console.log(`Total entries in index: ${totalCount}`);
    expect(totalCount).toBe(100);
    
    // Test getRecent with different limits
    const recent10 = await index.getRecent(10);
    console.log(`getRecent(10) returned: ${recent10.length} entries`);
    expect(recent10).toHaveLength(10);
    
    const recent50 = await index.getRecent(50);
    console.log(`getRecent(50) returned: ${recent50.length} entries`);
    expect(recent50).toHaveLength(50);
    
    const recent100 = await index.getRecent(100);
    console.log(`getRecent(100) returned: ${recent100.length} entries`);
    expect(recent100).toHaveLength(100);
    
    const recent200 = await index.getRecent(200);
    console.log(`getRecent(200) returned: ${recent200.length} entries`);
    expect(recent200).toHaveLength(100); // Should max out at 100
    
    // Test search
    const searchResults = await index.search('Entry');
    console.log(`Search for 'Entry' found: ${searchResults.length} results`);
    expect(searchResults).toHaveLength(100);
    
    // Test batch search
    const batch5Results = await index.search('batch5');
    console.log(`Search for 'batch5' found: ${batch5Results.length} results`);
    expect(batch5Results).toHaveLength(10); // Entries 50-59
  }, 30000);
});