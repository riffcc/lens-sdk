import { TestSession } from '@peerbit/test-utils';
// Remove Ed25519Keypair import, we'll use the client's identity directly
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { Release } from '../src/programs/site/schemas';

describe('Site Documents Store', () => {
  let session: TestSession;
  let client: ProgramClient;
  let siteProgram: Site;

  beforeAll(async () => {
    session = await TestSession.connected(1);
    client = session.peers[0];
  });

  afterAll(async () => {
    await session.stop();
  });

  beforeEach(async () => {
    // --- FIX IS HERE ---
    // The client creating/opening the program is now the root trust.
    // This automatically makes it an administrator.
    const rootTrust = client.identity.publicKey; 
    
    siteProgram = new Site(rootTrust);
    await client.open(siteProgram);
  });

  afterEach(async () => {
    if (siteProgram) {
      await siteProgram.close();
    }
  });

  it('can put and get a release document', async () => {
    // 1. Prepare Data
    const releaseData = {
      name: 'Test Release',
      categoryId: 'test-category',
      contentCID: 'cid-123',
      // postedBy should be the identity performing the action
      postedBy: client.identity.publicKey, 
      siteAddress: siteProgram.address,
    };
    
    const releaseDoc = new Release(releaseData);
    const releaseId = releaseDoc.id;

    // 2. Perform Action: Put the document into the releases store
    // This will now pass because the client is the rootTrust/admin.
    await siteProgram.releases.put(releaseDoc);

    // 3. Assert: Retrieve the document by its ID
    const retrievedDoc = await siteProgram.releases.index.get(releaseId);

    expect(retrievedDoc).toBeDefined();
    expect(retrievedDoc).toBeInstanceOf(Release);
    expect(retrievedDoc.id).toEqual(releaseId);
    expect(retrievedDoc.name).toEqual(releaseData.name);
  });

  it('can search for releases and get the correct count', async () => {
    let allReleases = await siteProgram.releases.index.search({});
    expect(allReleases).toHaveLength(0);

    const release1 = new Release({
      name: 'First Release',
      categoryId: 'cat-a',
      contentCID: 'cid-a',
      postedBy: client.identity.publicKey,
      siteAddress: siteProgram.address,
    });
    const release2 = new Release({
      name: 'Second Release',
      categoryId: 'cat-b',
      contentCID: 'cid-b',
      postedBy: client.identity.publicKey,
      siteAddress: siteProgram.address,
    });

    await siteProgram.releases.put(release1);
    await siteProgram.releases.put(release2);
    
    allReleases = await siteProgram.releases.index.search({});
    expect(allReleases).toHaveLength(2);

    const size = await siteProgram.releases.index.getSize();
    expect(size).toEqual(2);
  });
});