// ── Agent Pet — optional companion state (webview side) ──────────
// Fetched once at boot from the standalone server (`/jc-pet.json`).
// The endpoint answers `null` when the user has no companion, and the
// fetch itself is best-effort: any failure leaves the store empty and
// the office renders exactly as before.
//
// Nothing here is hardcoded to a particular companion: the name, the
// birthday and every number come from the served record at runtime.

import type { PetStageRule } from './jc-constants.js';
import { PET_STAGE_RULES, PET_TILE, PET_TRAIT_ORDER } from './jc-constants.js';

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
  /** Days spent together. */
  bond: number;
  /** Birthday (YYYY-MM-DD), or null when the timeline has no hatch entry. */
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

/** Best-effort load; never throws, never blocks rendering. */
export async function jcLoadPet(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}${PET_ENDPOINT}`);
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, unknown> | null;
    if (!data || typeof data.name !== 'string' || data.name.length === 0) return;

    const rawTraits = (data.traits ?? {}) as Record<string, unknown>;
    const traits: Record<string, number> = {};
    for (const key of PET_TRAIT_ORDER) traits[key] = num(rawTraits[key]);

    const rawLearned = Array.isArray(data.learnedRecent) ? data.learnedRecent : [];

    pet = {
      name: data.name,
      stage: num(data.stage),
      bond: num(data.bond),
      bornAt: typeof data.bornAt === 'string' ? data.bornAt : null,
      traits,
      learnedCount: num(data.learnedCount),
      learnedRecent: rawLearned.map(str).filter((s) => s.length > 0),
      memoryDays: num(data.memoryDays),
      lastNote: parseNote(data.lastNote),
      hasNoteToday: data.hasNoteToday === true,
    };
  } catch {
    // No companion available — office renders unchanged.
  }
}

// ── 期待系の計算 (設計原則A: 距離は見せる・中身は伏せる) ──────────

export interface JCPetNextStage {
  /** 到達する段階 (1〜5)。 */
  stage: number;
  /** 条件の平易な言い方。 */
  label: string;
  /** 現在地。 */
  current: number;
  /** 目標値。 */
  target: number;
  /** 単位。 */
  unit: string;
  /** 0〜1。バーの塗り。 */
  ratio: number;
  /** 条件を満たしているか (満たしても段階は勝手に上げない)。 */
  met: boolean;
}

function metricValue(p: JCPet, rule: PetStageRule): number {
  if (rule.metric === 'bond') return p.bond;
  if (rule.metric === 'learned') return p.learnedCount;
  return Math.max(0, ...PET_TRAIT_ORDER.map((k) => p.traits[k] ?? 0));
}

/**
 * 次の 1 段だけを返す。最終段階に到達済みなら null。
 * 未来の全段階は返さない (ロードマップを見せない = 原則A)。
 */
export function jcGetPetNextStage(p: JCPet): JCPetNextStage | null {
  const rule = PET_STAGE_RULES.find((r) => r.stage === p.stage + 1);
  if (!rule) return null;
  const current = metricValue(p, rule);
  return {
    stage: rule.stage,
    label: rule.label,
    current,
    target: rule.target,
    unit: rule.unit,
    ratio: rule.target > 0 ? Math.min(1, current / rule.target) : 1,
    met: current >= rule.target,
  };
}

/** 誕生日から今日で何日目か。誕生日不明なら null。 */
export function jcGetPetDayCount(p: JCPet, now: Date = new Date()): number | null {
  if (!p.bornAt) return null;
  const [y, m, d] = p.bornAt.split('-').map((v) => Number(v));
  if (!y || !m || !d) return null;
  const born = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Math.round((today - born) / 86_400_000) + 1);
}
