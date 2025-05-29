import { Program } from '@peerbit/program';
import { Documents, SearchRequest, Sort, SortDirection, BoolQuery } from '@peerbit/document';
import { field, variant, option, vec } from '@dao-xyz/borsh';


/**
 * Lightweight pointer for the federation index
 * This is what gets inserted by sites we follow
 * Minimal data for efficient storage and sync
 */
@variant('federation-index-entry')
export class FederationIndexEntry {
  @field({ type: 'string' })
  contentCID: string = ''; // IPFS CID - for loading the content
  
  @field({ type: 'string' })
  title: string = ''; // Display name
  
  @field({ type: option('string') })
  thumbnailCID?: string; // For visual display
  
  @field({ type: option('string') })
  coverCID?: string; // Cover/banner image (from metadata)
  
  @field({ type: 'string' })
  categoryId: string = ''; // Category slug (e.g., 'movie', 'music', 'documentary')
  
  @field({ type: 'string' })
  sourceSiteId: string = ''; // Original creator/author of the content
  
  @field({ type: 'u64' })
  timestamp: number = 0; // When it was published
  
  @field({ type: 'bool' })
  isFeatured: boolean = false;
  
  @field({ type: 'bool' })
  isPromoted: boolean = false;
  
  @field({ type: option('u64') })
  featuredUntil?: number; // Timestamp when featuring expires
  
  @field({ type: option('u64') })
  promotedUntil?: number; // Timestamp when promotion expires
  
  constructor(props?: {
    contentCID: string;
    title: string;
    thumbnailCID?: string;
    coverCID?: string;
    categoryId: string;
    sourceSiteId: string;
    timestamp: number | bigint;
    isFeatured?: boolean;
    isPromoted?: boolean;
    featuredUntil?: number | bigint;
    promotedUntil?: number | bigint;
  }) {
    // IMPORTANT: Ensure all required fields are initialized
    this.contentCID = props?.contentCID ?? '';
    this.title = props?.title ?? '';
    this.thumbnailCID = props?.thumbnailCID;
    this.coverCID = props?.coverCID;
    this.categoryId = props?.categoryId ?? '';
    this.sourceSiteId = props?.sourceSiteId ?? '';
    this.timestamp = typeof props?.timestamp === 'bigint' ? Number(props.timestamp) : (props?.timestamp ?? Date.now());
    this.isFeatured = Boolean(props?.isFeatured ?? false);
    this.isPromoted = Boolean(props?.isPromoted ?? false);
    this.featuredUntil = props?.featuredUntil ? (typeof props.featuredUntil === 'bigint' ? Number(props.featuredUntil) : props.featuredUntil) : undefined;
    this.promotedUntil = props?.promotedUntil ? (typeof props.promotedUntil === 'bigint' ? Number(props.promotedUntil) : props.promotedUntil) : undefined;
  }
}

@variant('indexable-federation-entry')
export class IndexableFederationEntry {
  @field({ type: 'string' })
  id: string = '';
  
  @field({ type: 'string' })
  contentCID: string = ''; // IPFS CID - for loading the content
  
  @field({ type: 'string' })
  title: string = ''; // Display name
  
  @field({ type: option('string') })
  thumbnailCID?: string; // For visual display
  
  @field({ type: option('string') })
  coverCID?: string; // Cover/banner image (from metadata)
  
  @field({ type: 'string' })
  categoryId: string = ''; // Category slug (e.g., 'movie', 'music', 'documentary')
  
  @field({ type: 'string' })
  sourceSiteId: string = ''; // Original creator/author of the content
  
  @field({ type: 'u64' })
  timestamp: number = 0; // When it was published
  
  @field({ type: 'bool' })
  isFeatured: boolean = false;
  
  @field({ type: 'bool' })
  isPromoted: boolean = false;
  
  @field({ type: option('u64') })
  featuredUntil?: number; // Timestamp when featuring expires
  
  @field({ type: option('u64') })
  promotedUntil?: number; // Timestamp when promotion expires
  
  constructor(props?: FederationIndexEntry & { id?: string }) {
    if (props) {
      this.contentCID = props.contentCID ?? '';
      this.title = props.title ?? '';
      this.thumbnailCID = props.thumbnailCID;
      this.coverCID = props.coverCID;
      this.categoryId = props.categoryId ?? '';
      this.sourceSiteId = props.sourceSiteId ?? '';
      this.timestamp = typeof props.timestamp === 'bigint' ? Number(props.timestamp) : (props.timestamp ?? Date.now());
      this.isFeatured = Boolean(props.isFeatured ?? false);
      this.isPromoted = Boolean(props.isPromoted ?? false);
      this.featuredUntil = props.featuredUntil ? (typeof props.featuredUntil === 'bigint' ? Number(props.featuredUntil) : props.featuredUntil) : undefined;
      this.promotedUntil = props.promotedUntil ? (typeof props.promotedUntil === 'bigint' ? Number(props.promotedUntil) : props.promotedUntil) : undefined;
      this.id = props.id ?? `${this.sourceSiteId}:${this.contentCID}`;
    }
  }
}

/**
 * Per-Site Federation Index
 * 
 * This is THE federation index for a site. It:
 * 1. Stores lightweight pointers to content from sites we follow
 * 2. Allows followed sites to insert their content pointers
 * 3. Provides sophisticated querying across all federated content
 * 4. Leverages Peerbit's indexing system (in-memory or SQLite)
 * 
 * Key insight: This is an INDEX, not a store. It's optimized for
 * discovery and querying, not for storing full content.
 */
@variant('per-site-federation-index')
export class PerSiteFederationIndex extends Program {
  @field({ type: Documents })
  entries: Documents<IndexableFederationEntry>;
  
  @field({ type: vec('string') })
  followedSites: string[]; // Sites that can write to our index
  
  @field({ type: 'string' })
  siteName: string;
  
  constructor(siteName?: string) {
    super();
    this.entries = new Documents();
    this.followedSites = [];
    this.siteName = siteName || 'Unnamed Site';
  }
  
  async open(): Promise<void> {
    console.log('[PerSiteFederationIndex] Opening entries store...');
    await this.entries.open({
      type: IndexableFederationEntry,
      replicate: true,
      canOpen: () => true, // Required for nested Programs with Documents
      
      // Provide explicit id resolver
      id: (entry: IndexableFederationEntry) => {
        console.log('[PerSiteFederationIndex] id resolver called for entry:', entry);
        return entry.id;
      },
      
      // Access control: only we and followed sites can write
      canPerform: async (operation: any) => {
        const context = operation.context;
        
        // Log the operation for debugging
        console.log('[PerSiteFederationIndex] canPerform check:', {
          hasContext: !!context,
          hasAuthor: !!context?.author,
          isOwner: !context?.author || context.author.equals(this.node.identity.publicKey),
          authorKey: context?.author?.toString(),
          followedSites: this.followedSites,
          operationType: operation.type,
        });
        
        // Always allow the owner to write to their own index
        // This is essential for indexing local releases
        if (!context?.author || context.author.equals(this.node.identity.publicKey)) {
          console.log('[PerSiteFederationIndex] Allowing write - owner');
          return true;
        }
        
        // IMPORTANT: In production, you would:
        // 1. Extract the sourceSiteId from the entry being inserted
        // 2. Verify that the writer owns that site (e.g., by checking
        //    that they control the site's program address)
        // 3. Only allow the write if they're inserting content from
        //    their own site AND we follow that site
        //
        // For MVP/testing, we allow writes from followed sites
        // This is a trust-based approach suitable for testing
        
        // Check if writer's public key is in our followed sites list
        const writerKey = context.author.toString();
        if (writerKey && this.followedSites.includes(writerKey)) {
          console.log('[PerSiteFederationIndex] Allowing write - followed site');
          return true;
        }
        
        console.log('[PerSiteFederationIndex] Denying write - not authorized');
        return false;
      }
    });
    console.log('[PerSiteFederationIndex] Entries store opened successfully');
  }
  
  /**
   * Follow a site - grant them write access to our index
   * @param siteId The site address
   * @param sitePublicKey The public key of the site owner
   */
  async followSite(siteId: string, sitePublicKey?: string): Promise<void> {
    // Store the public key if provided, otherwise store the siteId
    const keyToStore = sitePublicKey || siteId;
    if (!this.followedSites.includes(keyToStore)) {
      this.followedSites.push(keyToStore);
      console.log(`${this.siteName} now follows ${siteId}`);
    }
  }
  
  /**
   * Unfollow a site - revoke their write access
   */
  async unfollowSite(siteId: string): Promise<void> {
    const index = this.followedSites.indexOf(siteId);
    if (index > -1) {
      this.followedSites.splice(index, 1);
      console.log(`${this.siteName} unfollowed ${siteId}`);
    }
  }
  
  /**
   * Insert content into the index (for followed sites to call)
   */
  async insertContent(entry: FederationIndexEntry): Promise<void> {
    console.log('[PerSiteFederationIndex] insertContent called for:', entry.title);
    
    // Check if entries is properly initialized
    if (!this.entries) {
      throw new Error('Federation index entries not initialized');
    }
    
    if (!this.entries.put) {
      console.error('[PerSiteFederationIndex] entries object:', this.entries);
      throw new Error('Federation index entries.put is not a function');
    }
    
    const indexableEntry = new IndexableFederationEntry({
      contentCID: entry.contentCID,
      title: entry.title,
      thumbnailCID: entry.thumbnailCID,
      coverCID: entry.coverCID,
      categoryId: entry.categoryId,
      sourceSiteId: entry.sourceSiteId,
      timestamp: typeof entry.timestamp === 'bigint' ? Number(entry.timestamp) : entry.timestamp,
      isFeatured: Boolean(entry.isFeatured),
      isPromoted: Boolean(entry.isPromoted),
      featuredUntil: entry.featuredUntil ? (typeof entry.featuredUntil === 'bigint' ? Number(entry.featuredUntil) : entry.featuredUntil) : undefined,
      promotedUntil: entry.promotedUntil ? (typeof entry.promotedUntil === 'bigint' ? Number(entry.promotedUntil) : entry.promotedUntil) : undefined,
      id: `${entry.sourceSiteId}:${entry.contentCID}`
    });
    try {
      // Debug: Check all fields before put
      console.log('[PerSiteFederationIndex] About to put entry:', {
        hasContentCID: !!indexableEntry.contentCID,
        contentCID: indexableEntry.contentCID,
        hasTitle: !!indexableEntry.title,
        title: indexableEntry.title,
        hasSourceSiteId: !!indexableEntry.sourceSiteId,
        sourceSiteId: indexableEntry.sourceSiteId,
        hasTimestamp: !!indexableEntry.timestamp,
        timestamp: indexableEntry.timestamp,
        hasId: !!indexableEntry.id,
        id: indexableEntry.id,
      });
      
      await this.entries.put(indexableEntry);
      console.log('[PerSiteFederationIndex] Successfully inserted:', indexableEntry.id);
    } catch (error) {
      console.error('[PerSiteFederationIndex] Failed to insert:', error);
      throw error;
    }
  }
  
  /**
   * Remove content from the index
   */
  async removeContent(id: string): Promise<void> {
    await this.entries.del(id);
  }
  
  /**
   * QUERYING METHODS - This is where the index shines
   */
  
  /**
   * Full-text search across title and description
   */
  async search(query: string, options?: {
    limit?: number;
    offset?: number;
    sortBy?: 'timestamp' | 'title';
    sortDirection?: 'asc' | 'desc';
  }): Promise<IndexableFederationEntry[]> {
    // Use getAllEntries which now uses iterate
    const all = await this.getAllEntries();
    
    // Filter by query - search in title only now
    const filtered = all.filter(entry => 
      entry.title.toLowerCase().includes(query.toLowerCase())
    );
    
    // Sort if requested
    if (options?.sortBy) {
      filtered.sort((a, b) => {
        const aVal = (a as any)[options.sortBy!];
        const bVal = (b as any)[options.sortBy!];
        const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return options.sortDirection === 'desc' ? -result : result;
      });
    }
    
    // Apply offset and limit
    const start = options?.offset || 0;
    const end = options?.limit ? start + options.limit : undefined;
    return filtered.slice(start, end);
  }
  
  /**
   * Get all content from a specific site
   */
  async getBySite(sourceSiteId: string, limit?: number): Promise<IndexableFederationEntry[]> {
    const all = await this.getAllEntries();
    const filtered = all.filter(entry => entry.sourceSiteId === sourceSiteId);
    return limit ? filtered.slice(0, limit) : filtered;
  }
  
  /**
   * Get recent content (chronological feed)
   */
  async getRecent(limit: number = 50, offset: number = 0): Promise<IndexableFederationEntry[]> {
    console.log('[PerSiteFederationIndex] getRecent called with limit:', limit, 'offset:', offset);
    const all = await this.getAllEntries();
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
    const result = sorted.slice(offset, offset + limit);
    console.log('[PerSiteFederationIndex] getRecent returning', result.length, 'entries');
    return result;
  }
  
  /**
   * Get featured content (that hasn't expired)
   */
  async getFeatured(limit?: number): Promise<IndexableFederationEntry[]> {
    const now = Date.now();
    console.log('[PerSiteFederationIndex] getFeatured called, now:', now);
    
    try {
      // Search specifically for featured entries
      const request = new SearchRequest({
        query: [
          new BoolQuery({
            value: true,
            key: 'isFeatured',
          }),
        ],
        sort: [new Sort({ key: 'timestamp', direction: SortDirection.DESC })],
      });
      
      // Use fetch parameter for more than 10 results
      (request as any).fetch = limit || 100;
      
      console.log('[PerSiteFederationIndex] Searching for featured entries...');
      const results = await this.entries.index.search(request);
      console.log('[PerSiteFederationIndex] Featured search results:', results?.length || 0);
      
      if (!results || results.length === 0) {
        console.log('[PerSiteFederationIndex] No featured entries found');
        return [];
      }
      
      // Filter out expired featured items
      const nonExpired = results.filter(entry => {
        const isExpired = entry.featuredUntil && entry.featuredUntil <= now;
        console.log('[PerSiteFederationIndex] Featured entry:', entry.title, 'expired:', isExpired, 'featuredUntil:', entry.featuredUntil);
        return !isExpired;
      });
      
      console.log('[PerSiteFederationIndex] Non-expired featured entries:', nonExpired.length);
      return nonExpired as IndexableFederationEntry[];
    } catch (error) {
      console.error('[PerSiteFederationIndex] Error getting featured entries:', error);
      return [];
    }
  }
  
  /**
   * Get promoted content (that hasn't expired)
   */
  async getPromoted(limit?: number): Promise<IndexableFederationEntry[]> {
    const now = Date.now();
    
    try {
      // Search specifically for promoted entries
      const request = new SearchRequest({
        query: [
          new BoolQuery({
            value: true,
            key: 'isPromoted',
          }),
        ],
        sort: [new Sort({ key: 'timestamp', direction: SortDirection.DESC })],
      });
      
      // Use fetch parameter for more than 10 results
      (request as any).fetch = limit || 100;
      
      const results = await this.entries.index.search(request);
      
      if (!results || results.length === 0) {
        return [];
      }
      
      // Filter out expired promoted items
      const nonExpired = results.filter(entry => 
        !entry.promotedUntil || entry.promotedUntil > now
      );
      
      return nonExpired as IndexableFederationEntry[];
    } catch (error) {
      console.error('[PerSiteFederationIndex] Error getting promoted entries:', error);
      return [];
    }
  }
  
  /**
   * Get content by category
   */
  async getByCategory(categoryId: string, limit?: number, offset: number = 0): Promise<IndexableFederationEntry[]> {
    const all = await this.getAllEntries();
    const filtered = all.filter(entry => entry.categoryId === categoryId);
    // Sort by timestamp descending (most recent first)
    const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
  }
  
  /**
   * Helper to get all entries
   */
  async getAllEntries(): Promise<IndexableFederationEntry[]> {
    console.log('[PerSiteFederationIndex] getAllEntries called');
    
    try {
      // Use iterator to get all entries more reliably
      console.log('[PerSiteFederationIndex] Using iterator to get entries...');
      const allEntries: IndexableFederationEntry[] = [];
      const iterator = this.entries.index.iterate(new SearchRequest({}));
      
      while (iterator.done() !== true) {
        const batch = await iterator.next(100);
        console.log('[PerSiteFederationIndex] Iterator batch:', batch.length, 'entries');
        
        for (const item of batch) {
          // Check if item has value property (wrapped result)
          const entry = (item as any).value || item;
          if (entry instanceof IndexableFederationEntry) {
            allEntries.push(entry);
          }
        }
      }
      
      console.log('[PerSiteFederationIndex] Total entries found:', allEntries.length);
      return allEntries;
    } catch (error: any) {
      console.error('[PerSiteFederationIndex] Error getting entries:', error);
      // Return empty array on database corruption
      if (error?.message?.includes('SQLITE_CORRUPT')) {
        console.error('[PerSiteFederationIndex] Database corruption detected. Please clear browser storage and reload.');
      }
      return [];
    }
  }
  
  /**
   * Complex query combining multiple filters
   */
  async complexQuery(params: {
    query?: string;
    sourceSiteId?: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
    isFeatured?: boolean;
    isPromoted?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<IndexableFederationEntry[]> {
    let results = await this.getAllEntries();
    
    // Apply filters
    if (params.query) {
      const query = params.query.toLowerCase();
      results = results.filter(entry => 
        entry.title.toLowerCase().includes(query)
      );
    }
    
    if (params.sourceSiteId) {
      results = results.filter(entry => entry.sourceSiteId === params.sourceSiteId);
    }
    
    // Post-filter for timestamp ranges
    if (params.afterTimestamp || params.beforeTimestamp) {
      results = results.filter(entry => {
        if (params.afterTimestamp && entry.timestamp < params.afterTimestamp) return false;
        if (params.beforeTimestamp && entry.timestamp > params.beforeTimestamp) return false;
        return true;
      });
    }
    
    // Filter by featured/promoted status
    if (params.isFeatured !== undefined) {
      const now = Date.now();
      results = results.filter(entry => {
        if (params.isFeatured) {
          return entry.isFeatured && (!entry.featuredUntil || entry.featuredUntil > now);
        } else {
          return !entry.isFeatured || (entry.featuredUntil && entry.featuredUntil <= now);
        }
      });
    }
    
    if (params.isPromoted !== undefined) {
      const now = Date.now();
      results = results.filter(entry => {
        if (params.isPromoted) {
          return entry.isPromoted && (!entry.promotedUntil || entry.promotedUntil > now);
        } else {
          return !entry.isPromoted || (entry.promotedUntil && entry.promotedUntil <= now);
        }
      });
    }
    
    // Apply offset and limit
    const start = params.offset || 0;
    const end = params.limit ? start + params.limit : undefined;
    return results.slice(start, end);
  }
  
  /**
   * Get statistics about the index
   */
  async getStats(): Promise<{
    totalEntries: number;
    entriesBySite: Map<string, number>;
    oldestEntry?: IndexableFederationEntry;
    newestEntry?: IndexableFederationEntry;
  }> {
    const all = await this.getAllEntries();
    
    const entriesBySite = new Map<string, number>();
    
    for (const entry of all) {
      entriesBySite.set(entry.sourceSiteId, (entriesBySite.get(entry.sourceSiteId) || 0) + 1);
    }
    
    const sorted = all.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      totalEntries: all.length,
      entriesBySite,
      oldestEntry: sorted[0],
      newestEntry: sorted[sorted.length - 1]
    };
  }
}