import type { CanPerformOperations, Documents, DocumentsChange, Operation, WithContext } from '@peerbit/document';
import { isPutOperation, SearchRequest, StringMatch, StringMatchMethod } from '@peerbit/document';
import { Entry } from '@peerbit/log';
import type { AbstractType } from '@dao-xyz/borsh';
import { deserialize, field, vec, variant, serialize } from '@dao-xyz/borsh';
import { AbortError, delay } from '@peerbit/time';
import type { MaybePromise } from '@peerbit/crypto';
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

  constructor(
    private client: ProgramClient,
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
    // Listen for local changes and broadcast them
    this.siteProgram.releases.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('releases', event.detail);
    });

    this.siteProgram.featuredReleases.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('featuredReleases', event.detail);
    });

    this.siteProgram.contentCategories.events.addEventListener('change', (event) => {
      this.broadcastFederationUpdate('contentCategories', event.detail);
    });
  }

  private async broadcastFederationUpdate(
    storeName: 'releases' | 'featuredReleases' | 'contentCategories',
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
    await this.client.services.pubsub.publish(
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

  private _handleSubscriptionChange(event: CustomEvent<DocumentsChange<Subscription, Subscription>>) {
    this.logger.debug(`[FederationManager] Subscription change: ${event.detail.added.length} added, ${event.detail.removed.length} removed.`);
    for (const added of event.detail.added) {
      this.startFederation(added.siteAddress);
    }
    for (const removed of event.detail.removed) {
      this.stopFederation(removed.siteAddress);
    }
  }

  private async initializeExistingFederations() {
    const existingSubscriptions = await this.siteProgram.subscriptions.index.search({});
    this.logger.debug(`[FederationManager] Initializing ${existingSubscriptions.length} existing federations.`);
    for (const sub of existingSubscriptions) {
      await this.startFederation(sub.siteAddress);
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

    await this.client.services.pubsub.subscribe(federationTopic);
    this.client.services.pubsub.addEventListener('data', onFederationMessage);

    this.activeFederations.set(remoteSiteAddress, {
      close: async () => {
        this.logger.debug(`[FederationManager] Closing federation resources for ${remoteSiteAddress}`);
        syncController.abort();
        await this.client.services.pubsub.unsubscribe(federationTopic);
        this.client.services.pubsub.removeEventListener('data', onFederationMessage);
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
      const collectAll = async <T, I extends object>(store: Documents<T, I>) => {
        const allDocs: WithContext<T>[] = [];
        const iterator = store.index.iterate({ query });
        while (!iterator.done()) {
          const batch = await iterator.next(1000); // Process in batches of 1000
          allDocs.push(...batch);
        }
        return allDocs;
      };

      const [
        releasesToRemove, 
        featuredToRemove, 
        contentCategoriesToRemove,
        blockedContentToRemove,
      ] = await Promise.all([
        collectAll(this.siteProgram.releases),
        collectAll(this.siteProgram.featuredReleases),
        collectAll(this.siteProgram.contentCategories),
        collectAll(this.siteProgram.blockedContent),
      ]);

      const deletePromises = [
        ...releasesToRemove.map(r => this.siteProgram.releases.del(r.id)),
        ...featuredToRemove.map(fr => this.siteProgram.featuredReleases.del(fr.id)),
        ...contentCategoriesToRemove.map(fr => this.siteProgram.contentCategories.del(fr.id)),
        ...blockedContentToRemove.map(bc => this.siteProgram.blockedContent.del(bc.id)),
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
      remoteSiteProgram = await this.client.open<Site>(remoteSiteAddress, {
        timeout: 15000, // Timeout for opening the remote program
        args: {
          releasesArgs: { replicate: { factor: 1 } },
          featuredReleasesArgs: { replicate: { factor: 1 } },
          contentCategoriesArgs: { replicate: { factor: 1 } },
          blockedContentArgs: { replicate: { factor: 1 } },
          subscriptionsArgs: { replicate: false },
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
            blockedContentHeads,
          ] = await Promise.all([
            remoteSiteProgram!.releases.log.log.getHeads(true).all(),
            remoteSiteProgram!.featuredReleases.log.log.getHeads(true).all(),
            remoteSiteProgram!.contentCategories.log.log.getHeads(true).all(),
            remoteSiteProgram!.blockedContent.log.log.getHeads(true).all(),
          ]);

          const joinPromises: Promise<void>[] = [];

          if (releasesHeads.length > 0) {
            joinPromises.push(this.siteProgram.releases.log.join(releasesHeads));
          }
          if (featuredReleasesHeads.length > 0) {
            joinPromises.push(this.siteProgram.featuredReleases.log.join(featuredReleasesHeads));
          }
          if (contentCategoriesHeads.length > 0) {
            joinPromises.push(this.siteProgram.contentCategories.log.join(contentCategoriesHeads));
          }
          if (blockedContentHeads.length > 0) {
            joinPromises.push(this.siteProgram.blockedContent.log.join(blockedContentHeads));
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
}

const isSubscribed = async (
  originSiteAddress: string,
  subscriptionsStore: Documents<Subscription, IndexedSubscription>,
): Promise<boolean> => {

  const results = await subscriptionsStore.index.search(new SearchRequest({
    query: [
      new StringMatch({
        key: 'siteAddress',
        value: originSiteAddress,
        caseInsensitive: false,
        method: StringMatchMethod.exact,
      }),
    ],
    fetch: 1,
  }));

  return results.length > 0;
};

export const canPerformFederatedWrite = async <
  T extends { siteAddress: string },
  I extends object = T
>(
  site: Site,
  props: CanPerformOperations<T>,
  targetStore: Documents<T, I>,
  docClass: AbstractType<T>,
  localPermissionCheck: (props: CanPerformOperations<T>) => MaybePromise<boolean>,
): Promise<boolean> => {
  
  // Step 1: Determine the origin of the data.
  let originSiteAddress: string | undefined;

  if (isPutOperation(props.operation)) {
    const doc = deserialize(props.operation.data, docClass);
    originSiteAddress = doc.siteAddress;
  } else { // This block now handles DELETE operations.
    const docToDelete = await targetStore.index.get(props.operation.key.key);
    if (!docToDelete) {
      return false; // If the document to delete doesn't exist, deny.
    }
    originSiteAddress = docToDelete.siteAddress;
  }

  // If no origin, it's an invalid state. Deny.
  if (!originSiteAddress) {
    return false; 
  }

  // Step 2: If the data's origin is the local site, always use the local permission check.
  if (originSiteAddress === site.address) {
    return localPermissionCheck(props);
  }

  // Step 3: At this point, we know the data is from a remote site.
  // Apply the simplified rules for federated data.
  if (isPutOperation(props.operation)) {
    // For a remote PUT, we must be subscribed to the origin.
    return isSubscribed(originSiteAddress, site.subscriptions);
  } else {
    // For a remote DELETE, we trust our federated partner. Allow.
    return true;
  }
};
