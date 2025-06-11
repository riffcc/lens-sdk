# Per-Site Federation Architecture

## Overview

This document describes the per-site federation architecture implemented for the Lens SDK, based on our testing and analysis.

## Key Architectural Decision: Per-Site Federation Stores

After extensive testing and analysis, we've determined that a **per-site federation store** approach is superior to a global shared index for the following reasons:

### 1. Ownership and Control
- Each site maintains complete control over what content it federates
- No shared global state that can be abused or polluted
- Clear boundaries of responsibility

### 2. Trust Management
- Explicit trust relationships through delegated write permissions
- Sites grant write access only to sites they follow/trust
- Trust can be revoked at any time
- No implicit trust chains or transitive trust issues

### 3. Scalability
- O(1) write complexity per site (vs O(n) for global index)
- Natural sharding by site ownership
- No single bottleneck or coordination overhead
- Linear scaling with number of sites

### 4. Abuse Prevention
- Malicious actors can only affect sites that explicitly trust them
- No way to spam or pollute the entire network
- Limited blast radius for any security issues

## Implementation Components

### 1. Site Federation Store
Each site maintains its own `SiteFederationStore` containing:
- `federatedContent`: Documents store with federated content pointers
- `trustedFederators`: IdentityAccessController managing write permissions

### 2. Site Federation Index
Complementary to the store, the `SiteFederationIndex` provides:
- Lightweight content pointers for efficient discovery
- Delegated write permissions for followed sites
- Unified search across all federated content
- Leverages Peerbit's sophisticated indexing (in-memory/SQLite)

### 3. Content Pointers
Instead of replicating full content, sites store lightweight pointers:
```typescript
{
  contentCid: string,      // IPFS CID of actual content
  title: string,           // For search/display
  sourceSiteId: string,    // Original content owner
  sourceSiteName: string,  // Human-readable source
  federatedAt: number,     // When federated
  contentType?: string,    // video, audio, document, etc.
}
```

## How Federation Works

### Following a Site
1. Site A decides to follow Site B
2. Site A grants write permission to Site B's public key
3. Site B can now insert content pointers into Site A's federation index
4. Site A's users can discover Site B's content through search

### Content Discovery
1. User searches Site A's federation index
2. Results include content from all sites A follows
3. Actual content is fetched from IPFS using the CID
4. Source attribution is maintained

### Unfollowing
1. Site A revokes write permission from Site B
2. Site B can no longer add new content to A's index
3. Existing content pointers can be removed if desired

## Comparison with Alternative Approaches

### Global Shared Index (Rejected)
- **Problem**: Shared ownership creates conflicts and abuse vectors
- **Problem**: Complex trust chains difficult to reason about
- **Problem**: O(n) write complexity as network grows
- **Problem**: One-size-fits-all policies don't work for diverse communities

### Direct Replication (Rejected)
- **Problem**: Too heavy - replicates full content instead of pointers
- **Problem**: Storage requirements grow exponentially
- **Problem**: Difficult to maintain consistency

### DirectSub Only (Rejected)
- **Problem**: Ephemeral - no persistence of federation state
- **Problem**: Requires all sites to be online simultaneously
- **Problem**: No historical view of federated content

## Benefits for Users

1. **Curated Content**: Each site curates what it federates
2. **Fast Discovery**: Efficient search across all followed sites
3. **Decentralized**: No central authority or single point of failure
4. **Flexible Policies**: Each site can have different federation rules
5. **Transparent**: Clear view of where content comes from

## Technical Implementation

The implementation leverages Peerbit's capabilities:
- **Documents stores** for persistent, replicated storage
- **IdentityAccessController** for trust delegation
- **Built-in indexing** for efficient queries
- **Adaptive sharding** for scalability

## Real-World Parallels

This architecture mirrors successful federated systems:
- **Mastodon**: Each instance maintains its own view of the fediverse
- **Matrix**: Homeservers maintain their own state and federation decisions
- **Email**: Mail servers decide which other servers to accept mail from

## Conclusion

The per-site federation architecture provides a scalable, abuse-resistant, and flexible foundation for decentralized content federation. By giving each site control over its own federation decisions, we enable diverse communities to connect while maintaining their autonomy.