// ── Just Curious Virtual Office — Agent-to-Member Mapper ────────

import * as vscode from 'vscode';

import type { AgentState } from '../types.js';
import type { JCConfig, JCMember, MappingRule } from './types.js';

/** Minimalist glob matching: supports * and ** patterns */
function simpleGlobMatch(pattern: string, value: string): boolean {
  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

/** Active mappings: agentId → memberId */
const activeMappings = new Map<number, string>();

/** Reverse lookup: memberId → agentId */
const reverseMappings = new Map<string, number>();

/** Try to automatically resolve which member an agent maps to */
export function resolveMapping(
  agentId: number,
  agent: AgentState,
  config: JCConfig,
): string | null {
  // Already mapped
  const existing = activeMappings.get(agentId);
  if (existing) return existing;

  for (const rule of config.mapping.rules) {
    if (rule.projectPattern && simpleGlobMatch(rule.projectPattern, agent.projectDir)) {
      // Check if member is already assigned to another agent
      const existingAgent = reverseMappings.get(rule.memberId);
      if (existingAgent !== undefined && existingAgent !== agentId) {
        continue; // Member already occupied
      }
      return rule.memberId;
    }
  }
  return null;
}

/** Assign a mapping (called after auto-resolve or manual pick) */
export function assignMapping(agentId: number, memberId: string): void {
  // Clear any existing mapping for this agent
  const oldMember = activeMappings.get(agentId);
  if (oldMember) {
    reverseMappings.delete(oldMember);
  }
  // Clear any existing mapping for this member
  const oldAgent = reverseMappings.get(memberId);
  if (oldAgent !== undefined) {
    activeMappings.delete(oldAgent);
  }
  activeMappings.set(agentId, memberId);
  reverseMappings.set(memberId, agentId);
  console.log(`[JC] Mapped agent ${agentId} → member ${memberId}`);
}

/** Remove mapping when agent is closed */
export function removeMapping(agentId: number): string | undefined {
  const memberId = activeMappings.get(agentId);
  if (memberId) {
    activeMappings.delete(agentId);
    reverseMappings.delete(memberId);
    console.log(`[JC] Unmapped agent ${agentId} (was ${memberId})`);
  }
  return memberId;
}

/** Get member ID for an agent */
export function getMemberForAgent(agentId: number): string | undefined {
  return activeMappings.get(agentId);
}

/** Get agent ID for a member */
export function getAgentForMember(memberId: string): number | undefined {
  return reverseMappings.get(memberId);
}

/** Get all active mappings */
export function getAllMappings(): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [agentId, memberId] of activeMappings) {
    result[agentId] = memberId;
  }
  return result;
}

/** Get all present member IDs */
export function getPresentMembers(): Set<string> {
  return new Set(reverseMappings.keys());
}

/** Show QuickPick for manual member assignment */
export async function promptMemberSelection(
  agentId: number,
  config: JCConfig,
): Promise<string | undefined> {
  const availableMembers = config.members.filter(
    (m) => !reverseMappings.has(m.id) && m.id !== 'res-06', // exclude vacant seat
  );

  if (availableMembers.length === 0) {
    vscode.window.showWarningMessage('[JC] All members are already assigned to agents.');
    return undefined;
  }

  const items = availableMembers.map((m: JCMember) => ({
    label: `${m.id}: ${m.name}`,
    description: `${m.role} (${m.department})`,
    memberId: m.id,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Agent #${agentId} をどのメンバーに割り当てますか？`,
    title: 'Just Curious — メンバー割り当て',
  });

  return pick?.memberId;
}
