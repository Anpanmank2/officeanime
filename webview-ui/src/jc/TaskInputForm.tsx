// ── Just Curious Virtual Office — Task Input Form ─────────────────
// Modal form for submitting a task to a specific member.
// Pixel-art styled, consistent with AbsentStatusPopup.

import { useCallback, useState } from 'react';

interface TaskInputFormProps {
  memberId: string;
  memberName: string;
  position: { x: number; y: number };
  onSubmit: (memberId: string, prompt: string, priority: number, workingDirectory?: string) => void;
  onClose: () => void;
}

export function TaskInputForm({
  memberId,
  memberName,
  position,
  onSubmit,
  onClose,
}: TaskInputFormProps) {
  const [prompt, setPrompt] = useState('');
  const [priority, setPriority] = useState(2);
  const [workDir, setWorkDir] = useState('');

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    onSubmit(memberId, prompt.trim(), priority, workDir.trim() || undefined);
  }, [memberId, prompt, priority, workDir, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)',
        zIndex: 110,
        width: 300,
        background: 'var(--pixel-bg, #0d1117)',
        border: '2px solid var(--pixel-border, #30363d)',
        borderRadius: 0,
        boxShadow: '4px 4px 0 rgba(0, 0, 0, 0.5), inset 1px 1px 0 rgba(255, 255, 255, 0.05)',
        fontSize: '18px',
        color: 'var(--pixel-text, #c9d1d9)',
        animation: 'task-form-appear 150ms ease-out',
        pointerEvents: 'auto',
      }}
      onKeyDown={handleKeyDown}
    >
      <style>{`
        @keyframes task-form-appear {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: '1px solid var(--pixel-border, #30363d)',
          background: 'rgba(63, 185, 80, 0.08)',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '18px' }}>タスク割り当て</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim, #8b949e)',
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: '16px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '8px' }}>
        {/* Assignee (read-only) */}
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #8b949e)',
              display: 'block',
              marginBottom: 2,
            }}
          >
            割り当て先
          </label>
          <div
            style={{
              padding: '4px 6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--pixel-border, #30363d)',
              fontSize: '18px',
              color: '#fff',
            }}
          >
            {memberName}
          </div>
        </div>

        {/* Prompt */}
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #8b949e)',
              display: 'block',
              marginBottom: 2,
            }}
          >
            タスク内容
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Claude Codeへの指示を入力..."
            autoFocus
            style={{
              width: '100%',
              minHeight: 80,
              padding: '4px 6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--pixel-border, #30363d)',
              borderRadius: 0,
              color: 'var(--pixel-text, #c9d1d9)',
              fontSize: '16px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Priority */}
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '14px', color: 'var(--pixel-text-dim, #8b949e)' }}>
            優先度
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            style={{
              padding: '2px 4px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--pixel-border, #30363d)',
              borderRadius: 0,
              color: 'var(--pixel-text, #c9d1d9)',
              fontSize: '16px',
              outline: 'none',
            }}
          >
            <option value={1}>1 - 最高</option>
            <option value={2}>2 - 通常</option>
            <option value={3}>3 - 低</option>
          </select>
        </div>

        {/* Working directory (optional) */}
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #8b949e)',
              display: 'block',
              marginBottom: 2,
            }}
          >
            作業ディレクトリ（オプション）
          </label>
          <input
            type="text"
            value={workDir}
            onChange={(e) => setWorkDir(e.target.value)}
            placeholder="デフォルト: 現在のworkspace"
            style={{
              width: '100%',
              padding: '4px 6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--pixel-border, #30363d)',
              borderRadius: 0,
              color: 'var(--pixel-text, #c9d1d9)',
              fontSize: '15px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '6px 8px',
          borderTop: '1px solid var(--pixel-border, #30363d)',
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim()}
          style={{
            flex: 1,
            padding: '5px 0',
            border: '2px solid var(--pixel-accent, #3fb950)',
            background: prompt.trim() ? 'rgba(63, 185, 80, 0.1)' : 'transparent',
            color: prompt.trim()
              ? 'var(--pixel-accent, #3fb950)'
              : 'var(--pixel-text-dim, #8b949e)',
            fontSize: '18px',
            cursor: prompt.trim() ? 'pointer' : 'default',
            borderRadius: 0,
            textAlign: 'center',
            opacity: prompt.trim() ? 1 : 0.5,
          }}
          onMouseEnter={(e) => {
            if (prompt.trim()) {
              e.currentTarget.style.background = 'var(--pixel-accent, #3fb950)';
              e.currentTarget.style.color = 'var(--pixel-bg, #0d1117)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = prompt.trim()
              ? 'rgba(63, 185, 80, 0.1)'
              : 'transparent';
            e.currentTarget.style.color = prompt.trim()
              ? 'var(--pixel-accent, #3fb950)'
              : 'var(--pixel-text-dim, #8b949e)';
          }}
        >
          ▶ 送信
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px',
            border: '2px solid var(--pixel-border, #30363d)',
            background: 'transparent',
            color: 'var(--pixel-text-dim, #8b949e)',
            fontSize: '18px',
            cursor: 'pointer',
            borderRadius: 0,
            textAlign: 'center',
          }}
        >
          キャンセル
        </button>
      </div>

      {/* Keyboard hint */}
      <div
        style={{
          padding: '2px 8px 4px',
          fontSize: '12px',
          color: 'var(--pixel-text-dim, #8b949e)',
          textAlign: 'right',
          opacity: 0.6,
        }}
      >
        Cmd+Enter で送信 / Esc でキャンセル
      </div>
    </div>
  );
}
