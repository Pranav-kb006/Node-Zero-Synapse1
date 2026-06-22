import { useEffect } from 'react';

interface BlastRadiusOverlayProps {
  targetId: string;
  affectedNodeIds: Set<string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function BlastRadiusOverlay({ targetId, affectedNodeIds, containerRef }: BlastRadiusOverlayProps) {
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    const raf = requestAnimationFrame(() => {
      const allNodeIds = new Set([...affectedNodeIds, targetId]);

      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        const id = div.getAttribute('data-id') ?? '';
        if (allNodeIds.has(id)) {
          div.style.opacity = '1';
          div.style.boxShadow = id === targetId
            ? '0 0 0 3px #34d399, 0 0 24px rgba(52,211,153,0.4)'
            : '0 0 0 2px rgba(52,211,153,0.3), 0 0 12px rgba(52,211,153,0.2)';
          div.style.transition = 'all 200ms ease';
        } else {
          div.style.opacity = '0.2';
          div.style.boxShadow = '';
          div.style.transition = 'all 200ms ease';
        }
      });

      wrapper.querySelectorAll<SVGGElement>('.react-flow__edge').forEach(g => {
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;

        const source = g.getAttribute('data-source') ?? '';
        const target = g.getAttribute('data-target') ?? '';
        const isAffected = allNodeIds.has(source) && allNodeIds.has(target);

        if (isAffected) {
          path.style.stroke = '#34d399';
          path.style.strokeWidth = '2.5';
          path.style.opacity = '1';
        } else {
          path.style.opacity = '0.05';
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
  }, [targetId, affectedNodeIds, containerRef]);

  return null;
}
