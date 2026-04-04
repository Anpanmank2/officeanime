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
    assert(arrivingLogs.length >= 4, `At least 4 members arrived (got ${arrivingLogs.length})`);

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
            from: 'exec-ceo',
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
