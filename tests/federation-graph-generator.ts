import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FederationGraphData {
  nodes: Array<{
    id: string;
    name: string;
    releases: Array<{
      id: string;
      name: string;
      federatedFrom?: string;
    }>;
  }>;
  links: Array<{
    source: string;
    target: string;
    recursive: boolean;
    mutual?: boolean;
  }>;
  timestamp: string;
  testName: string;
  querySuccessRate?: number;
  queryPerformance?: {
    avgTime: number;
    minTime: number;
    maxTime: number;
    queries: number;
  };
  eventDrivenStats?: {
    totalSyncNodes: number;
    activeBatons: number;
    totalEntriesSynced: number;
    transitiveContent: number;
  };
  latticeStats?: {
    totalNodes: number;
    totalEdges: number;
    edgesCovered: number;
    averageCoverage: number;
    distributionMap: Record<string, string[]>;
  };
}

export async function generateFederationGraph(data: FederationGraphData): Promise<void> {
  const templatePath = path.join(__dirname, 'federation-graph-template.html');
  let template: string;
  
  try {
    template = fs.readFileSync(templatePath, 'utf-8');
  } catch (error) {
    console.warn('Federation graph template not found, creating minimal visualization file');
    // Create a minimal JSON output if template doesn't exist
    const outputPath = path.join(__dirname, `federation-graph-${data.testName}-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Generated federation graph data at: ${outputPath}`);
    return;
  }
  
  // Replace placeholder with data
  const html = template.replace(
    '// GRAPH_DATA_PLACEHOLDER',
    `const graphData = ${JSON.stringify(data, null, 2)};`
  );
  
  const outputPath = path.join(__dirname, `federation-graph-${data.testName}-${Date.now()}.html`);
  fs.writeFileSync(outputPath, html);
  console.log(`Generated federation graph at: ${outputPath}`);
}