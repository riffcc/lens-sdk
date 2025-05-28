import { Worker } from 'worker_threads';
import { Peerbit } from 'peerbit';
import { LensService, Site, ADMIN_SITE_ARGS } from '../src/index';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PeerConfig {
  id: string;
  tcpPort: number;
  wsPort: number;
  dataDir: string;
}

/**
 * Allocates sequential ports starting from a base port
 */
export function allocatePorts(basePort: number, peerCount: number): PeerConfig[] {
  const configs: PeerConfig[] = [];
  let currentPort = basePort;

  for (let i = 0; i < peerCount; i++) {
    configs.push({
      id: `peer-${i}`,
      tcpPort: currentPort,
      wsPort: currentPort + 1,
      dataDir: `/tmp/lens-test-peer-${i}-${Date.now()}`
    });
    currentPort += 2; // Skip 2 ports per peer (TCP + WS)
  }

  return configs;
}

/**
 * Creates a Peerbit instance with specific port configuration
 * This runs in the main thread for single-process testing
 */
export async function createPeerWithPorts(config: PeerConfig): Promise<{
  peer: Peerbit;
  service: LensService;
  site: Site;
}> {
  // Ensure data directory exists
  await fs.mkdir(config.dataDir, { recursive: true });

  const peer = await Peerbit.create({
    directory: config.dataDir,
    libp2p: {
      addresses: {
        listen: [
          `/ip4/127.0.0.1/tcp/${config.tcpPort}`,
          `/ip4/127.0.0.1/tcp/${config.wsPort}/ws`
        ]
      }
    }
  });

  const service = new LensService(peer, { 
    mode: 'directsub',
    logger: {
      info: (msg, data) => console.log(`[${config.id}] ${msg}`, data),
      warn: (msg, data) => console.warn(`[${config.id}] ${msg}`, data),
      error: (msg, data) => console.error(`[${config.id}] ${msg}`, data),
      debug: (msg, data) => console.debug(`[${config.id}] ${msg}`, data),
    }
  });
  const site = new Site(peer.identity.publicKey);
  await service.openSite(site, ADMIN_SITE_ARGS);

  return { peer, service, site };
}

/**
 * Manages multiple peers in a single process
 * Each peer has its own port allocation
 */
export class SingleProcessPeerManager {
  private peers: Array<{
    config: PeerConfig;
    peer: Peerbit;
    service: LensService;
    site: Site;
  }> = [];
  private basePort: number;

  constructor(basePort: number = 9000) {
    this.basePort = basePort;
  }

  async createPeers(count: number): Promise<void> {
    const configs = allocatePorts(this.basePort, count);
    
    // Create peers sequentially to avoid port conflicts
    for (const config of configs) {
      console.log(`Creating ${config.id} on ports ${config.tcpPort}/${config.wsPort}...`);
      const { peer, service, site } = await createPeerWithPorts(config);
      this.peers.push({ config, peer, service, site });
      
      // Small delay to ensure port binding completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Created ${count} peers successfully`);
  }

  async connectPeers(topology: 'full-mesh' | 'star' | 'chain' = 'full-mesh', hubIndex: number = 0): Promise<void> {
    console.log(`Connecting peers in ${topology} topology...`);
    
    switch (topology) {
      case 'full-mesh':
        // Connect everyone to everyone
        for (let i = 0; i < this.peers.length; i++) {
          for (let j = i + 1; j < this.peers.length; j++) {
            const addrs = this.peers[i].peer.getMultiaddrs();
            console.log(`Connecting peer-${j} to peer-${i}...`);
            await this.peers[j].peer.dial(addrs);
          }
        }
        break;

      case 'star':
        // Connect all peers to the hub
        const hubAddrs = this.peers[hubIndex].peer.getMultiaddrs();
        for (let i = 0; i < this.peers.length; i++) {
          if (i !== hubIndex) {
            console.log(`Connecting peer-${i} to hub (peer-${hubIndex})...`);
            await this.peers[i].peer.dial(hubAddrs);
          }
        }
        break;

      case 'chain':
        // Connect each peer to the next
        for (let i = 0; i < this.peers.length - 1; i++) {
          const addrs = this.peers[i].peer.getMultiaddrs();
          console.log(`Connecting peer-${i + 1} to peer-${i}...`);
          await this.peers[i + 1].peer.dial(addrs);
        }
        break;
    }

    console.log('Peer connections established');
  }

  async shutdownAll(): Promise<void> {
    console.log('Shutting down all peers...');
    
    // Close services first
    for (const { service } of this.peers) {
      try {
        if (service.siteProgram) {
          await service.closeSite();
        }
      } catch (e) {
        console.error('Error closing service:', e);
      }
    }
    
    // Stop all services
    for (const { service } of this.peers) {
      try {
        await service.stop();
      } catch (e) {
        console.error('Error stopping service:', e);
      }
    }

    // Clean up data directories
    for (const { config } of this.peers) {
      try {
        await fs.rm(config.dataDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`Error cleaning up ${config.dataDir}:`, e);
      }
    }

    this.peers = [];
    console.log('All peers shut down');
  }

  getPeer(index: number) {
    return this.peers[index];
  }

  getAllPeers() {
    return this.peers;
  }

  getSiteAddress(index: number): string {
    return this.peers[index].site.address;
  }

  getService(index: number): LensService {
    return this.peers[index].service;
  }
}