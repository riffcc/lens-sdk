import { LensService } from '../src/service';
import { RELEASE_NAME_PROPERTY, SUBSCRIPTION_SITE_ID_PROPERTY, SUBSCRIPTION_RECURSIVE_PROPERTY } from '../src/constants';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TimedRelease {
  id: string;
  name: string;
  federatedFrom?: string;
  syncedAt?: number; // Timestamp when this release was synced
  syncDuration?: number; // How long it took to sync (ms)
}

export interface TimedGraphNode {
  id: string;
  name: string;
  releases?: TimedRelease[];
}

export interface GraphSnapshot {
  timestamp: number;
  elapsedMs: number;
  nodes: TimedGraphNode[];
  links: GraphLink[];
  expectedSyncs: number;
  successfulSyncs: number;
  syncEvents: SyncEvent[];
}

export interface SyncEvent {
  timestamp: number;
  elapsedMs: number;
  type: 'content-added' | 'content-synced' | 'subscription-added';
  sourceNode: string;
  targetNode?: string;
  releaseId?: string;
  releaseName?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  recursive: boolean;
  mutual?: boolean;
}

export interface FederationTestReport {
  testName: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  snapshots: GraphSnapshot[];
  finalSyncRate?: number;
  averageSyncTime?: number;
}

export class FederationTimingGraphBuilder {
  private nodes: Map<string, TimedGraphNode> = new Map();
  private links: GraphLink[] = [];
  private services: Map<string, LensService> = new Map();
  private syncEvents: SyncEvent[] = [];
  private snapshots: GraphSnapshot[] = [];
  private startTime: number;
  private testName: string;
  private snapshotInterval?: NodeJS.Timer;
  private releaseTimings: Map<string, { startTime: number, endTime?: number }> = new Map();

  constructor(testName: string, autoSnapshotInterval?: number) {
    this.testName = testName;
    this.startTime = Date.now();
    
    // Auto-snapshot at regular intervals if specified
    if (autoSnapshotInterval) {
      this.snapshotInterval = setInterval(() => {
        this.captureSnapshot(`auto-${this.snapshots.length}`);
      }, autoSnapshotInterval);
    }
  }

  addNode(service: LensService, name: string): void {
    const siteId = service.siteProgram?.address;
    if (!siteId) return;
    
    this.nodes.set(siteId, { id: siteId, name });
    this.services.set(siteId, service);
  }

  recordContentAdded(siteId: string, releaseId: string, releaseName: string): void {
    const elapsedMs = Date.now() - this.startTime;
    this.syncEvents.push({
      timestamp: Date.now(),
      elapsedMs,
      type: 'content-added',
      sourceNode: siteId,
      releaseId,
      releaseName
    });
    
    // Start timing for this release
    this.releaseTimings.set(releaseId, { startTime: Date.now() });
  }

  recordContentSynced(targetNodeId: string, sourceNodeId: string, releaseId: string, releaseName: string): void {
    const elapsedMs = Date.now() - this.startTime;
    const timing = this.releaseTimings.get(releaseId);
    
    this.syncEvents.push({
      timestamp: Date.now(),
      elapsedMs,
      type: 'content-synced',
      sourceNode: sourceNodeId,
      targetNode: targetNodeId,
      releaseId,
      releaseName
    });
    
    if (timing && !timing.endTime) {
      timing.endTime = Date.now();
    }
  }

  recordSubscriptionAdded(sourceId: string, targetId: string): void {
    const elapsedMs = Date.now() - this.startTime;
    this.syncEvents.push({
      timestamp: Date.now(),
      elapsedMs,
      type: 'subscription-added',
      sourceNode: sourceId,
      targetNode: targetId
    });
  }

  async updateGraph(): Promise<void> {
    // Update node content with timing information
    for (const [siteId, service] of this.services) {
      const node = this.nodes.get(siteId);
      if (!node) continue;

      try {
        const releases = await service.getReleases();
        node.releases = releases.map(r => {
          const timedRelease: TimedRelease = {
            id: r.id,
            name: r[RELEASE_NAME_PROPERTY] || 'Untitled',
            federatedFrom: r.federatedFrom
          };
          
          // Find sync timing for this release
          const syncEvent = this.syncEvents.find(e => 
            e.type === 'content-synced' && 
            e.releaseId === r.id && 
            e.targetNode === siteId
          );
          
          if (syncEvent) {
            timedRelease.syncedAt = syncEvent.timestamp;
            const timing = this.releaseTimings.get(r.id);
            if (timing && timing.endTime) {
              timedRelease.syncDuration = timing.endTime - timing.startTime;
            }
          }
          
          return timedRelease;
        });
      } catch (e) {
        console.error(`Failed to get releases for ${node.name}:`, e);
      }
    }

    // Update subscriptions
    this.links = [];
    for (const [siteId, service] of this.services) {
      try {
        const subscriptions = await service.getSubscriptions();
        for (const sub of subscriptions) {
          const targetId = sub[SUBSCRIPTION_SITE_ID_PROPERTY];
          const recursive = sub[SUBSCRIPTION_RECURSIVE_PROPERTY] || false;
          
          this.links.push({
            source: siteId,
            target: targetId,
            recursive
          });
        }
      } catch (e) {
        console.error(`Failed to get subscriptions for site:`, e);
      }
    }

    // Mark mutual subscriptions
    for (const link of this.links) {
      const reverseLink = this.links.find(l => 
        l.source === link.target && l.target === link.source
      );
      if (reverseLink) {
        link.mutual = true;
      }
    }
  }

  calculateExpectedSyncs(): number {
    let expected = 0;
    
    for (const link of this.links) {
      const sourceNode = this.nodes.get(link.source);
      const targetNode = this.nodes.get(link.target);
      
      if (!sourceNode || !targetNode) continue;
      
      const targetReleases = targetNode.releases || [];
      
      if (link.recursive) {
        expected += targetReleases.length;
      } else {
        expected += targetReleases.filter(r => !r.federatedFrom).length;
      }
    }
    
    return expected;
  }

  calculateSuccessfulSyncs(): number {
    let successful = 0;
    
    for (const link of this.links) {
      const sourceNode = this.nodes.get(link.source);
      const targetNode = this.nodes.get(link.target);
      
      if (!sourceNode || !targetNode) continue;
      
      const sourceReleases = sourceNode.releases || [];
      const targetReleases = targetNode.releases || [];
      
      for (const targetRelease of targetReleases) {
        const shouldSync = link.recursive || !targetRelease.federatedFrom;
        
        if (shouldSync) {
          const hasRelease = sourceReleases.some(r => r.id === targetRelease.id);
          if (hasRelease) {
            successful++;
          }
        }
      }
    }
    
    return successful;
  }

  async captureSnapshot(label: string): Promise<void> {
    await this.updateGraph();
    
    const snapshot: GraphSnapshot = {
      timestamp: Date.now(),
      elapsedMs: Date.now() - this.startTime,
      nodes: Array.from(this.nodes.values()),
      links: [...this.links],
      expectedSyncs: this.calculateExpectedSyncs(),
      successfulSyncs: this.calculateSuccessfulSyncs(),
      syncEvents: [...this.syncEvents]
    };
    
    this.snapshots.push(snapshot);
    
    // Save intermediate graph
    await this.saveSnapshot(snapshot, label);
  }

  private async saveSnapshot(snapshot: GraphSnapshot, label: string): Promise<void> {
    const templatePath = path.join(__dirname, 'federation-graph-template.html');
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Create enhanced graph data with timing info
    const graphData = {
      nodes: snapshot.nodes,
      links: snapshot.links,
      expectedSyncs: snapshot.expectedSyncs,
      successfulSyncs: snapshot.successfulSyncs,
      timestamp: new Date(snapshot.timestamp).toISOString(),
      elapsedMs: snapshot.elapsedMs,
      testName: `${this.testName}-${label}`,
      syncEvents: snapshot.syncEvents
    };
    
    template = template.replace(
      'GRAPH_DATA_PLACEHOLDER',
      JSON.stringify(graphData, null, 2)
    );
    
    const fileName = path.join(__dirname, `federation-graph-${this.testName}-${label}-${snapshot.timestamp}.html`);
    fs.writeFileSync(fileName, template);
    
    console.log(`[Graph] Snapshot '${label}' saved: ${fileName}`);
    console.log(`[Graph] Elapsed: ${snapshot.elapsedMs}ms, Sync rate: ${snapshot.successfulSyncs}/${snapshot.expectedSyncs} (${Math.round((snapshot.successfulSyncs / snapshot.expectedSyncs) * 100)}%)`);
  }

  async generateFinalReport(): Promise<FederationTestReport> {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    
    // Capture final snapshot
    await this.captureSnapshot('final');
    
    const report: FederationTestReport = {
      testName: this.testName,
      startTime: this.startTime,
      endTime: Date.now(),
      totalDuration: Date.now() - this.startTime,
      snapshots: this.snapshots,
      finalSyncRate: this.snapshots.length > 0 
        ? (this.snapshots[this.snapshots.length - 1].successfulSyncs / this.snapshots[this.snapshots.length - 1].expectedSyncs) * 100
        : 0
    };
    
    // Calculate average sync time
    const syncDurations = Array.from(this.releaseTimings.values())
      .filter(t => t.endTime)
      .map(t => t.endTime! - t.startTime);
    
    if (syncDurations.length > 0) {
      report.averageSyncTime = syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length;
    }
    
    // Save the report
    const reportPath = path.join(__dirname, `federation-report-${this.testName}-${this.startTime}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n[Federation Test Report]`);
    console.log(`Test: ${this.testName}`);
    console.log(`Duration: ${report.totalDuration}ms`);
    console.log(`Final sync rate: ${report.finalSyncRate?.toFixed(1)}%`);
    console.log(`Average sync time: ${report.averageSyncTime?.toFixed(0)}ms`);
    console.log(`Report saved: ${reportPath}\n`);
    
    return report;
  }
}