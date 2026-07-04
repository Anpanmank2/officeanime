// ── R6 server crash 防御 unit test (AC-7) ─────────────────────────────
// 実物の EventWatcher.handleEvent に message 欠落の malformed イベントを流し、
// 例外が出ない (= プロセスが死なない) ことを検証する。
// 差戻し前の HEAD では event.message.slice(0,25) が 5 箇所で TypeError →
// setInterval 経由の uncaught でプロセスが落ちていた。
// Run: npx tsx scripts/test-malformed-delegate.mts

import type { JCConfig, OfficeEvent } from '../src/jc/types.js';

// src は CJS 変換されるため named static import が interop で落ちる —
// living-loop テストと同じく dynamic import で読む。
const { EventWatcher } = await import('../src/jc/event-watcher.js');

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
    {
      id: 'exec-sec',
      name: '秘書',
      nameEn: 'Sec',
      role: 'Secretary',
      department: 'exec',
      zone: 'exec',
      hueShift: 0,
      deskId: 'exec-desk-sec',
      layer: 0,
    },
    {
      id: 'res-01',
      name: '古賀',
      nameEn: 'Haruki',
      role: 'Director',
      department: 'research',
      zone: 'research',
      hueShift: 0,
      deskId: 'res-desk-01',
      layer: 1,
    },
  ],
  exec: [],
} as unknown as JCConfig;

const posted: unknown[] = [];
const watcher = new EventWatcher(config, process.cwd());
// private webview を直接差し込む (compiled JS では soft-private)
(watcher as unknown as { webview: { postMessage: (m: unknown) => void } }).webview = {
  postMessage: (m: unknown) => posted.push(m),
};

const handle = (event: unknown): boolean => {
  try {
    (watcher as unknown as { handleEvent: (e: OfficeEvent) => void }).handleEvent(
      event as OfficeEvent,
    );
    return true;
  } catch (err) {
    console.log(`    threw: ${String(err)}`);
    return false;
  }
};

console.log('R6: message 欠落の malformed イベントで handleEvent が落ちない');

// AC-7 の再現イベントそのもの
ok(
  'delegate (message欠落) — AC-7 再現形',
  handle({ event: 'delegate', from: 'exec-sec', to: ['res-01'], task: 'x' }),
);
ok(
  'delegation_complete (message欠落)',
  handle({ event: 'delegation_complete', from: 'res-01', to: 'exec-sec', task: 'x' }),
);
ok(
  'role_escalate (message欠落)',
  handle({ event: 'role_escalate', from: 'exec-sec', to: 'res-01', role: 'Director' }),
);
ok('progress_check (message欠落)', handle({ event: 'progress_check', from: 'exec-sec', to: 'res-01' }));
ok(
  'cross_dept_message (message欠落)',
  handle({
    event: 'cross_dept_message',
    from: 'exec-sec',
    to: 'res-01',
    from_dept: 'exec',
    to_dept: 'research',
  }),
);

// 正常イベントは通常通り bubble を出す (防御化で機能を殺していない)
posted.length = 0;
ok(
  'delegate (message あり) は通常動作',
  handle({
    event: 'delegate',
    from: 'exec-sec',
    to: ['res-01'],
    task: 'x',
    department: 'research',
    message: 'よろしく頼みます',
  }),
);
ok(
  '正常 delegate は speech bubble を出す',
  posted.some((m) => (m as { type?: string }).type === 'jcSpeechBubble'),
);
ok(
  '正常 delegate は ✉️ jcMailFly を出す (R5)',
  posted.some((m) => (m as { type?: string }).type === 'jcMailFly'),
);

console.log(`\n=== Malformed-event defense (R6): ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
