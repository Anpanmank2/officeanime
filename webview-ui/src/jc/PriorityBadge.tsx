// ── Priority Badge — P0-P4 colored label ───────────────────────

import { PRIORITY_COLORS, PRIORITY_LABELS } from './jc-constants.js';

export function PriorityBadge({ priority }: { priority: number }) {
  const color = PRIORITY_COLORS[priority] ?? '#8b949e';
  const label = PRIORITY_LABELS[priority] ?? `P${priority}`;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#fff',
        background: color,
        border: `1px solid ${color}`,
        borderRadius: 0,
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
}
