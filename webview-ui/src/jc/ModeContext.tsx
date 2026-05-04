// ── Just Curious — Mode Context ──────────────────────────────────
// React Context + Provider for viewMode.
// Imperative store (getViewMode/setViewMode/subscribeMode/ViewMode) lives in
// mode-store.ts to satisfy react-refresh/only-export-components.
// ModeContext object and useViewMode hook also live in mode-store.ts so this
// file only exports components.

import { useEffect, useState } from 'react';

import { getViewMode, ModeContext, setViewMode, subscribeMode } from './mode-store.js';

/** ModeProvider — wrap the app root to distribute viewMode. */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ReturnType<typeof getViewMode>>(getViewMode);

  useEffect(() => {
    return subscribeMode(() => {
      setViewModeState(getViewMode());
    });
  }, []);

  return <ModeContext.Provider value={{ viewMode, setViewMode }}>{children}</ModeContext.Provider>;
}
