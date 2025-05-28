import { Peerbit } from 'peerbit';
import { LensService } from '../src/service';
import { Site, Release } from '../src/schema';
import { 
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
} from '../src/constants';
// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Federation Index Integration', () => {
  let client1: Peerbit;
  let client2: Peerbit;
  let lensService1: LensService;
  let lensService2: LensService;
  let site1: Site;
  let site2: Site;

  beforeAll(async () => {
    // Set up two peers
    client1 = await Peerbit.create();
    client2 = await Peerbit.create();
    
    await client1.start();
    await client2.start();
    
    // Connect peers
    const address2 = await client2.getMultiaddrs();
    await client1.dial(address2);
  }, 30000);

  afterAll(async () => {
    await client1?.stop();
    await client2?.stop();
  });

  describe('Basic Federation Index Operations', () => {
    beforeEach(async () => {
      // Create lens services
      lensService1 = new LensService();
      lensService2 = new LensService();
      
      // Initialize with existing clients
      await lensService1.init();
      await lensService2.init();
      
      // Override clients
      (lensService1 as any).client = client1;
      (lensService2 as any).client = client2;
      
      // Create sites with federation index enabled (default)
      site1 = new Site(client1.identity.publicKey);
      site2 = new Site(client2.identity.publicKey);
      
      // Open sites
      await lensService1.openSite(site1);
      await lensService2.openSite(site2);
    });

    afterEach(async () => {
      await lensService1?.closeSite();
      await lensService2?.closeSite();
    });

    test('should create sites with federation index enabled', async () => {
      expect(site1.federationIndex).toBeDefined();
      expect(site2.federationIndex).toBeDefined();
    });

    test('should add content to federation index when syncing', async () => {
      // Site2 subscribes to Site1
      const subscription = {
        [SUBSCRIPTION_SITE_ID_PROPERTY]: site1.address,
        [SUBSCRIPTION_NAME_PROPERTY]: 'Test Site 1',
        [SUBSCRIPTION_RECURSIVE_PROPERTY]: false,
        subscriptionType: 'direct',
        currentDepth: 0,
        followChain: [site2.address],
      };
      
      await lensService2.addSubscription(subscription);
      
      // Give time for subscription setup
      await delay(2000);
      
      // Site1 adds a release
      const release = {
        [RELEASE_NAME_PROPERTY]: 'Test Video',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'video',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmTest123',
        [RELEASE_THUMBNAIL_CID_PROPERTY]: 'QmThumb123',
        [RELEASE_METADATA_PROPERTY]: JSON.stringify({
          description: 'A test video',
          contentType: 'video',
          tags: ['test', 'demo'],
          Cover: 'QmcD4R3Qj8jBWY73H9LQWESgonNB1AMN3of23ubjDhJVSm',
        }),
      };
      
      await lensService1.addRelease(release);
      
      // Wait for sync
      await delay(3000);
      
      // Check that Site2's federation index has the entry
      const federationEntries = await lensService2.getFederationIndexRecent(10);
      
      expect(federationEntries.length).toBeGreaterThan(0);
      
      const entry = federationEntries[0];
      expect(entry.title).toBe('Test Video');
      expect(entry.contentCID).toBe('QmTest123');
      expect(entry.thumbnailCID).toBe('QmThumb123');
      expect(entry.coverCID).toBe('QmcD4R3Qj8jBWY73H9LQWESgonNB1AMN3of23ubjDhJVSm');
      expect(entry.sourceSiteId).toBe(site1.address);
    });

    test('should query federation index by category', async () => {
      // Directly insert test entries into Site2's federation index
      const site2FedIndex = site2.federationIndex!;
      
      // Follow Site1 to allow inserts
      await site2FedIndex.followSite(site1.address);
      
      // Insert multiple entries
      await site2FedIndex.insertContent({
        contentCid: 'QmVideo1',
        title: 'Video 1',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'video',
        timestamp: Date.now(),
        tags: ['action'],
        isFeatured: false,
        isPromoted: false,
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmMusic1',
        title: 'Music 1',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'audio',
        categoryId: 'music',
        timestamp: Date.now(),
        tags: ['rock'],
        isFeatured: false,
        isPromoted: false,
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmVideo2',
        title: 'Video 2',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'video',
        timestamp: Date.now(),
        tags: ['comedy'],
        isFeatured: false,
        isPromoted: false,
      });
      
      // Query by category
      const videoEntries = await lensService2.getFederationIndexByCategory('video');
      const musicEntries = await lensService2.getFederationIndexByCategory('music');
      
      expect(videoEntries.length).toBe(2);
      expect(musicEntries.length).toBe(1);
      
      expect(videoEntries.map(e => e.title).sort()).toEqual(['Video 1', 'Video 2']);
      expect(musicEntries[0].title).toBe('Music 1');
    });

    test('should search federation index', async () => {
      const site2FedIndex = site2.federationIndex!;
      await site2FedIndex.followSite(site1.address);
      
      // Insert entries with different titles
      await site2FedIndex.insertContent({
        contentCid: 'QmAwesome1',
        title: 'Awesome Video Tutorial',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'tutorial',
        timestamp: Date.now(),
        description: 'Learn how to make awesome videos',
        tags: ['tutorial', 'video'],
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmCoding1',
        title: 'Coding Masterclass',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'tutorial',
        timestamp: Date.now(),
        description: 'Master the art of coding',
        tags: ['tutorial', 'programming'],
      });
      
      // Search for "awesome"
      const searchResults = await lensService2.searchFederationIndex('awesome');
      
      expect(searchResults.length).toBe(1);
      expect(searchResults[0].title).toBe('Awesome Video Tutorial');
      
      // Search for "tutorial" should match both (in title or description)
      const tutorialResults = await lensService2.searchFederationIndex('tutorial');
      
      expect(tutorialResults.length).toBe(2);
    });

    test('should get federation index stats', async () => {
      const site2FedIndex = site2.federationIndex!;
      await site2FedIndex.followSite(site1.address);
      await site2FedIndex.followSite('fake-site-id-123');
      
      // Insert entries from different sources
      await site2FedIndex.insertContent({
        contentCid: 'QmStat1',
        title: 'Stat Video 1',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'video',
        timestamp: Date.now() - 10000,
        tags: [],
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmStat2',
        title: 'Stat Music 1',
        sourceSiteId: 'fake-site-id-123',
        sourceSiteName: 'Fake Site',
        contentType: 'audio',
        categoryId: 'music',
        timestamp: Date.now(),
        tags: [],
      });
      
      const stats = await lensService2.getFederationIndexStats();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.entriesBySite.size).toBe(2);
      expect(stats.entriesBySite.get(site1.address)).toBe(1);
      expect(stats.entriesBySite.get('fake-site-id-123')).toBe(1);
      expect(stats.entriesByType.get('video')).toBe(1);
      expect(stats.entriesByType.get('audio')).toBe(1);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.oldestEntry?.title).toBe('Stat Video 1');
      expect(stats.newestEntry?.title).toBe('Stat Music 1');
    });

    test('should handle complex queries', async () => {
      const site2FedIndex = site2.federationIndex!;
      await site2FedIndex.followSite(site1.address);
      
      const baseTime = Date.now();
      
      // Insert various entries
      await site2FedIndex.insertContent({
        contentCid: 'QmComplex1',
        title: 'Rock Music Video',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'music',
        timestamp: baseTime - 5000,
        tags: ['rock', 'music-video'],
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmComplex2',
        title: 'Jazz Performance',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'music',
        timestamp: baseTime,
        tags: ['jazz', 'live'],
      });
      
      await site2FedIndex.insertContent({
        contentCid: 'QmComplex3',
        title: 'Comedy Show',
        sourceSiteId: site1.address,
        sourceSiteName: 'Test Site 1',
        contentType: 'video',
        categoryId: 'entertainment',
        timestamp: baseTime + 5000,
        tags: ['comedy', 'standup'],
      });
      
      // Complex query: music category videos with "music" in the title
      const results = await lensService2.complexFederationIndexQuery({
        query: 'music',
        categoryId: 'music',
        contentType: 'video',
        limit: 10,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Rock Music Video');
      
      // Query by tags
      const jazzResults = await lensService2.complexFederationIndexQuery({
        tags: ['jazz'],
        limit: 10,
      });
      
      expect(jazzResults.length).toBe(1);
      expect(jazzResults[0].title).toBe('Jazz Performance');
      
      // Query by timestamp range
      const recentResults = await lensService2.complexFederationIndexQuery({
        afterTimestamp: baseTime - 1000,
        beforeTimestamp: baseTime + 1000,
        limit: 10,
      });
      
      expect(recentResults.length).toBe(1);
      expect(recentResults[0].title).toBe('Jazz Performance');
    });
  });
});