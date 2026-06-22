/**
 * API client for the Synapse backend.
 * All backend communication goes through this module.
 */

import type { ExplorerGraphResponse } from '@/features/explorer/types';

export const API_BASE =
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_BACKEND_URL ??
    import.meta.env.VITE_REACT_APP_BACKEND_URL ??
    'http://127.0.0.1:8000';

// ─── Generic fetch wrapper ─────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...init?.headers },
        });
    } catch (err) {
        throw new Error(
            'Cannot connect to backend server. Make sure it is running on ' + API_BASE
        );
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }
    return res.json() as Promise<T>;
}

// ─── Response types ────────────────────────────────────

export interface GraphNode {
    id: string;
    file?: string;
    line?: number;
    name?: string;
    type?: string;
    range?: number[];
    complexity?: number | { cyclomatic?: number };
    [key: string]: unknown;
}

export interface GraphEdge {
    source: string;
    target: string;
}

export interface FullGraphResponse {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface BlastRadiusResponse {
    target: string;
    blast_radius_score: number;
    affected_functions: string[];
}

export interface DeveloperProfileAPI {
    name: string;
    email: string;
    total_commits: number;
}

export interface ExpertiseScoreAPI {
    total_score: number;
    factors: Record<string, number>;
}

export interface ExpertResponse {
    target: string;
    primary_expert: DeveloperProfileAPI | null;
    recommendation: string;
    bus_factor: number;
    score: ExpertiseScoreAPI | null;
    secondary_experts: Array<{
        developer: DeveloperProfileAPI;
        score: ExpertiseScoreAPI;
    }>;
}

export interface BusFactorResponse {
    analysis: Record<string, number>;
    warning_threshold: number;
    risk_areas: string[];
}

export interface HeatmapResponse {
    modules: Record<string, Record<string, unknown>>;
    risk_areas?: string[];
    average_bus_factor?: number;
    [key: string]: unknown;
}

export interface ViolationAPI {
    file_path: string;
    line_number: number;
    from_module: string;
    to_module: string;
    from_layer: string;
    to_layer: string;
    rule_name: string;
    severity: string;
    message: string;
    timestamp: string;
}

export interface ViolationsResponse {
    total_violations: number;
    total_warnings: number;
    violations: ViolationAPI[];
    warnings: ViolationAPI[];
}

export interface DriftResponse {
    baseline: {
        coupling_score?: number;
        cohesion_score?: number;
        violation_count?: number;
        layer_balance?: Record<string, number>;
    } | null;
    current: {
        coupling_score?: number;
        cohesion_score?: number;
        violation_count?: number;
        layer_balance?: Record<string, number>;
    } | null;
    drift_score: number;
    indicators: Record<string, number>;
    recommendations: string[];
    [key: string]: unknown;
}

export interface LayersResponse {
    layers: Record<string, unknown>[];
    rules: Record<string, unknown>[];
}

export interface AIResponse {
    answer: string;
    context: string[];
    sources?: string[];
    evidence?: Array<{
        id: string;
        unique_id: string;
        file: string;
        snippet: string;
        score: number;
        source_type: string;
        rank: number;
    }>;
    retrieval_trace?: Record<string, unknown>;
    grounding?: {
        grounded: boolean;
        unsupported_claim_count: number;
        uncertainty_reason: string;
    };
    metrics?: {
        stage_ms?: Record<string, number>;
        total_latency_ms?: number;
        cost_query_usd_estimate?: number;
        token_estimate?: {
            input: number;
            output: number;
        };
        failure_reason?: string;
    };
}

export interface HealthResponse {
    status: string;
    system: string;
    startup_error: string | null;
}

export interface UploadStatusResponse {
    status: 'idle' | 'cloning' | 'parsing' | 'building' | 'ready' | 'error';
    repo_name: string | null;
    error: string | null;
    repo_path: string | null;
    progress: number;
    step_times: Record<string, { start: number | null; end: number | null }>;
    stats: {
        files: number;
        entities: number;
        nodes: number;
        edges: number;
    } | null;
}

// ─── API functions ─────────────────────────────────────

export const api = {
    // Health
    health: () => apiFetch<HealthResponse>('/'),

    // Graph
    getFullGraph: () => apiFetch<FullGraphResponse>('/graph'),
    getCondensedGraph: () => apiFetch<any>('/graph/condensed'),
    getBlastRadius: (functionName: string) =>
        apiFetch<BlastRadiusResponse>(`/blast-radius/${encodeURIComponent(functionName)}`),

    // Smart Blame
    getExpertForFile: (filePath: string, repoPath?: string) => {
        const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
        return apiFetch<ExpertResponse>(`/blame/expert/${encodeURIComponent(filePath)}${params}`);
    },
    getHeatmap: (module?: string, repoPath?: string) => {
        const params = new URLSearchParams();
        if (module) params.set('module', module);
        if (repoPath) params.set('repo_path', repoPath);
        const qs = params.toString();
        return apiFetch<HeatmapResponse>(`/blame/heatmap${qs ? '?' + qs : ''}`);
    },
    getBusFactor: (repoPath?: string) => {
        const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
        return apiFetch<BusFactorResponse>(`/blame/bus-factor${params}`);
    },
    getGaps: (repoPath?: string) => {
        const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
        return apiFetch<{ knowledge_gaps: string[]; total_gaps: number }>(`/blame/gaps${params}`);
    },

    // Governance
    getViolations: (repoPath?: string) => {
        const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
        return apiFetch<ViolationsResponse>(`/governance/violations${params}`);
    },
    getDrift: (repoPath?: string) => {
        const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
        return apiFetch<DriftResponse>(`/governance/drift${params}`);
    },
    getLayers: () => apiFetch<LayersResponse>('/governance/layers'),

    // AI
    askAI: (query: string) =>
        apiFetch<AIResponse>(`/ai/ask?query=${encodeURIComponent(query)}`),
    indexGraph: () =>
        apiFetch<{ status: string; indexed_nodes: number }>('/ai/index', { method: 'POST' }),

    // Upload
    uploadFolder: async (file: File): Promise<{ status: string; repo_name: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE}/upload/folder`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(body || 'Upload failed');
        }
        return res.json();
    },
    uploadGithub: (url: string) =>
        apiFetch<{ status: string; repo_name: string }>('/upload/github', {
            method: 'POST',
            body: JSON.stringify({ url }),
        }),
    getUploadStatus: () => apiFetch<UploadStatusResponse>('/upload/status'),

    // Explorer
    getExplorerGraph: (params?: {
        root?: string;
        depth?: number;
        language?: string;
        kind?: string;
    }) => {
        const searchParams = new URLSearchParams();
        if (params?.root) searchParams.set('root', params.root);
        if (params?.depth !== undefined) searchParams.set('depth', String(params.depth));
        if (params?.language) searchParams.set('language', params.language);
        if (params?.kind) searchParams.set('kind', params.kind);
        const qs = searchParams.toString();
        return apiFetch<ExplorerGraphResponse>(`/graph/explorer${qs ? '?' + qs : ''}`);
    },
};
