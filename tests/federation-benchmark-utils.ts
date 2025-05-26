import type { SiteNode, SyncPerformanceMetrics, FederationMetrics } from './federation-sync-benchmark.spec';

export class FederationGraph {
  private adjacencyList = new Map<string, Set<string>>();
  private siteMetadata = new Map<string, { contentCount: number; isReplicator: boolean }>();

  addSite(siteId: string, metadata: { contentCount: number; isReplicator: boolean }) {
    if (!this.adjacencyList.has(siteId)) {
      this.adjacencyList.set(siteId, new Set());
    }
    this.siteMetadata.set(siteId, metadata);
  }

  addFollow(fromSiteId: string, toSiteId: string) {
    if (!this.adjacencyList.has(fromSiteId)) {
      this.adjacencyList.set(fromSiteId, new Set());
    }
    this.adjacencyList.get(fromSiteId)!.add(toSiteId);
  }

  detectCycles(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (siteId: string, path: string[]): void => {
      visited.add(siteId);
      recursionStack.add(siteId);
      path.push(siteId);

      const neighbors = this.adjacencyList.get(siteId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).concat([neighbor]);
          cycles.push(cycle);
        }
      }

      recursionStack.delete(siteId);
    };

    for (const siteId of this.adjacencyList.keys()) {
      if (!visited.has(siteId)) {
        dfs(siteId, []);
      }
    }

    return cycles;
  }

  findShortestPaths(fromSiteId: string): Map<string, { distance: number; path: string[] }> {
    const distances = new Map<string, number>();
    const paths = new Map<string, string[]>();
    const queue: string[] = [fromSiteId];
    
    distances.set(fromSiteId, 0);
    paths.set(fromSiteId, [fromSiteId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDistance = distances.get(current)!;
      const currentPath = paths.get(current)!;

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDistance + 1);
          paths.set(neighbor, [...currentPath, neighbor]);
          queue.push(neighbor);
        }
      }
    }

    const result = new Map<string, { distance: number; path: string[] }>();
    for (const [siteId, distance] of distances.entries()) {
      result.set(siteId, {
        distance,
        path: paths.get(siteId) || [],
      });
    }

    return result;
  }

  calculateNetworkMetrics() {
    const totalSites = this.adjacencyList.size;
    let totalEdges = 0;
    let maxDegree = 0;
    let minDegree = Infinity;
    
    for (const neighbors of this.adjacencyList.values()) {
      const degree = neighbors.size;
      totalEdges += degree;
      maxDegree = Math.max(maxDegree, degree);
      minDegree = Math.min(minDegree, degree);
    }

    const avgDegree = totalEdges / totalSites;
    const density = totalEdges / (totalSites * (totalSites - 1));

    return {
      totalSites,
      totalEdges,
      avgDegree,
      maxDegree,
      minDegree: minDegree === Infinity ? 0 : minDegree,
      density,
    };
  }

  getReachabilityAnalysis() {
    const reachabilityMatrix = new Map<string, Set<string>>();
    
    for (const siteId of this.adjacencyList.keys()) {
      const reachable = new Set<string>();
      const visited = new Set<string>();
      const queue = [siteId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        reachable.add(current);

        const neighbors = this.adjacencyList.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      reachabilityMatrix.set(siteId, reachable);
    }

    return reachabilityMatrix;
  }
}

export class PerformanceMonitor {
  private startTime = 0;
  private checkpoints: { name: string; time: number }[] = [];

  start() {
    this.startTime = Date.now();
    this.checkpoints = [];
    this.checkpoint('start');
  }

  checkpoint(name: string) {
    this.checkpoints.push({
      name,
      time: Date.now() - this.startTime,
    });
  }

  getDuration(fromCheckpoint?: string, toCheckpoint?: string): number {
    const fromIndex = fromCheckpoint 
      ? this.checkpoints.findIndex(c => c.name === fromCheckpoint)
      : 0;
    const toIndex = toCheckpoint
      ? this.checkpoints.findIndex(c => c.name === toCheckpoint)
      : this.checkpoints.length - 1;

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error('Checkpoint not found');
    }

    return this.checkpoints[toIndex].time - this.checkpoints[fromIndex].time;
  }

  getReport(): string {
    let report = '📊 Performance Report:\n';
    
    for (let i = 0; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i];
      const duration = i > 0 ? checkpoint.time - this.checkpoints[i - 1].time : 0;
      
      report += `  ${checkpoint.name}: +${duration}ms (total: ${checkpoint.time}ms)\n`;
    }
    
    return report;
  }
}

export function generateRandomSiteGraph(
  numSites: number,
  minFollows: number,
  maxFollows: number,
  recursiveProbability: number
): FederationGraph {
  const graph = new FederationGraph();
  const siteIds = Array.from({ length: numSites }, (_, i) => `site-${i}`);

  // Add all sites
  for (const siteId of siteIds) {
    graph.addSite(siteId, {
      contentCount: Math.floor(Math.random() * 20) + 5,
      isReplicator: Math.random() < 0.05, // 5% are replicators
    });
  }

  // Add random follows
  for (const siteId of siteIds) {
    const followsCount = Math.floor(
      Math.random() * (maxFollows - minFollows + 1) + minFollows
    );
    
    const potentialFollows = siteIds.filter(id => id !== siteId);
    const follows = potentialFollows
      .sort(() => Math.random() - 0.5)
      .slice(0, followsCount);

    for (const followId of follows) {
      graph.addFollow(siteId, followId);
    }
  }

  return graph;
}

export function analyzeSyncEffectiveness(
  performanceMetrics: SyncPerformanceMetrics[]
): {
  totalSyncTime: number;
  avgSyncTime: number;
  successRate: number;
  errorRate: number;
  contentGrowthRate: number;
} {
  const totalSyncTime = performanceMetrics.reduce((sum, m) => sum + m.syncDuration, 0);
  const avgSyncTime = totalSyncTime / performanceMetrics.length;
  
  const totalErrors = performanceMetrics.reduce((sum, m) => sum + m.errorCount, 0);
  const errorRate = (totalErrors / performanceMetrics.length) * 100;
  const successRate = 100 - errorRate;
  
  const totalContentBefore = performanceMetrics.reduce((sum, m) => sum + m.contentBeforeSync, 0);
  const totalContentAfter = performanceMetrics.reduce((sum, m) => sum + m.contentAfterSync, 0);
  const contentGrowthRate = totalContentBefore > 0 
    ? ((totalContentAfter - totalContentBefore) / totalContentBefore) * 100
    : 0;

  return {
    totalSyncTime,
    avgSyncTime,
    successRate,
    errorRate,
    contentGrowthRate,
  };
}

export function validateNetworkHealth(
  graph: FederationGraph,
  replicationMetrics: { success: number; failures: number }
): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check for cycles
  const cycles = graph.detectCycles();
  if (cycles.length > 0) {
    issues.push(`Detected ${cycles.length} cycles in follow graph`);
    recommendations.push('Implement cycle detection in sync process');
  }

  // Check network connectivity
  const networkMetrics = graph.calculateNetworkMetrics();
  if (networkMetrics.density < 0.01) {
    issues.push('Network density too low - sites may be isolated');
    recommendations.push('Encourage more follows between sites');
  }

  // Check replication success rate
  const totalReplications = replicationMetrics.success + replicationMetrics.failures;
  const successRate = totalReplications > 0 ? (replicationMetrics.success / totalReplications) * 100 : 0;
  
  if (successRate < 90) {
    issues.push(`Low replication success rate: ${successRate.toFixed(2)}%`);
    recommendations.push('Investigate replication failures and improve error handling');
  }

  const isHealthy = issues.length === 0;
  
  return {
    isHealthy,
    issues,
    recommendations,
  };
}