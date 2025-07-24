import { variant, field } from '@dao-xyz/borsh';
import type { PublicSignKey } from '@peerbit/crypto';
import type { CanPerformOperations } from '@peerbit/document';
import { Documents, SearchRequest } from '@peerbit/document';
import { And, ByteMatchQuery, StringMatch } from '@peerbit/indexer-interface';
import { Program } from '@peerbit/program';
import { TrustedNetwork } from '@peerbit/trusted-network';
import { IndexedRole, IndexedRoleAssignment, Role, RoleAssignment } from './schemas';
import type { ReplicationOptions } from '@peerbit/shared-log';

/**
 * Defines the arguments for opening the RBAC controller,
 * allowing control over replication behavior.
 */
type Args = { replicate?: ReplicationOptions }

/**
 * A Program that provides a classic Role-Based Access Control (RBAC) system.
 * It manages roles, permissions, and user assignments, using a TrustedNetwork
 * for a top-level group of administrators.
 */
@variant('rbac_v1')
export class RoleBasedccessController extends Program<Args> {

  /**
   * A TrustedNetwork that manages the list of administrators.
   * Any identity within this network has full permissions over the RBAC system.
   */
  @field({ type: TrustedNetwork })
  admins: TrustedNetwork;

  /**
   * A distributed database storing all defined Roles and their associated permissions.
   */
  @field({ type: Documents })
  roles: Documents<Role, IndexedRole>;

  /**
   * A distributed database storing all RoleAssignments, which link users to roles.
   */
  @field({ type: Documents })
  assignments: Documents<RoleAssignment, IndexedRoleAssignment>;

  /**
   * A private property to hold default roles, which are created on initialization.
   */
  private _defaultRoles: Role[];

  /**
   * Creates an instance of the RoleBasedccessController.
   * @param props.rootAdmin The public key of the first administrator, who can create other admins.
   * @param props.defaultRoles An optional array of Roles to be created automatically when the program is initialized by the rootAdmin.
   */
  constructor(props: { rootAdmin: PublicSignKey; defaultRoles?: Role[] }) {
    super();
    this.admins = new TrustedNetwork({ rootTrust: props.rootAdmin });
    this.roles = new Documents();
    this.assignments = new Documents();
    this._defaultRoles = props.defaultRoles || [];
  }

  /**
   * Initializes the RBAC controller, opening its underlying databases.
   * If the current node is the root admin, it will also initialize the default roles.
   * @param args Configuration for replication.
   */
  async open(args?: Args) {
    await this.admins.open({
      replicate: args?.replicate ?? {
        factor: 1,
      },
    });

    const adminOnlyPolicy = async<T>(op: CanPerformOperations<T>) => {
      for (const key of await op.entry.getPublicKeys()) {
        if (await this.admins.isTrusted(key)) return true;
      }
      return false;
    };

    await this.roles.open({
      replicate: args?.replicate ?? {
        factor: 1,
      },
      type: Role,
      canPerform: adminOnlyPolicy,
      index: {
        canRead: () => true,
        type: IndexedRole,
      },
    });

    await this.assignments.open({
      replicate: args?.replicate ?? {
        factor: 1,
      },
      type: RoleAssignment,
      canPerform: adminOnlyPolicy,
      index: {
        canRead: () => true,
        type: IndexedRoleAssignment,
      },
    });

    // Only the root admin should be responsible for initializing the system.
    if (this.node.identity.publicKey.equals(this.admins.rootTrust)) {
      await this._initializeDefaultRoles();
    }
  }

  /**
   * Idempotently creates the default roles if they don't already exist.
   * This is a private method only called by the root admin upon opening.
   */
  private async _initializeDefaultRoles(): Promise<void> {
    if (this._defaultRoles.length === 0) {
      return;
    }
    for (const defaultRole of this._defaultRoles) {
      const existingRoles = await this.roles.index.search(new SearchRequest({
        query: [new StringMatch({ key: 'name', value: defaultRole.name, caseInsensitive: true })],
      }));
      if (existingRoles.length === 0) {
        try {
          // This call is now consistent with the check.
          await this.createRole(defaultRole.name, defaultRole.permissions);
        } catch {
          // Ignore errors, as another instance of the same root admin might
          // have created the role in a race condition.
        }
      }
    }
  }

  /**
   * Grants another peer full administrative privileges.
   * This is a privileged action that can only be performed by an existing admin.
   * @param admin The PublicSignKey of the peer to promote to an admin.
   */
  async addAdmin(admin: PublicSignKey): Promise<void> {
    await this.admins.add(admin);
  }

  /**
   * Creates a new role with a set of permissions.
   * This is a privileged action that can only be performed by an admin.
   * @param name A unique string identifier for the role (e.g., "editor").
   * @param permissions An array of permission strings (e.g., ["document:write"]).
   */
  async createRole(name: string, permissions: string[]): Promise<void> {
    const existingRoles = await this.roles.index.search(new SearchRequest({
      query: [new StringMatch({ key: 'name', value: name, caseInsensitive: true })],
      fetch: 1,
    }));
    if (existingRoles.length > 0) {
      throw new Error(`A role with the name "${name}" already exists.`);
    }
    await this.roles.put(new Role(name, permissions));
  }

  /**
 * Updates the permissions for an existing role. The role name cannot be changed.
 * This is a privileged action that can only be performed by an admin.
 * @param name The name of the role to update.
 * @param newPermissions The new, complete array of permission strings.
 */
  async updateRole(name: string, newPermissions: string[]): Promise<void> {
    const rolesFound = await this.roles.index.search(new SearchRequest({
      query: [new StringMatch({ key: 'name', value: name, caseInsensitive: true })],
      fetch: 1,
    }));
    const existingRole = rolesFound[0];

    if (!existingRole) {
      throw new Error(`Role with name "${name}" not found.`);
    }

    // Create a new Role object with the same name (and thus same ID) but new permissions.
    // The `put` operation will overwrite the old entry because the ID is the same.
    const updatedRole = new Role(existingRole.name, newPermissions);
    await this.roles.put(updatedRole);
  }

  /**
   * Deletes a role and all associated assignments (cascading delete).
   * This is a privileged action that can only be performed by an admin.
   * @param name The name of the role to delete.
   * @returns A boolean indicating whether the role was found and deleted.
   */
  async deleteRole(name: string): Promise<boolean> {
    // 1. Find the role to be deleted.
    const rolesFound = await this.roles.index.search(new SearchRequest({
      query: [new StringMatch({ key: 'name', value: name, caseInsensitive: true })],
      fetch: 1,
    }));
    const roleToDelete = rolesFound[0];

    if (!roleToDelete) {
      return false; // Role doesn't exist.
    }

    // 2. Find all assignments for this role.
    const assignmentsToDelete = await this.assignments.index.search(new SearchRequest({
      query: [new StringMatch({ key: 'roleId', value: roleToDelete.name })],
    }));

    // 3. Delete all found assignments.
    const deleteAssignmentPromises = assignmentsToDelete.map(assignment =>
      this.assignments.del(assignment.id),
    );
    await Promise.all(deleteAssignmentPromises);

    // 4. Finally, delete the role itself.
    await this.roles.del(roleToDelete.id);

    return true;
  }

  /**
   * Assigns a role to a user.
   * This is a privileged action that can only be performed by an admin.
   * @param user The PublicSignKey of the user to assign the role to.
   * @param roleId The string identifier (name) of the role to assign.
   */
  async assignRole(user: PublicSignKey, roleId: string): Promise<void> {
    const rolesFound = await this.roles.index.search(new SearchRequest({
      query: [new StringMatch({ key: 'name', value: roleId, caseInsensitive: true })],
      fetch: 1,
    }));
    if (rolesFound.length === 0) throw new Error(`Role with name "${roleId}" does not exist.`);

    // Pass the original (case-sensitive) roleId to the assignment for consistency.
    await this.assignments.put(new RoleAssignment(user, roleId));
  }

  /**
   * Revokes a specific role from a user by deleting the corresponding assignment.
   * This is a privileged action that can only be performed by an admin.
   * @param user The PublicSignKey of the user.
   * @param roleId The string identifier (name) of the role to revoke.
   * @returns A boolean indicating whether an assignment was found and deleted.
   */
  async revokeRole(user: PublicSignKey, roleId: string): Promise<boolean> {
    // This method was already correct, using ByteMatch for user and StringMatch for roleId.
    const assignments = await this.assignments.index.search(new SearchRequest({
      query: new And([
        new ByteMatchQuery({ key: 'user', value: user.bytes }),
        new StringMatch({ key: 'roleId', value: roleId }),
      ]),
    }));

    if (assignments.length === 0) {
      return false;
    }

    for (const assignment of assignments) {
      await this.assignments.del(assignment.id);
    }
    return true;
  }

  /**
   * The main public method for checking permissions.
   * Determines if a given identity has a specific permission, either by
   * being an administrator or by holding a role that grants the permission.
   * @param args.permission The permission string to check for (e.g., "document:read").
   * @param args.identity The public key of the identity whose permissions are being checked.
   * @returns A boolean promise that resolves to true if access is granted, false otherwise.
   */
  public async can(args: { permission: string; identity: PublicSignKey }): Promise<boolean> {
    if (await this.admins.isTrusted(args.identity)) {
      return true;
    }

    const userAssignments = await this.assignments.index.search(new SearchRequest({
      query: [new ByteMatchQuery({ key: 'user', value: args.identity.bytes })],
    }));

    if (userAssignments.length === 0) return false;

    const roleIds = userAssignments.map(a => a.roleId);
    for (const roleId of roleIds) {
      const rolesFound = await this.roles.index.search(new SearchRequest({
        query: [new StringMatch({ key: 'name', value: roleId, caseInsensitive: true })],
        fetch: 1,
      }));
      const role = rolesFound[0];

      if (role && role.hasPermission(args.permission)) {
        return true;
      }
    }

    return false;
  }
}