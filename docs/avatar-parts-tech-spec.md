# Avatar Part-Composition — Technical Spec

Frozen technical contract for adding per-member visual identity to office characters via a layered
part-composition ("paperdoll") system. Written against the codebase as it exists today — every
measurement below was verified by decoding the shipped PNGs and reading the current source, not
assumed from comments (see the correction in §0).

This spec is implementation-ready: an engineer (human or AI) can build directly from it without
further design discovery. It has **not been implemented** — no source file described here exists
yet except the ones already in the repo today (`spriteData.ts`, `colorize.ts`, `spriteCache.ts`,
`assetLoader.ts`, `layoutPersistence.ts`, the `shared/assets/*` decode/manifest helpers).

---

## 0. Verified facts about the current pipeline (do not change these)

| Item | Measured value | Source |
|---|---|---|
| Character PNG size | **176×96** | decoded `char_0.png` with pngjs |
| Frames per row | **11** | `CHAR_FRAMES_PER_ROW` (`shared/assets/constants.ts`) |
| Direction rows | 3 = down(0) / up(1) / right(2) | `CHARACTER_DIRECTIONS`, `spriteData.ts` |
| Frame cell size | 16w × 32h (`CHAR_FRAME_W` / `CHAR_FRAME_H`) | `shared/assets/constants.ts` |
| Drawable area per cell | bottom 24px; top 8px is transparent padding (bottom-aligned) | code comment, `spriteData.ts` |
| Current frame order | walk1, walk2, walk3, type1, type2, read1, read2, think1, think2, think3, error (×1, reused across all 3 direction rows) | `spriteData.ts` |
| Current color mechanism | (a) 6 pre-colored PNGs, one per palette slot; (b) beyond 6 characters, `hueShift` applied at runtime via `adjustSprite()` | `spriteData.ts` |
| Character sprite cache key | `` `${paletteIndex}:${hueShift}` `` | `spriteData.ts` |
| Tile size | 16px | shared constants |

> **Correction worth knowing**: a long-lived code comment in `spriteData.ts` describes a future
> extension from "112×96 / 7 frames" to "144×96 / 9 frames". Both numbers are stale — the shipped
> asset is already **176×96 / 11 frames**. Trust the table above (verified by decode), not the
> comment. Any part atlas must match the 11-column grid exactly, not a 9-column one.

Current rendering pipeline (downstream of the composition point needs no changes):

```
PNG (176×96) → decodeCharacterPng() → CharacterDirectionSprites{down,up,right: SpriteData[11]}
  → setCharacterTemplates() → getCharacterSprites(palette, hueShift): CharacterSprites
  → getCharacterSprite(character, sprites): pick one frame by state/direction
  → getCachedSprite(sprite, zoom): bake to an offscreen canvas (per-zoom WeakMap cache)
  → renderer: drawImage only, every frame
```

**The one point where composition needs to be inserted** is inside `getCharacterSprites()` — the
place that currently does `loadedCharacters[palette]` and returns it as-is. Replace that lookup
with "resolve a set of parts, color them, and layer them into one `CharacterSprites` object."
Nothing downstream of that function needs to change.

---

## 1. Frozen contract ①: canvas / grid / resolution

- **One frame cell**: 16w × 32h (`CHAR_FRAME_W` / `CHAR_FRAME_H`).
- **Drawable body area**: bottom 24px of the cell. Top 8px stays transparent padding. The anchor
  contract in §3 depends on this — every part must follow it.
- **Atlas**: 176w × 96h = 11 frames (horizontal) × 3 direction rows (vertical). One part PNG = one
  atlas, same grid as the body.
- **Directions**: 3 rows (down/up/right). Left is never drawn — it's `flipSpriteHorizontal(right)`
  at runtime.

### 1.2 The only sanctioned way to add more frame columns later

If a future emote needs new frame columns, **extend body + every part to the same column count at
the same time** (partial extension = columns drift out of sync = composited characters visibly
break):

1. Change `CHAR_FRAMES_PER_ROW` from 11 to N (`shared/assets/constants.ts`).
2. Widen the atlas to 16×N. **The meaning of the existing 11 columns is fixed** — only append new
   columns after them, never reorder.
3. `decodeCharacterPng()` is driven by the constant, so it needs no code change.
4. Add the new columns to the frame map in `getCharacterSprites()`, and add the corresponding FSM
   state in `characters.ts`.
5. Redraw every part PNG at 16×N too — column index must stay 1:1 with the body.

> **Frozen rule**: "column index = semantic meaning" is an invariant. If column 7 is `think1` for
> the body, it is `think1` for every part. Break this and you get "hair on the previous frame,
> shirt on the next frame" corruption.

---

## 2. Frozen contract ②: slot taxonomy, z-order, frame/direction layout

### 2.1 Slot taxonomy (`AvatarSlot`, frozen)

| slot | contents | required | colorable by default | notes |
|---|---|---|---|---|
| `base` | skin + body shape (faceless torso) | yes (exactly 1) | true (skin tone) | foundation every avatar sits on; defines the transparent-cutout baseline |
| `bottom` | pants / skirt / lower garment | optional | true | sits on top of `base`'s legs |
| `top` | shirt / upper garment | optional | true | sits on top of `bottom`, over the torso |
| `face` | eyes / mouth / expression | optional | false (linework color is fixed) | this is the layer that carries "cuteness" via expression |
| `hair` | hairstyle | optional | true | sits over `face`, on the head |
| `accessory` | glasses / hat / pin, etc. | optional (0–2 items) | per-item flag | the only slot that allows more than one item |

> Slots are a **fixed enum-like `as const` object** (TypeScript `enum` is banned by
> `erasableSyntaxOnly` — see the repo's TS constraints). Adding a slot is a deliberate, code-level
> decision to break the freeze, not something a config file can do on its own.

### 2.2 Z-order (draw order, frozen)

**Composition is bottom-to-top, with each layer's opaque pixels overwriting what's below.** Order
is fixed by slot definition — it is never carried in per-character config data, so config alone
can't break the stacking:

```
z0 base  <  z1 bottom  <  z2 top  <  z3 face  <  z4 hair  <  z5 accessory
```

- Multiple accessories stack in array order (later = drawn on top, z5, z6, …).
- **Why frozen**: pinning hair above `top` rules out "hair swallowed by the collar" bugs by
  construction. Pinning `face` below `hair` guarantees fringe/bangs naturally overlap the eyes.
- Z-order is 1:1 with slot order. **A part is never allowed to claim its own z value** — that
  would make composition non-deterministic.

### 2.3 Frame columns × direction rows (frozen, shared by body and every part)

The current body's column semantics become the contract every slot must follow (fixed column
index):

| col | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| meaning | walk1 | **walk2 / idle** | walk3 | type1 | type2 | read1 | read2 | think1 | think2 | think3 | error |

- **Walk cycle**: the FSM plays `[0, 1, 2, 1]` (`spriteData.ts`, the `[d[0], d[1], d[2], d[1]]`
  pattern). Idle uses column 1 (walk2 = standing pose).
- **Direction rows**: row0=down, row1=up, row2=right. Left is `row2` flipped at runtime.
- `think` currently only has a real animation front-facing (columns 7–9); up/right fall back to
  column 1. `error` reuses column 10 across all three direction rows (direction-independent).
  **Parts follow this same asymmetry** — a part that doesn't draw dedicated think/error frames may
  leave those columns transparent (falls through to `base`, see §2.4 rule).

> **Frozen**: every part PNG carries the same 11-column × 3-row grid as the body. Undrawn columns
> stay transparent. "Draw only the two walk columns and skip `type`" is disallowed — the hair
> would visibly vanish while the character types.

### 2.4 Mirroring (left direction), frozen

- Left is never drawn as its own asset — it's `flipSpriteHorizontal(right)` at runtime.
  **Composite the `right` row first, then flip the composited result** (never flip each part
  individually and then composite) — flipping post-composition avoids 1px seams between parts.
  Implementation: inside `getCharacterSprites()`, flip the composited `right` output once to
  produce `left`, exactly like the body-only path does today.

---

## 3. Frozen contract ③: anchor points

### 3.1 Anchor inside each cell (frozen)

Every part, every frame, is drawn in the **same coordinate system**: the 16×32 cell's top-left
`(0,0)` is the origin for all of them. Composition is a plain same-coordinate overlay — no offset
math:

```
composited[row][col] = topmost non-empty slot's [row][col], else the next slot down, ...
```

- **Body anchor**: bottom-aligned inside the cell (body occupies rows 8–31, top 8px transparent).
  Every part must be drawn against this same skeleton, pixel-for-pixel — this is a contract for
  whoever draws the art, not something code can enforce.
- **Head baseline**: hair / face / hat-type accessories are drawn relative to the body's crown
  (~row 8). Treat **"crown = row 8, eye line = row 13 ± 1"** as the fixed landmark every part is
  drawn against (see the template asset in §3.2).
- **Feet anchor**: the renderer draws with a bottom-center anchor (`renderer.ts`:
  `drawX = ch.x*zoom - width/2`, `drawY = (ch.y+sittingOffset)*zoom - height`). The composited
  sprite stays 16×32, so **this math needs no change**.
- **Sitting offset**: during TYPE/THINK/ERROR states a fixed pixel offset shifts the character
  down (`renderer.ts`, `CHARACTER_SITTING_OFFSET_PX`). This applies to the composited sprite as
  one image, so it doesn't interact with the anchor contract.

### 3.2 The one art asset the anchor freeze produces

Build `avatar-parts/_base-template.png` (176×96) with a **landmark guide layer** baked in (crown /
eye line / shoulders / waist / feet) as the single drawing reference every part is drawn on top
of. **This is the physical form the "frame / z-order / anchor freeze" takes** — a pixel reference,
not just prose.

---

## 4. Frozen contract ④: palette-swap rules

### 4.1 Color type unifies on the existing `FloorColor` shape (frozen — don't invent a new type)

```ts
interface FloorColor { h; s; b; c; colorize?; }  // already exists (office/types.ts)
```

- Part recoloring = `adjustSprite(sprite, color)` ("Adjust" mode — shifts the source pixels' HSL;
  see `colorize.ts`).
- **Why frozen**: furniture, floor tiles, and character hue-shifting already all use this one type
  + `adjustSprite`/`colorizeSprite`. Reusing it for avatars means the existing cache machinery
  works unmodified, and the UI can reuse the furniture HSBC color sliders as-is.

### 4.2 Color-ramp units, not flat hex swaps (frozen — this is the spec's core)

- **Banned**: "replace this hex with that hex" flat substitution. It flattens the 3–4-step
  highlight/base/shadow shading ramp that makes pixel art read as 3D.
- **Required**: draw parts in a grayscale-to-low-saturation **shading ramp** (3–4 steps of
  light/dark), and recolor by running `adjustSprite` (rotates H/S, shifts B/C for light/dark) over
  the **whole ramp at once**. The ramp's relative light/dark relationship is preserved by
  `adjustSprite` (it keeps the original per-pixel lightness as its baseline — see `colorize.ts`).
- **"Colorize" mode** (fixed HSL from grayscale) is floor-tile-only. Parts default to **Adjust
  mode** (`colorize` unset/false) — this suits skin tones and anything where you want to keep the
  original shading and just rotate the hue.

### 4.3 Reuse existing functions — nothing new to invent

| Need | Existing function | Source |
|---|---|---|
| Recolor one part | `adjustSprite(sprite, color)` | `colorize.ts` |
| Cache a recolor result | `getColorizedSprite(cacheKey, sprite, color)` | `colorize.ts` |
| Floor-style fixed-HSL (avoid for parts) | `colorizeSprite` | `colorize.ts` |
| Bake composited sprite to a zoom canvas | `getCachedSprite(sprite, zoom)` | `spriteCache.ts` |
| Clear the color cache | `clearColorizeCache()` | `colorize.ts` |

### 4.4 Starter palette presets (format only, tune the values as needed)

```jsonc
// Example: "top" (upper garment) starter presets, Adjust-mode relative shifts
// assumed against a neutral source ramp
"topPresets": [
  { "label": "slate blue",  "color": { "h": 210, "s": 10,  "b": -5,  "c": 0 } },
  { "label": "teal",        "color": { "h": 175, "s": 5,   "b": -5,  "c": 0 } },
  { "label": "sage",        "color": { "h": 95,  "s": -10, "b": 0,   "c": 0 } },
  { "label": "amber",       "color": { "h": 35,  "s": 5,   "b": 0,   "c": 0 } },
  { "label": "charcoal",    "color": { "h": 0,   "s": -40, "b": -35, "c": 5 } },
  { "label": "dusty rose (accent)", "color": { "h": 345, "s": -15, "b": 0, "c": 0 } }
]
```

Keep saturated pink to a single accent slot rather than a base tone — lean on the `face` slot's
expression parts (round eyes/mouth shapes) to carry "cute" instead of relying on color alone.

---

## 5. Asset manifest schema (character parts)

Extend the furniture asset system's declarative, folder-driven, root→leaf manifest approach to
characters.

### 5.1 Directory layout (frozen)

```
assets/avatar-parts/
  _base-template.png          # §3.2 authoring guide (excluded from the loader — art reference only)
  base/
    body_01/ manifest.json body_01.png
    body_02/ ...
  bottom/ <part_id>/ manifest.json <part_id>.png
  top/    ...
  face/   ...
  hair/   ...
  accessory/ ...
```

- Slot = first-level folder name (`base|bottom|top|face|hair|accessory`); the loader walks these
  six folders.
- Part = second-level folder (one part per folder, same shape as the furniture assets).

### 5.2 Part manifest schema (`AvatarPartManifest`, new — mirrors the furniture manifest shape)

```jsonc
{
  "id": "hair_short",          // unique; what AvatarConfig.part references
  "slot": "hair",               // fixed enum; must match the folder name (loader validates this)
  "name": "Short Hair",         // display name
  "file": "hair_short.png",     // defaults to "{id}.png"
  "width": 176, "height": 96,   // atlas size; must match the body (loader warns if not)
  "frames": 11,                 // = CHAR_FRAMES_PER_ROW; only changes if the grid is ever extended
  "colorable": true,            // false = fixed-color part (face linework / glasses); ignores AvatarConfig.color
  "zOverride": null             // normally null (z comes from slot order, §2.2); escape hatch only
}
```

- **Difference from furniture manifests**: no `footprint` / `canPlaceOn*` / rotation / state
  concepts (avatars aren't placed objects). Instead: `slot` / `frames` / `colorable`.
- **No rotation/state/animation groups needed** (direction = row within one atlas, animation =
  column, both already handled by the grid). Parts are always a single-file `"asset"`-equivalent.
  If something like "hair sway" variants is ever needed, absorb it via column extension (§1.2)
  rather than introducing groups.

### 5.3 Catalog output shape

The loader walks the six slots and builds an `AvatarPartCatalog` (parallel to the furniture
`LoadedAssets`, a separate map):

```ts
interface AvatarPartAsset {
  id: string; slot: AvatarSlot; name: string;
  colorable: boolean; frames: number;
}
interface LoadedAvatarParts {
  catalog: AvatarPartAsset[];
  sprites: Map<string, CharacterDirectionSprites>; // partId -> {down,up,right: SpriteData[frames]}
}
```

- **Decoding is reused**: every part PNG is the same atlas shape as the body, so
  `decodeCharacterPng()` works unmodified (no new decoder).
- New postMessage: `avatarPartsLoaded { catalog, sprites }` (same channel pattern as the existing
  `characterSpritesLoaded`; fine to load last in the sequence).

---

## 6. `AvatarConfig` persistence schema + storage I/O

### 6.1 Schema (frozen shape)

```jsonc
// New user-level file, alongside the existing layout file
{
  "version": 1,
  "avatars": {
    // key = logical member id (matches jc-config.json's member ids)
    "member-id-01": {
      "base":  { "part": "body_01", "color": { "h": 0,  "s": 0,  "b": 0,   "c": 0 } },
      "layers": [
        { "slot": "bottom",    "part": "pants_slim", "color": { "h": 0,   "s": -30, "b": -35, "c": 0 } },
        { "slot": "top",       "part": "shirt_tee",  "color": { "h": 210, "s": 10,  "b": -5,  "c": 0 } },
        { "slot": "face",      "part": "face_calm",  "color": null },
        { "slot": "hair",      "part": "hair_short", "color": { "h": 30,  "s": -10, "b": -10, "c": 0 } },
        { "slot": "accessory", "part": "glasses",    "color": null }
      ]
    }
  }
}
```

Rules:
- `base` is required and singular. `layers` is any subset of bottom/top/face/hair/accessory.
  **Z-order comes from the fixed slot order in §2.2, not from the order layers happen to be
  listed in** (the engine sorts them).
- `color: null` = no recolor (either `colorable:false`, or intentionally using the part's built-in
  color).
- If `part` isn't in the catalog, **that layer is simply skipped** (fail soft — one missing part
  doesn't take down the whole character).

### 6.2 Reuse the existing layout-file I/O pattern (nothing new to invent)

Duplicate the pattern the layout persistence module already uses, renaming only what's needed:

| existing layout function | avatar equivalent | what changes |
|---|---|---|
| layout file name constant | avatar file name constant | new constant only |
| read-layout-from-file | read-avatars-from-file | path only |
| write-layout-to-file | write-avatars-to-file | **keep the atomic write (`.tmp` → rename)** |
| migrate-and-load-layout | migrate-and-load-avatars | reuse the revision-migration logic |
| watch-layout-file | watch-avatars-file | **keep cross-window `fs.watch` + polling + own-write suppression** |

- Storage location: same directory tier as the layout file (user-level, shared across windows).
- New postMessage pair: `saveAvatars` (webview→host) / `avatarsLoaded` (host→webview), mirroring
  `saveLayout`/`layoutLoaded`.
- **Frozen**: I/O is limited to duplicating the existing pattern. Don't introduce a new
  persistence mechanism (e.g. a database) for this.

---

## 7. How this sits on top of the 4 existing foundations

Four things already exist: ① color conversion (`colorize.ts`) ② caching (`spriteCache.ts` + the
colorize cache) ③ manifests (asset loader / manifest utils) ④ layout-style file persistence. This
spec adds **one pure function** on top.

### 7.1 The one new core function (pure, easy to unit-test)

```ts
// office/sprites/avatarComposite.ts (new, pure function)
// One AvatarConfig -> a CharacterSprites (existing type). renderer/FSM need no changes.
function composeAvatar(
  cfg: AvatarConfig,
  parts: LoadedAvatarParts,        // partId -> CharacterDirectionSprites
): CharacterSprites {
  // 1. Order layers by the fixed slot sequence (base first, §2.2).
  // 2. For each layer: if colorable & color != null, recolor via
  //    getColorizedSprite(`avatar-${part}-${h}-${s}-${b}-${c}`, sprite, color).
  // 3. Per column, per direction: overlay bottom-to-top with overlaySprites()
  //    → composited SpriteData[11] × 3 directions.
  // 4. Assemble down/up/right; left = flip the composited right result.
  // 5. Feed into the existing frame mapping (walk/type/read/think/error), same as today.
}

// Transparent-priority, same-coordinate overlay (16×32, §3.1)
function overlaySprites(lower: SpriteData, upper: SpriteData): SpriteData {
  return lower.map((row, r) => row.map((px, c) => (upper[r][c] !== '' ? upper[r][c] : px)));
}
```

### 7.2 The single insertion point

Extend `getCharacterSprites(paletteIndex, hueShift)` to accept an avatar key as an alternative to
a raw palette index:
- Avatar path: return the result of `composeAvatar(cfg, parts)` (replaces the current
  `loadedCharacters[palette]` direct use).
- Fallback: if parts aren't loaded, or no config exists for a member, fall back to the current
  pre-colored-PNG path unchanged (backward compatible; lets migration happen incrementally, member
  by member).

### 7.3 Cache key extension (frozen)

Extend the current `` `${palette}:${hueShift}` `` key to an **AvatarConfig hash**:

```
avatarCacheKey = `${cfg.base.part}:${cfg.base.color??}|` +
  layers.sortBySlot().map(l => `${l.slot}:${l.part}:${l.color??}`).join('|')
```

- Use this string as the key into the existing `CharacterSprites` cache map. **The same config
  composites exactly once, then it's `drawImage` only** (no re-compositing every frame).
- The per-zoom canvas cache is keyed on the composited `SpriteData` reference, so it works
  unmodified — same config always yields the same composited reference.
- On receiving `setCharacterTemplates`/`avatarPartsLoaded`, clear both the sprite cache and the
  colorize cache (same pattern as today).

---

## 8. Performance budget & lazy-load approach

### 8.1 Runtime cost (every frame)

Composition happens **once per config** (§7.3 caching). Even with every character on a fully
unique config, every frame after the first is `drawImage(cachedCanvas)` only — **the same cost as
today**. Composition CPU/memory cost is a one-time hit per unique config, not a per-frame one.

### 8.2 Initial design ceilings (quality-gate thresholds, tune as needed)

| metric | initial ceiling | how to watch it |
|---|---|---|
| total part count | ≤ 60 (6 slots × ~10 average) | catalog length |
| initial host→webview payload | ≤ 5MB (2D hex-string arrays are bulky) | measure postMessage size |
| simultaneously composited characters | ≤ ~40 (roster + sub-agent headroom) | sprite cache size |
| per-zoom canvases | budget for 3 zoom levels × ~40 characters | zoom cache count |
| initial load time | ≤ 300ms at the 60-part scale | `perf.now()` measurement |
| single composite | ≤ 5ms | benchmark |

### 8.3 Staged lazy-loading (frozen: introduce in stages, don't over-build up front)

- **Stage 1 (≤60 parts)**: send every part in one postMessage at boot, same as furniture today —
  fine at this scale.
- **Stage 2 (if the part library grows into the hundreds)**:
  - (a) send the full **catalog (metadata)** up front but lazy-load actual `SpriteData` only for
    parts that are actually referenced by a config, or currently selected in an editor UI (an
    on-demand `requestAvatarPart` message).
  - (b) chunk sprite sends per slot (hair only, top only).
  - (c) reuse the existing external-asset-directory mechanism to ship themed part packs
    separately.
- **Frozen decision**: it's fine to send everything at once for Stage 1, but keep
  `avatarPartsLoaded` split into separate `catalog` and `sprites` fields from day one, so switching
  to lazy `sprites` delivery later doesn't require reshaping the catalog path (§5.3's types are
  already split with this in mind).

---

## 9. Implementation order

1. **Art**: `_base-template.png` (§3.2 landmarks) → a minimal part set per slot (e.g. base ×2,
   hair ×3, top ×3, bottom ×2, face ×2, accessory ×2 ≈ 14 parts) drawn at 176×96.
2. **Schema/loader**: `AvatarPartManifest` type + a loader that reuses `decodeCharacterPng` +
   the `avatarPartsLoaded` postMessage.
3. **Composition**: `avatarComposite.ts` (`composeAvatar`/`overlaySprites`) + unit tests
   (transparent-priority overlay, z-order, column alignment, left-flip correctness).
4. **Wiring**: add the avatar path to `getCharacterSprites` + the cache-key extension (keep the
   fallback).
5. **Persistence**: an avatar-config equivalent of the layout persistence module + the new file
   I/O + `saveAvatars`/`avatarsLoaded` messages.
6. **UI** (separate follow-up task): part picker reusing the furniture HSBC color sliders + color
   sliders.
7. **Quality gate**: keep the existing test suite green + benchmark against §8.2 + **visual
   verification with a real browser** (compositing bugs — seams, wrong transparency, broken
   z-order — don't show up in text-based checks; they need an actual screenshot).

---

## 10. Known risks

1. **[Biggest] Art-consistency cost (the contract is frozen, the labor isn't)**: every part × 11
   columns × 3 directions has to be drawn pixel-aligned to the body skeleton. §1–4 freeze the
   *rules*, but drawing to them still takes real time per part, and needs a visual check against
   `_base-template.png` every time a part is added. Mitigation: keep the template PNG (§3.2) as
   the single source of truth for authoring.
2. **think/error column asymmetry**: today `think` only has a real animation front-facing (up/right
   fall back to column 1), and `error` reuses one column across all three direction rows. Parts
   need to follow the same asymmetry, or a hair part with think-only frames will look like it's
   flailing. Mitigation: parts are explicitly allowed to leave think/error columns transparent and
   let `base` show through (§2.3).
3. **Payload size if the part library grows large**: without Stage 2 (§8.3) implemented, growing
   into the hundreds of parts will bloat the initial payload. Mitigation: the message is already
   split into `catalog`/`sprites` fields so the delivery mechanism can change later without
   reshaping the catalog.
4. **Cache memory ceiling**: a fully-unique roster × multiple zoom levels × composited canvases.
   Cache entries are `WeakMap`-backed so they're GC-eligible, but still worth watching against the
   §8.2 thresholds.
5. **Dual code paths during migration**: while the avatar-composition path and the legacy
   pre-colored-PNG fallback coexist, the branch inside `getCharacterSprites` gets more complex.
   Mitigation: keep the fallback condition to exactly one thing — "no parts loaded, or no config
   for this member" — nothing more.
