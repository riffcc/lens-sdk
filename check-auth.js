import { LensService, clearAccessCache } from './dist/index.mjs';
import { getTestPeerbit } from './tests/test-identity.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Ignore RPC errors
process.on('uncaughtException', (err) => {
  if (err.message === 'Not initialized') return;
  console.error('Error:', err.message);
});

async function checkAuth() {
  // Use persistent test identity
  const { peerbit, publicKey } = await getTestPeerbit();
  
  // Pass peerbit to constructor instead of setting _client
  const lensService = new LensService(peerbit);
  
  try {
    console.log('1. Using test identity (no init needed)...');
    
    console.log('2. Public key:', publicKey);
    console.log('   Key in hex:', Buffer.from(publicKey.replace('ed25119p/', ''), 'hex'));
    console.log('   Key in base64:', Buffer.from(publicKey.replace('ed25119p/', ''), 'hex').toString('base64'));
    
    console.log('3. Connecting to bootstrap...');
    await lensService.dial('/ip4/127.0.0.1/tcp/8002/ws/p2p/12D3KooWBZr8BxR4Vf9AtJ66qWMZ24gCtRuJkwLuUvNLufdSKbHn');
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('4. Opening site...');
    await lensService.openSite(process.env.VITE_SITE_ADDRESS);
    
    console.log('5. Site opened, checking authorization...');
    
    // Clear cache to force fresh check
    clearAccessCache();
    
    // Try multiple times
    for (let i = 0; i < 3; i++) {
      try {
        const status = await lensService.getAccountStatus();
        console.log(`6. Account status attempt ${i + 1}:`, status);
        if (status > 0) {
          console.log('SUCCESS: Authorized!');
          break;
        }
      } catch (err) {
        console.log(`6. Error on attempt ${i + 1}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    console.log('7. Shutting down...');
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }
}

checkAuth();