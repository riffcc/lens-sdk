import type { Site } from '/@/schema';
import type{ ILensService, ReleaseData } from '/@/types';
import type {Peerbit} from 'peerbit';

export class BrowserLensService implements ILensService {
  client: Peerbit;
  siteProgram: Site;

  constructor(client: Peerbit, siteProgram: Site) {
    this.client = client;
    this.siteProgram = siteProgram;
  }

  async getPublicKey() {
    return this.client.identity.publicKey.toString();
  }

  async getPeerId() {
    return this.client.peerId.toString();
  }

  async dial(address: string) {
    return this.client.dial(address);
  }

  async getLatestReleases(size?: number) {
    return this.siteProgram.getLatestReleases(size);
  }

  async getRelease(id: string) {
    return this.siteProgram.getRelease(id);
  }

  async addRelease(releaseData: ReleaseData) {
    return await this.siteProgram.addRelease(releaseData);
  }
}

