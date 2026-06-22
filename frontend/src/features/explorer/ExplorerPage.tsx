import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useExplorerGraph } from '@/lib/hooks';
import { computeCoarseLayout } from './layout';
import { ExplorerDirectoryNode } from './ExplorerDirectoryNode';
import { ExplorerFileNode } from './ExplorerFileNode';
import { ExplorerEntityNode } from './ExplorerEntityNode';
import { ExplorerToolbar } from './ExplorerToolbar';
import { DetailDrawer } from './DetailDrawer';
import type { ExplorerFilters, ExplorerNode, ExplorerEdge } from './types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StatusStates';
import { motion, AnimatePresence } from 'framer-motion';

const nodeTypes = {
  directory: ExplorerDirectoryNode,
  file: ExplorerFileNode,
  entity: ExplorerEntityNode,
};

const defaultViewport = { x: 50, y: 50, zoom: 0.65 };

function ExplorerCanvas() {
  const [filters, setFilters] = useState<ExplorerFilters>({});
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [rfNodes, setNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState([]);
  const [layoutPhase, setLayoutPhase] = useState<'idle' | 'coarse' | 'expanding'>('idle');
  const { fitView } = useReactFlow();

  const { data, isLoading, error } = useExplorerGraph(filters);

  const explorerNodeMap = useMemo(
    () => new Map((data?.nodes ?? []).map((n) => [n.id, n])),
    [data],
  );

  // ─── Coarse layout (dirs + files only) ─────────────
  useEffect(() => {
    if (!data) return;
    setLayoutPhase('coarse');

    const coarseNodes = data.nodes.filter((n) => n.kind === 'directory' || n.kind === 'file');
    const coarseIds = new Set(coarseNodes.map((n) => n.id));
    const coarseEdges = data.edges.filter(
      (e) => coarseIds.has(e.source) && coarseIds.has(e.target),
    );

    computeCoarseLayout(coarseNodes, coarseEdges).then(({ nodes, edges }) => {
      setNodes(nodes);
      setEdges(edges);
      setLayoutPhase('idle');
    });
  }, [data, setNodes, setEdges]);

  // ─── Expanded layout (dirs + files + entity children) ──
  useEffect(() => {
    if (!data || expandedFiles.size === 0) return;
    setLayoutPhase('expanding');

    const visibleNodes: ExplorerNode[] = [];
    // Always show dirs and files
    for (const n of data.nodes) {
      if (n.kind === 'directory' || n.kind === 'file') {
        visibleNodes.push(n);
      }
    }
    // Add entities for expanded files
    for (const fileId of expandedFiles) {
      const fileNode = explorerNodeMap.get(fileId);
      if (!fileNode) continue;
      for (const n of data.nodes) {
        if (n.kind !== 'directory' && n.kind !== 'file' && n.file_path === fileNode.file_path) {
          visibleNodes.push(n);
        }
      }
    }

    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = data.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );

    computeCoarseLayout(visibleNodes, visibleEdges).then(({ nodes, edges }) => {
      setNodes(nodes);
      setEdges(edges);
      setLayoutPhase('idle');
    });
  }, [data, expandedFiles, explorerNodeMap, setNodes, setEdges]);

  // ─── Interactions ──────────────────────────────────
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const en = explorerNodeMap.get(node.id);
      if (!en) return;

      if (en.kind === 'file') {
        setExpandedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
      } else {
        setSelectedNode(en);
      }
    },
    [explorerNodeMap],
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const connectedEdges = useMemo(() => {
    if (!selectedNode || !data) return [];
    return data.edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id,
    );
  }, [selectedNode, data]);

  // ─── Render ────────────────────────────────────────
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!data || data.nodes.length === 0) {
    return <EmptyState message="No graph data available. Upload a repository first." />;
  }

  const dirCount = data.nodes.filter((n) => n.kind === 'directory').length;
  const fileCount = data.nodes.filter((n) => n.kind === 'file').length;
  const entityCount = data.nodes.length - dirCount - fileCount;

  return (
    <div className="relative h-[calc(100vh-56px)] bg-black">
      <ExplorerToolbar
        filters={filters}
        onFiltersChange={setFilters}
        repository={data.repository.name}
        languages={data.capabilities.languages}
        nodeCount={rfNodes.length}
        edgeCount={rfEdges.length}
      />

      <AnimatePresence>
        {layoutPhase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none"
          >
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-synapse-panel/95 border border-white/10 shadow-xl">
              <div className="w-4 h-4 border-2 border-neon-emerald/40 border-t-neon-emerald rounded-full animate-spin" />
              <span className="text-[11px] text-white/60">
                {layoutPhase === 'expanding' ? 'Expanding entities...' : 'Computing layout...'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!expandedFiles.size && rfNodes.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-synapse-panel/80 border border-white/[0.06] backdrop-blur-md">
            <p className="text-[10px] text-white/30">
              Click a file to expand its {entityCount.toLocaleString()} entities
              <span className="mx-1.5 text-white/15">·</span>
              {dirCount} dirs · {fileCount} files
            </p>
          </div>
        </div>
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
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        className="bg-black"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.03)" />
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
              default: return 'rgba(255,255,255,0.15)';
            }
          }}
          maskColor="rgba(0,0,0,0.8)"
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

export default function ExplorerPage() {
  return (
    <ReactFlowProvider>
      <ExplorerCanvas />
    </ReactFlowProvider>
  );
}
