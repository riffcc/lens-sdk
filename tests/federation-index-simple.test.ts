import { Peerbit } from 'peerbit';
import { LensService } from '../src/service';
import { Site } from '../src/schema';
import { 
  MEMBER_SITE_ARGS,
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from '../src/constants';
import type { ReleaseData } from '../src/types';

describe('Federation Index Simple Test', () => {
  let service: LensService;
  let peerbit: Peerbit;

  beforeAll(async () => {
    // Create new Peerbit instance and service
    peerbit = await Peerbit.create();
    service = new LensService(peerbit);
    
    // Create a new site with federation index
    const site = new Site(peerbit.identity.publicKey);
    
    // Open the site with minimal setup (includes federation index)
    await service.openSiteMinimal(site, MEMBER_SITE_ARGS);
    
    console.log('Created new site with federation index');
  }, 30000);

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

    // Test complex query
    const complexResults = await service.complexFederationIndexQuery({
      contentType: 'video',
      tags: ['ipfs'],
      limit: 10,
    });
    
    console.log('Complex query results:', complexResults.length);
    
    const complexEntry = complexResults.find(
      entry => entry.contentCid === 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6'
    );
    
    expect(complexEntry).toBeDefined();

    // Get stats
    const stats = await service.getFederationIndexStats();
    console.log('Federation Index stats:', stats);
    
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.entriesByCategory['video']).toBeGreaterThan(0);
    expect(stats.entriesByType['video']).toBeGreaterThan(0);
  });
});