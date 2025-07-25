import type { Documents, DocumentsChange, Operation, WithContext, WithIndexedContext } from '@peerbit/document';
import { StringMatch } from '@peerbit/document';
import { Entry } from '@peerbit/log';
import { deserialize, field, vec, variant, serialize } from '@dao-xyz/borsh';
import { AbortError, delay } from '@peerbit/time';
import type { DataEvent } from '@peerbit/pubsub-interface';
import type { FederatedStoreKey } from '../types';
import type { Logger } from '../../../common/logger';
import type { ProgramClient } from '@peerbit/program';
import type { IndexedSubscription, Subscription } from '../schemas/subscription';
import type { Site } from '../program';

@variant('federation_update')
export class FederationUpdate {
  @field({ type: 'string' })
  store: FederatedStoreKey;

  @field({ type: vec(Entry) })
  added: Entry<Operation>[];

  @field({ type: vec(Entry) })
  removed: Entry<Operation>[];

  constructor(props: { store: FederatedStoreKey, added?: Entry<Operation>[], removed?: Entry<Operation>[] }) {
    this.store = props.store;
    this.added = props.added || [];
    this.removed = props.removed || [];
  }
}

/**
 * Manages all federation logic:
 * 1. Broadcasting local changes to other sites (Push).
 * 2. Listening for remote changes from subscribed sites (Pull - Live).
 * 3. Syncing historical data upon new subscription (Pull - Historical).
 * 4. Cleaning up data when a subscription is removed.
 */
export class FederationManager {
  private activeFederations: Map<string, { close: () => Promise<void> }> = new Map();
  private _federatedStores: FederatedStoreKey[] = [
    'releases',
    'featuredReleases',
    'contentCategories',
    'blockedContent',
  ];
  constructor(
    private peerbit: ProgramClient,
    private siteProgram: Site,
    private logger: Logger,
  ) { }

  /**
   * Starts the federation service. Should be called once the site is open.
   */
  public async start() {
    this.logger.debug('[FederationManager] Starting...');
    this.setupFederationBroadcasts();
    this.setupSubscriptionListener();
    await this.initializeExistingFederations();
    this.logger.debug('[FederationManager] Started successfully.');
  }

  /**
   * Stops all federation activities and cleans up resources.
   */
  public async stop() {
    this.logger.debug('[FederationManager] Stopping all active federations...');
    this.removeSubscriptionListener();
    await Promise.all([...this.activeFederations.values()].map(federation => federation.close()));
    this.activeFederations.clear();
    this.logger.debug('[FederationManager] All federations stopped.');
  }

  // --- Private Lifecycle and Setup Methods ---
  private setupFederationBroadcasts() {
    for (const storeName of this._federatedStores) {
      this.siteProgram[storeName].events.addEventListener('change', (event: CustomEvent<DocumentsChange<unknown, unknown>>) => {
        this.broadcastFederationUpdate(storeName, event.detail);
      });
    }
  }

  private async broadcastFederationUpdate(
    storeName: FederatedStoreKey,
    change: DocumentsChange<unknown, unknown>,
  ) {
    // We need the full Entry<Operation> object to broadcast
    // This requires fetching them from the log based on the change set
    const getEntriesFromChange = async (docs: WithContext<unknown>[]) => {
      const entries: Entry<Operation>[] = [];
      for (const doc of docs) {
        const entry = await this.siteProgram[storeName].log.log.get(doc.__context.head);
        if (entry) entries.push(entry);
      }
      return entries;
    };

    const addedEntries = await getEntriesFromChange(change.added);
    const removedEntries = await getEntriesFromChange(change.removed);

    if (addedEntries.length === 0 && removedEntries.length === 0) {
      return;
    }

    const updateMessage = new FederationUpdate({
      store: storeName,
      added: addedEntries,
      removed: removedEntries,
    });

    // Publish to this site's unique federation topic
    await this.peerbit.services.pubsub.publish(
      serialize(updateMessage),
      { topics: [this.siteProgram.federationTopic] },
    );
  }

  private setupSubscriptionListener() {
    this.logger.debug('[FederationManager] Setting up subscription change listener.');
    this._handleSubscriptionChange = this._handleSubscriptionChange.bind(this);
    this.siteProgram.subscriptions.events.addEventListener('change', this._handleSubscriptionChange);
  }

  private removeSubscriptionListener() {
    if (this.siteProgram && !this.siteProgram.closed) {
      this.logger.debug('[FederationManager] Removing subscription change listener.');
      this.siteProgram.subscriptions.events.removeEventListener('change', this._handleSubscriptionChange);
    }
  }

  private _handleSubscriptionChange(event: CustomEvent<DocumentsChange<Subscription, IndexedSubscription>>) {
    this.logger.debug(`[FederationManager] Subscription change: ${event.detail.added.length} added, ${event.detail.removed.length} removed.`);
    for (const added of event.detail.added) {
      this.startFederation(added.to);
    }
    for (const removed of event.detail.removed) {
      this.stopFederation(removed.to);
    }
  }

  private async initializeExistingFederations() {
    const existingSubscriptions = await this.siteProgram.subscriptions.index.search({});
    this.logger.debug(`[FederationManager] Initializing ${existingSubscriptions.length} existing federations.`);
    for (const sub of existingSubscriptions) {
      await this.startFederation(sub.to);
    }
  }

  // --- Core Federation Logic ---

  private async startFederation(remoteSiteAddress: string) {
    if (remoteSiteAddress === this.siteProgram.address || this.activeFederations.has(remoteSiteAddress)) {
      this.logger.debug(`[FederationManager] Federation with ${remoteSiteAddress} is self or already active. Skipping.`);
      return;
    }

    this.logger.debug(`[FederationManager] Activating federation with: ${remoteSiteAddress}`);
    const syncController = new AbortController();

    this.runHistoricalSync(remoteSiteAddress, syncController.signal).catch(err => {
      this.logger.error(`[FederationManager] Unhandled error in historical sync for ${remoteSiteAddress}:`, err);
    });

    const federationTopic = `${remoteSiteAddress}/federation`;
    const onFederationMessage = async (event: CustomEvent<DataEvent>) => {
      if (!event.detail.data.topics.includes(federationTopic)) {
        return;
      }
      try {
        const update = deserialize(event.detail.data.data, FederationUpdate);
        const targetStore = this.siteProgram[update.store].log;
        if (update.added.length > 0) await targetStore.join(update.added);
        if (update.removed.length > 0) await targetStore.join(update.removed);
      } catch { /* Not a FederationUpdate, ignore */ }
    };

    await this.peerbit.services.pubsub.subscribe(federationTopic);
    this.peerbit.services.pubsub.addEventListener('data', onFederationMessage);

    this.activeFederations.set(remoteSiteAddress, {
      close: async () => {
        this.logger.debug(`[FederationManager] Closing federation resources for ${remoteSiteAddress}`);
        syncController.abort();
        await this.peerbit.services.pubsub.unsubscribe(federationTopic);
        this.peerbit.services.pubsub.removeEventListener('data', onFederationMessage);
      },
    });

    this.logger.debug(`[FederationManager] Federation fully active for: ${remoteSiteAddress}`);
  }

  private async stopFederation(remoteSiteAddress: string) {
    const federationHandle = this.activeFederations.get(remoteSiteAddress);
    if (!federationHandle) return;

    this.logger.debug(`[FederationManager] Stopping federation with: ${remoteSiteAddress}`);
    try {
      this.logger.debug(`Cleaning up federated documents from site: ${remoteSiteAddress}`);
      const query = [new StringMatch({ key: 'siteAddress', value: remoteSiteAddress })];

      // Helper function to iterate and collect all documents from a store matching a query
      const collectAll = async <T, I extends { id: string }>(store: Documents<T, I>) => {
        const allDocs: WithIndexedContext<T, I>[] = [];
        const iterator = store.index.iterate({ query });
        while (!iterator.done()) {
          const batch = await iterator.next(1000); // Process in batches of 1000
          allDocs.push(...batch);
        }
        return allDocs;
      };

      const cleanupPromises = this._federatedStores.map(async (storeName) => {
        const store = this.siteProgram[storeName];
        const documentsToRemove = await collectAll((store as Documents<unknown>));
        return documentsToRemove.map(doc => store.del((doc as unknown as { id: string }).id));
      });

      // Flatten the array of promises and execute them
      const deletePromises = (await Promise.all(cleanupPromises)).flat();

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

  private async runHistoricalSync(remoteSiteAddress: string, externalSignal: AbortSignal): Promise<void> {
    const SYNC_DURATION_MS = 60 * 1000; // 1 minute
    const SYNC_POLL_INTERVAL_MS = 3 * 1000; // 3 seconds
    this.logger.debug(`[FederationManager] Starting historical sync for ${remoteSiteAddress}`);

    let remoteSiteProgram: Site | undefined;
    const timeoutController = new AbortController();
    const combinedSignal = AbortSignal.any([externalSignal, timeoutController.signal]);

    const timeoutId = setTimeout(() => {
      this.logger.debug(`[Federation] Historical sync timeout reached for ${remoteSiteAddress}.`);
      timeoutController.abort();
    }, SYNC_DURATION_MS);

    try {
      remoteSiteProgram = await this.peerbit.open<Site>(remoteSiteAddress, {
        timeout: 15000, // Timeout for opening the remote program
        args: {
          ...Object.fromEntries(this._federatedStores.map(key => [`${key}Args`, { replicate: { factor: 1 } }])),
          subscriptionsArgs: { replicate: false },
        },
      });

      const syncLoop = async () => {
        while (!combinedSignal.aborted) {
          this.logger.debug(`[Federation] Running sync poll for ${remoteSiteAddress}`);

          // --- REFACTOR: Dynamically get heads and join logs ---
          await Promise.all(this._federatedStores.map(async (storeName) => {
            const remoteStore = remoteSiteProgram![storeName];
            const localStore = this.siteProgram[storeName];

            const heads = await remoteStore.log.log.getHeads(true).all();
            if (heads.length > 0) {
              await localStore.log.join(heads);
            }
          }));

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
}
