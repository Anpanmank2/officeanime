// ── Activity Summarizer — rules-based event → summary engine ─────

interface ToolEvent {
  toolName: string;
  status: string;
  timestamp: number;
}

const EVENT_WINDOW_MS = 15_000; // Only consider events within last 15s
const MAX_EVENTS = 20;

/** Summarize rules: pattern → summary text */
const SUMMARY_RULES: Array<{
  match: (events: ToolEvent[]) => boolean;
  summary: string;
}> = [
  {
    match: (evts) => evts.some((e) => e.status.toLowerCase().includes('error')),
    summary: 'Handling error',
  },
  {
    match: (evts) =>
      evts.some(
        (e) => e.toolName === 'Bash' && /git\s+(diff|log|blame|status|show)/.test(e.status),
      ),
    summary: 'Checking git history',
  },
  {
    match: (evts) =>
      evts.some((e) => e.toolName === 'Bash' && /npm\s+(test|vitest|jest)/.test(e.status)),
    summary: 'Running tests',
  },
  {
    match: (evts) =>
      evts.some(
        (e) => e.toolName === 'Bash' && /npm\s+(run\s+build|run\s+compile|install)/.test(e.status),
      ),
    summary: 'Building project',
  },
  {
    match: (evts) => {
      const hasEdit = evts.some((e) => e.toolName === 'Edit' || e.toolName === 'Write');
      const hasBash = evts.some((e) => e.toolName === 'Bash');
      return hasEdit && hasBash;
    },
    summary: 'Implementing & testing',
  },
  {
    match: (evts) => evts.filter((e) => e.toolName === 'Read').length >= 3,
    summary: 'Investigating files',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'WebFetch' || e.toolName === 'WebSearch'),
    summary: 'Researching online',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Grep' || e.toolName === 'Glob'),
    summary: 'Searching codebase',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Edit'),
    summary: 'Editing code',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Write'),
    summary: 'Creating files',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Read'),
    summary: 'Reading files',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Bash'),
    summary: 'Running command',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'Task' || e.toolName === 'Agent'),
    summary: 'Delegating subtask',
  },
  {
    match: (evts) => evts.some((e) => e.toolName === 'AskUserQuestion'),
    summary: 'Waiting for input',
  },
];

export class ActivitySummarizer {
  private recentEvents = new Map<number, ToolEvent[]>();
  private currentSummaries = new Map<number, string>();

  /** Record a new tool event for an agent */
  addEvent(agentId: number, toolName: string, status: string): string | null {
    const events = this.recentEvents.get(agentId) ?? [];
    events.push({ toolName, status, timestamp: Date.now() });

    // Trim old events
    const cutoff = Date.now() - EVENT_WINDOW_MS;
    const trimmed = events.filter((e) => e.timestamp > cutoff).slice(-MAX_EVENTS);
    this.recentEvents.set(agentId, trimmed);

    // Apply rules (first match wins — rules are priority-ordered)
    const summary = this.computeSummary(trimmed);
    const prev = this.currentSummaries.get(agentId);
    if (summary !== prev) {
      this.currentSummaries.set(agentId, summary ?? '');
      return summary;
    }
    return null; // No change
  }

  /** Get current summary for an agent */
  getSummary(agentId: number): string | null {
    return this.currentSummaries.get(agentId) ?? null;
  }

  /** Clear events when agent goes idle */
  clearAgent(agentId: number): void {
    this.recentEvents.delete(agentId);
    this.currentSummaries.delete(agentId);
  }

  private computeSummary(events: ToolEvent[]): string | null {
    for (const rule of SUMMARY_RULES) {
      if (rule.match(events)) {
        return rule.summary;
      }
    }
    return null;
  }
}
