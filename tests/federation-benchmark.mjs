import { waitForResolved } from '@peerbit/time';
import { LensService, Site } from '../dist/index.mjs';

/**
 * A helper function to create a new Site instance.
 * The creator of the site is set as the root trust, giving them initial administrative rights.
 * @param {LensService} service - The service instance that will own the new site.
 * @returns {Promise<Site>} A new Site object.
 */
const createNewSite = async (service) => {
    // The client's public key is used as the root of trust for the new site's access control.
    const rootTrust = service.client.identity.publicKey;
    return new Site(rootTrust);
};

/**
 * Main test execution function.
 */
const run = async () => {
    console.log('🚀 Initializing services A and B...');
    const serviceA = new LensService({ debug: true });
    const serviceB = new LensService({ debug: true });
    await serviceA.init();
    await serviceB.init();
    
    let serviceC; // Declare serviceC here to access it in the finally block

    try {
        // --- SETUP ---
        console.log('\n-'.repeat(20) + ' SETUP ' + '-'.repeat(20));
        console.log('🏗️ Opening Site A (source) and Site B (follower)...');
        
        await serviceA.openSite(await createNewSite(serviceA), { federate: false });
        await serviceB.openSite(await createNewSite(serviceB), { federate: true });

        const siteAAddress = await serviceA.getSiteAddress();
        const siteBAddress = await serviceB.getSiteAddress();

        console.log(`- Site A Address: ${siteAAddress}`);
        console.log(`- Site B Address: ${siteBAddress}`);
        
        console.log('🔗 Connecting peers...');
        await serviceA.client?.dial(serviceB.client.getMultiaddrs());

        // --- PHASE 1: HISTORICAL DATA SYNC ---
        console.log('\n' + '-'.repeat(20) + ' PHASE 1: HISTORICAL SYNC ' + '-'.repeat(20));
        const BATCH_SIZE_A = 100;
        const releasesToAddA = [];
        for (let i = 0; i < BATCH_SIZE_A; i++) {
            releasesToAddA.push({
                name: `Historical Release #${i}`,
                categoryId: 'benchmark-historical',
                contentCID: `cid_historical_${i}`,
                siteAddress: siteAAddress,
            });
        }

        console.log(`📝 Populating Site A with ${BATCH_SIZE_A} releases...`);
        console.time(`add-${BATCH_SIZE_A}-releases`);
        for (const release of releasesToAddA) {
            await serviceA.addRelease(release);
        }
        console.timeEnd(`add-${BATCH_SIZE_A}-releases`);
        console.log(`Initial size of Site A's releases: ${await serviceA.siteProgram.releases.index.getSize()}`);

        console.log('\n🤝 Site B subscribing to Site A...');
        console.time('federation-initial-sync-benchmark');
        
        await serviceB.addSubscription({ siteAddress: siteAAddress });

        await waitForResolved(async () => {
            const sizeA = await serviceA.siteProgram.releases.index.getSize();
            const sizeB = await serviceB.siteProgram.releases.index.getSize();
            console.log(`- Syncing... (Site A: ${sizeA}, Site B: ${sizeB})`);
            if (sizeB !== BATCH_SIZE_A) {
                throw new Error(`Sites not synced yet. Expected ${BATCH_SIZE_A}, got ${sizeB}.`);
            }
        }, { timeout: 600000, delayInterval: 2000 });

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
            siteAddress: siteAAddress,
        });

        const expectedLiveSize = BATCH_SIZE_A + 1;

        await waitForResolved(async () => {
            const sizeB = await serviceB.siteProgram.releases.index.getSize();
            console.log(`- Waiting for live update... (Site B size: ${sizeB}, Expected: ${expectedLiveSize})`);
            if (sizeB !== expectedLiveSize) {
                throw new Error(`Live update not received. Expected ${expectedLiveSize}, got ${sizeB}.`);
            }
        }, { timeout: 30000, delayInterval: 500 });

        console.timeEnd('live-update-latency');
        console.log('✅ PHASE 2 COMPLETE: Live update was successfully federated.');

        // --- PHASE 3: DELETE PROPAGATION ---
        console.log('\n' + '-'.repeat(20) + ' PHASE 3: DELETE PROPAGATION ' + '-'.repeat(20));
        console.log('🗑️ Deleting a release from Site A to test delete federation...');
        console.time('delete-propagation-latency');
        
        await serviceA.deleteRelease({ id: liveRelease.id });
        const expectedDeleteSize = BATCH_SIZE_A;

        await waitForResolved(async () => {
            const sizeB = await serviceB.siteProgram.releases.index.getSize();
            console.log(`- Waiting for delete propagation... (Site B size: ${sizeB}, Expected: ${expectedDeleteSize})`);
            if (sizeB !== expectedDeleteSize) {
                throw new Error(`Delete not propagated. Expected ${expectedDeleteSize}, got ${sizeB}.`);
            }
        }, { timeout: 30000, delayInterval: 500 });

        console.timeEnd('delete-propagation-latency');
        console.log('✅ PHASE 3 COMPLETE: Deletion was successfully federated.');

        // --- PHASE 4: TRANSITIVE FEDERATION (A -> B -> C) ---
        console.log('\n' + '-'.repeat(20) + ' PHASE 4: TRANSITIVE FEDERATION ' + '-'.repeat(20));
        console.log('🚀 Initializing service C...');
        serviceC = new LensService({ debug: true });
        await serviceC.init();
        await serviceC.openSite(await createNewSite(serviceC), { federate: true });
        console.log(`- Site C Address: ${await serviceC.getSiteAddress()}`);
        console.log('🔗 Connecting C to B...');
        await serviceC.client?.dial(serviceB.client.getMultiaddrs());

        const BATCH_SIZE_B = 10;
        console.log(`📝 Populating Site B with ${BATCH_SIZE_B} unique releases...`);
        for (let i = 0; i < BATCH_SIZE_B; i++) {
            await serviceB.addRelease({
                name: `Site B Release #${i}`,
                categoryId: 'benchmark-site-b',
                contentCID: `cid_site_b_${i}`,
                siteAddress: siteBAddress,
            });
        }
        
        console.log('\n🤝 Site C subscribing to Site B...');
        console.time('transitive-federation-sync-benchmark');
        await serviceC.addSubscription({ siteAddress: siteBAddress });

        const expectedTotalSize = BATCH_SIZE_A + BATCH_SIZE_B;

        await waitForResolved(async () => {
            const sizeB = await serviceB.siteProgram.releases.index.getSize();
            const sizeC = await serviceC.siteProgram.releases.index.getSize();
            console.log(`- Syncing... (Site B: ${sizeB}, Site C: ${sizeC}, Expected Total: ${expectedTotalSize})`);
            if (sizeC !== expectedTotalSize) {
                throw new Error(`Transitive sync not complete. Expected ${expectedTotalSize}, got ${sizeC}.`);
            }
        }, { timeout: 600000, delayInterval: 2000 });

        console.timeEnd('transitive-federation-sync-benchmark');
        console.log('✅ PHASE 4 COMPLETE: Transitive federation successful.');
        
        // --- PHASE 5: UNSUBSCRIPTION AND CLEANUP ---
        console.log('\n' + '-'.repeat(20) + ' PHASE 5: UNSUBSCRIPTION & CLEANUP ' + '-'.repeat(20));
        console.log('🔌 Site B unsubscribing from Site A...');
        console.time('unsubscription-cleanup-latency');
        
        await serviceB.deleteSubscription({ siteAddress: siteAAddress });

        await waitForResolved(async () => {
            const sizeB = await serviceB.siteProgram.releases.index.getSize();
            console.log(`- Waiting for cleanup... (Site B size: ${sizeB}, Expected: ${BATCH_SIZE_B})`);
            if (sizeB !== BATCH_SIZE_B) {
                throw new Error(`Cleanup failed on Site B. Expected ${BATCH_SIZE_B}, got ${sizeB}.`);
            }
        }, { timeout: 30000, delayInterval: 500 });

        console.timeEnd('unsubscription-cleanup-latency');
        console.log('✅ PHASE 5 COMPLETE: Unsubscription and cleanup successful.');

        
        console.log('\n🎉 Federation Test Successful!');

    } finally {
        console.log('\n🛑 Tearing down services...');
        await serviceA.stop();
        await serviceB.stop();
        if (serviceC) {
            await serviceC.stop();
        }
    }
};

run().catch(console.error);