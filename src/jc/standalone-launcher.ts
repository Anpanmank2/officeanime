#!/usr/bin/env node
// ── Standalone Launcher — runs Office Anime without VS Code ─────

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startBrowserServer } from './browser-server.js';
import { createCommandDispatcher } from './command-dispatcher.js';
import { EventWatcher } from './event-watcher.js';
import { createMessageBridge } from './message-bridge.js';
import { OfficeLogWriter } from './office-log-writer.js';
import { toolToJCState } from './state-machine.js';
import { classifyLabel } from './task-history-writer.js';
import { TaskWatcher } from './task-watcher.js';
import type { JCConfig } from './types.js';

const DEFAULT_PORT = 8432;

/**
 * MVP Step1 — research active-run guard.
 * Tracks memberIds that currently have a research task in flight so a double-click
 * on the same card does not spawn a second `claude` child. Cleared on completion.
 */
const researchInFlight = new Set<string>();

/**
 * Build the direct read-only research prompt (Model 1 — shortest & safest).
 * No `/company ` prefix (that would trigger the heavy orchestration that needs
 * Edit/Write/Bash — auto-denied in headless). This is a plain read-only ask, so
 * the headless `claude --print` auto-allow-read / auto-deny-write behavior keeps
 * it purely investigative and returns findings as text.
 */
function buildResearchPrompt(task: string, criteria: string): string {
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
interface PendingRequest {
  memberId: string;
  department: string;
  /** 3-field template. */
  purpose: string; // 目的
  wants: string; // 知りたいこと
  overview: string; // ざっくり概要
  priority: number;
}
const pendingRequests = new Map<string, PendingRequest>();

/** Compose the 3 template fields into a single research subject string. */
function composeRequestTask(r: { purpose: string; wants: string; overview: string }): string {
  const parts: string[] = [];
  if (r.overview.trim()) parts.push(r.overview.trim());
  if (r.wants.trim()) parts.push(`知りたいこと: ${r.wants.trim()}`);
  if (r.purpose.trim()) parts.push(`目的: ${r.purpose.trim()}`);
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

/** One confirm question surfaced to the frontend (私の理解 + 候補オプション). */
interface ConfirmQuestion {
  understanding: string;
  question: string;
  /** Candidate answer options (2〜4); UI always appends 「その他」. */
  options: string[];
  field_ref: 'purpose' | 'wants' | 'overview' | string;
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
      if (out.length >= 4) break; // cap at 4
    }
    return out.length > 0 ? out : fallback;
  } catch {
    return fallback;
  }
}

/**
 * MVP Step2 — Fork B (plan → approval → execute).
 *
 * A pending plan produced by a READ-ONLY plan spawn, held until the Owner
 * decides 〇実行 / ✕却下 / ✎修正 in the 承認まち tray. Keyed by planId.
 *
 * ⚠ PARKED (2026-07-02 Owner FB pivot): the 依頼(request) flow no longer uses
 * this 〇✕✎ tray. This machinery is kept intact for the FUTURE 許可制 (AI-initiated
 * / permitted) source — see the honest-label note on the jcOwnerDelegate handler.
 */
interface PendingPlan {
  memberId: string;
  department: string;
  origin: 'requested' | 'permitted';
  task: string;
  message: string;
  priority: number;
  stagingDir: string;
}
const pendingPlans = new Map<string, PendingPlan>();

/**
 * PLAN prompt (STEP 1 of Fork B) — READ-ONLY by construction.
 *
 * Like the research prompt, this is a plain direct prompt with NO `/company`
 * prefix and the spawn carries NO permission flags → the headless
 * auto-allow-read / auto-deny-write safety valve keeps it purely investigative.
 * It asks the model to PLAN (steps / write-target / cost) WITHOUT doing the work
 * (no writes). The returned text is surfaced in the approval tray.
 */
function buildPlanPrompt(task: string, criteria: string, stagingDir: string): string {
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
function buildExecutePrompt(task: string, plan: string, stagingDir: string): string {
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
 *   production: cc-company is under /Users/uno/Desktop/projects). Out-of-staging
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

function buildScopedSettings(stagingDir: string, _projectsRoot: string): string {
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

// ── Shared state (accessible from both watcher and webviewReady handler) ──
interface JCMemberEntry {
  id: string;
  hueShift: number;
  palette?: number;
  deskId: string;
}

const activeAgents = new Map<number, { sessionId: string; file: string; memberId?: string }>();
const assignedMembers = new Set<string>();
const agentMemberMap: Record<number, string> = {};
let jcMembers: JCMemberEntry[] = [];
let jcConfig: unknown = null;
let taskWatcher: TaskWatcher | null = null;
const officeLogWriter = new OfficeLogWriter();

/** Resolve the watched jc-events.json path (mirrors EventWatcher workspace resolution). */
function resolveJcEventsPath(args: string[]): string {
  const wsArg = args.find((a) => a.startsWith('--workspace='));
  let workspaceRoot = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();
  const parentDir = path.resolve(workspaceRoot, '..');
  const parentEventsFile = path.join(parentDir, 'jc-events.json');
  const cwdEventsFile = path.join(workspaceRoot, 'jc-events.json');
  if (!fs.existsSync(cwdEventsFile) && fs.existsSync(parentEventsFile)) {
    workspaceRoot = parentDir;
  }
  const parentCompanyDir = path.join(parentDir, '.company');
  if (!wsArg && fs.existsSync(parentCompanyDir)) {
    workspaceRoot = parentDir;
  }
  return path.join(workspaceRoot, 'jc-events.json');
}

/**
 * Slice1: append an Owner delegation (task_received + delegate) to jc-events.json.
 * The EventWatcher then drives arrive → affinity badge → seat → quality gauge.
 * Same shape as PixelAgentsViewProvider.jcOwnerDelegate so both surfaces match.
 */
function writeOwnerDelegate(
  eventsFile: string,
  d: {
    memberId: string;
    department: string;
    task: string;
    message: string;
    priority: string;
    deadline: string | null;
    timestamp: string;
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
      timestamp: d.timestamp,
      task: d.task,
      from: 'user',
    });
    data.events.push({
      event: 'delegate',
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
async function spawnScoped(opts: {
  prompt: string;
  cwd: string;
  extraArgs: string[];
  onData?: (text: string) => void;
  onDone: (output: string, code: number | null) => void;
}): Promise<void> {
  const { spawn } = await import('child_process');
  const sessionId = crypto.randomUUID();
  console.log(`[JC Step2] spawnScoped (session: ${sessionId.slice(0, 8)}) cwd=${opts.cwd}`);
  console.log(`[JC Step2]   args: ${opts.extraArgs.join(' ') || '(none — read-only plan)'}`);
  const child = spawn(
    'claude',
    ['--session-id', sessionId, '--print', '-p', opts.prompt, ...opts.extraArgs],
    { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, detached: false },
  );
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
    opts.onDone('', null);
  });
  child.on('close', (code) => {
    console.log(`[JC Step2] session ${sessionId.slice(0, 8)} exited (code: ${code})`);
    opts.onDone(out.trim(), code);
  });
}

/**
 * Resolve the workspace root used as the claude CLI cwd (mirrors the TaskWatcher
 * / EventWatcher resolution): --workspace= arg, else parent dir if we're inside
 * pixel-agents (cc-company has .company/), else cwd.
 */
function resolveClaudeWorkspaceRoot(args: string[]): string {
  const wsArg = args.find((a) => a.startsWith('--workspace='));
  let root = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();
  const parentDir = path.resolve(root, '..');
  if (fs.existsSync(path.join(parentDir, '.company'))) {
    root = parentDir;
  }
  return root;
}

/**
 * Step2 staging dir (下書き置き場) for a task: an in-workspace, discoverable,
 * git-untracked-by-default dir. All execute-spawn writes are confined here; the
 * human (PM → Owner) moves anything real to production by hand afterwards.
 */
function resolveStagingDir(workspaceRoot: string, taskId: string): string {
  return path.join(workspaceRoot, '.company', 'secretary', 'inbox', 'office-tasks', taskId);
}

/** Build messages to send when a browser client connects or signals ready */
function buildClientInitMessages(respond: (msg: unknown) => void): void {
  // 1. Config + settings
  if (jcConfig) {
    respond({ type: 'jcConfigLoaded', config: jcConfig });
    respond({
      type: 'settingsLoaded',
      soundEnabled: false,
      extensionVersion: '1.2.0',
      lastSeenVersion: '1.2',
    });

    // Auto-arrive permanent residents (Secretary, PM / Director)
    const permanentRoles = ['Secretary', 'PM / Director'];
    const cfg = jcConfig as {
      members?: Array<{
        id: string;
        role: string;
        hueShift: number;
        palette?: number;
        deskId: string;
      }>;
    };
    const permanentMembers = (cfg.members ?? []).filter((m) => permanentRoles.includes(m.role));
    permanentMembers.forEach((member, idx) => {
      respond({
        type: 'jcMemberArriving',
        agentId: -100 - idx,
        memberId: member.id,
        deskId: member.deskId,
        seatUid: member.deskId,
        hueShift: member.hueShift,
        palette: member.palette ?? 0,
      });
    });
  }

  // 2. All current agents + their JC member arrivals
  for (const [agentId, agent] of activeAgents) {
    respond({ type: 'agentCreated', id: agentId });

    if (agent.memberId) {
      const member = jcMembers.find((m) => m.id === agent.memberId);
      if (member) {
        respond({
          type: 'jcMemberArriving',
          agentId,
          memberId: member.id,
          deskId: member.deskId,
          seatUid: member.deskId,
          hueShift: member.hueShift,
          palette: member.palette ?? 0,
        });
      }
    }
  }

  // 3. Mapping update (all at once)
  if (Object.keys(agentMemberMap).length > 0) {
    respond({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });
  }

  // 4. Current task queue
  if (taskWatcher) {
    taskWatcher.syncToWebview();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
  const shouldOpen = args.includes('--open');
  // MVP Step1 safe guard: dock/board delegations only trigger a real `claude`
  // child process (spawnClaude → /company) when this opt-in flag is present.
  // Without it, delegations write animation events only (default = no destructive auto-spawn).
  const liveSpawnEnabled = args.includes('--jc-live-spawn');

  const extensionPath = path.resolve(__dirname, '..');

  // Verify dist/webview exists
  const webviewPath = path.join(extensionPath, 'dist', 'webview');
  if (!fs.existsSync(webviewPath)) {
    console.error('[JC] Error: dist/webview not found. Run "npm run build" first.');
    console.error(`[JC] Looked in: ${webviewPath}`);
    process.exit(1);
  }

  // Create command dispatcher (read-only mode)
  const dispatcher = createCommandDispatcher();
  dispatcher.setContext({
    getAgentIds: () => [...activeAgents.keys()],
  });

  // Create message bridge
  const bridge = createMessageBridge({
    onBrowserCommand: (data, respond) => dispatcher.dispatch(data, respond),
  });

  // Load JC config
  for (const dir of [extensionPath, process.cwd()]) {
    const configPath = path.join(dir, 'jc-config.json');
    if (fs.existsSync(configPath)) {
      try {
        jcConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log(`[JC] Config loaded from ${configPath}`);
      } catch {
        console.warn(`[JC] Failed to parse ${configPath}`);
      }
      break;
    }
  }

  // Extract JC members for auto-mapping
  if (jcConfig) {
    const cfg = jcConfig as {
      members?: Array<{ id: string; hueShift: number; palette?: number; deskId: string }>;
    };
    if (cfg.members) {
      jcMembers = cfg.members.map((m) => ({
        id: m.id,
        hueShift: m.hueShift,
        palette: m.palette,
        deskId: m.deskId,
      }));
    }
  }

  // Create TaskWatcher if config is available
  if (jcConfig) {
    const emptyAgents = new Map();

    // Resolve workspace root for claude CLI cwd (same logic as event watcher below)
    const wsArg = args.find((a) => a.startsWith('--workspace='));
    let claudeWorkspaceRoot = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();
    // If cwd is inside pixel-agents, use parent directory (cc-company)
    const parentDir = path.resolve(claudeWorkspaceRoot, '..');
    const parentCompanyDir = path.join(parentDir, '.company');
    if (fs.existsSync(parentCompanyDir)) {
      claudeWorkspaceRoot = parentDir;
    }

    // Launch Claude Code CLI as a child process for each task
    const spawnClaude = async (memberId: string, prompt: string, workDir?: string) => {
      const { spawn } = await import('child_process');
      const cwd = workDir ?? claudeWorkspaceRoot;
      const sessionId = crypto.randomUUID();

      console.log(
        `[JC TaskWatcher] Launching claude for ${memberId} (session: ${sessionId.slice(0, 8)})`,
      );
      console.log(`[JC TaskWatcher]   cwd: ${cwd}`);
      console.log(`[JC TaskWatcher]   prompt: ${prompt.slice(0, 80)}...`);

      const child = spawn('claude', ['--session-id', sessionId, '--print', '-p', prompt], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: false,
      });

      // Collect output to store as task result and broadcast
      let outputBuf = '';

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        outputBuf += text;
        if (text.trim()) console.log(`[JC ${memberId}] ${text.trim().slice(0, 200)}`);

        // Stream activity summary to office UI
        const summary = text.trim().slice(0, 100);
        if (summary) {
          server.broadcast({
            type: 'jcActivitySummary',
            agentId: -200,
            memberId,
            summary,
          });
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) console.error(`[JC ${memberId} ERR] ${text.slice(0, 200)}`);
      });

      child.on('error', (err) => {
        // spawn failure (e.g. `claude` not on PATH) — release the guard so retry works.
        console.error(`[JC ${memberId}] spawn error: ${String(err)}`);
        researchInFlight.delete(memberId);
      });

      child.on('close', (code) => {
        console.log(
          `[JC TaskWatcher] ${memberId} session ${sessionId.slice(0, 8)} exited (code: ${code})`,
        );

        // Release the research active-run guard so this member can be re-delegated.
        researchInFlight.delete(memberId);

        // Update task with result and mark as done
        if (taskWatcher) {
          const result = outputBuf.trim().slice(0, 2000) || `Exited with code ${code}`;
          // Find the task and update it
          const tasksFile = JSON.parse(
            fs.readFileSync(path.join(os.homedir(), '.pixel-agents', 'tasks.json'), 'utf-8'),
          );
          const task = tasksFile.tasks?.find(
            (t: { assignee: string; status: string }) =>
              t.assignee === memberId && t.status === 'running',
          );
          if (task) {
            task.status = code === 0 ? 'done' : 'error';
            task.completedAt = new Date().toISOString();
            task.result = result;
            task.completionSummary = result.slice(0, 200);
            const tmpPath = path.join(os.homedir(), '.pixel-agents', 'tasks.json.tmp');
            fs.writeFileSync(tmpPath, JSON.stringify(tasksFile, null, 2), 'utf-8');
            fs.renameSync(tmpPath, path.join(os.homedir(), '.pixel-agents', 'tasks.json'));
            server.broadcast({ type: 'jcTaskUpdate', task });
          }
        }
      });
    };

    taskWatcher = new TaskWatcher(jcConfig as JCConfig, emptyAgents, 5, spawnClaude, true);
  }

  // Helper: intercept broadcast messages to persist to office log
  function writeToOfficeLog(msg: unknown): void {
    const m = msg as { type?: string; [key: string]: unknown };
    if (!m.type) return;

    const findMemberName = (memberId: string): string => {
      const cfg = jcConfig as { members?: Array<{ id: string; name: string; department: string }> };
      const member = cfg?.members?.find((x) => x.id === memberId);
      return member?.name ?? memberId;
    };
    const findMemberDept = (memberId: string): string => {
      const cfg = jcConfig as { members?: Array<{ id: string; department: string }> };
      return cfg?.members?.find((x) => x.id === memberId)?.department ?? 'exec';
    };

    switch (m.type) {
      case 'jcMemberArriving': {
        const memberId = m.memberId as string;
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'arrival',
          summary: `${findMemberName(memberId)} が出社しました`,
          sourceEvent: 'jcMemberArriving',
        });
        break;
      }
      case 'jcMemberLeaving': {
        const memberId = m.memberId as string;
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'departure',
          summary: `${findMemberName(memberId)} が退社しました`,
          sourceEvent: 'jcMemberLeaving',
        });
        break;
      }
      case 'jcMemberStateChange': {
        const memberId = m.memberId as string;
        const jcState = m.jcState as string;
        // Skip unresolvable member IDs (prevents "undefined: → coding" ghost log rows).
        const cfg = jcConfig as { members?: Array<{ id: string }> };
        if (!memberId || !cfg?.members?.some((x) => x.id === memberId)) {
          break;
        }
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'state_change',
          summary: `${findMemberName(memberId)}: → ${jcState}`,
          sourceEvent: 'jcMemberStateChange',
        });
        break;
      }
      case 'jcActivitySummary': {
        const memberId = m.memberId as string;
        const summary = m.summary as string | null;
        if (summary) {
          officeLogWriter.write({
            timestamp: Date.now(),
            memberId,
            memberName: findMemberName(memberId),
            department: findMemberDept(memberId),
            type: 'speech',
            summary: `${findMemberName(memberId)}: ${summary}`,
            sourceEvent: 'jcActivitySummary',
          });
        }
        break;
      }
      case 'jcSpeechBubble': {
        const bubble = m.bubble as { memberId: string; text: string; department: string };
        if (bubble) {
          officeLogWriter.write({
            timestamp: Date.now(),
            memberId: bubble.memberId,
            memberName: findMemberName(bubble.memberId),
            department: bubble.department,
            type: 'speech',
            summary: `${findMemberName(bubble.memberId)}: ${bubble.text}`,
            sourceEvent: 'jcSpeechBubble',
          });
        }
        break;
      }
      case 'jcOfficeEvent': {
        const event = m.event as { event: string; [key: string]: unknown };
        if (event) {
          const evType = event.event;
          let memberId = (event.agent ?? event.from ?? '') as string;
          let summary = evType;
          let logType: 'task_event' | 'delegation' | 'office_event' = 'office_event';

          if (
            evType === 'task_received' ||
            evType === 'task_completed' ||
            evType === 'work_started'
          ) {
            logType = 'task_event';
            summary = `${evType}: ${(event.task as string) ?? ''}`;
          } else if (evType === 'delegate' || evType === 'task_assigned') {
            logType = 'delegation';
            memberId = event.from as string;
            const to = event.to as string | string[];
            const toStr = Array.isArray(to) ? to.join(', ') : to;
            summary = `${findMemberName(memberId)} → ${toStr}: ${(event.task as string) ?? ''}`;
          } else if (evType === 'cross_dept_message') {
            memberId = event.from as string;
            summary = `${findMemberName(memberId)} → ${findMemberName(event.to as string)}: ${(event.message as string) ?? ''}`;
          }

          officeLogWriter.write({
            timestamp: Date.now(),
            memberId,
            memberName: findMemberName(memberId),
            department: findMemberDept(memberId),
            type: logType,
            summary,
            sourceEvent: evType,
          });
        }
        break;
      }
    }
  }

  // jc-events.json path for Owner delegations from the board (Slice1 T10).
  const ownerEventsFile = resolveJcEventsPath(args);
  // Step2: workspace root (claude cwd base) + protected projects root for the
  // scoped-write execute-spawn contract.
  const step2WorkspaceRoot = resolveClaudeWorkspaceRoot(args);
  const step2ProjectsRoot = path.resolve(step2WorkspaceRoot, '..');

  // Start browser server
  const server = await startBrowserServer(extensionPath, port, (data, respond) => {
    const msg = data as { type?: string };

    // When browser signals ready, send ALL current state
    if (msg.type === 'webviewReady') {
      buildClientInitMessages(respond);
      return;
    }

    // ── 依頼(request) flow STEP 2 — template submitted → generate はい/いいえ ──
    // The Owner filled the 3-field 調査 template (目的/知りたいこと/概要) and hit
    // 送信. Fire a READ-ONLY spawn (no `/company`, no permission flags → headless
    // auto-deny-write holds) that reads the template and returns yes/no confirm
    // questions (each with 私の理解). We parse robustly (never crash on bad JSON)
    // and push `jcRequestQuestions` back so the UI shows はい/いいえ cards.
    if (msg.type === 'jcRequestSubmit') {
      const m = data as {
        requestId: string;
        memberId: string;
        department: string;
        purpose: string;
        wants: string;
        overview: string;
        priority: string;
      };
      const priorityNum = parseInt((m.priority || 'P3').replace('P', ''), 10) || 3;
      const req = {
        memberId: m.memberId,
        department: m.department,
        purpose: m.purpose ?? '',
        wants: m.wants ?? '',
        overview: m.overview ?? '',
        priority: priorityNum,
      };
      pendingRequests.set(m.requestId, req);
      const prompt = buildConfirmQuestionsPrompt(req);
      console.log(
        `[JC Request] confirm-questions spawn (read-only) → ${m.memberId}: ${req.purpose.slice(0, 40)}`,
      );
      // Show the researcher is "thinking" while it drafts confirm questions.
      server.broadcast({
        type: 'jcMemberStateChange',
        agentId: -400,
        memberId: m.memberId,
        jcState: 'thinking',
      });
      void spawnScoped({
        prompt,
        cwd: step2WorkspaceRoot, // read-only: confirm-questions spawn carries no write perms
        extraArgs: [], // NO permission flags → auto-deny-write safety valve
        onDone: (output) => {
          const pending = pendingRequests.get(m.requestId);
          if (!pending) return;
          const questions = parseConfirmQuestions(output, pending);
          server.broadcast({
            type: 'jcMemberStateChange',
            agentId: -400,
            memberId: pending.memberId,
            jcState: 'idle',
          });
          server.broadcast({
            type: 'jcRequestQuestions',
            requestId: m.requestId,
            memberId: pending.memberId,
            department: pending.department,
            questions,
          });
          console.log(`[JC Request] ${questions.length} confirm questions → ${pending.memberId}`);
        },
      });
      return;
    }

    // ── 依頼(request) flow STEP 4 — all answered → run the RESEARCH active path ──
    // The Owner answered every adaptive confirm question (picked an option or
    // typed a 「その他」 correction). We bundle those answers into the research
    // task (composeAnswerContext) and run the EXISTING read-only research path
    // (buildResearchPrompt + TaskWatcher.submitTask with label='research') so
    // findings surface in the 調査結果 panel — NO regression to research 能動.
    // Nothing is written; no 〇✕✎ tray is involved.
    if (msg.type === 'jcRequestConfirmed') {
      const d = data as { requestId: string; answers?: ConfirmAnswer[] };
      const pending = pendingRequests.get(d.requestId);
      if (!pending) {
        console.log(`[JC Request] request ${d.requestId?.slice(0, 8)} not found (already run?)`);
        return;
      }
      pendingRequests.delete(d.requestId);
      // Weave the Owner's picks/corrections into the task so the researcher runs
      // with the confirmed interpretation (取り違え消える). Falls back to the plain
      // composed task when no answers were provided.
      const answerCtx = composeAnswerContext(d.answers ?? []);
      const task = composeRequestTask(pending) + answerCtx;
      // Write the arrive→badge→seat→gauge animation events (same as a delegation).
      writeOwnerDelegate(ownerEventsFile, {
        memberId: pending.memberId,
        department: pending.department,
        task: composeRequestTask(pending), // event label stays the bare subject (compact)
        message: '',
        priority: `P${pending.priority}`,
        deadline: null,
        timestamp: new Date().toISOString(),
      });
      if (researchInFlight.has(pending.memberId)) {
        console.log(`[JC Request] research already in flight for ${pending.memberId} — skip`);
      } else if (taskWatcher) {
        researchInFlight.add(pending.memberId);
        const prompt = buildResearchPrompt(task, '');
        console.log(
          `[JC Request] CONFIRMED (${(d.answers ?? []).length} answers) → research active-run → ${pending.memberId}: ${task.slice(0, 40)}`,
        );
        // Reuse the exact research active path: raw read-only prompt + label so
        // completion surfaces the 調査結果 panel (research 能動 unchanged).
        taskWatcher.submitTask(pending.memberId, prompt, pending.priority, undefined, 'research');
      }
      return;
    }

    // ── 依頼(request) flow — cancel a pending request (drop, nothing runs). ──
    if (msg.type === 'jcRequestCancel') {
      const d = data as { requestId: string };
      if (pendingRequests.delete(d.requestId)) {
        console.log(`[JC Request] cancel request ${d.requestId.slice(0, 8)}`);
      }
      return;
    }

    // Slice1 T10: board-click / dock delegation → write to jc-events.json.
    if (msg.type === 'jcOwnerDelegate') {
      const m = data as {
        memberId: string;
        department: string;
        task: string;
        message: string;
        priority: string;
        deadline: string | null;
        timestamp: string;
      };
      // Always write animation events (arrive → badge → seat → gauge). Default-safe.
      writeOwnerDelegate(ownerEventsFile, m);

      if (m.memberId && m.task) {
        // MVP Step1 — classify the card by TYPE. Reuse the existing deterministic
        // classifier (classifyLabel, task-history-writer.ts) over task + criteria.
        const label = classifyLabel(`${m.task} ${m.message ?? ''}`);
        const priorityNum = parseInt((m.priority || 'P3').replace('P', ''), 10) || 3;

        if (label === 'research') {
          // ── RESEARCH = ACTIVE (Owner-confirmed): auto-run, NO approval gate. ──
          // Read-only by construction: a direct plain prompt (no `/company` prefix),
          // and no permission flags — the headless auto-deny-write safety valve holds.
          // Findings return live via jcActivitySummary + completion jcTaskUpdate(result).
          if (researchInFlight.has(m.memberId)) {
            // Minimal guard: same card already investigating → do NOT re-spawn.
            console.log(`[JC] research already in flight for ${m.memberId} — skip re-spawn`);
          } else if (taskWatcher) {
            researchInFlight.add(m.memberId);
            const prompt = buildResearchPrompt(m.task, m.message ?? '');
            console.log(`[JC] research ACTIVE auto-run → ${m.memberId}: ${m.task.slice(0, 40)}`);
            // Submit directly to the TaskWatcher (bypasses the submitTask context
            // that force-prefixes '/company ') so the raw read-only prompt is used.
            // Pass the classified label so the completion broadcast carries
            // label='research' → webview surfaces the 調査結果 panel.
            taskWatcher.submitTask(m.memberId, prompt, priorityNum, undefined, label);
          }
        } else if (liveSpawnEnabled) {
          // ── WRITE-type cards = Fork B (plan → approval → execute). NOT auto-run. ──
          // ⚠ PARKED for 許可制 (2026-07-02 Owner FB pivot): the ambiguous 〇✕✎
          // 承認まち tray was found "わかりづらい/使いづらい" by the Owner and is NO
          // LONGER the 依頼(request) entry. Requests now go through the guided
          // template → はい/いいえ flow above (jcRequestSubmit). This 〇✕✎ machinery
          // is kept intact ONLY for the FUTURE 許可制 (AI-initiated) source. Today
          // the standalone board only ever produces Owner-clicked cards, so this
          // branch is effectively dormant in normal operation.
          // STEP 2 of the flow: fire a READ-ONLY *plan spawn* (no `/company`, no
          // permission flags → headless auto-deny-write holds), then push the plan
          // to the 承認まち tray. The scoped-write *execute spawn* fires ONLY after
          // the Owner clicks 〇 (jcPlanDecision handler below). Under the opt-in
          // --jc-live-spawn guard; without it, write-type cards stay animation-only.
          const planId = crypto.randomUUID();
          const stagingDir = resolveStagingDir(step2WorkspaceRoot, planId);
          // Today every card is Owner-clicked = 依頼制 (requested). AI-initiated
          // (許可制 permitted) is a future source; the field is carried through.
          pendingPlans.set(planId, {
            memberId: m.memberId,
            department: m.department,
            origin: 'requested',
            task: m.task,
            message: m.message ?? '',
            priority: priorityNum,
            stagingDir,
          });
          const planPrompt = buildPlanPrompt(m.task, m.message ?? '', stagingDir);
          console.log(`[JC Step2] PLAN spawn (read-only) → ${m.memberId}: ${m.task.slice(0, 40)}`);
          void spawnScoped({
            prompt: planPrompt,
            cwd: step2WorkspaceRoot, // read-only: plan spawn carries no write perms
            extraArgs: [], // NO permission flags → auto-deny-write safety valve
            onDone: (output) => {
              const pending = pendingPlans.get(planId);
              if (!pending) return;
              server.broadcast({
                type: 'jcPlanReady',
                planId,
                memberId: pending.memberId,
                department: pending.department,
                origin: pending.origin,
                task: pending.task,
                plan: output || '(プランを取得できませんでした。再度お試しください)',
                stagingDir: pending.stagingDir,
              });
            },
          });
        }
      }
      return;
    }

    // Step2 Fork B: Owner's tray decision 〇実行 / ✕却下 / ✎修正.
    if (msg.type === 'jcPlanDecision') {
      const d = data as { planId: string; action: string; comment?: string };
      const pending = pendingPlans.get(d.planId);
      if (!pending) {
        console.log(`[JC Step2] plan ${d.planId?.slice(0, 8)} not found (already decided?)`);
        return;
      }

      if (d.action === 'reject') {
        // ✕ 却下 — nothing runs, no writes, drop the pending plan.
        pendingPlans.delete(d.planId);
        console.log(`[JC Step2] REJECT plan ${d.planId.slice(0, 8)} — no execute spawn`);
        return;
      }

      if (d.action === 'revise') {
        // ✎ 修正 — re-plan (read-only) with the Owner's comment appended. A NEW
        // plan id is issued so the tray shows a fresh card. Nothing executes.
        pendingPlans.delete(d.planId);
        const newPlanId = crypto.randomUUID();
        const stagingDir = resolveStagingDir(step2WorkspaceRoot, newPlanId);
        pendingPlans.set(newPlanId, { ...pending, stagingDir });
        const comment = (d.comment ?? '').trim();
        const revisedCriteria =
          `${pending.message}${comment ? `\n修正指示: ${comment}` : ''}`.trim();
        console.log(`[JC Step2] REVISE plan → new ${newPlanId.slice(0, 8)} (read-only re-plan)`);
        void spawnScoped({
          prompt: buildPlanPrompt(pending.task, revisedCriteria, stagingDir),
          cwd: step2WorkspaceRoot,
          extraArgs: [],
          onDone: (output) => {
            const p = pendingPlans.get(newPlanId);
            if (!p) return;
            server.broadcast({
              type: 'jcPlanReady',
              planId: newPlanId,
              memberId: p.memberId,
              department: p.department,
              origin: p.origin,
              task: p.task,
              plan: output || '(プランを取得できませんでした。再度お試しください)',
              stagingDir: p.stagingDir,
            });
          },
        });
        return;
      }

      if (d.action === 'approve') {
        // 〇 実行 — the ONLY place the scoped-write execute spawn fires. 案1 contract:
        // writes confined to the staging dir; git/network/other paths denied.
        pendingPlans.delete(d.planId);
        try {
          fs.mkdirSync(pending.stagingDir, { recursive: true });
        } catch (e) {
          console.error(`[JC Step2] failed to create staging dir: ${String(e)}`);
        }
        const settings = buildScopedSettings(pending.stagingDir, step2ProjectsRoot);
        const execPrompt = buildExecutePrompt(pending.task, pending.message, pending.stagingDir);
        console.log(
          `[JC Step2] APPROVE → EXECUTE spawn (scoped write) → ${pending.memberId} @ ${pending.stagingDir}`,
        );
        // Surface member activity in the office while the execute spawn runs.
        server.broadcast({
          type: 'jcMemberStateChange',
          agentId: -300,
          memberId: pending.memberId,
          jcState: 'coding',
        });
        void spawnScoped({
          prompt: execPrompt,
          cwd: pending.stagingDir, // cwd = staging so relative writes land here
          extraArgs: ['--settings', settings, '--add-dir', pending.stagingDir],
          onData: (text) => {
            const summary = text.trim().slice(0, 100);
            if (summary) {
              server.broadcast({
                type: 'jcActivitySummary',
                agentId: -300,
                memberId: pending.memberId,
                summary,
              });
            }
          },
          onDone: (output, code) => {
            server.broadcast({
              type: 'jcMemberStateChange',
              agentId: -300,
              memberId: pending.memberId,
              jcState: 'idle',
            });
            server.broadcast({
              type: 'jcActivitySummary',
              agentId: -300,
              memberId: pending.memberId,
              summary:
                code === 0
                  ? `下書きを作成しました → ${pending.stagingDir}`
                  : `実行が完了しました (code ${code})`,
            });
            console.log(`[JC Step2] execute done (code ${code}): ${output.slice(0, 120)}`);
          },
        });
      }
      return;
    }

    // Forward other commands to dispatcher
    dispatcher.dispatch(data, respond);
  });

  // Wire TaskWatcher into dispatcher and start it
  if (taskWatcher) {
    const pseudoWebview = {
      postMessage: (msg: unknown) => {
        server.broadcast(msg);
        writeToOfficeLog(msg);
      },
    };
    taskWatcher.start(pseudoWebview);

    dispatcher.setContext({
      submitTask: (prompt, priority, assignee, workingDirectory) => {
        // Default assignee to first available member if not specified
        const target = assignee ?? jcMembers[0]?.id ?? 'eng-01';
        // Prefix with /company so Cursor's Claude Code invokes the company skill
        const fullPrompt = `/company ${prompt}`;
        taskWatcher!.submitTask(target, fullPrompt, priority, workingDirectory);
      },
      reorderTasks: (taskIds) => taskWatcher!.reorderTasks(taskIds),
      reviewTask: (taskId, action) => taskWatcher!.reviewTask(taskId, action),
      getTaskHistory: (limit, offset) => taskWatcher!.getTaskHistory(limit, offset),
      cancelTask: (taskId) => taskWatcher!.cancelTask(taskId),
      updateTask: (taskId, updates) => {
        if (updates.status) {
          taskWatcher!.updateTaskStatus(taskId, updates.status as any);
        }
      },
      reassignTask: (taskId, newAssignee) => taskWatcher!.reassignTask(taskId, newAssignee),
    });

    // Wire history writer queries and office log into dispatcher
    const historyWriter = taskWatcher.getHistoryWriter();
    dispatcher.setContext({
      queryTaskHistory: (opts) => historyWriter.query(opts),
      updateTaskLabel: (taskId, date, label) =>
        historyWriter.updateLabel(taskId, date, label as any),
      queryOfficeLog: (opts) => officeLogWriter.query(opts),
    });

    console.log(`[JC] TaskWatcher started (watching ~/.pixel-agents/tasks.json)`);
    console.log(`[JC] Task history: ~/.pixel-agents/task-history/`);
    console.log(`[JC] Office log: ~/.pixel-agents/office-log/`);
  }

  // Start event queue watcher (jc-events.json)
  // Resolve workspace root: --workspace= arg > parent dir with jc-events.json > cwd
  let eventWatcher: EventWatcher | null = null;
  if (jcConfig) {
    const wsArg = args.find((a) => a.startsWith('--workspace='));
    let workspaceRoot = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();

    // If cwd is inside pixel-agents, check parent directory for jc-events.json
    // (common case: /company skill writes to cc-company/jc-events.json)
    const parentDir = path.resolve(workspaceRoot, '..');
    const parentEventsFile = path.join(parentDir, 'jc-events.json');
    const cwdEventsFile = path.join(workspaceRoot, 'jc-events.json');
    if (!fs.existsSync(cwdEventsFile) && fs.existsSync(parentEventsFile)) {
      workspaceRoot = parentDir;
      console.log(`[JC] Event watcher using parent directory: ${parentDir}`);
    }

    // Also watch parent if it has a .company/ directory (company skill workspace)
    const parentCompanyDir = path.join(parentDir, '.company');
    if (!wsArg && fs.existsSync(parentCompanyDir)) {
      workspaceRoot = parentDir;
      console.log(`[JC] Detected .company/ in parent — watching ${parentDir}/jc-events.json`);
    }

    eventWatcher = new EventWatcher(jcConfig as JCConfig, workspaceRoot);
    // Create a pseudo-webview that broadcasts to all browser clients + writes to office log
    const pseudoWebview = {
      postMessage: (msg: unknown) => {
        server.broadcast(msg);
        writeToOfficeLog(msg);
      },
    } as any;
    eventWatcher.start(pseudoWebview);
    console.log(`[JC] Event watcher started (watching ${workspaceRoot}/jc-events.json)`);
  }

  console.log(`[JC] Standalone Office Anime server running`);
  console.log(`[JC] Open http://localhost:${port} in your browser`);
  console.log(`[JC] Mode: read-only (no terminal control)`);
  console.log(`[JC] Watching for Claude Code sessions...`);

  // Watch Claude Code project directories
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeDir)) {
    startWatcher(claudeDir, server.broadcast);
  } else {
    console.log(`[JC] Claude projects directory not found: ${claudeDir}`);
    console.log(`[JC] Will show empty office. Start Claude Code to see agents.`);
  }

  // Open browser if requested
  if (shouldOpen) {
    const { exec } = await import('child_process');
    const url = `http://localhost:${port}`;
    const cmd =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
          ? `start "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[JC] Shutting down...');
    taskWatcher?.dispose();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── JSONL Watcher ────────────────────────────────────────────────

let nextAgentId = 1;

/** Per-file JSONL content tracking state */
interface JsonlContentState {
  fileOffset: number;
  lineBuffer: string;
  activeTools: Set<string>;
  memberId: string;
  agentId: number;
}
const jsonlContentStates = new Map<string, JsonlContentState>();

/** Read new lines from a JSONL file and process tool_use/tool_result for animations */
function readAndProcessJsonl(
  filePath: string,
  state: JsonlContentState,
  broadcast: (data: unknown) => void,
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= state.fileOffset) return;

    const readSize = Math.min(stat.size - state.fileOffset, 65536); // 64KB cap
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, state.fileOffset);
    fs.closeSync(fd);
    state.fileOffset += readSize;

    const chunk = state.lineBuffer + buf.toString('utf-8');
    const lines = chunk.split('\n');
    state.lineBuffer = lines.pop() || ''; // Keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue;
      processJsonlLine(line, state, broadcast);
    }
  } catch {
    // File might be mid-write or deleted
  }
}

/** Parse a single JSONL line and broadcast state changes */
function processJsonlLine(
  line: string,
  state: JsonlContentState,
  broadcast: (data: unknown) => void,
): void {
  try {
    const record = JSON.parse(line);
    const content = record.message?.content ?? record.content;

    // assistant record with tool_use blocks → set active animation state
    if (record.type === 'assistant' && Array.isArray(content)) {
      for (const block of content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>) {
        if (block.type === 'tool_use' && block.id && block.name) {
          state.activeTools.add(block.id);
          const jcState = toolToJCState(block.name);

          // Infer which member should animate based on tool file paths
          const inferredMember = block.input
            ? inferMemberFromToolPath(block.name, block.input)
            : null;
          const targetMemberId = inferredMember ?? state.memberId;

          // If inferred member differs, arrive them and broadcast their state
          if (inferredMember && inferredMember !== state.memberId) {
            const member = jcMembers.find((m) => m.id === inferredMember);
            if (member && !assignedMembers.has(inferredMember)) {
              const newAgentId = nextAgentId++;
              assignedMembers.add(inferredMember);
              agentMemberMap[newAgentId] = inferredMember;
              broadcast({
                type: 'jcMemberArriving',
                agentId: newAgentId,
                memberId: inferredMember,
                deskId: member.deskId,
                seatUid: member.deskId,
                hueShift: member.hueShift,
                palette: member.palette ?? 0,
              });
              broadcast({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });
              console.log(
                `[JC] Tool path inferred → ${inferredMember} (${block.name}: ${(block.input?.file_path as string)?.slice(-40) ?? ''})`,
              );
            }
          }

          broadcast({
            type: 'jcMemberStateChange',
            agentId: state.agentId,
            memberId: targetMemberId,
            jcState,
          });
        }
      }
    }

    // user record with tool_result → mark tool done, idle when all tools complete
    if (record.type === 'user' && Array.isArray(content)) {
      for (const block of content as Array<{ type: string; tool_use_id?: string }>) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          state.activeTools.delete(block.tool_use_id);
        }
      }
      if (state.activeTools.size === 0) {
        broadcast({
          type: 'jcMemberStateChange',
          agentId: state.agentId,
          memberId: state.memberId,
          jcState: 'idle',
        });
      }
    }

    // turn_duration system record → turn completed, clear all tools
    if (record.type === 'system' && record.subtype === 'turn_duration') {
      state.activeTools.clear();
      broadcast({
        type: 'jcMemberStateChange',
        agentId: state.agentId,
        memberId: state.memberId,
        jcState: 'idle',
      });
    }
  } catch {
    // Invalid JSON line, skip
  }
}

/** Infer JC member from tool file paths in JSONL content */
function inferMemberFromToolPath(toolName: string, input: Record<string, unknown>): string | null {
  const filePath =
    (input.file_path as string) || (input.path as string) || (input.command as string) || '';
  if (!filePath) return null;

  if (filePath.includes('.company/research') || filePath.includes('assets/shared/research'))
    return 'res-01';
  if (filePath.includes('.company/marketing') || filePath.includes('campaigns/')) return 'mkt-01';
  if (filePath.includes('.company/engineering') || filePath.includes('pixel-agents/'))
    return 'eng-01';
  if (filePath.includes('.company/pm') || filePath.includes('tickets/')) return 'eng-04';
  if (filePath.includes('.company/ceo') || filePath.includes('decisions/')) return 'exec-sec';
  if (filePath.includes('.company/secretary') || filePath.includes('inbox/')) return 'exec-sec';
  return null;
}

/** Register a JSONL file for content tracking and arrive its member */
function registerJsonlAgent(
  filePath: string,
  sessionId: string,
  member: JCMemberEntry,
  broadcast: (data: unknown) => void,
  startOffset: number,
): number {
  const agentId = nextAgentId++;
  activeAgents.set(agentId, { sessionId, file: filePath, memberId: member.id });
  broadcast({ type: 'agentCreated', id: agentId });

  assignedMembers.add(member.id);
  agentMemberMap[agentId] = member.id;

  broadcast({
    type: 'jcMemberArriving',
    agentId,
    memberId: member.id,
    deskId: member.deskId,
    seatUid: member.deskId,
    hueShift: member.hueShift,
    palette: member.palette ?? 0,
  });

  broadcast({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });

  jsonlContentStates.set(filePath, {
    fileOffset: startOffset,
    lineBuffer: '',
    activeTools: new Set(),
    memberId: member.id,
    agentId,
  });

  console.log(`[JC] Agent ${agentId} → ${member.id} (desk: ${member.deskId})`);
  return agentId;
}

/** Collect all JSONL files from a project directory, including subagents/ */
function collectJsonlFiles(projectDir: string): string[] {
  const files: string[] = [];
  try {
    for (const f of fs.readdirSync(projectDir)) {
      if (f.endsWith('.jsonl')) {
        files.push(path.join(projectDir, f));
      }
    }
    // Scan subagents/ subdirectories recursively
    const subagentsDir = path.join(projectDir, 'subagents');
    if (fs.existsSync(subagentsDir) && fs.statSync(subagentsDir).isDirectory()) {
      for (const f of fs.readdirSync(subagentsDir)) {
        if (f.endsWith('.jsonl')) {
          files.push(path.join(subagentsDir, f));
        }
      }
    }
    // Also check session subdirectories (e.g., sessionId/subagents/)
    for (const d of fs.readdirSync(projectDir)) {
      const subDir = path.join(projectDir, d);
      try {
        if (
          !d.endsWith('.jsonl') &&
          d !== 'subagents' &&
          d !== 'memory' &&
          fs.statSync(subDir).isDirectory()
        ) {
          const nestedSubagents = path.join(subDir, 'subagents');
          if (fs.existsSync(nestedSubagents) && fs.statSync(nestedSubagents).isDirectory()) {
            for (const f of fs.readdirSync(nestedSubagents)) {
              if (f.endsWith('.jsonl')) {
                files.push(path.join(nestedSubagents, f));
              }
            }
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  } catch {
    // Ignore read errors
  }
  return files;
}

function startWatcher(claudeDir: string, broadcast: (data: unknown) => void): void {
  const scanProjects = (): void => {
    try {
      const projects = fs.readdirSync(claudeDir);
      for (const project of projects) {
        const projectDir = path.join(claudeDir, project);
        const stat = fs.statSync(projectDir);
        if (!stat.isDirectory()) continue;

        const allFiles = collectJsonlFiles(projectDir);
        for (const filePath of allFiles) {
          const sessionId = path.basename(filePath).replace('.jsonl', '');

          // Skip already tracked
          const isTracked = [...activeAgents.values()].some((a) => a.file === filePath);
          if (isTracked) continue;

          // Only recent files (5 min)
          const fstat = fs.statSync(filePath);
          if (Date.now() - fstat.mtimeMs > 5 * 60 * 1000) continue;

          const member = jcMembers.find((m) => !assignedMembers.has(m.id));
          if (member) {
            registerJsonlAgent(filePath, sessionId, member, broadcast, fstat.size);
          } else {
            console.log(
              `[JC] JSONL detected but no JC member available: ${path.basename(filePath)}`,
            );
          }
        }
      }
    } catch {
      // Ignore scan errors
    }
  };

  // Content poll: read new JSONL lines and update animation states (500ms)
  // Also handles dynamic member re-mapping based on tool paths
  setInterval(() => {
    for (const [filePath, state] of jsonlContentStates) {
      readAndProcessJsonl(filePath, state, broadcast);
    }
  }, 500);

  scanProjects();
  setInterval(scanProjects, 5000);
}

main().catch((err) => {
  console.error('[JC] Fatal error:', err);
  process.exit(1);
});
