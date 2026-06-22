export type NodeKind =
  | 'directory' | 'file' | 'module' | 'class' | 'interface'
  | 'enum' | 'struct' | 'function' | 'method' | 'variable'
  | 'import' | 'external';

export type Relation =
  | 'contains' | 'imports' | 'imports_from' | 'includes'
  | 'calls' | 'inherits' | 'implements' | 'decorates'
  | 'reads_global' | 'writes_global';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Language = 'python' | 'java' | 'cpp' | 'unknown';

export interface ExplorerComplexity {
  cyclomatic: number;
  cognitive: number;
  lines_of_code: number;
}

export interface ExplorerRisk {
  level: RiskLevel;
  score?: number;
}

export interface ExplorerRange {
  start: number;
  end: number;
}

export interface ExplorerNode {
  id: string;
  kind: NodeKind;
  language: Language;
  name: string;
  qualified_name: string;
  file_path: string;
  range?: ExplorerRange;
  parent_id?: string;
  complexity?: ExplorerComplexity;
  risk?: ExplorerRisk;
  metadata: Record<string, unknown>;
}

export interface ExplorerEdge {
  id: string;
  source: string;
  target: string;
  relation: Relation;
  weight: number;
  members?: string[];
  /** True when this edge aggregates many entity-level edges onto a container. */
  aggregated?: boolean;
  /** Container level an aggregate edge sits at. */
  level?: 'file' | 'directory';
  /** Per-relation breakdown for aggregate edges. */
  relation_counts?: Record<string, number>;
}

export interface ExplorerGroup {
  id: string;
  label: string;
  kind: string;
  child_ids: string[];
  language?: Language;
  risk?: ExplorerRisk;
  metadata: Record<string, unknown>;
}

export interface ExplorerCapabilities {
  languages: Language[];
  has_git: boolean;
  has_governance: boolean;
  has_summaries: boolean;
}

export interface ExplorerRepository {
  id: string;
  name: string;
  root_label: string;
}

export interface ExplorerGraphResponse {
  schema_version: number;
  repository: ExplorerRepository;
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  groups: ExplorerGroup[];
  capabilities: ExplorerCapabilities;
}

export interface ExplorerFilters {
  root?: string;
  depth?: number;
  language?: string;
  kind?: string;
}
