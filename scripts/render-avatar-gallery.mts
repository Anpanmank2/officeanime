#!/usr/bin/env node
/**
 * Render the committed persona-avatar assets through the real loader and
 * composeAvatar(), then capture a labeled HTML gallery with Playwright.
 *
 * Usage:
 *   npx tsx scripts/render-avatar-gallery.mts [output.png]
 *   npx tsx scripts/render-avatar-gallery.mts --output output.png
 */

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CharacterDirectionSprites } from '../shared/assets/types.js';
import { composeAvatar } from '../webview-ui/src/office/sprites/avatarComposite.js';
import {
  parseAvatarConfigFile,
  type LoadedAvatarParts,
} from '../webview-ui/src/office/sprites/avatarTypes.js';
import { Direction, type SpriteData } from '../webview-ui/src/office/types.js';

// The root package compiles shared/*.ts as CommonJS while this .mts script and
// the webview are ESM. createRequire preserves the real shared implementations
// without relying on synthetic named exports in Node.
const require = createRequire(import.meta.url);
const { buildAvatarPartCatalog } =
  require('../shared/assets/build.ts') as typeof import('../shared/assets/build.ts');
const { AVATAR_PARTS_DIR, DEFAULT_AVATARS_FILE_NAME } =
  require('../shared/assets/constants.ts') as typeof import('../shared/assets/constants.ts');
const { decodeAllAvatarParts } =
  require('../shared/assets/loader.ts') as typeof import('../shared/assets/loader.ts');

interface RosterMember {
  id: string;
  name: string;
  nameEn?: string;
  role: string;
  department: string;
}

interface GalleryFrame {
  label: string;
  sprite: SpriteData;
}

interface GalleryMember {
  id: string;
  name: string;
  role: string;
  department: string;
  frames: GalleryFrame[];
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const ASSETS_DIR = path.join(ROOT, 'webview-ui', 'public', 'assets');
const JC_CONFIG_PATH = path.join(ROOT, 'jc-config.json');
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT,
  'artifacts',
  'persona-characters',
  'avatar-gallery.png',
);
const EXPECTED_ROSTER_SIZE = 23;
const SPRITE_SCALE = 3;

function requestedOutputPath(args: string[]): string {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npx tsx scripts/render-avatar-gallery.mts [output.png]');
    console.log('       npx tsx scripts/render-avatar-gallery.mts --output output.png');
    process.exit(0);
  }

  const outputEquals = args.find((arg) => arg.startsWith('--output='));
  if (outputEquals) return path.resolve(outputEquals.slice('--output='.length));

  const outputIndex = args.indexOf('--output');
  if (outputIndex >= 0) {
    const value = args[outputIndex + 1];
    if (!value) throw new Error('--output requires a path');
    return path.resolve(value);
  }

  const positional = args.find((arg) => !arg.startsWith('-'));
  return positional ? path.resolve(positional) : DEFAULT_OUTPUT_PATH;
}

function readJson<T>(filePath: string): T {
  if (!existsSync(filePath)) throw new Error(`Required file does not exist: ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function buildGalleryMembers(): GalleryMember[] {
  const rosterFile = readJson<{ members?: RosterMember[] }>(JC_CONFIG_PATH);
  const roster = rosterFile.members ?? [];
  if (roster.length !== EXPECTED_ROSTER_SIZE) {
    throw new Error(
      `Expected ${EXPECTED_ROSTER_SIZE.toString()} jc-config members, got ${roster.length.toString()}`,
    );
  }

  const avatarConfigPath = path.join(ASSETS_DIR, DEFAULT_AVATARS_FILE_NAME);
  const avatarConfig = parseAvatarConfigFile(readJson<unknown>(avatarConfigPath));
  if (!avatarConfig) throw new Error(`Invalid avatar config: ${avatarConfigPath}`);

  const avatarPartsPath = path.join(ASSETS_DIR, AVATAR_PARTS_DIR);
  if (!existsSync(avatarPartsPath)) {
    throw new Error(`Avatar-parts directory does not exist: ${avatarPartsPath}`);
  }
  const catalog = buildAvatarPartCatalog(ASSETS_DIR);
  if (catalog.length === 0) throw new Error('Avatar-parts catalog is empty');

  const decoded = decodeAllAvatarParts(ASSETS_DIR, catalog);
  if (Object.keys(decoded).length !== catalog.length) {
    throw new Error(
      `Decoded ${Object.keys(decoded).length.toString()} of ${catalog.length.toString()} avatar parts`,
    );
  }
  const parts: LoadedAvatarParts = {
    catalog,
    sprites: new Map<string, CharacterDirectionSprites>(Object.entries(decoded)),
  };

  const configuredIds = Object.keys(avatarConfig.avatars).sort();
  const rosterIds = roster.map((member) => member.id).sort();
  if (JSON.stringify(configuredIds) !== JSON.stringify(rosterIds)) {
    throw new Error('default-avatars.json IDs do not exactly match jc-config.json');
  }

  return roster.map((member) => {
    const config = avatarConfig.avatars[member.id];
    if (!config) throw new Error(`Missing avatar config for ${member.id}`);
    const sprites = composeAvatar(config, parts);
    return {
      id: member.id,
      name: member.nameEn ? `${member.name} / ${member.nameEn}` : member.name,
      role: member.role,
      department: member.department,
      frames: [
        { label: 'DOWN · WALK2', sprite: sprites.walk[Direction.DOWN][1] },
        { label: 'UP · WALK2', sprite: sprites.walk[Direction.UP][1] },
        { label: 'RIGHT · WALK2', sprite: sprites.walk[Direction.RIGHT][1] },
        { label: 'TYPE 1', sprite: sprites.typing[Direction.DOWN][0] },
        { label: 'TYPE 2', sprite: sprites.typing[Direction.DOWN][1] },
        { label: 'READ 1', sprite: sprites.reading[Direction.DOWN][0] },
        { label: 'READ 2', sprite: sprites.reading[Direction.DOWN][1] },
      ],
    };
  });
}

async function renderGallery(outputPath: string, members: GalleryMember[]): Promise<void> {
  const extension = path.extname(outputPath).toLowerCase();
  if (extension !== '.png' && extension !== '.jpg' && extension !== '.jpeg') {
    throw new Error(`Output path must end in .png, .jpg, or .jpeg: ${outputPath}`);
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Persona character gallery</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 28px;
        background: #11131c;
        color: #f2f4ff;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      h1 { margin: 0 0 6px; font-size: 25px; letter-spacing: 0.04em; }
      .subtitle { margin: 0 0 24px; color: #aeb5cc; font-size: 13px; }
      #gallery {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .member {
        min-width: 0;
        padding: 12px;
        border: 2px solid #3d4562;
        background: #1a1e2b;
        box-shadow: 4px 4px 0 #080910;
      }
      .member-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
        border-bottom: 1px solid #343b55;
        padding-bottom: 7px;
      }
      .member-name { min-width: 0; font-size: 14px; font-weight: 800; }
      .member-meta { color: #9ba4c1; font-size: 10px; text-align: right; white-space: nowrap; }
      .frames { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
      .frame { min-width: 0; text-align: center; }
      .sprite-shell {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 102px;
        border: 1px solid #303750;
        background-color: #151824;
        background-image:
          linear-gradient(45deg, #1d2232 25%, transparent 25%),
          linear-gradient(-45deg, #1d2232 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #1d2232 75%),
          linear-gradient(-45deg, transparent 75%, #1d2232 75%);
        background-position: 0 0, 0 4px, 4px -4px, -4px 0;
        background-size: 8px 8px;
      }
      canvas { display: block; image-rendering: pixelated; }
      .frame-label {
        min-height: 24px;
        margin-top: 4px;
        color: #c8cee2;
        font-size: 8px;
        line-height: 1.3;
      }
    </style>
  </head>
  <body>
    <h1>Persona-Consistent Character Gallery</h1>
    <p class="subtitle">Real avatar-parts loader + composeAvatar · 23 members · walk2 directions and complete type/read pairs</p>
    <main id="gallery"></main>
  </body>
</html>`);

    await page.evaluate(
      ({ galleryMembers, scale }) => {
        const gallery = document.querySelector<HTMLElement>('#gallery');
        if (!gallery) throw new Error('Gallery root is missing');

        for (const member of galleryMembers) {
          const card = document.createElement('section');
          card.className = 'member';
          card.dataset.memberId = member.id;

          const heading = document.createElement('div');
          heading.className = 'member-heading';
          const name = document.createElement('div');
          name.className = 'member-name';
          name.textContent = member.name;
          const meta = document.createElement('div');
          meta.className = 'member-meta';
          meta.textContent = `${member.id} · ${member.department} · ${member.role}`;
          heading.append(name, meta);
          card.append(heading);

          const frames = document.createElement('div');
          frames.className = 'frames';
          for (const frame of member.frames) {
            const frameElement = document.createElement('div');
            frameElement.className = 'frame';
            const shell = document.createElement('div');
            shell.className = 'sprite-shell';
            const canvas = document.createElement('canvas');
            const rows = frame.sprite.length;
            const columns = frame.sprite[0]?.length ?? 0;
            canvas.width = columns * scale;
            canvas.height = rows * scale;
            canvas.setAttribute('aria-label', `${member.id} ${frame.label}`);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not create a 2D canvas context');
            context.imageSmoothingEnabled = false;
            for (let row = 0; row < rows; row++) {
              for (let column = 0; column < columns; column++) {
                const color = frame.sprite[row][column];
                if (color === '') continue;
                context.fillStyle = color;
                context.fillRect(column * scale, row * scale, scale, scale);
              }
            }
            const label = document.createElement('div');
            label.className = 'frame-label';
            label.textContent = frame.label;
            shell.append(canvas);
            frameElement.append(shell, label);
            frames.append(frameElement);
          }
          card.append(frames);
          gallery.append(card);
        }
      },
      { galleryMembers: members, scale: SPRITE_SCALE },
    );

    await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' });
  } finally {
    await browser.close();
  }
}

const outputPath = requestedOutputPath(process.argv.slice(2));
const members = buildGalleryMembers();
await renderGallery(outputPath, members);
console.log(`Rendered ${members.length.toString()} members to ${outputPath}`);
