// ── Just Curious Virtual Office — Config Loader ─────────────────

import * as fs from 'fs';
import * as path from 'path';

import type { JCConfig } from './types.js';

let cachedConfig: JCConfig | null = null;

/** Resolve jc-config.json path: workspace root first, then extension path fallback */
function resolveConfigPath(workspaceRoot: string, extensionPath?: string): string | null {
  const candidate = path.join(workspaceRoot, 'jc-config.json');
  if (fs.existsSync(candidate)) return candidate;
  if (extensionPath) {
    const fallback = path.join(extensionPath, 'jc-config.json');
    if (fs.existsSync(fallback)) return fallback;
  }
  return null;
}

/** Load jc-config.json from workspace root, falling back to extension path */
export function loadJCConfig(workspaceRoot: string, extensionPath?: string): JCConfig | null {
  if (cachedConfig) return cachedConfig;

  const configPath = resolveConfigPath(workspaceRoot, extensionPath);
  if (!configPath) {
    console.log('[JC] jc-config.json not found in workspace or extension path');
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as JCConfig;
    console.log(
      `[JC] Config loaded from ${configPath}: ${cachedConfig.members.length} members, ${cachedConfig.exec.length} exec`,
    );
    return cachedConfig;
  } catch (err) {
    console.error('[JC] Failed to load jc-config.json:', err);
    return null;
  }
}

/** Clear cached config (for reloading) */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/** Check if JC mode is enabled (jc-config.json exists in workspace or extension path) */
export function isJCEnabled(workspaceRoot: string, extensionPath?: string): boolean {
  return resolveConfigPath(workspaceRoot, extensionPath) !== null;
}
