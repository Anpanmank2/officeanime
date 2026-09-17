import { expect, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PET_NAME = 'qa-companion';

export function petDate(): string {
  const now = new Date();
  if (now.getHours() < 4) now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** A synthetic pet using the explicit, read-only producer checkout's templates. */
export function preparePet(home: string, age: number) {
  const source = process.env.OFFICE_PET_SOURCE;
  if (!source || !path.isAbsolute(source))
    throw new Error('Set OFFICE_PET_SOURCE to an isolated agent-pet checkout');
  const petRoot = path.join(home, '.agent-pet');
  const petDir = path.join(petRoot, PET_NAME);
  for (const dir of ['memory', 'learned', 'proactive', 'card'])
    fs.mkdirSync(path.join(petDir, dir), { recursive: true });
  for (const file of ['soul.md', 'owner.md'])
    fs.copyFileSync(path.join(source, 'templates', file), path.join(petDir, file));
  const today = petDate();
  const born = new Date(Date.parse(today) - age * 86400000).toISOString().slice(0, 10);
  const growth = JSON.parse(
    fs
      .readFileSync(path.join(source, 'templates/growth.json'), 'utf8')
      .replaceAll('{{NAME}}', PET_NAME)
      .replaceAll('{{DATE}}', born),
  );
  growth.look = { ...growth.look, direction: 'cute' };
  fs.writeFileSync(path.join(petDir, 'growth.json'), JSON.stringify(growth));
  const runProducer = () => {
    const output = execFileSync(
      process.execPath,
      [
        path.join(source, 'scripts/pet-day-start.mjs'),
        '--home',
        petRoot,
        '--name',
        PET_NAME,
        '--date',
        today,
        '--hook-json',
      ],
      {
        encoding: 'utf8',
        input: JSON.stringify({ session_id: 'synthetic-office-qa' }),
        env: { ...process.env, HOME: home, AGENT_PET_HOME: petRoot },
      },
    );
    return JSON.parse(output);
  };
  const hook = runProducer();
  const voiceFile = path.join(petDir, 'first-voice.json');
  const voice = JSON.parse(fs.readFileSync(voiceFile, 'utf8'));
  expect(hook.hookSpecificOutput.hookEventName).toBe('SessionStart');
  expect(hook.hookSpecificOutput.additionalContext).toContain(voice.text);
  return { petRoot, petDir, voiceFile, voice, hook, runProducer };
}

/** Contents and metadata that viewing must not change; does not follow symlinks. */
export function snapshotPet(root: string): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const name of fs.readdirSync(root, { recursive: true }).map(String).sort()) {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (stat.isFile())
      snapshot[name] = {
        size: stat.size,
        mtime: stat.mtimeMs,
        sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      };
    else if (stat.isSymbolicLink()) snapshot[name] = { link: fs.readlinkSync(file) };
  }
  return snapshot;
}

/** Observe actual canvas draw calls, without injecting pet state or host messages. */
export async function observePetDrawing(context: BrowserContext) {
  await context.addInitScript(
    ({ petName }) => {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'jcPetUpdated') (window as any).__petMessage = event.data;
      });
      const scopes: Array<
        Array<{ x: number; y: number; width: number; height: number; color: string }>
      > = [];
      const proto = CanvasRenderingContext2D.prototype;
      const save = proto.save,
        restore = proto.restore,
        rect = proto.fillRect,
        text = proto.fillText;
      proto.save = function () {
        scopes.push([]);
        return save.call(this);
      };
      proto.restore = function () {
        scopes.pop();
        return restore.call(this);
      };
      proto.fillRect = function (x, y, width, height) {
        scopes.at(-1)?.push({ x, y, width, height, color: String(this.fillStyle) });
        return rect.call(this, x, y, width, height);
      };
      proto.fillText = function (value, x, y, maxWidth) {
        if (value === petName) {
          const bounds = this.canvas.getBoundingClientRect();
          (window as unknown as Record<string, unknown>).__petDraw = {
            x,
            y,
            pixels: scopes.at(-1),
            dpr: devicePixelRatio,
            canvas: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
          };
        }
        return maxWidth === undefined
          ? text.call(this, value, x, y)
          : text.call(this, value, x, y, maxWidth);
      };
    },
    { petName: PET_NAME },
  );
}

export async function openPetCard(view: Frame | Page) {
  await expect
    .poll(() =>
      view.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__petDraw)),
    )
    .toBe(true);
  const point = await view.evaluate(() => {
    const draw = (window as any).__petDraw;
    // The first rectangle is the floor shadow; the next is a painted body pixel.
    const pixel = draw.pixels[1];
    return {
      x: (pixel.x + pixel.width / 2) / draw.dpr,
      y: (pixel.y + pixel.height / 2) / draw.dpr,
    };
  });
  await view.locator('canvas').first().click({ position: point, timeout: 5_000 });
  await expect(view.locator('[data-pet-status-panel]')).toBeVisible();
  return point;
}
