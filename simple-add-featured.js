import { LensService } from './dist/index.mjs';
import { getTestPeerbit } from './tests/test-identity.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Ignore RPC errors
process.on('uncaughtException', (err) => {
  if (err.message === 'Not initialized') return;
  console.error('Error:', err.message);
});

async function test() {
  const { peerbit, publicKey } = await getTestPeerbit();
  console.log('Using identity:', publicKey);
  
  const lensService = new LensService();
  lensService._client = peerbit;
  
  try {
    await lensService.init();
    
    // Connect to local bootstrap
    await lensService.dial('/ip4/127.0.0.1/tcp/8002/ws/p2p/12D3KooWBZr8BxR4Vf9AtJ66qWMZ24gCtRuJkwLuUvNLufdSKbHn');
    console.log('Connected to bootstrap');
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Opening site...');
    await lensService.openSite(process.env.VITE_SITE_ADDRESS);
    console.log('Site opened');
    
    // Wait longer for authorization to propagate
    console.log('Waiting for authorization to propagate...');
    await new Promise(r => setTimeout(r, 5000));
    
    // Check authorization multiple times with delays
    let status = 0;
    for (let i = 0; i < 5; i++) {
      try {
        status = await lensService.getAccountStatus();
        console.log(`Account status check ${i + 1}:`, status);
        if (status > 0) break;
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.log('Error checking status:', err.message);
      }
    }
    
    if (status === 0) {
      console.log('Still not authorized after retries. Please check authorization in lens-node.');
      console.log('Public key:', publicKey);
      console.log('Site address:', process.env.VITE_SITE_ADDRESS);
      
      // Try to add anyway to see the exact error
      console.log('Attempting to add release anyway...');
    }
    
    console.log('Adding featured release...');
    const result = await lensService.addRelease({
      name: 'Featured Test ' + new Date().toISOString(),
      categoryId: 'video',
      contentCID: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      thumbnailCID: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'Test with featured flag',
        contentType: 'video',
        tags: ['test', 'featured'],
        isFeatured: true,
        featuredUntil: Date.now() + (7 * 24 * 60 * 60 * 1000)
      })
    });
    
    console.log('Result:', result);
    
    if (result.success) {
      console.log('Success! Release ID:', result.id);
      
      await new Promise(r => setTimeout(r, 3000));
      
      console.log('Querying featured...');
      const featured = await lensService.getFederationIndexFeatured(5);
      console.log('Featured count:', featured.length);
      
      const ours = featured.find(f => f.title.includes('Featured Test'));
      if (ours) {
        console.log('Found our release:', {
          title: ours.title,
          isFeatured: ours.isFeatured,
          featuredUntil: new Date(ours.featuredUntil).toISOString()
        });
      }
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    setTimeout(() => process.exit(0), 5000);
  }
}

test();