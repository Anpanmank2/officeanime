// ── 依頼(request) flow panel (screen-space DOM) ─────────────────────────
// 2026-07-02 Owner FB pivot #2. The confirm step is now ADAPTIVE MULTI-CHOICE —
// the same shape as the secretary's AskUserQuestion to the Owner (for the
// Research「調査」pilot):
//   ① 3項目テンプレフォーム 〔目的 / 知りたいこと / ざっくり概要〕→ 送信
//   ② 送信 → READ-ONLY spawn が 確認質問(各"私の理解" + 候補オプション2〜4)を生成
//   ③ 1問ずつ: [オプション選択] or [その他 → インライン入力で一言補正] → 次へ
//   ④ 全問回答 → 選んだ答え/打った補正を束ねて 実行(既存 research 能動パス)
//
// ★ No form bounce: 補正はインラインの その他 textarea。旧 [ちがう→直す] の
// フォーム戻しは廃止。選ぶ or 一言書くだけでピンポイント補正できる。
//
// Intent/display layer only: posts jcRequestSubmit / jcRequestConfirmed /
// jcRequestCancel to the extension; never spawns or touches permissions here
// (mirrors ResearchResultPanel / ApprovalTray "display-layer only" contract).
//
// Pixel-art style mirrors ResearchResultPanel: sharp corners (borderRadius: 0),
// solid dark bg, 2px solid border, hard offset shadow (2px 2px 0px #0a0a14, no
// blur), FS Pixel Sans (global).

import { useEffect, useState } from 'react';

import { vscode } from '../vscodeApi.js';
import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import {
  allQuestionsConfirmed,
  answerRequestQuestion,
  closeRequestFlow,
  getRequestAnswers,
  getRequestFlow,
  markRequestAwaiting,
  type RequestFlow,
  type RequestTemplate,
  setRequestField,
  subscribeRequestFlow,
} from './request-flow-state.js';

/** Label the UI always appends so free-text correction is always available. */
const OTHER_LABEL = 'その他（自分で書く）';

interface FieldMeta {
  key: keyof RequestTemplate;
  label: string;
  placeholder: string;
}

/**
 * kind別のカード表示メタ (2026-07-02 横展開)。テンプレは全カード共通の
 * 「問いかけ型 3項目 + 例題 + ざっくりでOK」トーン。keys は共通
 * (purpose/wants/overview) でラベルだけ部署別 — backend の KIND_FIELD_LABELS と対。
 */
const KIND_META: Record<string, { title: string; intro: string; fields: FieldMeta[] }> = {
  // Research 📋 調査 — 現行 pilot（無改変）
  research: {
    title: '調査を依頼',
    intro: '調べたいことを3つ、ざっくりでOK。分からない欄は空でも大丈夫。古賀が確認して詰めます。',
    fields: [
      {
        key: 'purpose',
        label: '何のために調べる？',
        placeholder: '例: 国内ポーカー市場が伸びてるか掴んで、新しい大会を開くか判断したい',
      },
      {
        key: 'wants',
        label: '何を知りたい？',
        placeholder: '例: プレイヤー人口の推移／競合大会（戦国・SPADIE等）の集客・参加費・客層',
      },
      {
        key: 'overview',
        label: 'どの範囲を調べる？（対象・期間）',
        placeholder: '例: 国内アミューズメントポーカー・直近2〜3年・20〜40代中心',
      },
    ],
  },
  // Marketing 📊 市場調査 — read型（research能動パス流用・例題だけマーケ寄り）
  market: {
    title: '市場調査を依頼',
    intro: '調べたいことを3つ、ざっくりでOK。分からない欄は空でも大丈夫。担当が確認して詰めます。',
    fields: [
      {
        key: 'purpose',
        label: '何のために調べる？',
        placeholder: '例: 福岡大会の広告をどこに出すか決めたい。読み手はマーケチーム',
      },
      {
        key: 'wants',
        label: '何を知りたい？',
        placeholder: '例: 競合大会の集客チャネル／ポーカー層に届く媒体と広告相場',
      },
      {
        key: 'overview',
        label: 'どの範囲を調べる？（対象・期間）',
        placeholder: '例: 九州のアミューズ施設と広告媒体・直近1年',
      },
    ],
  },
  // Marketing 📄 資料 — write型
  doc: {
    title: '資料を依頼',
    intro:
      '作ってほしい資料のこと、ざっくりでOK。分からない欄は空でも大丈夫。下書き置き場にドラフトを作ります。',
    fields: [
      {
        key: 'purpose',
        label: '誰に見せる資料？',
        placeholder: '例: 協賛候補の企業さん（JOPTを初めて知る人）',
      },
      {
        key: 'wants',
        label: '何を伝えたい？',
        placeholder: '例: 大会の集客規模と、協賛すると何が得かを信じてもらいたい',
      },
      {
        key: 'overview',
        label: 'どんな形にする？（1枚もの・スライド・文章）',
        placeholder: '例: スライド10枚くらい、グラフ多め・文字少なめ',
      },
    ],
  },
  // Eng 🔧 実装 — write型（成果物=コード一式+適用手順のドラフト。本物には書かない）
  impl: {
    title: '実装を依頼',
    intro:
      '作りたい・直したいこと、ざっくりでOK。分からない欄は空でも大丈夫。下書き置き場に「コード一式+適用手順」のドラフトを作ります（本物のリポには書きません）。',
    fields: [
      {
        key: 'purpose',
        label: '何を作る・直す？',
        placeholder: '例: 大会スケジュールのCSVを読み込んで一覧表示する画面',
      },
      {
        key: 'wants',
        label: 'できたと言える条件は？',
        placeholder: '例: CSVを置いたら一覧が出て、日付で絞り込める',
      },
      {
        key: 'overview',
        label: '対象はどこ？',
        placeholder: '例: pixel-agents の画面まわり（分からなければ空でOK）',
      },
    ],
  },
};

function panelStyle(accent: string): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 62, // above ApprovalTray(61)/ResearchResultPanel(60), below DialogBox(65+)
    width: 'min(560px, 82%)',
    maxHeight: '78%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--pixel-bg)',
    color: 'var(--pixel-text)',
    border: `2px solid ${accent}`,
    borderRadius: 0,
    boxShadow: '2px 2px 0px #0a0a14',
    pointerEvents: 'auto',
  };
}

function Header({ flow, accent, title }: { flow: RequestFlow; accent: string; title: string }) {
  const deptLabel = DEPT_LABELS[flow.department] ?? flow.department.toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: `${accent}22`,
        borderBottom: `2px solid ${accent}`,
        padding: '8px 12px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            color: accent,
            border: `1px solid ${accent}`,
            padding: '1px 6px',
            letterSpacing: '1px',
            flexShrink: 0,
          }}
        >
          {deptLabel}
        </span>
        <span style={{ fontSize: 15, fontWeight: 'bold', color: accent, flexShrink: 0 }}>
          {title}
        </span>
        <span
          style={{
            fontSize: 14,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${flow.memberName} (${flow.memberId})`}
        >
          {flow.memberName}
        </span>
      </div>
      <button
        onClick={() => {
          vscode.postMessage({ type: 'jcRequestCancel', requestId: flow.id });
          closeRequestFlow();
        }}
        title="閉じる"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 2px',
          color: 'var(--pixel-close-text)',
          lineHeight: 1,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--pixel-close-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--pixel-close-text)')}
      >
        ✕
      </button>
    </div>
  );
}

// ── Phase 1: the 3-field template form ──────────────────────────────────
function TemplateForm({ flow, accent }: { flow: RequestFlow; accent: string }) {
  // ── Local synchronous text state (charloss fix) ──────────────────────────
  // The textareas are controlled. The store (request-flow-state.ts) defers its
  // notify via requestAnimationFrame, so if `value` were driven straight off
  // `flow.template`, React would re-render the input with a STALE value between
  // the keystroke and the rAF flush — clobbering fast / IME input (only slow
  // typing survives). Fix: hold the text in local React state so onChange
  // updates `value` synchronously (never via rAF). The store's rAF notify stays
  // intact for its other consumers (questions/phase/subscribe).
  // onCompositionEnd re-syncs the final IME segment as a belt-and-suspenders so
  // the last committed segment is never dropped.
  const [local, setLocal] = useState<RequestTemplate>(() => ({ ...flow.template }));

  const setField = (key: keyof RequestTemplate, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit =
    local.purpose.trim() !== '' || local.wants.trim() !== '' || local.overview.trim() !== '';

  const submit = () => {
    if (!canSubmit) return;
    // Flush the synchronous local values into the store so the store stays
    // consistent for any consumer, then submit the local values directly.
    setRequestField('purpose', local.purpose);
    setRequestField('wants', local.wants);
    setRequestField('overview', local.overview);
    markRequestAwaiting();
    vscode.postMessage({
      type: 'jcRequestSubmit',
      requestId: flow.id,
      memberId: flow.memberId,
      department: flow.department,
      kind: flow.kind,
      purpose: local.purpose,
      wants: local.wants,
      overview: local.overview,
      priority: `P${flow.priority}`,
    });
  };

  const meta = KIND_META[flow.kind] ?? KIND_META.research;

  return (
    <>
      <div
        style={{
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--pixel-text-dim)',
          borderBottom: '1px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        {meta.intro}
      </div>
      <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {meta.fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                color: accent,
                marginBottom: 4,
              }}
            >
              {f.label}
            </label>
            <textarea
              autoFocus={f.key === 'purpose'}
              value={local[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              onCompositionEnd={(e) => {
                // Ensure the final committed IME segment is captured even if the
                // browser fires compositionend after the last input event.
                setField(f.key, e.currentTarget.value);
              }}
              placeholder={f.placeholder}
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#0a0a14',
                color: '#e8e8f4',
                border: '1px solid var(--pixel-border)',
                borderRadius: 0,
                fontSize: 13,
                padding: '6px 8px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px', flexShrink: 0 }}>
        <button
          data-request-submit
          onClick={submit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit ? '#0a2a15' : '#181820',
            color: canSubmit ? '#39ff14' : '#555',
            border: `1px solid ${canSubmit ? '#39ff14' : '#333'}`,
            borderRadius: 0,
            fontSize: 14,
            padding: '7px 0',
            cursor: canSubmit ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          送信
        </button>
      </div>
    </>
  );
}

// ── Phase 2: awaiting the confirm questions from the read-only spawn ──────
function Awaiting({ accent }: { accent: string }) {
  return (
    <div
      style={{
        padding: '28px 16px',
        textAlign: 'center',
        color: 'var(--pixel-text-dim)',
        fontSize: 14,
      }}
    >
      <div style={{ color: accent, fontSize: 15, marginBottom: 8 }}>依頼内容を読んでいます…</div>
      <div style={{ fontSize: 12 }}>担当が確認したい点を まとめています(読み取りのみ)。</div>
    </div>
  );
}

// ── Phase 3: adaptive multi-choice confirm loop (1問ずつ・私の理解 前出し) ──
// AskUserQuestion shape: 私の理解 + 質問 + 候補オプション2〜4 + その他(インライン入力).
// - オプション選択 → その質問の答えを確定 → 次へ。
// - その他選択 → インライン textarea が開く → 一言補正を打つ → 確定 → 次へ。
// ★ charloss guard: the その他 textarea is controlled by a LOCAL synchronous
//   useState (never the rAF-deferred store) + onCompositionEnd, exactly like the
//   TemplateForm — a rAF-store-driven value here would drop fast / IME input.
function ConfirmLoop({ flow, accent }: { flow: RequestFlow; accent: string }) {
  const total = flow.questions.length;
  const idx = flow.questionIdx;
  const q = flow.questions[idx];

  // ── その他 inline input state (charloss-safe: local + rAF-free) ────────────
  // `otherOpen` toggles the inline textarea; `otherText` holds the correction.
  // Both reset per question via the `idx` key on the sub-component (see render).
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  if (!q) return null;

  // Options the spawn returned, capped 2〜4 and de-duped; the UI always appends
  // 「その他」 and guarantees at least one affirmative even if the spawn returned
  // none (defensive — parser already filters, this is belt-and-suspenders).
  const spawnOptions = Array.from(new Set((q.options ?? []).map((o) => o.trim()).filter(Boolean)));
  const baseOptions = spawnOptions.length > 0 ? spawnOptions.slice(0, 4) : ['はい、合っています'];

  // Record an answer (picked option OR typed 「その他」) then advance; if that was
  // the last question, bundle every answer into jcRequestConfirmed and run.
  const recordAndAdvance = (answer: string, isOther: boolean) => {
    answerRequestQuestion(answer, isOther);
    setOtherOpen(false);
    setOtherText('');
    if (allQuestionsConfirmed()) {
      vscode.postMessage({
        type: 'jcRequestConfirmed',
        requestId: flow.id,
        answers: getRequestAnswers(),
      });
      closeRequestFlow();
    }
  };

  const submitOther = () => {
    const text = otherText.trim();
    if (!text) return;
    recordAndAdvance(text, true);
  };

  return (
    <div style={{ padding: '12px 14px 14px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--pixel-text-dim)', marginBottom: 10 }}>
        確認 {idx + 1} / {total}
      </div>

      {/* 私の理解 (前出し) */}
      <div
        style={{
          background: `${accent}14`,
          border: `1px solid ${accent}`,
          borderRadius: 0,
          padding: '8px 10px',
          marginBottom: 10,
        }}
      >
        <span style={{ color: accent, fontSize: 12, marginRight: 6 }}>私の理解</span>
        {/* pre-wrap: write型の plan確認(①②③ + 書き先パス)を改行のまま読めるように */}
        <div
          style={{
            color: '#e8e8f4',
            fontSize: 14,
            lineHeight: 1.6,
            marginTop: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {q.understanding}
        </div>
      </div>

      {/* 質問 */}
      <div style={{ color: '#fff', fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>
        {q.question}
      </div>

      {/* 候補オプション（縦積み・押しやすく） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {baseOptions.map((opt, i) => (
          <button
            key={`${idx}-opt-${i}`}
            data-request-option
            onClick={() => recordAndAdvance(opt, false)}
            style={{
              textAlign: 'left',
              background: '#0a2a15',
              color: '#39ff14',
              border: '1px solid #39ff14',
              borderRadius: 0,
              fontSize: 14,
              padding: '8px 10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          >
            {opt}
          </button>
        ))}

        {/* その他（選択 or 入力） */}
        {!otherOpen ? (
          <button
            data-request-other
            onClick={() => setOtherOpen(true)}
            title="どれも違う → 一言だけ補正を書く"
            style={{
              textAlign: 'left',
              background: '#2a2008',
              color: '#f0d840',
              border: '1px solid #f0d840',
              borderRadius: 0,
              fontSize: 14,
              padding: '8px 10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {OTHER_LABEL}
          </button>
        ) : (
          <div
            style={{
              border: '1px solid #f0d840',
              borderRadius: 0,
              padding: '8px 10px',
              background: '#181410',
            }}
          >
            <div style={{ color: '#f0d840', fontSize: 12, marginBottom: 6 }}>
              自分の言葉で補足（この項目だけ直せます）
            </div>
            <textarea
              data-request-other-input
              autoFocus
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onCompositionEnd={(e) => setOtherText(e.currentTarget.value)}
              placeholder="例: 客層は20代より30代に絞って調べて"
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#0a0a14',
                color: '#e8e8f4',
                border: '1px solid var(--pixel-border)',
                borderRadius: 0,
                fontSize: 13,
                padding: '6px 8px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                data-request-other-submit
                onClick={submitOther}
                disabled={otherText.trim() === ''}
                style={{
                  flex: 1,
                  background: otherText.trim() ? '#0a2a15' : '#181820',
                  color: otherText.trim() ? '#39ff14' : '#555',
                  border: `1px solid ${otherText.trim() ? '#39ff14' : '#333'}`,
                  borderRadius: 0,
                  fontSize: 14,
                  padding: '7px 0',
                  cursor: otherText.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                これで確定 → 次へ
              </button>
              <button
                onClick={() => {
                  setOtherOpen(false);
                  setOtherText('');
                }}
                style={{
                  background: 'none',
                  color: 'var(--pixel-text-dim)',
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  fontSize: 13,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                戻る
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function RequestFlowPanel() {
  const [flow, setFlow] = useState<RequestFlow | null>(getRequestFlow);

  useEffect(() => {
    const update = () => setFlow(getRequestFlow());
    update();
    return subscribeRequestFlow(update);
  }, []);

  if (!flow) return null;

  const accent = DEPT_COLORS[flow.department] ?? '#00e676';
  const formTitle = (KIND_META[flow.kind] ?? KIND_META.research).title;
  const title =
    flow.phase === 'form' ? formTitle : flow.phase === 'awaiting' ? '確認中' : 'すり合わせ';

  return (
    <div
      data-request-flow
      data-request-id={flow.id}
      data-request-kind={flow.kind}
      style={panelStyle(accent)}
    >
      <Header flow={flow} accent={accent} title={title} />
      {flow.phase === 'form' && <TemplateForm flow={flow} accent={accent} />}
      {flow.phase === 'awaiting' && <Awaiting accent={accent} />}
      {flow.phase === 'confirming' && (
        // key by question index → ConfirmLoop remounts per question so the
        // その他 inline-input local state (open/text) starts fresh each time.
        <ConfirmLoop key={flow.questionIdx} flow={flow} accent={accent} />
      )}
    </div>
  );
}
