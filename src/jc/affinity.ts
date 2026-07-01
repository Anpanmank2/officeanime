// ── Affinity engine (DEV-SPEC §5.1) ────────────────────────────────────
// Computes ◎/△/✗ fit for (task, member) using ONLY existing data sources:
//   1. classifyLabel(prompt) → 8-value label (reused from task-history-writer)
//   2. member.department (from jc-config.json)
//   3. routing-keywords.md first-choice member (optional +1 bonus)
// No new randomness, no new data source. Deterministic → AC-1 re-runnable.

import * as fs from 'fs';
import * as path from 'path';

import { type AffinityTier, fitToTier } from './affinity-constants.js';
import { classifyLabel } from './task-history-writer.js';
import type { TaskLabel } from './task-log-types.js';
import type { JCConfig } from './types.js';

/** Department FIT table (DEV-SPEC §5.1①). label × dept → 0/1/2. */
const FIT: Record<TaskLabel, Record<string, number>> = {
  implementation: { engineering: 2, marketing: 0, research: 0 },
  bugfix: { engineering: 2, marketing: 0, research: 0 },
  design: { engineering: 2, marketing: 1, research: 0 },
  ops: { engineering: 2, marketing: 1, research: 0 },
  review: { engineering: 1, marketing: 1, research: 2 },
  research: { engineering: 0, marketing: 1, research: 2 },
  incident: { engineering: 2, marketing: 0, research: 1 },
  other: { engineering: 1, marketing: 1, research: 1 },
};

/** Fallback fit for unknown dept / exec-sec / desk ids (DEV-SPEC §5.1 → △). */
const FALLBACK_FIT = 1;

export interface AffinityResult {
  fit: number; // 0/1/2
  tier: AffinityTier; // great/ok/bad
  label: TaskLabel;
  matchedKeyword?: string; // routing-keywords first-choice member if bonus applied
}

// ── routing-keywords.md parser (DEV-SPEC §5.1②) ────────────────────────
// Table rows: | phrases(・-separated) | first-choice (contains member-id) | aux |
// Parse once, cache. Resolve = substring-match prompt against phrases.

interface RoutingRow {
  phrases: string[];
  member: string; // e.g. "res-01"
}

let routingCache: RoutingRow[] | null = null;
const MEMBER_ID_RE = /\b((?:eng|mkt|res|pm|exec)-\d+|exec-sec)\b/;

/** Parse routing-keywords.md into rows. workspaceRoot = cc-company dir. */
export function loadRoutingKeywords(workspaceRoot: string): RoutingRow[] {
  if (routingCache) return routingCache;
  const rows: RoutingRow[] = [];
  try {
    const p = path.join(workspaceRoot, '.company', 'secretary', 'routing-keywords.md');
    const text = fs.readFileSync(p, 'utf-8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('|')) continue;
      const cells = t
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length < 2) continue;
      // Skip header / separator rows
      if (/^:?-+:?$/.test(cells[0]) || cells[0].includes('キーワード')) continue;
      const m = cells[1].match(MEMBER_ID_RE);
      if (!m) continue;
      const phrases = cells[0]
        .split(/[・/／]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (phrases.length === 0) continue;
      rows.push({ phrases, member: m[1] });
    }
  } catch {
    // Missing/unreadable file → degrade to department-only path (no crash).
    routingCache = [];
    return routingCache;
  }
  routingCache = rows;
  return rows;
}

/** Reset the cache (test helper). */
export function _resetRoutingCache(): void {
  routingCache = null;
}

/**
 * routingFirstChoice: substring-scan prompt against parsed phrases,
 * return first matching row's member-id, else null (no bonus = safe side).
 */
export function routingFirstChoice(
  taskPrompt: string,
  workspaceRoot: string,
): { member: string; matched: string } | null {
  const rows = loadRoutingKeywords(workspaceRoot);
  for (const row of rows) {
    for (const phrase of row.phrases) {
      if (taskPrompt.includes(phrase)) {
        return { member: row.member, matched: phrase };
      }
    }
  }
  return null;
}

function departmentOf(memberId: string, config: JCConfig): string | null {
  const m = config.members.find((x) => x.id === memberId);
  return m ? m.department : null;
}

/**
 * computeFit — DEV-SPEC §5.1. Deterministic.
 * @param workspaceRoot cc-company dir for routing-keywords.md (optional; omit = ① path only)
 */
export function computeFit(
  task: { prompt: string; assignee: string; isIncident?: boolean },
  memberId: string,
  config: JCConfig,
  workspaceRoot?: string,
): AffinityResult {
  const label = classifyLabel(task.prompt, task.isIncident);
  const dept = departmentOf(memberId, config);

  // ① department path (heart of the hard condition)
  let fitRaw = dept && FIT[label][dept] !== undefined ? FIT[label][dept] : FALLBACK_FIT;

  // ② member-granularity bonus (+1 if routing first-choice == assignee). Optional.
  let matchedKeyword: string | undefined;
  if (workspaceRoot) {
    const fc = routingFirstChoice(task.prompt, workspaceRoot);
    if (fc && fc.member === task.assignee) {
      fitRaw += 1;
      matchedKeyword = fc.matched;
    }
  }

  const fit = Math.max(0, Math.min(2, fitRaw));
  return { fit, tier: fitToTier(fit), label, matchedKeyword };
}
