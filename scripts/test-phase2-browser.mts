#!/usr/bin/env node
/** Real UI -> built standalone host -> child process adapter -> durable results.
 * Only the executable named `claude` and os.homedir() are substituted in a
 * spawned test host. This never calls an external AI, user home, or native GUI.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import WebSocket from 'ws';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'test-results', 'phase2');
fs.mkdirSync(output, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'officeanime-phase2-'));
const home = path.join(tmp, 'home');
const workspace = path.join(tmp, 'workspace');
const bin = path.join(tmp, 'bin');
for (const dir of [home, workspace, bin]) fs.mkdirSync(dir, { recursive: true });
const preload = path.join(tmp, 'isolate.cjs');
fs.writeFileSync(preload, `require('node:os').homedir = () => ${JSON.stringify(home)};`);
const trace = path.join(tmp, 'executions.jsonl');
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!${process.execPath}
const fs=require('node:fs');
const prompt=process.argv[process.argv.indexOf('-p')+1] || '';
const confirm=prompt.includes('【出力形式');
fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({confirm,prompt,args:process.argv.slice(2),cwd:process.cwd()})+'\\n');
if(confirm){
 if(prompt.includes('確認失敗')) {process.stderr.write('fixture confirmation failure');process.exit(3);}
 setTimeout(()=>{console.log(JSON.stringify([{understanding:'検証用の依頼内容を確認しました。',question:'この内容で進めてよいですか?',options:['はい、この内容で進めてください'],field_ref:'purpose'}]));},300);
} else {
 console.log('検証用の資料を確認しています。');
 const fail=prompt.includes('実行失敗');
 setTimeout(()=>{console.log(fail?'検証用の実行失敗':'検証用の結果：対象を確認し、要点をまとめました。');process.exit(fail?2:0);},prompt.includes('長時間')?15000:2500);
}
`,
);
fs.chmodSync(path.join(bin, 'claude'), 0o755);
let child: ReturnType<typeof spawn>;
let logs = '';
async function start(port = 0) {
  child = spawn(
    process.execPath,
    [
      '--require',
      preload,
      path.join(root, 'dist/standalone.js'),
      `--workspace=${workspace}`,
      `--port=${port}`,
      '--jc-live-spawn',
    ],
    {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let ready = '';
  child.stdout?.on('data', (d) => {
    logs += d;
    ready += d;
  });
  child.stderr?.on('data', (d) => {
    logs += d;
  });
  await expect
    .poll(() => ready, { timeout: 10000 })
    .toContain('Standalone Office Anime server running');
  const match = ready.match(/HTTP.*?:(\d+)/) ?? ready.match(/localhost:(\d+)/);
  assert.ok(match, ready);
  return Number(match[1]);
}
async function stop() {
  const p = child;
  if (!p || p.exitCode !== null) return;
  p.kill('SIGTERM');
  await new Promise((r) => p.once('exit', r));
}
const rows = () =>
  JSON.parse(fs.readFileSync(path.join(home, '.pixel-agents/requests.json'), 'utf8')) as Array<any>;
const executions = () =>
  fs.existsSync(trace)
    ? fs
        .readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const browser = await chromium.launch({ headless: true });
let port = 0;
let observedPage: import('@playwright/test').Page;
try {
  port = await start();
  const page = await browser.newPage({
    viewport: { width: 1120, height: 780 },
    deviceScaleFactor: 1,
  });
  observedPage = page;
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'office.png') });
  async function submit(title: string, kind = 'research') {
    if (!(await page.locator('[data-work-panel]').count()))
      await page.locator('[data-work-entry]').click();
    console.log('[phase2] submit', title);
    const details = page.locator('[data-work-form]');
    if (!((await details.getAttribute('open')) !== null)) await details.locator('summary').click();
    await page.getByLabel('仕事の種類', { exact: true }).selectOption(kind);
    await page.getByLabel('目的・作りたいもの', { exact: true }).fill(title);
    await page.getByLabel('知りたいこと・完成条件', { exact: true }).fill('要点をまとめる');
    await page.getByLabel('対象・概要', { exact: true }).fill('隔離された検証用資料');
    await page.getByRole('button', { name: '秘書に送信', exact: true }).click();
    await expect.poll(() => rows().find((r) => r.purpose === title)?.status).toBeTruthy();
    return rows().find((r) => r.purpose === title).id as string;
  }
  async function decide(id: string) {
    const row = page.locator(`[data-work-id="${id}"]`);
    await expect(row).toHaveAttribute('data-work-status', 'waiting');
    if (!(await row.locator('[data-work-decision]').count()))
      await row.locator('.work-row').click();
    for (const select of await row.locator('[data-work-decision] select').all())
      await select.selectOption({ index: 1 });
    await row.getByRole('button', { name: '回答して作業を始める' }).click();
    return row;
  }
  const layout = JSON.parse(
    fs.readFileSync(path.join(root, 'dist/webview/assets/default-layout-4.json'), 'utf8'),
  );
  const seat = layout.furniture.find((item: any) => item.uid === 'exec-bench-01');
  const canvasBox = await page.locator('canvas').boundingBox();
  assert.ok(canvasBox);
  await page.locator('canvas').click({
    position: {
      x: Math.floor((canvasBox.width - layout.cols * 32) / 2) + (seat.col + 0.5) * 32,
      y: Math.floor((canvasBox.height - layout.rows * 32) / 2) + (seat.row + 0.5) * 32,
    },
  });
  if (!(await page.locator('[data-work-panel]').count()))
    await page.getByRole('button', { name: '秘書に仕事を依頼', exact: true }).click();
  await expect(page.locator('[data-work-panel]')).toBeVisible();
  console.log('[phase2] loaded, secretary desk entry verified', port);
  const normal = await submit('通常の調査');
  await expect(page.locator(`[data-work-id="${normal}"]`)).toHaveAttribute(
    'data-work-status',
    'waiting',
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__JC_STATUS_QC?.find((item: any) => item.memberId === 'res-01')?.icon,
      ),
    )
    .toBe('approval');
  assert.equal(
    executions().filter((x) => !x.confirm).length,
    0,
    'no execution before Owner answers',
  );
  await page.screenshot({ path: path.join(output, 'owner-decision.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'owner-decision-mobile.png') });
  const panelBox = await page.locator('[data-work-panel]').boundingBox();
  assert.ok(
    panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390,
    'narrow decision panel stays in the viewport',
  );
  await page.setViewportSize({ width: 1120, height: 780 });
  // A full reload must preserve the question and must not start another process.
  await page.reload();
  await page.locator('[data-work-entry]').click();
  const normalRow = await decide(normal);
  await expect(normalRow).toHaveAttribute('data-work-status', 'running');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__JC_STATUS_QC?.find((item: any) => item.memberId === 'res-01')?.icon,
      ),
    )
    .toBe('working');
  await page.getByRole('button', { name: '依頼パネルを閉じる' }).click();
  await page.screenshot({ path: path.join(output, 'working.png') });
  await page.locator('[data-work-entry]').click();
  await expect(normalRow).toHaveAttribute('data-work-status', 'done');
  await expect(page.locator('[data-work-toast]')).toBeVisible();
  await normalRow.getByRole('button', { name: '本棚で結果を見る' }).click();
  await expect(page.locator(`[data-work-result="${normal}"]`)).toContainText('検証用の結果');
  await page.screenshot({ path: path.join(output, 'library-result.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'library-mobile.png') });
  await page.reload();
  await expect(page.locator('[data-work-toast]')).toHaveCount(0);
  await page.setViewportSize({ width: 1120, height: 780 });
  const failure = await submit('実行失敗の調査');
  await decide(failure);
  await expect(page.locator(`[data-work-id="${failure}"]`)).toHaveAttribute(
    'data-work-status',
    'error',
  );
  await expect(page.locator('[data-work-toast]')).toHaveCount(0);
  const confirmFailure = await submit('確認失敗の調査');
  await expect(page.locator(`[data-work-id="${confirmFailure}"]`)).toHaveAttribute(
    'data-work-status',
    'error',
  );
  const cancel = await submit('中止する依頼');
  await expect(page.locator(`[data-work-id="${cancel}"]`)).toHaveAttribute(
    'data-work-status',
    'waiting',
  );
  await page
    .locator(`[data-work-id="${cancel}"]`)
    .getByRole('button', { name: 'この依頼を中止' })
    .click();
  await expect(page.locator(`[data-work-id="${cancel}"]`)).toHaveAttribute(
    'data-work-status',
    'cancelled',
  );
  const runCancel = await submit('長時間の中止試験');
  await decide(runCancel);
  await expect(page.locator(`[data-work-id="${runCancel}"]`)).toHaveAttribute(
    'data-work-status',
    'running',
  );
  await page
    .locator(`[data-work-id="${runCancel}"]`)
    .getByRole('button', { name: 'この依頼を中止' })
    .click();
  await expect(page.locator(`[data-work-id="${runCancel}"]`)).toHaveAttribute(
    'data-work-status',
    'cancelled',
  );
  // Two independent jobs for the same member must both remain visible.
  const first = await submit('長時間の並行仕事');
  await decide(first);
  const second = await submit('並行する別の仕事');
  await decide(second);
  await expect(page.locator(`[data-work-id="${second}"]`)).toHaveAttribute(
    'data-work-status',
    'done',
  );
  await expect(page.locator(`[data-work-id="${first}"]`)).toHaveAttribute(
    'data-work-status',
    'running',
  );
  // Duplicate and malformed commands use the real socket but are a separate protocol test.
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => socket.once('open', r));
  const wireMessages: any[] = [];
  socket.on('message', (raw) => wireMessages.push(JSON.parse(raw.toString())));
  const before = executions().length;
  socket.send(
    JSON.stringify({
      type: 'jcRequestSubmit',
      requestId: normal,
      memberId: 'res-01',
      kind: 'research',
      purpose: '再送',
      wants: 'x',
      overview: 'x',
    }),
  );
  socket.send(JSON.stringify({ type: 'jcRequestConfirmed', requestId: normal, answers: [] }));
  await expect.poll(() => executions().length).toBe(before);
  const write = await submit('資料の下書き', 'doc');
  await expect(page.locator(`[data-work-id="${write}"]`)).toHaveAttribute(
    'data-work-status',
    'waiting',
  );
  socket.send(
    JSON.stringify({
      type: 'jcRequestConfirmed',
      requestId: write,
      answers: [{ fieldRef: 'plan', answer: 'yes', isOther: true }],
    }),
  );
  await expect
    .poll(() => wireMessages.some((m) => m.type === 'jcWorkError' && m.requestId === write))
    .toBe(true);
  assert.equal(rows().find((r) => r.id === write).status, 'waiting');
  await decide(write);
  await expect(page.locator(`[data-work-id="${write}"]`)).toHaveAttribute(
    'data-work-status',
    'done',
  );
  const scoped = executions()
    .filter((x) => !x.confirm)
    .find((x) => x.args.includes('--settings'));
  assert.ok(
    scoped && fs.realpathSync(scoped.cwd).startsWith(fs.realpathSync(workspace)),
    'write execution keeps scoped staging adapter',
  );
  await page.screenshot({ path: path.join(output, 'failures-and-multiple.png') });
  // Existing approval path: a test producer appends the real event file. The UI
  // answer must pass the real handler and persisted answers before disappearing.
  await page.getByRole('button', { name: '依頼パネルを閉じる' }).click();
  const eventFile = path.join(workspace, 'jc-events.json');
  const approval = {
    event: 'approval_request',
    timestamp: new Date().toISOString(),
    id: 'phase2-owner',
    company_id: 'isolated-company',
    from: 'res-01',
    title: '検証用のOwner判断',
    body_md: 'この結果を確認します。',
    irreversible: false,
    expires: new Date(Date.now() + 60000).toISOString(),
    options: [{ key: 'ok', label: '確認しました', recommended: true }],
  };
  const eventData = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  eventData.events.push(approval);
  fs.writeFileSync(eventFile, JSON.stringify(eventData));
  await expect(page.locator('[data-desk-docs-count]')).toHaveText('1');
  await page.locator('[data-desk-docs-label]').click();
  await page.locator('[data-approval-option="ok"]').click();
  await expect(page.locator('[data-desk-docs-count]')).toHaveText('0');
  const answerFile = path.join(workspace, 'jc-answers.json');
  assert.equal(JSON.parse(fs.readFileSync(answerFile, 'utf8'))[0].request_id, 'phase2-owner');
  socket.send(
    JSON.stringify({
      type: 'jcApprovalAnswer',
      request_id: 'phase2-owner',
      company_id: 'isolated-company',
      answer: 'ok',
      at: 'invalid',
    }),
  );
  await expect
    .poll(() =>
      wireMessages.some(
        (m) => m.type === 'jcOfficeEvent' && m.event?.request_id === 'phase2-owner',
      ),
    )
    .toBe(true);
  assert.equal(
    JSON.parse(fs.readFileSync(answerFile, 'utf8')).length,
    1,
    'same answer replay is idempotent',
  );
  await page.locator('[data-work-entry]').click();
  socket.close();
  await stop();
  await expect(page.locator('[data-work-panel]')).toContainText('最後に確認した状態');
  // Expiry and interrupted recovery are host persistence tests, not event-injected UI success.
  const saved = rows();
  saved.find((r) => r.id === cancel).status = 'waiting';
  saved.find((r) => r.id === cancel).expires = new Date(0).toISOString();
  fs.writeFileSync(path.join(home, '.pixel-agents/requests.json'), JSON.stringify(saved));
  await start(port);
  await expect(page.locator(`[data-work-id="${first}"]`)).toHaveAttribute(
    'data-work-status',
    'interrupted',
    { timeout: 15000 },
  );
  await expect(page.locator(`[data-work-id="${cancel}"]`)).toHaveAttribute(
    'data-work-status',
    'expired',
  );
  await expect(page.locator('[data-work-toast]')).toHaveCount(0);
  assert.equal(errors.length, 0, errors.join('\n'));
  const historyDir = path.join(home, '.pixel-agents/task-history');
  const history = fs.readdirSync(historyDir).flatMap((file) =>
    fs
      .readFileSync(path.join(historyDir, file), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );
  assert.equal(
    history.filter((r) => r.taskId === normal).length,
    1,
    'normal result is persisted exactly once',
  );
  assert.equal(history.find((r) => r.taskId === failure).status, 'failed');
  fs.writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(
      {
        passed: true,
        base: '90f2d56',
        testBoundary: 'PATH executable named claude; isolated os.homedir via test preload',
        requests: rows().map((r) => ({ id: r.id, purpose: r.purpose, status: r.status })),
        executions: executions().length,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Phase 2 real UI/standalone workflow, normal/failure/reload/multiple/cancel/restart/expiry/scoped gate',
  );
} catch (error) {
  if (observedPage!) {
    await observedPage.screenshot({ path: path.join(output, 'failure-debug.png') });
    console.error((await observedPage.locator('body').innerText()).slice(-4000));
  }
  throw error;
} finally {
  await stop();
  await browser.close();
  fs.writeFileSync(path.join(output, 'host.log'), logs);
  fs.rmSync(tmp, { recursive: true, force: true });
}
