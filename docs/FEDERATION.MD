## Architecture and Data Flow of the Lens Federation System

### 1. Executive Summary

The Lens Federation System is a decentralized content management and distribution network built on the Peerbit framework. Its architecture allows independent, self-contained "Sites" to operate autonomously while also being able to "federate" with each other. Federation is achieved through a subscription model, where one Site can subscribe to another to automatically replicate its content, creating a resilient and interconnected network of content hubs.

The system's core features include:

* **Modular Data Stores**: Each Site contains multiple, distinct databases (for releases, categories, etc.).
* **Role-Based Access Control**: Permissions are managed through a two-tiered system of "Members" and "Administrators".
* **Federated Replication**: Sites can subscribe to other Sites to pull in and re-host their content.
* **Live and Historical Sync**: The federation mechanism supports both real-time updates and the synchronization of historical data.

### 2. Core Concepts

#### 2.1. The `Site`

A `Site` is the central architectural unit in the Lens system. It is a self-contained Peerbit `Program` that encapsulates:

* **Data**: A collection of databases for managing content (e.g., releases, featured content).
* **Access Control Lists (ACLs)**: Databases that define which users are members or administrators.
* **Subscriptions**: A list of other Sites it follows.
* **Metadata**: Descriptive information like its name and description.

Each `Site` has a unique, stable address derived from its content, making it discoverable and verifiable on the P2P network.

#### 2.2. Federation

Federation is a one-way relationship between two Sites, established via a `Subscription`.

* If **Site A** subscribes to **Site B**, Site A will begin to pull and replicate content from Site B.
* This relationship is not automatically reciprocal; Site B does not replicate content from Site A unless it also creates a subscription to Site A.
* This model allows for various network topologies, from one-way content mirrors to fully meshed, bi-directional federations.

### 3. System Architecture

The system is composed of two main layers: the `Site` Program, which defines the on-chain/P2P logic, and the `LensService`, which acts as a high-level API and orchestrator.

#### 3.1. The `Site` Program (`schema.ts`)

The `Site` class is the heart of the system, containing several nested sub-programs.

* **Data Stores (`Documents`)**:
  * `releases`: Stores the primary content objects (`Release`).
  * `featuredReleases`: Stores metadata for featuring specific releases.
  * `contentCategories`: Manages categories for organizing releases.
  * `subscriptions`: A critical store that lists the addresses of other `Site` programs this Site federates with.
  * `blockedContent`: An administrative list of CIDs to block.

* **Access Control (`IdentityAccessController`)**:
  * `members`: A list of public keys that have permission to create content (e.g., add a `Release`).
  * `administrators`: A list of public keys with elevated privileges, such as managing categories, subscriptions, and deleting content.

* **Federation Topic**: Each `Site` instance generates a unique pub/sub topic for broadcasting its updates to subscribers. The topic is derived from its address: `${site.address}/federation`.

* **Broadcast Setup**: When a `Site` is opened via `site.open()`, it automatically calls `setupFederationBroadcasts()`. This method attaches event listeners to its core data stores (`releases`, `featuredReleases`, etc.). When a local change occurs in one of these stores, these listeners trigger the broadcasting mechanism, enabling the real-time updates described in the data flow section.

#### 3.2. The `LensService` (`service.ts`)

This class provides a simplified API for interacting with the P2P system. It is responsible for:

* **Lifecycle Management**: Initializing and stopping the underlying `Peerbit` client.
* **Site Management**: Opening and closing `Site` programs.
* **Federation Orchestration**: This is its most critical role. The `LensService` listens for changes in its local `subscriptions` store and automatically manages the federation lifecycle:
  * **`startFederation`**: Initiates both historical and live sync with a remote site.
  * **`stopFederation`**: Tears down the connection and cleans up replicated data from a remote site.

### 4. Data Flow

The data flow can be understood in two main scenarios: local operations within a single site and federated operations between sites.

#### 4.1. Data Flow for Local Operations

This flow describes what happens when a user interacts with their own `Site`.

1. **API Call**: A user calls a method on the `LensService`, such as `addRelease(data)`.
2. **Service Layer**: The `LensService` ensures the `Site` program is open and then calls the appropriate method on it, for example, `siteProgram.releases.put(new Release(data))`.
3. **Permission Check**: The `canPerformFederatedWrite` hook on the `releases` store is triggered. Since the write originates locally (`originSiteAddress === localSiteAddress`), it delegates the permission check to the relevant local ACL (`members.canPerform()` for adding a release).
4. **Append to Log**: If the user has permission, the new `Release` data is serialized and appended as an entry to the `SharedLog` inside the `releases` documents store.
5. **Local Index Update**: The `releases` store's `change` event fires. This triggers the internal index to update, making the new release immediately available for querying on the local node.
6. **Broadcast (for federation)**: Simultaneously, the `change` event is caught by the `setupFederationBroadcasts` listener, which prepares and publishes a `FederationUpdate` message to the Site's federation topic for any subscribers.
7. **Response**: The service method returns a success response to the user.

#### 4.2. Establishing a Federation (The Subscription Process)

This is the initial step required before any federated data can flow. It is typically performed by an administrator.

1. **Admin Action**: An administrator of **Site A** calls `LensService.addSubscription()` with the address of **Site B**.
2. **Write to Subscriptions Store**: This action creates a new `Subscription` document and uses `siteProgram.subscriptions.put()` to save it to Site A's local `subscriptions` store.
3. **Service Listener Triggered**: The `LensService` on Site A is actively listening for `change` events on its `subscriptions` store. The addition of the new subscription triggers its handler.
4. **Initiate Federation**: The handler calls the internal `startFederation(siteB.address)` method. This begins the two-phase synchronization process.

#### 4.3. Data Flow for Federation

Once a subscription is active, data flows from the subscribed-to site (Site B) to the subscriber (Site A).

##### **Phase 1: Historical Sync**

This phase is a fire-and-forget background process designed to pull all existing content from the remote site.

1. **Initiation**: The `startFederation` method calls the `runHistoricalSync` function.
2. **Open Remote Handle**: `runHistoricalSync` opens a temporary, read-only handle to the remote `Site` program (Site B) using its address. This does not involve subscribing to live updates.
3. **Fetch Heads**: It requests all the latest entries (log heads) from Site B's core data stores (`releases`, `featuredReleases`, etc.).
4. **Join Data**: The fetched entries from Site B are then merged into Site A's corresponding local stores using the `localStore.log.join(remoteHeads)` method. This populates Site A with all of Site B's historical content.
5. **Cleanup**: This process runs for a configured duration (e.g., 1 minute) to catch any recent changes and then automatically closes the temporary connection to Site B.

##### **Phase 2: Live Updates via Pub/Sub**

This phase runs concurrently with the historical sync and ensures Site A receives new content from Site B in real-time.

1. **Subscribe to Topic**: As part of `startFederation`, Site A's `LensService` subscribes to Site B's unique federation topic, which is `${siteB.address}/federation`.
2. **Remote Content Change**: A member on Site B creates a new `Release`.
3. **Broadcast Update**: The `change` event on Site B's `releases` store triggers its `broadcastFederationUpdate` method. This method packages the new entry into a `FederationUpdate` message and publishes it to the federation topic.
4. **Receive Update**: Site A, being subscribed to the topic, receives this `FederationUpdate` message via its `onFederationMessage` handler.
5. **Join New Entry**: The handler deserializes the message and calls `localSiteProgram.releases.log.join()` to integrate the new entry.
6. **Local Index Update**: The `join` operation triggers a local `change` event on Site A's `releases` store, which updates its index, making the newly federated content searchable.

#### 4.4. Data Flow for Unsubscribing

When the subscription is removed from Site A:

1. A `delete` operation on the `subscriptions` store fires a `change` event.
2. The `LensService` listener calls `stopFederation(siteB.address)`.
3. The service unsubscribes from Site B's federation topic to stop receiving live updates.
4. It then queries all its local data stores to find and delete all content where the `siteAddress` property matches Site B's address, effectively cleaning up all the federated data.

---

### 5. Permissions & Access Control Flow

The `canPerformFederatedWrite` function is the gatekeeper for all write operations, ensuring that only authorized users or subscribed sites can modify the data.

The logic proceeds as follows:

1. **Operation Detected**: A `put` (create/update) or `delete` operation is attempted on a `Documents` store (e.g., `releases`).
2. **Determine Data Origin**: The system identifies the `siteAddress` associated with the data.
    * For a **`put` operation**, it deserializes the incoming data and reads the `siteAddress` property from the new document.
    * For a **`delete` operation**, it first fetches the existing document from the local index using its ID to find its `siteAddress`. If the document doesn't exist, the delete is permitted (idempotency).
3. **Compare Origin to Local Site**: It checks if the `originSiteAddress` is the same as the current site's address.
4. **Execute Permission Logic**:
    * **If Local Write**: The addresses match. The request is delegated to the appropriate local Access Control List. For example, adding a release requires a check against the `members` store (`memberCanPerform()`), while deleting one requires a check against the `administrators` store (`administratorCanPerform()`).
    * **If Federated Write**: The addresses do not match. The system checks if the local site is subscribed to the origin site by calling `isSubscribed(originSiteAddress)`.
        * If a valid subscription exists, the write is **allowed**.
        * If no subscription exists, the write is **denied**.

This flow guarantees that a Site only accepts content from two sources: its own authenticated users (Members/Admins) or other Sites it has explicitly trusted by creating a subscription.
