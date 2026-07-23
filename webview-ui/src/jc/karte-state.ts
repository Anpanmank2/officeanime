// ── jc-events event store (2026-07-03 稼働ダッシュボード v2) ──────────────
// jc-events.json の生イベントを webview 側に全量リプレイ保持し、そこから
// 「稼働」の正本定義 (R1) を導出する:
//
//   稼働中 = 未完了のしごとを持つ間（受領/開始〜完了）
//     受領/開始 = delegate(to) / task_assigned(to) / work_started(from)
//     完了      = task_completed(from|agent) / delegation_complete(from)
//
// チップ・ゾーン照明・カルテ・キャラ状態表示 (5種) はすべてこの同一定義から
// 導出する (computeMemberWorkloads / computeDeptOccupancy)。
// データ原則: ダミー値禁止。イベントが存在しない期間は「記録なし」(0件と区別)。
//
// 受信経路:
//   - 'jcEventHistory' (client-init bulk) → bulkSetKarteEvents
//   - 'jcHistoryEvent' (EventWatcher incremental push) → appendKarteEvent
// dedupe: bulk 直後に同一イベントが incremental でも届き得るため
// key = timestamp|event|from|task で冪等 (skill: replay-prone-event-log 準拠)。

import { MOMENTUM_HALFLIFE_MS, WORK_ABANDON_MS, WORK_STALL_MS } from './jc-constants.js';
import { jcGetAllMembers, jcGetMemberRuntime } from './jc-state.js';

/** jc-events.json の生イベント (必要フィールドのみ、timestamp は ISO 文字列) */
export interface KarteRawEvent {
  event: string;
  timestamp?: string;
  from?: string;
  /** 一部の旧 emitter は actor を agent で運ぶ (work_started/task_completed) */
  agent?: string;
  to?: string | string[];
  task?: string;
  department?: string;
  message?: string;
}

interface KarteEvent {
  event: string;
  /** ms epoch (parse 済み) */
  at: number;
  from: string;
  /** delegate/task_assigned の受領者 (正規化済み配列; それ以外は []) */
  to: string[];
  task: string;
  department: string | null;
}

const COMPLETION_EVENTS = new Set(['task_completed', 'delegation_complete']);
/** 受領イベント (holder = to[]) */
const RECEIPT_EVENTS = new Set(['delegate', 'task_assigned']);

// ── R1 営業状態: 「活動」とみなすイベント (2026-07-04 藤井 spec 準拠) ─────────
// オフィスの店じまいタイマー (OFFICE_CLOSE_IDLE_MS) は「最終活動」から測る。
// ⚠ office_heartbeat / progress_check は **活動に数えない** — これらは秘書の
//   1h 巡回・進捗確認 (監視) であって仕事ではない。数えると秘書の毎時ハートビートが
//   タイマーを永久にリセットしてオフィスが決して閉まらなくなる (店じまいの根幹バグ)。
const ACTIVITY_EVENTS = new Set([
  'delegate',
  'task_assigned',
  'task_received',
  'work_started',
  'delegation_complete',
  'task_completed',
  'review_requested',
  'review_completed',
  'role_escalate',
  'cross_dept_message',
  'skill_created',
]);
/** 秘書 1h ヒートビート痕跡イベント (最終確認 HH:MM の源・活動には数えない)。 */
const HEARTBEAT_EVENT = 'office_heartbeat';

const events: KarteEvent[] = [];
const seen = new Set<string>();

// ── Subscribe API (imperative store + Observer, 他 store と同型) ──
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
        console.error('[karte-state] listener error:', e);
      }
    }
  });
}

/** Subscribe to karte store changes. Returns unsubscribe fn. */
export function subscribeKarte(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function normalize(raw: KarteRawEvent): KarteEvent | null {
  if (!raw || typeof raw.event !== 'string') return null;
  const at = raw.timestamp ? Date.parse(raw.timestamp) : NaN;
  if (!Number.isFinite(at)) return null; // timestamp 無しは集計対象外 (実データ原則)
  const from =
    typeof raw.from === 'string' && raw.from
      ? raw.from
      : typeof raw.agent === 'string'
        ? raw.agent
        : '';
  const to = Array.isArray(raw.to)
    ? raw.to.filter((x): x is string => typeof x === 'string' && x !== '')
    : typeof raw.to === 'string' && raw.to
      ? [raw.to]
      : [];
  return {
    event: raw.event,
    at,
    from,
    to,
    task: typeof raw.task === 'string' ? raw.task : '',
    department: typeof raw.department === 'string' ? raw.department : null,
  };
}

function keyOf(e: KarteEvent): string {
  return `${e.at}|${e.event}|${e.from}|${e.task}`;
}

/** 変更リビジョン (導出 memo の invalidation 用) */
let revision = 0;

/** client-init の全量 sync (置換) */
export function bulkSetKarteEvents(raw: KarteRawEvent[]): void {
  events.length = 0;
  seen.clear();
  for (const r of raw ?? []) {
    const e = normalize(r);
    if (!e) continue;
    const k = keyOf(e);
    if (seen.has(k)) continue;
    seen.add(k);
    events.push(e);
  }
  events.sort((a, b) => a.at - b.at);
  revision++;
  scheduleNotify();
}

/** EventWatcher からの逐次 push (冪等 append) */
export function appendKarteEvent(raw: KarteRawEvent): void {
  const e = normalize(raw);
  if (!e) return;
  const k = keyOf(e);
  if (seen.has(k)) return;
  seen.add(k);
  // 逐次 push はほぼ時系列 — 末尾挿入で足り、逆転時のみ再ソート
  if (events.length > 0 && events[events.length - 1].at > e.at) {
    events.push(e);
    events.sort((a, b) => a.at - b.at);
  } else {
    events.push(e);
  }
  revision++;
  scheduleNotify();
}

/** 観測開始時刻 (最古イベント)。イベント無しは null。 */
export function karteEarliestAt(): number | null {
  return events.length > 0 ? events[0].at : null;
}

/**
 * R1 営業状態: 「最終活動」時刻 (ACTIVITY_EVENTS の最新 timestamp)。
 * office_heartbeat / progress_check は活動に数えない (店じまいタイマーが
 * 秘書の巡回で永久リセットされるのを防ぐ)。活動イベント無しは null。
 */
export function karteLastActivityAt(): number | null {
  // events は at 昇順ソート済 → 末尾から最初の活動イベントが最新。
  for (let i = events.length - 1; i >= 0; i--) {
    if (ACTIVITY_EVENTS.has(events[i].event)) return events[i].at;
  }
  return null;
}

/** R2 最終確認: 最新の office_heartbeat 時刻 (秘書 1h 巡回痕跡)。無ければ null。 */
export function karteLastHeartbeatAt(): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === HEARTBEAT_EVENT) return events[i].at;
  }
  return null;
}

// ── R1 稼働の正本導出 ────────────────────────────────────────────

/** 未完了のしごと 1 件 (member×task 単位) */
export interface OpenWork {
  memberId: string;
  task: string;
  /** 受領/開始した時刻 (完了後の再開なら再開時刻) */
  startedAt: number;
  /** work_started を観測済み (false = 受付のみ = delegate/task_assigned) */
  hasStarted: boolean;
  /** 長時間停滞 (WORK_STALL_MS 超過) — カルテ「詰まり・要対応」行き */
  stalled: boolean;
}

/** member 1 人分の仕事負荷 (R1 正本定義の導出結果) */
export interface MemberWorkload {
  /** 未完了のしごと全部 (新しい順) */
  open: OpenWork[];
  /** 稼働中とみなす分 = 未完了かつ停滞していないもの */
  active: OpenWork[];
  /** 長時間停滞分 (要対応) */
  stalled: OpenWork[];
}

/** 同 at のイベントは「開く」を先に処理する (完了と同時刻の開始は完了で閉じる — 旧 done>=at 意味の維持)。 */
function openRank(e: KarteEvent): number {
  if (e.event === 'work_started' || RECEIPT_EVENTS.has(e.event)) return 0; // 開く
  if (COMPLETION_EVENTS.has(e.event)) return 1; // 閉じる
  return 2; // その他 (集計対象外)
}

/**
 * 全 member の未完了しごとを導出する (R1 正本)。時系列順に「開く/閉じる」を simulate する:
 * - 開く: work_started(from) / delegate(to) / task_assigned(to)  ← 開く側は不変
 * - 閉じる (task_completed / delegation_complete, from|agent) の照合は 2 段 + 双子畳み込み:
 *     1) 同一 member×task の未完了があればそれを閉じる (精密一致優先 = task 名が合う時は正確に)
 *     2) 無ければ その member の**一番古い未完了**を閉じる (member 単位フォールバック
 *        = 開始側と完了側で task 文字列が食い違っても閉じられる)
 *     3) その member に未完了が 1 つも無ければ 完了イベントは無視 (graceful)
 *   ＋ 双子畳み込み: 上で閉じたのが「着手済み (work_started)」の仕事なら、その **受領フェーズの双子**
 *     (= その仕事が着手される直前に受領された、その member の一番新しい *受領のみ* delegate) も畳んで閉じる。
 * - 完了後に同じ member×task が再度開いたら、再開時刻から新たに open
 * - 未完了を経過で 3 段に分ける (放置の自動掃除・2026-07-04 eng-03):
 *     WORK_STALL_MS(2h) 未満 = active / 2h〜WORK_ABANDON_MS(12h) = stalled (詰まり・表示) /
 *     WORK_ABANDON_MS(12h) 以上 = abandoned (盤面から除外・silent drop、本棚にも載せない)
 *   (= 本当に一度も完了イベントが来ないものだけが 2h で停滞し、12h 放置で掃除される。過剰には閉じない)
 *
 * ⚠ 元栓修正 (2026-07-04 eng-03): 実データでは 1 つの仕事が 3 イベントで表れる —
 *   秘書 delegate「…の最終検証」/ agent work_started「… 独立検証」/ agent delegation_complete「… 独立検証」。
 *   完了は work_started の双子と精密一致して *それだけ* を閉じ、文字列違いの delegate が永久に開きっ
 *   ぱなしになり稼働中に居座って 2h 後に停滞していた。着手済みの仕事を閉じたら、その受領双子 delegate も
 *   同一の論理仕事として畳んで閉じる (受領→着手→完了 の 1 ライフサイクルとして 1 完了で閉じ切る)。
 *   双子は「その work_started の着手時刻より前に受領された、一番新しい受領のみ delegate」に限定するため、
 *   その後に受領した未着手 delegate (本当に保留中) は誤爆しない (下記回帰テスト g)。
 */
export function computeOpenWork(now: number = Date.now()): OpenWork[] {
  // 時系列順 (同 at は 開く→閉じる の順) に処理する。events は at 昇順ソート済 — 安定ソートで
  // 同 at のみ openRank により整列。他関数が参照する共有 events は不変 (ローカル copy を並べ替える)。
  const ordered = [...events].sort((a, b) => a.at - b.at || openRank(a) - openRank(b));

  // member ごとの未完了 (task → OpenWork)。挿入順を保つ Map を「古い順」走査に利用する。
  const openByMember = new Map<string, Map<string, OpenWork>>();

  for (const e of ordered) {
    if (COMPLETION_EVENTS.has(e.event)) {
      if (!e.from) continue;
      const byTask = openByMember.get(e.from);
      if (!byTask || byTask.size === 0) continue; // 3) 未完了なし → 完了を無視 (graceful)
      let closed: OpenWork | null = null;
      if (byTask.has(e.task)) {
        closed = byTask.get(e.task)!; // 1) 精密一致優先 (task 名が合う時は正確にその仕事を閉じる)
        byTask.delete(e.task);
      } else {
        // 2) member 単位フォールバック: 一番古い未完了 (startedAt 最小) を閉じる
        let oldestTask: string | null = null;
        let oldestAt = Infinity;
        for (const [t, w] of byTask) {
          if (w.startedAt < oldestAt) {
            oldestAt = w.startedAt;
            oldestTask = t;
          }
        }
        if (oldestTask !== null) {
          closed = byTask.get(oldestTask)!;
          byTask.delete(oldestTask);
        }
      }
      // 双子畳み込み: 閉じたのが着手済み (work_started) なら、その受領双子 (= 着手時刻より前に受領された
      // 一番新しい *受領のみ* delegate) も同一論理仕事として閉じる。文字列違いで割れた受領フェーズを回収。
      if (closed && closed.hasStarted) {
        let twinTask: string | null = null;
        let twinAt = -Infinity;
        for (const [t, w] of byTask) {
          if (!w.hasStarted && w.startedAt < closed.startedAt && w.startedAt > twinAt) {
            twinAt = w.startedAt;
            twinTask = t;
          }
        }
        if (twinTask !== null) byTask.delete(twinTask);
      }
      if (byTask.size === 0) openByMember.delete(e.from);
      continue;
    }

    let holders: string[];
    let started = false;
    if (e.event === 'work_started') {
      holders = e.from ? [e.from] : [];
      started = true;
    } else if (RECEIPT_EVENTS.has(e.event)) {
      holders = e.to;
    } else {
      continue;
    }
    for (const m of holders) {
      let byTask = openByMember.get(m);
      if (!byTask) {
        byTask = new Map();
        openByMember.set(m, byTask);
      }
      const cur = byTask.get(e.task);
      if (!cur) {
        byTask.set(e.task, {
          memberId: m,
          task: e.task,
          startedAt: e.at,
          hasStarted: started,
          stalled: false,
        });
      } else {
        cur.hasStarted = cur.hasStarted || started;
        if (e.at < cur.startedAt) cur.startedAt = e.at;
      }
    }
  }

  const out: OpenWork[] = [];
  for (const byTask of openByMember.values()) {
    for (const w of byTask.values()) out.push(w);
  }
  // 放置(abandoned)の自動掃除 (2026-07-04 eng-03): 未完了しごとを経過で 3 段に分ける。
  //   経過 < WORK_STALL_MS(2h)             → active   (稼働中)
  //   WORK_STALL_MS 〜 WORK_ABANDON_MS(12h) → stalled  (詰まり・要対応で表示し続ける)
  //   経過 >= WORK_ABANDON_MS(12h)          → abandoned (盤面から除外 = ここで silent drop)
  // abandoned は完了ではない (本棚アーカイブには載せない) ため、ただ盤面から消すだけ。
  // computeOpenWork は稼働の単一元栓 (computeMemberWorkloads / computeDeptOccupancy /
  // karteWorkingCount / DeptKartePanel が全てここ由来) — この 1 段の除外で 稼働チップ/
  // 照明/5状態/カルテ/オフィス営業状態 すべてから abandoned が一括で消える。
  // 完了イベントを出さず消えたセッションの残骸が停滞欄に永遠に居座るのを防ぐ (会社全体=
  // 全セッションを 1 つの jc-events.json に映すため、死んだセッションの掃除が要る)。
  const alive = out.filter((w) => now - w.startedAt < WORK_ABANDON_MS);
  for (const w of alive) w.stalled = now - w.startedAt >= WORK_STALL_MS;
  alive.sort((a, b) => b.startedAt - a.startedAt);
  return alive;
}

// 導出 memo: events revision × 1s bucket (overlay が毎フレーム呼ぶため)
let workloadMemo: { revision: number; bucket: number; value: Map<string, MemberWorkload> } | null =
  null;

/** member → workload の導出 (memo 付き)。R1 の唯一の「稼働」判定入口。 */
export function computeMemberWorkloads(now: number = Date.now()): Map<string, MemberWorkload> {
  const bucket = Math.floor(now / 1000);
  if (workloadMemo && workloadMemo.revision === revision && workloadMemo.bucket === bucket) {
    return workloadMemo.value;
  }
  const map = new Map<string, MemberWorkload>();
  for (const w of computeOpenWork(now)) {
    let wl = map.get(w.memberId);
    if (!wl) {
      wl = { open: [], active: [], stalled: [] };
      map.set(w.memberId, wl);
    }
    wl.open.push(w);
    if (w.stalled) wl.stalled.push(w);
    else wl.active.push(w);
  }
  workloadMemo = { revision, bucket, value: map };
  return map;
}

/** member が「稼働中」(未完了の生きたしごと保有) か — R1 正本の便宜 API */
export function karteActiveWorkCount(memberId: string, now: number = Date.now()): number {
  return computeMemberWorkloads(now).get(memberId)?.active.length ?? 0;
}

/**
 * R1 営業状態: 稼働中の member 数 (active > 0 の member の数)。
 * = 藤井 spec の `workingCount` (Σ computeDeptOccupancy.working と等価。roster に
 * 載らない member もイベントがあれば含むため、こちらの方が包含的)。
 * anyActiveWork は `karteWorkingCount(now) > 0`。全て同一 R1 定義 (computeMemberWorkloads) 由来。
 */
export function karteWorkingCount(now: number = Date.now()): number {
  let n = 0;
  for (const wl of computeMemberWorkloads(now).values()) {
    if (wl.active.length > 0) n++;
  }
  return n;
}

/**
 * 部署別の稼働チップ/照明のための集計 (R1 統一定義):
 * working = 未完了の生きたしごとを持つ member 数 / total = roster 在籍数。
 * present は presence runtime 由来 (参考値)。
 */
export function computeDeptOccupancy(
  now: number = Date.now(),
): Record<string, { total: number; present: number; working: number }> {
  const workloads = computeMemberWorkloads(now);
  const out: Record<string, { total: number; present: number; working: number }> = {};
  for (const m of jcGetAllMembers()) {
    const dept = m.department;
    if (!out[dept]) out[dept] = { total: 0, present: 0, working: 0 };
    out[dept].total++;
    if (jcGetMemberRuntime(m.id)?.isPresent) out[dept].present++;
    if ((workloads.get(m.id)?.active.length ?? 0) > 0) out[dept].working++;
  }
  return out;
}

// ── R4 完了アーカイブ (本棚) 導出 ────────────────────────────────

export interface CompletionRecord {
  memberId: string;
  task: string;
  completedAt: number;
}

/**
 * 完了しごとの全アーカイブ (新しい順)。同 member×task×同日 は 1 件に dedupe。
 * 実イベント (task_completed / delegation_complete) のみ — ダミーなし。
 */
export function computeCompletionArchive(): CompletionRecord[] {
  const seenCompletion = new Set<string>();
  const out: CompletionRecord[] = [];
  for (const e of events) {
    if (!COMPLETION_EVENTS.has(e.event) || !e.from) continue;
    const day = new Date(e.at);
    day.setHours(0, 0, 0, 0);
    const k = `${e.from}|${e.task}|${day.getTime()}`;
    if (seenCompletion.has(k)) continue;
    seenCompletion.add(k);
    out.push({ memberId: e.from, task: e.task, completedAt: e.at });
  }
  out.sort((a, b) => b.completedAt - a.completedAt);
  return out;
}

// ── 社員カルテ v2 ステータスバー導出 (2026-07-04 藤井 spec §4・eng-03) ──────────
// 既存 events[] (jcEventHistory bulk + jcHistoryEvent incremental で全型 from/to 付き
// 同期済) を **読み取りのみ** 再利用する。新規 store / postMessage channel は増やさない。
// ⚠ 共有 events[] は絶対に並べ替えない (computeOpenWork 等 他 reader との不変共有を守る)。

// 会話量: 委任/受け渡し/部署間/進捗確認 の from|to 出現数。★task_received は from=user
//   固定で member 信号ゼロ + phantom 'user' を増やすため必ず除外 (spec must_fix#2)。
//   cross_dept_message は現ログ0件 / progress_check は1件だが、将来 emit 増で自動反映
//   するため集合に含める。
const CONVERSATION_EVENTS = new Set([
  'delegate',
  'delegation_complete',
  'cross_dept_message',
  'progress_check',
]);

// 勢い: member 自身が actor(from) の活動イベント。task_received(from=user) は集合外なので
//   no-op で無害 (from=user は下の `!e.from || ...has()` で弾かれる)。
const MOMENTUM_ACTIVITY = new Set([
  'work_started',
  'delegate',
  'delegation_complete',
  'task_completed',
  'review_requested',
  'review_completed',
  'cross_dept_message',
  'skill_created',
]);

// 累積・時間非依存 → revision のみで memo。
let convoMemo: { revision: number; value: Map<string, number> } | null = null;

/**
 * 会話量 (生カウント): member が from または to[] に出る CONVERSATION_EVENTS の出現数。
 * panel が log1p + CONVERSATION_BAR_CAP で正規化する (相対 max 正規化でない)。
 */
export function computeConversationVolume(): Map<string, number> {
  if (convoMemo && convoMemo.revision === revision) return convoMemo.value;
  const counts = new Map<string, number>();
  const bump = (m: string) => {
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  };
  for (const e of events) {
    if (!CONVERSATION_EVENTS.has(e.event)) continue;
    bump(e.from); // 送り手 +1 (委任/進捗確認)
    for (const t of e.to) bump(t); // 受け手 各 +1 (e.to は normalize 済 string[] 保証)
  }
  convoMemo = { revision, value: counts };
  return counts;
}

// 揮発・now 依存 → revision × 1s バケットで memo (rAF 毎フレーム再計算のちらつき防止)。
let momentumMemo: { revision: number; bucket: number; value: Map<string, number> } | null = null;

/**
 * 勢い (生スコア): member 自身の活動 (from===id かつ event∈MOMENTUM_ACTIVITY) の
 * 半減期(24h)加重和。panel が /MOMENTUM_BAR_CAP で正規化。5 本で唯一 時間で 0 へ減衰する。
 * ⚠ now は 1s バケットで memo — rAF 毎フレーム呼ばれてもバーが毎フレーム揺れない。
 */
export function computeMemberMomentum(now: number = Date.now()): Map<string, number> {
  const bucket = Math.floor(now / 1000);
  if (momentumMemo && momentumMemo.revision === revision && momentumMemo.bucket === bucket) {
    return momentumMemo.value;
  }
  const scores = new Map<string, number>();
  for (const e of events) {
    if (!e.from || !MOMENTUM_ACTIVITY.has(e.event)) continue;
    const w = Math.pow(0.5, (now - e.at) / MOMENTUM_HALFLIFE_MS);
    scores.set(e.from, (scores.get(e.from) ?? 0) + w);
  }
  momentumMemo = { revision, bucket, value: scores };
  return scores;
}
