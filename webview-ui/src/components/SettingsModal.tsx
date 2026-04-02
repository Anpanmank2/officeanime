import { useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { vscode } from '../vscodeApi.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
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

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);

  if (!isOpen) return null;

  return (
    <>
      {/* Dark backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 49,
        }}
      />
      {/* Centered modal */}
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
          minWidth: 200,
          borderTop: '1px solid rgba(0, 240, 255, 0.3)',
        }}
      >
        {/* Header with title and X button */}
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
            aria-label="Close settings"
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {/* Menu items */}
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
              aria-label={`Remove asset directory: ${dir.split(/[/\\]/).pop() ?? dir}`}
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
      </div>
    </>
  );
}
