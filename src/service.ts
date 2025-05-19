import { Peerbit } from 'peerbit';
import { SearchRequest, Sort, SortDirection, type WithContext } from '@peerbit/document';
import { Release, Site } from './schema';
import type { AddReleaseResponse, ILensService, ReleaseData, SiteArgs } from './types';

export class ElectronLensService implements ILensService {
  constructor() {}

  async getPublicKey() {
    return window.electronLensService.getPublicKey();
  }

  async getPeerId() {
    return window.electronLensService.getPeerId();
  }

  async dial(address: string) {
    return window.electronLensService.dial(address);
  }

  async getLatestReleases(size?: number) {
    return window.electronLensService.getLatestReleases(size);
  }

  async getRelease(id: string) {
    return window.electronLensService.getRelease(id);
  }

  async addRelease(releaseData: ReleaseData) {
    return window.electronLensService.addRelease(releaseData);
  }
}

export class LensService implements ILensService {
  client: Peerbit | null = null;
  siteProgram: Site | null = null;
  extenarlyManaged: boolean = false;

  constructor(client?: Peerbit) {
    if (client) {
      this.client = client;
      this.extenarlyManaged = true;
    }
  }

  async init(directory?: string): Promise<void> {
    if (this.client) {
      throw new Error(
        'LensService: Already configured with instances from constructor. Do not call init().',
      );
    }
    this.client = await Peerbit.create({
      directory,
    });
    this.extenarlyManaged = false;
  }

  async stop(): Promise<void> {
    if (!this.extenarlyManaged) {
      const { client } = this.ensureInitialized();
      try {
        await client.stop();
      } catch (error) {
        console.error('LensService: Error stopping Peerbit client:', error);
      }
    }
  }
  private ensureInitialized(): {
    client: Peerbit;
  } {
    if (!this.client) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      client: this.client,
    };
  }

  async openSite(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    if (this.siteProgram) {
      throw new Error(
        'Site already opened.',
      );
    }
    const { client } = this.ensureInitialized();

    if (siteOrAddress instanceof Site) {
      this.siteProgram = await client.open(siteOrAddress, {
        args: openOptions,
      });
    } else {
      this.siteProgram = await client.open<Site>(siteOrAddress, {
        args: openOptions,
      });
    }
  }


  private ensureSiteOpened(): {
    siteProgram: Site;
  } {
    this.ensureInitialized();
    if (!this.siteProgram) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      siteProgram: this.siteProgram,
    };
  }


  async getPublicKey(): Promise<string> {
    const { client } = this.ensureInitialized();
    return client.identity.publicKey.toString();
  }

  async getPeerId(): Promise<string> {
    const { client } = this.ensureInitialized();
    return client.peerId.toString();
  }

  async dial(address: string): Promise<boolean> {
    const { client } = this.ensureInitialized();
    return client.dial(address);
  }

  async getLatestReleases(size?: number): Promise<WithContext<Release>[]> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.releases.index.search(
      new SearchRequest({
        sort: [
          new Sort({ key: 'created', direction: SortDirection.DESC }),
        ],
        fetch: size,
      }),
    );
  }

  async getRelease(id: string): Promise<WithContext<Release> | undefined> {
    const { siteProgram } = this.ensureSiteOpened();
    return siteProgram.releases.index.get(id);
  }

  async addRelease(releaseData: ReleaseData): Promise<AddReleaseResponse> {
    const { siteProgram } = this.ensureSiteOpened();

    const release = new Release(releaseData);
    const result = await siteProgram.releases.put(release);
    return {
      id: release.id,
      hash: result.entry.hash,
    };
  }

  // async grantWriteAccess(publickKey: PublicSignKey): Promise<void> {
  //   const access = new Access({
  //     accessCondition: new PublicKeyAccessCondition({ key: identity }),
  //     accessTypes: [AccessType.Write, AccessType.Read],
  //   });
  //   await this.acl.access.put(access.initialize());
  // }

  // async grantAdminAccess(identity: PublicSignKey): Promise<void> {
  //   const access = new Access({
  //     accessCondition: new PublicKeyAccessCondition({ key: identity }),
  //     accessTypes: [AccessType.Any],
  //   });
  //   await this.acl.access.put(access.initialize());
  // }

  // async grantReadAccess(identity: PublicSignKey): Promise<void> {
  //   const access = new Access({
  //     accessCondition: new PublicKeyAccessCondition({ key: identity }),
  //     accessTypes: [AccessType.Read],
  //   });
  //   await this.acl.access.put(access.initialize());
  // }

  // async addTrustedIdentity(identity: PublicSignKey): Promise<void> {
  //   await this.acl.trustedNetwork.add(identity);
  // }

  // async addIdentityRelation(from: PublicSignKey, to: PublicSignKey): Promise<void> {
  //   if (!this.node.identity.publicKey.equals(from)) {
  //       throw new Error("addIdentityRelation must be called by the 'from' identity's peer, or the ACL for IdentityGraph needs to allow this peer to act on behalf of 'from'.");
  //   }
  //   await this.acl.identityGraphController.addRelation(to);
  // }
}

