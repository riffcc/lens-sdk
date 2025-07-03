// Proposed new file: follows.ts

import { field, variant } from '@dao-xyz/borsh';
import { PublicSignKey, sha256Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';
import { Program } from '@peerbit/program';
import { Documents, StringMatch } from '@peerbit/document';

@variant(0)
export class FollowRelation {
    // We need a unique ID for each relation to be able to delete it (unfollow).
    // A hash of the follower and followee keys makes it deterministic.
    @field({ type: Uint8Array })
    id: Uint8Array;

    @field({ type: PublicSignKey })
    public follower: PublicSignKey; // The key of the user doing the following

    @field({ type: PublicSignKey })
    public followee: PublicSignKey; // The key of the user being followed

    constructor(props: { follower: PublicSignKey; followee: PublicSignKey }) {
        this.follower = props.follower;
        this.followee = props.followee;
        this.id = sha256Sync(concat([this.follower.bytes, this.followee.bytes]));
    }
}

// An indexable version for efficient querying
export class IndexableFollowRelation {
    @field({ type: Uint8Array })
    id: Uint8Array;

    @field({ type: 'string' })
    follower: string; // Storing as hash strings for fast lookups

    @field({ type: 'string' })
    followee: string;

    constructor(relation: FollowRelation) {
        this.id = relation.id;
        this.follower = relation.follower.hashcode();
        this.followee = relation.followee.hashcode();
    }
}


@variant('follows')
export class Follows extends Program {

    @field({ type: Documents })
    db: Documents<FollowRelation, IndexableFollowRelation>;

    constructor() {
        super();
        // Use a fixed ID so all users open the same social graph database
        const socialGraphId = sha256Sync(new TextEncoder().encode('social-graph'));
        this.db = new Documents({ id: socialGraphId });
    }

    async open(): Promise<void> {
        await this.db.open({
            type: FollowRelation,
            replicate: { factor: 1 }, // Replicate globally
            
            // This is the most critical part for security
            canPerform: async (op) => {
                if (op.type === 'put') {
                    // Only the follower can create a follow relationship
                    return op.entry.signatures.find(sig => sig.publicKey.equals(op.value.follower)) != null;
                }
                if(op.type === 'delete') {
                    // To delete, we need to know who the follower was.
                    // We fetch the existing document to check.
                    const existing = await this.db.index.get(op.operation.key, { local: true, remote: { strategy: 'fallback' } });
                    if (!existing) return false; // Can't delete what doesn't exist

                    // Only the original follower can delete the relationship
                    return op.entry.signatures.find(sig => sig.publicKey.equals(existing.follower)) != null;
                }
                return false;
            },

            // Indexing for fast queries
            index: {
                type: IndexableFollowRelation,
                idProperty: 'id',
            },
        });
    }

    // --- Public API for the Follows Program ---

    async follow(followee: PublicSignKey) {
        const relation = new FollowRelation({
            follower: this.node.identity.publicKey,
            followee: followee,
        });
        return this.db.put(relation);
    }

    async unfollow(followee: PublicSignKey) {
        // Calculate the deterministic ID to delete the specific relation
        const relationId = sha256Sync(concat([this.node.identity.publicKey.bytes, followee.bytes]));
        return this.db.del(relationId);
    }

    async getFollowers(publicKey: PublicSignKey): Promise<FollowRelation[]> {
        return this.db.index.search({
            query: new StringMatch({ key: 'followee', value: publicKey.hashcode() }),
        });
    }

    async getFollowing(publicKey: PublicSignKey): Promise<FollowRelation[]> {
        return this.db.index.search({
            query: new StringMatch({ key: 'follower', value: publicKey.hashcode() }),
        });
    }
}