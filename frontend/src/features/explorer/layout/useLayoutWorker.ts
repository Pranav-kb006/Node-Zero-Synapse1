import { useState, useRef, useCallback, useEffect } from 'react';
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api';
import type { ExplorerNode, ExplorerEdge } from '../types';
import type { Node, Edge } from '@xyflow/react';
import { nodeWidth, nodeHeight, edgeStyle } from './layoutWorkerHelpers';

const WORKER_TIMEOUT_MS = 30_000;


interface LayoutOptions {
  algorithm: 'layered' | 'stress' | 'mrtree';
  direction: 'DOWN' | 'LEFT' | 'RIGHT' | 'UP';
  spacing: { nodeNode: number; betweenLayers: number };
  compound: boolean;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

interface PendingRequest {
  resolve: (result: ElkNode) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useLayoutWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const requestIdRef = useRef(0);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });

      worker.onmessage = (e: MessageEvent) => {
        const { requestId, result, error: errMsg } = e.data;
        const pending = pendingRef.current.get(requestId);
        if (!pending) return;

        clearTimeout(pending.timer);
        pendingRef.current.delete(requestId);

        if (errMsg) {
          pending.reject(new Error(errMsg));
        } else {
          pending.resolve(result as ElkNode);
        }
      };

      worker.onerror = (e) => {
        console.warn('Layout worker error:', e.message);
        setError(new Error(e.message));
      };

      workerRef.current = worker;
    } catch {
      console.warn('Failed to create layout worker, will use main-thread fallback');
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const [, pending] of pendingRef.current) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Worker terminated'));
      }
      pendingRef.current.clear();
    };
  }, []);

  const computeLayout = useCallback(
    async (
      explorerNodes: ExplorerNode[],
      explorerEdges: ExplorerEdge[],
      options: LayoutOptions,
      signal?: AbortSignal,
    ): Promise<LayoutResult> => {
      setError(null);

      const nodeMap = new Map(explorerNodes.map((n) => [n.id, n]));
      const visibleIds = new Set(explorerNodes.map((n) => n.id));

      const elkNodes = buildElkNodes(explorerNodes, options.compound);
      const elkEdges: ElkExtendedEdge[] = explorerEdges
        .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        }));

      const layoutOptions: Record<string, string> = {
        'elk.algorithm': options.algorithm,
        'elk.direction': options.direction,
        'elk.spacing.nodeNode': String(options.spacing.nodeNode),
        'elk.spacing.nodeNodeBetweenLayers': String(options.spacing.betweenLayers),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(options.spacing.betweenLayers),
        'elk.edgeRouting': 'orthogonal',
        'elk.layered.edgeRouting': 'ORTHOGONAL',
        'elk.layered.placement.straightness': 'STRAIGHTNESS',
        'elk.layered.spacing.baseValue': String(options.spacing.nodeNode),
        'elk.separateConnectedComponents': 'false',
      };

      if (options.compound) {
        layoutOptions['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN';
        layoutOptions['elk containment.insideEdges.toLayout'] = 'true';
      }

      const elkGraph: ElkNode = {
        id: 'root',
        children: elkNodes,
        edges: elkEdges,
      };

      setIsComputing(true);

      try {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        let layouted: ElkNode;

        if (workerRef.current) {
          layouted = await new Promise<ElkNode>((resolve, reject) => {
            const id = String(++requestIdRef.current);
            const timer = setTimeout(() => {
              if (signal) signal.removeEventListener('abort', abortHandler);
              pendingRef.current.delete(id);
              reject(new Error('Layout worker timed out'));
            }, WORKER_TIMEOUT_MS);

            const abortHandler = () => {
              clearTimeout(timer);
              pendingRef.current.delete(id);
              reject(new Error('Aborted'));
            };

            if (signal) {
              signal.addEventListener('abort', abortHandler);
            }

            const onResolve = (res: ElkNode) => {
              if (signal) signal.removeEventListener('abort', abortHandler);
              resolve(res);
            };
            const onReject = (err: Error) => {
              if (signal) signal.removeEventListener('abort', abortHandler);
              reject(err);
            };

            pendingRef.current.set(id, { resolve: onResolve, reject: onReject, timer });
            workerRef.current!.postMessage({
              requestId: id,
              elkGraph,
              layoutOptions,
            });
          });
        } else {
          if (signal?.aborted) throw new Error('Aborted');
          const ELK = await importFallbackElk();
          const elk = new ELK();
          layouted = await elk.layout(elkGraph, {
            layoutOptions,
            logging: false,
          });
          if (signal?.aborted) throw new Error('Aborted');
        }

        const elkPosMap = new Map<string, ElkNode>();
        function walk(n: ElkNode) {
          elkPosMap.set(n.id, n);
          n.children?.forEach(walk);
        }
        walk(layouted);

        const rfNodes: Node[] = explorerNodes.map((en) => {
          const elkN = elkPosMap.get(en.id);
          return {
            id: en.id,
            type: en.kind === 'directory' ? 'directory' : en.kind === 'file' ? 'file' : 'entity',
            position: { x: elkN?.x ?? 0, y: elkN?.y ?? 0 },
            data: {
              ...en,
              label: en.name,
              metadata: nodeMap.get(en.id)?.metadata ?? {},
            },
          };
        });

        const rfEdges: Edge[] = explorerEdges
          .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
          .map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'smoothstep' as const,
            style: edgeStyle(e.relation),
            data: { relation: e.relation, weight: e.weight, members: e.members },
          }));

        return { nodes: rfNodes, edges: rfEdges };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsComputing(false);
      }
    },
    [],
  );

  return { computeLayout, isComputing, error };
}

// ─── Helpers ──────────────────────────────────────────

function buildElkNodes(
  explorerNodes: ExplorerNode[],
  compound: boolean,
): ElkNode[] {
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
    if (n.kind === 'directory' && compound) {
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

async function importFallbackElk() {
  const mod = await import('elkjs/lib/elk.bundled');
  return mod.default;
}
