import { LensService } from '../src/service';
import { MEMBER_SITE_ARGS } from '../src/constants';
import { getTestPeerbit } from './test-identity';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe('Add Featured Release to Existing Site', () => {
  let service: LensService;
  let peerbit: any;

  beforeAll(async () => {
    // Get persistent test identity
    const testIdentity = await getTestPeerbit();
    peerbit = testIdentity.peerbit;
    
    service = new LensService(peerbit);
    
    // Get site address from environment
    const siteAddress = process.env.VITE_SITE_ADDRESS;
    if (!siteAddress) {
      throw new Error('VITE_SITE_ADDRESS not set in environment');
    }
    
    console.log('Connecting to site:', siteAddress);
    
    // Connect to bootstrappers
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS;
    if (bootstrappers) {
      const bootstrapperList = bootstrappers.split(',').map(b => b.trim());
      console.log('Connecting to bootstrappers...');
      
      for (const bootstrapper of bootstrapperList) {
        try {
          await service.dial(bootstrapper);
        } catch (err) {
          console.error(`Failed to dial ${bootstrapper}:`, err);
        }
      }
    }
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Open site with member args
    await service.openSiteMinimal(siteAddress, MEMBER_SITE_ARGS);
    
    // Check account status
    const accountStatus = await service.getAccountStatus();
    console.log('Account status:', accountStatus, '(0=GUEST, 1=MEMBER, 2=ADMIN)');
    
    if (accountStatus === 0) {
      console.log('\n=== Please authorize this key first ===');
      console.log(testIdentity.publicKey);
      throw new Error('Not authorized');
    }
  }, 30000);

  afterAll(async () => {
    await service.closeSite();
    await service.stop();
    await peerbit.stop();
  });

  test('should add featured release to federation index', async () => {
    console.log('Adding featured release...');
    
    // Add a release with featured metadata
    const result = await service.addRelease({
      name: 'Featured Test Movie ' + new Date().toISOString(),
      categoryId: 'movie',
      contentCID: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      thumbnailCID: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      metadata: JSON.stringify({
        description: 'This is a test featured movie',
        runtime: 120,
        isFeatured: true,
        isPromoted: true,
        featuredUntil: Date.now() + 24 * 60 * 60 * 1000, // Featured for 24 hours
        promotedUntil: Date.now() + 24 * 60 * 60 * 1000, // Promoted for 24 hours
      })
    });
    
    console.log('Add release result:', result);
    
    if (!result.success) {
      throw new Error('Failed to add release: ' + result.error);
    }
    
    // Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Query federation index for featured content
    console.log('Querying federation index for featured content...');
    const featured = await service.getFederationIndexFeatured(10);
    console.log('Featured entries:', featured.length);
    
    if (featured.length > 0) {
      console.log('First featured entry:', {
        title: featured[0].title,
        isFeatured: featured[0].isFeatured,
        isPromoted: featured[0].isPromoted,
        contentCID: featured[0].contentCID,
      });
    }
    
    // Query all entries
    const recent = await service.getFederationIndexRecent(10);
    console.log('Recent entries:', recent.length);
    
    // Expect at least one featured entry
    expect(featured.length).toBeGreaterThan(0);
    expect(featured[0].isFeatured).toBe(true);
  });
});