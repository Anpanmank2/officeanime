/**
 * Server-side asset decoders — shared between Vite plugin, extension host,
 * and future standalone backends.
 *
 * Reads PNG files from an assets directory and decodes them into SpriteData
 * format using the shared pngDecoder module.
 */

import * as fs from 'fs';
import * as path from 'path';

import { decodeCharacterPng, decodeFloorPng, parseWallPng, pngToSpriteData } from './pngDecoder.js';
import type { AvatarPartAsset, CatalogEntry, CharacterDirectionSprites } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function listSortedPngs(dir: string, pattern: RegExp): { index: number; filename: string }[] {
  if (!fs.existsSync(dir)) return [];
  const files: { index: number; filename: string }[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const match = pattern.exec(entry);
    if (match) {
      files.push({ index: parseInt(match[1], 10), filename: entry });
    }
  }
  return files.sort((a, b) => a.index - b.index);
}

// ── Decoders ─────────────────────────────────────────────────────────────────

export function decodeAllCharacters(assetsDir: string): CharacterDirectionSprites[] {
  const charDir = path.join(assetsDir, 'characters');
  const files = listSortedPngs(charDir, /^char_(\d+)\.png$/i);
  return files.map(({ filename }) => {
    const pngBuffer = fs.readFileSync(path.join(charDir, filename));
    return decodeCharacterPng(pngBuffer);
  });
}

export function decodeAllFloors(assetsDir: string): string[][][] {
  const floorsDir = path.join(assetsDir, 'floors');
  const files = listSortedPngs(floorsDir, /^floor_(\d+)\.png$/i);
  return files.map(({ filename }) => {
    const pngBuffer = fs.readFileSync(path.join(floorsDir, filename));
    return decodeFloorPng(pngBuffer);
  });
}

export function decodeAllWalls(assetsDir: string): string[][][][] {
  const wallsDir = path.join(assetsDir, 'walls');
  const files = listSortedPngs(wallsDir, /^wall_(\d+)\.png$/i);
  return files.map(({ filename }) => {
    const pngBuffer = fs.readFileSync(path.join(wallsDir, filename));
    return parseWallPng(pngBuffer);
  });
}

export function decodeAllFurniture(
  assetsDir: string,
  catalog: CatalogEntry[],
): Record<string, string[][]> {
  const sprites: Record<string, string[][]> = {};
  for (const entry of catalog) {
    try {
      const filePath = path.join(assetsDir, entry.furniturePath);
      if (!fs.existsSync(filePath)) continue;
      const pngBuffer = fs.readFileSync(filePath);
      sprites[entry.id] = pngToSpriteData(pngBuffer, entry.width, entry.height);
    } catch (err) {
      console.warn(`[decodeAssets] Failed to decode ${entry.id}:`, err);
    }
  }
  return sprites;
}

export function decodeAllAvatarParts(
  assetsDir: string,
  catalog: AvatarPartAsset[],
): Record<string, CharacterDirectionSprites> {
  const sprites: Record<string, CharacterDirectionSprites> = {};
  const root = path.resolve(assetsDir);
  for (const entry of catalog) {
    try {
      const filePath = path.resolve(root, entry.avatarPath);
      if (
        (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) ||
        !fs.existsSync(filePath)
      ) {
        continue;
      }
      sprites[entry.id] = decodeCharacterPng(fs.readFileSync(filePath));
    } catch (err) {
      console.warn(`[decodeAssets] Failed to decode avatar part ${entry.id}:`, err);
    }
  }
  return sprites;
}
