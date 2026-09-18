# JC Virtual Office (officeanime)

> Forked from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) — a pixel art VS Code extension where AI agents become animated office characters.

**JC Virtual Office** extends Pixel Agents with a full virtual company simulation. The roster is data-driven from `jc-config.json`; current membership totals and department breakdowns are derived from that file. Members are visualized in a pixel art office with real-time state tracking driven by `jc-events.json` orchestration events.

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
| `DeskDocsTray.tsx` | Always-visible pending approval badge and document decisions |
| `PetStatusPanel.tsx` | Owner pet companion (egg → chick) status |
| `OfficeLog.tsx` / `DelegationChain.tsx` | Approval / result / warning log and delegation flow |
| `OwnerAvatar.tsx` | Owner avatar |

### Persona-Based Avatars (Paperdoll Composition)

Each member can use a persona-based avatar assembled from layered base, clothing, face, hair, and accessory sprites.
`webview-ui/src/office/sprites/avatarComposite.ts` exports `composeAvatar`, which orders and overlays configured parts into animation frames.
Avatar configuration types and validation live in `webview-ui/src/office/sprites/avatarTypes.ts`; `webview-ui/src/office/sprites/spriteData.ts` selects composed sprites when parts and configuration are available.
The 41 committed part PNGs are stored under `webview-ui/public/assets/avatar-parts/`, with default assignments in `webview-ui/public/assets/default-avatars.json`.
`shared/assets/build.ts`, `shared/assets/loader.ts`, and `shared/assets/constants.ts` catalog, decode, and define the shared avatar assets.
`src/assetLoader.ts` loads and sends avatar parts to the webview, while `src/avatarPersistence.ts` validates and preserves persisted avatar configurations.
In standalone browser mode, `webview-ui/src/browserAvatarFailsoft.ts` keeps optional avatar-loading failures from preventing initialization.
Run `scripts/generate-avatar-parts.mts` to regenerate the part PNGs and default avatar configurations.
Run `scripts/render-avatar-gallery.mts` to render a gallery through the loader and `composeAvatar`; its committed output is `artifacts/persona-characters/avatar-gallery.png`.
Run `scripts/capture-persona-office.mts` against a running standalone office to capture `artifacts/persona-characters/persona-office.png`.
Coverage for composition, configuration, browser fallback, and development assets is in `webview-ui/test/avatarComposite.test.ts`, `webview-ui/test/avatarConfig.test.ts`, `webview-ui/test/browserMock-avatar-failsoft.test.ts`, and `webview-ui/test/dev-assets.test.ts`.

### Emotion System

Emotion emojis (celebration, frustration, focus fire) and active-work speech remain visible. Idle murmurs and signature idle emojis are removed.

### Department Zones & Neon Theming

The office layout is divided into zones — `entrance`, `exec`, `poker`, `break`, `dev`, `marketing`, `research`, `ops` (the `ZoneType` union in `jc-types.ts`) — with per-department neon color palettes for overlays, glows, and UI elements. Constants in `jc-constants.ts`.

### Desk Nameplates & Permanent Residents

Members have assigned desks with rendered nameplates. Permanent residents are identified by member ID, not by job title: the IDs in `PERMANENT_MEMBER_IDS` (`shared/jc-roster.ts` — the secretary desk and the PM desk) never auto-depart on idle timeout, so renaming a job title cannot break them.

### Desk Documents & Approvals

Issue requests through chat. The upper-left `UNO の机` tray always shows the pending count, including zero, and starts collapsed. Open it to read each question, body, sender, remaining time and optional project tag. Recommended choices are marked in green. Reversible choices resolve in one click; irreversible choices repeat the question in a confirmation row with confirm/back buttons. Office answers use the existing `jcApprovalAnswer` route; chat answers remove documents without a reload.

Office Log contains only approvals, completed results and warnings. The office retains its single default view, desk layout, vacant nameplates and Owner avatar.

### Member Card, Activation Board & Owner Pet

`DeptKartePanel` renders a per-member card (profile-first tabs, status bars, derived current task) and `CompanyActivationBoard` aggregates the same derivation company-wide — the workload derivation is the single source of truth for chips, desk lighting, cards and state display, pinned by `scripts/test-workload.mts`. An owner-side pet companion follows the recorded agent-pet stage (`PetStatusPanel.tsx`, `pet-state.ts`).

## Configuration

Member roster, desk assignments and public-safe persona bios are defined in `jc-config.json` at the repository root (schema `version: 2`). The extension reads this on startup and passes it to the webview as `JCConfigData`. Bios are hand-written fiction for the pixel-office world — no real internal routing, project names or decision criteria are stored here.

`codex-01` is a bot seat, not a person: it reflects the state of external implementation jobs. Its events are emitted by the runner.

### Companion calendar and first voice

The office reads the optional `~/.agent-pet/<pet>/` records without running a hook or changing the pet. Growth uses zero-based calendar age from `growth.born_at`, with the producer's local 04:00 day boundary. The recorded stage is preserved. A valid individual `stage-days.json` overrides the current defaults `[0, 3, 10, 25, 45, 70]`; absent or broken overrides use those defaults. `shared/agent-pet.ts` mirrors agent-pet's current repository config, so future default changes need a coordinated update. Growth conditions, bond and stress are not shown as numbers or meters.

The office and companion card share pixel sprites for all six stages: a droplet, a sprouted body, then a growing familiar. Only the recorded `lineage.kind` (`cat`, `dog`, `rabbit`, `maru`) and `look.direction` (`cool`, `cute`, `mixed`) cross the appearance boundary. An undecided lineage keeps the common sprouted form; the UI never assigns a species or changes the saved stage. Body direction begins at stage 3. Click bounds and speech placement follow the growing sprite.

An updated agent-pet `pet-day-start` saves its actual first display text in `first-voice.json`: `{schema:"first-voice/1", id, date, kind, text}`. Normal records contain two lines and milestone records three, each at most 120 Unicode code points. The office accepts only that display data, rejects stale, broken, oversized or symlinked records, and never substitutes a sticky note. The producer patch is delivered separately; installing only the office change leaves first voice hidden until the producer emits a valid record.

Standalone uses uncached `/jc-pet.json` on the loopback server. VS Code uses `jcRequestPet` → `jcPetUpdated`, bypassing shared replay/log buffers. Both refresh every 30 seconds. The automatic bubble renders plain text beside the pet; the current voice is also readable in the companion panel. Only opaque seen IDs are saved in the tab's session storage to suppress polling/reconnect/reload repeats. If storage is unavailable, automatic speech is suppressed and the panel remains available. Closing the browser session resets this tab-local display history.

Regression commands:

```bash
node --import tsx scripts/test-agent-pet.ts
node scripts/test-agent-pet-transfer.mjs
npm --prefix webview-ui test
node scripts/test-agent-pet-integration.mjs --pet-source=/path/to/isolated/agent-pet
```

The transfer test executes the real VS Code request/receive branches with fixture I/O; it does not claim an IDE-host rendering test. Webview tests use the full `tsx` loader to cover the shared host/webview module across the package boundary.

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
node scripts/test-e2e-browser.mjs            # Playwright: residents, desk approvals, confirmation, optional project, chat sync
```

Additional approval checks: `npx tsx scripts/test-desk-docs.mts`, `npx tsx scripts/test-approval-events.mts` and `npx tsx scripts/test-approval-answer-handler.mts`. Browser tests skipped because Playwright or the local server cannot start require verification on a browser-capable machine.

## Repository

- **This fork**: [Anpanmank2/officeanime](https://github.com/Anpanmank2/officeanime)
- **Upstream**: [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)

## Credits

- **Pixel Agents** by [Pablo De Lucca](https://github.com/pablodelucca) — the original VS Code extension this project is forked from. Licensed under [MIT](LICENSE).
- **Character sprites** based on [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## License

[MIT License](LICENSE) (inherited from upstream).
