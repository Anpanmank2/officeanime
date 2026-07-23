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
import { ApprovalTray } from './jc/ApprovalTray.js';
import { CompletedArchivePanel } from './jc/CompletedArchivePanel.js';
import { CompletionToast } from './jc/CompletionToast.js';
import { DelegationDock } from './jc/DelegationDock.js';
import { DeptKartePanel } from './jc/DeptKartePanel.js';
import { DeskCard } from './jc/DeskCard.js';
import { gameGetCompanyScore, gameGetTodayCount, subscribeGame } from './jc/game-state.js';
import {
  DEPT_COLORS,
  OFFICE_HEARTBEAT_LABEL_COLOR,
  OFFICE_PILL_BG,
  OFFICE_PILL_CLOSED_COLOR,
  OFFICE_PILL_OPEN_COLOR,
  OFFICE_PILL_TEXT_COLOR,
  TICKER_MAX_CHARS,
  TICKER_MAX_ENTRIES,
  UI_TEXT,
} from './jc/jc-constants.js';
import {
  jcGetMemberForAgent,
  jcGetOwnerAvatarState,
  jcSetOwnerAvatarState,
  subscribeOwnerAvatar,
} from './jc/jc-state.js';
import type { AbsenceInfo, OwnerAvatarState } from './jc/jc-types.js';
import { JCMemberInfoPanel } from './jc/JCMemberInfoPanel.js';
import { subscribeKarte } from './jc/karte-state.js';
import { ModeProvider } from './jc/ModeContext.js';
import {
  officeHoursEvaluate,
  officeHoursGetLastHeartbeatAt,
  officeHoursGetPhase,
  subscribeOfficeHours,
} from './jc/office-hours-state.js';
import { getLogEntries, subscribeLog } from './jc/office-log-state.js';
import { OfficeLog } from './jc/OfficeLog.js';
import { OWNER_AGENT_ID } from './jc/owner-avatar-constants.js';
import { OwnerAvatar } from './jc/OwnerAvatar.js';
import { flashPlansForMember, getPlans } from './jc/plan-state.js';
import { getRequestFlow, setRequestFlowHidden } from './jc/request-flow-state.js';
import { RequestFlowPanel } from './jc/RequestFlowPanel.js';
import { RequestResultPanel } from './jc/RequestResultPanel.js';
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

// ── Command Board (会社ボード) — shown only in command mode ─────────
// Ticker showing latest OfficeLog events + live company standings board.
// 2026-07-03 藤井 UI spec §2/§3: board は左上退避 (マップ被さり解消)、
// ticker は「出来事」専用 (セリフ断片は吹き出し + OFFICE LOG が正)。

// 出来事専用 (藤井 spec §3): セリフ (type === 'speech') はティッカーに流さない —
// 出社/開始/完了/委任の定型文だけになり「…」切れが構造的に消える。
// Drop entries with no resolved member (removes "[] undefined: → coding" glitch).
// ⚠ 必ず新しい配列を返すこと: office-log-state は同一配列を mutate するため、
// 同じ参照を setState に渡すと React が bail out してティッカーが更新されない。
function selectTickerEntries() {
  return getLogEntries()
    .filter((e) => e.memberName && e.memberName !== 'undefined' && e.summary)
    .filter((e) => e.type !== 'speech')
    .slice(-TICKER_MAX_ENTRIES)
    .reverse();
}

/** office_heartbeat 時刻 → HH:MM (無ければ「—」)。 */
function formatHeartbeatHHMM(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CommandBoard() {
  const [tickerEntries, setTickerEntries] = useState(selectTickerEntries);
  const [companyScore, setCompanyScore] = useState(() => gameGetCompanyScore());
  const [todayCount, setTodayCount] = useState(() => gameGetTodayCount());

  // ── R2 営業状態 (2026-07-04 藤井 spec §1/§4): 会社ボード見出しに status pill +
  // 最終確認 HH:MM を同居させる。1s tick で状態機を進め (無イベントでも 2h で店じまい)、
  // 新イベント (karte) で即 reopen、office-hours 遷移で pill を更新。
  const [officePhase, setOfficePhase] = useState(() => officeHoursGetPhase());
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(() =>
    officeHoursGetLastHeartbeatAt(),
  );

  useEffect(() => {
    const tick = () => {
      officeHoursEvaluate(Date.now());
      setOfficePhase(officeHoursGetPhase());
      setLastHeartbeatAt(officeHoursGetLastHeartbeatAt());
    };
    tick();
    const unsubKarte = subscribeKarte(tick); // 新イベントで即評価 (reopen)
    const unsubOffice = subscribeOfficeHours(tick); // 遷移で pill 更新
    const timer = setInterval(tick, 1000); // 時間経過で店じまい/相の進行を反映
    return () => {
      unsubKarte();
      unsubOffice();
      clearInterval(timer);
    };
  }, []);

  const officeClosed = officePhase === 'closed';

  useEffect(() => {
    const update = () => setTickerEntries(selectTickerEntries());
    update();
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
          background: 'rgba(38, 43, 47, 0.94)',
          border: '2px solid rgba(46, 158, 144, 0.3)',
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
              {/* 定型文は40字以内が常。超えた時だけ「…」(全文は title で) */}
              {entry.summary.length > TICKER_MAX_CHARS
                ? `${entry.summary.slice(0, TICKER_MAX_CHARS)}…`
                : entry.summary}
            </span>
          ))
        )}
      </div>

      {/* 会社ボード — live company standings.
          左上退避 (藤井 spec §2): ティッカー下・マップ左の暗部余白。中央の
          キャラ/デスクに被らない。ゼロ状態は数字でなく誘い文言 2 行。 */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 16,
          zIndex: 45,
          background: 'rgba(38, 43, 47, 0.8)',
          border: '2px solid rgba(46, 158, 144, 0.4)',
          padding: '10px 14px',
          minWidth: 200,
          maxWidth: 280,
          textAlign: 'left',
          pointerEvents: 'none',
        }}
      >
        {/* 見出し行: タイトル + 営業状態 pill (右端・§1) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: '16px', color: '#5FC2B4', fontWeight: 'bold' }}>
            {UI_TEXT.companyBoardTitle}
          </span>
          <span
            data-office-pill
            data-office-state={officePhase}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: OFFICE_PILL_BG,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: '11px',
              whiteSpace: 'nowrap',
              color: officeClosed ? OFFICE_PILL_CLOSED_COLOR : OFFICE_PILL_TEXT_COLOR,
            }}
          >
            <span
              // 営業中=呼吸pulse (灯り) / 本日終了=消灯 (pulse無)
              className={officeClosed ? undefined : 'office-pill-pulse'}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                display: 'inline-block',
                background: officeClosed ? OFFICE_PILL_CLOSED_COLOR : OFFICE_PILL_OPEN_COLOR,
              }}
            />
            {officeClosed ? '本日終了' : '営業中'}
          </span>
        </div>
        {/* pill 直下: 最終確認 HH:MM (§4・秘書 office_heartbeat 由来・無ければ —) */}
        <div
          data-office-heartbeat
          style={{
            fontSize: '11px',
            color: OFFICE_HEARTBEAT_LABEL_COLOR,
            marginBottom: 10,
            textAlign: 'right',
          }}
        >
          最終確認 {formatHeartbeatHHMM(lastHeartbeatAt)}
        </div>
        {companyScore === 0 && todayCount === 0 ? (
          // ゼロ状態: 「0」を2つ見せるより、最初のおしごとへ誘う (藤井 spec §2)
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '13px', color: '#5FC2B4' }}>
              {UI_TEXT.companyBoardZeroLine1}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(200,210,240,0.85)',
                whiteSpace: 'pre-line', // 定数内 \n の制御改行を有効化 (1字孤立の折返し防止)
              }}
            >
              {UI_TEXT.companyBoardZeroLine2}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
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
              <span style={{ fontSize: '11px', opacity: 0.85 }}>
                {UI_TEXT.companyBoardScoreLabel}
              </span>
              <b style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1 }}>
                {companyScore.toLocaleString()}
              </b>
            </span>
            <span
              style={{
                color: '#E4C36E',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span style={{ fontSize: '11px', opacity: 0.85 }}>
                {UI_TEXT.companyBoardTodayLabel}
              </span>
              <b style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1 }}>
                {todayCount.toLocaleString()}
              </b>
            </span>
          </div>
        )}
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

  // 部署カルテパネル (2026-07-03 藤井 §3): 部署ホワイトボードクリックで開く
  const [deptKarte, setDeptKarte] = useState<{
    department: string;
    position: { x: number; y: number };
  } | null>(null);

  // R4 本棚 = 完了アーカイブ (保存ボックス): 本棚クリックで開く
  const [archivePanel, setArchivePanel] = useState<{
    position: { x: number; y: number };
  } | null>(null);

  const handleBookshelfClick = useCallback((screenPos: { x: number; y: number }) => {
    // 再クリックはトグルで閉じる
    setArchivePanel((prev) => (prev ? null : { position: screenPos }));
  }, []);

  const handleDeptBoardClick = useCallback(
    (department: string, screenPos: { x: number; y: number }) => {
      // 同じ部署のボード再クリックはトグルで閉じる
      setDeptKarte((prev) =>
        prev?.department === department ? null : { department, position: screenPos },
      );
    },
    [],
  );

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

    // R2 ‼️承認待ち導線: クリックしたキャラの member が Owner 回答待ちなら
    // 該当の確認パネルへ誘導する。確認フロー自体の挙動は無改変 (導線のみ)。
    const ch = os.characters.get(focusId);
    const memberId = ch?.jcMemberId ?? jcGetMemberForAgent(focusId);
    if (memberId) console.log(`[JC-WV] char click: agent=${focusId} member=${memberId}`);
    if (memberId) {
      const flow = getRequestFlow();
      if (flow && flow.memberId === memberId && flow.hidden) {
        // 「あとで」でしまった依頼確認 (RequestFlowPanel の当該リクエスト) を再表示
        setRequestFlowHidden(false);
        return;
      }
      if (getPlans().some((p) => p.status === 'awaiting' && p.memberId === memberId)) {
        // plan確認 (承認まちtray) — 該当カードを赤アウトラインで誘目
        flashPlansForMember(memberId);
      }
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
        /* R2 営業インジケータ 呼吸pulse (§1: alpha 0.6↔1.0 / 2.4s) — 灯りの合図 */
        @keyframes office-pill-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .office-pill-pulse { animation: office-pill-pulse 2.4s ease-in-out infinite; }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        onAbsentDeskClick={handleAbsentDeskClick}
        onDeskCardOpen={handleDeskCardOpen}
        onDeptBoardClick={handleDeptBoardClick}
        onBookshelfClick={handleBookshelfClick}
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

      {/* 依頼(write型) result panel: 資料/実装の下書き完成 → 書き先パス+要約 popup
          (--jc-live-spawn OFF / plan未確認 の明示ゲート通知もここに出る) */}
      <RequestResultPanel />

      {/* PARKED (2026-07-02 Owner FB pivot): 〇✕✎ tray kept for FUTURE 許可制
          (AI-initiated) source only; NOT used by the 依頼(request) flow. Renders
          nothing unless a permitted-source plan appears. */}
      <ApprovalTray />

      {/* 依頼(request) flow: 「調査を依頼」→ 3項目テンプレ → はい/いいえ確認 → 実行 */}
      <RequestFlowPanel />

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
          onOpenArchive={() => setArchivePanel({ position: { x: window.innerWidth / 2, y: 40 } })}
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

      {/* ── 部署カルテ (部署ホワイトボードクリック / 2026-07-03 藤井 §3) ── */}
      {deptKarte && (
        <DeptKartePanel
          department={deptKarte.department}
          position={deptKarte.position}
          onClose={() => setDeptKarte(null)}
        />
      )}

      {/* ── R4 本棚 = 完了アーカイブ (保存ボックス / 本棚クリック) ── */}
      {archivePanel && (
        <CompletedArchivePanel
          position={archivePanel.position}
          onClose={() => setArchivePanel(null)}
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
