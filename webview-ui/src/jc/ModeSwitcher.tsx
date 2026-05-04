// ── Just Curious — Mode Switcher ─────────────────────────────────
// Icon button pair: 🏛 (command) / 📊 (serious)
// Highlights the active mode and switches on click.

import type { ViewMode } from './mode-store.js';
import { useViewMode } from './mode-store.js';

interface ModeButtonProps {
  icon: string;
  mode: ViewMode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ModeButton({ icon, label, isActive, onClick }: ModeButtonProps) {
  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        padding: '4px 8px',
        fontSize: '20px',
        background: isActive ? 'rgba(90, 140, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
        color: isActive ? '#5a8cff' : 'rgba(200, 210, 240, 0.7)',
        border: isActive
          ? '2px solid rgba(90, 140, 255, 0.6)'
          : '2px solid rgba(100, 140, 255, 0.15)',
        borderRadius: 0,
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      {icon}
    </button>
  );
}

export function ModeSwitcher() {
  const { viewMode, setViewMode } = useViewMode();

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <ModeButton
        icon="🏛"
        mode="command"
        label="司令部モード"
        isActive={viewMode === 'command'}
        onClick={() => setViewMode('command')}
      />
      <ModeButton
        icon="📊"
        mode="serious"
        label="真面目モード"
        isActive={viewMode === 'serious'}
        onClick={() => setViewMode('serious')}
      />
    </div>
  );
}
