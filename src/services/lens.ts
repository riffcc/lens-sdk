import { Peerbit } from 'peerbit';
import {
  SearchRequest,
  Sort,
  SortDirection,
  StringMatch,
  type WithContext,
} from '@peerbit/document';
import { AccessError, type PublicSignKey } from '@peerbit/crypto';
import {
  type IdentityAccessController,
  AccessType,
} from '@peerbit/identity-access-controller';
import { FederationManager } from '../programs/site/lib/federation';
import type { Site } from '../programs/site/program';
import type {
  BaseData,
  FeaturedReleaseData,
  ReleaseData,
  SiteArgs,
} from '../programs/site/types';
import { AccountType } from '../programs/site/types';
import { FeaturedRelease, Release, Subscription } from '../programs/site/schemas';
import type { BaseResponse, HashResponse, IdResponse, ILensService } from './types';
import { Logger } from '../common/logger';
import type { SearchOptions } from '../common/types';
import type { ProgramClient } from '@peerbit/program';
import { findAccessGrant } from '../common/utils';

const ACCESS_CHECK_CACHE_TTL = 60000;

export class ElectronLensService implements ILensService {
  constructor() { }

  async init(directory?: string): Promise<void> {
    await window.electronLensService.init(directory);
  }

  async stop(): Promise<void> {
    await window.electronLensService.stop();
  }

  async openSite(
    siteOrAddress: Site | string,
    options: { siteArgs?: SiteArgs, federate?: boolean } = { federate: true },
  ): Promise<void> {
    await window.electronLensService.openSite(siteOrAddress, options);
  }

  async getAccountStatus(options?: { cached?: boolean }): Promise<AccountType> {
    return window.electronLensService.getAccountStatus(options?.cached);
  }

  async getRelease(id: string): Promise<WithContext<Release> | undefined> {
    return window.electronLensService.getRelease(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    return window.electronLensService.getReleases(options);
  }

  async getFeaturedRelease(id: string): Promise<WithContext<FeaturedRelease> | undefined> {
    return window.electronLensService.getFeaturedRelease(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    return window.electronLensService.getFeaturedReleases(options);
  }

  async addRelease(data: Omit<ReleaseData, 'siteAddress'>): Promise<HashResponse> {
    return window.electronLensService.addRelease(data);
  }
  // Admin methods
  async editRelease(data: ReleaseData): Promise<HashResponse> {
    return window.electronLensService.editRelease(data);
  }

  async deleteRelease(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteRelease(id);
  }

  async addFeaturedRelease(data: Omit<FeaturedReleaseData, 'siteAddress'>): Promise<HashResponse> {
    return window.electronLensService.addFeaturedRelease(data);
  }

  async editFeaturedRelease(data: FeaturedReleaseData): Promise<HashResponse> {
    return window.electronLensService.editFeaturedRelease(data);
  }

  async deleteFeaturedRelease(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteFeaturedRelease(id);
  }

  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    return window.electronLensService.getSubscriptions(options);
  }

  async addSubscription(data: BaseData): Promise<HashResponse> {
    return window.electronLensService.addSubscription(data);
  }

  async deleteSubscription(data: Partial<Pick<BaseData, 'id' | 'siteAddress'>>): Promise<IdResponse> {
    return window.electronLensService.deleteSubscription(data);
  }

  async grantAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse> {
    return window.electronLensService.grantAccess(accountType, publicKey);
  }

  async revokeAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse> {
    return window.electronLensService.revokeAccess(accountType, publicKey);
  }
}

export class LensService implements ILensService {
  peerbit: ProgramClient | null = null;
  siteProgram: Site | null = null;
  private accessCheckCache: Map<string, { result: boolean; timestamp: number }> = new Map();
  private federationManager: FederationManager | null = null;
  private logger: Logger;
  private extenarlyManaged: boolean = false;

  constructor(options?: { peerbit?: ProgramClient; debug?: boolean, customPrefix?: string }) {
    this.logger = new Logger({ enabled: options?.debug, prefix: options?.customPrefix || 'LensService' });

    if (options?.peerbit) {
      this.peerbit = options.peerbit;
      this.extenarlyManaged = true;
    }
  }

  async init(directory?: string): Promise<void> {
    if (this.peerbit) {
      throw new Error(
        'LensService: Already configured with an external Peerbit client. Do not call init().',
      );
    }
    this.logger.debug(`Initializing new Peerbit client in directory: ${directory || 'in-memory'}`);
    this.peerbit = await Peerbit.create({ directory });
    this.extenarlyManaged = false;
  }

  async stop() {
    const { peerbit } = this._ensureInitialized();
    if (this.federationManager) {
      await this.federationManager.stop();
      this.federationManager = null;
    }

    if (!this.extenarlyManaged) {
      await peerbit.stop();
      this.logger.debug('Internal Peerbit client stopped.');
    }
    if (this.siteProgram) {
      await this.siteProgram.close();
    }
    this.peerbit = null;
    this.siteProgram = null;
    this.logger.debug('LensService stopped successfully.');
  }

  private _ensureInitialized(): {
    peerbit: ProgramClient;
  } {
    if (!this.peerbit) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      peerbit: this.peerbit,
    };
  }

  private _ensureSiteOpened(): {
    peerbit: ProgramClient;
    siteProgram: Site;
  } {
    const { peerbit } = this._ensureInitialized();
    if (!this.siteProgram || this.siteProgram.closed) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      peerbit,
      siteProgram: this.siteProgram,
    };
  }

  private async _canPerformCheck(accessController: IdentityAccessController, key: PublicSignKey, cached: boolean = true): Promise<boolean> {
    const cacheKey = `${accessController.address}_${key.toString()}`;
    const isCached = cached && this.accessCheckCache.get(cacheKey);
    if (isCached && (Date.now() - isCached.timestamp < ACCESS_CHECK_CACHE_TTL)) {
      return isCached.result;
    }

    const grant = await findAccessGrant(accessController.access, key);

    const hasPermission = !!grant && (
      grant.accessTypes.includes(AccessType.Write) ||
      grant.accessTypes.includes(AccessType.Any)
    );

    this.accessCheckCache.set(cacheKey, { result: hasPermission, timestamp: Date.now() });
    return hasPermission;
  }

  async openSite(
    siteOrAddress: Site | string,
    options: { siteArgs?: SiteArgs, federate?: boolean } = { federate: true },
  ): Promise<void> {
    if (this.siteProgram) {
      throw new Error('A site is already open. Please close it before opening a new one.');
    }
    const { peerbit } = this._ensureInitialized();
    const siteProgram = await peerbit.open(siteOrAddress, { args: options?.siteArgs });
    this.siteProgram = siteProgram;
    this.logger.debug(`Site opened successfully at address: ${this.siteProgram.address}`);

    if (options?.federate) {
      this.logger.debug('Federation enabled. Initializing FederationManager.');
      // Create and start the manager. It handles everything from here.
      this.federationManager = new FederationManager(peerbit, siteProgram, this.logger);
      await this.federationManager.start();
    }

  }

  async getAccountStatus(options?: { cached?: boolean }): Promise<AccountType> {
    this.logger.time('getAccountStatus');
    const { peerbit, siteProgram } = this._ensureSiteOpened();

    // Run permission checks in parallel for better performance.
    const [isAdmin, isMember] = await Promise.all([
      this._canPerformCheck(siteProgram.administrators, peerbit.identity.publicKey, options?.cached),
      this._canPerformCheck(siteProgram.members, peerbit.identity.publicKey, options?.cached),
    ]);

    // Check from highest to lowest privilege.
    if (isAdmin) {
      this.logger.debug('User status determined: ADMIN.');
      return AccountType.ADMIN;
    }

    if (isMember) {
      this.logger.debug('User status determined: MEMBER.');
      return AccountType.MEMBER;
    }

    this.logger.debug('User status determined: GUEST.');
    return AccountType.GUEST;
  }

  async getRelease(id: string): Promise<WithContext<Release> | undefined> {
    const { siteProgram } = this._ensureSiteOpened();
    return siteProgram.releases.index.get(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    this.logger.time('getReleases');
    const { siteProgram } = this._ensureSiteOpened();

    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });

    this.logger.debug('Fetching all releases with iterator pattern:', request);
    this.logger.time('releases.index.iterate');

    const allResults: WithContext<Release>[] = [];
    const iterator = siteProgram.releases.index.iterate(request);

    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 releases per page
      for (const release of batch) {
        allResults.push(release);
      }
      this.logger.debug(`Fetched batch of ${batch.length} releases, total: ${allResults.length}`);
    }

    this.logger.timeEnd('releases.index.iterate');
    this.logger.debug(`Found a total of ${allResults.length} releases.`);
    this.logger.timeEnd('getReleases');
    return allResults;
  }

  async getFeaturedRelease(id: string): Promise<WithContext<FeaturedRelease> | undefined> {
    const { siteProgram } = this._ensureSiteOpened();
    return siteProgram.featuredReleases.index.get(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    this.logger.time('getFeaturedReleases');
    const { siteProgram } = this._ensureSiteOpened();

    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });

    this.logger.debug('Fetching all featured releases with iterator pattern:', request);
    this.logger.time('featuredReleases.index.iterate');

    const allResults: WithContext<FeaturedRelease>[] = [];
    const iterator = siteProgram.featuredReleases.index.iterate(request);

    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 featured releases per page
      for (const featuredRelease of batch) {
        allResults.push(featuredRelease);
      }
      this.logger.debug(`Fetched batch of ${batch.length} featured releases, total: ${allResults.length}`);
    }

    this.logger.timeEnd('featuredReleases.index.iterate');
    this.logger.debug(`Found a total of ${allResults.length} featured releases.`);
    this.logger.timeEnd('getFeaturedReleases');
    return allResults;
  }

  async addRelease(data: Omit<ReleaseData, 'siteAddress'>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const release = new Release({
        ...data,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.releases.put(release);
      this.logger.debug(`Successfully added release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this.logger.error('Failed to add release:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  // Admin methods
  async editRelease(data: ReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const release = new Release(data);
      const result = await siteProgram.releases.put(release);
      this.logger.debug(`Successfully edited release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error(`Failed to edit release with ID: ${data.id}`, error);
      if (error instanceof AccessError) {
        return { success: false, id: data.id, error: 'Access denied' };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  async deleteRelease(id: string): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      this.logger.debug(`Attempting to delete release with ID: ${id}`);
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
        this.logger.debug(`Deleting associated featured release with ID: ${tfr.id}`);
        await siteProgram.featuredReleases.del(tfr.id);
      }

      await siteProgram.releases.del(id);
      this.logger.debug(`Successfully deleted release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id, error: 'Access denied' };
      } else {
        this.logger.error(`Failed to delete release with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async addFeaturedRelease(data: Omit<FeaturedReleaseData, 'siteAddress'>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();

      const targetRelease = await this.getRelease(data.releaseId);

      if (!targetRelease) {
        throw new Error(
          `Cannot add featured release: The specified release ID ${data.releaseId} does not exist.`,
        );
      }
      const featuredRelease = new FeaturedRelease({
        ...data,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.featuredReleases.put(featuredRelease);
      this.logger.debug(`Successfully added featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this.logger.error('Failed to add featured release:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async editFeaturedRelease(data: FeaturedReleaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();

      const featuredRelease = new FeaturedRelease(data);
      const result = await siteProgram.featuredReleases.put(featuredRelease);
      this.logger.debug(`Successfully edited featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id: data.id, error: 'Access denied' };
      } else {
        this.logger.error(`Failed to edit featured release with ID: ${data.id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async deleteFeaturedRelease(id: string): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      await siteProgram.featuredReleases.del(id);
      this.logger.debug(`Successfully deleted featured release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id, error: 'Access denied' };
      } else {
        this.logger.error(`Failed to delete featured release with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const request = options?.request ?? new SearchRequest({
        sort: options?.sort ?? [
          new Sort({ key: 'created', direction: SortDirection.DESC }),
        ],
      });

      this.logger.debug('Fetching all subscriptions with iterator pattern.');
      const allResults: Subscription[] = [];
      const iterator = siteProgram.subscriptions.index.iterate(request);

      while (iterator.done() !== true) {
        const batch = await iterator.next(100);
        for (const subscription of batch) {
          allResults.push(subscription);
        }
        if (options?.fetch && allResults.length >= options.fetch) {
          break;
        }
      }
      this.logger.debug(`Found a total of ${allResults.length} subscriptions.`);
      return allResults;
    } catch (error) {
      this.logger.error('Failed to get subscriptions:', error);
      return [];
    }
  }

  async addSubscription(data: BaseData): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      this.logger.debug(`Adding subscription to site: ${data.siteAddress}`);
      const subscription = new Subscription({
        ...data,
        subcriberSiteAddress: siteProgram.address,
      });
      const result = await siteProgram.subscriptions.put(subscription);
      return {
        success: true,
        id: subscription.siteAddress,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this.logger.error('Failed to add subscription:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async deleteSubscription(
    { id, siteAddress }: Partial<Pick<BaseData, 'id' | 'siteAddress'>>,
  ): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();

      let subscriptionIdToDelete = id;
      if (siteAddress) {
        const subscription = await siteProgram.subscriptions.index.search(
          new SearchRequest({
            query: [
              new StringMatch({
                key: 'siteAddress',
                value: siteAddress,
              }),
            ],
            fetch: 1,
          }),
        );
        if (subscription[0]) {
          subscriptionIdToDelete = subscription[0].id;

        }
      }
      if (!subscriptionIdToDelete) {
        throw new Error('At least one params must be passed. Subscription ID or Site Address');
      }
      this.logger.debug(`Deleting subscription with ID: ${id}`);
      await siteProgram.subscriptions.del(subscriptionIdToDelete);

      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id, error: 'Access denied' };
      } else {
        this.logger.error(`Failed to delete subscription with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async grantAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse> {
    this.logger.debug(`Attempting to grant ${AccountType[accountType]} access to key: ${publicKey}`);
    try {
      const { siteProgram } = this._ensureSiteOpened();

      // Call the internal program method
      await siteProgram._authorise(accountType, publicKey);

      this.logger.debug(`Successfully granted ${AccountType[accountType]} access.`);
      return { success: true };

    } catch (error: unknown) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this.logger.error('Failed to grant access:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async revokeAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse> {
    this.logger.debug(`Attempting to revoke ${AccountType[accountType]} access for key: ${publicKey}`);
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();

      if (accountType === AccountType.GUEST) {
        return { success: false, error: 'Cannot revoke GUEST access, it is the default role.' };
      }
      if (publicKey === peerbit.identity.publicKey.toString()) {
        return { success: false, error: 'Cannot revoke access from yourself.' };
      }

      // Call the internal program method
      await siteProgram._revoke(accountType, publicKey);

      this.logger.debug(`Successfully revoked ${AccountType[accountType]} access.`);
      return { success: true };

    } catch (error: unknown) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this.logger.error('Failed to revoke access:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }
}