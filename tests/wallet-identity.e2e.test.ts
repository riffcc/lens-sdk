import { TestSession } from '@peerbit/test-utils';
import { LensService } from '../src/services';
import { Site } from '../src/programs/site';
import { Wallet } from 'ethers';
import { createIdentityFromSigner } from '../src/common/utils';
import { waitFor, waitForResolved } from '@peerbit/time';

describe('Custom Wallet Identity E2E', () => {
  let session: TestSession;
  let adminService: LensService;
  let walletService: LensService;
  let siteAddress: string;

  beforeAll(async () => {
    // 1. Setup a session with two peers. One for admin, one to host the wallet service.
    session = await TestSession.connected(2);
    const [adminClient, walletClient] = session.peers;

    // 2. Create the admin service and open a new site.
    adminService = new LensService({ peerbit: adminClient });
    const site = new Site(adminClient.identity.publicKey);
    await adminService.openSite(site);
    siteAddress = adminService.siteProgram!.address;

    // 3. Create a wallet-based identity for the second peer.
    const wallet = Wallet.createRandom();
    const walletIdentity = await createIdentityFromSigner(wallet);

    // 4. Create the LensService instance, injecting the custom wallet identity.
    walletService = new LensService({
      peerbit: walletClient, // It uses walletClient for network connection
      identity: walletIdentity, // But all actions are signed by walletIdentity
    });
    await walletService.openSite(siteAddress);

    // 5. Wait for peers to be aware of each other in the site program.
    await adminService.siteProgram!.waitFor(walletClient.peerId);
  }, 30000);

  afterAll(async () => {
    await adminService.stop();
    await walletService.stop();
    await session.stop();
  });

  it('a user with a wallet identity cannot add a release without permissions', async () => {
    const response = await walletService.addRelease({
      name: 'Unauthorized Release',
      categoryId: 'test',
      contentCID: 'cid-fail',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Access denied');
  });

  it('an admin can grant a role to the wallet\'s public key', async () => {
    const walletPublicKey = walletService['_activeIdentity']!.publicKey;
    const response = await adminService.assignRole(walletPublicKey, 'member');

    expect(response.success).toBe(true);

    // Verify the wallet user's status is now 'member'
    await waitForResolved(async () => {
      const status = await walletService.getAccountStatus();
      expect(status.roles).toContain('member');
    });
  });

  it('a user with a wallet identity CAN add a release after being granted a role', async () => {
    const releaseData = {
      name: 'My Wallet-Signed Release',
      categoryId: 'music',
      contentCID: 'cid-success',
    };
    const response = await walletService.addRelease(releaseData);

    expect(response.success).toBe(true);
    expect(response.id).toBeDefined();

    // Verify the release exists and was posted by the correct identity
    const newRelease = await waitFor(() => adminService.getRelease(response.id!));
    expect(newRelease).toBeDefined();
    expect(newRelease!.name).toEqual(releaseData.name);

    // CRITICAL: Check that the `postedBy` field matches the wallet's public key
    const walletPublicKey = walletService['_activeIdentity']!.publicKey;
    expect(newRelease!.postedBy.equals(walletPublicKey)).toBe(true);
  });
});