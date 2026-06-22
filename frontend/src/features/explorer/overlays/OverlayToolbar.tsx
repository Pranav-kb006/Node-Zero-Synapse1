import { useState, useCallback } from 'react';
import { Shield, GitBranch, Users, AlertTriangle, FileDiff, X } from 'lucide-react';
import {
  overlayReducer,
  type OverlayKind,
  type OverlayState,
  type BlastRadiusOverlay,
  type GovernanceOverlay,
  type OwnershipOverlay,
  type RiskOverlay,
  type DiffOverlay,
} from '../state/overlays';
import type { ExplorerGraphResponse } from '../types';
import { api } from '@/lib/api';

interface OverlayToolbarProps {
  data: ExplorerGraphResponse;
  violations?: any[];
  busFactor?: Record<string, number>;
  gitDiff?: string[];
  activeOverlay: OverlayState;
  onOverlayChange: (state: OverlayState) => void;
}

const overlayButtons: Array<{
  kind: OverlayKind;
  icon: typeof Shield;
  label: string;
  color: string;
  activeColor: string;
}> = [
  { kind: 'blast-radius', icon: GitBranch, label: 'Blast Radius', color: 'text-neon-emerald', activeColor: 'bg-neon-emerald/20 border-neon-emerald/40' },
  { kind: 'governance', icon: Shield, label: 'Governance', color: 'text-neon-amber', activeColor: 'bg-neon-amber/20 border-neon-amber/40' },
  { kind: 'ownership', icon: Users, label: 'Ownership', color: 'text-neon-indigo', activeColor: 'bg-neon-indigo/20 border-neon-indigo/40' },
  { kind: 'risk', icon: AlertTriangle, label: 'Risk', color: 'text-neon-rose', activeColor: 'bg-neon-rose/20 border-neon-rose/40' },
  { kind: 'diff', icon: FileDiff, label: 'Diff', color: 'text-neon-cyan', activeColor: 'bg-neon-cyan/20 border-neon-cyan/40' },
];

function buildBlastRadiusOverlay(
  data: ExplorerGraphResponse,
  targetName: string
): BlastRadiusOverlay | null {
  const targetNode = data.nodes.find(
    (n) => n.name.toLowerCase().includes(targetName.toLowerCase())
  );
  if (!targetNode) return null;

  const affectedNodeIds = new Set<string>([targetNode.id]);
  const affectedEdgeIds = new Set<string>();
  const queue = [targetNode.id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of data.edges) {
      if (edge.source === current && !affectedNodeIds.has(edge.target)) {
        affectedNodeIds.add(edge.target);
        affectedEdgeIds.add(edge.id);
        queue.push(edge.target);
      }
      if (edge.target === current && !affectedNodeIds.has(edge.source)) {
        affectedNodeIds.add(edge.source);
        affectedEdgeIds.add(edge.id);
        queue.push(edge.source);
      }
    }
  }

  return {
    kind: 'blast-radius',
    targetId: targetNode.id,
    affectedNodeIds,
    affectedEdgeIds,
  };
}

function buildGovernanceOverlay(violations: any[]): GovernanceOverlay {
  const violationNodeIds = new Set<string>();
  const violationEdgeIds = new Set<string>();

  for (const v of violations) {
    if (v.from_module) violationNodeIds.add(v.from_module);
    if (v.to_module) violationNodeIds.add(v.to_module);
  }

  return {
    kind: 'governance',
    violationNodeIds,
    violationEdgeIds,
    violations,
  };
}

function buildOwnershipOverlay(
  data: ExplorerGraphResponse,
  busFactor: Record<string, number>
): OwnershipOverlay {
  const busFactorData: Record<string, number> = {};
  const lowBusFactorNodes = new Set<string>();

  for (const node of data.nodes) {
    const fp = node.file_path ? node.file_path.replace(/\\/g, '/').replace(/^\.\//, '') : '';
    let bf = 3;
    if (node.kind === 'file') {
      bf = busFactor[fp] ?? busFactor[node.name] ?? 3;
    } else if (node.kind === 'directory') {
      const descendantFiles = data.nodes.filter(
        (n) => n.kind === 'file' && n.file_path.replace(/\\/g, '/').replace(/^\.\//, '').startsWith(fp ? fp + '/' : '')
      );
      if (descendantFiles.length > 0) {
        bf = Math.min(...descendantFiles.map((n) => busFactor[n.file_path.replace(/\\/g, '/').replace(/^\.\//, '')] ?? 3));
      }
    } else {
      bf = busFactor[fp] ?? 3;
    }

    busFactorData[node.id] = bf;
    if (bf <= 2) {
      lowBusFactorNodes.add(node.id);
    }
  }

  return { kind: 'ownership', lowBusFactorNodes, busFactorData };
}

function buildRiskOverlay(data: ExplorerGraphResponse): RiskOverlay {
  const riskLevels: Record<string, string> = {};
  const riskNodeIds = new Set<string>();

  for (const node of data.nodes) {
    const level = node.risk?.level ?? 'LOW';
    riskLevels[node.id] = level;
    if (level === 'HIGH' || level === 'CRITICAL') {
      riskNodeIds.add(node.id);
    }
  }

  return { kind: 'risk', riskNodeIds, riskLevels };
}

function buildDiffOverlay(
  data: ExplorerGraphResponse,
  changedPaths: Set<string>
): DiffOverlay {
  const changedFileIds = new Set<string>();
  const affectedNodeIds = new Set<string>();

  for (const node of data.nodes) {
    if (node.kind === 'file' && changedPaths.has(node.name)) {
      changedFileIds.add(node.id);
      affectedNodeIds.add(node.id);
    }
  }

  return { kind: 'diff', changedFileIds, affectedNodeIds };
}

export function OverlayToolbar({ data, violations, busFactor, gitDiff, activeOverlay, onOverlayChange }: OverlayToolbarProps) {
  const state = activeOverlay;
  const [blastInput, setBlastInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const emit = useCallback(
    (next: OverlayState) => {
      onOverlayChange(next);
    },
    [onOverlayChange]
  );

  const handleToggle = useCallback(
    (kind: OverlayKind) => {
      if (state.active === kind) {
        const next = overlayReducer(state, { type: 'CLEAR_OVERLAY' });
        emit(next);
        return;
      }

      let overlay: BlastRadiusOverlay | GovernanceOverlay | OwnershipOverlay | RiskOverlay | DiffOverlay | null = null;

      switch (kind) {
        case 'blast-radius':
          if (blastInput.trim()) {
            overlay = buildBlastRadiusOverlay(data, blastInput.trim());
          }
          break;
        case 'governance':
          overlay = buildGovernanceOverlay(violations ?? []);
          break;
        case 'ownership':
          overlay = buildOwnershipOverlay(data, busFactor ?? {});
          break;
        case 'risk':
          overlay = buildRiskOverlay(data);
          break;
        case 'diff':
          const diffPaths = new Set(gitDiff ?? []);
          overlay = buildDiffOverlay(data, diffPaths);
          if (!gitDiff || gitDiff.length === 0) {
            setShowUpload(true);
          }
          break;
      }
      if (overlay) {
        const next = overlayReducer(state, {
          type: 'SET_OVERLAY',
          kind,
          data: overlay,
        });
        emit(next);
      }
    },
    [state, blastInput, data, emit, violations, busFactor, gitDiff]
  );

  const handleClear = useCallback(() => {
    const next = overlayReducer(state, { type: 'CLEAR_OVERLAY' });
    emit(next);
    setShowUpload(false);
    setBlastInput('');
  }, [state, emit]);

  const handleBlastSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (state.active === 'blast-radius' && blastInput.trim()) {
        try {
          // Resolve target node first to see if it exists
          const targetNode = data.nodes.find(
            (n) => n.name.toLowerCase().includes(blastInput.trim().toLowerCase())
          );
          const lookupName = targetNode ? targetNode.id : blastInput.trim();
          
          const res = await api.getBlastRadius(lookupName);
          const affectedNodeIds = new Set<string>(res.affected_functions);
          const targetId = res.target;
          affectedNodeIds.add(targetId);
          
          const affectedEdgeIds = new Set<string>();
          for (const edge of data.edges) {
            if (affectedNodeIds.has(edge.source) && affectedNodeIds.has(edge.target)) {
              affectedEdgeIds.add(edge.id);
            }
          }

          const overlay: BlastRadiusOverlay = {
            kind: 'blast-radius',
            targetId,
            affectedNodeIds,
            affectedEdgeIds,
          };
          
          const next = overlayReducer(state, {
            type: 'SET_OVERLAY',
            kind: 'blast-radius',
            data: overlay,
          });
          emit(next);
        } catch (err) {
          console.error("Failed to fetch blast radius:", err);
          // Fallback to client-side BFS if API fails
          const overlay = buildBlastRadiusOverlay(data, blastInput.trim());
          if (overlay) {
            const next = overlayReducer(state, {
              type: 'SET_OVERLAY',
              kind: 'blast-radius',
              data: overlay,
            });
            emit(next);
          }
        }
      }
    },
    [state, blastInput, data, emit]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const changedPaths = new Set<string>();
        for (const line of text.split('\n')) {
          if (line.startsWith('+++ b/') || line.startsWith('--- a/')) {
            const path = line.replace(/^\+\+\+ b\//, '').replace(/^--- a\//, '');
            changedPaths.add(path);
          } else if (line.startsWith('diff --git')) {
            const match = line.match(/b\/(.+)$/);
            if (match) changedPaths.add(match[1]);
          }
        }

        const overlay = buildDiffOverlay(data, changedPaths);
        const next = overlayReducer(state, {
          type: 'SET_OVERLAY',
          kind: 'diff',
          data: overlay,
        });
        emit(next);
        setShowUpload(false);
      };
      reader.readAsText(file);
    },
    [data, state, emit]
  );

  return (
    <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-2">
      <div className="flex items-center gap-1 bg-synapse-panel/90 backdrop-blur-md rounded-lg border border-white/10 p-2">
        {overlayButtons.map(({ kind, icon: Icon, label, color, activeColor }) => {
          const isActive = state.active === kind;
          return (
            <button
              key={kind}
              onClick={() => handleToggle(kind)}
              title={label}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                ${isActive
                  ? `${activeColor} border`
                  : 'text-white/50 hover:text-white/80 border border-transparent hover:border-white/10'
                }
              `}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? color : ''}`} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}

        {state.active && (
          <button
            onClick={handleClear}
            title="Clear overlay"
            className="ml-1 flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white/80 border border-transparent hover:border-white/10 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {state.active && (
        <div className="bg-synapse-panel/90 backdrop-blur-md rounded-lg border border-white/10 p-2 text-xs text-white/60">
          <span className="capitalize">{state.active.replace('-', ' ')}</span>
          {state.active === 'blast-radius' && state.data && 'kind' in state.data && state.data.kind === 'blast-radius' && (
            <span className="ml-2 text-neon-emerald">
              {(state.data as BlastRadiusOverlay).affectedNodeIds.size} affected
            </span>
          )}
          {state.active === 'governance' && state.data && 'kind' in state.data && state.data.kind === 'governance' && (
            <span className="ml-2 text-neon-amber">
              {(state.data as GovernanceOverlay).violations.length} violations
            </span>
          )}
          {state.active === 'ownership' && state.data && 'kind' in state.data && state.data.kind === 'ownership' && (
            <span className="ml-2 text-neon-indigo">
              {(state.data as OwnershipOverlay).lowBusFactorNodes.size} low bus-factor
            </span>
          )}
          {state.active === 'risk' && state.data && 'kind' in state.data && state.data.kind === 'risk' && (
            <span className="ml-2 text-neon-rose">
              {(state.data as RiskOverlay).riskNodeIds.size} high-risk
            </span>
          )}
          {state.active === 'diff' && state.data && 'kind' in state.data && state.data.kind === 'diff' && (
            <span className="ml-2 text-neon-cyan">
              {(state.data as DiffOverlay).changedFileIds.size} changed files
            </span>
          )}
        </div>
      )}

      {state.active === 'blast-radius' && (
        <form
          onSubmit={handleBlastSubmit}
          className="bg-synapse-panel/90 backdrop-blur-md rounded-lg border border-white/10 p-2 flex gap-2"
        >
          <input
            type="text"
            value={blastInput}
            onChange={(e) => setBlastInput(e.target.value)}
            placeholder="Target entity name..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-neon-emerald/50"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-neon-emerald/20 text-neon-emerald rounded text-xs hover:bg-neon-emerald/30 transition-colors"
          >
            Go
          </button>
        </form>
      )}

      {showUpload && state.active === 'diff' && (
        <div className="bg-synapse-panel/90 backdrop-blur-md rounded-lg border border-white/10 p-2">
          <label className="block text-xs text-white/50 mb-1">Upload diff/patch file</label>
          <input
            type="file"
            accept=".diff,.patch,.txt"
            onChange={handleFileUpload}
            className="block w-full text-xs text-white/70 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-neon-cyan/20 file:text-neon-cyan hover:file:bg-neon-cyan/30 file:cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
