import { AccessError } from '@peerbit/crypto';
import { StringMatch } from '@peerbit/indexer-interface';
import type { ProgramClient } from '@peerbit/program';
import { TestSession } from '@peerbit/test-utils';
import { waitFor, waitForResolved } from '@peerbit/time';

import { Role, RoleBasedccessController } from '../src/programs/acl/rbac';

describe('RoleBasedccessController', () => {
  let session: TestSession;
  let rootAdmin: ProgramClient, user1: ProgramClient, user2: ProgramClient;
  let rbac: RoleBasedccessController;

  // --- ONE-TIME SETUP ---
  // This sets up the peer connections once for all tests.
  beforeAll(async () => {
    session = await TestSession.connected(3);
    [rootAdmin, user1, user2] = session.peers;
  });

  afterAll(async () => {
    await session.stop();
  });

  // --- SETUP FOR EACH TEST ---
  // This creates a FRESH rbac instance for every single `it(...)` test.
  // This is the key to preventing state pollution and making tests reliable.
  beforeEach(async () => {
    rbac = new RoleBasedccessController({
      rootAdmin: rootAdmin.identity.publicKey,
      defaultRoles: [new Role('viewer', ['read'])],
    });
    await rootAdmin.open(rbac);
    await rbac.getReady();
    // await rbac.waitFor([user1.peerId, user2.peerId]);
  });

  afterEach(async () => {
    if (rbac) {
      await rbac.close();
    }
  });

  describe('Initialization', () => {
    it('sets the root admin correctly', () => {
      expect(rbac.admins.rootTrust.equals(rootAdmin.identity.publicKey)).toBe(true);
    });

    it('creates default roles on first open', async () => {
      await waitForResolved(async () => {
        const roles = await rbac.roles.index.search({});
        expect(roles).toHaveLength(1);
        expect(roles[0].name).toEqual('viewer');
      });
    });
  });

  describe('Role Management (Admin Powers)', () => {
    it('an admin can create, update, and delete a role', async () => {
      // 1. Create
      const roleName = 'editor';
      await rbac.createRole(roleName, ['write']);
      let role = (await rbac.roles.index.search({ query: new StringMatch({ key: 'name', value: roleName }) }))[0];
      expect(role).toBeDefined();
      expect(role.permissions).toEqual(['write']);

      // 2. Update
      await rbac.updateRole(roleName, ['write', 'comment']);
      role = (await rbac.roles.index.search({ query: new StringMatch({ key: 'name', value: roleName }) }))[0];
      expect(role.permissions).toEqual(['write', 'comment']);

      // 3. Delete
      await rbac.deleteRole(roleName);
      role = (await rbac.roles.index.search({ query: new StringMatch({ key: 'name', value: roleName }) }))[0];
      expect(role).toBeUndefined();
    });

    it('a non-admin cannot manage roles', async () => {
      // Open the program from the user's perspective
      const rbacFromUser = await user1.open<RoleBasedccessController>(rbac.address);
      await waitForResolved(async () => {
        expect(await rbacFromUser.roles.index.getSize()).toBeGreaterThan(0);
      });
      await expect(rbacFromUser.createRole('hacker', [])).rejects.toThrow(AccessError);
      await expect(rbacFromUser.updateRole('viewer', [])).rejects.toThrow(AccessError);
      await expect(rbacFromUser.deleteRole('viewer')).rejects.toThrow(AccessError);
    });

    it('an admin can assign and revoke roles', async () => {
      await rbac.createRole('member', []);
      await rbac.assignRole(user1.identity.publicKey, 'member');
      await waitForResolved(async () => {
        const assignments = await rbac.assignments.index.search({});
        expect(assignments).toHaveLength(1);
        expect(assignments[0].roleId).toEqual('member');
      });

      await rbac.revokeRole(user1.identity.publicKey, 'member');
      await waitForResolved(async () => {
        const assignments = await rbac.assignments.index.search({});
        expect(assignments).toHaveLength(0);
      });
    });
  });

  describe('Permission Checks (`can` method)', () => {
    beforeEach(async () => {
      // Create some roles for this test block
      await rbac.createRole('writer', ['write']);
      await rbac.createRole('commenter', ['comment']);
    });

    it('an admin is always granted permission', async () => {
      const hasPermission = await rbac.can({ permission: 'anything', identity: rootAdmin.identity.publicKey });
      expect(hasPermission).toBe(true);
    });

    it('a guest with no roles is denied permission', async () => {
      const hasPermission = await rbac.can({ permission: 'write', identity: user2.identity.publicKey });
      expect(hasPermission).toBe(false);
    });

    it('grants permission if user has the required role', async () => {
      await rbac.assignRole(user1.identity.publicKey, 'writer');
      await waitFor(async () => rbac.can({ permission: 'write', identity: user1.identity.publicKey }));

      const canWrite = await rbac.can({ permission: 'write', identity: user1.identity.publicKey });
      expect(canWrite).toBe(true);

      const canComment = await rbac.can({ permission: 'comment', identity: user1.identity.publicKey });
      expect(canComment).toBe(false); // Does not have this permission
    });

    it('grants permission if user has one of multiple roles that provides it', async () => {
      await rbac.assignRole(user1.identity.publicKey, 'writer');
      await rbac.assignRole(user1.identity.publicKey, 'commenter');
      await waitFor(async () => (await rbac.assignments.index.getSize()) === 2);

      const canWrite = await rbac.can({ permission: 'write', identity: user1.identity.publicKey });
      expect(canWrite).toBe(true);
      const canComment = await rbac.can({ permission: 'comment', identity: user1.identity.publicKey });
      expect(canComment).toBe(true);
    });

    it('denies permission after a role is revoked', async () => {
      await rbac.assignRole(user1.identity.publicKey, 'writer');
      await waitFor(async () => rbac.can({ permission: 'write', identity: user1.identity.publicKey }));
      await rbac.revokeRole(user1.identity.publicKey, 'writer');

      await waitFor(async () => !(await rbac.can({ permission: 'write', identity: user1.identity.publicKey })));
      const hasPermission = await rbac.can({ permission: 'write', identity: user1.identity.publicKey });
      expect(hasPermission).toBe(false);
    });

    it('denies permission after a role is deleted (cascading)', async () => {
      await rbac.assignRole(user1.identity.publicKey, 'writer');
      await waitFor(async () => rbac.can({ permission: 'write', identity: user1.identity.publicKey }));
      await rbac.deleteRole('writer');

      await waitFor(async () => !(await rbac.can({ permission: 'write', identity: user1.identity.publicKey })));
      const hasPermission = await rbac.can({ permission: 'write', identity: user1.identity.publicKey });
      expect(hasPermission).toBe(false);
    });
  });
});
