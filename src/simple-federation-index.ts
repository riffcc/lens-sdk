import { Program } from '@peerbit/program';
import { Documents, SearchRequest, StringMatch, StringMatchMethod, Sort, SortDirection } from '@peerbit/document';
import { field, variant, vec } from '@dao-xyz/borsh';

/**
 * Simplified Federation Index Entry
 * Lightweight pointer that gets inserted by followed sites
 */
@variant('simple-index-entry')
export class SimpleIndexEntry {
  @field({ type: 'string' })
  contentCid: string;
  
  @field({ type: 'string' })
  title: string;
  
  @field({ type: 'string' })
  sourceSiteId: string;
  
  @field({ type: 'string' })
  sourceSiteName: string;
  
  @field({ type: 'string' })
  contentType: string;
  
  @field({ type: 'u64' })
  timestamp: bigint;
  
  @field({ type: vec('string') })
  tags: string[];
  
  constructor(props?: {
    contentCid: string;
    title: string;
    sourceSiteId: string;
    sourceSiteName: string;
    contentType: string;
    timestamp: number;
    tags?: string[];
  }) {
    if (props) {
      this.contentCid = props.contentCid;
      this.title = props.title;
      this.sourceSiteId = props.sourceSiteId;
      this.sourceSiteName = props.sourceSiteName;
      this.contentType = props.contentType;
      this.timestamp = BigInt(props.timestamp);
      this.tags = props.tags || [];
    } else {
      // Initialize with default values
      this.contentCid = '';
      this.title = '';
      this.sourceSiteId = '';
      this.sourceSiteName = '';
      this.contentType = '';
      this.timestamp = 0n;
      this.tags = [];
    }
  }
}

@variant('indexable-simple-entry')
export class IndexableSimpleEntry {
  @field({ type: 'string' })
  id: string;
  
  @field({ type: 'string' })
  contentCid: string;
  
  @field({ type: 'string' })
  title: string;
  
  @field({ type: 'string' })
  sourceSiteId: string;
  
  @field({ type: 'string' })
  sourceSiteName: string;
  
  @field({ type: 'string' })
  contentType: string;
  
  @field({ type: 'u64' })
  timestamp: bigint;
  
  @field({ type: vec('string') })
  tags: string[];
  
  constructor(entry?: SimpleIndexEntry & { id?: string }) {
    if (entry) {
      this.id = entry.id || `${entry.sourceSiteId}:${entry.contentCid}`;
      this.contentCid = entry.contentCid;
      this.title = entry.title;
      this.sourceSiteId = entry.sourceSiteId;
      this.sourceSiteName = entry.sourceSiteName;
      this.contentType = entry.contentType;
      this.timestamp = entry.timestamp;
      this.tags = entry.tags || [];
    } else {
      // Initialize with default values
      this.id = '';
      this.contentCid = '';
      this.title = '';
      this.sourceSiteId = '';
      this.sourceSiteName = '';
      this.contentType = '';
      this.timestamp = 0n;
      this.tags = [];
    }
  }
}

/**
 * Simple Per-Site Federation Index
 * 
 * Demonstrates the core concept without complex access control
 * In production, would use IdentityAccessController
 */
@variant('simple-federation-index')
export class SimpleFederationIndex extends Program {
  @field({ type: Documents })
  entries: Documents<IndexableSimpleEntry>;
  
  @field({ type: vec('string') })
  followedSites: string[];
  
  @field({ type: 'string' })
  siteName: string;
  
  constructor(siteName?: string) {
    super();
    this.entries = new Documents();
    this.followedSites = [];
    this.siteName = siteName || 'Unnamed Site';
  }
  
  async open(): Promise<void> {
    console.log('Opening SimpleFederationIndex...');
    await this.entries.open({
      type: IndexableSimpleEntry,
      replicate: true,
      canPerform: () => true as any
    });
    console.log('SimpleFederationIndex opened');
  }
  
  /**
   * Follow a site - add to our followed list
   */
  async followSite(siteId: string): Promise<void> {
    if (!this.followedSites.includes(siteId)) {
      this.followedSites.push(siteId);
      console.log(`${this.siteName} now follows ${siteId}`);
    }
  }
  
  /**
   * Unfollow a site
   */
  async unfollowSite(siteId: string): Promise<void> {
    const index = this.followedSites.indexOf(siteId);
    if (index > -1) {
      this.followedSites.splice(index, 1);
      console.log(`${this.siteName} unfollowed ${siteId}`);
    }
  }
  
  /**
   * Insert content into the index
   */
  async insertContent(entry: SimpleIndexEntry): Promise<void> {
    try {
      if (!this.entries || !this.entries.put) {
        console.error('Documents store not ready');
        return;
      }
      // Convert to indexable entry with proper ID
      const indexable = new IndexableSimpleEntry({
        ...entry,
        id: `${entry.sourceSiteId}:${entry.contentCid}`
      });
      await this.entries.put(indexable);
    } catch (e) {
      console.error('Insert error:', e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  
  /**
   * Search the index
   */
  async search(query: string): Promise<IndexableSimpleEntry[]> {
    if (!this.entries.index) {
      console.warn('Index not available yet');
      return [];
    }
    
    try {
      // Search in both title and tags
      const results = await this.entries.index.search(
        new SearchRequest({
          query: [
            new StringMatch({
              key: 'title',
              value: query,
              method: StringMatchMethod.contains
            })
          ],
          fetch: 100000 // Request a high number of results
        })
      );
      
      // If no results in title, try tags
      if (results.length === 0 && this.entries.index) {
        const tagResults = await this.entries.index.search(
          new SearchRequest({
            query: [
              new StringMatch({
                key: 'tags',
                value: query,
                method: StringMatchMethod.contains
              })
            ],
            fetch: 100000 // Request a high number of results
          })
        );
        return tagResults;
      }
      
      return results;
    } catch (e) {
      console.error('Search error:', e instanceof Error ? e.message : String(e));
      return [];
    }
  }
  
  /**
   * Get by content type
   */
  async getByType(contentType: string): Promise<IndexableSimpleEntry[]> {
    if (!this.entries.index) {
      console.warn('Index not available yet');
      return [];
    }
    
    try {
      return await this.entries.index.search(
        new SearchRequest({
          query: [
            new StringMatch({
              key: 'contentType',
              value: contentType,
              method: StringMatchMethod.exact
            })
          ],
          fetch: 100000 // Request a high number of results
        })
      );
    } catch (e) {
      console.error('Type search error:', e instanceof Error ? e.message : String(e));
      return [];
    }
  }
  
  /**
   * Get recent entries
   */
  async getRecent(limit: number = 50): Promise<IndexableSimpleEntry[]> {
    if (!this.entries.index) {
      console.warn('Index not available yet');
      return [];
    }
    
    try {
      const results = await this.entries.index.search(
        new SearchRequest({
          query: [],
          sort: [new Sort({ key: 'timestamp', direction: SortDirection.DESC })],
          fetch: 100000 // Request a high number of results
        })
      );
      return results.slice(0, limit);
    } catch (e) {
      console.error('Get recent error:', e instanceof Error ? e.message : String(e));
      return [];
    }
  }
  
  /**
   * Get list of followed sites
   */
  getFollowedSites(): string[] {
    return [...this.followedSites];
  }
  
  /**
   * Get total count of entries in the index
   */
  async getEntryCount(): Promise<number> {
    if (!this.entries || !this.entries.index) {
      return 0;
    }
    
    try {
      // Get all entries to count them
      const allEntries = await this.entries.index.search(
        new SearchRequest({ 
          query: [],
          fetch: 100000 // Request a high number of results
        })
      );
      return allEntries.length;
    } catch (e) {
      console.error('Count error:', e instanceof Error ? e.message : String(e));
      return 0;
    }
  }
}