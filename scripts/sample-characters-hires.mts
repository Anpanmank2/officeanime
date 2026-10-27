import { PNG } from 'pngjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--cell-h', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Usage: --cell-h 44|48 --out path');
  options[args[i]] = args[i + 1];
}
const CELL_W = 32, CELL_H = Number(options['--cell-h'] ?? 48), ART_H = CELL_H - 8;
const BODY_LEFT = 4, BODY_W = 24, HEAD_TOP = 8, HEAD_H = 19, EYE_Y = 18;
if (![44, 48].includes(CELL_H)) throw Error('cell-h must be 44 or 48');
const OUT = resolve(ROOT, options['--out'] ?? 'artifacts/persona-characters/r5-sample-13members.png');
const SLOT_ORDER = ['base', 'bottom', 'top', 'face', 'hair', 'accessory'];
const members = JSON.parse(readFileSync(resolve(ROOT,'webview-ui/src/office/sprites/chibi/heads.json'),'utf8')).members;
const ink = '#2e2324', skin = '#fcd8a4', skinShadow = '#e9b585', blush = '#f4a0a0', mouth = '#e8505a';
const eyeBrown = '#6b5040', eyeDark = '#2a2430', glass = '#e4edf2';
const white = '#e3eaf0', pants = '#586174', pantsShadow = '#3e4659';
const colors = person => ({ O:ink, L:person.hair[0], H:person.hair[1], h:person.hair[2], S:skin, s:skinShadow, P:blush, M:mouth, e:eyeBrown, E:eyeDark, G:ink, g:glass, K:person.acc?.[0], A:person.acc?.[1], a:person.acc?.[2], F:person.acc?.[1] });
const tags = { O:'face', L:'hair', H:'hair', h:'hair', S:'face', s:'face', P:'face', M:'face', e:'eye', E:'eye', G:'glasses', g:'glasses', K:'acc', A:'acc', a:'acc', F:'glasses' };
const rgb = c => c.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16));
const canvas = (w = CELL_W, h = CELL_H) => ({ width: w, height: h, pixels: Array(w * h).fill(null), tags: Array(w * h).fill('') });
function rect(c, x, y, w, h, color, tag = '') {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i < 0 || i >= c.width || j < 0 || j >= c.height) throw Error(`pixel outside canvas: ${i},${j}`);
    c.pixels[j * c.width + i] = color; c.tags[j * c.width + i] = tag;
  }
}
function draw(person, direction, step = -1) {
  const c = canvas(), bob = step === 1 || step === 3 ? 2 : 0, s = person.torso;
  const r = (x, y, w, h, color, tag) => rect(c, x, y, w, h, color, tag);
  const head = (x, y, w, h, color, tag = 'hair') => r(x, y + bob, w, h, color, tag);
  const legTop = CELL_H - 8, gait = step === 0 ? -1 : step === 2 ? 1 : 0;
  for (const [side, x, shift] of [['L', 9, gait], ['R', 18, -gait]]) {
    r(x + shift, legTop, 5, 8, ink, side); r(x + shift + 1, legTop, 3, 6, pants, side);
    r(x + shift + 3, legTop, 1, 6, pantsShadow, side); r(x + shift - 1, CELL_H - 2, 6, 2, ink, side);
  }
  r(7, 27, 18, legTop - 27, ink, 'top'); r(8, 28, 16, legTop - 29, person.top[0], 'top');
  r(8, 29, 3, legTop - 30, person.top[1], 'top'); r(12, 28, 10, 2, person.top[2], 'top');
  r(5, 30, 3, 7, ink, 'body'); r(6, 31, 2, 5, skin, 'body');
  r(24, 30, 3, 7, ink, 'body'); r(24, 31, 2, 5, skinShadow, 'body');
  if (s === 0) { r(14, 28, 3, legTop - 29, skinShadow, 'top'); r(9, 33, 4, 2, person.top[2], 'top'); }
  if (s === 1) r(12, 26 + bob, 8, 3, person.top[1], 'top');
  if (s === 2) { r(12, 28, 3, 3, white, 'top'); r(18, 28, 3, 3, white, 'top'); r(16, 31, 1, 6, ink, 'top'); }
  if (direction === 'up') r(12, 30, 10, 2, person.top[1], 'top');
  if (direction === 'right') r(20, 30, 3, 7, person.top[1], 'top');
  const eyes = canvas(), palette = colors(person), template = person.front;
  const side = direction === 'right' && person.right;
  const grid = (side || template).map((row,dy) => [...row].map((symbol,dx) => ({ symbol,
    tag: side && tags[symbol] === 'hair' && tags[template[dy][dx]] !== 'hair' ? 'profile' : tags[symbol] })));
  (side || template).forEach((row,dy) => [...row].forEach((symbol,dx) => {
    if (tags[symbol] === 'eye') rect(eyes,6+dx,HEAD_TOP+dy+bob,1,1,palette[symbol],'eye');
  }));
  const paint = (x,y,symbol,tag) => { grid[y-HEAD_TOP][x-6] = {symbol,tag}; };
  if (direction === 'right' && !side) {
    for (let y=13;y<=22;y++) for (let x=8;x<=14;x++) {
      if ('SsPeEGgF'.includes(template[y-HEAD_TOP][x-6])) paint(x,y,'H','profile');
    }
    for (const x of [15,16]) paint(x,23,'S','profile');
    for (const x of [18,19]) paint(x,23,'M','profile');
  }
  if (direction === 'up') template.forEach((row,dy) => [...row].forEach((symbol,dx) => {
    const x = 6+dx, y = HEAD_TOP+dy;
    if ('SsPMeEGgF'.includes(symbol) && !(person.back === 'bald-top' && y<=12)) {
      const fill = person.back === 'nape-short' && y>=21 ? (x>=12 && x<=19 ? 's' : 'h') : y>=23 ? 'h' : 'H';
      paint(x,y,fill,'back');
    }
    if (person.back === 'long-hair' && y>=24 && x>=9 && x<=22 && symbol==='O') paint(x,y,'h','back');
  }));
  if (direction === 'up' && person.back === 'mirror') grid.forEach(row => row.reverse());
  grid.forEach((row,dy) => row.forEach(({symbol,tag},dx) => {
    if (symbol !== '.') head(6+dx,HEAD_TOP+dy,1,1,palette[symbol],tag);
  }));
  if (person.prop === 'toolbox') { head(24,32,5,2,ink,'prop'); head(22,34,9,7,ink,'prop'); head(23,35,7,5,person.top[1],'prop'); head(25,36,3,1,person.top[2],'prop'); }
  if (person.prop === 'papers') { head(1,29,7,11,ink,'prop'); head(2,30,5,9,white,'prop'); head(3,32,3,1,pants,'prop'); head(3,35,3,1,pants,'prop'); }
  return { ...c, bob, eyes, direction, step };
}
const groups = members.map(p => ['down','right','up',0,1,2,3].map(d => typeof d === 'number' ? draw(p,'down',d) : draw(p,d)));
const frames = groups.flat(), indices = c => c.pixels.flatMap((p,i) => p ? [i] : []);
const mask = (c,tag,mirror = false) => c.tags.flatMap((t,i) => t === tag ? [`${mirror && tag!=='prop' ? CELL_W-1-i%CELL_W : i%CELL_W},${Math.floor(i/CELL_W)-c.bob}`] : []).sort().join(';');
const all = f => frames.every(f), counts = groups.map(g => new Set(g.flatMap(c => c.pixels.filter(Boolean))).size);
const distances = [];
const category = symbol => ['.','O','LHh','SsPMeE','AaKFGg'].findIndex(group => group.includes(symbol));
for (let a=0;a<members.length;a++) for (let b=a+1;b<members.length;b++) {
  const other = [...members[b].front.join('')];
  distances.push({pair:[members[a].id,members[b].id],distance:[...members[a].front.join('')].filter((symbol,i) => category(symbol)!==category(other[i])).length});
}
const minimum = distances.reduce((a,b) => a.distance<=b.distance ? a : b);
const headHeights = frames.map(c => {
  const rows = c.tags.flatMap((t,i) => ['hair','face','eye','glasses','acc','back','profile'].includes(t) ? [Math.floor(i/CELL_W)] : []);
  return Math.max(...rows)-Math.min(...rows)+1;
});
let failed = false;
function report(label, pass, value) { console.log(`${label}: ${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(value)}`); failed ||= !pass; }
report('check top-clear', all(c => c.pixels.slice(0,8*CELL_W).every(p => !p)), {frames:frames.length});
report('check body-bounds', all(c => c.tags.every((t,i) => !['top','body','L','R'].includes(t) || (i%CELL_W>=BODY_LEFT && i%CELL_W<BODY_LEFT+BODY_W))), {left:BODY_LEFT,width:BODY_W});
report('check head-top', all(c => Math.floor(indices(c)[0]/CELL_W)===HEAD_TOP+c.bob), frames.map(c => Math.floor(indices(c)[0]/CELL_W)));
report('check eye-row', all(c => Math.abs(Math.floor(indices(c.eyes)[0]/CELL_W)-c.bob-EYE_Y)<=1), {anchor:EYE_Y,space:'unbobbed eye layer; back/profile occluded'});
report('check palette', counts.every(n => n<=20), counts);
report('check silhouettes', distances.every(p => p.distance>=60), {pairs:distances.length,minimum});
report('check stable-shapes', groups.every((g,k) => g.every(c => (members[k].right && c.direction==='right' && c.step===-1) || ['hair','prop','acc'].every(t => mask(c,t)===mask(g[0],t,members[k].back==='mirror' && c.direction==='up')))), {poses:7,excluded:members.filter(p => p.right).map(p => `${p.id} right`)});
report('check head-ratio', headHeights.every(h => h===HEAD_H && h/ART_H>=0.45), {heights:headHeights,art:ART_H,ratioMin:Math.min(...headHeights)/ART_H});
report('check eye-no-white', all(c => [c,c.eyes].every(layer => layer.tags.every((t,i) => t!=='eye' || [eyeBrown,eyeDark].includes(layer.pixels[i])))), {colors:[eyeBrown,eyeDark],space:'visible and construction eye layers'});
report('check legs-both', groups.every(g => g.slice(3).every(c => ['L','R'].every(t => c.tags.some((v,i) => v===t && c.pixels[i]===pants)))), {walkFrames:members.length*4,legHeight:8,shoeHeight:2});
const hairTones = groups.map((g,k) => g.slice(0,3).map(c => members[k].hair.filter(color => c.pixels.some((p,i) => p===color && ['hair','back','profile'].includes(c.tags[i])))));
report('check hair-tones', hairTones.every((views,k) => views.every((tones,d) => (d===2 ? [1,2] : [0,1,2]).every(i => tones.includes(members[k].hair[i])))), {tones:hairTones});
const templateMismatches = groups.map((g,k) => members[k].front.reduce((n,row,dy) => n+[...row].filter((symbol,dx) => g[0].pixels[(HEAD_TOP+dy)*CELL_W+6+dx] !== (colors(members[k])[symbol] ?? null)).length,0));
report('check front-template', templateMismatches.every(n => n===0), {mismatches:templateMismatches,pixelsPerMember:HEAD_H*20});
const sideMismatches = members.flatMap((p,k) => p.right ? [{id:p.id,mismatches:p.right.reduce((n,row,dy) => n+[...row].filter((symbol,dx) => groups[k][1].pixels[(HEAD_TOP+dy)*CELL_W+6+dx] !== (colors(p)[symbol] ?? null)).length,0)}] : []);
report('check side-template', sideMismatches.every(p => p.mismatches===0), {members:sideMismatches,pixelsPerMember:HEAD_H*20});
const avatars = JSON.parse(readFileSync(resolve(ROOT,'webview-ui/public/assets/default-avatars.json'),'utf8'));
if (avatars.avatarRevision!==3) throw Error('Expected avatarRevision 3');
function legacy(id) {
  const a = avatars.avatars[id], out = new PNG({width:16,height:32}); out.data.fill(0);
  if (!a) throw Error(`Missing avatar ${id}`);
  const layers = [{slot:'base',part:a.base.part},...a.layers].sort((a,b) => SLOT_ORDER.indexOf(a.slot)-SLOT_ORDER.indexOf(b.slot));
  for (const layer of layers) {
    const src = PNG.sync.read(readFileSync(resolve(ROOT,`webview-ui/public/assets/avatar-parts/${layer.slot}/${layer.part}/${layer.part}.png`)));
    if (src.width!==176 || src.height!==96) throw Error(`Unexpected atlas ${layer.part}`);
    for (let y=0;y<32;y++) for (let x=0;x<16;x++) {
      const si=(y*176+16+x)*4, di=(y*16+x)*4, sa=src.data[si+3]/255, da=out.data[di+3]/255, alpha=sa+da*(1-sa);
      for (let k=0;k<3;k++) out.data[di+k]=alpha ? Math.round((src.data[si+k]*sa+out.data[di+k]*da*(1-sa))/alpha) : 0;
      out.data[di+3]=Math.round(alpha*255);
    }
  }
  return out;
}
function raster(c) {
  const png = new PNG({width:c.width,height:c.height}); png.data.fill(0);
  c.pixels.forEach((p,i) => { if (p) png.data.set([...rgb(p),255],i*4); }); return png;
}
const widths=[16,64,7*CELL_W,7*CELL_W*4], gap=8, rowH=CELL_H*4+16;
const sheet = new PNG({width:8+widths.reduce((a,b)=>a+b+gap,0),height:rowH*members.length});
for (let i=0;i<sheet.data.length;i+=4) sheet.data.set([232,235,240,255],i);
function blit(src,x,y,scale) {
  for (let sy=0;sy<src.height;sy++) for (let sx=0;sx<src.width;sx++) for (let dy=0;dy<scale;dy++) for (let dx=0;dx<scale;dx++) {
    const si=(sy*src.width+sx)*4, di=((y+sy*scale+dy)*sheet.width+x+sx*scale+dx)*4, a=src.data[si+3]/255;
    for (let k=0;k<3;k++) sheet.data[di+k]=Math.round(src.data[si+k]*a+sheet.data[di+k]*(1-a));
  }
}
members.forEach((p,row) => {
  const y=row*rowH, old=legacy(p.id); let x=8;
  for (let yy=y;yy<y+rowH;yy++) for (let xx=0;xx<4;xx++) sheet.data.set([...rgb(p.band),255],(yy*sheet.width+xx)*4);
  [1,4].forEach(scale => { blit(old,x,y+rowH-8-32*scale,scale); x+=16*scale+gap; });
  [1,4].forEach(scale => { groups[row].forEach((c,i) => blit(raster(c),x+i*CELL_W*scale,y+rowH-8-CELL_H*scale,scale)); x+=7*CELL_W*scale+gap; });
  let boundary=7;
  for (const w of widths) { for (let yy=y;yy<y+rowH;yy++) sheet.data.set([163,173,188,255],(yy*sheet.width+boundary)*4); boundary+=w+gap; }
  for (let xx=4;xx<sheet.width;xx++) sheet.data.set([163,173,188,255],((y+rowH-1)*sheet.width+xx)*4);
});
mkdirSync(dirname(OUT),{recursive:true}); writeFileSync(OUT,PNG.sync.write(sheet));
console.log(`Wrote ${OUT}; legacy colors are unshifted.`);
process.exitCode = failed ? 1 : 0;
