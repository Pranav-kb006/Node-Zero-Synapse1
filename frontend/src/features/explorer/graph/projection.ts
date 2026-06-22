// Edge projection & aggregation for progressive graph disclosure.
//
// On large repositories the explorer cannot render every entity at once, so
// containers (directories, files) stay collapsed. This module projects
// entity-level dependency edges onto whichever ancestor container is currently
// visible and combines identical projected edges, preserving weight and a
// per-relation breakdown. This is what keeps a collapsed graph meaningful
// instead of "haphazard" — see integration_architecture_plan.md §3.2/§3.3.

import type { ExplorerNode, ExplorerEdge, Relation } from '../types';

/** Build a child -> parent lookup from node.parent_id. */
export function buildParentMap(nodes: ExplorerNode[]): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const n of nodes) {
    if (n.parent_id) parentOf.set(n.id, n.parent_id);
  }
  return parentOf;
}

/**
 * Walk up the parent chain until a visible node is found. Returns the node id
 * itself if it is visible, or null if no ancestor is visible.
 */
export function resolveVisibleAncestor(
  id: string,
  visible: Set<string>,
  parentOf: Map<string, string>,
): string | null {
  let cur: string | undefined = id;
  const guard = new Set<string>();
  while (cur) {
    if (visible.has(cur)) return cur;
    if (guard.has(cur)) return null; // cycle guard
    guard.add(cur);
    cur = parentOf.get(cur);
  }
  return null;
}

export interface ProjectedEdge extends ExplorerEdge {
  aggregated: boolean;
  relation_counts: Record<string, number>;
}

/**
 * Project entity-level dependency edges onto the visible container set and
 * aggregate duplicates. Self-edges (both endpoints resolving to the same
 * visible ancestor) are dropped. CONTAINS and already-aggregated backend edges
 * must be filtered out by the caller before passing them in.
 */
export function projectEdges(
  rawEdges: ExplorerEdge[],
  visible: Set<string>,
  parentOf: Map<string, string>,
): ProjectedEdge[] {
  const combined = new Map<string, ProjectedEdge>();

  for (const e of rawEdges) {
    const s = resolveVisibleAncestor(e.source, visible, parentOf);
    const t = resolveVisibleAncestor(e.target, visible, parentOf);
    if (!s || !t || s === t) continue;

    const key = `${s}->${t}`;
    const existing = combined.get(key);
    const rel = e.relation;
    const w = e.weight || 1;

    if (existing) {
      existing.weight += w;
      existing.relation_counts[rel] = (existing.relation_counts[rel] ?? 0) + w;
      // Whether this projected edge stands for more than one underlying edge.
      if (existing.source !== e.source || existing.target !== e.target) {
        existing.aggregated = true;
      }
    } else {
      const projected = s !== e.source || t !== e.target;
      combined.set(key, {
        id: `proj:${key}`,
        source: s,
        target: t,
        relation: rel,
        weight: w,
        aggregated: projected,
        relation_counts: { [rel]: w },
      });
    }
  }

  // Pick the dominant relation for styling on multi-relation aggregates, and
  // mark any edge that combined more than one underlying relation/edge.
  for (const edge of combined.values()) {
    const entries = Object.entries(edge.relation_counts);
    if (entries.length > 1) edge.aggregated = true;
    const total = entries.reduce((sum, [, c]) => sum + c, 0);
    if (total > 1) edge.aggregated = true;
    const dominant = entries.sort((a, b) => b[1] - a[1])[0];
    if (dominant) edge.relation = dominant[0] as Relation;
    edge.members = entries
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `${r}:${c}`);
  }

  return [...combined.values()];
}

/** Edge-width scale for aggregate edges so heavier dependencies read stronger. */
export function aggregateEdgeWidth(weight: number): number {
  if (weight <= 1) return 1.5;
  return Math.min(6, 1.5 + Math.log2(weight) * 1.1);
}
