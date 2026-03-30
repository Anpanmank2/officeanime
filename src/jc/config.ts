// ── Just Curious Virtual Office — Config Loader ─────────────────

import * as fs from 'fs';
import * as path from 'path';

import type { JCConfig } from './types.js';

let cachedConfig: JCConfig | null = null;

/** Load jc-config.json from workspace root */
export function loadJCConfig(workspaceRoot: string): JCConfig | null {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(workspaceRoot, 'jc-config.json');
  try {
    if (!fs.existsSync(configPath)) {
      console.log('[JC] jc-config.json not found at', configPath);
      return null;
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as JCConfig;
    console.log(
      `[JC] Config loaded: ${cachedConfig.members.length} members, ${cachedConfig.exec.length} exec`,
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

/** Check if JC mode is enabled (jc-config.json exists) */
export function isJCEnabled(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, 'jc-config.json'));
}
