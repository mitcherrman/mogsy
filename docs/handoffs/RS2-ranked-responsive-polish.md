# RS2 — Ranked Responsive Polish & Hardening

## Objective
Responsive polish and resilience for the design-locked Ranked match, on top of
RS1's structural safety. Preserve the owner's ~1878×797/800 appearance.

## Baseline
- `origin/main` = `959bb6c19788a678a66fc924d0627c8ea37fb1bc` (RS1 merge), unchanged at fetch.
- Branch/worktree: `rs2/ranked-responsive-polish` at `../mogsy-wt-rs2`.

## Supported viewport contract
- **Minimum supported desktop Ranked viewport: 1024×768.** Every shape must meet
  the full geometry contract there and above.
- Below `lg` (1024 wide): stacked layout, its own contract (scrolls by design).
- Desktop widths under 768 tall (e.g. 1024×700) are outside the contract:
  locked, no page scroll, Module Rail on screen — but the longest rounds may clip
  one tablet. Encoded as a boundary probe in `e2e/ranked-arena-fit.spec.ts`.
- No user-facing "unsupported resolution" UI.

## Stress fixtures (probe states)
Built at real corpus bounds: prompt max 188 chars (QuestionStageGeometry corpus
audit), longest real option labels 63 chars (`realMax`).
- `?q=stressA` — 188-char item prompt + 4 × longest labels + cinematic Item Analysis art.
- `?q=stressB` — 188-char Combat Calculation prompt + 4 × longest labels + family band.

## Status: COMPLETE — approved and merged to `main`

## Audit measurements (before, current main)
Matrix: 1920×1080, 1920×800, 1878×797, 1878×800, 1600×900, 1600×800, 1600×780,
1600×779, 1599×800, 1440×900, 1366×768, 1280×720, 1024×768, 1024×700 ×
media, family, realMax, realP99, short, metareflex, stressA, stressB.

**Supported contract: 103/104 rows geometry-clean** (13 viewports × 8 shapes; 108/112 including 1024×700). One cosmetic defect:
1024×768 stressB — the family band has a 22px minimum inside a 13px media region,
spilling 9px into the stack gap. Answers are fully seated.
Below contract: 1024×700 realMax/stressA/stressB clip 1 tablet (expected).

Key rows (stage h / media region / prompt px·lines / answers h / tablet pad):

| viewport | shape | stage | media | prompt | answers | pad |
|---|---|---|---|---|---|---|
| 1878×797 | media | 512 | 188 | 24·2 | 142 | 18 |
| 1878×797 | stressA | 512 | **38** | 24·4 | 280 | 18 |
| 1878×797 | realMax | 512 | **50** | 24·2 | 280 | 18 |
| 1920×1080 | stressA | 795 | 301 | 24·4 | 280 | 18 |
| 1600×900 | stressA | 615 | 121 | 24·4 | 280 | 18 |
| 1440×900 | stressA | 627 | 189 | 19·3 | 248 | 14 |
| 1366×768 | media | 495 | 205 | 19·2 | 120 | 8 |
| 1366×768 | stressA | 495 | 125 | 19·3 | 200 | 8 |
| 1280×720 | media | 447 | 157 | 19·2 | 120 | 8 |
| 1280×720 | stressA | 447 | 77 | 19·3 | 200 | 8 |
| 1024×768 | media | 495 | 160 | 19·2 | 137 | 8 |
| 1024×768 | stressA/B, realMax | 495 | **13** | 19·3–4 | 284 | 8 |

## Screenshots reviewed
`.rs2/shots/<viewport>-<shape>.png` and `.rs2/montage-<viewport>.png` (local,
uncommitted) for 1878×797, 1366×768, 1280×720, 1024×768 × 8 shapes. Rules popover
dismissed before capture.

## Visual findings
- **1366×768:** good. Hierarchy intact, cinematic art ~200px and legible, prompt
  19px, answers roomy. Stress A still shows a readable 125px band.
- **1280×720:** good for ordinary rounds (art 157px). Stress A/B art 72–77px:
  small but still reads as a band. Prompt/answers fully readable.
- **1024×768:** safe; ordinary rounds fine. On realMax/stressA/stressB the media
  region is 13px, leaving a **decorative sliver** (a thin dark bar / grey pill)
  above the category line — visually noise. Player Column names truncate
  ("T…", "M…") — existing Player Column design, out of scope.
- **1878×797 (reference):** ordinary shapes match the approved look. Long-label
  shapes (realMax, stressA/B) squeeze art to a **38–50px sliver** because the
  wide override's 18px tablet padding × 4 single-column rows costs 80px.

## Seam findings
Both seams are the same gate (`min-width:1600px and min-height:780px`) toggling
four declarations at once. Per-declaration cost, measured:

| declaration | below → above | height effect |
|---|---|---|
| answer padding | 8px → 18px | +20px per tablet row: +40 (2×2), **+80 (1-col ×4)** |
| prompt type | 21px/30.45 → 24px/32.4 | +2px/line, and can add a wrapped line (family, stressA/B: 3→4 lines, +39px) |
| hero ceiling | ≈202–208px → min(19rem,100%) | none while region-bound (all 800-tall cases) |
| band aspect | 16/7.5 → 16/8 | none while region-bound |

**1599×800 → 1600×800** (stage 515 both): media: media 213→191, family 213→185,
realP99 189→149, short 213→198, realMax 133→53, stressA 133→41, stressB 133→41.
**1600×779 → 1600×780** (stage 494→495): media 192→171, family 192→165,
realP99 168→129, short 192→178, realMax 112→33, stressA 112→21, stressB 112→21.
Meta Reflex: no change on either seam.

The discontinuity is driven almost entirely by **answer padding**, then prompt
type. Ceiling and aspect are inert at these heights.

## Is continuous scaling justified?
**No, not for type or padding** under the reference-lock constraint:
- The reference (797/800 tall) must keep 18px padding / 24px prompt. A ramp that
  ends at 780 moves the cost onto 680–779 heights (e.g. 1600×760 realMax media
  would fall from 93px toward ~15px) — it smooths the step by making smaller
  screens worse.
- A ramp that ends above 800 changes the reference.
- Width is not the driver (1599 vs 1600 at the same height is the same step), so
  a `vw` clamp buys nothing.
Keeping the step is preferable; documented rather than converted.

## Approved changes — implemented
### 1. Suppress unusably short rich media
- Probed at 44/48/52/56/64px (1878 wide, Stress A cinematic + Stress B family;
  crops in `.rs2/thresh/`). Item Analysis was not useful even at 64px; Combat
  Calculation names were clipped at ≤48px and barely legible at 52–56px.
- **56px is a conservative suppression threshold, not a proven universal
  readability boundary.** It eliminates every observed sub-56px sliver/spill
  (13–50px) while leaving the next measured supported rich-media cases (72px and
  up, e.g. 1280×720 Stress B) untouched. Not tuned further.
- CSS only: under the lock, the cinematic/family media region is a size container
  (`container: qs-rich-media / size`); `@container qs-rich-media (max-height:
  55.98px)` sets the band `display: none`. The region keeps its height (set by
  `height` + flex, never content), so prompt/answers do not move; parchment shows
  through. Compact plates and Meta Reflex are not selected.
- Not covered by design: the **compact** plate still renders a 13px sliver at
  1024×768 realMax (compact is a separate presentation, out of scope).

### 2. Layout-aware answer padding (scope-corrected)
- `AnswerGrid` renders `data-answer-layout="grid" | "stacked"` (from
  `wideTwoColumn`, the only source of truth) and `data-answer-count`.
- Wide override (≥1600×780): 18px stays the default; **stacked + four answers**
  uses 8px. A 2×2 four-answer grid and a two-answer stack keep 18px.
- Scope correction: the first RS2 commit also gave the two-answer `short` card
  8px (art 195→210 at 1878×797). Corrected — `short` is back to pre-RS2 geometry
  and 18px at every viewport.

### No clamp() introduced; 1600×780 gate, prompt type, shell/grid, columns, rail, header unchanged.

## After measurements (art/media region height, px)
| case | before | after |
|---|---|---|
| 1878×797 ordinary cinematic (`media`) | 188 | **188** (pixel-identical) |
| 1878×797 longest stacked (`realMax`) | 50 | **130** |
| 1878×797 Stress A / B | 38 / 38 | **118 / 118** |
| 1600×800 Stress A / B | 41 / 41 | **121 / 121** |
| 1280×720 Stress A / B | 77 / 72 | 77 / 72 (already 8px there) |
| 1024×768 Stress A | 13px sliver | region 13, **band suppressed** |
| 1024×768 Stress B | 22px band spilling 9px | region 13, **band suppressed, no spill** |

Seams (Stress A; realMax in brackets):
- 1599→1600×800: before 133→41 [133→53]; **after 133→121 [133→133]**.
- 1600×779→780: before 112→21 [112→33]; **after 112→101 [112→113]**.

Whole matrix (14 viewports × 8 shapes), after the scope correction: **87/112 rows
pixel-identical** to pre-RS2. Identical everywhere: media, family, realP99, short,
Meta Reflex. Changed: only four-answer stacked rounds (realMax, stressA/B) at
≥1600×780, plus the suppressed 1024×768/700 Stress A/B bands. Supported contract: 104/104 clean
(the only non-ok rows are 1024×700, below contract).

## Screenshots reviewed (after)
`.rs2/shots/` + `.rs2/after-montage.png`: 1878×797 media/realMax/stressA/stressB,
1600×800 stressA, 1280×720 stressB, 1024×768 stressA/B. Long-label rounds at the
reference now show real, recognisable art; 1024×768 Stress A/B show clean
parchment above the prompt.

## Files changed
- `src/index.css` — rich-media suppression container query; wide answer padding 8px for stacked four-answer layouts only.
- `src/components/ranked-arena/AnswerGrid.tsx` — `data-answer-layout`, `data-answer-count`.
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` — `stressA`, `stressB` probe states.
- `e2e/ranked-arena-fit.spec.ts` — stress shapes, 1024×768 contract doc, 1024×700 boundary probe, media-spill assertion.
- `docs/handoffs/RS2-ranked-responsive-polish.md`.

## Tests (final, after scope correction)
- Arena fit suite (`playwright.arena.config.ts`): **173 passed, 0 failed**.
- Media-spill assertion with suppression disabled (`1024x768.*Stress B`): 1 failed — it catches the defect.
- Focused vitest (`ranked-arena`, `question-surface`, `quiz`, probe, `lib/question-surface`): 1502 passed, 1 failed — `LeaguecraftRecord.vellum.test.tsx` "draws only from Ranked art already committed here", which fails identically on a clean main tree; unrelated.
- `npm run build`: passes.

## Unresolved observations
- Compact plate still renders a 13px sliver at 1024×768 realMax (compact is out of RS2 scope).
- Player Column name truncation at 1024 wide (out of scope).
- `scenario-compact` internal overflow (~55px) at all viewports, pre-existing.
