import type { Release, Site } from './schema';
import type{ AddReleaseResponse, ILensService, ReleaseData } from './types';
import {Peerbit} from 'peerbit';


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


export class BrowserLensService implements ILensService {
  private static instance: BrowserLensService | null = null;
  private client: Peerbit | null = null;
  private siteProgram: Site | null = null;
  private isInitialized: boolean = false;
  private siteOpened: boolean = false;

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  public static getInstance(): BrowserLensService {
    if (!BrowserLensService.instance) {
      BrowserLensService.instance = new BrowserLensService();
    }
    return BrowserLensService.instance;
  }

  async init(directory?: string): Promise<void> {
    if (this.isInitialized) {
      console.warn('BrowserLensService is already initialized.');
      return;
    }

    try {
      this.client = await Peerbit.create({
        directory: directory ?? './lens-node',
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize BrowserLensService:', error);
      throw error;
    }
  }

  async open(siteAddress: string): Promise<void> {
    this.ensureInitialized();
    if (this.siteOpened) {
      console.warn('Site is already opened.');
      return;
    }

    try {
      this.siteProgram = await this.client!.open<Site>(siteAddress);
      this.siteOpened = true;
    } catch (error) {
      console.error('Failed to open Site:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.client) {
      throw new Error('BrowserLensService is not initialized. Call lazyInit first.');
    }
  }

  private ensureSiteOpened(): void {
    if (!this.siteOpened || !this.siteProgram) {
      throw new Error('Site program is not opened. Call open first.');
    }
  }

  async close() {
    this.siteProgram?.close();
    this.client?.stop();
  }
  
  async getPublicKey(): Promise<string> {
    this.ensureInitialized();
    return this.client!.identity.publicKey.toString();
  }

  async getPeerId(): Promise<string> {
    this.ensureInitialized();
    return this.client!.peerId.toString();
  }

  async dial(address: string): Promise<boolean> {
    this.ensureInitialized();
    return this.client!.dial(address);
  }

  async getLatestReleases(size?: number): Promise<Release[]> {
    this.ensureSiteOpened();
    return this.siteProgram!.getLatestReleases(size);
  }

  async getRelease(id: string): Promise<Release | undefined> {
    this.ensureSiteOpened();
    return this.siteProgram!.getRelease(id);
  }

  async addRelease(releaseData: ReleaseData): Promise<AddReleaseResponse> {
    this.ensureSiteOpened();
    return this.siteProgram!.addRelease(releaseData);
  }
}

