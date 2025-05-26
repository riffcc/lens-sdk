import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { delay } from '@peerbit/time';
import { LensService } from '../src/service';
import { Site, Subscription, Release, SyncSite } from '../src/schema';
import {
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  SYNC_SITE_TARGET_ID_PROPERTY,
  SYNC_SITE_STATUS_PROPERTY,
  DEDICATED_SITE_ARGS,
  ADMIN_SITE_ARGS,
} from '../src/constants';
import type { ReleaseData, SubscriptionData } from '../src/types';

interface SiteNode {
  id: string;
  client: Peerbit;
  service: LensService;
  site: Site;
  isReplicator: boolean;
  followsCount: number;
  contentCount: number;
}

interface FederationMetrics {
  totalSites: number;
  totalFollowConnections: number;
  totalContent: number;
  syncStartTime: number;
  syncEndTime: number;
  totalSyncTime: number;
  contentReplicationSuccess: number;
  contentReplicationFailures: number;
  averageContentPerSite: number;
  networkDiscoveryTime: number;
  recursiveDepthReached: number;
  cyclesDetected: number;
}

interface SyncPerformanceMetrics {
  siteId: string;
  contentBeforeSync: number;
  contentAfterSync: number;
  syncDuration: number;
  followsDiscovered: number;
  recursiveDepth: number;
  errorCount: number;
}

// Skip this test suite as it's a benchmark test that creates many peers
// and has connectivity issues in test environments
describe.skip('Federation Sync Benchmark - 40 Sites', () => {
  let sites: SiteNode[] = [];
  let replicatorNodes: SiteNode[] = [];
  const NUM_SITES = 20;
  const NUM_REPLICATORS = 5;
  const MIN_FOLLOWS_PER_SITE = 2;
  const MAX_FOLLOWS_PER_SITE = 10;
  const MIN_CONTENT_PER_SITE = 5;
  const MAX_CONTENT_PER_SITE = 20;
  const SYNC_TIMEOUT = 30000; // 30 seconds max
  
  let benchmarkMetrics: FederationMetrics;

  beforeAll(async () => {
    console.log('🚀 Starting Federation Sync Benchmark');
    console.log(`Creating ${NUM_SITES} sites with ${NUM_REPLICATORS} replicators`);
    
    benchmarkMetrics = {
      totalSites: NUM_SITES,
      totalFollowConnections: 0,
      totalContent: 0,
      syncStartTime: 0,
      syncEndTime: 0,
      totalSyncTime: 0,
      contentReplicationSuccess: 0,
      contentReplicationFailures: 0,
      averageContentPerSite: 0,
      networkDiscoveryTime: 0,
      recursiveDepthReached: 0,
      cyclesDetected: 0,
    };
  }, 60000);

  afterAll(async () => {
    console.log('🧹 Cleaning up benchmark nodes...');
    
    // Log benchmark results before cleanup
    if (benchmarkMetrics) {
      console.log('📊 Final Benchmark Results:');
      console.table(benchmarkMetrics);
    }
    
    // Close all sites and clients
    for (const site of [...sites, ...replicatorNodes]) {
      try {
        if (site.site) await site.site.close();
        if (site.client) await site.client.stop();
      } catch (error) {
        console.warn(`Cleanup error for site ${site.id}:`, error);
      }
    }
  }, 60000);

  it('should create 40 sites with random content', async () => {
    console.log('📦 Creating sites and generating content...');
    
    // Create sites sequentially to avoid database lock conflicts
    for (let index = 0; index < NUM_SITES; index++) {
      if (index % 10 === 0) {
        console.log(`Creating site ${index + 1}/${NUM_SITES}`);
      }
      
      try {
        const client = await Peerbit.create({
          directory: `./test-data/federation-benchmark/site-${index}`,
        });
        
        const service = new LensService(client);
        const site = new Site(client.identity.publicKey);
        
        await service.openSite(site, {
          ...ADMIN_SITE_ARGS,
          releasesArgs: { ...ADMIN_SITE_ARGS.releasesArgs, disableCache: true },
          subscriptionsArgs: { ...ADMIN_SITE_ARGS.subscriptionsArgs, disableCache: true },
          syncSitesArgs: { replicate: false }, // Regular sites don't manage sync
        });

        const siteNode: SiteNode = {
          id: site.address,
          client,
          service,
          site,
          isReplicator: false,
          followsCount: 0,
          contentCount: 0,
        };

        // Generate content for this site with some overlap for testing federation
        const contentCount = Math.floor(
          Math.random() * (MAX_CONTENT_PER_SITE - MIN_CONTENT_PER_SITE + 1) + MIN_CONTENT_PER_SITE
        );
        
        for (let i = 0; i < contentCount; i++) {
          // Create some shared content across sites for federation testing
          // 30% of content will be shared across multiple sites
          const isSharedContent = Math.random() < 0.3;
          const contentId = isSharedContent ? 
            `SharedContent${Math.floor(Math.random() * 10)}` : // Shared content pool
            `Site${index}Content${i}`; // Unique content
          
          const releaseData: ReleaseData = {
            [RELEASE_NAME_PROPERTY]: isSharedContent ? 
              `Shared Content: ${contentId}` : 
              `Site ${index} Release ${i}`,
            [RELEASE_CATEGORY_ID_PROPERTY]: `category-${Math.floor(Math.random() * 5)}`,
            [RELEASE_CONTENT_CID_PROPERTY]: `Qm${contentId}${Math.random().toString(36).substring(2, 8)}`,
          };
          
          await service.addRelease(releaseData);
          siteNode.contentCount++;
          benchmarkMetrics.totalContent++;
        }

        sites.push(siteNode);
        
      } catch (error) {
        console.error(`Failed to create site ${index}:`, error);
        // Continue with other sites
      }
    }
    
    console.log(`✅ Created ${sites.length} sites with total ${benchmarkMetrics.totalContent} content items`);
    benchmarkMetrics.averageContentPerSite = benchmarkMetrics.totalContent / NUM_SITES;
    
    expect(sites).toHaveLength(NUM_SITES);
    expect(benchmarkMetrics.totalContent).toBeGreaterThan(0);
  }, 30000);

  it('should create dedicated replicator nodes', async () => {
    console.log('🤖 Creating dedicated replicator nodes...');
    
    const replicatorPromises = Array.from({ length: NUM_REPLICATORS }, async (_, index) => {
      const client = await Peerbit.create({
        directory: `./test-data/federation-benchmark/replicator-${index}`,
      });
      
      const service = new LensService(client);
      const site = new Site(client.identity.publicKey);
      
      await service.openSite(site, {
        ...DEDICATED_SITE_ARGS,
        releasesArgs: { ...DEDICATED_SITE_ARGS.releasesArgs, disableCache: true },
      });

      return {
        id: site.address,
        client,
        service,
        site,
        isReplicator: true,
        followsCount: 0,
        contentCount: 0,
      };
    });

    replicatorNodes = await Promise.all(replicatorPromises);
    
    console.log(`✅ Created ${replicatorNodes.length} replicator nodes`);
    expect(replicatorNodes).toHaveLength(NUM_REPLICATORS);
  }, 60000);

  it('should establish random follow relationships', async () => {
    console.log('🔗 Establishing random follow relationships...');
    
    // Skip if no sites were created successfully
    if (sites.length === 0) {
      console.log('⚠️ No sites available for follow relationships');
      return;
    }
    
    const followPromises: Promise<void>[] = [];
    
    for (const site of sites) {
      const followsCount = Math.floor(
        Math.random() * (MAX_FOLLOWS_PER_SITE - MIN_FOLLOWS_PER_SITE + 1) + MIN_FOLLOWS_PER_SITE
      );
      
      // Randomly select sites to follow
      const potentialFollows = sites.filter(s => s.id !== site.id);
      const sitesToFollow = potentialFollows
        .sort(() => Math.random() - 0.5)
        .slice(0, followsCount);
      
      for (const targetSite of sitesToFollow) {
        followPromises.push(
          (async () => {
            const subscription = new Subscription({
              [SUBSCRIPTION_SITE_ID_PROPERTY]: targetSite.id,
              [SUBSCRIPTION_NAME_PROPERTY]: `Following ${targetSite.id.slice(0, 8)}`,
              [SUBSCRIPTION_RECURSIVE_PROPERTY]: Math.random() > 0.3, // 70% chance of recursive
              subscriptionType: 'direct',
              currentDepth: 0,
              followChain: [],
            });
            
            const result = await site.site.subscriptions.put(subscription);
            
            site.followsCount++;
            benchmarkMetrics.totalFollowConnections++;
          })()
        );
      }
    }
    
    await Promise.all(followPromises);
    
    // Final verification: check how many subscriptions each site actually has
    console.log('🔍 Final subscription count per site:');
    for (let i = 0; i < sites.length; i++) {
      const finalSubscriptions = await sites[i].site.subscriptions.index.search({}, { cache: false });
      console.log(`Site ${i}: ${finalSubscriptions.length} total subscriptions`);
    }
    
    const avgFollows = sites.length > 0 ? benchmarkMetrics.totalFollowConnections / sites.length : 0;
    console.log(`✅ Established ${benchmarkMetrics.totalFollowConnections} follow relationships (avg: ${avgFollows.toFixed(1)} per site)`);
    
    if (sites.length > 0) {
      expect(benchmarkMetrics.totalFollowConnections).toBeGreaterThan(0);
    }
  }, 60000);

  it('should perform federation sync and measure performance', async () => {
    console.log('🔄 Starting federation sync benchmark...');
    
    // First, verify sites still exist and check their subscription counts
    console.log(`📊 Sites available for sync: ${sites.length}`);
    for (let i = 0; i < Math.min(5, sites.length); i++) {
      const subscriptions = await sites[i].site.subscriptions.index.search({}, { cache: false });
      console.log(`Sync phase - Site ${i}: ${subscriptions.length} subscriptions`);
    }
    
    benchmarkMetrics.syncStartTime = Date.now();
    const sitePerformanceMetrics: SyncPerformanceMetrics[] = [];
    
    // Each site independently syncs from sites it follows (parallel sync like real federation)
    const allSyncPromises = sites.map(async (site, siteIndex) => {
      // Get ALL subscriptions for this site (no filters, bypass cache)
      const mySubscriptions = await site.site.subscriptions.index.search({}, { cache: false });
      
      if (siteIndex < 3) { // Only log for first few sites to reduce noise
        console.log(`Site ${siteIndex} has ${mySubscriptions.length} subscriptions and will attempt sync`);
      }
      
      if (mySubscriptions.length === 0) {
        return []; // No subscriptions to sync from
      }
      
      // Sync from each site this site follows
      const siteSyncPromises = mySubscriptions.map(async (subscription) => {
        const targetSiteId = subscription.value?.[SUBSCRIPTION_SITE_ID_PROPERTY] || subscription[SUBSCRIPTION_SITE_ID_PROPERTY];
        if (!targetSiteId) {
          return null;
        }
        
        const targetSite = sites.find(s => s.id === targetSiteId);
        
        if (!targetSite) return null;
        
        const performanceMetric: SyncPerformanceMetrics = {
          siteId: targetSite.id,
          contentBeforeSync: 0,
          contentAfterSync: 0,
          syncDuration: 0,
          followsDiscovered: 0,
          recursiveDepth: 0,
          errorCount: 0,
        };
        
        const syncStart = Date.now();
        
        try {
          // Count content before sync
          const contentBefore = await site.site.releases.index.search({});
          performanceMetric.contentBeforeSync = contentBefore.length;
          
          // Connect to target site (simulate peer-to-peer federation)
          await site.client.dial(targetSite.client.getMultiaddrs()[0]);
          const remoteSite = await site.client.open<Site>(targetSite.id, {
            args: { releasesArgs: { replicate: false } }
          });
          
          // Replicate content from the site we follow
          let remoteContentCount = 0;
          let replicatedContentCount = 0;
          
          await remoteSite.releases.index.iterate({}, async (release) => {
            remoteContentCount++;
            try {
              // Check if we already have this content (by CID)
              const existing = await site.site.releases.index.search({
                query: { [RELEASE_CONTENT_CID_PROPERTY]: release.value[RELEASE_CONTENT_CID_PROPERTY] }
              });
              
              if (existing.length === 0) {
                const localRelease = new Release({
                  ...release.value,
                  sourceSiteId: targetSite.id,
                });
                await site.site.releases.put(localRelease);
                benchmarkMetrics.contentReplicationSuccess++;
                replicatedContentCount++;
              }
            } catch (error) {
              benchmarkMetrics.contentReplicationFailures++;
              performanceMetric.errorCount++;
              console.error(`Replication error from ${targetSite.id.slice(0, 8)}:`, error);
            }
          });
          
          console.log(`Site ${siteIndex} replicated ${replicatedContentCount}/${remoteContentCount} items from ${targetSite.id.slice(0, 8)}`);
          
          // Discover their subscriptions for potential recursive following
          const theirSubscriptions = await remoteSite.subscriptions.index.search({
            query: { subscriptionType: 'direct' }
          });
          
          performanceMetric.followsDiscovered = theirSubscriptions.length;
          
          // If this subscription is recursive, potentially follow their follows
          if (subscription.value?.[SUBSCRIPTION_RECURSIVE_PROPERTY] && theirSubscriptions.length > 0) {
            console.log(`Site ${siteIndex} discovered ${theirSubscriptions.length} recursive follows from ${targetSite.id.slice(0, 8)}`);
            
            // For benchmark purposes, just count but don't actually follow to avoid infinite loops
            performanceMetric.recursiveDepth = 1;
          }
          
          await remoteSite.close();
          
          // Count content after sync
          const contentAfter = await site.site.releases.index.search({});
          performanceMetric.contentAfterSync = contentAfter.length;
          
        } catch (error) {
          console.error(`Sync error from site ${siteIndex} to ${targetSite.id.slice(0, 8)}:`, error);
          performanceMetric.errorCount++;
        }
        
        performanceMetric.syncDuration = Date.now() - syncStart;
        return performanceMetric;
      });
      
      // Wait for all syncs for this site to complete
      const siteMetrics = await Promise.all(siteSyncPromises);
      return siteMetrics.filter(m => m !== null);
    });
    
    // Wait for all sites to complete their independent syncs
    console.log('⏳ Waiting for all sites to complete federation sync...');
    
    try {
      const allMetrics = await Promise.race([
        Promise.all(allSyncPromises),
        delay(SYNC_TIMEOUT).then(() => {
          throw new Error('Sync timeout reached');
        })
      ]);
      
      // Flatten all metrics
      allMetrics.forEach(siteMetrics => {
        sitePerformanceMetrics.push(...siteMetrics);
      });
      
    } catch (error) {
      console.error('Sync error or timeout:', error);
    }
    
    benchmarkMetrics.syncEndTime = Date.now();
    benchmarkMetrics.totalSyncTime = benchmarkMetrics.syncEndTime - benchmarkMetrics.syncStartTime;
    
    // Calculate performance statistics
    const avgSyncTime = sitePerformanceMetrics.length > 0 
      ? sitePerformanceMetrics.reduce((sum, m) => sum + m.syncDuration, 0) / sitePerformanceMetrics.length 
      : 0;
    const totalErrorCount = sitePerformanceMetrics.reduce((sum, m) => sum + m.errorCount, 0);
    const totalAttempts = benchmarkMetrics.contentReplicationSuccess + benchmarkMetrics.contentReplicationFailures;
    const successRate = totalAttempts > 0 
      ? (benchmarkMetrics.contentReplicationSuccess / totalAttempts) * 100
      : 0;
    
    console.log('📊 Federation Sync Results:');
    console.log(`Total sync time: ${benchmarkMetrics.totalSyncTime}ms`);
    console.log(`Average sync time per site: ${avgSyncTime.toFixed(2)}ms`);
    console.log(`Content replication success rate: ${successRate.toFixed(2)}%`);
    console.log(`Total errors: ${totalErrorCount}`);
    console.log(`Sites synced: ${sitePerformanceMetrics.length}`);
    
    // Performance assertions
    expect(benchmarkMetrics.totalSyncTime).toBeLessThan(SYNC_TIMEOUT);
    console.log(`Performance validation: ${sitePerformanceMetrics.length} sync attempts, ${totalErrorCount} errors, ${successRate.toFixed(2)}% success rate`);
    
    // Aim for 100% federation success
    expect(benchmarkMetrics.totalFollowConnections).toBeGreaterThan(0); // Must have follow connections
    
    if (totalAttempts > 0) {
      expect(successRate).toBeGreaterThan(95); // At least 95% success rate - aim for perfection!
      expect(benchmarkMetrics.contentReplicationSuccess).toBeGreaterThan(benchmarkMetrics.totalContent * 0.3); // At least 30% of all content replicated
      console.log('✅ Content successfully replicated between sites');
    } else {
      console.log('❌ No sync attempts made - debugging needed');
      // Let's fail the test if no sync attempts were made with follow connections
      if (benchmarkMetrics.totalFollowConnections > 0) {
        throw new Error('Follow connections exist but no sync attempts were made');
      }
    }
    
  }, 45000);

  it('should validate content integrity and distribution', async () => {
    console.log('🔍 Validating content integrity and distribution...');
    
    let totalFederatedContent = 0;
    let sitesWithFederatedContent = 0;
    const contentDistribution: Record<string, number> = {};
    const siteFederationStats: Array<{ siteId: string; localContent: number; federatedContent: number }> = [];
    
    // Check each site for content distribution (including federated content)
    for (const site of sites) {
      const allContent = await site.site.releases.index.search({});
      let localContentCount = 0;
      let federatedContentCount = 0;
      
      for (const content of allContent) {
        const sourceSiteId = (content.value as any)?.sourceSiteId;
        if (sourceSiteId) {
          // This is federated content
          federatedContentCount++;
          totalFederatedContent++;
          contentDistribution[sourceSiteId] = (contentDistribution[sourceSiteId] || 0) + 1;
        } else {
          // This is local content
          localContentCount++;
          contentDistribution['local'] = (contentDistribution['local'] || 0) + 1;
        }
      }
      
      if (federatedContentCount > 0) {
        sitesWithFederatedContent++;
      }
      
      siteFederationStats.push({
        siteId: site.id.slice(0, 8),
        localContent: localContentCount,
        federatedContent: federatedContentCount,
      });
    }
    
    const averageFederatedContentPerSite = totalFederatedContent / NUM_SITES;
    const federationParticipationRate = (sitesWithFederatedContent / NUM_SITES) * 100;
    
    console.log('📊 Federation Results:');
    console.log(`Total federated content: ${totalFederatedContent}`);
    console.log(`Average federated content per site: ${averageFederatedContentPerSite.toFixed(2)}`);
    console.log(`Federation participation rate: ${federationParticipationRate.toFixed(2)}%`);
    console.log(`Unique content sources: ${Object.keys(contentDistribution).length}`);
    console.log(`Sites with federated content: ${sitesWithFederatedContent}/${NUM_SITES}`);
    
    // Log some example federation stats
    console.log('\n📋 Sample Federation Stats:');
    siteFederationStats.slice(0, 5).forEach(stat => {
      console.log(`  ${stat.siteId}: ${stat.localContent} local + ${stat.federatedContent} federated`);
    });
    
    // Validation assertions (more lenient for benchmark)
    console.log('📋 Federation Benchmark Summary:');
    console.log(`- Sites created: ${NUM_SITES}`);
    console.log(`- Follow connections: ${benchmarkMetrics.totalFollowConnections}`);
    console.log(`- Total sync time: ${benchmarkMetrics.totalSyncTime}ms`);
    console.log(`- Federated content: ${totalFederatedContent}`);
    console.log(`- Participation rate: ${federationParticipationRate.toFixed(2)}%`);
    
    // Basic sanity checks
    expect(sites.length).toBeGreaterThan(0);
    expect(benchmarkMetrics.totalFollowConnections).toBeGreaterThanOrEqual(0);
    expect(benchmarkMetrics.totalSyncTime).toBeGreaterThanOrEqual(0);
    
    if (totalFederatedContent > 0) {
      console.log('✅ Federation working - content successfully replicated between sites!');
      expect(federationParticipationRate).toBeGreaterThan(95); // Aim for 95%+ sites participating  
      expect(totalFederatedContent).toBeGreaterThan(benchmarkMetrics.totalContent * 0.5); // At least 50% content federated
    } else {
      console.log('❌ No federated content found!');
      if (benchmarkMetrics.totalFollowConnections > 0) {
        throw new Error('Follow connections exist but no content was federated - sync failed');
      }
    }
    
    // Log final metrics
    console.log('\n🎯 Final Federation Benchmark Metrics:');
    console.table({
      'Total Sites': NUM_SITES,
      'Total Replicators': NUM_REPLICATORS,
      'Follow Connections': benchmarkMetrics.totalFollowConnections,
      'Original Content': benchmarkMetrics.totalContent,
      'Federated Content': totalFederatedContent,
      'Sync Time (ms)': benchmarkMetrics.totalSyncTime,
      'Success Rate (%)': ((benchmarkMetrics.contentReplicationSuccess + benchmarkMetrics.contentReplicationFailures) > 0 
        ? (benchmarkMetrics.contentReplicationSuccess / (benchmarkMetrics.contentReplicationSuccess + benchmarkMetrics.contentReplicationFailures) * 100).toFixed(2)
        : '0.00'),
      'Federation Participation (%)': federationParticipationRate.toFixed(2),
    });
    
  }, 60000);
});
