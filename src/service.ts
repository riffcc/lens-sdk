import { Peerbit } from 'peerbit';
import { 
  Compare, 
  IntegerCompare, 
  Or, 
  SearchRequest, 
  Sort,
  SortDirection, 
  type WithContext,
} from '@peerbit/document';

import { 
  Access, 
  ACCESS_TYPE_PROPERTY, 
  AccessType, 
  PublicKeyAccessCondition, 
  type IdentityAccessController,
} from '@peerbit/identity-access-controller';
import type { PublicSignKey } from '@peerbit/crypto';
import { Release, Site } from './schema';
import type {
  AddReleaseResponse,
  ILensService,
  ReleaseData,
  SiteArgs,
} from './types';

import { AccountType } from './types';
import { publicSignKeyFromString } from './utils';

export async function authorise(
  siteProgram: Site,
  accountType: AccountType,
  stringPublicKey: string,
): Promise<void> {
  const publicSignKey = publicSignKeyFromString(stringPublicKey);
  const accessCondition = new PublicKeyAccessCondition({ key: publicSignKey });
  const accessTypes: AccessType[] = [AccessType.Read, AccessType.Write];

  if (accountType === AccountType.MEMBER) {
    const access = new Access({
      accessCondition,
      accessTypes,
    });
    await siteProgram.members.access.put(access);

  } else if (accountType === AccountType.ADMIN) {
    const access = new Access({
      accessCondition,
      accessTypes,
    });
    await siteProgram.members.access.put(access);
    await siteProgram.administrators.access.put(access);

  } else {
    throw new Error('authorization for this account type is not implemented yet.');
  }
}

const canPerformCheck = async (accessController: IdentityAccessController, key: PublicSignKey) => {
  const accessWritedOrAny = await accessController.access.index.search(
    new SearchRequest({
      query: [
        new Or([
          new IntegerCompare({
            key: ACCESS_TYPE_PROPERTY,
            compare: Compare.Equal,
            value: AccessType.Any,
          }),
          new IntegerCompare({
            key: ACCESS_TYPE_PROPERTY,
            compare: Compare.Equal,
            value: AccessType.Write,
          }),
        ]),
      ],
    }),
  );

  for (const access of accessWritedOrAny) {
    if (access instanceof Access) {
      if (
        access.accessTypes.find(
          (x) => x === AccessType.Any || x === AccessType.Write,
        ) !== undefined
      ) {
        // check condition
        if (await access.accessCondition.allowed(key)) {
          return true;
        }
        continue;
      }
    }
  }
};

export class ElectronLensService implements ILensService {
  constructor() {}

  async init(directory?: string): Promise<void> {
    await window.electronLensService.init(directory);
  }

  async stop(): Promise<void> {
    await window.electronLensService.stop();
  }

  async openSite(siteOrAddress: Site | string, openOptions?: SiteArgs): Promise<void> {
    await window.electronLensService.openSite(siteOrAddress, openOptions);
  }

  async getPublicKey() {
    return window.electronLensService.getPublicKey();
  }

  async getPeerId() {
    return window.electronLensService.getPeerId();
  }

  async getAccountStatus(): Promise<AccountType> {
    return window.electronLensService.getAccountStatus();
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
  private client: Peerbit | null = null;
  private siteProgram: Site | null = null;
  private extenarlyManaged: boolean = false;

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
    client: Peerbit;
    siteProgram: Site;
  } {
    const { client } = this.ensureInitialized();
    if (!this.siteProgram) {
      throw new Error(
        'LensService is not properly initialized. call init(directory?).',
      );
    }
    return {
      client: client,
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

  async getAccountStatus(): Promise<AccountType> {
    const { client, siteProgram } = this.ensureSiteOpened();

    if (await canPerformCheck(siteProgram.administrators, client.identity.publicKey)) {
      return AccountType.ADMIN;
    } else if (await canPerformCheck(siteProgram.members, client.identity.publicKey)) {
      return AccountType.MEMBER;
    }
    return AccountType.GUEST;
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

}

