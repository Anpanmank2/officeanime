import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

function createBrowserApi(): { postMessage(msg: unknown): void } {
  const wsPort = (window as unknown as Record<string, unknown>).__PIXEL_AGENTS_WS_PORT__ as
    | number
    | undefined;

  if (wsPort) {
    // Browser mode with WebSocket bridge to extension
    const ws = new WebSocket(`ws://localhost:${wsPort}`);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as unknown;
        window.dispatchEvent(new MessageEvent('message', { data: parsed }));
      } catch {
        console.warn('[WS] Failed to parse message:', event.data);
      }
    };
    ws.onopen = () => console.log('[WS] Connected to extension');
    ws.onclose = () => console.log('[WS] Disconnected from extension');
    return {
      postMessage: (msg: unknown) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },
    };
  }

  // Browser mode without WS — console log mock
  return { postMessage: (msg: unknown) => console.log('[vscode.postMessage]', msg) };
}

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? createBrowserApi()
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
