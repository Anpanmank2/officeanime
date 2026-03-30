// ── Just Curious Virtual Office — Main Orchestrator ──────────────
// This is the single integration point called from the fork's code.

import type * as vscode from 'vscode';

import type { AgentState } from '../types.js';
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
import type { JCConfig, JCState } from './types.js';

/** JC runtime state */
let jcConfig: JCConfig | null = null;
let jcEnabled = false;

/** Per-member JC state tracking */
const memberStates = new Map<string, JCState>();

/** Initialize JC system. Call once from extension.ts activate(). */
export function initJC(workspaceRoot: string): boolean {
  jcEnabled = isJCEnabled(workspaceRoot);
  if (!jcEnabled) {
    console.log('[JC] JC mode disabled (no jc-config.json)');
    return false;
  }
  jcConfig = loadJCConfig(workspaceRoot);
  if (!jcConfig) {
    jcEnabled = false;
    return false;
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

/** Send JC config to webview on initialization */
export function sendJCConfig(webview: vscode.Webview): void {
  if (!jcEnabled || !jcConfig) return;
  webview.postMessage({ type: 'jcConfigLoaded', config: jcConfig });
  webview.postMessage({ type: 'jcMappingUpdate', mappings: getAllMappings() });
}

/** Get the set of currently present member IDs */
export function getJCPresentMembers(): Set<string> {
  return getPresentMembers();
}
