import { useEffect } from 'react';

interface DiffOverlayProps {
  changedFileIds: Set<string>;
  affectedNodeIds: Set<string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function DiffOverlay({ changedFileIds, affectedNodeIds, containerRef }: DiffOverlayProps) {
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    const raf = requestAnimationFrame(() => {
      const allChangedIds = new Set([...changedFileIds, ...affectedNodeIds]);

      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        const id = div.getAttribute('data-id') ?? '';
        const isChanged = allChangedIds.has(id);

        if (isChanged) {
          div.style.opacity = '1';
          div.style.border = '2px solid #06b6d4';
          div.style.boxShadow = '0 0 0 3px #06b6d4, 0 0 24px rgba(6,182,212,0.45)';
          div.style.transition = 'all 200ms ease';
        } else {
          div.style.opacity = '0.25';
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
        const isAffected = allChangedIds.has(source) || allChangedIds.has(target);

        if (isAffected) {
          path.style.stroke = '#06b6d4';
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
  }, [changedFileIds, affectedNodeIds, containerRef]);

  return null;
}
