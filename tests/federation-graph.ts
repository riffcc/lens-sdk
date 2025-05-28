import { LensService } from '../src/service';
import { RELEASE_NAME_PROPERTY, SUBSCRIPTION_SITE_ID_PROPERTY, SUBSCRIPTION_RECURSIVE_PROPERTY } from '../src/constants';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GraphNode {
  id: string;
  name: string;
  releases?: Array<{
    id: string;
    name: string;
    federatedFrom?: string;
  }>;
}

export interface GraphLink {
  source: string;
  target: string;
  recursive: boolean;
  mutual?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  expectedSyncs: number;
  successfulSyncs: number;
  timestamp: string;
  testName: string;
}

export class FederationGraphBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private links: GraphLink[] = [];
  private services: Map<string, LensService> = new Map();

  addNode(service: LensService, name: string): void {
    const siteId = service.siteProgram?.address;
    if (!siteId) return;
    
    this.nodes.set(siteId, { id: siteId, name });
    this.services.set(siteId, service);
  }

  async updateGraph(): Promise<void> {
    // Update node content
    for (const [siteId, service] of this.services) {
      const node = this.nodes.get(siteId);
      if (!node) continue;

      try {
        const releases = await service.getReleases();
        node.releases = releases.map(r => ({
          id: r.id,
          name: r[RELEASE_NAME_PROPERTY] || 'Untitled',
          federatedFrom: r.federatedFrom
        }));
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
      
      // Count how many releases the source should have
      const targetReleases = targetNode.releases || [];
      
      if (link.recursive) {
        // Recursive: should sync all content from target
        expected += targetReleases.length;
      } else {
        // Non-recursive: should sync only original content from target
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
        // Check if this release should be synced based on subscription type
        const shouldSync = link.recursive || !targetRelease.federatedFrom;
        
        if (shouldSync) {
          // Check if source has this release
          const hasRelease = sourceReleases.some(r => r.id === targetRelease.id);
          if (hasRelease) {
            successful++;
          }
        }
      }
    }
    
    return successful;
  }

  async saveGraph(testName: string, outputPath?: string): Promise<void> {
    await this.updateGraph();
    
    const graphData: GraphData = {
      nodes: Array.from(this.nodes.values()),
      links: this.links,
      expectedSyncs: this.calculateExpectedSyncs(),
      successfulSyncs: this.calculateSuccessfulSyncs(),
      timestamp: new Date().toISOString(),
      testName
    };

    // Read template
    const templatePath = path.join(__dirname, 'federation-graph-template.html');
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Replace placeholder with actual data
    template = template.replace(
      'GRAPH_DATA_PLACEHOLDER',
      JSON.stringify(graphData, null, 2)
    );
    
    // Save to file
    const fileName = outputPath || path.join(__dirname, `federation-graph-${testName.replace(/\s+/g, '-')}-${Date.now()}.html`);
    fs.writeFileSync(fileName, template);
    
    console.log(`Federation graph saved to: ${fileName}`);
    console.log(`Sync success rate: ${graphData.successfulSyncs}/${graphData.expectedSyncs} (${Math.round((graphData.successfulSyncs / graphData.expectedSyncs) * 100)}%)`);
  }
}