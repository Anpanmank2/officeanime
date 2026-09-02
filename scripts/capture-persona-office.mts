#!/usr/bin/env node
/**
 * Capture the real standalone office with the complete persona roster present.
 *
 * The script intentionally does not start a server. Point it at an already-running
 * standalone/Vite URL, then it drives the same window `message` path used by the
 * extension and validates both the canvas and the roster UI before taking a shot.
 *
 * Usage:
 *   npx tsx scripts/capture-persona-office.mts
 *   npx tsx scripts/capture-persona-office.mts http://localhost:8432 out.png
 *   npx tsx scripts/capture-persona-office.mts --url http://localhost:8432 --output out.png
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_URL = 'http://localhost:8432';
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts', 'persona-characters', 'persona-office.png');
const EXPECTED_ROSTER_SIZE = 23;
const EXPECTED_AVATAR_PARTS = 41;
const STABLE_AGENT_ID_BASE = -9_000;
const APP_TIMEOUT_MS = 60_000;

interface Options {
  url: string;
  output: string;
}

interface JCMember {
  id: string;
  name: string;
  role: string;
  department: string;
  deskId: string;
  hueShift: number;
  palette: number;
}

interface JCConfig {
  members: JCMember[];
  [key: string]: unknown;
}

interface CanvasMetrics {
  width: number;
  height: number;
  samples: number;
  opaqueRatio: number;
  brightRatio: number;
  uniqueQuantizedColors: number;
  luminanceRange: number;
}

function usage(): void {
  console.log('Usage: npx tsx scripts/capture-persona-office.mts [url] [output.png]');
  console.log('       npx tsx scripts/capture-persona-office.mts --url URL --output output.png');
  console.log(`Defaults: ${DEFAULT_URL} -> ${DEFAULT_OUTPUT}`);
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(args: string[]): Options | null {
  let url = DEFAULT_URL;
  let output = DEFAULT_OUTPUT;
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      return null;
    }
    if (arg === '--url') {
      url = takeValue(args, i, '--url');
      i++;
      continue;
    }
    if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      output = takeValue(args, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    positionals.push(arg);
  }

  if (positionals.length > 2) {
    throw new Error(`Expected at most two positional arguments, got ${positionals.length}`);
  }
  if (positionals[0]) url = positionals[0];
  if (positionals[1]) output = positionals[1];

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`URL must use http or https: ${url}`);
  }

  return { url: parsedUrl.href, output: path.resolve(output) };
}

function validateConfig(value: unknown): JCConfig {
  if (!value || typeof value !== 'object') throw new Error('jc-config is not an object');
  const config = value as Record<string, unknown>;
  if (!Array.isArray(config.members)) throw new Error('jc-config.members is not an array');
  if (config.members.length !== EXPECTED_ROSTER_SIZE) {
    throw new Error(
      `Expected exactly ${EXPECTED_ROSTER_SIZE} jc-config members, got ${config.members.length}`,
    );
  }

  const members: JCMember[] = config.members.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`jc-config member ${index} is not an object`);
    }
    const member = raw as Record<string, unknown>;
    const requiredStrings = ['id', 'name', 'role', 'department', 'deskId'] as const;
    for (const key of requiredStrings) {
      if (typeof member[key] !== 'string' || member[key].length === 0) {
        throw new Error(`jc-config member ${index} has invalid ${key}`);
      }
    }
    if (!Number.isFinite(member.hueShift)) {
      throw new Error(`jc-config member ${String(member.id)} has invalid hueShift`);
    }
    if (!Number.isInteger(member.palette)) {
      throw new Error(`jc-config member ${String(member.id)} has invalid palette`);
    }
    return member as unknown as JCMember;
  });

  const ids = new Set(members.map((member) => member.id));
  const desks = new Set(members.map((member) => member.deskId));
  if (ids.size !== EXPECTED_ROSTER_SIZE) throw new Error('jc-config contains duplicate member IDs');
  if (desks.size !== EXPECTED_ROSTER_SIZE) throw new Error('jc-config contains duplicate desk IDs');

  return { ...config, members } as JCConfig;
}

async function waitForLog(
  page: Page,
  consoleLogs: string[],
  needle: string,
  label: string,
): Promise<void> {
  const deadline = Date.now() + APP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (consoleLogs.some((entry) => entry.includes(needle))) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${label} log: ${needle}`);
}

async function fetchConfigFromPage(page: Page): Promise<{ config: JCConfig; source: string }> {
  const fetched = await page.evaluate(async () => {
    const candidates = Array.from(
      new Set([
        new URL('jc-config.json', document.baseURI).href,
        new URL('./jc-config.json', window.location.href).href,
        new URL('/jc-config.json', window.location.origin).href,
      ]),
    );
    const attempts: string[] = [];

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { cache: 'no-store' });
        if (!response.ok) {
          attempts.push(`${candidate} -> HTTP ${response.status}`);
          continue;
        }
        const config = (await response.json()) as unknown;
        return { config, source: candidate, attempts };
      } catch (error) {
        attempts.push(`${candidate} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { config: null, source: '', attempts };
  });

  if (fetched.config === null) {
    throw new Error(`Could not fetch jc-config in the page:\n${fetched.attempts.join('\n')}`);
  }
  return { config: validateConfig(fetched.config), source: fetched.source };
}

async function dispatchRoster(
  page: Page,
  config: JCConfig,
): Promise<{
  agentIds: number[];
  stateMembers: Array<{ memberId: string; state: string }>;
  reopenedOffice: boolean;
}> {
  return page.evaluate(
    ({ rosterConfig, expectedSize, stableBase }) => {
      const members = rosterConfig.members as JCMember[];
      if (members.length !== expectedSize) {
        throw new Error(`Refusing to dispatch ${members.length} members; expected ${expectedSize}`);
      }

      const dispatch = (data: unknown): void => {
        window.dispatchEvent(new MessageEvent('message', { data }));
      };

      // Match the app's deterministic negative-ID conventions so startup
      // permanent residents and workload-restored residents update in place.
      let permanentIndex = 0;
      const permanentRoles = new Set(['Secretary', 'PM / Director']);
      const targetAgentIds = new Map<string, number>();
      members.forEach((member, index) => {
        const agentId = permanentRoles.has(member.role)
          ? -100 - permanentIndex++
          : stableBase - index;
        targetAgentIds.set(member.id, agentId);
      });

      dispatch({ type: 'jcConfigLoaded', config: rosterConfig });

      // A long-idle standalone can legitimately be in the soft-closed visual
      // state. Add one ephemeral, page-only activity edge so the requested roster
      // is not hidden under the closed-office dim layer.
      const officeState = document
        .querySelector('[data-office-pill]')
        ?.getAttribute('data-office-state');
      const reopenedOffice = officeState === 'closed' || officeState === 'closing';
      if (reopenedOffice) {
        dispatch({
          type: 'jcHistoryEvent',
          event: {
            event: 'cross_dept_message',
            timestamp: new Date().toISOString(),
            from: 'exec-sec',
            to: members[0]?.id,
            task: 'persona-office-capture',
          },
        });
      }

      console.log('[PersonaCapture] roster-dispatch-start');
      const agentIds: number[] = [];
      members.forEach((member) => {
        const agentId = targetAgentIds.get(member.id)!;
        agentIds.push(agentId);
        dispatch({
          type: 'jcMemberArriving',
          agentId,
          memberId: member.id,
          deskId: member.deskId,
          seatUid: member.deskId,
          palette: member.palette,
          hueShift: member.hueShift,
        });
      });

      const statePlan: Array<{ department: string; state: string }> = [
        { department: 'engineering', state: 'coding' },
        { department: 'research', state: 'reading' },
        { department: 'marketing', state: 'thinking' },
      ];
      const stateMembers: Array<{ memberId: string; state: string }> = [];
      const used = new Set<string>();
      for (const planned of statePlan) {
        const member = members.find(
          (candidate) => candidate.department === planned.department && !used.has(candidate.id),
        );
        if (!member) continue;
        used.add(member.id);
        const agentId = targetAgentIds.get(member.id)!;
        dispatch({
          type: 'jcMemberStateChange',
          agentId,
          memberId: member.id,
          jcState: planned.state,
          stateSince: Date.now(),
        });
        stateMembers.push({ memberId: member.id, state: planned.state });
      }
      console.log('[PersonaCapture] roster-dispatch-complete');

      return {
        agentIds,
        stateMembers,
        reopenedOffice,
      };
    },
    {
      rosterConfig: config,
      expectedSize: EXPECTED_ROSTER_SIZE,
      stableBase: STABLE_AGENT_ID_BASE,
    },
  );
}

function assertArrivalResult(
  config: JCConfig,
  result: Awaited<ReturnType<typeof dispatchRoster>>,
  arrivalIds: string[],
): void {
  if (result.agentIds.length !== EXPECTED_ROSTER_SIZE) {
    throw new Error(
      `Dispatched ${result.agentIds.length} agent IDs, expected ${EXPECTED_ROSTER_SIZE}`,
    );
  }
  if (
    new Set(result.agentIds).size !== EXPECTED_ROSTER_SIZE ||
    result.agentIds.some((id) => !Number.isInteger(id) || id >= 0)
  ) {
    throw new Error('Arrival agent IDs must be unique, stable negative integers');
  }
  const expectedIds = config.members.map((member) => member.id);
  if (
    arrivalIds.length !== EXPECTED_ROSTER_SIZE ||
    arrivalIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error(
      `App processed the wrong arrival roster: expected ${expectedIds.join(', ')}, got ${arrivalIds.join(', ')}`,
    );
  }
}

async function verifyRosterBoard(page: Page): Promise<void> {
  const launcher = page.locator('[title="クリックして全社稼働可視化ボードを開く"]');
  if ((await launcher.count()) !== 1) {
    throw new Error('Could not find the real company-board launcher');
  }
  await launcher.click();

  const board = page.locator('[data-company-activation-board]');
  await board.waitFor({ state: 'visible', timeout: 10_000 });
  try {
    await page.waitForFunction(
      (expected) => {
        const root = document.querySelector('[data-company-activation-board]');
        if (!root) return false;
        const portraits = Array.from(root.querySelectorAll('canvas[aria-hidden="true"]'));
        if (portraits.length !== expected) return false;
        return portraits.every((item) => {
          const canvas = item as HTMLCanvasElement;
          if (canvas.width === 0 || canvas.height === 0) return false;
          const context = canvas.getContext('2d');
          if (!context) return false;
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          return (
            getComputedStyle(canvas).filter === 'none' &&
            pixels.some((_, i) => i % 4 === 3 && pixels[i] > 0)
          );
        });
      },
      EXPECTED_ROSTER_SIZE,
      { timeout: 10_000 },
    );
  } catch {
    const details = await board.locator('canvas[aria-hidden="true"]').evaluateAll((items) =>
      items.map((item) => {
        const canvas = item as HTMLCanvasElement;
        return {
          width: canvas.width,
          height: canvas.height,
          filter: getComputedStyle(canvas).filter,
        };
      }),
    );
    throw new Error(
      `Roster board did not render exactly ${EXPECTED_ROSTER_SIZE} nonblank present portraits: ${JSON.stringify(details)}`,
    );
  }

  await board.getByTitle('閉じる').click();
  await board.waitFor({ state: 'detached', timeout: 5_000 });
}

async function readCanvasMetrics(page: Page): Promise<CanvasMetrics> {
  return page
    .locator('canvas')
    .first()
    .evaluate((canvasNode) => {
      const canvas = canvasNode as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Office canvas does not have a 2D context');

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const stepX = Math.max(1, Math.floor(canvas.width / 96));
      const stepY = Math.max(1, Math.floor(canvas.height / 72));
      const colors = new Set<number>();
      let samples = 0;
      let opaque = 0;
      let bright = 0;
      let minLuminance = 255;
      let maxLuminance = 0;

      for (let y = 0; y < canvas.height; y += stepY) {
        for (let x = 0; x < canvas.width; x += stepX) {
          const offset = (y * canvas.width + x) * 4;
          const r = image.data[offset];
          const g = image.data[offset + 1];
          const b = image.data[offset + 2];
          const a = image.data[offset + 3];
          samples++;
          if (a > 16) opaque++;
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luminance > 48) bright++;
          minLuminance = Math.min(minLuminance, luminance);
          maxLuminance = Math.max(maxLuminance, luminance);
          colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
      }

      return {
        width: canvas.width,
        height: canvas.height,
        samples,
        opaqueRatio: opaque / samples,
        brightRatio: bright / samples,
        uniqueQuantizedColors: colors.size,
        luminanceRange: maxLuminance - minLuminance,
      };
    });
}

function assertCanvasIsNotBlank(metrics: CanvasMetrics): void {
  const valid =
    metrics.width >= 320 &&
    metrics.height >= 240 &&
    metrics.samples >= 1_000 &&
    // The map is centered inside a larger transparent viewport, so the canvas
    // is intentionally not mostly opaque. Rich color/range checks below catch
    // a cleared or uniform background without rejecting that real framing.
    metrics.opaqueRatio >= 0.05 &&
    metrics.brightRatio >= 0.01 &&
    metrics.uniqueQuantizedColors >= 12 &&
    metrics.luminanceRange >= 24;
  if (!valid) throw new Error(`Office canvas appears blank: ${JSON.stringify(metrics)}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  mkdirSync(path.dirname(options.output), { recursive: true });
  let browser: Browser | null = null;
  let page: Page | null = null;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const consoleLogs: string[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    page = await context.newPage();
    // tsx/esbuild can add this name-preservation helper to functions that
    // Playwright serializes into the browser. Seed it without serializing a TS
    // callback so nested predicates remain executable in page.evaluate().
    await page.addInitScript({
      content: 'globalThis.__name ??= (target) => target;',
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('console', (message) => {
      consoleLogs.push(message.text());
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    console.log(`Opening ${options.url}`);
    const response = await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: APP_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      throw new Error(`Standalone page returned ${response?.status() ?? 'no response'}`);
    }

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const item = document.querySelector('canvas');
        return item instanceof HTMLCanvasElement && item.width > 0 && item.height > 0;
      },
      undefined,
      { timeout: APP_TIMEOUT_MS },
    );
    await waitForLog(
      page,
      consoleLogs,
      `Received ${EXPECTED_AVATAR_PARTS} avatar parts`,
      'avatar-parts load',
    );
    await waitForLog(
      page,
      consoleLogs,
      `Received ${EXPECTED_ROSTER_SIZE} avatar configs`,
      'persona avatar-config load',
    );
    await waitForLog(
      page,
      consoleLogs,
      `Config loaded: ${EXPECTED_ROSTER_SIZE} members`,
      'JC roster-config load',
    );

    const { config, source } = await fetchConfigFromPage(page);
    console.log(`Loaded ${config.members.length} members from ${source}`);

    const dispatchLogStart = consoleLogs.length;
    const dispatchResult = await dispatchRoster(page, config);
    await waitForLog(
      page,
      consoleLogs,
      '[PersonaCapture] roster-dispatch-complete',
      'roster dispatch completion',
    );
    const dispatchLogs = consoleLogs.slice(dispatchLogStart);
    const completionIndex = dispatchLogs.findIndex((entry) =>
      entry.includes('[PersonaCapture] roster-dispatch-complete'),
    );
    const arrivalIds = dispatchLogs
      .slice(0, completionIndex + 1)
      .map((entry) => /^\[JC-WV\] Member arriving: (\S+)$/.exec(entry)?.[1] ?? null)
      .filter((id): id is string => id !== null);
    assertArrivalResult(config, dispatchResult, arrivalIds);
    console.log(
      `App processed ${arrivalIds.length}/${EXPECTED_ROSTER_SIZE} deterministic arrivals`,
    );
    console.log(
      `Working poses: ${dispatchResult.stateMembers.map((item) => `${item.memberId}=${item.state}`).join(', ')}`,
    );

    await page.waitForFunction(
      () =>
        document.querySelector('[data-office-pill]')?.getAttribute('data-office-state') === 'open',
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(2_500);

    await verifyRosterBoard(page);
    console.log(
      `Roster board rendered ${EXPECTED_ROSTER_SIZE} nonblank, present persona portraits`,
    );
    await page.waitForTimeout(1_000);

    const metrics = await readCanvasMetrics(page);
    assertCanvasIsNotBlank(metrics);

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `Page emitted errors:\n${[...pageErrors, ...consoleErrors].map((line) => `- ${line}`).join('\n')}`,
      );
    }

    await page.screenshot({ path: options.output, fullPage: true });
    if (!existsSync(options.output) || statSync(options.output).size < 10_000) {
      throw new Error(`Screenshot was not written or is unexpectedly small: ${options.output}`);
    }

    console.log(
      `Canvas ${metrics.width}x${metrics.height}, ${metrics.uniqueQuantizedColors} sampled colors, ${(metrics.brightRatio * 100).toFixed(1)}% bright`,
    );
    console.log(`Screenshot: ${options.output}`);
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`Persona office capture failed:\n${message}`);
    const relevantLogs = consoleLogs
      .filter(
        (entry) =>
          entry.toLowerCase().includes('avatar') ||
          entry.includes('Config loaded') ||
          entry.includes('Member arriving'),
      )
      .slice(-30);
    if (relevantLogs.length > 0) {
      console.error(`Relevant browser logs:\n${relevantLogs.join('\n')}`);
    }
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

await main();
