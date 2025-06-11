# Federation Index Entry Size Analysis

## FederationIndexEntry Structure (200 bytes)

The `FederationIndexEntry` achieves ~200-byte compression through careful field selection and Borsh serialization:

### Field Breakdown:

1. **contentCID** (string): ~46 bytes
   - IPFS CID (Content Identifier) 
   - Example: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"

2. **title** (string): ~20-50 bytes (variable)
   - Display name of the content
   - Example: "Big Buck Bunny"

3. **thumbnailCID** (option<string>): ~0 or 47 bytes
   - Optional IPFS CID for thumbnail
   - 1 byte for option flag + 46 bytes if present

4. **coverCID** (option<string>): ~0 or 47 bytes  
   - Optional IPFS CID for cover/banner image
   - 1 byte for option flag + 46 bytes if present

5. **categoryId** (string): ~10-20 bytes
   - Category slug (e.g., 'movie', 'music', 'documentary')

6. **sourceSiteId** (string): ~46 bytes
   - Site address/ID that published the content

7. **timestamp** (u64): 8 bytes
   - Publication timestamp as 64-bit unsigned integer

8. **isFeatured** (bool): 1 byte
   - Boolean flag for featured status

9. **isPromoted** (bool): 1 byte
   - Boolean flag for promoted status

10. **featuredUntil** (option<u64>): ~0 or 9 bytes
    - Optional expiration timestamp for featuring
    - 1 byte for option flag + 8 bytes if present

11. **promotedUntil** (option<u64>): ~0 or 9 bytes
    - Optional expiration timestamp for promotion
    - 1 byte for option flag + 8 bytes if present

### Total Size Calculation:

**Minimum (no optionals):**
- contentCID: 46 bytes
- title: 20 bytes
- thumbnailCID: 1 byte (none)
- coverCID: 1 byte (none)
- categoryId: 10 bytes
- sourceSiteId: 46 bytes
- timestamp: 8 bytes
- isFeatured: 1 byte
- isPromoted: 1 byte
- featuredUntil: 1 byte (none)
- promotedUntil: 1 byte (none)
- **Total: ~136 bytes**

**Typical (with thumbnail):**
- contentCID: 46 bytes
- title: 30 bytes
- thumbnailCID: 47 bytes
- coverCID: 1 byte (none)
- categoryId: 15 bytes
- sourceSiteId: 46 bytes
- timestamp: 8 bytes
- isFeatured: 1 byte
- isPromoted: 1 byte
- featuredUntil: 1 byte (none)
- promotedUntil: 1 byte (none)
- **Total: ~197 bytes**

**Maximum (all fields):**
- contentCID: 46 bytes
- title: 50 bytes
- thumbnailCID: 47 bytes
- coverCID: 47 bytes
- categoryId: 20 bytes
- sourceSiteId: 46 bytes
- timestamp: 8 bytes
- isFeatured: 1 byte
- isPromoted: 1 byte
- featuredUntil: 9 bytes
- promotedUntil: 9 bytes
- **Total: ~284 bytes**

## Compression vs Full Release Object

The full `Release` object includes:
- All FederationIndexEntry fields
- Full metadata JSON string (can be 1KB-50KB+)
- Federation tracking fields
- UUID identifiers
- Additional timestamps and author information

### Key Compression Strategies:

1. **Metadata Extraction**: Instead of storing full metadata JSON (potentially KB of data), the federation index extracts only essential display fields (title, thumbnailCID, coverCID)

2. **CID References**: Uses content-addressed IPFS CIDs instead of embedding actual content

3. **Efficient Encoding**: Borsh serialization provides compact binary encoding

4. **Optional Fields**: Uses option types to avoid storing empty values

5. **No Duplication**: Stores only pointers to content, not the content itself

### Result:
- **Full Release object**: ~1-50KB (depending on metadata)
- **FederationIndexEntry**: ~200 bytes average
- **Compression ratio**: 5-250x reduction in size

This allows sites to efficiently index thousands of federated content items without significant storage overhead.