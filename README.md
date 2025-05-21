
# Riff.CC Lens SDK

The Riff.CC Lens SDK provides tools to build decentralized applications using Peerbit for peer-to-peer data storage and communication. It simplifies the creation and management of `Site` programs, which are specialized databases for content like releases, categories, and subscriptions.

## Table of Contents

- [Riff.CC Lens SDK](#riffcc-lens-sdk)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Core Concepts](#core-concepts)
  - [Getting Started](#getting-started)
    - [1. Initialize the Lens Service](#1-initialize-the-lens-service)
      - [Option A: SDK Manages Peerbit Client](#option-a-sdk-manages-peerbit-client)
      - [Option B: Using an Existing Peerbit Client](#option-b-using-an-existing-peerbit-client)
    - [2. Create or Open a Site](#2-create-or-open-a-site)
      - [Creating a New Site](#creating-a-new-site)
      - [Opening an Existing Site by Address](#opening-an-existing-site-by-address)
    - [3. Interacting with the Site](#3-interacting-with-the-site)
    - [4. Stopping the Service](#4-stopping-the-service)
  - [For Electron Applications](#for-electron-applications)
  - [Development](#development)
    - [Prerequisites](#prerequisites)
    - [Available Scripts](#available-scripts)
  - [API Overview](#api-overview)

## Installation

You can install the SDK using pnpm (or npm/yarn):

```bash
pnpm install @riffcc/lens-sdk
# or
npm install @riffcc/lens-sdk
# or
yarn add @riffcc/lens-sdk
```

## Core Concepts

- **Peerbit**: The underlying P2P framework used for creating and managing distributed databases and communication between peers.
- **`Site`**: A `Program` in Peerbit, representing a decentralized database tailored for content management. It includes stores for releases, featured content, categories, subscriptions, and blocked content, along with access control mechanisms.
- **`LensService`**: The primary class you'll interact with. It provides a high-level API to initialize a Peerbit client, open `Site` programs, and perform operations like adding or querying releases.
- **`ILensService`**: An interface defining the contract for `LensService` and `ElectronLensService`, useful for understanding available methods.

## Getting Started

Here's how to get started with the `@riffcc/lens-sdk`:

### 1. Initialize the Lens Service

You have two main ways to initialize the `LensService`:

#### Option A: SDK Manages Peerbit Client

The `LensService` can create and manage its own Peerbit client instance.

```typescript
import { LensService } from '@riffcc/lens-sdk';

async function main() {
  const lensService = new LensService();

  // Initialize the service. This will create a Peerbit client internally.
  // You can optionally provide a directory path for Peerbit to store its data.
  await lensService.init(/* './my-peerbit-data' */);

  console.log('LensService initialized.');
  console.log('My Peer ID:', await lensService.getPeerId());
  console.log('My Public Key:', await lensService.getPublicKey());

  // ... proceed to create/open a site
}

main();
```

#### Option B: Using an Existing Peerbit Client

If you're already using Peerbit in your application, you can pass your existing client to the `LensService`.

```typescript
import { LensService } from '@riffcc/lens-sdk';
import { Peerbit } from 'peerbit';

async function main() {
  // Create your Peerbit client
  const peerbitClient = await Peerbit.create({
    // directory: './my-custom-peerbit-data' // Optional Peerbit options
  });
  console.log('External Peerbit client created. Peer ID:', peerbitClient.peerId.toString());

  // Pass the client to LensService
  const lensService = new LensService(peerbitClient);

  console.log('LensService initialized with existing Peerbit client.');

  // ... proceed to create/open a site
  // Note: lensService.init() should NOT be called in this case.
}

main();
```

### 2. Create or Open a Site

A `Site` is where your application's data will live.

#### Creating a New Site

To create a new `Site`, you instantiate it and then open it using the `LensService`. The `Site` constructor requires a root trust, which is typically the public key of the Peerbit client identity that creates the site.

```typescript
import { LensService, Site } from '@riffcc/lens-sdk';
// Assuming lensService is initialized as shown in Step 1

async function createNewSite(lensService: LensService) {
  if (!lensService.client) {
    console.error('LensService client not initialized!');
    return;
  }

  // The Site's root trust is the creator's public key
  const newSiteInstance = new Site(lensService.client.identity.publicKey);

  // Open the new site through the service
  // You can pass SiteArgs, e.g., for replication settings
  await lensService.openSite(newSiteInstance, {
    /* replicate: { factor: 1 } // Example replication option */
  });

  if (lensService.siteProgram) {
    console.log('New Site created and opened. Address:', lensService.siteProgram.address.toString());
  }
}
```

#### Opening an Existing Site by Address

If you have the address of an existing `Site` (e.g., from another peer), you can open it directly.

```typescript
import { LensService } from '@riffcc/lens-sdk';
// Assuming lensService is initialized as shown in Step 1

async function openExistingSite(lensService: LensService, siteAddress: string) {
  // Open the site using its address
  // `SiteArgs` can specify replication behavior, e.g., whether to replicate all data
  await lensService.openSite(siteAddress, { replicate: true });

  if (lensService.siteProgram) {
    console.log(`Existing Site at ${siteAddress} opened.`);
  }
}
```

### 3. Interacting with the Site

Once a site is opened, you can use `LensService` methods to interact with it.

```typescript
import { LensService } from '@riffcc/lens-sdk';
import type { ReleaseData } from '@riffcc/lens-sdk'; // Import types as needed

// Assuming lensService is initialized and a site is opened

async function manageReleases(lensService: LensService) {

  const releaseData: ReleaseData = {
    // Fill in properties based on ReleaseData type definition
    // e.g., from src/constants.ts and src/types.ts
    name: 'My First Release',
    categoryId: 'default-category',
    contentCID: 'QmExampleCID123456789', // Replace with actual CID
    // thumbnailCID: 'QmThumbnailCID...', // Optional
    // metadata: JSON.stringify({ genre: 'Electronic' }), // Optional
  };

  try {
    // Add a new release
    const addResponse = await lensService.addRelease(releaseData);
    console.log('Release added:', addResponse.id, 'Hash:', addResponse.hash);

    // Retrieve the release
    const fetchedRelease = await lensService.getRelease(addResponse.id);
    if (fetchedRelease) {
      console.log('Fetched release:', fetchedRelease.name);
    } else {
      console.log('Could not fetch release with ID:', addResponse.id);
    }

    // Get latest releases
    const latestReleases = await lensService.getLatestReleases(5); // Get latest 5
    console.log(`Latest ${latestReleases.length} releases:`);
    latestReleases.forEach(release => console.log(`- ${release.name} (ID: ${release.id})`));

  } catch (error) {
    console.error('Error managing releases:', error);
  }
}

// Example usage:
// await manageReleases(lensService);
```

### 4. Stopping the Service

When you're done, or your application is shutting down, stop the `LensService`.

```typescript
// Assuming lensService is an initialized LensService instance

async function shutdown(lensService: LensService) {
  await lensService.stop();
  console.log('LensService stopped.');
  // If you provided an external Peerbit client, you might need to stop it separately:
  // await peerbitClient.stop();
}

// Example usage:
// await shutdown(lensService);
```

## For Electron Applications

This SDK provides an `ElectronLensService` designed for use in Electron's renderer process. It assumes that the main `LensService` logic is exposed from the main process via `contextBridge` under `window.electronLensService`.

**Main Process (Electron):**
You would typically set up `LensService` in the main process and expose its methods.

```typescript
// electron-main.js (simplified example)
// import { LensService, Site } from '@riffcc/lens-sdk';
// import { ipcMain, contextBridge } from 'electron';

// const lensServiceInstance = new LensService();
// // Initialize, open sites etc.

// contextBridge.exposeInMainWorld('electronLensService', {
//   init: (directory) => lensServiceInstance.init(directory),
//   stop: () => lensServiceInstance.stop(),
//   openSite: (siteOrAddress, openOptions) => lensServiceInstance.openSite(siteOrAddress, openOptions),
//   // ... expose other ILensService methods
// });
```

**Renderer Process (Electron):**
Use `ElectronLensService` in your renderer code.

```typescript
import { ElectronLensService } from '@riffcc/lens-sdk';
// Type definition for the exposed API (from electron.d.ts)
// import type { ILensService } from '@riffcc/lens-sdk';
// declare global {
//   interface Window {
//     electronLensService: ILensService;
//   }
// }


const electronService = new ElectronLensService();

async function useElectronService() {
  await electronService.init(); // Calls window.electronLensService.init()
  const publicKey = await electronService.getPublicKey();
  console.log('Electron Service Public Key:', publicKey);
  // ... use other methods like addRelease, getRelease, etc.
}

useElectronService();
```

Make sure your `electron.d.ts` file is correctly set up to provide TypeScript with the type information for `window.electronLensService`.

## Development

### Prerequisites

- Node.js (18.0 or later)
- pnpm (as specified in `package.json`, though npm/yarn might work)

### Available Scripts

The `package.json` includes several scripts for development:

- **Linting the Code:**
  Checks the codebase for style and potential errors using ESLint.

  ```bash
  pnpm lint
  ```

- **Running Tests:**

  ```bash
  pnpm test
  ```

- **Building the Project:**
  This command cleans the previous build, generates TypeScript declaration files, and bundles the JavaScript code for distribution.

  ```bash
  pnpm build
  ```

## API Overview

The primary interface for interacting with the SDK is `ILensService`, implemented by `LensService` and `ElectronLensService`. Key methods include:

- `init(directory?: string)`: Initializes the service and underlying Peerbit client.
- `stop()`: Stops the service and Peerbit client.
- `openSite(siteOrAddress: Site | string, openOptions?: SiteArgs)`: Opens a new or existing `Site`.
- `getPublicKey()`: Returns the public key of the Peerbit client's identity.
- `getPeerId()`: Returns the Peer ID of the Peerbit client.
- `getAccountStatus()`: Determines if the current user is a GUEST, MEMBER, or ADMIN of the currently open site.
- `dial(address: string)`: Dials a remote peer.
- `getRelease(id: string)`: Retrieves a specific release by its ID.
- `getLatestReleases(size?: number)`: Gets a list of the most recent releases.
- `addRelease(releaseData: ReleaseData)`: Adds a new release to the site.

> Note: More methods coming soon..

For detailed type definitions of data structures (`ReleaseData`, `SiteArgs`, etc.) and schema definitions (`Site`, `Release`, etc.), refer to the `src/types.ts` and `src/schema.ts` files in the repository.
