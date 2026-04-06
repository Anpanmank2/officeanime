/**
 * Browser runtime mock — fetches assets and injects the same postMessage
 * events the VS Code extension would send.
 *
 * In Vite dev, it prefers pre-decoded JSON endpoints from middleware.
 * In plain browser builds, it falls back to decoding PNGs at runtime.
 *
 * Only imported in browser runtime; tree-shaken from VS Code webview runtime.
 */

import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
  FLOOR_TILE_SIZE,
  PNG_ALPHA_THRESHOLD,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from '../../shared/assets/constants.ts';
import type {
  AssetIndex,
  CatalogEntry,
  CharacterDirectionSprites,
} from '../../shared/assets/types.ts';

interface MockPayload {
  characters: CharacterDirectionSprites[];
  floorSprites: string[][][];
  wallSets: string[][][][];
  furnitureCatalog: CatalogEntry[];
  furnitureSprites: Record<string, string[][]>;
  layout: unknown;
}

// ── Module-level state ─────────────────────────────────────────────────────────

let mockPayload: MockPayload | null = null;

// ── PNG decode helpers (browser fallback) ───────────────────────────────────

interface DecodedPng {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  if (a < PNG_ALPHA_THRESHOLD) return '';
  const rgb =
    `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  if (a >= 255) return rgb;
  return `${rgb}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

function getPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

function readSprite(
  png: DecodedPng,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): string[][] {
  const sprite: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(png.data, png.width, offsetX + x, offsetY + y);
      row.push(rgbaToHex(r, g, b, a));
    }
    sprite.push(row);
  }
  return sprite;
}

async function decodePng(url: string): Promise<DecodedPng> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch PNG: ${url} (${res.status.toString()})`);
  }
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Failed to create 2d canvas context for PNG decode');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: imageData.data };
}

async function fetchJsonOptional<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function getIndexedAssetPath(kind: 'characters' | 'floors' | 'walls', relPath: string): string {
  return relPath.startsWith(`${kind}/`) ? relPath : `${kind}/${relPath}`;
}

async function decodeCharactersFromPng(
  base: string,
  index: AssetIndex,
): Promise<CharacterDirectionSprites[]> {
  const sprites: CharacterDirectionSprites[] = [];
  for (const relPath of index.characters) {
    const png = await decodePng(`${base}assets/${getIndexedAssetPath('characters', relPath)}`);
    const byDir: CharacterDirectionSprites = { down: [], up: [], right: [] };

    for (let dirIdx = 0; dirIdx < CHARACTER_DIRECTIONS.length; dirIdx++) {
      const dir = CHARACTER_DIRECTIONS[dirIdx];
      const rowOffsetY = dirIdx * CHAR_FRAME_H;
      const frames: string[][][] = [];
      for (let frame = 0; frame < CHAR_FRAMES_PER_ROW; frame++) {
        frames.push(readSprite(png, CHAR_FRAME_W, CHAR_FRAME_H, frame * CHAR_FRAME_W, rowOffsetY));
      }
      byDir[dir] = frames;
    }

    sprites.push(byDir);
  }
  return sprites;
}

async function decodeFloorsFromPng(base: string, index: AssetIndex): Promise<string[][][]> {
  const floors: string[][][] = [];
  for (const relPath of index.floors) {
    const png = await decodePng(`${base}assets/${getIndexedAssetPath('floors', relPath)}`);
    floors.push(readSprite(png, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE));
  }
  return floors;
}

async function decodeWallsFromPng(base: string, index: AssetIndex): Promise<string[][][][]> {
  const wallSets: string[][][][] = [];
  for (const relPath of index.walls) {
    const png = await decodePng(`${base}assets/${getIndexedAssetPath('walls', relPath)}`);
    const set: string[][][] = [];
    for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
      const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
      const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
      set.push(readSprite(png, WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT, ox, oy));
    }
    wallSets.push(set);
  }
  return wallSets;
}

async function decodeFurnitureFromPng(
  base: string,
  catalog: CatalogEntry[],
): Promise<Record<string, string[][]>> {
  const sprites: Record<string, string[][]> = {};
  for (const entry of catalog) {
    const png = await decodePng(`${base}assets/${entry.furniturePath}`);
    sprites[entry.id] = readSprite(png, entry.width, entry.height);
  }
  return sprites;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Call before createRoot() in main.tsx.
 * Fetches all pre-decoded assets from the Vite dev server and stores them
 * for dispatchMockMessages().
 */
/** JC config loaded during init for permanent resident dispatch */
let jcConfigData: {
  members?: Array<{
    id: string;
    role: string;
    department?: string;
    hueShift: number;
    palette?: number;
    deskId: string;
  }>;
} | null = null;

export async function initBrowserMock(): Promise<void> {
  console.log('[BrowserMock] Loading assets...');

  const base = import.meta.env.BASE_URL; // '/' in dev, '/sub/' with a subpath, './' in production

  // Load JC config for permanent resident spawning
  try {
    const configRes = await fetch(`${base}jc-config.json`);
    if (configRes.ok) {
      jcConfigData = (await configRes.json()) as typeof jcConfigData;
      console.log('[BrowserMock] JC config loaded');
    }
  } catch {
    // JC config not available — skip permanent residents
  }

  const [assetIndex, catalog] = await Promise.all([
    fetch(`${base}assets/asset-index.json`).then((r) => r.json()) as Promise<AssetIndex>,
    fetch(`${base}assets/furniture-catalog.json`).then((r) => r.json()) as Promise<CatalogEntry[]>,
  ]);

  const shouldTryDecoded = import.meta.env.DEV;
  const [decodedCharacters, decodedFloors, decodedWalls, decodedFurniture] = shouldTryDecoded
    ? await Promise.all([
        fetchJsonOptional<CharacterDirectionSprites[]>(`${base}assets/decoded/characters.json`),
        fetchJsonOptional<string[][][]>(`${base}assets/decoded/floors.json`),
        fetchJsonOptional<string[][][][]>(`${base}assets/decoded/walls.json`),
        fetchJsonOptional<Record<string, string[][]>>(`${base}assets/decoded/furniture.json`),
      ])
    : [null, null, null, null];

  const hasDecoded = !!(decodedCharacters && decodedFloors && decodedWalls && decodedFurniture);

  if (!hasDecoded) {
    if (shouldTryDecoded) {
      console.log('[BrowserMock] Decoded JSON not found, decoding PNG assets in browser...');
    } else {
      console.log('[BrowserMock] Decoding PNG assets in browser...');
    }
  }

  const [characters, floorSprites, wallSets, furnitureSprites] = hasDecoded
    ? [decodedCharacters!, decodedFloors!, decodedWalls!, decodedFurniture!]
    : await Promise.all([
        decodeCharactersFromPng(base, assetIndex),
        decodeFloorsFromPng(base, assetIndex),
        decodeWallsFromPng(base, assetIndex),
        decodeFurnitureFromPng(base, catalog),
      ]);

  const layout = assetIndex.defaultLayout
    ? await fetch(`${base}assets/${assetIndex.defaultLayout}`).then((r) => r.json())
    : null;

  mockPayload = {
    characters,
    floorSprites,
    wallSets,
    furnitureCatalog: catalog,
    furnitureSprites,
    layout,
  };

  console.log(
    `[BrowserMock] Ready (${hasDecoded ? 'decoded-json' : 'browser-png-decode'}) — ${characters.length} chars, ${floorSprites.length} floors, ${wallSets.length} wall sets, ${catalog.length} furniture items`,
  );
}

/**
 * Call inside a useEffect in App.tsx — after the window message listener
 * in useExtensionMessages has been registered.
 */
export function dispatchMockMessages(): void {
  if (!mockPayload) return;

  const { characters, floorSprites, wallSets, furnitureCatalog, furnitureSprites, layout } =
    mockPayload;

  function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', { data }));
  }

  // JC config must load BEFORE layoutLoaded (so member data is available for arrivals)
  if (jcConfigData?.members) {
    dispatch({ type: 'jcConfigLoaded', config: jcConfigData });
  }

  // Must match the load order defined in CLAUDE.md:
  // characterSpritesLoaded → floorTilesLoaded → wallTilesLoaded → furnitureAssetsLoaded → layoutLoaded
  dispatch({ type: 'characterSpritesLoaded', characters });
  dispatch({ type: 'floorTilesLoaded', sprites: floorSprites });
  dispatch({ type: 'wallTilesLoaded', sets: wallSets });
  dispatch({ type: 'furnitureAssetsLoaded', catalog: furnitureCatalog, sprites: furnitureSprites });
  dispatch({ type: 'layoutLoaded', layout });
  dispatch({
    type: 'settingsLoaded',
    soundEnabled: false,
    extensionVersion: '1.2.0',
    lastSeenVersion: '1.1',
  });

  console.log('[BrowserMock] Messages dispatched');

  // Spawn permanent residents AFTER layoutLoaded has been processed.
  // Use setTimeout to ensure layoutReadyRef is true before arrivals are dispatched.
  if (jcConfigData?.members) {
    setTimeout(() => {
      const permanentRoles = ['CEO', 'Secretary', 'PM / Director'];
      const residents = jcConfigData!.members!.filter((m) => permanentRoles.includes(m.role));
      residents.forEach((member, idx) => {
        dispatch({
          type: 'jcMemberArriving',
          agentId: -100 - idx,
          memberId: member.id,
          deskId: member.deskId,
          seatUid: member.deskId,
          hueShift: member.hueShift,
          palette: member.palette ?? 0,
        });
      });
      console.log(`[BrowserMock] ${residents.length} permanent residents dispatched`);
    }, 100);
  }

  // Start event listening — prefer HMR push, fall back to polling
  startEventListening();
}

// ── jc-events listening (HMR push primary, polling fallback) ────────────────

const EVENT_POLL_MS = 3000;
let lastEventIndex = 0;
let hmrConnected = false;

interface JCEventsFile {
  version: number;
  events: Array<Record<string, unknown>>;
}

function startEventListening(): void {
  // Primary: HMR custom event from Vite server (real-time, no polling)
  if (import.meta.hot) {
    import.meta.hot.on('jc-events-update', (data: { events: Record<string, unknown>[] }) => {
      if (!hmrConnected) {
        hmrConnected = true;
        console.log('[BrowserMock] HMR event channel connected');
      }
      if (data.events && Array.isArray(data.events)) {
        console.log(`[BrowserMock] HMR push: ${data.events.length} event(s)`);
        for (const event of data.events) {
          handleBrowserEvent(event);
        }
      }
    });
    console.log('[BrowserMock] HMR event listener registered');
  }

  // Fallback: polling for production builds or when HMR is unavailable
  if (!import.meta.hot) {
    startEventPolling();
  } else {
    // Even with HMR, start polling after a delay as safety net
    // (in case HMR connection drops)
    setTimeout(() => {
      if (!hmrConnected) {
        console.log('[BrowserMock] HMR not delivering events, starting polling fallback');
        startEventPolling();
      }
    }, 5000);
  }
}

function startEventPolling(): void {
  setInterval(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}jc-events.json?t=${Date.now()}`);
      if (!res.ok) return;
      const file = (await res.json()) as JCEventsFile;
      if (!file.events) return;

      // Reset index if file was rewritten with fewer events
      if (file.events.length < lastEventIndex) {
        console.log(
          `[BrowserMock] Events file rewritten (${lastEventIndex} → ${file.events.length}), resetting`,
        );
        lastEventIndex = 0;
      }

      if (file.events.length <= lastEventIndex) return;

      const newEvents = file.events.slice(lastEventIndex);
      lastEventIndex = file.events.length;

      for (const event of newEvents) {
        handleBrowserEvent(event);
      }
    } catch {
      // File not available or mid-write
    }
  }, EVENT_POLL_MS);
  console.log(`[BrowserMock] Event polling started (${EVENT_POLL_MS}ms interval)`);
}

function dispatch(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function findMember(id: string) {
  return jcConfigData?.members?.find((m) => m.id === id);
}

function handleBrowserEvent(event: Record<string, unknown>): void {
  const type = event.event as string;
  console.log(`[BrowserMock] Event: ${type}`, event);

  switch (type) {
    case 'agent_leave': {
      const memberId = event.agent as string;
      dispatch({ type: 'jcMemberLeaving', agentId: -200 - Math.random() * 1000, memberId });
      break;
    }

    case 'task_received': {
      // CEO gets speech bubble
      const ceo = jcConfigData?.members?.find((m) => m.role === 'CEO');
      if (ceo) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `recv-${Date.now()}`,
            memberId: ceo.id,
            text: `受領: ${(event.task as string)?.slice(0, 20) ?? ''}`,
            department: 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      break;
    }

    case 'task_assigned': {
      const toIds = event.to as string[];
      for (const memberId of toIds) {
        const member = findMember(memberId);
        if (member) {
          dispatch({
            type: 'jcMemberArriving',
            agentId: -200 - Math.floor(Math.random() * 1000),
            memberId,
            deskId: member.deskId,
            seatUid: member.deskId,
            hueShift: member.hueShift,
            palette: member.palette ?? 0,
          });
        }
      }
      // Speech bubble on assigner
      const fromId = event.from as string;
      const from = findMember(fromId);
      if (from) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `assign-${Date.now()}`,
            memberId: fromId,
            text: `${(event.task as string)?.slice(0, 15) ?? ''}をお願い`,
            department: from.department ?? 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      break;
    }

    case 'role_escalate': {
      // Arrive target, beam, speech bubble
      const toId = event.to as string;
      const toMember = findMember(toId);
      if (toMember) {
        dispatch({
          type: 'jcMemberArriving',
          agentId: -200 - Math.floor(Math.random() * 1000),
          memberId: toId,
          deskId: toMember.deskId,
          seatUid: toMember.deskId,
          hueShift: toMember.hueShift,
          palette: toMember.palette ?? 0,
        });
      }
      dispatch({
        type: 'jcLiaison',
        fromMemberId: event.from as string,
        toMemberId: toId,
        color: '#ffbf00',
        duration: 2000,
      });
      const fromMember = findMember(event.from as string);
      if (fromMember) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `escalate-${Date.now()}`,
            memberId: event.from as string,
            text: ((event.message as string) ?? '').slice(0, 25),
            department: fromMember.department ?? 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      break;
    }

    case 'delegate': {
      const delegatees = event.to as string[];
      for (const memberId of delegatees) {
        const member = findMember(memberId);
        if (member) {
          dispatch({
            type: 'jcMemberArriving',
            agentId: -200 - Math.floor(Math.random() * 1000),
            memberId,
            deskId: member.deskId,
            seatUid: member.deskId,
            hueShift: member.hueShift,
            palette: member.palette ?? 0,
          });
          dispatch({
            type: 'jcLiaison',
            fromMemberId: event.from as string,
            toMemberId: memberId,
            color: '#39ff14',
            duration: 2000,
          });
        }
      }
      const delFrom = findMember(event.from as string);
      if (delFrom) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `delegate-${Date.now()}`,
            memberId: event.from as string,
            text: ((event.message as string) ?? '').slice(0, 25),
            department: delFrom.department ?? 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      break;
    }

    case 'delegation_complete': {
      dispatch({
        type: 'jcLiaison',
        fromMemberId: event.from as string,
        toMemberId: event.to as string,
        color: '#00b4ff',
        duration: 1500,
      });
      const compFrom = findMember(event.from as string);
      if (compFrom) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `complete-${Date.now()}`,
            memberId: event.from as string,
            text: ((event.message as string) ?? '').slice(0, 25),
            department: compFrom.department ?? 'exec',
            timestamp: Date.now(),
            duration: 2000,
          },
        });
      }
      break;
    }

    case 'work_started': {
      const agentId = event.agent as string;
      dispatch({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: agentId,
        jcState: 'coding',
      });
      break;
    }

    case 'cross_dept_message': {
      dispatch({
        type: 'jcLiaison',
        fromMemberId: event.from as string,
        toMemberId: event.to as string,
        color: '#bf5fff',
        duration: 2000,
      });
      // Trigger 👋 wave on the recipient
      dispatch({
        type: 'jcWave',
        memberId: event.to as string,
      });
      const msgFrom = findMember(event.from as string);
      if (msgFrom) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `msg-${Date.now()}`,
            memberId: event.from as string,
            text: ((event.message as string) ?? '').slice(0, 25),
            department: msgFrom.department ?? 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      break;
    }

    case 'task_completed': {
      const doneAgent = event.agent as string;
      const doneMember = findMember(doneAgent);
      if (doneMember) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `done-${Date.now()}`,
            memberId: doneAgent,
            text: '完了しました！',
            department: doneMember.department ?? 'exec',
            timestamp: Date.now(),
            duration: 3000,
          },
        });
      }
      // Trigger 🎉 emotion emoji
      dispatch({
        type: 'jcTaskCompleted',
        memberId: doneAgent,
      });
      dispatch({
        type: 'jcMemberStateChange',
        agentId: -200 - Math.floor(Math.random() * 1000),
        memberId: doneAgent,
        jcState: 'idle',
      });
      break;
    }

    case 'progress_check': {
      dispatch({
        type: 'jcLiaison',
        fromMemberId: event.from as string,
        toMemberId: event.to as string,
        color: '#666688',
        duration: 1000,
      });
      const secFrom = findMember(event.from as string);
      if (secFrom) {
        dispatch({
          type: 'jcSpeechBubble',
          bubble: {
            id: `progress-${Date.now()}`,
            memberId: event.from as string,
            text: ((event.message as string) ?? '').slice(0, 25),
            department: secFrom.department ?? 'exec',
            timestamp: Date.now(),
            duration: 2000,
          },
        });
      }
      break;
    }

    default:
      console.log(`[BrowserMock] Unknown event type: ${type}`);
  }
}
