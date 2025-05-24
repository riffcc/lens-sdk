import { describe, it, expect } from '@jest/globals';
import { Peerbit } from 'peerbit';
import { delay } from '@peerbit/time';
import { LensService } from '../src/service';
import { Site } from '../src/schema';
import {
  RELEASE_NAME_PROPERTY,
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
  RELEASE_METADATA_PROPERTY,
} from '../src/constants';
import type { ReleaseData } from '../src/types';

describe('Lens Service Init', () => {
  it('create a new lens service instance with external client', async () => {
    const client = await Peerbit.create();
    const lensService = new LensService(client);
    expect(lensService.client?.identity.publicKey).toBe(client.identity.publicKey);
    await client.stop();
  }, 20000);

  it('init lens service lazyly', async () => {
    const lensService = new LensService();
    await lensService.init();
    expect(lensService.client).toBeDefined();
    await lensService.stop();
  }, 20000);

});

describe('Lens Service Site Opening', () => {

  it('open a Site either a new or from another peer via instance', async () => {
    const client = await Peerbit.create();
    const siteProgram = new Site(client.identity.publicKey);
    const lensService = new LensService(client);
    await lensService.openSite(siteProgram);
    expect(lensService.siteProgram).toBeDefined();
    expect(lensService.siteProgram?.address).toBe(siteProgram.address);
    await siteProgram.close();
    await client.stop();
  }, 20000);

  it('open a Site from another peer via address', async () => {

    const client1 = await Peerbit.create();
    const siteProgram = new Site(client1.identity.publicKey);
    await client1.open(siteProgram);

    const client2 = await Peerbit.create();
    await client2.dial(client1.getMultiaddrs());

    const lensService = new LensService(client2);

    await lensService.openSite(siteProgram.address, {
      replicate: false,
    });

    expect(lensService.siteProgram).toBeDefined();
    expect(lensService.siteProgram?.address).toBe(siteProgram.address);
    
    await client1.stop();
    await client2.stop();
    await siteProgram.close();

  }, 30000);

});

describe('Site Program', () => {
  let client: Peerbit;
  let siteProgram: Site;
  let service: LensService;

  beforeAll(async () => {
    client = await Peerbit.create();
    siteProgram = new Site(client.identity.publicKey);
    service = new LensService(client);
    await service.openSite(siteProgram);
  });

  afterAll(async () => {
    if (siteProgram) {
      await siteProgram.close();
    }
    if (client) {
      await client.stop();
    }
  });
  it('can create a site, add a release, and get the release', async () => {
    const releaseData: ReleaseData = {
      [RELEASE_NAME_PROPERTY]: 'RiP!: A Remix Manifesto',
      [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
      [RELEASE_CONTENT_CID_PROPERTY]: 'QmTWWUmvC9txvE7aHs9xHd541qLx3ax58urvx3Kb3SFK2Q',
      [RELEASE_THUMBNAIL_CID_PROPERTY]: 'Qmb3eeESRoX5L6NhTYLEtFFUS1FZgqe1e7hdBk2f57DUGh',
    };

    const result = await service.addRelease(releaseData);
    expect(result.id).toEqual(expect.any(String));

    await delay(200);

    expect(result.id).toBeDefined();
    const retrievedRelease = await service.getRelease({ id: result.id! });
    expect(retrievedRelease).toBeDefined();
    if (retrievedRelease) {
      expect(retrievedRelease[RELEASE_NAME_PROPERTY]).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
      expect(retrievedRelease[RELEASE_CATEGORY_ID_PROPERTY]).toEqual(releaseData[RELEASE_CATEGORY_ID_PROPERTY]);
      expect(retrievedRelease[RELEASE_CONTENT_CID_PROPERTY]).toEqual(releaseData[RELEASE_CONTENT_CID_PROPERTY]);

      if (releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]) {
        expect(retrievedRelease[RELEASE_THUMBNAIL_CID_PROPERTY]).toEqual(releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]);
      }
      if (releaseData[RELEASE_METADATA_PROPERTY]) {
        expect(retrievedRelease[RELEASE_METADATA_PROPERTY]).toEqual(releaseData[RELEASE_METADATA_PROPERTY]);
      }
    }

  });

  it('getRelease returns undefined for a non-existent ID', async () => {
    const nonExistentId = 'non-existent-id-12345';
    const retrievedRelease = await service.getRelease({ id: nonExistentId });
    expect(retrievedRelease).toBeUndefined();
  });
});