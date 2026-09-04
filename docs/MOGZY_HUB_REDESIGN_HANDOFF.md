# Mogzy Hub Redesign — Post-LIVE1 IA + Layout Design Prep

<!-- Revision 13 (merged to main) is at the top of this file. Revision 12 was
     the entrance + loading stabilization. -->

## Revision 2026-09-03h — MERGED TO `main`

**Status:** the hub workstream is on `main` for live review.

| | |
|---|---|
| Previous `origin/main` | `d96708ab` — feat(pt1): reveal the questions a Ranked match added to your collection |
| Hub branch tip | `1a2e117c` — feat(hub): entrance choreography and Patch Report loading stabilization |
| Merge base | `fb21f106` |
| Merge commit | `f35d8db1` (first parent `d96708ab`, second `1a2e117c`) |

**`main` had advanced 9 commits** since the branch point — all Ranked, Mastery
and question-library work (43 files). **Zero file overlap** with the hub's 16,
so the merge was conflict-free and nothing needed resolving. No unrelated
working-tree state from any other checkout was included: the merge was made on
a detached HEAD at `origin/main` in the hub worktree, whose tree was clean, and
the only stash present (`auth1-wip-stash-before-cs2`) belongs to another
workstream and was left untouched.

### Verification on the MERGED tree

- 311 tests passed across the hub, `lol`, broadcast and audio suites.
- ESLint 0 errors (the 2 pre-existing `react-refresh` warnings on the
  broadcast surface remain).
- `tsc --noEmit` failing-file set **identical** to the pre-merge baseline.
- `/lol` renders the complete hub: four volumes, both shelves, centerpiece,
  radio and Mogzy.
- All four routes navigate: `/quiz`, `/lol/docs`, `/combat-lab`,
  `/lol/pro-play`.
- **Patch Report stabilization intact** — re-measured with the tome PNG held
  by a route intercept, the surface (362×262), dock and first icon (y=199) are
  byte-identical before and after image load.
- Entrance runs on the first hub visit, paired stagger preserved: Leaguecraft
  and Combat Simulation impact at 943/1010ms, Archives and Pro Play at
  1156/1238ms — 67ms within a pair, 213ms between pairs, 3px overshoot each.
  Absolute times sit ~150ms later than on the branch alone because the merged
  bundle is larger to parse; the offsets are unchanged.
- Repeat SPA navigation skips it: `data-hub-entrance="false"`, identity
  transform.
- Reduced motion: identity transform, opacity 1, `animationName: none`.
- Console errors are the three pre-existing classes only.

### Deployment

**A push to `main` does not by itself publish mogzy.lol** — the frontend is a
Lovable project and the live site updates on a Lovable **publish**, which is a
manual step in that dashboard. Pushing `main` makes the work available to
Lovable and to anyone building from the repo; the owner still has to publish
to see it on the live domain.

---

<!-- Revision 12 (entrance + loading stabilization). Revision 11 was the final shelf polish; 10 shelved both columns and
     went head-on; 9 restored the backing; 8 was the material pass; 7 built the
     shelf; 6 rejected the mirrored shell. -->

## Revision 2026-09-03g — hub entrance + Patch Report loading stabilization

**Status:** BUILT. Static design untouched; this is entrance and load polish.

### 1. The Patch Report jump — measured cause

The tome `<img>` carried a definite CSS width (`w-[130.2%]`) and **no
`width`/`height` attributes and no `aspect-ratio`**, so until the PNG's
intrinsic size arrived its height was **0**. `AcademyBroadcastSurface` is
`flex flex-col`, so the whole centerpiece collapsed with it — while the patch
content, sized in `cqw` (which depends only on WIDTH, known at first paint),
rendered at full size inside a zero-height box.

Measured on a held-image frame (the PNG stalled by a route intercept):

| Box | Before tome load | After |
|---|---|---|
| surface | 362 × **0** | 362 × 262 |
| overlay | 362 × **0** | 362 × 262 |
| tome img | 471 × **0** | 471 × 314 |
| radio dock | y = **127** | y = **389** |
| first patch icon | y = **155** | y = **199** |

So sixteen naked champion icons floated over the library, then the dock jumped
**262px** and the icons **44px**. That is the reported defect, exactly.

### 2. The fix

`width={1536} height={1024}` on the tome img (plus `h-auto`). The UA derives
`aspect-ratio: 3 / 2` from the attributes, the height is known at first paint,
and nothing moves. **Re-measured: every box is now byte-identical before and
after the image loads** — surface 362×262, dock y=389, first icon y=199 in
both frames.

### 3. Reveal gating

`AcademyBroadcastSurface` holds `chromeReady` and fades the whole composed
tome in over 260ms. Readiness is `onLoad` **or** a ref-callback `img.complete`
check (a cached image can be complete before React attaches the handler, which
would otherwise strand the centerpiece invisible), **or** `onError` — a
missing painting shows content over nothing rather than nothing at all. This
is not fighting layout shift (geometry is already reserved); it only stops
live patch content sitting briefly on bare library. No skeleton, no
full-page loading screen.

### 4. Entrance timing (measured, not nominal)

Only the books move. Library, header, shelves, centerpiece and Mogzy are the
room and are simply present — the shelves get no motion at all, since a case
that flew in would read as the UI panel the whole shelf workstream exists to
stop being.

| Book | delay | appears | impact | settled |
|---|---|---|---|---|
| Leaguecraft (UL) | 380ms | 446ms | 793ms | 1046ms |
| Combat Simulation (UR) | 455ms | 526ms | 859ms | 1126ms |
| Mogzy Archives (LL) | 600ms | 672ms | 1006ms | 1259ms |
| Pro Play (LR) | 675ms | 739ms | 1086ms | 1339ms |

Within-pair offset 75ms; **pair-to-pair 213ms measured** (brief asked
150–220ms); total ≈1.4s. `BOOK_ENTRANCE_MS = 660`,
`BOOK_ROW_DELAY_MS = [380, 600]`, `BOOK_PAIR_OFFSET_MS = 75`,
`BOOK_IMPACT_FRACTION = 0.55`.

### 5. Landing motion

`@keyframes academy-hub-book-land`: 0% −26px and invisible → 40% opaque, still
falling (the fade finishes BEFORE contact, so a solid object lands rather than
a ghost resolving on impact) → 55% **+3px, scaleY(0.978)** contact → 72% −3px
rebound → 100% the exact approved resting state. `animation-fill-mode:
backwards` holds frame 0 through the stagger, so a book awaiting its turn is
lifted and invisible rather than sitting in its final place. No rotateY, no
perspective, no opening, no scaling beyond the 2.2% compression. Measured
overshoot exactly 3px, min scaleY 0.978.

### 6. Sound

A **`bookLand` cue added to the existing engine** (`src/lib/audio/play-sfx.ts`)
— no parallel system and no audio asset: that engine synthesises everything
from two primitives. Three parts in the order a real one arrives: a dull knock
sweeping 340→120Hz with a body tone dropping 104→64Hz, a brief mid ring off
the boards, then quiet leather/paper at 1500→700Hz a beat later. Peak 0.075 —
between `modeConfirm` and `queueStart`. `MIN_REPLAY_MS` 40ms so the 75ms
within-pair gap sounds twice.

Gated by the app's ONE sound store: `play_book_land` in `SoundSettings`
(defaults true, gets an AdminSounds row) plus the global `mogsy-sounds-muted`.

**Verified by counting Web Audio voices:** 16 with a gesture (4 books × 4
voices — exactly one impact each), **0 muted**, **0 under reduced motion**,
**0 with no gesture**.

**Honest limitation.** The engine refuses to sound before the browser has seen
a user gesture, which is correct autoplay behaviour and pre-existing. A *direct*
fresh load of `/lol` therefore animates silently. The real path — the entry
screen at `/`, whose CTA navigates to `/lol` — carries a gesture, so it sounds.
A gesture must also land *after* the audio module has evaluated: a click at
150ms produced 0 voices, at 500ms produced 16.

### 7. Repeat-navigation policy

A **module-level `hubEntranceConsumed` flag**, no storage. A page load resets
it, so a fresh visit or a refresh gets the sequence; SPA navigation does not,
so clicking Home from anywhere puts the hub up instantly. A sessionStorage key
would have been slower, more fragile, and would have killed the entrance on a
genuine reload — the one time it is most wanted. Verified: first visit
`data-hub-entrance="true"`, after navigating away and back `"false"` with an
identity transform.

**One real bug fixed here.** The flag was first claimed inside a `useState`
initializer. That is not StrictMode-safe and was measurably wrong: the double
render made the second pass see its own first pass's claim and hand the very
first visitor `false`, killing the entrance exactly when it should run. The
initializer now only READS; an effect does the claim.

### 8. Reduced motion

CSS cancels the animation (`animation: none`) and the impact timers are never
scheduled — four thuds with nothing moving is worse than silence. Verified:
transform identity, opacity 1, `animationName: none` immediately on mount, and
0 voices. Interaction and focus are never delayed.

### 9. Layout shift

`PerformanceObserver` over a fresh load: **CLS 0.0043**, from exactly two
entries. Neither is the hub composition:

- **0.0043 at ~1s** — the two `<h1>` title `<span>`s reflowing when **Cinzel**
  swaps in. A webfont shift in the header, not the books, shelves or
  centerpiece. Fixing it means `font-display` or a preload change that is
  app-wide typography, out of scope for this pass; recorded as the one
  remaining shift.
- **0.00002** — the radio's own dropdown, on interaction.

**The main composition contributes zero measurable shift**, and the
centerpiece's own boxes are provably identical before and after image load.

### Files changed

`src/components/lol/broadcast/AcademyBroadcastSurface.tsx` (reservation +
reveal gate) · `src/pages/LolHub.tsx` (entrance state, delays, impact
scheduling) · `src/index.css` (landing keyframes + reduced-motion) ·
`src/lib/audio/play-sfx.ts` (the cue) · `src/lib/audio/usePlaySfx.ts` (gate
map) · `src/hooks/useSoundSettings.tsx` (setting + label) ·
`src/lib/audio/play-sfx.test.ts` (cue count 9 → 10).

### Verification

311 tests passed across the hub, broadcast and audio suites · ESLint 0 errors
(2 pre-existing `react-refresh` warnings on the surface, which already exported
`briefSpread`/`briefIconSizing` at baseline) · `tsc` failing-file set identical
to baseline · console errors are the three pre-existing classes only. After the
entrance: all four hovers give `translateY(-10px)` with the right Mogzy bubble,
all four routes navigate, Patch Brief and radio both render.

### Remaining loading issue

The Cinzel font swap above. Also unchanged from earlier revisions:
`CENTERPIECE_MAX_PX` caps the tome at 1920, `BookModeCard` is dead code, and
the book frame PNG is 2.42 MB.

### Next

Not started, deliberately: persistent glows, floating/bobbing, Pro promotion,
What's New, below-the-fold redesign.

---

<!-- Revision 11 (final shelf polish).
     Revision 10 shelved both columns and went head-on; 9 restored the backing;
     8 was the material pass; 7 built the shelf; 6 rejected the mirrored
     shell. -->

## Revision 2026-09-03f — final shelf polish · STATIC DESIGN LOCKED

**Status:** LOCKED. CSS-only pass on four named items; no geometry, no
component, no test changed. **No new asset** — `src/index.css` is the entire
diff outside the handoff.

### 1. Uprights — the side plane is now a real element

The beam's side was the tail of one `90deg` gradient, which is why it still
read as a shaded strip. It is now `::after` at `inset: 0 0 0 74%` with its own
`linear-gradient(90deg, #2b1c0d, #1d1309 60%, var(--shelf-dark))` and its own
`inset 1px 0 0 rgba(226,196,140,.12)` arris. An arris is a hard edge between
two differently-lit surfaces, and only a real box can carry one. The post's
own gradient shortened to the front face alone.

`::before` adds the beam's cast shadow onto the backing —
`linear-gradient(90deg, rgba(0,0,0,.44), transparent)` at `left: 100%`, width
70%. It falls right on both posts because the whole scene is lit from the
left, and it is what reads as the post standing PROUD of the backing rather
than inlaid into it.

### 2. Backing — alternating plank tone

Seams strengthened (joint `.42 → .5`, lit arris `rgba(214,178,128,.07) → .085`)
and a second `repeating-linear-gradient` alternates plank value on a TWO-seam
period: `rgba(255,240,214,.022)` against `rgba(0,0,0,.055)`. About ±2%, which
is the whole effect — neighbouring boards differ the way milled stock out of
one tree does, without turning the backing into stripes that compete with the
volumes.

### 3. Board front edges — stepped profile and end joinery

The face gradient gains a shallow step above the underside (`#3d2a19` 72% →
`#2f1f11` 73%) under the existing chamfer break at 23%, so the profile is
milled rather than square-cut. Both boards also gain end shading —
`inset ±7px 0 9px -7px rgba(0,0,0,.62)` (base `±8px 0 11px -8px` at `.65`) —
which darkens each board where it crosses an upright: the ends turning away,
which is the joinery cue.

### 4. Perimeter ambient shadow

On the backing: `0 0 30px 8px rgba(2,5,10,.4)` plus
`0 14px 44px 6px rgba(2,5,10,.42)`. Wide spread, near-zero offset on purpose —
an offset shadow would read as a UI card lifted off the page, which is the
exact opposite of what the shelf is for. It seats the case in the room and
leaves the books' own contact shadows untouched.

### Verification

- **No coordinate moved.** Books 237×355 at (144,118), (144,480), (1059,118),
  (1059,480), computed transform `matrix(1, 0, 0, 1, 0, 0)` — head-on, no
  angling returned. Shelves on those two boxes; backing 298×730 at (113,111);
  posts 17px at x 113/395; upper board 346×15 at (90,467). Boards stay put on
  hover, so the contact shadows still belong to the shelf.
- All four routes navigate. 112 tests passed · ESLint clean · `tsc` failing-file
  set identical to baseline · no new console errors.

### Do the shelves read more dimensional?

Yes, on the uprights especially — the separate side plane with its own arris
is the one change that clearly lands, and the cast shadow onto the backing is
second. The board and backing changes are real but subtle at hub scale; they
are visible in a close crop and near-invisible at 1440 width, which is the
right side of the line for furniture that is meant to be quiet.

### Remaining static visual issues (carried, none introduced)

1. `CENTERPIECE_MAX_PX = 380` caps the tome while the volumes reach 297×445 at
   1920×1080, and the heavier side furniture makes the centre read lighter.
2. The backing is largely occluded by head-on books, so the planking and the
   new alternation mostly read in the strips beside each volume.
3. `BookModeCard` is dead code; the frame PNG is still 2.42 MB.

### Next workstream

**Static shelf/book design is LOCKED.** Next is entrance choreography and
sound — not started.

---

<!-- Revision 10 (both shelves, darker wood, head-on books).
     Revision 9 restored the backing; 8 was the material pass; 7 built the
     shelf; 6 rejected the mirrored shell. -->

## Revision 2026-09-03e — both shelves, darker wood, all four books head-on

**Status:** COMPOSITION LOCKED, AWAITING OWNER REVIEW.

Three approved changes land together, and they are related: once a volume
stands between two uprights on a board, it no longer needs to be turned in
space to explain where it is. The shelves took over that job, so the books
went flat.

### 1. Both columns are shelved

`renderShelvedColumn()` replaces the two hand-written column blocks; both
sides render the SAME `AcademyHubShelf`, **unmirrored**. The case is
symmetrical and lit from the left like every other object in the painting, so
the two sides read as a matching pair with no counter-turn — and the mirroring
mistake of Revision 5 is not repeated on the furniture.

### 2. All four books are head-on

Every rotation is gone: `rotateY`, `rotateYHover` and `rotateZ` are deleted
from `AcademyHubBook`'s props, the `CLOSED_BOOK_ROTATE_*` constants are
deleted from `LolHub`, and `perspective`, `transform-style`, the three
`--hub-book-rotate-*` custom properties and the `<1024px` flattening media
query are all deleted from the CSS. Confirmed in the browser: every volume's
computed transform is `matrix(1, 0, 0, 1, 0, 0)` at rest — exact identity, no
residual angle. A test asserts no rotation custom property and no inline
transform survives on any of the four.

### 3. Hover simplified to a lift

`translateY(-10px)` plus the gold light response, and nothing else. Measured
on all four: `matrix(1, 0, 0, 1, 0, -10)`, gold present, correct Mogzy bubble.
Under `prefers-reduced-motion` the lift is `0` and the light response stays.

### 4. Shelf darkened and refined

| Token | Was | Now |
|---|---|---|
| `--shelf-lit` | `#856140` | `#6b4c30` |
| `--shelf-face` | `#5b422a` | `#452f1d` |
| `--shelf-mid` | `#4a3420` | `#372516` |
| `--shelf-deep` | `#2a1c10` | `#1f1409` |
| `--shelf-dark` | `#1c1209` | `#150d06` |
| Backing body | `96deg #574029→#31210f` | `96deg #402d1c, #372516, #2c1d11, #1e1408` |
| Board top plane | `#967048 → #6a4d2f` | `#7d5b39 → #543b23` |

Roughly one and a half values down — dark walnut, still unmistakably warm, and
nowhere near the near-black panel that failed in Revision 7 (the darkest
member is `#150d06`, used only at arrises).

Refinements, all carpentry rather than ornament:
- **Boards get a chamfer.** The front face is no longer a flat ramp: a lighter
  band to 26%, then a hard step into the face. A square-cut board reads as a
  bar; the chamfer is what makes it read as milled.
- **The base reads as two members.** Height `×1.5 → ×1.7`, plus a plinth
  reveal — an `inset 0 -6px 0 -5px` dark line with an `inset 0 -8px 0 -7px`
  lit arris under it. Cheapest joinery cue there is.
- **Crisper plank seams** on the backing: joint `rgba(0,0,0,.34) → .42`, lit
  arris `rgba(255,234,198,.055) → rgba(214,178,128,.07)`.
- Uprights keep Revision 9's hard corner at 74%, re-valued into the darker ramp.

### One real bug, found and fixed during this pass

Factoring the two columns into `renderShelvedColumn` first collapsed **all
four books to the width of their title text.** The wrapper had an indefinite
width while its children were `w-full` against it — a circular reference that
resolves to max-content. `self-start`/`self-end` did not fix it (align-self
does not make a width definite); `w-full` alongside the `max-width` cap does,
and the auto margin then parks the wrapper at the column's outer edge. Worth
recording because the failure mode is silent and total.

### Verification

- **No coordinate changed.** Books 237×355 at (144,118), (144,480),
  (1059,118), (1059,480); shelves exactly on those two boxes. Identical to
  every revision since the four-book conversion.
- All four routes navigate. All four hovers and the guide bubbles are correct.
  The upper board stays at y=467 at rest and on hover, so the contact shadow
  still belongs to the shelf.
- 112 tests passed · ESLint clean · `tsc` failing-file set identical to
  baseline · no new console errors.
- Centre untouched: Patch Report, radio dock, Mogzy and his pedestal are
  unchanged, as are crops (Ryze 78% · Akali 36% · Viktor 34% · Ahri 56%),
  titles, sizes, routes, guide copy and the mobile panel list.

### Remaining visual issues

1. **`CENTERPIECE_MAX_PX = 380` still caps the tome** while the volumes reach
   297×445 at 1920×1080. Carried forward from Revision 5; now that the sides
   are heavier furniture, the centre reads lighter than before.
2. **The backing is largely occluded.** With head-on books there is less of it
   visible than when the volumes were turned, so the planking mostly reads at
   the strips beside each book. Not wrong, but the material is doing less work
   than it did at ±11°.
3. `BookModeCard` is still dead code, and the frame PNG is still 2.42 MB.

### Next decision

Owner review of the locked composition. Entrance choreography and sound remain
unstarted, as does the mobile book treatment.

---

<!-- Revision 9 (backing restored as planking).
     Revision 8 was the material pass; revision 7 built the shelf; revision 6
     rejected the mirrored shell. -->

## Revision 2026-09-03d — backing restored as walnut planking

**Status:** BUILT, AWAITING OWNER VISUAL APPROVAL. Still LEFT COLUMN ONLY.

Revision 8 deleted the back panel. That was the wrong call for the owner's
preference: the open case read as brown bars around books rather than as
furniture. The backing is restored — but **not** the version that was removed.

### Why the first backing failed, and what changed

The original was `#1b1209 → #0e0904` under `inset 0 0 42px rgba(0,0,0,.62)` —
a near-black rectangle, which read as a hole punched in the painting. The
diagnosis was wrong the first time: the problem was never that a panel
existed, it was that the panel was not made of anything. The fix is **actual
wood**, not less panel.

| | Removed version | Restored version |
|---|---|---|
| Body | `#1b1209 → #0e0904` | `linear-gradient(96deg, #574029, #4c3722 34%, #3f2c1a 68%, #31210f)` |
| Inset | `0 0 42px rgba(0,0,0,.62)` | `0 0 26px rgba(0,0,0,.34)` |
| Structure | none — a flat field | vertical plank seams every `16cqw`: a `rgba(0,0,0,.34)` joint with a `rgba(255,234,198,.055)` lit arris on its near side |
| Grain | none | `0deg` hairlines at 3–3.5%, running with the planks |
| Shading | none | `180deg` falloff to `rgba(0,0,0,.34)` at the head and foot |

It is one value darker than the boards, so the boards still read in front of
it, and it spans post-edge to post-edge so it visually ties the two uprights
together. It paints FIRST, before the uprights and boards, so the boards' own
cast shadows now land on it — which is what actually fuses the three parts
into one built object rather than three overlapping shapes.

### Uprights — side face added

Taken up as optional in the brief, because Revision 8 flagged the uprights as
the weaker half. The smooth `90deg` ramp is replaced by a **hard corner**: the
front face runs to 74%, then a discontinuity into the side face
(`#513a24` → `#2c1d10` at the same stop). A beam needs a visible arris; a
smooth ramp reads as a shaded strip no matter how many stops it has. No caps,
no carving, no ornament — the gradient is the whole change.

### Boards — unchanged

The three-plane read from Revision 8 is preserved exactly: lit top plane
(`::after`, inset `0.7cqw`), front face, ambient crease (`::before`), dark
underside inset, cast shadow. Placement untouched. The contact shadow still
lives on the board's top plane, so a lifting volume does not drag it along.

### Verification

- **No coordinate changed anywhere.** Measured against Revision 8: books
  237×355 at (144,118) and (144,480) left, (1059,·) right; backing 298×730 at
  (113,111); uprights 17px at x 113/395, y 101→851; boards 346×15 at (90,467)
  and 346×23 at (90,828). Identical at rest AND on hover.
- Books still read clearly in front: the backing is darker than the boards and
  far darker than the volumes' navy-and-gold, and it is mostly occluded by
  them — only the strips beside each book show planking.
- Guide, hover, focus and routes unaffected — this is CSS on an `aria-hidden`,
  `pointer-events: none` layer. Leaguecraft hover still speaks its line and
  still navigates to `/quiz`.
- 111 tests passed · ESLint clean · no new console errors.

### Does it read as a shelf?

Yes. The three-way crop makes the progression legible: (1) the dark box reads
as a hole, (2) the open case reads as bars, (3) the planked backing reads as a
wooden display unit holding two ornate books. The plank seams are the specific
thing that does it — they give the eye carpentry to hold on to where a flat
field gave it nothing.

### Next decision

Owner visual approval, then duplicate the case to the right column. Nothing
else from the earlier revisions has moved: no entrance animation, no sound, no
right-side shelf.

---

<!-- Revision 8 (shelf material pass).
     Revision 7 built the shelf; revision 6 rejected the mirrored shell. -->

## Revision 2026-09-03c — left shelf material + depth pass

**Status:** BUILT, AWAITING OWNER VISUAL APPROVAL. Still LEFT COLUMN ONLY —
not duplicated to the right.

Geometry pass approved; this changes only how the wood reads. **No token, no
dimension and no coordinate moved.** `--shelf-post`, `--shelf-slab`,
`--shelf-out`, `--shelf-rise` and `--shelf-lip` are untouched, and both
volumes measure exactly as before: 237×355 at (144,118) and (144,480); boards
346×15 at (90,467) and 346×23 at (90,828); uprights 17px at x 113/395.

### The back panel is gone

Removed, not restored. It read as a flat dark rectangle over the painted
library rather than as a recess. The case is now open — the library shows
between and behind the volumes and the uprights and boards carry the
structure alone.

### Three ideas do all the work

1. **Every board is a solid with three planes**, not a rectangle with a
   gradient. `::after` is the lit TOP PLANE — the surface the volume actually
   stands on — inset `0.7cqw` from the front face on both sides, and that
   inset is what reads as depth rather than as a highlight stripe. The element
   itself is the FRONT FACE. `::before` is a thin ambient-occlusion crease
   where the two planes meet, which is the cheapest possible "these are two
   surfaces". `inset 0 -1px 0 rgba(0,0,0,.6)` is the dark UNDERSIDE, and the
   outer `0 12px 20px` (base `0 18px 26px`) is the cast shadow.
2. **Grain runs along the length of each piece** — `90deg` hairlines on the
   boards, `0deg` on the uprights — as `repeating-linear-gradient` layers at
   4–5% contrast with deliberately irregular stop spacing (even stops read as
   corduroy). Real boards are cut with the grain, and getting that direction
   wrong is most of what makes CSS wood look like plastic.
   **No texture asset was added** — CSS did it cleanly.
3. **The contact shadow lives on the board's top plane**, composited as a
   `radial-gradient` background layer on `::after`, not on the book.

### Uprights

The 90deg body gradient is a cylinder read — lit near arris, face turning
away, shaded far side — and a new 180deg overlay adds ambient falloff, since
a post in a room is dimmer at its ends than at eye height. That alone is most
of what stopped it reading as a flat bar. Two 1px insets give it its arrises:
`inset 1px 0 0 rgba(226,196,140,.14)` lit, `inset -1px 0 0 rgba(0,0,0,.55)`
dark. No caps, no carving, no motifs.

### Palette (new `--shelf-*` ramp)

`--shelf-lit #856140` · `--shelf-face #5b422a` · `--shelf-mid #4a3420` ·
`--shelf-deep #2a1c10` · `--shelf-dark #1c1209`. Top plane
`linear-gradient(180deg, #967048, var(--shelf-lit) 40%, #6a4d2f)` with an
`inset 0 1px 0 rgba(232,205,152,.2)` front arris. No gold accent proved
necessary.

### Verification

- **Contact shadow stays on the shelf.** Measured at rest and on hover: the
  upper board is at y=467 in BOTH states while the Leaguecraft body rises
  117→108. The shadow does not travel with the lifting volume.
- No coordinates changed; no book, upright or board moved by a pixel.
- 111 tests passed · ESLint clean · console errors are the three pre-existing
  classes only, none new.
- Hover, focus, routes and the Mogzy guide are untouched by this pass — it is
  CSS on an `aria-hidden`, `pointer-events: none` layer at `z-0`.

### Honest read

The boards clearly gained thickness — the lit top plane against the darker
face is the biggest single improvement, and the base board now reads as
carrying the case. The uprights improved less: the ambient falloff and the
arrises help, but with no side face they are still closer to flat than the
boards are. If more is wanted there, a real side-face element (a second
narrow div at the post's dark edge) is the next honest step rather than more
gradient stops. Stopping here per the brief — one disciplined pass.

### Next decision

Owner visual approval of the left shelf material before duplicating the case
to the right column.

---

<!-- Revision 7 (left shelf prototype).
     Revision 6 rejected the mirrored shell. -->

## Revision 2026-09-03b — LEFT shelf structure prototype

**Status:** PROTOTYPE BUILT, AWAITING OWNER VISUAL APPROVAL.
**Left column only, deliberately** — the right pair still floats, so the hub
itself is the A/B: grounded left vs floating right.

The problem being solved is that four closed volumes read as UI objects over
the painted library. This gives the left pair furniture to stand on. Coded
geometry, no art asset: CSS gradients and shadows only, so silhouette, scale
and placement can be judged before anyone commits to a wood texture.

### Structure

`src/components/lol/AcademyHubShelf.tsx` — a shadowed back panel, two
uprights, an upper board and a thicker base board.

It has **no coordinates of its own.** It is an absolutely-positioned overlay
on the same box as the two books, and it mirrors the book stack with two
`flex-1` rows under the same gap, each hanging its board at its own bottom
edge. Row heights therefore track the volumes exactly at every viewport with
nothing to keep in sync by hand. Every thickness is in `cqw` against that box
— 1cqw is 1% of the BOOK WIDTH — so the case scales with the volumes through
the fold-driven sizing formula and needs no breakpoints.

| Token | Value | = at 1440×900 |
|---|---|---|
| `--shelf-post` | `7cqw` | 17px upright |
| `--shelf-slab` | `6.5cqw` | 15px board (base ×1.5 = 23px) |
| `--shelf-out` | `13cqw` | 31px clear of each book edge |
| `--shelf-rise` | `7cqw` | 17px of upright above and below the stack |
| `--shelf-lip` | `3cqw` | 7px of board past each upright |

### Measured geometry

| | 1440×900 | 1920×1080 |
|---|---|---|
| Uprights | 17px wide, x 113 and 395, y 101→851 | 21px, x 105 and 458, y 102→1042 |
| Upper board | 346 × 15 at (90, 467) | 433 × 19 at (76, 560) |
| Base board | 346 × 23 at (90, 828) | 433 × 29 at (76, 1012) |
| Back panel | 298 × 730 at (113, 111) | 374 × 915 at (105, 114) |

### Colours

Uprights `linear-gradient(90deg, #2b1c10, #5a4128 26%, #6b4e30 44%, #452f1c
78%, #23160c)` with `0 10px 22px rgba(3,6,12,.55)` — a cylinder read lit from
the left, matching the painting and the book shells. Boards
`linear-gradient(180deg, #7a5a39, #63482c 16%, #4a3420 62%, #2a1c10)` with a
`rgba(214,180,128,.16)` inset top highlight for the lit front edge and
`0 12px 20px` (base `0 18px 26px`) of throw. Back panel
`linear-gradient(180deg, #241809, #1a1207 55%, #130d06)` plus
`inset 0 0 46px rgba(0,0,0,.5)`. A blurred radial contact shadow sits on each
board, painted on the board rather than the book so it stays put while the
volume lifts on hover. No carving, no filigree, no gems, no glow, no gold
accent proved necessary.

### First pass was too tight — one retune, then stopped

The initial values (`--shelf-out: 6.5cqw`, `--shelf-post: 5.5cqw`) tucked the
case against the volumes and it read as "books in a dark box", not furniture:
the books are angled 11°, so the near edge covers a close upright entirely,
and the 7px inter-book gap swallows a thin board. The case has to clear the
volumes by enough that the **uprights and the board ENDS** carry the read
rather than the sliver between the books. One retune fixed it; polishing
stopped there per the brief.

### Verification

- **No book coordinate moved.** Both columns measure exactly as they did
  before the shelf: 237×355 at (144,118) and (144,480) left, (1059,·) right at
  1440×900; 297×445 at 1920×1080.
- **Z-order as specified:** shelf `z-index: 0`, books raised to `z-index: 10`.
  The shelf is `aria-hidden="true"` with `pointer-events: none`, and
  `elementFromPoint` over an upright returns the grid container, never the
  shelf — it cannot take a click, a focus stop or an announcement.
- Hover and focus unaffected: Leaguecraft and Archives both give +5.5°, −10px
  lift and the correct Mogzy bubble; keyboard focus reaches `/lol/docs` and
  clicking it navigates.
- 111 tests passed · ESLint clean · console errors are the three pre-existing
  classes only, none new.

### Layout notes / issues introduced

1. **The back panel is the weakest element.** It reads as a flat dark
   rectangle over the painted library rather than as a recess, most visible in
   the band above Leaguecraft. If the structure is approved this is the first
   thing to fix — most likely by dropping it and letting the uprights and
   boards carry the case alone.
2. **The uprights are flat bars, not posts.** No side face, so no real depth.
   Expected from a geometry-first pass; a side-face gradient or a texture is
   the follow-up.
3. **The base board overhangs the fold by 7px** at 1440×900 (bottom 851 against
   the section's 844 padding edge). It is inside the section's own bottom
   padding, so nothing clips or scrolls, but it is the tightest spot.
4. **The uprights start 6px above the header's baseline** (y 101 vs header
   bottom 107). No visual collision — the header text is centred and the case
   is far left — but there is no slack left there.
5. The volumes' own drop shadows still fall on the library rather than on the
   boards, so the contact is not fully sold. Left alone: fixing it means
   touching the book component, which this pass had no mandate to do.

### Next decision

Owner visual approval of the left shelf before duplicating it to the right.
Not done and deliberately so: no right-side shelf, no wood texture asset, no
entrance animation, no sound.

---

<!-- Revision 6 (mirrored shell rejected).
     Revision 5 is the four-book conversion; revision 4 is the Leaguecraft
     prototype the owner approved; revision 3 is the IA cleanup; revisions 2
     and 1 are the audits that produced it. -->

## Revision 2026-09-03 — mirrored right-column shell REJECTED

**Status:** CORRECTION APPLIED. Owner approved the complete four-book design,
size, crops, positioning and inward perspective, with one defect to fix.

**The experiment.** Revision 5 drew the right column's shell with
`scaleX(-1)`, so both columns' spines sat on the outer edge and the quadrant
read as two bilaterally symmetrical shelves. The window and title panel each
carried a second, mirrored x (`100 − left − width`) to move with it.

**Why it was rejected.** The shell art is not symmetrical: its leather grain,
gold ornament highlights and spine banding are lit from one side. Reflected,
that lighting runs against the painted library behind it and the artwork reads
as *wrong artwork* — which costs more than bilateral binding symmetry buys.

**What is now true.** All four books draw
`src/assets/academy-book-frame.png` in its NATIVE orientation, spine on the
left, including the right column. The books still face inward toward Mogzy —
that comes from the CSS perspective alone, which is unchanged: **left column
`rotateY` +11°, right column −11°, hover/focus ±5.5°.** The right-hand books
therefore have their spine on the inner edge, and that is intentional; the
bindings are deliberately NOT bilaterally symmetrical.

**Removed cleanly, no dead code:** the `mirrored` prop, the shell's inline
`scaleX(-1)`, both `mirroredLeft` coordinates, and the `box()` helper that
selected between them. `ART_WINDOW` and `TITLE_PANEL` are back to one set of
coordinates each, and all four books derive window and title placement from
the same native frame geometry. Verified in the browser: the shell `<img>`
computes `transform: none` on all four. No test existed whose purpose was the
reflected shell, so none was removed — `LolHub.test.tsx`'s "mirrors the inward
turn" case is about the rotateY negation, which stays, and the mascot facing
tests are about Mogzy's own `scaleX(±1)`.

Also corrected here: `AcademyHubBook`'s header docstring still described the
component as the Leaguecraft-only prototype, two revisions after that stopped
being true.

**Nothing else changed.** Sizes, positions, the 2×2 composition, champion art,
crops (Ryze 78% · Akali 36% · Viktor 34% · Ahri 56%), titles and their
placement, ±0.8° row roll, `perspective: 1400px`, the `translateY(-10px)` lift,
the Mogzy guide, the Patch Report, the radio, the centre composition, the
desktop sizing formula and the mobile treatment are all untouched. This was
deliberately a single-variable change so the owner can judge it in isolation.

**Verification.** 111 tests passed · ESLint clean · all four routes navigate ·
computed rest rotations `[+11, +11, −11, −11]` with shell transform `none` ·
Pro Play hover and Combat Simulation keyboard focus both give −5.5°, −10px lift,
the gold response and the correct Mogzy bubble · console errors are the three
pre-existing classes only (the `fetchPriority` warning plus a 403 and a 404),
no new ones · mobile 375×812 differs from the previous capture only by a
164×5px antialiasing band.

**Screenshots.** 1440×900 default · 1920×1080 default · 1440×900 Pro Play
hover · 1440×900 Combat Simulation focus · a cropped before/after of the
Combat Simulation book showing the reflected vs native shell.

**Next decision.** Owner visual approval of the complete four-book hub with
native shells. The remaining visual issues from Revision 5 all still stand
(centerpiece cap at 1920, `BookModeCard` dead code, the 2.42 MB frame,
faces sitting high in the window). Entrance choreography and sound remain
unstarted.

---

## Revision 2026-09-02d — ALL FOUR destinations are closed Academy volumes

**Status:** BUILT AND COMMITTED, AWAITING OWNER VISUAL APPROVAL OF THE
COMPLETE FOUR-BOOK HUB.
Branch `hub/leaguecraft-closed-book`, on top of `a22534af` (the approved
Leaguecraft prototype, Revision 4 below).

The owner approved the prototype direction and its size, and asked for a
slightly stronger inward turn. `/lol` now renders Leaguecraft, Combat
Simulation, Mogzy Archives and Pro Play as one shared closed-volume design.
`BookModeCard` no longer renders anywhere on the hub.

### Final four-book geometry

Sizing moved off the prototype's "fraction of the open book" model, which only
had to spend the single row the 6→4 IA cleanup freed. With four portrait
volumes the binding constraint is simply the fold:

```
2 × (w × 1.5) + gap  ≤  100dvh − headerBottom − bottomPad
→ w ≤ (100dvh − 190px) / 3          capped at 360px
```

`CLOSED_BOOK_FIT_OFFSET_PX = 190` collects the header at its ceiling (118px:
pt 8 + two title lines at 1.12 line-height of the capped 2.4rem title + the
personal line's mt 4 + 20), the section's `pb-14` (56px), one 12px gap and 4px
of slack. Taken at the title's ceiling, so it is conservative at every height
rather than only at the matrix entries. The 360px cap is a composition limit,
not a fit limit.

| Viewport | Volume | Column top | Column bottom | Slack above `pb-14` |
|---|---|---|---|---|
| 1366×768 | 193 × 289 | y 111 | y 696 | 16px |
| 1440×900 | **237 × 355** | y 118 | y 835 | 9px |
| 1920×1080 | **297 × 445** | y 123 | y 1021 | 3px |

**On size.** Four portrait volumes in two rows cannot hold the one-book
prototype's 288px width at 1440×900 — two 431px books plus a gap is 874px
against ~737px of usable lane. 237px is the largest that fits the fold, and it
is still far taller (355px) than any open book the hub has ever shown (229px at
the same viewport). This is geometry, not a stylistic reduction.

The `-50px` column lift (`BOOK_STACK_LIFT_CSS`) is no longer applied: it
existed to open the pedestal under three SHORT open-book rows that left slack
above them. Two portrait volumes spend the fold almost exactly, so any negative
lift now pushes row one into the title band. The constant stays exported and
tested for the open card; the hub passes `0px`. Nothing else in
`academy-layout.ts` was re-derived — the open-book constants and
`CENTERPIECE_WIDTH_CSS` are untouched, and every volume stays narrower than the
open width term so the tome is unmoved.

### Perspective and hover — final values

| Value | Setting |
|---|---|
| `perspective` | `1400px` on the link |
| Resting `rotateY` | **+11°** left column · **−11°** right column (exact negation) |
| Hover/focus `rotateY` | **+5.5° / −5.5°** — half the rest angle, toward the viewer |
| `rotateZ` | **±0.8°**, alternating by row so the shelf is not machine-set: Leaguecraft −0.8, Archives +0.8, Combat Simulation +0.8, Pro Play −0.8 |
| Hover/focus lift | `translateY(-10px)` |
| Hover/focus light | gold rim inside the art window + a gold drop-shadow |
| Transition | `380ms cubic-bezier(.22,.61,.36,1)` transform, 380ms filter |

Up from the prototype's 8°/4°. Verified by computed style: `[11, 11, −11, −11]`
at 1440×900 and 1920×1080, flattened to 2D at 1023×800, and under
`prefers-reduced-motion` the resting ±11° stays while the hover turn, the lift
and every transition are cancelled.

**Shell mirroring — this is what stops it reading as four copies of one card.**
The frame art puts the spine on the LEFT. Drawn unmirrored, all four spines
point the same way and the right column's spines face Mogzy. The right column
now draws the shell with `scaleX(-1)` so its spines sit on the OUTER edge and
the two shelves face each other. Only the SHELL flips: the art window and the
title panel carry a second, mirrored x (`100 − left − width`) and the splash and
title are never mirrored.

### Champion crops (portrait window, 0.88:1 against ≈1.70:1 splashes)

`object-fit: cover` shows each splash's full height and crops horizontally, so
the X value frames the champion and Y is close to inert. Source assets are
untouched.

| Destination | Champion | `object-position` | Why |
|---|---|---|---|
| Leaguecraft | Ryze | **78% center** | unchanged — owner-approved |
| Combat Simulation | Akali | **36% center** | centres her torso and kama; her mask stays in frame |
| Mogzy Archives | Viktor | **34% center** | centres the figure and keeps the glowing blade |
| Pro Play | Ahri | **56% center** | her face and the orb both read |

The registry's single `splashPosition` now means the PORTRAIT window; the open
card's old landscape values are gone with the card.

### Titles

All four are HTML on the leather, split on `"\n"` (never on spaces) so the
registry controls the setting exactly: LEAGUECRAFT / STUDIES, COMBAT /
SIMULATION, MOGZY / ARCHIVES, and PRO PLAY on one line. One shared type ramp,
`clamp(0.68rem, 8cqw, 2rem)` Cinzel at 0.1em tracking — 157px of text in a
166px panel at 1440×900, 197 in 208 at 1920×1080. No cover carries descriptive
copy; a test asserts the registry subtitles never reach a cover.

### Guide offsets — no recalibration was needed

All four `lean`/`bubble` pairs were checked visually at 1440×900 with each book
hovered. Mogzy leans to the correct side every time, each bubble carries the
right destination copy, and no bubble collides with a book, the radio dock or
the tome. `hub-guide.ts` is **unchanged** — the mirrored pairs the IA cleanup
calibrated still land, because the volumes moved outward and the bubbles sit
inboard of them.

### Files changed (on top of `a22534af`)

| File | Change |
|---|---|
| `src/components/lol/AcademyHubBook.tsx` | `mirrored` prop (shell `scaleX(-1)` + mirrored window/panel x); titles split on `"\n"`; title ramp 7.6→8cqw |
| `src/components/lol/academy-layout.ts` | closed-book sizing replaced by the two-portrait-row fold model (`CLOSED_BOOK_FIT_OFFSET_PX`, `CLOSED_BOOK_FIT_DIVISOR`, `CLOSED_BOOK_MAX_PX`); open-book constants untouched |
| `src/components/lol/academy-layout.test.ts` | closed-book block rewritten for the four-book contract |
| `src/pages/LolHub.tsx` | all four registry entries carry `coverTitle` + portrait `splashPosition`; `object` flag and the `BookModeCard` branch removed; rotation constants 8→11 / 4→5.5; `mirrored` and per-row roll; column lift → `0px` |
| `src/pages/LolHub.test.tsx` | prototype block rewritten for four volumes |

### Verification

- `LolHub.test.tsx` + `academy-layout.test.ts`: **111 passed**. ESLint clean on
  all five files. `tsc --noEmit` failing-file set identical to baseline.
- Routes: all four navigate correctly (`/quiz`, `/combat-lab`, `/lol/docs`,
  `/lol/pro-play`). DOM/tab order unchanged: leaguecraft → archives →
  combat-lab → pro-play, each with its registry `aria-label`.
- Keyboard focus on each book: ±5.5° turn, −10px lift, gold response. Hover
  matches.
- Centre intact: Patch Brief renders with its "Read full report" CTA, the radio
  dock is present and unmoved, Mogzy's reaction target still mounts.
- Mobile 375×812: the four `HexPanelLink` panels and the broadcast centerpiece
  are unchanged from the approved prototype capture.
- **Asset cost measured, not assumed.** Four `<img>` elements, ONE URL, and the
  browser transfers the frame **once**: total 2,420,160 bytes across two
  `PerformanceResourceTiming` entries (the 2.42 MB image + a 730-byte Vite
  module request). Four books do NOT mean ~9.7 MB. No optimisation is needed to
  unblock this pass.

### Screenshots

1440×900 default · 1440×900 hover ×4 (Leaguecraft, Combat Simulation, Archives,
Pro Play) · 1440×900 focus · 1920×1080 default · 375×812 mobile.

### Remaining visual issues

1. **The centerpiece now looks small against the volumes at 1920×1080.**
   `CENTERPIECE_MAX_PX = 380` caps the tome while the books grew to 297×445.
   Nothing regressed — the tome is pixel-unmoved — but the balance is worth an
   explicit decision. Deliberately not changed: re-deriving the centerpiece was
   out of scope and it is the one surface the brief said to preserve.
2. **`BookModeCard` now has zero consumers.** The hub was its only caller. Left
   in place rather than deleted, because the mobile book treatment is still an
   open decision and it is the obvious starting point. Flagging it so it does
   not rot unnoticed.
3. **The frame PNG is still 2.42 MB.** Per the measurement above this is one
   download, not four, so it is no longer urgent — but a 768×1152 derivative
   would still cut ~2 MB off the hub's LCP path whenever the look is final.
4. **Every champion's face sits high in the window.** Splash art composes faces
   in the upper third and `object-position`'s Y is inert against a
   full-height crop, so this is uniform across all four rather than a per-book
   flaw. It reads as a consistent house style; changing it means scaling the
   splash inside the window, which the owner declined for Ryze.

### Next decision

Owner visual approval of the complete four-book hub. Not yet started, and
deliberately so: entrance/drop choreography, impact sounds, destination-specific
shell colours or emblems, and the mobile book treatment are all still unbuilt.

---

## Revision 2026-09-02c — Leaguecraft closed-book visual prototype (APPROVED)

**Status:** APPROVED by the owner; superseded by Revision 5 above, which
extends this treatment to all four destinations. Committed as `a22534af`.
Branch `hub/leaguecraft-closed-book` (worktree
`/Users/macmoney/mogsy-wt-hub-book`), on top of `33b5dd5f` — the IA cleanup
described in Revision 3 below.

`/lol` now renders **Leaguecraft only** as a closed Academy volume. Combat
Simulation, Mogzy Archives and Pro Play still render the open-book
`BookModeCard`. **The hub is deliberately a mixed prototype** — that is the
approved scope, not an oversight.

### Files changed

| File | Change |
|---|---|
| `src/assets/academy-book-frame.png` | **NEW** — the owner-supplied shell, copied byte-for-byte from `public/assets/`. 1024×1536 RGBA, 2.42 MB. The original is untouched. |
| `src/components/lol/AcademyHubBook.tsx` | **NEW** (229 lines) — the layered closed volume. |
| `src/components/lol/academy-layout.ts` | **Additive only.** `CLOSED_BOOK_WIDTH_FRACTION`, `CLOSED_BOOK_HEIGHT_RATIO`, `CLOSED_BOOK_MAX_WIDTH_CSS`, `closedBookMaxWidthPx()`. **No existing constant was touched or re-derived.** |
| `src/components/lol/academy-layout.test.ts` | +25 tests for the closed-book geometry contract. |
| `src/pages/LolHub.tsx` | `HubDestination` gains `object` / `coverTitle` / `coverSplashPosition`; Leaguecraft's registry entry sets them; `renderBook` branches on `object`; three rotation constants. |
| `src/pages/LolHub.test.tsx` | +6 tests pinning the prototype's route, accessible name, guide wiring, cover-title split and the mixed state itself. |
| `src/index.css` | `.academy-hub-book` / `.academy-hub-book-body` — the transform, the hover/focus response, the <1024px flattening and the reduced-motion rule. |

### Layering — nothing is baked into the artwork

```
AcademyHubBook (Link — route, aria-label, aria-describedby, focus)
 └─ .academy-hub-book-body   ← ONE transform for the whole volume
     ├─ champion splash       (object-fit: cover into the alpha window)
     ├─ transparent shell PNG (leather, gold, spine, thickness)
     ├─ HTML title            (real text on the leather panel)
     └─ interaction layer     (gold rim + focus ring)
```

### Measured frame geometry — flood-filled from the PNG's own alpha channel

| Region | Fraction of the 1024×1536 canvas |
|---|---|
| Drawn book (alpha ≥ 200) | x 1.07–98.54%, y 1.04–97.27% |
| Transparent art window | x 16.60–90.04%, y 7.88–63.48% |
| Title panel (inside the gold rails) | x 17.5–88.5%, y 67–89% |

The drawn book covers 97.5% × 96.2% of the canvas, so — unlike `BookModeCard`,
which reclaims a large transparent border with negative margins — **the layout
box IS the canvas** and card height = width × 1.5 exactly, with no margin
arithmetic. The art window is 57.8% of the book's height and the leather below
it 35.1%; counting the gold framing around the window as part of the art
region, the cover reads at roughly **65/35 art-to-leather**, the approved
proportion.

The title panel is centred on the **cover** (x ≈ 53%), not on the canvas — the
spine eats the left 13%, so canvas-centring would sit the title visibly left.

### Sizing — why `academy-layout.ts` did not need re-deriving

Both fit slopes were derived for **three** book rows per column. The quadrant
has two, so about one row of height is free. The closed volume is sized as a
pure fraction of the open book's width term
(`CLOSED_BOOK_WIDTH_FRACTION = 0.68`), spending exactly that freed row:

```
1.5·wClosed + gap + 0.542·wOpen  ≤  3·(0.542·wOpen) + 2·gap
→ wClosed ≤ 0.723·wOpen + gap/1.5
```

Because it is a fraction of the existing term, the closed book **inherits the
min() tall/short crossover for free** and models no second regime of its own.

| Viewport | Open book | Closed volume |
|---|---|---|
| 1440×900 | 423 × 229 px | **288 × 431 px** |
| 1920×1080 | 509 × 276 px | **346 × 519 px** |

**The closed volume is NARROWER than an open book, and that is load-bearing.**
`CENTERPIECE_WIDTH_CSS` models the free central zone from the *open* book's
width term, so a narrower object cannot crowd the tome — the centerpiece needs
no re-derivation while the hub is mixed. It also *reduces* the known
centerpiece overlap: at 1440×900 the open Leaguecraft book's right edge sat at
x = 567 against the tome's left edge at x = 540 (27px of overlap); the closed
volume ends at x = 431, clearing it by 109px. Both facts are pinned by tests.

### Perspective and hover — the values as built

| Value | Setting |
|---|---|
| `perspective` | `1400px` on the link |
| Resting `rotateY` | **+8°** (left column; a right-hand book takes −8°) |
| Hover/focus `rotateY` | **+4°** — toward the viewer, never square |
| `rotateZ` | **−0.8°** |
| Hover/focus lift | `translateY(-10px)` |
| Hover/focus light | gold rim inside the art window + a gold drop-shadow |
| Transition | `380ms cubic-bezier(.22,.61,.36,1)` transform, `380ms` filter |

Positive `rotateY` turns a LEFT-hand book's cover toward the centre: its outer
edge comes forward and its inner edge recedes, so the volume faces Mogzy. Both
angles are **zeroed below 1024px**, and the hover turn plus the lift are
**cancelled under `prefers-reduced-motion`** — the resting angle stays, because
a static camera choice is composition, not motion. Verified by probing computed
styles at 1440×900, 1920×1080, 1023×800, 820×1180, reduced-motion and 375×812.

The three custom properties are declared on the **link**, so the media and
reduced-motion rules re-declare them on `.academy-hub-book-body` itself and win
over inheritance with no `!important`.

### Champion art

Ryze, reused unchanged from the existing hub registry.
`coverSplashPosition: "78% center"` — the portrait window (0.88:1) against a
landscape splash (1.70:1) shows the splash's full height and 51.9% of its
width, which puts Ryze's face near the window's centre and keeps the glowing
rune hand in frame. The open-book card's own `"95% center"` is untouched and
still drives the mobile panel and every other surface.

### Verification

- `LolHub.test.tsx` 59 passed · `academy-layout.test.ts` 50 passed. ESLint
  clean on every changed file.
- `tsc --noEmit`: the failing-file set is identical to the pre-change baseline
  (8 pre-existing files, none of them touched here).
- Full `vitest run`: the failing-file set matches `33b5dd5f`'s once
  `VITE_COMBAT_API_URL` is equalised. The baseline worktree carries a
  `.env.local` pointing the combat API at a dead `127.0.0.1:8010`; the five
  champion-asset/combat-API suites that diverged all pass here under that same
  value. **No test regressed.**
- Live: `/lol` renders; the volume navigates to `/quiz`; Combat Simulation,
  Mogzy Archives and Pro Play still navigate; Mogzy leans and speaks the
  Leaguecraft line on hover and on keyboard focus; DOM/tab order is unchanged
  (leaguecraft → archives → combat-lab → pro-play); the Patch Brief centerpiece
  and Mogzy's pedestal are pixel-unchanged against `33b5dd5f`; no new console
  errors (the only recurring warning is the pre-existing `fetchPriority` one on
  the LCP `<picture>`).
- Screenshots: 1440×900 rest/hover/focus, 1920×1080, 820×1180, 375×812.

### Does not match expectations — read before approving

1. **The asset is 2.42 MB and the hub now downloads two book frames.**
   `book-mode-frame.png` (2.48 MB) is still needed by the other three
   destinations, so the prototype hub carries ≈4.9 MB of book art. The repo
   baseline already accepted a 2.48 MB frame, so this is consistent rather than
   novel — but the closed volume renders at most 346px wide, so a 1024px source
   is ~3× oversampled even at 2× DPR. **A downscaled derivative was
   deliberately NOT made**: it would change the pixels under visual review, and
   `academy-welcome`'s own downscale sets the precedent for doing it as a
   separate, deliberate pass. Recommend a 768×1152 derivative (plus WebP) once
   the look is approved. The original stays untouched either way.
2. **The quadrant is now vertically asymmetric.** The left column runs 668px
   against the right column's 470px at 1440×900, and the right column sits
   ~15px higher than before because `items-center` re-centres it in the taller
   row. This is inherent to a mixed prototype and resolves when the other three
   convert. `academy-layout.ts` was deliberately not touched to paper over it.
3. **The art window's top ~15% is dark.** `object-fit: cover` on a landscape
   splash in a portrait window shows the splash's full height, including its
   empty upper third; `object-position`'s Y is inert here, so no per-champion
   value fixes it. If it reads as dead space at approval, the fix is a slight
   scale-up of the splash inside the window — one line, deliberately not made
   before approval.
4. **Mobile does not use the closed volume at all.** Below `md` the hub renders
   `HexPanelLink` panels exactly as before; the volume is desktop/tablet only,
   and nothing on mobile changed. Whether the closed book should reach mobile
   is a separate decision about the mobile hub, not about this treatment.

### The next decision is the owner's, and it is NOT "convert the rest"

**Approve, adjust or reject the Leaguecraft treatment first.** Conversion of
the other three was explicitly held back and should stay held back until the
look is signed off, because each of them inherits these same angles,
proportions and title geometry.

Concrete questions for that review:

1. Is +8° / +4° the right amount of turn, or should it be stronger?
2. Is the 65/35 art-to-leather split right, or should the champion window grow?
3. Is the Ryze crop the intended composition?
4. Should the cover carry a subtitle or an emblem, or is the title alone right
   now that Mogzy narrates the destination?
5. Is `CLOSED_BOOK_WIDTH_FRACTION = 0.68` the composition you want — should the
   volume be larger or smaller relative to the open books?

Once approved, the follow-on work in order: (a) the downscaled asset
derivative; (b) convert the remaining three, with a mirrored −8° on the right
column, which the component and the layout constants already support; (c) only
then revisit `academy-layout.ts`'s fit slopes, since a fully-closed quadrant
changes the binding constraint again.

---

## Revision 2026-09-02 — IA cleanup IMPLEMENTED (four destinations)

**Status:** SHIPPED to the branch. Proposal A (Balanced Quadrant) built.
This was the IA cleanup pass only — **not** the visual redesign.

### Final four-destination structure

| Position | Destination | Route | `guideId` | Object |
|---|---|---|---|---|
| Top-left | Leaguecraft | `/quiz` | `leaguecraft` | `BookModeCard` (Ryze) |
| Top-right | **Combat Simulation** | `/combat-lab` | `combat-lab` | `BookModeCard` (Akali) |
| Bottom-left | Mogzy Archives | `/lol/docs` | `archives` | `BookModeCard` (Viktor) |
| Bottom-right | **Pro Play** | `/lol/pro-play` | `pro-play` | `BookModeCard` (Ahri) |

Centre lane unchanged: `AcademyBroadcastCenterpiece` (tome + radio dock) above,
Mogzy below on his painted pedestal. The centerpiece remains the homepage
Patch Report entry.

### What changed

1. **One registry, one source of truth.** `LEFT_DESTINATIONS` /
   `RIGHT_DESTINATIONS` / `ALL_DESTINATIONS` / `PRO_PLAY_DESTINATION` collapsed
   into a single row-major `HUB_DESTINATIONS` array in `LolHub.tsx`; the
   desktop columns are derived by index parity and the mobile list walks the
   array in order. Every entry carries a `guideId`, so a destination cannot
   exist without Mogzy being able to describe it. No navigation framework, no
   new abstraction layer — three derived constants replaced four hand-synced
   ones.
2. **Pro Play promoted.** It shipped as a standalone gold `HexPanelLink` below
   the grid with **no guide mode at all**. It is now a full peer: a book on
   desktop, a panel on mobile, `guideId: "pro-play"`, a `HUB_GUIDE_MODES` entry
   with calibrated `lean`/`bubble`, an `sr-only` description node and
   `aria-describedby`/`aria-label` like every other destination.
   `renderProPlayPanel()` and both of its call sites were deleted.
   `/lol/pro-play` and `/lol/pro-play/quiz` are untouched; no LIVE1 internals
   were modified.
3. **Combat Lab → "Combat Simulation" (display title only).** The route,
   `guideId`, component names and every other `combat-lab` identifier are
   unchanged, exactly as the audit recommended. The rename lives in the
   registry entry's `title` and in `HUB_GUIDE_MODES["combat-lab"].title`
   (which is also the card's `aria-label`).
4. **Stat Check, Quiz History and Patch Reports removed as primary
   destinations.** Their books, guide modes and `HubGuideModeId` members are
   gone. **Nothing else was deleted**: routes, pages, prefetch rules, sitemap
   entries, feedback labels and every other front door are untouched —
   Stat Check from `Quiz.tsx`, Quiz History from the Leaguecraft workspace
   History pane (`/quiz#history`, default-open) and the profile nav tile,
   Patch Reports from the Broadcast centerpiece's "Read full report" CTA.
   No replacement entry point was invented, per the audit's recommendation.
5. **Mobile accent rule unified.** The old inline
   `d.to === "/combat-lab" ? "gold" : "cyan"` became a `GOLD_ACCENT_ROUTES`
   set so Pro Play keeps the gold it shipped with.

### Files changed

| File | Change |
|---|---|
| `src/pages/LolHub.tsx` | Registry collapse; three destinations removed; Combat Simulation title; Pro Play promoted to a book; `renderProPlayPanel` + both call sites deleted; `GOLD_ACCENT_ROUTES`; unused `HistoryIcon`/`Layers` imports dropped. |
| `src/components/lol/hub-guide.ts` | `HubGuideModeId` → 4 ids (`pro-play` added, three removed); `HUB_GUIDE_MODES` rewritten with the quadrant calibration. |
| `src/components/lol/MogzyHubGuide.tsx` | Comment only — the `yNarrow` doc no longer references the deleted `quiz-history` mode. |
| `src/pages/LolHub.test.tsx` | Fixtures and assertions updated; see below. |
| `src/components/lol/academy-layout.ts` | **Deliberately untouched** — see the calibration decisions. |

### Layout / guide calibration decisions

- **`academy-layout.ts` was not re-derived.** The audit flagged
  `BOOK_FIT_SLOPE`/`BOOK_FIT_OFFSET_PX` (and `BOOK_LIFT_*`) as three-row
  compensations that a 6→4 change invalidates. It invalidates them only in the
  sense that they are now *conservative*: a fit slope sized for three rows
  trivially fits two, so nothing overflows and every tested invariant
  (`BOOK_HEIGHT_RATIO`, the min() crossover, the 200px lane minimum,
  `CENTERPIECE_WIDTH_CSS`'s dependence on the book width term) holds unchanged.
  Re-deriving it would grow the books ~35–45% — a **visual** change, which is
  the next pass's call, not this one's. The freed row currently reads as
  breathing room, which is the composition the brief asked for. `academy-layout.test.ts`
  passes untouched.
- **Guide offsets: mirrored pairs, no `yNarrow` needed.** Two vertically
  centred rows land where the old rows 1 and 2 sat, so the top pair keeps the
  old row-1 values (`lean.x ∓95`, `y −30`; `bubble.x ∓88`, `y 44`) and the
  bottom pair inherits the old row-2 values (`lean.x ∓100`, `y 0`;
  `bubble.x ∓90`, `y 50`). Archives keeps its own numbers and moves to the
  **left** column, so its signs flip. No surviving mode sits in Mogzy's own
  vertical band (that was the retired third row), so `quiz-history`'s
  `yNarrow: −36` vw-interpolation hack is not needed by anything. The
  `yNarrow` **mechanism** is retained in `MogzyHubGuide` (unused) because the
  visual pass moves the cards again; it is documented as such.
- **Reading order = DOM order = tab order:** Leaguecraft → Combat Simulation →
  Mogzy Archives → Pro Play, at both breakpoints.

### Tests and verification

- `npx vitest run src/pages/LolHub.test.tsx` — **53/53 pass.**
- Full suite `npx vitest run` — 12 files / 49 tests fail. **Identical failure
  set on the stashed baseline** (verified by re-running those same 12 files on
  a clean tree): admin, radio, ads-consent, quiz-workspace, e2e-identity,
  structural-review, onboarding-gate. **Zero regressions.**
- `npx tsc --noEmit -p tsconfig.app.json` — 11 errors, **the same 11 on the
  baseline**. No new type errors.
- `npx eslint` on all four changed files — clean.
- Browser verification at 1440×900 and 375×812 against a local dev server:
  - `/lol` renders exactly four primary destinations, in a balanced quadrant
    around Mogzy and the tome. Desktop and mobile both coherent.
  - Hovering Pro Play, Combat Simulation and Mogzy Archives each produces
    Mogzy's lean, facing-turn and speech bubble with the correct copy; no
    bubble collides with a card title.
  - Stat Check, Quiz History and Patch Reports appear nowhere on `/lol`.
  - Routes verified rendering: `/quiz/stat-check`, `/lol/history`,
    `/lol/patch-reports`, `/lol/pro-play`, `/lol/pro-play/quiz`,
    `/combat-lab`, `/lol/docs`.
  - Global HUD, radio dock, Meta Reflex section and footer unaffected.
- Keyboard/focus guide behaviour and `aria-describedby`/`aria-label` per mode
  are covered by the passing test suite (focus-in/out, tab-between-cards, and
  the per-mode description-element assertions).

### Test changes

`src/pages/LolHub.test.tsx`: destination fixture → 4 rows; a new
`RETIRED_PRIMARY_DESTINATIONS` fixture with a guard that none of the three is
linked from the hub; a new "exactly four primary destinations" test asserting
the four `data-guide-mode` ids; a new centerpiece-still-present guard; the
"Pro Play after the six existing destinations" test inverted into "Pro Play is
a peer, not a trailing panel"; the `GUIDE_MODES` fixture and `LEFT_MODES`
membership updated; `stat-check` swapped for `archives`/`combat-lab` in the
focus/tab/click-reaction tests; the mascot facing test now hovers `pro-play`
(Archives moved to the left column, so it no longer mirrors him).

### Known issues / not regressions

- The tome's painted edge clips the right end of the **Leaguecraft** card
  title at 1440×900. **Pre-existing** — verified identical on the stashed
  baseline. It is `CENTERPIECE_OVERLAP_PX = 48` doing what it was written to
  do; the visual pass should resolve it when the objects are redesigned.
- Champion splashes and the Pro Play quiz payload are blank/errored on a local
  dev server with no backend (`ERR_CONNECTION_REFUSED` on the Railway asset and
  data APIs). Environmental, not a code defect.

### Explicitly NOT done (later passes)

New book/object artwork, closed/open-book interactions, Combat Simulation and
Pro Play custom artifacts, drop-in entrance choreography, sound effects, the
What's New `!`, Pro/Premium promotion, community/social and feedback redesign,
below-the-fold redesign, global search, graph changes, LIVE1 feature changes.
`SHOW_SWIPE_GAMES` (Meta Reflex below the fold) was left alone as instructed.

### Next task

**Visual design of the four primary destination objects** — not more IA work.
The structure is now correct and stable; the open question is what
Leaguecraft, Combat Simulation, Mogzy Archives and Pro Play should *look*
like as four differentiated objects (the audit's Proposal A risk: four
identical books can read as "the same hub with two deleted"), and whether
re-deriving `academy-layout.ts`'s two-row fit slope to grow them is part of
that.

---

## Revision 2026-09-02 (design prep) — audit, superseded by the above

**Status:** AUDIT + DESIGN PREP ONLY. No code changed, nothing committed.

**Authority:** `origin/main` @ `fb21f106` ("feat(pro-play): Pro Play hub and
quiz"), read from the clean worktree `/Users/macmoney/mogsy-wt-proplay-final`,
which sits on that exact commit. The primary checkout `/Users/macmoney/mogsy`
is on `cs2/phase2-combo-planner` with other sessions' uncommitted work and was
NOT used as authority and NOT touched.

---

## 1. `main` state verification (Task 1)

**LIVE1 / Pro Play is merged.** `fb21f106` is the tip of `origin/main`; the
prior tip was `3aa44d60`. Every file the 2026-09-01 audit listed as
"uncommitted" is now committed and present:

| File | Status on `main` |
|---|---|
| `src/pages/ProPlayHub.tsx` (85 lines) | committed |
| `src/pages/ProPlayQuiz.tsx` (188 lines) | committed |
| `src/pages/ProPlayHub.test.tsx`, `ProPlayQuiz.test.tsx` | committed |
| `src/lib/pro-play/api.ts` (108 lines) | committed |
| `src/App.tsx` (+6) | committed |
| `src/lib/route-prefetch.ts` (+6) | committed |
| `src/pages/LolHub.tsx` (+48) | committed |
| `src/pages/LolHub.test.tsx` (+21) | committed |

Nine files, +728/−1. Nothing from the LIVE1 frontend workstream remains
uncommitted.

### Routes and components

| Route | Component | Registered |
|---|---|---|
| `/lol/pro-play` | `ProPlayHub` | `src/App.tsx:543` (`src/App.tsx:94` lazy) |
| `/lol/pro-play/quiz` | `ProPlayQuiz` | `src/App.tsx:544` (`src/App.tsx:95` lazy) |

Prefetch registry: `src/lib/route-prefetch.ts:101-102` (lazy components),
`:158-159` (path→prefetch rules). `/lol/pro` is untouched — that is the paid
subscription page and a different meaning of "Pro".

### ⚠️ CORRECTION — Pro Play did NOT ship as a book

The 2026-09-01 audit predicted a 7th left-column book. **That is not what
merged.** The grid stayed **six books**. Pro Play ships as a standalone
`HexPanelLink` panel:

- Definition: `PRO_PLAY_DESTINATION` — `src/pages/LolHub.tsx:146-151`. It is a
  plain object literal, **not** a `HubDestination`: no `championName`, no
  `splashPosition`, and **no `guideId`**.
- Render: `renderProPlayPanel()` — `src/pages/LolHub.tsx:320-331`
  (`accent="gold"`, `compact`), called twice:
  - desktop `src/pages/LolHub.tsx:594` — `<div className="mt-2 hidden md:block">`, directly **under** the six-book grid;
  - mobile `src/pages/LolHub.tsx:614` — `<div className="mt-3 md:hidden">`, **after** the six mobile panels and **before** the mobile broadcast centerpiece.
- Rationale recorded in the commit body and in the comment at
  `src/pages/LolHub.tsx:70-80`: measured at 1440×900, a fourth book in a column
  runs to y=1049 against the other column's 930, because the lane holds three
  230px books by construction.

### Coupling introduced into the three files of interest

| File | Coupling added |
|---|---|
| `src/pages/LolHub.tsx` | `Trophy` icon import; `PRO_PLAY_DESTINATION`; `renderProPlayPanel()`; two breakpoint call sites. `LEFT_DESTINATIONS`/`RIGHT_DESTINATIONS`/`ALL_DESTINATIONS` **unchanged**. |
| `src/components/lol/hub-guide.ts` | **NONE.** `HubGuideModeId` is still the same six ids. There is no `pro-play` mode. |
| `src/components/lol/academy-layout.ts` | **NONE.** No constant changed; the panel sits outside the book-fit model. |

### Guide / hover behaviour — the real finding

**Pro Play has no Mogzy guide description at all.** It carries no `guideId`, so
it gets no `data-guide-mode` wrapper, no `activateGuide` on hover/focus, and no
`aria-describedby` into the `sr-only` description block. The six books do; Pro
Play does not. `src/pages/LolHub.test.tsx:187` actively asserts this:
`expect(container.querySelectorAll("[data-guide-mode]")).toHaveLength(6)`.

This is the single largest post-merge IA defect: Pro Play is being treated as a
primary destination in the product plan while being, in the code, a
second-class panel that Mogzy cannot talk about. **Any four-destination
redesign must promote it to a full guide mode.**

---

## 2. Current primary destination map (Task 2)

Seven destination objects appear on `/lol` today — six books + one gold panel.

| # | Destination | Route | Object today | Defined at | Disposition |
|---|---|---|---|---|---|
| 1 | Leaguecraft | `/quiz` | Book (L, Ryze) | `LolHub.tsx:84-91` | **KEEP PRIMARY** |
| 2 | Stat Check | `/quiz/stat-check` | Book (L, Twisted Fate) | `LolHub.tsx:92-99` | **REMOVE PRIMARY / PRESERVE ROUTE** |
| 3 | Quiz History | `/lol/history` | Book (L, Zilean) | `LolHub.tsx:100-107` | **MOVE / REHOME** |
| 4 | Combat Lab | `/combat-lab` | Book (R, Akali) | `LolHub.tsx:110-117` | **KEEP PRIMARY** (renames to Combat Simulation) |
| 5 | Mogzy Archives | `/lol/docs` | Book (R, Viktor) | `LolHub.tsx:118-125` | **KEEP PRIMARY** |
| 6 | Patch Reports | `/lol/patch-reports` | Book (R, Jayce) | `LolHub.tsx:126-133` | **REMOVE PRIMARY / PRESERVE ROUTE** |
| 7 | Pro Play | `/lol/pro-play` | Gold Hex panel | `LolHub.tsx:146-151` | **PROMOTE → KEEP PRIMARY** |
| — | Academy Broadcast (Patch Brief) | in-place | Centre-lane tome + radio dock | `AcademyBroadcastCenterpiece.tsx` | **SPECIAL EXISTING CENTERPIECE — untouched** |

Net: 7 objects → 4. Three removals (Stat Check, Quiz History, Patch Reports
book), one promotion (Pro Play from panel to first-class destination object).

### Contradictions against the stated plan

1. **Pro Play is not currently equal to the other three.** The plan assumes four
   peers; the code has three-and-a-panel. Promotion is real work, not a no-op:
   it needs a `HubGuideModeId`, a `HUB_GUIDE_MODES` entry with calibrated
   `lean`/`bubble`, an `sr-only` description node, and a test-count update.
2. **"Combat Simulation" does not exist by that name.** The destination is
   `Combat Lab` → `/combat-lab` everywhere (title, `guideId: "combat-lab"`,
   `HUB_GUIDE_MODES["combat-lab"]`, three test files). Renaming the *label* is
   cheap; renaming the `guideId` or route is a cross-file rename and is not
   required by this IA change. **Recommend: change the display title only.**
3. **The 6→4 reduction breaks the layout model, not just the list.** The book
   size formula `BOOK_FIT_SLOPE = 0.615` / `BOOK_FIT_OFFSET_PX = 212`
   (`academy-layout.ts:54-55`) is derived from *three rows per column fitting
   the fold*. Two rows per column changes the binding constraint, so books can
   grow — which is an opportunity, but it invalidates the tested contract.
4. **Meta Reflex still has a below-the-fold homepage section**
   (`SHOW_SWIPE_GAMES = true`, `LolHub.tsx:168`), outside the "everything lives
   inside Leaguecraft" hierarchy. Its comment block records that hiding it once
   left the feature with no front door. **Out of scope here — do not touch it
   as a side effect of the IA cleanup.**
5. **Patch Reports genuinely appears twice** and only one instance is being
   removed. The centre tome (`AcademyBroadcastCenterpiece`) has its own feed and
   its own "Read full report" CTA into `/lol/patch-reports`, so removing the
   *book* does not orphan the route — the centerpiece **is** its front door.

---

## 3. Quiz History re-home (Task 3)

**Recommendation: do nothing but delete the book. Quiz History is already
rehomed, twice, on `main`.**

Every existing path to `/lol/history`:

| Surface | Location | Kind |
|---|---|---|
| Hub book (being removed) | `LolHub.tsx:100-107` | primary destination |
| **Leaguecraft workspace History pane** | `LeaguecraftHub.tsx:718-720` mounts `StudyHistoryLedger` | **in-product, inside Leaguecraft** |
| **Profile stats nav tile** | `LeagueProfileStats.tsx:18` — `{ to: "/lol/history", label: "Quiz History", icon: History }` | account surface |
| Profile "View all" link | `LeagueProfileStats.tsx:245` | account surface |
| Missed-questions back link | `LolMissedQuestions.tsx:31` | in-flow |
| House ad | `lib/ads/houseAds.ts:53` | promo |
| Feedback route label | `lib/feedback/contract.ts:117` | infra |
| Sitemap | `lib/seo/sitemap.test.ts:31` | SEO |

The decisive fact: `StudyHistoryLedger.tsx` is **one component mounted twice** —
by the `/quiz` workspace History pane and by the standalone `/lol/history` page
(its own header comment says so, `StudyHistoryLedger.tsx:6-13`). The two
surfaces cannot drift. And the workspace pane is **addressable and default-open**:
`/quiz#history` (`LeaguecraftHub.tsx:341`), with
`useState<WorkspaceMode>("history")` as the initial mode
(`LeaguecraftHub.tsx:360`).

So a user who lands on Leaguecraft — the destination that replaces the Quiz
History book in the hierarchy — **sees their history ledger immediately, with no
extra click and no request** (the pane is fed from a payload `/quiz` already
holds). Friction after removing the book is effectively zero.

**Therefore:** no new navigation, no new surface, no new system. Delete the book
and the `quiz-history` guide mode; the route, the page, and both existing homes
stay exactly as they are. If the owner wants one belt-and-braces affordance, the
cheapest is a "Quiz History" link in the existing `MogzyIdentityMenu` panel
footer beside Settings — but the Leaguecraft pane already discharges the
requirement and I do not recommend adding it.

---

## 4. Exact IA cleanup change map (Task 4)

Nothing below has been edited. This is the complete list.

### 4.1 `src/pages/LolHub.tsx`

| Line(s) | Change |
|---|---|
| `92-99` | Delete the Stat Check `HubDestination`. |
| `100-107` | Delete the Quiz History `HubDestination`. |
| `126-133` | Delete the Patch Reports `HubDestination`. |
| `84-133` | `LEFT`/`RIGHT_DESTINATIONS` drop to 1 each. **Recommend collapsing both into one `HUB_DESTINATIONS` registry** and deriving side/position from the chosen layout, rather than keeping two one-element arrays. |
| `118-125` | Mogzy Archives moves (right column of 3 no longer exists). |
| `110-117` | Combat Lab → retitle "Combat Simulation". Keep `to`, `guideId`, `championName`. |
| `146-151` | `PRO_PLAY_DESTINATION` gains `guideId: "pro-play"` (+ `championName`/`splashPosition` if it becomes a splash-bearing object) and folds into the registry. |
| `320-331` | `renderProPlayPanel()` is replaced by whatever object type the chosen layout gives Pro Play; the twin desktop/mobile call sites (`594`, `614`) collapse into the normal destination loop. |
| `135` `ALL_DESTINATIONS` | Row-major interleave assumes 2 columns; re-derive from the registry. |
| `~640` `sr-only` block | Regenerate per surviving mode (it iterates `HUB_GUIDE_MODES`). |
| grid `grid-cols-[1fr_minmax(200px,0.34fr)_1fr]` | Only survives in a two-column proposal (A/C); Proposal B replaces it. |
| `DESKTOP_BOOK_STACK_INSET` (`LolHub.tsx:~317`) / `DESKTOP_BOOK_STACK_Y` | Both are 3-row-column compensations. Re-derive or delete. |
| `accent={d.to === "/combat-lab" ? "gold" : "cyan"}` (mobile) | Pro Play is also gold today; unify the accent rule. |
| `168` `SHOW_SWIPE_GAMES` | **Do not touch.** Out of scope. |

### 4.2 `src/components/lol/hub-guide.ts`

| Symbol | Change |
|---|---|
| `HubGuideModeId` union (`:14-20`) | Remove `"stat-check"`, `"quiz-history"`, `"patch-reports"`. **Add `"pro-play"`.** Final set: `leaguecraft`, `combat-lab`, `archives`, `pro-play`. |
| `HUB_GUIDE_MODES` (`:69-…`) | Delete three entries; add `pro-play` with `title`/`description`. |
| `lean` / `bubble` on all four | **Every surviving value must be recalibrated.** They are hand-tuned px offsets against today's card positions. `quiz-history`'s `yNarrow: -36` vw-interpolation disappears with it — but if a *surviving* card lands in that bottom band under the new layout, the same interpolation problem returns and `yNarrow` must be re-derived for it. Nothing fails loudly when these are wrong. |
| `hubGuideDescriptionId`, `GUIDE_CLEAR_DELAY_MS`, `useHubGuideState` | Unchanged. |

### 4.3 `src/components/lol/academy-layout.ts`

| Constant | Fate |
|---|---|
| `BOOK_FIT_SLOPE = 0.615`, `BOOK_FIT_OFFSET_PX = 212` (`:54-55`) | **Must be re-derived.** Both encode "heading + three book rows + padding fit the fold". |
| `BOOK_TALL_SLOPE = 0.308`, `BOOK_TALL_INTERCEPT_PX = 176` (`:52-53`) | Re-derive if books grow. |
| `REGIME_BOUNDARY_VH = 1000` (`:36`) | The min()-crossover *model* survives; the crossover point moves. |
| `BOOK_HEIGHT_RATIO = 0.542` (`:69`) | **Invariant — derived from the frame PNG alpha bbox.** Survives untouched unless new book art ships. |
| `BOOK_LIFT_TALL_PX = -50`, `BOOK_LIFT_EASE = 0.7` (`:80-83`) | 3-row compensation; likely deleted. |
| `BOOK_STACK_INSET_CSS` (`:165`) | Layout-dependent. |
| `CENTERPIECE_*` (`:150-189`) | `CENTERPIECE_WIDTH_CSS` is a function of `BOOK_WIDTH_TERM_CSS` and `BOOK_STACK_INSET_CSS`, so **it moves whenever the books move**, even though the centerpiece itself is "untouched". This is the least obvious coupling in the change map. |
| `TITLE_FONT_SIZE_CSS` / `titleFontSizePx` (`:106-109`) | The HUD-clearance term survives; check the 3-way `min()` still binds. |

### 4.4 Routes and dependencies

**No route is deleted.** `/quiz/stat-check`, `/lol/history`, `/lol/patch-reports`
all keep their `App.tsx` entries, pages, prefetch rules, sitemap entries and
feedback labels. Only hub links are removed. Retained front doors:
Stat Check ← `Quiz.tsx:1466`; Quiz History ← `/quiz#history` + profile;
Patch Reports ← the broadcast centerpiece CTA.

`src/lib/route-prefetch.ts` — the hub currently warms these on hover. Removing
the cards removes the warm path but not the rules; leave the rules alone.

### 4.5 Accessibility / focus

- DOM order **is** tab order. Four objects means a new, shorter tab sequence;
  it must still read in the intended priority order at both breakpoints.
- The `sr-only` description block is the **only** accessible channel for
  Mogzy's copy (the guide lane is `aria-hidden`). One node per surviving mode,
  and Pro Play gains one for the first time.
- Each destination link keeps `aria-describedby={hubGuideDescriptionId(id)}`
  and `aria-label = HUB_GUIDE_MODES[id].title` — both asserted by tests.
- No `aria-live`: hover still announces nothing. Preserve that.
- Mogzy's click-reaction stays a `div`/`img`, not a button — no cosmetic tab stop.
- `prefers-reduced-motion` must cancel lean, bubble offset **and** any new
  entrance choreography.

### 4.6 Tests that will fail and must be updated

| File | Assertion |
|---|---|
| `src/pages/LolHub.test.tsx:133-137` | Destination title/route table (7 rows). |
| `:140` | "renders every hub destination as a link". |
| `:150` | "renders each destination twice: desktop book + mobile panel". |
| `:166-169` | Stat Check mode-selection guard — **delete with the card**. |
| `:180-193` | "offers Pro Play once per breakpoint, after the six existing destinations" — **the premise inverts**; Pro Play becomes a peer, not a trailer. |
| `:187` | `[data-guide-mode]` count `6` → `4`. |
| `:196` | `["/lol/docs","/lol/history","/lol/patch-reports"]` list. |
| `:308-314` | `GUIDE_MODES` fixture (6 → 4, `pro-play` added). |
| `:346-361` | Directional-glide sign test — `LEFT_MODES` membership changes. |
| `:434-444` | `aria-describedby` / `aria-label` per mode. |
| `src/components/lol/academy-layout.test.ts` | Every re-derived constant. |
| `src/App.startupFallbacks.test.ts:75` | **Unaffected** — routes survive. |
| `LeaguecraftRecord.vellum.test.tsx`, `LeagueProfileStats.test.tsx:193` | **Unaffected** — the re-home targets are untouched. |

---

## 5. Three four-destination layout proposals (Task 5)

Shared to all three: Mogzy central and hover-authoritative; the existing
`AcademyBroadcastCenterpiece` (tome + radio dock) in the centre lane, unchanged;
no elaborate per-object open states (Mogzy carries the explanation);
`BOOK_HEIGHT_RATIO = 0.542` respected wherever `BookModeCard` is reused;
reduced-motion parity.

### Proposal A — **The Balanced Quadrant** (2×2, corners)

- **Spatial arrangement.** Keep the existing three-column grid; each side column
  holds **two** objects instead of three. Reading order TL Leaguecraft,
  TR Combat Simulation, BL Mogzy Archives, BR Pro Play. Centre lane keeps
  tome-on-top / Mogzy-below exactly as today. With one row removed, each object
  can grow ~35–45% and the vertical breathing room roughly doubles.
- **Objects.** Leaguecraft = `BookModeCard` (Ryze). Archives = `BookModeCard`
  (Viktor). Combat Simulation = a **non-book apparatus** — an open Hextech
  training rig / armillary on a stand, same footprint ratio, splash reused as a
  backplate. Pro Play = a **broadcast object** — a framed esports monitor /
  banner-stand, gold accent inherited from today's panel.
- **Interaction.** Identical to today: wrapper fires `activateGuide` on
  mouseenter/focus, `deactivateGuide` on leave/blur, 140ms grace. Objects get a
  subtle lift + rim-light on hover, nothing more. Tap = navigate.
- **Mogzy.** Unchanged centre lane, `bottom-[16%]`, over the painted pedestal.
  Only the four `lean`/`bubble` pairs need retuning — and the diagonal geometry
  is *cleaner* than today's, because no mode shares Mogzy's vertical band the
  way `quiz-history`/`patch-reports` do. **The `yNarrow` interpolation hack can
  probably be retired entirely.**
- **Patch centerpiece.** Unchanged, `top-3`, centre lane.
- **Pro promo.** The freed vertical space under the tome / above Mogzy, or a
  slim full-width strip where the Pro Play panel sits today (`mt-2` under the
  grid) — a slot that already exists and is already proven at both breakpoints.
- **Entrance.** Four objects drop into their corners in a short diagonal
  stagger (TL→BR, ~70ms apart), each with a 4–6px settle-compression and one
  impact SFX; tome fades and Mogzy bobs in last. ~600ms total.
- **Mobile.** Trivial — the single-column `HexPanelLink` list shortens from 7 to
  4 and the broadcast centerpiece follows. Best mobile story of the three.
- **`academy-layout.ts` rework.** **Moderate.** Re-derive `BOOK_FIT_*` and
  `BOOK_TALL_*` for 2 rows; delete `BOOK_LIFT_*`; re-check `CENTERPIECE_WIDTH_CSS`
  (it consumes the book width term). The min()-crossover model, the 200px lane
  minimum and `BOOK_HEIGHT_RATIO` all survive. Highest reuse of tested code.
- **Advantage.** Lowest risk, biggest immediate breathing-room win, keeps every
  proven responsive invariant, and the diagonal symmetry finally makes the
  left/right columns equal (today's 3/3-plus-a-panel asymmetry disappears).
- **Risk.** Most conservative — it can read as "the same hub with two books
  deleted". The four objects must be genuinely differentiated in art or the
  redesign will not feel like one.

### Proposal B — **The Lectern Arc** (shallow semicircle around Mogzy)

- **Spatial arrangement.** Abandon columns. The four objects sit on a shallow
  arc across the lower two-thirds of the painting, as if arranged on the library
  floor facing the viewer, with Mogzy at the arc's focus. Outer two sit lower
  and slightly larger (nearer); inner two sit higher and smaller (further) —
  real perspective depth. Tome hangs above the arc's centre.
- **Objects.** Full freedom: Leaguecraft = a book on a lectern; Archives = a
  shelf/cabinet; Combat Simulation = a sparring dummy / arena table; Pro Play =
  a broadcast stage with a banner. The arc is what unifies them, not the form.
- **Interaction.** Hovering an object brings it forward (scale + z), dims the
  other three slightly, and Mogzy **turns to face it** — the existing
  `mogzy-facing-turn` `scaleX(±1)` generalises naturally to a 4-position arc.
  Strongest use of the mascot of the three proposals.
- **Mogzy.** Centre, at the arc's focal point, standing slightly forward of it.
  `lean` becomes genuinely radial rather than hand-tuned per card.
- **Patch centerpiece.** Above/behind the arc's centre, over Mogzy. **This is
  the proposal's biggest tension** — the tome and the mascot compete for the
  same centre column, which is exactly the collision `hub-guide.ts`'s bubble
  offsets were written to avoid.
- **Pro promo.** A banner or standee at one end of the arc — visually part of
  the scene without being a fifth peer.
- **Entrance.** The arc assembles outward-in or left-to-right, objects sliding
  along the arc into place with a settle; Mogzy walks/fades into focus last.
  The most cinematic, and the most expensive.
- **Mobile.** Weakest. An arc cannot survive a 375px column, so mobile falls all
  the way back to the flat `HexPanelLink` list — meaning the desktop and mobile
  hubs share almost no visual language.
- **`academy-layout.ts` rework.** **Heavy / near-rewrite.** Column geometry,
  `BOOK_STACK_INSET`, the lift constants and the 3-column grid all go. Needs a
  new radial model with its own tests. `CENTERPIECE_WIDTH_CSS` must be rebuilt
  from scratch since its inputs vanish.
- **Advantage.** By far the strongest art direction and the most "Academy"
  feeling; makes Mogzy an actor rather than an ornament.
- **Risk.** Highest. Discards the most tested code, re-opens the mascot/tome
  collision that the current bubble calibration exists to solve, and has no
  credible mobile story.

### Proposal C — **Hero Shelf + Instrument Row** (asymmetric hierarchy)

- **Spatial arrangement.** Leaguecraft is a **large hero book** occupying the
  left third at roughly 1.5× today's book size — an honest signal that Ranked,
  Daily and Mastery all live behind it. The right third stacks the other three
  as a vertical row of smaller, equal objects. Centre lane unchanged.
- **Objects.** Leaguecraft = hero `BookModeCard` (same component, larger box —
  `BOOK_HEIGHT_RATIO` unchanged). Archives = small book. Combat Simulation =
  small apparatus. Pro Play = small broadcast object.
- **Interaction.** As today. The three small objects can share one hover
  treatment; the hero gets a slightly stronger one.
- **Mogzy.** Centre lane, but shifted marginally right of true centre to balance
  the hero's visual weight — a change to the `bottom-[16%]` anchor's horizontal
  partner, not to the anchor itself.
- **Patch centerpiece.** Unchanged, centre lane, `top-3`.
- **Pro promo.** Natural: a fourth slot appended under the right-hand row, or the
  space beneath the hero book. The clearest promo home of the three.
- **Entrance.** Hero book lands first with a heavier impact and a deeper
  compression; the three small objects then drop in sequence, lighter and faster.
  Cheap to build and reads as deliberate hierarchy. ~500ms.
- **Mobile.** Good — the hero becomes a full-width feature card and the other
  three stay `HexPanelLink`s beneath it, so mobile *inherits the hierarchy*
  rather than flattening it. Better than A on expressiveness, near-equal on cost.
- **`academy-layout.ts` rework.** **Moderate-low.** The column model survives;
  it needs a second book-size track (hero vs standard) and a re-derived fit
  slope for a 3-row right column against a 1-row left. `CENTERPIECE_WIDTH_CSS`'s
  book-width term becomes asymmetric — the one genuinely fiddly part.
- **Advantage.** The only proposal that makes the **stated hierarchy visible**:
  Leaguecraft is not one of four equals in the product, and this says so.
- **Risk.** Asymmetry can read as unfinished; and it structurally demotes
  Combat Simulation, Archives and Pro Play, which contradicts the owner's
  "four primary destinations" framing.

---

## 6. Recommendation (Task 6)

**Proposal A — The Balanced Quadrant.**

The owner's brief states four *equal* primary destinations. A is the only
proposal whose geometry actually asserts equality (C demotes three of them; B
asserts equality but at the cost of a near-total layout rewrite and a broken
mobile story). A also preserves the maximum amount of tested, hard-won code:
`BOOK_HEIGHT_RATIO`, the min()-crossover regime model, the 200px lane minimum,
the mascot pedestal anchor and the centerpiece all survive, so the rework
concentrates in constants that were *always* going to be re-derived by a 6→4
change.

The breathing-room objection to A is answered by arithmetic, not by layout
novelty: removing a row frees roughly a third of the column height, and the
brief's real complaint — a crowded feature grid — is caused by seven objects,
not by the grid. Four objects in a quadrant is not crowded.

The redesign's *identity* should then come from **art direction inside A**:
Combat Simulation and Pro Play must be genuinely non-book objects, and the
entrance choreography must land. That is where the effort belongs — not in
re-deriving radial geometry.

Proposal B's arc is worth keeping in the backlog as a later evolution once the
4-destination registry exists; A does not foreclose it.

---

## 7. Regression risks (Task 7)

1. **Silent guide mis-calibration.** Every `lean`/`bubble` value is hand-tuned
   px against today's card positions. Moving cards invalidates all of them and
   **nothing fails** — the bubble simply drifts off Mogzy or over a card title.
   There is no test for visual attachment. Requires manual verification at
   1024 / 1280 / 1440 / 1920 and at both height regimes.
2. **`CENTERPIECE_WIDTH_CSS` moves when the books move.** It is defined in terms
   of the book width term and the stack inset. "We didn't touch the centerpiece"
   will be false; the tome will resize.
3. **The `<picture>` + 1×1-GIF pattern is load-bearing.** A real `src` causes a
   documented double download of the LCP painting. Do not "clean it up".
4. **`BOOK_HEIGHT_RATIO = 0.542` comes from the frame PNG's alpha bbox.** New
   book art with different transparent padding breaks every layout formula and
   the `academy-layout.test.ts` contract. New *non-book* objects must either
   match the ratio or get their own measured constant.
5. **The mascot's `bottom-[16%]` anchor and the `top-[3.25rem]/-bottom-[3.25rem]`
   counter-offset** keep Mogzy over the painting's pedestal. Any change to
   section padding slides him off it.
6. **Pro Play's promotion is the riskiest single edit**, because it is the one
   change that *adds* to `HubGuideModeId` — new union member, new
   `HUB_GUIDE_MODES` entry, new `sr-only` node, new `aria-describedby`, and four
   test files that currently assert exactly six guide modes.
7. **Route orphaning.** Stat Check, Quiz History and Patch Reports must keep a
   verified front door after their cards go. All three do today
   (`Quiz.tsx:1466`, `/quiz#history` + profile, broadcast CTA) — but this must
   be re-checked at implementation time, because the `SHOW_SWIPE_GAMES` comment
   records this exact mistake being made before.
8. **Two manually-synced lists.** `LEFT/RIGHT_DESTINATIONS` and
   `HUB_GUIDE_MODES` have no single source of truth. Collapsing them into one
   registry as part of this work is the durable fix; not doing so guarantees the
   next destination change repeats the drift.
9. **Tab order is DOM order.** A 2×2 grid's DOM order and its visual order must
   be reconciled deliberately.
10. **Meta Reflex and the below-the-fold sections are out of scope** and must
    not move as collateral.

---

## 8. Single next task (Task 8)

**Once the owner picks a layout: build the unified destination registry — data
only, no visual change.**

Collapse `LEFT_DESTINATIONS`, `RIGHT_DESTINATIONS` and `HUB_GUIDE_MODES` into
one exported registry of four entries that carries route, title, subtitle,
object type, art reference, guide copy and guide geometry together; add
`"pro-play"` to `HubGuideModeId` and give Pro Play its guide mode and its
`sr-only` description; drive the existing rendering off the registry so the hub
renders **identically to today** except that Pro Play now talks to Mogzy.

Doing this first means the layout change that follows is a geometry change
against a single source of truth, instead of a seven-way edit across two
manually-synced lists, a test fixture and an accessibility block. It is also
independently shippable and independently verifiable.

---
---

# ARCHIVE — original audit, 2026-09-01

*Superseded where it conflicts with the revision above. Its most significant
error: it predicted Pro Play would merge as a seventh left-column book. It
merged as a gold Hextech panel below the grid with no guide mode. Sections
1–10 below otherwise remain accurate against `main`.*

# Mogzy Hub Redesign — Current-State Audit (2026-09-01)

**Status:** AUDIT ONLY. No code changed, nothing committed.
**Authority for this audit:** working tree of `/Users/macmoney/mogsy` on branch
`cs2/phase2-combo-planner` (HEAD `1f9740bf`). Note: `main` is at `3aa44d60`.
The Pro Play book and `ProPlayHub`/`ProPlayQuiz` pages are **uncommitted local
changes**, not yet on `main` — see Risks.

## Objective

Redesign the Mogzy main hub without inventing parallel systems or breaking the
existing mascot, book, broadcast, radio, HUD and welcome interactions.

---

## 1. Homepage architecture

### Routes

| Route | Component | Notes |
|---|---|---|
| `/` | `src/pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx` | `LEAGUE_ONLY_MODE` is on in prod, so the Academy **entry screen** is `/`. Renders OUTSIDE `<Layout />` (no HUD, no footer). CTA navigates to `LEAGUE_HOME_ROUTE`. |
| `/lol` | **`src/pages/LolHub.tsx`** | **This is the hub being redesigned.** `LEAGUE_HOME_ROUTE = "/lol"` (`src/lib/site-config.ts:21`). |
| `/welcome` | `src/pages/welcome/AcademyWelcomePage.tsx` | New-user orientation; real route, survives refresh, replayable. |
| `/dev/legacy-entry` | `src/pages/Index.tsx` | Retired pre-Mogzy landing, inspection only. |
| `/home` | `src/pages/Home.tsx` | Legacy Mogsy home; a `<Navigate>` stub in League-only mode. **Not the hub.** |

Route table: `src/App.tsx:336-362`. `/lol` renders inside `<Layout />` and is
listed in `isFullBleed` (`src/components/Layout.tsx`), which is what lets the
painted library reach the viewport edges.

### Supporting components used by the hub

- `src/components/lol/BookModeCard.tsx` — open-book destination card.
- `src/components/lol/HexPanelLink.tsx` — mobile/below-fold chamfered panel card.
- `src/components/lol/MogzyHubGuide.tsx` — mascot + speech bubble.
- `src/components/lol/hub-guide.ts` — mode metadata + `useHubGuideState`.
- `src/components/lol/academy-layout.ts` — the whole responsive geometry system.
- `src/components/lol/broadcast/AcademyBroadcastCenterpiece.tsx` (+ `AcademyBroadcastSurface.tsx`, `usePatchBriefFeed.ts`, `broadcast-content.ts`).
- `src/components/audio/AcademyRadioDock.tsx`, `AcademyRadioControls.tsx`.
- `src/components/lol/LolWelcomeIntro.tsx` — legacy first-visit tutorial popup (policy-gated, off in prod).
- `src/components/blog/BlogPostCard.tsx`, `src/components/ads/AdSlot.tsx`, `src/components/SEOHead.tsx`.

### How destinations are defined

Two hardcoded arrays inside `LolHub.tsx` (~line 79):
`LEFT_DESTINATIONS` and `RIGHT_DESTINATIONS`, of type `HubDestination`
(`{ to, title, subtitle, Icon, championName, guideId, splashPosition }`).
`ALL_DESTINATIONS` interleaves them row-major for the mobile list.
Each `guideId` must exist in `HUB_GUIDE_MODES` (`hub-guide.ts`) — **the two
files are manually kept in sync; there is no single source of truth.**

### Destinations that currently appear (7)

Left column: **Leaguecraft** `/quiz` · **Stat Check** `/quiz/stat-check` ·
**Quiz History** `/lol/history` · **Pro Play** `/lol/pro-play` *(uncommitted)*
Right column: **Combat Lab** `/combat-lab` · **Mogzy Archives** `/lol/docs` ·
**Patch Reports** `/lol/patch-reports`

Champion splashes per card: Ryze, Twisted Fate, Zilean, Azir / Akali, Viktor, Jayce
(resolved via `useChampionAssets` + `getChampionSplash`).

---

## 2. Current hub visuals

- **Background:** one `<picture>` with two `<source>`s —
  `src/academy/hub/academy-library-desktop.png` and `academy-library-mobile.png`.
  The `<img>` `src` is a **1×1 transparent GIF on purpose** (a real file there
  double-downloads; see the comment block in `LolHub.tsx`). LCP visual:
  `loading="eager" fetchPriority="high"`. A linear-gradient scrim sits over it.
- **Books:** `BookModeCard` layers over one reusable transparent PNG,
  `src/academy/hub/book-mode-frame.png` (1536×1024). Champion splash is clipped
  into the left cover panel (`left 10.4% / top 17.6% / w 33.2% / h 59.8%`);
  title + subtitle are **real HTML** on the right cover. Negative margins
  reclaim the PNG's transparent padding, so **card height = width × 0.542**
  (`BOOK_HEIGHT_RATIO`) — a constant the entire layout system depends on.
- **Title:** `.academy-hub-title`, Cinzel, gradient `background-clip: text`
  with inline `color`/`textShadow` overrides because `.theme-lol h1` would
  otherwise win.
- **Motion/CSS:** `src/index.css` — `academy-mogzy-float` (1779), `mogzy-lean-glide`
  (1798), `mogzy-lean-bubble` (1802), `mogzy-facing-turn` (1819),
  `mogzy-click-react` (1833), `academy-personal-line` (2078),
  `book-title-glimmer` (2148). A `prefers-reduced-motion` block at ~2081 cancels
  each one.

**Reusable vs coupled**

| Reusable | Coupled to the current presentation |
|---|---|
| `BookModeCard` (pure props; frame PNG geometry is self-contained) | The 3-col `grid-cols-[1fr_minmax(200px,0.34fr)_1fr]` lane composition in `LolHub.tsx` |
| `HexPanelLink` | `DESKTOP_BOOK_STACK_INSET` / `BOOK_STACK_LIFT_CSS` translate hacks |
| `academy-layout.ts` formulas (with tests) | Every `bubble.x/y/yNarrow` value in `hub-guide.ts` — hand-calibrated against *today's* card positions |
| Broadcast centerpiece + radio dock | The `top-[3.25rem] -bottom-[3.25rem]` counter-offset wrapper around `MogzyHubGuide` |
| Library background paintings | The `bottom-[16%]` mascot anchor, tuned to the painting's painted pedestal |

---

## 3. Mogzy mascot

Implemented entirely in `src/components/lol/MogzyHubGuide.tsx`, mounted in the
central lane of `LolHub.tsx` inside an `aria-hidden`, `pointer-events-none`
wrapper. Asset: `public/mascot/mogzy-mascot-base-v1.png`, sized
`w-[clamp(97px,9.7vw,167px)]`.

Layer stack (deliberately separate so transforms never compete):
1. `.academy-mogzy-float` — 6s idle bob, `absolute inset-x-0 bottom-[16%]`.
2. `.mogzy-lean-glide` — contextual glide, `--guide-lean-x/y`, 340ms with slight overshoot.
3. Speech bubble (sibling, `z-10`) — `--guide-bubble-x/y`.
4. `.mogzy-facing-turn` — `scaleX(±1)`; base art faces left, so right-side cards mirror.
5. Click-reaction div (`data-testid="mogzy-guide-react"`).

- **Hover behaviour:** each book wrapper in `LolHub.tsx` fires
  `activateGuide(d.guideId)` on `mouseenter`/`focus` and `deactivateGuide` on
  `mouseleave`/`blur`. `useHubGuideState` (`hub-guide.ts`) applies immediately on
  activate and clears after `GUIDE_CLEAR_DELAY_MS = 140` so moving between
  adjacent cards never flashes idle.
- **Dialogue:** `HUB_GUIDE_MODES[id].title` + `.description` render in a
  parchment bubble. `lastModeRef` keeps the text while the bubble fades out.
  Accessibility is handled separately: a `sr-only` block in `LolHub.tsx` renders
  one `<span id={hubGuideDescriptionId(mode.id)}>` per mode, and each card link
  points at it via `aria-describedby`. **No `aria-live`** — hover announces nothing.
- **Click/bounce:** `handleReact` on the mascot `<img>` (`pointer-events-auto`
  scoped to the image only). It removes `.mogzy-click-react`, forces a reflow,
  re-adds it — so rapid repeat clicks always restart the keyframes. Self-clears
  on `animationend`. Skipped outright under `prefers-reduced-motion`. It is a
  plain `div`/`img`, not a button, on purpose (no cosmetic tab stop).
- **Other state:** none. No persistence, no timers, no server reads.

**"What's New" feasibility:** yes, cheaply, without a new system. The bubble is
already a mode-driven view over `activeModeId`. A `whats-new` entry in
`HUB_GUIDE_MODES` plus one extra `activate()` caller (a `!` badge next to the
mascot) reuses the whole pipeline. Two real constraints: (a) `HubGuideMode`
carries `lean`/`bubble` offsets calibrated for *card hover*, so a
mascot-anchored mode needs `lean: {x:0,y:0}` and its own bubble placement; (b)
the guide lives inside an `aria-hidden` subtree, so a *user-triggered*
announcement would need its own accessible node outside that lane (the `sr-only`
block is the existing precedent). **Not implemented.**

---

## 4. Patch Report (the central book) — keep as-is

- **Composition:** `AcademyBroadcastCenterpiece.tsx` = broadcast surface + the
  Academy Radio dock beneath it. Mounted absolutely at `top-3` in the central
  lane (desktop) and again after the destination list on mobile (`variant="mobile"`).
- **Surface:** `AcademyBroadcastSurface.tsx` over the painting
  `public/images/lol-hub/academy-broadcast-book.png`. The painting is pure
  chrome — all copy is live HTML over measured page rectangles.
- **Data flow:** `usePatchBriefFeed()` → `fetchPatchReports()` (`["patch-reports"]`)
  → `patches[0]` → `fetchPatchReport(version)` (`["patch-report", version]`) →
  `projectPatchBrief(detail, championManifest)` → `briefTransmission()` →
  `BroadcastFeed`. Champion icons come from `useChampionAssets`.
  **It shares the Patch Reports page's exact query keys and cache — no second store.**
  Fallback contract: only a genuine in-flight load shows "Receiving transmission…";
  every error/empty case silently returns `INITIAL_BROADCAST_FEED`.
- **It is structurally NOT a hub destination.** It is an absolutely-positioned
  centre-lane object with its own content feed and its own CTA
  ("Read full report" → `brief.fullReportHref`). The separate **Patch Reports**
  *book* (`/lol/patch-reports`) is a different thing and is a destination.

---

## 5. Entrance / initial animations on the hub

There is **no dedicated hub entrance choreography today.** What happens on load:

1. `Layout`'s root has `.animate-page-fade-in` (`src/index.css:528`) — a whole-page fade.
2. `playUiSfx("appEnter")` in a mount effect; `playUiSfx` self-suppresses on a
   cold page load (no user gesture yet), so it only sounds on internal navigation.
3. `trackFunnelEvent("lol_landing_viewed")`; `markHubVisited()`; anonymous
   sign-in if there is no user.
4. `.academy-personal-line` — a 480ms fade-in on the desktop greeting line only.
5. Books, mascot and the tome appear with **no stagger** — the idle bob and the
   title glimmer simply start looping.

Infrastructure available for a future book/object entrance: `framer-motion`
(^12.34.3, already a dependency and used by `AcademyBroadcastSurface`), the
`useRevealSequence`/`cadence.ts` slot controller from the welcome page, and the
existing CSS keyframe + `prefers-reduced-motion` conventions in `index.css`.

---

## 6. Welcome Orientation (`/welcome`)

`src/pages/welcome/` — the richest animation asset in the codebase:

| File | Role |
|---|---|
| `AcademyWelcomePage.tsx` | Page/orchestrator |
| `AcademyTome.tsx` | The book stage; **the page-turn implementation** |
| `useRevealSequence.ts` + `cadence.ts` | Slot/step controller: one `{chapter, step}` position and a timer. Copy blocks land as slots; the illustration is a separate channel keyed off `artRevealed` |
| `ChapterPlate.tsx`, `InkText.tsx`, `FinaleSpread.tsx` | Chapter views, ink-in text, finale |
| `tomeChrome.ts`, `tomeGeometry.test.ts` | Control-row height **reservation** so the tome never moves between chapters |
| `useSceneReady.ts`, `usePrefersReducedMotion.ts`, `tomeAudio.ts`, `sceneAssets.ts` | Readiness gate, motion pref, audio, asset preload |
| `RegistrationForm.tsx` | Inline account creation (HI1-C5) |

**Book-opening / page-turn mechanics:** the turning leaf is a real sheet staged
over the right page. Its **front face carries the outgoing chapter's writing and
its back face is blank parchment**, and both faces are **cut from the spread
painting's own pixels** (`--tome-paper` positioned into the box x 50–92%,
y 13–88% of the tome) — so at rest the leaf is invisible against the page
beneath it. One CSS animation rotates it across the spine under a moving
fold-light with a cast shadow; the page removes it on a timer. Entirely
presentational and `aria-hidden`.

Asset: `src/academy/welcome/academy-book-spread.png` — a **downscaled derivative
of the same `academy-broadcast-book.png` painting the hub already uses** (the
2.6 MB public original was not an acceptable first-visit cost).

**Reuse verdict (do not extract yet):** the leaf technique, `useRevealSequence`,
`cadence.ts` and the `tomeChrome` reservation pattern are all directly
applicable to a hub book-entrance. The tome's own sizing (`--tome-chrome`,
aspect 1.381) is specific to a single centred full-screen book and does not
transfer to a 7-book grid.

---

## 7. Existing global UI — all in the shell, none owned by the hub

Everything below is mounted by `src/components/Layout.tsx`, i.e. **global, not
homepage**. A hub redesign does not need to rebuild any of it.

| Surface | Where |
|---|---|
| Top-left home (Mogzy hat) | `src/components/hud/GlobalHud.tsx` → `Link` to `LEAGUE_HOME_ROUTE`, `data-testid="hud-home"` |
| Guest "Sign up" chip | `GlobalHud.tsx`, `data-testid="hud-signup-chip"`; only when `isGuestUser(user)` |
| Top-right radio/player | `src/components/audio/AcademyRadioControls.tsx` (`variant="hud"`), inside `GlobalHud`'s right chip cluster. Transport: `src/lib/audio/academy-radio.ts`; controller `AcademyRadioController` is mounted in `App.tsx` above the router |
| Profile / notifications / settings / sign out | **One component:** `src/components/hud/MogzyIdentityMenu.tsx` — portrait button opens a panel with the notification inbox (Supabase realtime on `notifications`), plus a pinned footer with Settings (`/settings`) and Sign out |
| Bottom-left Community/Friends | `src/components/FloatingFriendsButton.tsx`, `fixed bottom-6 left-6 z-40`. Suppressed only on Stat Check surfaces (`showFriendsDrawer`); visible at every width. Realtime via `useSocialSync()` in Layout |
| Footer (About/Feedback/Privacy/Terms/Security/Contact) | `src/components/Footer.tsx` — sitewide, self-hides on gameplay routes (`/quiz`, `/admin`, etc.). **It does render on `/lol`.** |
| Other | `HextechAmbience` (LoL section only), `TutorialTipPopup`, `Toaster`/`Sonner` |

HUD order is fixed and DOM order **is** tab order: signup chip → radio → identity menu.

The second, larger radio surface — `AcademyRadioDock` — is *not* global; it is
part of the hub's broadcast centerpiece.

---

## 8. Below the fold (`/lol`)

Inside `<div className="max-w-7xl mx-auto px-4 py-6">` at the end of `LolHub.tsx`:

1. `<AdSlot placement="lol_hub_mid" />`
2. **Meta Reflex** section (`SHOW_SWIPE_GAMES = true`,
   `data-testid="lol-hub-meta-reflex-section"`) — header with `META_REFLEX_NAME`/
   `_TAGLINE`, "Stats" and "All games" links, then 4 compact `HexPanelLink` cards
   built from `LEAGUE_SWIPE_GAMES` (`src/lib/league-swipe/api.ts`) with a local
   slug→icon map. Titles/descriptions come from the shared catalog.
3. **News & Blog** — `useBlogList({ limit: 24, tag: "League of Legends" })`,
   `BlogPostCard` grid, "All posts" → `/blog`. Hidden entirely when empty.
4. Then the global `<Footer />` (About / Feedback / Privacy / Terms / Security / Contact).

**There is no About/help/community/social content on the homepage itself** —
only the global footer's six links.

---

## 9. Responsive / mobile

Two genuinely different layouts, split at Tailwind `md` (768px):

- **Desktop (`md+`):** `section` is `-mt-[var(--app-header-h)] min-h-[100dvh]`,
  full-bleed painting, 3-column grid `[1fr_minmax(200px,0.34fr)_1fr]`. Book
  columns are pushed outward (`mr-auto`/`ml-auto`), translated by
  `DESKTOP_BOOK_STACK_INSET` (`clamp(0px, (100vw-1200px)*0.5, 120px)`) and
  `BOOK_STACK_LIFT_CSS`. Centre lane holds the tome (pinned `top-3`) and Mogzy.
- **Mobile (`<md`):** background swaps to `academy-library-mobile.png`; the books
  are replaced by a single-column `HexPanelLink` list in `ALL_DESTINATIONS` order
  (row-major: Leaguecraft, Combat Lab, Stat Check, Archives, History, Patch,
  Pro Play), with the broadcast centerpiece (`variant="mobile"`) **after** them.
  Extra mobile-only sub-lines ("Welcome back, Summoner"); the randomized
  personal line is desktop-only. **No mascot on mobile at all.**
- **Tablet:** there is no tablet layout. 768px flips straight to the desktop
  composition; `academy-layout.ts` explicitly accepts that below ~860px width
  the title may brush the HUD cluster.

**A redesign must preserve (all covered by `academy-layout.test.ts`):**
`REGIME_BOUNDARY_VH = 1000` min()-crossover model (tall = width-driven,
short = height-fit, no breakpoint snap); `BOOK_HEIGHT_RATIO = 0.542`;
the 200px central-lane minimum; the title's three-way `min()` including the
HUD-clearance term; the `-mt-[var(--app-header-h)]` / padding-transfer trick
that keeps the painted pedestal's crop fixed across regimes.

---

## 10. Reusable design infrastructure

- **Shared components:** `BookModeCard`, `HexPanelLink`, `HexZipperCard`,
  `HexTrainingHero`, `SEOHead`, `AdSlot`, `BlogPostCard`, `AcademyRadioDock`/
  `Controls`, `MogzyIdentityMenu`, the whole `src/components/ui` shadcn set.
- **Animation:** `framer-motion` ^12.34.3; hand-written keyframes in
  `src/index.css` with a matching `prefers-reduced-motion` block;
  `useRevealSequence`/`cadence.ts`; `usePrefersReducedMotion`; `remotion` (video
  export only — not for UI).
- **Audio:** `src/lib/ui-sfx.ts` (`playUiSfx` — `appEnter`, `sectionOpen`,
  `navClick`, `primaryAction`; cold-load gesture guard built in),
  `src/lib/audio/academy-radio.ts`, `play-sfx.ts`, `mode-soundtrack.ts`,
  `audio-studio-runtime.ts`, `src/pages/welcome/tomeAudio.ts`.
- **Book assets:** `src/academy/hub/book-mode-frame.png` (destination card),
  `public/images/lol-hub/academy-broadcast-book.png` (centre tome, 1536×1024,
  2.6 MB), `src/academy/welcome/academy-book-spread.png` (downscaled derivative).
- **Academy visual assets:** `src/academy/hub/academy-library-{desktop,mobile}.png`,
  `academy-skyline.png`, `leaguecraft-studies.png`, `mogzy-archives.png`,
  `meta-reflex.png`, `ranked.png`, `src/academy/welcome/*`,
  `public/mascot/mogzy-mascot-base-v1.png`, `public/mascot/mogzy-hat.png`.
  **Note `mogzy-archives.png` and `leaguecraft-studies.png` already exist and are
  not used by the hub** — they were authored for destination art.
- **Responsive primitives:** `academy-layout.ts` (+ its test), the
  `--app-header-h` / `--app-viewport-h` tokens, `isFullBleed` in `Layout`,
  `[container-type:inline-size]` + `cqw` units inside `BookModeCard`.

---

## Risks & coupling

1. **Uncommitted work is in the audited state.** Pro Play (`ProPlayHub.tsx`,
   `ProPlayQuiz.tsx`, `src/lib/pro-play/`, the `pro-play` guide mode and the
   4th left-column book) exists only in the working tree of
   `cs2/phase2-combo-planner`. A redesign started from `main` will not see it.
2. **`hub-guide.ts` bubble geometry is hand-calibrated to the current grid.**
   Every `lean`/`bubble.x`/`bubble.y`/`yNarrow` value (especially `quiz-history`'s
   vw-interpolated `yNarrow: -36`) was tuned against today's card title positions.
   Moving or resizing cards silently invalidates all of it — nothing fails loudly.
3. **Two manually-synced destination lists.** `LEFT/RIGHT_DESTINATIONS` in
   `LolHub.tsx` and `HUB_GUIDE_MODES` in `hub-guide.ts`. Adding or removing a
   destination requires both.
4. **`BOOK_HEIGHT_RATIO = 0.542` is derived from the frame PNG's alpha bbox.**
   A new book art asset with different padding breaks every layout formula and
   the `academy-layout.test.ts` contract.
5. **The mascot's `bottom-[16%]` anchor and the `3.25rem` counter-offset wrapper**
   exist to keep Mogzy over the painting's pedestal while the stack above him
   moved. Any change to section padding moves him off his pedestal.
6. **The `<picture>` + 1×1-GIF pattern is load-bearing** (a real `src` causes a
   documented double download). Do not "clean it up".
7. **The hub does not own the HUD, radio controls, notifications, settings,
   sign-out, friends drawer or footer.** Adding homepage versions of any of
   these creates the parallel systems this audit exists to prevent.
8. **Column asymmetry is deliberate.** Pro Play was added to the left column
   (4/3) specifically to avoid restructuring the grid.

## Contradictions with the stated product assumptions

- **Stat Check is still a primary hub destination** (`/quiz/stat-check`, left
  column, Twisted Fate splash) — it must be removed from the hub AND from
  `HUB_GUIDE_MODES`. `Quiz.tsx:1466` also links to it, so it keeps a home.
- **Quiz History is a primary destination today** (`/lol/history`), but is not on
  the planned four. It needs a home inside Leaguecraft or it loses its front door
  — exactly the failure documented in the `SHOW_SWIPE_GAMES` comment.
- **LIVE1/Pro Play already exists as a hub book** but as *uncommitted* work.
- **"Graphs under Mogzy Archives" has nothing to place yet** — the only graph
  route is `/dev/graph1`, and `/lol/docs` (Archives) does not link to it.
- **Meta Reflex has a below-the-fold section on the homepage**, which sits
  outside the "Ranked/Daily/Mastery live inside Leaguecraft" hierarchy. Its
  header comment records that hiding it once left the feature with no front door.
- **Patch Reports appears twice**: as the central tome interaction AND as a
  destination book. The plan keeps the central interaction; the book's fate is
  undecided.
- **Mogzy Pro/Premium has no hub presence at all** today.
- **The homepage has no community/social/about area** — only the global footer.

## Recommended next design decision (not implemented)

**Decide what the destination set's data model is before touching any pixels.**
Specifically: collapse `LEFT_DESTINATIONS`/`RIGHT_DESTINATIONS`/`HUB_GUIDE_MODES`
into one destination registry, and decide the **4-destination geometry** — four
books cannot inherit the current 4/3 two-column composition, and that single
choice (2×2? a single arc? one hero + three?) determines whether
`academy-layout.ts`'s three-row fit slope, the 200px centre lane, the mascot
anchor and every `hub-guide.ts` offset survive or are recalibrated. Everything
else (entrance animation, "What's New", Pro promotion, below-the-fold community
area) is additive once that is settled.

## Next task

Design (not build) the 4-destination hub geometry and the destination registry
shape. Explicitly answer: where Stat Check, Quiz History, Patch Reports (book)
and Meta Reflex go; whether the centre lane keeps the tome + radio + Mogzy stack;
and what `academy-layout.ts` must be re-derived from.
