// Proposed new file: federation.ts

import { field, variant } from '@dao-xyz/borsh';
import { PublicSignKey, sha256Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';
import { Program } from '@peerbit/program';
import { Documents, StringMatch } from '@peerbit/document';
import { Or, ByteMatchQuery } from '@peerbit/document';

@variant(1) // Use a new variant to distinguish from FollowRelation
export class FederationRelation {
  @field({ type: Uint8Array })
  id: Uint8Array;

  @field({ type: PublicSignKey })
  public federator: PublicSignKey; // The user doing the federating

  @field({ type: PublicSignKey })
  public federated: PublicSignKey; // The user being federated

  constructor(props: { federator: PublicSignKey; federated: PublicSignKey }) {
    this.federator = props.federator;
    this.federated = props.federated;
    // Deterministic ID for easy deletion (un-federate)
    this.id = sha256Sync(concat([this.federator.bytes, this.federated.bytes]));
  }
}

// Indexable version for querying
export class IndexableFederationRelation {
  @field({ type: Uint8Array })
  id: Uint8Array;

  @field({ type: 'string' })
  federator: string;

  @field({ type: 'string' })
  federated: string;

  constructor(relation: FederationRelation) {
    this.id = relation.id;
    this.federator = relation.federator.hashcode();
    this.federated = relation.federated.hashcode();
  }
}

@variant('federations')
export class Federations extends Program {

  @field({ type: Documents })
  db: Documents<FederationRelation, IndexableFederationRelation>;

  constructor() {
    super();
    // A unique, fixed ID for the global federation database
    const federationGraphId = sha256Sync(new TextEncoder().encode('federation-graph'));
    this.db = new Documents({ id: federationGraphId });
  }

  async open(): Promise<void> {
    await this.db.open({
      type: FederationRelation,
      replicate: { factor: 1 }, // Replicate globally

      // SECURITY: Only the federator can create or destroy the relationship.
      canPerform: async (op) => {
        if (op.type === 'put') {
          return op.entry.signatures.find(sig => sig.publicKey.equals(op.value.federator)) != null;
        }
        if (op.type === 'delete') {
          const existing = await this.db.index.get(op.operation.key, { local: true, remote: { strategy: 'fallback' } });
          if (!existing) return false;
          return op.entry.signatures.find(sig => sig.publicKey.equals(existing.federator)) != null;
        }
        return false;
      },

      index: {
        type: IndexableFederationRelation,
        idProperty: 'id',
      },
    });
  }

  // --- Public API ---

  async federate(federatedUser: PublicSignKey) {
    const relation = new FederationRelation({
      federator: this.node.identity.publicKey,
      federated: federatedUser,
    });
    return this.db.put(relation);
  }

  async unFederate(federatedUser: PublicSignKey) {
    const relationId = sha256Sync(concat([this.node.identity.publicKey.bytes, federatedUser.bytes]));
    return this.db.del(relationId);
  }

  // Get all users that I have federated
  async getFederatedBy(publicKey: PublicSignKey): Promise<FederationRelation[]> {
    return this.db.index.search({
      query: new StringMatch({ key: 'federator', value: publicKey.hashcode() }),
    });
  }

  // Get all users that have federated me
  async getFederatorsOf(publicKey: PublicSignKey): Promise<FederationRelation[]> {
    return this.db.index.search({
      query: new StringMatch({ key: 'federated', value: publicKey.hashcode() }),
    });
  }
}


/**
 * Constructs a query that finds content created by a specific user AND all users they federate.
 * @param federationsProgram - The opened Federations program instance.
 * @param profileOwnerKey - The public key of the user whose profile/feed is being viewed.
 * @returns An 'Or' query to use in a search.
 */
export async function getPublicFederatedFeedQuery(
    federationsProgram: Federations,
    profileOwnerKey: PublicSignKey,
): Promise<Or> {
    // 1. Start with the profile owner's public key.
    const keysToInclude = [profileOwnerKey];

    // 2. Fetch all the relations where the profile owner is the 'federator'.
    const federatedRelations = await federationsProgram.getFederatedBy(profileOwnerKey);

    // 3. Add the public keys of the 'federated' users to the list.
    for (const relation of federatedRelations) {
        keysToInclude.push(relation.federated);
    }

    // 4. Build the dynamic "OR" query.
    const query = new Or(
        keysToInclude.map(key => new ByteMatchQuery({
            key: 'publicKey', // The field in 'IndexableCanvas' storing the author's key
            value: key.bytes,
        })),
    );
    
    return query;
}