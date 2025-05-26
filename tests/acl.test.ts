import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Site } from '../src/schema';
import { RELEASE_NAME_PROPERTY, RELEASE_CATEGORY_ID_PROPERTY, RELEASE_CONTENT_CID_PROPERTY, RELEASE_THUMBNAIL_CID_PROPERTY } from '../src/constants';
import { AccountType, type ReleaseData } from '../src/types';
// import { waitForResolved } from '@peerbit/time';
// import { SearchRequest } from '@peerbit/document';
// import {
//   PublicKeyAccessCondition,
//   AccessType,
//   type Access,
// } from '@peerbit/identity-access-controller';
import { Peerbit } from 'peerbit';
import { authorise, LensService } from '../src/service';

describe('Site ACL', () => {
  let peer1: Peerbit;
  let siteProgram: Site;
  let service: LensService;

  beforeAll(async () => {
    peer1 = await Peerbit.create();
    siteProgram = new Site(peer1.identity.publicKey);
    service = new LensService(peer1);
    await service.openSite(siteProgram, { releasesArgs: { disableCache: true } });
    
  });

  afterAll(async () => {
      await peer1.stop();
      await siteProgram.close();
  });

  const releaseData: ReleaseData = {
    [RELEASE_NAME_PROPERTY]: 'TPB AFK: The Pirate Bay Away from Keyboard',
    [RELEASE_CATEGORY_ID_PROPERTY]: 'movie',
    [RELEASE_CONTENT_CID_PROPERTY]: 'QmPSGARS6emPSEf8umwmjdG8AS7z7o8Nd36258B3BMi291',
    [RELEASE_THUMBNAIL_CID_PROPERTY]: 'bafkreiemqveqhpksefhup46d77iybtatf2vb2bgyak4hfydxaz5hxser34',
  };

  test('root trust (creator) can add releases', async () => {
    const result = await service.addRelease(releaseData);
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    const fetched = await service.getRelease({ id: result.id! });
    expect(fetched).toBeDefined();
    expect(fetched?.[RELEASE_NAME_PROPERTY]).toEqual(releaseData[RELEASE_NAME_PROPERTY]);
  }, 15000);

  test('untrusted peer cannot add releases', async () => {
    const peer2 = await Peerbit.create();
    await peer2.dial(peer1.getMultiaddrs());
    const service2 = new LensService(peer2);
    await service2.openSite(siteProgram.address, { releasesArgs: { disableCache: true } });

    await service2.siteProgram?.waitFor(peer1.identity.publicKey);

    const result = await service2.addRelease(releaseData);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    await peer2.stop();
  }, 20000);

  test('member peer can add releases and getAccountStatus return member account type', async () => {
    const peer3 = await Peerbit.create();
    await peer3.dial(peer1.getMultiaddrs());
    const service3 = new LensService(peer3);
    // Open with replication enabled for access controllers so we get authorization updates
    await service3.openSite(siteProgram.address, {
      membersArg: { replicate: true },
      administratorsArgs: { replicate: true },
      releasesArgs: { disableCache: true },
    });

    await service3.siteProgram?.waitFor(peer1.identity.publicKey);
    
    await authorise(siteProgram, AccountType.MEMBER, peer3.identity.publicKey.toString());
    
    const result3 = await service3.addRelease({ 
      ...releaseData,
      [RELEASE_NAME_PROPERTY]: 'test-release-2',
    });
    if (!result3.success) {
      console.error('Member add release failed:', result3.error);
    }
    expect(result3.success).toBe(true);
    expect(result3.id).toBeDefined();

    await expect(service3.getAccountStatus()).resolves.toBe(AccountType.MEMBER);
    await peer3.stop();
  }, 30000);

  test('admin peer can add releases and getAccountStatus return admin account type', async () => {
    const peer4 = await Peerbit.create();
    await peer4.dial(peer1.getMultiaddrs());
    const service4 = new LensService(peer4);
    // Open with replication enabled for access controllers so we get authorization updates
    await service4.openSite(siteProgram.address, {
      membersArg: { replicate: true },
      administratorsArgs: { replicate: true },
      releasesArgs: { disableCache: true },
    });

    await service4.siteProgram?.waitFor(peer1.identity.publicKey);
    
    await authorise(siteProgram, AccountType.ADMIN, peer4.identity.publicKey.toString());
    
    const result4 = await service4.addRelease({ 
      ...releaseData,
      [RELEASE_NAME_PROPERTY]: 'test-release-3',
    });
    if (!result4.success) {
      console.error('Admin add release failed:', result4.error);
    }
    expect(result4.success).toBe(true);
    expect(result4.id).toBeDefined();

    await expect(service4.getAccountStatus()).resolves.toBe(AccountType.ADMIN);
    await peer4.stop();
  }, 20000);



});
