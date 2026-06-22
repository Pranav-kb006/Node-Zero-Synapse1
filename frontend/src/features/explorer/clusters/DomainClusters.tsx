import { useMemo } from 'react';
import Graph from 'graphology';
import communities from 'graphology-communities-louvain';
import type { ExplorerGraphResponse } from '../types';

const CLUSTER_PALETTE = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
  '#e879f9', // fuchsia
  '#facc15', // yellow
  '#2dd4bf', // teal
  '#f87171', // red
];

interface ClusterInfo {
  nodes: string[];
  color: string;
  centroid: { x: number; y: number };
}

interface DomainClustersProps {
  data: ExplorerGraphResponse;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClusterSelect: (clusterId: string) => void;
}

export function computeClusters(
  data: ExplorerGraphResponse,
): Map<string, { nodes: string[]; color: string }> {
  const graph = new Graph({ multi: true });

  for (const node of data.nodes) {
    graph.addNode(node.id, { kind: node.kind, label: node.name });
  }

  for (const edge of data.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.addEdge(edge.source, edge.target, {
        relation: edge.relation,
        weight: edge.weight,
      });
    }
  }

  const communityMap = communities(graph, {
    resolution: 1,
    randomWalk: true,
  });

  const communityGroups = new Map<string, string[]>();
  for (const [nodeId, communityId] of Object.entries(communityMap)) {
    const key = String(communityId);
    if (!communityGroups.has(key)) communityGroups.set(key, []);
    communityGroups.get(key)!.push(nodeId);
  }

  const result = new Map<string, { nodes: string[]; color: string }>();
  let idx = 0;
  for (const [communityId, nodeIds] of communityGroups) {
    result.set(communityId, {
      nodes: nodeIds,
      color: CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length],
    });
    idx++;
  }

  return result;
}

function computeCentroids(
  clusterMap: Map<string, { nodes: string[]; color: string }>,
  containerRef: React.RefObject<HTMLDivElement | null>,
): Map<string, ClusterInfo> {
  const result = new Map<string, ClusterInfo>();
  const wrapper = containerRef.current;

  for (const [clusterId, info] of clusterMap) {
    let cx = 0;
    let cy = 0;
    let count = 0;

    if (wrapper) {
      for (const nodeId of info.nodes) {
        const el = wrapper.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${nodeId}"]`,
        );
        if (el) {
          const rect = el.getBoundingClientRect();
          cx += rect.left + rect.width / 2;
          cy += rect.top + rect.height / 2;
          count++;
        }
      }
    }

    result.set(clusterId, {
      nodes: info.nodes,
      color: info.color,
      centroid: count > 0
        ? { x: cx / count, y: cy / count }
        : { x: 0, y: 0 },
    });
  }

  return result;
}

export function DomainClusters({
  data,
  containerRef,
  onClusterSelect,
}: DomainClustersProps) {
  const clusterMap = useMemo(() => computeClusters(data), [data]);

  const clusters = useMemo(
    () => computeCentroids(clusterMap, containerRef),
    [clusterMap, containerRef],
  );

  if (clusters.size <= 1) return null;

  const entries = Array.from(clusters.entries());

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {entries.map(([clusterId, info]) => (
        <button
          key={clusterId}
          onClick={() => onClusterSelect(clusterId)}
          className="absolute pointer-events-auto"
          style={{
            left: info.centroid.x,
            top: info.centroid.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border backdrop-blur-md shadow-lg text-[10px] font-medium transition-all hover:scale-105"
            style={{
              backgroundColor: `${info.color}20`,
              borderColor: `${info.color}40`,
              color: info.color,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: info.color }}
            />
            <span>Community {clusterId}</span>
            <span className="opacity-50">({info.nodes.length})</span>
          </div>
        </button>
      ))}
    </div>
  );
}
