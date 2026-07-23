// ── JP 相対経過時間フォーマッタ (社員カルテ用・webview内完結・IPC不要) ──────────
// 「N時間M分」/「N分」/「たった今」。滞在時間・未完了しごとの経過・停滞時間の表示に使う。
// 数字は index.css の unicode-range fix で full-height にそろう (font-glyph skill 実適用済)。

/** 経過ミリ秒を日本語の相対時間に整形する。負値/非有限は 0 とみなす。 */
export function formatElapsedJa(ms: number): string {
  let v = ms;
  if (!Number.isFinite(v) || v < 0) v = 0;
  const totalMin = Math.floor(v / 60000);
  if (totalMin < 1) return 'たった今';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}
