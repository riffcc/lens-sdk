import { TestSession } from '@peerbit/test-utils';
import type { ProgramClient } from '@peerbit/program';
import { Site } from '../src/programs/site/program';
import { Release, Subscription } from '../src/programs/site/schemas';
import { AccountType } from '../src/programs/site/types';
import { waitFor } from '@peerbit/time';
import { AccessError } from '@peerbit/crypto';

// Helper to create a Release document.
const createReleaseDoc = (client: ProgramClient, siteAddress: string) => {
  return new Release({
    name: `Release by ${client.identity.publicKey.hashcode().slice(0, 8)}`,
    categoryId: 'test-category',
    contentCID: 'cid-123',
    postedBy: client.identity.publicKey,
    siteAddress: siteAddress,
  });
};

const createSubscriptionDoc = (client: ProgramClient, siteAddress: string, remoteSiteAddress: string) => {
  return new Subscription({
    postedBy: client.identity.publicKey,
    siteAddress: siteAddress,
    subcriberSiteAddress: remoteSiteAddress,
  });
};


describe('Site Program ACL', () => {
  let session: TestSession;
  let siteOwnerClient: ProgramClient, memberClient: ProgramClient, guestClient: ProgramClient;
  let siteOwnerProgram: Site, memberProgram: Site, guestProgram: Site;

  beforeAll(async () => {
    // Setup session and programs ONCE to avoid timeouts
    session = await TestSession.connected(3);
    siteOwnerClient = session.peers[0];
    memberClient = session.peers[1];
    guestClient = session.peers[2];

    const site = new Site(siteOwnerClient.identity.publicKey);
    siteOwnerProgram = await siteOwnerClient.open(site);

    await siteOwnerProgram.authorise(
      AccountType.MEMBER,
      memberClient.identity.publicKey.toString(),
    );

    memberProgram = await memberClient.open<Site>(siteOwnerProgram.address);
    guestProgram = await guestClient.open<Site>(siteOwnerProgram.address);

    // Ensure all peers are aware of each other before tests run
    await siteOwnerProgram.waitFor(memberClient.peerId);
    await siteOwnerProgram.waitFor(guestClient.peerId);

  }, 30000); // Increase timeout for the whole setup block

  afterAll(async () => {
    // Teardown everything at the end
    await siteOwnerProgram?.close();
    await memberProgram?.close();
    await guestProgram?.close();
    await session.stop();
  });

  // Clean up documents after each test to ensure test independence
  afterEach(async () => {
    const releases = await siteOwnerProgram.releases.index.search({});
    for (const release of releases) {
      await siteOwnerProgram.releases.del(release.id);
    }
    const subscriptions = await siteOwnerProgram.subscriptions.index.search({});
    for (const sub of subscriptions) {
      await siteOwnerProgram.subscriptions.del(sub.id);
    }
  });

  describe('Admin Permissions', () => {
    it('can add a release, and it becomes retrievable', async () => {
      const releaseDoc = createReleaseDoc(siteOwnerClient, siteOwnerProgram.address);
      await siteOwnerProgram.releases.put(releaseDoc);

      const retrieved = await siteOwnerProgram.releases.index.get(releaseDoc.id);
      expect(retrieved?.id).toEqual(releaseDoc.id);
    });

    it('can add a subscription, and it becomes retrievable', async () => {
      const subDoc = createSubscriptionDoc(siteOwnerClient, siteOwnerProgram.address, 'remote-site');
      await siteOwnerProgram.subscriptions.put(subDoc);

      const retrieved = await siteOwnerProgram.subscriptions.index.get(subDoc.id);
      expect(retrieved?.id).toEqual(subDoc.id);
    });

    it('can delete a release created by a member', async () => {
      const memberReleaseDoc = createReleaseDoc(memberClient, siteOwnerProgram.address);
      await memberProgram.releases.put(memberReleaseDoc);

      // Wait for the admin to see the member's document
      await waitFor(async () => (await siteOwnerProgram.releases.index.get(memberReleaseDoc.id)) !== undefined);
      
      // Admin deletes it
      await siteOwnerProgram.releases.del(memberReleaseDoc.id);
      
      // VERIFY: The document is no longer retrievable by anyone
      await waitFor(async () => (await memberProgram.releases.index.get(memberReleaseDoc.id)) === undefined);
      expect(await memberProgram.releases.index.get(memberReleaseDoc.id)).toBeUndefined();
    });
  });

  describe('Member Permissions', () => {
    it('can add a release, and it is replicated', async () => {
      const releaseDoc = createReleaseDoc(memberClient, siteOwnerProgram.address);
      await memberProgram.releases.put(releaseDoc);

      // VERIFY: The admin peer can retrieve the document.
      const retrievedByAdmin = await waitFor(() => siteOwnerProgram.releases.index.get(releaseDoc.id));
      expect(retrievedByAdmin?.id).toEqual(releaseDoc.id);
    });

    it('CANNOT add a subscription', async () => {
      const subDoc = createSubscriptionDoc(memberClient, siteOwnerProgram.address, 'remote-site');
      await expect(memberProgram.subscriptions.put(subDoc)).rejects.toBeInstanceOf(AccessError);
    });

    it('CANNOT delete a release created by an admin', async () => {
      const adminReleaseDoc = createReleaseDoc(siteOwnerClient, siteOwnerProgram.address);
      await siteOwnerProgram.releases.put(adminReleaseDoc);

      // VERIFY: Member can see it first.
      await waitFor(() => memberProgram.releases.index.get(adminReleaseDoc.id));

      // ASSERT: The delete operation is forbidden.
      await expect(memberProgram.releases.del(adminReleaseDoc.id)).rejects.toBeInstanceOf(AccessError);
    });
  });

  describe('Guest Permissions', () => {
    it('CANNOT add a release', async () => {
      const releaseDoc = createReleaseDoc(guestClient, siteOwnerProgram.address);
      await expect(guestProgram.releases.put(releaseDoc)).rejects.toBeInstanceOf(AccessError);
    });

    it('CANNOT add a subscription', async () => {
      const subDoc = createSubscriptionDoc(guestClient, siteOwnerProgram.address, 'remote-site');
      await expect(guestProgram.subscriptions.put(subDoc)).rejects.toBeInstanceOf(AccessError);
    });

    it('CANNOT delete a release created by an admin', async () => {
      const adminReleaseDoc = createReleaseDoc(siteOwnerClient, siteOwnerProgram.address);
      await siteOwnerProgram.releases.put(adminReleaseDoc);

      // VERIFY: Guest can see it first.
      await waitFor(() => guestProgram.releases.index.get(adminReleaseDoc.id));
      
      // ASSERT: The delete operation is forbidden.
      await expect(guestProgram.releases.del(adminReleaseDoc.id)).rejects.toBeInstanceOf(AccessError);
    });
  });
});