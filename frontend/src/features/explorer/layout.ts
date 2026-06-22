import ELK from 'elkjs/lib/elk.bundled';
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api';
import type { ExplorerNode, ExplorerEdge } from './types';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const ELK_OPTIONS = {
  'elk.algorithm': 'mrtree',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.nodeNodeBetweenLayers': '60',
  'elk.partitioning.quick': 'true',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
};

interface LayoutOptions {
  width: number;
  height: number;
}

function nodeKindToWidth(kind: string): number {
  switch (kind) {
    case 'directory': return 280;
    case 'file': return 220;
    case 'class':
    case 'interface':
    case 'enum':
    case 'struct': return 200;
    default: return 160;
  }
}

function nodeKindToHeight(kind: string): number {
  switch (kind) {
    case 'directory': return 80;
    case 'file': return 64;
    default: return 48;
  }
}

export async function computeLayout(
  explorerNodes: ExplorerNode[],
  explorerEdges: ExplorerEdge[],
  options: LayoutOptions,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const nodeMap = new Map(explorerNodes.map((n) => [n.id, n]));

  const elkNodes: ElkNode[] = explorerNodes.map((n) => ({
    id: n.id,
    width: nodeKindToWidth(n.kind),
    height: nodeKindToHeight(n.kind),
  }));

  const elkEdges: ElkExtendedEdge[] = explorerEdges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph: ElkNode = {
    id: 'root',
    children: elkNodes,
    edges: elkEdges,
  };

  let layouted: ElkNode;
  try {
    layouted = await elk.layout(graph, {
      layoutOptions: ELK_OPTIONS,
      logging: false,
      measureNodeHierarchy: true,
    });
  } catch {
    // Fallback: return nodes in a grid if ELK fails
    const cols = Math.ceil(Math.sqrt(explorerNodes.length));
    const nodes: Node[] = explorerNodes.map((n, i) => ({
      id: n.id,
      type: n.kind === 'directory' ? 'directory' : n.kind === 'file' ? 'file' : 'entity',
      position: {
        x: (i % cols) * 300,
        y: Math.floor(i / cols) * 120,
      },
      data: { ...n, label: n.name },
    }));
    const edges: Edge[] = explorerEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: { strokeWidth: 1.5, stroke: 'rgba(255,255,255,0.15)' },
      data: { relation: e.relation, weight: e.weight, members: e.members },
    }));
    return { nodes, edges };
  }

  const nodes: Node[] = [];
  const elkNodeMap = new Map<string, ElkNode>();

  function collectNodes(n: ElkNode) {
    elkNodeMap.set(n.id, n);
    if (n.children) {
      for (const child of n.children) {
        collectNodes(child);
      }
    }
  }
  collectNodes(layouted);

  for (const en of explorerNodes) {
    const elkN = elkNodeMap.get(en.id);
    const w = nodeKindToWidth(en.kind);
    const h = nodeKindToHeight(en.kind);
    const x = (elkN?.x ?? 0);
    const y = (elkN?.y ?? 0);

    const rawNode = nodeMap.get(en.id);
    nodes.push({
      id: en.id,
      type: en.kind === 'directory' ? 'directory' : en.kind === 'file' ? 'file' : 'entity',
      position: { x, y },
      data: { ...en, label: en.name, metadata: rawNode?.metadata ?? {} },
    });
  }

  const edges: Edge[] = explorerEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: { strokeWidth: 1.5, stroke: 'rgba(255,255,255,0.15)' },
    data: { relation: e.relation, weight: e.weight, members: e.members },
  }));

  return { nodes, edges };
}
