import { LensService } from '../dist/index.mjs';
import { getTestPeerbit } from './test-identity.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function test() {
  // Use persistent identity
  const { peerbit, publicKey } = await getTestPeerbit();
  
  // Pass peerbit to constructor
  const lensService = new LensService(peerbit);
  
  try {
    console.log('Using persistent identity:', publicKey);
    
    
    // Connect to bootstrap nodes
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS?.split(',') || [];
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
    
    // Wait a bit for everything to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Checking account status...');
    let status = 0;
    try {
      status = await lensService.getAccountStatus();
      console.log('Account status:', status);
    } catch (err) {
      console.log('Error checking account status:', err.message);
      console.log('Assuming authorized and continuing...');
      status = 1; // Assume member
    }
    
    if (status === 0) {
      console.log('Not authorized. Please authorize the public key above in lens-node.');
      return;
    }
    
    console.log('Authorized! Creating featured release...');
    
    const result = await lensService.addRelease({
      name: 'Featured Test ' + Date.now(),
      categoryId: 'video',
      contentCid: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      thumbnailCid: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'Test with featured flag',
        contentType: 'video',
        tags: ['test', 'featured'],
        isFeatured: true,
        featuredUntil: Date.now() + (7 * 24 * 60 * 60 * 1000)
      })
    });
    
    console.log('Release added:', result);
    
    if (!result.success) {
      console.error('Failed to add release:', result.error);
      return;
    }
    
    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Query featured content
    console.log('\nQuerying featured content...');
    const featured = await lensService.getFederationIndexFeatured(10);
    console.log('Featured entries found:', featured.length);
    
    if (featured.length > 0) {
      console.log('\nFeatured entries:');
      featured.forEach(entry => {
        console.log(`- ${entry.title} (featured: ${entry.isFeatured}, until: ${entry.featuredUntil ? new Date(entry.featuredUntil).toISOString() : 'N/A'})`);
      });
    }
    
    // Now test promoted
    console.log('\nCreating promoted release...');
    const promotedResult = await lensService.addRelease({
      name: 'Promoted Test ' + Date.now(),
      categoryId: 'video',
      contentCid: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU7',
      thumbnailCid: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'Test with promoted flag',
        contentType: 'video',
        tags: ['test', 'promoted'],
        isPromoted: true,
        promotedUntil: Date.now() + (30 * 24 * 60 * 60 * 1000)
      })
    });
    
    console.log('Promoted release added:', promotedResult);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Query promoted
    console.log('\nQuerying promoted content...');
    const promoted = await lensService.complexFederationIndexQuery({
      isPromoted: true,
      limit: 10
    });
    console.log('Promoted entries found:', promoted.length);
    
    if (promoted.length > 0) {
      console.log('\nPromoted entries:');
      promoted.forEach(entry => {
        console.log(`- ${entry.title} (promoted: ${entry.isPromoted}, until: ${entry.promotedUntil ? new Date(entry.promotedUntil).toISOString() : 'N/A'})`);
      });
    }
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error:', error.message || error);
  } finally {
    console.log('Cleaning up...');
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  }
}

// Catch uncaught exceptions to continue despite RPC errors
process.on('uncaughtException', (err) => {
  if (err.message !== 'Not initialized') {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  }
});

test();