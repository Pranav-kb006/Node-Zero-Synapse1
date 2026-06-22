// Shared node-sizing and edge-styling helpers for the ELK layout adapter.
// Kept separate from useLayoutWorker so they can be reused without React types.

export function nodeWidth(kind: string): number {
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

export function nodeHeight(kind: string): number {
  switch (kind) {
    case 'directory': return 72;
    case 'file': return 56;
    default: return 40;
  }
}

export function edgeStyle(relation: string): React.CSSProperties {
  // Lower stroke opacity keeps dense graphs readable — overlapping edges read
  // as faint texture rather than a solid wall. Selection/hover highlight raises
  // opacity back to full via the DOM highlight pass in ExplorerPage.
  switch (relation) {
    case 'contains':
      return { stroke: '#475569', strokeWidth: 1, strokeOpacity: 0.35, strokeLinecap: 'round' };
    case 'calls':
      return { stroke: '#34d399', strokeWidth: 1.25, strokeOpacity: 0.45, strokeLinecap: 'round' };
    case 'imports':
    case 'imports_from':
      return { stroke: '#818cf8', strokeWidth: 1.25, strokeOpacity: 0.45, strokeLinecap: 'round' };
    case 'inherits':
    case 'implements':
      return { stroke: '#fbbf24', strokeWidth: 2, strokeOpacity: 0.7, strokeLinecap: 'round' };
    case 'decorates':
      return { stroke: '#fb7185', strokeWidth: 1.25, strokeOpacity: 0.5, strokeLinecap: 'round' };
    default:
      return { stroke: '#64748b', strokeWidth: 1.25, strokeOpacity: 0.4, strokeLinecap: 'round' };
  }
}
