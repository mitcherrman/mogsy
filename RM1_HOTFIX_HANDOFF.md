# RM1 HOTFIX — viewport fit + ceremonial Player Columns

Continues `RM1_HANDOFF.md` (RM1 merged to `main` as `a61b3c4f`). This file covers
the post-merge hotfix only.

- **Branch:** `rm1/viewport-fit-hotfix`
- **Worktree:** `/Users/macmoney/mogsy-wt-rm1-fit`
- **Based on:** `origin/main` `58656c35`
- **Status:** implemented, focused tests green, NOT pushed.

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
- `src/components/ranked-arena` + `src/pages/quiz-ranked` — see below.

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
4. **The banner is CSS-only and unverified visually by Claude** (per the brief).
   Worth an eye: the chamfered shoulders at the narrowest column width, the
   sigil roundel's scale against each role mascot, and the 3.25rem point at
   `lg` where the columns are shortest.

## Next task

Owner visual pass in production. Nothing else is queued.
