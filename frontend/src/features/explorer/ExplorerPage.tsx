import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useExplorerGraph, useViolations, useBusFactor, useGitDiff } from '@/lib/hooks';
import { useLayoutWorker } from './layout/useLayoutWorker';
import { ExplorerDirectoryNode } from './ExplorerDirectoryNode';
import { ExplorerFileNode } from './ExplorerFileNode';
import { ExplorerEntityNode } from './ExplorerEntityNode';
import { ExplorerToolbar } from './ExplorerToolbar';
import { DetailDrawer } from './DetailDrawer';
import { OverlayToolbar } from './overlays/OverlayToolbar';
import { BlastRadiusOverlay } from './overlays/BlastRadiusOverlay';
import { GovernanceOverlay } from './overlays/GovernanceOverlay';
import { OwnershipOverlay } from './overlays/OwnershipOverlay';
import { DiffOverlay } from './overlays/DiffOverlay';
import { RiskOverlay } from './overlays/RiskOverlay';
import { TourSystem, generateTours, type Tour } from './tours/TourSystem';
import { PersonaPresets, getPersonaConfig, type Persona } from './personas/PersonaPresets';
import { DomainClusters } from './clusters/DomainClusters';
import { initialOverlayState, type OverlayState } from './state/overlays';
import { useExplorerUrlState } from './state/urlState';
import type { ExplorerFilters, ExplorerNode, ExplorerEdge } from './types';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StatusStates';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon } from 'lucide-react';

// ─── Connected-component highlight via BFS ─────────────

function buildConnectedComponent(
  startId: string,
  allEdges: ExplorerEdge[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const e of allEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  const visitedNodes = new Set<string>();
  const queue = [startId];
  visitedNodes.add(startId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const neighbor of adj.get(cur) ?? []) {
      if (!visitedNodes.has(neighbor)) {
        visitedNodes.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const visitedEdges = new Set<string>();
  for (const e of allEdges) {
    if (visitedNodes.has(e.source) && visitedNodes.has(e.target)) {
      visitedEdges.add(e.id);
    }
  }

  return { nodeIds: visitedNodes, edgeIds: visitedEdges };
}

const nodeTypes = {
  directory: ExplorerDirectoryNode,
  file: ExplorerFileNode,
  entity: ExplorerEntityNode,
};

const defaultViewport = { x: 50, y: 50, zoom: 0.65 };

function ExplorerCanvas() {
  const { state: urlState, setSearchParam } = useExplorerUrlState();
  const { setCenter } = useReactFlow();

  const [filters, setFilters] = useState<ExplorerFilters>(() => ({
    language: urlState.language ?? undefined,
    kind: urlState.kind ?? undefined,
    depth: urlState.depth ?? undefined,
  }));
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(urlState.highlightedNode);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    return new Set(urlState.expanded ? urlState.expanded.split(',') : []);
  });
  const [rfNodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutPhase, setLayoutPhase] = useState<'idle' | 'coarse' | 'expanding'>('idle');

  // ─── Phase 3: Overlay state ──────────────────────────
  const [overlayData, setOverlayData] = useState<OverlayState>(() => {
    const initial = { ...initialOverlayState };
    if (urlState.overlay) {
      initial.active = urlState.overlay as any;
    }
    return initial;
  });

  // ─── Phase 4: Tour state ────────────────────────────
  const [tours, setTours] = useState<Tour[]>([]);
  const [activeTourId, setActiveTourId] = useState<string | null>(urlState.tour);
  const [tourStep, setTourStep] = useState(urlState.tourStep ?? 0);

  // ─── Phase 4: Persona state ─────────────────────────
  const [activePersona, setActivePersona] = useState<Persona | null>(urlState.persona as Persona | null);

  // ─── Phase 4: Cluster state ─────────────────────────
  const [showClusters, setShowClusters] = useState(false);

  // ─── DOM ref for overlays ───────────────────────────
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  // ─── Layout worker & abort controller ───────────────
  const { computeLayout } = useLayoutWorker();
  const layoutAbortControllerRef = useRef<AbortController | null>(null);

  const { data, isLoading, error } = useExplorerGraph(filters);
  const { data: violationsData } = useViolations();
  const { data: busFactorData } = useBusFactor();
  const { data: gitDiffData } = useGitDiff();

  const explorerNodeMap = useMemo(
    () => new Map((data?.nodes ?? []).map((n) => [n.id, n])),
    [data],
  );

  // Sync state to URL params
  useEffect(() => {
    setSearchParam('language', filters.language ?? null);
    setSearchParam('kind', filters.kind ?? null);
    setSearchParam('depth', filters.depth ?? null);
  }, [filters, setSearchParam]);

  useEffect(() => {
    setSearchParam('persona', activePersona);
  }, [activePersona, setSearchParam]);

  useEffect(() => {
    setSearchParam('tour', activeTourId);
    setSearchParam('tourStep', tourStep);
  }, [activeTourId, tourStep, setSearchParam]);

  useEffect(() => {
    setSearchParam('highlightedNode', highlightedNodeId);
  }, [highlightedNodeId, setSearchParam]);

  useEffect(() => {
    setSearchParam('overlay', overlayData.active);
  }, [overlayData.active, setSearchParam]);

  useEffect(() => {
    setSearchParam('expanded', expandedFiles.size > 0 ? Array.from(expandedFiles).join(',') : null);
  }, [expandedFiles, setSearchParam]);

  // Load selectedNode if URL specifies highlightedNode
  useEffect(() => {
    if (data && urlState.highlightedNode) {
      const node = data.nodes.find((n) => n.id === urlState.highlightedNode);
      if (node) {
        setSelectedNode(node);
      }
    }
  }, [data, urlState.highlightedNode]);

  // ─── Tour centering and auto-expansion ───────────────
  useEffect(() => {
    if (!activeTourId || !data) return;
    const activeTour = tours.find((t) => t.id === activeTourId);
    if (!activeTour) return;
    const step = activeTour.steps[tourStep];
    if (!step) return;

    const targetNode = data.nodes.find((n) => n.id === step.nodeId);
    if (!targetNode) return;

    let parentFileId: string | null = null;
    if (targetNode.kind !== 'directory' && targetNode.kind !== 'file') {
      const parentFile = data.nodes.find(
        (n) => n.kind === 'file' && n.file_path === targetNode.file_path,
      );
      if (parentFile) {
        parentFileId = parentFile.id;
      }
    }

    if (parentFileId && !expandedFiles.has(parentFileId)) {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        next.add(parentFileId!);
        return next;
      });
    }
  }, [activeTourId, tourStep, data, tours]);

  useEffect(() => {
    if (!activeTourId || !data) return;
    const activeTour = tours.find((t) => t.id === activeTourId);
    if (!activeTour) return;
    const step = activeTour.steps[tourStep];
    if (!step) return;

    const renderedNode = rfNodes.find((n) => n.id === step.nodeId);
    if (renderedNode) {
      const x = renderedNode.position.x + (renderedNode.width ?? 140) / 2;
      const y = renderedNode.position.y + (renderedNode.height ?? 40) / 2;
      setCenter(x, y, { zoom: 1.2, duration: 800 });
    }
  }, [activeTourId, tourStep, rfNodes, data, tours, setCenter]);

  // ─── Phase 4: Generate tours when data loads ─────────
  useEffect(() => {
    if (data) {
      setTours(generateTours(data));
    }
  }, [data]);

  // ─── Off-thread Layout calculation via Layout Worker ──
  useEffect(() => {
    if (!data) return;

    const personaConfig = getPersonaConfig(activePersona);
    const hiddenKinds = new Set(personaConfig.hiddenKinds);

    // Cancel prior layout runs if state changes rapidly
    if (layoutAbortControllerRef.current) {
      layoutAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    layoutAbortControllerRef.current = controller;

    setLayoutPhase(expandedFiles.size > 0 ? 'expanding' : 'coarse');

    let coarseNodes = data.nodes.filter(
      (n) => (n.kind === 'directory' || n.kind === 'file') && !hiddenKinds.has(n.kind),
    );

    if (activePersona === 'manager') {
      coarseNodes = data.nodes.filter((n) => n.kind === 'directory' || n.kind === 'file');
    }

    const visibleNodes = [...coarseNodes];

    // Compound layout child collection with Progressive Rendering Cap (Phase 5)
    const virtualEdges: ExplorerEdge[] = [];
    for (const fileId of expandedFiles) {
      const fileNode = explorerNodeMap.get(fileId);
      if (!fileNode) continue;

      const fileEntities = data.nodes.filter(
        (n) =>
          n.kind !== 'directory' &&
          n.kind !== 'file' &&
          n.file_path === fileNode.file_path &&
          !hiddenKinds.has(n.kind),
      );

      const ENTITY_CAP = 30;
      const entitiesToRender = fileEntities.slice(0, ENTITY_CAP);
      visibleNodes.push(...entitiesToRender);

      if (fileEntities.length > ENTITY_CAP) {
        const remaining = fileEntities.length - ENTITY_CAP;
        const moreId = `${fileId}:more`;
        visibleNodes.push({
          id: moreId,
          kind: 'external',
          language: fileNode.language,
          name: `+${remaining} more entities (use Search to find)`,
          qualified_name: `${fileNode.file_path}:more`,
          file_path: fileNode.file_path,
          parent_id: fileId,
          metadata: { isPlaceholder: true },
        });

        virtualEdges.push({
          id: `${fileId}->${moreId}`,
          source: fileId,
          target: moreId,
          relation: 'contains',
          weight: 1,
        });
      }
    }

    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const finalEdges = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .concat(virtualEdges);

    computeLayout(visibleNodes, finalEdges, {
      algorithm: 'layered',
      direction: 'DOWN',
      spacing: { nodeNode: 60, betweenLayers: 80 },
      compound: true,
    }, controller.signal)
      .then(({ nodes, edges }) => {
        // Inject active persona configurations on node options
        const nodesWithPersona = nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            personaConfig,
          },
        }));
        setNodes(nodesWithPersona);
        setEdges(edges);
        setLayoutPhase('idle');
      })
      .catch((err) => {
        if (err.message === 'Aborted') return;
        console.error('Layout compute error:', err);
        setLayoutPhase('idle');
      });

    return () => {
      controller.abort();
    };
  }, [data, expandedFiles, activePersona, explorerNodeMap, setNodes, setEdges, computeLayout]);

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
        setHighlightedNodeId((prev) => (prev === node.id ? null : node.id));
      }
    },
    [explorerNodeMap],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setHighlightedNodeId(null);
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    
    const activeEl = document.activeElement;
    if (!activeEl) return;
    
    const nodeEl = activeEl.closest('.react-flow__node');
    if (!nodeEl) return;
    
    const activeId = nodeEl.getAttribute('data-id');
    if (!activeId) return;
    
    const currentNode = rfNodes.find((n) => n.id === activeId);
    if (!currentNode) return;
    
    const currentPos = currentNode.position;
    
    let bestNode: Node | null = null;
    let minCost = Infinity;
    
    rfNodes.forEach((node) => {
      if (node.id === activeId) return;
      
      const dx = node.position.x - currentPos.x;
      const dy = node.position.y - currentPos.y;
      let cost = Infinity;
      
      if (event.key === 'ArrowRight' && dx > 0) {
        cost = dx + 2 * Math.abs(dy);
      } else if (event.key === 'ArrowLeft' && dx < 0) {
        cost = -dx + 2 * Math.abs(dy);
      } else if (event.key === 'ArrowDown' && dy > 0) {
        cost = dy + 2 * Math.abs(dx);
      } else if (event.key === 'ArrowUp' && dy < 0) {
        cost = -dy + 2 * Math.abs(dx);
      }
      
      if (cost < minCost) {
        minCost = cost;
        bestNode = node;
      }
    });
    
    if (bestNode) {
      event.preventDefault();
      const nextEl = flowWrapperRef.current?.querySelector<HTMLDivElement>(
        `[data-id="${(bestNode as Node).id}"]`
      );
      if (nextEl) {
        nextEl.focus();
        const en = explorerNodeMap.get((bestNode as Node).id);
        if (en) {
          setSelectedNode(en);
          setHighlightedNodeId(en.id);
        }
      }
    }
  }, [rfNodes, explorerNodeMap, setSelectedNode, setHighlightedNodeId]);

  const connectedEdges = useMemo(() => {
    if (!selectedNode || !data) return [];
    return data.edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id,
    );
  }, [selectedNode, data]);

  // ─── Highlight: connected-component BFS ──────────────
  const highlight = useMemo(() => {
    if (!highlightedNodeId || !data) return null;
    return buildConnectedComponent(highlightedNodeId, data.edges);
  }, [highlightedNodeId, data]);

  // ─── DOM-based highlight (bypasses ReactFlow state) ──
  useEffect(() => {
    const wrapper = flowWrapperRef.current;
    if (!wrapper) return;

    // Don't apply BFS highlight if an overlay is active
    if (overlayData.active) return;

    const raf = requestAnimationFrame(() => {
      const edgeEls = wrapper.querySelectorAll<SVGGElement>('.react-flow__edge');
      edgeEls.forEach((g) => {
        const edgeId = g.getAttribute('data-id') ?? '';
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;

        if (!highlight) {
          path.style.opacity = '';
          path.style.transition = '';
          return;
        }

        const isConnected = highlight.edgeIds.has(edgeId);
        path.style.opacity = isConnected ? '1' : '0.06';
        path.style.transition = 'opacity 200ms ease';
      });

      const nodeEls = wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node');
      nodeEls.forEach((div) => {
        const nodeId = div.getAttribute('data-id') ?? '';

        if (!highlight) {
          div.style.opacity = '';
          div.style.transition = '';
          div.style.boxShadow = '';
          return;
        }

        const isConnected = highlight.nodeIds.has(nodeId);
        div.style.opacity = isConnected ? '1' : '0.12';
        div.style.transition = 'opacity 200ms ease';

        if (nodeId === highlightedNodeId) {
          div.style.boxShadow = '0 0 0 2px #818cf8, 0 0 20px rgba(129,140,248,0.35)';
        } else {
          div.style.boxShadow = '';
        }
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [highlight, highlightedNodeId, rfNodes, rfEdges, overlayData.active]);

  // ─── Overlay change handler ──────────────────────────
  const handleOverlayChange = useCallback((state: OverlayState) => {
    setOverlayData(state);
  }, []);

  // ─── Tour handlers ──────────────────────────────────
  const handleTourEnd = useCallback(() => {
    setActiveTourId(null);
    setTourStep(0);
  }, []);

  // ─── Cluster handler ────────────────────────────────
  const handleClusterSelect = useCallback((_clusterId: string) => {
    // Future: filter to cluster
  }, []);

  // ─── Render ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <LoadingState />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <ErrorState message={error.message} />
      </div>
    );
  }
  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <EmptyState message="No graph data available. Upload a repository first." />
      </div>
    );
  }

  const dirCount = data.nodes.filter((n) => n.kind === 'directory').length;
  const fileCount = data.nodes.filter((n) => n.kind === 'file').length;
  const entityCount = data.nodes.length - dirCount - fileCount;

  return (
    <div className="relative h-full bg-black">
      <ExplorerToolbar
        filters={filters}
        onFiltersChange={setFilters}
        repository={data.repository.name}
        languages={data.capabilities.languages}
        nodeCount={rfNodes.length}
        edgeCount={rfEdges.length}
      />

      {/* Phase 4: Persona presets */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
        <PersonaPresets activePersona={activePersona} onPersonaChange={setActivePersona} />
      </div>

      {/* Phase 4: Tour launcher */}
      {tours.length > 0 && !activeTourId && (
        <div className="absolute top-3 right-4 z-30">
          <div className="flex items-center gap-1">
            {tours.map((tour) => (
              <button
                key={tour.id}
                onClick={() => {
                  setActiveTourId(tour.id);
                  setTourStep(0);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:text-white/80 bg-synapse-panel/90 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all"
                title={tour.description}
              >
                <MapIcon className="w-3 h-3" />
                {tour.name}
              </button>
            ))}
            <button
              onClick={() => setShowClusters(!showClusters)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                showClusters
                  ? 'text-neon-indigo bg-neon-indigo/10 border border-neon-indigo/30'
                  : 'text-white/50 hover:text-white/80 bg-synapse-panel/90 border border-white/10 hover:border-white/20'
              } backdrop-blur-md`}
            >
              Clusters
            </button>
          </div>
        </div>
      )}

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

      {highlight && !overlayData.active && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-neon-indigo/10 border border-neon-indigo/20 backdrop-blur-md">
            <p className="text-[10px] text-neon-indigo/80">
              {highlight.edgeIds.size.toLocaleString()} connected edges · {highlight.nodeIds.size.toLocaleString()} nodes lit
              <span className="mx-1.5 text-neon-indigo/30">·</span>
              click pane to clear
            </p>
          </div>
        </div>
      )}

      {/* Phase 3: Overlay toolbar */}
      <OverlayToolbar
        data={data}
        violations={violationsData?.violations ?? []}
        busFactor={busFactorData?.analysis ?? {}}
        gitDiff={gitDiffData?.changed_files}
        activeOverlay={overlayData}
        onOverlayChange={handleOverlayChange}
      />

      <div ref={flowWrapperRef} className="h-full w-full">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onKeyDown={onKeyDown}
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
      </div>

      {/* Phase 3: Overlay effects (side-effect components) */}
      {overlayData.active === 'blast-radius' &&
        overlayData.data?.kind === 'blast-radius' && (
          <BlastRadiusOverlay
            targetId={overlayData.data.targetId}
            affectedNodeIds={overlayData.data.affectedNodeIds}
            containerRef={flowWrapperRef}
          />
        )}
      {overlayData.active === 'governance' &&
        overlayData.data?.kind === 'governance' && (
          <GovernanceOverlay
            violations={overlayData.data.violations}
            containerRef={flowWrapperRef}
          />
        )}
      {overlayData.active === 'ownership' &&
        overlayData.data?.kind === 'ownership' && (
          <OwnershipOverlay
            lowBusFactorNodes={overlayData.data.lowBusFactorNodes}
            busFactorData={overlayData.data.busFactorData}
            containerRef={flowWrapperRef}
          />
        )}
      {overlayData.active === 'diff' &&
        overlayData.data?.kind === 'diff' && (
          <DiffOverlay
            changedFileIds={overlayData.data.changedFileIds}
            affectedNodeIds={overlayData.data.affectedNodeIds}
            containerRef={flowWrapperRef}
          />
        )}
      {overlayData.active === 'risk' &&
        overlayData.data?.kind === 'risk' && (
          <RiskOverlay
            riskNodeIds={overlayData.data.riskNodeIds}
            riskLevels={overlayData.data.riskLevels}
            containerRef={flowWrapperRef}
          />
        )}

      {/* Phase 4: Domain clusters */}
      {showClusters && (
        <DomainClusters
          data={data}
          containerRef={flowWrapperRef}
          onClusterSelect={handleClusterSelect}
        />
      )}

      {/* Phase 4: Tour system */}
      <TourSystem
        tours={tours}
        activeTourId={activeTourId}
        currentStep={tourStep}
        onStepChange={setTourStep}
        onTourEnd={handleTourEnd}
        containerRef={flowWrapperRef}
      />

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
