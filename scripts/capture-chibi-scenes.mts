#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = option('--url', 'http://localhost:5173/');
const out = resolve(option('--out', 'artifacts/persona-characters/chibi-p2'));
const active = option('--active', '1') !== '0';
const { members } = JSON.parse(await readFile(resolve(root, 'jc-config.json'), 'utf8'));
const residents = members.filter(m => ['exec-sec', 'eng-04'].includes(m.id));
const agentIds = new Map(members.map((m, k) => [m.id,
  residents.includes(m) ? -100 - residents.indexOf(m) : -9100 - k]));
const marketing = members.filter(m => m.id.startsWith('mkt-')).map(m => m.id);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', message => logs.push(message.text()));
let count = 0;
let failures = 0;
const send = data => page.evaluate(data => window.dispatchEvent(new MessageEvent('message', { data })), data);
const state = (id, jcState) => send({ type: 'jcMemberStateChange', agentId: -1, memberId: id, jcState });
const allState = async s => { for (const m of members) await state(m.id, s); };
const view = () => page.evaluate(() => window.__JC_VIEW_QC);
const canvas = page.locator('canvas').first();

async function prepare() {
  logs.length = 0;
  await page.goto(url);
  const deadline = Date.now() + 15000;
  while (!logs.some(l => l.includes('[BrowserMock] Messages dispatched')) ||
         !logs.some(l => l.includes('permanent residents dispatched'))) {
    if (Date.now() > deadline) throw new Error('BrowserMock readiness timeout');
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1500);
  for (const m of members) {
    const agentId = agentIds.get(m.id);
    if (!residents.includes(m)) {
      await send({ type: 'agentCreated', id: agentId, folderName: 'qa' });
      await send({ type: 'jcMemberArriving', agentId, memberId: m.id,
        deskId: m.deskId, hueShift: m.hueShift, palette: m.palette });
    }
    if (active) await send({ type: 'jcHistoryEvent', event: {
      event: 'work_started', from: m.id, task: 'qa-' + m.id, timestamp: new Date().toISOString(),
    } });
  }
}

async function center(ids) {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Office canvas missing');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  for (let attempt = 0; attempt < 3; attempt++) {
    const points = await page.evaluate(ids => (window.__JC_STATUS_QC ?? []).filter(p => ids.includes(p.memberId)), ids);
    if (!points.length) throw new Error('No status coordinates for ' + ids.join(','));
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    // QC coordinates are canvas-local; wheel deltas are CSS pixels (deviceScaleFactor 1).
    await page.mouse.wheel(x - bounds.width / 2, y - bounds.height / 2);
    await page.waitForTimeout(150);
  }
}

async function setZoom(z, targets = z === 4 ? marketing : members.map(m => m.id)) {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Office canvas missing');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.down('Control');
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = (await view())?.zoom;
      if (current === z) break;
      if (!Number.isFinite(current)) throw new Error('Zoom hook unavailable');
      await page.mouse.wheel(0, current < z ? -60 : 60);
      await page.waitForTimeout(100);
    }
  } finally {
    await page.keyboard.up('Control');
  }
  await page.waitForTimeout(300);
  if ((await view())?.zoom !== z) throw new Error('Could not reach zoom ' + z);
  await center(targets);
}

async function shot(name) {
  const path = resolve(out, name + '.png');
  await page.screenshot({ path, fullPage: true });
  console.log(`Wrote ${path} zoom=${(await view())?.zoom}`);
  count++;
}
async function scene(name, action) {
  try { await action(); await shot(name); }
  catch (error) { failures++; console.error(`${name}: ${error.message}`); }
}
async function point(id) {
  const p = await page.evaluate(id => window.__JC_STATUS_QC?.find(p => p.memberId === id), id);
  const bounds = await canvas.boundingBox();
  if (!p || !bounds) throw new Error('Character coordinates unavailable: ' + id);
  const z = (await view()).zoom;
  return { x: bounds.x + p.x, y: bounds.y + p.y + 12 * z };
}

try {
  await mkdir(out, { recursive: true });
  await prepare();
  await scene('01-z2-seated', async () => { await allState('coding'); await setZoom(2); await page.waitForTimeout(1500); });
  for (const [name, zoom] of [['02-z4-seated', 4], ['03-z3-seated', 3], ['04-z1-seated', 1]]) {
    await scene(name, async () => { await setZoom(zoom); });
  }
  await scene('05-z4-states', async () => {
    await setZoom(4);
    for (const [id, s] of [['mkt-01', 'reading'], ['mkt-02', 'thinking'], ['mkt-03', 'error'], ['mkt-05', 'idle']]) await state(id, s);
    await page.waitForTimeout(1200);
  });
  for (const suffix of ['a', 'b', 'c', 'd']) {
    await scene('06-z2-walk-' + suffix, async () => {
      if (suffix === 'a') {
        await setZoom(2); await allState('idle');
        for (const m of members) await send({ type: 'jcMemberLeaving', agentId: agentIds.get(m.id), memberId: m.id });
        await page.waitForTimeout(2500);
      } else await page.waitForTimeout(250);
    });
  }
  await scene('07-z4-selected', async () => {
    // Reset departure timers and restore everyone before the seated scenes.
    await prepare(); await allState('coding'); await setZoom(4); await page.waitForTimeout(1500);
    const p = await point('mkt-01');
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await page.locator('[data-jc-karte][data-jc-member="mkt-01"]').waitFor();
    await page.waitForTimeout(500);
  });
  await scene('08-z4-bubbles', async () => {
    const close = page.locator('[data-jc-karte] button[aria-label="閉じる"]');
    if (await close.count()) await close.click();
    await send({ type: 'agentToolStart', id: agentIds.get('mkt-01'), toolId: 'qa-bash', status: 'Running: npm test' });
    await send({ type: 'agentToolPermission', id: agentIds.get('mkt-01') });
    await page.waitForTimeout(600);
  });
  for (const [name, wait] of [['09a-z4-subagent', 120], ['09b-z4-subagent', 900]]) {
    await scene(name, async () => {
      if (wait === 120) await send({ type: 'agentToolStart', id: agentIds.get('mkt-02'), toolId: 'qa-task', status: 'Subtask: QA scene' });
      await page.waitForTimeout(wait);
    });
  }
  await scene('10a-z2-owner-generic', async () => {
    await page.locator('button', { hasText: /^出社する$/ }).click();
    await send({ type: 'agentCreated', id: 9901, folderName: 'qa' });
    await page.waitForTimeout(4000);
    await setZoom(2, ['exec-sec']);
  });
  await scene('10b-z4-owner-generic', async () => { await setZoom(4, ['exec-sec']); });
} catch (error) {
  failures++; console.error(`prepare: ${error.message}`);
} finally {
  console.log(`scenes: ${count}`);
  await browser.close();
}
if (failures) process.exitCode = 1;
