import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileCode, ChevronRight } from 'lucide-react';
import type { ExplorerNode } from './types';

import type { PersonaFilterConfig } from './personas/PersonaPresets';

function riskColor(level?: string) {
  switch (level) {
    case 'CRITICAL': return { bg: 'bg-red-950', border: 'border-red-500', text: 'text-red-400' };
    case 'HIGH':     return { bg: 'bg-rose-950', border: 'border-rose-500', text: 'text-rose-400' };
    case 'MEDIUM':   return { bg: 'bg-amber-950', border: 'border-amber-500', text: 'text-amber-400' };
    default:         return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/50' };
  }
}

function langBadge(lang?: string) {
  switch (lang) {
    case 'python': return { label: 'Py', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    case 'java':   return { label: 'Jv', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
    case 'cpp':    return { label: 'C+', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    default:       return null;
  }
}

function FileNodeComponent({ data }: NodeProps) {
  const node = data as unknown as ExplorerNode & { metadata: Record<string, unknown>; personaConfig?: PersonaFilterConfig };
  const persona = node.personaConfig;
  const showRisk = persona?.showRisk ?? true;
  const showComplexity = persona?.showComplexity ?? true;
  const nodeScale = persona?.nodeScale ?? 1;

  const rc = riskColor(showRisk ? node.risk?.level : undefined);
  const entityCount = (node.metadata?.entity_count as number) ?? 0;
  const complexity = (node.metadata?.complexity_sum as number) ?? 0;
  const badge = langBadge(node.language);

  return (
    <div 
      style={{ transform: `scale(${nodeScale})`, transformOrigin: 'center' }}
      className={`relative group rounded-lg border ${rc.border} bg-synapse-surface/80 backdrop-blur-sm shadow-md min-w-[200px] transition-all duration-200 hover:shadow-lg`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-1.5 !h-1.5 !border-0" />
      <div className="flex items-center gap-2 px-3 py-2">
        <div className={`flex-shrink-0 p-1 rounded ${rc.bg} ${rc.border} border`}>
          <FileCode className={`w-3.5 h-3.5 ${rc.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-medium text-white/85 truncate">{node.name}</p>
            {badge && (
              <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[9px] text-white/35 mt-0.5">
            {entityCount} ent
            {showComplexity && complexity > 0 && <span className="ml-1">· {complexity} cx</span>}
          </p>
        </div>
        <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors" />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-1.5 !h-1.5 !border-0" />
    </div>
  );
}

export const ExplorerFileNode = memo(FileNodeComponent);
