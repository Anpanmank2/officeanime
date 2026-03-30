// ── Browser Server — HTTP static file server + WebSocket ──────────

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export interface BrowserServer {
  port: number;
  broadcast: (data: unknown) => void;
  wss: InstanceType<typeof WebSocketServer>;
  close: () => void;
}

export function startBrowserServer(extensionPath: string, port = 8432): Promise<BrowserServer> {
  const webviewRoot = path.join(extensionPath, 'dist', 'webview');
  const assetsRoot = path.join(extensionPath, 'dist', 'assets');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url ?? '/';
      // Strip query string
      const qIdx = urlPath.indexOf('?');
      if (qIdx >= 0) urlPath = urlPath.slice(0, qIdx);

      if (urlPath === '/') urlPath = '/index.html';

      // Try webview root first, then assets fallback
      let filePath = path.join(webviewRoot, urlPath);
      if (!fs.existsSync(filePath)) {
        // Try dist/assets/ fallback for asset files
        filePath = path.join(assetsRoot, urlPath.replace(/^\/assets\//, '/'));
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

      if (urlPath === '/index.html') {
        // Inject WS port script tag into index.html
        let html = fs.readFileSync(filePath, 'utf-8');
        html = html.replace(
          '<head>',
          `<head><script>window.__PIXEL_AGENTS_WS_PORT__=${port}</script>`,
        );
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(html);
        return;
      }

      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
      stream.on('error', () => {
        res.writeHead(500);
        res.end('Internal error');
      });
    });

    const wss = new WebSocketServer({ server });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
    });

    const broadcast = (data: unknown): void => {
      const json = JSON.stringify(data);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(json);
        }
      }
    };

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(port, () => {
      console.log(`[JC] Browser server listening on http://localhost:${port}`);
      resolve({
        port,
        broadcast,
        wss,
        close: () => {
          wss.close();
          server.close();
        },
      });
    });
  });
}
