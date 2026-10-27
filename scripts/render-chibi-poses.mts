import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChibiFrames } from '../webview-ui/src/office/sprites/chibi/chibiFrames.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--out', '--scale'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Usage: --out path --scale positive-integer');
  options[args[i]] = args[i + 1];
}
const S = Number(options['--scale'] ?? 3);
if (!Number.isSafeInteger(S) || S < 1) throw Error('scale must be a positive integer');
const OUT = resolve(ROOT, options['--out'] ?? 'artifacts/persona-characters/r6-poses-13members.png');
const read = name => JSON.parse(readFileSync(resolve(ROOT, `webview-ui/src/office/sprites/chibi/${name}.json`), 'utf8'));
const members = read('heads').members, poses = read('poses');
const directions = ['down', 'up', 'right'];
const groups = members.map(member => buildChibiFrames(member, poses));
const frames = groups.flatMap(group => directions.flatMap(d => group[d]));
const counts = groups.map(group => new Set(directions.flatMap(d => group[d].flat(2)).filter(Boolean)).size);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const r5 = [['down', 'stand'], ['right', 'stand'], ['up', 'stand'], ['down', 'walk1'], ['down', 'walkpass'], ['down', 'walk3'], ['down', 'walkpass']];
const r5Hash = hash(groups.map(group => r5.map(([d, c]) => group[d][poses.columns.indexOf(c)])));
const allHash = hash(groups.map(group => directions.map(d => group[d])));
let failed = false;
function report(name, pass, value) {
  console.log(`check ${name}: ${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(value)}`);
  failed ||= !pass;
}
report('frames', members.length === 13 && groups.every(group => directions.every(d => group[d].length === 12)) && frames.every(frame => frame.length === 48 && frame.every(row => row.length === 32)), { members: members.length, frames: frames.length, dimensions: [...new Set(frames.map(f => `${f[0]?.length}x${f.length}`))] });
const topClear = frames.filter(frame => frame.slice(0, 8).flat().every(pixel => pixel === '')).length;
report('top-clear', topClear === frames.length, topClear);
const nonEmpty = frames.filter(frame => frame.flat().some(pixel => pixel !== '')).length;
report('non-empty', nonEmpty === frames.length, nonEmpty);
report('palette', counts.every(count => count <= 20), counts);
report('r5-parity', r5Hash === 'd30e7fd551d1d5c5c805f85a925d78a09e1b488094054a213cc88f2cfef3fbde', r5Hash);
report('all-frames', allHash === 'b45295ab82b234eea91c9d3d19701c94f6ecce7e9a8834877698a657dfbe6115', allHash);

const sheet = new PNG({ width: 8 + 12 * 32 * S, height: members.length * 3 * 48 * S });
for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([232, 235, 240, 255], i);
const rgb = color => color.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
members.forEach((member, k) => {
  const band = [...rgb(member.band), 255];
  for (let y = k * 3 * 48 * S; y < (k + 1) * 3 * 48 * S; y++) {
    for (let x = 0; x < 4; x++) sheet.data.set(band, (y * sheet.width + x) * 4);
  }
  directions.forEach((direction, i) => groups[k][direction].forEach((frame, c) => {
    frame.forEach((row, y) => row.forEach((color, x) => {
      if (color === '') return;
      const pixel = [...rgb(color), 255];
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const sx = 8 + c * 32 * S + x * S + dx, sy = (k * 3 + i) * 48 * S + y * S + dy;
        sheet.data.set(pixel, (sy * sheet.width + sx) * 4);
      }
    }));
  }));
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, PNG.sync.write(sheet));
process.exitCode = failed ? 1 : 0;
console.log(`Wrote ${OUT}`);
