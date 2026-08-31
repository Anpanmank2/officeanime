// ── Agent Pet — optional companion data reader ───────────────────
// Reads the local agent-pet growth record (if the user has one) so the
// office can show the companion in the exec room. Entirely optional:
// when the directory does not exist, every function returns null and
// nothing is rendered.
//
// Everything here is derived at runtime from the user's home directory —
// no pet name, no user name and no absolute path is ever hardcoded.
// The record itself (~/.agent-pet/) is owned by the agent-pet scripts;
// this module only reads it.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Directory (under the user's home) that holds one folder per pet. */
const PET_ROOT_DIR = '.agent-pet';
/** Growth record file inside each pet folder. */
const PET_GROWTH_FILE = 'growth.json';
/** Append-only life history, one JSON object per line. */
const PET_TIMELINE_FILE = 'timeline.jsonl';
/** Folder holding one file per day of sticky notes. */
const PET_MEMORY_DIR = 'memory';
/** Folder holding one file per learned habit. */
const PET_LEARNED_DIR = 'learned';
/** Highest stage the growth schema defines. */
const PET_MAX_STAGE = 5;
/** Trait keys the growth schema defines, in display order. */
const PET_TRAIT_KEYS = ['code', 'research', 'writing', 'chat', 'numbers'] as const;
/** Timeline event marking the pet's birth. */
const PET_HATCH_EVENT = 'hatch';
/** How many recently learned habits to surface in the panel. */
const PET_RECENT_LEARNED_MAX = 3;
/** `memory/YYYY-MM-DD.md` file name shape. */
const PET_MEMORY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
/** Sticky-note line shape inside a memory file: `- HH:MM [kind] text`. */
const PET_NOTE_LINE_RE = /^-\s+(\d{2}:\d{2})\s+\[([a-z]+)\]\s+(.*)$/;
/** Learned-habit file extension. */
const PET_LEARNED_EXT = '.md';

/** One sticky note ("付箋") the companion wrote to itself. */
export interface AgentPetNote {
  /** Day the note belongs to (YYYY-MM-DD). */
  date: string;
  /** Time of day the note was written (HH:MM). */
  time: string;
  /** Work category the note was filed under. */
  kind: string;
  /** The note itself, verbatim — local-only, never put on a shared card. */
  text: string;
}

export interface AgentPetInfo {
  /** Display name — always the pet folder name (never hardcoded). */
  name: string;
  /** 0 = egg … 5 = fully grown. */
  stage: number;
  /** Days spent together (0+). */
  bond: number;
  /** Growth record schema version, for forward compatibility. */
  schema: string;
  /** Birthday (YYYY-MM-DD) from the timeline hatch entry, else the record. */
  bornAt: string | null;
  /** Experience per work category. */
  traits: Record<string, number>;
  /** Habit count as recorded in growth.json. */
  remembered: number;
  /** Habit count actually present on disk (learned/*.md). */
  learnedCount: number;
  /** Most recently written habit titles (file names, newest first). */
  learnedRecent: string[];
  /** Number of days that have a sticky-note file. */
  memoryDays: number;
  /** Newest sticky note, or null when none was ever written. */
  lastNote: AgentPetNote | null;
  /** Whether a sticky note exists for the reader's current local day. */
  hasNoteToday: boolean;
  /** Last day the companion greeted its owner (YYYY-MM-DD). */
  lastStartDate: string | null;
  /** Last day the companion wrote its note (YYYY-MM-DD). */
  lastEndDate: string | null;
}

/** Absolute path of the pet root, derived from the current user's home. */
function petRoot(): string {
  return path.join(os.homedir(), PET_ROOT_DIR);
}

/** Local calendar day (YYYY-MM-DD) — matches how the pet scripts stamp files. */
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asDateString(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Sorted list of days (YYYY-MM-DD) that have a sticky-note file. */
function listMemoryDates(petDir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(petDir, PET_MEMORY_DIR))
      .map((f) => PET_MEMORY_FILE_RE.exec(f)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort();
  } catch {
    return [];
  }
}

/** Last sticky note written on the given day, or null. */
function readLastNoteOfDay(petDir: string, date: string): AgentPetNote | null {
  try {
    const raw = fs.readFileSync(path.join(petDir, PET_MEMORY_DIR, `${date}.md`), 'utf-8');
    const notes: AgentPetNote[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = PET_NOTE_LINE_RE.exec(line);
      if (m) notes.push({ date, time: m[1], kind: m[2], text: m[3].trim() });
    }
    return notes.length > 0 ? notes[notes.length - 1] : null;
  } catch {
    return null;
  }
}

/** Learned habit titles, newest first (by file mtime). */
function readLearned(petDir: string): { count: number; recent: string[] } {
  try {
    const dir = path.join(petDir, PET_LEARNED_DIR);
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(PET_LEARNED_EXT))
      .map((e) => e.name);
    const withTime = files.map((name) => {
      let mtime = 0;
      try {
        mtime = fs.statSync(path.join(dir, name)).mtimeMs;
      } catch {
        // Unreadable entry — keep it counted but sort it last.
      }
      return { name, mtime };
    });
    withTime.sort((a, b) => b.mtime - a.mtime);
    return {
      count: files.length,
      recent: withTime
        .slice(0, PET_RECENT_LEARNED_MAX)
        .map((f) => f.name.slice(0, -PET_LEARNED_EXT.length)),
    };
  } catch {
    return { count: 0, recent: [] };
  }
}

/** Birthday from the append-only timeline (first `hatch` entry). */
function readBornAt(petDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(petDir, PET_TIMELINE_FILE), 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { event?: unknown; date?: unknown };
        if (entry.event === PET_HATCH_EVENT) {
          const d = asDateString(entry.date);
          if (d) return d;
        }
      } catch {
        // Skip malformed lines — the timeline is append-only and may be mid-write.
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the first pet folder that carries a growth record.
 * Returns null when no pet exists or anything is unreadable — callers
 * must treat null as "no companion, render nothing".
 */
export function readAgentPet(): AgentPetInfo | null {
  try {
    const root = petRoot();
    if (!fs.existsSync(root)) return null;

    const entries = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    for (const name of entries) {
      const petDir = path.join(root, name);
      const growthPath = path.join(petDir, PET_GROWTH_FILE);
      if (!fs.existsSync(growthPath)) continue;
      const raw = JSON.parse(fs.readFileSync(growthPath, 'utf-8')) as Record<string, unknown>;

      const rawTraits = (raw.traits ?? {}) as Record<string, unknown>;
      const traits: Record<string, number> = {};
      for (const key of PET_TRAIT_KEYS) {
        traits[key] = Math.max(0, Math.floor(asNumber(rawTraits[key], 0)));
      }

      const memoryDates = listMemoryDates(petDir);
      const today = localDate(new Date());
      const learned = readLearned(petDir);

      // Newest note: walk back from the newest day until one carries a note.
      let lastNote: AgentPetNote | null = null;
      for (let i = memoryDates.length - 1; i >= 0 && lastNote === null; i--) {
        lastNote = readLastNoteOfDay(petDir, memoryDates[i]);
      }

      return {
        name,
        stage: Math.max(0, Math.min(PET_MAX_STAGE, Math.floor(asNumber(raw.stage, 0)))),
        bond: Math.max(0, Math.floor(asNumber(raw.bond, 0))),
        schema: typeof raw.schema === 'string' ? raw.schema : '',
        bornAt: readBornAt(petDir) ?? asDateString(raw.born_at),
        traits,
        remembered: Math.max(0, Math.floor(asNumber(raw.remembered, 0))),
        learnedCount: learned.count,
        learnedRecent: learned.recent,
        memoryDays: memoryDates.length,
        lastNote,
        hasNoteToday: memoryDates.includes(today),
        lastStartDate: asDateString(raw.last_start_date),
        lastEndDate: asDateString(raw.last_end_date),
      };
    }
    return null;
  } catch {
    return null;
  }
}
