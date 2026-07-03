// ── Slice1 T10: Delegation Dock state (webview volatile store) ──────────
// Holds the deck of un-delegated task cards at the bottom of the screen and the
// currently "picked up" card. Owner clicks a card to pick it, then clicks a
// member on the board to delegate (→ jcOwnerDelegate → jc-events → walk/seat/gauge).
//
// Subscribe API mirrors imperative-store-subscribe-pattern so React re-renders.

export interface DockCard {
  id: string;
  /** Task title/prompt used for classifyLabel → affinity. */
  task: string;
  /** Short display label (e.g. "調査", "実装", "レビュー"). */
  short: string;
  /** P0..P4 priority. */
  priority: number;
}

// Seed cards cover the affinity spectrum so Owner can test ◎ vs ✗ by dropping the
// SAME card on different members (e.g. 調査 card on 古賀=◎ vs 田中=✗).
//
// 2026-07-03 UI/UX整理 P1-1: the 4 依頼(request) cards are now the dock's
// primary entries, so these demo cards are HIDDEN BY DEFAULT (not deleted —
// they remain useful for affinity ◎/✗ spot-testing). Re-enable without a
// rebuild via localStorage: `localStorage.setItem('pixelAgents.showSeedCards', '1')`
// and reload. Manual [+] card add is unaffected.
const SEED_CARDS: DockCard[] = [
  { id: 'seed-research', task: '市場の調査 research を分析する', short: '調査', priority: 3 },
  { id: 'seed-impl', task: '新機能を実装する implement コード', short: '実装', priority: 3 },
  { id: 'seed-review', task: 'データの監査 audit レビュー確認', short: 'レビュー', priority: 2 },
  { id: 'seed-design', task: 'UI の design レイアウト設計', short: 'デザイン', priority: 3 },
  { id: 'seed-bugfix', task: 'バグ修正 fix クラッシュ対応', short: 'バグ修正', priority: 1 },
];

/** Opt-in flag for the seed demo cards (default OFF). */
function seedCardsEnabled(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('pixelAgents.showSeedCards') === '1'
    );
  } catch {
    return false; // storage unavailable (sandboxed webview) → default hidden
  }
}

let cards: DockCard[] = seedCardsEnabled() ? [...SEED_CARDS] : [];
let pickedId: string | null = null;
let seq = 0;

// ── Subscribe API ──
const listeners = new Set<() => void>();
let pendingNotify = false;
function scheduleDockNotify(): void {
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
        console.error('[dock-state] listener error:', e);
      }
    }
  });
}
export function subscribeDock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ── Getters ──
export function dockGetCards(): readonly DockCard[] {
  return cards;
}
export function dockGetPickedId(): string | null {
  return pickedId;
}
export function dockGetPickedCard(): DockCard | null {
  return pickedId ? (cards.find((c) => c.id === pickedId) ?? null) : null;
}

// ── Mutators ──
/** Pick up a card (or toggle off if already picked). */
export function dockPickCard(id: string): void {
  pickedId = pickedId === id ? null : id;
  scheduleDockNotify();
}
export function dockClearPick(): void {
  if (pickedId !== null) {
    pickedId = null;
    scheduleDockNotify();
  }
}
/** Remove a card from the dock once delegated. */
export function dockConsumeCard(id: string): void {
  cards = cards.filter((c) => c.id !== id);
  if (pickedId === id) pickedId = null;
  scheduleDockNotify();
}
/** Add a custom task card. */
export function dockAddCard(task: string, priority = 3): void {
  const t = task.trim();
  if (!t) return;
  cards = [...cards, { id: `card-${++seq}`, task: t, short: t.slice(0, 6), priority }];
  scheduleDockNotify();
}
