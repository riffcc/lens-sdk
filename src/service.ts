import { Peerbit } from 'peerbit';
import type { Documents, DocumentsChange } from '@peerbit/document';
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
import type { Site } from './schema';
import { FeaturedRelease, FederationUpdate, Release, Subscription } from './schema';
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
import {
  FEATURED_RELEASE_ID_PROPERTY,
  ID_PROPERTY,
  SUBSCRIPTION_NAME_PROPERTY,
  SITE_NAME_PROPERTY,
  SITE_DESCRIPTION_PROPERTY,
  SITE_IMAGE_CID_PROPERTY,
  SITE_ADDRESS_PROPERTY,
} from './constants';
import type { PublicSignKey } from '@peerbit/crypto';
import { type IdentityAccessController, ACCESS_TYPE_PROPERTY, AccessType, Access } from '@peerbit/identity-access-controller';
import { deserialize } from '@dao-xyz/borsh';
import type { DataEvent } from '@peerbit/pubsub-interface';
import { AbortError, delay } from '@peerbit/time';

class _Logger {
  private prefix: string;
  public readonly enabled: boolean;

  constructor(options: { enabled?: boolean; prefix?: string }) {
    this.enabled = options.enabled || false;
    this.prefix = options.prefix || '[LensService]';
  }

  debug(...args: unknown[]) {
    if (this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  error(...args: unknown[]) {
    // Errors are always logged for visibility.
    console.error(this.prefix, '[ERROR]', ...args);
  }

  time(label: string) {
    if (this.enabled) {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (this.enabled) {
      console.timeEnd(label);
    }
  }
}

// Cache for performance optimization
const accessCheckCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

const canPerformCheck = async (accessController: IdentityAccessController, key: PublicSignKey, logger: _Logger) => {
  const timerLabel = `canPerformCheck on ACL: ${accessController.address?.slice(0, 10)}`;
  logger.time(timerLabel);

  // Check cache first
  const cacheKey = `${accessController.address}_${key.toString()}`;
  const cached = accessCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`canPerformCheck for ACL ${accessController.address?.slice(0, 10)} - Cache hit`);
    logger.timeEnd(timerLabel);
    return cached.result;
  }

  // Optimized query with specific access types
  logger.time(`${timerLabel} - index.search`);
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
    }),
  );
  logger.timeEnd(`${timerLabel} - index.search`);

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
          logger.timeEnd(timerLabel);
          return true;
        }
        continue;
      }
    }
  }

  // Cache negative result
  accessCheckCache.set(cacheKey, { result: false, timestamp: Date.now() });
  logger.timeEnd(timerLabel);
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

  async openSite(siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate: boolean } = { federate: true }): Promise<void> {
    await window.electronLensService.openSite(siteOrAddress, options);
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

  async getSiteAddress(): Promise<string> {
    return window.electronLensService.getSiteAddress();
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

  async addRelease(data: Omit<ReleaseData, 'siteAddress'>): Promise<HashResponse> {
    return window.electronLensService.addRelease(data);
  }
  // Admin methods
  async editRelease(data: IdData & ReleaseData): Promise<HashResponse> {
    return window.electronLensService.editRelease(data);
  }

  async deleteRelease(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteRelease(data);
  }

  async addFeaturedRelease(data: Omit<FeaturedReleaseData, 'siteAddress'>): Promise<HashResponse> {
    return window.electronLensService.addFeaturedRelease(data);
  }

  async editFeaturedRelease(data: IdData & FeaturedReleaseData): Promise<HashResponse> {
    return window.electronLensService.editFeaturedRelease(data);
  }

  async deleteFeaturedRelease(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteFeaturedRelease(data);
  }

  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    return window.electronLensService.getSubscriptions(options);
  }

  async addSubscription(data: Omit<SubscriptionData, 'id'>): Promise<HashResponse> {
    return window.electronLensService.addSubscription(data);
  }

  async deleteSubscription(data: IdData): Promise<IdResponse> {
    return window.electronLensService.deleteSubscription(data);
  }
}

export class LensService implements ILensService {
  client: Peerbit | null = null;
  siteProgram: Site | null = null;
  private logger: _Logger;
  private extenarlyManaged: boolean = false;

  private activeFederations: Map<string, { close: () => Promise<void>; }> = new Map();

  constructor(options?: { client?: Peerbit; debug?: boolean }) {
    this.logger = new _Logger({ enabled: options?.debug, prefix: '[LensService]' });

    if (options?.client) {
      this.client = options.client;
      this.extenarlyManaged = true;
    }
  }

  async init(directory?: string): Promise<void> {
    if (this.client) {
      throw new Error(
        'LensService: Already configured with an external client. Do not call init().',
      );
    }
    this.logger.debug(`Initializing new Peerbit client in directory: ${directory || 'in-memory'}`);
    this.client = await Peerbit.create({ directory });
    this.extenarlyManaged = false;
  }

  async stop() {
    const { client } = this.ensureInitialized();
    this.logger.debug('Stopping LensService...');
    await Promise.all([...this.activeFederations.values()].map(federation => federation.close()));
    this.activeFederations.clear();
    this.removeSubscriptionListener();
    this.logger.debug('All active federations stopped.');

    if (!this.extenarlyManaged) {
      await client.stop();
      this.logger.debug('Internal Peerbit client stopped.');
    }
    if (this.siteProgram) {
      await this.siteProgram.close();
    }
    this.client = null;
    this.siteProgram = null;
    this.logger.debug('LensService stopped successfully.');
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

  private ensureSiteOpened(): {
    client: Peerbit;
    siteProgram: Site;
  } {
    const { client } = this.ensureInitialized();
    if (!this.siteProgram || this.siteProgram.closed) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      client: client,
      siteProgram: this.siteProgram,
    };
  }

  async openSite(siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate: boolean } = { federate: true }): Promise<void> {
    if (this.siteProgram) {
      throw new Error('A site is already open. Please close it before opening a new one.');
    }
    const { client } = this.ensureInitialized();
    this.siteProgram = await client.open(siteOrAddress, { args: options.siteArgs });
    this.logger.debug(`Site opened successfully at address: ${this.siteProgram.address}`);

    if (options.federate) {
      this.setupSubscriptionListener();
      await this.initializeExistingFederations();
    }

  }

  private setupSubscriptionListener() {
    const { siteProgram } = this.ensureSiteOpened();
    this.logger.debug('Setting up subscription listener.');
    this._handleSubscriptionChange = this._handleSubscriptionChange.bind(this);
    siteProgram.subscriptions.events.addEventListener('change', this._handleSubscriptionChange);
  }

  private removeSubscriptionListener() {
    if (this.siteProgram && !this.siteProgram.closed) {
      this.logger.debug('Removing subscription listener.');
      this.siteProgram.subscriptions.events.removeEventListener('change', this._handleSubscriptionChange);
    }
  }

  private _handleSubscriptionChange(event: CustomEvent<DocumentsChange<Subscription, Subscription>>) {
    this.logger.debug(`Subscription change detected: ${event.detail.added.length} added, ${event.detail.removed.length} removed.`);
    for (const added of event.detail.added) {
      this.startFederation(added[SITE_ADDRESS_PROPERTY]);
    }
    for (const removed of event.detail.removed) {
      this.stopFederation(removed[SITE_ADDRESS_PROPERTY]);
    }
  }

  private async initializeExistingFederations() {
    const { siteProgram } = this.ensureSiteOpened();
    const existingSubscriptions = await siteProgram.subscriptions.index.search({});
    this.logger.debug(`Found ${existingSubscriptions.length} existing subscriptions to initialize.`);
    for (const sub of existingSubscriptions) {
      await this.startFederation(sub[SITE_ADDRESS_PROPERTY]);
    }
  }

  private async runHistoricalSync(remoteSiteAddress: string, externalSignal: AbortSignal): Promise<void> {
    const { client, siteProgram: localSiteProgram } = this.ensureSiteOpened();
    const SYNC_DURATION_MS = 60 * 1000; // 1 minute
    const SYNC_POLL_INTERVAL_MS = 3 * 1000; // 3 seconds
    this.logger.debug(`[Federation] Starting historical sync for ${remoteSiteAddress} (max duration: ${SYNC_DURATION_MS}ms)`);

    let remoteSiteProgram: Site | undefined;
    const timeoutController = new AbortController();
    const combinedSignal = AbortSignal.any([externalSignal, timeoutController.signal]);

    // REFACTOR: Use setTimeout to trigger the abort signal for a clean timeout.
    const timeoutId = setTimeout(() => {
      this.logger.debug(`[Federation] Historical sync timeout reached for ${remoteSiteAddress}.`);
      timeoutController.abort();
    }, SYNC_DURATION_MS);

    try {
      remoteSiteProgram = await client.open<Site>(remoteSiteAddress, {
        timeout: 15000, // Timeout for opening the remote program
        args: {
          releasesArgs: { replicate: { factor: 1 } },
          featuredReleasesArgs: { replicate: { factor: 1 } },
          contentCategoriesArgs: { replicate: { factor: 1 } },
          subscriptionsArgs: { replicate: false },
          blockedContentArgs: { replicate: false },
          membersArg: { replicate: false },
          administratorsArgs: { replicate: false },
        },
      });

      // This loop will be broken by the AbortController's signal
      const syncLoop = async () => {
        while (!combinedSignal.aborted) {
          this.logger.debug(`[Federation] Running sync poll for ${remoteSiteAddress}`);

          const [
            releasesHeads,
            featuredReleasesHeads,
            contentCategoriesHeads,

          ] = await Promise.all([
            remoteSiteProgram!.releases.log.log.getHeads(true).all(),
            remoteSiteProgram!.featuredReleases.log.log.getHeads(true).all(),
            remoteSiteProgram!.contentCategories.log.log.getHeads(true).all(),
          ]);

          const joinPromises: Promise<void>[] = [];

          if (releasesHeads.length > 0) {
            joinPromises.push(localSiteProgram.releases.log.join(releasesHeads));
          }
          if (featuredReleasesHeads.length > 0) {
            joinPromises.push(localSiteProgram.featuredReleases.log.join(featuredReleasesHeads));
          }
          if (contentCategoriesHeads.length > 0) {
            joinPromises.push(localSiteProgram.contentCategories.log.join(contentCategoriesHeads));
          }

          await Promise.all(joinPromises);

          await delay(SYNC_POLL_INTERVAL_MS, { signal: combinedSignal });
        }
      };
      await syncLoop();
    } catch (error) {
      if (!(error instanceof AbortError)) { // Ignore AbortError as it's expected on timeout
        this.logger.error(`[Federation] Error during historical sync for ${remoteSiteAddress}:`, error);
      }
    } finally {
      clearTimeout(timeoutId); // Important: always clear the timeout
      if (remoteSiteProgram) {
        await remoteSiteProgram.close();
        this.logger.debug(`[Federation] Historical sync for ${remoteSiteAddress} finished. Remote program closed.`);
      }
    }
  }

  private async startFederation(remoteSiteAddress: string) {
    const { client, siteProgram: localSiteProgram } = this.ensureSiteOpened();

    if (remoteSiteAddress === localSiteProgram.address || this.activeFederations.has(remoteSiteAddress)) {
      this.logger.debug(`Federation with ${remoteSiteAddress} is already active or is self, skipping.`);
      return;
    }

    this.logger.debug(`Activating federation with site: ${remoteSiteAddress}`);
    const syncController = new AbortController();
    // --- PHASE 1: HISTORICAL SYNC (Fire-and-forget) ---
    // This runs in the background and cleans itself up.
    this.runHistoricalSync(remoteSiteAddress, syncController.signal).catch(error => {
      this.logger.error(`[Federation] Unhandled error in historical sync background process for ${remoteSiteAddress}:`, error);
    });

    // --- PHASE 2: LIVE UPDATES (Pub/Sub) ---
    const federationTopic = `${remoteSiteAddress}/federation`;

    const onFederationMessage = async (event: CustomEvent<DataEvent>) => {
      if (!event.detail.data.topics.includes(federationTopic)) {
        return;
      }
      try {
        const update = deserialize(event.detail.data.data, FederationUpdate);
        const targetStore = localSiteProgram[update.store].log;
        if (update.added.length > 0) await targetStore.join(update.added);
        if (update.removed.length > 0) await targetStore.join(update.removed);
      } catch { /* Not a FederationUpdate, ignore */ }
    };

    this.logger.debug(`Subscribing to live updates on topic: ${federationTopic}`);
    await client.services.pubsub.subscribe(federationTopic);
    client.services.pubsub.addEventListener('data', onFederationMessage);

    // Store the cleanup logic for the live subscription.
    this.activeFederations.set(remoteSiteAddress, {
      close: async () => {
        this.logger.debug(`Cleaning up live subscription for ${remoteSiteAddress}`);
        syncController.abort();
        await client.services.pubsub.unsubscribe(federationTopic);
        client.services.pubsub.removeEventListener('data', onFederationMessage);
      },
    });

    this.logger.debug(`Federation fully active for site: ${remoteSiteAddress}`);
  }

  private async stopFederation(remoteSiteAddress: string) {
    const federationHandle = this.activeFederations.get(remoteSiteAddress);
    if (!federationHandle) {
      this.logger.debug(`No active federation for site ${remoteSiteAddress}, skipping stop.`);
      return;
    }

    try {
      const { siteProgram: localSiteProgram } = this.ensureSiteOpened();
      this.logger.debug(`Cleaning up federated documents from site: ${remoteSiteAddress}`);
      const query = [new StringMatch({ key: SITE_ADDRESS_PROPERTY, value: remoteSiteAddress })];

      // Helper function to iterate and collect all documents from a store matching a query
      const collectAll = async <T, I extends object>(store: Documents<T, I>) => {
        const allDocs: WithContext<T>[] = [];
        const iterator = store.index.iterate({ query });
        while (!iterator.done()) {
            const batch = await iterator.next(1000); // Process in batches of 1000
            allDocs.push(...batch);
        }
        return allDocs;
      };

      const [releasesToRemove, featuredToRemove, contentCategoriesToRemove] = await Promise.all([
          collectAll(localSiteProgram.releases),
          collectAll(localSiteProgram.featuredReleases),
          collectAll(localSiteProgram.contentCategories),
      ]);

      const deletePromises = [
        ...releasesToRemove.map(r => localSiteProgram.releases.del(r.id)),
        ...featuredToRemove.map(fr => localSiteProgram.featuredReleases.del(fr.id)),
        ...contentCategoriesToRemove.map(fr => localSiteProgram.contentCategories.del(fr.id)),
      ];

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        this.logger.debug(`Cleaned up ${deletePromises.length} federated documents from site: ${remoteSiteAddress}.`);
      }

      this.logger.debug(`Stopping federation with site: ${remoteSiteAddress}`);
      await federationHandle.close();
      this.activeFederations.delete(remoteSiteAddress);
    } catch (error) {
      this.logger.error(`Error during federation cleanup for site ${remoteSiteAddress}:`, error);
    }
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
    this.logger.time('getAccountStatus');
    const { client, siteProgram } = this.ensureSiteOpened();

    // Run permission checks in parallel for better performance.
    const [isAdmin, isMember] = await Promise.all([
      canPerformCheck(siteProgram.administrators, client.identity.publicKey, this.logger),
      canPerformCheck(siteProgram.members, client.identity.publicKey, this.logger),
    ]);

    // Check from highest to lowest privilege.
    if (isAdmin) {
      this.logger.debug('User status determined: ADMIN.');
      this.logger.timeEnd('getAccountStatus');
      return AccountType.ADMIN;
    }

    if (isMember) {
      this.logger.debug('User status determined: MEMBER.');
      this.logger.timeEnd('getAccountStatus');
      return AccountType.MEMBER;
    }

    this.logger.debug('User status determined: GUEST.');
    this.logger.timeEnd('getAccountStatus');
    return AccountType.GUEST;
  }

  async getSiteAddress(): Promise<string> {
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
      this.logger.debug('Updating site metadata:', metadata);
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
      this.logger.error('Failed to update site metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update site metadata',
      };
    }
  }

  async getRemoteSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
    try {
      const { client } = this.ensureInitialized();
      this.logger.debug(`Fetching remote site metadata for: ${siteId}`);

      // Open remote site temporarily to get metadata
      const remoteSite = await client.open<Site>(siteId);

      const metadata: SiteMetadata = {
        [SITE_NAME_PROPERTY]: remoteSite[SITE_NAME_PROPERTY],
        [SITE_DESCRIPTION_PROPERTY]: remoteSite[SITE_DESCRIPTION_PROPERTY],
        [SITE_IMAGE_CID_PROPERTY]: remoteSite[SITE_IMAGE_CID_PROPERTY],
      };

      // Close the remote site
      await remoteSite.close();
      this.logger.debug(`Successfully fetched and closed remote site handle for: ${siteId}`);

      return metadata;
    } catch (error) {
      this.logger.error('Failed to get remote site metadata:', error);
      return null;
    }
  }

  async getRelease({ id }: IdData): Promise<WithContext<Release> | undefined> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.releases.index.get(id);
  }

  async getReleases(options?: SearchOptions): Promise<WithContext<Release>[]> {
    this.logger.time('getReleases');
    const { siteProgram } = this.ensureSiteOpened();

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
      allResults.push(...batch);
      this.logger.debug(`Fetched batch of ${batch.length} releases, total: ${allResults.length}`);
    }

    this.logger.timeEnd('releases.index.iterate');
    this.logger.debug(`Found a total of ${allResults.length} releases.`);
    this.logger.timeEnd('getReleases');
    return allResults;
  }

  async getFeaturedRelease({ id }: IdData): Promise<WithContext<FeaturedRelease> | undefined> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.featuredReleases.index.get(id);
  }

  async getFeaturedReleases(options?: SearchOptions): Promise<WithContext<FeaturedRelease>[]> {
    this.logger.time('getFeaturedReleases');
    const { siteProgram } = this.ensureSiteOpened();

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
      allResults.push(...batch);
      this.logger.debug(`Fetched batch of ${batch.length} featured releases, total: ${allResults.length}`);
    }

    this.logger.timeEnd('featuredReleases.index.iterate');
    this.logger.debug(`Found a total of ${allResults.length} featured releases.`);
    this.logger.timeEnd('getFeaturedReleases');
    return allResults;
  }

  async addRelease(data: Omit<ReleaseData, 'siteAddress'>): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const release = new Release({
        ...data,
        [SITE_ADDRESS_PROPERTY]: siteProgram.address,
      });
      const result = await siteProgram.releases.put(release);
      this.logger.debug(`Successfully added release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error('Failed to add release:', error);
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
      this.logger.debug(`Successfully edited release with ID: ${release.id}`);
      return {
        success: true,
        id: release.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error(`Failed to edit release with ID: ${data.id}`, error);
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
        await this.deleteFeaturedRelease({ id: tfr.id });
      }

      await siteProgram.releases.del(id);
      this.logger.debug(`Successfully deleted release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      this.logger.error(`Failed to delete release with ID: ${id}`, error);
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete release',
      };
    }
  }

  async addFeaturedRelease(data: Omit<FeaturedReleaseData, 'siteAddress'>): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      const targetRelease = await this.getRelease({ id: data[FEATURED_RELEASE_ID_PROPERTY] });

      if (!targetRelease) {
        throw new Error(
          `Cannot add featured release: The specified release ID ${data[FEATURED_RELEASE_ID_PROPERTY]} does not exist.`,
        );
      }
      const featuredRelease = new FeaturedRelease({
        ...data,
        [SITE_ADDRESS_PROPERTY]: siteProgram.address,
      });
      const result = await siteProgram.featuredReleases.put(featuredRelease);
      this.logger.debug(`Successfully added featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error('Failed to add featured release:', error);
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
      this.logger.debug(`Successfully edited featured release with ID: ${featuredRelease.id}`);

      return {
        success: true,
        id: featuredRelease.id,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error(`Failed to edit featured release with ID: ${data.id}`, error);
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
      this.logger.debug(`Successfully deleted featured release with ID: ${id}`);
      return {
        success: true,
        id,
      };
    } catch (error) {
      this.logger.error(`Failed to delete featured release with ID: ${id}`, error);
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete featured release',
      };
    }
  }

  async getSubscriptions(options?: SearchOptions): Promise<Subscription[]> {
    try {
      const { siteProgram } = this.ensureSiteOpened();
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
          allResults.push({
            [ID_PROPERTY]: subscription[ID_PROPERTY],
            [SITE_ADDRESS_PROPERTY]: subscription[SITE_ADDRESS_PROPERTY],
            [SUBSCRIPTION_NAME_PROPERTY]: subscription[SUBSCRIPTION_NAME_PROPERTY],
          });
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

  async addSubscription(data: SubscriptionData): Promise<HashResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();
      this.logger.debug(`Adding subscription to site: ${data.siteAddress}`);
      const subscription = new Subscription(data);
      const result = await siteProgram.subscriptions.put(subscription);
      return {
        success: true,
        id: subscription.siteAddress,
        hash: result.entry.hash,
      };
    } catch (error) {
      this.logger.error('Failed to add subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add subscription',
      };
    }
  }

  async deleteSubscription({ id, siteAddress }: Partial<IdData & { siteAddress: string }>): Promise<IdResponse> {
    try {
      const { siteProgram } = this.ensureSiteOpened();

      let subscriptionIdToDelete = id;
      if (siteAddress) {
        const subscription = await siteProgram.subscriptions.index.search(
          new SearchRequest({
            query: [
              new StringMatch({
                key: SITE_ADDRESS_PROPERTY,
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
      this.logger.error(`Failed to delete subscription with ID: ${id}`, error);
      return {
        success: false,
        id,
        error: error instanceof Error ? error.message : 'Failed to delete subscription',
      };
    }
  }

}