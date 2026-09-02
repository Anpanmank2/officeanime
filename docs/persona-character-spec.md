# Persona Character Spec

Implementation notes for making every roster member visually distinct and recognizable — "you can
tell who's who by looking at them" — instead of everyone sharing one of 6 recolored body shapes.

## 1. Purpose

Today, every character on the office floor is one of **6 pre-colored sprite sheets**
(`webview-ui/public/assets/characters/char_0.png`…`char_5.png`). Members beyond the first 6 reuse
one of those 6 bodies with a random hue rotation on top (`hueShift`, see `spriteData.ts`). The
result: two members can be wearing what is, pixel-for-pixel, the identical outfit and hairstyle,
just tinted a different color. There is no silhouette-, hairstyle-, or outfit-level differentiation
at all — only color.

The goal of this work is to give each roster member (see `jc-config.json`) a persona-consistent,
individually distinguishable appearance: a distinct silhouette (hair shape, outfit cut, accessory)
grounded in that member's role/personality, while preserving every existing animation state,
layout mechanic, and rendering path unchanged.

## 2. Current architecture — verified facts (read the code, not the comments)

- **Sprite sheet**: 176×96 PNG per palette slot. 11 frames (16w×32h each) × 3 direction rows
  (down/up/right). Left is generated at runtime by flipping right — never drawn separately.
  Frame order: walk1, walk2, walk3, type1, type2, read1, read2, think1, think2, think3, error
  (error reuses a single column across all 3 direction rows).
- **Color mechanism today**: `spriteData.ts` uses the 6 loaded PNGs' pixel data **directly, with
  no runtime palette-swapping**. There is no per-region (hair/skin/shirt/…) color system live in
  the code right now. The only per-character color variation available today is a *global* hue
  rotation (`hueShift`) applied to the whole sprite via `adjustSprite()` when a member's assigned
  `palette` (0–5) is being reused by more than one person.
- **The generation pipeline that produced those 6 PNGs no longer exists in this repo.** An earlier
  version of the project (from the upstream fork this repo builds on) had a `scripts/export-
  characters.ts` that baked a `CHARACTER_PALETTES` array (5 named color slots: hair/skin/shirt/
  pants/shoes) into a `CHARACTER_TEMPLATES` pixel grid to produce the 6 PNGs. **That script, and
  the `CHARACTER_TEMPLATES`/`CHARACTER_PALETTES` constants it depended on, were both deleted** in
  an upstream cleanup that moved the *furniture* system to open-source, manifest-driven assets
  (`docs/external-assets.md` describes the furniture side of that migration). The character PNGs
  themselves were kept as static, hand-shipped assets — nothing regenerates them today.
  `scripts/extend-character-sprites.mjs` is the only character-sprite script left, and it only
  *extends an existing PNG in place* (derives think/error frames from the standing pose) — it does
  not generate a base character from nothing.
- **Fallback path**: a comment in `spriteData.ts` (the "v3 Extension Point" block) describes a
  "hardcoded template fallback when PNGs not loaded." That's stale too — the actual fallback, when
  `loadedCharacters` is null, is a fully **transparent placeholder sprite**, not a colored
  template. There is no colored fallback art baked into the source anymore.
- **Load order**: `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` →
  `furnitureAssetsLoaded` → `layoutLoaded` (see `assetLoader.ts` / `useExtensionMessages.ts`).
- **Owner is handled separately from the roster.** `webview-ui/src/jc/OwnerAvatar.tsx` manages a
  dedicated character with a reserved id (`OWNER_AGENT_ID`), walking a fixed
  entrance→desk→target→exit path. It currently uses a placeholder palette/hue-shift combination
  and its own code comment already invites a dedicated `owner.png` sprite. This document's scope
  is the named roster in `jc-config.json`; the Owner character's visual identity is a natural
  follow-on once the part system exists, but is not required to unblock this work.

## 3. Roster reality check — 23 defined today, not 28

The top-level README describes "28 AI agent members across 3 departments + governance." As of this
writing, **`jc-config.json`'s `members` array actually defines 23 entries** (6 engineering, 7
marketing, 9 research, 1 secretary), plus a separate 3-entry `exec` array (owner/secretary/PM
placeholders without `palette`/`hueShift`, i.e. not yet wired to a renderable sprite). The gap
between "28" in prose and "23" in data is a pre-existing discrepancy in this repo, not something
introduced by this task — flag it if you (or whoever reviews this work) want it reconciled, but it
doesn't block appearance work: build against the ids that actually exist in `jc-config.json`
today, and design the system so adding a 24th (or 29th) entry later is just "add one more config
entry," not a code change.

See `docs/character-appearance-map.md` for the full per-member breakdown (name, department,
visual-design attributes) sourced from this project's internal role-design references. That
document is the appearance *content*; this document is the appearance *mechanism*.

## 4. Implementation route

Two ways to get individually distinguishable characters were considered.

### Recommended: Route A — layered part composition ("paperdoll")

Build a small number of swappable, colorable parts (hair / top / bottom / face / accessory) that
compose onto a shared body base at render time, keyed per member in a config file. Full technical
contract — frame grid, z-order, anchors, manifest schema, composition function, cache key,
persistence — is written up and ready to implement in **`docs/avatar-parts-tech-spec.md`**. Read
that document before writing any composition code; it answers nearly every structural question
this task raises.

**Why this is the right call, not just the more elaborate one:**

- Recoloring alone (today's `hueShift` mechanism) cannot produce silhouette-level distinction —
  that's the exact gap this task exists to close. A part system is the minimum architecture that
  can vary *shape*, not just *hue*.
- The deleted `export-characters.ts` pipeline (see §2) only ever varied **5 flat color regions**
  (hair/skin/shirt/pants/shoes) on **one shared body template**. It never varied hairstyle shape,
  outfit cut, or accessories. Reviving that exact pipeline would only re-solve the *color* problem
  a second time — it would not make anyone recognizable by silhouette.
- A from-scratch technical spec for the part-composition approach already exists, is verified
  against the current codebase (not stale assumptions), and defines every contract an
  implementation needs (see `docs/avatar-parts-tech-spec.md`). Following it is close to zero net
  new design cost.
- Composable parts scale better as the roster grows: adding a 24th member is "pick existing parts
  + a color," not "hand-draw one more full-body template." Route B has no such reuse.
- The spec's caching design (composite once per config, cache the result) means the runtime cost
  stays identical to today's per-frame `drawImage` regardless of how many unique members exist —
  see §7–8 of the tech spec.

### Alternative considered: Route B — rebuild a static per-member PNG bake pipeline

Recreate something like the deleted `export-characters.ts`: define N (23–28+) named color
palettes, each mapped onto the *same* shared body template, and bake N static PNGs (one per
member) instead of 6. This is a smaller, more contained change — no new manifest system, no new
composition function, no new persistence file — and would work if a part-composition system turns
out to be infeasible in the time available.

Its ceiling is low, though: it produces individually-*colored* characters, not individually-
*shaped* ones. Two members would still share an identical outfit and hairstyle silhouette, just in
different colors — which is functionally the same problem the roster has today, only with 23–28
colors instead of 6. To make people distinguishable by silhouette under this route, you'd end up
hand-drawing a genuinely separate body template per member anyway (not just a palette) — at which
point it's the same amount of art labor as Route A's parts, but with no compositional reuse, no
live-tunable color sliders, and a full template redraw required every time someone is added to the
roster. Keep this as a fallback plan, not the default.

## 5. Where this plugs into the existing code

- `webview-ui/src/office/sprites/spriteData.ts` — `getCharacterSprites()` is the single insertion
  point (see tech spec §7.2).
- `src/assetLoader.ts` — currently loads the 6 pre-colored PNGs and sends
  `characterSpritesLoaded`; needs a companion loader for the new `avatar-parts/` manifest tree and
  an `avatarPartsLoaded` message (tech spec §5).
- `jc-config.json` (root) already carries a `palette` + `hueShift` per member id — this is the
  natural place to look for how member-id → visual identity is threaded through today, and a
  reasonable model for where a member → `AvatarConfig` mapping would live (either alongside it, or
  in the new avatar-config persistence file described in tech spec §6, keyed by the same member
  ids).
- `webview-ui/src/jc/OwnerAvatar.tsx` — separate character, separate flow (see §2). Not in scope
  for the initial pass but designed to slot into the same part system later without rework, since
  it already resolves through the same `getCharacterSprites`-style pipeline.

## 6. Non-goals — do not touch

- Animation FSM states, transitions, or timing (`webview-ui/src/office/engine/characters.ts`).
- Z-sorting formulas for characters vs. furniture, seat assignment, or pathfinding.
- The furniture/layout editor, floor tiles, or wall tiles — entirely separate systems from
  character sprites.
- The existing 6 pre-colored fallback PNGs — keep them as the fallback path for any member without
  an explicit `AvatarConfig` (graceful degradation, not a hard cutover).
- VS Code extension activation, webview message plumbing outside what's needed to load the new
  avatar-parts manifest and persist `AvatarConfig`.
- `officeanime`'s general FSM/event system (`jc-events.json`, the 13-state FSM described in the
  README) — none of that needs to change for this work.

## 7. Acceptance bar

- All members currently defined in `jc-config.json` are individually recognizable — distinct
  silhouette (hair/outfit/accessory), not just distinct hue — confirmable by an actual screenshot,
  not just a code review.
- Every existing animation state (walk in all directions, typing, reading, thinking, error) still
  renders correctly for every member — no missing frames, no seams, no z-order breakage between
  parts.
- Existing layout, furniture, and seating are unaffected — nothing about this work should touch
  those systems.
- The full pre-push quality gate passes (see `CODEX-BRIEF.md` for the exact commands) — this
  includes an automated browser check, but that only proves characters render *something*; it does
  not prove they render *correctly differentiated* — a manual/Playwright visual pass across a
  sample of members in all 3 directions is still required before calling this done.
- New code follows the repository's existing TypeScript constraints (see `CLAUDE.md`): no `enum`,
  `import type` for type-only imports, constants centralized rather than inlined.

## 8. References

- `docs/avatar-parts-tech-spec.md` — the full technical contract for Route A.
- `docs/character-appearance-map.md` — per-member appearance attributes (the content to implement
  against).
- `CLAUDE.md` (repo root) — architecture reference, TypeScript constraints, build/test commands.
