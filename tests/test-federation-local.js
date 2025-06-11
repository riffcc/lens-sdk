#!/usr/bin/env node

import { LensService, PerSiteFederationIndex } from '../dist/index.mjs';
import { Site } from '../dist/index.mjs';

async function testFederationIndex() {
  console.log('Testing Federation Index locally...\n');
  
  // Create two lens services
  const service1 = new LensService();
  const service2 = new LensService();
  
  try {
    // Initialize services
    await service1.init('./test-site1');
    await service2.init('./test-site2');
    
    console.log('✓ Services initialized');
    
    // Get the public keys from the services
    const publicKey1 = service1.client.identity.publicKey;
    const publicKey2 = service2.client.identity.publicKey;
    
    // Create sites with federation index enabled (default)
    const site1 = new Site(publicKey1, { 
      name: 'Tech Hub',
      description: 'Technology focused content',
      enableFederationIndex: true  // This is the default
    });
    
    // Open sites - this initializes the identity context properly
    await service1.openSite(site1);
    
    const site2 = new Site(publicKey2, { 
      name: 'Science Daily',
      description: 'Science news and research',
      enableFederationIndex: true  // This is the default
    });
    
    await service2.openSite(site2);
    
    console.log('✓ Sites created with federation indexes');
    console.log(`  Site 1: ${await service1.getSiteId()}`);
    console.log(`  Site 2: ${await service2.getSiteId()}`);
    
    // Check federation index exists
    const site1Id = await service1.getSiteId();
    const site2Id = await service2.getSiteId();
    
    try {
      // Test getting featured content (should be empty initially)
      const featured = await service1.getFederationIndexFeatured(10);
      console.log(`\n✓ Federation index is accessible`);
      console.log(`  Featured content count: ${featured.length}`);
      
      // Test search
      const searchResults = await service1.searchFederationIndex('test');
      console.log(`  Search results count: ${searchResults.length}`);
      
      // Test stats
      const stats = await service1.getFederationIndexStats();
      console.log(`  Total entries: ${stats.totalEntries}`);
      
    } catch (error) {
      console.error('✗ Federation index test failed:', error.message);
    }
    
    console.log('\n✓ Federation Index test completed successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    await service1.stop();
    await service2.stop();
  }
}

// Run the test
testFederationIndex().catch(console.error);