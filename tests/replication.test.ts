import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import type { ProgramClient } from '@peerbit/program';
import { TestSession } from '@peerbit/test-utils';

import { Site, type Release } from '../src/schema';
import {
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_NAME_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
} from '../src/constants';
import type { ReleaseData } from '../src/types';
import { delay } from '@peerbit/time';
import { waitUntil } from './utils';

describe('Site Replication', () => {
  let session: TestSession;
  let peer1: ProgramClient, peer2: ProgramClient;
  let site1: Site | undefined, site2: Site | undefined; // Initialize as undefined

  beforeAll(async () => {
    session = await TestSession.connected(2);
    peer1 = session.peers[0];
    peer2 = session.peers[1];
  }, 20000);

  afterEach(async () => {
    if (site2 && !site2.closed) {
      await site2.close();
    }
    site2 = undefined;

    if (site1 && !site1.closed) {
      await site1.close();
    }
    site1 = undefined;
  });

  afterAll(async () => {
    if (session) {
      await session.stop();
    }
  });

  test('opens the same Site program on two peers and replicates a release', async () => {
    const siteCreator = new Site(peer1.identity.publicKey);

    site1 = await peer1.open(siteCreator);
    const site1Address = site1.address;
    expect(site1Address).toBeDefined();

    site2 = await peer2.open<Site>(site1Address, {
      args: { replicate: true },
    });

    expect(site2).toBeInstanceOf(Site);
    expect(site2.address).toEqual(site1.address);

    await site1.waitFor(peer2.identity.publicKey);
    await site2.waitFor(peer1.identity.publicKey);

    const releaseData: ReleaseData = {
      [RELEASE_NAME_PROPERTY]: 'TPB AFK: The Pirate Bay Away from Keyboard',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmPSGARS6emPSEf8umwmjdG8AS7z7o8Nd36258B3BMi291',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'bafkreiemqveqhpksefhup46d77iybtatf2vb2bgyak4hfydxaz5hxser34',
    };

    const result = await site1.addRelease(releaseData);
    const releaseId = result.id;

    let replicatedRelease: Release | undefined;
    await waitUntil(
      async () => {
        replicatedRelease = site2 ? await site2.getRelease(releaseId) : undefined;
        return !!replicatedRelease;
      },
      { timeout: 20000, interval: 1000 },
    );

    expect(replicatedRelease).toBeDefined();
    if (replicatedRelease) {
      expect(replicatedRelease.name).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
      expect(replicatedRelease.contentCID).toEqual(releaseData[RELEASE_CONTENT_CID_PROPERTY]);
      expect(replicatedRelease.categoryId).toEqual(releaseData[RELEASE_CATEGORY_ID_PROPERTY]);
      expect(replicatedRelease.thumbnailCID).toEqual(releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]);
    }
  }, 45000);

  test('replicates a release added before the second peer opens the site', async () => {
    const siteCreator = new Site(peer1.identity.publicKey);

    site1 = await peer1.open(siteCreator);
    const site1Address = site1.address;
    expect(site1Address).toBeDefined();

    const releaseData: ReleaseData = {
      [RELEASE_NAME_PROPERTY]: 'RiP!: A Remix Manifesto',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmTWWUmvC9txvE7aHs9xHd541qLx3ax58urvx3Kb3SFK2Q',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'Qmb3eeESRoX5L6NhTYLEtFFUS1FZgqe1e7hdBk2f57DUGh',
    };
    const result = await site1.addRelease(releaseData);
    const releaseId = result.id;

    await delay(200); // Allow add operation to settle

    site2 = await peer2.open<Site>(site1Address, {
      args: { replicate: true },
    });

    expect(site2).toBeInstanceOf(Site);
    expect(site2.address).toEqual(site1.address);

    await site1.waitFor(peer2.identity.publicKey);
    await site2.waitFor(peer1.identity.publicKey);

    let replicatedRelease: Release | undefined;
    await waitUntil(
      async () => {
        replicatedRelease = site2 ? await site2.getRelease(releaseId) : undefined;
        return !!replicatedRelease;
      },
      { timeout: 25000, interval: 1000 },
    );

    expect(replicatedRelease).toBeDefined();
    if (replicatedRelease) {
      expect(replicatedRelease.name).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
      expect(replicatedRelease.contentCID).toEqual(releaseData[RELEASE_CONTENT_CID_PROPERTY]);
      expect(replicatedRelease.categoryId).toEqual(releaseData[RELEASE_CATEGORY_ID_PROPERTY]);
      expect(replicatedRelease.thumbnailCID).toEqual(releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]);
    }
  }, 50000);
});
