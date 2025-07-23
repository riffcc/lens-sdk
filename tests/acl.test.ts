import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { AccountType, type ReleaseData } from '../src/programs/site/types';
import { waitFor } from '@peerbit/time';
import { LensService } from '../src/services';
import { findAccessGrant } from '../src/common/utils';
import { Ed25519Keypair } from '@peerbit/crypto';

// --- Test Helpers ---

// Helper to create valid ReleaseData for service calls.
const createReleaseData = (client: ProgramClient): ReleaseData => {
  return {
    name: `Release by ${client.identity.publicKey.hashcode().slice(0, 8)}-${Date.now()}`,
    categoryId: 'test-category',
    contentCID: `cid-${Math.random()}`,
  };
};

// --- Test Suite ---

describe('LensService ACL', () => {
  let session: TestSession;
  let siteOwnerClient: ProgramClient, memberClient: ProgramClient, guestClient: ProgramClient;

  // Each peer interacts with the system through its own LensService instance.
  let siteOwnerService: LensService, memberService: LensService, guestService: LensService;

  // We keep a reference to the Site's address to open it on other clients.
  let siteAddress: string;

  // Setup the multi-peer session and create the Site before any tests run.
  beforeAll(async () => {
    session = await TestSession.connected(3);
    [siteOwnerClient, memberClient, guestClient] = session.peers;

    // Initialize a service for each peer.
    siteOwnerService = new LensService({ peerbit: siteOwnerClient });
    memberService = new LensService({ peerbit: memberClient });
    guestService = new LensService({ peerbit: guestClient });

    // Site owner creates and opens the site.
    const site = new Site(siteOwnerClient.identity.publicKey);
    await siteOwnerService.openSite(site, { federate: false });
    siteAddress = siteOwnerService.siteProgram!.address;

    // Member and Guest open the same site using its address.
    await memberService.openSite(siteAddress, { federate: false });
    await guestService.openSite(siteAddress, { federate: false });

    await siteOwnerService.siteProgram?.waitFor(memberService.peerbit!.peerId);
    await guestService.siteProgram?.waitFor(memberService.peerbit!.peerId);

    await siteOwnerService.grantAccess(
      AccountType.MEMBER,
      memberClient.identity.publicKey.toString(),
    );

    await waitFor(async () => {
      const status = await memberService.getAccountStatus({ cached: false });
      return status === AccountType.MEMBER;
    }, { timeout: 10000 });

  }, 30000);

  // Teardown the session after all tests are complete.
  afterAll(async () => {
    await siteOwnerService?.stop();
    await memberService?.stop();
    await guestService?.stop();
    await session?.stop();
  });
  /**
   * Admin Role Tests
   * An admin should have full control over the site.
   */
  describe('Admin Permissions', () => {
    it('can add and delete its own release', async () => {
      const releaseData = createReleaseData(siteOwnerClient);
      const response = await siteOwnerService.addRelease(releaseData);
      expect(response.success).toBe(true);
      expect(response.id).toBeDefined();

      const retrieved = await siteOwnerService.getRelease(response.id!);
      expect(retrieved?.id).toEqual(response.id);

      const deleteResponse = await siteOwnerService.deleteRelease(response.id!);
      expect(deleteResponse.success).toBe(true);
    });

    it('can post a release on behalf of another user (impersonation)', async () => {
      const releaseData = {
        ...createReleaseData(siteOwnerClient),
        postedBy: memberClient.identity.publicKey, // Admin is posting, but attributing it to the member
      };

      const response = await siteOwnerService.addRelease(releaseData);
      expect(response.success).toBe(true);
      expect(response.id).toBeDefined();

      const retrieved = await siteOwnerService.getRelease(response.id!);
      expect(retrieved).toBeDefined();
      // Crucial check: verify the 'postedBy' field is the one we set, not the signer's
      expect(retrieved!.postedBy.equals(memberClient.identity.publicKey)).toBe(true);

      // Cleanup
      await siteOwnerService.deleteRelease(response.id!);
    });

    it('can add and delete a subscription', async () => {
      const remoteSite = `remote-site-${Math.random()}`;
      const addResponse = await siteOwnerService.addSubscription({
        to: remoteSite,
      });
      expect(addResponse.success).toBe(true);

      const subscriptions = await siteOwnerService.getSubscriptions();
      expect(subscriptions.find(s => s.to === remoteSite)).toBeDefined();

      const deleteResponse = await siteOwnerService.deleteSubscription({ to: remoteSite });
      expect(deleteResponse.success).toBe(true);
    });

    it('can delete a release created by a member', async () => {
      const memberRelease = createReleaseData(memberClient);
      const addResponse = await memberService.addRelease(memberRelease);
      expect(addResponse.success).toBe(true);

      // Wait for the admin to see the member's document.
      await waitFor(async () => (await siteOwnerService.getRelease(addResponse.id!)) !== undefined);

      // Admin deletes it.
      const deleteResponse = await siteOwnerService.deleteRelease(addResponse.id!);
      expect(deleteResponse.success).toBe(true);

      // Verify the document is no longer retrievable by anyone.
      await waitFor(async () => (await guestService.getRelease(addResponse.id!)) === undefined);
      expect(await guestService.getRelease(addResponse.id!)).toBeUndefined();
    });

    it('can grant and revoke member access for a NEW user', async () => {
      // Create a new, temporary identity for this test only.
      const tempUserIdentity = await Ed25519Keypair.create();
      const tempUserPublicKeyString = tempUserIdentity.publicKey.toString();

      // 1. Grant access
      const grantResponse = await siteOwnerService.grantAccess(AccountType.MEMBER, tempUserPublicKeyString);
      expect(grantResponse.success).toBe(true);

      // Verify grant by checking the ACL store directly (more robust than waiting for a client)
      const grant = await findAccessGrant(siteOwnerService.siteProgram!.members.access, tempUserIdentity.publicKey);
      expect(grant).toBeDefined();

      // 2. Revoke access
      const revokeResponse = await siteOwnerService.revokeAccess(AccountType.MEMBER, tempUserPublicKeyString);
      expect(revokeResponse.success).toBe(true);

      // Verify revocation
      await waitFor(async () => {
        const grantAfterRevoke = await findAccessGrant(siteOwnerService.siteProgram!.members.access, tempUserIdentity.publicKey);
        return grantAfterRevoke === undefined;
      });
      const finalGrant = await findAccessGrant(siteOwnerService.siteProgram!.members.access, tempUserIdentity.publicKey);
      expect(finalGrant).toBeUndefined();
    });
  });

  describe('Member Permissions', () => {
    it('can add a release, and it replicates to other peers', async () => {
      const releaseData = createReleaseData(memberClient);
      const response = await memberService.addRelease(releaseData);
      expect(response.success).toBe(true);
      expect(response.id).toBeDefined();

      const retrievedByAdmin = await waitFor(() => siteOwnerService.getRelease(response.id!));
      expect(retrievedByAdmin?.id).toEqual(response.id);
    });

    it('CANNOT post a release on behalf of another user (impersonation)', async () => {
      const releaseData = {
        ...createReleaseData(memberClient),
        postedBy: siteOwnerClient.identity.publicKey, // Member attempting to post as the Admin
      };

      const response = await memberService.addRelease(releaseData);
      // The operation should fail because the signer (member) is not the root trust,
      // and the signer's key does not match the `postedBy` key. The framework throws
      // an AccessError, which the service correctly translates to 'Access denied'.
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT add a subscription', async () => {
      const response = await memberService.addSubscription({
        to: 'remote-site-member-fails',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT delete a release (even its own)', async () => {
      const releaseData = createReleaseData(memberClient);
      const addResponse = await memberService.addRelease(releaseData);
      expect(addResponse.success).toBe(true);

      await waitFor(() => memberService.getRelease(addResponse.id!));

      const deleteResponse = await memberService.deleteRelease(addResponse.id!);
      expect(deleteResponse.success).toBe(false);
      expect(deleteResponse.error).toBe('Access denied');
    });

    // it('CANNOT grant or revoke access', async () => {
    //   // FIXED ASSERTION
    //   const grantAttempt = await memberService.grantAccess(AccountType.MEMBER, guestClient.identity.publicKey.toString());
    //   expect(grantAttempt.success).toBe(false);
    //   expect(grantAttempt.error).toBe('Access denied');

    //   const revokeAttempt = await memberService.revokeAccess(AccountType.MEMBER, memberClient.identity.publicKey.toString());
    //   expect(revokeAttempt.success).toBe(false);
    //   expect(revokeAttempt.error).toBe('Cannot revoke access from yourself.');
    // });
  });

  describe('Guest Permissions', () => {
    it('CANNOT add a release', async () => {
      const releaseData = createReleaseData(guestClient);
      const response = await guestService.addRelease(releaseData);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT post a release on behalf of another user (impersonation)', async () => {
      const releaseData = {
        ...createReleaseData(guestClient),
        postedBy: siteOwnerClient.identity.publicKey, // Guest attempting to post as the Admin
      };

      const response = await guestService.addRelease(releaseData);
      // The operation fails at the basic role check before even considering impersonation.
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });


    it('CANNOT add a subscription', async () => {
      const response = await guestService.addSubscription({
        to: 'remote-site-guest-fails',
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT delete a release', async () => {
      const adminRelease = createReleaseData(siteOwnerClient);
      const addResponse = await siteOwnerService.addRelease(adminRelease);
      expect(addResponse.success).toBe(true);

      // Verify the guest can see it first.
      await waitFor(() => guestService.getRelease(addResponse.id!));

      const deleteResponse = await guestService.deleteRelease(addResponse.id!);
      expect(deleteResponse.success).toBe(false);
      expect(deleteResponse.error).toBe('Access denied');
    });
  });
});