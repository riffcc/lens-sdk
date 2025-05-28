import { spawn, ChildProcess } from 'child_process';
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

export interface PeerProcess {
  config: PeerConfig;
  process: ChildProcess;
  multiaddrs: string[];
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
 * Manages a peer running in a separate process
 */
export class ProcessPeer {
  private process: ChildProcess;
  private config: PeerConfig;
  private multiaddrs: string[] = [];
  private siteAddress: string = '';
  private messageHandlers = new Map<string, (data: any) => void>();

  constructor(config: PeerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const workerPath = path.join(__dirname, 'peer-worker.js');

    // Spawn process using the actual worker file
    this.process = spawn('node', ['--experimental-vm-modules', workerPath], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
      stdio: ['inherit', 'pipe', 'pipe', 'ipc']
    });

    // Handle process output
    this.process.stdout?.on('data', (data: Buffer) => {
      console.log(`[${this.config.id}] ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[${this.config.id}] ERROR: ${data.toString().trim()}`);
    });

    // Handle messages
    this.process.on('message', (msg: any) => {
      if (msg.type === 'STARTED') {
        this.multiaddrs = msg.multiaddrs;
        this.siteAddress = msg.siteAddress;
      }
      
      const handler = this.messageHandlers.get(msg.type);
      if (handler) {
        handler(msg);
      }
    });

    // Wait for ready signal
    await new Promise<void>((resolve, reject) => {
      this.messageHandlers.set('READY', () => {
        this.messageHandlers.delete('READY');
        resolve();
      });

      this.messageHandlers.set('ERROR', (msg) => {
        reject(new Error(msg.error));
      });

      // Handle process exit
      this.process.once('exit', (code) => {
        reject(new Error(`Process exited with code ${code}`));
      });
    });

    // Start the peer
    return new Promise((resolve, reject) => {
      this.messageHandlers.set('STARTED', () => {
        this.messageHandlers.delete('STARTED');
        resolve();
      });

      this.messageHandlers.set('ERROR', (msg) => {
        reject(new Error(msg.error));
      });

      this.process.send({ type: 'START', config: this.config });
    });
  }

  async dial(multiaddrs: string[]): Promise<void> {
    await this.sendCommand('DIAL', { multiaddrs });
  }

  async addSubscription(subscription: any): Promise<any> {
    const result = await this.sendCommand('ADD_SUBSCRIPTION', { subscription });
    return result.result;
  }

  async addRelease(release: any): Promise<any> {
    const result = await this.sendCommand('ADD_RELEASE', { release });
    return result.result;
  }

  async getReleases(): Promise<any[]> {
    const result = await this.sendCommand('GET_RELEASES', {});
    return result.releases;
  }

  async shutdown(): Promise<void> {
    await this.sendCommand('SHUTDOWN', {});
    this.process.kill();
  }

  private sendCommand(type: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const responseType = type + '_COMPLETE';
      
      this.messageHandlers.set(responseType, (msg) => {
        this.messageHandlers.delete(responseType);
        resolve(msg);
      });

      this.messageHandlers.set('ERROR', (msg) => {
        if (msg.command === type) {
          this.messageHandlers.delete('ERROR');
          reject(new Error(msg.error));
        }
      });

      this.process.send({ type, ...data });
    });
  }

  getMultiaddrs(): string[] {
    return this.multiaddrs;
  }

  getSiteAddress(): string {
    return this.siteAddress;
  }
}

/**
 * Helper to create and manage multiple process peers
 */
export class MultiProcessPeerManager {
  private peers: ProcessPeer[] = [];
  private basePort: number;

  constructor(basePort: number = 9000) {
    this.basePort = basePort;
  }

  async createPeers(count: number): Promise<ProcessPeer[]> {
    const configs = allocatePorts(this.basePort, count);
    
    for (const config of configs) {
      const peer = new ProcessPeer(config);
      await peer.start();
      this.peers.push(peer);
    }

    return this.peers;
  }

  async connectPeers(topology: 'full-mesh' | 'star' | 'chain' = 'full-mesh', hubIndex: number = 0): Promise<void> {
    switch (topology) {
      case 'full-mesh':
        // Connect everyone to everyone
        for (let i = 0; i < this.peers.length; i++) {
          for (let j = i + 1; j < this.peers.length; j++) {
            await this.peers[j].dial(this.peers[i].getMultiaddrs());
          }
        }
        break;

      case 'star':
        // Connect all peers to the hub
        const hubAddrs = this.peers[hubIndex].getMultiaddrs();
        for (let i = 0; i < this.peers.length; i++) {
          if (i !== hubIndex) {
            await this.peers[i].dial(hubAddrs);
          }
        }
        break;

      case 'chain':
        // Connect each peer to the next
        for (let i = 0; i < this.peers.length - 1; i++) {
          await this.peers[i + 1].dial(this.peers[i].getMultiaddrs());
        }
        break;
    }
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(this.peers.map(peer => peer.shutdown()));
  }

  getPeers(): ProcessPeer[] {
    return this.peers;
  }
}