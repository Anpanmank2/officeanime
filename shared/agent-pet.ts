// Read-only display contract. Keep calendar defaults aligned with agent-pet/config/stage-days.json.
export const PET_STAGE_DAYS: readonly number[] = [0, 3, 10, 25, 45, 70];

export function petStageDays(value: unknown): readonly number[] {
  const config = value as { schema?: unknown; days?: unknown } | null;
  const days = config?.days;
  return config?.schema === 'stage-days/1' &&
    Array.isArray(days) &&
    days.length === 6 &&
    days[0] === 0 &&
    days.every((day, index) => Number.isSafeInteger(day) && (index === 0 || day > days[index - 1]))
    ? days
    : PET_STAGE_DAYS;
}

export function petDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? value
    : null;
}

/** agent-pet uses a local 04:00 day boundary, including across DST changes. */
export function petLocalDate(value: Date = new Date()): string {
  const now = new Date(value);
  if (now.getHours() < 4) now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** UTC calendar difference, with the same invalid/future fallback as agent-pet ageDays. */
export function petAgeDays(bornAt: unknown, today: string): number {
  const born = petDate(bornAt);
  const day = petDate(today);
  return born && day ? Math.max(0, (Date.parse(day) - Date.parse(born)) / 86_400_000) : 0;
}

export interface PetFirstVoice {
  schema: 'first-voice/1';
  id: string;
  date: string;
  kind: 'normal' | 'milestone';
  text: string;
}

/** Fail closed; allowlist only display data, never hook instructions or candidate metadata. */
export function petFirstVoice(value: unknown, today: string): PetFirstVoice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.schema !== 'first-voice/1' ||
    typeof v.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(v.id) ||
    petDate(v.date) !== today ||
    (v.kind !== 'normal' && v.kind !== 'milestone') ||
    typeof v.text !== 'string' ||
    /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(v.text)
  )
    return null;
  const lines = v.text.split('\n');
  if (
    lines.length !== (v.kind === 'normal' ? 2 : 3) ||
    lines.some((line) => !line.trim() || [...line].length > 120)
  )
    return null;
  return { schema: 'first-voice/1', id: v.id, date: today, kind: v.kind, text: v.text };
}

// Default namespace also supports Node ESM webview tests consuming the CJS host package.
export default { petAgeDays, petDate, petFirstVoice, petLocalDate, petStageDays };
