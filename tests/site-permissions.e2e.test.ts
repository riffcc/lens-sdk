import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import type { ContentCategoryData, ReleaseData } from '../src/programs/site/types';
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

const createCategoryData = (): ContentCategoryData<string> => {
  const randomId = Math.random().toString(36).substring(7);
  return {
    categoryId: `test-category-${randomId}`,
    displayName: `Test Category ${randomId}`,
    metadataSchema: JSON.stringify({
      description: {
        type: 'string',
        description: 'A test description field',
      },
    }),
  };
};

// --- Test Suite ---
describe('Role-Based Access Control (RBAC) in Site', () => {
  let session: TestSession;
  let adminClient: ProgramClient, moderatorClient: ProgramClient, memberClient: ProgramClient, guestClient: ProgramClient;
  let adminService: LensService, moderatorService: LensService, memberService: LensService, guestService: LensService;
  let siteAddress: string;

  // Setup is robust and correct.
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

    await moderatorService.openSite(siteAddress);
    await memberService.openSite(siteAddress);
    await guestService.openSite(siteAddress);

    await adminService.siteProgram?.waitFor(moderatorClient.peerId);
    await adminService.siteProgram?.waitFor(memberClient.peerId);
    await adminService.siteProgram?.waitFor(guestClient.peerId);

    await adminService.assignRole(moderatorClient.identity.publicKey, 'moderator');
    await adminService.assignRole(memberClient.identity.publicKey, 'member');

    await waitForResolved(async () => {
      const modStatus = await moderatorService.getAccountStatus();
      const memStatus = await memberService.getAccountStatus();
      expect(modStatus.roles).toContain('moderator');
      expect(memStatus.roles).toContain('member');
    }, { timeout: 15000, delayInterval: 1000, timeoutMessage: 'Roles were not assigned in time' });
  }, 30000);

  afterAll(async () => {
    if (adminService) await adminService.stop();
    if (moderatorService) await moderatorService.stop();
    if (memberService) await memberService.stop();
    if (guestService) await guestService.stop();
    if (session) await session.stop();
  });


  describe('Admin', () => {
    it('can assign and revoke a role', async () => {
      const tempUser = await TestSession.disconnected(1);
      const tempUserKey = tempUser.peers[0].identity.publicKey;
      await adminService.assignRole(tempUserKey, 'member');
      const revokeResp = await adminService.revokeRole(tempUserKey, 'member');
      expect(revokeResp.success).toBe(true);
      await tempUser.stop();
    });

    it('can delete a release created by a member', async () => {
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
    });

    it('can edit a release created by a member', async () => {
      const releaseResp = await memberService.addRelease(createReleaseData());
      expect(releaseResp.success).toBe(true);
      const releaseId = releaseResp.id!;
      await waitFor(() => moderatorService.getRelease(releaseId));

      const releaseToEdit = await moderatorService.getRelease(releaseId);
      const editInput = {
        id: releaseToEdit!.id,
        name: 'Edited by Moderator',
        postedBy: releaseToEdit!.postedBy,
        siteAddress: releaseToEdit!.siteAddress,
        categoryId: releaseToEdit!.categoryId,
        contentCID: releaseToEdit!.contentCID,
      };

      const editResponse = await moderatorService.editRelease(editInput);
      expect(editResponse.success).toBe(true);
    });

    it('can delete a release created by a member', async () => {
      const releaseResp = await memberService.addRelease(createReleaseData());
      expect(releaseResp.success).toBe(true);
      await waitFor(() => moderatorService.getRelease(releaseResp.id!));
      const deleteResp = await moderatorService.deleteRelease(releaseResp.id!);
      expect(deleteResp.success).toBe(true);
    });

    it('can manage featured releases', async () => {
      const releaseResp = await memberService.addRelease(createReleaseData());
      expect(releaseResp.success).toBe(true);
      await waitFor(() => moderatorService.getRelease(releaseResp.id!));
      const featureResponse = await moderatorService.addFeaturedRelease({
        releaseId: releaseResp.id!,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        promoted: false,
      });
      expect(featureResponse.success).toBe(true);
    });

    it('can manage content categories', async () => {
      const categoryData = createCategoryData();

      // Add
      const addResp = await moderatorService.addContentCategory(categoryData);
      expect(addResp.success).toBe(true);
      expect(addResp.id).toBeDefined();
      const categoryId = addResp.id!;

      // Get
      const newCategory = await moderatorService.getContentCategory(categoryId);
      expect(newCategory).toBeDefined();
      expect(newCategory!.displayName).toEqual(categoryData.displayName);

      const editedData = {
        ...newCategory!,
        displayName: 'Edited Category Name',
      };
      
      const editResp = await moderatorService.editContentCategory(editedData);
      expect(editResp.success).toBe(true);
      
      const fetchedEdited = await moderatorService.getContentCategory(editResp.id!);
      expect(fetchedEdited!.displayName).toEqual('Edited Category Name');

      // Delete
      const deleteResp = await moderatorService.deleteContentCategory(newCategory!.id);
      expect(deleteResp.success).toBe(true);
      
      await waitForResolved(async () => {
        const deletedCategory = await moderatorService.getContentCategory(newCategory!.id);
        expect(deletedCategory).toBeUndefined();
      });
    });

    it('cannot edit the immutable categoryId', async () => {
      const categoryData = createCategoryData();
      const addResp = await moderatorService.addContentCategory(categoryData);
      expect(addResp.success).toBe(true);

      const newCategory = await moderatorService.getContentCategory(addResp.id!);
      expect(newCategory).toBeDefined();

      const editedData = {
        ...newCategory!,
        categoryId: 'edited-category-id', // Attempt to change the immutable key
      };

      const editResp = await moderatorService.editContentCategory(editedData);
      expect(editResp.success).toBe(false);
      expect(editResp.error).toContain('Access denied');
    });

    it('cannot manage user roles', async () => {
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

    it('cannot edit a release created by another user', async () => {
      const moderatorReleaseResp = await moderatorService.addRelease(createReleaseData());
      expect(moderatorReleaseResp.success).toBe(true);
      await waitFor(() => memberService.getRelease(moderatorReleaseResp.id!));

      const releaseToEdit = await memberService.getRelease(moderatorReleaseResp.id!);
      const editInput = {
        id: releaseToEdit!.id,
        name: 'Attempted Edit by Member',
        postedBy: releaseToEdit!.postedBy,
        siteAddress: releaseToEdit!.siteAddress,
        categoryId: releaseToEdit!.categoryId,
        contentCID: releaseToEdit!.contentCID,
      };
      const editResponse = await memberService.editRelease(editInput);
      expect(editResponse.success).toBe(false);
      expect(editResponse.error).toContain('Access denied');
    });

    it('cannot delete any release', async () => {
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