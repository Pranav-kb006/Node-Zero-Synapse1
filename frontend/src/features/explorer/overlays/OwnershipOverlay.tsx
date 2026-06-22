import { useEffect } from 'react';

interface OwnershipOverlayProps {
  lowBusFactorNodes: Set<string>;
  busFactorData: Record<string, number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const BUS_FACTOR_COLORS: Record<number, { border: string; shadow: string; badge: string }> = {
  0: {
    border: '#f43f5e',
    shadow: '0 0 0 3px #f43f5e, 0 0 24px rgba(244,63,94,0.4)',
    badge: '#f43f5e',
  },
  1: {
    border: '#f43f5e',
    shadow: '0 0 0 2px #f43f5e, 0 0 16px rgba(244,63,94,0.35)',
    badge: '#f43f5e',
  },
  2: {
    border: '#f59e0b',
    shadow: '0 0 0 2px #f59e0b, 0 0 12px rgba(245,158,11,0.3)',
    badge: '#f59e0b',
  },
};

const BADGE_STYLES = `
@keyframes ownership-badge-enter {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.ownership-bus-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 22px;
  height: 22px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  pointer-events: none;
  z-index: 10;
  animation: ownership-badge-enter 200ms ease-out;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
}
`;

export function OwnershipOverlay({ lowBusFactorNodes, busFactorData, containerRef }: OwnershipOverlayProps) {
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    let styleEl: HTMLStyleElement | null = null;

    const raf = requestAnimationFrame(() => {
      styleEl = document.createElement('style');
      styleEl.textContent = BADGE_STYLES;
      document.head.appendChild(styleEl);

      wrapper.querySelectorAll<HTMLDivElement>('.react-flow__node').forEach(div => {
        const id = div.getAttribute('data-id') ?? '';
        const busFactor = busFactorData[id];
        const isLow = lowBusFactorNodes.has(id);

        if (isLow && busFactor !== undefined) {
          const bf = Math.min(busFactor, 2);
          const colors = BUS_FACTOR_COLORS[bf];
          div.style.border = `2px solid ${colors.border}`;
          div.style.boxShadow = colors.shadow;
          div.style.opacity = '1';
          div.style.transition = 'all 200ms ease';

          // Remove old badge if present
          const existingBadge = div.querySelector('.ownership-bus-badge');
          if (existingBadge) existingBadge.remove();

          // Add bus factor badge
          const badge = document.createElement('div');
          badge.className = 'ownership-bus-badge';
          badge.style.backgroundColor = colors.badge;
          badge.textContent = String(busFactor);
          div.style.position = div.style.position || 'relative';
          div.appendChild(badge);
        } else {
          div.style.opacity = '0.6';
          div.style.border = '';
          div.style.boxShadow = '';
          div.style.transition = 'all 200ms ease';

          const existingBadge = div.querySelector('.ownership-bus-badge');
          if (existingBadge) existingBadge.remove();
        }
      });

      wrapper.querySelectorAll<SVGGElement>('.react-flow__edge').forEach(g => {
        const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
        if (!path) return;

        const source = g.getAttribute('data-source') ?? '';
        const target = g.getAttribute('data-target') ?? '';
        const isLow = lowBusFactorNodes.has(source) || lowBusFactorNodes.has(target);

        if (isLow) {
          const bfSource = busFactorData[source];
          const bfTarget = busFactorData[target];
          const bf = Math.min(
            bfSource ?? 3,
            bfTarget ?? 3,
          );
          const clampedBf = Math.min(bf, 2);
          const colors = BUS_FACTOR_COLORS[clampedBf];
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
      // Clean up any remaining badges
      wrapper?.querySelectorAll('.ownership-bus-badge').forEach(el => el.remove());
    };
  }, [lowBusFactorNodes, busFactorData, containerRef]);

  return null;
}
