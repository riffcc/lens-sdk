export interface BenchmarkConfig {
  sites: {
    total: number;
    replicators: number;
    minFollowsPerSite: number;
    maxFollowsPerSite: number;
    minContentPerSite: number;
    maxContentPerSite: number;
    recursiveFollowProbability: number;
  };
  sync: {
    timeoutMs: number;
    maxConcurrentSyncs: number;
    syncBatchSize: number;
  };
  performance: {
    minSuccessRate: number;
    maxErrorRate: number;
    maxSyncTimeMs: number;
    minDistributionEfficiency: number;
  };
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  sites: {
    total: 100,
    replicators: 5,
    minFollowsPerSite: 2,
    maxFollowsPerSite: 10,
    minContentPerSite: 5,
    maxContentPerSite: 20,
    recursiveFollowProbability: 0.7, // 70% chance
  },
  sync: {
    timeoutMs: 300000, // 5 minutes
    maxConcurrentSyncs: 10,
    syncBatchSize: 20,
  },
  performance: {
    minSuccessRate: 90, // 90%
    maxErrorRate: 10, // 10%
    maxSyncTimeMs: 300000, // 5 minutes
    minDistributionEfficiency: 80, // 80%
  },
};

export const QUICK_BENCHMARK_CONFIG: BenchmarkConfig = {
  sites: {
    total: 20,
    replicators: 2,
    minFollowsPerSite: 1,
    maxFollowsPerSite: 5,
    minContentPerSite: 2,
    maxContentPerSite: 8,
    recursiveFollowProbability: 0.5,
  },
  sync: {
    timeoutMs: 60000, // 1 minute
    maxConcurrentSyncs: 5,
    syncBatchSize: 10,
  },
  performance: {
    minSuccessRate: 85,
    maxErrorRate: 15,
    maxSyncTimeMs: 60000,
    minDistributionEfficiency: 70,
  },
};

export const STRESS_BENCHMARK_CONFIG: BenchmarkConfig = {
  sites: {
    total: 500,
    replicators: 20,
    minFollowsPerSite: 5,
    maxFollowsPerSite: 25,
    minContentPerSite: 10,
    maxContentPerSite: 50,
    recursiveFollowProbability: 0.8,
  },
  sync: {
    timeoutMs: 1800000, // 30 minutes
    maxConcurrentSyncs: 20,
    syncBatchSize: 50,
  },
  performance: {
    minSuccessRate: 85,
    maxErrorRate: 15,
    maxSyncTimeMs: 1800000,
    minDistributionEfficiency: 75,
  },
};