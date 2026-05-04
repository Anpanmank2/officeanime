// ── Pin Store — localStorage-backed pin state for member panels ──

const LS_KEY = 'jc.pinned';

function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    return [];
  } catch {
    return [];
  }
}

function writePinned(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

let pinned: string[] = readPinned();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function addPin(id: string): void {
  if (!pinned.includes(id)) {
    pinned = [...pinned, id];
    writePinned(pinned);
    notify();
  }
}

export function removePin(id: string): void {
  const next = pinned.filter((v) => v !== id);
  if (next.length !== pinned.length) {
    pinned = next;
    writePinned(pinned);
    notify();
  }
}

export function isPinned(id: string): boolean {
  return pinned.includes(id);
}

/** Subscribe to pin changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
