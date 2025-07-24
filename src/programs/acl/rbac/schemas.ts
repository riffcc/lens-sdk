import { variant, field, vec, fixedArray } from '@dao-xyz/borsh';
import { PublicSignKey, sha256Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';

// To be stored in a 'roles' database
@variant(0)
export class Role {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array;

  @field({ type: 'string' })
  name: string;

  @field({ type: vec('string') })
  permissions: string[];

  constructor(name: string, permissions: string[] = []) {
    this.id = this.calculateId(name);
    this.name = name;
    this.permissions = permissions;
  }
  /**
* Checks if this role includes a specific permission.
* @param permission The permission string to check for.
* @returns true if the role has the permission, false otherwise.
*/
  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  calculateId(name: string): Uint8Array {
    return sha256Sync(new TextEncoder().encode(name));
  }
}

export class IndexedRole {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array;

  @field({ type: 'string' })
  name: string;

  @field({ type: vec('string') })
  permissions: string[];

  constructor(doc: Role) {
    this.id = doc.id;
    this.name = doc.name.toLowerCase();
    this.permissions = doc.permissions;
  }
}

// To be stored in a 'assignments' database
@variant(0)
export class RoleAssignment {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array; // Unique ID for the assignment

  @field({ type: PublicSignKey })
  user: PublicSignKey; // The user being assigned a role

  @field({ type: 'string' })
  roleId: string; // The ID of the role being assigned

  constructor(user: PublicSignKey, roleId: string) {
    this.user = user;
    this.roleId = roleId;
    this.id = sha256Sync(concat([this.user.bytes, new TextEncoder().encode(this.roleId)])); // Deterministic ID
  }
}

export class IndexedRoleAssignment {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array; // Unique ID for the assignment

  @field({ type: Uint8Array })
  user: Uint8Array; // The user being assigned a role

  @field({ type: 'string' })
  roleId: string; // The ID of the role being assigned

  constructor(doc: RoleAssignment) {
    this.user = doc.user.bytes;
    this.roleId = doc.roleId;
    this.id = doc.id;
  }
}