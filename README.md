# JC Virtual Office (officeanime)

> Forked from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) — a pixel art VS Code extension where AI agents become animated office characters.

**JC Virtual Office** extends Pixel Agents with a full virtual company simulation for [Just Curious](https://github.com/Anpanmank2/officeanime). 28 AI agent members across 3 departments + governance are visualized in a pixel art office, with real-time state tracking driven by `jc-events.json` orchestration events.

## What This Fork Adds

### Standalone Browser Mode

The webview can run outside VS Code as a standalone web app (`vite dev` or static build). Runtime detection in `webview-ui/src/runtime.ts` switches between `'vscode'` and `'browser'` mode. In browser mode, `browserMock.ts` loads assets via HTTP and simulates the VS Code extension message protocol, so the full office renders at `localhost:5173` without any IDE.

### jc-events.json Integration

The `/company` Claude Code skill writes orchestration events to `jc-events.json` at the workspace root. The office watches this file and translates events into character animations in real time:

| Event | Effect |
|-------|--------|
| `delegate` | CEO character walks to department lead, delegation beam animation |
| `work_started` | Agent arrives at desk, starts coding/reading animation |
| `task_completed` | Celebration emoji, agent returns to idle |
| `cross_dept_message` | Speech bubble between department zones |
| `review_requested` / `review_completed` | Reviewing state + handoff animation |
| `agent_leave` | Matrix-style despawn effect |

Events follow the schema defined in `webview-ui/src/jc/jc-types.ts` (`OfficeEventType`).

### 13-State Character FSM

Beyond the upstream idle/walk/type/read states, JC adds a 13-state FSM (`jc-types.ts: JCState`):

`absent` | `arriving` | `coding` | `thinking` | `reading` | `reviewing` | `presenting` | `meeting` | `break` | `error` | `idle` | `handoff` | `leaving`

State transitions are managed by `jc-state.ts` with per-member runtime tracking (idle timers, emotion emojis, focus detection).

### JC-Specific Components (`webview-ui/src/jc/`)

| Component | Purpose |
|-----------|---------|
| `jc-state.ts` | Member runtime state management, FSM transitions |
| `jc-overlay.ts` | Canvas overlay rendering (nameplates, state dots, department neon zones, delegation beams) |
| `jc-types.ts` | Type definitions for members, tasks, events, office log |
| `jc-constants.ts` | Neon color palettes, department colors, bubble emojis, timing constants |
| `JCMemberInfoPanel.tsx` | Click-to-inspect member detail panel |
| `AgentDashboard.tsx` | Real-time agent activity dashboard |
| `AgentDetailPopup.tsx` | Per-agent stats popup (tasks, uptime, rejections) |
| `CommandCenter.tsx` | Task dispatch and broadcast UI |
| `OfficeLog.tsx` | Chronological office event log with department filters |
| `KanbanPanel.tsx` | Visual task board |
| `TaskQueue.tsx` | Priority-sorted task queue display |
| `DelegationChain.tsx` | Delegation flow visualization |
| `AbsentStatusPopup.tsx` | Absent member tracking overlay |

### Per-Member Idle Emojis & Emotion System

Each of the 28 members has a unique idle emoji reflecting their persona (e.g., CEO: clipboard, Research Lead: chart). After 10s idle, the member's signature emoji appears in a blink cycle. Emotion emojis (celebration, frustration, focus fire) trigger on state transitions.

### Department Zones & Neon Theming

The office layout is divided into zones (`dev`, `marketing`, `research`, `exec`, `ops`) with per-department neon color palettes for overlays, glows, and UI elements. Constants in `jc-constants.ts`.

### Desk Nameplates & Permanent Residents

Members have assigned desks with rendered nameplates. Certain roles (CEO, Secretary, PM) are permanent residents that never auto-depart on idle timeout.

## Configuration

Member roster and desk assignments are defined in `jc-config.json` at the workspace root. The extension reads this on startup and passes it to the webview as `JCConfigData`.

## Requirements

- VS Code 1.105.0+ (extension mode) or any modern browser (standalone mode)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) for agent terminals
- Node.js 18+ for building

## Build

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Press **F5** in VS Code for the Extension Development Host, or `cd webview-ui && npm run dev` for standalone browser mode.

## Quality Gate

Pre-push hooks run 4 automated tests. All must pass before push:

```bash
node scripts/test-sprite-decode.mjs   # Sprite integrity (176x96, 11 frames)
node scripts/test-state-machine.mjs   # FSM state transitions
node scripts/test-jc-events.mjs       # Event type parsing + robustness
node scripts/test-e2e-browser.mjs     # Playwright: browser launch, character arrival, event reception
```

## Repository

- **This fork**: [Anpanmank2/officeanime](https://github.com/Anpanmank2/officeanime)
- **Upstream**: [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)

## Credits

- **Pixel Agents** by [Pablo De Lucca](https://github.com/pablodelucca) — the original VS Code extension this project is forked from. Licensed under [MIT](LICENSE).
- **Character sprites** based on [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## License

[MIT License](LICENSE) (inherited from upstream).
