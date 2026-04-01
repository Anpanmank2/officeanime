import { useEffect, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import type { BroadcastMessage } from '../jc/BroadcastOverlay.js';
import { BroadcastOverlay } from '../jc/BroadcastOverlay.js';
import { jcGetAllTasks, jcGetMemberNames } from '../jc/jc-state.js';
import { KanbanPanel } from '../jc/KanbanPanel.js';
import { vscode } from '../vscodeApi.js';
import { SettingsModal } from './SettingsModal.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onToggleEditMode: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  workspaceFolders: WorkspaceFolder[];
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
};

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-active-bg)',
  border: '2px solid var(--pixel-accent)',
};

export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  workspaceFolders,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const [hoveredFolder, setHoveredFolder] = useState<number | null>(null);
  const [hoveredBypass, setHoveredBypass] = useState<number | null>(null);
  const [isKanbanOpen, setIsKanbanOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastMode, setBroadcastMode] = useState<'instant' | 'directive'>('instant');
  const [broadcastMsg, setBroadcastMsg] = useState<BroadcastMessage | null>(null);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const broadcastRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);

  // Close folder picker / bypass menu / broadcast on outside click
  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen && !isBroadcastOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
      if (broadcastRef.current && !broadcastRef.current.contains(e.target as Node)) {
        setIsBroadcastOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen, isBroadcastOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsFolderPickerOpen(false);
    setIsBypassMenuOpen((v) => !v);
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      vscode.postMessage({ type: 'openClaude', bypassPermissions });
    }
  };

  const handleBroadcastSend = () => {
    if (!broadcastText.trim()) return;
    vscode.postMessage({
      type: 'broadcast:send',
      text: broadcastText.trim(),
      mode: broadcastMode,
    });
    setBroadcastMsg({ text: broadcastText.trim(), timestamp: Date.now() });
    setBroadcastText('');
    setIsBroadcastOpen(false);
  };

  const handleBroadcastKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBroadcastSend();
    }
  };

  return (
    <div style={panelStyle}>
      <div ref={folderPickerRef} style={{ position: 'relative' }}>
        <button
          onClick={handleAgentClick}
          onContextMenu={handleAgentRightClick}
          onMouseEnter={() => setHovered('agent')}
          onMouseLeave={() => setHovered(null)}
          aria-label="Add new agent (right-click for options)"
          style={{
            ...btnBase,
            padding: '5px 12px',
            background:
              hovered === 'agent' || isFolderPickerOpen || isBypassMenuOpen
                ? 'var(--pixel-agent-hover-bg)'
                : 'var(--pixel-agent-bg)',
            border: '2px solid var(--pixel-agent-border)',
            color: 'var(--pixel-agent-text)',
          }}
        >
          + Agent
        </button>
        {isBypassMenuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              padding: 4,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 180,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            <button
              onClick={() => handleBypassSelect(false)}
              onMouseEnter={() => setHoveredBypass(0)}
              onMouseLeave={() => setHoveredBypass(null)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: '24px',
                color: 'var(--pixel-text)',
                background: hoveredBypass === 0 ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              Normal
            </button>
            <div style={{ height: 1, margin: '4px 0', background: 'var(--pixel-border)' }} />
            <button
              onClick={() => handleBypassSelect(true)}
              onMouseEnter={() => setHoveredBypass(1)}
              onMouseLeave={() => setHoveredBypass(null)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: '24px',
                color: 'var(--pixel-warning-text)',
                background: hoveredBypass === 1 ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '16px' }}>⚡</span> Bypass Permissions
            </button>
          </div>
        )}
        {isFolderPickerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 160,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            {workspaceFolders.map((folder, i) => (
              <button
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                onMouseEnter={() => setHoveredFolder(i)}
                onMouseLeave={() => setHoveredFolder(null)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: '22px',
                  color: 'var(--pixel-text)',
                  background: hoveredFolder === i ? 'var(--pixel-btn-hover-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background:
                    hovered === 'settings' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
          alwaysShowOverlay={alwaysShowOverlay}
          onToggleAlwaysShowOverlay={onToggleAlwaysShowOverlay}
          externalAssetDirectories={externalAssetDirectories}
          watchAllSessions={watchAllSessions}
          onToggleWatchAllSessions={onToggleWatchAllSessions}
        />
      </div>
      {/* Tasks button */}
      <button
        onClick={() => setIsKanbanOpen((v) => !v)}
        onMouseEnter={() => setHovered('tasks')}
        onMouseLeave={() => setHovered(null)}
        style={
          isKanbanOpen
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'tasks' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Task board"
      >
        Tasks
      </button>
      {/* Broadcast button */}
      <div ref={broadcastRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsBroadcastOpen((v) => !v)}
          onMouseEnter={() => setHovered('broadcast')}
          onMouseLeave={() => setHovered(null)}
          style={
            isBroadcastOpen
              ? { ...btnActive, border: '2px solid #ffd700' }
              : {
                  ...btnBase,
                  background:
                    hovered === 'broadcast' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
                  color: '#ffd700',
                }
          }
          title="Broadcast to all agents"
        >
          Broadcast
        </button>
        {isBroadcastOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid #ffd700',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 240,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            <div
              style={{
                padding: '4px 6px',
                borderBottom: '1px solid #ffd70055',
                color: '#ffd700',
                fontSize: '16px',
                letterSpacing: '1px',
              }}
            >
              OWNER BROADCAST
            </div>
            <div style={{ padding: '6px' }}>
              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <button
                  onClick={() => setBroadcastMode('instant')}
                  style={{
                    flex: 1,
                    padding: '2px 4px',
                    fontSize: '14px',
                    color: broadcastMode === 'instant' ? '#fff' : 'var(--pixel-text-dim)',
                    background: broadcastMode === 'instant' ? '#ffd70044' : 'transparent',
                    border: `1px solid ${broadcastMode === 'instant' ? '#ffd700' : 'var(--pixel-border)'}`,
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  Send All
                </button>
                <button
                  onClick={() => setBroadcastMode('directive')}
                  style={{
                    flex: 1,
                    padding: '2px 4px',
                    fontSize: '14px',
                    color: broadcastMode === 'directive' ? '#fff' : 'var(--pixel-text-dim)',
                    background: broadcastMode === 'directive' ? '#ffd70044' : 'transparent',
                    border: `1px solid ${broadcastMode === 'directive' ? '#ffd700' : 'var(--pixel-border)'}`,
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  Directive
                </button>
              </div>
              {/* Textarea */}
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                onKeyDown={handleBroadcastKeyDown}
                placeholder="Broadcast to all agents..."
                style={{
                  width: '100%',
                  height: 48,
                  padding: '4px',
                  fontSize: '16px',
                  color: 'var(--pixel-text)',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              {/* Send button */}
              <button
                onClick={handleBroadcastSend}
                disabled={!broadcastText.trim()}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '4px 8px',
                  fontSize: '16px',
                  color: broadcastText.trim() ? '#fff' : 'var(--pixel-text-dim)',
                  background: broadcastText.trim() ? '#ffd70066' : 'var(--pixel-btn-bg)',
                  border: `2px solid ${broadcastText.trim() ? '#ffd700' : 'var(--pixel-border)'}`,
                  borderRadius: 0,
                  cursor: broadcastText.trim() ? 'pointer' : 'default',
                }}
              >
                Broadcast
              </button>
            </div>
          </div>
        )}
      </div>
      {broadcastMsg && <BroadcastOverlay message={broadcastMsg} />}
      <KanbanPanel
        isOpen={isKanbanOpen}
        onClose={() => setIsKanbanOpen(false)}
        tasks={jcGetAllTasks()}
        memberNames={jcGetMemberNames()}
      />
    </div>
  );
}
