// ── Persona-flavored speech lines (living-loop DEV rethink §2) ──────────
// Kairosoft-style "らしさ": when a task lands on a member, the member REACTS
// in their own voice, weighted by affinity (◎ enthusiastic / △ neutral / ✗
// reluctant). While working they surface persona-flavored THOUGHTS. On finish
// they give a clear DONE reaction + a one-line result flavor.
//
// Source of the voices: real personas (口調 / 口癖) for the visible / resident
// members, distilled into this public configuration.
// `.company/secretary/profiles/`. Members without an explicit voice fall back to
// a department × tier ARCHETYPE (DEV rethink allows this — persona-fit, not
// generic). Nothing here is randomised across processes: given (member, tier,
// tick) the line is deterministic, so screenshots / replays are reproducible.

import type { AffinityTier } from './affinity-constants.js';

/** The three reaction kinds a persona speaks. */
export type LineKind = 'react' | 'think' | 'done';

interface PersonaVoice {
  /** Reaction the instant the task is assigned, by affinity tier. */
  react: Record<AffinityTier, string[]>;
  /** Rotating thoughts while working (persona flavor, tier-agnostic pool). */
  think: string[];
  /** Clear completion reaction + result flavor, by tier. */
  done: Record<AffinityTier, string[]>;
}

// ── Per-member voices (real personas — visible / resident members) ─────
// Kept short: pixel speech bubbles truncate ~24 chars, so lines are punchy.
const VOICES: Record<string, PersonaVoice> = {
  // exec-sec 宮本 — 段取りを整える進行役
  'exec-sec': {
    react: {
      great: ['承知しました、最適な担当へ', 'いいですね、すぐ回します'],
      ok: ['承知しました、手配します', '担当を立てますね'],
      bad: ['ちょっと畑違いですが…手配します', 'この人選、確認しますね'],
    },
    think: ['押さえました', '進捗を見ていますね', '滞りはないかな…', 'いい流れですね'],
    done: {
      great: ['完璧に回りました！', '狙い通りですね'],
      ok: ['無事完了ですね', 'まとまりました'],
      bad: ['ひとまず完了です', '次はもっと適材で'],
    },
  },
  // eng-01 伊藤 — 動く形にする進行役
  'eng-01': {
    react: {
      great: ['任せてください、設計します', '得意な領域です'],
      ok: ['やりましょう、整理します', 'トレードオフを見ます'],
      bad: ['専門外ですが…筋は通します', '誰の何を解決するか、から'],
    },
    think: ['書きました', 'トレードオフを整理中…', 'この規模で必要か…', '型境界を切るか'],
    done: {
      great: ['きれいに設計できた！', '筋の通った実装です'],
      ok: ['実装できました', '通しました'],
      bad: ['なんとか形にした…', '専門外だが動きます'],
    },
  },
  // eng-02 佐藤 涼 — 寡黙で実直、資産保護
  'eng-02': {
    react: {
      great: ['やります。冪等にします', '資産は守ります'],
      ok: ['対応します', '事実で詰めます'],
      bad: ['領域外ですが…堅くやる', '障害時の影響を先に見ます'],
    },
    think: ['冪等にできるか…', 'ユーザーにどう見えるか', 'エッジケースを潰す'],
    done: {
      great: ['堅牢に仕上げた', '守り切りました'],
      ok: ['完了しました', '通りました'],
      bad: ['ひとまず動きます', '次は専門で受けたい'],
    },
  },
  // eng-03 中村 陽菜 — 明るくフラット、UX
  'eng-03': {
    react: {
      great: ['やります！迷わせません', 'フロントは任せて'],
      ok: ['やってみますね', 'まず触らせましょう'],
      bad: ['ちょっと畑違い…でもやる', 'ユーザー視点で寄せます'],
    },
    think: ['ここ、迷いますよね…', '初見の人はどう見る？', 'まず触らせたい'],
    done: {
      great: ['触って気持ちいい！', '迷わない画面に'],
      ok: ['できました〜', '形になりました'],
      bad: ['一応できました', '専門の人に見てほしい'],
    },
  },
  // eng-04 カイゼン・アキオ — 現場を丁寧に見て回るチェック役
  'eng-04': {
    react: {
      great: ['この人選、活きますよ', '検証まで見ます'],
      ok: ['なぜ今かを確認します', '数字で追いますね'],
      bad: ['適材か少し引っかかる…', 'まず誰のためか、を'],
    },
    think: ['現場で確認します', 'ユーザーに説明できる？', 'なぜ今これなのか', '数字で見せられるか'],
    done: {
      great: ['検証まで通りました！', '狙い通りの結果です'],
      ok: ['完了、確認しました', '通しました'],
      bad: ['完了だが再点検を', '人選は次で調整'],
    },
  },
  // eng-05 藤井 蓮 — 穏やかだが芯が強い、世界観
  'eng-05': {
    react: {
      great: ['世界観ごと作ります', 'これは嬉しい仕事'],
      ok: ['やってみます', '参考を集めます'],
      bad: ['専門から少し外れる…', 'ユーザーの嬉しさから'],
    },
    think: ['触って嬉しいか…', '世界観から逸れてない？', '参考を集めよう'],
    done: {
      great: ['世界が立ち上がった！', '触れて嬉しい仕上がり'],
      ok: ['できました', '整えました'],
      bad: ['形にはしました', '本領は別領域で'],
    },
  },
  // eng-06 黒田 翔太 — 情熱的だが論理的、プレイヤー体験
  'eng-06': {
    react: {
      great: ['面白くします！', 'プレイヤー体験、任せて'],
      ok: ['やってみましょう', 'まず遊んで考えます'],
      bad: ['畑違いだけど…やる', '誰がなぜ嬉しいか、から'],
    },
    think: ['何周目で飽きる？', 'プレイヤーは嬉しい？', 'ループを回して確認'],
    done: {
      great: ['面白いループになった！', 'また触りたくなる出来'],
      ok: ['完成しました', 'まとめました'],
      bad: ['一応できた', '得意領域で活きたい'],
    },
  },
  // codex-01 るあ（お茶汲み） — 気配りが得意なお茶汲み担当
  'codex-01': {
    react: {
      great: ['実装を開始します', '仕様を確認して着手します'],
      ok: ['手順を整理します', 'テストから進めます'],
      bad: ['前提を確認します', '差分を小さく進めます'],
    },
    think: ['さすがですね', 'SPEC を読解中…', 'テストを先に書く', '差分を確認'],
    done: {
      great: ['実装と検証が完了しました', '差分を確認しました'],
      ok: ['実装を完了しました', '検証結果を整理しました'],
      bad: ['結果を記録しました', '確認が必要です'],
    },
  },
  // mkt-01 スティーブ・ジョブ — 一言で言い切る旗振り役
  'mkt-01': {
    react: {
      great: ['方向性は明確です、やります', '効く施策にします'],
      ok: ['進めます', '要点を絞ります'],
      bad: ['ズレてる気もしますが…', '誰に何を、から詰めます'],
    },
    think: ['それは本当にいいものか', '顧客の行動が変わるか', 'P/Lに効くか…', '要点はどこか'],
    done: {
      great: ['刺さる形になりました', '狙い通りです'],
      ok: ['完了です', 'まとめました'],
      bad: ['ひとまず完了', '本来は別担当が適任'],
    },
  },
  // mkt-02 亀井 — 物事を整理するのが得意な人
  'mkt-02': {
    react: {
      great: ['仮説を崩せるか見ます'],
      ok: ['抜けを点検します'],
      bad: ['前提から確認します'],
    },
    think: ['まず型を作ろう', '反例はないか…', '前提を分解しよう', '検証順を整える'],
    done: {
      great: ['反証まで確認できました'],
      ok: ['論点を整理しました'],
      bad: ['懸念を残して共有します'],
    },
  },
  // mkt-03 ナイチン・ゲイル — 相手の気持ちを一番大事にする人
  'mkt-03': {
    react: {
      great: ['受け手の目線で見ます'],
      ok: ['相手の気持ちを追います'],
      bad: ['まず声を想像します'],
    },
    think: [
      '相手の気持ちから',
      '誰が置いていかれる？',
      'この言葉はどう響く？',
      '不安はどこにある？',
    ],
    done: {
      great: ['受け手の納得まで届きました'],
      ok: ['視点を補いました'],
      bad: ['気になる声を共有します'],
    },
  },
  // mkt-05 ソクラ・テツオ — 目的を問い直すのが得意な人
  'mkt-05': {
    react: {
      great: ['目的に照らして進めます'],
      ok: ['何のためか確認します'],
      bad: ['目的から戻りましょう'],
    },
    think: ['それは何のためだ', '目的に近づく？', '手段が先になってないか', '誰のためだったか'],
    done: {
      great: ['目的に沿う形です'],
      ok: ['狙いを整えました'],
      bad: ['目的とのズレを残します'],
    },
  },
  // mkt-04 レオ・ヴィンチ — 見た目の細部まで詰める職人
  'mkt-04': {
    react: {
      great: ['これは燃えるわね、やる', '良いクラフトにする'],
      ok: ['やってみましょう', '赤を入れる前提で'],
      bad: ['専門外だけど…形にする', 'なぜダメかから言語化'],
    },
    think: ['あと1ミリ詰めよう', 'この一行、伝わる？', 'もっと削れる…', '数字と図で詰める'],
    done: {
      great: ['最高のクラフトよ！', '誇れる出来'],
      ok: ['仕上げました', '通しました'],
      bad: ['ひとまず形に', '本気は得意領域で'],
    },
  },
  // res-01 倉内 — データを一言でまとめる進行役
  'res-01': {
    react: {
      great: ['得意領域です、精査します', '確度まで見ます'],
      ok: ['やりましょう', '仮説を先に書きます'],
      bad: ['専門から外れます…', 'まずP/Lのどこに効くか'],
    },
    think: ['数字で言うと', '仮説を先に…', '確度ラベルは？', 'データの向こうの人は'],
    done: {
      great: ['精緻に検証できました', '確度も高い結論です'],
      ok: ['まとめました', '完了です'],
      bad: ['一応まとめた', '本領は分析で'],
    },
  },
  // res-02 千の休 — 場の空気を読むのが早い人
  'res-02': {
    react: { great: ['流れを追います'], ok: ['話題を確認します'], bad: ['一次情報から見ます'] },
    think: ['今、この空気が全部', '今、何が動いてる？', '反応の温度は？'],
    done: { great: ['動きをつかみました'], ok: ['要点をまとめました'], bad: ['変化を共有します'] },
  },
  // res-06 島田 悠斗 — 寡黙で正確、データの職人
  'res-06': {
    react: {
      great: ['やります。統合します', '数字で示します'],
      ok: ['対応します', 'ソースを確認します'],
      bad: ['畑違いですが…正確に', 'まず不整合を見ます'],
    },
    think: ['ソースはどこか…', '軸は正しいか', '統合すると見える'],
    done: {
      great: ['きれいに統合できた', '整合の取れた結論'],
      ok: ['完了しました', 'まとめました'],
      bad: ['ひとまず完了', '本領は分析で'],
    },
  },
  // res-07 シバセン — 長い目で物事を見る記録役
  'res-07': {
    react: {
      great: ['市場の構造から読みます', '期待値で語ります'],
      ok: ['分析します', '前提を確認します'],
      bad: ['専門外ですが…筋は追う', 'まず収益構造を分解'],
    },
    think: ['後で意味がわかる', '収益構造を分解…', '期待値はどう動く', '規制の効きは'],
    done: {
      great: ['構造まで読み切った', '示唆の効く結論です'],
      ok: ['分析完了です', 'まとめました'],
      bad: ['ひとまず完了', '本領は業界分析で'],
    },
  },
  // res-09 はにゃ — 小さくてかわいいまとめ役
  'res-09': {
    react: { great: ['全体像にまとめます'], ok: ['論点を並べます'], bad: ['構造から見直します'] },
    think: ['まとめました！', 'つながりはどこ？', '順番を整えよう'],
    done: {
      great: ['一枚の筋にできました'],
      ok: ['構造化しました'],
      bad: ['論点を残して共有します'],
    },
  },
};

// ── Department × tier archetypes (fallback for members w/o an explicit voice) ─
// Persona-fit by department, not a single generic line (DEV rethink §2 rule).
const DEPT_ARCHETYPE: Record<string, PersonaVoice> = {
  engineering: {
    react: {
      great: ['得意領域です、やります', '任せてください'],
      ok: ['やりましょう', '整理してから着手します'],
      bad: ['専門外だけど…筋は通す', '誰の何を解決するか、から'],
    },
    think: ['エッジケースを潰す…', 'この規模で妥当か', '型境界を切るか'],
    done: {
      great: ['きれいに実装できた！', '筋の通った出来です'],
      ok: ['実装できました', '通しました'],
      bad: ['なんとか動きます', '本領は別領域で'],
    },
  },
  marketing: {
    react: {
      great: ['刺さる形にします、やります', '任せてください'],
      ok: ['進めます', '要点を絞ります'],
      bad: ['畑違いですが…形にする', '誰に何を、から詰めます'],
    },
    think: ['顧客は動くか…', 'この一言、伝わる？', '数字で見せられるか'],
    done: {
      great: ['刺さる出来になりました！', '狙い通りです'],
      ok: ['完了しました', 'まとめました'],
      bad: ['ひとまず形に', '本来は別担当が適任'],
    },
  },
  research: {
    react: {
      great: ['得意領域です、精査します', '確度まで見ます'],
      ok: ['調べます', '仮説を先に書きます'],
      bad: ['専門から外れます…', 'まずP/Lのどこに効くか'],
    },
    think: ['ソースはどこか…', '確度ラベルは？', '仮説を先に'],
    done: {
      great: ['精緻に検証できました！', '確度の高い結論です'],
      ok: ['まとめました', '完了です'],
      bad: ['一応まとめた', '本領は分析で'],
    },
  },
  exec: {
    react: {
      great: ['最適な担当へ回します', '承知しました'],
      ok: ['手配します', '担当を立てますね'],
      bad: ['畑違いですが…手配します', '人選を確認しますね'],
    },
    think: ['進捗を見ていますね', '滞りはないかな…', 'いい流れですね'],
    done: {
      great: ['完璧に回りました！', '狙い通りですね'],
      ok: ['無事完了です', 'まとまりました'],
      bad: ['ひとまず完了です', '次はもっと適材で'],
    },
  },
};

const GENERIC: PersonaVoice = DEPT_ARCHETYPE.exec;

function voiceFor(memberId: string, department: string): PersonaVoice {
  return VOICES[memberId] ?? DEPT_ARCHETYPE[department] ?? GENERIC;
}

/** Deterministic pick from a pool (no cross-process randomness). */
function pick(pool: string[], seed: number): string {
  if (pool.length === 0) return '';
  return pool[((seed % pool.length) + pool.length) % pool.length];
}

/**
 * The instant reaction when a task lands (affinity × persona).
 * ◎ → 「よし、任せろ！」系 / ✗ → 「うーん畑違いだけど…」系。
 */
export function reactionLine(
  memberId: string,
  department: string,
  tier: AffinityTier,
  seed = 0,
): string {
  const v = voiceFor(memberId, department);
  return pick(v.react[tier], seed);
}

/** A persona-flavored working thought (rotates as `tick` advances). */
export function thoughtLine(memberId: string, department: string, tick: number): string {
  const v = voiceFor(memberId, department);
  return pick(v.think, tick);
}

/** Clear completion line + result flavor, affinity-weighted. */
export function completionLine(
  memberId: string,
  department: string,
  tier: AffinityTier,
  seed = 0,
): string {
  const v = voiceFor(memberId, department);
  return pick(v.done[tier], seed);
}

/** True when this member has an explicit hand-authored voice (not archetype). */
export function hasExplicitVoice(memberId: string): boolean {
  return memberId in VOICES;
}
