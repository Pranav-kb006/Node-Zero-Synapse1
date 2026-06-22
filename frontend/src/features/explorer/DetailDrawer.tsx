import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Zap, Box, GitBranch, Database, Copy, ChevronRight } from 'lucide-react';
import type { ExplorerNode, ExplorerEdge } from './types';

interface DetailDrawerProps {
  node: ExplorerNode | null;
  edges: ExplorerEdge[];
  onClose: () => void;
}

function kindIcon(kind: string) {
  switch (kind) {
    case 'class':
    case 'interface':
    case 'enum':
    case 'struct': return Box;
    case 'function':
    case 'method': return Zap;
    case 'variable': return Database;
    default: return GitBranch;
  }
}

function riskBadge(level?: string) {
  switch (level) {
    case 'CRITICAL': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'HIGH':     return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'MEDIUM':   return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:         return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
}

function langBadge(lang?: string) {
  switch (lang) {
    case 'python': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'java':   return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'cpp':    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:       return 'bg-white/10 text-white/40 border-white/10';
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function DetailDrawer({ node, edges, onClose }: DetailDrawerProps) {
  if (!node) return null;

  const Icon = kindIcon(node.kind);
  const incoming = edges.filter((e) => e.target === node.id);
  const outgoing = edges.filter((e) => e.source === node.id);

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed top-14 right-0 bottom-0 w-[360px] z-30 bg-synapse-panel/95 backdrop-blur-xl border-l border-white/[0.06] shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-synapse-panel/95 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
            <div className={`p-1.5 rounded-md bg-white/5 border border-white/10`}>
              <Icon className="w-4 h-4 text-white/60" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white/90 truncate">{node.name}</h3>
              <p className="text-[10px] text-white/35 font-mono truncate">{node.kind}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 transition-colors">
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-4">
            {/* Badges */}
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded border ${riskBadge(node.risk?.level)}`}>
                {node.risk?.level ?? 'LOW'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${langBadge(node.language)}`}>
                {node.language}
              </span>
              {node.complexity && node.complexity.cyclomatic > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded border bg-white/5 border-white/10 text-white/50">
                  cx: {node.complexity.cyclomatic}
                </span>
              )}
            </div>

            {/* Qualified name */}
            <div>
              <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1 block">Qualified Name</label>
              <div className="flex items-center gap-1.5 group">
                <code className="text-[11px] text-white/60 font-mono break-all leading-relaxed">{node.qualified_name}</code>
                <button onClick={() => copyToClipboard(node.qualified_name)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Copy className="w-3 h-3 text-white/30 hover:text-white/60" />
                </button>
              </div>
            </div>

            {/* File path */}
            <div>
              <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1 block">File</label>
              <code className="text-[11px] text-white/50 font-mono break-all">{node.file_path}</code>
            </div>

            {/* Range */}
            {node.range && node.range.start > 0 && (
              <div>
                <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1 block">Lines</label>
                <span className="text-[11px] text-white/50 font-mono">{node.range.start} — {node.range.end}</span>
              </div>
            )}

            {/* Complexity */}
            {node.complexity && (
              <div>
                <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5 block">Complexity</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/5 rounded-md px-2 py-1.5 text-center">
                    <p className="text-[13px] font-semibold text-white/80">{node.complexity.cyclomatic}</p>
                    <p className="text-[8px] text-white/30">Cyclomatic</p>
                  </div>
                  <div className="bg-white/5 rounded-md px-2 py-1.5 text-center">
                    <p className="text-[13px] font-semibold text-white/80">{node.complexity.cognitive}</p>
                    <p className="text-[8px] text-white/30">Cognitive</p>
                  </div>
                  <div className="bg-white/5 rounded-md px-2 py-1.5 text-center">
                    <p className="text-[13px] font-semibold text-white/80">{node.complexity.lines_of_code}</p>
                    <p className="text-[8px] text-white/30">LOC</p>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata */}
            {Object.keys(node.metadata).length > 0 && (
              <div>
                <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5 block">Metadata</label>
                <div className="space-y-1">
                  {Object.entries(node.metadata).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-[10px] text-white/35 font-mono shrink-0">{key}</span>
                      <span className="text-[10px] text-white/55 font-mono break-all">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            {(incoming.length > 0 || outgoing.length > 0) && (
              <div>
                <label className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5 block">
                  Connections ({incoming.length} in · {outgoing.length} out)
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {outgoing.slice(0, 20).map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5 text-[10px]">
                      <ChevronRight className="w-3 h-3 text-neon-emerald/60" />
                      <span className="text-white/30 font-mono">{e.relation}</span>
                      <span className="text-white/55 font-mono truncate">{e.target.split(':').pop()}</span>
                    </div>
                  ))}
                  {incoming.slice(0, 20).map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5 text-[10px]">
                      <ChevronRight className="w-3 h-3 text-neon-amber/60 rotate-180" />
                      <span className="text-white/30 font-mono">{e.relation}</span>
                      <span className="text-white/55 font-mono truncate">{e.source.split(':').pop()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
