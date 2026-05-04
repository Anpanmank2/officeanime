import { useCallback, useEffect, useRef, useState } from 'react';

import { toMajorMinor } from './changelogData.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { DebugView } from './components/DebugView.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TokenHPBar } from './components/TokenHPBar.js';
import { VersionIndicator } from './components/VersionIndicator.js';
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { AbsentStatusPopup } from './jc/AbsentStatusPopup.js';
import { DeskCard } from './jc/DeskCard.js';
import { DialogBox } from './jc/DialogBox.js';
import { DEPT_COLORS } from './jc/jc-constants.js';
import {
  jcGetMemberInfo,
  jcGetOwnerAvatarState,
  jcSetOwnerAvatarState,
  subscribeOwnerAvatar,
} from './jc/jc-state.js';
import type { AbsenceInfo, OwnerAvatarState } from './jc/jc-types.js';
import { JCMemberInfoPanel } from './jc/JCMemberInfoPanel.js';
import { useViewMode } from './jc/mode-store.js';
import { ModeProvider } from './jc/ModeContext.js';
import { getLogEntries, subscribeLog } from './jc/office-log-state.js';
import { OfficeLog } from './jc/OfficeLog.js';
import { OWNER_AGENT_ID } from './jc/owner-avatar-constants.js';
import { OwnerAvatar } from './jc/OwnerAvatar.js';
import { TaskHistoryPanel } from './jc/TaskHistoryPanel.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool } from './office/types.js';
import { isBrowserRuntime } from './runtime.js';
import { vscode } from './vscodeApi.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
};

function EditActionBar({
  editor,
  editorState: es,
}: {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button style={actionBarBtnStyle} onClick={editor.handleSave} title="Save layout">
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => {
              setShowResetConfirm(false);
              editor.handleReset();
            }}
          >
            Yes
          </button>
          <button style={actionBarBtnStyle} onClick={() => setShowResetConfirm(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

// ── Command Board — shown only in command mode ────────────────────
// Ticker showing latest 5 OfficeLog entries + operation board placeholder.

function CommandBoard() {
  const [recentEntries, setRecentEntries] = useState(() => getLogEntries().slice(-5).reverse());

  useEffect(() => {
    const update = () => setRecentEntries(getLogEntries().slice(-5).reverse());
    return subscribeLog(update);
  }, []);

  return (
    <>
      {/* Ticker: top bar showing latest 5 events */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 48,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'rgba(8, 10, 25, 0.88)',
          border: '2px solid rgba(0, 180, 255, 0.2)',
          padding: '4px 10px',
          maxWidth: '60%',
          overflow: 'hidden',
        }}
      >
        {recentEntries.length === 0 ? (
          <span style={{ fontSize: '12px', color: 'rgba(200,210,240,0.4)' }}>No activity</span>
        ) : (
          recentEntries.map((entry) => (
            <span
              key={entry.id}
              style={{
                fontSize: '12px',
                color: DEPT_COLORS[entry.department] ?? '#aaa',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 160,
              }}
              title={`${entry.memberName}: ${entry.summary}`}
            >
              [{entry.memberName}] {entry.summary}
            </span>
          ))
        )}
      </div>

      {/* Operation board placeholder */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 45,
          background: 'rgba(8, 10, 25, 0.75)',
          border: '2px solid rgba(0, 180, 255, 0.25)',
          padding: '16px 24px',
          minWidth: 280,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: '16px', color: '#00f0ff', fontWeight: 'bold', marginBottom: 8 }}>
          🏛 COMMAND BOARD
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(200,210,240,0.5)' }}>
          Operation board — Phase 2
        </div>
      </div>
    </>
  );
}

function AppContent() {
  // Browser runtime (dev or static dist): dispatch mock messages after the
  // useExtensionMessages listener has been registered.
  useEffect(() => {
    if (isBrowserRuntime) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    }
  }, []);

  const { viewMode } = useViewMode();

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    agentTokenUsage,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);

  // ── New panel states ──
  const [isTaskHistoryOpen, setIsTaskHistoryOpen] = useState(false);
  const [isOfficeLogOpen, setIsOfficeLogOpen] = useState(true); // always open by default
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Owner avatar state (reactive sync from imperative store)
  const [ownerAvatarState, setOwnerAvatarStateLocal] =
    useState<OwnerAvatarState>(jcGetOwnerAvatarState);
  useEffect(() => {
    return subscribeOwnerAvatar(() => {
      setOwnerAvatarStateLocal(jcGetOwnerAvatarState());
    });
  }, []);

  // DialogBox state: opened when owner is active and clicks a member character
  const [dialogTarget, setDialogTarget] = useState<{
    memberId: string;
    memberName: string;
  } | null>(null);

  const handleToggleTaskHistory = useCallback(() => {
    setIsTaskHistoryOpen((prev) => !prev);
  }, []);

  // Absent desk popup state
  const [absentPopup, setAbsentPopup] = useState<{
    info: AbsenceInfo;
    position: { x: number; y: number };
  } | null>(null);

  const handleAbsentDeskClick = useCallback(
    (info: AbsenceInfo, screenPos: { x: number; y: number }) => {
      setAbsentPopup({ info, position: screenPos });
    },
    [],
  );

  // DeskCard state
  const [deskCard, setDeskCard] = useState<{
    memberId: string;
    position: { x: number; y: number };
  } | null>(null);

  const handleDeskCardOpen = useCallback(
    (memberId: string, screenPos: { x: number; y: number }) => {
      // In owner avatar mode, DialogBox takes priority — skip DeskCard
      if (jcGetOwnerAvatarState().active) return;
      setDeskCard({ memberId, position: screenPos });
    },
    [],
  );

  const handleAbsentPopupClose = useCallback(() => setAbsentPopup(null), []);

  const handleAbsentPopupLaunch = useCallback((memberId: string) => {
    vscode.postMessage({ type: 'jcLaunchAgent', memberId });
    setAbsentPopup(null);
  }, []);

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      vscode.postMessage({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id });
  }, []);

  // Character click → open DialogBox if owner active, otherwise focus agent
  const handleClick = useCallback((agentId: number) => {
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;

    // Skip clicks on the owner avatar itself
    if (focusId === OWNER_AGENT_ID) return;

    const ownerState = jcGetOwnerAvatarState();
    if (ownerState.active) {
      // Owner mode: open DialogBox for the clicked member
      const memberInfo = jcGetMemberInfo(focusId);
      if (memberInfo) {
        // Update owner avatar to walk toward this member
        jcSetOwnerAvatarState({ conversationTarget: memberInfo.memberId });
        setDialogTarget({
          memberId: memberInfo.memberId,
          memberName: memberInfo.config.name,
        });
      }
      return;
    }

    vscode.postMessage({ type: 'focusAgent', id: focusId });
  }, []);

  const officeState = getOfficeState();
  void editorTickForKeyboard;

  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vscode-foreground)',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
        .pixel-agents-migration-btn:hover { filter: brightness(0.8); }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        onAbsentDeskClick={handleAbsentDeskClick}
        onDeskCardOpen={handleDeskCardOpen}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
      />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      {/* ── Bottom Toolbar (Tasks + Settings + Owner summon) ── */}
      <BottomToolbar
        isTaskHistoryOpen={isTaskHistoryOpen}
        onToggleTaskHistory={handleToggleTaskHistory}
        onOpenSettings={() => setIsSettingsOpen(!isSettingsOpen)}
        isSettingsOpen={isSettingsOpen}
        ownerAvatarActive={ownerAvatarState.active}
        onToggleOwner={() => {
          if (ownerAvatarState.active) {
            jcSetOwnerAvatarState({ active: false });
          } else {
            jcSetOwnerAvatarState({
              active: true,
              position: 'entrance',
              lastPosition: ownerAvatarState.lastPosition,
              conversationTarget: null,
            });
          }
        }}
      />

      {/* ── Settings Modal ── */}
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          isEditMode={editor.isEditMode}
          onToggleEditMode={editor.handleToggleEditMode}
          isDebugMode={isDebugMode}
          onToggleDebugMode={handleToggleDebugMode}
          alwaysShowOverlay={alwaysShowOverlay}
          onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
          externalAssetDirectories={externalAssetDirectories}
          watchAllSessions={watchAllSessions}
          onToggleWatchAllSessions={() => {
            const newVal = !watchAllSessions;
            setWatchAllSessions(newVal);
            vscode.postMessage({ type: 'setWatchAllSessions', enabled: newVal });
          }}
          onOpenClaude={editor.handleOpenClaude}
          zoom={editor.zoom}
          onZoomChange={editor.handleZoomChange}
        />
      )}

      {/* ── Office Log (right panel, always visible) ── */}
      <OfficeLog
        isOpen={isOfficeLogOpen}
        onClose={() => setIsOfficeLogOpen(false)}
        expanded={viewMode === 'serious'}
      />

      {/* ── Command Mode: operation board placeholder + ticker ── */}
      {viewMode === 'command' && <CommandBoard />}

      {/* ── Task History (left slide-in) ── */}
      <TaskHistoryPanel isOpen={isTaskHistoryOpen} onClose={() => setIsTaskHistoryOpen(false)} />

      <VersionIndicator
        currentVersion={extensionVersion}
        lastSeenVersion={lastSeenVersion}
        onDismiss={handleWhatsNewDismiss}
        onOpenChangelog={handleOpenChangelog}
      />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentVersion={extensionVersion}
      />

      {editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: editor.isDirty ? 52 : 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Rotate (R)
        </div>
      )}

      {editor.isEditMode &&
        (() => {
          const selUid = editorState.selectedFurnitureUid;
          const selColor = selUid
            ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
            : null;
          return (
            <EditorToolbar
              activeTool={editorState.activeTool}
              selectedTileType={editorState.selectedTileType}
              selectedFurnitureType={editorState.selectedFurnitureType}
              selectedFurnitureUid={selUid}
              selectedFurnitureColor={selColor}
              floorColor={editorState.floorColor}
              wallColor={editorState.wallColor}
              selectedWallSet={editorState.selectedWallSet}
              onToolChange={editor.handleToolChange}
              onTileTypeChange={editor.handleTileTypeChange}
              onFloorColorChange={editor.handleFloorColorChange}
              onWallColorChange={editor.handleWallColorChange}
              onWallSetChange={editor.handleWallSetChange}
              onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
              onFurnitureTypeChange={editor.handleFurnitureTypeChange}
              loadedAssets={loadedAssets}
            />
          );
        })()}

      {!isDebugMode && (
        <TokenHPBar
          officeState={officeState}
          agents={agents}
          agentTokenUsage={agentTokenUsage}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
        />
      )}

      {!isDebugMode && (
        <ToolOverlay
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentCharacters={subagentCharacters}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
          onCloseAgent={handleCloseAgent}
          alwaysShowOverlay={alwaysShowOverlay}
        />
      )}

      {!isDebugMode && (
        <JCMemberInfoPanel
          officeState={officeState}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
        />
      )}

      {isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {absentPopup && (
        <AbsentStatusPopup
          info={absentPopup.info}
          position={absentPopup.position}
          onClose={handleAbsentPopupClose}
          onLaunch={handleAbsentPopupLaunch}
        />
      )}

      {/* ── DeskCard (shown on desk tile click) ── */}
      {deskCard && (
        <DeskCard
          memberId={deskCard.memberId}
          position={deskCard.position}
          onClose={() => setDeskCard(null)}
        />
      )}

      {/* ── Owner Avatar (always mounted when active, renders via canvas) ── */}
      {ownerAvatarState.active && (
        <OwnerAvatar officeState={officeState} onExited={() => setDialogTarget(null)} />
      )}

      {/* ── DialogBox (shown when owner clicks a member character) ── */}
      {dialogTarget && ownerAvatarState.active && (
        <DialogBox
          memberId={dialogTarget.memberId}
          memberName={dialogTarget.memberName}
          onClose={() => setDialogTarget(null)}
        />
      )}

      {showMigrationNotice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setMigrationNoticeDismissed(true)}
        >
          <div
            style={{
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              padding: '24px 32px',
              maxWidth: 620,
              boxShadow: 'var(--pixel-shadow)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '40px', marginBottom: 12, color: 'var(--pixel-accent)' }}>
              We owe you an apology!
            </div>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We've just migrated to fully open-source assets, all built from scratch with love.
              Unfortunately, this means your previous layout had to be reset.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We're really sorry about that.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              The good news? This was a one-time thing, and it paves the way for some genuinely
              exciting updates ahead.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text-dim)', margin: '0 0 20px 0' }}>
              Stay tuned, and thanks for using Pixel Agents!
            </p>
            <button
              className="pixel-agents-migration-btn"
              style={{
                padding: '6px 24px 8px',
                fontSize: '30px',
                background: 'var(--pixel-accent)',
                color: '#fff',
                border: '2px solid var(--pixel-accent)',
                borderRadius: 0,
                cursor: 'pointer',
                boxShadow: 'var(--pixel-shadow)',
              }}
              onClick={() => setMigrationNoticeDismissed(true)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ModeProvider>
      <AppContent />
    </ModeProvider>
  );
}

export default App;
