// ── Settings Modal — Unified settings (layout/zoom/sound/etc.) ──

import { useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { vscode } from '../vscodeApi.js';

interface SettingsModalProps {
  onClose: () => void;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  onOpenClaude: (folderPath?: string, bypassPermissions?: boolean) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

const checkboxStyle = (checked: boolean): React.CSSProperties => ({
  width: 14,
  height: 14,
  border: `2px solid ${checked ? 'rgba(0, 240, 255, 0.6)' : 'rgba(100, 140, 255, 0.3)'}`,
  borderRadius: 0,
  background: checked ? 'rgba(0, 180, 255, 0.35)' : 'transparent',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

function PixelCheckbox({ checked }: { checked: boolean }) {
  return (
    <span style={checkboxStyle(checked)} aria-hidden="true">
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth="2" strokeLinecap="square" />
        </svg>
      )}
    </span>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '16px',
  color: 'rgba(0, 240, 255, 0.6)',
  padding: '8px 10px 2px',
  fontWeight: 'bold',
};

export function SettingsModal({
  onClose,
  isEditMode,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  onOpenClaude,
  zoom,
  onZoomChange,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 49 }}
      />
      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'rgba(8, 10, 25, 0.96)',
          border: '2px solid rgba(0, 180, 255, 0.25)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: '0 0 16px rgba(0, 180, 255, 0.08), 2px 2px 0px #0a0a14',
          minWidth: 260,
          maxHeight: '80vh',
          overflowY: 'auto',
          borderTop: '1px solid rgba(0, 240, 255, 0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid rgba(0, 180, 255, 0.2)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Settings</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            X
          </button>
        </div>

        {/* ── Agent ── */}
        <div style={sectionLabel}>Agent</div>
        <button
          onClick={() => {
            onOpenClaude();
            onClose();
          }}
          onMouseEnter={() => setHovered('agent')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            color: '#80ff60',
            background: hovered === 'agent' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          + New Agent
        </button>

        {/* ── Layout ── */}
        <div style={sectionLabel}>Layout</div>
        <button
          role="switch"
          aria-checked={isEditMode}
          onClick={() => {
            onToggleEditMode();
            onClose();
          }}
          onMouseEnter={() => setHovered('edit')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'edit' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Edit Layout</span>
          <PixelCheckbox checked={isEditMode} />
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'exportLayout' });
            onClose();
          }}
          onMouseEnter={() => setHovered('export')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'export' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Export Layout
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'importLayout' });
            onClose();
          }}
          onMouseEnter={() => setHovered('import')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'import' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Import Layout
        </button>

        {/* ── Zoom ── */}
        <div style={sectionLabel}>Zoom</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px' }}>
          <button
            onClick={() => onZoomChange(Math.max(1, zoom - 1))}
            style={{ ...menuItemBase, width: 'auto', padding: '2px 10px', fontSize: '20px' }}
          >
            -
          </button>
          <span
            style={{
              fontSize: '20px',
              color: 'var(--pixel-text)',
              minWidth: 30,
              textAlign: 'center',
            }}
          >
            {zoom}x
          </span>
          <button
            onClick={() => onZoomChange(Math.min(10, zoom + 1))}
            style={{ ...menuItemBase, width: 'auto', padding: '2px 10px', fontSize: '20px' }}
          >
            +
          </button>
        </div>

        {/* ── Display ── */}
        <div style={sectionLabel}>Display</div>
        <button
          role="switch"
          aria-checked={soundLocal}
          onClick={() => {
            const newVal = !isSoundEnabled();
            setSoundEnabled(newVal);
            setSoundLocal(newVal);
            vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
          }}
          onMouseEnter={() => setHovered('sound')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sound' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Sound Notifications</span>
          <PixelCheckbox checked={soundLocal} />
        </button>
        <button
          role="switch"
          aria-checked={watchAllSessions}
          onClick={onToggleWatchAllSessions}
          onMouseEnter={() => setHovered('watchAll')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'watchAll' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Watch All Sessions</span>
          <PixelCheckbox checked={watchAllSessions} />
        </button>
        <button
          role="switch"
          aria-checked={alwaysShowOverlay}
          onClick={onToggleAlwaysShowOverlay}
          onMouseEnter={() => setHovered('overlay')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'overlay' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Always Show Labels</span>
          <PixelCheckbox checked={alwaysShowOverlay} />
        </button>
        <button
          onClick={onToggleDebugMode}
          onMouseEnter={() => setHovered('debug')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'debug' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Debug View</span>
          {isDebugMode && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(90, 140, 255, 0.8)',
                flexShrink: 0,
              }}
            />
          )}
        </button>

        {/* ── Assets ── */}
        <div style={sectionLabel}>Assets</div>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'openSessionsFolder' });
            onClose();
          }}
          onMouseEnter={() => setHovered('sessions')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sessions' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Open Sessions Folder
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'addExternalAssetDirectory' });
            onClose();
          }}
          onMouseEnter={() => setHovered('addAssets')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'addAssets' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Add Asset Directory
        </button>
        {externalAssetDirectories.map((dir) => (
          <div
            key={dir}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.5)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 180,
              }}
              title={dir}
            >
              {dir.split(/[/\\]/).pop() ?? dir}
            </span>
            <button
              onClick={() =>
                vscode.postMessage({ type: 'removeExternalAssetDirectory', path: dir })
              }
              onMouseEnter={() => setHovered(`remove-${dir}`)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: hovered === `remove-${dir}` ? 'rgba(255, 80, 80, 0.2)' : 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 0,
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '1px 6px',
                flexShrink: 0,
              }}
            >
              X
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
