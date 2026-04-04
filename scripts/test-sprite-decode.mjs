#!/usr/bin/env node
// ── Sprite Decode E2E Test ──────────────────────────────────────
// Validates char_0.png structure: 176x96, 11 frames x 3 directions,
// thinking frames (7-9) and error frame (10) are non-empty.

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPRITE_PATH = join(
  __dirname,
  '..',
  'webview-ui',
  'public',
  'assets',
  'characters',
  'char_0.png',
);
const FRAME_W = 16;
const FRAME_H = 32;
const TOTAL_FRAMES = 11;
const DIRECTIONS = 3; // down=0, up=1, right=2

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

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
