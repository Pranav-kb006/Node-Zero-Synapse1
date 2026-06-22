import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Map as MapIcon } from 'lucide-react';
import type { ExplorerGraphResponse, ExplorerNode, ExplorerEdge } from '../types';

export interface TourStep {
  nodeId: string;
  label: string;
  description: string;
  fitViewOptions?: { zoom: number; padding: number };
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
}

interface TourSystemProps {
  tours: Tour[];
  activeTourId: string | null;
  currentStep: number;
  onStepChange: (step: number) => void;
  onTourEnd: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function TourSystem({
  tours,
  activeTourId,
  currentStep,
  onStepChange,
  onTourEnd,
  containerRef,
}: TourSystemProps) {
  const activeTour = tours.find((t) => t.id === activeTourId);

  const focusNode = useCallback(
    (nodeId: string) => {
      const wrapper = containerRef.current;
      if (!wrapper) return;

      const nodeEl = wrapper.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${nodeId}"]`,
      );
      if (!nodeEl) return;

      nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      nodeEl.style.boxShadow = '0 0 0 3px #818cf8, 0 0 28px rgba(129,140,248,0.45)';
      nodeEl.style.transition = 'box-shadow 400ms ease';

      const timer = setTimeout(() => {
        nodeEl.style.boxShadow = '0 0 0 2px #818cf8, 0 0 16px rgba(129,140,248,0.25)';
        nodeEl.style.transition = 'box-shadow 800ms ease-in-out';
      }, 600);

      return () => clearTimeout(timer);
    },
    [containerRef],
  );

  useEffect(() => {
    if (!activeTour) return;
    const step = activeTour.steps[currentStep];
    if (step) {
      const cleanup = focusNode(step.nodeId);
      return () => cleanup?.();
    }
  }, [activeTour, currentStep, focusNode]);

  useEffect(() => {
    if (!activeTour) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentStep < activeTour!.steps.length - 1) {
          onStepChange(currentStep + 1);
        } else {
          onTourEnd();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 0) {
          onStepChange(currentStep - 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onTourEnd();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTour, currentStep, onStepChange, onTourEnd]);

  if (!activeTour) return null;

  const step = activeTour.steps[currentStep];
  if (!step) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === activeTour.steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
      >
        <div className="bg-synapse-panel/95 backdrop-blur-md rounded-xl border border-white/10 p-3 shadow-2xl max-w-lg w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (!isFirst) onStepChange(currentStep - 1);
              }}
              disabled={isFirst}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MapIcon className="w-3 h-3 text-neon-indigo/60 shrink-0" />
                <span className="text-[10px] text-white/30 font-mono">
                  {currentStep + 1}/{activeTour.steps.length}
                </span>
                <span className="text-[11px] text-white/70 font-medium truncate">
                  {step.label}
                </span>
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed line-clamp-2">
                {step.description}
              </p>
            </div>

            <button
              onClick={() => {
                if (isLast) {
                  onTourEnd();
                } else {
                  onStepChange(currentStep + 1);
                }
              }}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
            >
              {isLast ? (
                <X className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-0.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-neon-indigo/50"
              initial={false}
              animate={{
                width: `${((currentStep + 1) / activeTour.steps.length) * 100}%`,
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Tour Generation ───────────────────────────────────

const RISK_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function findLongestChain(
  nodes: ExplorerNode[],
  edges: ExplorerEdge[],
): ExplorerNode[] {
  const callEdges = edges.filter(
    (e) => e.relation === 'calls' || e.relation === 'inherits' || e.relation === 'implements',
  );

  const adj = new Map<string, string[]>();
  for (const e of callEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let longest: ExplorerNode[] = [];

  function dfs(id: string, path: ExplorerNode[]) {
    const neighbors = adj.get(id) ?? [];
    if (neighbors.length === 0 && path.length > longest.length) {
      longest = [...path];
    }
    for (const next of neighbors) {
      if (!path.some((n) => n.id === next)) {
        const node = nodeMap.get(next);
        if (node) dfs(next, [...path, node]);
      }
    }
  }

  for (const n of nodes) {
    dfs(n.id, [n]);
  }

  return longest;
}

function findMostImportedModule(
  nodes: ExplorerNode[],
  edges: ExplorerEdge[],
): ExplorerNode | null {
  const importEdges = edges.filter(
    (e) => e.relation === 'imports' || e.relation === 'imports_from',
  );
  const incomingCount = new Map<string, number>();
  for (const e of importEdges) {
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  }

  let best: ExplorerNode | null = null;
  let bestCount = 0;
  for (const [id, count] of incomingCount) {
    if (count > bestCount) {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        best = node;
        bestCount = count;
      }
    }
  }
  return best;
}

function traceImportDeps(
  startNode: ExplorerNode,
  nodes: ExplorerNode[],
  edges: ExplorerEdge[],
  maxSteps = 8,
): ExplorerNode[] {
  const importEdges = edges.filter(
    (e) => e.relation === 'imports' || e.relation === 'imports_from',
  );

  const adj = new Map<string, string[]>();
  for (const e of importEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: ExplorerNode[] = [startNode];
  visited.add(startNode.id);

  let frontier = [startNode.id];
  for (let i = 0; i < maxSteps && frontier.length > 0; i++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          const node = nodeMap.get(neighbor);
          if (node) {
            result.push(node);
            next.push(neighbor);
          }
        }
      }
    }
    frontier = next;
  }

  return result;
}

function findRiskNodes(
  nodes: ExplorerNode[],
): ExplorerNode[] {
  return nodes
    .filter((n) => n.risk?.level === 'HIGH' || n.risk?.level === 'CRITICAL')
    .sort((a, b) => {
      const aOrder = RISK_ORDER[a.risk?.level ?? 'LOW'] ?? 3;
      const bOrder = RISK_ORDER[b.risk?.level ?? 'LOW'] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aCx = a.complexity?.cyclomatic ?? 0;
      const bCx = b.complexity?.cyclomatic ?? 0;
      return bCx - aCx;
    });
}

export function generateTours(data: ExplorerGraphResponse): Tour[] {
  const { nodes, edges } = data;
  const tours: Tour[] = [];

  // Tour 1: Critical Path
  const chain = findLongestChain(nodes, edges);
  if (chain.length >= 2) {
    tours.push({
      id: 'critical-path',
      name: 'Critical Path',
      description: `Walk through the longest call/inheritance chain (${chain.length} nodes)`,
      steps: chain.map((n) => ({
        nodeId: n.id,
        label: n.name,
        description: `${n.kind} in ${n.file_path}`,
        fitViewOptions: { zoom: 0.8, padding: 0.3 },
      })),
    });
  }

  // Tour 2: Import Graph
  const mostImported = findMostImportedModule(nodes, edges);
  if (mostImported) {
    const importPath = traceImportDeps(mostImported, nodes, edges);
    tours.push({
      id: 'import-graph',
      name: 'Import Graph',
      description: `Tracing dependencies from ${mostImported.name} (${importPath.length} modules)`,
      steps: importPath.map((n) => ({
        nodeId: n.id,
        label: n.name,
        description: `${n.kind} — ${n.qualified_name}`,
        fitViewOptions: { zoom: 0.85, padding: 0.3 },
      })),
    });
  }

  // Tour 3: Risk Tour
  const riskNodes = findRiskNodes(nodes);
  if (riskNodes.length > 0) {
    tours.push({
      id: 'risk-tour',
      name: 'Risk Tour',
      description: `Visit ${riskNodes.length} HIGH/CRITICAL risk nodes sorted by complexity`,
      steps: riskNodes.map((n) => ({
        nodeId: n.id,
        label: n.name,
        description: `${n.risk?.level} risk · cx: ${n.complexity?.cyclomatic ?? 0} · ${n.file_path}`,
        fitViewOptions: { zoom: 0.9, padding: 0.3 },
      })),
    });
  }

  return tours;
}
