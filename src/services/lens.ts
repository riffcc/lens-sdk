import { Peerbit } from 'peerbit';
import type {
  Documents,
} from '@peerbit/document';
import {
  ByteMatchQuery,
  SearchRequest,
  Sort,
  SortDirection,
  StringMatch,
  type WithContext,
} from '@peerbit/document';
import type { Identity, Secp256k1PublicKey } from '@peerbit/crypto';
import { AccessError, PublicSignKey } from '@peerbit/crypto';
import { FederationManager } from '../programs/site/lib/federation';
import type { Site } from '../programs/site/program';
import type {
  ArtistData,
  ContentCategoryData,
  FeaturedReleaseData,
  ImmutableProps,
  ReleaseData,
  SiteArgs,
  SubscriptionData,
} from '../programs/site/types';
import { Artist, ContentCategory, FeaturedRelease, Release, Subscription } from '../programs/site/schemas';
import type { AccountStatusResponse, AddInput, BaseResponse, EditInput, HashResponse, IdResponse, ILensService, LensServiceOptions } from './types';
import { Logger } from '../common/logger';
import type { SearchOptions } from '../common/types';
import type { ProgramClient } from '@peerbit/program';
import { publicSignKeyFromString } from '../common/utils';
import type { Role } from '../programs/acl/rbac';

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

  async getAccountStatus(): Promise<AccountStatusResponse> {
    return window.electronLensService.getAccountStatus();
  }

  // Release Methods
  async getRelease(id: string): Promise<WithContext<Release> | undefined> {
    return window.electronLensService.getRelease(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    return window.electronLensService.getReleases(options);
  }

  async addRelease(data: AddInput<ReleaseData>): Promise<HashResponse> {
    return window.electronLensService.addRelease(data);
  }

  async editRelease(data: EditInput<ReleaseData>): Promise<HashResponse> {
    return window.electronLensService.editRelease(data);
  }

  async deleteRelease(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteRelease(id);
  }

  // Featured Release Methods
  async getFeaturedRelease(id: string): Promise<WithContext<FeaturedRelease> | undefined> {
    return window.electronLensService.getFeaturedRelease(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    return window.electronLensService.getFeaturedReleases(options);
  }

  async addFeaturedRelease(data: AddInput<FeaturedReleaseData>): Promise<HashResponse> {
    return window.electronLensService.addFeaturedRelease(data);
  }

  async editFeaturedRelease(data: EditInput<FeaturedReleaseData>): Promise<HashResponse> {
    return window.electronLensService.editFeaturedRelease(data);
  }

  async deleteFeaturedRelease(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteFeaturedRelease(id);
  }

  // Content Category Methods
  async getContentCategory(id: string): Promise<WithContext<ContentCategory> | undefined> {
    return window.electronLensService.getContentCategory(id);
  }

  async getContentCategories(options?: SearchOptions): Promise<WithContext<ContentCategory>[]> {
    return window.electronLensService.getContentCategories(options);
  }

  async addContentCategory(data: AddInput<ContentCategoryData<string>>): Promise<HashResponse> {
    return window.electronLensService.addContentCategory(data);
  }

  async editContentCategory(data: EditInput<ContentCategoryData<string>>): Promise<HashResponse> {
    return window.electronLensService.editContentCategory(data);
  }

  async deleteContentCategory(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteContentCategory(id);
  }

  // Subscription Methods
  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    return window.electronLensService.getSubscriptions(options);
  }

  async addSubscription(data: AddInput<SubscriptionData>): Promise<HashResponse> {
    return window.electronLensService.addSubscription(data);
  }

  async deleteSubscription(data: { id?: string, to?: string }): Promise<IdResponse> {
    return window.electronLensService.deleteSubscription(data);
  }

  // Artist Methods
  async getArtist(id: string): Promise<WithContext<Artist> | undefined> {
    return window.electronLensService.getArtist(id);
  }

  async getArtists(options?: SearchOptions): Promise<WithContext<Artist>[]> {
    return window.electronLensService.getArtists(options);
  }

  async addArtist(data: AddInput<ArtistData>): Promise<HashResponse> {
    return window.electronLensService.addArtist(data);
  }

  async editArtist(data: EditInput<ArtistData>): Promise<HashResponse> {
    return window.electronLensService.editArtist(data);
  }

  async deleteArtist(id: string): Promise<IdResponse> {
    return window.electronLensService.deleteArtist(id);
  }

  // ACL Methods
  async getRoles(): Promise<Role[]> {
    return window.electronLensService.getRoles();
  }

  async assignRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse> {
    return window.electronLensService.assignRole(publicKey, roleId);
  }

  async revokeRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse> {
    return window.electronLensService.revokeRole(publicKey, roleId);
  }

  async addAdmin(publicKey: string | PublicSignKey): Promise<BaseResponse> {
    return window.electronLensService.addAdmin(publicKey);
  }
}

export class LensService implements ILensService {
  peerbit: ProgramClient | null = null;
  siteProgram: Site | null = null;
  private _federationManager: FederationManager | null = null;
  private _activeIdentity: Identity<Secp256k1PublicKey> | null = null;
  private _logger: Logger;
  private _extenarlyManaged: boolean = false;

  constructor(options?: LensServiceOptions) {
    this._logger = new Logger({ enabled: options?.debug, prefix: options?.customPrefix || 'LensService' });

    if (options?.identity) {
      this._activeIdentity = options.identity;
      this._logger.debug('LensService configured with a custom identity.');
    }

    if (options?.peerbit) {
      this.peerbit = options.peerbit;
      this._extenarlyManaged = true;
    }
  }

  async init(directory?: string): Promise<void> {
    if (this.peerbit) {
      throw new Error(
        'LensService: Already configured with an external Peerbit client. Do not call init().',
      );
    }
    this._logger.debug(`Initializing new Peerbit client in directory: ${directory || 'in-memory'}`);
    this.peerbit = await Peerbit.create({ directory });
    this._extenarlyManaged = false;
  }

  async stop() {
    const { peerbit } = this._ensureInitialized();
    if (this._federationManager) {
      await this._federationManager.stop();
      this._federationManager = null;
    }

    if (!this._extenarlyManaged) {
      await peerbit.stop();
      this._logger.debug('Internal Peerbit client stopped.');
    }
    if (this.siteProgram) {
      await this.siteProgram.close();
    }
    this.peerbit = null;
    this.siteProgram = null;
    this._logger.debug('LensService stopped successfully.');
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

  private async _verifyImmutableProperties<T extends ImmutableProps, I extends object>(
    store: Documents<T, I>,
    incomingData: T,
    extraKeys?: (keyof T)[],
  ): Promise<void> {
    // 1. Fetch the original document from the store using its ID.
    const originalDoc = await store.index.get(incomingData.id);

    if (!originalDoc) {
      throw new AccessError(`Document with ID "${incomingData.id}" not found. Cannot edit.`);
    }

    // 2. Verify the standard immutable properties.
    if (!originalDoc.postedBy.equals(incomingData.postedBy)) {
      throw new AccessError("Cannot change the 'postedBy' field during an edit.");
    }

    if (originalDoc.siteAddress !== incomingData.siteAddress) {
      throw new AccessError("Cannot change the 'siteAddress' field during an edit.");
    }

    // 3. If extra keys are provided, loop through and verify them.
    if (extraKeys) {
      for (const key of extraKeys) {
        // We compare the properties of the original document from the store
        // with the properties of the incoming data object.
        if (originalDoc[key as keyof T] !== incomingData[key]) {
          throw new AccessError(`Cannot change the '${String(key)}' field during an edit.`);
        }
      }
    }
  }

  private _getActiveSigner() {
    if (!this._activeIdentity) {
      return undefined;
    }
    return {
      signers: [this._activeIdentity.sign.bind(this._activeIdentity)],
    };
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
    this._logger.debug(`Site opened successfully at address: ${this.siteProgram.address}`);

    if (options?.federate) {
      this._logger.debug('Federation enabled. Initializing FederationManager.');
      // Create and start the manager. It handles everything from here.
      this._federationManager = new FederationManager(peerbit, siteProgram, this._logger);
      await this._federationManager.start();
    }

  }

  async getAccountStatus(): Promise<AccountStatusResponse> {
    this._logger.time('getAccountStatus');
    const { peerbit, siteProgram } = this._ensureSiteOpened();
    const publicKey = this._activeIdentity?.publicKey ?? peerbit.identity.publicKey;

    const response: AccountStatusResponse = {
      isAdmin: false,
      roles: [],
      permissions: [],
    };

    response.isAdmin = await siteProgram.access.admins.isTrusted(publicKey);
    if (response.isAdmin) {
      // Admin logic is correct and can remain.
      const allRoles = await siteProgram.access.roles.index.search({});
      const allPermissions = new Set<string>();
      for (const role of allRoles) {
        // FIX: The role's name is in the `name` property, not `id`.
        response.roles.push(role.name);
        role.permissions.forEach(p => allPermissions.add(p));
      }
      response.permissions = [...allPermissions];
      this._logger.debug('User status determined: ADMIN', response);
      this._logger.timeEnd('getAccountStatus');
      return response;
    }

    const userAssignments = await siteProgram.access.assignments.index.search(new SearchRequest({
      query: [new ByteMatchQuery({ key: 'user', value: publicKey.bytes })],
    }));

    if (userAssignments.length === 0) {
      response.roles.push('guest');
      this._logger.debug('User status determined: GUEST', response);
      this._logger.timeEnd('getAccountStatus');
      return response;
    }

    const assignedRoleIds = userAssignments.map(a => a.roleId);
    response.roles = assignedRoleIds;
    const allPermissions = new Set<string>();

    for (const roleId of assignedRoleIds) {
      const rolesFound = await siteProgram.access.roles.index.search(new SearchRequest({
        query: [new StringMatch({ key: 'name', value: roleId, caseInsensitive: true })],
        fetch: 1,
      }));
      const role = rolesFound[0];
      if (role) {
        role.permissions.forEach(p => allPermissions.add(p));
      }
    }

    response.permissions = [...allPermissions];
    this._logger.debug(`User status determined: ${response.roles.join(', ')}`, response);
    this._logger.timeEnd('getAccountStatus');
    return response;
  }

  // Release Methods
  async getRelease(id: string): Promise<WithContext<Release> | undefined> {
    const { siteProgram } = this._ensureSiteOpened();
    return siteProgram.releases.index.get(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    this._logger.time('getReleases');
    const { siteProgram } = this._ensureSiteOpened();

    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });

    this._logger.debug('Fetching all releases with iterator pattern:', request);
    this._logger.time('releases.index.iterate');

    const allResults: WithContext<Release>[] = [];
    const iterator = siteProgram.releases.index.iterate(request);

    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 releases per page
      for (const release of batch) {
        allResults.push(release);
      }
      this._logger.debug(`Fetched batch of ${batch.length} releases, total: ${allResults.length}`);
    }

    this._logger.timeEnd('releases.index.iterate');
    this._logger.debug(`Found a total of ${allResults.length} releases.`);
    this._logger.timeEnd('getReleases');
    return allResults;
  }

  async addRelease(data: AddInput<ReleaseData>): Promise<HashResponse> {
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();

      const release = new Release({
        ...data,
        postedBy: this._activeIdentity?.publicKey ?? peerbit.identity.publicKey,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.releases.put(release, this._getActiveSigner());
      this._logger.debug(`Successfully added release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to add release:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async editRelease(data: EditInput<ReleaseData>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      
      // Check if user has admin or moderator permissions first
      const userKey = this._activeIdentity?.publicKey ?? this.peerbit?.identity.publicKey;
      
      if (userKey) {
        const isAdmin = await siteProgram.access.admins.isTrusted(userKey);
        const canEditAny = await siteProgram.access.can({ permission: 'release:edit:any', identity: userKey });
        
        this._logger.debug(`Edit release permission check: isAdmin=${isAdmin}, canEditAny=${canEditAny}`);
        
        // If user is admin or has edit:any permission, create release with original postedBy
        if (isAdmin || canEditAny) {
          const originalRelease = await siteProgram.releases.index.get(data.id);
          if (originalRelease) {
            this._logger.debug(`Admin/moderator edit: using original postedBy=${originalRelease.postedBy.toString()}`);
            // Use the original postedBy for admins/moderators
            const release = new Release({
              ...data,
              postedBy: originalRelease.postedBy,
            });
            const result = await siteProgram.releases.put(release, this._getActiveSigner());
            this._logger.debug(`Successfully edited release with ID: ${release.id} (admin/moderator edit)`);
            return {
              success: true,
              id: release.id,
              hash: result.entry.hash,
            };
          }
        }
      }
      
      // Regular user path - verify immutable properties
      const release = new Release(data);
      await this._verifyImmutableProperties(siteProgram.releases, release);
      const result = await siteProgram.releases.put(release, this._getActiveSigner());
      this._logger.debug(`Successfully edited release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id: data.id, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to edit release with ID: ${data.id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async deleteRelease(id: string): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      this._logger.debug(`Attempting to delete release with ID: ${id}`);
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
        this._logger.debug(`Deleting associated featured release with ID: ${tfr.id}`);
        await siteProgram.featuredReleases.del(tfr.id, this._getActiveSigner());
      }

      await siteProgram.releases.del(id, this._getActiveSigner());
      this._logger.debug(`Successfully deleted release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to delete release with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  // Featured Release Methods
  async getFeaturedRelease(id: string): Promise<WithContext<FeaturedRelease> | undefined> {
    const { siteProgram } = this._ensureSiteOpened();
    return siteProgram.featuredReleases.index.get(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    this._logger.time('getFeaturedReleases');
    const { siteProgram } = this._ensureSiteOpened();

    const request = options?.request ?? new SearchRequest({
      sort: options?.sort ?? [
        new Sort({ key: 'created', direction: SortDirection.DESC }),
      ],
    });

    this._logger.debug('Fetching all featured releases with iterator pattern:', request);
    this._logger.time('featuredReleases.index.iterate');

    const allResults: WithContext<FeaturedRelease>[] = [];
    const iterator = siteProgram.featuredReleases.index.iterate(request);

    while (iterator.done() !== true) {
      const batch = await iterator.next(100); // Fetch 100 featured releases per page
      for (const featuredRelease of batch) {
        allResults.push(featuredRelease);
      }
      this._logger.debug(`Fetched batch of ${batch.length} featured releases, total: ${allResults.length}`);
    }

    this._logger.timeEnd('featuredReleases.index.iterate');
    this._logger.debug(`Found a total of ${allResults.length} featured releases.`);
    this._logger.timeEnd('getFeaturedReleases');
    return allResults;
  }

  async addFeaturedRelease(data: AddInput<FeaturedReleaseData>): Promise<HashResponse> {
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();

      const targetRelease = await this.getRelease(data.releaseId);

      if (!targetRelease) {
        throw new Error(
          `Cannot add featured release: The specified release ID ${data.releaseId} does not exist.`,
        );
      }
      const featuredRelease = new FeaturedRelease({
        ...data,
        postedBy: this._activeIdentity?.publicKey ?? peerbit.identity.publicKey,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.featuredReleases.put(featuredRelease, this._getActiveSigner());
      this._logger.debug(`Successfully added featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to add featured release:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async editFeaturedRelease(data: EditInput<FeaturedReleaseData>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();

      await this._verifyImmutableProperties(siteProgram.featuredReleases, data);
      const featuredRelease = new FeaturedRelease(data);
      const result = await siteProgram.featuredReleases.put(featuredRelease, this._getActiveSigner());
      this._logger.debug(`Successfully edited featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id: data.id, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to edit featured release with ID: ${data.id}`, error);
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
      await siteProgram.featuredReleases.del(id, this._getActiveSigner());
      this._logger.debug(`Successfully deleted featured release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to delete featured release with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  // Content Category Methods
  async getContentCategory(id: string): Promise<WithContext<ContentCategory> | undefined> {
    const { siteProgram } = this._ensureSiteOpened();
    return siteProgram.contentCategories.index.get(id);
  }

  async getContentCategories(options?: SearchOptions): Promise<WithContext<ContentCategory>[]> {
    const { siteProgram } = this._ensureSiteOpened();
    const request = options?.request ?? new SearchRequest({});
    return siteProgram.contentCategories.index.search(request);
  }

  async addContentCategory(data: AddInput<ContentCategoryData>): Promise<HashResponse> {
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();

      const category = new ContentCategory({
        ...data,
        postedBy: this._activeIdentity?.publicKey ?? peerbit.identity.publicKey,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.contentCategories.put(category, this._getActiveSigner());
      return { success: true, id: category.id, hash: result.entry.hash };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to add content category:', error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
      }
    }
  }

  async editContentCategory(data: EditInput<ContentCategoryData>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const category = new ContentCategory(data);
      await this._verifyImmutableProperties(siteProgram.contentCategories, category, ['categoryId']);
      const result = await siteProgram.contentCategories.put(category, this._getActiveSigner());
      return { success: true, id: category.id, hash: result.entry.hash };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to edit content category:', error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
      }
    }
  }

  async deleteContentCategory(id: string): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      await siteProgram.contentCategories.del(id, this._getActiveSigner());
      return { success: true, id };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to delete content category:', error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
      }
    }
  }

  // Subscription Methods
  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const request = options?.request ?? new SearchRequest({
        sort: options?.sort ?? [
          new Sort({ key: 'created', direction: SortDirection.DESC }),
        ],
      });

      this._logger.debug('Fetching all subscriptions with iterator pattern.');
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
      this._logger.debug(`Found a total of ${allResults.length} subscriptions.`);
      return allResults;
    } catch (error) {
      this._logger.error('Failed to get subscriptions:', error);
      return [];
    }
  }

  async addSubscription(data: AddInput<SubscriptionData>): Promise<HashResponse> {
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();
      this._logger.debug(`Adding subscription to site: ${data.to}`);
      const subscription = new Subscription({
        ...data,
        postedBy: this._activeIdentity?.publicKey ?? peerbit.identity.publicKey,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.subscriptions.put(subscription, this._getActiveSigner());
      return {
        success: true,
        id: subscription.siteAddress,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to add subscription:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async deleteSubscription(data: { id?: string, to?: string }): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();

      let subscriptionIdToDelete = data.id;
      if (data.to) {
        const subscription = await siteProgram.subscriptions.index.search(
          new SearchRequest({
            query: [
              new StringMatch({
                key: 'to',
                value: data.to,
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
      this._logger.debug(`Deleting subscription with ID: ${data.id}`);
      await siteProgram.subscriptions.del(subscriptionIdToDelete, this._getActiveSigner());

      return {
        success: true,
        id: data.id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, id: data.id, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to delete subscription with ID: ${data.id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  // Artist Methods
  async getArtist(id: string): Promise<WithContext<Artist> | undefined> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const artist = await siteProgram.artists.index.get(id);
      return artist;
    } catch (error) {
      this._logger.error('Failed to get artist:', error);
      return undefined;
    }
  }

  async getArtists(options?: SearchOptions): Promise<WithContext<Artist>[]> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const searchQuery = options?.request || new SearchRequest({ 
        fetch: options?.fetch || 100,
        query: options?.query,
        sort: options?.sort,
      });

      const results = await siteProgram.artists.index.search(searchQuery);
      return results;
    } catch (error) {
      this._logger.error('Failed to get artists:', error);
      return [];
    }
  }

  async addArtist(data: AddInput<ArtistData>): Promise<HashResponse> {
    try {
      const { peerbit, siteProgram } = this._ensureSiteOpened();
      const artist = new Artist({
        ...data,
        postedBy: this._activeIdentity?.publicKey ?? peerbit.identity.publicKey,
        siteAddress: siteProgram.address,
      });
      const result = await siteProgram.artists.put(artist, this._getActiveSigner());
      this._logger.debug(`Successfully added artist with ID: ${artist.id}`);
      return {
        success: true,
        id: artist.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to add artist:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async editArtist(data: EditInput<ArtistData>): Promise<HashResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      
      const artist = new Artist(data);
      await this._verifyImmutableProperties(siteProgram.artists, artist);
      
      const result = await siteProgram.artists.put(artist, this._getActiveSigner());
      this._logger.debug(`Successfully edited artist with ID: ${artist.id}`);
      return {
        success: true,
        id: artist.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error('Failed to edit artist:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  async deleteArtist(id: string): Promise<IdResponse> {
    try {
      const { siteProgram } = this._ensureSiteOpened();
      this._logger.debug(`Deleting artist with ID: ${id}`);
      await siteProgram.artists.del(id, this._getActiveSigner());
      return {
        success: true,
        id,
      };
    } catch (error) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied' };
      } else {
        this._logger.error(`Failed to delete artist with ID: ${id}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
      }
    }
  }

  // ACL Methods
  async getRoles(): Promise<Role[]> {
    this._logger.debug('Fetching all available roles...');
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const roles = await siteProgram.access.getRoles();
      this._logger.debug(`Found ${roles.length} roles.`);
      return roles;
    } catch (error) {
      this._logger.error('Failed to get roles:', error);
      return [];
    }
  }

  async assignRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse> {
    this._logger.debug(`Attempting to assign role "${roleId}" to key: ${publicKey}`);
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const userKey = publicKey instanceof PublicSignKey ? publicKey : publicSignKeyFromString(publicKey);

      // This call is protected by the RBAC controller's internal admin check.
      await siteProgram.access.assignRole(userKey, roleId);

      this._logger.debug(`Successfully assigned role "${roleId}".`);
      return { success: true };

    } catch (error: unknown) {
      if (error instanceof AccessError) {
        return { success: false, error: `Access denied. Could not assign role "${roleId}".` };
      }
      this._logger.error(`Failed to assign role "${roleId}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  async revokeRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse> {
    this._logger.debug(`Attempting to revoke role "${roleId}" for key: ${publicKey}`);
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const userKey = publicKey instanceof PublicSignKey ? publicKey : publicSignKeyFromString(publicKey);

      // To revoke, we must find the specific RoleAssignment document and delete it.
      // We'll add a helper method to our RBAC controller to make this cleaner.
      const success = await siteProgram.access.revokeRole(userKey, roleId);

      if (success) {
        this._logger.debug(`Successfully revoked role "${roleId}".`);
        return { success: true };
      } else {
        return { success: false, error: 'Role assignment not found for the specified user and role.' };
      }
    } catch (error: unknown) {
      if (error instanceof AccessError) {
        return { success: false, error: `Access denied. Could not revoke role "${roleId}".` };
      }
      this._logger.error(`Failed to revoke role "${roleId}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  async addAdmin(publicKey: string | PublicSignKey): Promise<BaseResponse> {
    this._logger.debug(`Attempting to promote user to admin: ${publicKey}`);
    try {
      const { siteProgram } = this._ensureSiteOpened();
      const userKey = publicKey instanceof PublicSignKey ? publicKey : publicSignKeyFromString(publicKey);

      // This call is already protected by the RBAC controller's internal admin check.
      await siteProgram.access.addAdmin(userKey);

      this._logger.debug('Successfully promoted user to admin.');
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof AccessError) {
        return { success: false, error: 'Access denied. Only an existing admin can add another.' };
      }
      this._logger.error('Failed to add admin:', error);
      return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
  }
}