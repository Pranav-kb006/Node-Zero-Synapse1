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
