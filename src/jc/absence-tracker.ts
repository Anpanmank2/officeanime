// ── Just Curious Virtual Office — Absence Tracker ────────────────
// Tracks which JC members have no active agent and broadcasts
// absence info (last activity, last tool, etc.) to the webview.

import type * as vscode from 'vscode';

import type { AgentState } from '../types.js';
import { getMemberForAgent, getPresentMembers } from './agent-mapper.js';
import type { AbsenceInfo, JCConfig } from './types.js';

/** Per-member activity tracking (persisted across agent sessions within a VS Code session) */
interface MemberActivity {
  lastActivity: number; // timestamp ms
  lastTool?: string;
  lastFile?: string;
  sessionDuration: number; // cumulative seconds today
  sessionStart?: number; // timestamp when current session started
  absentSince?: number; // timestamp when absence started
}

const POLL_INTERVAL_MS = 5000;

export class AbsenceTracker {
  private config: JCConfig;
  private activities = new Map<string, MemberActivity>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private webview: vscode.Webview | undefined;
  private agents: Map<number, AgentState>;
  private lastSentStatuses = new Map<string, string>(); // memberId → 'active'|'absent'|'idle'

  constructor(config: JCConfig, agents: Map<number, AgentState>) {
    this.config = config;
    this.agents = agents;

    // Initialize all members as absent
    for (const member of config.members) {
      this.activities.set(member.id, {
        lastActivity: 0,
        sessionDuration: 0,
        absentSince: Date.now(),
      });
    }
  }

  /** Start polling. Call after webview is available. */
  start(webview: vscode.Webview): void {
    this.webview = webview;
    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Send initial bulk sync
    this.sendBulkSync();
  }

  /** Update when an agent starts a tool */
  onToolStart(agentId: number, toolName: string, status: string): void {
    const memberId = getMemberForAgent(agentId);
    if (!memberId) return;

    const activity = this.activities.get(memberId);
    if (!activity) return;

    activity.lastActivity = Date.now();
    activity.lastTool = toolName;

    // Extract file path from status if present (e.g., "Reading src/foo.ts")
    const fileMatch = status.match(/(?:Reading|Editing|Writing)\s+(.+)/);
    if (fileMatch) {
      activity.lastFile = fileMatch[1];
    }
  }

  /** Update when an agent is created (member becomes active) */
  onAgentCreated(memberId: string): void {
    const activity = this.activities.get(memberId);
    if (!activity) return;

    activity.absentSince = undefined;
    activity.sessionStart = Date.now();
    activity.lastActivity = Date.now();
  }

  /** Update when an agent is removed (member becomes absent) */
  onAgentRemoved(memberId: string): void {
    const activity = this.activities.get(memberId);
    if (!activity) return;

    // Accumulate session duration
    if (activity.sessionStart) {
      activity.sessionDuration += (Date.now() - activity.sessionStart) / 1000;
      activity.sessionStart = undefined;
    }
    activity.absentSince = Date.now();
  }

  /** Poll and send updates for status changes */
  private poll(): void {
    if (!this.webview) return;

    const presentMembers = getPresentMembers();

    for (const member of this.config.members) {
      const wasStatus = this.lastSentStatuses.get(member.id);
      let newStatus: AbsenceInfo['status'];

      if (presentMembers.has(member.id)) {
        // Check if idle (agent exists but no recent activity)
        const activity = this.activities.get(member.id);
        const idleThreshold = 5 * 60 * 1000; // 5 minutes
        if (
          activity &&
          activity.lastActivity > 0 &&
          Date.now() - activity.lastActivity > idleThreshold
        ) {
          newStatus = 'idle';
        } else {
          newStatus = 'active';
        }
      } else {
        newStatus = 'absent';
      }

      if (wasStatus !== newStatus) {
        this.lastSentStatuses.set(member.id, newStatus);
        const info = this.buildAbsenceInfo(member.id, newStatus);
        if (info) {
          this.webview.postMessage({
            type: 'jcAbsenceUpdate',
            payload: info,
          });
        }
      }
    }
  }

  /** Build AbsenceInfo for a member */
  private buildAbsenceInfo(memberId: string, status: AbsenceInfo['status']): AbsenceInfo | null {
    const member = this.config.members.find((m) => m.id === memberId);
    if (!member) return null;

    const activity = this.activities.get(memberId);

    // Calculate session duration including current session
    let sessionDuration = activity?.sessionDuration ?? 0;
    if (activity?.sessionStart) {
      sessionDuration += (Date.now() - activity.sessionStart) / 1000;
    }

    return {
      memberId,
      memberName: member.name,
      role: member.role,
      department: member.department,
      status,
      lastActivity: activity?.lastActivity ?? 0,
      lastTool: activity?.lastTool,
      lastFile: activity?.lastFile,
      sessionDuration: Math.round(sessionDuration),
      absentSince: activity?.absentSince,
    };
  }

  /** Send full sync of all members' absence info */
  sendBulkSync(): void {
    if (!this.webview) return;

    const presentMembers = getPresentMembers();
    const payload: AbsenceInfo[] = [];

    for (const member of this.config.members) {
      const isPresent = presentMembers.has(member.id);
      const activity = this.activities.get(member.id);
      const status: AbsenceInfo['status'] = isPresent ? 'active' : 'absent';

      this.lastSentStatuses.set(member.id, status);

      let sessionDuration = activity?.sessionDuration ?? 0;
      if (activity?.sessionStart) {
        sessionDuration += (Date.now() - activity.sessionStart) / 1000;
      }

      payload.push({
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        department: member.department,
        status,
        lastActivity: activity?.lastActivity ?? 0,
        lastTool: activity?.lastTool,
        lastFile: activity?.lastFile,
        sessionDuration: Math.round(sessionDuration),
        absentSince: activity?.absentSince,
      });
    }

    this.webview.postMessage({
      type: 'jcAbsenceBulkSync',
      payload,
    });
  }

  dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
