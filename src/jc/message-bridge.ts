// ── Message Bridge — Webview + WebSocket broadcast ──────────────

import type { WebSocket } from 'ws';

/** Message types that should be replayed for new browser connections */
const REPLAY_TYPES = new Set([
  'characterSpritesLoaded',
  'floorTilesLoaded',
  'wallTilesLoaded',
  'furnitureAssetsLoaded',
  'layoutLoaded',
  'settingsLoaded',
  'jcConfigLoaded',
  'jcMappingUpdate',
  'existingAgents',
]);

export interface MessageBridge {
  /** Seed the replay buffer with pre-existing data (for late start) */
  seedReplayBuffer: (messages: unknown[]) => void;
  /** Replay buffered init state to a newly connected WebSocket */
  sendInitialState: (ws: WebSocket) => void;
  /** Handle incoming message from a browser client */
  handleWsMessage: (ws: WebSocket, raw: string) => void;
}

export function createMessageBridge(options?: {
  onBrowserCommand?: (data: unknown, respond: (msg: unknown) => void) => void;
}): MessageBridge {
  /** Buffer of most recent message per type for replay */
  const replayBuffer = new Map<string, unknown>();

  const seedReplayBuffer = (messages: unknown[]): void => {
    for (const data of messages) {
      const msg = data as { type?: string };
      if (msg.type && REPLAY_TYPES.has(msg.type)) {
        replayBuffer.set(msg.type, data);
      }
    }
  };

  const sendInitialState = (ws: WebSocket): void => {
    // Send replay buffer in a sensible order
    const order = [
      'characterSpritesLoaded',
      'floorTilesLoaded',
      'wallTilesLoaded',
      'furnitureAssetsLoaded',
      'settingsLoaded',
      'layoutLoaded',
      'jcConfigLoaded',
      'existingAgents',
      'jcMappingUpdate',
    ];
    for (const type of order) {
      const msg = replayBuffer.get(type);
      if (msg) {
        ws.send(JSON.stringify(msg));
      }
    }
  };

  const handleWsMessage = (ws: WebSocket, raw: string): void => {
    try {
      const data = JSON.parse(raw) as unknown;
      if (options?.onBrowserCommand) {
        const respond = (msg: unknown): void => {
          if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        };
        options.onBrowserCommand(data, respond);
      }
    } catch {
      console.warn('[JC] Failed to parse WS message:', raw);
    }
  };

  return { seedReplayBuffer, sendInitialState, handleWsMessage };
}
