import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, Box, GitBranch, Database, Import, HelpCircle } from 'lucide-react';
import type { ExplorerNode } from '../types';

function kindIcon(kind: string) {
  switch (kind) {
    case 'class':
    case 'interface':
    case 'enum':
    case 'struct': return Box;
    case 'function':
    case 'method': return Zap;
    case 'variable': return Database;
    case 'import': return Import;
    case 'external': return HelpCircle;
    default: return GitBranch;
  }
}

function riskColor(level?: string) {
  switch (level) {
    case 'CRITICAL': return { border: 'border-red-500/60', text: 'text-red-400', glow: 'shadow-red-500/10' };
    case 'HIGH':     return { border: 'border-rose-500/50', text: 'text-rose-400', glow: 'shadow-rose-500/10' };
    case 'MEDIUM':   return { border: 'border-amber-500/40', text: 'text-amber-400', glow: 'shadow-amber-500/10' };
    default:         return { border: 'border-white/8', text: 'text-white/40', glow: '' };
  }
}

function EntityNodeComponent({ data }: NodeProps) {
  const node = data as unknown as ExplorerNode;
  const Icon = kindIcon(node.kind);
  const rc = riskColor(node.risk?.level);
  const cx = node.complexity?.cyclomatic;

  return (
    <div className={`relative group rounded-md border ${rc.border} bg-synapse-panel/70 backdrop-blur-sm shadow-sm min-w-[140px] transition-all duration-150 hover:shadow-md ${rc.glow}`}>
      <Handle type="target" position={Position.Top} className="!bg-white/15 !w-1 !h-1 !border-0" />
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <Icon className={`w-3 h-3 ${rc.text} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-white/80 truncate">{node.name}</p>
        </div>
        {cx != null && cx > 0 && (
          <span className="text-[8px] text-white/30 font-mono">{cx}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/15 !w-1 !h-1 !border-0" />
    </div>
  );
}

export const ExplorerEntityNode = memo(EntityNodeComponent);
