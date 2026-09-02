import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AVATAR_ACCESSORY_MAX, AVATAR_CONFIG_VERSION } from '../shared/assets/constants.js';
import { AVATAR_FILE_NAME, LAYOUT_FILE_DIR, LAYOUT_FILE_POLL_INTERVAL_MS } from './constants.js';

export interface AvatarWatcher {
  markOwnWrite(avatars: Record<string, unknown>): void;
  dispose(): void;
}

function getAvatarFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, AVATAR_FILE_NAME);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isColor(value: unknown): boolean {
  if (value === null) return true;
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.h === 'number' &&
    Number.isFinite(value.h) &&
    typeof value.s === 'number' &&
    Number.isFinite(value.s) &&
    typeof value.b === 'number' &&
    Number.isFinite(value.b) &&
    typeof value.c === 'number' &&
    Number.isFinite(value.c) &&
    (value.colorize === undefined || typeof value.colorize === 'boolean')
  );
}

export function isAvatarFile(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.version !== AVATAR_CONFIG_VERSION ||
    !isPlainRecord(record.avatars) ||
    (record.avatarRevision !== undefined &&
      (!Number.isInteger(record.avatarRevision) || (record.avatarRevision as number) < 0))
  ) {
    return false;
  }

  const validSlots = new Set(['bottom', 'top', 'face', 'hair', 'accessory']);
  for (const [memberId, rawConfig] of Object.entries(record.avatars)) {
    if (!memberId || !isPlainRecord(rawConfig)) return false;
    if (!isPlainRecord(rawConfig.base) || !Array.isArray(rawConfig.layers)) return false;
    if (
      typeof rawConfig.base.part !== 'string' ||
      rawConfig.base.part.length === 0 ||
      !isColor(rawConfig.base.color)
    ) {
      return false;
    }

    const seenSlots = new Set<string>();
    let accessories = 0;
    for (const rawLayer of rawConfig.layers) {
      if (!isPlainRecord(rawLayer)) return false;
      if (
        typeof rawLayer.slot !== 'string' ||
        !validSlots.has(rawLayer.slot) ||
        typeof rawLayer.part !== 'string' ||
        rawLayer.part.length === 0 ||
        !isColor(rawLayer.color)
      ) {
        return false;
      }
      if (rawLayer.slot === 'accessory') {
        accessories += 1;
        if (accessories > AVATAR_ACCESSORY_MAX) return false;
      } else {
        if (seenSlots.has(rawLayer.slot)) return false;
        seenSlots.add(rawLayer.slot);
      }
    }
  }
  return true;
}

export function readAvatarsFromFile(): Record<string, unknown> | null {
  const filePath = getAvatarFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return isAvatarFile(parsed) ? parsed : null;
  } catch (err) {
    console.error('[Pixel Agents] Failed to read avatar file:', err);
    return null;
  }
}

function serializeAvatars(avatars: Record<string, unknown>): string {
  return JSON.stringify(avatars, null, 2);
}

export function writeAvatarsToFile(avatars: Record<string, unknown>): boolean {
  if (!isAvatarFile(avatars)) {
    console.error('[Pixel Agents] Refusing to write malformed avatar config');
    return false;
  }
  const filePath = getAvatarFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, serializeAvatars(avatars), 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.error('[Pixel Agents] Failed to write avatar file:', err);
    return false;
  }
}

export function migrateAndLoadAvatars(
  defaultAvatars?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const fromFile = readAvatarsFromFile();
  if (fromFile) {
    if (defaultAvatars && isAvatarFile(defaultAvatars)) {
      const fileRevision =
        typeof fromFile.avatarRevision === 'number' ? fromFile.avatarRevision : 0;
      const defaultRevision =
        typeof defaultAvatars.avatarRevision === 'number' ? defaultAvatars.avatarRevision : 0;
      if (defaultRevision > fileRevision) {
        const merged = {
          ...fromFile,
          version: AVATAR_CONFIG_VERSION,
          avatarRevision: defaultRevision,
          avatars: {
            ...(defaultAvatars.avatars as Record<string, unknown>),
            ...(fromFile.avatars as Record<string, unknown>),
          },
        };
        console.log(
          `[Pixel Agents] Merging bundled avatar revision ${defaultRevision} into user config`,
        );
        if (writeAvatarsToFile(merged)) return merged;
      }
    }
    console.log('[Pixel Agents] Avatars loaded from file');
    return fromFile;
  }
  // A malformed or newer-version file is still user data. Keep it intact and
  // use bundled defaults for this session instead of silently overwriting it.
  if (fs.existsSync(getAvatarFilePath())) {
    console.warn('[Pixel Agents] Avatar file is invalid or unsupported; preserving it');
    return defaultAvatars && isAvatarFile(defaultAvatars) ? defaultAvatars : null;
  }
  if (defaultAvatars && isAvatarFile(defaultAvatars)) {
    console.log('[Pixel Agents] Writing bundled default avatars to file');
    writeAvatarsToFile(defaultAvatars);
    return defaultAvatars;
  }
  return null;
}

export function watchAvatarFile(
  onExternalChange: (avatars: Record<string, unknown>) => void,
): AvatarWatcher {
  const filePath = getAvatarFilePath();
  let ownWriteContents: string | null = null;
  let lastContents: string | null = null;
  let fsWatcher: fs.FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  try {
    if (fs.existsSync(filePath)) lastContents = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // Polling will retry.
  }

  function checkForChange(): void {
    if (disposed) return;
    try {
      if (!fs.existsSync(filePath)) {
        lastContents = null;
        return;
      }
      const contents = fs.readFileSync(filePath, 'utf-8');
      if (contents === lastContents) return;
      lastContents = contents;
      if (ownWriteContents !== null && contents === ownWriteContents) {
        ownWriteContents = null;
        return;
      }
      ownWriteContents = null;
      const parsed: unknown = JSON.parse(contents);
      if (isAvatarFile(parsed)) onExternalChange(parsed);
    } catch (err) {
      console.error('[Pixel Agents] Error checking avatar file:', err);
    }
  }

  function startFsWatch(): void {
    if (disposed || fsWatcher || !fs.existsSync(filePath)) return;
    try {
      fsWatcher = fs.watch(filePath, (eventType) => {
        checkForChange();
        if (eventType === 'rename') {
          fsWatcher?.close();
          fsWatcher = null;
        }
      });
      fsWatcher.on('error', () => {
        fsWatcher?.close();
        fsWatcher = null;
      });
    } catch {
      // Polling remains the cross-platform fallback.
    }
  }

  startFsWatch();
  pollTimer = setInterval(() => {
    if (!fsWatcher) startFsWatch();
    checkForChange();
  }, LAYOUT_FILE_POLL_INTERVAL_MS);

  return {
    markOwnWrite(avatars: Record<string, unknown>): void {
      ownWriteContents = serializeAvatars(avatars);
    },
    dispose(): void {
      disposed = true;
      fsWatcher?.close();
      fsWatcher = null;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    },
  };
}
