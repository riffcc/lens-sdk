import type { ILensService, ReleaseData } from '/@/types';

export class ElectronLensService implements ILensService {

  constructor() {}

  async getPublicKey() {
    return window.electronPeerbit.getPublicKey();
  }

  async getPeerId() {
    return window.electronPeerbit.getPeerId();
  }

  async dial(address: string) {
    return window.electronPeerbit.dial(address);
  }

  async getLatestReleases(size?: number) {
    return window.electronPeerbit.getLatestReleases(size);
  }

  async getRelease(id: string) {
    return window.electronPeerbit.getRelease(id);
  }

  async addRelease(releaseData: ReleaseData) {
    return window.electronPeerbit.addRelease(releaseData);
  }
}
