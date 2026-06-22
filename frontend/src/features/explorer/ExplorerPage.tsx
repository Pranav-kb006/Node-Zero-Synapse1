import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useExplorerGraph } from '@/lib/hooks';
import { computeLayout } from './layout';
import { ExplorerDirectoryNode } from './ExplorerDirectoryNode';
import { ExplorerFileNode } from './ExplorerFileNode';
import { ExplorerEntityNode } from './ExplorerEntityNode';
import { ExplorerToolbar } from './ExplorerToolbar';
import { DetailDrawer } from './DetailDrawer';
import type { ExplorerFilters, ExplorerNode, ExplorerEdge } from './types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StatusStates';
import { motion } from 'framer-motion';

const nodeTypes = {
  directory: ExplorerDirectoryNode,
  file: ExplorerFileNode,
  entity: ExplorerEntityNode,
};

const defaultViewport = { x: 0, y: 0, zoom: 0.6 };

export default function ExplorerPage() {
  const [filters, setFilters] = useState<ExplorerFilters>({});
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [rfNodes, setNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState([]);
  const [layoutReady, setLayoutReady] = useState(false);

  const { data, isLoading, error } = useExplorerGraph(filters);

  const explorerNodeMap = useMemo(
    () => new Map((data?.nodes ?? []).map((n) => [n.id, n])),
    [data],
  );

  const explorerEdgeMap = useMemo(
    () => new Map((data?.edges ?? []).map((e) => [e.id, e])),
    [data],
  );

  // Run ELK layout when data changes
  useEffect(() => {
    if (!data) return;
    setLayoutReady(false);

    computeLayout(data.nodes, data.edges, { width: 1200, height: 800 }).then(
      ({ nodes: laidNodes, edges: laidEdges }) => {
        setNodes(laidNodes);
        setEdges(laidEdges);
        setLayoutReady(true);
      },
    );
  }, [data, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const en = explorerNodeMap.get(node.id);
      setSelectedNode(en ?? null);
    },
    [explorerNodeMap],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return (data?.edges ?? []).filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id,
    );
  }, [selectedNode, data]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!data || data.nodes.length === 0) return <EmptyState message="No graph data available. Upload a repository first." />;

  return (
    <div className="relative h-[calc(100vh-56px)] bg-black">
      <ExplorerToolbar
        filters={filters}
        onFiltersChange={setFilters}
        repository={data.repository.name}
        languages={data.capabilities.languages}
        nodeCount={data.nodes.length}
        edgeCount={data.edges.length}
      />

      {!layoutReady && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-synapse-panel/90 border border-white/10">
            <div className="w-4 h-4 border-2 border-neon-emerald/40 border-t-neon-emerald rounded-full animate-spin" />
            <span className="text-[11px] text-white/60">Computing layout...</span>
          </div>
        </motion.div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        fitView
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        className="bg-black"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
        <Controls
          showInteractive={false}
          className="!bg-synapse-panel/90 !border-white/10 !backdrop-blur-md [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-white/50 [&>button:hover]:!bg-white/5"
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            switch (n.type) {
              case 'directory': return '#34d399';
              case 'file': return '#818cf8';
              default: return '#ffffff20';
            }
          }}
          maskColor="rgba(0,0,0,0.75)"
          className="!bg-synapse-panel/90 !border-white/10"
        />
      </ReactFlow>

      <DetailDrawer
        node={selectedNode}
        edges={connectedEdges}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
