import { useEffect } from 'react';

interface RiskOverlayProps {
  riskNodeIds: Set<string>;
  riskLevels: Record<string, string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function RiskOverlay({ riskNodeIds, riskLevels, containerRef }: RiskOverlayProps) {
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    const raf = requestAnimationFrame(() => {
      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        const id = div.getAttribute('data-id') ?? '';
        const level = riskLevels[id];

        if (level === 'CRITICAL' || level === 'HIGH') {
          div.style.opacity = '1';
          div.style.border = level === 'CRITICAL' ? '2px solid #ef4444' : '2px solid #f43f5e';
          div.style.boxShadow = level === 'CRITICAL'
            ? '0 0 0 3px #ef4444, 0 0 24px rgba(239,68,68,0.45)'
            : '0 0 0 2px #f43f5e, 0 0 16px rgba(244,63,94,0.3)';
          div.style.transition = 'all 200ms ease';
        } else if (level === 'MEDIUM') {
          div.style.opacity = '0.9';
          div.style.border = '2px solid #f59e0b';
          div.style.boxShadow = '0 0 0 1px #f59e0b';
          div.style.transition = 'all 200ms ease';
        } else {
          div.style.opacity = '0.3';
          div.style.border = '';
          div.style.boxShadow = '';
          div.style.transition = 'all 200ms ease';
        }
      });

      wrapper.querySelectorAll<SVGGElement>('.react-flow__edge').forEach(g => {
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;

        const source = g.getAttribute('data-source') ?? '';
        const target = g.getAttribute('data-target') ?? '';
        const isHighRisk = (riskLevels[source] === 'CRITICAL' || riskLevels[source] === 'HIGH') ||
                           (riskLevels[target] === 'CRITICAL' || riskLevels[target] === 'HIGH');

        if (isHighRisk) {
          const level = riskLevels[source] === 'CRITICAL' || riskLevels[target] === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
          path.style.stroke = level === 'CRITICAL' ? '#ef4444' : '#f43f5e';
          path.style.strokeWidth = '2';
          path.style.opacity = '1';
        } else {
          path.style.opacity = '0.1';
        }
        path.style.transition = 'all 200ms ease';
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        div.style.opacity = '';
        div.style.boxShadow = '';
        div.style.border = '';
      });
      wrapper.querySelectorAll<SVGGElement>('.react-flow__edge').forEach(g => {
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.opacity = '';
      });
    };
  }, [riskNodeIds, riskLevels, containerRef]);

  return null;
}
