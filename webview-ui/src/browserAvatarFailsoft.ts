/**
 * Isolates optional avatar enhancement failures from browser initialization.
 * Kept dependency-free so the failure boundary can be tested outside Vite.
 */
export async function withAvatarFallback<T>(
  load: () => Promise<T>,
  fallback: T,
  onFailure: (error: unknown) => void,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    onFailure(error);
    return fallback;
  }
}

/** Load independent optional parts without letting one rejection discard its siblings. */
export async function loadAvailableAvatarParts<TEntry extends { id: string }, TResult>(
  entries: readonly TEntry[],
  load: (entry: TEntry) => Promise<TResult>,
  onFailure: (entry: TEntry, error: unknown) => void,
): Promise<Record<string, TResult>> {
  const loaded: Record<string, TResult> = {};
  await Promise.all(
    entries.map(async (entry) => {
      try {
        loaded[entry.id] = await load(entry);
      } catch (error) {
        onFailure(entry, error);
      }
    }),
  );
  return loaded;
}
