import { isBrowserRuntime } from './runtime.js';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

// ── Connection status for browser mode ───────────────────────────
type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
const connectionListeners = new Set<(status: ConnectionStatus) => void>();

/** Subscribe to WebSocket connection status changes (browser mode only) */
export function onConnectionStatusChange(listener: (status: ConnectionStatus) => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

function notifyStatus(status: ConnectionStatus): void {
  for (const listener of connectionListeners) {
    listener(status);
  }
}

// ── Browser API with auto-reconnect ─────────────────────────────
function createBrowserApi(): { postMessage(msg: unknown): void } {
  const wsPort = (window as unknown as Record<string, unknown>).__PIXEL_AGENTS_WS_PORT__ as
    | number
    | undefined;

  if (!wsPort) {
    // No WS port — console-only mock
    return { postMessage: (msg: unknown) => console.log('[vscode.postMessage]', msg) };
  }

  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const maxAttempts = 20;
  const messageQueue: unknown[] = [];

  function connect(): void {
    try {
      ws = new WebSocket(`ws://localhost:${wsPort}`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[WS] Connected to extension');
      reconnectAttempts = 0;
      notifyStatus('connected');
      // Flush queued messages
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as unknown;
        window.dispatchEvent(new MessageEvent('message', { data: parsed }));
      } catch {
        console.warn('[WS] Failed to parse message:', event.data);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      notifyStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror — reconnect handled there
    };
  }

  function scheduleReconnect(): void {
    if (reconnectAttempts >= maxAttempts) {
      console.warn('[WS] Max reconnection attempts reached');
      return;
    }
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
    console.log(
      `[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts}/${maxAttempts})`,
    );
    notifyStatus('reconnecting');
    setTimeout(connect, delay);
  }

  connect();

  return {
    postMessage: (msg: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        messageQueue.push(msg);
      }
    },
  };
}

// ── Export ────────────────────────────────────────────────────────
export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? createBrowserApi()
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
