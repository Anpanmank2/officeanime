// ── Dept Filter Chips — exec/engineering/marketing/research filter ──
// localStorage key 'jc.deptFilter' persists selected departments.

import { useEffect, useState } from 'react';

import { DEPT_COLORS } from './jc-constants.js';

const LS_KEY = 'jc.deptFilter';

const DEPT_CHIPS: Array<{ id: string; label: string }> = [
  { id: 'exec', label: 'EXEC' },
  { id: 'engineering', label: 'ENG' },
  { id: 'marketing', label: 'MKT' },
  { id: 'research', label: 'RES' },
];

function readFilter(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEPT_CHIPS.map((c) => c.id); // default: all selected
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    return DEPT_CHIPS.map((c) => c.id);
  } catch {
    return DEPT_CHIPS.map((c) => c.id);
  }
}

function writeFilter(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

interface DeptFilterChipsProps {
  /** Called with current selected dept array whenever selection changes */
  onChange: (selected: string[]) => void;
}

export function DeptFilterChips({ onChange }: DeptFilterChipsProps) {
  const [selected, setSelected] = useState<string[]>(readFilter);

  useEffect(() => {
    onChange(selected);
  }, [selected, onChange]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    // Keep at least one selected
    if (next.length === 0) return;
    setSelected(next);
    writeFilter(next);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexWrap: 'wrap',
      }}
    >
      {DEPT_CHIPS.map(({ id, label }) => {
        const color = DEPT_COLORS[id] ?? '#888';
        const active = selected.includes(id);
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              background: active ? `${color}22` : 'transparent',
              color: active ? color : 'var(--pixel-text-dim)',
              border: active ? `1px solid ${color}88` : '1px solid rgba(255,255,255,0.15)',
              borderRadius: 0,
              cursor: 'pointer',
              lineHeight: 1.4,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
