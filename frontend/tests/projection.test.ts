import { describe, it, expect } from 'vitest';

import {
  buildParentMap,
  resolveVisibleAncestor,
  projectEdges,
  aggregateEdgeWidth,
} from '../src/features/explorer/graph/projection';
import type { ExplorerNode, ExplorerEdge } from '../src/features/explorer/types';

// entity -> file -> dir hierarchy across two directories.
const nodes: ExplorerNode[] = [
  { id: 'dir:src', kind: 'directory', language: 'python', name: 'src', qualified_name: 'src', file_path: 'src', metadata: {} },
  { id: 'dir:lib', kind: 'directory', language: 'python', name: 'lib', qualified_name: 'lib', file_path: 'lib', metadata: {} },
  { id: 'file:src/a.py', kind: 'file', language: 'python', name: 'a.py', qualified_name: 'src/a.py', file_path: 'src/a.py', parent_id: 'dir:src', metadata: {} },
  { id: 'file:src/b.py', kind: 'file', language: 'python', name: 'b.py', qualified_name: 'src/b.py', file_path: 'src/b.py', parent_id: 'dir:src', metadata: {} },
  { id: 'file:lib/c.py', kind: 'file', language: 'python', name: 'c.py', qualified_name: 'lib/c.py', file_path: 'lib/c.py', parent_id: 'dir:lib', metadata: {} },
  { id: 'a.funcA', kind: 'function', language: 'python', name: 'funcA', qualified_name: 'a.funcA', file_path: 'src/a.py', parent_id: 'file:src/a.py', metadata: {} },
  { id: 'b.funcB', kind: 'function', language: 'python', name: 'funcB', qualified_name: 'b.funcB', file_path: 'src/b.py', parent_id: 'file:src/b.py', metadata: {} },
  { id: 'c.funcC', kind: 'function', language: 'python', name: 'funcC', qualified_name: 'c.funcC', file_path: 'lib/c.py', parent_id: 'file:lib/c.py', metadata: {} },
];

const edges: ExplorerEdge[] = [
  { id: 'e1', source: 'a.funcA', target: 'b.funcB', relation: 'calls', weight: 1 },
  { id: 'e2', source: 'a.funcA', target: 'c.funcC', relation: 'calls', weight: 1 },
  { id: 'e3', source: 'b.funcB', target: 'c.funcC', relation: 'imports', weight: 1 },
];

describe('buildParentMap', () => {
  it('maps each node to its parent_id', () => {
    const m = buildParentMap(nodes);
    expect(m.get('a.funcA')).toBe('file:src/a.py');
    expect(m.get('file:src/a.py')).toBe('dir:src');
    expect(m.has('dir:src')).toBe(false);
  });
});

describe('resolveVisibleAncestor', () => {
  const parentOf = buildParentMap(nodes);

  it('returns the node itself when visible', () => {
    expect(resolveVisibleAncestor('a.funcA', new Set(['a.funcA']), parentOf)).toBe('a.funcA');
  });

  it('walks up to the nearest visible ancestor', () => {
    expect(resolveVisibleAncestor('a.funcA', new Set(['dir:src']), parentOf)).toBe('dir:src');
    expect(resolveVisibleAncestor('a.funcA', new Set(['file:src/a.py']), parentOf)).toBe('file:src/a.py');
  });

  it('returns null when no ancestor is visible', () => {
    expect(resolveVisibleAncestor('a.funcA', new Set(['dir:lib']), parentOf)).toBeNull();
  });
});

describe('projectEdges', () => {
  const parentOf = buildParentMap(nodes);

  it('aggregates entity edges onto directories when only dirs are visible', () => {
    const visible = new Set(['dir:src', 'dir:lib']);
    const projected = projectEdges(edges, visible, parentOf);
    // Two cross-dir edges (a->c, b->c) collapse into one src->lib aggregate.
    const srcToLib = projected.find((e) => e.source === 'dir:src' && e.target === 'dir:lib');
    expect(srcToLib).toBeDefined();
    expect(srcToLib!.weight).toBe(2);
    expect(srcToLib!.aggregated).toBe(true);
    // a->b is intra-dir and must not appear as a self-loop.
    expect(projected.some((e) => e.source === e.target)).toBe(false);
  });

  it('projects onto files when files are visible', () => {
    const visible = new Set(['file:src/a.py', 'file:src/b.py', 'file:lib/c.py']);
    const projected = projectEdges(edges, visible, parentOf);
    expect(projected).toHaveLength(3);
    const aToB = projected.find((e) => e.source === 'file:src/a.py' && e.target === 'file:src/b.py');
    expect(aToB).toBeDefined();
    expect(aToB!.weight).toBe(1);
  });

  it('drops edges whose endpoints have no visible ancestor', () => {
    const visible = new Set(['dir:src']); // lib not visible
    const projected = projectEdges(edges, visible, parentOf);
    // a->c and b->c resolve target to nothing; a->b is a self-loop. All dropped.
    expect(projected).toHaveLength(0);
  });
});

describe('aggregateEdgeWidth', () => {
  it('keeps thin width for single edges and grows with weight', () => {
    expect(aggregateEdgeWidth(1)).toBe(1.5);
    expect(aggregateEdgeWidth(8)).toBeGreaterThan(aggregateEdgeWidth(2));
    expect(aggregateEdgeWidth(10000)).toBeLessThanOrEqual(6);
  });
});
