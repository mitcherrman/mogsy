# RM1 HOTFIX — viewport fit + ceremonial Player Columns

Continues `RM1_HANDOFF.md` (RM1 merged to `main` as `a61b3c4f`). This file covers
the post-merge hotfix only.

- **Branch:** `rm1/viewport-fit-hotfix`
- **Worktree:** `/Users/macmoney/mogsy-wt-rm1-fit`
- **Based on:** `origin/main` `58656c35`
- **Commit:** `c93045e8` (one commit, NOT pushed)
- **Status:** implemented; focused tests green; typecheck clean of new errors.

## Objective

1. **Fix the viewport-fit regression.** The full Match Shell — Match Header,
   both Player Columns, Question Stage, Module Rail — must fit one desktop /
   laptop viewport with **no document scrolling**.
2. **Push the Player Columns further** toward ceremonial medieval/magical
   banner standards, without clutter and without changing what they contain.

## Approved decisions (carried forward, unchanged)

- Large centred timer in the Match Header; Floating pointed Player Columns;
  module-history bubbles inside them; strong central parchment Question Stage;
  existing Module Rail concept; dark academy / Leaguecraft / Mogzy style.
- Terminology: **Match Header · Player Columns · Question Stage · Module Rail ·
  Match Shell.** Never "side cards".
- Player Columns: **no hanging rod, no large academy crest, no bottom slogan.**
  The role mascot stays the dominant identity element. Contents unchanged.
- Fit may NOT be bought with `overflow: hidden`, a cropped point, a hidden
  Module Rail, a shrunken timer, or a one-resolution hardcode.

## What caused the height overrun

Nothing in the arena ever stated a height budget, so nobody was doing the
arithmetic. Measured at 1440 wide:

| band | height |
| --- | --- |
| shell `pt-1` | 4px |
| chrome title row (`arenaHeaderRowClass`, `lg:min-h-8`) | 32px |
| shell `lg:gap-1` | 4px |
| **Match Header** (`CentralStage` 52 + 2 + 14, `py-1.5`, 2px border) | **82px** |
| `lg:gap-2` ×3 | 24px |
| **Question Stage** reserve at 1280–1499 | **566px** |
| HUD row (ability dock 76 + gap 6 + 36px status line) | 118px |
| **Module Rail** (1px rule + 0.4rem + 3.4rem viewport) | 62px |
| shell `pb-2` | 8px |
| **total** | **~900px** |

`ArenaShell`'s `lg:min-h-[var(--ranked-stage-h)]` is a deliberate **floor, not a
cap**, and `.ranked-question-stage`'s `min-height` was a fixed sum of its own
tallest-content reserves. The two were never compared, so on any viewport under
~900px the shell simply grew and the page scrolled. RM1 Pass 2B's larger header
added ~26px to an overrun that already existed — it made it visible, it did not
create it.

## What changed

### 1. The budget is written down (`src/index.css`, `.ranked-shell`, `lg`+)

`--ranked-chrome-h` — the measured sum of every band that is NOT the Question
Stage, one named term per line. `--qs-avail` = `--ranked-stage-h` minus it.
`lg`-only: below `lg` the arena deliberately stacks taller than any phone.

### 2. One region yields, and only one (`.ranked-question-stage`, `lg`+)

```
--qs-media-fit: calc(var(--qs-avail) - borders - padding - gaps - prompt - answers)
--qs-media-h:   clamp(7.5rem, var(--qs-media-fit), 16rem)
--qs-media-max: same expression
```

- On any viewport that could already seat the shell, `min()` picks the declared
  16rem and **the stage renders at exactly the height it always did**.
- On a short viewport the media band — art, with a declared aspect and a cap it
  already honoured — gives the height back. The prompt and answer reserves are
  **untouched at every height**: squeezing those wraps a question or moves the
  answer tablets' origin, the one coordinate the stage exists to pin.
- Result: the shell fits down to a **~760px viewport at 1280 and up**.

### 3. Match Header and HUD tightened (`CanonicalArena.tsx`)

- Header strip `py-1.5` → `py-1` (−4px). `min-h-[4.25rem]` and the large timer
  are untouched — the timer grows inside the header, not the header around it.
- HUD status line `min-h-[2.25rem]` → `min-h-[2rem]` (−4px): `line-clamp-2` of
  `text-xs` is exactly two 16px lines, so 4px of it was unreachable. Still a
  reserved box, so a status swap still moves nothing.

### 4. Player Columns → ceremonial standards (`.ranked-banner`)

Silhouette and material only; no markup change, no new ornament.

- **Silhouette:** five-sided → **seven-sided**. Chamfered heraldic shoulders at
  the head (`--banner-head` / `--banner-shoulder`), and the lower taper from
  `2rem` to **`3.25rem`** — a spear-point, not a notch. Still reserved in the
  column's `padding-bottom`, so no content can be seated inside it.
- **Trim:** `--banner-edge-w` 2px → **3px**, and the gold gradient now brightens
  markedly into the tip, like a metal-shod standard.
- **Material:** the face gained a centre **fold** highlight, a repeating
  low-contrast **drape**, and a deeper field — velvet/tapestry depth with
  nothing that says anything.
- **Sigil:** the role mascot now sits on a heraldic **roundel** (dark charge
  field, one thin gold ring), painted in `[data-testid="role-crest"]`'s own
  background layer — no markup, no click target, no clipping of the lunge the
  crest reserves room for. The ring takes the outcome colour.
- Narrow viewports keep the silhouette at a smaller scale, as before.

Preserved: no rod, no crest, no slogan; mascot dominant; mascot, identity/role,
points, module-history bubbles and the state pill all untouched.

## Files changed

| File | Change |
| --- | --- |
| `src/index.css` | `--ranked-chrome-h` / `--qs-avail` budget; elastic `--qs-media-h`/`--qs-media-max`; `.ranked-banner` rewritten as a ceremonial standard; sigil roundel on the crest. |
| `src/components/ranked-arena/CanonicalArena.tsx` | Header strip `py-1`; HUD status reserve `2rem`. |
| `src/components/ranked-arena/QuestionStageGeometry.test.tsx` | Length evaluator rewritten (`calc`/`min`/`max`/`clamp`, `+ - * /`, nested `var()`); `--qs-avail` injected from the parsed chrome budget; new `the whole Match Shell fits the viewport it is given` suite. |

## Tests run

- `QuestionStageGeometry.test.tsx` — **45/45 pass**, including the pre-existing
  MEASURED stage identities (unchanged at a tall viewport) and the new fit
  assertions at 1280×800, 1280×760, 1440×800, 1512×820, 1512×900, 1920×1080.
- `src/components/ranked-arena` + `src/pages/quiz-ranked`, run serially
  (`--no-file-parallelism`) — **74 files / 873 tests, all pass.**
- `tsc --noEmit` — 13 pre-existing errors, **none in any file this branch
  touches** (admin, combat-lab team-sim, community, feedback, pglite).

## Follow-up pass — the fit invariant closed below 1280

The first pass left two gaps the owner rejected: `<760px` height fell back to
page scrolling, and ~1024×800 still overflowed by ~30px. Causes:

1. **The budget was wrong, not merely tight.** `--ranked-chrome-h` charged a
   flat 82px for the ability dock. The arena mounts that dock only for a mode
   that publishes an `abilityHud` — which Ranked does only on a **progression**
   match. A Ranked points match (the RM1 banner shell) was being billed for a
   band that is not on its screen. That alone was most of the 1024 shortfall.
2. **Chrome air.** The chrome title row reserved `lg:min-h-8` for one 28px text
   line; the band gaps were `gap-2`; the central display's reserved box was
   `3.25rem` around 48px digits.
3. **The media floor was arbitrary.** 7.5rem was picked for its arithmetic, not
   measured against anything.

Corrections, all taken from chrome and reserved air — **zero from question
content**, and the banner geometry untouched:

| | change | recovers |
| --- | --- | --- |
| dock term | `--ranked-dock-h`, 0 by default, 5.125rem only under `.ranked-shell[data-ability-dock="true"]`; `CanonicalArena` publishes the `abilityHud` fact it already branches on | **82px** on a points match |
| title row | `lg:min-h-8` → `lg:min-h-7` (the row holds one 28px line — this is the geometry the row was always documented as having) | 4px |
| band gaps | `lg:gap-2` → `lg:gap-1.5`, ×3 | 6px |
| display box | `CentralStage` `min-h-[3.25rem]` → `min-h-[3rem]`. **The timer's own scale is untouched** (`text-4xl`/`sm:text-5xl`/`min-[1500px]:text-6xl`, `leading-none`) and is now asserted | 4px |
| media floor | 7.5rem → **4.5rem = 72px, the compact plate's own intrinsic height** — the shortest band the corpus actually ships, so at the floor the region is a real band, not cropped art | 24px |

**Resulting chrome:** 230px without the dock, 312px with it.

**Fit envelope** (minimum viewport height at which the shell seats whole):

| width | Ranked points match | progression match |
| --- | --- | --- |
| 1024–1152 | **660px** | 742px |
| 1280–1440 | **616px** | 698px |
| 1512–2560 | **628px** | 710px |

Covered by geometry tests as a **grid**, not a handful of laptops: widths
1024 · 1152 · 1280 · 1366 · 1440 · 1512 · 1680 · 1920 · 2560 × heights
660 · 678 · 700 · 720 · 768 · 800 · 864 · 900 · 1080 · 1440 (points), and
746 · 768 · 800 · 864 · 900 · 1080 · 1440 (progression).

Also asserted: the prompt and answer reserves are **height- and dock-
independent at every combination**, the dock term is exactly 82px and is
charged only when mounted, and every pre-existing MEASURED stage height is
reproduced exactly on a tall viewport.

**Honest limit:** below those heights the page scrolls rather than cropping.
The floor is arithmetic, not a choice — at 1024 wide the prompt and answer
reserves alone are 288px of the 426px minimum stage, and cutting those is the
one thing that would crush question content.

## Risks / manual verification

1. **The chrome budget is a measured constant.** If a band's height changes, the
   term in `--ranked-chrome-h` must change with it. The geometry test parses the
   token, so a *wrong* total still fails loudly; a stale one does not.
2. **Below 1280 wide on a short viewport** (e.g. 1024×800) the taller prompt and
   answer reserves mean the shell can still exceed the viewport by ~30px. That
   window is a narrow desktop window, not a laptop default.
3. **The Daily Challenge shares this arena** and has slightly different chrome,
   so its budget estimate is conservative rather than exact. Effect is limited
   to the media band's height on short viewports.
4. Below the fit envelope above, the shell still grows the page. Closing that
   would mean cutting the prompt/answer reserves below their measured content.
5. **The banner is CSS-only and unverified visually by Claude** (per the brief).
   Worth an eye: the chamfered shoulders at the narrowest column width, the
   sigil roundel's scale against each role mascot, and the 3.25rem point at
   `lg` where the columns are shortest.

## Next task

Owner visual pass in production. Nothing else is queued.
