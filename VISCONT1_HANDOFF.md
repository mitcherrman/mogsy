# VISCONT1 — Arena visual continuity (geometry certification)

Worktree `.worktrees/viscont1`, branch `viscont1/visual-continuity`. Committed locally; **not merged, not pushed, not published to Lovable, not rebased**.
- **Base:** `origin/main` @ `53159f2c`.
- **First pass:** `889dbd77`. The second pass, described here, is the commit on top of it.
- **Current `origin/main`:** `d35f56b5` (OF4 landed). OF4 overlaps `index.css`, the arena probe and the fit spec. The replay onto current main is a separate integration task; see "Integration".

Comparison trees. Each was measured with this branch's probe copied in uncommitted, so every tree goes through the same instrument:
- `.worktrees/viscont1-baseline` — detached at `53159f2c`, untouched CSS. It is kept, and its probe is restored to the committed file.
- A temporary detached worktree at `889dbd77` (the first pass). It was removed after measuring.

## Objective and final invariant
**CONTENT ADAPTS TO THE ARENA. THE ARENA DOES NOT ADAPT TO CONTENT.**

Within one arena mode at one viewport, changing the question or revealing it moves none of:
- the folio (top and bottom);
- the media region (top and bottom);
- the prompt top;
- the answer-grid top and the first tablet's top;
- the Module Rail.

This holds for every round the question bank can serve. That covers prompts up to its 188-character maximum (and the 192-character RA7 fixture) and option labels up to its 76-character maximum, in 2, 3 and 4-answer rounds. It also holds through settlement, the reveal hold and the next round's entrance, in one mount.

Long text never grows its box, re-centres the card or yields the art. It tightens inside its fixed box via deterministic type tiers, down to hard readable floors:
- answers 12px;
- prompt 15px on phones and 16px on desktop;
- the phone evidence line 11px.

The certification target was 0px movement; measured movement is ≤0.5px (rounding) at every fixture and viewport below.

This is an Arena-wide invariant, fixed at the shared geometry authority (`index.css` Question Stage, plus two classification attributes). There are no per-family, per-question, per-category or Daily-specific offsets, no measurement loops, and no ResizeObserver.

## Root causes
### First pass (`889dbd77`)
1. **Per-profile media regions.** QV1 gave cinematic and family cards a 17.25rem / 19rem media region, while compact cards kept 16rem.
2. **Content-centred stack.** The question was centred on its content height (`lg:my-auto`), so any content-height difference moved every anchor by half of it. At 1880×900 rich vs compact moved the art top −27.6px and the prompt and answers +20.4px; a reveal moved the stack 14.3px.
3. **Reserves not re-derived.** QV1's type and padding steps were never paid for in the prompt and answer reserves.
4. **Phone re-centring.** The phone (RMOB2) centred the question in a screen-tall card with no reserves. At 375×812 the answer grid ranged 361–466px.

### Second pass (this commit): the three residuals, plus two more found while fixing them
5. **Desktop long labels overflowed a fixed answer box.**
   - Two-line labels at 15px with QV1's 14–18px padding exceed every desktop answer box from about 26–36 characters.
   - Four stacked tablets (labels over 56 characters) are four rows.
   - The art yielded, and the prompt and answers moved up. Measured on the first pass, same probe:

     | viewport | realP99 | realMax | 76-character labels |
     |---|---|---|---|
     | 1880×900 | −37.9 | −53.9 | — |
     | 1280×800 | −56.6 | — | −161.4 |
     | 1024×768 | −44.5 | −146 | −146 |

6. **Phone prompts over four lines.** Prompts past four 18px lines overflowed the phone prompt box; the RA7 family fixture re-centred the card 25.7px.
7. **Phone reveal give-backs.** To stay one screen, the first pass gave back the reveal slot and a prompt line (on long-label rounds and phones under 780px tall), so those reveals re-centred about 12px. Even then, the 76-character-label and stressA rounds scrolled the 360×740 page 60–73px on the first pass.
8. **(New) The one-line evidence slot was too small.** It held only a one-line statement. The concise-evidence beat carries up to 96 characters (`MAX_STATEMENT_CHARS`), which wrap to two lines below 1500px wide and to three at 12px on a 360px phone.
9. **(New) The reveal icon stole label width.** On settlement the correct (or picked-wrong) tablet gains a check/cross icon as an in-flow flex child: 16px icon + 8px gap + 8px margin. That is 32px less label width at the instant the round resolves, so a two-line label wrapped to three. Measured: the answer box went 210 → 221px at 360×740 and the phone card re-centred.

## Final geometry contract
### Unchanged from the first pass
- **One media allocation per viewport for every profile:** 16rem, 17.25rem at ≥1024×861, 19rem at ≥1600×780.
- **No rule keyed on `data-band` may size anything** (test guard).
- **The reserve is seated, not the content.** `--qs-stack-h` = media + prompt + answers + 3 gaps + feedback slot, and a `::before` spacer of `max(0, (body − stack-h) / 2)` replaces the content-centring margin. This applies to the canonical quiz stack only (`body > * > .question-surface-stack`). Meta Reflex, Order Forge, Mastery and Journey are not matched.

### Text density (new)
- **`src/lib/question-surface/textDensity.ts`** classifies by character count only, from public text, before layout:
  - `answerDensity(labels)`, from the longest label;
  - `promptDensity(prompt)`.
- **`AnswerGrid`** publishes `data-answer-density`, and **`InteractiveScenarioSurface`** publishes `data-prompt-density`. Both are attributes only; every style is in `index.css`, scoped to the canonical stack.

**Answer tiers (longest label):**

| tier | chars | desktop (≥1024) | phone | why this bound |
|---|---|---|---|---|
| normal | ≤24 | unchanged (14/15px, QV1 padding) | unchanged (14px, 48px floor) | 24 is one line in every desktop column; 26 is where the 1280 and 1440 columns first wrap. Past servable p95 (17). |
| long | 25–40 | 14px / 1.35, 7px padding | 13px / 1.3, 6px padding | 40 is the last length that is two lines at 14px in the narrowest (1024) column; 44 goes to three. |
| dense | 41+ | **12px** / 1.25, 5px padding, 10px left inset; 3–4 answers 2-up | **12px** / 1.25, 6px padding, 10px left inset | Bank max 76: 3 lines from 1280, 4 at 1024, 2 on a 360px phone. At this type a stack of four is the taller layout. |

**Prompt tiers (characters):**

| tier | chars | phone | desktop | why this bound |
|---|---|---|---|---|
| normal | ≤110 | unchanged 18px / 1.45 | unchanged | Four 18px lines at 360 wide (the phone prompt box). |
| long | 111–150 | 16px / 1.3 | unchanged | Five lines in the phone box. |
| dense | 151+ | **15px** / 1.3 | **16px** / 1.35 at 1024–1279 only; unchanged from 1280 | Five lines at 15px up to the bank's 188 and the 192 fixture (measured 116.5 / 124px). |

Desktop prompt boxes seat the bank maximum at full size from 1280 up, so desktop prompt tiers are identity there.

### Reserve changes in this pass
- **1024 tier:** the prompt box goes 158 → 130px and the answer box 138 → 166px. Dense labels draw four lines (154px) in the 153px-wide 1024 column. The total is unchanged (296), so no art moves.
- **≥1280 (≤860 tall):** answers 120 → 128px (the dense 2×2 is 124px). The cinematic band there is capped at 26vh inside a 256px region, so this costs no art on any measured viewport.
- **Evidence slot** (`--qs-feedback-h`): two `text-xs leading-snug` lines (33px) below 1500px wide and on phones; one line (16.5px) from 1500px.
  - The evidence line takes exactly the slot (`min-height`), so a one-line statement cannot shorten a centred phone card.
  - On phones the line is drawn at 11px, so 96 characters stay within two lines.
- **Reveal icon:** in the canonical stage the tablet's check/cross is absolutely positioned in a 1.5rem right edge held on every tablet, so a label's width is identical before and after settlement.
- **Phone:** one fixed allocation on every phone (media 7.75rem, prompt 7.75rem, answers 13.125rem, 2-line slot; 515px). The first pass's give-backs (slot dropped for stacked-4 and <780px phones, 3-line prompt box under 780px) are **removed**.

### Minimum font sizes (hard floors, asserted in unit and browser tests)
- **Answer labels:** 12px (dense, desktop and phone).
- **Prompt:** 15px on phones (dense), 16px on desktop (dense, 1024–1279).
- **Evidence line:** 11px on phones; 12px elsewhere, as before.

## Art (what the second pass cost)
Cinematic band height (`abilityCost`), first pass → final:

| viewport | first pass | final | change |
|---|---|---|---|
| 1024×768 | 199.7 | 192.7 | −7.0 (two-line reveal slot) |
| 1280×720 | 187.2 | 182.7 | −4.5 |
| 1280×800, 1366×768, 1440×800, 1440×900 | — | — | unchanged |
| 1600×780 | 211.2 | 211.2 | unchanged (accepted QV1 trade-off) |
| 1920×800 | 231.2 | 231.2 | unchanged (accepted QV1 trade-off) |
| 1880×900, 1920×1080 | 304 | 304 | unchanged (full QV1 19rem) |

The accepted wide-but-short QV1 trade-off was not reopened.

## Before / after — the formerly failing long-text fixtures
Through the same probe. Each cell is media top/bottom · prompt top · answer-grid top (= first tablet top) · Module Rail top. Phones have no desktop rail.

The folio was identical in every case except two first-pass phone rows, which scrolled the page:
- 360×740: shape.76 (+73px) and stressA (+60px);
- 375×812: shape.76 (+4px).

**First pass (`889dbd77`)** — anchors moved:
- **1880×900:**
  - opts4 74.6/378.6 · 390.6 · 552.6 · 778.2.
  - realP99 74.6/340.7 · 352.7 · 514.7 (**−37.9**).
  - realMax, 76-character labels and stressA: 74.6/324.7 · 336.7 · 498.7 (**−53.9**).
- **1280×800:**
  - opts4 70.6/326.6 · 334.6 · 472.6.
  - realP99 278 / 416 (**−56.6**).
  - realMax and stressA 270.7 / 408.7 (**−63.9**).
  - 76-character labels 173.2 / 311.2 (**−161.4**).
- **1024×768:**
  - opts4 55/264.2 · 272.2 · 438.2.
  - realP99 227.7 / 393.7 (**−44.5**).
  - realMax, 76-character labels and stressA 126.2 / 292.2 (**−146**).
- **375×812:**
  - opts4 media top 163.9 · prompt 295.9 · answers 427.9.
  - realP99 128.9 / 260.9 / 392.9 (**−35**).
  - realMax 141.2 / 273.2 / 405.2.
  - 76-character labels 113.3 (scrolls).
  - stressA 115.4 / 247.4 / 431.
  - family 138.2 / 270.2 / 453.7 (**−25.7** at the top).
- **360×740:**
  - opts4 153.2 / 285.2 / 391.2.
  - realP99 115 / 247 / 359.4 (**−38**).
  - realMax 118.2 / 250.2 / 356.2.
  - 76-character labels and stressA scroll the page 60–73px.

**Final:** every fixture on identical anchors (spread 0.0px). Each row lists media top/bottom · prompt top · answers top · rail top:

| viewport | opts4, realP99, realMax, 76-char labels, stressA, family |
|---|---|
| 1880×900 | 74.6/378.6 · 390.6 · 552.6 · 778.2 |
| 1280×800 | 58.4/314.4 · 322.4 · 460.4 · 678.2 |
| 1024×768 | 55/247.7 · 255.7 · 393.7 · 646.2 |
| 375×812 | 155.7/279.7 · 287.7 · 419.7 · — (folio 104.3/722.1, no scroll) |
| 360×740 | 119.7/243.7 · 251.7 · 383.7 · — (folio 104.3/650.1, no scroll) |

Tiers drawn in those rows, from the probe:
- realP99 is dense answers with a long prompt.
- realMax and the 76-character labels are dense answers.
- stressA is dense answers with a dense prompt.
- family is a dense prompt.
- Type reached: 12px answers; 24 / 19 / 16 / 15px prompts by viewport.

## Residual movement at every hostile fixture
**0 (≤0.5px rounding) everywhere.** No pathological real-corpus string remains.

Certified by the browser spec at nine viewports: 375×812, 360×740, 1024×768, 1280×800, 1440×900, 1600×780, 1920×800, 1880×900 and 1920×1080.

**21 ordinary rounds:**
- compact / cinematic / family / Matchup / environment / jungle;
- 2 vs 4 options, icons vs none, premise vs option-media only;
- p90 labels (32 characters), realP99, realMax, the 76-character bank-max labels in 4 and 3-answer rounds;
- a long prompt (150) and the bank-max prompt (188) with long labels on rich art;
- stressA, stressB and family.

**Live in one mount, with the 96-character evidence line:**
- compact ↔ cinematic, single ↔ Matchup;
- premise ↔ option-media-only, 4 ↔ 2 options, icons ↔ none;
- family → champion → environment;
- normal → p99 → extreme labels + longest prompt.

**Elsewhere in the spec:**
- broken vs loaded assets;
- Stat Check (quiz ↔ Stat Check shell, and LVL 11 → none → LVL 20);
- Daily Standard / Review, Time Trial and Survival, hosted as `DailyRunPage` hosts them, live at 375×812, 1280×800 and 1880×900;
- the named 1880×900 rich → compact → rich hole;
- the three residual-defect regressions by name.

**Content bound:** the zero-movement guarantee is certified up to the bank's real maxima — 188-character prompts (the 192-character fixture tested) and 76-character labels. The synthetic `stress` probe (480-character prompt, 130-character options) is far beyond any real row. Like before, it still yields art and then scrolls the phone page (the RMOB2 "floor, never a lock" behaviour), and it is the fixture the fit spec now uses for that property.

## Tests
Run on Windows (vitest 3.2.7, Playwright Chromium) against this tree's Vite.

Port 8123, the arena config's default, belongs to another worktree's dev server (`of4-integration`), which I left alone. A throwaway config pointed `baseURL` at :5311 (this tree), :5312 (baseline) or :5313 (first pass).

| suite | this branch | comparison |
|---|---|---|
| `ranked-visual-continuity` (80 tests) | **80 passed** | untouched baseline `53159f2c`: see "Baseline differential" |
| residual tests vs first pass (`889dbd77`) | — | **7/7 fail** (answers overflow 39.5–72.3px, phone prompt 51.6–77.6px, phone answers 70px) |
| mutation: density tiers disabled, nothing else | — | **7/7 residual fail** |
| mutation: reveal slot sizing + icon edge + phone evidence type disabled | — | live reveal sequence **fails at 1024×768 / 1600×780 / 1920×800** (media edge moves 3.8–7.2px in the reveal beat); the phone residual-3 cases still pass under this mutation (their failure mode is covered by the density mutation) |
| `ranked-arena-fit` (391 tests) | **390 passed**, 1 failed | the failure, `RMOB2 compact phone HUD › is 40px tall`, fails identically on baseline (44px) |
| QuestionStageGeometry + textDensity | 90 passed, 3 failed | the 3 fail identically on baseline (CRLF source scans) |
| focused vitest set, 31 files* | **473 passed / 7 failed** | baseline 446 / 7; **identical failing set** (CRLF scans: QuestionStageGeometry ×3, DailyOnCanonicalArena.boundary ×2, AnswerGrid.elimination ×2) |
| `tsc --noEmit -p tsconfig.app.json` | 6 errors | **identical** to baseline, all in untouched files |

\* The focused set: AnswerGrid*, CanonicalArena*, DailyOnCanonicalArena*, QuestionStageGeometry, CompactScenarioBand*, InteractiveScenarioSurface*, ScenarioMediaBand*, QuizRankedMatch.{bottomInvariant, geometry, metaReflex*}, metaReflexModule.level, the shell probe, ItemAnalysisScenarioCard.scale, `lib/question-surface`, QuizAnswerOptions* and `pages/quiz-daily-challenge`.

A fit-spec edit was needed by this change, and it is not a weakening. `360x740 — below lg the arena is a FLOOR` asserted that `stressB` scrolls the phone. With density tiers stressB now **fits** one screen; it is held there by the one-screen matrix and the continuity spec. The floor property is now asserted on the synthetic `stress` probe, the only round still taller than the phone.

`pnpm build` was not run (it includes prerender). Nothing was deployed.

### Known baseline failures (not chased)
- HUD height (44 vs 40) at 360×800.
- 7 CRLF source-scan tests (Windows checkout).
- Port 8123 occupied by another worktree.

## Baseline differential
- **`ranked-visual-continuity` against untouched `53159f2c`** (same probe): **18 passed / 62 failed**. The failures:
  - every ordinary-matrix test and every live sequence at all nine viewports;
  - all nine Daily-ruleset tests;
  - the named QV1-hole test;
  - all seven residual tests.

  The 18 that pass are the broken-asset and Stat Check tests at each viewport, which were already stable on the base. The original defect is still caught.
- **Against the first pass `889dbd77`:** the seven residual tests fail (see Tests), so the second pass's fixtures reproduce exactly what it fixes.
- **Unit and type checks:** identical failing sets to baseline (see Tests).

## Changed files (second pass)
- `src/index.css` — text-density tiers (desktop, the 1024 prompt step, phone), the 1024 and ≥1280 reserve changes, the two-line evidence slot and its exact-height line, the reveal-icon edge, the phone evidence type, removal of the phone give-backs, and comments.
- `src/lib/question-surface/textDensity.ts` (new) + `textDensity.test.ts` (new) — the classifier and its bounds.
- `src/components/ranked-arena/AnswerGrid.tsx` — publishes `data-answer-density` (one attribute).
- `src/components/question-surface/InteractiveScenarioSurface.tsx` — publishes `data-prompt-density` (one attribute).
- `src/components/ranked-arena/QuestionStageGeometry.test.tsx`:
  - MEASURED and per-tier tables re-derived;
  - slot, scoping and phone tests updated;
  - a new "long text tightens inside its box" block (attributes, floors, scoping, the 1024 rebalance, the out-of-flow reveal icon).
- `e2e/ranked-visual-continuity.spec.ts`:
  - long text in the ordinary set, four new viewports, live sequences with 96-character evidence, the Daily rulesets;
  - the three residual regressions by name;
  - fit/floor/clipping assertions per round.
- `e2e/ranked-arena-fit.spec.ts` — the floor test now uses `stress` (see Tests).
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` (dev only):
  - `q=shape&alen&acount&plen&rich`, also usable in `?seq=` as `shape.N.K.M.R`;
  - `?evlen=N`;
  - `?ruleset=time_trial|survival|standard`;
  - `?host=daily`.
- `VISCONT1_HANDOFF.md`.

No production component's layout was refactored. `QuizAnswerOptions` and the 56-character `wideTwoColumn` rule are unchanged; the dense 2-up is stylesheet-side and scoped to the canonical stage.

## Journey (read-only)
**Untouched.** No Journey component, selector or contract is in the diff; `index.css` mentions Journey only in comments.

`/dev/journey-arena?capture=zed&step=1..8` measures **byte-identically** on baseline and this branch at 1880×900, 1280×800 and 375×812. That covers the folio, board, question box, prompt, answers, tablet font/padding/width and the rail.

Every VISCONT1 rule requires `body > * > .question-surface-stack`; Journey's stack sits inside `.journey-viewport`. `AnswerGrid` now also publishes `data-answer-density` inside Journey; it is an unstyled attribute there.

## Stat Check / Daily / modes
- **Stat Check:** LVL 11 → none → LVL 20 is still 0px at every viewport in the spec (the SC-RENAME3 figures), and quiz ↔ Stat Check share the shell.
- **Daily and rulesets:** Daily is `ArenaShell` + `QuizRankedMatch` → `CanonicalArena`. Time Trial, Survival and Standard / Review were each certified as their own mode through the hosted path (`?host=daily&ruleset=…`) with a hostile live sequence. Review plays the Standard ruleset in the same arena.

## Cleanup
- The two dev-server entries this work had added to the **main checkout's untracked** `.claude/launch.json` (`viscont1` and `viscont1-base`) were removed. Only those: 11 → 9 configurations, nothing else touched.
- Scratch scripts were deleted; no other main-checkout change.

## Integration (what still blocks it)
1. **OF4 overlap.** `origin/main` is at `d35f56b5` (OF4), which overlaps `src/index.css`, the arena probe (`RankedShellProbe.tsx`) and the fit spec. This branch was **not** rebased (as instructed). Replay it on a dedicated integration branch, then re-run:
   - `ranked-visual-continuity`;
   - `ranked-arena-fit`;
   - QuestionStageGeometry;
   - the Journey harness comparison.
2. **Port 8123.** It is occupied locally by another worktree's Vite, so `playwright.arena.config.ts`'s `reuseExistingServer` would test the wrong tree. Free it before running the arena specs with the stock config.
3. **Live QA on real Ranked and Daily matches** (desktop and phone, several reveals) is still worth doing. The probe serves backend-shaped envelopes through the production controller, but not live content.

## Commit
See `git log -1 viscont1/visual-continuity`.
