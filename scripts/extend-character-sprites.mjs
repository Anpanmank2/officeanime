#!/usr/bin/env node
/**
 * Extend character sprite sheets from 112×96 (7 frames) to 176×96 (11 frames).
 *
 * Adds:
 *   Col 7-9: thinking frames (front-facing only, Row 0)
 *   Col 10:  error frames (3 frames stored as Row0/Row1/Row2)
 *
 * Thinking: derived from standing pose (walk2) with subtle head tilt animation.
 * Error: derived from standing pose with arms-up → head-grab → slump sequence.
 *
 * Usage: node scripts/extend-character-sprites.mjs
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const CHARS_DIR = path.resolve('webview-ui/public/assets/characters');
const CHAR_COUNT = 6;
const OLD_WIDTH = 112; // 7 frames × 16px
const NEW_WIDTH = 176; // 11 frames × 16px
const HEIGHT = 96; // 3 rows × 32px
const FRAME_W = 16;
const FRAME_H = 32;

/**
 * Extract a single frame (16×32) from a PNG at the given grid position.
 * Returns a 2D array of {r,g,b,a} objects.
 */
function extractFrame(png, frameCol, dirRow) {
  const pixels = [];
  const ox = frameCol * FRAME_W;
  const oy = dirRow * FRAME_H;
  for (let y = 0; y < FRAME_H; y++) {
    const row = [];
    for (let x = 0; x < FRAME_W; x++) {
      const idx = ((oy + y) * png.width + (ox + x)) * 4;
      row.push({
        r: png.data[idx],
        g: png.data[idx + 1],
        b: png.data[idx + 2],
        a: png.data[idx + 3],
      });
    }
    pixels.push(row);
  }
  return pixels;
}

/**
 * Write a frame (16×32) into a PNG at the given grid position.
 */
function writeFrame(png, frameCol, dirRow, pixels) {
  const ox = frameCol * FRAME_W;
  const oy = dirRow * FRAME_H;
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const idx = ((oy + y) * png.width + (ox + x)) * 4;
      const p = pixels[y]?.[x];
      if (p) {
        png.data[idx] = p.r;
        png.data[idx + 1] = p.g;
        png.data[idx + 2] = p.b;
        png.data[idx + 3] = p.a;
      }
    }
  }
}

/**
 * Deep-clone a frame.
 */
function cloneFrame(frame) {
  return frame.map((row) => row.map((p) => ({ ...p })));
}

/**
 * Shift the top portion of a frame horizontally by dx pixels.
 * Rows 0 to splitY are shifted; rest stays.
 * Creates a subtle head-tilt effect for thinking animation.
 */
function shiftTop(frame, dx, splitY = 14) {
  const result = cloneFrame(frame);
  for (let y = 0; y < Math.min(splitY, FRAME_H); y++) {
    const newRow = new Array(FRAME_W).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 0 }));
    for (let x = 0; x < FRAME_W; x++) {
      const nx = x + dx;
      if (nx >= 0 && nx < FRAME_W) {
        newRow[nx] = { ...frame[y][x] };
      }
    }
    result[y] = newRow;
  }
  return result;
}

/**
 * Shift a vertical region of the frame upward by dy pixels.
 * Used for "arms up" effect in error animation.
 */
function shiftRegionUp(frame, startY, endY, dy) {
  const result = cloneFrame(frame);
  // Clear original region
  for (let y = startY; y < endY; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      result[y][x] = { r: 0, g: 0, b: 0, a: 0 };
    }
  }
  // Write shifted region
  for (let y = startY; y < endY; y++) {
    const ny = y - dy;
    if (ny >= 0 && ny < FRAME_H) {
      for (let x = 0; x < FRAME_W; x++) {
        result[ny][x] = { ...frame[y][x] };
      }
    }
  }
  return result;
}

/**
 * Shift the head (top portion) down by dy pixels.
 * Used for "slump/bow" effect in error animation.
 */
function shiftHeadDown(frame, dy, headEnd = 14) {
  const result = cloneFrame(frame);
  // Clear head area first
  for (let y = 0; y < headEnd + dy; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      result[y][x] = { r: 0, g: 0, b: 0, a: 0 };
    }
  }
  // Write head shifted down
  for (let y = 0; y < headEnd; y++) {
    const ny = y + dy;
    if (ny < FRAME_H) {
      for (let x = 0; x < FRAME_W; x++) {
        if (frame[y][x].a > 0) {
          result[ny][x] = { ...frame[y][x] };
        }
      }
    }
  }
  return result;
}

/**
 * Generate thinking frames from the standing pose.
 * 3 frames: head tilted left → center → tilted right
 */
function generateThinkingFrames(standingPose) {
  return [
    shiftTop(standingPose, -1, 15), // Head tilted left
    cloneFrame(standingPose), // Center (neutral)
    shiftTop(standingPose, 1, 15), // Head tilted right
  ];
}

/**
 * Generate error frames from the standing pose.
 * 3 frames: arms raised → hands on head → slumped
 */
function generateErrorFrames(standingPose) {
  // Frame 0: Shift the mid-section (arms area, roughly rows 14-20) up by 1px
  const frame0 = shiftRegionUp(standingPose, 13, 20, 1);

  // Frame 1: Shift arms up more + slight head shift
  const frame1 = shiftRegionUp(standingPose, 13, 20, 2);

  // Frame 2: Head bowed down (slump)
  const frame2 = shiftHeadDown(standingPose, 1, 14);

  return [frame0, frame1, frame2];
}

// ── Main ──────────────────────────────────────────────────────

for (let ci = 0; ci < CHAR_COUNT; ci++) {
  const inPath = path.join(CHARS_DIR, `char_${ci}.png`);
  if (!fs.existsSync(inPath)) {
    console.warn(`Skipping: ${inPath} not found`);
    continue;
  }

  const srcBuf = fs.readFileSync(inPath);
  const src = PNG.sync.read(srcBuf);

  if (src.width !== OLD_WIDTH || src.height !== HEIGHT) {
    console.warn(
      `char_${ci}.png: unexpected size ${src.width}×${src.height}, expected ${OLD_WIDTH}×${HEIGHT}`,
    );
    // If already extended, skip
    if (src.width === NEW_WIDTH) {
      console.log(`char_${ci}.png: already extended (${NEW_WIDTH}px wide), skipping`);
      continue;
    }
  }

  // Create new wider PNG
  const dst = new PNG({ width: NEW_WIDTH, height: HEIGHT });

  // Copy existing 112×96 content
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < Math.min(src.width, OLD_WIDTH); x++) {
      const srcIdx = (y * src.width + x) * 4;
      const dstIdx = (y * NEW_WIDTH + x) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  // Extract standing pose (walk2 = frame index 1, Row 0 = front/down)
  const standingPose = extractFrame(src, 1, 0);

  // Generate thinking frames (Col 7-9, Row 0 only)
  const thinkFrames = generateThinkingFrames(standingPose);
  for (let i = 0; i < 3; i++) {
    writeFrame(dst, 7 + i, 0, thinkFrames[i]);
  }

  // Generate error frames (Col 10, Row 0/1/2 = frame 0/1/2)
  const errorFrames = generateErrorFrames(standingPose);
  for (let i = 0; i < 3; i++) {
    writeFrame(dst, 10, i, errorFrames[i]);
  }

  // Write back (overwrite original)
  const outBuf = PNG.sync.write(dst);
  fs.writeFileSync(inPath, outBuf);
  console.log(`✅ char_${ci}.png: extended to ${NEW_WIDTH}×${HEIGHT} (11 frames)`);
}

console.log('\nDone! Rebuild the extension to use the new sprites.');
