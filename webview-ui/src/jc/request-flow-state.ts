// ── 依頼(request) flow store (webview volatile store) ────────────────────
// 2026-07-02 Owner FB pivot #2: the binary はい / ちがう→フォーム再入力 confirm is
// replaced (for the Research「調査」pilot) by an ADAPTIVE MULTI-CHOICE confirm —
// the same shape as the secretary's AskUserQuestion to the Owner:
//   ① 「調査を依頼」→ open a 3-field template 〔目的 / 知りたいこと / ざっくり概要〕
//   ② 送信 → READ-ONLY spawn returns 確認質問(各"私の理解" + 候補オプション2〜4)
//   ③ 1問ずつ: [オプション選択] or [その他 → インライン入力で一言補正] → 次へ
//   ④ 全問回答 → 選んだ答え/打った補正を束ねて実行(既存 research 能動)
//
// ★ No form bounce: 補正はインライン(その他 textarea)。旧 reviseRequestField の
// フォーム戻しは廃止。各質問=特定の解釈/fieldRef 単位でピンポイント補正。
//
// Display/intent layer only: this store never spawns anything or touches
// permissions. It mirrors research-result-state.ts / plan-state.ts (imperative
// store + Observer subscribe API — see imperative-store-subscribe-pattern).
// The UI posts `jcRequestSubmit` / `jcRequestConfirmed` / `jcRequestCancel` to
// the extension, which is the only place a spawn fires.

/** A single adaptive confirmation question (agent's 理解 前出し + 候補オプション). */
export interface ConfirmQuestion {
  /** The agent's own understanding, surfaced BEFORE the question ("私の理解"). */
  understanding: string;
  /** The confirm question ("…で合っていますか?"). */
  question: string;
  /**
   * Candidate answer options (2〜4, produced by the read-only spawn per question).
   * Simple binary questions may carry a minimal set (e.g. just a 肯定); the UI
   * always appends 「その他(自分で書く)」 so free-text correction is always available.
   * The UI also guarantees an affirmative ("はい / 合ってる") path.
   */
  options: string[];
  /** Which template field this confirms (drives which field a correction targets). */
  fieldRef: 'purpose' | 'wants' | 'overview' | string;
}

/** The Owner's recorded answer to one confirm question. */
export interface RequestAnswer {
  /** The question text (for the execution prompt context). */
  question: string;
  /** The agent's understanding this answer responds to. */
  understanding: string;
  /** Which template field this answer relates to. */
  fieldRef: string;
  /**
   * The chosen option text, OR — when 「その他」 was used — the free-text the Owner
   * typed. `isOther` distinguishes a picked option from a typed correction.
   */
  answer: string;
  /** True when the Owner picked 「その他」 and typed a correction (vs picked an option). */
  isOther: boolean;
}

/** The 3-field 調査 template the Owner fills. */
export interface RequestTemplate {
  purpose: string; // 目的
  wants: string; // 知りたいこと
  overview: string; // ざっくり概要
}

/**
 * 依頼カードの種別 (2026-07-02 横展開: 作る・書く系へ):
 *  - 'research': Research 📋調査を依頼 — read型・現行 pilot（無改変）
 *  - 'market'  : Marketing 📊市場調査を依頼 — read型・research能動パス流用
 *  - 'doc'     : Marketing 📄資料を依頼 — write型（下書き置き場に scoped 書込）
 *  - 'impl'    : Eng 🔧実装を依頼 — write型（コード一式+適用手順のドラフト）
 * The store is kind-agnostic (同じ template/questions/answers 機構); kind は
 * ラベル分岐(UI)と backend のプロンプト/実行パス選択にだけ効く。
 */
export type RequestKind = 'research' | 'market' | 'doc' | 'impl';

/**
 * Phase of the request flow:
 *  - 'form'      : the 3-field template is open, Owner is editing.
 *  - 'awaiting'  : template submitted, waiting for the read-only spawn's questions.
 *  - 'confirming': showing adaptive multi-choice cards one at a time.
 */
export type RequestPhase = 'form' | 'awaiting' | 'confirming';

export interface RequestFlow {
  /** Request id — matches the backend pending-request id (routes questions/confirm). */
  id: string;
  /** Card kind — research/market = read型, doc/impl = write型. */
  kind: RequestKind;
  /** Roster member id that will investigate (e.g. "res-01"). */
  memberId: string;
  /** Resolved member name (e.g. "古賀 春樹"). Falls back to member id. */
  memberName: string;
  /** Department id (e.g. "research") for accent coloring. */
  department: string;
  /** Priority number (P0..P4). */
  priority: number;
  /** Current phase. */
  phase: RequestPhase;
  /** The 3-field template contents. */
  template: RequestTemplate;
  /** Confirm questions (populated when phase='confirming'). */
  questions: ConfirmQuestion[];
  /** Index of the question currently shown (0-based). */
  questionIdx: number;
  /**
   * The Owner's recorded answers, one per confirmed question (index-aligned with
   * `questions`). Bundled into `jcRequestConfirmed` so the execution prompt can
   * weave in the Owner's picks/corrections (取り違えが消える).
   */
  answers: RequestAnswer[];
}

let flow: RequestFlow | null = null;

// ── Subscribe API (Observer, see imperative-store-subscribe-pattern skill) ──
const listeners = new Set<() => void>();
let pendingNotify = false;

function scheduleNotify(): void {
  if (pendingNotify) return;
  pendingNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingNotify = false;
    for (const fn of listeners) {
      try {
        fn();
      } catch (e) {
        console.error('[request-flow-state] listener error:', e);
      }
    }
  });
}

/** Subscribe to store changes. Returns unsubscribe fn for useEffect cleanup. */
export function subscribeRequestFlow(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Get the current request flow, or null when none is open. */
export function getRequestFlow(): RequestFlow | null {
  return flow;
}

/**
 * Open the 3-field template for a member (STEP 1). Generates a fresh request id.
 * A new open replaces any prior flow (single-flow at a time keeps it simple).
 */
export function openRequestFlow(opts: {
  memberId: string;
  memberName: string;
  department: string;
  /** Card kind (default 'research' — the original pilot). */
  kind?: RequestKind;
  priority?: number;
  /** Optional seed for the 概要 field (e.g. a picked dock card's task text). */
  seedOverview?: string;
}): void {
  flow = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: opts.kind ?? 'research',
    memberId: opts.memberId,
    memberName: opts.memberName,
    department: opts.department,
    priority: opts.priority ?? 3,
    phase: 'form',
    template: { purpose: '', wants: '', overview: opts.seedOverview ?? '' },
    questions: [],
    questionIdx: 0,
    answers: [],
  };
  scheduleNotify();
}

/** Update one template field while the form is open. */
export function setRequestField(field: keyof RequestTemplate, value: string): void {
  if (!flow || flow.phase !== 'form') return;
  flow = { ...flow, template: { ...flow.template, [field]: value } };
  scheduleNotify();
}

/** Mark the template as submitted (STEP 2) → awaiting the confirm questions. */
export function markRequestAwaiting(): void {
  if (!flow) return;
  flow = { ...flow, phase: 'awaiting' };
  scheduleNotify();
}

/**
 * Populate confirm questions from the read-only spawn (STEP 3) and switch to the
 * adaptive multi-choice loop. Ignores questions for a stale/absent flow (id
 * mismatch). Resets any prior answers (a fresh question set starts clean).
 */
export function setRequestQuestions(requestId: string, questions: ConfirmQuestion[]): void {
  if (!flow || flow.id !== requestId) return;
  flow = { ...flow, phase: 'confirming', questions, questionIdx: 0, answers: [] };
  scheduleNotify();
}

/**
 * Record the Owner's answer to the current confirm question and advance to the
 * next. `answer` is either a chosen option OR (when 「その他」) the typed
 * correction; `isOther` distinguishes the two. Replaces the old はい / advance
 * split so every question captures a pinpoint answer — no form bounce.
 */
export function answerRequestQuestion(answer: string, isOther: boolean): void {
  if (!flow || flow.phase !== 'confirming') return;
  const q = flow.questions[flow.questionIdx];
  if (!q) return;
  const recorded: RequestAnswer = {
    question: q.question,
    understanding: q.understanding,
    fieldRef: q.fieldRef,
    answer,
    isOther,
  };
  flow = {
    ...flow,
    answers: [...flow.answers, recorded],
    questionIdx: flow.questionIdx + 1,
  };
  scheduleNotify();
}

/** True once the Owner has answered every confirm question. */
export function allQuestionsConfirmed(): boolean {
  return (
    !!flow &&
    flow.phase === 'confirming' &&
    flow.questions.length > 0 &&
    flow.questionIdx >= flow.questions.length
  );
}

/** The Owner's recorded answers (for bundling into jcRequestConfirmed). */
export function getRequestAnswers(): RequestAnswer[] {
  return flow ? flow.answers : [];
}

/** Close/cancel the flow (drops the pending request; nothing runs). */
export function closeRequestFlow(): void {
  if (!flow) return;
  flow = null;
  scheduleNotify();
}
