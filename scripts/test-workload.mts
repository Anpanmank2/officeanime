// ── R1 稼働の正本定義 (workload derivation) unit test ─────────────────
// 「稼働中 = 未完了のしごとを持つ間（受領/開始〜完了）」の導出を検証する:
//   - work_started / delegate(to) / task_assigned(to) が開く
//   - task_completed / delegation_complete (from|agent) が閉じる
//   - 完了後の再開は新しい open になる
//   - WORK_STALL_MS 超過は stalled (詰まり) — 稼働チップの分子から外れる
//   - computeDeptOccupancy が roster (department) 単位で正しく数える
// Run: npx tsx scripts/test-workload.mts

import {
  bulkSetKarteEvents,
  computeCompletionArchive,
  computeDeptOccupancy,
  computeMemberWorkloads,
  computeOpenWork,
  karteWorkingCount,
} from '../webview-ui/src/jc/karte-state.js';
import { WORK_ABANDON_MS, WORK_STALL_MS } from '../webview-ui/src/jc/jc-constants.js';
import { jcLoadConfig } from '../webview-ui/src/jc/jc-state.js';
import type { JCConfigData } from '../webview-ui/src/jc/jc-types.js';

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

// Roster: eng-01/eng-03 (engineering), res-01 (research)
const config = {
  organization: 'test',
  members: [
    { id: 'eng-01', name: '田中', nameEn: 'Kenta', role: 'Tech Lead', department: 'engineering', zone: 'dev', hueShift: 0, deskId: 'dev-desk-01' },
    { id: 'eng-03', name: '中村', nameEn: 'Hina', role: 'Frontend', department: 'engineering', zone: 'dev', hueShift: 0, deskId: 'dev-desk-03' },
    { id: 'res-01', name: '古賀', nameEn: 'Haruki', role: 'Director', department: 'research', zone: 'research', hueShift: 0, deskId: 'res-desk-01' },
  ],
  exec: [],
} as unknown as JCConfigData;
jcLoadConfig(config);

const NOW = Date.parse('2026-07-03T12:00:00.000Z');
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60000).toISOString();

console.log('1. 受領/開始 が開き、完了が閉じる (R1 定義)');
{
  bulkSetKarteEvents([
    // eng-01: work_started → 未完了 (開いたまま)
    { event: 'work_started', timestamp: iso(-30), from: 'eng-01', task: 'A' },
    // eng-03: delegate 受領のみ (work_started 無し) → 受付段階で open
    { event: 'delegate', timestamp: iso(-20), from: 'exec-sec', to: ['eng-03'], task: 'B' },
    // res-01: 開始 → 完了 (delegation_complete) → closed
    { event: 'work_started', timestamp: iso(-40), from: 'res-01', task: 'C' },
    { event: 'delegation_complete', timestamp: iso(-10), from: 'res-01', to: 'exec-sec', task: 'C' },
  ]);
  const open = computeOpenWork(NOW);
  ok('open は 2 件 (A, B)', open.length === 2, open.map((w) => w.task).join(','));
  const wl = computeMemberWorkloads(NOW);
  ok('eng-01 は稼働中 (active 1)', wl.get('eng-01')?.active.length === 1);
  ok('eng-03 は受領のみでも稼働中', wl.get('eng-03')?.active.length === 1);
  const b = open.find((w) => w.memberId === 'eng-03');
  ok('受領のみは hasStarted=false (受付段階)', b?.hasStarted === false);
  ok('res-01 は完了済み → 非稼働', (wl.get('res-01')?.active.length ?? 0) === 0);

  const occ = computeDeptOccupancy(NOW);
  ok('engineering working=2/2', occ.engineering?.working === 2 && occ.engineering?.total === 2, `working=${occ.engineering?.working} total=${occ.engineering?.total}`);
  ok('research working=0', occ.research?.working === 0);
}

console.log('2. task_completed (agent フィールド) でも閉じる');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-30), from: 'eng-01', task: 'A' },
    { event: 'task_completed', timestamp: iso(-5), agent: 'eng-01', task: 'A' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('agent フィールドの完了で閉じる', (wl.get('eng-01')?.active.length ?? 0) === 0);
}

console.log('3. 完了後の再開は新しい open (再開時刻から)');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-120), from: 'eng-01', task: 'A' },
    { event: 'delegation_complete', timestamp: iso(-100), from: 'eng-01', to: 'exec-sec', task: 'A' },
    { event: 'work_started', timestamp: iso(-15), from: 'eng-01', task: 'A' },
  ]);
  const open = computeOpenWork(NOW);
  ok('再開分 1 件が open', open.length === 1);
  ok('startedAt は再開時刻', open[0]?.startedAt === NOW - 15 * 60000);
  ok('stalled ではない', open[0]?.stalled === false);
}

console.log('4. WORK_STALL_MS 超過は stalled → 稼働チップの分子から外れる');
{
  const stallMin = Math.ceil(WORK_STALL_MS / 60000) + 10;
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-stallMin), from: 'eng-01', task: '古い残骸' },
    { event: 'work_started', timestamp: iso(-10), from: 'eng-03', task: '生きてる仕事' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('eng-01 は stalled (active 0)', (wl.get('eng-01')?.active.length ?? 0) === 0 && wl.get('eng-01')?.stalled.length === 1);
  ok('eng-03 は active', wl.get('eng-03')?.active.length === 1);
  const occ = computeDeptOccupancy(NOW);
  ok('engineering working=1 (停滞は数えない)', occ.engineering?.working === 1, `working=${occ.engineering?.working}`);
}

console.log('5. 完了アーカイブ (日付順・dedupe)');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-300), from: 'eng-01', task: 'A' },
    { event: 'delegation_complete', timestamp: iso(-200), from: 'eng-01', to: 'exec-sec', task: 'A' },
    // 同日同taskの二重完了は 1 件に dedupe
    { event: 'task_completed', timestamp: iso(-199), from: 'eng-01', task: 'A' },
    { event: 'delegation_complete', timestamp: iso(-50), from: 'res-01', to: 'exec-sec', task: 'C' },
  ]);
  const arch = computeCompletionArchive();
  ok('アーカイブ 2 件 (dedupe 済)', arch.length === 2, String(arch.length));
  ok('新しい順', arch[0]?.task === 'C' && arch[1]?.task === 'A');
}

// ── 元栓修正 回帰テスト (2026-07-04 eng-03): open/close pairing の member 単位フォールバック ──
// 開始側と完了側で task 文字列が食い違っても閉じられること / 精密一致を壊さないこと /
// 未完了ゼロで壊れないこと / 本当に完了ゼロは 2h で停滞のまま (過剰に閉じない) を固定する。

console.log('6. (a) task 名不一致の完了でも閉じる (member 単位フォールバック = 元栓修正)');
{
  bulkSetKarteEvents([
    // 開始「…の最終検証」/ 完了「… 独立検証」— 実データで永久に開きっぱなしになっていた指紋。
    { event: 'work_started', timestamp: iso(-30), from: 'eng-04', task: 'オフィス営業状態+ヒートビートの最終検証' },
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-04', to: 'exec-sec', task: 'オフィス営業状態+ヒートビート 独立検証' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('task 名が食い違っても完了で閉じる (active 0, open 0)', (wl.get('eng-04')?.open.length ?? 0) === 0);
  const open = computeOpenWork(NOW);
  ok('open 全体も 0 件', open.length === 0, String(open.length));
}

console.log('7. (b) 複数未完了は「古い順」に閉じる (fallback は startedAt 最小を閉じる)');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-90), from: 'eng-01', task: '古い仕事X' }, // oldest
    { event: 'work_started', timestamp: iso(-40), from: 'eng-01', task: '新しい仕事Y' },
    // task 名が両方に一致しない完了 → 一番古い X が閉じる。Y は残る。
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-01', to: 'exec-sec', task: '別名の完了' },
  ]);
  const open = computeOpenWork(NOW);
  ok('残 open は 1 件', open.length === 1, open.map((w) => w.task).join(','));
  ok('閉じたのは古い方 X (残ったのは Y)', open[0]?.task === '新しい仕事Y');
  // さらに 2 通目の別名完了で残りの Y も閉じる。
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-90), from: 'eng-01', task: '古い仕事X' },
    { event: 'work_started', timestamp: iso(-40), from: 'eng-01', task: '新しい仕事Y' },
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-01', to: 'exec-sec', task: '別名の完了1' },
    { event: 'task_completed', timestamp: iso(-3), agent: 'eng-01', task: '別名の完了2' },
  ]);
  ok('2 通の別名完了で両方閉じる (open 0)', computeOpenWork(NOW).length === 0);
}

console.log('8. (c) 同一 task 名がある場合はそれを優先 (精密一致を壊さない)');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-90), from: 'eng-01', task: '古い残骸' }, // oldest, abandoned
    { event: 'work_started', timestamp: iso(-40), from: 'eng-01', task: '完了する仕事' },
    // task 名が一致する完了 → 古い「残骸」ではなく一致する方を閉じる。
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-01', to: 'exec-sec', task: '完了する仕事' },
  ]);
  const open = computeOpenWork(NOW);
  ok('残 open は 1 件 (精密一致した方が閉じ、古い残骸が残る)', open.length === 1, open.map((w) => w.task).join(','));
  ok('残ったのは「古い残骸」(精密一致優先で古い方を誤爆しない)', open[0]?.task === '古い残骸');
}

console.log('9. (d) 未完了ゼロで完了イベントが来ても壊れない (graceful)');
{
  bulkSetKarteEvents([
    // 開始が一切無い member への完了イベント。
    { event: 'delegation_complete', timestamp: iso(-5), from: 'res-01', to: 'exec-sec', task: '対応する開始なし' },
    // 完了 → 完了 の連打 (二重完了) でも例外なく空のまま。
    { event: 'task_completed', timestamp: iso(-3), agent: 'res-01', task: 'まだ無い' },
  ]);
  const open = computeOpenWork(NOW);
  ok('未完了ゼロへの完了は無視され open 0 件 (throw しない)', open.length === 0, String(open.length));
  ok('computeMemberWorkloads も空で安全', (computeMemberWorkloads(NOW).get('res-01')?.open.length ?? 0) === 0);
}

console.log('10. (e) 本当に完了イベントゼロのものは従来どおり 2h で停滞 (過剰に閉じない)');
{
  const stallMin = Math.ceil(WORK_STALL_MS / 60000) + 15; // 2h 超前に開始・完了イベント無し
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-stallMin), from: 'eng-03', task: '本当に放置' },
    // 別 member の無関係な完了があっても、eng-03 の放置には触れない (member 単位で分離)。
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-01', to: 'exec-sec', task: '無関係' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('放置は閉じず stalled に残る (active 0 / stalled 1)', (wl.get('eng-03')?.active.length ?? 0) === 0 && wl.get('eng-03')?.stalled.length === 1);
  ok('他 member の完了で誤って閉じない (open 1 件のまま)', wl.get('eng-03')?.open.length === 1);
}

console.log('11. (f) 実データの3イベント三つ子 (delegate + work_started + completion, 文字列違い) を1完了で閉じ切る');
{
  // 実データの指紋: 秘書 delegate「Xの最終検証」/ agent work_started「X 独立検証」/ 完了「X 独立検証」。
  // 旧: 完了が work_started とだけ精密一致し delegate が永久に開きっぱなし → 稼働中に居座る。
  bulkSetKarteEvents([
    { event: 'delegate', timestamp: iso(-20), from: 'exec-sec', to: ['eng-04'], task: 'オフィス営業状態+ヒートビートの最終検証' },
    { event: 'work_started', timestamp: iso(-19), from: 'eng-04', task: 'オフィス営業状態+ヒートビート 独立検証' },
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-04', to: 'exec-sec', task: 'オフィス営業状態+ヒートビート 独立検証' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('三つ子は 1 完了で受領 delegate ごと閉じる (open 0)', (wl.get('eng-04')?.open.length ?? 0) === 0, `open=${wl.get('eng-04')?.open.length}`);
  ok('稼働中に居座らない (active 0)', (wl.get('eng-04')?.active.length ?? 0) === 0);
}

console.log('12. (g) 双子畳み込みは「着手より後に受領した未着手 delegate」を誤爆しない (保留中を保護)');
{
  bulkSetKarteEvents([
    // タスク A: 受領 → 着手 (文字列違い)
    { event: 'delegate', timestamp: iso(-40), from: 'exec-sec', to: ['eng-01'], task: 'A の最終検証' },
    { event: 'work_started', timestamp: iso(-38), from: 'eng-01', task: 'A 独立検証' },
    // タスク B: A 着手より後に受領した別タスク (未着手・本当に保留中)
    { event: 'delegate', timestamp: iso(-20), from: 'exec-sec', to: ['eng-01'], task: 'B 受領のみ保留' },
    // A の完了 → A(着手済) + A受領双子 を閉じる。B は着手時刻より後の受領なので残る。
    { event: 'delegation_complete', timestamp: iso(-5), from: 'eng-01', to: 'exec-sec', task: 'A 独立検証' },
  ]);
  const open = computeOpenWork(NOW);
  ok('残 open は B のみ 1 件 (A の受領+着手は畳んで閉じた)', open.length === 1, open.map((w) => w.task).join(','));
  ok('残ったのは保留中 B (後から受領した未着手を誤爆しない)', open[0]?.task === 'B 受領のみ保留');
  ok('B は受領のみ hasStarted=false のまま', open[0]?.hasStarted === false);
}

// ── 放置しごとの自動掃除 回帰テスト (2026-07-04 eng-03): WORK_ABANDON_MS(12h) ──
// 未完了しごとの 3 段化 (active < 2h / stalled 2h〜12h / abandoned >= 12h = 盤面除外) を固定する。
// 完了イベントを出さず消えたセッションの残骸 (19h/1日前) が停滞欄に永遠に居座らないこと。

console.log('13. WORK_ABANDON_MS は WORK_STALL_MS / OFFICE_CLOSE_IDLE_MS と別の第3の時計');
{
  ok('WORK_ABANDON_MS = 12h', WORK_ABANDON_MS === 12 * 3600_000, `${WORK_ABANDON_MS}ms`);
  ok('WORK_STALL_MS(2h) より長い (放置は停滞より一段深い)', WORK_ABANDON_MS > WORK_STALL_MS);
  ok('別 export (同じ束縛でない)', typeof WORK_ABANDON_MS === 'number' && typeof WORK_STALL_MS === 'number');
}

console.log('14. (a) 12h超の未完了は active/stalled どちらにも数えない (放置=盤面から除外)');
{
  const abandonMin = Math.ceil(WORK_ABANDON_MS / 60000) + 30; // 12h+30min = 放置
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-abandonMin), from: 'eng-01', task: '完了イベント無しで消えた残骸' },
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('active 0 件', (wl.get('eng-01')?.active.length ?? 0) === 0);
  ok('stalled 0 件 (停滞にも居座らない)', (wl.get('eng-01')?.stalled.length ?? 0) === 0);
  ok('open 0 件 (盤面から完全に消える)', (wl.get('eng-01')?.open.length ?? 0) === 0);
  ok('computeOpenWork 全体も 0 件', computeOpenWork(NOW).length === 0, String(computeOpenWork(NOW).length));
}

console.log('15. (b) 2h〜12h は従来どおり stalled / (c) <2h は active (既存挙動を壊さない)');
{
  const stallMin = Math.ceil(WORK_STALL_MS / 60000) + 30; // 2.5h = stalled
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-stallMin), from: 'eng-01', task: '2h超12h未満' }, // stalled
    { event: 'work_started', timestamp: iso(-10), from: 'eng-03', task: '生きてる' }, // active
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('(b) eng-01 は stalled (active 0 / stalled 1)', (wl.get('eng-01')?.active.length ?? 0) === 0 && wl.get('eng-01')?.stalled.length === 1);
  ok('(c) eng-03 は active (active 1 / stalled 0)', wl.get('eng-03')?.active.length === 1 && (wl.get('eng-03')?.stalled.length ?? 0) === 0);
}

console.log('16. (d) 境界値: ちょうど 12h は abandoned (>= WORK_ABANDON_MS)、12h直前は stalled');
{
  bulkSetKarteEvents([
    { event: 'work_started', timestamp: iso(-WORK_ABANDON_MS / 60000), from: 'eng-01', task: 'ちょうど12h' }, // >= → abandoned
    { event: 'work_started', timestamp: iso(-(WORK_ABANDON_MS / 60000 - 1)), from: 'eng-03', task: '12h直前(1分前)' }, // < → stalled
  ]);
  const wl = computeMemberWorkloads(NOW);
  ok('ちょうど 12h は除外 (open 0)', (wl.get('eng-01')?.open.length ?? 0) === 0);
  ok('12h直前(11h59m)は stalled で残る (open 1 / stalled 1)', wl.get('eng-03')?.open.length === 1 && wl.get('eng-03')?.stalled.length === 1);
}

console.log('17. (e) abandoned は稼働チップ/workingCount から確実に消える (単一元栓で全反映)');
{
  const abandonMin = Math.ceil(WORK_ABANDON_MS / 60000) + 120; // 14h = 放置 (「19h/1日前の残骸」相当)
  bulkSetKarteEvents([
    // eng-01: 14h 放置の残骸 (完了イベント無しで消えたセッション) → 掃除で除外
    { event: 'work_started', timestamp: iso(-abandonMin), from: 'eng-01', task: '1日近く放置' },
    // eng-03: 生きた仕事 → これだけが稼働
    { event: 'work_started', timestamp: iso(-10), from: 'eng-03', task: '生きた仕事' },
  ]);
  const occ = computeDeptOccupancy(NOW);
  ok('engineering working=1 (放置は稼働チップの分子から消える)', occ.engineering?.working === 1, `working=${occ.engineering?.working}`);
  ok('karteWorkingCount=1 (放置は workingCount から消える)', karteWorkingCount(NOW) === 1, `count=${karteWorkingCount(NOW)}`);
  // eng-01 は放置除外で 稼働 0 = office 営業状態でも「稼働中」に数えられない。
  ok('放置した eng-01 は active 0 (照明/5状態からも消える源)', (computeMemberWorkloads(NOW).get('eng-01')?.active.length ?? 0) === 0);
}

console.log(`\n=== Workload (R1): ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
