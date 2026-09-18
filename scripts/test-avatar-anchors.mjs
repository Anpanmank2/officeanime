#!/usr/bin/env node
// Independent pixel measurements. Row 13 is only the existing down-view convention,
// NOT an eye-visibility test: face_calm inks row 12, and hair composites above face.
// Existing hair covers both row-12 points in every down column. This is out of scope.
// Right has six existing row-13 offenders; up has no eyes. Neither is tested for eyes.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '../webview-ui/public/assets');
const ROOT = join(ASSETS, 'avatar-parts');
const W = 16,
  H = 32,
  COLS = 11,
  ROWS = 3;
const NEW_HAIR = 'hair_swept_undercut';
const PALETTE = new Set(['#292c30', '#555a60', '#858b91']);
const COLOR_EXCEPTIONS = new Set(['hair_bob_streak', 'hair_business_gray']);
// Independent frozen pose contract: error column always faces down.
const headDx = (column) => (column >= 7 && column <= 9 ? column - 8 : 0);
const headDy = (row, column) => (column === 10 && row === 2 ? 1 : 0);
const clamp = (x) => Math.max(0, Math.min(15, x));
let passed = 0,
  failed = 0;
function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}
function* manifests(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) yield* manifests(file);
    else if (entry.name === 'manifest.json') yield file;
  }
}
const alpha = (png, row, col, x, y) => png.data[((row * H + y) * png.width + col * W + x) * 4 + 3];
function bounds(png, row, col) {
  let top = H,
    min = W,
    max = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (alpha(png, row, col, x, y)) {
        top = Math.min(top, y);
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  return { top, min, max };
}
function distance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) total++;
  return total;
}
const catalog = new Map();
function main() {
  for (const file of manifests(ROOT)) {
    try {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      const pngPath = resolve(dirname(file), manifest.file ?? `${manifest.id}.png`);
      if (!pngPath.startsWith(dirname(file) + sep)) throw new Error('PNG outside part directory');
      const png = PNG.sync.read(readFileSync(pngPath));
      assert(!catalog.has(manifest.id), `${manifest.id}: unique catalog id`);
      const dimensions = png.width === W * COLS && png.height === H * ROWS;
      assert(dimensions, `${manifest.id}: dimensions 176x96`);
      if (!dimensions) continue;
      const mask = Uint8Array.from({ length: png.width * png.height }, (_, i) =>
        png.data[i * 4 + 3] ? 1 : 0,
      );
      catalog.set(manifest.id, { manifest, png, mask });
      const padding = [],
        empty = [],
        crowns = [],
        tracking = [],
        eyes = [];
      let partial = 0,
        offPalette = 0;
      const colors = new Set();
      for (let i = 0; i < png.data.length; i += 4) {
        const a = png.data[i + 3];
        if (a !== 0 && a !== 255) partial++;
        if (a && manifest.slot === 'hair') {
          const hex =
            '#' +
            [...png.data.subarray(i, i + 3)]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('')
              .toLowerCase();
          colors.add(hex);
          if (!PALETTE.has(hex)) offPalette++;
        }
      }
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++) {
          const label = `${row}:${col}`,
            box = bounds(png, row, col);
          if (box.max < 0) empty.push(label);
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < W; x++) {
              if (alpha(png, row, col, x, y)) padding.push(label);
            }
          if (manifest.slot === 'hair' || manifest.slot === 'base') {
            if (box.top !== (manifest.slot === 'hair' ? 8 : 9) + headDy(row, col))
              crowns.push(label);
          }
          if (manifest.slot === 'hair') {
            const ref = bounds(png, col === 10 ? 0 : row, 1);
            if (
              box.min !== clamp(ref.min + headDx(col)) ||
              box.max !== clamp(ref.max + headDx(col))
            )
              tracking.push(label);
            if (row === 0)
              for (const eyeX of [6, 9]) {
                const exempt =
                  manifest.id === 'hair_updo' || (manifest.id === 'hair_bob_streak' && eyeX === 9);
                if (!exempt && alpha(png, row, col, eyeX + headDx(col), 13 + headDy(row, col)))
                  eyes.push(`${label}:x${eyeX}`);
              }
          }
        }
      assert(padding.length === 0, `${manifest.id}: top 8 rows transparent (${padding.join(',')})`);
      assert(empty.length === 0, `${manifest.id}: all 33 cells occupied (${empty.join(',')})`);
      assert(partial === 0, `${manifest.id}: binary alpha (${partial} partial pixels)`);
      if (['hair', 'base'].includes(manifest.slot))
        assert(crowns.length === 0, `${manifest.id}: crown anchors (${crowns.join(',')})`);
      if (manifest.slot === 'hair') {
        assert(
          tracking.length === 0,
          `${manifest.id}: hair follows head in 33 cells (${tracking.join(',')})`,
        );
        assert(
          eyes.length === 0,
          `${manifest.id}: down row-13 proxy, known point exceptions only (${eyes.join(',')})`,
        );
        assert(
          COLOR_EXCEPTIONS.has(manifest.id) || offPalette === 0,
          `${manifest.id}: hair palette (${offPalette} exceptional pixels)`,
        );
        if (manifest.id === NEW_HAIR)
          assert(
            colors.size === 3 && [...colors].every((c) => PALETTE.has(c)),
            `${manifest.id}: all three default tones used`,
          );
        const counts = [6, 9].map(
          (x) =>
            Array.from(
              { length: COLS },
              (_, col) => alpha(png, 0, col, x + headDx(col), 12) > 0,
            ).filter(Boolean).length,
        );
        console.log(
          `  INFO: ${manifest.id} down row-12 coverage left=${counts[0]}/11 right=${counts[1]}/11 (reference only; row 13 does not prove eye visibility)`,
        );
      }
    } catch (error) {
      assert(false, `${file}: ${error.message}`);
    }
  }
  assert(catalog.size > 0, 'catalog is non-empty');
  const parts = [...catalog.values()],
    duplicates = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      if (distance(parts[i].mask, parts[j].mask) === 0)
        duplicates.push(`${parts[i].manifest.id}/${parts[j].manifest.id}`);
    }
  assert(duplicates.length === 0, `all part alpha masks unique (${duplicates.join(',')})`);
  for (const part of parts) {
    const peers = parts
      .filter((p) => p !== part && p.manifest.slot === part.manifest.slot)
      .map((p) => ({ id: p.manifest.id, d: distance(part.mask, p.mask) }))
      .sort((a, b) => a.d - b.d);
    console.log(
      `  INFO: nearest ${part.manifest.id}: ${peers.length ? `${peers[0].id} ${peers[0].d}px similarity=${(100 * (1 - peers[0].d / part.mask.length)).toFixed(2)}%` : 'no slot peer'}`,
    );
  }
  const fresh = catalog.get(NEW_HAIR);
  const existingHair = parts.filter(
    (p) => p.manifest.slot === 'hair' && p.manifest.id !== NEW_HAIR,
  );
  assert(
    !!fresh && fresh.manifest.slot === 'hair' && existingHair.length === 14,
    'new hair and 14 existing hairs available',
  );
  if (fresh)
    for (const old of existingHair) {
      const d = distance(fresh.mask, old.mask);
      assert(d >= 120, `${NEW_HAIR}/${old.manifest.id}: distance ${d}px >= 120px`);
    }
  const avatars = JSON.parse(readFileSync(join(ASSETS, 'default-avatars.json'), 'utf8')).avatars;
  const ids = Object.keys(avatars);
  assert(
    ids.length === 14 && ids.includes('res-01') && ids.includes('eng-01'),
    'hypothetical assignment has 14 members including eng-01/res-01',
  );
  const composites = new Map();
  for (const id of ids) {
    const config = avatars[id];
    if (id === 'res-01')
      assert(
        config.layers.filter((layer) => layer.slot === 'hair').length === 1,
        'res-01 has one hair layer to replace',
      );
    const partIds = [
      config.base.part,
      ...config.layers.map((layer) =>
        id === 'res-01' && layer.slot === 'hair' ? NEW_HAIR : layer.part,
      ),
    ];
    assert(
      partIds.every((partId) => catalog.has(partId)),
      `${id}: hypothetical composite references exist`,
    );
    if (!partIds.every((partId) => catalog.has(partId))) continue;
    const mask = new Uint8Array(ROWS * W * H);
    // Binary alpha composition is union; tint and z order cannot change occupancy.
    for (let row = 0; row < ROWS; row++)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          mask[row * W * H + y * W + x] = partIds.some(
            (partId) => alpha(catalog.get(partId).png, row, 1, x, y) > 0,
          )
            ? 1
            : 0;
        }
    composites.set(id, mask);
  }
  let minimum = Infinity;
  const masks = [...composites.values()];
  for (let i = 0; i < masks.length; i++)
    for (let j = i + 1; j < masks.length; j++)
      minimum = Math.min(minimum, distance(masks[i], masks[j]));
  assert(composites.size === 14 && minimum > 0, 'hypothetical 14 member silhouettes are unique');
  assert(
    composites.size === 14 && minimum >= 27,
    `hypothetical minimum pair distance ${minimum}px >= 27px`,
  );
  const pairDistance =
    composites.has('eng-01') && composites.has('res-01')
      ? distance(composites.get('eng-01'), composites.get('res-01'))
      : -1;
  assert(pairDistance >= 130, `hypothetical eng-01/res-01 distance ${pairDistance}px >= 130px`);
}
try {
  main();
} catch (error) {
  assert(false, `anchor lint: ${error.message}`);
}
console.log(`\n=== Avatar anchors: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
