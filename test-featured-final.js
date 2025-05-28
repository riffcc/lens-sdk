import { LensService } from './dist/index.mjs';
import { getTestPeerbit } from './tests/test-identity.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Ignore RPC errors
process.on('uncaughtException', (err) => {
  if (err.message === 'Not initialized') return;
  console.error('Uncaught:', err.message);
});

async function test() {
  const { peerbit, publicKey } = await getTestPeerbit();
  const lensService = new LensService(peerbit);
  
  try {
    console.log('1. Using identity:', publicKey);
    
    // Connect to bootstrap
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS?.split(',') || [];
    for (const addr of bootstrappers.slice(0, 1)) { // Just connect to first one
      try {
        await lensService.dial(addr.trim());
        console.log('2. Connected to bootstrap');
        break;
      } catch (err) {
        console.warn('Failed to connect:', err.message);
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Open site
    const siteAddress = process.env.VITE_SITE_ADDRESS;
    console.log('3. Opening site:', siteAddress);
    await lensService.openSite(siteAddress);
    
    // Wait longer for federation index to initialize
    console.log('   Waiting for site to fully initialize...');
    await new Promise(r => setTimeout(r, 5000));
    
    // Check authorization
    const status = await lensService.getAccountStatus();
    console.log('4. Account status:', status);
    
    if (status === 0) {
      console.log('Not authorized!');
      return;
    }
    
    console.log('5. Creating featured release...');
    const timestamp = Date.now();
    const result = await lensService.addRelease({
      name: 'Featured Test ' + timestamp,
      categoryId: 'video',
      contentCID: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      thumbnailCID: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'Test with featured flag',
        contentType: 'video',
        tags: ['test', 'featured'],
        isFeatured: true,
        featuredUntil: timestamp + (7 * 24 * 60 * 60 * 1000)
      })
    });
    
    if (result.success) {
      console.log('6. Success! Release ID:', result.id);
      
      // Wait for propagation
      await new Promise(r => setTimeout(r, 3000));
      
      // Query featured
      console.log('7. Querying featured content...');
      const featured = await lensService.getFederationIndexFeatured(10);
      console.log('8. Featured count:', featured.length);
      
      const ourEntry = featured.find(e => e.title.includes('Featured Test ' + timestamp));
      if (ourEntry) {
        console.log('9. Found our featured entry!');
        console.log('   Title:', ourEntry.title);
        console.log('   Featured:', ourEntry.isFeatured);
        console.log('   Featured until:', new Date(ourEntry.featuredUntil || 0).toISOString());
      } else {
        console.log('9. Could not find our entry in featured list');
      }
      
      // Also check recent entries
      console.log('10. Checking recent entries...');
      const recent = await lensService.getFederationIndexRecent(20);
      console.log('11. Recent count:', recent.length);
      
      const inRecent = recent.find(e => e.title.includes('Featured Test ' + timestamp));
      if (inRecent) {
        console.log('12. Found in recent:');
        console.log('    Title:', inRecent.title);
        console.log('    Featured:', inRecent.isFeatured);
      }
      
      console.log('\nTEST COMPLETED SUCCESSFULLY!');
    } else {
      console.error('6. Failed to add release:', result.error);
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    console.log('\nShutting down...');
    setTimeout(() => process.exit(0), 2000);
  }
}

test();