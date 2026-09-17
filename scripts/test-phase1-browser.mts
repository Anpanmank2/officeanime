#!/usr/bin/env node
/**
 * Phase 1 browser acceptance check.
 *
 * It exercises the built standalone browser surface against an isolated layout
 * file and deterministic server responses. No Claude process, user home, or
 * running office server is used. Screenshots are written under ignored
 * test-results/phase1 for review.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import browserServerModule from '../src/jc/browser-server.js';
import layoutStoreModule from '../src/layoutStore.js';
import taskHistoryWriterModule from '../src/jc/task-history-writer.js';

const { startBrowserServer } = browserServerModule;
const { createLayoutStore, handleLayoutCommand } = layoutStoreModule;
const { TaskHistoryWriter } = taskHistoryWriterModule;
type SavedLayout = Record<string, unknown>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 0;
const OUTPUT_DIR = path.join(ROOT, 'test-results', 'phase1');
const DEFAULT_LAYOUT_PATH = path.join(ROOT, 'dist', 'webview', 'assets', 'default-layout-4.json');
const LEGACY_LAYOUT_PATH = path.join(ROOT, 'dist', 'webview', 'assets', 'default-layout-3.json');

const now = Date.now();

function layoutFromBuild(): SavedLayout {
  assert.ok(
    fs.existsSync(DEFAULT_LAYOUT_PATH),
    'build the webview before the Phase 1 browser check',
  );
  return JSON.parse(fs.readFileSync(DEFAULT_LAYOUT_PATH, 'utf8')) as SavedLayout;
}

function legacyLayoutFromBuild(): SavedLayout {
  assert.ok(fs.existsSync(LEGACY_LAYOUT_PATH), 'legacy layout fixture is available in the build');
  return JSON.parse(fs.readFileSync(LEGACY_LAYOUT_PATH, 'utf8')) as SavedLayout;
}

function shelfTile(layout: SavedLayout): { col: number; row: number } {
  const furniture = layout.furniture as Array<Record<string, unknown>>;
  const shelf = furniture.find((item) => item.uid === 'office-history-bookshelf');
  assert.ok(shelf, 'compact default layout includes the office history bookshelf');
  assert.equal(typeof shelf.col, 'number');
  assert.equal(typeof shelf.row, 'number');
  return { col: shelf.col as number, row: shelf.row as number };
}

function furnitureTile(layout: SavedLayout, uid: string): { col: number; row: number } {
  const furniture = layout.furniture as Array<Record<string, unknown>>;
  const item = furniture.find((candidate) => candidate.uid === uid);
  assert.ok(item, `layout contains ${uid}`);
  assert.equal(typeof item.col, 'number');
  assert.equal(typeof item.row, 'number');
  return { col: item.col as number, row: item.row as number };
}

async function clickTile(
  page: import('playwright').Page,
  layout: SavedLayout,
  col: number,
  row: number,
): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  assert.ok(box, 'office canvas is visible');
  // Phase 1 uses the normal browser zoom (DPR 1 → integer zoom 2). The
  // canvas centers its tile map, matching OfficeCanvas.screenToTile().
  const zoom = 2;
  const tilePx = 16 * zoom;
  const mapW = (layout.cols as number) * tilePx;
  const mapH = (layout.rows as number) * tilePx;
  await canvas.click({
    position: {
      x: Math.floor((box.width - mapW) / 2) + (col + 0.5) * tilePx,
      y: Math.floor((box.height - mapH) / 2) + (row + 0.5) * tilePx,
    },
  });
}

async function main(): Promise<void> {
  console.log('[phase1] preparing isolated browser fixture');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'officeanime-phase1-'));
  const layoutPath = path.join(tempDir, 'layout.json');
  const defaultLayout = layoutFromBuild();
  const legacyLayout = legacyLayoutFromBuild();
  const store = createLayoutStore(layoutPath);
  store.save(legacyLayout);
  const historyWriter = new TaskHistoryWriter(path.join(tempDir, 'history'));
  historyWriter.writeEntry({
    id: 'phase1-research',
    prompt: '競合の調査をまとめる',
    priority: 2,
    status: 'done',
    createdAt: new Date(now - 90_000).toISOString(),
    completedAt: new Date(now - 60_000).toISOString(),
    delegationChain: ['res-01'],
    assignee: 'res-01',
    completionSummary: '調査メモを保存しました。',
  });
  historyWriter.writeEntry({
    id: 'phase1-implementation',
    prompt: '本棚の表示を整える',
    priority: 2,
    status: 'done',
    createdAt: new Date(now - 180_000).toISOString(),
    completedAt: new Date(now - 120_000).toISOString(),
    delegationChain: ['eng-01'],
    assignee: 'eng-01',
    completionSummary: '実装を完了しました。',
  });
  const shelf = shelfTile(defaultLayout);
  const secretarySeat = furnitureTile(defaultLayout, 'exec-bench-01');
  const consoleErrors: string[] = [];

  // The fourth argument is the isolated-state seam used by the standalone
  // browser host. Cast keeps this check compatible while that optional API is
  // also used by the extension host.
  const server = await startBrowserServer(
    ROOT,
    PORT,
    (data, respond) => {
      const message = (data ?? {}) as Record<string, unknown>;
      if (handleLayoutCommand(message, respond, defaultLayout, store)) return;
      if (message.type === 'webviewReady') {
        respond({
          type: 'jcEventHistory',
          events: [
            {
              event: 'task_completed',
              timestamp: new Date(now - 60_000).toISOString(),
              from: 'res-01',
              task: '競合の調査をまとめる',
              department: 'research',
            },
            {
              event: 'task_completed',
              timestamp: new Date(now - 120_000).toISOString(),
              from: 'eng-01',
              task: '本棚の表示を整える',
              department: 'engineering',
            },
          ],
        });
      }
      if (message.type === 'task:requestHistory') {
        const result = historyWriter.query(message);
        console.log(
          `[phase1] history request ${String(message.requestId)} → ${result.entries.length}`,
        );
        const reply = () =>
          respond({
            type: 'jcTaskHistoryLog',
            requestId: message.requestId,
            ...result,
          });
        if (Array.isArray(message.labels) && message.labels.includes('research'))
          setTimeout(reply, 180);
        else reply();
      }
    },
    { layoutStore: store, petHome: tempDir },
  );

  console.log(`[phase1] opening headless browser on ${server.port}`);
  const browser = await chromium.launch({ headless: true });
  try {
    console.log('[phase1] loading office');
    const page = await browser.newPage({
      viewport: { width: 1024, height: 736 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    // The office keeps a WebSocket open, so `networkidle` would never settle.
    await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'commit', timeout: 10_000 });
    await expectVisible(page, 'canvas');
    assert.equal(await page.locator('[data-office-log]').count(), 0, 'Office Log starts closed');
    assert.equal(await page.locator('[data-office-library]').count(), 0, 'library starts closed');

    // A saved earlier room can be upgraded deliberately, then restored. The
    // state lives only in this test's temporary layout store.
    await page.getByTitle('表示と動作の設定').click();
    await page.getByRole('button', { name: '新しい初期配置を使う' }).click();
    await page
      .getByRole('status')
      .getByText('新しい初期配置に切り替えました。前の配置にも戻せます。')
      .waitFor();
    assert.deepEqual(store.read(), defaultLayout, 'new compact default is saved');
    assert.equal(store.hasPrevious(), true, 'switching keeps an isolated backup');
    await page.getByRole('button', { name: 'X', exact: true }).click();
    await page.reload({ waitUntil: 'commit', timeout: 10_000 });
    await expectVisible(page, 'canvas');
    await waitForCanvasContent(page);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop-office.png') });

    // The physical shelf, not a synthetic DOM button, opens the consolidated panel.
    await clickTile(page, defaultLayout, shelf.col, shelf.row);
    await expectVisible(page, '[data-office-library]');
    await expectVisible(page, '[data-completed-archive]');
    assert.match(await page.locator('[data-office-library]').innerText(), /競合の調査をまとめる/);

    await page.getByRole('button', { name: '調査', exact: true }).click();
    await expectVisible(page, '[data-office-library]');
    await expectVisible(page, 'text=競合の調査をまとめる');
    const researchText = await page.locator('[data-office-library]').innerText();
    assert.match(
      researchText,
      /競合の調査をまとめる/,
      'research tab shows a stored research record',
    );
    assert.doesNotMatch(
      researchText,
      /本棚の表示を整える/,
      'research tab excludes non-research records',
    );

    await page.getByRole('button', { name: '記録', exact: true }).click();
    await expectVisible(page, 'text=本棚の表示を整える');
    const historyText = await page.locator('[data-office-library]').innerText();
    assert.match(historyText, /競合の調査をまとめる/);
    assert.match(
      historyText,
      /本棚の表示を整える/,
      'records tab retains access to all stored history',
    );

    // An older delayed research reply must not overwrite a newer records tab.
    await page.getByRole('button', { name: '調査', exact: true }).click();
    await page.getByRole('button', { name: '記録', exact: true }).click();
    await expectVisible(page, 'text=本棚の表示を整える');
    await page.waitForTimeout(240);
    assert.match(
      await page.locator('[data-office-library]').innerText(),
      /本棚の表示を整える/,
      'delayed prior-tab response cannot replace the current records tab',
    );
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop-library.png') });

    // Close, then use the menu fallback. The panel leaves the office unobscured.
    await page.getByRole('button', { name: '本棚を閉じる' }).click();
    assert.equal(await page.locator('[data-office-library]').count(), 0, 'library closes');
    await page.getByRole('button', { name: '本棚を開く' }).click();
    await expectVisible(page, '[data-office-library]');

    // Existing approval flow remains an existing desk document: only the
    // deterministic inbound event is synthetic, not a parallel approval UI.
    await page.evaluate(() => {
      window.postMessage(
        {
          type: 'jcOfficeEvent',
          event: {
            event: 'approval_request',
            id: 'phase1-approval',
            company_id: 'test-company',
            from: 'eng-01',
            timestamp: new Date().toISOString(),
            title: '本棚の確認',
            body_md: '既存の決裁フローです。',
            expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            irreversible: false,
            options: [{ key: 'ok', label: '確認する', recommended: true }],
          },
        },
        '*',
      );
    });
    await expectVisible(page, '[data-desk-docs-count]');
    await page.waitForFunction(
      () => document.querySelector('[data-desk-docs-count]')?.textContent === '1',
      undefined,
      { timeout: 10_000 },
    );
    assert.equal(await page.locator('[data-desk-docs-count]').textContent(), '1');

    await page.getByRole('button', { name: '本棚を閉じる' }).click();
    // Compact desk registration still maps the secretary chair to the secretary.
    await clickTile(page, defaultLayout, secretarySeat.col, secretarySeat.row);
    await expectVisible(page, 'text=秘書');

    await page.setViewportSize({ width: 390, height: 736 });
    await page.getByRole('button', { name: '本棚を開く' }).click();
    await expectVisible(page, '[data-office-library]');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'mobile-library.png') });

    await page.getByRole('button', { name: '本棚を閉じる' }).click();
    await page.setViewportSize({ width: 1024, height: 736 });
    await page.getByTitle('表示と動作の設定').click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('button')).some(
          (button) => button.textContent === '前の配置に戻す' && !button.disabled,
        ),
      undefined,
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: '前の配置に戻す' }).click();
    await page.getByRole('status').getByText('前の配置に戻しました。').waitFor();
    assert.deepEqual(
      store.read(),
      legacyLayout,
      'previous layout is restored from the isolated backup',
    );

    assert.deepEqual(consoleErrors, [], `browser console is clean: ${consoleErrors.join('\n')}`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function expectVisible(page: import('playwright').Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 10_000 });
}

async function waitForCanvasContent(page: import('playwright').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      const context = canvas?.getContext('2d');
      if (!canvas || !context || canvas.width === 0 || canvas.height === 0) return false;
      let visible = 0;
      for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 20))) {
        for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 20))) {
          const pixel = context.getImageData(x, y, 1, 1).data;
          if (pixel[0] > 50 || pixel[1] > 50 || pixel[2] > 60) visible++;
        }
      }
      return visible > 20;
    },
    undefined,
    { timeout: 10_000 },
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
