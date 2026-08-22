# Leaguecraft visual reference

The Leaguecraft Ranked lobby at `/quiz` in its owner-approved state, recorded so future
Leaguecraft screens can reuse the same visual language accurately instead of approximating
it. **This is a capture, not a proposal.** Nothing here is a recommendation to change the
page; every value is read off the shipped implementation or measured in a running build.

| | |
|---|---|
| Captured from | `origin/main` **`e46324618a169c5bc1969a77485104e51becb2c6`** — `feat(malt): finalize Leaguecraft lobby composition` |
| Approved chain | `954b4972` lobby IA → `e07da052` redundant role-write fix → `f828b795` champion anchor + category strip → `7629deb4` refined lobby flow → `e4632461` final composition |
| Route | `/quiz` (lobby phase). Frozen-fixture twin at `/dev/lobby-preview` |
| Measurement build | Vite dev server on the captured tree; geometry read from live `getBoundingClientRect()`, not inferred |

**Sections 17 (reusable vs page-specific) and 18 (do-not-regress) are the two a future
workstream should read first.** Everything before them is the record; those two are the
guidance on what to carry forward and what not to.

---

## 1. Component map

Every path verified present at the captured SHA.

| Concern | File |
|---|---|
| Page host — data, role commit, shell reclaim | `src/pages/Quiz.tsx` |
| Hub composition — first screen, rail mount, workspace | `src/components/quiz/LeaguecraftHub.tsx` |
| The three-parchment rack | `src/components/quiz/RankedLobbyHero.tsx` |
| Parchment shell (`scroll`) + legacy plate (`plate`) | `src/components/quiz/LobbyPanel.tsx` |
| Role character-select stage | `src/components/quiz/RankedClassCarousel.tsx` |
| PLAY seal | `src/components/quiz/RankedPlayGem.tsx` |
| Ranked emblem (size × emphasis system) | `src/components/ranked/RankEmblem.tsx` |
| Academy crown | `src/components/ranked/RankCrown.tsx` |
| Full-width category rail | `src/components/quiz/QuizCategoryRail.tsx` |
| The six category definitions + icon resolver | `src/components/quiz/QuizCategoryStrip.tsx` |
| All parchment / seal / emblem CSS | `src/index.css` — `.lc-scroll*` (3194–3723), light language (3725–4313) |

Supporting modules: `src/lib/ranked-public/roles.ts` (the five roles),
`src/lib/ranked-public/roleChampions.ts` (cosmetic champion anchors),
`src/lib/progression/tiers.ts` (the five tiers), `src/lib/progression/rankedArt.ts`
(tier → emblem URL), `src/lib/progression/academy.ts` (`academyTierLabel`),
`src/lib/ranked/crowns.ts` (Academy crown art), `src/components/mascot/mascot-assets.ts`
(`MOGZY_ROLE_ASSETS`, `MOGZY_MASCOT_ASSETS`).

## 2. Asset map

All paths verified to exist **and to be git-tracked** at the captured SHA.

| Asset | Bytes | Role |
|---|---|---|
| `public/assets/ranked/parchment.png` | 2,133,199 | The scroll. 1086×1448 RGBA, transparent outer, ornamental roll at head and foot |
| `public/assets/ranked/play-seal.png` | 131,651 | The PLAY seal. Effectively binary alpha, no baked glow/shadow, **the word PLAY is baked in** |
| `public/assets/ranked/elder-dragon.webp` | 4,868 | Category rail → Objectives |
| `public/assets/ranked/caster-minion.webp` | 4,730 | Category rail → Waves |
| `public/images/lol-hub/leaguecraft-classroom-bg.png` | 2,041,765 | The academy/library environment behind everything |
| `public/mascot/family/{top,jg,mid,bot,sup}.png` | ~1.1–1.3 MB each | The five role mascots |
| `public/mascot/mogzy-mascot-base-v1.png` | 2,248,415 | Default right-column portrait when no avatar |
| `public/images/ranked/crowns/{bronze,silver,gold,diamond,challenger}.png` | ~0.8 MB each | Academy crowns (right column only) |

Present in the same directory but **not used by this composition**:
`ranked-academy-duel-bg.png`, `ranked-vellum-texture.png`.

**Two icon origins, and the leading slash is the rule.** `resolveCategoryIconUrl` in
`QuizCategoryStrip.tsx`: a path starting with `/` is this app's own `public/` and is used
verbatim; anything else is backend-relative and goes through `resolveQuizAssetUrl` against
the API base. Ranked emblems, champion icons, item/spell art are all **backend-served and
cross-origin** — verified live: the emblem resolved to
`https://web-production-83e53.up.railway.app/assets/ranks/large/bronze.png`. That fact is
load-bearing for the emblem glint (see §7).

Champion folder names are the canonical capitalised form (`Darius`, not `darius`) — macOS
resolves the wrong case locally and Linux 404s on it in production.

## 3. Overall composition

Three parchment scrolls in one `grid`, then a full-width category rail, then the workspace
below the fold. The rack and the rail are **one composed screen**, held together by a
wrapper in `LeaguecraftHub.tsx:162`.

```
lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,0.9fr)]   gap: lg 16px, xl 24px
```

Relative widths are `0.85 : 1.05 : 0.90`. The centre is the widest column and the only one
carrying `emphasis`. Document order is left → centre → right; DOM order is centre first
(`order-1`) so a stacked layout leads with the CTA.

The rack is capped by the host's `max-w-[1500px]` — the composition **stops growing at
1468px of content width**, verified identical at 1825 and 1920.

### Measured geometry — 1825 × 832, the approved desktop reference

Empty/new-player state on `/quiz`. All values in CSS px from the viewport top.

| | top | bottom | height | notes |
|---|---|---|---|---|
| Rack (`ranked-hero`) | 12.0 | 742.7 | 730.7 | width 1468, x 171…1639 |
| Left scroll | 12.0 | 742.7 | 730.7 | w 431.1 |
| Centre scroll | 14.0 | 750.7 | 736.7 | w 532.5, `margin-top: -6px` |
| Right scroll | 12.0 | 742.7 | 730.7 | w 456.4 — **the Academy column sets the rack height in the empty state** |
| Seam (`gap-2`) | 742.7 | 750.7 | 8 | |
| Category rail | 750.7 | 820.7 | 70 | **bottom edge 11.3px clear of the 832 fold** |
| First-screen wrapper | 12.0 | 832.0 | 820 | `min-height: 820px` = `100dvh − 0.75rem` |
| Workspace | 856.0 | 1154.8 | 298.8 | starts 24px below the fold |

Grid tracks resolve to `431.06 / 532.50 / 456.42`, gap 24px. Document height 1208px —
the whole page scrolls 376px.

**Writing areas** (the `.lc-scroll__content` box, i.e. usable text width):
left 280.2, centre 346.1, right 296.7. These are *not* constant across viewports —
at 1280 they are 233.8 / 288.8 / 247.6, at 1024 they are 198.0 / 244.5 / 209.6.

**Populated state** (`/dev/lobby-preview`, Gold, 3 ledger rows, same 1825 width): rack
733.7, centre scroll 739.7. So a populated centre column overtakes the Academy column by
~3px and still clears the 742 budget the rail depends on.

### HUD collision zones — measured, at 1825×832

The HUD is a `pointer-events-none` `<nav>` occupying a full-width 56px band that **paints
only two corner clusters**:

| Cluster | x | y |
|---|---|---|
| Home control | 12 … 56 | 6 … 50 |
| Identity cluster (guest: Sign up + radio + profile + account menu) | 1579 … 1793 | 6 … 50 |

Left scroll starts at x=171 — no horizontal overlap with Home at any width the rack
exists at. Right scroll ends at x=1639 and does pass under the identity cluster's left
edge, **but only its ornamental top roll does**: the first readable line in that column
(ACADEMY RECORD) lands at y=81.9, clear of the cluster's 50px bottom by ~32px.

## 4. First-viewport geometry — the top-space reclaim

This is the part most likely to be recreated wrongly, so it is stated as a rule.

The shell reserves `--app-header-h` (3rem below 640px, **3.5rem = 56px** at sm+) as
padding for a HUD that floats and paints nothing across 85% of it. The lobby — and only
the lobby phase — reclaims that band with a negative margin (`Quiz.tsx:1050`):

```
phase === "sets"
  ? "max-w-[1500px] pt-3 lg:-mt-[calc(var(--app-header-h)_-_1.5rem)] xl:-mt-[var(--app-header-h)]"
  : "max-w-3xl pt-4"
```

- **`xl` and up** — total reclaim. The scroll's own top roll (`aspect-ratio: 1086/145` of
  the column width) is tall enough to keep text clear of the corner controls unaided.
- **`lg`** — reclaim less 1.5rem, handed back as clearance. Measured clearance between the
  controls' bottom edge and the nearest column heading, at a *full* reclaim:
  1024 → 5px, 1280 → 21px, 1536 → 34px, 1920 → 40px. 5px is a near miss, not clearance.
- **Below `lg`** — the band stays whole. Stacked, the first column is full-width and would
  run under both controls.
- **Every other phase** keeps `pt-4` and no reclaim.

**Three numbers, one sum.** Top padding (`pt-3` = 12px) + seam (`gap-2` = 8px) + rail
height (70px) = 90px, and that has to fit above the fold at the shortest supported
desktop. At **1280×800 the rail bottom lands at 798 — two pixels of slack.** `pt-4`
clipped it. Change any one of the three and re-measure 1280×800 as well as the wide target.

The wrapper's own min-heights are that padding plus whatever the breakpoint's reclaim
leaves: `lg:min-h-[calc(100dvh_-_2.25rem)]`, `xl:min-h-[calc(100dvh_-_0.75rem)]`. The
slack lands *after* the rail because the wrapper packs from the top, so the rack and rail
keep exact geometry and the extra height becomes classroom between rail and workspace.

## 5. The parchment system

### Slicing — no stretching, ever

`parchment.png` geometry, measured from the alpha channel: canvas 1086×1448; sheet body
x 142…942; top roll occupies the first 145 rows; bottom roll the last 165; roll flare
x 42…1044, 25% wider than the sheet.

The shell renders **three horizontal slices**, each `background-size: 100% auto` so the
image's own aspect ratio drives every height:

- `.lc-scroll__cap--top` — `aspect-ratio: 1086/145`, `background-position: top center`
- `.lc-scroll__body` — `background-size: 100% 300%`, centred, so the visible window is
  always image rows 483…965, deep inside the ornament-free middle
- `.lc-scroll__cap--foot` — `aspect-ratio: 1086/165`, `bottom center`, positioned
  absolutely so the unfurl clip cannot cut it; `.lc-scroll__foot-space` reserves its room

A taller column grows **only through the plain middle**. The two rolls keep their
proportions at every height and every width.

### Bleed, lift, tone

| Token | Value | Why |
|---|---|---|
| `--lc-scroll-bleed` | `min(6%, 14px)` | Layer overhangs the column so the roll flare hangs into the gutter. The px arm is the real constraint — the page gutter is 16px, and a pure-% bleed put 7px of horizontal scroll on the document at 1280 |
| `--lc-scroll-lift` | `drop-shadow(0 6px 8px rgba(3,7,14,.42)) drop-shadow(0 26px 40px rgba(3,7,14,.52))` | Two shadows: tight contact + wide ambient. Cool and library-toned, never black. `drop-shadow` not `box-shadow`, so transparent corners cast nothing |
| `--lc-scroll-tint` | `brightness(0.91) saturate(0.97)` | Raw asset is bright cream. Brightness preserves hue (keeps it aged beige, not brown); the sub-1 saturate stops the warm cast strengthening as it darkens |
| `--lc-age` | `1` | Opacity of the edge-ageing overlay |

Tone is applied **before** the shadows in the filter list, so the shadows are cast from
the toned sheet at full strength.

### Insets — the manuscript margin

```
.lc-scroll            padding: 14% 15.5% 16%;     /* base */
@media ≥1280px        padding: 14% 17.5% 16%;     /* sides open out */
@media ≤1023px        padding: 17% 19% 18.5%;     /* stacked, max-width 30rem */
```

Percentage padding resolves against **width** on every side, which is correct here — the
ornament's height is a function of the scroll's width. Safe band (merely
not-overlapping-ornament) is 13.7% / 16.1% vertical and ~11% horizontal.

The **sides** carry the full manuscript margin on top of safe and step by viewport,
because they cost width. The **top and foot hold the safe numbers at every width**,
deliberately: percentages of width mean the frame gets taller the wider the desktop, which
is backwards on 16:9 — at 1825 the vertical pair alone was taking 171px out of a 456px
column before a word was set.

Below `lg` the inset can only **grow**: the bleed goes to 0 there, so the sheet no longer
overhangs and safe has to be measured against the column instead of the layer.

### Edge ageing

Masked by the parchment's own alpha — this is the whole trick. Each `::after` overlay uses
`mask-image: var(--lc-parchment)` at the same size and position as the slice it sits on,
so the multiply shading is confined to the paper down to the antialiased edge. A plain
rectangle would darken the transparent corners and reproduce the "pasted on" look.

Three gradients compose it: `--lc-edge-shade` (a narrow left/right band in *layer*
coordinates, clear again by 17.4% — safely inside where content begins),
`--lc-roll-shade-top` / `--lc-roll-shade-foot` (each fading to nothing at the roll's inner
edge, so the sheet is lightest across its middle), and `--lc-laid-paper` (a ~2%-alpha
ribbing with soft ramps, felt not seen). Kept narrow on purpose: a stronger vignette costs
the column headings — the text nearest the edge — a full point of contrast.

Deliberately **not a watermark**. The blank upper areas get paper, not iconography: the
repo has no academy crest, and the only candidates are per-tier rank emblems, which behind
the role and profile columns would read as a rank claim.

### Centre emphasis — same shell, better light

```
.lc-scroll[data-emphasis="true"] {
  --lc-scroll-lift: drop-shadow(0 8px 10px …0.46) drop-shadow(0 34px 52px …0.6);
  --lc-scroll-tint: brightness(0.955) saturate(1.01);   /* ~8% brighter, full saturation */
  --lc-age: 0.62;                                        /* less aged, most legible */
}
@media (min-width:1024px) { margin-top: -6px; }          /* positional rise, never a scale */
```

Never a different plate. A scale would resample the wordmark and the rating figures.

**Below `lg` the tonal hierarchy is switched off** — every scroll takes the centre's
lighter tone (`brightness(0.94) saturate(1)`, `--lc-age: 0.7`). Stacked, the three are
never seen side by side, so a brighter centre has nothing to be brighter *than* and just
reads as three inconsistently-lit sheets.

### The unfurl

`@property --lc-unfurl` is registered as a `<percentage>` that inherits, so it interpolates
(an unregistered custom property jumps at the halfway mark) and the clip edge and the
travelling foot roll read the same number.

- `.lc-scroll__sheet` — `lc-scroll-unfurl 560ms cubic-bezier(0.33,0.9,0.3,1)`, keyframes
  74% → −2% (62%) → 1.2% (82%) → 0%. Starts wound, overshoots by a hair, settles.
- `.lc-scroll__content` — `lc-scroll-content-in 300ms ease-out`, delay `+170ms`. The
  content fades in *behind* the animation, so nothing is ever waiting on it to be usable.
- Stagger by `data-order`: **centre 0ms, left 70ms, right 115ms** — the CTA opens first
  and the flanks follow it. The whole entrance is done inside 600ms.

**Reduced motion**: the scrolls are simply already open. `--lc-unfurl: 0%`, no clip, no
travel; content gets `lc-scroll-settled-in` — a 140ms opacity-only fade under its own
keyframe name, so which one is in force is a matter of the selector and never of
declaration order.

### The container-query sizing rule

`.lc-scroll__content` is `container-type: inline-size; container-name: lc-scroll`. Two
titles are measured against **the sheet**, not the viewport:

```
.lc-scroll-wordmark { font-size: clamp(22px, 11cqw,  52px); }   /* LEAGUECRAFT */
.lc-scroll-title    { font-size: clamp(13px, 7.2cqw, 24px); }   /* CHOOSE YOUR ROLE */
```

This is the single most reusable mechanic in the parchment system. Fixed Tailwind
breakpoint steps **cannot** be made safe on a scroll: the column is a grid fraction of the
viewport *and* the sheet is a fraction of the column, so a size chosen at a breakpoint is
two steps removed from the width it has to fit. The measured glyph runs are 8.08× the font
size for "LEAGUECRAFT" and ~12.4× for "CHOOSE YOUR ROLE", so both land at ~89% of usable
width at every viewport. Measured: 38.07px / 20.18px at 1825 and 1536; 31.77px / 16.84px
at 1280; 26.90px / 14.25px at 1024.

## 6. Typography — the manuscript language

### Ink

Parchment inverts the app's dark palette. `INK` in `RankedLobbyHero.tsx:149` is the whole
of it, and it is **scoped to the three top columns only** — the workspace, section
headings and classroom keep the dark palette.

| Token | Value | Use |
|---|---|---|
| `strong` | `#241708` | Headlines and figures — the darkest thing on the sheet |
| `body` | `#3f2c14` | Body copy, secondary lines |
| `faint` | `#56412a` | Labels, captions — the quietest readable line, and it must stay *lighter* than `body` |
| `heading` | `#3a2708` | Section headings, between strong and brass |
| `brass` | `#533808` | Brass as a **pigment**, not a glow |
| `accent` | `#08404f` | The lobby's cyan at parchment depth |
| `rule` | `rgba(96,68,28,0.5)` | Hairlines and tile borders, in the sheet's own brown |
| `inset` | `rgba(112,82,36,0.16)` | A tile a shade deeper than the sheet |
| `press` | `0 1px 0 rgba(255,249,233,0.5)` | **The letterpress** |

**The contrast rule that governs any future parchment ink.** Every value clears 4.5:1
against the parchment *at its darkest point under text* — a flanking scroll at its inner
edge, `rgb(209,187,158)` — which caps ink luminance at 0.0747. That is the binding case,
not the sheet's mid-tone. These values were re-derived once already: the ageing pass
darkened the sheet, and a darker background does not merely shift dark ink's contrast, it
**reduces** it — twelve runs that cleared 4.5:1 on the bright parchment fell as low as
3.03. Re-derive from the composited background; never carry values across a tone change.

`press` is one hairline of parchment-coloured light above each glyph — what a letterpress
leaves behind, and what separates ink printed *onto* the sheet from text sitting *over*
it. One sub-pixel offset; any more reads as a glow.

### Hierarchy

| Role | Spec |
|---|---|
| **Wordmark** (LEAGUECRAFT) | `.lc-scroll-wordmark`, `font-black`, `tracking-[.14em]`, gradient `#8a6414 → #63450c → #3f2b05` clipped to text, `drop-shadow(0 1px 0 rgba(255,246,222,.65))`. **Struck brass on the sheet, not a gold glow over it** |
| **Ceremonial title** (CHOOSE YOUR ROLE) | `.lc-scroll-title`, `font-black uppercase`, `tracking-[.13em]`, `whitespace-nowrap`, ink `strong` + `press`, **no rule at all** |
| **Section label** (ACADEMY RECORD) | `text-[11px] font-extrabold uppercase tracking-[.26em]`, ink `heading` + `press`, closed by a fading 1px rule |
| **Rank name** | `text-xl sm:text-2xl font-extrabold uppercase tracking-[.12em]`, ink `strong` + `press` |
| **Sub-label** (RANKED) | `text-[11px] sm:text-xs font-extrabold uppercase tracking-[.52em]`, ink `accent` |
| **Ledger title** | `text-[10.5px] font-extrabold uppercase tracking-[.2em]`, ink `accent`, over a hairline |
| **Ledger row** | label `text-[11px] font-semibold` ink `faint`; value `text-[12.5px] font-bold tabular-nums` ink `strong` + `press`; `border-b` in `INK.rule`, `py-[1px]` |
| **Microcopy** | `text-[11px]–[12px] font-semibold/medium`, ink `body` or `faint` |
| **Category label** | `text-[10px] sm:text-[11px] font-bold uppercase tracking-[.12em] text-[#e2c877]/85` — dark-surface brass, because the rail is not on parchment |

**Two divider treatments, and the difference carries meaning.**

- A **ruled heading** is a *section marker*: "a labelled part of this sheet begins here."
  `ColumnHeading` default, and `LedgerTitle`. The rule fades at the far end
  (`linear-gradient(90deg, rgba(83,56,8,.55) 0%, rgba(83,56,8,.12) 100%)`; mirrored to
  `270deg` when right-aligned) so it reads as drawn by hand, not as a border on a box.
- **`ceremonial` carries no rule at all**, and that is the point. The role choice is not a
  section *of* the left parchment; it *is* the left parchment. Display size, centred over
  the stage, nothing drawn between them — so what follows reads as the thing the title
  names rather than the next widget down. It stays ink and press, never a second gold
  gradient; the centre wordmark owns that and two would fight.

**Ledger rows over stat tiles.** Rounded stat cards read as a dashboard dropped onto
parchment. A label left, its figure right, a hairline closing the pair — that is how a
ledger states a record, and the same `LedgerRow` rhythm is shared by the left and right
columns so there is one rhythm, not two. `py-[1px]`, not 3: the hairline is what separates
rows; at 11px/12.5px the row is still 22px tall.

## 7. RankEmblem — the reusable system

`src/components/ranked/RankEmblem.tsx`. **Two independent axes.**

**`variant` — how big.** `hero` 8rem, 10rem at ≥640px (160px of box for ~128×72 of crest;
the art is a square PNG with heavy transparent padding, so the box must over-reach the
drawing). `standard` 1.5rem. `compact` 1rem. Gaps between the steps are large on purpose:
an emblem is the subject of its region, a marker beside a label, or an inline token —
there is no useful size between those.

**`emphasis` — how much light.** `ceremonial` / `standard` / `quiet`. `DEFAULT_EMPHASIS`
maps `hero→ceremonial, standard→standard, compact→quiet`, so the common call stays one
prop; the split only matters when a site wants to disagree.

Collapsing the two is why the centre emblem could not be made ceremonial before: "hero"
meant both *96px* and *allowed to glint*.

**The layer hierarchy** — structural, not stylistic. The layers are absent from the DOM,
so no stray CSS can switch them back on:

```
quiet        halo
standard     halo + the rare glint
ceremonial   halo + the rare glint + the tier's sparks
```

`SPARK_CAP` is `{ceremonial: 3, standard: 0, quiet: 0}`. Sparks are the ceremonial
signature and nothing else has them. `standard` was briefly allowed one and it was wrong at
both ends — a 6px spark on a 24px emblem is a quarter of the object, and at Bronze (whose
tier count is also 1) ceremonial and standard ended up with identical layer sets.

**The tier ladder** — three numbers, five steps, one direction. Hue is left alone by both
ladders: the art already carries the tier's identity.

| Tier | halo | glint | cadence | sparks |
|---|---|---|---|---|
| bronze | 0.22 | 0.22 | 13s | 1 |
| silver | 0.26 | 0.28 | 12.2s | 1 |
| gold | 0.31 | 0.36 | 11.4s | 2 |
| diamond | 0.37 | 0.46 | 10.4s | 2 |
| challenger | 0.44 | 0.56 | 9.2s | 3 |

Emphasis is a **multiplier** (`--lc-emblem-lift`: ceremonial 1.7, standard 1.0, quiet
0.85), not a second table — so a Challenger chip stays quieter than a Bronze hero and every
tier keeps its relative position. Cadence never drops below 9s: past that the glint stops
being an event. The ceremonial glow is `calc(0.48 + var(--lc-emblem-halo) * 0.58)` —
0.62 at the Bronze baseline, 0.74 at Challenger, deliberately **never clamping**, because
a glow that clamps makes every tier above the clamp point look identical.

**The ladder is bronze → silver → gold → diamond → challenger. Bronze is the floor and the
default identity. Unranked is not a tier and must not be restored.** `RANK_TIERS` in
`tiers.ts` is the source of ordering truth, and `parseRankTier` deliberately does not map
legacy League tiers (Iron, Platinum, Emerald, Master, Grandmaster) or "Unranked" onto a
canonical tier.

**Baseline is a state, not a sixth tier.** `earned={false}` renders the same art, stamps
`data-baseline` and omits `data-tier` — that DOM contract is what every other surface
reads. Its own light: core `186,132,58`, edge `116,78,34`, halo/glint 0.24, cadence 12.6s,
tint `sepia(.12) saturate(1.06) brightness(1.02) opacity(.94)`; at ceremonial,
`sepia(.1) saturate(1.2) brightness(1.08) contrast(1.03)`.

**Earned is semantics; emphasis is presentation.** These used to be the same thing and a
baseline emblem was structurally denied light. On the lobby that produced a grey smudge
directly above the PLAY seal, reading as a broken image rather than an unearned rank. Light
is now governed by emphasis alone, and the lobby's placement Bronze is genuinely radiant.
What still separates baseline from earned is its own tint and halo tone. **Chroma is
off-limits for any future retune** — two earlier passes desaturated and both produced a
muddy grey-violet crest, and one left the hero emblem reading greyer than the identical
emblem in the chip beside it. Spend the budget on luminance.

**The mask is conditional, and that is a measured CORS limit.** `mask-image` is subject to
CORS; the emblems are backend-served without `Access-Control-Allow-Origin`; a failed mask
load does **not** degrade to "no mask" — it renders the layer as *nothing*, which would
silently delete the glint from every earned rank. So same-origin art gets
`data-mask="alpha"` and a sharp masked band; anything else gets `data-mask="off"` and a
soft specular bloom in a round clip, which reads as light on metal without needing a
silhouette. **Verified live at the captured SHA: `data-mask="off"`.** The masked path is
the waiting upgrade — move the emblems to this origin, or send the header, and every emblem
upgrades with no code change.

**Error handling** — one step down the ladder, then out, never a retry loop: tier art →
caller's `fallbackSrc` → the `fallback` React node. The lobby passes
`assets/ranks/unranked.png` as `fallbackSrc` **for the baseline only**, and a `Shield` icon
as the final node. That legacy file is a last-resort art path reached only if the Bronze
emblem itself fails to load — it is not a restoration of an Unranked tier.

**Sparks are deterministic**, at three fixed sites (`18%/74%`, `62%/16%`, `34%/30%`) with
delays 0s / 3.7s / 7.1s inside an 11s cycle whose flash is its last 8%, staggered so two
never fire together. Random sites would flicker on any unrelated re-render.

**Reduced motion**: `.lc-emblem__glint` and `.lc-emblem__spark` are `display: none`. The
halo is static already, so the emblem keeps its whole identity. `animated={false}` is a
separate caller opt-out for screenshot harnesses, print sheets and dense lists —
`prefers-reduced-motion` needs nothing from the caller.

## 8. The PLAY seal

`RankedPlayGem.tsx` + `.lc-seal*`. A real `<button>` with **no background and no border** —
the seal is a transparent-cornered silhouette, and paint on the control would put a
rectangle behind a round object. Three children: `.lc-seal__material` (the art),
`.lc-seal__glint`, and `.lc-seal__label.sr-only`.

Size `8rem`, `9rem` at ≥640px. Measured 144×144 at desktop, 128×128 at 375.
`border-radius: 46%` — not 50%: the wax bead is wider than tall by a hair, and this is the
radius the focus ring is drawn at.

Every state changes **custom properties only**, which resolve into one `filter` on the
material layer, so each state is a short block and transitions still interpolate.

| State | Behaviour |
|---|---|
| Ambient | glow 0.3 / blur 11px, shadow y10 blur15 α.42, glint cadence 10s, strength 0.42. **Always on, never animated** |
| Hover | glow 0.55 / 18px, shadow y13 blur20 α.46, `scale(1.028)`, lift −1px, cadence **3.2s**, strength 0.66 |
| Press (`[data-pressed="true"]`) | lift **+3px**, `scale(0.976)`, glow drops to 0.16/7px, shadow compresses to y3 blur6, `brightness(0.93)`. Wins over hover by specificity *and* source order |
| Focus | `outline: 2px solid #5e1220; outline-offset: 5px; box-shadow: 0 0 0 5px rgba(220,197,162,.75)`. Stated, not inherited — the app's ring is tuned for dark surfaces and is near-invisible on beige. `outline` follows `border-radius`, so the ring is the seal's shape |
| Disabled | `saturate(.5) brightness(.84)`, opacity .68, no lift, no scale, `.lc-seal__glint { display: none }`. **An object that still sparkles still looks pressable** |
| Reduced motion | Still *answers* — light, colour and shadow change on hover and press — but never travels or scales. Glint hidden |

The glint band: `width: 38%`, offset `left: -50%`, `--lc-glint-travel: 500%` (−50 + 38 +
100 = 188% of the box = 494% of the band; rounded up so it clears). Masked to the seal's
own alpha, **with a `border-radius: 46%; overflow: hidden` fail-safe** so a failed mask
confines the highlight to the disc rather than sweeping a rectangle across the parchment.

Shadows are warm brown (`rgba(48,26,8,·)`), never black — a black shadow on beige reads as
a hole punched in the paper.

**The baked word — a stated asset limitation.** `play-seal.png` has PLAY baked into it.
The accessible name comes from a visually hidden `.lc-seal__label`, and the `label` prop
drives *only* that name — a caller passing anything but "Play" desynchronises the two.
A second verb requires re-cutting the asset without the word.

### The shared magical language

Both lit objects obey four rules (`index.css:3725`):

1. **Glow is a property of the object, not an animation.** Nothing pulses, breathes or
   scales on its own. The ambient light is static; only the glint moves.
2. **A glint is rare.** Long cycle, short active window, long dead air — the travel
   occupies the last 14% of the cycle and the element is fully transparent for the other
   86%. If two are visible at once the page has become a slot machine.
3. **Every highlight is masked to the art's own alpha**, so light travels across metal and
   wax rather than across a rectangle.
4. **Nothing is load-bearing.** With motion off, every state reads from colour, shadow and
   text alone.

One shared tone: `--lc-glint-tone: rgba(255,241,209,0.92)`. Warm highlights, restrained
glow, occasional glint, occasional sparkle — premium fantasy. No constant flashing, no
sci-fi neon, no loot-box spam. **The two are deliberately not equals**: the emblem is
prestige (never answers a pointer, always the slower cadence); the seal is action
(answers hover/press/focus, brighter and faster at every state).

No React drives any of this. A highlight that fires once every eleven seconds does not
deserve a render.

## 9. Left parchment — role and role mastery

`CHOOSE YOUR ROLE` (`ceremonial`, no rule) → the stage (`mt-0.5`, no divider — the two are
one composed thing) → the Role Mastery ledger.

**The stage** (`RankedClassCarousel`, `surface="parchment"`): a fixed-height ring, 252px /
300px (sm) / **340px (lg)**, slides absolutely positioned so it never reflows.

- Three of five visible. `ringOffset` gives a signed −2…2 distance; `|offset| ≤ 1` is on
  stage. **This is by design, not a bug** — the two roles at ±2 are `aria-hidden`,
  `disabled`, opacity 0.
- Selected: `scale(1)`, opacity 1, `zIndex: 2`, fully inked, deepest plinth.
- Flank: `FLANK_SCALE = 0.46`, ring offset `±54%`, opacity 0.72 on parchment (0.42 on
  dark), `filter: saturate(.62) brightness(.96)`. Scale says "further away"; ink says "not
  chosen". The offset came *down* when the scale did, which is not the obvious direction —
  a flank's name is counter-scaled back to full size, so it is far wider than the shrunken
  figure; at 66% the longer names ran off the stage.
- `transformOrigin: 50% 100%` — **all three stand on the same ground line.** From the
  default centre origin a neighbour shrinks inward from both ends and floats halfway up,
  reading as three portraits at three distances rather than a character-select stage.
- The **name is the identity** and is counter-scaled by `1/FLANK_SCALE` on the flanks — a
  label inheriting a 0.46 shrink renders at ~5px, which is a smudge, not a label. Selected
  name: 15px, `tracking-[.3em]`, in the role accent, underscored by a `border-image`
  gradient that fades at both ends. Flank name: 10px, `tracking-[.1em]`, `#241708`.
- `pb-7` reserves the name's line so the figure takes the whole remaining height; the
  plinth and ground ring are positioned, not in flow, so they cost the art nothing.

**Role accents**, per surface — the same five hues, never different hues:

| | top | jungle | mid | adc | support |
|---|---|---|---|---|---|
| dark | `#d5b66f` | `#8fd0a0` | `#7fd6ef` | `#e2a17a` | `#c2a4e0` |
| parchment | `#5e420a` | `#1b5435` | `#0a4b5e` | `#723416` | `#5c3585` |

Parchment values sit where each clears 4.5:1 against `rgb(209,187,158)`; they were
re-derived when the ageing pass darkened the sheet (the bright-parchment values had fallen
to 3.5–4.1).

**On parchment, selection is announced by weight, not light.** A sheet cannot glow, so the
chosen role is the one the paper is darkest under — `plinthCentre` is a deeper, tighter
shadow. It costs no contrast anywhere, because it is behind the art.

**The champion anchor.** Exactly one medallion, for the role on stage: 40/44/48px
(`h-10 → sm:h-11 → lg:h-12`), circular, `right-[2%] top-[22%] z-[3]`, `aria-hidden`,
`pointer-events-none`, tinted `sepia(.22) saturate(.88)` so the coin reads as inlaid in the
manuscript rather than pasted on. Canonical map: Top→Darius, Jungle→Qiyana, Mid→Ryze,
ADC→Ashe, Support→Braum.

It is **mounted on the stage, outside the five-slide map** — that is what makes "only the
selected role's champion is visible" structural rather than a rule someone must remember,
and it keeps the medallion out of every radio's accessible name. It is *not* at the
figure's foot: the flanks scale from their foot line and stand in the lower half, where the
coin landed on top of the right-hand one and read as a third half-sized character.
Everything above ~54% of the stage height is free of flanks by construction.

**The approved balance: the Mogzy mascot is the subject; the champion is the note in the
margin saying which game the stage belongs to.** Five champion portraits at once would make
it a champion gallery.

Below the stage: arrows + blurb row (`mt-1`), then ruled position ticks (`mt-2`) — a 5×1.5px
tick per role with a rotated 7×7px lozenge on the active one, `aria-hidden`, because the
radiogroup already carries the real semantics. A pill row was the last piece of stock app
furniture on the sheet.

**Role Mastery ledger** (`showRecord={false}` turns the stage's own strip off — two record
strips would state the W-L twice and disagree about which is the summary):

- A summary band, **ruled top and bottom rather than boxed**: a 26px `font-black` figure, a
  small-caps qualifier, and the W·L·D record right-aligned.
- Three states: demo score (`/dev/lobby-preview` only) · the account's **recent win rate**,
  labelled as recent · `—` and "Not established" — **never a 0%**.
- Detail rows: Recent matches, Rating swing, Last played.
- **Scope lives in the labels, not a footnote.** `/api/ranked/history` is capped at 50
  server-side and requested at 20, so these are recent form and cannot be lifetime. The old
  "Last 20 ranked matches" footnote is gone; the rows say "Recent". A figure that says
  recent on its own face cannot be misread as a career total, and a footnote is the first
  thing a reader skips.

**There is no Role Mastery score in the product.** `DemoRoleMastery` exists for one caller.
A real account sees the neutral summary. Also absent because the product does not expose
them: per-role accuracy, per-role rating, per-role category strength, lifetime Ranked W-L.

## 10. Centre parchment — Ranked

The reusable relationship, in order: **Ranked identity → primary action → recent
competitive record.**

```
LEAGUECRAFT (wordmark)  →  RANKED (sub-label)  →  emblem (hero/ceremonial)
  →  TIER NAME  →  rating + progression bar  →  PLAY seal
  →  win/loss XP line  →  RECENT RANKED ledger (3 rows)
```

**Placements are a state inside the permanent design, not a screen.** This is the
principle to carry forward: design the centre around the *post*-placement steady state and
render the temporary condition compactly inside it.

| State | Heading | Body |
|---|---|---|
| Placed, progression known | the real tier name | `{rating} Ranked rating`, bar, `{n} rating to {nextTier}` — or "Challenger — the highest Ranked tier." |
| Placements incomplete | **Bronze** (the ladder's floor) | `Placement {done} / 5`, the same bar, `{n} matches remaining · rating set after placements`. **No rating — a guessed one is worse than none** |
| Placed but progression unreadable | Bronze | "No Ranked standing on record yet." Explicitly *not* a placement state: a placement counter here would claim the account is mid-series when the truth is the standing could not be read |

The heading is always a **tier name**, never a system label like "Placement Series". There
is no placement modal, popup or dialog on this surface and there never was one.

The emblem's `alt` deliberately says more than the heading: a screen reader arriving at the
image has no layout adjacency to read the placement line from.

**Win/loss XP line**, directly under the action it belongs to: `+{gain} XP` in `#0a3220`,
`−{loss} XP` in `#571219`, separated by a 1px `INK.rule` divider, `flex-wrap` with a
tighter `gap-y`. The suffix is held back **by size and weight, never opacity** — on navy a
0.7 opacity sat back; on parchment the same 0.7 took it to ~3:1.

**`RECENT_LEDGER_ROWS = 3`, and the reason is the fold.** Four rows takes the centre column
to 763px; the first screen at 1825×832 can carry a rack of 742 (12px padding + 8px seam +
70px rail). A fourth row costs an established player the rail — the reader most likely to
have a populated ledger. Raising it means re-measuring the populated rack at 1825×832.

The ledger is a **grid with stated column widths**, not a flex line:

```
grid-cols-[7px_44px_minmax(0,1fr)_auto_34px]  gap-x-1.5  border-b  py-[5px]
   nib    outcome    opponent            role   delta
```

The eye reads *down* the outcome column to count wins and down the delta column to read the
swing, without reading any row in full. The delta column **reserves its width whether or
not a row has a number**, so a delta-less row leaves a gap rather than pulling the other
cells out of alignment. The result mark is a 7×7px 45°-rotated nib — filled `#0d3f28` for a
win, hollow for anything else — which carries the verdict in the margin and lets the word
beside it drop to 10px without costing scannability. That is what buys the opponent name
its width; the first draft left it ~47px and truncated real names.

Outcome ink: win `#0d3f28`, loss `#6c1a21`, draw `#4e3a24`.

`ratingDelta === null` renders `·` in `INK.faint` — a skipped or pre-F2.2 result shows no
number rather than a zero standing in for "unknown".

## 11. Right parchment — Academy

**ACADEMY RECORD** (right-aligned section heading, ruled) → portrait → username → the
Academy identity lockup → Personal Records → footer links.

**Centre is Ranked competitive identity. Right is Academy/player identity. They must never
read as one ladder.** This is the load-bearing distinction of the whole IA pass. Recent
Ranked history and the Ranked standing chip both used to live on the right; they moved to
the centre because a result ledger belongs beside the thing that produced it, and two
sheets naming the same ladder was the confusion the pass existed to end. The Academy crown
is now the only rank art in this column.

**Portrait.** Box is `h-[210px] sm:h-[248px] lg:h-[280px]`, image `h-full w-auto`,
`-scale-x-100` so it faces inward, mirroring the left stage. Measured 186.7×280 at desktop.
The rule: **the box IS the portrait height at each step, and the image is `h-full`.** The
old `h-[324px]` box around an `h-[86%]` image bought 45px of empty air above the mascot's
head. Behind it, the same slot the dark surface used for a glow does the opposite job —
`radial-gradient(58% 50% at 50% 82%, rgba(84,56,20,0.32), transparent 70%)`, a soft warm
shade that **seats** the figure on the sheet instead of lifting it off one.

Source: `avatarUrl` or `MOGZY_MASCOT_ASSETS.base`. Name falls back
`displayName ?? (signedIn ? "Your profile" : "Guest")`.

**The Academy lockup — one row, not a stack.** Crown (`size="profile"` = `w-20 md:w-24`,
width-driven with `object-contain` because crown art is horizontally wide) beside a
bounded, centred `max-w-[17rem]` column carrying caption → tier → XP interval. The crown is
72px tall and the two lines beside it are 38, so the row was already reserving the air the
interval now occupies: same crown, same four pieces of information, one block instead of
two. Neither half of the constraint works alone — unbounded it strands the crown at the far
edge under a centred name; self-sized it wraps the interval onto two lines.

The crown used to float at the portrait's top-right while "Academy Gold" sat 300px below
it, so neither explained the other and the emblem read as decoration.

**The track is named beside the tier every time it appears** — but the *value* line prints
the tier alone (`rankedTierLabel`), because the caption directly above already says
"Academy rank" and printing it twice both stuttered and truncated to "ACADEMY G…". The
crown's `alt` carries the full `academyTierLabel` (which always prefixes "Academy") for a
reader with no layout.

The XP bar renders only when the whole coherent progression block arrives; a partial
payload keeps the crown and the rank and draws no bar, rather than rendering half a
migration.

**Personal records** — six `LedgerRow`s: Questions answered, All-time accuracy, Current
streak, Best streak, Academy XP, Ranked matches. **Every row is real or an em dash; none is
invented.** Lifetime Ranked wins/losses is *absent* rather than guessed — the history
endpoint serves a window; `matchesRated` is a genuine career figure and is the only Ranked
number on this sheet.

**Footer**: two ghost links, `View full profile` → `/profile`, `Full history` →
`/lol/history`, `h-6 text-[11.5px]`, wrapping — at the deepest inset the pair is a hair
wider than the writing area.

**Empty/new-player**: the base mascot, "Guest" or "Your profile", em dashes throughout, and
the Academy lockup omitted entirely when there is no `academy_tier`.

## 12. The category rail

`QuizCategoryRail`, mounted full-width beneath the rack in a `relative z-30` wrapper with
no top margin of its own — the wrapper's `gap-2` is the whole seam, deliberately tighter
than the gap to the workspace below.

The six subjects, in the order a player meets them in a game — what you are fighting over,
the lane in front of you, the spells on your bars, what you buy with the gold, what you can
see. `QUIZ_CATEGORY_ICONS` in `QuizCategoryStrip.tsx` is the single definition; the rail
imports it.

| id | label | full | icon |
|---|---|---|---|
| `objectives` | Objectives | Objectives | `/assets/ranked/elder-dragon.webp` *(frontend)* |
| `wave-management` | Waves | Wave Management | `/assets/ranked/caster-minion.webp` *(frontend)* |
| `summoner-spells` | Summoners | Summoner Spells | `assets/summoner_spells/Flash.png` *(backend)* |
| `itemization` | Items | Itemization | `assets/items/3031.png` *(backend)* |
| `abilities` | Abilities | Abilities & Cooldowns | `assets/champions/Lux/R_LuxR.png` *(backend)* |
| `vision` | Vision | Vision | `assets/items/3340.png` *(backend)* |

All six verified loading at the captured SHA. The two `.webp` files are the subjects
themselves and replaced earlier stand-ins (an Eye-of-the-Herald icon for Objectives, a
Minion Dematerializer for Waves).

**Geometry.** `rounded-lg`, `border-y border-[#c9a84c]/28` — hairlines top and bottom
rather than a full border, because *a rail is two edges and a run, not a box*. Fill
`linear-gradient(180deg, rgba(8,17,33,.94) 0%, rgba(4,11,22,.88) 55%, rgba(7,15,29,.94)
100%)` with `backdrop-blur-[6px]` — **denser than the lobby's panel wash on purpose**: it
is the seam, and when it eventually pins it has to hide what passes behind it. Padding
`px-2 py-2`, `sm:px-3`. Measured height **70px** at every desktop width.

Cells: `grid-cols-3` below `sm`, `grid-cols-6` from `sm`. Icon plate 40px
(`sm:44px`), `rounded-md`, `border-[#c9a84c]/30`, `bg-[#04101c]/70`, `object-cover`. The
label stacks under the icon and turns **horizontal only from `lg`**, where a cell is ~200px;
between `sm` and `lg` six cells share ~120px each and the pair does not fit on one line.
Measured cell widths: 235.7 at 1825/1920/1536, 196.5 at 1280, 153.8 at 1024, 111.2 at 768,
106.3 at 375.

Below `sm` it folds to **two rows of three** (measured 153px tall at 375). A single
scrolling row was rejected: horizontal overflow hides categories behind a gesture.

**Currently non-interactive, and that is deliberate.** `onSelectCategory` is the whole
future interaction and nothing passes it today — practice is entered by *set*, and the live
question bank does not carry a category for every subject named here (three of the six have
none), so a clickable tile would open the wrong thing or nothing. Without the prop each
cell is an inert `<div>` in an `<li>`; with it, each is a real `<button>` receiving the
category **`id`**, not the label. One prop, one call site, no rewrite — **the tiles are
already laid out as doors.**

**Intended future role: the primary Practice taxonomy** — the main entry point into
category-specific question banks, potentially with default/free vs Pro-expanded banks. Not
implemented here.

**No counts, ever.** No question counts, no coverage percentages, no "mastered" marks.
Per-category strength is not on the wire, and the standing temptation on this page is to
fill a quiet space with a plausible number.

**Not sticky — and that is a measurement, not a taste.** Nothing in the shell blocks
`position: sticky`, and with `lg:sticky lg:top-[var(--app-header-h)]` the rail pins at
exactly y=56. It can never *reach* that state today: pinning needs the page to scroll by
`railTop − 56`. **Measured at 1440×900 in the empty state: 687px of scroll needed, 376px
available** — the workspace below the rail is only ~299px tall (a Recent Studies empty
state and five practice chips). A behaviour that cannot fire is not a section transition.
When the workspace gains a viewport of depth, this wrapper takes those two classes and the
section below takes a matching `scroll-mt` — nothing else has to move.

*(The source comment records 842px needed / 490px available for the same conclusion; those
were taken in a different data state. The gap is comfortable either way.)*

## 13. Background and environment

`/images/lol-hub/leaguecraft-classroom-bg.png`, `background-size: cover`,
`background-position: center 42%`, on an absolutely-positioned layer that reaches up by
`-top-[var(--app-header-h)]` so the classroom begins under the HUD instead of leaving a
bare strip. A second layer carries the veil:

```
radial-gradient(60% 52% at 50% 44%, rgba(5,11,24,.66) 0%, rgba(5,11,24,.38) 58%, rgba(5,11,24,.04) 100%),
linear-gradient(180deg, rgba(4,9,20,.58) 0%, rgba(4,9,20,.08) 18%, rgba(4,9,20,.12) 68%, rgba(4,9,20,.66) 100%)
```

Darkest behind the composition, lightest in a band across the upper-middle where the room's
own art shows through, gathering again at the foot.

**How much breathes.** At 1825×832 the rack occupies x 171…1639 of 1810 — **~171px of
classroom down each side, plus the full band above the workspace.** The columns sit
*directly in the room*, not inside one opaque panel: the lobby's `scroll` variant carries
no card, no navy wash, no backdrop blur and no rectangular shadow, because two frames read
as a card sitting inside a scroll. The parchment **is** the panel.

The dark environment is what makes the sheets read as lit objects. Scroll brightness
(`brightness(0.91)`, `0.955` at the centre) is tuned *against* it — the raw asset is several
stops lighter than anything else in the room. Retone the background and the scroll tints,
the ink palette and the role accents all have to be re-derived together.

**Where ornament stops.** No watermark in the blank sheet areas (§5). No second gold
gradient anywhere near the wordmark. No pill rows. No rounded stat tiles on parchment. The
`plate` variant is still translucent at **every** colour stop — asserted in the hero's
tests — precisely so the classroom is never covered.

## 14. Responsive behaviour

Do not read the desktop rules as universal.

| Viewport | Behaviour (measured) |
|---|---|
| **Wide (1920)** | Identical to 1825 — `max-w-[1500px]` caps the composition at 1468px content. Rack 12…742.7, rail 750.7…820.7, gutters grow only |
| **1825 × 832** *(reference)* | Full reclaim. Rack 730.7, rail bottom 820.7 — **11.3px clear of the fold**. Grid 431/533/456, gap 24 |
| **1536 × 864** | Same geometry as 1825 (composition is capped); rail bottom 820.7, 43px of slack |
| **1440 × 900** | Composition below the cap: rail 743.4…813.4, 87px of slack. Document 1276, scrolls 376 |
| **1280 × 800** | `xl` full reclaim still. Rack 708 (top 12), rail 728…**798** — **2px of slack. This is the binding case.** Grid 360/444/381, gap 24, writing areas 234/289/248 |
| **1024 × 768** | `lg` step: reclaim less 1.5rem, rack top **36**. Grid gap drops to 16px, tracks 287/354/304. Rack 695.4, rail 739.4…**809.4 — below the fold.** The rail-without-scrolling promise holds from 1280 wide **and** ≥800 tall, not here |
| **Tablet (768 × 1024)** | Single column, scroll capped at **30rem (480px)** and centred, bleed 0, inset `17%/19%/18.5%`. **Order is centre → left → right** (`order-1/2/3`), so the CTA leads. All scrolls take the centre's lighter tone. No min-height rule — the stacked rack is several viewports tall and the fold means nothing. Stage 300px. Rail still 6 columns, tiles stacked, 111px wide × 69.8 tall |
| **Mobile (375 × 812)** | Scroll 343px (under the cap). Stage 252px, seal 128px, emblem 128px, portrait 140×210. **Rail folds to 3 × 2, 153px tall.** `--app-header-h` drops to 3rem |

What intentionally changes, and what does not:

- **Top-space reclaim** — two measured steps (`lg`, `xl`), off below `lg`.
- **Fold enforcement** — `min-h` only from `lg`; deliberately absent below.
- **Column stacking** — `lg:grid-cols-[…]`; below that one column, CTA first.
- **Scroll insets** — three steps, and below `lg` the inset can only *grow*.
- **Centre emphasis tone** — exists only where the side-by-side comparison does.
- **Carousel scale** — stage height steps 252 / 300 / 340; `FLANK_SCALE` and the ±54%
  offset are **constant at every width**.
- **Rail wrapping** — 3 cols → 6 cols at `sm`; label goes beside the icon at `lg`.
- **HUD clearance** — bought by the top roll's own height, which scales with column width.

## 15. Interaction and accessibility conventions

**Role selection.** A real `radiogroup` with roving tabindex — one tab stop; Arrow (all
four) / Home / End move *and* select; native activation selects; `aria-checked` carries
selection, never styling; off-stage slides are `aria-hidden`, `disabled` and inert, so the
reading order is exactly the three visible options. When no choice can be committed it
degrades to a plain `group` with no `role="radio"` — **assistive tech is never offered a
selection that cannot be committed** — and the stage still *browses*, because a carousel
that cannot even be looked through is worse than one honest about being read-only.

Focus moves **only in response to a key press** — never on mount, never on an unrelated
host re-render (`shouldFocus` ref).

The role **name is rendered as text on every slide**. Identity never depends on colour,
mascot, portrait or position. Same contract for the category rail: the full subject name is
carried for assistive tech whenever the visible label is the short word, with ordered-list
semantics so a reader hears "6 items".

**The architectural rule — browsing is local, PLAY is the commit point.**

> Working the ring used to be one `PUT /api/ranked/role` per move. That endpoint is rate
> limited to ten writes per account per minute (`role_set`), so two laps of a five-role
> carousel exhausted the budget and the eleventh move returned `429 RANKED_RATE_LIMITED`.
> Looking through five mascots is browsing, not choosing: it should cost nothing and be
> possible forever.

The implementation, and all three parts are required:

1. `Quiz.tsx` holds `pendingRankedRole` as local state and passes
   `onSelectRankedRole={setPendingRankedRole}` — **a pure setState, no network**.
2. `effectiveRankedRole = pendingRankedRole ?? rankedRole.role` is the carousel's `value`,
   so `aria-checked` lands on the mascot the reader is looking at and the stage's own
   "don't re-select what is already selected" guard (`e07da052`) measures against the right
   role.
3. `handlePlayRanked` writes **once**, before navigating, and only when the settled role
   differs from the stored one.

**PLAY has to be the commit point**, not merely a convenient one: the Ranked route does not
carry a role across the navigation — it re-reads `GET /api/ranked/role`, and
`POST /api/ranked/queue` sends no role at all and reads the stored preference inside the
join transaction. **The persisted role IS the queued identity.** A local choice must reach
the backend before the navigation or the reader queues as whoever they used to be.

**A refusal does not navigate.** An active match, a live queue entry or a rate limit
surfaces one toast under a stable id (`"ranked-role-write"`, so a burst updates the standing
notice instead of stacking copies) and the reader stays put with their local choice intact,
so PLAY can be retried.

`onViewChange` fires on **every** move including first paint, including a read-only stage,
so a host ledger beside the ring is never a frame behind it. **It is never a write signal** —
reporting where the ring points is not choosing, and a host must not persist from it.

**No layout shift.** The role stage is fixed-height with absolutely-positioned slides. The
emblem box is fixed and over-reaches its art. The ledger's delta column reserves its width.
The scroll's ornament rolls hold their aspect ratio at every height. `RankEmblem` renders a
`fallback` node rather than leaving a hole. The centre column's `-6px` rise is a margin, not
a transform.

**Image failure.** `RankEmblem`: tier art → `fallbackSrc` → `fallback` node; one step, never
a retry loop. `RankCrown`: crown art → `fallbackSrc` → renders nothing. Category icons
render the plate with no `<img>` when the URL will not resolve. Every decorative image is
`alt="" draggable={false}`, and `aria-hidden` where an adjacent label carries the meaning.

**Reduced motion.** Scrolls are already open (opacity-only 140ms fade). Every travelling
highlight is `display: none`. The seal still *answers* — light, colour and shadow change —
but never travels or scales. The carousel switches `transitionProperty` to `opacity` alone
and drops the flank ink transition. Nothing is communicated by animation alone anywhere.

**Focus rings.** The parchment surfaces state their own, because the app's default is tuned
for dark surfaces and is near-invisible on beige: the seal uses `#5e1220` at offset 5 with a
parchment halo; the carousel slides use `ring-[#f0d78c]`; the rail's future buttons use
`ring-ring`.

## 16. League identity vs Mogzy identity

**The approved philosophy: Mogzy's visual world, with unmistakable League subject matter.
Not a Riot-client mimicry.**

League identity is carried by:

- role names — real League roles, `RANKED_ROLE_LABELS`, **never renamed to fantasy classes**;
- the champion anchor beside the selected role;
- real item / summoner-spell / ability / objective art in the category rail;
- Ranked terminology — tier, rating, placements, the five-tier ladder;
- League-specific quiz content behind the whole surface.

Mogzy's world is the framing: the academy classroom, the parchment manuscript, the five
role mascots as the *subjects* of the role stage, the ghost mascot portrait, the Academy
track and its crowns, the wax seal.

The proportion is stated structurally, not as a preference: **one small champion medallion
beside one large mascot** (48px vs a 340px stage — the tests assert the medallion is far
smaller than the figure), and one champion at a time, mounted outside the slide map so a
gallery cannot emerge.

Future screens reuse **League subject-matter imagery inside Mogzy academy framing.** Do not
propose replacing the academy theme with Riot UI.

One naming boundary worth carrying: `roles.ts` states that it deliberately contains no
mapping between a role and anything else, in either direction, so a reader looking for one
finds nothing. `roleChampions.ts` is a *separate, purely cosmetic* module living beside it
rather than inside it, precisely so the two can never be mistaken for each other. Keep
cosmetic lookups out of canonical domain modules.

## 17. Reusable system language vs this page's layout

### Reuse freely — the Leaguecraft system

- The **parchment scroll shell**: three-slice rendering, alpha-masked ageing, `drop-shadow`
  lift, percentage insets against width, the unfurl and its reduced-motion form.
- The **ink palette and the contrast method** — derive against the sheet's darkest point
  under text, not its mid-tone; re-derive after any tone change.
- The **letterpress** (`INK.press`) as the marker of ink printed onto the sheet.
- **Ruled headings and ledger rows** instead of stat tiles and boxes.
- **Container-query type sizing** (`cqw` + `clamp`) for anything that must fit a sheet
  rather than a viewport.
- **`RankEmblem`** entire — the size × emphasis split, the tier ladder, baseline-as-state,
  conditional masking, the fallback chain.
- The **shared light language** — static glow, rare glint, alpha-masked highlights, nothing
  load-bearing; prestige objects slower and quieter than action objects.
- The **PLAY-seal material-button pattern**: unpainted control, decorative material layer,
  states as custom properties, a shape-following focus ring.
- The **role-selector interaction contract** — browse locally, commit once, `onViewChange`
  is never a write, roving-tabindex radiogroup, name always as text.
- **Data honesty**: em dash over a zero, scope in the label rather than a footnote, no
  invented counts, absent rather than guessed.

### Page-specific — do not copy by default

- **The three-column rack.** The `0.85 : 1.05 : 0.90` split, the `-6px` centre rise and the
  measured 1500px cap exist for *this* content. Most screens are not three sheets.
- **Large ceremonial centre emphasis.** `emphasis="ceremonial"` is for a page's one focal
  emblem and **there should be at most one on a screen.** A screen with no single primary
  Ranked action has nothing to make ceremonial.
- **The large right-hand mascot.** A 280px portrait is right for an identity sheet; it is
  not furniture for every format.
- **The full-width category rail.** It belongs to curriculum and navigation contexts. It is
  a taxonomy overview, not a generic tab bar.
- **The HUD-band reclaim.** Justified by three tall columns needing the height, and by the
  measured emptiness of the band at this width. Another screen must re-measure its own
  collision zones before reclaiming anything.
- **`RECENT_LEDGER_ROWS = 3`.** A fold budget at one viewport, not a design constant.
- **The `plate` variant** in `LobbyPanel`. Legacy, kept deliberately un-converted because
  the lower lobby has its own redesign scheduled. Not the Leaguecraft surface.
- **`/dev/lobby-preview` fixtures.** Demo state only, importable by that page alone.

**And the general caution: do not put every future surface on another giant parchment.**
The scroll is the academy's material for *ceremonial, identity and record* surfaces. A
dense workspace, a settings screen or a results table on parchment inherits a manuscript
margin that costs ~30% of its width and an ink palette capped at 0.0747 luminance.

## 18. Do-not-regress checklist

Each line is enforced by a named test in the captured tree.

**Composition** — `RankedLobbyHero.test.tsx`
- [ ] Left → centre → right document order, one responsibility per sheet.
- [ ] All three columns on the parchment scroll, never the glass plate; centre emphasised.
- [ ] Each scroll built from three slices — the rolls are never stretched.
- [ ] Every `plate` wash stays translucent at every stop, so the classroom is never covered.
- [ ] Distinct entrance positions, CTA first.
- [ ] The wordmark's gradient reaches the glyphs (`.theme-lol h1` outranks
      `.text-transparent` — the transparent fill must be stated inline).
- [ ] Exactly one Ranked emblem on the page, ceremonial, in the centre.
- [ ] Ranked identity in the centre and nowhere else; recent Ranked results under PLAY.
- [ ] The legacy Academy/quiz ladder never reaches the competitive identity; the Academy
      crown is bound to the Academy rank and the track is named.
- [ ] The portrait box has no dead column of air; the Academy interval stays inside the
      crown's row.
- [ ] Only one ceremonial heading.

**Ranked honesty** — `RankedLobbyHero.test.tsx`
- [ ] No rating when there is no standing — never a guessed one.
- [ ] "Standing unread" is not rendered as a placement series.
- [ ] Placements stay a compact state inside the Ranked block; no dialog, popup or modal.
- [ ] The ladder's Bronze floor, not the off-ladder unranked emblem; marked `data-baseline`
      and never `data-tier`; the real tier takes over the moment one exists.
- [ ] The placement emblem stays radiant.

**Emblem** — `RankEmblem.test.tsx`
- [ ] Every tier its own intensity, **never its own hue**; the ladder climbs and never dips.
- [ ] Cadence stays 9–13s — rare, never a shimmer.
- [ ] The emphasis ladder is one multiplier in one direction; sparks are ceremonial-only.
- [ ] The ceremonial glow never clamps at the top of the ladder.
- [ ] The baseline is held back by **warmth, never by draining colour**; the ceremonial
      baseline is the richer of the two.
- [ ] The tint is never an inline `filter` (unbeatable from a stylesheet — it silently
      swallowed the ceremonial glow once).
- [ ] Filter slots compose from identity functions, never `none` (`filter: … none` is
      invalid **as a whole** and the browser drops the shadow with it — shipped once
      already, in `--lc-scroll-tint`).
- [ ] The glint is **never masked unconditionally** — a failed cross-origin mask deletes
      the layer. The masked path stays reachable for same-origin art.
- [ ] Art failure steps down once and stops; no retry loop; never a hole in the layout.
- [ ] Every travelling highlight stops under `prefers-reduced-motion`.

**Seal** — `RankedPlayGem.test.tsx`
- [ ] Accessible name is exactly the visible word, from live text.
- [ ] The control stays unpainted, so the focus ring is the seal's shape.
- [ ] Hover, press and disabled are each their own state; press wins over hover by source
      order as well as specificity.
- [ ] Disabled goes fully quiet — nothing that still looks pressable.
- [ ] Under reduced motion it changes light but never travels.

**Role** — `RankedClassCarousel.test.tsx`, `Quiz.rankedRole.test.tsx`
- [ ] Every canonical role, in canonical order, **by name**; own mascot per role.
- [ ] Selected centred with exactly its two neighbours on the flanks.
- [ ] Radiogroup exposing `aria-checked`; a plain group when nothing can be committed; one
      tab stop; Arrow/Home/End move and select; still browses when read-only.
- [ ] **Nothing is sent when the already-selected mascot is clicked twenty-five times.**
- [ ] **Nothing is sent while the reader spins the whole ring, lap after lap.**
- [ ] The stage and ledger still move with every browse; the browsed mascot is marked
      selected, not the stored role.
- [ ] The settled role persists **exactly once** on PLAY, then continues into Ranked.
- [ ] Nothing is written when the settled role is already stored, or the stage untouched.
- [ ] A first role still commits for an account that has never chosen.
- [ ] A refusal surfaces, does **not** navigate, reuses one toast id, and keeps the local
      choice so PLAY can be retried.
- [ ] Exactly one champion medallion, following the selection, decorative, never part of a
      role option's accessible name, and far smaller than the mascot.
- [ ] No record at all when the host has none — never a zeroed one; scope stated.

**Category rail** — `QuizCategoryRail.test.tsx`
- [ ] Six approved categories, approved order, from the single shared definition.
- [ ] Each its own real League icon — no shared placeholder.
- [ ] Every category named in text; the art stays decorative.
- [ ] **Inert by default** — no doors until the question bank can open one.
- [ ] **No question counts or coverage figures.**
- [ ] Six real buttons the moment a handler is supplied, receiving the **id**, not the label.

**Geometry**
- [ ] The rail's bottom edge stays above the fold at 1280×800 (2px of slack) and 1825×832
      (11.3px). Re-measure both after touching `pt-3`, the `gap-2` seam, the rail height, or
      `RECENT_LEDGER_ROWS`.
- [ ] The workspace starts below the fold at `lg` and above.
- [ ] Column headings stay clear of the HUD's two corner clusters at every width the rack
      exists at.

---

*Captured from `e46324618a169c5bc1969a77485104e51becb2c6`. Every component path, asset path
and CSS token above was verified present at that commit; every measurement was read from a
running build of that tree at the stated viewport. No product behaviour was changed in
producing this document.*
