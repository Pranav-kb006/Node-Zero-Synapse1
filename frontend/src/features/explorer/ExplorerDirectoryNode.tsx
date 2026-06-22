import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Folder, ChevronRight } from 'lucide-react';
import type { ExplorerNode } from '../types';

function riskColor(level?: string) {
  switch (level) {
    case 'CRITICAL': return { bg: 'bg-red-950', border: 'border-red-500', text: 'text-red-400', glow: 'shadow-red-500/20' };
    case 'HIGH':     return { bg: 'bg-rose-950', border: 'border-rose-500', text: 'text-rose-400', glow: 'shadow-rose-500/20' };
    case 'MEDIUM':   return { bg: 'bg-amber-950', border: 'border-amber-500', text: 'text-amber-400', glow: 'shadow-amber-500/20' };
    default:         return { bg: 'bg-emerald-950', border: 'border-emerald-500/40', text: 'text-emerald-400', glow: '' };
  }
}

function DirectoryNodeComponent({ data }: NodeProps) {
  const node = data as unknown as ExplorerNode & { metadata: Record<string, unknown> };
  const rc = riskColor(node.risk?.level);
  const fileCount = (node.metadata?.file_count as number) ?? 0;
  const complexity = (node.metadata?.complexity_sum as number) ?? 0;

  return (
    <div className={`relative group rounded-lg border ${rc.border} bg-synapse-panel/90 backdrop-blur-sm shadow-lg ${rc.glow} min-w-[260px] transition-all duration-200 hover:shadow-xl`}>
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className={`flex-shrink-0 p-1.5 rounded-md ${rc.bg} ${rc.border} border`}>
          <Folder className={`w-4 h-4 ${rc.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white/90 truncate">{node.name}</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
            {complexity > 0 && <span className="ml-1.5 text-white/30">· {complexity} cx</span>}
          </p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-2 !h-2 !border-0" />
    </div>
  );
}

export const ExplorerDirectoryNode = memo(DirectoryNodeComponent);
