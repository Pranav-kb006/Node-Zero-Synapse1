// Overlay types and reducer for the explorer
// Overlays: blast-radius, governance, ownership, risk, diff

export type OverlayKind = 'blast-radius' | 'governance' | 'ownership' | 'risk' | 'diff';

export interface BlastRadiusOverlay {
  kind: 'blast-radius';
  targetId: string;
  affectedNodeIds: Set<string>;
  affectedEdgeIds: Set<string>;
}

export interface GovernanceOverlay {
  kind: 'governance';
  violationNodeIds: Set<string>;
  violationEdgeIds: Set<string>;
  violations: Array<{
    file_path: string;
    line_number: number;
    from_module: string;
    to_module: string;
    severity: string;
    message: string;
    rule_name: string;
  }>;
}

export interface OwnershipOverlay {
  kind: 'ownership';
  lowBusFactorNodes: Set<string>;
  busFactorData: Record<string, number>;
}

export interface RiskOverlay {
  kind: 'risk';
  riskNodeIds: Set<string>;
  riskLevels: Record<string, string>;
}

export interface DiffOverlay {
  kind: 'diff';
  changedFileIds: Set<string>;
  affectedNodeIds: Set<string>;
}

export type ActiveOverlay =
  | BlastRadiusOverlay
  | GovernanceOverlay
  | OwnershipOverlay
  | RiskOverlay
  | DiffOverlay;

export interface OverlayState {
  active: OverlayKind | null;
  data: ActiveOverlay | null;
  blastRadiusInput: string;
}

export type OverlayAction =
  | { type: 'SET_OVERLAY'; kind: OverlayKind; data: ActiveOverlay }
  | { type: 'CLEAR_OVERLAY' }
  | { type: 'SET_BLAST_RADIUS_INPUT'; value: string };

export const initialOverlayState: OverlayState = {
  active: null,
  data: null,
  blastRadiusInput: '',
};

export function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case 'SET_OVERLAY':
      return { ...state, active: action.kind, data: action.data };
    case 'CLEAR_OVERLAY':
      return { ...state, active: null, data: null };
    case 'SET_BLAST_RADIUS_INPUT':
      return { ...state, blastRadiusInput: action.value };
    default:
      return state;
  }
}
