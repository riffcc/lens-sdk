import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Site } from '../src/schema';
import { RELEASE_NAME_PROPERTY, RELEASE_CATEGORY_ID_PROPERTY, RELEASE_CONTENT_CID_PROPERTY, RELEASE_THUMBNAIL_CID_PROPERTY } from '../src/constants';
import { AccountType, type ReleaseData } from '../src/types';
import { AccessError } from '@peerbit/crypto';
// import { waitForResolved } from '@peerbit/time';
// import { SearchRequest } from '@peerbit/document';
// import {
//   PublicKeyAccessCondition,
//   AccessType,
//   type Access,
// } from '@peerbit/identity-access-controller';
import { Peerbit } from 'peerbit';
import { authorise, LensService } from '../src/service';
import { delay } from '@peerbit/time';

describe('Site ACL', () => {
  let peer1: Peerbit;
  let siteProgram: Site;
  let service: LensService;

  beforeAll(async () => {
    peer1 = await Peerbit.create();
    siteProgram = new Site(peer1.identity.publicKey);
    service = new LensService(peer1);
    await service.openSite(siteProgram);
    
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
    const fetched = await service.getRelease(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.name).toEqual(releaseData.name);
  }, 15000);

  test('untrusted peer cannot add releases', async () => {
    const peer2 = await Peerbit.create();
    await peer2.dial(peer1.getMultiaddrs());
    const service2 = new LensService(peer2);
    await service2.openSite(siteProgram.address);

    await service2.siteProgram?.waitFor(peer1.identity.publicKey);

    await expect(service2.addRelease(releaseData)).rejects.toThrow(AccessError);
    await peer2.stop();
  }, 20000);

  test('member peer can add releases and getAccountStatus return member account type', async () => {
    const peer3 = await Peerbit.create();
    await peer3.dial(peer1.getMultiaddrs());
    const service3 = new LensService(peer3);
    await service3.openSite(siteProgram.address);

    await service3.siteProgram?.waitFor(peer1.identity.publicKey);
    
    await authorise(siteProgram, AccountType.MEMBER, peer3.identity.publicKey.toString());
    await delay(1000);
    await expect(
      service3.addRelease({ 
        ...releaseData,
        [RELEASE_NAME_PROPERTY]: 'test-release-2',
      }),
    ).resolves.toHaveProperty('id');

    await expect(service3.getAccountStatus()).resolves.toBe(AccountType.MEMBER);
    await peer3.stop();
  }, 30000);

  test('admin peer can add releases and getAccountStatus return admin account type', async () => {
    const peer4 = await Peerbit.create();
    await peer4.dial(peer1.getMultiaddrs());
    const service4 = new LensService(peer4);
    await service4.openSite(siteProgram.address);

    await service4.siteProgram?.waitFor(peer1.identity.publicKey);
    
    await authorise(siteProgram, AccountType.ADMIN, peer4.identity.publicKey.toString());
    await delay(1000);
    await expect(
      service4.addRelease({ 
        ...releaseData,
        [RELEASE_NAME_PROPERTY]: 'test-release-3',
      }),
    ).resolves.toHaveProperty('id');

    await expect(service4.getAccountStatus()).resolves.toBe(AccountType.ADMIN);
    await peer4.stop();
  }, 20000);



});
