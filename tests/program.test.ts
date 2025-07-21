import { TestSession } from '@peerbit/test-utils';
import { Ed25519Keypair } from '@peerbit/crypto';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { Documents } from '@peerbit/document';
import { IdentityAccessController } from '@peerbit/identity-access-controller';

describe('Site Program', () => {
  let session: TestSession;
  let client: ProgramClient;

  // Setup a test session with one peer before all tests
  beforeAll(async () => {
    session = await TestSession.connected(1);
    client = session.peers[0];
  });

  // Stop the session after all tests are done
  afterAll(async () => {
    await session.stop();
  });

  describe('initialization and properties', () => {
    let siteProgram: Site;

    // Open a new site before each test in this block
    beforeEach(async () => {
      const rootTrust = await Ed25519Keypair.create();
      siteProgram = new Site(rootTrust.publicKey);
      await client.open(siteProgram);
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
      expect(siteProgram.members).toBeInstanceOf(IdentityAccessController);
      expect(siteProgram.administrators).toBeInstanceOf(IdentityAccessController);

      // Check if the ACLs are open
      expect(siteProgram.members.closed).toBe(false);
      expect(siteProgram.administrators.closed).toBe(false);
    });
  });

  describe('lifecycle management', () => {
    it('can be closed and reopened successfully', async () => {
      const rootTrust = await Ed25519Keypair.create();
      const siteProgram = new Site(rootTrust.publicKey);

      // 1. Initial open
      const openedProgram = await client.open(siteProgram);
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
      const reopenedProgram = await client.open(siteProgram);
      expect(reopenedProgram).toBe(siteProgram); // It's the same object instance
      expect(reopenedProgram.closed).toBe(false);
      expect(reopenedProgram.releases.closed).toBe(false);
      expect(reopenedProgram.address).toEqual(programAddress); // Address should be stable

      // Final cleanup
      await reopenedProgram.close();
    });
  });
});