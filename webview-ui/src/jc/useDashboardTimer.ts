// ── Just Curious Virtual Office — Dashboard Timer Hook ───────────
// 1-second interval hook for computing elapsed time in the dashboard.
// Clears the interval when the dashboard is hidden to avoid wasteful
// re-renders.

import { useCallback, useEffect, useState } from 'react';

/** Update interval for dashboard elapsed time display (ms) */
const DASHBOARD_UPDATE_INTERVAL_MS = 1000;

/**
 * Format elapsed milliseconds as a human-readable duration string.
 * Examples: "5s", "3m 12s", "1h 5m"
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Custom hook: returns current timestamp that updates every second
 * while the dashboard is visible. Stops the interval when hidden.
 *
 * @param isVisible - Whether the dashboard panel is currently shown
 * @returns Current timestamp (ms) — use with formatElapsed(now - stateSince)
 */
export function useDashboardTimer(isVisible: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  const tick = useCallback(() => setNow(Date.now()), []);

  useEffect(() => {
    if (!isVisible) return;

    const id = setInterval(tick, DASHBOARD_UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isVisible, tick]);

  return now;
}
