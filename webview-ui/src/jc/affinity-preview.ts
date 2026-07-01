// ── Slice1 T10: webview-side affinity PREVIEW (pure, no fs) ─────────────
// Used only to show the ◎/△/✗ preview badge while the Owner hovers a picked
// task card over a member. The AUTHORITATIVE fit is still computed backend-side
// (src/jc/affinity.ts) on the real delegate event. This is a deliberate mirror
// of the ① department FIT table + label regexes so the preview matches what the
// backend will assign (member-bonus ② is not previewed — safe under-promise).

import type { GameTier } from './game-state.js';

/** Mirror of src/jc/task-history-writer.ts classifyLabel (label regexes). */
function classifyLabel(prompt: string): string {
  const rules: Array<{ label: string; pattern: RegExp }> = [
    {
      label: 'incident',
      pattern: /\b(incident|outage|down|hotfix|emergency|urgent\s*fix|revert|障害|緊急)\b/i,
    },
    {
      label: 'bugfix',
      pattern: /\b(bug|fix|error|crash|broken|regression|patch|バグ|修正|不具合)\b/i,
    },
    {
      label: 'review',
      pattern: /\b(review|audit|check|inspect|approve|feedback|PR\s*review|レビュー|確認)\b/i,
    },
    {
      label: 'research',
      pattern: /\b(research|investigate|analyze|study|survey|explore|調査|分析|リサーチ|調べ)\b/i,
    },
    {
      label: 'design',
      pattern: /\b(design|UI|UX|layout|wireframe|mockup|prototype|デザイン|設計)\b/i,
    },
    {
      label: 'ops',
      pattern: /\b(deploy|CI|CD|pipeline|infra|monitor|ops|config|migration|設定|デプロイ|運用)\b/i,
    },
    {
      label: 'implementation',
      pattern: /\b(implement|build|create|add|develop|feature|write|code|実装|開発|作成|追加)\b/i,
    },
  ];
  for (const { label, pattern } of rules) {
    if (pattern.test(prompt)) return label;
  }
  return 'other';
}

/** Mirror of src/jc/affinity.ts FIT table (① department path). */
const FIT: Record<string, Record<string, number>> = {
  implementation: { engineering: 2, marketing: 0, research: 0 },
  bugfix: { engineering: 2, marketing: 0, research: 0 },
  design: { engineering: 2, marketing: 1, research: 0 },
  ops: { engineering: 2, marketing: 1, research: 0 },
  review: { engineering: 1, marketing: 1, research: 2 },
  research: { engineering: 0, marketing: 1, research: 2 },
  incident: { engineering: 2, marketing: 0, research: 1 },
  other: { engineering: 1, marketing: 1, research: 1 },
};

/** Derive department from member ID prefix. */
function deptFromMemberId(id: string): string {
  if (id.startsWith('eng-')) return 'engineering';
  if (id.startsWith('mkt-')) return 'marketing';
  if (id.startsWith('res-')) return 'research';
  return 'exec';
}

function fitToTier(fit: number): GameTier {
  if (fit >= 2) return 'great';
  if (fit <= 0) return 'bad';
  return 'ok';
}

/** Preview tier for (task, member) — ① department path only (mirrors backend). */
export function previewFit(task: string, memberId: string): { fit: number; tier: GameTier } {
  const label = classifyLabel(task);
  const dept = deptFromMemberId(memberId);
  const fit = FIT[label]?.[dept] ?? 1;
  return { fit, tier: fitToTier(fit) };
}
