// ── Just Curious — DialogBox ──────────────────────────────────────
// Owner delegation dialog. Opens when Owner clicks a character.
// 4 inputs: purpose (200), acceptance criteria (300), priority, deadline.
// ESC = cancel, Cmd/Ctrl+Enter = confirm (if valid).
// On confirm: postMessage 'jcOwnerDelegate' to extension.
//
// Spec: .company/engineering/docs/2026-05-05-dialogbox-spec.md

import { useCallback, useEffect, useRef, useState } from 'react';

import { vscode } from '../vscodeApi.js';

// ── Types ────────────────────────────────────────────────────────

type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

type DeadlineOption = '今日中' | '24h' | '72h' | '1週間' | '期限なし';

const PRIORITY_LABELS: Record<Priority, string> = {
  P0: 'P0 — Owner直接',
  P1: 'P1 — Critical',
  P2: 'P2 — High',
  P3: 'P3 — Normal',
  P4: 'P4 — Low',
};

const DEADLINE_OPTIONS: DeadlineOption[] = ['今日中', '24h', '72h', '1週間', '期限なし'];

function resolveDeadline(option: DeadlineOption): string | null {
  const now = Date.now();
  switch (option) {
    case '今日中': {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    case '24h':
      return new Date(now + 86_400_000).toISOString();
    case '72h':
      return new Date(now + 259_200_000).toISOString();
    case '1週間':
      return new Date(now + 604_800_000).toISOString();
    case '期限なし':
      return null;
  }
}

function getDepartmentFromMemberId(memberId: string): string {
  if (memberId.startsWith('exec')) return 'exec';
  if (memberId.startsWith('eng')) return 'engineering';
  if (memberId.startsWith('mkt')) return 'marketing';
  if (memberId.startsWith('res')) return 'research';
  return 'unknown';
}

// ── Props ────────────────────────────────────────────────────────

export interface DialogBoxProps {
  memberId: string;
  memberName: string;
  onClose: () => void;
}

// ── Styles (pixel art aesthetic matching codebase) ───────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.65)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const dialogStyle: React.CSSProperties = {
  background: 'var(--pixel-bg, #1e1e2e)',
  border: '2px solid var(--pixel-border, #3a3a5c)',
  borderRadius: 0,
  boxShadow: '4px 4px 0px #0a0a14',
  padding: '20px 24px',
  width: 480,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const headerStyle: React.CSSProperties = {
  fontSize: '18px',
  color: 'var(--pixel-accent, #5a8cff)',
  fontWeight: 'bold',
  borderBottom: '1px solid var(--pixel-border, #3a3a5c)',
  paddingBottom: 10,
  marginBottom: 2,
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'rgba(200, 210, 240, 0.75)',
  marginBottom: 4,
  display: 'block',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '2px solid var(--pixel-border, #3a3a5c)',
  borderRadius: 0,
  color: 'rgba(220, 230, 255, 0.9)',
  fontSize: '13px',
  padding: '6px 8px',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 40, 0.9)',
  border: '2px solid var(--pixel-border, #3a3a5c)',
  borderRadius: 0,
  color: 'rgba(220, 230, 255, 0.9)',
  fontSize: '13px',
  padding: '5px 8px',
  width: '100%',
  fontFamily: 'inherit',
};

const charCountStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'rgba(200, 210, 240, 0.45)',
  textAlign: 'right',
  marginTop: 2,
};

const btnRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  marginTop: 4,
};

const btnBaseStyle: React.CSSProperties = {
  padding: '6px 18px',
  fontSize: '13px',
  borderRadius: 0,
  cursor: 'pointer',
  border: '2px solid',
  fontFamily: 'inherit',
};

// ── Component ────────────────────────────────────────────────────

export function DialogBox({ memberId, memberName, onClose }: DialogBoxProps) {
  const [purpose, setPurpose] = useState('');
  const [criteria, setCriteria] = useState('');
  const [priority, setPriority] = useState<Priority>('P3');
  const [deadline, setDeadline] = useState<DeadlineOption>('期限なし');

  const purposeRef = useRef<HTMLTextAreaElement>(null);
  const isValid = purpose.trim().length > 0;

  // Focus purpose field on open
  useEffect(() => {
    purposeRef.current?.focus();
  }, []);

  // ESC to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      // Cmd+Enter or Ctrl+Enter to confirm
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isValid) {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, purpose, criteria, priority, deadline]);

  const handleConfirm = useCallback(() => {
    if (!isValid) return;

    const timestamp = new Date().toISOString();
    const deadlineValue = resolveDeadline(deadline);
    const department = getDepartmentFromMemberId(memberId);

    // Emit jcOwnerDelegate to extension
    try {
      vscode.postMessage({
        type: 'jcOwnerDelegate',
        memberId,
        memberName,
        department,
        task: purpose.trim(),
        message: criteria.trim(),
        priority,
        deadline: deadlineValue,
        timestamp,
      });
    } catch {
      // ignore in browser dev mode
    }

    onClose();
  }, [isValid, purpose, criteria, priority, deadline, memberId, memberName, onClose]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>{memberName} に委任</div>

        {/* Purpose */}
        <div>
          <label style={labelStyle}>目的 *</label>
          <textarea
            ref={purposeRef}
            style={{ ...textareaStyle, minHeight: 72 }}
            maxLength={200}
            placeholder="例: 新規コンテンツのアイデアをリサーチして3案まとめてほしい"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <div style={charCountStyle}>{purpose.length} / 200</div>
        </div>

        {/* Acceptance Criteria */}
        <div>
          <label style={labelStyle}>完了条件</label>
          <textarea
            style={{ ...textareaStyle, minHeight: 60 }}
            maxLength={300}
            placeholder="例: 競合3社と自社の比較表、各案のメリット・デメリット付きで提出すること"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <div style={charCountStyle}>{criteria.length} / 300</div>
        </div>

        {/* Priority + Deadline row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>優先度</label>
            <select
              style={selectStyle}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>期限</label>
            <select
              style={selectStyle}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value as DeadlineOption)}
            >
              {DEADLINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div style={btnRowStyle}>
          <button
            style={{
              ...btnBaseStyle,
              background: 'transparent',
              borderColor: 'rgba(100, 140, 255, 0.3)',
              color: 'rgba(200, 210, 240, 0.7)',
            }}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            style={{
              ...btnBaseStyle,
              background: isValid ? 'rgba(90, 140, 255, 0.2)' : 'rgba(90, 140, 255, 0.06)',
              borderColor: isValid ? 'rgba(90, 140, 255, 0.7)' : 'rgba(90, 140, 255, 0.2)',
              color: isValid ? '#5a8cff' : 'rgba(90, 140, 255, 0.3)',
              cursor: isValid ? 'pointer' : 'default',
            }}
            disabled={!isValid}
            onClick={handleConfirm}
            title="委任する (Cmd+Enter)"
          >
            委任する
          </button>
        </div>
      </div>
    </div>
  );
}
