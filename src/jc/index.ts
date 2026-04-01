// ── Just Curious Virtual Office — Main Orchestrator ──────────────
// This is the single integration point called from the fork's code.

import type * as vscode from 'vscode';

import { readConfig } from '../configPersistence.js';
import type { AgentState } from '../types.js';
import { AbsenceTracker } from './absence-tracker.js';
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
import { toolToJCState } from './state-machine.js';
import { TaskWatcher } from './task-watcher.js';
import type { JCConfig, JCState, TaskDefinition } from './types.js';

/** JC runtime state */
let jcConfig: JCConfig | null = null;
let jcEnabled = false;

/** Per-member JC state tracking */
const memberStates = new Map<string, JCState>();

/** Absence tracker instance */
let absenceTracker: AbsenceTracker | null = null;

/** Task watcher instance */
let taskWatcher: TaskWatcher | null = null;

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
    memberStates.set(memberId, 'arriving');
    absenceTracker?.onAgentCreated(memberId);

    const desk = getDeskByMemberId(memberId);
    const member = jcConfig.members.find((m) => m.id === memberId);

    if (desk && member) {
      webview?.postMessage({
        type: 'jcMemberArriving',
        agentId,
        memberId,
        deskId: desk.deskId,
        seatUid: desk.deskId, // seat UID in the layout matches deskId
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
  webview: vscode.Webview | undefined,
): void {
  if (!jcEnabled) return;

  const memberId = getMemberForAgent(agentId);
  if (!memberId) return;

  absenceTracker?.onToolStart(agentId, toolName, toolName);

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

/** Send JC config to webview on initialization */
export function sendJCConfig(webview: vscode.Webview): void {
  if (!jcEnabled || !jcConfig) return;
  webview.postMessage({ type: 'jcConfigLoaded', config: jcConfig });
  webview.postMessage({ type: 'jcMappingUpdate', mappings: getAllMappings() });
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
}

/** Get the set of currently present member IDs */
export function getJCPresentMembers(): Set<string> {
  return getPresentMembers();
}

/** Clean up JC resources */
export function disposeJC(): void {
  absenceTracker?.dispose();
  absenceTracker = null;
  taskWatcher?.dispose();
  taskWatcher = null;
}
