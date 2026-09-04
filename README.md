# JC Virtual Office (officeanime)

> Forked from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) — a pixel art VS Code extension where AI agents become animated office characters.

**JC Virtual Office** extends Pixel Agents with a full virtual company simulation. The roster is data-driven from `jc-config.json` — as of 2026-09-03 it holds 23 members across 3 departments (engineering 6 / marketing 7 / research 9, plus 1 exec-zone seat) and 3 exec seats (Owner, Secretary, PM). Members are visualized in a pixel art office with real-time state tracking driven by `jc-events.json` orchestration events.

## What This Fork Adds

### Standalone Browser Mode

The webview can run outside VS Code as a standalone web app (`vite dev` or static build). Runtime detection in `webview-ui/src/runtime.ts` switches between `'vscode'` and `'browser'` mode. In browser mode, `browserMock.ts` loads assets via HTTP and simulates the VS Code extension message protocol, so the full office renders at `localhost:5173` without any IDE.

### jc-events.json Integration

An orchestrator (the /company Claude Code skill) appends orchestration events to `jc-events.json` at the repository root. The office watches this file and translates events into character animations in real time. The event names below are the `OfficeEventType` union in `webview-ui/src/jc/jc-types.ts` (2026-09-03: 9 types):

| Event | Effect |
|-------|--------|
| `office_open` | Office opens for the day, heartbeat starts |
| `task_received` / `task_assigned` | Task enters the board, assignment beam to the assignee |
| `work_started` | Agent arrives at desk, starts coding/reading animation |
| `cross_dept_message` | Speech bubble between department zones |
| `review_requested` / `review_completed` | Reviewing state + handoff animation |
| `task_completed` | Celebration emoji, agent returns to idle |
| `agent_leave` | Matrix-style despawn effect |

Malformed events (missing `task` / `message`) are guarded so a bad line cannot kill the watcher — see `scripts/test-malformed-delegate.mts`.

### 13-State Character FSM

Beyond the upstream idle/walk/type/read states, JC adds a 13-state FSM (`jc-types.ts: JCState`):

`absent` | `arriving` | `coding` | `thinking` | `reading` | `reviewing` | `presenting` | `meeting` | `break` | `error` | `idle` | `handoff` | `leaving`

State transitions are managed by `jc-state.ts` with per-member runtime tracking (idle timers, emotion emojis, focus detection).

### JC-Specific Components (`webview-ui/src/jc/`)

Core state and rendering:

| Module | Purpose |
|--------|---------|
| `jc-state.ts` | Member runtime state management, FSM transitions |
| `jc-overlay.ts` | Canvas overlay rendering (nameplates, state dots, department neon zones, delegation beams) |
| `jc-types.ts` | Type definitions for members, tasks, events, office log |
| `jc-constants.ts` | Neon color palettes, department colors, idle emojis, timing constants |
| `karte-state.ts` | Member card (karte) derivation — profile, status bars, current task |
| `office-hours-state.ts` | Office open/closed heartbeat |
| `game-state.ts` / `pet-state.ts` | Affinity gauge loop / owner pet companion state |

Panels and UI (2026-09-03 snapshot — see the directory listing for the full set):

| Component | Purpose |
|-----------|---------|
| `JCMemberInfoPanel.tsx` | Click-to-inspect member detail panel |
| `DeptKartePanel.tsx` | Member card: profile-first tabs + status bars |
| `CompanyActivationBoard.tsx` | Company-wide activation / workload board |
| `DelegationDock.tsx` | Dock-based delegation: pick a target, dispatch a request |
| `RequestFlowPanel.tsx` / `RequestResultPanel.tsx` / `ResearchResultPanel.tsx` | Request templates → confirmation gate → result / findings |
| `ApprovalTray.tsx` | Approval gate for write-type plans |
| `PetStatusPanel.tsx` | Owner pet companion (egg → chick) status |
| `OfficeLog.tsx` / `DelegationChain.tsx` / `AbsentStatusPopup.tsx` | Event log, delegation flow, absent tracking |
| `ModeSwitcher.tsx` / `OwnerAvatar.tsx` | Mode switch + Owner avatar |

### Per-Member Idle Emojis & Emotion System

Every member has an idle emoji reflecting their persona (e.g. secretary: pen, research lead: bar chart, tech lead: eyes). The map is `MEMBER_IDLE_EMOJIS` in `jc-constants.ts` — 23 entries as of 2026-09-03. After 10s idle the member's signature emoji appears in a blink cycle (5s on / 3s off). Emotion emojis (celebration, frustration, focus fire) trigger on state transitions.

### Department Zones & Neon Theming

The office layout is divided into zones — `entrance`, `exec`, `poker`, `break`, `dev`, `marketing`, `research`, `ops` (the `ZoneType` union in `jc-types.ts`) — with per-department neon color palettes for overlays, glows, and UI elements. Constants in `jc-constants.ts`.

### Desk Nameplates & Permanent Residents

Members have assigned desks with rendered nameplates. The roles in `PERMANENT_ROLES` (`jc-constants.ts` — 2026-09-03: Secretary and PM / Director) are permanent residents that never auto-depart on idle timeout.

### Delegation Dock, Request Flow & Approval Gate

Delegation is dock-driven: pick a member, choose a request template (research / documentation / implementation), confirm the derived plan, then run it. Read-only research runs surface findings in `ResearchResultPanel`; write-type plans stop at an approval gate (`ApprovalTray`) before any scoped write happens.

### Member Card, Activation Board & Owner Pet

`DeptKartePanel` renders a per-member card (profile-first tabs, status bars, derived current task) and `CompanyActivationBoard` aggregates the same derivation company-wide — the workload derivation is the single source of truth for chips, desk lighting, cards and state display, pinned by `scripts/test-workload.mts`. An owner-side pet companion hatches from egg to chick alongside office activity (`PetStatusPanel.tsx`, `pet-state.ts`).

## Configuration

Member roster, desk assignments and public-safe persona bios are defined in `jc-config.json` at the repository root (schema `version: 2`). The extension reads this on startup and passes it to the webview as `JCConfigData`. Bios are hand-written fiction for the pixel-office world — no real internal routing, project names or decision criteria are stored here.

## Requirements

- VS Code 1.105.0+ (extension mode) or any modern browser (standalone mode)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) for agent terminals
- Node.js ^20.19 or >=22.12 for building (required by Vite 8 in `webview-ui/`)

## Build

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build          # check-types + lint + esbuild + webview build
```

Press **F5** in VS Code for the Extension Development Host. For standalone browser mode run `npm run dev` inside `webview-ui/` (Vite dev server), or `npm run serve` at the root to serve the built bundle. Playwright end-to-end specs live in `e2e/` (`npm run e2e`).

## Quality Gate

The pre-push hook runs `npm run compile` plus the checks below (2026-09-03: 6 gate scripts). All must pass before push — there is no bypass:

```bash
node scripts/test-sprite-decode.mjs          # Sprite integrity (176x96, 11 frames)
node scripts/test-state-machine.mjs          # FSM state transitions
node scripts/test-jc-events.mjs              # Event type parsing + robustness
npx tsx scripts/test-malformed-delegate.mts  # Malformed events must not kill the watcher
npx tsx scripts/test-workload.mts            # Workload derivation (source of truth for chips/lighting/cards)
node scripts/test-e2e-browser.mjs            # Playwright: browser launch, permanent residents appear
```

## Repository

- **This fork**: [Anpanmank2/officeanime](https://github.com/Anpanmank2/officeanime)
- **Upstream**: [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)

## Credits

- **Pixel Agents** by [Pablo De Lucca](https://github.com/pablodelucca) — the original VS Code extension this project is forked from. Licensed under [MIT](LICENSE).
- **Character sprites** based on [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## License

[MIT License](LICENSE) (inherited from upstream).
