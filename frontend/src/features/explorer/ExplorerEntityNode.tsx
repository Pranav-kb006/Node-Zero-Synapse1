import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, Box, GitBranch, Database, Import, HelpCircle, Plus } from 'lucide-react';
import type { ExplorerNode } from './types';

import type { PersonaFilterConfig } from './personas/PersonaPresets';

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
  const node = data as unknown as ExplorerNode & { personaConfig?: PersonaFilterConfig };
  const persona = node.personaConfig;
  const isPlaceholder = node.metadata?.isPlaceholder === true;
  const Icon = isPlaceholder ? Plus : kindIcon(node.kind);
  const rc = isPlaceholder
    ? { border: 'border-white/10 border-dashed', text: 'text-white/40', glow: '' }
    : riskColor(node.risk?.level);
  const cx = node.complexity?.cyclomatic;

  // Persona presets
  const showLabels = persona?.showLabels ?? true;
  const labelScaleClass = persona?.labelScale === 'large' ? 'text-[12px]' : 'text-[10px]';
  const showComplexity = persona?.showComplexity ?? true;
  const nodeScale = persona?.nodeScale ?? 1;

  return (
    <div 
      style={{ transform: `scale(${nodeScale})`, transformOrigin: 'center' }}
      className={`relative group rounded-md border ${rc.border} ${isPlaceholder ? 'bg-white/5' : 'bg-synapse-panel/70'} backdrop-blur-sm shadow-sm min-w-[140px] transition-all duration-150 hover:shadow-md ${rc.glow}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/15 !w-1 !h-1 !border-0" />
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <Icon className={`w-3.5 h-3.5 ${rc.text} flex-shrink-0`} />
        {showLabels && (
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${isPlaceholder ? 'text-white/40 italic' : 'text-white/85'} truncate ${labelScaleClass}`}>{node.name}</p>
          </div>
        )}
        {!isPlaceholder && showComplexity && cx != null && cx > 0 && (
          <span className="text-[8px] text-white/30 font-mono">{cx}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/15 !w-1 !h-1 !border-0" />
    </div>
  );
}

export const ExplorerEntityNode = memo(EntityNodeComponent);
