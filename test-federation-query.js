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
    console.log('Using identity:', publicKey);
    
    // Connect to bootstrap
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS?.split(',') || [];
    for (const addr of bootstrappers.slice(0, 1)) {
      try {
        await lensService.dial(addr.trim());
        console.log('Connected to bootstrap');
        break;
      } catch (err) {
        console.warn('Failed to connect:', err.message);
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Open site
    const siteAddress = process.env.VITE_SITE_ADDRESS;
    console.log('Opening site:', siteAddress);
    await lensService.openSite(siteAddress);
    console.log('Site opened');
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Try to query federation index
    console.log('\nQuerying federation index...');
    
    try {
      const recent = await lensService.getFederationIndexRecent(10);
      console.log('Recent entries:', recent.length);
      recent.forEach(entry => {
        console.log('  -', entry.title, 'CID:', entry.contentCID);
      });
      
      const featured = await lensService.getFederationIndexFeatured(10);
      console.log('\nFeatured entries:', featured.length);
      featured.forEach(entry => {
        console.log('  -', entry.title, 'featured:', entry.isFeatured, 'until:', new Date(entry.featuredUntil || 0));
      });
      
      console.log('\nFederation index is working!');
    } catch (err) {
      console.error('Error querying federation index:', err.message);
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    console.log('\nShutting down...');
    setTimeout(() => process.exit(0), 2000);
  }
}

test();