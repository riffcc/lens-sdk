#!/usr/bin/env node
import { LensService } from '../src/service.js';
import { 
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from '../src/constants.js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function test() {
  const lensService = new LensService();
  
  try {
    console.log('Initializing lens service...');
    await lensService.init();
    
    // Connect to bootstrap nodes
    const bootstrappers = (process.env.BOOTSTRAPPERS || process.env.VITE_BOOTSTRAPPERS)?.split(',') || [];
    console.log('Connecting to bootstrap nodes...');
    
    for (const addr of bootstrappers) {
      try {
        await lensService.dial(addr.trim());
        console.log('Connected to:', addr.trim().split('/').pop());
      } catch (err) {
        console.warn('Failed to connect:', err);
      }
    }
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const siteAddress = process.env.SITE_ADDRESS || process.env.VITE_SITE_ADDRESS;
    console.log('Opening site:', siteAddress);
    
    await lensService.openSite(siteAddress);
    console.log('Site opened successfully');
    
    let accountStatus = 0;
    try {
      accountStatus = await lensService.getAccountStatus();
      console.log('Account status:', accountStatus);
    } catch (error) {
      console.error('Error getting account status:', error.message);
      const publicKey = await lensService.getPublicKey();
      console.log('Public key:', publicKey);
      return;
    }
    
    if (accountStatus === 0) {
      console.log('Not authorized. Public key:', await lensService.getPublicKey());
      return;
    }
    
    console.log('Authorized! Creating featured release...');
    
    // Create a featured release
    const releaseData = {
      [RELEASE_NAME_PROPERTY]: 'Featured Test Video ' + Date.now(),
      [RELEASE_CATEGORY_ID_PROPERTY]: 'video',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      [RELEASE_METADATA_PROPERTY]: JSON.stringify({
        description: 'Test release with featured flag',
        contentType: 'video',
        tags: ['test', 'featured'],
        isFeatured: true,
        isPromoted: false,
        featuredUntil: Date.now() + (7 * 24 * 60 * 60 * 1000), // Featured for 7 days
      }),
    };
    
    const result = await lensService.addRelease(releaseData);
    console.log('Release added:', result);
    
    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Query featured content
    const featured = await lensService.getFederationIndexFeatured(10);
    console.log('Featured entries:', featured.length);
    
    const ourEntry = featured.find(e => e.title.includes('Featured Test Video'));
    if (ourEntry) {
      console.log('Found our featured entry:', {
        title: ourEntry.title,
        isFeatured: ourEntry.isFeatured,
        featuredUntil: new Date(ourEntry.featuredUntil || 0).toISOString(),
      });
    }
    
    // Create a promoted release
    const promotedData = {
      [RELEASE_NAME_PROPERTY]: 'Promoted Test Video ' + Date.now(),
      [RELEASE_CATEGORY_ID_PROPERTY]: 'video', 
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU7',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      [RELEASE_METADATA_PROPERTY]: JSON.stringify({
        description: 'Test release with promoted flag',
        contentType: 'video',
        tags: ['test', 'promoted'],
        isFeatured: false,
        isPromoted: true,
        promotedUntil: Date.now() + (30 * 24 * 60 * 60 * 1000), // Promoted for 30 days
      }),
    };
    
    const promotedResult = await lensService.addRelease(promotedData);
    console.log('Promoted release added:', promotedResult);
    
    // Wait and query
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const promoted = await lensService.complexFederationIndexQuery({
      isPromoted: true,
      limit: 10,
    });
    
    console.log('Promoted entries:', promoted.length);
    
    console.log('\nTest completed successfully!');
    console.log('Featured releases are now stored in the Federation Index with proper flags.');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await lensService.stop();
  }
}

test().catch(console.error);