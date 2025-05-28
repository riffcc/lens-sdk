import { describe, test, expect } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { waitFor } from '@peerbit/time';
import { SimpleFederationIndex, SimpleIndexEntry } from '../src/simple-federation-index';

describe('Basic Federation INDEX Test', () => {
  let peer: Peerbit;
  let index: SimpleFederationIndex;

  beforeEach(async () => {
    peer = await Peerbit.create();
    await peer.start();
    
    index = await peer.open(new SimpleFederationIndex('Test Site'), {
      args: {
        replicate: true,
        replicas: { min: 1 }
      }
    });
  });

  afterEach(async () => {
    await index.close();
    await peer.stop();
  });

  test('can insert and retrieve entries', async () => {
    // Insert some entries
    await index.insertContent(new SimpleIndexEntry({
      contentCid: 'QmTest1',
      title: 'Introduction to AI',
      sourceSiteId: 'test-site',
      sourceSiteName: 'Test Site',
      contentType: 'article',
      timestamp: Date.now(),
      tags: ['ai', 'intro']
    }));
    
    await index.insertContent(new SimpleIndexEntry({
      contentCid: 'QmTest2',
      title: 'Advanced Machine Learning',
      sourceSiteId: 'test-site',
      sourceSiteName: 'Test Site',
      contentType: 'video',
      timestamp: Date.now() + 1000,
      tags: ['ml', 'advanced']
    }));
    
    // Wait a bit for indexing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if entries were stored
    const recent = await index.getRecent(10);
    console.log(`Entries stored: ${recent.length}`);
    expect(recent.length).toBe(2);
    
    // Test search
    const aiResults = await index.search('AI');
    console.log(`Search 'AI' found: ${aiResults.length} results`);
    expect(aiResults.length).toBeGreaterThanOrEqual(1);
    
    // Test type filter
    const videos = await index.getByType('video');
    console.log(`Videos found: ${videos.length}`);
    expect(videos.length).toBe(1);
  });
});