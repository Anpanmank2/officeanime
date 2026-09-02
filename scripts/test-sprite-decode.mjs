#!/usr/bin/env node
// ── Sprite Decode E2E Test ──────────────────────────────────────
// Validates legacy char_0.png plus the generated avatar-parts/default-avatar
// contract: atlas geometry, manifests, roster references, frame coverage, and
// color-independent silhouette uniqueness.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, sep } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const SPRITE_PATH = join(ROOT, 'webview-ui', 'public', 'assets', 'characters', 'char_0.png');
const ASSETS_PATH = join(ROOT, 'webview-ui', 'public', 'assets');
const AVATAR_PARTS_PATH = join(ASSETS_PATH, 'avatar-parts');
const DEFAULT_AVATARS_PATH = join(ASSETS_PATH, 'default-avatars.json');
const JC_CONFIG_PATH = join(ROOT, 'jc-config.json');
const FRAME_W = 16;
const FRAME_H = 32;
const TOTAL_FRAMES = 11;
const DIRECTIONS = 3; // down=0, up=1, right=2
const ATLAS_WIDTH = FRAME_W * TOTAL_FRAMES;
const ATLAS_HEIGHT = FRAME_H * DIRECTIONS;
const TOP_PADDING_ROWS = 8;
const MAX_AVATAR_PARTS = 60;
const MAX_ACCESSORIES = 2;
const VISIBLE_ALPHA_THRESHOLD = 2;
const AVATAR_SLOTS = ['base', 'bottom', 'top', 'face', 'hair', 'accessory'];
const OPTIONAL_SLOTS = new Set(AVATAR_SLOTS.filter((slot) => slot !== 'base'));

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

/** Check if a frame region has any non-transparent pixels */
function frameHasContent(png, frameIdx, dirIdx) {
  const x0 = frameIdx * FRAME_W;
  const y0 = dirIdx * FRAME_H;
  for (let y = y0; y < y0 + FRAME_H; y++) {
    for (let x = x0; x < x0 + FRAME_W; x++) {
      const idx = (png.width * y + x) * 4;
      if (png.data[idx + 3] > 2) return true; // alpha > threshold
    }
  }
  return false;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    assert(false, `${label} parses as JSON (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

function isSafeChildPath(parent, candidate) {
  const resolvedParent = resolve(parent);
  const resolvedCandidate = resolve(candidate);
  return (
    resolvedCandidate === resolvedParent || resolvedCandidate.startsWith(`${resolvedParent}${sep}`)
  );
}

function isColorConfig(value) {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    Number.isFinite(value.h) &&
    Number.isFinite(value.s) &&
    Number.isFinite(value.b) &&
    Number.isFinite(value.c) &&
    (value.colorize === undefined || typeof value.colorize === 'boolean')
  );
}

function topPaddingIsTransparent(png) {
  for (let dirIdx = 0; dirIdx < DIRECTIONS; dirIdx++) {
    const rowStart = dirIdx * FRAME_H;
    for (let y = rowStart; y < rowStart + TOP_PADDING_ROWS; y++) {
      for (let x = 0; x < ATLAS_WIDTH; x++) {
        const alpha = png.data[(y * png.width + x) * 4 + 3];
        if (alpha >= VISIBLE_ALPHA_THRESHOLD) return false;
      }
    }
  }
  return true;
}

function composedAlphaMask(parts, frameIdx, dirIdx) {
  const mask = new Uint8Array(FRAME_W * FRAME_H);
  const x0 = frameIdx * FRAME_W;
  const y0 = dirIdx * FRAME_H;
  for (const part of parts) {
    const png = part.png;
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const alpha = png.data[((y0 + y) * png.width + (x0 + x)) * 4 + 3];
        if (alpha >= VISIBLE_ALPHA_THRESHOLD) mask[y * FRAME_W + x] = 1;
      }
    }
  }
  return mask;
}

function maskHasContent(mask) {
  return mask.some((value) => value !== 0);
}

function maskSignature(mask) {
  return Buffer.from(mask).toString('base64');
}

console.log('=== Sprite Decode E2E Test ===\n');

// 1. Load and parse PNG
console.log('1. Loading char_0.png...');
const buffer = readFileSync(SPRITE_PATH);
const png = PNG.sync.read(buffer);

// 2. Verify dimensions
console.log('\n2. Dimension check:');
assert(png.width === 176, `Width is 176 (got ${png.width})`);
assert(png.height === 96, `Height is 96 (got ${png.height})`);
assert(
  png.width === TOTAL_FRAMES * FRAME_W,
  `Width = ${TOTAL_FRAMES} frames x ${FRAME_W}px = ${TOTAL_FRAMES * FRAME_W}`,
);
assert(
  png.height === DIRECTIONS * FRAME_H,
  `Height = ${DIRECTIONS} dirs x ${FRAME_H}px = ${DIRECTIONS * FRAME_H}`,
);

// 3. Verify all 11 frames x 3 directions decode
console.log('\n3. Frame decode check (11 frames x 3 directions):');
const frameNames = [
  'walk1',
  'walk2',
  'walk3', // 0-2
  'type1',
  'type2', // 3-4
  'read1',
  'read2', // 5-6
  'think1',
  'think2',
  'think3', // 7-9
  'error', // 10
];
const dirNames = ['down', 'up', 'right'];

for (let f = 0; f < TOTAL_FRAMES; f++) {
  for (let d = 0; d < DIRECTIONS; d++) {
    const hasContent = frameHasContent(png, f, d);
    // walk/type/read frames should have content
    if (f <= 6) {
      assert(hasContent, `Frame ${f} (${frameNames[f]}) dir ${d} (${dirNames[d]}) has content`);
    }
  }
}

// 4. Verify thinking frames (7-9) are non-empty
console.log('\n4. Thinking frames (7-9) non-empty check:');
for (let f = 7; f <= 9; f++) {
  for (let d = 0; d < DIRECTIONS; d++) {
    const hasContent = frameHasContent(png, f, d);
    assert(
      hasContent,
      `Think frame ${f} (${frameNames[f]}) dir ${d} (${dirNames[d]}) is non-empty`,
    );
  }
}

// 5. Verify error frame (10) all 3 directions are non-empty
console.log('\n5. Error frame (10) non-empty check:');
for (let d = 0; d < DIRECTIONS; d++) {
  const hasContent = frameHasContent(png, 10, d);
  assert(hasContent, `Error frame dir ${d} (${dirNames[d]}) is non-empty`);
}

// 6. Avatar-parts catalog and PNG contract
console.log('\n6. Avatar-parts manifest and PNG checks:');
const avatarCatalog = new Map();

assert(existsSync(AVATAR_PARTS_PATH), `Avatar parts directory exists (${AVATAR_PARTS_PATH})`);
if (existsSync(AVATAR_PARTS_PATH)) {
  const rootDirectories = readdirSync(AVATAR_PARTS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
  const unexpectedSlots = rootDirectories.filter((name) => !AVATAR_SLOTS.includes(name));
  assert(
    unexpectedSlots.length === 0,
    `Only frozen avatar slot directories are present${unexpectedSlots.length > 0 ? ` (unexpected: ${unexpectedSlots.join(', ')})` : ''}`,
  );

  for (const slot of AVATAR_SLOTS) {
    const slotPath = join(AVATAR_PARTS_PATH, slot);
    assert(existsSync(slotPath), `Slot directory exists: ${slot}`);
    if (!existsSync(slotPath)) continue;

    const partDirectories = readdirSync(slotPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();

    for (const folderName of partDirectories) {
      const partPath = join(slotPath, folderName);
      const manifestPath = join(partPath, 'manifest.json');
      const issues = [];
      let manifest = null;
      let partPng = null;

      if (!existsSync(manifestPath)) {
        issues.push('missing manifest.json');
      } else {
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        } catch (err) {
          issues.push(`invalid manifest JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (manifest) {
        if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
          issues.push('id must be a non-empty string');
        } else if (avatarCatalog.has(manifest.id)) {
          issues.push(`duplicate id ${manifest.id}`);
        }
        if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
          issues.push('name must be a non-empty string');
        }
        if (manifest.slot !== slot) issues.push(`slot ${String(manifest.slot)} != folder ${slot}`);
        if (manifest.width !== ATLAS_WIDTH || manifest.height !== ATLAS_HEIGHT) {
          issues.push(`manifest dimensions must be ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
        }
        if (manifest.frames !== TOTAL_FRAMES) {
          issues.push(`manifest frames must be ${TOTAL_FRAMES}`);
        }
        if (typeof manifest.colorable !== 'boolean') {
          issues.push('colorable must be boolean');
        }
        if (manifest.zOverride !== undefined && manifest.zOverride !== null) {
          issues.push('zOverride must be null or omitted');
        }

        const file = manifest.file ?? `${manifest.id}.png`;
        const pngPath = typeof file === 'string' ? resolve(partPath, file) : partPath;
        if (typeof file !== 'string' || file.length === 0 || !isSafeChildPath(partPath, pngPath)) {
          issues.push('file must resolve inside its part directory');
        } else if (!existsSync(pngPath)) {
          issues.push(`missing PNG ${file}`);
        } else {
          try {
            partPng = PNG.sync.read(readFileSync(pngPath));
            if (partPng.width !== ATLAS_WIDTH || partPng.height !== ATLAS_HEIGHT) {
              issues.push(
                `PNG dimensions ${partPng.width}x${partPng.height} != ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`,
              );
            } else if (!topPaddingIsTransparent(partPng)) {
              issues.push(
                `top ${TOP_PADDING_ROWS} rows of one or more frame rows are not transparent`,
              );
            }
          } catch (err) {
            issues.push(`invalid PNG: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const label = `${slot}/${folderName}`;
      assert(
        issues.length === 0,
        `${label} has a valid manifest, ${ATLAS_WIDTH}x${ATLAS_HEIGHT} PNG, and transparent top padding${issues.length > 0 ? ` — ${issues.join('; ')}` : ''}`,
      );
      if (issues.length === 0 && manifest && partPng) {
        avatarCatalog.set(manifest.id, { manifest, png: partPng });
      }
    }
  }
}

assert(avatarCatalog.size > 0, `Avatar catalog is non-empty (got ${avatarCatalog.size})`);
assert(
  avatarCatalog.size <= MAX_AVATAR_PARTS,
  `Avatar catalog has at most ${MAX_AVATAR_PARTS} parts (got ${avatarCatalog.size})`,
);

// 7. Default avatar config parity and references
console.log('\n7. Default avatar config and roster checks:');
const jcConfig = readJson(JC_CONFIG_PATH, 'jc-config.json');
const avatarFile = readJson(DEFAULT_AVATARS_PATH, 'default-avatars.json');
const rosterIds = Array.isArray(jcConfig?.members)
  ? jcConfig.members.map((member) => member?.id).filter((id) => typeof id === 'string')
  : [];
const uniqueRosterIds = new Set(rosterIds);
const avatarConfigs =
  avatarFile?.avatars && typeof avatarFile.avatars === 'object' ? avatarFile.avatars : {};
const avatarIds = Object.keys(avatarConfigs);

assert(
  rosterIds.length === 23,
  `jc-config.json contains exactly 23 members (got ${rosterIds.length})`,
);
assert(uniqueRosterIds.size === rosterIds.length, 'jc-config.json member IDs are unique');
assert(avatarFile?.version === 1, 'default-avatars.json has version 1');
assert(
  Number.isInteger(avatarFile?.avatarRevision) && avatarFile.avatarRevision > 0,
  'default-avatars.json has a positive bundled revision for safe migration',
);
assert(
  JSON.stringify([...uniqueRosterIds].sort()) === JSON.stringify([...avatarIds].sort()),
  'default-avatars.json IDs exactly match jc-config.json member IDs',
);

const validPartsByMember = new Map();
for (const memberId of rosterIds) {
  const config = avatarConfigs[memberId];
  const issues = [];
  const parts = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    issues.push('config must be an object');
  } else {
    const base = config.base;
    if (!base || typeof base !== 'object' || Array.isArray(base)) {
      issues.push('base is required');
    } else {
      if (typeof base.part !== 'string' || base.part.length === 0) {
        issues.push('base.part must be a non-empty string');
      } else {
        const part = avatarCatalog.get(base.part);
        if (!part) issues.push(`unknown base part ${base.part}`);
        else if (part.manifest.slot !== 'base') issues.push(`${base.part} is not a base part`);
        else parts.push(part);
      }
      if (!isColorConfig(base.color)) issues.push('base.color is invalid');
    }

    if (!Array.isArray(config.layers)) {
      issues.push('layers must be an array');
    } else {
      const seenNormalSlots = new Set();
      let accessoryCount = 0;
      for (const [index, layer] of config.layers.entries()) {
        if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
          issues.push(`layers[${index}] must be an object`);
          continue;
        }
        if (!OPTIONAL_SLOTS.has(layer.slot)) {
          issues.push(`layers[${index}] has invalid slot ${String(layer.slot)}`);
        } else if (layer.slot === 'accessory') {
          accessoryCount++;
        } else if (seenNormalSlots.has(layer.slot)) {
          issues.push(`duplicate non-accessory slot ${layer.slot}`);
        } else {
          seenNormalSlots.add(layer.slot);
        }

        if (typeof layer.part !== 'string' || layer.part.length === 0) {
          issues.push(`layers[${index}].part must be a non-empty string`);
        } else {
          const part = avatarCatalog.get(layer.part);
          if (!part) issues.push(`unknown part ${layer.part}`);
          else if (part.manifest.slot !== layer.slot) {
            issues.push(
              `${layer.part} belongs to ${part.manifest.slot}, not ${String(layer.slot)}`,
            );
          } else {
            parts.push(part);
          }
        }
        if (!isColorConfig(layer.color)) issues.push(`layers[${index}].color is invalid`);
      }
      if (accessoryCount > MAX_ACCESSORIES) {
        issues.push(`has ${accessoryCount} accessories (max ${MAX_ACCESSORIES})`);
      }
    }
  }

  assert(
    issues.length === 0,
    `${memberId} has valid base/layers/slot references${issues.length > 0 ? ` — ${issues.join('; ')}` : ''}`,
  );
  if (issues.length === 0) validPartsByMember.set(memberId, parts);
}

// 8. Composite coverage and color-independent silhouette uniqueness
console.log('\n8. Composed frame coverage and silhouette checks:');
const silhouetteOwners = new Map();
const membersWithSilhouettes = new Set();
const duplicateSilhouettes = [];

for (const memberId of rosterIds) {
  const parts = validPartsByMember.get(memberId);
  if (!parts) continue;

  const emptyFrames = [];
  for (let dirIdx = 0; dirIdx < DIRECTIONS; dirIdx++) {
    for (let frameIdx = 0; frameIdx < TOTAL_FRAMES; frameIdx++) {
      if (!maskHasContent(composedAlphaMask(parts, frameIdx, dirIdx))) {
        emptyFrames.push(`${dirNames[dirIdx]}:${frameNames[frameIdx]}`);
      }
    }
  }
  assert(
    emptyFrames.length === 0,
    `${memberId} composites to non-empty pixels in all ${TOTAL_FRAMES}x${DIRECTIONS} atlas cells${emptyFrames.length > 0 ? ` (empty: ${emptyFrames.join(', ')})` : ''}`,
  );

  const signature = [0, 1, 2]
    .map((dirIdx) => maskSignature(composedAlphaMask(parts, 1, dirIdx)))
    .join('|');
  const existingOwner = silhouetteOwners.get(signature);
  if (existingOwner) duplicateSilhouettes.push(`${existingOwner} = ${memberId}`);
  else silhouetteOwners.set(signature, memberId);
  membersWithSilhouettes.add(memberId);
}

assert(
  membersWithSilhouettes.size === rosterIds.length,
  `Walk2 silhouette generated for every roster member (got ${membersWithSilhouettes.size}/${rosterIds.length})`,
);
assert(
  duplicateSilhouettes.length === 0,
  `All ${rosterIds.length} members have unique combined down/up/right walk2 alpha silhouettes${duplicateSilhouettes.length > 0 ? ` — ${duplicateSilhouettes.join('; ')}` : ''}`,
);

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
