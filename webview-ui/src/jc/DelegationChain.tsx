// ── Delegation Chain — horizontal flow visualization ────────────

export function DelegationChain({ chain }: { chain: string[] }) {
  if (!chain || chain.length === 0) return null;
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '14px', flexWrap: 'wrap' }}
    >
      {chain.map((name, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--pixel-text)' }}>{name}</span>
          {i < chain.length - 1 && <span style={{ color: 'var(--pixel-text-dim)' }}>→</span>}
        </span>
      ))}
    </div>
  );
}
