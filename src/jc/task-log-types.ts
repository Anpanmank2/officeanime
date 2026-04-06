// ── Task Log & Office Log — Shared Type Definitions ────────────

/** Task label for auto-classification */
export type TaskLabel =
  | 'implementation'
  | 'research'
  | 'review'
  | 'bugfix'
  | 'design'
  | 'ops'
  | 'incident'
  | 'other';

/** Persisted task log entry (one line in JSONL) */
export interface TaskLogEntry {
  taskId: string;
  title: string; // prompt first 100 chars
  label: TaskLabel;
  labelOverride?: TaskLabel;
  priority: number; // 0-4
  status: 'done' | 'failed' | 'cancelled' | 'incident';
  createdAt: number; // Unix ms
  startedAt?: number;
  completedAt: number;
  durationMs?: number;
  delegationChain: string[];
  assignedTo?: string; // member ID
  pmReview?: {
    reviewer: string;
    result: 'approved' | 'rejected';
    timestamp: number;
  };
  outputs?: string[];
  summary?: string;
  incidentRef?: string;
  prompt: string; // full prompt for search
}

/** Persisted office log record (one line in JSONL) */
export interface OfficeLogRecord {
  id: string;
  timestamp: number; // Unix ms
  memberId: string;
  memberName: string;
  department: string;
  type:
    | 'speech'
    | 'state_change'
    | 'task_event'
    | 'delegation'
    | 'arrival'
    | 'departure'
    | 'office_event';
  summary: string;
  sourceEvent?: string;
}

/** Query parameters for task history */
export interface TaskHistoryQuery {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  status?: string[];
  labels?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

/** Result of task history query */
export interface TaskHistoryResult {
  entries: TaskLogEntry[];
  hasMore: boolean;
  totalCount: number;
}

/** Query parameters for office log */
export interface OfficeLogQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Result of office log query */
export interface OfficeLogResult {
  entries: OfficeLogRecord[];
  hasMore: boolean;
}
