// ── R1 オフィス営業状態マシン (2026-07-04 Owner確定・soft close) ────────────
// 「最終活動から2時間 全エージェント停止でオフィスが店じまい、新しい活動で即再開」。
//
// このモジュールは **純粋な OPEN/CLOSED 判定 (R1 の正本)** だけを持つ。
//   - deriveOfficeTarget(lastActivityAt, workingCount, now) → 'open' | 'closed'
//     (合成入力で単体テスト可能・時計依存なし = AC-1/AC-2/AC-5 の核)
//   - readOfficeSnapshot(now) は karte store (jc-events 実データ) から入力を引いて
//     deriveOfficeTarget を呼ぶだけの薄いラッパ。webview の見た目遷移 (closing/
//     reopening) と CLI (scripts/office-status.mjs) の両方がこの **同一関数** を
//     共有する (二重定義しない = AC-4)。
//
// データ原則: ダミー値禁止。稼働は R1 正本 (karte-state computeMemberWorkloads) から、
// 活動時刻は ACTIVITY_EVENTS (office_heartbeat/progress_check を除外) から導出する。

import { OFFICE_CLOSE_IDLE_MS } from './jc-constants.js';
import { karteLastActivityAt, karteLastHeartbeatAt, karteWorkingCount } from './karte-state.js';

/** 藤井 spec 名との別名 (= OFFICE_CLOSE_IDLE_MS)。両名が同一値であることをコードで明示。 */
export const CLOSE_THRESHOLD_MS = OFFICE_CLOSE_IDLE_MS;

/** R1 の確定判定 (見た目の closing/reopening ではなく「営業しているか否か」の本質)。 */
export type OfficeTarget = 'open' | 'closed';

/**
 * R1 正本: オフィスが営業(open)か店じまい(closed)か。**純粋関数** (時計は now 引数)。
 * - workingCount > 0 (誰か稼働中) → 常に open
 * - 活動記録なし (lastActivityAt=null) → 既定 open (静かなだけ・観測基準が無い)
 * - 全員非稼働 かつ 最終活動から OFFICE_CLOSE_IDLE_MS 経過 → closed (店じまい)
 * 新しい活動が来れば lastActivityAt が更新され idle が 0 に戻る → 即 open (reversible)。
 */
export function deriveOfficeTarget(
  lastActivityAt: number | null,
  workingCount: number,
  now: number,
): OfficeTarget {
  if (workingCount > 0) return 'open';
  if (lastActivityAt === null) return 'open';
  return now - lastActivityAt >= OFFICE_CLOSE_IDLE_MS ? 'closed' : 'open';
}

/** karte store から引いた営業状態スナップショット (webview / CLI 共通の観測結果)。 */
export interface OfficeSnapshot {
  /** R1 確定判定 (open|closed)。 */
  target: OfficeTarget;
  /** 稼働中 member 数 (active>0)。 */
  workingCount: number;
  /** 最終「活動」時刻 (ms epoch)。活動イベント無しは null。 */
  lastActivityAt: number | null;
  /** 最終 office_heartbeat 時刻 (ms epoch)。無ければ null。 */
  lastHeartbeatAt: number | null;
  /** now - lastActivityAt (ms)。lastActivityAt=null なら null。 */
  idleMs: number | null;
  /** 店じまいしきい値 (= OFFICE_CLOSE_IDLE_MS)。 */
  closeThresholdMs: number;
  /** 「店じまい条件 (全員非稼働 かつ 2h idle) を満たすか」= target==='closed'。 */
  meetsCloseCondition: boolean;
}

/**
 * karte store (bulkSetKarteEvents 済) から現在の営業状態を読む。
 * CLI (office-status.mjs) も webview (office-hours-state) もこれを使う = 同一ロジック共有。
 */
export function readOfficeSnapshot(now: number = Date.now()): OfficeSnapshot {
  const lastActivityAt = karteLastActivityAt();
  const workingCount = karteWorkingCount(now);
  const lastHeartbeatAt = karteLastHeartbeatAt();
  const target = deriveOfficeTarget(lastActivityAt, workingCount, now);
  return {
    target,
    workingCount,
    lastActivityAt,
    lastHeartbeatAt,
    idleMs: lastActivityAt === null ? null : now - lastActivityAt,
    closeThresholdMs: OFFICE_CLOSE_IDLE_MS,
    meetsCloseCondition: target === 'closed',
  };
}
