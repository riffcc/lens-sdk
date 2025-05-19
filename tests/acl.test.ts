import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Site } from '../src/schema';
import { RELEASE_NAME_PROPERTY, RELEASE_CATEGORY_ID_PROPERTY, RELEASE_CONTENT_CID_PROPERTY, RELEASE_THUMBNAIL_CID_PROPERTY } from '../src/constants';
import type { ReleaseData } from '../src/types';
import { AccessError } from '@peerbit/crypto';
// import { waitForResolved } from '@peerbit/time';
// import { SearchRequest } from '@peerbit/document';
// import {
//   PublicKeyAccessCondition,
//   AccessType,
//   type Access,
// } from '@peerbit/identity-access-controller';
import { Peerbit } from 'peerbit';
import { LensService } from '../src/service';

describe('Site ACL', () => {
  let peer1: Peerbit;
  let peer2: Peerbit;
  let siteProgram: Site;
  let service: LensService;

  beforeAll(async () => {
    peer1 = await Peerbit.create();
    peer2 = await Peerbit.create();

    siteProgram = new Site(peer1.identity.publicKey);
    service = new LensService(peer1);
    await service.openSite(siteProgram);
  });

  afterAll(async () => {
    if (peer1) {
      await peer1.stop();
    }
    if (peer2) {
      await peer1.stop();
    }
    if (siteProgram) {
      await siteProgram.close();
    }
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

    await peer2.dial(peer1.getMultiaddrs());

    const service2 = new LensService(peer2);

    await service2.openSite(siteProgram.address, { replicate: false});

    await service.siteProgram?.waitFor(peer2.identity.publicKey);
    await service2.siteProgram?.waitFor(peer1.identity.publicKey);

    await expect(service2.addRelease(releaseData)).rejects.toThrow(AccessError);
  }, 20000);

  // test('peer granted write access can add releases', async () => {
  //   site1 = await peer1.open(new Site(peer1.identity.publicKey));
  //   // Use Site's method to grant access
  //   await site1.grantWriteAccess(peer2.identity.publicKey);

  //   const site1Address = site1.address!;
  //   const site2 = await peer2.open<Site>(site1Address, { args: { replicate: true } });

  //   await site1.waitFor(peer2.identity.publicKey);
  //   await site2.waitFor(peer1.identity.publicKey);

  //   // Verify ACL state by querying the IdentityAccessController's 'access' store directly
  //   await waitForResolved(async () => {
  //     const accesses = await site2.acl.access.index.search(new SearchRequest({ query: [] }));
  //     const pkCondition = accesses.find(a =>
  //       a.accessCondition instanceof PublicKeyAccessCondition &&
  //       (a.accessCondition as PublicKeyAccessCondition<Access>).key.equals(peer2.identity.publicKey) &&
  //       (a.accessTypes.includes(AccessType.Write) || a.accessTypes.includes(AccessType.Any)),
  //     );
  //     expect(pkCondition).toBeDefined();
  //   }, { timeout: 15000, delayInterval: 1000 });

  //   const releaseByPeer2Data: ReleaseData = { ...releaseData, name: 'Release by Peer2' };
  //   const result = await site2.addRelease(releaseByPeer2Data);

  //   await waitForResolved(async () => {
  //     const fetchedOnSite1 = await site1!.getRelease(result.id);
  //     expect(fetchedOnSite1).toBeDefined();
  //     expect(fetchedOnSite1?.name).toEqual(releaseByPeer2Data.name);
  //   }, { timeout: 10000, delayInterval: 1000 });
  //   await site2.close();
  // }, 30000);


});
