// ── Just Curious — Mode Store ─────────────────────────────────────
// Imperative store for viewMode: 'command' | 'serious'.
// Follows the subscribe pattern used in jc-state.ts and office-log-state.ts.
// Separated from ModeContext.tsx to satisfy react-refresh/only-export-components.
// useViewMode hook lives here (not in ModeContext.tsx) so ModeContext.tsx
// only exports components, keeping react-refresh happy.

import { createContext, useContext } from 'react';

import { vscode } from '../vscodeApi.js';

export type ViewMode = 'command' | 'serious';

const STORAGE_KEY = 'jc.viewMode';
const DEFAULT_MODE: ViewMode = 'command';

let currentMode: ViewMode = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'command' || stored === 'serious') return stored;
  } catch {
    // ignore (e.g. sandboxed webview without localStorage)
  }
  return DEFAULT_MODE;
})();

const modeListeners = new Set<() => void>();
let pendingModeNotify = false;

function scheduleModeNotify(): void {
  if (pendingModeNotify) return;
  pendingModeNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingModeNotify = false;
    for (const fn of modeListeners) {
      try {
        fn();
      } catch (e) {
        console.error('[ModeContext] listener error:', e);
      }
    }
  });
}

/** Subscribe to mode store changes. Returns an unsubscribe function. */
export function subscribeMode(fn: () => void): () => void {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
}

/** Get current view mode (imperative read). */
export function getViewMode(): ViewMode {
  return currentMode;
}

/** Set the view mode, persist to localStorage, notify listeners, and emit jc-event. */
export function setViewMode(mode: ViewMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  // Emit mode_changed event via extension message pipeline
  try {
    vscode.postMessage({
      type: 'jcModeChanged',
      mode,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore in browser dev mode
  }
  scheduleModeNotify();
}

// ── React Context (lives here so ModeContext.tsx only exports components) ────

export interface ModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ModeContext = createContext<ModeContextValue>({
  viewMode: 'command',
  setViewMode: setViewMode,
});

/** useViewMode — hook to read and set the current view mode. */
export function useViewMode(): ModeContextValue {
  return useContext(ModeContext);
}
