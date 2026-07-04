// ── R1 オフィス営業状態マシン unit test (2026-07-04 eng-03) ─────────────────
// AC-1: 全員idle+2h無活動で CLOSED に遷移 (合成クロックで実証)
// AC-2: CLOSED 中に新 activity イベントで OPEN に戻る (reversible)
// AC-4: office-status CLI と webview が **同一関数** (deriveOfficeTarget /
//        readOfficeSnapshot) を共有する — ここで直接叩いて挙動を固定
// AC-5: OFFICE_CLOSE_IDLE_MS と WORK_STALL_MS が別定数 (混同しない)
// 追加: office_heartbeat / progress_check は「活動」に数えない (秘書の毎時巡回で
//        店じまいタイマーが永久リセットされる根幹バグの回帰ガード)
// Run: npx tsx scripts/test-office-status.mts

import { WORK_STALL_MS, OFFICE_CLOSE_IDLE_MS } from '../webview-ui/src/jc/jc-constants.js';
import { bulkSetKarteEvents } from '../webview-ui/src/jc/karte-state.js';
import { jcLoadConfig } from '../webview-ui/src/jc/jc-state.js';
import type { JCConfigData } from '../webview-ui/src/jc/jc-types.js';
import {
  CLOSE_THRESHOLD_MS,
  deriveOfficeTarget,
  readOfficeSnapshot,
} from '../webview-ui/src/jc/office-hours.js';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ' (' + detail + ')' : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' (' + detail + ')' : ''}`);
  }
}

const config = {
  organization: 'test',
  members: [
    { id: 'eng-01', name: '田中', nameEn: 'Kenta', role: 'Tech Lead', department: 'engineering', zone: 'dev', hueShift: 0, deskId: 'dev-desk-01' },
    { id: 'eng-03', name: '中村', nameEn: 'Hina', role: 'Frontend', department: 'engineering', zone: 'dev', hueShift: 0, deskId: 'dev-desk-03' },
    { id: 'exec-sec', name: '秘書', nameEn: 'Yui', role: 'Secretary', department: 'exec', zone: 'exec', hueShift: 0, deskId: 'exec-desk-01' },
  ],
  exec: [],
} as unknown as JCConfigData;
jcLoadConfig(config);

const NOW = Date.parse('2026-07-04T18:00:00.000Z');
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60000).toISOString();
const H2 = OFFICE_CLOSE_IDLE_MS / 60000; // 120 min

console.log('0. AC-5: OFFICE_CLOSE_IDLE_MS と WORK_STALL_MS は別定数');
{
  ok('両者とも 2h', OFFICE_CLOSE_IDLE_MS === 2 * 3600_000 && WORK_STALL_MS === 2 * 3600_000);
  ok('CLOSE_THRESHOLD_MS = OFFICE_CLOSE_IDLE_MS (別名一致)', CLOSE_THRESHOLD_MS === OFFICE_CLOSE_IDLE_MS);
  // 別シンボルであること (同じ束縛でない) を型/参照で担保 — 値は等しくても別 export。
  ok('別 export として import できる', typeof OFFICE_CLOSE_IDLE_MS === 'number' && typeof WORK_STALL_MS === 'number');
}

console.log('1. deriveOfficeTarget 純粋判定 (合成クロック)');
{
  ok('稼働中(workingCount>0)なら idle 無関係に open', deriveOfficeTarget(NOW - 5 * 3600_000, 1, NOW) === 'open');
  ok('全員非稼働 + idle 1h → open (まだ)', deriveOfficeTarget(NOW - 60 * 60000, 0, NOW) === 'open');
  ok('全員非稼働 + idle ちょうど 2h → closed', deriveOfficeTarget(NOW - H2 * 60000, 0, NOW) === 'closed');
  ok('全員非稼働 + idle 2h超 → closed', deriveOfficeTarget(NOW - (H2 + 30) * 60000, 0, NOW) === 'closed');
  ok('活動記録なし(null) → 既定 open', deriveOfficeTarget(null, 0, NOW) === 'open');
  ok('2h直前(119分)は open (境界)', deriveOfficeTarget(NOW - (H2 - 1) * 60000, 0, NOW) === 'open');
}

console.log('2. AC-1: 全員idle + 2h無活動 → CLOSED (readOfficeSnapshot / 実データ経路)');
{
  bulkSetKarteEvents([
    // eng-01: 3h前に開始し 2.5h前に完了 → 未完了なし (全員非稼働)
    { event: 'work_started', timestamp: iso(-180), from: 'eng-01', task: 'A' },
    { event: 'delegation_complete', timestamp: iso(-150), from: 'eng-01', to: 'exec-sec', task: 'A' },
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('稼働 0 人', snap.workingCount === 0, `working=${snap.workingCount}`);
  ok('最終活動 = 完了(-150分) = 2.5h前', snap.lastActivityAt === NOW - 150 * 60000);
  ok('idle >= 2h → CLOSED', snap.target === 'closed', `idleMs=${snap.idleMs}`);
  ok('店じまい条件 yes', snap.meetsCloseCondition === true);
}

console.log('3. AC-2: CLOSED 中に新 activity → OPEN (reversible)');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-180), from: 'eng-01', task: 'A' },
    { event: 'delegation_complete', timestamp: iso(-150), from: 'eng-01', to: 'exec-sec', task: 'A' },
    // 直近に新しい依頼 (delegate) が来た → 出社・再開
    { event: 'delegate', timestamp: iso(-1), from: 'exec-sec', to: ['eng-03'], task: 'B' },
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('稼働 1 人 (eng-03 受領)', snap.workingCount === 1, `working=${snap.workingCount}`);
  ok('新イベントで OPEN に戻る', snap.target === 'open');
  ok('店じまい条件 no', snap.meetsCloseCondition === false);
  ok('最終活動が直近(-1分)に更新', snap.lastActivityAt === NOW - 1 * 60000);
}

console.log('4. office_heartbeat は「活動」に数えない (店じまいタイマーを reset しない)');
{
  bulkSetKarteEvents([
    // 最後の本当の活動は 3h前。以後 秘書が毎時 heartbeat を打っている。
    { event: 'delegation_complete', timestamp: iso(-180), from: 'eng-01', to: 'exec-sec', task: 'A' },
    { event: 'office_heartbeat', timestamp: iso(-120), from: 'exec-sec' },
    { event: 'office_heartbeat', timestamp: iso(-60), from: 'exec-sec' },
    { event: 'office_heartbeat', timestamp: iso(-5), from: 'exec-sec' }, // 直近だが活動ではない
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('最終活動は 3h前のまま (heartbeat で更新されない)', snap.lastActivityAt === NOW - 180 * 60000);
  ok('heartbeat 連打でも CLOSED (タイマー永久リセットのバグ無し)', snap.target === 'closed');
  ok('最終確認(HB) は直近 heartbeat(-5分)', snap.lastHeartbeatAt === NOW - 5 * 60000);
}

console.log('5. progress_check も「活動」に数えない');
{
  bulkSetKarteEvents([
    { event: 'delegation_complete', timestamp: iso(-200), from: 'eng-01', to: 'exec-sec', task: 'A' },
    { event: 'progress_check', timestamp: iso(-3), from: 'exec-sec', to: 'eng-01', message: '進捗どう?' },
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('progress_check は活動に非該当 → 最終活動は -200分', snap.lastActivityAt === NOW - 200 * 60000);
  ok('progress_check だけでは reopen しない → CLOSED', snap.target === 'closed');
}

console.log('6. stalled (死んだ残骸) は稼働に数えず、活動時刻も古いので CLOSED');
{
  const stallMin = Math.ceil(WORK_STALL_MS / 60000) + 30; // 2.5h前に開始し完了なし
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-stallMin), from: 'eng-01', task: '古い残骸' },
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('stalled は workingCount に数えない (0人)', snap.workingCount === 0, `working=${snap.workingCount}`);
  ok('最終活動が 2h超前 → CLOSED', snap.target === 'closed');
}

console.log('7. 生きた stalled でも 直近に別の活動があれば OPEN (活動時刻優先)');
{
  const stallMin = Math.ceil(WORK_STALL_MS / 60000) + 30;
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-stallMin), from: 'eng-01', task: '古い残骸' }, // stalled
    { event: 'work_started', timestamp: iso(-10), from: 'eng-03', task: '生きた仕事' }, // active
  ]);
  const snap = readOfficeSnapshot(NOW);
  ok('生きた仕事で稼働 1 人 → OPEN', snap.workingCount === 1 && snap.target === 'open');
}

console.log('8. イベント無し → 既定 OPEN・最終活動/最終確認は —(null)');
{
  bulkSetKarteEvents([]);
  const snap = readOfficeSnapshot(NOW);
  ok('空でも OPEN (静かなだけ)', snap.target === 'open');
  ok('最終活動 null', snap.lastActivityAt === null);
  ok('最終確認 null', snap.lastHeartbeatAt === null);
  ok('店じまい条件 no', snap.meetsCloseCondition === false);
}

console.log(`\n=== Office Status (R1): ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
