import { LensService } from './dist/index.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function test() {
  const lensService = new LensService();
  
  try {
    console.log('Initializing...');
    await lensService.init();
    
    // Get bootstrappers from env
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS?.split(',') || [];
    console.log(`Connecting to ${bootstrappers.length} bootstrap nodes...`);
    
    for (const addr of bootstrappers) {
      try {
        await lensService.dial(addr.trim());
        console.log('Connected to:', addr.trim().split('/').pop());
      } catch (err) {
        console.warn('Failed to connect to:', addr);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const siteAddress = process.env.VITE_SITE_ADDRESS;
    console.log('Opening site:', siteAddress);
    
    await lensService.openSite(siteAddress);
    console.log('Site opened');
    
    const publicKey = await lensService.getPublicKey();
    console.log('Public key:', publicKey);
    console.log('Please authorize this key in lens-node if not already done');
    
    let status = 0;
    try {
      status = await lensService.getAccountStatus();
      console.log('Account status:', status);
    } catch (err) {
      console.log('Error getting account status:', err.message);
      console.log('Continuing anyway...');
    }
    
    if (status === 0) {
      console.log('Not authorized. Exiting.');
      return;
    }
    
    console.log('Creating featured release...');
    const result = await lensService.addRelease({
      name: 'Featured Test ' + Date.now(),
      categoryId: 'video',
      contentCid: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      thumbnailCid: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'Test with featured flag',
        isFeatured: true,
        featuredUntil: Date.now() + (7 * 24 * 60 * 60 * 1000)
      })
    });
    
    console.log('Result:', result);
    
    // Wait and query
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const featured = await lensService.getFederationIndexFeatured(10);
    console.log('Featured count:', featured.length);
    if (featured.length > 0) {
      console.log('First featured:', {
        title: featured[0].title,
        isFeatured: featured[0].isFeatured
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await lensService.stop();
  }
}

test();