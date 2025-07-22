import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { AccountType, type ReleaseData } from '../src/programs/site/types';
import { waitFor } from '@peerbit/time';
import { LensService } from '../src/services';
import type { BaseData } from '../src/programs/site/types';
import { findAccessGrant } from '../src/common/utils';
import { Ed25519Keypair } from '@peerbit/crypto';

// --- Test Helpers ---

// Helper to create valid ReleaseData for service calls.
const createReleaseData = (client: ProgramClient): Omit<ReleaseData, 'siteAddress'> => {
  return {
    name: `Release by ${client.identity.publicKey.hashcode().slice(0, 8)}-${Date.now()}`,
    categoryId: 'test-category',
    contentCID: `cid-${Math.random()}`,
    postedBy: client.identity.publicKey,
  };
};

// Helper to create valid Subscription data for service calls.
const createSubscriptionData = (client: ProgramClient, remoteSiteAddress: string): Omit<BaseData, 'id'> => {
  return {
    postedBy: client.identity.publicKey,
    siteAddress: remoteSiteAddress,
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
    await siteOwnerService.openSite(site);
    siteAddress = siteOwnerService.siteProgram!.address;

    // Member and Guest open the same site using its address.
    await memberService.openSite(siteAddress);
    await guestService.openSite(siteAddress);

    await siteOwnerService.siteProgram?.waitFor(memberService.peerbit!.peerId);
    await guestService.siteProgram?.waitFor(memberService.peerbit!.peerId);

    await siteOwnerService.grantAccess(
      AccountType.MEMBER,
      memberClient.identity.publicKey.toString(),
    );

    await waitFor(async () => {
      const status = await memberService.getAccountStatus({ cached: false});
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

    it('can add and delete a subscription', async () => {
      const remoteSite = `remote-site-${Math.random()}`;
      const subData = createSubscriptionData(siteOwnerClient, remoteSite);
      
      const addResponse = await siteOwnerService.addSubscription(subData);
      expect(addResponse.success).toBe(true);

      const subscriptions = await siteOwnerService.getSubscriptions();
      expect(subscriptions.find(s => s.siteAddress === remoteSite)).toBeDefined();

      const deleteResponse = await siteOwnerService.deleteSubscription({ siteAddress: remoteSite });
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

    it('CANNOT add a subscription', async () => {
      const subData = createSubscriptionData(memberClient, 'remote-site-member-fails');
      // FIXED ASSERTION
      const response = await memberService.addSubscription(subData);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT delete a release (even its own)', async () => {
      const releaseData = createReleaseData(memberClient);
      const addResponse = await memberService.addRelease(releaseData);
      expect(addResponse.success).toBe(true);

      await waitFor(() => memberService.getRelease(addResponse.id!));

      // FIXED ASSERTION
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
      // FIXED ASSERTION
      const response = await guestService.addRelease(releaseData);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });

    it('CANNOT add a subscription', async () => {
      const subData = createSubscriptionData(guestClient, 'remote-site-guest-fails');
      // FIXED ASSERTION
      const response = await guestService.addSubscription(subData);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Access denied');
    });
    
    it('CANNOT delete a release', async () => {
        const adminRelease = createReleaseData(siteOwnerClient);
        const addResponse = await siteOwnerService.addRelease(adminRelease);
        expect(addResponse.success).toBe(true);
  
        // Verify the guest can see it first.
        await waitFor(() => guestService.getRelease(addResponse.id!));
        
        // FIXED ASSERTION
        const deleteResponse = await guestService.deleteRelease(addResponse.id!);
        expect(deleteResponse.success).toBe(false);
        expect(deleteResponse.error).toBe('Access denied');
      });
  });
});