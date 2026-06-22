import ELK from 'elkjs/lib/elk.bundled';
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api';
import type { ExplorerNode, ExplorerEdge } from './types';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

// ─── Node sizing ──────────────────────────────────────

function nodeWidth(kind: string): number {
  switch (kind) {
    case 'directory': return 260;
    case 'file': return 200;
    case 'class':
    case 'interface':
    case 'enum':
    case 'struct': return 180;
    default: return 140;
  }
}

function nodeHeight(kind: string): number {
  switch (kind) {
    case 'directory': return 72;
    case 'file': return 56;
    default: return 40;
  }
}

// ─── Public API ───────────────────────────────────────

/**
 * Layout the coarse view: directories + files only.
 * Entities are hidden until a file is clicked.
 */
/**
 * Layout whatever nodes are passed — no filtering.
 * The caller decides what to include (dirs-only, dirs+files, or expanded).
 */
export async function computeCoarseLayout(
  explorerNodes: ExplorerNode[],
  explorerEdges: ExplorerEdge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  return computeLayout(explorerNodes, explorerEdges, {
    algorithm: 'layered',
    direction: 'DOWN',
    spacing: { nodeNode: 60, betweenLayers: 80 },
    compound: true,
  });
}

/**
 * Layout entities inside a single file's context.
 * Returns nodes positioned around the file node.
 */
export async function computeEntityLayout(
  fileNode: ExplorerNode,
  entityNodes: ExplorerNode[],
  entityEdges: ExplorerEdge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (entityNodes.length === 0) return { nodes: [], edges: [] };

  return computeLayout(entityNodes, entityEdges, {
    algorithm: 'layered',
    direction: 'DOWN',
    spacing: { nodeNode: 30, betweenLayers: 50 },
    compound: false,
  });
}

// ─── Core layout engine ──────────────────────────────

interface LayoutConfig {
  algorithm: 'layered' | 'stress' | 'mrtree';
  direction: 'DOWN' | 'LEFT' | 'RIGHT' | 'UP';
  spacing: { nodeNode: number; betweenLayers: number };
  compound: boolean;
}

async function computeLayout(
  explorerNodes: ExplorerNode[],
  explorerEdges: ExplorerEdge[],
  config: LayoutConfig,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (explorerNodes.length === 0) return { nodes: [], edges: [] };

  const nodeMap = new Map(explorerNodes.map((n) => [n.id, n]));

  // Build ELK nodes with compound hierarchy
  const elkNodes = buildElkNodes(explorerNodes, config);

  // Build ELK edges (only between visible nodes)
  const visibleIds = new Set(explorerNodes.map((n) => n.id));
  const elkEdges: ElkExtendedEdge[] = explorerEdges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    }));

  const layoutOptions: Record<string, string> = {
    'elk.algorithm': config.algorithm,
    'elk.direction': config.direction,
    'elk.spacing.nodeNode': String(config.spacing.nodeNode),
    'elk.spacing.nodeNodeBetweenLayers': String(config.spacing.betweenLayers),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(config.spacing.betweenLayers),
    'elk.edgeRouting': 'orthogonal',
    'elk.layered.edgeRouting': 'ORTHOGONAL',
    'elk.layered.placement.straightness': 'STRAIGHTNESS',
    'elk.layered.spacing.baseValue': String(config.spacing.nodeNode),
    'elk.separateConnectedComponents': 'false',
  };

  if (config.compound) {
    layoutOptions['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN';
    layoutOptions['elk containment.insideEdges.toLayout'] = 'true';
  }

  const graph: ElkNode = {
    id: 'root',
    children: elkNodes,
    edges: elkEdges,
  };

  let layouted: ElkNode;
  try {
    layouted = await elk.layout(graph, {
      layoutOptions,
      logging: false,
      measureNodeHierarchy: true,
    });
  } catch (err) {
    console.warn('ELK layout failed, using grid fallback', err);
    return gridFallback(explorerNodes, explorerEdges);
  }

  // Collect all positioned nodes (including nested children)
  const elkPosMap = new Map<string, ElkNode>();
  function walk(n: ElkNode) {
    elkPosMap.set(n.id, n);
    n.children?.forEach(walk);
  }
  walk(layouted);

  // Convert to React Flow nodes
  const rfNodes: Node[] = explorerNodes.map((en) => {
    const elkN = elkPosMap.get(en.id);
    const w = nodeWidth(en.kind);
    const h = nodeHeight(en.kind);
    const x = elkN?.x ?? 0;
    const y = elkN?.y ?? 0;
    const rawNode = nodeMap.get(en.id);

    return {
      id: en.id,
      type: en.kind === 'directory' ? 'directory' : en.kind === 'file' ? 'file' : 'entity',
      position: { x, y },
      data: { ...en, label: en.name, metadata: rawNode?.metadata ?? {} },
    };
  });

  // Convert to React Flow edges
  const rfEdges: Edge[] = explorerEdges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: edgeStyle(e.relation),
      data: { relation: e.relation, weight: e.weight, members: e.members },
    }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ─── Helpers ──────────────────────────────────────────

function buildElkNodes(
  explorerNodes: ExplorerNode[],
  config: LayoutConfig,
): ElkNode[] {
  // Group files by directory for compound nodes
  const dirChildren = new Map<string, ExplorerNode[]>();
  const topLevel: ExplorerNode[] = [];

  for (const n of explorerNodes) {
    if (n.kind === 'directory') {
      topLevel.push(n);
    } else if (n.kind === 'file') {
      const dirId = n.parent_id ?? 'root';
      if (!dirChildren.has(dirId)) dirChildren.set(dirId, []);
      dirChildren.get(dirId)!.push(n);
    } else {
      topLevel.push(n);
    }
  }

  const elkNodes: ElkNode[] = [];

  for (const n of topLevel) {
    if (n.kind === 'directory' && config.compound) {
      const children = dirChildren.get(n.id) ?? [];
      elkNodes.push({
        id: n.id,
        width: nodeWidth(n.kind),
        height: nodeHeight(n.kind),
        children: children.map((c) => ({
          id: c.id,
          width: nodeWidth(c.kind),
          height: nodeHeight(c.kind),
        })),
      });
    } else {
      elkNodes.push({
        id: n.id,
        width: nodeWidth(n.kind),
        height: nodeHeight(n.kind),
      });
    }
  }

  // Add any file nodes whose parent directory wasn't in the node list
  for (const n of explorerNodes) {
    if (n.kind === 'file' && !elkNodes.some((ek) => ek.id === n.id)) {
      elkNodes.push({
        id: n.id,
        width: nodeWidth(n.kind),
        height: nodeHeight(n.kind),
      });
    }
  }

  return elkNodes;
}

function edgeStyle(relation: string): React.CSSProperties {
  switch (relation) {
    case 'contains':
      return { stroke: '#475569', strokeWidth: 1.5, strokeLinecap: 'round' };
    case 'calls':
      return { stroke: '#34d399', strokeWidth: 1.5, strokeLinecap: 'round' };
    case 'imports':
    case 'imports_from':
      return { stroke: '#818cf8', strokeWidth: 1.5, strokeLinecap: 'round' };
    case 'inherits':
    case 'implements':
      return { stroke: '#fbbf24', strokeWidth: 2.5, strokeLinecap: 'round' };
    case 'decorates':
      return { stroke: '#fb7185', strokeWidth: 1.5, strokeLinecap: 'round' };
    default:
      return { stroke: '#64748b', strokeWidth: 1.5, strokeLinecap: 'round' };
  }
}

function gridFallback(
  explorerNodes: ExplorerNode[],
  explorerEdges: ExplorerEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const cols = Math.ceil(Math.sqrt(explorerNodes.length));
  const nodes: Node[] = explorerNodes.map((n, i) => ({
    id: n.id,
    type: n.kind === 'directory' ? 'directory' : n.kind === 'file' ? 'file' : 'entity',
    position: {
      x: (i % cols) * 280,
      y: Math.floor(i / cols) * 100,
    },
    data: { ...n, label: n.name },
  }));
  const edges: Edge[] = explorerEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    style: edgeStyle(e.relation),
    data: { relation: e.relation, weight: e.weight, members: e.members },
  }));
  return { nodes, edges };
}
