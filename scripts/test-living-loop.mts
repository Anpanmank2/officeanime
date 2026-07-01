// ── Living-loop unit test (persona reactions + secretary/dept routing) ──
// Deterministic checks for the office "living company loop" rethink:
//   §2 persona reactions differ by affinity tier & are persona-fit (not generic)
//   §1 routing to secretary/department auto-selects the best-◎ member
//   §3 completion line is a clear, persona-flavored done reaction
// Run: npx tsx scripts/test-living-loop.mts

const { completionLine, hasExplicitVoice, reactionLine, thoughtLine } = await import(
  '../src/jc/persona-lines.js'
);
const { previewFit } = await import('../webview-ui/src/jc/affinity-preview.js');

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ' (' + detail + ')' : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' (' + detail + ')' : ''}`);
  }
}

console.log('§2 persona reactions (◎ enthusiastic vs ✗ reluctant, persona-fit)');
{
  // eng-01 田中 has an explicit hand-authored voice (not archetype).
  ok('eng-01 has explicit voice', hasExplicitVoice('eng-01'));
  const great = reactionLine('eng-01', 'engineering', 'great', 0);
  const bad = reactionLine('eng-01', 'engineering', 'bad', 0);
  ok('◎ reaction non-empty', great.length > 0, great);
  ok('✗ reaction non-empty', bad.length > 0, bad);
  ok('◎ ≠ ✗ reaction (tier-differentiated)', great !== bad, `${great} / ${bad}`);
  // ✗ line reads reluctant ("専門外/畑違い/…"); ◎ line reads eager.
  ok('✗ reads reluctant', /専門外|畑違い|外れ|別/.test(bad), bad);
  // Deterministic: same inputs → same line.
  ok(
    'deterministic reaction',
    reactionLine('eng-01', 'engineering', 'great', 0) === great,
  );
}

console.log('§2 thoughts + §3 completion are persona-flavored & rotate');
{
  const t0 = thoughtLine('res-01', 'research', 0);
  const t1 = thoughtLine('res-01', 'research', 1);
  ok('thought non-empty', t0.length > 0, t0);
  ok('thoughts rotate across ticks', t0 !== t1, `${t0} / ${t1}`);
  const doneGreat = completionLine('res-01', 'research', 'great', 0);
  const doneBad = completionLine('res-01', 'research', 'bad', 0);
  ok('completion ◎ ≠ ✗', doneGreat !== doneBad, `${doneGreat} / ${doneBad}`);
}

console.log('§2 archetype fallback for members without an explicit voice');
{
  // mkt-09 has no explicit voice → falls back to marketing archetype (not generic exec).
  ok('mkt-09 uses archetype', !hasExplicitVoice('mkt-09'));
  const mk = reactionLine('mkt-09', 'marketing', 'great', 0);
  const rs = reactionLine('res-05', 'research', 'great', 0);
  ok('archetype reaction non-empty', mk.length > 0 && rs.length > 0, `${mk} / ${rs}`);
  // Marketing vs research archetypes are distinct (persona-fit, not one generic line).
  ok('dept archetypes differ', mk !== rs, `${mk} / ${rs}`);
}

// ── §1 routing: secretary/dept auto-selects best-◎ member (headless) ──
// Mirror pickBestMember over a fixed member roster using previewFit (the same
// department FIT the backend uses). Verifies the routing intent deterministically.
const ROSTER = [
  { id: 'eng-01', dept: 'engineering' },
  { id: 'eng-02', dept: 'engineering' },
  { id: 'mkt-01', dept: 'marketing' },
  { id: 'mkt-09', dept: 'marketing' },
  { id: 'res-01', dept: 'research' },
  { id: 'res-06', dept: 'research' },
];
function pickBest(task: string, scope: string) {
  const ids = ROSTER.filter((m) => scope === 'secretary' || m.dept === scope).map((m) => m.id);
  let best: { id: string; fit: number; tier: string } | null = null;
  for (const id of [...ids].sort()) {
    const { fit, tier } = previewFit(task, id);
    if (!best || fit > best.fit) best = { id, fit, tier };
  }
  return best!;
}

console.log('§1 routing auto-selection (secretary = whole company / dept = within)');
{
  const impl = pickBest('新機能を実装する implement コード', 'secretary');
  ok('impl task → engineering member (◎)', impl.id.startsWith('eng-') && impl.tier === 'great', `${impl.id}/${impl.tier}`);

  const research = pickBest('市場の調査 research を分析する', 'secretary');
  ok('research task → research member (◎)', research.id.startsWith('res-') && research.tier === 'great', `${research.id}/${research.tier}`);

  const review = pickBest('データの監査 audit レビュー確認', 'secretary');
  ok('review/audit task → research member (◎)', review.id.startsWith('res-') && review.tier === 'great', `${review.id}/${review.tier}`);

  // Department-scoped routing to Engineering on a research task = best-available
  // WITHIN engineering (there is no ◎, but it still picks the top fit deterministically).
  const engScoped = pickBest('市場の調査 research を分析する', 'engineering');
  ok('dept-scoped stays within scope', engScoped.id.startsWith('eng-'), engScoped.id);
}

console.log(`\n=== Living-loop: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
