import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  LAYOUT_DATA_DIR_ENV,
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  LAYOUT_MAX_DIMENSION,
  PREVIOUS_LAYOUT_SUFFIX,
} from './constants.js';

export type SavedLayout = Record<string, unknown>;

/** Accept existing v1 layouts without silently coercing corrupt saves. */
export function isSavedLayout(value: unknown): value is SavedLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const layout = value as SavedLayout;
  const { cols, rows, tiles, furniture } = layout;
  if (
    layout.version !== 1 ||
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    (cols as number) < 1 ||
    (rows as number) < 1 ||
    (cols as number) > LAYOUT_MAX_DIMENSION ||
    (rows as number) > LAYOUT_MAX_DIMENSION ||
    !Array.isArray(tiles) ||
    tiles.length !== (cols as number) * (rows as number) ||
    !tiles.every((tile) => Number.isInteger(tile) && ((tile >= 0 && tile <= 9) || tile === 255)) ||
    !Array.isArray(furniture)
  )
    return false;
  // Some shipped legacy rooms contain repeated decorative UIDs. Preserve those
  // rooms byte-for-value rather than making an upgrade reject its own old data.
  return furniture.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const f = item as SavedLayout;
    if (
      typeof f.uid !== 'string' ||
      !f.uid ||
      typeof f.type !== 'string' ||
      !f.type ||
      !Number.isInteger(f.col) ||
      !Number.isInteger(f.row)
    )
      return false;
    return true;
  });
}

export function getLayoutFilePath(): string {
  return path.join(
    process.env[LAYOUT_DATA_DIR_ENV] || path.join(os.homedir(), LAYOUT_FILE_DIR),
    LAYOUT_FILE_NAME,
  );
}

export function createLayoutStore(filePath = getLayoutFilePath()) {
  const previousPath = filePath + PREVIOUS_LAYOUT_SUFFIX;
  function read(file = filePath): SavedLayout | null {
    try {
      const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      return isSavedLayout(value) ? value : null;
    } catch {
      return null;
    }
  }
  function write(file: string, layout: SavedLayout): void {
    if (!isSavedLayout(layout))
      throw new Error('配置データを読み込めません。保存済みの配置は変更していません。');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(layout, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  function save(layout: SavedLayout): void {
    write(filePath, layout);
  }
  function replace(layout: SavedLayout): SavedLayout {
    if (!isSavedLayout(layout)) throw new Error('新しい初期配置を読み込めません。');
    const current = read();
    if (!current && fs.existsSync(filePath))
      throw new Error('現在の配置を読み込めないため、切り替えませんでした。');
    // Repeated application must not replace the original backup with the default.
    if (JSON.stringify(current) === JSON.stringify(layout)) return layout;
    if (current) write(previousPath, current);
    save(layout);
    return layout;
  }
  function restore(): SavedLayout {
    const previous = read(previousPath);
    if (!previous) throw new Error('戻せる配置がありません。');
    return replace(previous);
  }
  return {
    read,
    save,
    replace,
    restore,
    exists: () => fs.existsSync(filePath),
    hasPrevious: () => read(previousPath) !== null,
  };
}

export type LayoutStore = ReturnType<typeof createLayoutStore>;

/** Shared by the extension and standalone host; no AI work is dispatched. */
export function handleLayoutCommand(
  command: { type?: string; layout?: unknown },
  respond: (message: unknown) => void,
  defaultLayout: SavedLayout | null,
  store: LayoutStore = createLayoutStore(),
  onChanged?: (layout: SavedLayout) => void,
): boolean {
  if (!command || typeof command !== 'object') return false;
  if (
    !['saveLayout', 'layout:useDefault', 'layout:restore', 'layout:status'].includes(
      command.type ?? '',
    )
  )
    return false;
  try {
    let changed: SavedLayout | null = null;
    if (command.type === 'saveLayout') {
      if (!isSavedLayout(command.layout)) throw new Error('配置データを読み込めません。');
      store.save(command.layout);
      changed = command.layout;
    } else if (command.type === 'layout:useDefault') {
      if (!defaultLayout) throw new Error('新しい初期配置が見つかりません。');
      changed = store.replace(defaultLayout);
    } else if (command.type === 'layout:restore') {
      changed = store.restore();
    }
    if (changed) {
      if (onChanged) onChanged(changed);
      else respond({ type: 'layoutLoaded', layout: changed });
    }
    respond({
      type: 'layout:status',
      success: true,
      hasPrevious: store.hasPrevious(),
      canUseDefault: !!defaultLayout,
      action: command.type,
    });
  } catch (error) {
    respond({
      type: 'layout:status',
      success: false,
      hasPrevious: store.hasPrevious(),
      canUseDefault: !!defaultLayout,
      error: error instanceof Error ? error.message : '配置を保存できませんでした。',
      action: command.type,
    });
  }
  return true;
}
