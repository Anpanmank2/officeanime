/**
 * Shared constants — used by the extension host, Vite build scripts,
 * and future standalone backend.
 *
 * No VS Code dependency. Only asset parsing and layout-related values.
 */

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 2;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 11;
export const CHAR_COUNT = 6;
export const AVATAR_ATLAS_WIDTH = CHAR_FRAME_W * CHAR_FRAMES_PER_ROW;
export const AVATAR_ATLAS_HEIGHT = CHAR_FRAME_H * CHARACTER_DIRECTIONS.length;
export const AVATAR_PARTS_DIR = 'avatar-parts';
export const DEFAULT_AVATARS_FILE_NAME = 'default-avatars.json';
export const AVATAR_CONFIG_VERSION = 1;
/** Bundled persona roster revision. Increment when default avatar assignments change. */
export const AVATAR_DEFAULTS_REVISION = 1;
export const AVATAR_ACCESSORY_MAX = 2;
