import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--cell-h', '--out'].includes(args[i]) || !args[i + 1]) throw Error('Expected --cell-h 44|48 or --out <path>');
  options[args[i]] = args[i + 1];
}
const CELL_W = 32, CELL_H = Number(options['--cell-h'] ?? 48), ART_H = CELL_H - 8;
const BODY_LEFT = 4, BODY_W = 24, HEAD_TOP = 8, HEAD_H = 15, EYE_Y = 16;
if (![44, 48].includes(CELL_H)) throw Error('Cell height must be 44 or 48');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(options['--out'] ?? resolve(root, 'artifacts/persona-characters/r3-sample-3members.png'));
const roster = JSON.parse(readFileSync(resolve(root, 'webview-ui/public/assets/default-avatars.json'), 'utf8')).avatars;
const members = [
  { id: 'eng-01', width: 18, coat: '#a99249', dark: '#746333', light: '#cabb75', hair: '#44382e' },
  { id: 'mkt-01', width: 12, coat: '#34373e', dark: '#25282e', light: '#5c6067', hair: '#44454a' },
  { id: 'res-01', width: 24, coat: '#e6b836', dark: '#b68723', light: '#f8d966', hair: '#493c32' },
];
const ink = '#20212a', skin = '#e4b58c', skinDark = '#be8564', pants = '#586373', paper = '#eee6c8';
const blank = (w = CELL_W, h = CELL_H) => new PNG({ width: w, height: h });
function rect(p, x, y, w, h, color) {
  const rgb = color.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (xx < 0 || yy < 0 || xx >= p.width || yy >= p.height) throw Error('Drawing outside cell');
    p.data.set([...rgb, 255], (yy * p.width + xx) * 4);
  }
}
const alpha = (p, x, y) => x >= 0 && y >= 0 && x < p.width && y < p.height ? p.data[(y * p.width + x) * 4 + 3] : 0;
function blit(dst, src, dx = 0, dy = 0, scale = 1) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const s = (y * src.width + x) * 4, a = src.data[s + 3] / 255;
    if (!a) continue;
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const d = ((dy + y * scale + sy) * dst.width + dx + x * scale + sx) * 4;
      const b = dst.data[d + 3] / 255, total = a + b * (1 - a);
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round((src.data[s + c] * a + dst.data[d + c] * b * (1 - a)) / total);
      dst.data[d + 3] = Math.round(total * 255);
    }
  }
}
const mask = p => Array.from({ length: p.width * p.height }, (_, i) => Number(p.data[i * 4 + 3] > 0));
const distance = (a, b) => a.reduce((n, v, i) => n + Number(v !== b[i]), 0);
function paint(maskImage, color, outlined) {
  const p = blank();
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) if (alpha(maskImage, x, y)) {
    const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => !alpha(maskImage, x + dx, y + dy));
    rect(p, x, y, 1, 1, outlined && edge ? ink : color);
  }
  return p;
}
function geometry(m, who, frame) {
  const bob = frame >= 3 && frame % 2 === 0 ? 2 : 0, direction = frame === 1 ? 'right' : frame === 2 ? 'up' : 'down';
  const layers = Array.from({ length: 6 }, () => blank()), [base, bottom, top, face, hair, accessory] = layers;
  const box = (p, x, y, w, h) => rect(p, x, y, w, h, ink), left = (CELL_W - m.width) / 2;
  box(base, 13, 21 + bob, 6, 7); box(base, left, 29, m.width, 8);
  box(top, left, 24 + bob, m.width, 13 - bob);
  const stride = frame === 3 ? -2 : frame === 5 ? 2 : 0, foot = HEAD_TOP + ART_H;
  box(bottom, 10 + stride, 36, 5, foot - 36); box(bottom, 17 - stride, 36, 5, foot - 36 - (stride ? 2 : 0));
  box(face, 10, 11 + bob, 12, HEAD_H - 3);
  if (who === 0) { box(hair, 8, 10 + bob, 16, 4); box(hair, 8, 13 + bob, 3, 5); box(hair, 21, 13 + bob, 3, 4); box(hair, 9, HEAD_TOP + bob, 3, 3); }
  if (who === 1) { box(hair, 9, HEAD_TOP + bob, 14, 3); box(hair, 3, 11 + bob, 8, 8); box(hair, 1, 13 + bob, 4, 4); box(hair, 21, 10 + bob, 3, 4); }
  if (who === 2) { box(hair, 4, HEAD_TOP + bob, 24, 6); box(hair, 5, 14 + bob, 5, 5); box(hair, 22, 14 + bob, 5, 5); box(hair, 7, 19 + bob, 3, 2); box(hair, 22, 19 + bob, 3, 2); }
  // Held objects are rigid across views; glasses are drawn on the face, never held.
  if (who === 0) { box(accessory, 23, 33 + bob, 7, 9); box(accessory, 25, 31 + bob, 3, 2); }
  if (who === 2) box(accessory, 25, 27 + bob, 5, 13);
  const silhouette = blank(); layers.slice(0, 5).forEach(p => blit(silhouette, p));
  return { layers, silhouette, bob, direction, who, m, eyeY: EYE_Y + bob / 2 };
}
const frames = members.map((m, who) => Array.from({ length: 7 }, (_, f) => geometry(m, who, f)));
// 1. Compare undecorated black outlines before adding any colors or objects.
const distances = [0, 1, 2].flatMap(d => [[0, 1], [0, 2], [1, 2]].map(([a, b]) => distance(mask(frames[a][d].silhouette), mask(frames[b][d].silhouette))));
function finish(f) {
  const { layers, who, m, bob, direction, eyeY } = f;
  f.eyeMask = blank();
  // A failed silhouette gate still produces a review sheet, without decoration.
  if (distances.some(n => n < 80)) { f.image = f.silhouette; return; }
  const colors = [skin, pants, m.coat, direction === 'up' ? m.hair : skin, m.hair, who === 0 ? m.dark : paper];
  // 2. Flat colors, then 3. black contour, then 4. inset shadow/highlight.
  const flat = layers.map((p, i) => paint(p, colors[i], false));
  const edged = flat.map((p, i) => paint(p, colors[i], true));
  rect(edged[2], (CELL_W - m.width) / 2 + 1, 27 + bob, 2, 7 - bob, m.dark);
  rect(edged[2], (CELL_W + m.width) / 2 - 3, 27 + bob, 2, 5, m.light);
  rect(edged[4], who === 2 ? 19 : 12, 10 + bob, who === 2 ? 1 : 4, 1, who === 1 ? '#96999d' : m.hair);
  const p = blank(); edged.slice(0, 5).forEach(layer => blit(p, layer));
  // 5. Face and role symbols. Rear views retain a hidden anatomical eye anchor.
  if (direction !== 'up') {
    const eyes = direction === 'right' ? [17] : [11, 16];
    for (const x of eyes) {
      rect(p, x, eyeY - 1, 3, who === 0 ? 2 : 3, ink);
      rect(f.eyeMask, x, eyeY - 1, 3, who === 0 ? 2 : 3, ink);
      if (who === 1) rect(p, x + 1, eyeY - 1, 1, 1, paper);
      const browY = eyeY - 4 - (who === 2 && x === 16 ? 1 : 0);
      rect(p, x, browY, 3, 2, ink);
      if (who === 1) rect(p, x === 11 ? x : x + 2, browY - 1, 1, 2, ink);
      if (who === 1) { rect(p, x, eyeY - 2, 3, 1, paper); rect(p, x, eyeY + 2, 3, 1, paper); rect(p, x - 1, eyeY - 1, 1, 3, paper); rect(p, x + 3, eyeY - 1, 1, 3, paper); }
    }
    rect(p, direction === 'right' ? 18 : 14, 21 + bob, 3, 1, skinDark);
  }
  if (who === 0 && direction !== 'up') { rect(p, 15, 25 + bob, 2, 10 - bob, ink); rect(p, 10, 30, 3, 3, m.dark); rect(p, 19, 30, 3, 3, m.dark); }
  if (who === 1) rect(p, 12, 23 + bob, 8, 3, m.coat);
  if (who === 2 && direction !== 'up') { rect(p, 15, 25 + bob, 1, 9 - bob, m.dark); rect(p, 11, 25 + bob, 3, 2, paper); }
  blit(p, edged[5]);
  if (who === 0) rect(p, 26, 36 + bob, 1, 2, paper);
  if (who === 2) rect(p, 27, 30 + bob, 2, 1, m.dark);
  f.image = p;
}
frames.flat().forEach(finish);
const slotOrder = ['base', 'bottom', 'top', 'face', 'hair', 'accessory'];
function current(id) {
  const config = roster[id];
  if (!config) throw Error(`Missing avatar ${id}`);
  const parts = [{ slot: 'base', ...config.base }, ...config.layers].sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));
  const cells = Array.from({ length: 3 }, () => blank(16, 32));
  for (const { slot, part } of parts) {
    const atlas = PNG.sync.read(readFileSync(resolve(root, `webview-ui/public/assets/avatar-parts/${slot}/${part}/${part}.png`)));
    if (atlas.width !== 176 || atlas.height !== 96) throw Error(`Unexpected atlas ${part}`);
    cells.forEach((cell, d) => { const crop = blank(16, 32); PNG.bitblt(atlas, crop, 16, [0, 2, 1][d] * 32, 16, 32, 0, 0); blit(cell, crop); });
  }
  return cells;
}
const rowH = CELL_H * 4 + 2, widths = [3 * 17 + 1, 3 * 65 + 1, 7 * 33 + 1, 7 * 129 + 1];
const sheet = blank(4 + widths.reduce((a, b) => a + b, 0), rowH * 3);
members.forEach((m, row) => {
  const old = current(m.id), blocks = [old, old, frames[row].map(f => f.image), frames[row].map(f => f.image)];
  rect(sheet, 0, row * rowH, 4, rowH, m.coat); let x = 4;
  blocks.forEach((cells, block) => {
    const scale = block % 2 ? 4 : 1, bg = block < 2 ? '#e8e8e8' : '#ffffff';
    rect(sheet, x, row * rowH, widths[block], rowH, '#b6b6b6');
    cells.forEach(cell => { rect(sheet, x + 1, row * rowH + 1, cell.width * scale, rowH - 2, bg); blit(sheet, cell, x + 1, (row + 1) * rowH - 1 - cell.height * scale, scale); x += cell.width * scale + 1; }); x++;
  });
});
const all = frames.flat(), every = fn => all.filter(fn).length;
const clear = every(f => !mask(f.image).slice(0, CELL_W * HEAD_TOP).some(Boolean));
const body = every(f => f.layers.slice(0, 3).every(p => mask(p).every((v, i) => !v || (i % CELL_W >= BODY_LEFT && i % CELL_W < BODY_LEFT + BODY_W))));
const tops = all.map(f => Math.floor(mask(f.image).findIndex(Boolean) / CELL_W));
const eyes = all.map(f => {
  if (f.direction === 'up') return f.eyeY;
  const rows = mask(f.eyeMask).flatMap((v, i) => v ? [Math.floor(i / CELL_W)] : []);
  return rows.length ? (Math.min(...rows) + Math.max(...rows)) / 2 : NaN;
});
const colors = frames.map(group => { const set = new Set(); group.forEach(f => { for (let i = 0; i < f.image.data.length; i += 4) if (f.image.data[i + 3]) set.add(f.image.data.subarray(i, i + 4).toString('hex')); }); return set.size; });
function normalized(f, slot) { return mask(f.layers[slot]).slice(f.bob * CELL_W).concat(Array(f.bob * CELL_W).fill(0)).join(''); }
const rigid = frames.every(group => group.every(f => [4, 5].every(slot => normalized(f, slot) === normalized(group[0], slot))));
let failed = false;
function check(label, pass, value) { console.log(`${label}: ${pass ? 'PASS' : 'FAIL'} ${value}`); failed ||= !pass; }
check('check top-transparent', clear === 21, `${clear}/21`);
check('check body-bounds', body === 21, `${body}/21 x=${BODY_LEFT}..${BODY_LEFT + BODY_W - 1}`);
check('check head-top', tops.every((y, i) => y === HEAD_TOP + all[i].bob), tops.join(','));
check('check eye-row', eyes.every(y => Math.abs(y - EYE_Y) <= 1), `${eyes.join(',')} (rear=hidden anchor)`);
check('check palette', colors.every(n => n <= 16), colors.join(','));
check('check silhouette', distances.every(n => n >= 80), distances.join(','));
check('check rigid-parts', rigid, `hair/accessory normalized across 7 frames: ${rigid}`);
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, PNG.sync.write(sheet));
process.exitCode = failed ? 1 : 0;
