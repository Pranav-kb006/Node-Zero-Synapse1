import { GraduationCap, Code, BarChart3 } from 'lucide-react';

export type Persona = 'learner' | 'engineer' | 'manager';

export interface PersonaFilterConfig {
  hiddenKinds: string[];
  showLabels: boolean;
  labelScale: 'normal' | 'large';
  showComplexity: boolean;
  showMetadata: boolean;
  showRisk: boolean;
  showOwnership: boolean;
  nodeScale: number;
}

interface PersonaPresetsProps {
  activePersona: Persona | null;
  onPersonaChange: (persona: Persona | null) => void;
}

const PERSONA_CONFIGS: Record<Persona, PersonaFilterConfig> = {
  learner: {
    hiddenKinds: ['variable', 'import'],
    showLabels: true,
    labelScale: 'large',
    showComplexity: true,
    showMetadata: false,
    showRisk: false,
    showOwnership: false,
    nodeScale: 1.15,
  },
  engineer: {
    hiddenKinds: [],
    showLabels: true,
    labelScale: 'normal',
    showComplexity: true,
    showMetadata: true,
    showRisk: true,
    showOwnership: true,
    nodeScale: 1,
  },
  manager: {
    hiddenKinds: ['class', 'interface', 'enum', 'struct', 'function', 'method', 'variable', 'import'],
    showLabels: true,
    labelScale: 'normal',
    showComplexity: false,
    showMetadata: false,
    showRisk: true,
    showOwnership: true,
    nodeScale: 1,
  },
};

export function getPersonaConfig(persona: Persona | null): PersonaFilterConfig {
  if (!persona) return PERSONA_CONFIGS.engineer;
  return PERSONA_CONFIGS[persona];
}

export function PersonaPresets({
  activePersona,
  onPersonaChange,
}: PersonaPresetsProps) {
  const personas: { id: Persona; label: string; icon: typeof Code }[] = [
    { id: 'learner', label: 'Learner', icon: GraduationCap },
    { id: 'engineer', label: 'Engineer', icon: Code },
    { id: 'manager', label: 'Manager', icon: BarChart3 },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-synapse-panel/90 backdrop-blur-md border border-white/10">
      {personas.map(({ id, label, icon: Icon }) => {
        const isActive = activePersona === id;
        return (
          <button
            key={id}
            onClick={() => onPersonaChange(isActive ? null : id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              isActive
                ? 'bg-white/10 border border-white/20 text-white/90 shadow-sm'
                : 'border border-transparent text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}
            title={`${label} mode — ${
              id === 'learner'
                ? 'shows classes/functions with enlarged labels'
                : id === 'engineer'
                  ? 'shows everything with full metadata'
                  : 'shows directories and files with risk highlights'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
