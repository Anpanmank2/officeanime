import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomToolbar } from './components/BottomToolbar.js';
import { DebugView } from './components/DebugView.js';
import { SettingsModal } from './components/SettingsModal.js';
// DEFER: TokenHPBar hidden (Slice後で復活) — import removed to satisfy noUnusedLocals
// import { TokenHPBar } from './components/TokenHPBar.js';
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { AbsentStatusPopup } from './jc/AbsentStatusPopup.js';
import { CompletionToast } from './jc/CompletionToast.js';
import { DelegationDock } from './jc/DelegationDock.js';
import { DeskCard } from './jc/DeskCard.js';
import { gameGetCompanyScore, gameGetTodayCount, subscribeGame } from './jc/game-state.js';
import { DEPT_COLORS } from './jc/jc-constants.js';
import {
  jcGetOwnerAvatarState,
  jcSetOwnerAvatarState,
  subscribeOwnerAvatar,
} from './jc/jc-state.js';
import type { AbsenceInfo, OwnerAvatarState } from './jc/jc-types.js';
import { JCMemberInfoPanel } from './jc/JCMemberInfoPanel.js';
import { ModeProvider } from './jc/ModeContext.js';
import { getLogEntries, subscribeLog } from './jc/office-log-state.js';
import { OfficeLog } from './jc/OfficeLog.js';
import { OWNER_AGENT_ID } from './jc/owner-avatar-constants.js';
import { OwnerAvatar } from './jc/OwnerAvatar.js';
import { ResearchResultPanel } from './jc/ResearchResultPanel.js';
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
  const [recentEntries, setRecentEntries] = useState(() => getLogEntries().slice(-6).reverse());
  const [companyScore, setCompanyScore] = useState(() => gameGetCompanyScore());
  const [todayCount, setTodayCount] = useState(() => gameGetTodayCount());

  useEffect(() => {
    const update = () => setRecentEntries(getLogEntries().slice(-6).reverse());
    return subscribeLog(update);
  }, []);

  useEffect(() => {
    const update = () => {
      setCompanyScore(gameGetCompanyScore());
      setTodayCount(gameGetTodayCount());
    };
    update();
    return subscribeGame(update);
  }, []);

  // Drop entries with no resolved member (removes "[] undefined: → coding" glitch).
  // The summary already contains the member name, so the [name] prefix was redundant.
  const tickerEntries = recentEntries.filter(
    (e) => e.memberName && e.memberName !== 'undefined' && e.summary,
  );

  return (
    <>
      {/* Ticker: top bar, one event at a time with clear spacing (no overlap) */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 48,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          background: 'rgba(8, 10, 25, 0.88)',
          border: '2px solid rgba(0, 180, 255, 0.2)',
          padding: '4px 12px',
          maxWidth: '60%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {tickerEntries.length === 0 ? (
          <span style={{ fontSize: '12px', color: 'rgba(200,210,240,0.4)' }}>No activity</span>
        ) : (
          tickerEntries.map((entry, i) => (
            <span
              key={entry.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 14,
                fontSize: '12px',
                color: DEPT_COLORS[entry.department] ?? '#aaa',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title={`${entry.memberName}: ${entry.summary}`}
            >
              {i > 0 && <span style={{ color: 'rgba(0,180,255,0.35)' }}>•</span>}
              {entry.summary}
            </span>
          ))
        )}
      </div>

      {/* Command board — live company standings */}
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
        <div style={{ fontSize: '16px', color: '#00f0ff', fontWeight: 'bold', marginBottom: 10 }}>
          🏛 COMMAND BOARD
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 32,
            fontSize: '13px',
          }}
        >
          {/* Number is the hero: large + bold so a "0" reads as a digit, not a period.
              The pixel font's small "0" glyph is near-identical to "。" at 13px. */}
          <span
            style={{
              color: '#39ff14',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: '11px', opacity: 0.85 }}>会社スコア</span>
            <b style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1 }}>
              {companyScore.toLocaleString()}
            </b>
          </span>
          <span
            style={{
              color: '#f0d840',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: '11px', opacity: 0.85 }}>本日完了（件）</span>
            <b style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1 }}>
              {todayCount.toLocaleString()}
            </b>
          </span>
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
    // DEFER: agentTokenUsage was TokenHPBar-only — omitted while bar is hidden (Slice後で復活)
    subagentTools,
    subagentCharacters,
    layoutReady,
    loadedAssets,
    alwaysShowLabels,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // DEFER: debug toggle UI removed — isDebugMode fixed to false (DebugView hidden, other overlays shown).
  const [isDebugMode] = useState(false);
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

  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

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

  // Character click → focus agent (peek). DEFER: individual delegation form (DialogBox)
  // removed — delegation is dock-only (Owner decision B).
  const handleClick = useCallback((agentId: number) => {
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;

    // Skip clicks on the owner avatar itself
    if (focusId === OWNER_AGENT_ID) return;

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

      {/* Slice1: completion toast "本日N件目! 🎉" (screen-space DOM) */}
      <CompletionToast />

      {/* Research findings panel: 調査完了 → prominent dismissible 調査結果 popup */}
      <ResearchResultPanel />

      {/* Slice1 T10: delegation dock (bottom) — pick a card, click a member */}
      <DelegationDock />

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
          zoom={editor.zoom}
          onZoomChange={editor.handleZoomChange}
        />
      )}

      {/* ── Office Log (right panel, always visible) ── */}
      <OfficeLog
        isOpen={isOfficeLogOpen}
        onClose={() => setIsOfficeLogOpen(false)}
        expanded={false}
      />

      {/* ── Command Mode: operation board placeholder + ticker (DEFER: mode fixed to command) ── */}
      <CommandBoard />

      {/* ── Task History (left slide-in) ── */}
      <TaskHistoryPanel isOpen={isTaskHistoryOpen} onClose={() => setIsTaskHistoryOpen(false)} />

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

      {/* DEFER: TokenHPBar hidden (Slice後で復活) */}
      {/*
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
      */}

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
      {ownerAvatarState.active && <OwnerAvatar officeState={officeState} onExited={() => {}} />}
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
