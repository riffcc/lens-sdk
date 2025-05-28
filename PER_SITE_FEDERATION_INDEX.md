# Per-Site Federation INDEX Architecture

## The Key Insight: INDEX, not STORE

The per-site federation INDEX is fundamentally different from a store. It's optimized for **discovery and querying**, not storage.

## What is a Federation INDEX?

Each site maintains its own `PerSiteFederationIndex` that:

1. **Stores lightweight pointers** to content from sites it follows
2. **Allows followed sites to INSERT** their content metadata
3. **Provides rich querying** capabilities via Peerbit's indexing system
4. **Leverages SQLite** for complex queries (via Peerbit's SQLite integration)

## How Lenses Insert Content

When you follow a lens (another site), they can insert `FederationIndexEntry` objects into your index:

```typescript
{
  contentCid: string,      // IPFS CID - the pointer to actual content
  title: string,           // For full-text search
  sourceSiteId: string,    // Which site this came from
  sourceSiteName: string,  // Human-readable source
  contentType: string,     // video, article, podcast, etc.
  categoryId: string,      // For category filtering
  timestamp: number,       // For chronological queries
  description?: string,    // Additional searchable text
  tags: string[],         // For tag-based discovery
}
```

## Key Architectural Benefits

### 1. Lightweight Discovery
- Only metadata is replicated, not full content
- Content stays at source, fetched on-demand via IPFS
- Scales to millions of entries without massive storage

### 2. Rich Querying via Peerbit's Indexing
```typescript
// Full-text search
await index.search('Rust programming')

// Filter by type
await index.getByType('video')

// Complex queries
await index.complexQuery({
  query: 'tutorial',
  contentType: 'video',
  tags: ['programming'],
  afterTimestamp: Date.now() - 86400000
})
```

### 3. Explicit Trust Model
- You control which sites can write to your index
- Grant access: `await index.followSite(siteId)`
- Revoke access: `await index.unfollowSite(siteId)`
- No implicit trust chains

### 4. Scales to 1000+ Sites
As demonstrated in tests:
- 1000 sites × 10 items each = 10,000 entries
- Queries remain fast due to indexing
- No N×N connection complexity
- Each site manages its own index independently

## How This Solves Your Original Problem

You asked about federation at scale with 1000 subscriptions. The per-site INDEX solves this by:

1. **No Direct Connections**: Sites insert into indexes asynchronously
2. **Efficient Queries**: SQLite-backed indexing handles large datasets
3. **Selective Sync**: Only metadata, not full content
4. **Natural Sharding**: Each site's index is independent

## Leveraging Peerbit's SQLite Integration

From the Peerbit docs you linked, the SQLite integration provides:
- Complex queries with multiple conditions
- Full-text search capabilities
- Efficient sorting and pagination
- Aggregation operations

This makes the federation INDEX perfect for content discovery across thousands of federated sources.

## Real-World Usage Pattern

```
1. User's site follows 100 content curators (lenses)
2. Each lens inserts ~50 content pointers daily
3. User's index grows by 5,000 entries/day
4. User can search across all 500,000 entries efficiently
5. Actual content fetched only when user clicks through
```

## Comparison with Other Approaches

### Global Shared Index ❌
- Abuse: Anyone can pollute
- Scale: O(n²) complexity
- Trust: Unclear boundaries

### Direct Replication ❌
- Storage: Full content replicated
- Scale: Exponential growth
- Efficiency: Wasteful

### Per-Site Federation INDEX ✅
- Abuse: Only trusted sites can write
- Scale: O(n) complexity
- Storage: Just pointers
- Trust: Explicit permissions
- Query: Rich search capabilities

## Summary

The per-site federation INDEX is the optimal solution for decentralized content discovery. It combines:
- Peerbit's powerful indexing capabilities
- Lightweight content pointers
- Explicit trust boundaries
- Scalable architecture

This allows sites to maintain their own view of federated content while enabling rich discovery across the entire network.