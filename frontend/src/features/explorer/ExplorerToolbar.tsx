import { useState, useCallback } from 'react';
import { Search, Filter, ChevronDown, X, RotateCcw } from 'lucide-react';
import type { ExplorerFilters } from './types';

interface ToolbarProps {
  filters: ExplorerFilters;
  onFiltersChange: (filters: ExplorerFilters) => void;
  repository?: string;
  languages?: string[];
  nodeCount?: number;
  edgeCount?: number;
}

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'class', label: 'Classes' },
  { value: 'function', label: 'Functions' },
  { value: 'method', label: 'Methods' },
  { value: 'variable', label: 'Variables' },
  { value: 'import', label: 'Imports' },
];

export function ExplorerToolbar({ filters, onFiltersChange, repository, languages, nodeCount, edgeCount }: ToolbarProps) {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const updateFilter = useCallback(
    (key: keyof ExplorerFilters, value: string | number | undefined) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange],
  );

  const reset = useCallback(() => {
    setSearch('');
    onFiltersChange({});
  }, [onFiltersChange]);

  const hasActiveFilters = filters.root || filters.depth != null || filters.language || filters.kind;

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">
      {/* Main bar */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols..."
            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-synapse-panel/90 backdrop-blur-md border border-white/10 rounded-lg text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-white/30 hover:text-white/60" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border backdrop-blur-md transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-white/10 border-white/20 text-white/80'
              : 'bg-synapse-panel/90 border-white/10 text-white/50 hover:text-white/70'
          }`}
        >
          <Filter className="w-3 h-3" />
          Filters
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-neon-emerald" />
          )}
        </button>

        {/* Reset */}
        {hasActiveFilters && (
          <button
            onClick={reset}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-lg border border-white/10 bg-synapse-panel/90 backdrop-blur-md text-white/40 hover:text-white/70 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 ml-auto text-[10px] text-white/30">
          {repository && <span className="font-mono">{repository}</span>}
          {nodeCount != null && <span>{nodeCount.toLocaleString()} nodes</span>}
          {edgeCount != null && <span>{edgeCount.toLocaleString()} edges</span>}
        </div>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex items-center gap-3 pointer-events-auto px-1">
          {/* Language */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Lang</span>
            <div className="flex gap-1">
              {(languages ?? ['python', 'java', 'cpp']).map((lang) => (
                <button
                  key={lang}
                  onClick={() => updateFilter('language', filters.language === lang ? undefined : lang)}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                    filters.language === lang
                      ? 'bg-neon-indigo/20 border-neon-indigo/40 text-neon-indigo'
                      : 'bg-white/5 border-white/8 text-white/40 hover:text-white/60'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Kind */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Kind</span>
            <div className="relative">
              <select
                value={filters.kind ?? ''}
                onChange={(e) => updateFilter('kind', e.target.value || undefined)}
                className="appearance-none pl-2 pr-6 py-0.5 text-[10px] rounded border border-white/8 bg-white/5 text-white/50 focus:outline-none focus:border-white/20"
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Depth */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Depth</span>
            <input
              type="number"
              min={0}
              max={20}
              value={filters.depth ?? ''}
              onChange={(e) => updateFilter('depth', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="all"
              className="w-14 px-2 py-0.5 text-[10px] rounded border border-white/8 bg-white/5 text-white/50 focus:outline-none focus:border-white/20 placeholder:text-white/20"
            />
          </div>

          {/* Root */}
          {filters.root && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Root</span>
              <span className="text-[10px] text-neon-emerald font-mono truncate max-w-[200px]">{filters.root}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
