# Lens SDK Performance Optimization Guide

## Overview
This guide explains the optimizations implemented to achieve consistent sub-3-second load times for the Lens SDK.

## Key Optimizations

### 1. Parallel Store Opening
The original implementation opened 7 stores sequentially, causing cumulative delays. Now all stores open in parallel:
- Access controllers (members, administrators) open first
- Then all data stores open simultaneously
- Reduces initialization time from 7x to ~2x the slowest store

### 2. Query Caching
Each store now includes LRU (Least Recently Used) caching:
- **Releases**: 100 queries, 1MB cache, 60s TTL
- **Featured Releases**: 50 queries, 500KB cache, 2min TTL, aggressive prefetch
- **Categories**: 20 queries, 100KB cache, 1hr TTL (rarely change)

### 3. Connection Pooling
The `OptimizedLensService` maintains a connection pool:
- Reuses existing peer connections
- Avoids repeated handshakes
- 5-minute keepalive for active connections
- Automatic cleanup of stale connections

### 4. Prefetching
Background prefetching warms caches on startup:
- Recent releases
- Featured releases
- Content categories
- Individual release cache warming

### 5. Fast Initialization
Optimized Peerbit configuration:
- Reduced connection timeouts (5s vs 10s)
- Increased parallel dials (10 vs default)
- Client-mode DHT for faster startup
- Minimal initial transports

## Usage Examples

### Basic Usage (with optimizations)
```typescript
import { LensService, MEMBER_SITE_ARGS } from '@riffcc/lens-sdk';

const service = new LensService();
await service.init();
await service.openSite(siteAddress, MEMBER_SITE_ARGS);
```

### Advanced Usage (maximum performance)
```typescript
import { 
  createOptimizedLensService, 
  FAST_MEMBER_SITE_ARGS 
} from '@riffcc/lens-sdk';

// Create service with optimized settings
const service = await createOptimizedLensService('./data', [
  '/dns4/bootstrap1.example.com/tcp/9000/ws/p2p/...',
  '/dns4/bootstrap2.example.com/tcp/9000/ws/p2p/...'
]);

// Open site with prefetching
await service.openSite(siteAddress, FAST_MEMBER_SITE_ARGS, {
  enabled: true,
  releaseCount: 20,
  featuredCount: 10,
  categoryPrefetch: true
});

// Initial data is available immediately
const releases = await service.getReleases({ fetch: 10 });
```

### Progressive Loading (for very large sites)
```typescript
import { OptimizedLensService, PROGRESSIVE_SITE_ARGS } from '@riffcc/lens-sdk';

const service = new OptimizedLensService();
await service.init();

// Start with minimal replication
await service.openSite(siteAddress, PROGRESSIVE_SITE_ARGS);

// Get initial data (from cache/local only)
const initialReleases = await service.getInitialReleases(10);

// Enable full replication after UI loads
await service.enableProgressiveSync(MEMBER_SITE_ARGS);
```

## Performance Expectations

With these optimizations:
- **Cold start**: 2-3 seconds (down from 5-60s)
- **Warm start**: <1 second (cached connections)
- **Query response**: <50ms (cached), <500ms (uncached)

## Configuration Options

### Fast Configurations
- `FAST_MEMBER_SITE_ARGS`: Optimized for members (balanced)
- `FAST_ADMIN_SITE_ARGS`: Optimized for admins (more aggressive)
- `FAST_DEDICATED_SITE_ARGS`: For dedicated nodes (maximum performance)
- `PROGRESSIVE_SITE_ARGS`: Minimal initial sync, load on demand

### Connection Pool Settings
```typescript
{
  maxConnections: 50,      // Maximum pooled connections
  connectionTimeout: 5000, // Connection timeout (ms)
  keepAlive: 300000       // Keep connection alive (ms)
}
```

### Prefetch Settings
```typescript
{
  enabled: true,          // Enable prefetching
  releaseCount: 20,       // Number of releases to prefetch
  featuredCount: 10,      // Number of featured to prefetch
  categoryPrefetch: true  // Prefetch all categories
}
```

## Best Practices

1. **Use `OptimizedLensService` for production**: It includes all performance enhancements
2. **Pre-connect to known peers**: Reduces discovery time
3. **Enable prefetching for read-heavy apps**: Warms caches proactively
4. **Use progressive loading for mobile**: Minimizes initial data transfer
5. **Configure cache TTLs based on your data**: Longer for static content

## Monitoring Performance

```typescript
// Time the initialization
const start = Date.now();
await service.openSite(siteAddress, FAST_MEMBER_SITE_ARGS);
console.log(`Site opened in ${Date.now() - start}ms`);

// Check cache hit rates (in browser console)
// The Peerbit framework logs cache statistics
```