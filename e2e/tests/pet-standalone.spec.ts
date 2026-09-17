import { test, expect, chromium, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observePetDrawing, openPetCard, preparePet, snapshotPet } from '../helpers/pet';

test('SessionStart reaches standalone across six stages and fails closed on bad display records', async ({}, info) => {
  test.setTimeout(45_000);
  const root = path.resolve(__dirname, '../..');
  const port = Number(process.env.OFFICE_PET_TEST_PORT || 21432);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || port === 8432)
    throw new Error('Use a separate test port');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pet-standalone-'));
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [path.join(root, 'dist/standalone.js'), `--port=${port}`, `--workspace=${home}`],
    {
      cwd: home,
      env: { ...process.env, HOME: home, AGENT_PET_HOME: path.join(home, '.agent-pet') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  server.stdout.on('data', (chunk) => {
    log += chunk;
  });
  server.stderr.on('data', (chunk) => {
    log += chunk;
  });
  let browser: Browser | undefined;
  const evidence: unknown[] = [];
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.OFFICE_PET_BROWSER_EXECUTABLE,
    });
    await expect
      .poll(() => log.includes(`listening on http://localhost:${port}`), { timeout: 15_000 })
      .toBe(true);
    for (const [stage, age] of [0, 3, 10, 25, 45, 70].entries()) {
      fs.rmSync(path.join(home, '.agent-pet'), { recursive: true, force: true });
      const pet = preparePet(home, age);
      const before = snapshotPet(pet.petRoot);
      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      await observePetDrawing(context);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(url);
      const response = await page.request.get(`${url}/jc-pet.json`);
      expect(response.headers()['cache-control']).toBe('no-store');
      const payload = await response.json();
      expect(payload.stage).toBe(stage);
      expect(payload.firstVoice).toEqual(pet.voice);
      await expect(page.locator('[data-pet-first-voice]')).toBeVisible();
      await expect(page.locator('[data-pet-first-voice-text]')).toHaveText(pet.voice.text);
      await page.screenshot({ path: info.outputPath(`stage-${stage}-voice.png`) });
      await page.getByRole('button', { name: '第一声を閉じる' }).click();
      const click = await openPetCard(page);
      const panel = page.locator('[data-pet-status-panel]');
      await expect(panel).toContainText(`生まれて ${age}日`);
      await expect(panel).toContainText(pet.voice.text);
      await page.screenshot({ path: info.outputPath(`stage-${stage}-card.png`) });
      expect(snapshotPet(pet.petRoot)).toEqual(before);
      expect(errors).toEqual([]);
      evidence.push({ stage, age, payload, click, before });
      await context.close();
    }

    fs.rmSync(path.join(home, '.agent-pet'), { recursive: true, force: true });
    const pet = preparePet(home, 10);
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    await observePetDrawing(context);
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(url);
    await expect(page.locator('[data-pet-first-voice]')).toBeVisible();
    await page.getByRole('button', { name: '第一声を閉じる' }).click();
    const before = snapshotPet(pet.petRoot);
    await page.reload();
    await openPetCard(page);
    await expect(page.locator('[data-pet-first-voice]')).toBeHidden();
    await expect(page.locator('[data-pet-status-panel]')).toContainText(pet.voice.text);
    expect(snapshotPet(pet.petRoot)).toEqual(before);
    await page.locator('[data-pet-status-panel]').getByTitle('閉じる', { exact: true }).click();

    for (const [name, content] of [
      ['stale', JSON.stringify({ ...pet.voice, date: '2000-01-01' })],
      ['corrupt', '{broken'],
      ['oversized', JSON.stringify({ ...pet.voice, ignoredPadding: 'x'.repeat(4097) })],
      ['missing', null],
    ] as const) {
      if (content === null) fs.unlinkSync(pet.voiceFile);
      else fs.writeFileSync(pet.voiceFile, content);
      const untouched = snapshotPet(pet.petRoot);
      await page.clock.fastForward(30_100);
      await openPetCard(page);
      await expect(page.locator('[data-pet-status-panel]')).not.toContainText('きょうの第一声');
      await expect(page.locator('[data-pet-first-voice]')).toBeHidden();
      expect(snapshotPet(pet.petRoot)).toEqual(untouched);
      evidence.push({ failure: name, result: 'passed' });
      await page.locator('[data-pet-status-panel]').getByTitle('閉じる', { exact: true }).click();
    }
    // A new ID on the same day is a new voice; identical redelivery stays claimed.
    const nextVoice = { ...pet.voice, id: 'synthetic-new-voice-00001' };
    fs.writeFileSync(pet.voiceFile, JSON.stringify(nextVoice));
    await page.clock.fastForward(30_100);
    await expect(page.locator('[data-pet-first-voice]')).toBeVisible();
    await page.getByRole('button', { name: '第一声を閉じる' }).click();
    await page.clock.fastForward(30_100);
    await expect(page.locator('[data-pet-first-voice]')).toBeHidden();
    await openPetCard(page);
    evidence.push({ newId: nextVoice.id, duplicateSuppressed: true });

    // Growth corruption must clear an already-open card and companion state.
    fs.writeFileSync(path.join(pet.petDir, 'growth.json'), '{broken');
    await page.clock.fastForward(30_100);
    await expect(page.locator('[data-pet-status-panel]')).toHaveCount(0);
    expect(await (await page.request.get(`${url}/jc-pet.json`)).json()).toBeNull();
    await context.close();

    // Storage refusal leaves explicit reading usable and never interprets HTML.
    fs.rmSync(pet.petRoot, { recursive: true, force: true });
    const fallback = preparePet(home, 10);
    const voice = {
      ...fallback.voice,
      kind: 'normal',
      text: '<img src=x onerror=alert(1)>\n—— qa-companion',
    };
    fs.writeFileSync(fallback.voiceFile, JSON.stringify(voice));
    const deniedContext = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    await observePetDrawing(deniedContext);
    await deniedContext.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('denied', 'SecurityError');
      };
    });
    const denied = await deniedContext.newPage();
    await denied.goto(url);
    await openPetCard(denied);
    await expect(denied.locator('[data-pet-first-voice]')).toBeHidden();
    await expect(denied.locator('[data-pet-status-panel]')).toContainText(voice.text);
    await expect(denied.locator('[data-pet-status-panel] img')).toHaveCount(0);
    await denied.screenshot({ path: info.outputPath('storage-denied-literal-text.png') });
    await deniedContext.close();
    // Reproduce the native WebView's narrow content area without opening an IDE.
    // This renderer regression is supplementary evidence, not native-host QA.
    fs.writeFileSync(fallback.voiceFile, JSON.stringify(fallback.voice));
    const narrowContext = await browser.newContext({ viewport: { width: 612, height: 704 } });
    await observePetDrawing(narrowContext);
    const narrow = await narrowContext.newPage();
    await narrow.clock.install();
    await narrow.goto(url);
    const narrowBubble = narrow.locator('[data-pet-first-voice]');
    await expect(narrowBubble).toBeVisible();
    const geometry = await narrowBubble.evaluate((el) => {
      const button = el.querySelector('button')!;
      const b = button.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return {
        inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        closeOnTop: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === button,
      };
    });
    expect(geometry).toEqual({ inside: true, closeOnTop: true });
    await narrow.screenshot({ path: info.outputPath('narrow-voice-over-log.png') });
    await narrow.getByRole('button', { name: '設定', exact: true }).click();
    const settingsObservation = await narrow.evaluate(() => {
      const modal = Array.from(document.querySelectorAll('div')).find(
        (el) => el.style.position === 'fixed' && el.style.transform.includes('translate(-50%'),
      )!;
      const m = modal.getBoundingClientRect();
      const b = document.querySelector('[data-pet-first-voice]')!.getBoundingClientRect();
      const left = Math.max(m.left, b.left),
        right = Math.min(m.right, b.right);
      const top = Math.max(m.top, b.top),
        bottom = Math.min(m.bottom, b.bottom);
      const overlap = right > left && bottom > top;
      const bubble = document.querySelector('[data-pet-first-voice]')!;
      const close = modal.querySelector('button')!;
      const c = close.getBoundingClientRect();
      return {
        overlap,
        inside: m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight,
        bubbleCovered: !bubble.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        ),
        modalCloseOnTop: close.contains(
          document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2),
        ),
        modalOnTop:
          !overlap ||
          modal.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)),
        modal: { x: m.x, y: m.y, width: m.width, height: m.height },
      };
    });
    evidence.push({ settingsObservation });
    fs.writeFileSync(
      info.outputPath('settings-layer.json'),
      JSON.stringify(settingsObservation, null, 2),
    );
    await narrow.screenshot({ path: info.outputPath('narrow-settings-layer-observation.png') });
    expect(settingsObservation.bubbleCovered).toBe(true);
    expect(settingsObservation.modalCloseOnTop).toBe(true);
    expect(settingsObservation.inside).toBe(true);
    const settings = narrow.getByText('Settings', { exact: true }).locator('../..');
    await expect(settings.getByText('2x', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: '+', exact: true }).click();
    await expect(settings.getByText('3x', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: '-', exact: true }).click();
    await expect(settings.getByText('2x', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: 'X', exact: true }).click();
    await expect(settings).toHaveCount(0);

    await narrow.getByRole('button', { name: '第一声を閉じる' }).click();
    await narrow.getByRole('button', { name: 'Research', exact: true }).click();
    // Pan the canvas below the persistent company board before clicking the pet.
    await narrow.mouse.move(300, 400);
    await narrow.mouse.wheel(0, -150);
    await narrow.waitForTimeout(100);
    await openPetCard(narrow);
    await expect(narrow.locator('[data-pet-status-panel]')).toContainText(fallback.voice.text);
    const narrowBefore = snapshotPet(fallback.petRoot);
    fs.writeFileSync(
      fallback.voiceFile,
      JSON.stringify({ ...fallback.voice, id: 'narrow-new-voice-00001' }),
    );
    const narrowAfterWrite = snapshotPet(fallback.petRoot);
    await narrow.clock.fastForward(30_100);
    await expect(narrowBubble).toBeVisible();
    const cardLayer = await narrow.locator('[data-pet-status-panel]').evaluate((card) => {
      const b = document.querySelector('[data-pet-first-voice]')!.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const x = (Math.max(b.left, c.left) + Math.min(b.right, c.right)) / 2;
      const y = (Math.max(b.top, c.top) + Math.min(b.bottom, c.bottom)) / 2;
      return card.contains(document.elementFromPoint(x, y));
    });
    expect(cardLayer).toBe(true);
    expect(snapshotPet(fallback.petRoot)).toEqual(narrowAfterWrite);
    await narrow.screenshot({ path: info.outputPath('narrow-card-over-voice.png') });
    evidence.push({
      narrowGeometry: geometry,
      cardAboveVoice: cardLayer,
      before: narrowBefore,
      result: 'passed',
    });
    await narrowContext.close();
    fs.writeFileSync(
      info.outputPath('standalone-evidence.json'),
      JSON.stringify({ url, evidence, result: 'passed' }, null, 2),
    );
  } finally {
    // Launch itself can fail (missing browser or OS refusal), before a Browser exists.
    // Nest cleanup so a browser-close error cannot strand the server or fixture.
    try {
      await browser?.close();
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        server.kill('SIGTERM');
        await new Promise<void>((resolve) => server.once('exit', () => resolve()));
      }
      fs.rmSync(home, { recursive: true, force: true });
      fs.writeFileSync(info.outputPath('standalone-server.log'), log);
      fs.writeFileSync(
        info.outputPath('cleanup.json'),
        JSON.stringify(
          {
            home,
            homeRemoved: !fs.existsSync(home),
            serverPid: server.pid,
            serverExitCode: server.exitCode,
            serverSignal: server.signalCode,
            browserStarted: !!browser,
          },
          null,
          2,
        ),
      );
    }
  }
});
