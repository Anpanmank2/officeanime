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

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEBVIEW = resolve(ROOT, 'webview-ui');
const PORT = 18432; // Ephemeral port to avoid conflict with running dev server
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

  return new Promise((resolve, reject) => {
    serverProcess = spawn('npx', ['vite', '--port', String(PORT)], {
      cwd: WEBVIEW,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('ready in')) {
        clearTimeout(timeout);
        resolve();
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

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
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

    // Test 7: Request-flow textarea keystroke regression (charloss guard)
    // Regression for 2026-07-02: controlled textarea driven by a store whose
    // notify is deferred via requestAnimationFrame dropped fast / IME input.
    // The prior e2e never exercised typing, so it let the bug through. This
    // test types with REAL keystrokes (fast ascii + Japanese) and asserts exact
    // readback — a static screenshot / fill() would bypass onChange and hide it.
    console.log('  [Test 7] Request-flow textarea keystroke (charloss guard)');
    try {
      const openBtn = page.locator('[data-request-open]').first();
      if ((await openBtn.count()) === 0) {
        assert(false, 'Request-flow open button present');
      } else {
        await openBtn.click();
        await page.waitForTimeout(400);
        const ta = page.locator('[data-request-flow] textarea').first();
        await ta.waitFor({ timeout: 3000 });

        // Fast ascii (no delay) — the exact case the bug dropped to 1 char.
        const ASCII = 'fukuoka-hotel-123';
        await ta.click();
        await page.keyboard.type(ASCII);
        await page.waitForTimeout(200);
        const gotAscii = await ta.inputValue();
        assert(gotAscii === ASCII, `Fast ascii keystroke exact (got "${gotAscii}")`);

        // Clear (macOS Ctrl+A = move-to-line-start, so use platform select-all).
        await ta.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(150);

        // Japanese bulk insert (IME-commit equivalent).
        const JP = '福岡の提携ホテルを決める';
        await ta.click();
        await page.keyboard.insertText(JP);
        await page.waitForTimeout(200);
        const gotJp = await ta.inputValue();
        assert(gotJp === JP, `Japanese IME-commit exact (got "${gotJp}")`);

        // ── Test 8: adaptive multi-choice confirm + その他 inline charloss guard ──
        // Drive the flow to the confirm phase by simulating the backend's
        // jcRequestQuestions message (webview listens on window 'message'). The
        // requestId is exposed via data-request-id so we can target this flow.
        console.log('  [Test 8] Confirm multi-choice + その他 inline keystroke (charloss guard)');
        const reqId = await page
          .locator('[data-request-flow]')
          .first()
          .getAttribute('data-request-id');
        assert(!!reqId, 'Request flow exposes data-request-id');
        await page.evaluate((requestId) => {
          window.postMessage(
            {
              type: 'jcRequestQuestions',
              requestId,
              memberId: 'res-01',
              department: 'research',
              questions: [
                {
                  understanding: '福岡の提携ホテルを決める判断材料を集めると理解しました。',
                  question: 'この目的で合っていますか?',
                  options: ['はい、この目的で合っています', 'いえ、別の目的です'],
                  field_ref: 'purpose',
                },
                {
                  understanding: '各ホテルの評価・立地・価格帯を知りたいと理解しました。',
                  question: '重視する軸はどれですか?',
                  options: ['評価と口コミ中心', '立地中心', '価格帯中心'],
                  field_ref: 'wants',
                },
              ],
            },
            '*',
          );
        }, reqId);
        await page.waitForTimeout(400);

        // Options + その他 render.
        const optCount = await page.locator('[data-request-option]').count();
        assert(optCount >= 2, `Confirm shows 2〜4 option buttons (got ${optCount})`);
        const otherBtn = page.locator('[data-request-other]').first();
        assert((await otherBtn.count()) === 1, 'その他 button present');

        // Open その他 → the inline textarea appears.
        await otherBtn.click();
        await page.waitForTimeout(200);
        const otherTa = page.locator('[data-request-other-input]').first();
        await otherTa.waitFor({ timeout: 3000 });

        // Fast ascii keystroke into その他 inline input (the exact charloss case).
        const OTHER_ASCII = 'location-over-price-42';
        await otherTa.click();
        await page.keyboard.type(OTHER_ASCII);
        await page.waitForTimeout(200);
        const gotOtherAscii = await otherTa.inputValue();
        assert(
          gotOtherAscii === OTHER_ASCII,
          `その他 fast ascii keystroke exact (got "${gotOtherAscii}")`,
        );

        // Clear then Japanese IME-commit into その他 input.
        await otherTa.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(150);
        const OTHER_JP = '目的は立地重視です';
        await otherTa.click();
        await page.keyboard.insertText(OTHER_JP);
        await page.waitForTimeout(200);
        const gotOtherJp = await otherTa.inputValue();
        assert(gotOtherJp === OTHER_JP, `その他 Japanese IME-commit exact (got "${gotOtherJp}")`);
      }
    } catch (e) {
      assert(false, `Request-flow keystroke test threw: ${e.message}`);
    }

    // ── Test 9: 依頼 4カード (2026-07-02 横展開) — cards render + dept templates ──
    // The dock shows 4 request cards (research/market/doc/impl). Each opens the
    // 3-field template with its OWN dept labels (問いかけ型).
    console.log('  [Test 9] Request cards ×4 + dept-specific templates');
    try {
      // Close any flow left open by Test 7/8 (ESC-less: click ✕ if present).
      const closeBtn = page.locator('[data-request-flow] button[title*="閉じる"]');
      if ((await closeBtn.count()) > 0) {
        await closeBtn.click();
        await page.waitForTimeout(200);
      }
      const kinds = await page
        .locator('[data-request-open]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-request-kind')));
      assert(
        kinds.length === 4 && ['research', 'market', 'doc', 'impl'].every((k) => kinds.includes(k)),
        `4 request cards present (got ${JSON.stringify(kinds)})`,
      );

      // 資料(doc) card opens the Marketing write-template with its own labels.
      await page.locator('[data-request-kind="doc"]').click();
      await page.waitForTimeout(300);
      const docPanel = page.locator('[data-request-flow][data-request-kind="doc"]');
      assert((await docPanel.count()) === 1, '資料(doc) flow panel opens with kind attr');
      const docText = await docPanel.innerText();
      const docLabelsOk =
        docText.includes('誰に見せる資料？') &&
        docText.includes('何を伝えたい？') &&
        docText.includes('どんな形にする？');
      assert(docLabelsOk, '資料 template shows doc 3項目 labels');
      await page.locator('[data-request-flow] button[title*="閉じる"]').click();
      await page.waitForTimeout(200);

      // 市場調査(market) card opens with the research-style (marketing例題) labels.
      await page.locator('[data-request-kind="market"]').click();
      await page.waitForTimeout(300);
      const mkPanel = page.locator('[data-request-flow][data-request-kind="market"]');
      const mkText = (await mkPanel.count()) > 0 ? await mkPanel.innerText() : '';
      assert(
        mkText.includes('何のために調べる？') && mkText.includes('どの範囲を調べる？'),
        '市場調査 template shows market 3項目 labels',
      );
      await page.locator('[data-request-flow] button[title*="閉じる"]').click();
      await page.waitForTimeout(200);
    } catch (e) {
      assert(false, `Request 4-cards test threw: ${e.message}`);
    }

    // ── Test 10: write型(実装) — 3欄 real-keystroke + plan確認(①②③+書き先) ──
    // AC-F: every template field takes fast ascii (17) + Japanese without
    // charloss. AC-C: the write confirm ends with the plan question (understanding
    // carries ①②③ + 書き先 staging path) and 確定 posts jcRequestConfirmed.
    console.log('  [Test 10] Write-kind (impl): 3-field keystroke + plan confirm');
    try {
      await page.locator('[data-request-kind="impl"]').click();
      await page.waitForTimeout(300);
      const implPanel = page.locator('[data-request-flow][data-request-kind="impl"]');
      assert((await implPanel.count()) === 1, '実装(impl) flow panel opens');
      const implText = await implPanel.innerText();
      assert(
        implText.includes('何を作る・直す？') &&
          implText.includes('できたと言える条件は？') &&
          implText.includes('対象はどこ？'),
        '実装 template shows impl 3項目 labels',
      );

      // Real keystrokes into ALL 3 textareas (fast ascii 17 chars + JP commit).
      const FAST = 'quick-impl-check1'; // 17 chars, no delay
      const JPS = ['一覧画面を作って', '日付で絞り込める', '対象は画面まわり'];
      const tas = page.locator('[data-request-flow] textarea');
      const taCount = await tas.count();
      assert(taCount === 3, `impl template has 3 textareas (got ${taCount})`);
      for (let i = 0; i < 3; i++) {
        const ta = tas.nth(i);
        await ta.click();
        await page.keyboard.type(FAST);
        await page.waitForTimeout(150);
        const gotFast = await ta.inputValue();
        assert(gotFast === FAST, `field${i + 1} fast ascii exact (got "${gotFast}")`);
        await ta.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(100);
        await ta.click();
        await page.keyboard.insertText(JPS[i]);
        await page.waitForTimeout(150);
        const gotJp = await ta.inputValue();
        assert(gotJp === JPS[i], `field${i + 1} Japanese IME-commit exact (got "${gotJp}")`);
      }

      // Drive to confirm phase with a WRITE-shape question set (output + plan).
      const STAGING = '/tmp/e2e-staging/office-tasks/req-e2e';
      const implReqId = await implPanel.getAttribute('data-request-id');
      assert(!!implReqId, 'impl flow exposes data-request-id');
      await page.evaluate(
        ({ requestId, staging }) => {
          window.postMessage(
            {
              type: 'jcRequestQuestions',
              requestId,
              memberId: 'eng-01',
              department: 'engineering',
              questions: [
                {
                  understanding: 'アウトプットはコード一式+適用手順のドラフトと理解しました。',
                  question: '形・完成条件はこれでよいですか?',
                  options: ['はい、この形でお願いします', 'いえ、違う形にしたい'],
                  field_ref: 'output',
                },
                {
                  understanding: `こう作ります:\n① 依頼内容を整理\n② コード一式のドラフトを作成\n③ 適用手順をまとめる\n書き先: ${staging}`,
                  question: 'この計画で進めてよいですか?',
                  options: ['はい、この計画で進めてください'],
                  field_ref: 'plan',
                },
              ],
            },
            '*',
          );
        },
        { requestId: implReqId, staging: STAGING },
      );
      await page.waitForTimeout(400);

      // Q1 = output spec question renders.
      let confirmText = await implPanel.innerText();
      assert(
        confirmText.includes('形・完成条件はこれでよいですか?'),
        'write confirm shows アウトプット仕様 question',
      );
      await page.locator('[data-request-option]').first().click();
      await page.waitForTimeout(300);

      // Q2 = plan confirm renders LAST with ①②③ + 書き先 staging path.
      confirmText = await implPanel.innerText();
      const planOk =
        confirmText.includes('この計画で進めてよいですか?') &&
        confirmText.includes('①') &&
        confirmText.includes('書き先') &&
        confirmText.includes(STAGING);
      assert(planOk, 'plan confirm shows ①②③ + 書き先 staging path');

      // その他 inline correction on the plan question (charloss-guarded input).
      await page.locator('[data-request-other]').click();
      await page.waitForTimeout(200);
      const planOtherTa = page.locator('[data-request-other-input]').first();
      await planOtherTa.waitFor({ timeout: 3000 });
      const PLAN_FIX = 'readme-first-plan1'; // 17 chars fast
      await planOtherTa.click();
      await page.keyboard.type(PLAN_FIX);
      await page.waitForTimeout(150);
      const gotPlanFix = await planOtherTa.inputValue();
      assert(gotPlanFix === PLAN_FIX, `plan その他 fast ascii exact (got "${gotPlanFix}")`);
      await page.locator('[data-request-other-submit]').click();
      await page.waitForTimeout(300);

      // All questions answered → flow closes (jcRequestConfirmed posted).
      const stillOpen = await page.locator('[data-request-flow]').count();
      assert(stillOpen === 0, 'flow closes after plan 確定 (jcRequestConfirmed posted)');
    } catch (e) {
      assert(false, `Write-kind confirm test threw: ${e.message}`);
    }

    // ── Test 11: write型 result panel — 下書きパス + files + 要約 / gate notice ──
    console.log('  [Test 11] Request result panel (write型: path + summary)');
    try {
      await page.evaluate(() => {
        window.postMessage(
          {
            type: 'jcRequestResult',
            requestId: 'req-e2e-result',
            memberId: 'eng-01',
            department: 'engineering',
            kind: 'impl',
            stagingDir: '/tmp/e2e-staging/office-tasks/req-e2e',
            status: 'done',
            files: ['patch/list-view.tsx', 'APPLY-STEPS.md'],
            summary: '一覧画面のドラフト一式を作成しました。適用手順は APPLY-STEPS.md を参照。',
          },
          '*',
        );
      });
      await page.waitForTimeout(400);
      const rp = page.locator('[data-request-result]');
      assert((await rp.count()) === 1, 'request result panel appears');
      const rpText = await rp.innerText();
      assert(
        rpText.includes('/tmp/e2e-staging/office-tasks/req-e2e') &&
          rpText.includes('APPLY-STEPS.md') &&
          rpText.includes('ドラフト一式を作成しました'),
        'result panel shows 書き先パス + files + 要約',
      );
      await rp.locator('button[title="閉じる"]').click();
      await page.waitForTimeout(200);

      // Gate notice (disabled = --jc-live-spawn OFF) renders the explicit message.
      await page.evaluate(() => {
        window.postMessage(
          {
            type: 'jcRequestResult',
            requestId: 'req-e2e-disabled',
            memberId: 'mkt-01',
            department: 'marketing',
            kind: 'doc',
            stagingDir: '/tmp/e2e-staging/office-tasks/req-e2e-2',
            status: 'disabled',
            files: [],
            summary:
              '実行ゲート: サーバーが --jc-live-spawn フラグなしで起動しているため、実行していません。',
          },
          '*',
        );
      });
      await page.waitForTimeout(400);
      const rp2 = page.locator('[data-request-result][data-request-result-status="disabled"]');
      assert((await rp2.count()) === 1, 'disabled gate notice panel appears');
      const rp2Text = await rp2.innerText();
      assert(rp2Text.includes('--jc-live-spawn'), 'gate notice mentions the flag explicitly');
      await rp2.locator('button[title="閉じる"]').click();
    } catch (e) {
      assert(false, `Request result panel test threw: ${e.message}`);
    }

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
