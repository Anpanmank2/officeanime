import type {
  AvatarPartAsset,
  AvatarSlot as AvatarSlotType,
  CharacterDirectionSprites,
} from '../../../../shared/assets/types.js';
export {
  AVATAR_ACCESSORY_MAX,
  AvatarSlot,
  AVATAR_FRAME_HEIGHT as CHAR_FRAME_H,
  AVATAR_FRAME_WIDTH as CHAR_FRAME_W,
  AVATAR_FRAMES_PER_ROW as CHAR_FRAMES_PER_ROW,
} from '../../constants.js';
import { AVATAR_ACCESSORY_MAX, AvatarSlot } from '../../constants.js';
import type { FloorColor } from '../types.js';

export interface AvatarBaseConfig {
  part: string;
  color: FloorColor | null;
}

export interface AvatarLayerConfig {
  slot: Exclude<AvatarSlotType, 'base'>;
  part: string;
  color: FloorColor | null;
}

export interface AvatarConfig {
  base: AvatarBaseConfig;
  layers: AvatarLayerConfig[];
}

export interface AvatarConfigFile {
  version: 1;
  /** Revision of the bundled defaults already merged into this user file. */
  avatarRevision?: number;
  avatars: Record<string, AvatarConfig>;
}

export interface LoadedAvatarParts {
  catalog: AvatarPartAsset[];
  sprites: ReadonlyMap<string, CharacterDirectionSprites>;
}

function isColor(value: unknown): value is FloorColor | null {
  if (value === null) return true;
  if (!isPlainRecord(value)) return false;
  const color = value as Record<string, unknown>;
  return (
    typeof color.h === 'number' &&
    Number.isFinite(color.h) &&
    typeof color.s === 'number' &&
    Number.isFinite(color.s) &&
    typeof color.b === 'number' &&
    Number.isFinite(color.b) &&
    typeof color.c === 'number' &&
    Number.isFinite(color.c) &&
    (color.colorize === undefined || typeof color.colorize === 'boolean')
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseAvatarConfigFile(value: unknown): AvatarConfigFile | null {
  if (!isPlainRecord(value)) return null;
  const file = value as Record<string, unknown>;
  if (
    file.version !== 1 ||
    !isPlainRecord(file.avatars) ||
    (file.avatarRevision !== undefined &&
      (!Number.isInteger(file.avatarRevision) || (file.avatarRevision as number) < 0))
  ) {
    return null;
  }
  const avatars: Record<string, AvatarConfig> = {};
  for (const [memberId, rawConfig] of Object.entries(file.avatars)) {
    if (!memberId || !isPlainRecord(rawConfig)) return null;
    const config = rawConfig as Record<string, unknown>;
    if (!isPlainRecord(config.base) || !Array.isArray(config.layers)) return null;
    const base = config.base as Record<string, unknown>;
    if (typeof base.part !== 'string' || base.part.length === 0 || !isColor(base.color))
      return null;
    const layers: AvatarLayerConfig[] = [];
    const seenSlots = new Set<string>();
    let accessoryCount = 0;
    let valid = true;
    for (const rawLayer of config.layers) {
      if (!isPlainRecord(rawLayer)) {
        valid = false;
        break;
      }
      const layer = rawLayer as Record<string, unknown>;
      if (
        ![
          AvatarSlot.BOTTOM,
          AvatarSlot.TOP,
          AvatarSlot.FACE,
          AvatarSlot.HAIR,
          AvatarSlot.ACCESSORY,
        ].includes(layer.slot as Exclude<AvatarSlotType, 'base'>) ||
        typeof layer.part !== 'string' ||
        layer.part.length === 0 ||
        !isColor(layer.color)
      ) {
        valid = false;
        break;
      }
      if (layer.slot === AvatarSlot.ACCESSORY) {
        accessoryCount += 1;
        if (accessoryCount > AVATAR_ACCESSORY_MAX) {
          valid = false;
          break;
        }
      } else if (seenSlots.has(String(layer.slot))) {
        valid = false;
        break;
      }
      seenSlots.add(String(layer.slot));
      layers.push(layer as unknown as AvatarLayerConfig);
    }
    if (!valid) return null;
    avatars[memberId] = { base: base as unknown as AvatarBaseConfig, layers };
  }
  return {
    version: 1,
    ...(typeof file.avatarRevision === 'number' ? { avatarRevision: file.avatarRevision } : {}),
    avatars,
  };
}
