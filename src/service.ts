import { Peerbit } from 'peerbit';
import {
  Compare,
  IntegerCompare,
  Or,
  SearchRequest,
  Sort,
  SortDirection,
  StringMatch,
  type WithContext,
} from '@peerbit/document';
import { v4 as uuid } from 'uuid';

import {
  Access,
  ACCESS_TYPE_PROPERTY,
  AccessType,
  PublicKeyAccessCondition,
  type IdentityAccessController,
} from '@peerbit/identity-access-controller';
import type { PublicSignKey } from '@peerbit/crypto';
import { FeaturedRelease, Release, Site, Subscription } from './schema';
import { IndexableFederationEntry, FederationIndexEntry } from './per-site-federation-index';
import type {
  BaseResponse,
  FeaturedReleaseData,
  HashResponse,
  IdData,
  IdResponse,
  ILensService,
  ReleaseData,
  SearchOptions,
  SiteArgs,
  SiteMetadata,
  SubscriptionData,
} from './types';

import { AccountType } from './types';
import { publicSignKeyFromString } from './utils';
import { 
  FEATURED_RELEASE_ID_PROPERTY,
  ID_PROPERTY,
  SUBSCRIPTION_SITE_ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SUBSCRIPTION_RECURSIVE_PROPERTY,
  SITE_NAME_PROPERTY,
  SITE_DESCRIPTION_PROPERTY,
  SITE_IMAGE_CID_PROPERTY,
  RELEASE_NAME_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from './constants';

export async function authorise(
  siteProgram: Site,
  accountType: AccountType,
  stringPublicKey: string,
): Promise<void> {
  const publicSignKey = publicSignKeyFromString(stringPublicKey);
  const accessCondition = new PublicKeyAccessCondition({ key: publicSignKey });
  const accessTypes: AccessType[] = [AccessType.Read, AccessType.Write];

  if (accountType === AccountType.MEMBER) {
    const access = new Access({
      accessCondition,
      accessTypes,
    });
    await siteProgram.members.access.put(access);

  } else if (accountType === AccountType.ADMIN) {
    const access = new Access({
      accessCondition,
      accessTypes,
    });
    await siteProgram.members.access.put(access);
    await siteProgram.administrators.access.put(access);

  } else {
    throw new Error('authorization for this account type is not implemented yet.');
  }
}

// Cache for performance optimization
const accessCheckCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

// Add method to clear cache (useful for debugging)
export function clearAccessCache() {
  accessCheckCache.clear();
  console.log('[LensSDK] Access cache cleared');
}

const canPerformCheck = async (accessController: IdentityAccessController, key: PublicSignKey) => {
  const timerLabel = `[LensSDK] canPerformCheck ${accessController.address?.slice(0, 8)}`;
  console.time(timerLabel);
  
  // Check cache first
  const cacheKey = `${accessController.address}_${key.toString()}`;
  const cached = accessCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`${timerLabel} - Cache hit (result: ${cached.result})`);
    console.timeEnd(timerLabel);
    return cached.result;
  }

  // Optimized query with specific access types
  console.time(`${timerLabel} - index.search`);
  const accessWritedOrAny = await accessController.access.index.search(
    new SearchRequest({
      query: [
        new Or([
          new IntegerCompare({
            key: ACCESS_TYPE_PROPERTY,
            compare: Compare.Equal,
            value: AccessType.Any,
          }),
          new IntegerCompare({
            key: ACCESS_TYPE_PROPERTY,
            compare: Compare.Equal,
            value: AccessType.Write,
          }),
        ]),
      ],
      fetch: 50, // Limit results for performance
    }),
  );
  console.timeEnd(`${timerLabel} - index.search`);

  console.log(`${timerLabel} - Found ${accessWritedOrAny.length} access entries`);
  console.log(`${timerLabel} - Checking key: ${key.toString()}`);
  
  for (const access of accessWritedOrAny) {
    if (access instanceof Access) {
      if (
        access.accessTypes.find(
          (x) => x === AccessType.Any || x === AccessType.Write,
        ) !== undefined
      ) {
        // check condition
        const allowed = await access.accessCondition.allowed(key);
        console.log(`${timerLabel} - Access check for ${access.id}: ${allowed}`);
        if (allowed) {
          // Cache the result
          accessCheckCache.set(cacheKey, { result: true, timestamp: Date.now() });
          console.timeEnd(timerLabel);
          return true;
        }
        continue;
      }
    }
  }
  
  // Cache negative result
  accessCheckCache.set(cacheKey, { result: false, timestamp: Date.now() });
  console.timeEnd(timerLabel);
  return false;
};

export class ElectronLensService implements ILensService {
  constructor() { }

  async init(directory?: string): Promise<void> {
    await window.electronLensService.init(directory);
  }

  async stop(): Promise<void> {
    await window.electronLensService.stop();
  }

  async openSite(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    await window.electronLensService.openSite(siteOrAddress, openOptions);
  }

  async getPublicKey() {
    return window.electronLensService.getPublicKey();
  }

  async getPeerId() {
    return window.electronLensService.getPeerId();
  }

  async getAccountStatus(): Promise<AccountType> {
    return window.electronLensService.getAccountStatus();
  }

  async getSiteId(): Promise<string> {
    return window.electronLensService.getSiteId();
  }

  async getSiteMetadata(): Promise<SiteMetadata> {
    return window.electronLensService.getSiteMetadata();
  }

  async setSiteMetadata(metadata: SiteMetadata): Promise<BaseResponse> {
    return window.electronLensService.setSiteMetadata(metadata);
  }

  async getRemoteSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
    return window.electronLensService.getRemoteSiteMetadata(siteId);
  }

  async dial(address: string): Promise<boolean> {
    return window.electronLensService.dial(address);
  }

  async getRelease(data: IdData): Promise<WithContext<Release> | undefined> {
    return window.electronLensService.getRelease(data);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    return window.electronLensService.getReleases(options);
  }

  async getFeaturedRelease(data: IdData): Promise<WithContext<FeaturedRelease> | undefined> {
    return window.electronLensService.getFeaturedRelease(data);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    return window.electronLensService.getFeaturedReleases(options);
  }

  async addRelease(data: ReleaseData): Promise<HashResponse> {
    return window.electronLensService.addRelease(data);
  }
  // Admin methods
  async editRelease(data: IdData & ReleaseData): Promise<HashResponse> {
    return window.electronLensService.editRelease(data);
  }

  async deleteRelease(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteRelease(data);
  }

  async addFeaturedRelease(data: FeaturedReleaseData): Promise<HashResponse> {
    return window.electronLensService.addFeaturedRelease(data);
  }

  async editFeaturedRelease(data: IdData & FeaturedReleaseData): Promise<HashResponse> {
    return window.electronLensService.editFeaturedRelease(data);
  }

  async deleteFeaturedRelease(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteFeaturedRelease(data);
  }

  async getSubscriptions(options?: SearchOptions): Promise<SubscriptionData[]> {
    return window.electronLensService.getSubscriptions(options);
  }

  async addSubscription(data: Omit<SubscriptionData, 'id'>): Promise<HashResponse> {
    return window.electronLensService.addSubscription(data);
  }

  async deleteSubscription(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteSubscription(data);
  }

  async openSiteMinimal(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    return window.electronLensService.openSiteMinimal(siteOrAddress, openOptions);
  }

  async closeSite(): Promise<void> {
    return window.electronLensService.closeSite();
  }

  async getFederationIndexFeatured(limit?: number): Promise<IndexableFederationEntry[]> {
    return window.electronLensService.getFederationIndexFeatured(limit);
  }


  async searchFederationIndex(query: string, options?: SearchOptions): Promise<IndexableFederationEntry[]> {
    return window.electronLensService.searchFederationIndex(query, options);
  }

  async getFederationIndexRecent(limit?: number, offset?: number): Promise<IndexableFederationEntry[]> {
    return window.electronLensService.getFederationIndexRecent(limit, offset);
  }

  async complexFederationIndexQuery(params: {
    query?: string;
    sourceSiteId?: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
    isFeatured?: boolean;
    isPromoted?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<IndexableFederationEntry[]> {
    return window.electronLensService.complexFederationIndexQuery(params);
  }

  async getFederationIndexStats(): Promise<{
    totalEntries: number;
    entriesBySite: Record<string, number>;
  }> {
    return window.electronLensService.getFederationIndexStats();
  }
}

export class LensService implements ILensService {
  client: Peerbit | null = null;
  siteProgram: Site | null = null;
  private extenarlyManaged: boolean = false;

  constructor(client?: Peerbit) {
    if (client) {
      this.client = client;
      this.extenarlyManaged = true;
    }
  }

  async init(directory?: string): Promise<void> {
    if (this.client) {
      throw new Error(
        'LensService: Already configured with instances from constructor. Do not call init().',
      );
    }
    this.client = await Peerbit.create({ directory });
    this.extenarlyManaged = false;
  }

  async closeSite(): Promise<void> {
    if (this.siteProgram) {
      await this.siteProgram.close();
      this.siteProgram = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.extenarlyManaged) {
      const { client } = this.ensureInitialized();
      try {
        await client.stop();
      } catch (error) {
        console.error('LensService: Error stopping Peerbit client:', error);
      }
    }
  }

  private ensureInitialized(): {
    client: Peerbit;
  } {
    if (!this.client) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      client: this.client,
    };
  }

  async openSiteMinimal(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    if (this.siteProgram) {
      throw new Error(
        'Site already opened.',
      );
    }
    const { client } = this.ensureInitialized();

    console.time('[LensSDK] Total openSiteMinimal');
    console.log('[LensSDK] Opening site (minimal) with args:', JSON.stringify(openOptions, null, 2));

    let site: Site;
    if (typeof siteOrAddress === 'string') {
      console.time('[LensSDK] Open remote site');
      site = await client.open<Site>(siteOrAddress, {
        args: openOptions,
      });
      console.timeEnd('[LensSDK] Open remote site');
    } else {
      site = siteOrAddress;
      console.time('[LensSDK] Open local site');
      // Open with peerbit but don't let it call the regular open method
      await client.open(site, {
        args: openOptions,
        existing: 'reuse', // Reuse if already open
      });
      console.timeEnd('[LensSDK] Open local site');
    }
    
    this.siteProgram = site;
    console.timeEnd('[LensSDK] Total openSiteMinimal');
  }

  async openSite(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    if (this.siteProgram) {
      throw new Error(
        'Site already opened.',
      );
    }
    const { client } = this.ensureInitialized();

    console.time('[LensSDK] Total openSite');
    console.log('[LensSDK] Opening site with args:', JSON.stringify(openOptions, null, 2));
    
    if (siteOrAddress instanceof Site) {
      console.time('[LensSDK] client.open (Site instance)');
      this.siteProgram = await client.open(siteOrAddress, {
        args: openOptions,
      });
      console.timeEnd('[LensSDK] client.open (Site instance)');
    } else {
      console.time('[LensSDK] client.open (address)');
      this.siteProgram = await client.open<Site>(siteOrAddress, {
        args: openOptions,
      });
      console.timeEnd('[LensSDK] client.open (address)');
    }
    
    console.timeEnd('[LensSDK] Total openSite');
  }

  private ensureSiteOpened(): {
    client: Peerbit;
    siteProgram: Site;
  } {
    const { client } = this.ensureInitialized();
    if (!this.siteProgram) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      client: client,
      siteProgram: this.siteProgram,
    };
  }


  async getPublicKey(): Promise<string> {
    const { client } = this.ensureInitialized();
    return client.identity.publicKey.toString();
  }

  async getPeerId(): Promise<string> {
    const { client } = this.ensureInitialized();
    return client.peerId.toString();
  }

  async dial(address: string): Promise<boolean> {
    const { client } = this.ensureInitialized();
    return client.dial(address);
  }

  async getAccountStatus(): Promise<AccountType> {
    const timerId = `[LensSDK] getAccountStatus-${Date.now()}`;
    console.time(timerId);
    const { client, siteProgram } = this.ensureSiteOpened();

    // Check administrators first (smaller set, faster query)
    const adminTimerId = `[LensSDK] Admin check-${Date.now()}`;
    console.time(adminTimerId);
    const isAdmin = await canPerformCheck(siteProgram.administrators, client.identity.publicKey);
    console.timeEnd(adminTimerId);
    
    if (isAdmin) {
      console.timeEnd(timerId);
      return AccountType.ADMIN;
    }
    
    const memberTimerId = `[LensSDK] Member check-${Date.now()}`;
    console.time(memberTimerId);
    const isMember = await canPerformCheck(siteProgram.members, client.identity.publicKey);
    console.timeEnd(memberTimerId);
    
    console.timeEnd(timerId);
    return isMember ? AccountType.MEMBER : AccountType.GUEST;
  }

  async getSiteId(): Promise<string> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.address;
  }

  async getSiteMetadata(): Promise<SiteMetadata> {
    const { siteProgram } = this.ensureSiteOpened();
    return {
      [SITE_NAME_PROPERTY]: siteProgram[SITE_NAME_PROPERTY],
      [SITE_DESCRIPTION_PROPERTY]: siteProgram[SITE_DESCRIPTION_PROPERTY],
      [SITE_IMAGE_CID_PROPERTY]: siteProgram[SITE_IMAGE_CID_PROPERTY],
    };
  }

  async setSiteMetadata(metadata: SiteMetadata): Promise<BaseResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();
      
      // Update the site metadata fields
      if (metadata[SITE_NAME_PROPERTY] !== undefined) {
        siteProgram[SITE_NAME_PROPERTY] = metadata[SITE_NAME_PROPERTY];
      }
      if (metadata[SITE_DESCRIPTION_PROPERTY] !== undefined) {
        siteProgram[SITE_DESCRIPTION_PROPERTY] = metadata[SITE_DESCRIPTION_PROPERTY];
      }
      if (metadata[SITE_IMAGE_CID_PROPERTY] !== undefined) {
        siteProgram[SITE_IMAGE_CID_PROPERTY] = metadata[SITE_IMAGE_CID_PROPERTY];
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update site metadata' 
      };
    }
  }

  async getRemoteSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
    try {
      const { client } = this.ensureInitialized();
      
      // Open remote site temporarily to get metadata
      const remoteSite = await client.open<Site>(siteId);
      
      const metadata: SiteMetadata = {
        [SITE_NAME_PROPERTY]: remoteSite[SITE_NAME_PROPERTY],
        [SITE_DESCRIPTION_PROPERTY]: remoteSite[SITE_DESCRIPTION_PROPERTY],
        [SITE_IMAGE_CID_PROPERTY]: remoteSite[SITE_IMAGE_CID_PROPERTY],
      };
      
      // Close the remote site
      await remoteSite.close();
      
      return metadata;
    } catch (error) {
      console.error('Failed to get remote site metadata:', error);
      return null;
    }
  }

  async getRelease({ id }: IdData): Promise<WithContext<Release> | undefined> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.releases.index.get(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    console.time('[LensSDK] getReleases');
    const { siteProgram } = this.ensureSiteOpened();
    
    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });
    
    console.log('[LensSDK] Fetching all releases using iterator pattern');
    console.time('[LensSDK] releases.index.iterate');
    
    const allResults: WithContext<Release>[] = [];
    const iterator = siteProgram.releases.index.iterate(request);
    
    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 releases per page
      allResults.push(...batch);
      console.log(`[LensSDK] Fetched batch of ${batch.length} releases, total: ${allResults.length}`);
    }
    
    console.timeEnd('[LensSDK] releases.index.iterate');
    console.log('[LensSDK] Found total releases:', allResults.length);
    console.timeEnd('[LensSDK] getReleases');
    return allResults;
  }

  async getFeaturedRelease({ id }: IdData): Promise<WithContext<FeaturedRelease> | undefined> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.featuredReleases.index.get(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    console.time('[LensSDK] getFeaturedReleases');
    const { siteProgram } = this.ensureSiteOpened();
    
    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });
    
    console.log('[LensSDK] Fetching all featured releases using iterator pattern');
    console.time('[LensSDK] featuredReleases.index.iterate');
    
    const allResults: WithContext<FeaturedRelease>[] = [];
    const iterator = siteProgram.featuredReleases.index.iterate(request);
    
    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 featured releases per page
      allResults.push(...batch);
      console.log(`[LensSDK] Fetched batch of ${batch.length} featured releases, total: ${allResults.length}`);
    }
    
    console.timeEnd('[LensSDK] featuredReleases.index.iterate');
    console.log('[LensSDK] Found total featured releases:', allResults.length);
    console.timeEnd('[LensSDK] getFeaturedReleases');
    return allResults;
  }

  async addRelease(data: ReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const release = new Release(data);
      const result = await siteProgram.releases.put(release);

      // Also add to federation index
      const metadata = data[RELEASE_METADATA_PROPERTY] ? JSON.parse(data[RELEASE_METADATA_PROPERTY] as string) : {};
      const federationEntry: FederationIndexEntry = {
        contentCID: release[RELEASE_CONTENT_CID_PROPERTY],
        title: release[RELEASE_NAME_PROPERTY],
        thumbnailCID: release[RELEASE_THUMBNAIL_CID_PROPERTY],
        sourceSiteId: await this.getSiteId(),
        timestamp: Date.now(),
        isFeatured: metadata.isFeatured || false,
        isPromoted: metadata.isPromoted || false,
        featuredUntil: metadata.featuredUntil,
        promotedUntil: metadata.promotedUntil,
      };
      
      await siteProgram.federationIndex.insertContent(federationEntry);

      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add release',
      };
    }
  }

  // Admin methods
  async editRelease(data: IdData & ReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const release = new Release(data);
      const result = await siteProgram.releases.put(release);

      // Also update in federation index
      const siteId = await this.getSiteId();
      
      // Delete old entry and insert new one
      const entryId = `${siteId}:${release[RELEASE_CONTENT_CID_PROPERTY]}`;
      await siteProgram.federationIndex.removeContent(entryId);
      
      const metadata = data[RELEASE_METADATA_PROPERTY] ? JSON.parse(data[RELEASE_METADATA_PROPERTY] as string) : {};
      const federationEntry: FederationIndexEntry = {
        contentCID: release[RELEASE_CONTENT_CID_PROPERTY],
        title: release[RELEASE_NAME_PROPERTY],
        thumbnailCID: release[RELEASE_THUMBNAIL_CID_PROPERTY],
        sourceSiteId: siteId,
        timestamp: Date.now(),
        isFeatured: metadata.isFeatured || false,
        isPromoted: metadata.isPromoted || false,
        featuredUntil: metadata.featuredUntil,
        promotedUntil: metadata.promotedUntil,
      };
      
      await siteProgram.federationIndex.insertContent(federationEntry);

      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      return {
        success: false,
        id: data.id,
        error: error instanceof Error ? error.message : 'Failed to edit release',
      };
    }
  }

  async deleteRelease({ id }: IdData): Promise<IdResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      // Get the release to find its content CID
      const release = await siteProgram.releases.index.get(id);
      if (release) {
        // Remove from federation index
        const siteId = await this.getSiteId();
        const entryId = `${siteId}:${release[RELEASE_CONTENT_CID_PROPERTY]}`;
        await siteProgram.federationIndex.removeContent(entryId);
      }

      const targetFeaturedReleases = await siteProgram.featuredReleases.index.search(
        new SearchRequest({
          query: [
            new StringMatch({
              key: 'releaseId',
              value: id,
            }),
          ],
        }),
      );

      for (const tfr of targetFeaturedReleases) {
        await this.deleteFeaturedRelease({ id: tfr.id });
      }

      await siteProgram.releases.del(id);
      return {
        success: true,
        id,
      };
    } catch (error) {
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete release',
      };
    }
  }

  async addFeaturedRelease(data: FeaturedReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const targetRelease = await this.getRelease({ id: data[FEATURED_RELEASE_ID_PROPERTY] });

      if (!targetRelease) {
        throw new Error(
          `Cannot add featured release: The specified release ID ${data[FEATURED_RELEASE_ID_PROPERTY]} does not exist.`,
        );
      }
      const featuredRelease = new FeaturedRelease(data);
      const result = await siteProgram.featuredReleases.put(featuredRelease);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add featured release',
      };
    }
  }

  async editFeaturedRelease(data: IdData & FeaturedReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const featuredRelease = new FeaturedRelease(data);
      const result = await siteProgram.featuredReleases.put(featuredRelease);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      return {
        success: false,
        id: data.id,
        error: error instanceof Error ? error.message : 'Failed to edit featured release',
      };
    }
  }

  async deleteFeaturedRelease({ id }: IdData): Promise<IdResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      await siteProgram.featuredReleases.del(id);
      return {
        success: true,
        id,
      };
    } catch (error) {
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete featured release',
      };
    }
  }

  async getSubscriptions(options?: SearchOptions): Promise<SubscriptionData[]> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const request = options?.request ?? new SearchRequest({
        sort: options?.sort ?? [
          new Sort({ key: 'created', direction: SortDirection.DESC }),
        ],
      });

      const allResults: SubscriptionData[] = [];
      const iterator = siteProgram.subscriptions.index.iterate(request);

      while (iterator.done() !== true) {
        const batch = await iterator.next(100); // Fetch 100 subscriptions per page
        for (const subscription of batch) {
          allResults.push({
            [ID_PROPERTY]: subscription[ID_PROPERTY],
            [SUBSCRIPTION_SITE_ID_PROPERTY]: subscription[SUBSCRIPTION_SITE_ID_PROPERTY],
            [SUBSCRIPTION_NAME_PROPERTY]: subscription[SUBSCRIPTION_NAME_PROPERTY],
            [SUBSCRIPTION_RECURSIVE_PROPERTY]: subscription[SUBSCRIPTION_RECURSIVE_PROPERTY],
            subscriptionType: subscription.subscriptionType,
            currentDepth: subscription.currentDepth,
            followChain: subscription.followChain,
          });
        }

        // Apply fetch limit if specified
        if (options?.fetch && allResults.length >= options.fetch) {
          break;
        }
      }

      return allResults;
    } catch (error) {
      console.error('Failed to get subscriptions:', error);
      return [];
    }
  }

  async addSubscription(data: Omit<SubscriptionData, 'id'>): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const subscriptionData = {
        [ID_PROPERTY]: uuid(),
        ...data,
      };
      const subscription = new Subscription(subscriptionData);
      const result = await siteProgram.subscriptions.put(subscription);

      return {
        success: true,
        id: subscription.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add subscription',
      };
    }
  }

  async deleteSubscription({ id }: IdData): Promise<IdResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      await siteProgram.subscriptions.del(id);
      return {
        success: true,
        id,
      };
    } catch (error) {
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete subscription',
      };
    }
  }

  // Federation Index methods
  async getFederationIndexFeatured(limit?: number): Promise<IndexableFederationEntry[]> {
    const { siteProgram } = this.ensureSiteOpened();
    return await siteProgram.federationIndex.getFeatured(limit);
  }


  async searchFederationIndex(query: string, options?: SearchOptions): Promise<IndexableFederationEntry[]> {
    const { siteProgram } = this.ensureSiteOpened();
    return await siteProgram.federationIndex.search(query, {
      limit: options?.fetch,
      sortBy: 'timestamp',
      sortDirection: 'desc',
    });
  }

  async getFederationIndexRecent(limit?: number, offset?: number): Promise<IndexableFederationEntry[]> {
    const { siteProgram } = this.ensureSiteOpened();
    return await siteProgram.federationIndex.getRecent(limit, offset);
  }

  async complexFederationIndexQuery(params: {
    query?: string;
    sourceSiteId?: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
    isFeatured?: boolean;
    isPromoted?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<IndexableFederationEntry[]> {
    const { siteProgram } = this.ensureSiteOpened();
    return await siteProgram.federationIndex.complexQuery(params);
  }

  async getFederationIndexStats(): Promise<{
    totalEntries: number;
    entriesBySite: Record<string, number>;
  }> {
    const { siteProgram } = this.ensureSiteOpened();
    const stats = await siteProgram.federationIndex.getStats();
    
    // Convert Maps to Records
    const entriesBySite: Record<string, number> = {};
    stats.entriesBySite.forEach((count, site) => {
      entriesBySite[site] = count;
    });
    
    return {
      totalEntries: stats.totalEntries,
      entriesBySite,
    };
  }

}