import { LensService } from '../dist/index.mjs';
import { getTestPeerbit } from './test-identity.js';
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
    
    // Wait for federation index to initialize
    console.log('   Waiting for site to fully initialize...');
    await new Promise(r => setTimeout(r, 5000));
    
    // Query featured
    console.log('4. Querying featured content...');
    const featured = await lensService.getFederationIndexFeatured(10);
    console.log('5. Featured count:', featured.length);
    
    if (featured.length > 0) {
      console.log('6. First featured entry:');
      console.log('   Title:', featured[0].title);
      console.log('   Featured:', featured[0].isFeatured);
      console.log('   Featured until:', featured[0].featuredUntil ? new Date(Number(featured[0].featuredUntil)).toISOString() : 'N/A');
    }
    
    // Also check recent entries
    console.log('7. Checking recent entries...');
    const recent = await lensService.getFederationIndexRecent(20);
    console.log('8. Recent count:', recent.length);
    
    if (recent.length > 0) {
      console.log('9. First recent entry:');
      console.log('   Title:', recent[0].title);
      console.log('   Featured:', recent[0].isFeatured);
      console.log('   Timestamp:', new Date(Number(recent[0].timestamp)).toISOString());
    }
    
    console.log('\nQUERY TEST COMPLETED!');
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    console.log('\nShutting down...');
    setTimeout(() => process.exit(0), 2000);
  }
}

test();