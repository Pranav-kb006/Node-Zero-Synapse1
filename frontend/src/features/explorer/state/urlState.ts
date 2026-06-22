import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ExplorerUrlState {
  language: string | null;
  kind: string | null;
  depth: number | null;
  highlightedNode: string | null;
  overlay: string | null;
  persona: string | null;
  tour: string | null;
  tourStep: number | null;
  expanded: string | null;
}

const PARAM_KEYS = {
  language: 'lang',
  kind: 'kind',
  depth: 'depth',
  highlightedNode: 'node',
  overlay: 'overlay',
  persona: 'persona',
  tour: 'tour',
  tourStep: 'step',
  expanded: 'expanded',
} as const;

export function useExplorerUrlState() {
  const [params, setParams] = useSearchParams();

  const state: ExplorerUrlState = useMemo(
    () => ({
      language: params.get(PARAM_KEYS.language),
      kind: params.get(PARAM_KEYS.kind),
      depth: params.get(PARAM_KEYS.depth)
        ? Number(params.get(PARAM_KEYS.depth))
        : null,
      highlightedNode: params.get(PARAM_KEYS.highlightedNode),
      overlay: params.get(PARAM_KEYS.overlay),
      persona: params.get(PARAM_KEYS.persona),
      tour: params.get(PARAM_KEYS.tour),
      tourStep: params.get(PARAM_KEYS.tourStep)
        ? Number(params.get(PARAM_KEYS.tourStep))
        : null,
      expanded: params.get(PARAM_KEYS.expanded),
    }),
    [params],
  );

  const setSearchParam = useCallback(
    (key: keyof typeof PARAM_KEYS, value: string | number | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const paramKey = PARAM_KEYS[key];
        if (value === null || value === '' || value === undefined) {
          next.delete(paramKey);
        } else {
          next.set(paramKey, String(value));
        }
        return next;
      });
    },
    [setParams],
  );

  const clearParams = useCallback(() => {
    setParams(new URLSearchParams());
  }, [setParams]);

  return { state, setSearchParam, clearParams };
}
