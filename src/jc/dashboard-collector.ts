// ── Just Curious Virtual Office — Dashboard Data Collector ────────
// Extension-side tracker for stateSince and dashboard sync data.
// Manages memberStateSince: Map<string, number> persistently so
// Webview re-initialization can restore accurate timestamps.
//
// [PHASE-B] StateChangeEvent accumulation and statistics live here.

import type { JCState } from './types.js';

/** Per-member stateSince tracker (survives Webview re-init) */
const memberStateSince = new Map<string, number>();

/** Per-member current state tracker (for snapshot building) */
const memberCurrentState = new Map<string, JCState>();

/** Per-member current activity summary */
const memberActivitySummary = new Map<string, string | null>();

/**
 * Record a state change for a member.
 * Called from onToolStart() and onAgentIdle() in index.ts.
 * Returns the stateSince timestamp to embed in the message.
 */
export function recordStateChange(memberId: string, newState: JCState): number {
  const currentState = memberCurrentState.get(memberId);
  const now = Date.now();
  if (currentState !== newState) {
    memberStateSince.set(memberId, now);
    memberCurrentState.set(memberId, newState);
    // [PHASE-B] emit StateChangeEvent here
  }
  return memberStateSince.get(memberId) ?? now;
}

/**
 * Record an activity summary for a member.
 * Called from onToolStart() when ActivitySummarizer produces a summary.
 */
export function recordActivitySummary(memberId: string, summary: string | null): void {
  memberActivitySummary.set(memberId, summary);
}

/**
 * Get current stateSince for a member.
 * Returns Date.now() if not yet tracked (safe fallback).
 */
export function getStateSince(memberId: string): number {
  return memberStateSince.get(memberId) ?? Date.now();
}

/**
 * Build the full dashboard snapshot for all tracked members.
 * Used for jcDashboardSync on Webview re-initialization.
 */
export function buildDashboardSnapshot(): Array<{
  memberId: string;
  jcState: JCState;
  stateSince: number;
  currentTaskSummary: string | null;
  currentTaskId: string | null;
  parentMemberId: string | null;
  childMemberIds: string[];
  activitySummary: string | null;
}> {
  const result = [];
  for (const [memberId, jcState] of memberCurrentState) {
    result.push({
      memberId,
      jcState,
      stateSince: memberStateSince.get(memberId) ?? Date.now(),
      currentTaskSummary: memberActivitySummary.get(memberId) ?? null,
      currentTaskId: null, // [PHASE-B] wire TaskDefinition.id
      parentMemberId: null, // [PHASE-B] wire from subagent tracking
      childMemberIds: [], // [PHASE-B] wire from subagent tracking
      activitySummary: memberActivitySummary.get(memberId) ?? null,
    });
  }
  return result;
}

/** Clear all tracking data for a member (on agent removal) */
export function clearMember(memberId: string): void {
  memberStateSince.delete(memberId);
  memberCurrentState.delete(memberId);
  memberActivitySummary.delete(memberId);
}
