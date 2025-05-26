import {
  describe,
  test,
  expect,
} from '@jest/globals';
import { Site, type Release } from '../src/schema';
import {
  RELEASE_CATEGORY_ID_PROPERTY,
  RELEASE_CONTENT_CID_PROPERTY,
  RELEASE_NAME_PROPERTY,
  RELEASE_THUMBNAIL_CID_PROPERTY,
} from '../src/constants';
import type { ReleaseData } from '../src/types';
import type { WithContext } from '@peerbit/document';
import { Peerbit } from 'peerbit';
import { LensService } from '../src/service';
import { waitFor } from '@peerbit/time';

describe('Site Replication', () => {

  test('opens the same Site program on two peers and replicates a release', async () => {
    let peer1: Peerbit | undefined;
    let peer2: Peerbit | undefined;
    let service1: LensService | undefined;
    let service2: LensService | undefined;
    let siteProgram1: Site | undefined;
    
    try {
      peer1 = await Peerbit.create();
      peer2 = await Peerbit.create();
      service1 = new LensService(peer1);
      service2 = new LensService(peer2);

      siteProgram1 = new Site(peer1.identity.publicKey);
      await service1.openSite(siteProgram1, { releasesArgs: { disableCache: true } });

      await peer2.dial(peer1.getMultiaddrs());

      await service2.openSite(siteProgram1.address, { releasesArgs: { replicate: true, disableCache: true } });

      await service1.siteProgram?.waitFor(peer2.identity.publicKey);
      await service2.siteProgram?.waitFor(peer1.identity.publicKey);

      const releaseData: ReleaseData = {
        [RELEASE_NAME_PROPERTY]: 'TPB AFK: The Pirate Bay Away from Keyboard',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmPSGARS6emPSEf8umwmjdG8AS7z7o8Nd36258B3BMi291',
        [RELEASE_THUMBNAIL_CID_PROPERTY]: 'bafkreiemqveqhpksefhup46d77iybtatf2vb2bgyak4hfydxaz5hxser34',
      };

      const result = await service1.addRelease(releaseData);
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      const releaseId = result.id!;

      let replicatedRelease: WithContext<Release> | undefined;
      await waitFor(
        async () => {
          replicatedRelease = await service2.getRelease({ id: releaseId });
          return !!replicatedRelease;
        },
        { timeout: 20000, delayInterval: 1000 },
      );

      expect(replicatedRelease).toBeDefined();
      if (replicatedRelease) {
        expect(replicatedRelease[RELEASE_NAME_PROPERTY]).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
        expect(replicatedRelease[RELEASE_CONTENT_CID_PROPERTY]).toEqual(releaseData[RELEASE_CONTENT_CID_PROPERTY]);
        expect(replicatedRelease[RELEASE_CATEGORY_ID_PROPERTY]).toEqual(releaseData[RELEASE_CATEGORY_ID_PROPERTY]);
        expect(replicatedRelease[RELEASE_THUMBNAIL_CID_PROPERTY]).toEqual(releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]);
      }
    } finally {
      // Ensure proper cleanup even if test fails
      if (service1?.siteProgram) await service1.siteProgram.close();
      if (service2?.siteProgram) await service2.siteProgram.close();
      if (siteProgram1) await siteProgram1.close();
      if (peer1) await peer1.stop();
      if (peer2) await peer2.stop();
    }
  }, 45000);

  test('replicates a release added before the second peer opens the site', async () => {
    let peer1: Peerbit | undefined;
    let peer2: Peerbit | undefined;
    let service1: LensService | undefined;
    let service2: LensService | undefined;
    let siteProgram1: Site | undefined;
    
    try {
      peer1 = await Peerbit.create();
      peer2 = await Peerbit.create();
      service1 = new LensService(peer1);
      service2 = new LensService(peer2);

      siteProgram1 = new Site(peer1.identity.publicKey);
      await service1.openSite(siteProgram1, { releasesArgs: { disableCache: true } });

      const releaseData: ReleaseData = {
        [RELEASE_NAME_PROPERTY]: 'TPB AFK: The Pirate Bay Away from Keyboard',
        [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
        [RELEASE_CONTENT_CID_PROPERTY]: 'QmPSGARS6emPSEf8umwmjdG8AS7z7o8Nd36258B3BMi291',
        [RELEASE_THUMBNAIL_CID_PROPERTY]: 'bafkreiemqveqhpksefhup46d77iybtatf2vb2bgyak4hfydxaz5hxser34',
      };

      const result = await service1.addRelease(releaseData);
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      const releaseId = result.id!;

      await peer2.dial(peer1.getMultiaddrs());

      await service2.openSite(siteProgram1.address, { releasesArgs: { replicate: true, disableCache: true } });

      await service1.siteProgram?.waitFor(peer2.identity.publicKey);
      await service2.siteProgram?.waitFor(peer1.identity.publicKey);

      let replicatedRelease: WithContext<Release> | undefined;
      await waitFor(
        async () => {
          replicatedRelease = await service2.getRelease({ id: releaseId });
          return !!replicatedRelease;
        },
        { timeout: 20000, delayInterval: 1000 },
      );

      expect(replicatedRelease).toBeDefined();
      if (replicatedRelease) {
        expect(replicatedRelease[RELEASE_NAME_PROPERTY]).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
        expect(replicatedRelease[RELEASE_CONTENT_CID_PROPERTY]).toEqual(releaseData[RELEASE_CONTENT_CID_PROPERTY]);
        expect(replicatedRelease[RELEASE_CATEGORY_ID_PROPERTY]).toEqual(releaseData[RELEASE_CATEGORY_ID_PROPERTY]);
        expect(replicatedRelease[RELEASE_THUMBNAIL_CID_PROPERTY]).toEqual(releaseData[RELEASE_THUMBNAIL_CID_PROPERTY]);
      }
    } finally {
      // Ensure proper cleanup even if test fails
      if (service1?.siteProgram) await service1.siteProgram.close();
      if (service2?.siteProgram) await service2.siteProgram.close();
      if (siteProgram1) await siteProgram1.close();
      if (peer1) await peer1.stop();
      if (peer2) await peer2.stop();
    }
  }, 45000);
});