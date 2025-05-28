import { LensService } from '../src/service';
import { 
  MEMBER_SITE_ARGS,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from '../src/constants';
import type { ReleaseData } from '../src/types';
import dotenv from 'dotenv';
import { getTestPeerbit } from './test-identity';

// Load environment variables from local .env
dotenv.config();

describe('Federation Index Test with Persistent Identity', () => {
  let service: LensService;
  let peerbit: any;

  beforeAll(async () => {
    // Get or create persistent test identity
    const testIdentity = await getTestPeerbit();
    peerbit = testIdentity.peerbit;
    
    // Create service with the peerbit instance
    service = new LensService(peerbit);
    
    // Get site address from environment
    const siteAddress = process.env.VITE_SITE_ADDRESS;
    if (!siteAddress) {
      throw new Error('VITE_SITE_ADDRESS not set in environment');
    }
    
    console.log('Connecting to site:', siteAddress);
    
    // Connect to bootstrappers if available
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
    
    // Open site with minimal setup
    await service.openSiteMinimal(siteAddress, MEMBER_SITE_ARGS);
    
    // Check account status with retries
    let accountStatus = await service.getAccountStatus();
    console.log('Initial account status:', accountStatus, '(0=GUEST, 1=MEMBER, 2=ADMIN)');
    
    // Retry a few times if still guest
    let retries = 0;
    while (accountStatus === 0 && retries < 3) {
      console.log(`Still GUEST, waiting for authorization to propagate (attempt ${retries + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Close and reopen to force refresh
      await service.closeSite();
      await service.openSiteMinimal(siteAddress, MEMBER_SITE_ARGS);
      
      accountStatus = await service.getAccountStatus();
      console.log(`Account status after retry ${retries + 1}:`, accountStatus);
      retries++;
    }
    
    if (accountStatus === 0) {
      console.log('\n=== ACTION REQUIRED ===');
      console.log('Please authorize this test identity public key as MEMBER or ADMIN:');
      console.log(testIdentity.publicKey);
      console.log('Then re-run this test');
      console.log('======================\n');
      throw new Error('Test account not authorized. Please authorize the public key shown above.');
    }
    
    console.log('Test identity is authorized! Status:', accountStatus === 1 ? 'MEMBER' : 'ADMIN');
  }, 60000);

  afterAll(async () => {
    await service.stop();
    await peerbit.stop();
  });

  test('should upload release with valid CIDs and retrieve from Federation Index', async () => {
    // Test data with provided CIDs
    const releaseData: ReleaseData = {
      [RELEASE_NAME_PROPERTY]: 'Test Video with Valid CIDs',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'video',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      [RELEASE_METADATA_PROPERTY]: JSON.stringify({
        description: 'Test video with real IPFS CIDs',
        contentType: 'video',
        tags: ['test', 'ipfs', 'federation'],
      }),
    };

    console.log('Adding release with CIDs:', {
      content: releaseData[RELEASE_CONTENT_CID_PROPERTY],
      thumbnail: releaseData[RELEASE_THUMBNAIL_CID_PROPERTY],
    });

    // Add the release
    const addResult = await service.addRelease(releaseData);
    
    if (!addResult.success) {
      console.error('Add release failed:', addResult.error);
    }
    
    expect(addResult.success).toBe(true);
    expect(addResult.id).toBeDefined();
    expect(addResult.hash).toBeDefined();

    console.log('Release added successfully:', addResult);

    // Wait a bit for propagation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Query from Federation Index by category
    const categoryResults = await service.getFederationIndexByCategory('video', 10);
    console.log('Category query results:', categoryResults.length);
    
    const uploadedEntry = categoryResults.find(
      entry => entry.contentCid === 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6'
    );
    
    expect(uploadedEntry).toBeDefined();
    expect(uploadedEntry?.title).toBe('Test Video with Valid CIDs');
    expect(uploadedEntry?.thumbnailCid).toBe('QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp');
    expect(uploadedEntry?.categoryId).toBe('video');
    expect(uploadedEntry?.contentType).toBe('video');
    expect(uploadedEntry?.tags).toEqual(['test', 'ipfs', 'federation']);

    // Query recent entries
    const recentResults = await service.getFederationIndexRecent(10);
    console.log('Recent query results:', recentResults.length);
    
    const recentEntry = recentResults.find(
      entry => entry.contentCid === 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6'
    );
    
    expect(recentEntry).toBeDefined();

    // Get stats
    const stats = await service.getFederationIndexStats();
    console.log('Federation Index stats:', stats);
    
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.entriesByCategory['video']).toBeGreaterThan(0);
    expect(stats.entriesByType['video']).toBeGreaterThan(0);

    console.log('Test completed successfully!');
  });
});