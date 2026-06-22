import { useEffect } from 'react';

interface GovernanceViolation {
  file_path: string;
  severity: string;
  message: string;
  from_module?: string;
  to_module?: string;
}

interface GovernanceOverlayProps {
  violations: GovernanceViolation[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const SEVERITY_COLORS: Record<string, { border: string; shadow: string }> = {
  CRITICAL: {
    border: '#ef4444',
    shadow: '0 0 0 3px #ef4444, 0 0 24px rgba(239,68,68,0.4)',
  },
  HIGH: {
    border: '#f43f5e',
    shadow: '0 0 0 2px #f43f5e, 0 0 16px rgba(244,63,94,0.3)',
  },
  MEDIUM: {
    border: '#f59e0b',
    shadow: '0 0 0 2px #f59e0b, 0 0 12px rgba(245,158,11,0.25)',
  },
  LOW: {
    border: '#64748b',
    shadow: '0 0 0 1px #64748b',
  },
};

const CRITICAL_PULSE_KEYFRAMES = `
@keyframes governance-critical-pulse {
  0%, 100% { box-shadow: 0 0 0 3px #ef4444, 0 0 24px rgba(239,68,68,0.4); }
  50% { box-shadow: 0 0 0 4px rgba(239,68,68,0.6), 0 0 32px rgba(239,68,68,0.5); }
}
`;

export function GovernanceOverlay({ violations, containerRef }: GovernanceOverlayProps) {
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    let styleEl: HTMLStyleElement | null = null;
    
    // Normalize and build maps/sets for matching
    const normalizedViolations = (violations ?? []).map(v => {
      const fp = v.file_path ? v.file_path.replace(/\\/g, '/').replace(/^\.\//, '') : '';
      return { ...v, normalized_path: fp };
    });

    const violationPaths = new Set<string>();
    const violationByNodeId = new Map<string, GovernanceViolation['severity']>();

    normalizedViolations.forEach(v => {
      if (!v.normalized_path) return;
      violationPaths.add(v.normalized_path);
      violationByNodeId.set(v.normalized_path, v.severity);
      violationByNodeId.set(`file:${v.normalized_path}`, v.severity);
      violationByNodeId.set(`dir:${v.normalized_path}`, v.severity);
      
      if (v.from_module) {
        violationByNodeId.set(v.from_module, v.severity);
        violationByNodeId.set(`dir:${v.from_module}`, v.severity);
      }
      if (v.to_module) {
        violationByNodeId.set(v.to_module, v.severity);
        violationByNodeId.set(`dir:${v.to_module}`, v.severity);
      }
    });

    const raf = requestAnimationFrame(() => {
      // Inject pulse animation
      styleEl = document.createElement('style');
      styleEl.textContent = CRITICAL_PULSE_KEYFRAMES;
      document.head.appendChild(styleEl);

      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        const id = div.getAttribute('data-id') ?? '';
        const severity = violationByNodeId.get(id);

        if (severity) {
          const sevKey = severity.toUpperCase();
          const colors = SEVERITY_COLORS[sevKey] || SEVERITY_COLORS.LOW;
          div.style.border = `2px solid ${colors.border}`;
          div.style.boxShadow = colors.shadow;
          div.style.opacity = '1';
          div.style.transition = 'all 200ms ease';

          if (sevKey === 'CRITICAL') {
            div.style.animation = 'governance-critical-pulse 2s ease-in-out infinite';
          }
        } else {
          div.style.opacity = '0.6';
          div.style.border = '';
          div.style.boxShadow = '';
          div.style.animation = '';
          div.style.transition = 'all 200ms ease';
        }
      });

      wrapper.querySelectorAll<SVGGElement>('.react-flow__edge').forEach(g => {
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;

        const source = g.getAttribute('data-source') ?? '';
        const target = g.getAttribute('data-target') ?? '';
        const isViolation = violationByNodeId.has(source) || violationByNodeId.has(target);

        if (isViolation) {
          const severity = violationByNodeId.get(source) ?? violationByNodeId.get(target) ?? 'MEDIUM';
          const sevKey = severity.toUpperCase();
          const colors = SEVERITY_COLORS[sevKey] || SEVERITY_COLORS.MEDIUM;
          path.style.stroke = colors.border;
          path.style.strokeWidth = '2';
          path.style.opacity = '1';
        } else {
          path.style.opacity = '0.15';
        }
        path.style.transition = 'all 200ms ease';
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      styleEl?.remove();
    };
  }, [violations, containerRef]);

  return null;
}
