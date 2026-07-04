// ── Bottom Toolbar — Owner (出社/退社), しごと帳, 設定 ──────
// Labels/titles centralized in UI_TEXT (jc-constants) per 2026-07-03 藤井 UI spec §4.
// 委任ドックと同系のダークネイビー + 2px ボーダー(角丸なし)で白浮きを解消。

import { UI_TEXT } from '../jc/jc-constants.js';

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
  fontSize: '12px',
  color: '#D8D2C4',
  background: 'rgba(38, 43, 47, 0.94)',
  border: '2px solid rgba(46, 158, 144, 0.45)',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: '0.5px',
};

// ⚠ `key: cond ? x : undefined` は spread 後に btnBase を undefined で上書きし
// UA 既定 (白ボタン) に落ちる — 旧「白浮き」の根因。active 時のみ上書きする。
const btnActive: React.CSSProperties = {
  color: '#5a8cff',
  background: 'rgba(90, 140, 255, 0.15)',
  border: '2px solid rgba(90, 140, 255, 0.5)',
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
        {/* Owner summon button — 出社する/退社する toggle */}
        {props.onToggleOwner !== undefined && (
          <button
            style={{
              ...btnBase,
              color: props.ownerAvatarActive ? '#E4C36E' : 'rgba(255, 215, 64, 0.85)',
              background: props.ownerAvatarActive
                ? 'rgba(255, 215, 64, 0.15)'
                : 'rgba(38, 43, 47, 0.94)',
              border: `2px solid ${props.ownerAvatarActive ? 'rgba(255, 215, 64, 0.7)' : 'rgba(255, 215, 64, 0.35)'}`,
            }}
            onClick={props.onToggleOwner}
            title={UI_TEXT.ownerButtonTitle}
            aria-label={UI_TEXT.ownerButtonTitle}
          >
            {props.ownerAvatarActive ? UI_TEXT.ownerLeave : UI_TEXT.ownerArrive}
          </button>
        )}
        {/* しごと帳 (task history) button */}
        <button
          style={{ ...btnBase, ...(props.isTaskHistoryOpen ? btnActive : {}) }}
          onClick={props.onToggleTaskHistory}
          title={UI_TEXT.tasksButtonTitle}
        >
          {UI_TEXT.tasksButton}
        </button>

        {/* 設定 (settings) button */}
        <button
          style={{ ...btnBase, ...(props.isSettingsOpen ? btnActive : {}) }}
          onClick={props.onOpenSettings}
          title={UI_TEXT.settingsButtonTitle}
        >
          {UI_TEXT.settingsButton}
        </button>
      </div>

      {/* DEFER: mode switcher removed — view mode fixed to command */}
    </div>
  );
}
