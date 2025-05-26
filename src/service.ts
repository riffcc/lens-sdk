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

import {
  Access,
  ACCESS_TYPE_PROPERTY,
  AccessType,
  PublicKeyAccessCondition,
  type IdentityAccessController,
} from '@peerbit/identity-access-controller';
import type { PublicSignKey } from '@peerbit/crypto';
import { FeaturedRelease, Release, Site } from './schema';
import type {
  FeaturedReleaseData,
  HashResponse,
  IdData,
  IdResponse,
  ILensService,
  ReleaseData,
  SearchOptions,
  SiteArgs,
} from './types';

import { AccountType } from './types';
import { publicSignKeyFromString } from './utils';
import { FEATURED_RELEASE_ID_PROPERTY } from './constants';

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

const canPerformCheck = async (accessController: IdentityAccessController, key: PublicSignKey) => {
  const timerLabel = `[LensSDK] canPerformCheck ${accessController.address?.slice(0, 8)}`;
  console.time(timerLabel);
  
  // Check cache first
  const cacheKey = `${accessController.address}_${key.toString()}`;
  const cached = accessCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`${timerLabel} - Cache hit`);
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

  for (const access of accessWritedOrAny) {
    if (access instanceof Access) {
      if (
        access.accessTypes.find(
          (x) => x === AccessType.Any || x === AccessType.Write,
        ) !== undefined
      ) {
        // check condition
        if (await access.accessCondition.allowed(key)) {
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

  async closeSite(): Promise<void> {
    const { siteProgram } = this.ensureSiteOpened();
    await siteProgram.close();
    this.siteProgram = null;
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
    console.time('[LensSDK] getAccountStatus');
    const { client, siteProgram } = this.ensureSiteOpened();

    // Check administrators first (smaller set, faster query)
    console.time('[LensSDK] Admin check');
    const isAdmin = await canPerformCheck(siteProgram.administrators, client.identity.publicKey);
    console.timeEnd('[LensSDK] Admin check');
    
    if (isAdmin) {
      console.timeEnd('[LensSDK] getAccountStatus');
      return AccountType.ADMIN;
    }
    
    console.time('[LensSDK] Member check');
    const isMember = await canPerformCheck(siteProgram.members, client.identity.publicKey);
    console.timeEnd('[LensSDK] Member check');
    
    console.timeEnd('[LensSDK] getAccountStatus');
    return isMember ? AccountType.MEMBER : AccountType.GUEST;
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

}