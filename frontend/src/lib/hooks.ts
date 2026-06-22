/**
 * React Query hooks for all Synapse API endpoints.
 * Each hook handles loading, error, and caching automatically.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ExplorerFilters } from '@/features/explorer/types';

// ─── Query keys ────────────────────────────────────────

export const queryKeys = {
    health: ['health'] as const,
    graph: ['graph'] as const,
    condensedGraph: ['condensedGraph'] as const,
    explorer: (filters: ExplorerFilters) => ['explorer', filters] as const,
    blastRadius: (fn: string) => ['blastRadius', fn] as const,
    expert: (file: string) => ['expert', file] as const,
    heatmap: (module?: string) => ['heatmap', module] as const,
    busFactor: ['busFactor'] as const,
    gaps: ['gaps'] as const,
    violations: ['violations'] as const,
    drift: ['drift'] as const,
    layers: ['layers'] as const,
    uploadStatus: ['uploadStatus'] as const,
};

// ─── Graph hooks ───────────────────────────────────────

export function useHealth() {
    return useQuery({
        queryKey: queryKeys.health,
        queryFn: api.health,
        retry: 1,
        refetchInterval: 30_000,
    });
}

export function useFullGraph() {
    return useQuery({
        queryKey: queryKeys.graph,
        queryFn: api.getFullGraph,
        staleTime: 60_000,
    });
}

export function useCondensedGraph() {
    return useQuery({
        queryKey: queryKeys.condensedGraph,
        queryFn: api.getCondensedGraph,
        staleTime: 60_000,
    });
}

export function useExplorerGraph(filters: ExplorerFilters = {}) {
    return useQuery({
        queryKey: queryKeys.explorer(filters),
        queryFn: () => api.getExplorerGraph(filters),
        staleTime: 60_000,
    });
}

export function useBlastRadius(functionName: string) {
    return useQuery({
        queryKey: queryKeys.blastRadius(functionName),
        queryFn: () => api.getBlastRadius(functionName),
        enabled: !!functionName,
    });
}

// ─── Smart Blame hooks ─────────────────────────────────

export function useExpertForFile(filePath: string) {
    return useQuery({
        queryKey: queryKeys.expert(filePath),
        queryFn: () => api.getExpertForFile(filePath),
        enabled: !!filePath,
    });
}

export function useHeatmap(module?: string) {
    return useQuery({
        queryKey: queryKeys.heatmap(module),
        queryFn: () => api.getHeatmap(module),
        staleTime: 60_000,
    });
}

export function useBusFactor() {
    return useQuery({
        queryKey: queryKeys.busFactor,
        queryFn: () => api.getBusFactor(),
        staleTime: 60_000,
    });
}

export function useGaps() {
    return useQuery({
        queryKey: queryKeys.gaps,
        queryFn: () => api.getGaps(),
        staleTime: 60_000,
    });
}

// ─── Governance hooks ──────────────────────────────────

export function useViolations() {
    return useQuery({
        queryKey: queryKeys.violations,
        queryFn: () => api.getViolations(),
        staleTime: 60_000,
    });
}

export function useDrift() {
    return useQuery({
        queryKey: queryKeys.drift,
        queryFn: () => api.getDrift(),
        staleTime: 60_000,
    });
}

export function useLayers() {
    return useQuery({
        queryKey: queryKeys.layers,
        queryFn: api.getLayers,
        staleTime: 5 * 60_000,
    });
}

// ─── AI hooks ──────────────────────────────────────────

export function useAskAI() {
    return useMutation({
        mutationFn: (query: string) => api.askAI(query),
    });
}

export function useIndexGraph() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.indexGraph,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.graph });
        },
    });
}

// ─── Upload hooks ──────────────────────────────────────

export function useUploadFolder() {
    return useMutation({
        mutationFn: (file: File) => api.uploadFolder(file),
    });
}

export function useUploadGithub() {
    return useMutation({
        mutationFn: (url: string) => api.uploadGithub(url),
    });
}

export function useUploadStatus(enabled = false) {
    return useQuery({
        queryKey: queryKeys.uploadStatus,
        queryFn: api.getUploadStatus,
        enabled,
        refetchInterval: 2_000,
    });
}
