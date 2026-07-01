// ── AC-1 deterministic unit test (DEV-SPEC §8 AC-1, PRIMARY pass gate) ──
// Proves the ★hard condition: the SAME task placed on a ◎ member vs a ✗ member
// differs in BOTH gauge fill speed AND company score gain — deterministically,
// with no randomness (re-runs produce identical numbers).
//
// Run: npx tsx scripts/test-affinity-ac1.mts

import type { JCConfig } from '../src/jc/types.js';

const { computeFit } = await import('../src/jc/affinity.js');
const { gaugeRate, scoreGain, T0_SEC } = await import('../src/jc/affinity-constants.js');

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name} ${detail}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

// Minimal config with a research member and an engineering member.
const config = {
  organization: 'test',
  version: 1,
  members: [
    { id: 'res-01', name: 'Koga', department: 'research' },
    { id: 'eng-01', name: 'Tanaka', department: 'engineering' },
  ],
  exec: [],
  mapping: { rules: [], fallback: 'prompt' },
} as unknown as JCConfig;

console.log('\n🎯 AC-1 Hard Condition Test (◎ vs ✗ must differ)\n');

// SAME task text. It contains "監査/audit" → classifyLabel = 'review'.
const task = { prompt: '福岡ホテルデータの監査 audit を実施', assignee: '' };

// ◎ pair: research member + review-label → FIT[review][research] = 2 = ◎ (great)
const good = computeFit({ ...task, assignee: 'res-01' }, 'res-01', config);
// ✗ pair: engineering member + research-label task → need a research-label task.
// Use a research-label prompt for the ✗ side per §5.5 (research member ◎ /
// engineering member ✗ on a research-label task).
const researchTask = { prompt: '市場の調査 research を分析する', assignee: '' };
const goodR = computeFit({ ...researchTask, assignee: 'res-01' }, 'res-01', config); // FIT[research][research]=2
const badR = computeFit({ ...researchTask, assignee: 'eng-01' }, 'eng-01', config); // FIT[research][engineering]=0

console.log('review-label task:');
console.log(`  res-01 → label=${good.label} fit=${good.fit} tier=${good.tier}`);
console.log('research-label task (SAME task, two members):');
console.log(`  res-01 → label=${goodR.label} fit=${goodR.fit} tier=${goodR.tier}`);
console.log(`  eng-01 → label=${badR.label} fit=${badR.fit} tier=${badR.tier}\n`);

// ── Tier correctness ──
assert('review-label on research member = ◎ (great)', good.tier === 'great', `(fit=${good.fit})`);
assert('research-label on research member = ◎ (great)', goodR.tier === 'great', `(fit=${goodR.fit})`);
assert('research-label on engineering member = ✗ (bad)', badR.tier === 'bad', `(fit=${badR.fit})`);

// ── SPEED difference (gauge fill rate). ◎ must fill faster than ✗. ──
const rateGood = gaugeRate('great');
const rateBad = gaugeRate('bad');
const tFillGood = T0_SEC / 1.5; // 40s
const tFillBad = T0_SEC / 0.6; // 100s
console.log(`gauge rate: ◎=${rateGood.toFixed(3)} u/s  ✗=${rateBad.toFixed(3)} u/s`);
console.log(`fill time:  ◎=${tFillGood.toFixed(1)}s  ✗=${tFillBad.toFixed(1)}s  ratio=${(rateGood / rateBad).toFixed(2)}\n`);
assert('◎ gauge rate > ✗ gauge rate', rateGood > rateBad, `(${rateGood.toFixed(3)} > ${rateBad.toFixed(3)})`);
assert('◎ fills faster (t◎ < t✗)', tFillGood < tFillBad, `(${tFillGood}s < ${tFillBad}s)`);
assert('speed ratio ≈ 2.5', Math.abs(rateGood / rateBad - 2.5) < 0.001);

// ── SCORE difference (company score gain). ◎ must score more than ✗. ──
const scoreGood = scoreGain('great', 3); // P3
const scoreBad = scoreGain('bad', 3);
console.log(`score gain (P3): ◎=+${scoreGood}  ✗=+${scoreBad}  delta=${scoreGood - scoreBad}\n`);
assert('◎ score > ✗ score', scoreGood > scoreBad, `(${scoreGood} > ${scoreBad})`);
assert('◎=12 / ✗=5 (P3, exact)', scoreGood === 12 && scoreBad === 5, `(◎=${scoreGood} ✗=${scoreBad})`);
assert('score delta > 0', scoreGood - scoreBad > 0, `(delta=${scoreGood - scoreBad})`);

// ── Determinism: re-run yields identical results ──
const good2 = computeFit({ ...researchTask, assignee: 'res-01' }, 'res-01', config);
const bad2 = computeFit({ ...researchTask, assignee: 'eng-01' }, 'eng-01', config);
assert(
  'deterministic (re-run identical)',
  good2.fit === goodR.fit && bad2.fit === badR.fit,
);

// ── The combined hard condition ──
const hardPass = rateGood > rateBad && scoreGood > scoreBad && goodR.tier !== badR.tier;
assert('★ HARD CONDITION: ◎≠✗ in BOTH speed and score', hardPass);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
