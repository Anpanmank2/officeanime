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
  bulkSetKarteEvents(rawEvents);

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
