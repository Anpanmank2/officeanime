/**
 * Asset pipeline types — shared between the extension host, Vite build
 * scripts, browser mock, and future standalone backends.
 */

export interface CharacterDirectionSprites {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export const AvatarSlot = {
  BASE: 'base',
  BOTTOM: 'bottom',
  TOP: 'top',
  FACE: 'face',
  HAIR: 'hair',
  ACCESSORY: 'accessory',
} as const;
export type AvatarSlot = (typeof AvatarSlot)[keyof typeof AvatarSlot];

export interface AvatarPartManifest {
  id: string;
  slot: AvatarSlot;
  name: string;
  file?: string;
  width: number;
  height: number;
  frames: number;
  colorable: boolean;
  zOverride?: number | null;
}

export interface AvatarPartAsset extends AvatarPartManifest {
  file: string;
  avatarPath: string;
}

export interface AssetIndex {
  floors: string[];
  walls: string[];
  characters: string[];
  defaultLayout: string | null;
  defaultAvatars: string | null;
}

export interface CatalogEntry {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  furniturePath: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  groupId?: string;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}
