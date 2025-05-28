import { randomBytes } from 'crypto';
import { Peerbit } from 'peerbit';
import { LensService } from '../src/service';
import { getTestPeerbit } from './test-identity';

describe('Federation Index Upload Test', () => {
  let peerbit: Peerbit;
  let service: LensService;

  beforeAll(async () => {
    // Get or create persistent test identity
    const testIdentity = await getTestPeerbit();
    peerbit = testIdentity.peerbit;
    
    service = new LensService(peerbit);
    console.log('Service client after constructor:', service.client);
    console.log('Peerbit identity:', peerbit.identity);
    // Don't call init when passing peerbit to constructor
  });

  afterAll(async () => {
    await service.closeSite();
    await service.stop();
    await peerbit.stop();
  });

  test('should upload featured release to Federation Index', async () => {
    // First, create a new Site instance
    const site = new (await import('../src/schema')).Site();
    
    // Open the site with federation index enabled
    await service.openSiteMinimal(site, {
      releasesArgs: { replicate: true }
    });
    
    console.log('Created new site with federation index');

    // Create test CIDs (simulating IPFS hashes)
    const contentCID = 'QmPRDz3YP9fNbe3AGHAA3VaNjS6CsV3PfUb9b7UqQfYiU6';
    const thumbnailCID = 'QmNzNjaPiwCiMYxY37ejcMYWDpedDYEo6AYa6ja8ASzZAp';

    // Add a featured release to the federation index
    console.log('Adding featured release to federation index...');
    const siteId = service.site!.address;
    
    // Insert into federation index with featured flag
    await service.site!.federationIndex!.insertContent({
      contentCID,
      title: 'Featured Video Release',
      thumbnailCID,
      sourceSiteId: siteId,
      timestamp: Date.now(),
      isFeatured: true,
      isPromoted: true,
      featuredUntil: Date.now() + 24 * 60 * 60 * 1000, // Featured for 24 hours
      promotedUntil: Date.now() + 24 * 60 * 60 * 1000, // Promoted for 24 hours
    });

    // Also add a non-featured release
    await service.site!.federationIndex!.insertContent({
      contentCID: 'QmXxxxDifferentCIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      title: 'Regular Video Release',
      thumbnailCID: 'QmYyyyDifferentThumbnailCIDyyyyyyyyyyyyyyyyyyyy',
      sourceSiteId: siteId,
      timestamp: Date.now() - 1000, // Slightly older
      isFeatured: false,
      isPromoted: false,
    });

    console.log('Releases added to federation index');

    // Query featured content
    const featured = await service.getFederationIndexFeatured(10);
    console.log('Featured releases:', featured.length);
    console.log('First featured:', featured[0]);

    // Query recent content
    const recent = await service.getFederationIndexRecent(10);
    console.log('Recent releases:', recent.length);
    console.log('Recent titles:', recent.map(r => r.title));

    // Verify featured content
    expect(featured.length).toBe(1);
    expect(featured[0].title).toBe('Featured Video Release');
    expect(featured[0].isFeatured).toBe(true);
    expect(featured[0].isPromoted).toBe(true);

    // Verify recent content includes both
    expect(recent.length).toBe(2);
    expect(recent[0].title).toBe('Featured Video Release'); // Most recent first
    expect(recent[1].title).toBe('Regular Video Release');

    console.log('Test completed successfully!');
  });
});