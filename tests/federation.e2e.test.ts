import { waitForResolved } from '@peerbit/time';
  import { Site } from '../src/programs/site';
  import { LensService } from '../src/services/lens';
  import { TestSession } from '@peerbit/test-utils';
  // Use describe to group all federation tests together
  describe('Federation E2E Test Suite', () => {
    let session: TestSession;
    let serviceA: LensService;
    let serviceB: LensService;
    let siteAAddress: string;

    // beforeAll runs once before any of the tests in this file
    beforeAll(async () => {
      session = await TestSession.connected(2);

      serviceA = new LensService({ peerbit: session.peers[0] });
      serviceB = new LensService({ peerbit: session.peers[1] });
      
      // 4. Create and open the sites. This part remains the same.
      const siteA = new Site(serviceA.peerbit!.identity.publicKey);
      const siteB = new Site(serviceB.peerbit!.identity.publicKey);
      
      // Both services need federation enabled to broadcast and listen.
      await serviceA.openSite(siteA, { federate: true });
      await serviceB.openSite(siteB, { federate: true });

      siteAAddress = serviceA.siteProgram!.address;

    }, 90000);

    // afterAll runs once after all tests in this file have completed
    afterAll(async () => {
      await serviceA.stop();
      await serviceB.stop();
      await session.stop();
    });
    
    test('PHASE 1: should sync historical data upon subscription', async () => {
      const BATCH_SIZE = 100;
      
      // 1. Populate Site A with historical data
      for (let i = 0; i < BATCH_SIZE; i++) {
        await serviceA.addRelease({
          name: `Historical Release #${i}`,
          categoryId: 'benchmark-historical',
          contentCID: `cid_historical_${i}`,
          postedBy: serviceA.peerbit!.identity.publicKey,
        });
      }

      const initialSizeA = await serviceA.siteProgram!.releases.index.getSize();
      expect(initialSizeA).toBe(BATCH_SIZE);
      
      // 2. Site B subscribes to Site A
      await serviceB.addSubscription({
        siteAddress: siteAAddress,
        postedBy: serviceB.peerbit!.identity.publicKey,
      });
      
      // 3. Wait for synchronization and assert
      await waitForResolved(async () => {
        const sizeB = await serviceB.siteProgram!.releases.index.getSize();
        expect(sizeB).toBe(BATCH_SIZE);
      });
    }, 60000);

    test('PHASE 2: should sync live updates (additions)', async () => {
      const initialSize = await serviceA.siteProgram!.releases.index.getSize();
      
      // 1. Add a new release to Site A
      await serviceA.addRelease({
        name: 'Live Update Release',
        categoryId: 'benchmark-live',
        contentCID: 'cid_live_update',
        postedBy: serviceA.peerbit!.identity.publicKey,
      });
      
      const expectedSize = initialSize + 1;
      expect(await serviceA.siteProgram!.releases.index.getSize()).toBe(expectedSize);
      
      // 2. Wait for the live update to propagate and assert
      await waitForResolved(async () => {
        const sizeB = await serviceB.siteProgram!.releases.index.getSize();
        expect(sizeB).toBe(expectedSize);
      });
    }, 30000);

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
    }, 30000);

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
    }, 30000);
  });