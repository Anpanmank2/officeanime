// ── Just Curious Virtual Office — Main Orchestrator ──────────────
// This is the single integration point called from the fork's code.

import type * as vscode from 'vscode';

import { readConfig } from '../configPersistence.js';
import type { AgentState } from '../types.js';
import { AbsenceTracker } from './absence-tracker.js';
import { ActivitySummarizer } from './activity-summarizer.js';
import {
  assignMapping,
  getAllMappings,
  getMemberForAgent,
  getPresentMembers,
  promptMemberSelection,
  removeMapping,
  resolveMapping,
} from './agent-mapper.js';
import { isJCEnabled, loadJCConfig } from './config.js';
import { getDeskByMemberId } from './desk-registry.js';
import { EventWatcher } from './event-watcher.js';
import { toolToJCState } from './state-machine.js';
import { TaskWatcher } from './task-watcher.js';
import type { JCConfig, JCState, TaskDefinition } from './types.js';

/** JC runtime state */
let jcConfig: JCConfig | null = null;
let jcEnabled = false;

/** Per-member JC state tracking */
const memberStates = new Map<string, JCState>();

/** Per-member last activity timestamp (for idle timeout) */
const memberLastActivity = new Map<string, number>();

/** Idle timeout: 5 minutes */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Idle check timer */
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

/** Members mapped but not yet arrived (waiting for first tool use) */
const pendingArrivals = new Set<string>();

/** Stored arrival data for pending members */
const pendingArrivalData = new Map<
  string,
  { agentId: number; memberId: string; deskId: string; hueShift: number; palette: number }
>();

/** Absence tracker instance */
let absenceTracker: AbsenceTracker | null = null;

/** Task watcher instance */
let taskWatcher: TaskWatcher | null = null;

/** Event watcher instance */
let eventWatcher: EventWatcher | null = null;

/** Workspace root for event file */
let workspaceRootPath: string | null = null;

/** Activity summarizer instance */
let activitySummarizer: ActivitySummarizer | null = null;

/** Launch function reference (set by PixelAgentsViewProvider) */
let launchAgentFn:
  | ((memberId: string, prompt: string, workingDir?: string) => Promise<void>)
  | null = null;

/** Initialize JC system. Call once from extension.ts activate(). */
export function initJC(
  workspaceRoot: string,
  agents?: Map<number, AgentState>,
  extensionPath?: string,
): boolean {
  jcEnabled = isJCEnabled(workspaceRoot, extensionPath);
  if (!jcEnabled) {
    console.log('[JC] JC mode disabled (no jc-config.json)');
    return false;
  }
  jcConfig = loadJCConfig(workspaceRoot, extensionPath);
  if (!jcConfig) {
    jcEnabled = false;
    return false;
  }
  workspaceRootPath = workspaceRoot;
  activitySummarizer = new ActivitySummarizer();
  // Create absence tracker if agents map is provided
  if (agents) {
    absenceTracker = new AbsenceTracker(jcConfig, agents);
  }
  console.log(
    `[JC] JC mode enabled: ${jcConfig.organization} (${jcConfig.members.length} members)`,
  );
  return true;
}

/** Check if JC mode is active */
export function isJCActive(): boolean {
  return jcEnabled && jcConfig !== null;
}

/** Get the loaded config */
export function getJCConfig(): JCConfig | null {
  return jcConfig;
}

/**
 * Hook: called when a new agent is created.
 * Auto-maps or prompts for member assignment, then notifies webview.
 */
export async function onAgentCreated(
  agentId: number,
  agent: AgentState,
  webview: vscode.Webview | undefined,
): Promise<void> {
  if (!jcEnabled || !jcConfig) return;

  // Try auto-resolve
  let memberId = resolveMapping(agentId, agent, jcConfig);

  if (!memberId && jcConfig.mapping.fallback === 'prompt') {
    // Show QuickPick for manual selection
    memberId = (await promptMemberSelection(agentId, jcConfig)) ?? null;
  }

  if (memberId) {
    assignMapping(agentId, memberId);
    absenceTracker?.onAgentCreated(memberId);

    const desk = getDeskByMemberId(memberId);
    const member = jcConfig.members.find((m) => m.id === memberId);

    if (desk && member) {
      // Defer arrival until first tool use
      pendingArrivals.add(memberId);
      pendingArrivalData.set(memberId, {
        agentId,
        memberId,
        deskId: desk.deskId,
        hueShift: member.hueShift,
        palette: member.palette ?? 0,
      });
    }

    webview?.postMessage({
      type: 'jcMappingUpdate',
      mappings: getAllMappings(),
    });
  }
}

/**
 * Hook: called when an agent is closed/removed.
 * Triggers departure animation.
 */
export function onAgentRemoved(agentId: number, webview: vscode.Webview | undefined): void {
  if (!jcEnabled) return;

  const memberId = removeMapping(agentId);
  if (memberId) {
    memberStates.set(memberId, 'leaving');
    absenceTracker?.onAgentRemoved(memberId);
    webview?.postMessage({ type: 'jcMemberLeaving', agentId, memberId });
    webview?.postMessage({ type: 'jcMappingUpdate', mappings: getAllMappings() });
  }
}

/**
 * Hook: called when a tool starts for an agent.
 * Updates the member's JC state based on the tool type.
 */
export function onToolStart(
  agentId: number,
  toolName: string,
  status: string,
  webview: vscode.Webview | undefined,
): void {
  if (!jcEnabled) return;

  const memberId = getMemberForAgent(agentId);
  if (!memberId) return;

  // On first tool use, trigger deferred arrival
  if (pendingArrivals.has(memberId)) {
    const arrival = pendingArrivalData.get(memberId);
    if (arrival) {
      memberStates.set(memberId, 'arriving');
      webview?.postMessage({
        type: 'jcMemberArriving',
        agentId: arrival.agentId,
        memberId: arrival.memberId,
        deskId: arrival.deskId,
        seatUid: arrival.deskId,
        hueShift: arrival.hueShift,
        palette: arrival.palette,
      });
    }
    pendingArrivals.delete(memberId);
    pendingArrivalData.delete(memberId);
  }

  absenceTracker?.onToolStart(agentId, toolName, toolName);
  memberLastActivity.set(memberId, Date.now());

  const newState = toolToJCState(toolName);
  const currentState = memberStates.get(memberId);

  if (currentState !== newState) {
    memberStates.set(memberId, newState);
    webview?.postMessage({
      type: 'jcMemberStateChange',
      agentId,
      memberId,
      jcState: newState,
    });
  }

  if (activitySummarizer) {
    const summary = activitySummarizer.addEvent(agentId, toolName, status);
    if (summary) {
      webview?.postMessage({
        type: 'jcActivitySummary',
        agentId,
        memberId,
        summary,
      });
    }
  }
}

/**
 * Hook: called when agent becomes idle/waiting.
 */
export function onAgentIdle(agentId: number, webview: vscode.Webview | undefined): void {
  if (!jcEnabled) return;

  const memberId = getMemberForAgent(agentId);
  if (!memberId) return;

  memberStates.set(memberId, 'idle');
  webview?.postMessage({
    type: 'jcMemberStateChange',
    agentId,
    memberId,
    jcState: 'idle',
  });

  activitySummarizer?.clearAgent(agentId);
  webview?.postMessage({
    type: 'jcActivitySummary',
    agentId,
    memberId,
    summary: null,
  });
}

/** Set the function used to launch agent terminals (called by PixelAgentsViewProvider) */
export function setLaunchFunction(
  fn: (memberId: string, prompt: string, workingDir?: string) => Promise<void>,
): void {
  launchAgentFn = fn;
}

/** Submit a task to the orchestrator */
export function submitTask(
  memberId: string,
  prompt: string,
  priority: number,
  workingDirectory?: string,
): TaskDefinition | null {
  if (!taskWatcher) return null;
  return taskWatcher.submitTask(memberId, prompt, priority, workingDirectory);
}

/** Get task watcher instance */
export function getTaskWatcher(): TaskWatcher | null {
  return taskWatcher;
}

/** Get member IDs that should always be present in the office */
export function getPermanentResidents(): string[] {
  if (!jcConfig) return [];
  const permanentRoles = ['CEO', 'Secretary', 'PM / Director'];
  return jcConfig.members.filter((m) => permanentRoles.includes(m.role)).map((m) => m.id);
}

/** Send JC config to webview on initialization */
export function sendJCConfig(webview: vscode.Webview): void {
  if (!jcEnabled || !jcConfig) return;
  webview.postMessage({ type: 'jcConfigLoaded', config: jcConfig });
  webview.postMessage({ type: 'jcMappingUpdate', mappings: getAllMappings() });

  // Auto-arrive permanent residents (CEO, PM)
  const permanentIds = getPermanentResidents();
  for (const memberId of permanentIds) {
    const member = jcConfig.members.find((m) => m.id === memberId);
    const desk = getDeskByMemberId(memberId);
    if (member && desk) {
      memberStates.set(memberId, 'idle');
      webview.postMessage({
        type: 'jcMemberArriving',
        agentId: -100 - permanentIds.indexOf(memberId),
        memberId,
        deskId: desk.deskId,
        seatUid: desk.deskId,
        hueShift: member.hueShift,
        palette: member.palette ?? 0,
      });
    }
  }

  // Start absence tracker polling and send initial sync
  absenceTracker?.start(webview);
  // Start task watcher
  if (!taskWatcher && jcConfig && launchAgentFn) {
    const config = readConfig();
    taskWatcher = new TaskWatcher(
      jcConfig,
      new Map(), // agents map will be set separately
      config.maxConcurrentAgents,
      launchAgentFn,
    );
  }
  taskWatcher?.start(webview);

  // Start event watcher for file-based office events
  if (!eventWatcher && jcConfig && workspaceRootPath) {
    eventWatcher = new EventWatcher(jcConfig, workspaceRootPath);
  }
  eventWatcher?.start(webview);

  // Start idle timeout checker (every 30s)
  if (idleCheckTimer) clearInterval(idleCheckTimer);
  idleCheckTimer = setInterval(() => checkIdleMembers(webview), 30000);
}

/** Get the set of currently present member IDs */
export function getJCPresentMembers(): Set<string> {
  return getPresentMembers();
}

/** Get current activity summary for an agent */
export function getActivitySummary(agentId: number): string | null {
  return activitySummarizer?.getSummary(agentId) ?? null;
}

/** Get the event watcher instance (for programmatic event emission) */
export function getEventWatcher(): EventWatcher | null {
  return eventWatcher;
}

/** Check for idle members and trigger departures */
function checkIdleMembers(webview: vscode.Webview): void {
  if (!jcConfig) return;
  const now = Date.now();
  const permanentIds = new Set(getPermanentResidents());

  for (const [memberId, lastActivity] of memberLastActivity) {
    if (permanentIds.has(memberId)) continue; // Never depart permanent residents
    if (now - lastActivity < IDLE_TIMEOUT_MS) continue;

    const state = memberStates.get(memberId);
    if (state && state !== 'absent' && state !== 'leaving') {
      console.log(`[JC] Idle timeout for ${memberId} — triggering departure`);
      memberStates.set(memberId, 'leaving');
      const agentId = getAgentForMember(memberId);
      webview.postMessage({
        type: 'jcMemberLeaving',
        agentId: agentId ?? -300 - Math.floor(Math.random() * 1000),
        memberId,
      });
      memberLastActivity.delete(memberId);
    }
  }
}

/** Get agent ID for a member (reverse lookup) */
function getAgentForMember(memberId: string): number | null {
  const mappings = getAllMappings();
  for (const [agentIdStr, mId] of Object.entries(mappings)) {
    if (mId === memberId) return Number(agentIdStr);
  }
  return null;
}

/** Clean up JC resources */
export function disposeJC(): void {
  absenceTracker?.dispose();
  absenceTracker = null;
  taskWatcher?.dispose();
  taskWatcher = null;
  eventWatcher?.dispose();
  eventWatcher = null;
  activitySummarizer = null;
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer);
    idleCheckTimer = null;
  }
}
