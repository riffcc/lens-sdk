import { delay } from '@peerbit/time';
import { LensService } from '../src/service';

describe('Federation Index Performance Benchmark', () => {
  let service: LensService;
  let siteId: string;

  beforeAll(async () => {
    console.log('\n=== Federation Index Performance Benchmark ===\n');
    
    // Initialize service without Peerbit (let it create its own)
    service = new LensService();
    await service.init();
    
    // Get site address from environment
    siteId = process.env.VITE_SITE_ADDRESS;
    if (!siteId) {
      throw new Error('VITE_SITE_ADDRESS not set in environment');
    }
    console.log(`Opening site: ${siteId}`);
    
    // Connect to bootstrappers if provided
    const bootstrappers = process.env.VITE_BOOTSTRAPPERS;
    if (bootstrappers) {
      const bootstrapperList = bootstrappers.split(',').map(b => b.trim());
      console.log('Connecting to bootstrappers...');
      
      for (const bootstrapper of bootstrapperList) {
        try {
          await service.dial(bootstrapper);
        } catch (err) {
          console.warn(`Failed to connect to bootstrapper ${bootstrapper}:`, err.message);
        }
      }
    }
    
    await service.openSite(siteId, {
      releasesArgs: { replicate: true },
      federationIndexArgs: { replicate: true }
    });
    
    // Give it a moment to sync
    await delay(1000);
  }, 60000);

  afterAll(async () => {
    await service?.closeSite();
    await service?.stop();
  });

  it('should benchmark featured content retrieval speeds', async () => {
    console.log('\n--- Benchmarking Federation Index Query Performance ---\n');
    
    // Warmup query
    console.log('🔥 Warming up indexes...');
    await service.getFederationIndexFeatured(1);
    
    // Test 1: Single featured item retrieval
    console.log('\n📊 Test 1: Single Featured Item Retrieval');
    const singleItemTimes: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const results = await service.getFederationIndexFeatured(1);
      const end = performance.now();
      const duration = end - start;
      singleItemTimes.push(duration);
      console.log(`  Run ${i + 1}: ${duration.toFixed(3)}ms - Found ${results.length} items`);
    }
    
    const avgSingle = singleItemTimes.reduce((a, b) => a + b, 0) / singleItemTimes.length;
    const minSingle = Math.min(...singleItemTimes);
    const maxSingle = Math.max(...singleItemTimes);
    
    console.log(`\n  ✅ Single Item Stats:`);
    console.log(`     Average: ${avgSingle.toFixed(3)}ms`);
    console.log(`     Min: ${minSingle.toFixed(3)}ms`);
    console.log(`     Max: ${maxSingle.toFixed(3)}ms`);
    
    // Test 2: Batch retrieval (50 items)
    console.log('\n📊 Test 2: Batch Retrieval (50 items)');
    const batchTimes: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const results = await service.getFederationIndexFeatured(50);
      const end = performance.now();
      const duration = end - start;
      batchTimes.push(duration);
      console.log(`  Run ${i + 1}: ${duration.toFixed(3)}ms - Found ${results.length} items`);
    }
    
    const avgBatch = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    const minBatch = Math.min(...batchTimes);
    const maxBatch = Math.max(...batchTimes);
    
    console.log(`\n  ✅ Batch Retrieval Stats:`);
    console.log(`     Average: ${avgBatch.toFixed(3)}ms`);
    console.log(`     Min: ${minBatch.toFixed(3)}ms`);
    console.log(`     Max: ${maxBatch.toFixed(3)}ms`);
    
    // Test 3: Direct index access (bypassing service layer)
    console.log('\n📊 Test 3: Direct Federation Index Access');
    const directTimes: number[] = [];
    const siteProgram = service['siteProgram'];
    
    if (siteProgram?.federationIndex) {
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const results = await siteProgram.federationIndex.getAllEntries();
        const end = performance.now();
        const duration = end - start;
        directTimes.push(duration);
        console.log(`  Run ${i + 1}: ${duration.toFixed(3)}ms - Found ${results.length} items`);
      }
      
      const avgDirect = directTimes.reduce((a, b) => a + b, 0) / directTimes.length;
      const minDirect = Math.min(...directTimes);
      const maxDirect = Math.max(...directTimes);
      
      console.log(`\n  ✅ Direct Access Stats:`);
      console.log(`     Average: ${avgDirect.toFixed(3)}ms`);
      console.log(`     Min: ${minDirect.toFixed(3)}ms`);
      console.log(`     Max: ${maxDirect.toFixed(3)}ms`);
    }
    
    // Test 4: Comparison with traditional release store
    console.log('\n📊 Test 4: Comparison with Traditional Release Store');
    const releaseTimes: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const results = await service.getReleases({ limit: 1 });
      const end = performance.now();
      const duration = end - start;
      releaseTimes.push(duration);
      console.log(`  Run ${i + 1}: ${duration.toFixed(3)}ms - Found ${results.length} releases`);
    }
    
    const avgRelease = releaseTimes.reduce((a, b) => a + b, 0) / releaseTimes.length;
    
    console.log(`\n  ✅ Release Store Stats:`);
    console.log(`     Average: ${avgRelease.toFixed(3)}ms`);
    
    // Summary
    console.log('\n=== PERFORMANCE SUMMARY ===');
    console.log(`Federation Index (single): ${avgSingle.toFixed(3)}ms`);
    console.log(`Federation Index (batch): ${avgBatch.toFixed(3)}ms`);
    if (directTimes.length > 0) {
      const avgDirect = directTimes.reduce((a, b) => a + b, 0) / directTimes.length;
      console.log(`Federation Index (direct): ${avgDirect.toFixed(3)}ms`);
    }
    console.log(`Traditional Release Store: ${avgRelease.toFixed(3)}ms`);
    console.log(`\nSpeedup vs Release Store: ${(avgRelease / avgSingle).toFixed(2)}x`);
    
    // Performance assertions
    expect(avgSingle).toBeLessThan(100); // Should be under 100ms
    expect(minSingle).toBeLessThan(50);  // Best case under 50ms
  });

  it('should benchmark content by specific CID', async () => {
    console.log('\n--- Benchmarking Specific CID Lookup ---\n');
    
    // First get a CID to search for
    const featured = await service.getFederationIndexFeatured(1);
    if (featured.length === 0) {
      console.log('No featured content found to benchmark');
      return;
    }
    
    const targetCID = featured[0].contentCID;
    console.log(`🎯 Target CID: ${targetCID}`);
    
    const cidTimes: number[] = [];
    const siteProgram = service['siteProgram'];
    
    if (siteProgram?.federationIndex) {
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const allEntries = await siteProgram.federationIndex.getAllEntries();
        const found = allEntries.find(e => e.contentCID === targetCID);
        const end = performance.now();
        const duration = end - start;
        cidTimes.push(duration);
        console.log(`  Run ${i + 1}: ${duration.toFixed(3)}ms - Found: ${found ? 'Yes' : 'No'}`);
      }
      
      const avgCid = cidTimes.reduce((a, b) => a + b, 0) / cidTimes.length;
      const minCid = Math.min(...cidTimes);
      
      console.log(`\n  ✅ CID Lookup Stats:`);
      console.log(`     Average: ${avgCid.toFixed(3)}ms`);
      console.log(`     Min: ${minCid.toFixed(3)}ms`);
    }
  });
});