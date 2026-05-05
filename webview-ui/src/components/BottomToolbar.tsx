// ── Bottom Toolbar — 3 buttons: + Command, Tasks, Settings ──────

import { ModeSwitcher } from '../jc/ModeSwitcher.js';

interface BottomToolbarProps {
  isTaskHistoryOpen: boolean;
  onToggleTaskHistory: () => void;
  onOpenSettings: () => void;
  isSettingsOpen: boolean;
  /** Whether the Owner avatar is currently active in the office */
  ownerAvatarActive?: boolean;
  /** Toggle Owner avatar (summon / dismiss) */
  onToggleOwner?: () => void;
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'rgba(200, 210, 240, 0.85)',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '2px solid rgba(100, 140, 255, 0.15)',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: '0.5px',
};

export function BottomToolbar(props: BottomToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        left: 10,
        right: 296,
        zIndex: 50,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left group: existing buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        {/* Owner summon button */}
        {props.onToggleOwner !== undefined && (
          <button
            style={{
              ...btnBase,
              fontSize: '9px',
              fontFamily: "'FS Pixel Sans', sans-serif",
              color: props.ownerAvatarActive ? '#ffd740' : 'rgba(255, 215, 64, 0.6)',
              background: props.ownerAvatarActive
                ? 'rgba(255, 215, 64, 0.15)'
                : 'rgba(255, 215, 64, 0.06)',
              border: `2px solid ${props.ownerAvatarActive ? 'rgba(255, 215, 64, 0.7)' : 'rgba(255, 215, 64, 0.25)'}`,
            }}
            onClick={props.onToggleOwner}
            title={props.ownerAvatarActive ? 'Owner を退場させる' : 'Summon Owner'}
            aria-label="Summon Owner"
          >
            OWNER
          </button>
        )}
        {/* Tasks button */}
        <button
          style={{
            ...btnBase,
            color: props.isTaskHistoryOpen ? '#5a8cff' : undefined,
            background: props.isTaskHistoryOpen ? 'rgba(90, 140, 255, 0.15)' : undefined,
            border: props.isTaskHistoryOpen ? '2px solid rgba(90, 140, 255, 0.5)' : undefined,
          }}
          onClick={props.onToggleTaskHistory}
        >
          Tasks
        </button>

        {/* Settings button */}
        <button
          style={{
            ...btnBase,
            color: props.isSettingsOpen ? '#5a8cff' : undefined,
            background: props.isSettingsOpen ? 'rgba(90, 140, 255, 0.15)' : undefined,
            border: props.isSettingsOpen ? '2px solid rgba(90, 140, 255, 0.5)' : undefined,
          }}
          onClick={props.onOpenSettings}
        >
          Settings
        </button>
      </div>

      {/* Right group: mode switcher */}
      <ModeSwitcher />
    </div>
  );
}
