// __tests__/federation.test.ts

import { waitForResolved } from '@peerbit/time';
import { Site } from '../src/programs/site'; // Adjust path to your source files
import { LensService } from '../src/services/lens'; // Adjust path to your source files
import type { Peerbit } from 'peerbit';

// A helper function to create a new Site instance.
const createNewSite = (client: Peerbit) => {
  const rootTrust = client.identity.publicKey;
  return new Site(rootTrust);
};

// Use describe to group all federation tests together
describe('Federation E2E Test Suite', () => {
  let serviceA: LensService;
  let serviceB: LensService;
  let siteAAddress: string;

  // beforeAll runs once before any of the tests in this file
  beforeAll(async () => {
    // Suppress console.log during tests for cleaner output, but keep errors
    // You can also use jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Initialize services
    serviceA = new LensService({ debug: false }); // Disable debug for cleaner test output
    serviceB = new LensService({ debug: false });
    await serviceA.init();
    await serviceB.init();
    
    // Setup sites
    await serviceA.openSite(createNewSite(serviceA.client!), { federate: false });
    await serviceB.openSite(createNewSite(serviceB.client!), { federate: true });

    siteAAddress = serviceA.siteProgram!.address;

    // Connect peers
    await serviceA.client!.dial(serviceB.client!.getMultiaddrs());
  });

  // afterAll runs once after all tests in this file have completed
  afterAll(async () => {
    await serviceA?.stop();
    await serviceB?.stop();
  });
  
  // Test each phase in order using 'test' or 'it'
  test('PHASE 1: should sync historical data upon subscription', async () => {
    const BATCH_SIZE = 100;
    
    // 1. Populate Site A with historical data
    for (let i = 0; i < BATCH_SIZE; i++) {
      await serviceA.addRelease({
        name: `Historical Release #${i}`,
        categoryId: 'benchmark-historical',
        contentCID: `cid_historical_${i}`,
        postedBy: serviceA.client!.identity.publicKey,
				siteAddress: siteAAddress,
      });
    }

    const initialSizeA = await serviceA.siteProgram!.releases.index.getSize();
    expect(initialSizeA).toBe(BATCH_SIZE);
    
    // 2. Site B subscribes to Site A
    await serviceB.addSubscription({
      siteAddress: siteAAddress,
      postedBy: serviceB.client!.identity.publicKey,
    });
    
    // 3. Wait for synchronization and assert
    await waitForResolved(async () => {
      const sizeB = await serviceB.siteProgram!.releases.index.getSize();
      expect(sizeB).toBe(BATCH_SIZE);
    });
  });

  test('PHASE 2: should sync live updates (additions)', async () => {
    const initialSize = await serviceA.siteProgram!.releases.index.getSize();
    
    // 1. Add a new release to Site A
    await serviceA.addRelease({
      name: 'Live Update Release',
      categoryId: 'benchmark-live',
      contentCID: 'cid_live_update',
      postedBy: serviceA.client!.identity.publicKey,
			siteAddress: siteAAddress,
    });
    
    const expectedSize = initialSize + 1;
    expect(await serviceA.siteProgram!.releases.index.getSize()).toBe(expectedSize);
    
    // 2. Wait for the live update to propagate and assert
    await waitForResolved(async () => {
      const sizeB = await serviceB.siteProgram!.releases.index.getSize();
      expect(sizeB).toBe(expectedSize);
    });
  });

  test('PHASE 3: should sync live updates (deletions)', async () => {
    const initialSize = await serviceA.siteProgram!.releases.index.getSize();
    const releases = await serviceA.getReleases();
    const releaseToDelete = releases[releases.length - 1]; // Delete the last added release
    
    // 1. Delete the release from Site A
    await serviceA.deleteRelease(releaseToDelete.id);

    const expectedSize = initialSize - 1;
    expect(await serviceA.siteProgram!.releases.index.getSize()).toBe(expectedSize);
    
    // 2. Wait for the deletion to propagate and assert
    await waitForResolved(async () => {
      const sizeB = await serviceB.siteProgram!.releases.index.getSize();
      expect(sizeB).toBe(expectedSize);
    });
  });

  test('PHASE 4: should clean up federated data on unsubscription', async () => {
    // 1. Site B unsubscribes from Site A
    await serviceB.deleteSubscription({ siteAddress: siteAAddress });
    
    const expectedCleanupSize = 0; // All federated data should be gone from Site B

    // 2. Wait for cleanup to complete and assert
    await waitForResolved(async () => {
      const sizeB = await serviceB.siteProgram!.releases.index.getSize();
      expect(sizeB).toBe(expectedCleanupSize);
    });
    
    // 3. Assert that Site A's data remains untouched
    const sizeA = await serviceA.siteProgram!.releases.index.getSize();
    expect(sizeA).toBeGreaterThan(0);
  });
});