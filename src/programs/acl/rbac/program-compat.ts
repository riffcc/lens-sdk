import { variant, field } from '@dao-xyz/borsh';
import { Documents } from '@peerbit/document';
import { Program } from '@peerbit/program';
import { TrustedNetwork } from '@peerbit/trusted-network';
import { IndexedRole, IndexedRoleAssignment, Role, RoleAssignment } from './schemas';

/**
 * COMPATIBILITY CLASS - For reading old data with the typo
 * This is the OLD class name used for deserialization only
 */
@variant('rbac_v1')
export class RoleBasedccessController extends Program {
  @field({ type: TrustedNetwork })
  admins: TrustedNetwork;

  @field({ type: Documents })
  roles: Documents<Role, IndexedRole>;

  @field({ type: Documents })
  assignments: Documents<RoleAssignment, IndexedRoleAssignment>;

  constructor(props?: any) {
    super();
    this.admins = new TrustedNetwork(props?.admins || { rootTrust: props?.rootAdmin });
    this.roles = new Documents();
    this.assignments = new Documents();
  }

  // Implement abstract open method (required by Program base class)
  async open(): Promise<void> {
    // This is just for compatibility - we don't actually open stores
    // The migration will handle the data transfer
  }
}