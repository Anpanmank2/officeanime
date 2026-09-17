import * as fs from 'fs';
import * as path from 'path';

import { WORK_TERMINAL } from '../constants.js';
import { RequestWorkflow } from './request-workflow.js';
import type { TaskHistoryWriter } from './task-history-writer.js';
import type { JCConfig } from './types.js';

/**
 * Build the direct read-only research prompt (Model 1 — shortest & safest).
 * No `/company ` prefix (that would trigger the heavy orchestration that needs
 * Edit/Write/Bash — auto-denied in headless). This is a plain read-only ask, so
 * the headless `claude --print` auto-allow-read / auto-deny-write behavior keeps
 * it purely investigative and returns findings as text.
 */
export function buildResearchPrompt(task: string, criteria: string): string {
  const scope = criteria ? `\n完了条件: ${criteria}` : '';
  return (
    `次を調べて要点を箇条書き(3〜7点)で返してください。` +
    `ファイルの読み取り・検索のみで完結させ、書き込み・実行はしないでください。\n` +
    `調査対象: ${task}${scope}`
  );
}

/**
 * ── Request-UX (依頼制) template flow — 2026-07-02 Owner FB pivot ──────────
 *
 * Owner実機FB: 「〇実行/✕却下がわかりづらい・結構使いづらい」. The ambiguous
 * 〇✕✎ tray is replaced (for the Research「調査」pilot) by a guided flow:
 *   ① デフォルトタスク「調査を依頼」→ 3項目テンプレ〔目的 / 知りたいこと / 概要〕
 *   ② 送信 → READ-ONLY spawn が はい/いいえ 確認質問(各"私の理解"付き)を生成
 *   ③ 全部「はい」→ 既存の research 能動パス(read-only)で調査実行 → 調査結果パネル
 *
 * A pending request holds the 3-field template until the Owner has answered all
 * confirm questions "はい"; then it runs the SAME read-only research path.
 */
/**
 * ── 依頼カードの種別 (2026-07-02 横展開: 作る・書く系へ) ────────────────
 * - research: Research 📋調査を依頼 — read型・現行 pilot そのまま（無改変）
 * - market:   Marketing 📊市場調査を依頼 — read型・research 能動パス流用、
 *             確認質問の生成だけマーケ文脈（読み手・競合視点）
 * - doc:      Marketing 📄資料を依頼 — write型（scoped staging 書込）
 * - impl:     Eng 🔧実装を依頼 — write型。成果物 = 下書き置き場に
 *             「コード一式 + 適用手順」のドラフト。本物のリポには一切書かない
 *
 * write型は確認の締めに plan確認 1問（こう作ります①②③ + 書き先 = staging パス）
 * が必ず入り、その明示的なGO選択なしで execute は絶対に
 * 発火しない。execute は案1 scoped-write 契約（buildScopedSettings）そのまま。
 */
type RequestKind = 'research' | 'market' | 'doc' | 'impl';

const WRITE_KINDS: ReadonlySet<RequestKind> = new Set<RequestKind>(['doc', 'impl']);

/** kind別テンプレ項目ラベル（prompt/task 合成用。UI 側 KIND_META と対で保守）. */
const KIND_FIELD_LABELS: Record<RequestKind, { purpose: string; wants: string; overview: string }> =
  {
    research: { purpose: '目的', wants: '知りたいこと', overview: 'ざっくり概要' },
    market: {
      purpose: '何のために調べる(目的)',
      wants: '何を知りたい',
      overview: 'どの範囲を調べる(対象・期間)',
    },
    doc: {
      purpose: '誰に見せる資料か',
      wants: '何を伝えたいか',
      overview: 'どんな形にするか(1枚もの/スライド/文章)',
    },
    impl: {
      purpose: '何を作る・直すか',
      wants: 'できたと言える条件',
      overview: '対象はどこか',
    },
  };

/** Compose the 3 template fields into a single research subject string. */
function composeRequestTask(r: { purpose: string; wants: string; overview: string }): string {
  const parts: string[] = [];
  if (r.overview.trim()) parts.push(r.overview.trim());
  if (r.wants.trim()) parts.push(`知りたいこと: ${r.wants.trim()}`);
  if (r.purpose.trim()) parts.push(`目的: ${r.purpose.trim()}`);
  return parts.join(' / ') || '(内容未記入)';
}

/**
 * Compose a WRITE-kind (doc/impl) template into a single task string using the
 * kind's own field labels (誰に見せる/何を伝えたい/… , 何を作る/完成条件/…).
 * research/market keep composeRequestTask (research pilot 無改変).
 */
function composeWriteTask(
  kind: RequestKind,
  r: { purpose: string; wants: string; overview: string },
): string {
  const L = KIND_FIELD_LABELS[kind];
  const parts: string[] = [];
  if (r.purpose.trim()) parts.push(`${L.purpose}: ${r.purpose.trim()}`);
  if (r.wants.trim()) parts.push(`${L.wants}: ${r.wants.trim()}`);
  if (r.overview.trim()) parts.push(`${L.overview}: ${r.overview.trim()}`);
  return parts.join(' / ') || '(内容未記入)';
}

/** One recorded confirm answer sent up from the webview (mirror of RequestAnswer). */
interface ConfirmAnswer {
  question: string;
  understanding: string;
  fieldRef: string;
  answer: string;
  isOther: boolean;
}

/**
 * Fold the Owner's confirm answers (picks + free-text corrections) into a compact
 * "Owner の確定/補正" block that is appended to the research task. This is what
 * makes the multi-choice confirm meaningful: the researcher runs with the Owner's
 * pinpoint answers woven in, so a misread interpretation is corrected (取り違えが
 * 消える). Returns '' when there are no answers (nothing to append).
 */
function composeAnswerContext(answers: ConfirmAnswer[]): string {
  if (!Array.isArray(answers) || answers.length === 0) return '';
  const lines = answers
    .filter((a) => a && typeof a.answer === 'string' && a.answer.trim())
    .map((a) => {
      const tag = a.isOther ? '補正' : '確定';
      const q = (a.question || '').trim();
      const ans = a.answer.trim();
      return q ? `- (${tag}) ${q} → ${ans}` : `- (${tag}) ${ans}`;
    });
  if (lines.length === 0) return '';
  return `\n【Owner の確定/補正（この通りに解釈してください）】\n${lines.join('\n')}`;
}

/**
 * CONFIRM-QUESTIONS prompt (STEP 2 of the 依頼 flow) — READ-ONLY by construction.
 *
 * Fired via a plain direct prompt with NO `/company` prefix and a spawn that
 * carries NO permission flags → the headless auto-allow-read / auto-deny-write
 * safety valve keeps it purely investigative (no writes). It asks the model to
 * read the 3-field template and emit 3–4 ADAPTIVE MULTI-CHOICE confirmation
 * questions (the same shape as the secretary's AskUserQuestion to the Owner),
 * EACH prefixing the agent's own understanding ("私の理解") AND 2〜4 candidate
 * answer options, as a strict JSON array so the frontend can render option
 * cards. The UI always appends 「その他(自分で書く)」, so a simple binary question
 * may return a minimal option set. We ask for ONLY the JSON to make the parse
 * robust; a fenced/loose response still parses via extractJsonArray.
 */
function buildConfirmQuestionsPrompt(r: {
  purpose: string;
  wants: string;
  overview: string;
}): string {
  return (
    `あなたはこれから調査を依頼されます。まだ調査はしないでください。\n` +
    `依頼者(Owner)の意図を取り違えないよう、着手前に すり合わせの確認 をします。\n` +
    `以下の依頼内容を読み、あなたの「理解」を前に出した確認質問を 3〜4個 作ってください。\n` +
    `各質問には「候補の答え」を2〜4個添えてください。Owner はその中から選ぶか、自分で一言補正できます。\n` +
    `適応的に: 単純な確認は候補を最小(自然な肯定1つ)に、解釈が複数あり得る/概要を掴めた質問は ` +
    `解釈の違いが分かる候補を2〜4個 出してください。候補には必ず自然な肯定(「はい、〜で合っています」)を1つ含めてください。\n\n` +
    `【依頼内容】\n` +
    `- 目的: ${r.purpose || '(未記入)'}\n` +
    `- 知りたいこと: ${r.wants || '(未記入)'}\n` +
    `- ざっくり概要: ${r.overview || '(未記入)'}\n\n` +
    `【出力形式(厳守)】 次の JSON 配列だけを返してください。前後に説明文やコードフェンスを付けないでください。\n` +
    `[\n` +
    `  {"understanding": "私はこう理解しました: …", "question": "…で合っていますか?", "options": ["はい、…で合っています", "いえ、…です", …], "field_ref": "purpose|wants|overview"},\n` +
    `  … (3〜4個)\n` +
    `]\n` +
    `- understanding = あなたの理解(具体的に・1〜2文)\n` +
    `- question = Owner に確認したいこと\n` +
    `- options = 候補の答え 2〜4個(必ず肯定を1つ含む・簡潔に)\n` +
    `- field_ref = その確認がどの項目に関係するか(purpose=目的 / wants=知りたいこと / overview=概要)`
  );
}

/**
 * CONFIRM-QUESTIONS prompt for 市場調査 (market, read型) — READ-ONLY, same spawn
 * contract and JSON schema as the research pilot. Only the LENS differs: the
 * questions are generated in a marketing context (読み手=誰の意思決定か・競合
 * 視点・どの顧客層か). Execution afterwards reuses the research active path.
 */
function buildMarketConfirmPrompt(r: { purpose: string; wants: string; overview: string }): string {
  return (
    `あなたはこれから市場調査を依頼されます。まだ調査はしないでください。\n` +
    `依頼者(Owner)の意図を取り違えないよう、着手前に すり合わせの確認 をします。\n` +
    `マーケティング視点で確認してください: この調査結果を誰が読んで何を決めるのか(読み手)、` +
    `競合との比較が要るのか、どの顧客層・市場範囲を見るのか。\n` +
    `以下の依頼内容を読み、あなたの「理解」を前に出した確認質問を 1〜3個 作ってください。\n` +
    `各質問には「候補の答え」を2〜4個添えてください。Owner はその中から選ぶか、自分で一言補正できます。\n` +
    `適応的に: 単純な確認は候補を最小(自然な肯定1つ)に、解釈が複数あり得る質問は ` +
    `解釈の違いが分かる候補を2〜4個 出してください。候補には必ず自然な肯定(「はい、〜で合っています」)を1つ含めてください。\n\n` +
    `【依頼内容】\n` +
    `- 何のために調べる(目的): ${r.purpose || '(未記入)'}\n` +
    `- 何を知りたい: ${r.wants || '(未記入)'}\n` +
    `- どの範囲を調べる(対象・期間): ${r.overview || '(未記入)'}\n\n` +
    `【出力形式(厳守)】 次の JSON 配列だけを返してください。前後に説明文やコードフェンスを付けないでください。\n` +
    `[\n` +
    `  {"understanding": "私はこう理解しました: …", "question": "…で合っていますか?", "options": ["はい、…で合っています", "いえ、…です", …], "field_ref": "purpose|wants|overview"},\n` +
    `  … (1〜3個)\n` +
    `]\n` +
    `- understanding = あなたの理解(具体的に・1〜2文)\n` +
    `- question = Owner に確認したいこと(読み手・競合・顧客層のズレを潰す)\n` +
    `- options = 候補の答え 2〜4個(必ず肯定を1つ含む・簡潔に)\n` +
    `- field_ref = その確認がどの項目に関係するか(purpose=目的 / wants=知りたいこと / overview=範囲)`
  );
}

/**
 * CONFIRM-QUESTIONS prompt for WRITE kinds (doc=資料 / impl=実装) — READ-ONLY.
 *
 * Same read-only spawn contract (no permission flags, no `/company`). ONE spawn
 * produces BOTH the interpretation questions AND the closing plan confirmation
 * (spawn数は増やさない):
 *   - 解釈すり合わせ 1〜2問 (field_ref = purpose|wants|overview)
 *   - アウトプット仕様(形・完成条件) 必ず1問 (field_ref = "output")
 *   - 締めの plan確認 必ず1問 (field_ref = "plan"): understanding =
 *     「こう作ります: ①②③ + 書き先 = <staging path>」/ options = はい。
 * The parser (ensureWriteConfirmShape) guarantees output/plan questions exist
 * even if the model's JSON is broken or drops them.
 */
function buildWriteConfirmPrompt(
  kind: RequestKind,
  r: { purpose: string; wants: string; overview: string },
  stagingDir: string,
): string {
  const L = KIND_FIELD_LABELS[kind];
  const goal =
    kind === 'impl'
      ? `成果物は「コード一式 + 適用手順」のドラフトで、下書き置き場にだけ作ります(本物のリポジトリには一切書きません)。`
      : `成果物は資料のドラフトで、下書き置き場にだけ作ります。`;
  return (
    `あなたはこれから${kind === 'impl' ? '実装' : '資料作成'}を依頼されます。まだ作業はしないでください。\n` +
    `依頼者(Owner)の意図を取り違えないよう、着手前に すり合わせの確認 をします。${goal}\n` +
    `以下の依頼内容を読み、確認質問を作ってください。構成は厳守:\n` +
    `1. 解釈のすり合わせ質問 1〜2個 (field_ref = "purpose" | "wants" | "overview")\n` +
    `2. アウトプット仕様(形・完成条件)の確認 必ず1個 (field_ref = "output")\n` +
    `3. 締めに 計画確認 必ず1個・配列の最後 (field_ref = "plan"):\n` +
    `   - understanding = 「こう作ります:」で始め、手順を ①②③ の箇条書きで書き、` +
    `最後の行に「書き先: ${stagingDir}」を必ず入れる\n` +
    `   - question = 「この計画で進めてよいですか?」\n` +
    `   - options = ["はい、この計画で進めてください"] のみ\n` +
    `各質問には「候補の答え」を2〜4個添えてください(必ず自然な肯定を1つ含む)。\n\n` +
    `【依頼内容】\n` +
    `- ${L.purpose}: ${r.purpose || '(未記入)'}\n` +
    `- ${L.wants}: ${r.wants || '(未記入)'}\n` +
    `- ${L.overview}: ${r.overview || '(未記入)'}\n\n` +
    `【出力形式(厳守)】 次の JSON 配列だけを返してください。前後に説明文やコードフェンスを付けないでください。\n` +
    `[\n` +
    `  {"understanding": "私はこう理解しました: …", "question": "…で合っていますか?", "options": ["はい、…で合っています", …], "field_ref": "purpose|wants|overview"},\n` +
    `  {"understanding": "アウトプットはこう理解しました: …", "question": "形・完成条件はこれでよいですか?", "options": [……], "field_ref": "output"},\n` +
    `  {"understanding": "こう作ります:\\n① …\\n② …\\n③ …\\n書き先: ${stagingDir}", "question": "この計画で進めてよいですか?", "options": ["はい、この計画で進めてください"], "field_ref": "plan"}\n` +
    `]`
  );
}

/** One confirm question surfaced to the frontend (私の理解 + 候補オプション). */
interface ConfirmQuestion {
  understanding: string;
  question: string;
  /** Candidate answer options (2〜4); UI always appends 「その他」. */
  options: string[];
  field_ref: 'purpose' | 'wants' | 'overview' | 'output' | 'plan' | string;
}

/**
 * Extract the first top-level JSON array from a possibly-noisy model response
 * (code fences, leading prose, trailing text). Returns the substring or null.
 */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Robustly parse the confirm-question spawn output into ConfirmQuestion[].
 * NEVER throws: on any parse failure it returns a safe fallback set built from
 * the template so the UI always has yes/no cards to show (AC-2 must not crash on
 * broken JSON).
 */
function parseConfirmQuestions(
  output: string,
  r: { purpose: string; wants: string; overview: string },
): ConfirmQuestion[] {
  const fallback: ConfirmQuestion[] = [
    {
      understanding: `目的をこう理解しました: 「${r.purpose || '(未記入)'}」`,
      question: 'この目的で合っていますか?',
      options: ['はい、この目的で合っています'],
      field_ref: 'purpose',
    },
    {
      understanding: `知りたいことをこう理解しました: 「${r.wants || '(未記入)'}」`,
      question: 'この内容を調べればよいですか?',
      options: ['はい、この内容で合っています'],
      field_ref: 'wants',
    },
    {
      understanding: `概要をこう理解しました: 「${r.overview || '(未記入)'}」`,
      question: 'この理解で進めてよいですか?',
      options: ['はい、この理解で進めてください'],
      field_ref: 'overview',
    },
  ];
  return parseConfirmQuestionsCore(output, fallback, 4);
}

/**
 * Shared robust-parse core (extracted 2026-07-02 横展開; research behavior is
 * byte-identical via parseConfirmQuestions above). NEVER throws; on any parse
 * failure returns the caller-supplied fallback set.
 */
function parseConfirmQuestionsCore(
  output: string,
  fallback: ConfirmQuestion[],
  maxQuestions: number,
): ConfirmQuestion[] {
  try {
    const json = extractJsonArray(output);
    if (!json) return fallback;
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const out: ConfirmQuestion[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const understanding = typeof o.understanding === 'string' ? o.understanding.trim() : '';
      const question = typeof o.question === 'string' ? o.question.trim() : '';
      const fieldRef = typeof o.field_ref === 'string' ? o.field_ref.trim() : 'overview';
      if (!question) continue; // a card must at least ask something
      // options: keep only non-empty strings, de-dupe, cap at 4. Empty/junk
      // options are fine — the UI always appends 「その他」 and guarantees an
      // affirmative, so a question with 0 valid options still renders safely.
      const rawOptions = Array.isArray(o.options) ? o.options : [];
      const options = Array.from(
        new Set(
          rawOptions
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ).slice(0, 4);
      out.push({
        understanding: understanding || '(理解を取得できませんでした)',
        question,
        options,
        field_ref: fieldRef,
      });
      if (out.length >= maxQuestions) break; // cap
    }
    return out.length > 0 ? out : fallback;
  } catch {
    return fallback;
  }
}

/** Deterministic fallback plan-confirm question for a write kind (never missing). */
function buildWritePlanFallback(kind: RequestKind, stagingDir: string): ConfirmQuestion {
  const step2 = kind === 'impl' ? '② コード一式のドラフトを作成' : '② 資料のドラフトを作成';
  const step3 = kind === 'impl' ? '③ 適用手順と要約をまとめる' : '③ 構成の説明と要約をまとめる';
  return {
    understanding: `こう作ります:\n① 依頼内容と完成条件を整理\n${step2}\n${step3}\n書き先: ${stagingDir}`,
    question: 'この計画で進めてよいですか?',
    options: ['はい、この計画で進めてください'],
    field_ref: 'plan',
  };
}

/** Fallback question set for a write kind (parse failure → still 解釈+output+plan). */
function buildWriteFallbackQuestions(
  kind: RequestKind,
  r: { purpose: string; wants: string; overview: string },
  stagingDir: string,
): ConfirmQuestion[] {
  const L = KIND_FIELD_LABELS[kind];
  return [
    {
      understanding: `${L.purpose}をこう理解しました: 「${r.purpose || '(未記入)'}」`,
      question: 'この理解で合っていますか?',
      options: ['はい、合っています'],
      field_ref: 'purpose',
    },
    {
      understanding:
        `アウトプットをこう理解しました: 「${r.overview || '(未記入)'}」` +
        `(完成条件: ${r.wants || '(未記入)'})`,
      question: 'アウトプットの形・完成条件はこれでよいですか?',
      options: ['はい、この形・完成条件でお願いします'],
      field_ref: 'output',
    },
    buildWritePlanFallback(kind, stagingDir),
  ];
}

/**
 * Enforce the WRITE-kind confirm shape on whatever the spawn returned:
 *   [解釈 0〜2問] → [アウトプット仕様 必ず1問] → [plan確認 必ず1問・最後]
 * - plan の understanding には 書き先(staging path) を必ず含める(無ければ追記)。
 * - plan の options には必ず肯定を入れる。
 * This is what guarantees AC「write型は アウトプット仕様1問 + 締めplan確認1問」
 * even when the model's JSON drops/reorders them.
 */
function ensureWriteConfirmShape(
  questions: ConfirmQuestion[],
  kind: RequestKind,
  r: { purpose: string; wants: string; overview: string },
  stagingDir: string,
): ConfirmQuestion[] {
  const planQs = questions.filter((q) => q.field_ref === 'plan');
  const outputQs = questions.filter((q) => q.field_ref === 'output');
  const interp = questions.filter((q) => q.field_ref !== 'plan' && q.field_ref !== 'output');

  const plan: ConfirmQuestion =
    planQs.length > 0 ? planQs[planQs.length - 1] : buildWritePlanFallback(kind, stagingDir);
  // 書き先 = staging path を plan に必ず含める(実行先とプランの食い違いを防ぐ)。
  if (!plan.understanding.includes(stagingDir)) {
    plan.understanding = `${plan.understanding}\n書き先: ${stagingDir}`;
  }
  // Plan approval is explicit; model-generated negative options must never authorize execution.
  plan.options = ['はい、この計画で進めてください'];

  const output: ConfirmQuestion =
    outputQs.length > 0 ? outputQs[0] : buildWriteFallbackQuestions(kind, r, stagingDir)[1];

  return [...interp.slice(0, 2), output, plan];
}

/**
 * EXECUTE prompt for a WRITE-kind 依頼 — runs ONLY after the Owner confirmed the
 * plan question (「はい」or その他補正の確定). Mirrors buildExecutePrompt's 絶対
 * 厳守 contract; enforcement itself is buildScopedSettings (案1, PM live-proven).
 */
function buildRequestExecutePrompt(
  kind: RequestKind,
  task: string,
  plan: string,
  stagingDir: string,
): string {
  const goal =
    kind === 'impl'
      ? `成果物 = 「コード一式 + 適用手順」のドラフト。本物のリポジトリ・既存コードには一切書き込まないでください。`
      : `成果物 = 資料のドラフト(Markdown等)。`;
  return (
    `Owner が確認済みの計画に従って、依頼されたタスクを実行してください。\n` +
    `${goal}\n` +
    `【絶対厳守】\n` +
    `- 出力（ファイルの作成・書き込み）は下書き置き場のみ: ${stagingDir}\n` +
    `- それ以外のファイル・リポジトリ・外部には一切触れないでください\n` +
    `- git（add / commit / push）は実行しないでください\n` +
    `- 本番反映は PM 検証と Owner GO の後に人が手で行います。あなたは下書きを作るだけです\n` +
    `- 最後に「作ったファイル」と「内容の要約」を 3〜5 行で報告してください\n` +
    `\n== タスク ==\n${task}\n` +
    `\n== Owner 確認済みの計画 ==\n${plan}`
  );
}

/** List files under a staging dir (relative paths, recursive, capped at 20). */
export function listStagingFiles(stagingDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= 20) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(stagingDir, '');
  return out;
}

/**
 * PLAN prompt (STEP 1 of Fork B) — READ-ONLY by construction.
 *
 * Like the research prompt, this is a plain direct prompt with NO `/company`
 * prefix and the spawn carries NO permission flags → the headless
 * auto-allow-read / auto-deny-write safety valve keeps it purely investigative.
 * It asks the model to PLAN (steps / write-target / cost) WITHOUT doing the work
 * (no writes). The returned text is surfaced in the approval tray.
 */
export function buildPlanPrompt(task: string, criteria: string, stagingDir: string): string {
  const scope = criteria ? `\n補足: ${criteria}` : '';
  return (
    `次のタスクを「どう実行するか」の計画だけを立ててください。` +
    `実際の作業（ファイルの書き込み・作成・変更、コマンド実行）は一切しないでください。` +
    `読み取り・検索だけで、以下を日本語で構造化して返してください。\n` +
    `1. 手順（①②③… の箇条書き）\n` +
    `2. 書き込み先（この下書き置き場のみ: ${stagingDir}）に作る想定のファイル名\n` +
    `3. 推定コスト / 規模（S/M/L と 1 行の根拠）\n` +
    `\nタスク: ${task}${scope}`
  );
}

/**
 * EXECUTE prompt (STEP 5 of Fork B) — runs ONLY after the Owner approves.
 *
 * Carries the approved plan and pins output to the staging dir. The scoped
 * settings (buildScopedSettings) are what actually enforce the sandbox; this
 * prompt reinforces the contract so the model doesn't even attempt out-of-scope
 * writes, git, or external calls.
 */
export function buildExecutePrompt(task: string, plan: string, stagingDir: string): string {
  return (
    `承認済みの計画に従ってタスクを実行してください。\n` +
    `【絶対厳守】\n` +
    `- 出力（ファイルの作成・書き込み）は下書き置き場のみ: ${stagingDir}\n` +
    `- それ以外のファイル・リポジトリ・外部には一切触れないでください\n` +
    `- git（add / commit / push）は実行しないでください\n` +
    `- 本番反映は人が後で手で行います。あなたは下書きを作るだけです\n` +
    `\n== タスク ==\n${task}\n` +
    `\n== 承認済みの計画 ==\n${plan}`
  );
}

/**
 * Generate the SCOPED-WRITE settings JSON for an execute spawn (案1 contract).
 *
 * Enforcement (empirically verified, claude 2.1.126, 2026-07-02):
 * - `allow: Write(//<abs-staging>/**), Edit(//<abs-staging>/**)` — the ONLY
 *   writable paths. The `//` prefix means ABSOLUTE filesystem path and REPLACES
 *   the leading `/` of the absolute path (so `/a/b` → `//a/b`, NOT `///a/b`).
 *   A single `/` prefix would be interpreted as project-root-relative → wrong.
 * - Everything else has NO allow rule → headless `--print` (default permission
 *   mode) auto-DENIES it (no interactive prompt to grant it in headless), so
 *   writes OUTSIDE staging fail. This default-deny is what confines writes.
 * - `deny` is ONLY `Bash` (kills git add/commit/push and any shell) + network.
 *   ⚠ We deliberately do NOT deny a parent dir of staging (e.g. the projects
 *   root): deny ALWAYS wins over allow and cannot carry exceptions, so denying a
 *   parent would ALSO block the staging write (staging is nested under it in
 *   production: cc-company is under /path/to/projects). Out-of-staging
 *   writes are blocked by absence-of-allow (default-deny), not by an explicit
 *   parent deny.
 * - NO `--dangerously-skip-permissions`.
 *
 * The execute spawn also sets cwd = staging and passes `--add-dir <staging>`.
 * `projectsRoot` is accepted for signature stability / logging but is NOT used
 * as a deny target (see above).
 */
function toAbsRule(tool: string, absPath: string): string {
  // `//` = absolute FS path; it replaces the leading slash of an absolute path.
  const stripped = absPath.startsWith('/') ? absPath.slice(1) : absPath;
  return `${tool}(//${stripped}/**)`;
}

export function buildScopedSettings(stagingDir: string, _projectsRoot: string): string {
  return JSON.stringify({
    permissions: {
      allow: [
        'Read',
        'Glob',
        'Grep',
        toAbsRule('Write', stagingDir),
        toAbsRule('Edit', stagingDir),
      ],
      // Bash denied → git (add/commit/push) impossible. Network denied.
      // Out-of-staging writes fall through to headless default-deny (no allow).
      deny: ['Bash', 'WebFetch', 'WebSearch'],
    },
  });
}

/**
 * Slice1: append an Owner delegation (task_received + delegate) to jc-events.json.
 * The EventWatcher then drives arrive → affinity badge → seat → quality gauge.
 * Same shape as PixelAgentsViewProvider.jcOwnerDelegate so both surfaces match.
 */
export function writeOwnerDelegate(
  eventsFile: string,
  d: {
    memberId: string;
    department: string;
    task: string;
    message: string;
    priority: string;
    deadline: string | null;
    timestamp: string;
    workflowId?: string;
  },
): void {
  if (!d.memberId || !d.task) return;
  try {
    let data: { version: number; events: unknown[] } = { version: 1, events: [] };
    if (fs.existsSync(eventsFile)) {
      data = JSON.parse(fs.readFileSync(eventsFile, 'utf-8')) as typeof data;
    }
    data.events.push({
      event: 'task_received',
      workflow_id: d.workflowId,
      timestamp: d.timestamp,
      task: d.task,
      from: 'user',
    });
    data.events.push({
      event: 'delegate',
      workflow_id: d.workflowId,
      timestamp: new Date().toISOString(),
      from: 'exec-sec',
      to: [d.memberId],
      task: d.task,
      department: d.department,
      message: d.message,
      priority: d.priority,
      deadline: d.deadline,
    });
    // work_started so the quality gauge begins immediately (Owner sees fill on click).
    data.events.push({
      event: 'work_started',
      workflow_id: d.workflowId,
      timestamp: new Date(Date.now() + 1).toISOString(),
      from: d.memberId,
      task: d.task,
      department: d.department,
    });
    const tmp = eventsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, eventsFile);
    console.log(`[JC] Owner delegate → ${d.memberId}: ${d.task.slice(0, 40)}`);
  } catch (e) {
    console.error('[JC] writeOwnerDelegate error:', e);
  }
}

/**
 * Step2 — spawn a headless `claude --print -p` for a PLAN (read-only) or an
 * EXECUTE (scoped-write) and hand the full stdout to `onDone`.
 *
 * This is separate from TaskWatcher.spawnClaude (which force-prefixes `/company`
 * and carries NO permission flags). Here:
 * - PLAN mode: `extraArgs = []` → no permission flags → headless auto-deny-write
 *   safety valve keeps the plan purely read-only.
 * - EXECUTE mode: `extraArgs = ['--settings', <scoped-json>, '--add-dir', <staging>]`
 *   and `cwd = <staging>` → writes confined to the staging dir; git/network denied.
 *   NEVER `--dangerously-skip-permissions`.
 *
 * `spawnFn` is injected so tests / callers control the actual child spawn; the
 * default uses child_process.spawn('claude', …).
 */
export async function spawnScoped(opts: {
  prompt: string;
  cwd: string;
  extraArgs: string[];
  onData?: (text: string) => void;
  signal?: AbortSignal;
  onStarted?: () => void;
  onDone: (output: string, code: number | null) => void;
}): Promise<void> {
  const { spawn } = await import('child_process');
  if (opts.signal?.aborted) {
    opts.onDone('実行前に中止しました。', null);
    return;
  }
  const sessionId = crypto.randomUUID();
  console.log(`[JC Step2] spawnScoped (session: ${sessionId.slice(0, 8)}) cwd=${opts.cwd}`);
  console.log(`[JC Step2]   args: ${opts.extraArgs.join(' ') || '(none — read-only plan)'}`);
  const child = spawn(
    'claude',
    ['--session-id', sessionId, '--print', '-p', opts.prompt, ...opts.extraArgs],
    { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, detached: false },
  );
  let settled = false;
  const finish = (output: string, code: number | null) => {
    if (settled) return;
    settled = true;
    opts.signal?.removeEventListener('abort', abort);
    opts.onDone(output, code);
  };
  const abort = () => {
    child.kill('SIGTERM');
  };
  opts.signal?.addEventListener('abort', abort, { once: true });
  if (opts.signal?.aborted) abort();
  child.once('spawn', () => {
    if (!opts.signal?.aborted) opts.onStarted?.();
  });
  let out = '';
  child.stdout?.on('data', (d: Buffer) => {
    const t = d.toString();
    out += t;
    if (t.trim()) console.log(`[JC Step2 out] ${t.trim().slice(0, 160)}`);
    opts.onData?.(t);
  });
  child.stderr?.on('data', (d: Buffer) => {
    const t = d.toString().trim();
    if (t) console.error(`[JC Step2 ERR] ${t.slice(0, 160)}`);
  });
  child.on('error', (err) => {
    console.error(`[JC Step2] spawn error: ${String(err)}`);
    finish(String(err), null);
  });
  child.on('close', (code) => {
    console.log(`[JC Step2] session ${sessionId.slice(0, 8)} exited (code: ${code})`);
    finish(out.trim(), code);
  });
}

/**
 * Step2 staging dir (下書き置き場) for a task: an in-workspace, discoverable,
 * git-untracked-by-default dir. All execute-spawn writes are confined here; the
 * human (PM → Owner) moves anything real to production by hand afterwards.
 */
export function resolveStagingDir(workspaceRoot: string, taskId: string): string {
  return path.join(workspaceRoot, '.company', 'secretary', 'inbox', 'office-tasks', taskId);
}

/** Shared runtime: both host transports execute the same persisted workflow. */
export function createRequestWorkflow(options: {
  file: string;
  config: JCConfig;
  workspaceRoot: string;
  eventsFile: string;
  broadcast: (message: unknown) => void;
  allowDrafts: () => boolean;
  history: Pick<TaskHistoryWriter, 'writeEntry'>;
}): RequestWorkflow {
  const workflow = new RequestWorkflow({
    file: options.file,
    members: options.config.members,
    staging: (id) => resolveStagingDir(options.workspaceRoot, id),
    broadcast: (message) => {
      options.broadcast(message);
      const row = (message as { request: import('../../shared/workflow/types.js').WorkRequest })
        .request;
      if (!row) return;
      // Aggregate per member so finishing one job never hides another active job.
      const jobs = workflow
        .snapshot()
        .filter((r) => r.memberId === row.memberId && !WORK_TERMINAL.has(r.status));
      const state = jobs.some((r) => r.status === 'running')
        ? 'coding'
        : jobs.some((r) => r.status === 'waiting')
          ? 'reviewing'
          : jobs.length
            ? 'thinking'
            : row.status === 'error'
              ? 'error'
              : 'idle';
      options.broadcast({
        type: 'jcMemberStateChange',
        memberId: row.memberId,
        agentId: -400,
        jcState: state,
      });
      options.broadcast({
        type: 'jcActivitySummary',
        memberId: row.memberId,
        summary: `${row.purpose}${jobs.length > 1 ? ` / ほか${jobs.length - 1}件` : ''}`,
      });
    },
    questions: (req, signal) =>
      new Promise((resolve, reject) => {
        const isWrite = WRITE_KINDS.has(req.kind);
        const prompt =
          req.kind === 'market'
            ? buildMarketConfirmPrompt(req)
            : isWrite
              ? buildWriteConfirmPrompt(req.kind, req, req.stagingDir!)
              : buildConfirmQuestionsPrompt(req);
        void spawnScoped({
          prompt,
          cwd: options.workspaceRoot,
          extraArgs: [],
          signal,
          onDone: (output, code) => {
            if (code !== 0) {
              reject(new Error('依頼内容の確認に失敗しました。' + output));
              return;
            }
            resolve(
              isWrite
                ? ensureWriteConfirmShape(
                    parseConfirmQuestionsCore(
                      output,
                      buildWriteFallbackQuestions(req.kind, req, req.stagingDir!),
                      6,
                    ),
                    req.kind,
                    req,
                    req.stagingDir!,
                  )
                : parseConfirmQuestions(output, req),
            );
          },
        }).catch(reject);
      }),
    execute: (req, answers, signal, started, progress) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('実行前に中止しました。'));
          return;
        }
        const isWrite = WRITE_KINDS.has(req.kind);
        if (isWrite && !options.allowDrafts()) {
          reject(new Error('下書きの実行は無効です。ホストの実行設定を確認してください。'));
          return;
        }
        const base = isWrite ? composeWriteTask(req.kind, req) : composeRequestTask(req);
        const plan = answers.find((a) => a.fieldRef === 'plan');
        if (isWrite && !plan) {
          reject(new Error('計画の確認が必要です。'));
          return;
        }
        if (isWrite) fs.mkdirSync(req.stagingDir!, { recursive: true });
        const planText = plan
          ? plan.understanding + (plan.isOther ? `\nOwner補正: ${plan.answer}` : '')
          : '';
        const prompt = isWrite
          ? buildRequestExecutePrompt(
              req.kind,
              base + composeAnswerContext(answers.filter((a) => a.fieldRef !== 'plan')),
              planText,
              req.stagingDir!,
            )
          : buildResearchPrompt(base + composeAnswerContext(answers), '');
        void spawnScoped({
          prompt,
          cwd: isWrite ? req.stagingDir! : options.workspaceRoot,
          extraArgs: isWrite
            ? [
                '--settings',
                buildScopedSettings(req.stagingDir!, path.resolve(options.workspaceRoot, '..')),
                '--add-dir',
                req.stagingDir!,
              ]
            : [],
          signal,
          onStarted: () => {
            started();
            writeOwnerDelegate(options.eventsFile, {
              workflowId: req.id,
              memberId: req.memberId,
              department: req.department,
              task: base,
              message: '',
              priority: `P${req.priority}`,
              deadline: null,
              timestamp: new Date().toISOString(),
            });
          },
          onData: (text) => progress(text.trim()),
          onDone: (output, code) =>
            resolve({ output, code, files: isWrite ? listStagingFiles(req.stagingDir!) : [] }),
        }).catch(reject);
      }),
    record: (row) => {
      options.history.writeEntry(
        {
          id: row.id,
          assignee: row.memberId,
          prompt: row.purpose + ' / ' + row.wants + ' / ' + row.overview,
          status:
            row.status === 'done' ? 'done' : row.status === 'cancelled' ? 'cancelled' : 'error',
          priority: row.priority,
          createdAt: row.createdAt,
          completedAt: row.updatedAt,
          completionSummary: row.summary,
          result: row.summary,
          outputFiles: row.files,
          label:
            row.kind === 'research' || row.kind === 'market'
              ? 'research'
              : row.kind === 'impl'
                ? 'implementation'
                : 'other',
          delegationChain: ['exec-sec', row.memberId],
        },
        options.config,
      );
    },
  });

  return workflow;
}
