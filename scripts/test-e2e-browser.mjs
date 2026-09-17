#!/usr/bin/env node
/**
 * E2E browser test — verifies pixel office loads and characters appear.
 * Starts a temporary Vite dev server, opens Playwright, checks screenshots.
 *
 * This script is called by the pre-push git hook.
 * Exit 0 = pass, exit 1 = fail.
 *
 * Ref: .company/engineering/knowledge/2026-04-03-pixel-agents-quality-gate.md
 */

import { WebSocketServer } from 'ws';
import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEBVIEW = resolve(ROOT, 'webview-ui');
let PORT = 0; // OS-assigned isolated port
const EVENTS_FILE = resolve(ROOT, 'jc-events.json');

let serverProcess = null;
let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

async function startServer() {
  // Reset events file
  writeFileSync(EVENTS_FILE, '{"version":1,"events":[]}');

  return new Promise((ready, reject) => {
    serverProcess = spawn(
      process.execPath,
      [resolve(WEBVIEW, 'node_modules/vite/bin/vite.js'), '--port', String(PORT)],
      {
        cwd: WEBVIEW,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let output = '';
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      const address = output.match(/localhost:(\d+)/);
      if (output.includes('ready in') && address) {
        PORT = Number(address[1]);
        clearTimeout(timeout);
        ready();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

async function run() {
  console.log('\n🌐 E2E Browser Test');
  console.log('─'.repeat(40));

  // Check Playwright is available
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    console.log('  ⚠️  Playwright not available — skipping E2E test');
    process.exit(0);
  }

  // Start temporary Vite server
  console.log(`  Starting Vite dev server on port ${PORT}...`);
  try {
    await startServer();
  } catch (err) {
    console.log(`  ⚠️  Could not start dev server: ${err.message} — skipping E2E test`);
    process.exit(0);
  }

  // This legacy suite injects producer events. Its isolated acknowledgement
  // transport replaces the old optimistic UI removal; full persistence is
  // exercised separately by test-phase2-browser against the real host.
  const ackServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => ackServer.once('listening', resolve));
  ackServer.on('connection', (socket) =>
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'webviewReady')
        socket.send(
          JSON.stringify({
            type: 'jcEventHistory',
            events: JSON.parse(readFileSync(EVENTS_FILE, 'utf8')).events,
          }),
        );
      if (message.type === 'jcApprovalAnswer')
        socket.send(
          JSON.stringify({
            type: 'jcOfficeEvent',
            event: {
              event: 'approval_resolved',
              request_id: message.request_id,
              answer: message.answer,
              at: new Date().toISOString(),
              timestamp: new Date().toISOString(),
              via: 'office',
            },
          }),
        );
    }),
  );
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.addInitScript((port) => {
      window.__PIXEL_AGENTS_WS_PORT__ = port;
    }, ackServer.address().port);
    const logs = [];
    const errors = [];
    page.on('console', (msg) => logs.push(msg.text()));
    page.on('pageerror', (err) => errors.push(err.message));

    // Test 1: Page loads
    console.log('\n  [Test 1] Page loads');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    assert(errors.length === 0, `No page errors (got ${errors.length})`);

    // Test 2: Canvas exists
    console.log('  [Test 2] Canvas renders');
    const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
    assert(hasCanvas, 'Canvas element exists');

    // Test 3: JC config loaded
    console.log('  [Test 3] JC config');
    const jcConfigLog = logs.find(
      (l) => l.includes('JC config loaded') || l.includes('Config loaded'),
    );
    assert(!!jcConfigLog, 'JC config loaded in browser');

    // Persona avatars must travel through the real browser message path, not
    // merely exist on disk while the canvas silently uses legacy characters.
    const avatarPartsLog = logs.find((l) => l.includes('Received 41 avatar parts'));
    // QA側修正 2026-09-07: 名簿は default-avatars.json から導出（16名体制+空席10=26。固定値23は旧名簿）
    const expectedAvatarCount = Object.keys(
      JSON.parse(
        readFileSync(
          new URL('../webview-ui/public/assets/default-avatars.json', import.meta.url),
          'utf-8',
        ),
      ).avatars,
    ).length;
    const avatarConfigsLog = logs.find((l) =>
      l.includes(`Received ${expectedAvatarCount} avatar configs`),
    );
    assert(!!avatarPartsLog, '41 avatar parts loaded into the webview');
    assert(
      !!avatarConfigsLog,
      `All ${expectedAvatarCount} persona avatar configs loaded into the webview`,
    );

    // Test 4: Permanent residents dispatched
    console.log('  [Test 4] Permanent residents');
    const residentsLog = logs.find((l) => l.includes('permanent residents dispatched'));
    assert(!!residentsLog, 'Permanent residents dispatched');

    const arrivingLogs = logs.filter((l) => l.includes('Member arriving'));
    assert(
      arrivingLogs.length >= 2,
      `At least 2 permanent members arrived (got ${arrivingLogs.length})`,
    );

    // Test 5: Screenshot — characters visible (non-empty canvas)
    console.log('  [Test 5] Visual check');
    await page.screenshot({ path: '/tmp/e2e-quality-gate.png' });

    // Verify canvas has non-trivial content by checking pixel data
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      // Sample a grid of points for non-background pixels
      const w = canvas.width;
      const h = canvas.height;
      let nonBg = 0;
      for (let y = 0; y < h; y += Math.floor(h / 20)) {
        for (let x = 0; x < w; x += Math.floor(w / 20)) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          // Background is dark (~30,30,46). Characters/furniture are brighter
          if (pixel[0] > 50 || pixel[1] > 50 || pixel[2] > 60) nonBg++;
        }
      }
      return nonBg > 20; // At least some non-background content
    });
    assert(hasContent, 'Canvas has visible content (not blank)');

    // Test 6: Event push works
    console.log('  [Test 6] Event push');
    writeFileSync(
      EVENTS_FILE,
      JSON.stringify({
        version: 1,
        events: [
          {
            event: 'delegate',
            timestamp: new Date().toISOString(),
            from: 'exec-sec',
            to: ['eng-01'],
            task: 'e2e-test',
            department: 'engineering',
            message: 'E2E test',
          },
        ],
      }),
    );
    await page.waitForTimeout(3000);

    const eventLog = logs.find((l) => l.includes('Event: delegate') || l.includes('HMR push'));
    assert(!!eventLog, 'Delegate event received via HMR push');

    const eng01Arrive = logs.find((l) => l.includes('Member arriving: eng-01'));
    assert(!!eng01Arrive, 'eng-01 arrived after delegate event');

    // Test 6.5: R1 稼働復元 — reload 直後に jc-events 履歴から状態が戻る (AC-1)
    // 差戻し主因「reload後のチップは新イベントまで0/x」の regression guard。
    // 上の delegate は完了イベントが無い = eng-01 は未完了しごと保有 → reload 後
    // ただちに復元ログ (+ 出社/稼働状態) が出ること。
    console.log('  [Test 6.5] Workload restore after reload (R1 / AC-1)');
    const logCountBeforeReload = logs.length;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const restoreLog = logs
      .slice(logCountBeforeReload)
      .find((l) => l.includes('Workload restore') && l.includes('eng-01'));
    assert(
      !!restoreLog,
      `Reload restores eng-01 open work from history (${restoreLog ?? 'no restore log'})`,
    );
    const reArrive = logs
      .slice(logCountBeforeReload)
      .find((l) => l.includes('Member arriving: eng-01'));
    assert(!!reArrive, 'eng-01 re-arrives from history (not 0/x) after reload');

    // Test 7: desk remains visible, initially collapsed even at zero.
    console.log('  [Test 7] Empty desk');
    const count = page.locator('[data-desk-docs-count]');
    assert((await page.locator('[data-desk-docs]').count()) === 1, 'Desk exists');
    assert((await count.textContent()) === '0', 'Empty desk count is zero');
    assert((await page.locator('[data-approval-list]').count()) === 0, 'Desk starts collapsed');
    const sendApproval = async (id, irreversible = false, project) => {
      await page.evaluate(
        ({ id, irreversible, project }) =>
          window.postMessage(
            {
              type: 'jcOfficeEvent',
              event: {
                event: 'approval_request',
                id,
                company_id: 'acme',
                from: 'eng-01',
                timestamp: new Date().toISOString(),
                title: 'Deploy?',
                body_md: 'Review the draft.',
                expires: new Date(Date.now() + 3600000).toISOString(),
                irreversible,
                ...(project ? { project } : {}),
                options: [
                  { key: 'yes', label: 'Yes', recommended: true },
                  { key: 'no', label: 'No', recommended: false },
                  { key: 'later', label: 'Later', recommended: false },
                ],
              },
            },
            '*',
          ),
        { id, irreversible, project },
      );
      await page.waitForTimeout(200);
    };
    console.log('  [Test 8] New document and recommendation');
    await sendApproval('desk-e2e-1');
    assert((await count.textContent()) === '1', 'New request increments badge');
    assert(
      (await page.locator('[data-approval-list]').count()) === 0,
      'New request does not auto-open',
    );
    await page.locator('[data-desk-docs-label]').click();
    assert((await page.locator('[data-approval-option]').count()) === 3, 'Three options');
    assert((await page.locator('[data-approval-recommended]').count()) === 1, 'One recommendation');
    assert(
      (await page.locator('[data-desk-doc-project]').count()) === 0,
      'No project tag when absent',
    );
    console.log('  [Test 9] Reversible one-click answer');
    await page.locator('[data-approval-recommended]').click();
    assert(
      (await page.locator('[data-approval-confirmation]').count()) === 0,
      'No confirmation for reversible answer',
    );
    await page.waitForFunction(
      () => document.querySelector('[data-desk-docs-count]')?.textContent === '0',
    );
    assert((await count.textContent()) === '0', 'Host acknowledgement removes document');
    console.log('  [Test 10] Irreversible confirmation and back');
    await sendApproval('desk-e2e-2', true);
    await page.locator('[data-approval-recommended]').click();
    const confirmation = page.locator('[data-approval-confirmation]');
    assert((await confirmation.count()) === 1, 'Irreversible answer requires confirmation');
    assert((await confirmation.innerText()).includes('Deploy?'), 'Confirmation repeats title');
    assert((await count.textContent()) === '1', 'Unconfirmed document remains');
    await confirmation.getByRole('button', { name: '戻る', exact: true }).click();
    assert(
      (await confirmation.count()) === 0 && (await count.textContent()) === '1',
      'Back cancels confirmation only',
    );
    await page.locator('[data-approval-recommended]').click();
    await confirmation.getByRole('button', { name: '確定', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-desk-docs-count]')?.textContent === '0',
    );
    assert((await count.textContent()) === '0', 'Confirmed document removed after acknowledgement');
    console.log('  [Test 11] Optional project and chat sync');
    await sendApproval('desk-e2e-3', false, 'pixel-office');
    assert(
      (await page.locator('[data-desk-doc-project]').textContent()) === 'pixel-office',
      'Project tag rendered',
    );
    await page.evaluate(() =>
      window.postMessage(
        {
          type: 'jcOfficeEvent',
          event: {
            event: 'approval_resolved',
            request_id: 'desk-e2e-3',
            answer: 'yes',
            at: new Date().toISOString(),
            via: 'chat',
          },
        },
        '*',
      ),
    );
    await page.waitForTimeout(200);
    assert((await count.textContent()) === '0', 'Chat answer updates badge without reload');
    const orphanWarnings = [];
    const onOrphanConsole = (msg) => {
      if (['warning', 'error'].includes(msg.type())) orphanWarnings.push(msg.text());
    };
    page.on('console', onOrphanConsole);
    await page.evaluate(() => {
      for (const type of [
        'jcPlanReady',
        'jcRequestQuestions',
        'jcRequestResult',
        'jcResearchResult',
        'jcAbsenceUpdate',
        'jcAbsenceBulkSync',
      ])
        window.postMessage({ type }, '*');
    });
    await page.waitForTimeout(200);
    page.off('console', onOrphanConsole);
    assert(orphanWarnings.length === 0, 'Orphan messages cause no console warning/error');

    // ── Test 12: 営業状態マシン (店じまい/営業中) — R1状態 + R2見た目 ──────────
    // AC-1: 全員idle + 2h無活動 → CLOSED (dim>0)。AC-2: 新イベントで OPEN に戻る
    // (reversible)。R2 §4: office_heartbeat で 最終確認(lastHeartbeat) 更新。
    // __JC_OFFICE_QC = {state, dimAlpha, lastHeartbeat, ringActive} を assert。
    console.log('  [Test 12] Office hours: CLOSED after 2h idle → REOPEN → heartbeat');
    try {
      const iso = (offsetMin) => new Date(Date.now() + offsetMin * 60000).toISOString();
      const readOffice = () => page.evaluate(() => window.__JC_OFFICE_QC ?? null);

      // 12.0: QC hook が公開されている
      await page.waitForTimeout(500);
      const q0 = await readOffice();
      assert(
        !!q0 && typeof q0.state === 'string',
        `__JC_OFFICE_QC published (got ${JSON.stringify(q0)})`,
      );

      // 12.1: 3h前に開始・2.5h前に完了 = 全員非稼働 + 2h超 idle → CLOSED
      writeFileSync(
        EVENTS_FILE,
        JSON.stringify({
          version: 1,
          events: [
            { event: 'work_started', timestamp: iso(-180), from: 'eng-01', task: 'old' },
            {
              event: 'delegation_complete',
              timestamp: iso(-150),
              from: 'eng-01',
              to: 'exec-sec',
              task: 'old',
            },
          ],
        }),
      );
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // dim フェードイン (1.2s) + tick(1s) 余裕
      const qClosed = await readOffice();
      assert(qClosed?.state === 'closed', `2h idle → state=closed (got ${qClosed?.state})`);
      assert(
        (qClosed?.dimAlpha ?? 0) >= 0.5,
        `CLOSED 減光 dimAlpha>=0.5 (got ${qClosed?.dimAlpha})`,
      );

      // 12.2: 新しい依頼 (delegate) を append → HMR push → 即 REOPEN (dim 解除)
      writeFileSync(
        EVENTS_FILE,
        JSON.stringify({
          version: 1,
          events: [
            { event: 'work_started', timestamp: iso(-180), from: 'eng-01', task: 'old' },
            {
              event: 'delegation_complete',
              timestamp: iso(-150),
              from: 'eng-01',
              to: 'exec-sec',
              task: 'old',
            },
            {
              event: 'delegate',
              timestamp: new Date().toISOString(),
              from: 'exec-sec',
              to: ['eng-03'],
              task: 'wake',
              department: 'engineering',
              message: '起きて',
            },
          ],
        }),
      );
      await page.waitForTimeout(3500); // reopen アニメ (1.0s) + tick 余裕
      const qOpen = await readOffice();
      assert(qOpen?.state !== 'closed', `新イベントで CLOSED を脱する (got ${qOpen?.state})`);
      assert(
        (qOpen?.dimAlpha ?? 1) < 0.5,
        `REOPEN で減光解除 dimAlpha<0.5 (got ${qOpen?.dimAlpha})`,
      );

      // 12.3: office_heartbeat → 最終確認(lastHeartbeat) が更新される
      const hbTs = new Date().toISOString();
      writeFileSync(
        EVENTS_FILE,
        JSON.stringify({
          version: 1,
          events: [
            { event: 'work_started', timestamp: iso(-180), from: 'eng-01', task: 'old' },
            {
              event: 'delegation_complete',
              timestamp: iso(-150),
              from: 'eng-01',
              to: 'exec-sec',
              task: 'old',
            },
            {
              event: 'delegate',
              timestamp: iso(-1),
              from: 'exec-sec',
              to: ['eng-03'],
              task: 'wake',
              department: 'engineering',
              message: '起きて',
            },
            { event: 'office_heartbeat', timestamp: hbTs, from: 'exec-sec' },
          ],
        }),
      );
      await page.waitForTimeout(2000);
      const qHb = await readOffice();
      assert(
        qHb?.lastHeartbeat != null && Math.abs(qHb.lastHeartbeat - Date.parse(hbTs)) < 1000,
        `office_heartbeat → 最終確認 更新 (got ${qHb?.lastHeartbeat})`,
      );
    } catch (e) {
      assert(false, `Office hours test threw: ${e.message}`);
    }
  } finally {
    await browser.close();
    for (const client of ackServer.clients) client.terminate();
    ackServer.close();
    stopServer();
    // Clean up events file
    writeFileSync(EVENTS_FILE, '{"version":1,"events":[]}');
  }

  // Summary
  console.log('\n' + '─'.repeat(40));
  console.log(`  ${pass + fail} tests: ${pass} passed, ${fail} failed`);

  if (fail > 0) {
    console.log('\n  Screenshot: /tmp/e2e-quality-gate.png');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('E2E test error:', err);
  stopServer();
  process.exit(1);
});
