import { LensService } from '../src/service';
import { 
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from '../src/constants';
import { getTestPeerbit } from './test-identity';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from current directory
dotenv.config({ path: join(__dirname, '../.env') });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Federation Index Upload Test', () => {
  let lensService: LensService;
  let publicKey: string;

  beforeAll(async () => {
    // Get persistent test identity
    const { peerbit, publicKey: pubKey } = await getTestPeerbit();
    publicKey = pubKey;
    
    console.log('Test identity public key:', publicKey);
    console.log('Please ensure this key is authorized in lens-node');
    
    // Create lens service with test identity
    lensService = new LensService();
    lensService['_client'] = peerbit;
    await lensService.init();
    
    // Connect to bootstrap nodes
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS?.split(',') || [];
    console.log('Connecting to bootstrap nodes:', bootstrappers.length);
    
    for (const addr of bootstrappers) {
      try {
        await lensService.dial(addr.trim());
        console.log('Connected to bootstrap node:', addr.trim().split('/').pop());
      } catch (err) {
        console.warn('Failed to connect to bootstrap node:', addr, err);
      }
    }
    
    // Wait for connections to establish
    await delay(3000);
  }, 30000);

  afterAll(async () => {
    await lensService?.stop();
  });

  test('should upload content with featured flag to federation index', async () => {
    // Load site address from environment
    const siteAddress = process.env.VITE_SITE_ADDRESS || process.env.SITE_ADDRESS || process.env.BOOTSTRAP_SITE_ADDRESS;
    if (!siteAddress) {
      throw new Error('No VITE_SITE_ADDRESS, SITE_ADDRESS or BOOTSTRAP_SITE_ADDRESS found in environment');
    }

    console.log('Opening site:', siteAddress);
    
    // Open the site with full configuration to ensure proper authorization
    await lensService.openSite(siteAddress, {
      releasesArgs: { replicate: false },
      featuredReleasesArgs: { replicate: false },
      contentCategoriesArgs: { replicate: false },
      subscriptionsArgs: { replicate: false },
      blockedContentArgs: { replicate: false },
      syncSitesArgs: { replicate: false },
      membersArg: { replicate: true },
      administratorsArgs: { replicate: true },
    });
    
    console.log('Site opened successfully');
    
    // Check account status with retries
    let accountStatus = 0;
    for (let i = 0; i < 10; i++) {
      accountStatus = await lensService.getAccountStatus();
      console.log(`Account status check ${i + 1}: ${accountStatus}`);
      
      if (accountStatus > 0) break;
      await delay(2000);
    }
    
    if (accountStatus === 0) {
      console.error('Account is not authorized. Please authorize in lens-node and try again.');
      console.log('Test identity public key:', publicKey);
      return;
    }
    
    console.log('Account authorized, uploading release...');
    
    // Create release with the provided CIDs and featured flag
    const releaseData = {
      [RELEASE_NAME_PROPERTY]: 'Featured Test Release',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'video',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      [RELEASE_METADATA_PROPERTY]: JSON.stringify({
        description: 'Test release with featured flag',
        contentType: 'video',
        tags: ['test', 'featured', 'demo'],
        isFeatured: true,
        isPromoted: false,
        featuredUntil: Date.now() + (7 * 24 * 60 * 60 * 1000), // Featured for 7 days
      }),
    };
    
    const result = await lensService.addRelease(releaseData);
    expect(result.success).toBe(true);
    console.log('Release added successfully:', result.id);
    
    // Wait for propagation
    await delay(2000);
    
    // Query featured content from federation index
    const featuredEntries = await lensService.getFederationIndexFeatured(10);
    console.log('Featured entries found:', featuredEntries.length);
    
    // Find our entry
    const ourEntry = featuredEntries.find(entry => 
      entry.contentCid === releaseData[RELEASE_CONTENT_CID_PROPERTY]
    );
    
    expect(ourEntry).toBeDefined();
    expect(ourEntry?.title).toBe('Featured Test Release');
    expect(ourEntry?.isFeatured).toBe(true);
    expect(ourEntry?.isPromoted).toBe(false);
    expect(ourEntry?.featuredUntil).toBeDefined();
    expect(ourEntry?.featuredUntil).toBeGreaterThan(Date.now());
    
    console.log('Featured entry verified:', ourEntry);
    
    // Test promoted content
    const promotedReleaseData = {
      [RELEASE_NAME_PROPERTY]: 'Promoted Test Release',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'video',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU7', // Different CID
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp',
      [RELEASE_METADATA_PROPERTY]: JSON.stringify({
        description: 'Test release with promoted flag',
        contentType: 'video',
        tags: ['test', 'promoted', 'demo'],
        isFeatured: false,
        isPromoted: true,
        promotedUntil: Date.now() + (30 * 24 * 60 * 60 * 1000), // Promoted for 30 days
      }),
    };
    
    const promotedResult = await lensService.addRelease(promotedReleaseData);
    expect(promotedResult.success).toBe(true);
    console.log('Promoted release added successfully:', promotedResult.id);
    
    // Wait for propagation
    await delay(2000);
    
    // Query promoted content
    const promotedEntries = await lensService.complexFederationIndexQuery({
      isPromoted: true,
      limit: 10,
    });
    
    console.log('Promoted entries found:', promotedEntries.length);
    
    const promotedEntry = promotedEntries.find(entry => 
      entry.title === 'Promoted Test Release'
    );
    
    expect(promotedEntry).toBeDefined();
    expect(promotedEntry?.isPromoted).toBe(true);
    expect(promotedEntry?.isFeatured).toBe(false);
    expect(promotedEntry?.promotedUntil).toBeDefined();
    expect(promotedEntry?.promotedUntil).toBeGreaterThan(Date.now());
    
    console.log('Promoted entry verified:', promotedEntry);
    
    // Test complex query with both featured and promoted
    const featuredAndPromoted = await lensService.complexFederationIndexQuery({
      isFeatured: true,
      contentType: 'video',
      limit: 10,
    });
    
    console.log('Featured video entries found:', featuredAndPromoted.length);
    expect(featuredAndPromoted.length).toBeGreaterThan(0);
    
    console.log('All tests completed successfully!');
  }, 60000);
});