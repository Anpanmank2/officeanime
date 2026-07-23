#!/usr/bin/env -S npx tsx
// ── 秘書ヒートビート CLI: オフィス営業状態 (2026-07-04 eng-03) ─────────────
// 秘書が 1 時間ごとに叩いて「進捗把握・停滞検知・店じまい判定」に使う backbone。
//
//   npx tsx pixel-agents/scripts/office-status.mjs [--json] [--now <ISO|ms>]
//                                                  [--file <jc-events.json>]
//                                                  [--config <jc-config.json>]
//
// jc-events.json を読み、以下を stdout に出す (決定論):
//   - 最終活動時刻 / 最終確認(office_heartbeat) 時刻
//   - 各 member の状態 (active / idle / stalled) 一覧
//   - OPEN | CLOSED 判定
//   - 店じまい条件 (全員非稼働 かつ 2h idle) を満たすか yes/no
//
// ⚠ 営業判定は R1 の **単一ロジック** = office-hours.ts の readOfficeSnapshot /
//    deriveOfficeTarget を webview と共有 import する (二重定義しない = AC-4)。
//    稼働の定義は karte-state.ts computeMemberWorkloads (R1 正本) 由来。

import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  bulkSetKarteEvents,
  computeMemberWorkloads,
  karteLastActivityAt,
} from '../webview-ui/src/jc/karte-state.js';
import { jcGetAllMembers, jcLoadConfig } from '../webview-ui/src/jc/jc-state.js';
import { readOfficeSnapshot } from '../webview-ui/src/jc/office-hours.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..'); // pixel-agents/

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) args[key] = argv[++i];
    else args[key] = true;
  }
  return args;
}

/** jc-events.json の解決 — standalone-launcher の resolveJcEventsPath を踏襲。
 *  秘書は jopt-company ルート (pixel-agents の親) で emit するため、そちらを優先。 */
function resolveEventsPath(fileArg) {
  if (fileArg) return resolve(fileArg);
  const parentDir = resolve(REPO_ROOT, '..');
  const parentEvents = join(parentDir, 'jc-events.json');
  const repoEvents = join(REPO_ROOT, 'jc-events.json');
  // 親に .company があれば会社ルート運用 → 親の jc-events.json が正史。
  if (existsSync(join(parentDir, '.company')) && existsSync(parentEvents)) return parentEvents;
  if (!existsSync(repoEvents) && existsSync(parentEvents)) return parentEvents;
  return repoEvents;
}

function resolveConfigPath(configArg) {
  if (configArg) return resolve(configArg);
  const repoConfig = join(REPO_ROOT, 'jc-config.json');
  if (existsSync(repoConfig)) return repoConfig;
  const parentConfig = join(resolve(REPO_ROOT, '..'), 'jc-config.json');
  return existsSync(parentConfig) ? parentConfig : repoConfig;
}

function parseNow(nowArg) {
  if (nowArg === undefined) return Date.now();
  const asNum = Number(nowArg);
  if (Number.isFinite(asNum) && String(asNum) === String(nowArg)) return asNum; // ms epoch
  const parsed = Date.parse(nowArg);
  if (!Number.isFinite(parsed)) {
    console.error(`ERROR: --now を解釈できません: "${nowArg}" (ISO 文字列か ms epoch)`);
    process.exit(2);
  }
  return parsed;
}

function fmtTime(ms) {
  if (ms === null || ms === undefined) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtHHMM(ms) {
  if (ms === null || ms === undefined) return '—';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── STALL 誤検知 修正 (2026-07-23 eng-01, 実測: eng-04 TCG PF強者調査) ──────
// 事実: karte-state.ts (R1 正本・webview 共有・改変禁止) は task_completed も
// delegation_complete も既に COMPLETION_EVENTS として扱う。バグはそこではなく、
// 「actor の完了イベントの task 文字列が未完了 item と完全一致しない場合、
// **member の最古(FIFO)** 未完了にフォールバックして閉じる」設計にある。
// 実運用は delegate と task_completed で task 文字列が食い違うことが多く
// (例: delegate="TCG PF強者調査 正本ドキュメントPM検証" → task_completed="TCG PF強者調査 PM検証PASS")、
// 完全一致しない完了が続くと「最古優先」が過去の (文字列不一致で一度も正確に
// 閉じられなかった) backlog を延々掴み続け、直近の新規タスクが未完了のまま
// 2h 後に STALL 誤検知される (実測: eng-04 に 07-13 以降 backlog 24件滞留)。
// karte-state.ts 側は改変できないため、bulkSetKarteEvents に渡す**投入前の
// イベント列そのもの**をここで補正する: 完了イベントが厳密一致しない場合、
// 完了は通常「actor が今さっき受けた/始めた仕事」を指すという運用実態に基づき、
// その actor の**直近(LIFO)**の未完了 item に task 文字列を書き換えてから渡す。
// こうすると karte-state.ts 側は「1) 完全一致」分岐で正しく直近の item を閉じる
// (二重定義を避け、投入データの補正のみで完結させる自己完結パッチ)。
const RECONCILE_RECEIPT_EVENTS = new Set(['delegate', 'task_assigned']);
const RECONCILE_COMPLETION_EVENTS = new Set(['task_completed', 'delegation_complete']);

function reconcileActorOf(e) {
  if (typeof e.from === 'string' && e.from) return e.from;
  if (typeof e.agent === 'string' && e.agent) return e.agent; // work_started/task_completed の旧emitter対応
  return '';
}

function reconcileHoldersOf(e) {
  if (Array.isArray(e.to)) return e.to.filter((x) => typeof x === 'string' && x);
  if (typeof e.to === 'string' && e.to) return [e.to];
  return [];
}

/** karte-state.ts の openRank と同じ考え方 (同時刻は開くを先に処理) のローカル軽量版。 */
function reconcileOpenRank(e) {
  if (e.event === 'work_started' || RECONCILE_RECEIPT_EVENTS.has(e.event)) return 0;
  if (RECONCILE_COMPLETION_EVENTS.has(e.event)) return 1;
  return 2;
}

/**
 * 完了イベントの task 文字列を、actor の直近(LIFO)未完了 item に補正した配列を返す。
 * jc-events.json 自体は書き換えない (このプロセス内のメモリ上補正のみ)。
 */
function reconcileCompletionLinkage(raw) {
  const withMeta = raw.map((e, i) => ({
    e,
    i,
    at: e && typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN,
  }));
  const ordered = withMeta
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at || reconcileOpenRank(a.e) - reconcileOpenRank(b.e) || a.i - b.i);

  const openByActor = new Map(); // actor → Map<task, true> (挿入順 = 古い→新しい)
  const out = raw.slice();

  for (const { e, i } of ordered) {
    if (RECONCILE_COMPLETION_EVENTS.has(e.event)) {
      const actor = reconcileActorOf(e);
      if (!actor) continue;
      const openTasks = openByActor.get(actor);
      if (!openTasks || openTasks.size === 0) continue; // 未完了なし → 補正不要 (下流の graceful 無視に委ねる)
      const task = typeof e.task === 'string' ? e.task : '';
      if (openTasks.has(task)) {
        openTasks.delete(task); // 精密一致 → 補正不要、そのまま消費
        continue;
      }
      let lastTask = null;
      for (const t of openTasks.keys()) lastTask = t; // Map 挿入順 → 最後 = 直近(LIFO)
      if (lastTask === null) continue;
      openTasks.delete(lastTask);
      out[i] = { ...e, task: lastTask };
      continue;
    }
    let holders = [];
    if (e.event === 'work_started') {
      const actor = reconcileActorOf(e);
      if (actor) holders = [actor];
    } else if (RECONCILE_RECEIPT_EVENTS.has(e.event)) {
      holders = reconcileHoldersOf(e);
    } else {
      continue;
    }
    const task = typeof e.task === 'string' ? e.task : '';
    for (const m of holders) {
      let openTasks = openByActor.get(m);
      if (!openTasks) {
        openTasks = new Map();
        openByActor.set(m, openTasks);
      }
      if (!openTasks.has(task)) openTasks.set(task, true);
    }
  }
  return out;
}

function fmtAgo(ms, now) {
  if (ms === null || ms === undefined) return '';
  const min = Math.floor((now - ms) / 60000);
  if (min < 1) return '(たった今)';
  if (min < 60) return `(${min}分前)`;
  const h = Math.floor(min / 60);
  if (h < 24) return `(${h}時間${min % 60 ? `${min % 60}分` : ''}前)`;
  return `(${Math.floor(h / 24)}日前)`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = parseNow(args.now);
  const eventsPath = resolveEventsPath(args.file);
  const configPath = resolveConfigPath(args.config);

  // 1. roster (member 一覧のため) を jc-state に読み込む
  let rosterLoaded = false;
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      jcLoadConfig(config);
      rosterLoaded = true;
    }
  } catch (e) {
    console.error(`WARN: jc-config.json 読込失敗 (${configPath}): ${e.message}`);
  }

  // 2. jc-events.json → karte store (R1 の入力)
  let rawEvents = [];
  try {
    if (existsSync(eventsPath)) {
      const file = JSON.parse(readFileSync(eventsPath, 'utf-8'));
      rawEvents = Array.isArray(file.events) ? file.events : Array.isArray(file) ? file : [];
    }
  } catch (e) {
    console.error(`ERROR: jc-events.json 読込失敗 (${eventsPath}): ${e.message}`);
    process.exit(2);
  }
  bulkSetKarteEvents(reconcileCompletionLinkage(rawEvents));

  // 3. R1 共有ロジックで判定 (webview と同一関数)
  const snap = readOfficeSnapshot(now);
  const workloads = computeMemberWorkloads(now);

  // 4. member 状態一覧 (roster があれば全員、無ければイベント登場者)
  const members = rosterLoaded
    ? jcGetAllMembers().map((m) => ({ id: m.id, name: m.name, department: m.department }))
    : [...workloads.keys()].map((id) => ({ id, name: id, department: '' }));

  const rows = members.map((m) => {
    const wl = workloads.get(m.id);
    const active = wl?.active ?? [];
    const stalled = wl?.stalled ?? [];
    const state = active.length > 0 ? 'active' : stalled.length > 0 ? 'stalled' : 'idle';
    const topTask = active[0]?.task || stalled[0]?.task || '';
    const since = active[0]?.startedAt ?? stalled[0]?.startedAt ?? null;
    return { ...m, state, task: topTask, since, active: active.length, stalled: stalled.length };
  });

  const counts = rows.reduce((acc, r) => ((acc[r.state] += 1), acc), {
    active: 0,
    idle: 0,
    stalled: 0,
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          now,
          nowIso: new Date(now).toISOString(),
          status: snap.target.toUpperCase(), // OPEN | CLOSED
          meetsCloseCondition: snap.meetsCloseCondition, // 店じまい条件 (2h idle)
          workingCount: snap.workingCount,
          lastActivityAt: snap.lastActivityAt,
          lastActivityIso: snap.lastActivityAt ? new Date(snap.lastActivityAt).toISOString() : null,
          idleMs: snap.idleMs,
          closeThresholdMs: snap.closeThresholdMs,
          lastHeartbeatAt: snap.lastHeartbeatAt,
          lastHeartbeatHHMM: fmtHHMM(snap.lastHeartbeatAt),
          counts,
          members: rows,
          eventsPath,
          eventCount: rawEvents.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const statusLabel = snap.target === 'closed' ? 'CLOSED（店じまい）' : 'OPEN（営業中）';
  const hoursThresh = Math.round(snap.closeThresholdMs / 3600000);
  console.log('━━━ オフィス営業状態 (office-status) ━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  判定時刻(now):   ${fmtTime(now)}`);
  console.log(
    `  最終活動:        ${fmtTime(snap.lastActivityAt)} ${fmtAgo(snap.lastActivityAt, now)}`,
  );
  console.log(`                   (活動=依頼/開始/完了等。heartbeat/progress_check は除外)`);
  console.log(
    `  最終確認(HB):    ${fmtHHMM(snap.lastHeartbeatAt)}  ${fmtAgo(snap.lastHeartbeatAt, now)}`,
  );
  console.log(`  稼働中:          ${snap.workingCount} 人`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  営業判定:        ${statusLabel}`);
  console.log(
    `  店じまい条件(全員非稼働 かつ ${hoursThresh}h idle): ${snap.meetsCloseCondition ? 'yes' : 'no'}`,
  );
  console.log(`  ─────────────────────────────────────────────`);
  console.log(
    `  member 状態一覧 — active=${counts.active} idle=${counts.idle} stalled=${counts.stalled} (在籍 ${rows.length})`,
  );
  // 停滞→稼働→待機 の順で並べる (要対応を上に)。
  const order = { stalled: 0, active: 1, idle: 2 };
  for (const r of [...rows].sort(
    (a, b) => order[a.state] - order[b.state] || a.id.localeCompare(b.id),
  )) {
    const tag =
      r.state === 'active' ? '[active] ' : r.state === 'stalled' ? '[STALL!] ' : '[idle]   ';
    const ago = r.since ? fmtAgo(r.since, now) : '';
    const task = r.task ? `— ${r.task} ${ago}` : '';
    console.log(`    ${tag}${r.id.padEnd(8)} ${r.name.padEnd(6)} ${task}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main();
