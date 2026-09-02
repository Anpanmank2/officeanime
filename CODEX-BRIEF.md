# Codex Brief — Persona-Consistent Character Appearance

Start here. Everything you need to pick this task up should be reachable from this one file.

## Goal

Every office character today is one of only 6 recolored body shapes — beyond the first 6 members,
new people just reuse an existing body with a random hue shift. Give each member currently defined
in `jc-config.json` a distinct, persona-consistent visual appearance (hair, outfit, accessory —
not just a color tint), so a player can tell who's who by looking, without reading a name label.

## Scope

**Do:**
- Build a mechanism for per-member visual differentiation (see the recommended approach in
  `docs/persona-character-spec.md`) and apply it to the members listed in
  `docs/character-appearance-map.md`.
- Keep every existing animation state (walk/type/read/thinking/error, all 3 directions + the
  runtime left-flip) working for every member.
- Keep the existing 6 pre-colored sprites as a graceful fallback for anyone without a specific
  config, rather than doing a hard cutover.

**Don't:**
- Don't touch the animation FSM (`webview-ui/src/office/engine/characters.ts`), z-sorting,
  seating/pathfinding, the layout/furniture editor, floor/wall tiles, or the `jc-events.json`
  event system / 13-state FSM described in the README. None of that needs to change for this
  work — if you find yourself editing one of those files, stop and re-check the plan.
- Don't invent new roster members. Work from what's actually in `jc-config.json` today (23
  entries) — see `docs/persona-character-spec.md` §3 for a known discrepancy between that number
  and the README's "28," which isn't something to resolve as part of this task.
- Don't remove or break the VS Code extension entry point — this project ships both as a VS Code
  webview and as a standalone browser app (`npm run serve`); both need to keep working.

## Acceptance criteria

- All 23 members in `jc-config.json` are individually recognizable by silhouette (hairstyle,
  outfit shape, accessories) — not just by color — verified with an actual screenshot, not a code
  read.
- Every animation state still renders correctly, for every member, in all 3 sprite directions
  (down/up/right; left is the runtime flip) — no missing frames, no seams between composited
  parts, no z-order breakage (hair swallowed by a collar, etc).
- Existing layout, furniture placement, and seating behavior are unaffected.
- The full pre-push quality gate passes (commands below).
- New TypeScript follows this repo's existing constraints (below).

## Build & verify

```sh
# Install (root extension + the separate webview project)
npm install && cd webview-ui && npm install && cd ..

# Build: type-check → lint → esbuild (extension) → vite (webview)
npm run build

# Run standalone in a browser (no VS Code needed) — visually check the result here
npm run serve            # http://localhost:8432
npm run serve:open       # same, opens a browser automatically
```

The pre-push hook (`.husky/pre-push`) runs 6 scripts and blocks the push if any fail — run them
yourself before considering this done (some docs elsewhere in this repo mention "4" scripts; the
hook file itself is the source of truth and currently runs 6):

```sh
node scripts/test-sprite-decode.mjs        # sprite decode: 176×96, 11 frames, think/error non-empty
node scripts/test-state-machine.mjs        # tool→state mapping + valid transitions
node scripts/test-jc-events.mjs            # jc-events.json parsing + type validation
npx tsx scripts/test-malformed-delegate.mts   # malformed events don't crash the watcher
npx tsx scripts/test-workload.mts             # workload/derivation logic
node scripts/test-e2e-browser.mjs          # Playwright: browser loads, characters actually appear
```

Also available (not part of the push gate, but useful while iterating): `npm run e2e` /
`npm run e2e:debug` (the full Playwright suite under `e2e/`), and the other one-off scripts under
`scripts/test-*.mts` (affinity, living-loop, office-status).

**Visual verification is not optional.** A green test suite proves the app boots and characters
render *something* — it does not prove 23 different silhouettes are actually distinguishable from
each other. Before calling this done, take screenshots (Playwright or manual) of a representative
sample of members across all 3 directions and at least one non-idle state (typing/reading), and
look at them.

## Code conventions (this repo's existing TS constraints — see `CLAUDE.md` for the full picture)

- No `enum` (`erasableSyntaxOnly` is on) — use `as const` objects instead.
- `import type` is required for type-only imports (`verbatimModuleSyntax` is on).
- `noUnusedLocals` / `noUnusedParameters` are enforced.
- All magic numbers/strings belong in a `constants.ts`, not inline in source files:
  - extension backend → `src/constants.ts`
  - webview → `webview-ui/src/constants.ts`
  - shared asset-pipeline constants (sprite dimensions, frame counts) →
    `shared/assets/constants.ts`
- Prettier formatting (`npm run format`), ESLint on `src` and `webview-ui/src` separately
  (`npm run lint`, `npm run lint:webview`).

## Docs

- **`docs/persona-character-spec.md`** — start here for the *why* and *what*: current-architecture
  facts (verified against the code, correcting a couple of stale comments/docs elsewhere in the
  repo), the roster-count discrepancy, the recommended implementation route with reasoning, and
  where it plugs into the existing files.
- **`docs/avatar-parts-tech-spec.md`** — the *how*: a full, implementation-ready technical
  contract for the recommended approach (frame grid, z-order, anchors, manifest schema,
  composition function, cache key, persistence). Written against this exact codebase, not a
  generic design doc.
- **`docs/character-appearance-map.md`** — the *content*: per-member appearance attributes (hair,
  outfit, accessory, one-line vibe) for all 23 members, to design/draw against.

One more orientation note not covered by the docs above: the README's `delegate` event table
mentions a "CEO character" — in the current code, that role is drawn as an **Owner** character via
`webview-ui/src/jc/OwnerAvatar.tsx` (see `docs/persona-character-spec.md` §2), not a separate CEO
entity. Worth knowing if delegate-event visuals come up while you're in this area, even though
it's outside this task's scope.
