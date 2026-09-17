import * as fs from 'fs';
import type { ExtensionContext } from 'vscode';

import { LAYOUT_FILE_POLL_INTERVAL_MS, WORKSPACE_KEY_LAYOUT } from './constants.js';
import { createLayoutStore, getLayoutFilePath, isSavedLayout } from './layoutStore.js';

export interface LayoutWatcher {
  markOwnWrite(): void;
  dispose(): void;
}

export function readLayoutFromFile(): Record<string, unknown> | null {
  return createLayoutStore().read();
}

export function writeLayoutToFile(layout: Record<string, unknown>): boolean {
  try {
    createLayoutStore().save(layout);
    return true;
  } catch (err) {
    console.error('[Pixel Agents] Failed to write layout file:', err);
    return false;
  }
}

export interface LayoutLoadResult {
  layout: Record<string, unknown>;
  /** Kept for protocol compatibility. Loading never resets a saved layout. */
  wasReset: boolean;
}

/**
 * Load layout with migration from workspace state:
 * 1. If file exists → preserve it regardless of the bundled revision
 * 2. Else if workspace state has layout → write to file, clear workspace state, return it
 * 3. Else if defaultLayout provided → write to file, return it
 * 4. Else → return null
 */
export function migrateAndLoadLayout(
  context: ExtensionContext,
  defaultLayout?: Record<string, unknown> | null,
): LayoutLoadResult | null {
  // 1. Existing user layouts remain authoritative across upgrades.
  const fromFile = readLayoutFromFile();
  if (fromFile) {
    console.log('[Pixel Agents] Layout loaded from file');
    return { layout: fromFile, wasReset: false };
  }

  // A corrupt save is preserved for recovery, never overwritten by a default.
  if (createLayoutStore().exists()) {
    return defaultLayout ? { layout: defaultLayout, wasReset: false } : null;
  }

  // 2. Migrate from workspace state
  const fromState = context.workspaceState.get<Record<string, unknown>>(WORKSPACE_KEY_LAYOUT);
  if (fromState) {
    console.log('[Pixel Agents] Migrating layout from workspace state to file');
    if (writeLayoutToFile(fromState))
      context.workspaceState.update(WORKSPACE_KEY_LAYOUT, undefined);
    return { layout: fromState, wasReset: false };
  }

  // 3. Use bundled default
  if (defaultLayout) {
    console.log('[Pixel Agents] Writing bundled default layout to file');
    writeLayoutToFile(defaultLayout);
    return { layout: defaultLayout, wasReset: false };
  }

  // 4. Nothing
  return null;
}

/**
 * Watch ~/.pixel-agents/layout.json for external changes (other VS Code windows).
 * Uses hybrid fs.watch + polling (same pattern as JSONL watching).
 */
export function watchLayoutFile(
  onExternalChange: (layout: Record<string, unknown>) => void,
): LayoutWatcher {
  const filePath = getLayoutFilePath();
  let lastContent: string | null = null;
  let fsWatcher: fs.FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  // Compare contents: atomic replacement and same-timestamp writes are both valid.
  try {
    lastContent = fs.readFileSync(filePath, 'utf8');
  } catch {
    /* ignore */
  }

  function checkForChange(): void {
    if (disposed) return;
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw === lastContent) return;
      lastContent = raw;
      const layout: unknown = JSON.parse(raw);
      if (!isSavedLayout(layout)) return;
      console.log('[Pixel Agents] External layout change detected');
      onExternalChange(layout);
    } catch (err) {
      console.error('[Pixel Agents] Error checking layout file:', err);
    }
  }

  function startFsWatch(): void {
    if (disposed || fsWatcher) return;
    try {
      if (!fs.existsSync(filePath)) return;
      fsWatcher = fs.watch(filePath, () => {
        checkForChange();
      });
      fsWatcher.on('error', () => {
        // fs.watch can be unreliable — polling backup handles it
        fsWatcher?.close();
        fsWatcher = null;
      });
    } catch {
      // File may not exist yet — polling will retry
    }
  }

  // Start fs.watch if file exists
  startFsWatch();

  // Polling backup (also starts fs.watch if file appears)
  pollTimer = setInterval(() => {
    if (disposed) return;
    if (!fsWatcher) {
      startFsWatch();
    }
    checkForChange();
  }, LAYOUT_FILE_POLL_INTERVAL_MS);

  return {
    markOwnWrite(): void {
      // Called after a successful local write; the next external write must still arrive.
      try {
        lastContent = fs.readFileSync(filePath, 'utf8');
      } catch {
        /* ignore */
      }
    },
    dispose(): void {
      disposed = true;
      fsWatcher?.close();
      fsWatcher = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
