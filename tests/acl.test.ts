import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import type { ReleaseData } from '../src/programs/site/types';
import { waitFor, waitForResolved } from '@peerbit/time';
import { LensService } from '../src/services';

// --- Test Helpers ---
const createReleaseData = (): ReleaseData => {
  return {
    name: `Release-${Date.now()}-${Math.random()}`,
    categoryId: 'test-category',
    contentCID: `cid-${Math.random()}`,
  };
};

// --- Test Suite ---
describe('Role-Based Access Control (RBAC) in Site', () => {
  let session: TestSession;
  let adminClient: ProgramClient, moderatorClient: ProgramClient, memberClient: ProgramClient, guestClient: ProgramClient;
  let adminService: LensService, moderatorService: LensService, memberService: LensService, guestService: LensService;
  let siteAddress: string;

  // Setup the multi-peer session and create the Site before any tests run.
  beforeAll(async () => {
    session = await TestSession.connected(4);
    [adminClient, moderatorClient, memberClient, guestClient] = session.peers;

    adminService = new LensService({ peerbit: adminClient });
    moderatorService = new LensService({ peerbit: moderatorClient });
    memberService = new LensService({ peerbit: memberClient });
    guestService = new LensService({ peerbit: guestClient });

    const site = new Site(adminClient.identity.publicKey);
    await adminService.openSite(site);
    siteAddress = adminService.siteProgram!.address;

    // Open the site on all other clients
    await moderatorService.openSite(siteAddress);
    await memberService.openSite(siteAddress);
    await guestService.openSite(siteAddress);

    // Ensure all peers are connected at the program level
    await adminService.siteProgram?.waitFor(moderatorClient.peerId);
    await adminService.siteProgram?.waitFor(memberClient.peerId);
    await adminService.siteProgram?.waitFor(guestClient.peerId);

    await adminService.assignRole(moderatorClient.identity.publicKey, 'moderator');
    await adminService.assignRole(memberClient.identity.publicKey, 'member');

    // Wait for propagation by checking the status on the receiving end.
    await waitForResolved(async () => {
      const modStatus = await moderatorService.getAccountStatus();
      const memStatus = await memberService.getAccountStatus();
      expect(modStatus.roles).toContain('moderator');
      expect(memStatus.roles).toContain('member');
    }, {
      timeout: 15000,
      delayInterval: 1000,
      timeoutMessage: 'Roles were not assigned in time',
    });
  }, 30000);

  afterAll(async () => {
    // Stop services in a specific order if they exist
    if (adminService) await adminService.stop();
    if (moderatorService) await moderatorService.stop();
    if (memberService) await memberService.stop();
    if (guestService) await guestService.stop();
    if (session) await session.stop();
  });


  // --- All tests below this line are simplified as we no longer need the complex beforeEach/beforeAll setup for each role ---
  // We can just use the services directly.
  
  describe('Admin', () => {
    it('can assign and revoke a role', async () => {
      const tempUser = await TestSession.disconnected(1);
      const tempUserKey = tempUser.peers[0].identity.publicKey;

      await adminService.assignRole(tempUserKey, 'member');
      // No need to check status, just that the call succeeds for an admin
      const revokeResp = await adminService.revokeRole(tempUserKey, 'member');
      expect(revokeResp.success).toBe(true);
      await tempUser.stop();
    });

    it('can perform any content action (e.g., delete a member release)', async () => {
      const releaseResp = await memberService.addRelease(createReleaseData());
      expect(releaseResp.success).toBe(true);

      await waitFor(() => adminService.getRelease(releaseResp.id!));

      const deleteResp = await adminService.deleteRelease(releaseResp.id!);
      expect(deleteResp.success).toBe(true);
    });
  });

  describe('Moderator', () => {
    it('can create a release', async () => {
      const response = await moderatorService.addRelease(createReleaseData());
      expect(response.success).toBe(true);
      expect(response.id).toBeDefined();
    });

    it('can delete a release created by a member', async () => {
      const releaseResp = await memberService.addRelease(createReleaseData());
      expect(releaseResp.success).toBe(true);
      
      await waitFor(() => moderatorService.getRelease(releaseResp.id!));
      
      const deleteResp = await moderatorService.deleteRelease(releaseResp.id!);
      expect(deleteResp.success).toBe(true);
    });

    it('cannot manage roles or admins', async () => {
      const assignResp = await moderatorService.assignRole(guestClient.identity.publicKey, 'member');
      expect(assignResp.success).toBe(false);
      expect(assignResp.error).toContain('Access denied');
    });
  });

  describe('Member', () => {
    it('can create a release', async () => {
      const response = await memberService.addRelease(createReleaseData());
      expect(response.success).toBe(true);
    });

    it('can edit its own release', async () => {
        const addResp = await memberService.addRelease(createReleaseData());
        expect(addResp.success).toBe(true);

        const editResp = await memberService.editRelease({
            id: addResp.id!,
            name: 'Edited by Member (self)',
            postedBy: memberClient.identity.publicKey,
            siteAddress: siteAddress,
            categoryId: 'test',
            contentCID: 'test-cid',
        });
        expect(editResp.success).toBe(true);
    });

    it('cannot delete any release (even its own)', async () => {
      const addResp = await memberService.addRelease(createReleaseData());
      expect(addResp.success).toBe(true);

      const deleteResp = await memberService.deleteRelease(addResp.id!);
      expect(deleteResp.success).toBe(false);
      expect(deleteResp.error).toContain('Access denied');
    });
  });

  describe('Guest', () => {
    it('cannot create a release', async () => {
      const response = await guestService.addRelease(createReleaseData());
      expect(response.success).toBe(false);
      expect(response.error).toContain('Access denied');
    });

    it('cannot perform any administrative tasks', async () => {
      const assignResp = await guestService.assignRole(memberClient.identity.publicKey, 'member');
      expect(assignResp.success).toBe(false);
    });
  });
});