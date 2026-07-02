// ── Approval Tray panel (screen-space DOM) ─────────────────────────────
// MVP Step2 — Fork B. Surfaces the PENDING PLANS produced by read-only plan
// spawns so the Owner can decide 〇実行 / ✕却下 / ✎修正 per card WITHOUT opening
// the Tasks panel. Sits next to ResearchResultPanel (bottom-right column).
//
// Each card shows: 誰が上げた (origin + member) / 何をする (task) / 手順①②③
// (plan body) / 書き込み先 (staging dir) / 〇✕✎ buttons. Top badge: 承認まち N件.
//
// Intent-only display layer: the Owner's decision posts `jcPlanDecision` back to
// the extension, which is the ONLY place the scoped-write execute spawn fires.
// This component never spawns or touches permissions itself (mirrors
// ResearchResultPanel's "display-layer only" contract).
//
// Pixel-art style mirrors ResearchResultPanel / CompletionToast: sharp corners
// (borderRadius: 0), solid dark bg, 2px solid border, hard offset shadow
// (2px 2px 0px #0a0a14, no blur), FS Pixel Sans (global).

import { useEffect, useState } from 'react';

import { vscode } from '../vscodeApi.js';
import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import {
  getAwaitingCount,
  getPlans,
  type PlanCard,
  removePlan,
  subscribePlans,
} from './plan-state.js';

/** Post the Owner's decision to the extension and drop the card from the tray. */
function decide(card: PlanCard, action: 'approve' | 'reject' | 'revise', comment?: string): void {
  vscode.postMessage({
    type: 'jcPlanDecision',
    planId: card.id,
    action,
    comment: comment ?? '',
  });
  // Remove immediately: approve→executing, reject→gone. For revise the backend
  // will push a fresh jcPlanReady (new plan id) so a new card appears.
  removePlan(card.id);
}

function ReviseBox({ card, onDone }: { card: PlanCard; onDone: () => void }) {
  const [text, setText] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="修正したい点を書いてください（例: 出力先を別ファイルに / 手順②を省略）"
        rows={2}
        style={{
          background: '#0a0a14',
          color: '#e8e8f4',
          border: '1px solid var(--pixel-border)',
          borderRadius: 0,
          fontSize: 12,
          padding: '4px 6px',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => decide(card, 'revise', text.trim())}
          disabled={!text.trim()}
          style={{
            flex: 1,
            background: text.trim() ? '#3a2e10' : '#222',
            color: text.trim() ? '#f0d840' : '#666',
            border: '1px solid #f0d840',
            borderRadius: 0,
            fontSize: 12,
            padding: '4px 0',
            cursor: text.trim() ? 'pointer' : 'default',
          }}
        >
          修正して再プラン
        </button>
        <button
          onClick={onDone}
          style={{
            background: 'none',
            color: 'var(--pixel-text-dim)',
            border: '1px solid var(--pixel-border)',
            borderRadius: 0,
            fontSize: 12,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}

function TrayCard({ card }: { card: PlanCard }) {
  const [revising, setRevising] = useState(false);
  const accent = DEPT_COLORS[card.department] ?? '#f0d840';
  const deptLabel = DEPT_LABELS[card.department] ?? card.department.toUpperCase();
  const originLabel = card.origin === 'requested' ? '依頼' : '許可まち';

  return (
    <div
      data-approval-card
      style={{
        background: 'var(--pixel-bg)',
        border: `2px solid ${accent}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        marginBottom: 8,
      }}
    >
      {/* Header: origin + dept + member */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: `${accent}22`,
          borderBottom: `2px solid ${accent}`,
          padding: '6px 10px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: '#0a0a14',
            background: accent,
            padding: '1px 5px',
            borderRadius: 0,
            flexShrink: 0,
          }}
        >
          {originLabel}
        </span>
        <span
          style={{
            fontSize: 11,
            color: accent,
            border: `1px solid ${accent}`,
            padding: '1px 5px',
            flexShrink: 0,
          }}
        >
          {deptLabel}
        </span>
        <span
          style={{
            fontSize: 13,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${card.memberName} (${card.memberId})`}
        >
          {card.memberName}
        </span>
      </div>

      {/* Task (何をする) */}
      <div
        style={{
          padding: '6px 10px 2px',
          fontSize: 12,
          color: 'var(--pixel-text-dim)',
        }}
      >
        <span style={{ color: accent, marginRight: 6 }}>何をする:</span>
        <span style={{ color: '#fff' }}>{card.task}</span>
      </div>

      {/* Plan body (手順①②③ / 推定コスト・規模) */}
      <div
        style={{
          padding: '4px 10px 8px',
          fontSize: 12,
          lineHeight: 1.55,
          color: '#e8e8f4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 200,
          overflowY: 'auto',
        }}
      >
        {card.plan}
      </div>

      {/* Write target (書き込み先 = 下書き置き場) */}
      <div
        style={{
          padding: '2px 10px 8px',
          fontSize: 11,
          color: 'var(--pixel-text-dim)',
          borderTop: '1px solid var(--pixel-border)',
        }}
      >
        <span style={{ color: accent, marginRight: 6 }}>書き込み先(下書き):</span>
        <span style={{ color: '#9fb0d0', wordBreak: 'break-all' }} title={card.stagingDir}>
          {card.stagingDir}
        </span>
      </div>

      {/* Decision buttons 〇 / ✕ / ✎ */}
      {!revising ? (
        <div style={{ display: 'flex', gap: 6, padding: '0 10px 10px' }}>
          <button
            onClick={() => decide(card, 'approve')}
            title="この plan で実行（下書き置き場のみに書き込み）"
            style={{
              flex: 1,
              background: '#0a2a15',
              color: '#39ff14',
              border: '1px solid #39ff14',
              borderRadius: 0,
              fontSize: 13,
              padding: '5px 0',
              cursor: 'pointer',
            }}
          >
            〇 実行
          </button>
          <button
            onClick={() => decide(card, 'reject')}
            title="却下（何も実行しない）"
            style={{
              flex: 1,
              background: '#300a1a',
              color: '#ff6b8a',
              border: '1px solid #ff6b8a',
              borderRadius: 0,
              fontSize: 13,
              padding: '5px 0',
              cursor: 'pointer',
            }}
          >
            ✕ 却下
          </button>
          <button
            onClick={() => setRevising(true)}
            title="修正して再プラン"
            style={{
              background: '#2a2008',
              color: '#f0d840',
              border: '1px solid #f0d840',
              borderRadius: 0,
              fontSize: 13,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            ✎ 修正
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 10px 10px' }}>
          <ReviseBox card={card} onDone={() => setRevising(false)} />
        </div>
      )}
    </div>
  );
}

export function ApprovalTray() {
  const [plans, setPlans] = useState<PlanCard[]>(getPlans);

  useEffect(() => {
    const update = () => setPlans([...getPlans()]);
    update();
    return subscribePlans(update);
  }, []);

  if (plans.length === 0) return null;

  const awaiting = getAwaitingCount();

  return (
    <div
      data-approval-tray
      style={{
        position: 'absolute',
        top: 56,
        right: 12,
        zIndex: 61, // above CommandBoard/OfficeLog, alongside ResearchResultPanel(60)
        width: 'min(340px, 40%)',
        maxHeight: '70%',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      {/* Badge: 承認まち N件 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#2a2008',
          border: '2px solid #f0d840',
          borderRadius: 0,
          boxShadow: '2px 2px 0px #0a0a14',
          padding: '6px 10px',
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 'bold', color: '#f0d840' }}>承認まち</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: '#0a0a14',
            background: '#f0d840',
            borderRadius: 0,
            padding: '0 8px',
            minWidth: 22,
            textAlign: 'center',
          }}
        >
          {awaiting}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(240,216,64,0.7)' }}>件</span>
      </div>

      {/* Scrollable card list */}
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {plans.map((card) => (
          <TrayCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
