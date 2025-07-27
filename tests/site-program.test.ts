import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { Documents } from '@peerbit/document';
import { RoleBasedccessController } from '../src/programs/acl/rbac/program';
import { defaultSiteContentCategories } from '../src/programs/site/defaults';
import { waitForResolved } from '@peerbit/time';

describe('Site Program', () => {
  let session: TestSession;
  let ownerClient: ProgramClient, noOwnerClient: ProgramClient;

  // Setup a test session with one peer before all tests
  beforeAll(async () => {
    session = await TestSession.connected(2);
    ownerClient = session.peers[0];
    noOwnerClient = session.peers[1];

  });

  // Stop the session after all tests are done
  afterAll(async () => {
    await session.stop();
  });

  describe('initialization and properties', () => {
    let siteProgram: Site;

    // Open a new site before each test in this block
    beforeEach(async () => {
      siteProgram = new Site({ rootAdmin: ownerClient.identity.publicKey });
      await ownerClient.open(siteProgram);
    });

    // Close the site after each test
    afterEach(async () => {
      if (siteProgram && !siteProgram.closed) {
        await siteProgram.close();
      }
    });

    it('is assigned a valid address upon opening', () => {
      expect(siteProgram.address).toBeDefined();
      expect(typeof siteProgram.address).toBe('string');
      // Peerbit addresses are typically longer than 10 characters
      expect(siteProgram.address.length).toBeGreaterThan(10);
    });

    it('is marked as open', () => {
      expect(siteProgram.closed).toBe(false);
    });

    it('initializes its Document stores correctly', () => {
      // Check if the stores are instances of the Documents class
      expect(siteProgram.releases).toBeInstanceOf(Documents);
      expect(siteProgram.featuredReleases).toBeInstanceOf(Documents);
      expect(siteProgram.contentCategories).toBeInstanceOf(Documents);
      expect(siteProgram.subscriptions).toBeInstanceOf(Documents);
      expect(siteProgram.blockedContent).toBeInstanceOf(Documents);

      // Check if the stores are open and ready
      expect(siteProgram.releases.closed).toBe(false);
      expect(siteProgram.subscriptions.closed).toBe(false);
    });

    it('initializes its Access Controllers correctly', () => {
      expect(siteProgram.access).toBeInstanceOf(RoleBasedccessController);

      // Check if the ACLs are open
      expect(siteProgram.access.closed).toBe(false);
    });
  });

  describe('lifecycle management', () => {
    it('can be closed and reopened successfully', async () => {
      const siteProgram = new Site({ rootAdmin: ownerClient.identity.publicKey });

      // 1. Initial open
      const openedProgram = await ownerClient.open(siteProgram);
      const programAddress = openedProgram.address;
      expect(openedProgram.closed).toBe(false);
      expect(openedProgram.releases.closed).toBe(false);

      // 2. Close the program
      await openedProgram.close();
      expect(openedProgram.closed).toBe(true);
      // Verify that sub-programs (stores) are also closed
      expect(openedProgram.releases.closed).toBe(true);

      // 3. Re-open the same instance
      // Note: Re-opening the same instance is a valid operation in Peerbit
      const reopenedProgram = await ownerClient.open(siteProgram);
      expect(reopenedProgram).toBe(siteProgram); // It's the same object instance
      expect(reopenedProgram.closed).toBe(false);
      expect(reopenedProgram.releases.closed).toBe(false);
      expect(reopenedProgram.address).toEqual(programAddress); // Address should be stable

      // Final cleanup
      await reopenedProgram.close();
    });
  });

  describe('default content categories initialization', () => {
    let siteProgram: Site;

    beforeEach(async () => {
      siteProgram = new Site({ rootAdmin: ownerClient.identity.publicKey });
      await ownerClient.open(siteProgram);
    });

    afterEach(async () => {
      if (siteProgram && !siteProgram.closed) {
        await siteProgram.close();
      }
    });

    it('root admin can initialize default categories', async () => {
      // 1. Verify the store is initially empty
      const initialSize = await siteProgram.contentCategories.index.getSize();
      expect(initialSize).toBe(0);

      // 2. Call the initialization method directly on the program instance
      await siteProgram.initContentCategories();

      // 3. Wait for the documents to be added and assert the size
      await waitForResolved(async () => {
        const currentSize = await siteProgram.contentCategories.index.getSize();
        expect(currentSize).toBe(defaultSiteContentCategories.length);
      });
    });

    it('initialization is idempotent', async () => {
      // Call the method twice
      await siteProgram.initContentCategories();
      await siteProgram.initContentCategories();

      // The size should still be the same as the default list, not doubled.
      await waitForResolved(async () => {
        const currentSize = await siteProgram.contentCategories.index.getSize();
        expect(currentSize).toBe(defaultSiteContentCategories.length);
      });
    });

    it('throws an error if a non-admin tries to initialize', async () => {
      // Open the site program from the non-admin's perspective
      const siteFromNonOwner = await noOwnerClient.open<Site>(siteProgram.address);

      // Expect the call to fail because the non-admin is not the root trust.
      await expect(siteFromNonOwner.initContentCategories()).rejects.toThrow(
        'Only the root administrator can initialize default content categories.',
      );

    });
  });

});