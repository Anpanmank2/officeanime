// ── Freshness helper — "3h ago" / "2d ago" labels with warn flag ──

/**
 * Format a data freshness label relative to now.
 * warn=true when extractedAt is more than 24h in the past.
 */
export function formatFreshness(
  extractedAt: number,
  now = Date.now(),
): { label: string; warn: boolean } {
  const diffMs = now - extractedAt;
  if (diffMs < 0) {
    return { label: 'just now', warn: false };
  }

  const diffS = Math.floor(diffMs / 1000);
  const diffM = Math.floor(diffS / 60);
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);

  let label: string;
  if (diffS < 60) {
    label = `${diffS}s ago`;
  } else if (diffM < 60) {
    label = `${diffM}m ago`;
  } else if (diffH < 24) {
    label = `${diffH}h ago`;
  } else {
    label = `${diffD}d ago`;
  }

  const warn = diffMs > 24 * 60 * 60 * 1000;
  return { label, warn };
}
