import { Program } from '@peerbit/program';
import { Documents } from '@peerbit/document';
import { field, variant, option, vec } from '@dao-xyz/borsh';

/**
 * Lightweight pointer for the federation index
 * This is what gets inserted by sites we follow
 */
@variant('federation-index-entry')
export class FederationIndexEntry {
  @field({ type: 'string' })
  contentCid: string;
  
  @field({ type: 'string' })
  title: string;
  
  @field({ type: 'string' })
  sourceSiteId: string;
  
  @field({ type: 'string' })
  sourceSiteName: string;
  
  @field({ type: 'string' })
  contentType: string; // video, audio, document, etc
  
  @field({ type: 'string' })
  categoryId: string;
  
  @field({ type: 'u64' })
  timestamp: number;
  
  @field({ type: option('string') })
  description?: string;
  
  @field({ type: option('string') })
  thumbnailCid?: string;
  
  @field({ type: vec('string') })
  tags: string[];
  
  constructor(props?: {
    contentCid: string;
    title: string;
    sourceSiteId: string;
    sourceSiteName: string;
    contentType: string;
    categoryId: string;
    timestamp: number;
    description?: string;
    thumbnailCid?: string;
    tags?: string[];
  }) {
    this.contentCid = props?.contentCid || '';
    this.title = props?.title || '';
    this.sourceSiteId = props?.sourceSiteId || '';
    this.sourceSiteName = props?.sourceSiteName || '';
    this.contentType = props?.contentType || '';
    this.categoryId = props?.categoryId || '';
    this.timestamp = props?.timestamp || 0;
    this.description = props?.description;
    this.thumbnailCid = props?.thumbnailCid;
    this.tags = props?.tags || [];
  }
}

@variant('indexable-federation-entry')
export class IndexableFederationEntry extends FederationIndexEntry {
  @field({ type: 'string' })
  id: string;
  
  constructor(props?: FederationIndexEntry & { id?: string }) {
    super(props);
    // Unique ID combines source and content
    this.id = props?.id || `${this.sourceSiteId}:${this.contentCid}`;
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
    await this.entries.open({
      type: IndexableFederationEntry,
      replicate: true,
      
      // TODO: Consider using memory index for browser stability
      // For now, use default indexing
      
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
    const indexableEntry = new IndexableFederationEntry({
      ...entry,
      id: `${entry.sourceSiteId}:${entry.contentCid}`
    });
    try {
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
    // For now, return all entries and filter in memory
    // In production, you'd want proper index searching
    const all = await this.entries.index.search({});
    
    // Convert WithContext entries to IndexableFederationEntry
    const converted = all.map(entry => {
      const indexableEntry = new IndexableFederationEntry({
        contentCid: entry.contentCid,
        title: entry.title,
        sourceSiteId: entry.sourceSiteId,
        sourceSiteName: entry.sourceSiteName,
        contentType: entry.contentType,
        categoryId: entry.categoryId,
        timestamp: entry.timestamp,
        description: entry.description,
        thumbnailCid: entry.thumbnailCid,
        tags: entry.tags
      });
      return indexableEntry;
    });
    
    // Filter by query
    const filtered = converted.filter(entry => 
      entry.title.toLowerCase().includes(query.toLowerCase()) ||
      (entry.description && entry.description.toLowerCase().includes(query.toLowerCase()))
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
   * Filter by content type
   */
  async getByType(contentType: string, limit?: number): Promise<IndexableFederationEntry[]> {
    const all = await this.getAllEntries();
    const filtered = all.filter(entry => entry.contentType === contentType);
    return limit ? filtered.slice(0, limit) : filtered;
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
   * Get content by category
   */
  async getByCategory(categoryId: string, limit?: number): Promise<IndexableFederationEntry[]> {
    const all = await this.getAllEntries();
    const filtered = all.filter(entry => entry.categoryId === categoryId);
    return limit ? filtered.slice(0, limit) : filtered;
  }
  
  /**
   * Search by tags (any matching tag)
   */
  async getByTags(tags: string[], limit?: number): Promise<IndexableFederationEntry[]> {
    const all = await this.getAllEntries();
    const filtered = all.filter(entry => 
      entry.tags.some(tag => tags.includes(tag))
    );
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
   * Helper to get all entries
   */
  private async getAllEntries(): Promise<IndexableFederationEntry[]> {
    console.log('[PerSiteFederationIndex] getAllEntries called');
    
    try {
      // Use a simple search to get all entries
      const results = await this.entries.index.search({});
      console.log('[PerSiteFederationIndex] search results:', results?.length || 0, 'entries');
      
      // Convert WithContext<FederationIndexEntry> to IndexableFederationEntry
      const converted = results.map(entry => {
        return new IndexableFederationEntry({
          contentCid: entry.contentCid,
          title: entry.title,
          sourceSiteId: entry.sourceSiteId,
          sourceSiteName: entry.sourceSiteName,
          contentType: entry.contentType,
          categoryId: entry.categoryId,
          timestamp: entry.timestamp,
          description: entry.description,
          thumbnailCid: entry.thumbnailCid,
          tags: entry.tags
        });
      });
      
      console.log('[PerSiteFederationIndex] converted entries:', converted.length);
      return converted;
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
    contentType?: string;
    sourceSiteId?: string;
    categoryId?: string;
    tags?: string[];
    afterTimestamp?: number;
    beforeTimestamp?: number;
    limit?: number;
    offset?: number;
  }): Promise<IndexableFederationEntry[]> {
    let results = await this.getAllEntries();
    
    // Apply filters
    if (params.query) {
      const query = params.query.toLowerCase();
      results = results.filter(entry => 
        entry.title.toLowerCase().includes(query) ||
        (entry.description && entry.description.toLowerCase().includes(query))
      );
    }
    
    if (params.contentType) {
      results = results.filter(entry => entry.contentType === params.contentType);
    }
    
    if (params.sourceSiteId) {
      results = results.filter(entry => entry.sourceSiteId === params.sourceSiteId);
    }
    
    if (params.categoryId) {
      results = results.filter(entry => entry.categoryId === params.categoryId);
    }
    
    if (params.tags && params.tags.length > 0) {
      results = results.filter(entry => 
        entry.tags.some(tag => params.tags!.includes(tag))
      );
    }
    
    // Post-filter for timestamp ranges
    if (params.afterTimestamp || params.beforeTimestamp) {
      results = results.filter(entry => {
        if (params.afterTimestamp && entry.timestamp < params.afterTimestamp) return false;
        if (params.beforeTimestamp && entry.timestamp > params.beforeTimestamp) return false;
        return true;
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
    entriesByType: Map<string, number>;
    oldestEntry?: IndexableFederationEntry;
    newestEntry?: IndexableFederationEntry;
  }> {
    const all = await this.getAllEntries();
    
    const entriesBySite = new Map<string, number>();
    const entriesByType = new Map<string, number>();
    
    for (const entry of all) {
      entriesBySite.set(entry.sourceSiteId, (entriesBySite.get(entry.sourceSiteId) || 0) + 1);
      entriesByType.set(entry.contentType, (entriesByType.get(entry.contentType) || 0) + 1);
    }
    
    const sorted = all.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      totalEntries: all.length,
      entriesBySite,
      entriesByType,
      oldestEntry: sorted[0],
      newestEntry: sorted[sorted.length - 1]
    };
  }
}