import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { buildAssetIndex, buildFurnitureCatalog } from '../shared/assets/build.ts';
import {
  decodeAllCharacters,
  decodeAllFloors,
  decodeAllFurniture,
  decodeAllWalls,
} from '../shared/assets/loader.ts';

// ── Decoded asset cache (invalidated on file change) ─────────────────────────

interface DecodedCache {
  characters: ReturnType<typeof decodeAllCharacters> | null;
  floors: ReturnType<typeof decodeAllFloors> | null;
  walls: ReturnType<typeof decodeAllWalls> | null;
  furniture: ReturnType<typeof decodeAllFurniture> | null;
}

// ── Vite plugin ───────────────────────────────────────────────────────────────

function browserMockAssetsPlugin(): Plugin {
  const assetsDir = path.resolve(__dirname, 'public/assets');
  const distAssetsDir = path.resolve(__dirname, '../dist/webview/assets');

  const cache: DecodedCache = { characters: null, floors: null, walls: null, furniture: null };

  function clearCache(): void {
    cache.characters = null;
    cache.floors = null;
    cache.walls = null;
    cache.furniture = null;
  }

  return {
    name: 'browser-mock-assets',
    configureServer(server) {
      // Strip trailing slash: '/' → '', '/sub/' → '/sub'
      const base = server.config.base.replace(/\/$/, '');

      // Catalog & index (existing)
      server.middlewares.use(`${base}/assets/furniture-catalog.json`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(buildFurnitureCatalog(assetsDir)));
      });
      server.middlewares.use(`${base}/assets/asset-index.json`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(buildAssetIndex(assetsDir)));
      });

      // Pre-decoded sprites (new — eliminates browser-side PNG decoding)
      server.middlewares.use(`${base}/assets/decoded/characters.json`, (_req, res) => {
        cache.characters ??= decodeAllCharacters(assetsDir);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(cache.characters));
      });
      server.middlewares.use(`${base}/assets/decoded/floors.json`, (_req, res) => {
        cache.floors ??= decodeAllFloors(assetsDir);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(cache.floors));
      });
      server.middlewares.use(`${base}/assets/decoded/walls.json`, (_req, res) => {
        cache.walls ??= decodeAllWalls(assetsDir);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(cache.walls));
      });
      server.middlewares.use(`${base}/assets/decoded/furniture.json`, (_req, res) => {
        cache.furniture ??= decodeAllFurniture(assetsDir, buildFurnitureCatalog(assetsDir));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(cache.furniture));
      });

      // Serve files from workspace root (jc-config.json, jc-events.json)
      const workspaceRoot = path.resolve(__dirname, '..');

      // jc-config.json — required for JC member data in browser mode
      server.middlewares.use(`${base}/jc-config.json`, (_req, res) => {
        const configPath = path.join(workspaceRoot, 'jc-config.json');
        try {
          if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(raw);
          } else {
            res.statusCode = 404;
            res.end('{}');
          }
        } catch {
          res.statusCode = 500;
          res.end('{}');
        }
      });
      server.middlewares.use(`${base}/jc-events.json`, (_req, res) => {
        const eventsPath = path.join(workspaceRoot, 'jc-events.json');
        try {
          if (fs.existsSync(eventsPath)) {
            const raw = fs.readFileSync(eventsPath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(raw);
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.end('{"version":1,"events":[]}');
          }
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.end('{"version":1,"events":[]}');
        }
      });

      // Hot-reload on asset file changes (PNGs, manifests, layouts)
      server.watcher.add(assetsDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(assetsDir)) {
          console.log(`[browser-mock-assets] Asset changed: ${path.relative(assetsDir, file)}`);
          clearCache();
          server.ws.send({ type: 'full-reload' });
        }
      });

      // ── jc-events.json HMR push ─────────────────────────────────────────
      // Watch jc-events.json and push new events to the browser via HMR
      // custom event, so characters react in real-time without polling.
      const eventsPath = path.join(workspaceRoot, 'jc-events.json');
      let lastPushedIndex = 0;

      function readAndPushNewEvents(): void {
        try {
          if (!fs.existsSync(eventsPath)) return;
          const raw = fs.readFileSync(eventsPath, 'utf-8');
          const file = JSON.parse(raw) as { version: number; events: unknown[] };
          if (!file.events || !Array.isArray(file.events)) return;

          // Reset if file was rewritten with fewer events
          if (file.events.length < lastPushedIndex) {
            console.log(
              `[jc-events-hmr] File rewritten (${lastPushedIndex} → ${file.events.length}), resetting`,
            );
            lastPushedIndex = 0;
          }

          if (file.events.length <= lastPushedIndex) return;

          const newEvents = file.events.slice(lastPushedIndex);
          lastPushedIndex = file.events.length;

          console.log(`[jc-events-hmr] Pushing ${newEvents.length} new event(s) to browser`);
          server.ws.send({
            type: 'custom',
            event: 'jc-events-update',
            data: { events: newEvents },
          });
        } catch {
          // File mid-write or invalid JSON — skip this cycle
        }
      }

      // Initialize index from current file content (don't replay old events)
      try {
        if (fs.existsSync(eventsPath)) {
          const raw = fs.readFileSync(eventsPath, 'utf-8');
          const file = JSON.parse(raw) as { version: number; events: unknown[] };
          if (file.events && Array.isArray(file.events)) {
            lastPushedIndex = file.events.length;
            console.log(`[jc-events-hmr] Initialized at index ${lastPushedIndex}`);
          }
        }
      } catch {
        // File doesn't exist yet — will start from 0
      }

      // Use fs.watch with debounce for rapid writes
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        fs.watch(eventsPath, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(readAndPushNewEvents, 100);
        });
        console.log(`[jc-events-hmr] Watching ${eventsPath}`);
      } catch {
        // File doesn't exist yet — watch the directory for creation
        const dirPath = path.dirname(eventsPath);
        fs.watch(dirPath, (_eventType, filename) => {
          if (filename === 'jc-events.json') {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(readAndPushNewEvents, 100);
          }
        });
        console.log(`[jc-events-hmr] Watching directory ${dirPath} for jc-events.json creation`);
      }
    },
    // Build output includes lightweight metadata consumed by browser runtime.
    closeBundle() {
      fs.mkdirSync(distAssetsDir, { recursive: true });

      const catalog = buildFurnitureCatalog(assetsDir);
      fs.writeFileSync(path.join(distAssetsDir, 'furniture-catalog.json'), JSON.stringify(catalog));
      fs.writeFileSync(
        path.join(distAssetsDir, 'asset-index.json'),
        JSON.stringify(buildAssetIndex(assetsDir)),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), browserMockAssetsPlugin()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
  },
  base: './',
});
