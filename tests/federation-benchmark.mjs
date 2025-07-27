import { waitForResolved } from '@peerbit/time';
import { Site, LensService } from '../dist/index.mjs';

/**
 * A helper function to create a new Site instance.
 * @param {Peerbit} peerbit - The peerbit client instance.
 * @returns {Site} A new Site object.
 */
const createNewSite = (peerbit) => {
  // The peerbit's public key is used as the root of trust for the new site's access control.
  const rootAdmin = peerbit.identity.publicKey;
  return new Site({ rootAdmin });
};

/**
 * Main test execution function.
 */
const run = async () => {
  console.log('🚀 Initializing services A and B...');
  const serviceA = new LensService({ debug: true, customPrefix: '[Service A]' });
  const serviceB = new LensService({ debug: true, customPrefix: '[Service B]' });
  
  try {
    await serviceA.init();
    await serviceB.init();
    
    // --- SETUP ---
    console.log('\n-'.repeat(20) + ' SETUP ' + '-'.repeat(20));
    console.log('🏗️ Opening Site A (source) and Site B (follower)...');

    await serviceA.openSite(createNewSite(serviceA.peerbit), { federate: false });
    await serviceB.openSite(createNewSite(serviceB.peerbit), { federate: true });

    const siteAAddress = serviceA.siteProgram.address;

    console.log(`- Site A Address: ${siteAAddress}`);
    console.log(`- Site B Address: ${serviceB.siteProgram.address}`);

    console.log('🔗 Connecting peers...');
    await serviceA.peerbit?.dial(serviceB.peerbit.getMultiaddrs());

    // --- PHASE 1: HISTORICAL DATA SYNC ---
    console.log('\n' + '-'.repeat(20) + ' PHASE 1: HISTORICAL SYNC ' + '-'.repeat(20));
    const BATCH_SIZE = 100;
    const releasesToAdd = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      releasesToAdd.push({
        name: `Historical Release #${i}`,
        categoryId: 'benchmark-historical',
        contentCID: `cid_historical_${i}`,
      });
    }

    console.log(`📝 Populating Site A with ${BATCH_SIZE} releases...`);
    console.time(`add-${BATCH_SIZE}-releases`);
    for (const release of releasesToAdd) {
      await serviceA.addRelease(release);
    }
    console.timeEnd(`add-${BATCH_SIZE}-releases`);
    const initialSizeA = await serviceA.siteProgram.releases.index.getSize();
    console.log(`Initial size of Site A's releases: ${initialSizeA}`);
    
    if(initialSizeA !== BATCH_SIZE) {
        throw new Error(`Site A population failed. Expected ${BATCH_SIZE}, got ${initialSizeA}`);
    }


    console.log('\n🤝 Site B subscribing to Site A...');
    console.time('federation-initial-sync-benchmark');

    await serviceB.addSubscription({
      to: siteAAddress,
    });

    await waitForResolved(
      async () => {
        const sizeB = await serviceB.siteProgram.releases.index.getSize();
        console.log(`- Syncing... (Site A: ${initialSizeA}, Site B: ${sizeB})`);
        if (sizeB !== BATCH_SIZE) {
          throw new Error(`Sites not synced yet. Expected ${BATCH_SIZE}, got ${sizeB}.`);
        }
      },
      { timeout: 60000, delayInterval: 1000 },
    );

    console.timeEnd('federation-initial-sync-benchmark');
    console.log('✅ PHASE 1 COMPLETE: Historical data has been successfully federated.');

    // --- PHASE 2: LIVE UPDATE SYNC ---
    console.log('\n' + '-'.repeat(20) + ' PHASE 2: LIVE UPDATE ' + '-'.repeat(20));
    console.log('➕ Adding a new release to Site A to test live federation...');
    console.time('live-update-latency');

    const liveRelease = await serviceA.addRelease({
      name: 'Live Update Release',
      categoryId: 'benchmark-live',
      contentCID: 'cid_live_update',
    });

    const expectedLiveSize = BATCH_SIZE + 1;

    await waitForResolved(
      async () => {
        const sizeB = await serviceB.siteProgram.releases.index.getSize();
        console.log(`- Waiting for live update... (Site B size: ${sizeB}, Expected: ${expectedLiveSize})`);
        if (sizeB !== expectedLiveSize) {
          throw new Error(`Live update not received. Expected ${expectedLiveSize}, got ${sizeB}.`);
        }
      },
      { timeout: 30000, delayInterval: 500 },
    );

    console.timeEnd('live-update-latency');
    console.log('✅ PHASE 2 COMPLETE: Live update was successfully federated.');

    // --- PHASE 3: DELETE PROPAGATION ---
    console.log('\n' + '-'.repeat(20) + ' PHASE 3: DELETE PROPAGATION ' + '-'.repeat(20));
    console.log('🗑️ Deleting a release from Site A to test delete federation...');
    console.time('delete-propagation-latency');

    await serviceA.deleteRelease(liveRelease.id);
    const expectedDeleteSize = BATCH_SIZE;

    await waitForResolved(
      async () => {
        const sizeB = await serviceB.siteProgram.releases.index.getSize();
        console.log(`- Waiting for delete propagation... (Site B size: ${sizeB}, Expected: ${expectedDeleteSize})`);
        if (sizeB !== expectedDeleteSize) {
          throw new Error(`Delete not propagated. Expected ${expectedDeleteSize}, got ${sizeB}.`);
        }
      },
      { timeout: 30000, delayInterval: 500 },
    );

    console.timeEnd('delete-propagation-latency');
    console.log('✅ PHASE 3 COMPLETE: Deletion was successfully federated.');


    // --- PHASE 4: UNSUBSCRIPTION AND CLEANUP ---
    console.log('\n' + '-'.repeat(20) + ' PHASE 4: UNSUBSCRIPTION & CLEANUP ' + '-'.repeat(20));
    console.log('🔌 Site B unsubscribing from Site A...');
    console.time('unsubscription-cleanup-latency');

    await serviceB.deleteSubscription({ to: siteAAddress });
    
    const expectedCleanupSize = 0; // After unsubscribing, all federated data should be gone.

    await waitForResolved(
      async () => {
        const sizeB = await serviceB.siteProgram.releases.index.getSize();
        console.log(`- Waiting for cleanup... (Site B size: ${sizeB}, Expected: ${expectedCleanupSize})`);
        if (sizeB !== expectedCleanupSize) {
          throw new Error(`Cleanup failed on Site B. Expected ${expectedCleanupSize}, got ${sizeB}.`);
        }
      },
      { timeout: 30000, delayInterval: 500 },
    );

    console.timeEnd('unsubscription-cleanup-latency');
    console.log('✅ PHASE 4 COMPLETE: Unsubscription and cleanup successful.');


    console.log('\n🎉 Federation Test Successful!');
  } catch(e) {
      console.error('\n❌ Federation Test FAILED.');
      console.error(e);
      process.exit(1); // Exit with error code to fail CI/CD pipelines
  }
  finally {
    console.log('\n🛑 Tearing down services...');
    await serviceA.stop();
    await serviceB.stop();
  }
};

run();