import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { waitForResolved } from '@peerbit/time';
import { AccessError } from '@peerbit/crypto';
import { Site } from '../src/programs/site/program';
import { SiteRegistry } from '../src/programs/site-registry/program';
import type { SiteRegistration } from '../src/programs/site-registry/schemas';
import { SiteManifest } from '../src/programs/site-registry/schemas';

describe('SiteRegistry Program', () => {
  let session: TestSession;
  let ownerClient: ProgramClient, otherClient: ProgramClient;
  let ownerSite: Site;

  // --- ONE-TIME SETUP for clients and a shared site ---
  beforeAll(async () => {
    session = await TestSession.connected(2);
    [ownerClient, otherClient] = session.peers;

    ownerSite = new Site({ rootAdmin: ownerClient.identity.publicKey });
    await ownerClient.open(ownerSite);
  }, 15000);

  // --- ONE-TIME TEARDOWN ---
  afterAll(async () => {
    if (ownerSite && !ownerSite.closed) {
      await ownerSite.close();
    }
    await session.stop();
  });

  // SCENARIO 1: A user successfully publishes, updates, and deletes a site.
  describe('Lifecycle of a Registration', () => {
    let registry: SiteRegistry;
    let otherRegistry: SiteRegistry;
    let registration: SiteRegistration; // This will hold the state across tests

    // Setup the scenario once
    beforeAll(async () => {
      registry = new SiteRegistry();
      await ownerClient.open(registry);
      otherRegistry = await otherClient.open<SiteRegistry>(registry.address);
      await registry.waitFor(otherClient.peerId);
    });

    // Tear down the scenario once
    afterAll(async () => {
      if (registry && !registry.closed) await registry.close();
      if (otherRegistry && !otherRegistry.closed) await otherRegistry.close();
    });

    it('Step 1: The site owner publishes their site', async () => {
      const manifest = new SiteManifest({ name: 'My Awesome Site' });
      registration = await registry.publishSite(ownerSite, manifest);

      expect(registration).toBeDefined();
      expect(registration.owner.equals(ownerClient.identity.publicKey)).toBe(true);

      const fetched = await registry.registrations.index.get(registration.id);
      expect(fetched).toBeDefined();
    });

    it('Step 2: The published registration replicates to another peer', async () => {
      await waitForResolved(async () => {
        const fetched = await otherRegistry.registrations.index.get(registration.id);
        expect(fetched).toBeDefined();
        expect(fetched?.manifest.name).toEqual('My Awesome Site');
      });
    });

    it('Step 3: The owner updates the manifest', async () => {
      const newManifest = new SiteManifest({ name: 'Updated Name' });
      await registry.updateManifest(ownerSite.address, newManifest);

      const fetched = await registry.registrations.index.get(registration.id);
      expect(fetched?.manifest.name).toEqual('Updated Name');

      // Verify the update replicated
      await waitForResolved(async () => {
        const fetchedOnOtherPeer = await otherRegistry.registrations.index.get(registration.id);
        expect(fetchedOnOtherPeer?.manifest.name).toEqual('Updated Name');
      });
    });

    it('Step 4: The owner deletes their registration', async () => {
      await registry.registrations.del(registration.id);

      const sizeAfter = await registry.registrations.index.getSize();
      expect(sizeAfter).toEqual(0);

      // Verify deletion replicated
      await waitForResolved(async () => {
        const fetchedOnOtherPeer = await otherRegistry.registrations.index.get(registration.id);
        expect(fetchedOnOtherPeer).toBeUndefined();
      });
    });
  });


  // SCENARIO 2: Testing access control rules with another user.
  describe('Access Control', () => {
    let registry: SiteRegistry;
    let otherRegistry: SiteRegistry;
    let registration: SiteRegistration; // State for this scenario

    beforeAll(async () => {
      registry = new SiteRegistry();
      await ownerClient.open(registry);
      otherRegistry = await otherClient.open<SiteRegistry>(registry.address);
      await registry.waitFor(otherClient.peerId);

      // Create a registration to test against
      const manifest = new SiteManifest({ name: 'Protected Site' });
      registration = await registry.publishSite(ownerSite, manifest);

      // Ensure it's replicated before tests start
      await waitForResolved(async () => {
        expect(await otherRegistry.registrations.index.get(registration.id)).toBeDefined();
      });
    });

    afterAll(async () => {
      if (registry && !registry.closed) await registry.close();
      if (otherRegistry && !otherRegistry.closed) await otherRegistry.close();
    });


    it('a non-owner cannot publish a site on behalf of the owner', async () => {
      const manifest = new SiteManifest({ name: 'Imposter Site' });
      await expect(otherRegistry.publishSite(ownerSite, manifest))
        .rejects.toThrow('Only the site owner can publish its registration.');
    });

    it('a non-owner cannot update the manifest', async () => {
      const newManifest = new SiteManifest({ name: 'Malicious Update' });
      await expect(otherRegistry.updateManifest(ownerSite.address, newManifest))
        .rejects.toThrow(`Site registration for address ${ownerSite.address} by this owner not found.`);
    });

    it('a non-owner cannot delete a registration', async () => {
      await expect(otherRegistry.registrations.del(registration.id))
        .rejects.toThrow(AccessError);
    });
  });
});