// ── Agent Pet — optional companion state (webview side) ──────────
// Read-only snapshots arrive via standalone HTTP or VS Code messages every 30s.
// Missing or invalid data clears the store; it never starts an agent-pet hook.
//
// Nothing here is hardcoded to a particular companion: the name, the
// birthday and every number come from the served record at runtime.

import type { PetFirstVoice } from '../../../shared/agent-pet.js';
import petContract from '../../../shared/agent-pet.js';
import { PET_TILE, PET_TRAIT_ORDER } from './jc-constants.js';

const { petAgeDays, petDate, petFirstVoice, petLocalDate, petStageDays } = petContract;

/** One sticky note ("付箋") the companion wrote to itself. Local-only. */
export interface JCPetNote {
  date: string;
  time: string;
  kind: string;
  text: string;
}

export interface JCPet {
  /** Display name — comes from the pet folder name at runtime. */
  name: string;
  /** 0 = egg … 5 = fully grown. */
  stage: number;
  stageDays: readonly number[];
  firstVoice: PetFirstVoice | null;
  /** Birthday (YYYY-MM-DD), or null when the authoritative date is invalid or missing. */
  bornAt: string | null;
  /** Experience per work category. */
  traits: Record<string, number>;
  /** Habit files present on disk. */
  learnedCount: number;
  /** Most recent habit titles, newest first. */
  learnedRecent: string[];
  /** Days that have a sticky-note file. */
  memoryDays: number;
  /** Newest sticky note, or null. */
  lastNote: JCPetNote | null;
  /** Whether today already has a sticky note. */
  hasNoteToday: boolean;
}

const PET_ENDPOINT = 'jc-pet.json';

let pet: JCPet | null = null;

/** Current companion, or null when there is none. */
export function jcGetPet(): JCPet | null {
  return pet;
}

/** True when the tile is the companion's spot (and a companion exists). */
export function jcIsPetTile(col: number, row: number): boolean {
  return pet !== null && col === PET_TILE.col && row === PET_TILE.row;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseNote(value: unknown): JCPetNote | null {
  if (!value || typeof value !== 'object') return null;
  const n = value as Record<string, unknown>;
  const text = str(n.text);
  if (!text) return null;
  return { date: str(n.date), time: str(n.time), kind: str(n.kind), text };
}

const listeners = new Set<() => void>();
export function jcSubscribePet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace stale/missing state as well as valid snapshots. */
export function jcSetPet(value: unknown, now: Date = new Date()): void {
  const data = value as Record<string, unknown> | null;
  let next: JCPet | null = null;
  if (data && typeof data.name === 'string' && data.name.trim() && data.name.length <= 160) {
    const rawTraits = (data.traits ?? {}) as Record<string, unknown>;
    const traits: Record<string, number> = {};
    for (const key of PET_TRAIT_ORDER) traits[key] = num(rawTraits[key]);
    next = {
      name: data.name,
      stage: Math.min(5, num(data.stage)),
      stageDays: petStageDays({ schema: 'stage-days/1', days: data.stageDays }),
      firstVoice: petFirstVoice(data.firstVoice, petLocalDate(now)),
      bornAt: petDate(data.bornAt),
      traits,
      learnedCount: num(data.learnedCount),
      learnedRecent: (Array.isArray(data.learnedRecent) ? data.learnedRecent : [])
        .map(str)
        .filter(Boolean),
      memoryDays: num(data.memoryDays),
      lastNote: parseNote(data.lastNote),
      hasNoteToday: data.hasNoteToday === true,
    };
  }
  pet = next;
  for (const listener of listeners) listener();
}

/** Best-effort load; a lost endpoint clears stale companion data. */
export async function jcLoadPet(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}${PET_ENDPOINT}`, { cache: 'no-store' });
    jcSetPet(res.ok ? await res.json() : null);
  } catch {
    jcSetPet(null);
  }
}

/** Internal calendar readiness only; no metric or threshold is shown in the UI. */
export function jcGetPetNextStage(
  p: JCPet,
  now: Date = new Date(),
): { stage: number; met: boolean } | null {
  if (p.stage >= 5) return null;
  return { stage: p.stage + 1, met: jcGetPetDayCount(p, now) >= p.stageDays[p.stage + 1] };
}

/** Zero-based age, matching the producer (invalid/future birthdays count as zero). */
export function jcGetPetDayCount(p: JCPet, now: Date = new Date()): number {
  return petAgeDays(p.bornAt, petLocalDate(now));
}
