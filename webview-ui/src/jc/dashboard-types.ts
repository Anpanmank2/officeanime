// ── Just Curious Virtual Office — Dashboard Type Definitions ─────
// Webview-side types for the Agent Dashboard (Phase A)
// Phase B additions are marked with [PHASE-B] comments.

import type { JCState } from './jc-types.js';

/** Snapshot of a single member for dashboard bulk sync */
export interface DashboardMemberSnapshot {
  memberId: string;
  jcState: JCState;
  /** Timestamp (ms) when member entered current state */
  stateSince: number;
  /** Current task summary from ActivitySummarizer */
  currentTaskSummary: string | null;
  /** Task ID currently running */
  currentTaskId: string | null;
  /** Parent member ID if this member is a sub-agent */
  parentMemberId: string | null;
  /** Child member IDs (sub-agents spawned by this member) */
  childMemberIds: string[];
  /** General activity summary */
  activitySummary: string | null;
}

// ── Phase B Interface Definitions ────────────────────────────────
// Defined now; populated in Phase B.

/** A single state transition event for analytics */
export interface StateChangeEvent {
  memberId: string;
  fromState: JCState;
  toState: JCState;
  timestamp: number;
  toolName?: string;
  taskId?: string;
}

/** Emitter interface for StateChangeEvent (Phase B implementation) */
export interface StateChangeEmitter {
  emit(event: StateChangeEvent): void;
  // [PHASE-B] subscribe(callback: (e: StateChangeEvent) => void): () => void;
  // [PHASE-B] getHistory(memberId: string, since: number): StateChangeEvent[];
}

/** Per-member aggregated statistics (Phase B) */
export interface AgentStatistics {
  memberId: string;
  // [PHASE-B] idleRatio: number;
  // [PHASE-B] avgTaskDurationMs: number;
  // [PHASE-B] totalActiveMs: number;
  // [PHASE-B] stateDistribution: Record<JCState, number>;
}
