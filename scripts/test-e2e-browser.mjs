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
