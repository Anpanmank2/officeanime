// ── R2 営業状態の見た目 状態マシン (2026-07-04 藤井 visual spec §1-§4) ──────
// R1 の純粋 open/closed 判定 (office-hours.ts deriveOfficeTarget) の上に、
// 見た目の 4 相 (open → closing → closed → reopening → open) と減光アニメ・
// 文言フェード・秘書巡回リングを載せる imperative store (game-state と同型)。
//
// 設計原則:
//   - 相と α は **時刻から導出 (冪等)**。close 用の新規イベントは作らない。
//   - 副作用 (退社ディスパッチ・巡回リング発火) は **遷移(edge)時のみ** — replay /
//     再接続で CLOSED 再ログ・パルス再発火しない (skill: replay-prone-event-log)。
//   - officeHoursEvaluate() = 状態機 (React 側から interval + karte 変化で呼ぶ)。
//   - officeHoursRenderState() = 純粋 read (jc-overlay が毎フレーム呼ぶ・副作用なし)。
//
// ⚠ このモジュールは webview 専用 (window / jc-state presence を触る)。
//    CLI (office-status.mjs) は office-hours.ts (純粋) だけを import すること。

import {
  OFFICE_DIM_FADE_IN_MS,
  OFFICE_DIM_FADE_OUT_MS,
  OFFICE_DIM_MAX_ALPHA,
  OFFICE_HEARTBEAT_RING_MS,
  OFFICE_TEXT_FADE_DELAY_MS,
  OFFICE_TEXT_FADE_MS,
  OFFICE_TEXT_FADE_OUT_MS,
  OFFICE_TEXT_MAX_ALPHA,
} from './jc-constants.js';
import { jcGetAllMembers, jcGetMemberRuntime } from './jc-state.js';
import { type OfficeTarget, readOfficeSnapshot } from './office-hours.js';

export type OfficePhase = 'open' | 'closing' | 'closed' | 'reopening';

// ── 内部状態 (時刻から相を導出するための最小メモリ) ──
let targetPhase: OfficeTarget = 'open';
let transitionStart = 0; // 最後に target が open↔closed で切り替わった時刻
let fromClosed = false; // 直前が closed だった (= reopening アニメを再生する)
let lastHeartbeatAt: number | null = null; // 最新 office_heartbeat (最終確認 HH:MM)
let prevHeartbeatAt: number | null = null; // 巡回リング edge 検出用
let heartbeatPulseStart: number | null = null; // 巡回リング開始時刻 (ワンショット)
let initialized = false;

// ── Subscribe API (Observer, game-state と同型) ──
const listeners = new Set<() => void>();
let pendingNotify = false;
function scheduleNotify(): void {
  if (pendingNotify) return;
  pendingNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingNotify = false;
    for (const fn of listeners) {
      try {
        fn();
      } catch (e) {
        console.error('[office-hours] listener error:', e);
      }
    }
  });
}
export function subscribeOfficeHours(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** CLOSING で残 present member を既存 departure で退社させる (edge 時のみ・新規スプライト0)。 */
function dispatchClosingDepartures(): void {
  if (typeof window === 'undefined') return; // node/test では no-op
  const members = jcGetAllMembers();
  members.forEach((m, idx) => {
    if (jcGetMemberRuntime(m.id)?.isPresent !== true) return;
    // reconcileWorkloadPresence と同じ安定負数系 (重複キャラを作らない)。
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'jcMemberLeaving', agentId: -9000 - idx, memberId: m.id },
      }),
    );
  });
}

/**
 * 状態機を 1 step 進める。React 側から interval (店じまいは無イベントでも時間で
 * 起きるため) + karte 変化 (新イベントで即 reopen) で呼ぶ。
 * 遷移(edge)時のみ副作用 (退社ディスパッチ・巡回リング発火) を起こす。
 */
export function officeHoursEvaluate(now: number = Date.now()): void {
  const snap = readOfficeSnapshot(now);

  if (!initialized) {
    // 初回: アニメを再生せず現在の相にスナップ (reload で"また閉店演出"を出さない)。
    initialized = true;
    targetPhase = snap.target;
    transitionStart = now - OFFICE_DIM_FADE_IN_MS - OFFICE_TEXT_FADE_DELAY_MS - OFFICE_TEXT_FADE_MS;
    fromClosed = false;
    prevHeartbeatAt = snap.lastHeartbeatAt;
    lastHeartbeatAt = snap.lastHeartbeatAt;
    scheduleNotify();
    return;
  }

  // ── 営業状態 target の遷移 (open↔closed) ──
  if (snap.target !== targetPhase) {
    const wasClosed = targetPhase === 'closed';
    fromClosed = wasClosed;
    targetPhase = snap.target;
    transitionStart = now;
    // open→closed の edge でのみ退社を発火 (一度きり = 「順に退社」)。
    // ⚠ 継続ディスパッチにすると常駐 (秘書/PM) の presence 保証 re-dispatch と
    //    出社↔退社 の flicker 戦争になる (skill: replay-prone-event-log 実測)。
    //    店じまいの主シグナルは全面 dim + 消灯 + 文言。退社は edge 一発に留める。
    if (snap.target === 'closed') dispatchClosingDepartures();
    scheduleNotify();
  }

  // ── office_heartbeat の edge 検出 → 巡回リング ワンショット + 最終確認更新 ──
  // replay で同じ heartbeat が再ロードされても値が同じなら再発火しない (edge only)。
  if (snap.lastHeartbeatAt !== null && snap.lastHeartbeatAt !== prevHeartbeatAt) {
    prevHeartbeatAt = snap.lastHeartbeatAt;
    lastHeartbeatAt = snap.lastHeartbeatAt;
    heartbeatPulseStart = now;
    scheduleNotify();
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number): number {
  return t * t * t;
}

export interface OfficeRenderState {
  phase: OfficePhase;
  /** 全面 dim レイヤの α (0〜OFFICE_DIM_MAX_ALPHA)。 */
  dimAlpha: number;
  /** CLOSED 文言の α (0〜OFFICE_TEXT_MAX_ALPHA)。 */
  textAlpha: number;
  /** 秘書巡回リングの進行 (0〜1)。発火中でなければ null。 */
  ringProgress: number | null;
  /** 最終確認 (最新 office_heartbeat) 時刻。無ければ null。 */
  lastHeartbeatAt: number | null;
}

/** 純粋 read (毎フレーム呼ばれる・副作用なし)。相・α を時刻から導出。 */
export function officeHoursRenderState(now: number = Date.now()): OfficeRenderState {
  const elapsed = now - transitionStart;
  let phase: OfficePhase;
  let dimAlpha: number;
  let textAlpha: number;

  if (targetPhase === 'closed') {
    if (elapsed < OFFICE_DIM_FADE_IN_MS) {
      phase = 'closing';
      dimAlpha = easeOutCubic(elapsed / OFFICE_DIM_FADE_IN_MS) * OFFICE_DIM_MAX_ALPHA;
    } else {
      phase = 'closed';
      dimAlpha = OFFICE_DIM_MAX_ALPHA;
    }
    // 文言: 遅延 0.4s → 0.8s で fade in、以後 hold。
    const t = elapsed - OFFICE_TEXT_FADE_DELAY_MS;
    textAlpha =
      t <= 0
        ? 0
        : t < OFFICE_TEXT_FADE_MS
          ? (t / OFFICE_TEXT_FADE_MS) * OFFICE_TEXT_MAX_ALPHA
          : OFFICE_TEXT_MAX_ALPHA;
  } else {
    // open (含む reopening アニメ)
    if (fromClosed && elapsed < OFFICE_DIM_FADE_OUT_MS) {
      phase = 'reopening';
      dimAlpha = OFFICE_DIM_MAX_ALPHA * (1 - easeInCubic(elapsed / OFFICE_DIM_FADE_OUT_MS));
    } else {
      phase = 'open';
      dimAlpha = 0;
    }
    // 文言フェードアウト (0.5s)。
    textAlpha =
      fromClosed && elapsed < OFFICE_TEXT_FADE_OUT_MS
        ? OFFICE_TEXT_MAX_ALPHA * (1 - elapsed / OFFICE_TEXT_FADE_OUT_MS)
        : 0;
  }

  let ringProgress: number | null = null;
  if (heartbeatPulseStart !== null) {
    const re = now - heartbeatPulseStart;
    if (re >= 0 && re < OFFICE_HEARTBEAT_RING_MS) ringProgress = re / OFFICE_HEARTBEAT_RING_MS;
  }

  return { phase, dimAlpha, textAlpha, ringProgress, lastHeartbeatAt };
}

/** pill 用: 現在の相 (React の会社ボードが購読)。 */
export function officeHoursGetPhase(now: number = Date.now()): OfficePhase {
  return officeHoursRenderState(now).phase;
}

/** pill 直下の「最終確認 HH:MM」用。 */
export function officeHoursGetLastHeartbeatAt(): number | null {
  return lastHeartbeatAt;
}

/** テスト/QC 用の内部リセット (webview 実運用では呼ばない)。 */
export function __officeHoursResetForTest(): void {
  targetPhase = 'open';
  transitionStart = 0;
  fromClosed = false;
  lastHeartbeatAt = null;
  prevHeartbeatAt = null;
  heartbeatPulseStart = null;
  initialized = false;
}
