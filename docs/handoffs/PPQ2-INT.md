# PPQ2-INT — Premium Pro Play Arena

## Pass 2 — PPQ2-D statistical reveal integrated (current)

| | |
|---|---|
| Branch | `ppq2int/statistical-reveal` (worktree `C:\Users\mlmit\mogzy-wt\ppq2-int2`). Pushed as a feature branch only: not merged, not deployed, not published |
| Base | PPQ2-INT `6ab5eeb9` (= origin/main `bdf4bbf1` + PPQ2-C + PPQ2-INT pass 1) |
| PPQ2-D | Merged `--no-ff` from `9fc4d77c` (`082fb130`). Its commits `533ce803` / `9fc4d77c` are preserved. PPQ2-C's commits are shared history, not duplicated |
| Main today | `a59526b2` (Archives/SEO on top of the JATTN1 Journey work `0e37e621`). **Not merged in.** Checked by a throwaway trial merge (§2.4) |
| Route | DEV `/lol/dev/pro-play-arena` (live API by default; `?source=fixture`). `/lol/pro-play/quiz` is **not** switched |
| Status | **All gates pass. STOP for control-center review before the production route conversion** |

### 2.1 What changed

**Wiring** (`arena-run/composeProPlayArenaStage.tsx`), exactly as PPQ2-D §2 specifies:
- `buildProPlayReveal({options, reveal: projection.reveal})`. It is null until the server grades the question on the stage.
- Its `revealSlots` go through `proPlayAnswerSlots` into `regions.optionContent`, i.e. inside the canonical tablets.
- `ProPlayRevealFooter` takes the HUD row, with the existing action (Next / See results / Try again) in its `action` slot.
- Before the grade, the HUD row is a reserve (`data-pro-play-hud-reserve`) of the footer's ordinary height from `lg` (`lg:min-h-[3.25rem]`, the same class on the footer), holding the action slot.
- The composer now takes `action`; `ProPlayArenaRun`'s `revealSlots` prop is gone (the reveal comes from the projection).

**Visual fixes made at integration:**

| Issue | Fix | File |
|---|---|---|
| Stage jumps at reveal (PPQ2-D §7.1) | The HUD row reserves the footer height from the first frame | composer |
| 1024×768 plate clipped its chip row / crest (8–27 px on player plates, 2 px on competition plates; pre- and post-grade) | On a short desktop (`min-width:1024px and max-height:820px`) plates use `p-3` and the crest/shield shrink to 56 px | `ProPlayAnchorPlate.tsx` (PPQ2-C) |
| Footer taller than the reserve on long explanations at 1024 (`recent`, `tournament`: stage −18 px) | The scope label is capped at 13 rem below `xl` (it is also in the dossier, the plate and Source) | `ProPlayRevealFooter.tsx` (PPQ2-D) |
| Champion tablets grew by the value line at reveal (PPQ2-D §7.2; media −3…−11 px at 1280/1440) | `ProPlayRevealValueGhost`: the value's exact box, invisible, holds a champion tablet's cell from `lg`, so the value replaces it in place. Below `lg` the page scrolls and tablets stay compact | `ProPlayRevealValue.tsx`, `ProPlayOptionContent.tsx` |
| PPQ2-D's bottom-right "Your pick" clearances (`pr-12`, `lg:pb-2`) | Removed. On content tablets "Your pick" is already a top-edge tab (pass 1), so values use the full width | `ProPlayRevealValue.tsx` |
| Next landed under the app's floating Report pill on phones | Next has `scroll-margin-bottom` = dock clearance; it scrolls in when it is under that zone; both reduced-motion switches are honoured | `ProPlayArenaRun.tsx` |

**DEV only:** the fixture server gains labelled synthetic variants, `&evidence=partial|absent` and `&names=long`. Long names relabel choices, identities, evidence and the key together; the stem and the server explanation keep the real names. The badge names the variant.

### 2.2 Invariants (unchanged and re-proven)

- **Answer path.** The canonical grid is still the only one. `AnswerGrid.elimination` lists the same files as base (it fails on Windows only on path separators). Tests check that nothing interactive sits inside a revealed tablet and that there is one button per option.
- **Server order and values.**
  - For all 14 real payloads, each tablet's value equals the server's `display`, verbatim and in choice order.
  - The correct tablet is the server's `correct_answer`; "Your pick" is on the picked tablet only.
  - Partial evidence shows `—` for the missing option, never a guess. Absent evidence keeps the identity facts and the footer says so.
- **Nothing before the grade.** For all 14 payloads before grading there is no value node, no footer, and no distinctive display string anywhere in the DOM.
- **Recovery and the single publisher:** unchanged from pass 1. The suites re-run green, and the source guard still covers every arena-run and dev file.

### 2.3 Interaction and accessibility (real browser, 1440×900)

- Tab to a tablet, Enter → reveal; **focus moves to Next inside the footer**.
- The `role="status"` sentence reads: "Incorrect. You picked A, H4cker. The answer is B, Weiwei.".
- Shift+Tab → **Source**. Enter opens a `role="dialog"` with focus inside; it shows the metric, scope, form, revisions, definition, policy and the verbatim server note. **Escape closes it and returns focus to Source.**
- Under the app's Reduce Motion, every reveal node is `data-pp-reveal-motion="static"` with no animation delay (test). PPQ2-D's own suite covers the OS preference.
- The screen-reader "Statistics by option" list is present (sr-only while the tablets show the values).

### 2.4 Verification

| Gate | Result |
|---|---|
| Focused suites (PPQ2-B/C/D/INT: `components/pro-play`, `lib/pro-play/arena`) | **879 / 879**: PPQ2-D 208, PPQ2-C 94, PPQ2-B 239, INT 53 (arena-run), plus 285 in the other Pro Play component suites |
| Wider focused set (+ PPQ0C `lib/pro-play`, `ProPlayQuiz.test`, `CanonicalArena.questionSurface`, `regionsSeam`, `AnswerGrid.elimination`, `lib/feedback`, `components/report`, `question-surface`) | 1305 / 1313. The 8 failures are pre-existing: `AnswerGrid.elimination` ×2 (Windows separators), `QuestionMotifLayer` CRLF ×1, `feedback/contract` SQL ×5 |
| `tsc -p tsconfig.app.json` | the 2 pre-existing errors only |
| ESLint (changed files) | 0 errors (`react-refresh` warnings in preview files) |
| `vite build` | OK. No dev route, fixture, preview or reveal code in the production bundle (nothing in production imports the arena yet) |
| **Full suite, trial merge with current main `a59526b2` vs clean `a59526b2`** | **Failure sets identical**. Chunks lost to memory pressure, and 8 load-sensitive page tests that failed once (LobbyPreview analytics, PatchReports Catch-Up), were re-run sequentially: 107/107 on both. `pt2cProfileFrameAuthority` OOMs on both (environment). Files: `ppq2int/reveal/suite-trial-vs-main*.txt` |
| **Pixel/DOM harness, trial merge vs clean main** (`ppq2int-cert.cjs`, 15 states × 5 viewports: Ranked ×9, Daily-hosted, Journey ×2, question probe ×3) | **DOM identical 75/75**. Pixel-identical 63/75; the other 12 rows are only the Rules-dock mascot sprite (≈195 px) and the Friends button (≈1,050 px). The control (main vs main) has 15 such rows, at the same coordinates. Every Journey and question-probe row is pixel-identical |

**Compatibility with current main / Journey.**
- The trial merge of `a59526b2` is clean. The only file both sides touch is `src/App.tsx` (auto-merged: separate route lines).
- Main's JATTN1 Journey and Archives work changes none of the shared Arena files this branch changes (`arenaView.ts`, `CanonicalArena.tsx`, `AnswerGrid.tsx`, `InteractiveScenarioSurface.tsx`, `QuizAnswerOptions.tsx`).
- With both present, Journey arena states render byte-identical DOM and pixels.
- **No incompatibility found.** When this branch lands it should be merged onto main (not rebased), and the trial merge's result is the expected tree.

**Capture matrix** (`docs/handoffs/ppq2int/cap.cjs`; `ppq2int/reveal/shots/`, `ppq2int/reveal/probe.json`): 101 captures, **0 page errors, 0 probe violations** except the pre-existing 1024 x-overflow (1028/1024, every full-bleed arena). The probe checks plate clip, value under "Your pick" or a verdict icon, "Your pick" over text, footer x-overflow, stage clip, nested scrollers, layout movement pre→reveal, and Next position and focus.

| Viewport | Stage height (every case) | Footer height | Pre-grade reserve | Next |
|---|---|---|---|---|
| 390×844 | intrinsic (page scrolls) | 113–169 | 44 (the action) | in view above the dock (bottom ≤ 766), focused |
| 375×812 | intrinsic | 131–151 | 44 | bottom ≤ 734, focused |
| 768×1024 | intrinsic | 66–84 | 44 | in view, focused |
| 1024×768 | **552 constant** | **52** (incl. absent/partial) | **52** | 679, focused |
| 1280×800 | **584 constant** | 52 | 52 | 709 |
| 1440×900 | **684 constant** | 52 | 52 | 809–811 |

Cases:
- two-choice `champion_player` (player tablets) and `player_champion` / `recent` (champion pairs);
- four-choice `t1_lineage`, `flex`, `patch`, `pro_play`, `team_champion`;
- pre / selected (locked, awaiting the server) / correct / wrong / next;
- long names, partial and absent evidence, Source open;
- a **live API graded run** (`live-graded-pick{A,B}-*`) at 390, 1024 and 1440: production sessions, complete evidence, the server's own verdicts, footer 52 px, constant stage.

Desktop is stable across the transition at every size: question → reveal → next moves nothing but the answers region between a pair and a 2×2 (Q1 → Q2).

### 2.5 Changed files (vs PPQ2-INT `6ab5eeb9`, PPQ2-D's own new files excluded)

| File | Change |
|---|---|
| `src/components/pro-play/arena-run/composeProPlayArenaStage.tsx` | reveal wiring, footer in the HUD row, `REVEAL_FOOTER_MIN_H` reserve; takes `action` |
| `src/components/pro-play/arena-run/ProPlayArenaRun.tsx` | passes `action`; `revealSlots` prop removed; Next dock scroll margin and app reduce-motion |
| `src/components/pro-play/arena-run/ProPlayArenaRun.reveal.test.tsx` | new, 38 tests |
| `src/components/pro-play/arena/ProPlayAnchorPlate.tsx` (PPQ2-C) | short-desktop padding and crest/shield size |
| `src/components/pro-play/arena/ProPlayOptionContent.tsx` (PPQ2-C) | champion tablets hold a value ghost |
| `src/components/pro-play/arena/reveal/ProPlayRevealValue.tsx` (PPQ2-D) | shared class builders, `ProPlayRevealValueGhost`, Your-pick insets removed |
| `src/components/pro-play/arena/reveal/ProPlayRevealFooter.tsx` (PPQ2-D) | scope label `lg:max-w-[13rem] xl:max-w-[40%]` |
| `src/components/pro-play/arena/reveal/index.ts` | exports the ghost |
| `src/pages/dev/pro-play-arena/{fixtureTransport.ts, devParams.ts, ProPlayArenaDev.tsx}` | DEV evidence / long-name variants |
| `docs/handoffs/ppq2int/cap.cjs` | plate-clip, value-collision, footer and Source probes; `source` state |
| `docs/handoffs/ppq2int/reveal/**` | evidence (shots, probe, suite and harness results) |

No shared Arena file changed in this pass.

### 2.6 Open decisions and remaining work

1. **Timeline marker during a reveal (open presentation decision).** After the grade, the session's `answered` has advanced, so the canonical strip marks the graded node resolved and the next position current, while the answered question stays on stage until Next. This is server truth (PPQ2-B assumption 4), not a lag, and is **unchanged** here: the options are to keep it, or hold the marker on the revealed question as a presentation-only change. No server progression is altered either way.
2. **Completion summary.** It remains the neutral pass-1 panel (Q3 open).
3. **Tall fallbacks.** The reserve is the ordinary footer height only. A footer that needs more (an explanation over two lines at 1024, or PPQ2-C's plain-identity fallback with its visible list, ~204 px; no real payload produced it) takes the extra from the stage at the reveal. Only those questions pay it.
4. **Below `lg`.** The pre-grade reserve is the action only (44 px), and the phone footer is 113–169 px under the stage. The page scrolls (allowed), and Next is brought into view above the dock and focused.
5. **Support lines truncate** with `title` on 3–4-way tablets at 1024–1440 ("of 77 scop…"). The `display` value never truncates.
6. **Backend (PPQ1 Q4).** Explanations still carry "(authority revision n)", moved to Source by PPQ2-D, and round differently from `display`. Both are shown verbatim.
7. **PPQ2-D §7.5.** `revealSupportLine` is still a parity-tested copy of `ProPlayEvidence`'s private helper. It can become an import when the legacy page is retired.
8. **Next workstream (route conversion):** mount `ProPlayArenaRun` at `/lol/pro-play/quiz`, delete the page's own `usePublishReportableQuestion` in the same change, keep the 21 PPQ0A page tests as the bar, and add the route to Layout's full-bleed list. Worlds 2026 content and media are separate and not started here.

### 2.7 Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2-int2 log --oneline -6
# launch.json: "ppq2int2" :5278 (this branch), "ppq2int2-trial" :5279 (trial merge with main), "main-a59526b2" :5280
#   http://localhost:5278/lol/dev/pro-play-arena                      (live API)
#   http://localhost:5278/lol/dev/pro-play-arena?source=fixture&set=four&evidence=partial&names=long
PPQ_BASE=http://localhost:5278 node docs/handoffs/ppq2int/cap.cjs <out> t1_lineage:wrong,champion_player:source 390x844,1024x768,1440x900
CERT_BASE=http://localhost:5280 CERT_BRANCH=http://localhost:5279 node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff
```

---

## Pass 1 — Arena assembly (`ppq2int/arena-assembly` @ `6ab5eeb9`)


| | |
|---|---|
| Branch | `ppq2int/arena-assembly` (worktree `C:\Users\mlmit\mogzy-wt\ppq2-int`). Pushed as a feature branch only: not merged, not published |
| Base | origin/main `bdf4bbf1` (PPQ2-A + PPQ2-B), verified at start |
| PPQ2-C | Merged `--no-ff` from `1de127ef`. Its commits `5a880041` / `1de127ef` are preserved, and `ppq2c/premium-presentation` is untouched |
| Baseline tree | `C:\Users\mlmit\mogzy-wt\ppq2-int-base` (detached `bdf4bbf1`) |
| Dev servers | launch.json `ppq2int` :5276 and `ppq2int-base` :5277. Each sets `SWC_NATIVE_BINDING_CACHE`; node_modules is a junction to `ppq0c-int` |
| Route | DEV-only `/lol/dev/pro-play-arena`. The production `/lol/pro-play/quiz` route is **not** switched |
| Status | **All gates pass. STOP for control-center review** |

### 1. What it is

The real PPQ2-B controller and projection, drawn by PPQ2-C's pieces, inside `CanonicalArena`, through one composition layer:

| Region | Content |
|---|---|
| Media | `ProPlayAnchorPlate` (through `regions.media`) |
| Tablets | the canonical `QuizAnswerOptions` buttons with `ProPlayOptionContent` inside (`regions.optionContent`); `pair` + VS seam for 2 choices, `wide-2` for 3–4 |
| Left / right flank (desktop) | `ProPlayQuestionDossier` / `ProPlaySessionPanel` |
| Header | `Question n / N`; below `lg` also `· <server score> correct` (`titleDetail`) |
| HUD row | Next / See results while a reveal shows, Try again over an errored question, otherwise an invisible reserve of the same size |
| Timeline | PPQ2-B's canonical finite-plan strip |
| No question on stage | the arena's empty frame with a neutral panel: loading, error + Try again, or the end summary (server score, received verdicts only, Play again, Back to Pro Play) |

**Files.**
- `src/components/pro-play/arena-run/`:
  - `composeProPlayArenaStage.tsx`: the pure binding of data to presentation.
  - `ProPlayArenaRun.tsx`: takes a controller, so live and fixture runs share it.
- `src/pages/dev/pro-play-arena/`:
  - `ProPlayArenaDev.tsx`, `devParams.ts`.
  - `fixtureTransport.ts`: real frozen production payloads behind an in-memory stand-in for the quiz API. It plays the server's PPQ0A contract: replay with `replayed:true`, a 409 for another question's id, a 404 for an unknown session.

**DEV route.**
- `/lol/dev/pro-play-arena` defaults to the **live API** (`VITE_COMBAT_API_URL`, real guest sessions).
- `?source=fixture` gives a deterministic run. Options: `&set=default|two|four|<sample keys>`, `&latency=<ms>`, `&fault=start|answer`.
- A fixed badge labels **Live API · host** (green) or **Fixture · frozen payloads, simulated server** (amber), with a link to switch.
- It is registered under `import.meta.env.DEV` (like `/dev/arena-question-probe`), full-bleed in Layout. It sits under `/lol/` so it gets the `dark theme-lol` root classes every production arena route has (see §3).

### 2. Invariants preserved, and where they are proven

| Requirement | Mechanism | Evidence |
|---|---|---|
| Server-authoritative grading | Grades, score and verdicts come only from the projection; the fixture server grades on the "server" side of the transport | PPQ2-B suites (239) unchanged; integration tests |
| Exactly-once submission | PPQ2-B's ref gate; the only input is the canonical grid's `onSelectOption` | `ProPlayArenaRun.test`: a 3-click burst sends 1 request, naming `question_id` |
| Reveal persists until Next | The projection holds the answered question; Next is the only advance | test: still revealed after a wait; Next mounts Q2 clean |
| Report identity, single publisher | `CanonicalArena` publishes from `view.report` + `surface.reportRef`; nothing in arena-run or the dev route publishes | test: mode/category/sessionId/round/runtimeQuestionId, answer only after grading; source guard on 4 files |
| One answer-rendering path | Content goes INSIDE the canonical buttons; nothing interactive inside a tablet | test; PPQ2-C guard; `AnswerGrid.elimination` result identical to base |
| Answer safety | All-or-none symmetric content (PPQ2-C), no tablet state before the reveal | seam tests; PPQ2-C 94 tests |
| Accessibility | `aria-label` stays `"A. Label"`; the divider is `aria-hidden`; the reserve is `aria-hidden` and invisible; Next takes focus after a reveal when focus was stranded, and scrolls into view on phones; 44px controls below `lg` | tests + matrix (`activeTestId = pro-play-next`) |

### 3. Shared Arena changes (this workstream only)

1. **The PPQ2-C `regions` seam**, applied unchanged from `docs/handoffs/ppq2c/proposed-regions-seam.patch`:
   - `arenaView.ts`
   - `CanonicalArena.tsx`
   - `InteractiveScenarioSurface.tsx`
   - `AnswerGrid.tsx`
   - `QuizAnswerOptions.tsx`
2. **`ArenaHeaderView.titleDetail`** (`arenaView.ts`, `CanonicalArena.tsx`): drawn after the title **below `lg` only** (`data-testid="ranked-header-detail"`). It is absent for every existing mode.
3. **`QuizAnswerOptions`**: on a tablet that carries `optionContent`, "Your pick" is a gold tab on the top edge. Label-only tablets keep the bottom-right label byte for byte.
4. **`App.tsx` / `Layout.tsx`**: the DEV route and its full-bleed path.

The only PPQ2-C component change: below `lg` the compact tablets put the code chips beside the role/seasons line (`ProPlayOptionContent.tsx`, `COMPACT_FACTS`). It still drops whole chips only.

### 4. Visual defects found and resolved

| Defect | Root cause | Resolution | Measured |
|---|---|---|---|
| Faint Arena header title | The title is `text-muted-foreground/90`, near-white only under `.dark`. `/lol/*`, `/quiz/*` and `/combat-lab` force `dark theme-lol`; other paths follow the OS. The PPQ2-C preview and a `/dev/...` route render it dark-on-navy in a light-OS browser | The dev route lives under `/lol/`. Every production arena host (Ranked, Daily, Journey, `/lol/pro-play/quiz`) is already in the LoL section, so no shared CSS change was needed | Legible in every capture |
| Stage shrank when Next appeared | The HUD row is as tall as its control (Ranked always has Forfeit there) | Invisible same-size reserve on every frame | Stage height constant per viewport across all fixtures and states: 568.2 / 600.2 / 700.2 px at 1024 / 1280 / 1440 (was 736 → 696 at 1440) |
| Long header title under the app logo at 1024 | `Question n / N · s correct` widened the centred left block past the corner chip | The score moved to `titleDetail` (phone only); the desktop session panel shows it | Clear at 1024 |
| "Your pick" over the code row | An absolute bottom-right label vs a rich code row | Top-edge tab on content tablets | Probe overlap check: 0 in 94 captures |
| Phone tablet density | Facts and codes on two lines in a full-width single column | Codes share the facts line below `lg` | 4-choice tablets 79 → 62 px; stack 348 → 276 px |
| Next below the fold on phones | The page stacks below `lg` | `scrollIntoView({block:"nearest"})` | Next bottom ≤ viewport in all 36 phone/tablet captures |

### 5. Verification

**Full Vitest suite, candidate vs clean `bdf4bbf1`.**
- Same chunks, same toolchain, fresh process per chunk, `--maxWorkers=4`.
- Per-chunk test counts are equal except for the new tests.
- **The failure sets are identical** after one fix:
  - The `QuestionStageGeometry` "progress in ONE place" guard counts the string `ranked-header-title`. My first testid contained it, so it was renamed.
  - `LobbyPreviewPage.premiumAnalytics` and `TeamSimPage.phase5a` failed once on the candidate under load, then passed 74/74 on recheck on both trees.
- The remaining failures are pre-existing on both trees (CRLF source guards, `feedback/contract` SQL reads, etc.).
- `src/test/security/pt2cProfileFrameAuthority.test.ts` OOMs on **both** trees (worker heap) and is not runnable here.

**Focused suites:** Pro Play (`components/pro-play`, `lib/pro-play/arena`), `CanonicalArena.questionSurface`, `CanonicalArena.regionsSeam` and the live page's `ProPlayQuiz.test` (PPQ0A): **683/683**.

**New tests.**
- `arena-run/ProPlayArenaRun.test.tsx` (16): regions placement (2- and 4-choice), one answer path, nothing before the grade, the click burst, the reveal held until Next, report identity and the answer only after grading, no second publisher, Try again (answer, then start), completion and Play again, the fixture-server contract, DEV-route registration.
- `ranked-arena/CanonicalArena.regionsSeam.test.tsx` (8): an absent seam is inert; a present one lands inside the canonical structure; label fallback; Your-pick placement; `titleDetail`.

**`tsc -p tsconfig.app.json`:** the same 2 pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`).

**ESLint (changed files):** 0 errors. The warnings are `react-refresh` notes, pre-existing or in DEV files.

**`vite build`:** OK. The production bundle contains no dev page, fixture transport, fixture payloads or arena-run code. The only trace is the route string in Layout's full-bleed comparison, as PPQ2-A's probe left.

**PPQ2-A pixel/DOM harness on the shared seam** (`docs/handoffs/ppq2int/ppq2int-cert.cjs`).
- This is PPQ2-A's harness, plus the question probe with no regions and an asset disk cache.
- 15 states × 5 viewports, base :5277 vs candidate :5276. Clock and animations frozen.
- States: Ranked ×9, Daily-hosted, Journey ×2, and the question probe ×3 (4-choice, pair, long revealed-wrong).

| Run | DOM identical | Pixel identical (>24) | The rest |
|---|---|---|---|
| base vs candidate (`existing-callers-diff.json`) | **75/75** | 67/75 | 8 rows: only the Rules-dock mascot sprite (≈195 px at 1165,739 / 1325,839) and the Friends button (≈1,050 px at x≈24) |
| base vs base control (`control-base-vs-base.json`) | 75/75 | 64/75 | 11 rows: the same two noise classes at the same coordinates |

Every base→candidate delta is within the baseline's own run-to-run variance. Every Daily, Journey and question-probe row is pixel-identical.

**Screenshot matrix** (`docs/handoffs/ppq2int/cap.cjs`, `matrix-probe.json`, `shots/`).
- 15 cases × 375×812, 390×844, 768×1024, 1024×768, 1280×800, 1440×900, fixture mode:
  - two-choice: `champion_player`, `champion_team`;
  - four-choice: `t1_lineage`, `flex`, `patch`;
  - states pre / selected (locked, awaiting the server) / correct / wrong;
  - `default:next` (2-choice → 4-choice).
- Plus a **live API** pass (`live-*.jpg`, `live-probe.json`): real sessions, pre and graded, at 390 and 1440.
- Results: 94 captures, **0 page errors, 0 probe violations** except the pre-existing 1024 x-overflow (1028/1024, every full-bleed arena; PPQ2-A A5).
- No stage clip, nested scroller, panel clipping or Your-pick overlap. Flanks are hidden below `lg`.
- The only geometry note is `default:next` at 1440: the answers region grows 10px from a pair to a 2×2 inside a constant stage, so the media yields.

### 6. Changed-file inventory (vs `bdf4bbf1`, PPQ2-C's own files excluded)

| File | Change |
|---|---|
| `src/lib/ranked-core/arenaView.ts` | `regions` / `QuestionSurfaceRegions` (seam); `titleDetail` |
| `src/components/ranked-arena/CanonicalArena.tsx` | forwards `regions` (seam); renders `titleDetail` below `lg` |
| `src/components/question-surface/InteractiveScenarioSurface.tsx` | seam: `mediaNode`, `answerContent`, `answerColumns`, `pairDivider` |
| `src/components/ranked-arena/AnswerGrid.tsx` | seam: forwards content, columns, divider; `data-answer-layout="pair"` |
| `src/components/quiz/QuizAnswerOptions.tsx` | seam: `optionContent`, `columns:"pair"`, `pairDivider`; top-edge Your-pick tab on content tablets |
| `src/components/pro-play/arena/ProPlayOptionContent.tsx` | phone/tablet density (`COMPACT_FACTS`) |
| `src/App.tsx` | DEV-only `/lol/dev/pro-play-arena` |
| `src/components/Layout.tsx` | full-bleed path |
| `src/components/pro-play/arena-run/composeProPlayArenaStage.tsx` | new |
| `src/components/pro-play/arena-run/ProPlayArenaRun.tsx` | new |
| `src/components/pro-play/arena-run/ProPlayArenaRun.test.tsx` | new (16) |
| `src/components/ranked-arena/CanonicalArena.regionsSeam.test.tsx` | new (8) |
| `src/pages/dev/pro-play-arena/{ProPlayArenaDev.tsx, devParams.ts, fixtureTransport.ts}` | new, DEV only |
| `docs/handoffs/PPQ2-INT.md`, `docs/handoffs/ppq2int/**` | this handoff, harnesses, evidence |

### 7. Commits

`5d5e1a8c` (merge PPQ2-C) → `34723476` (seam) → `740ed8bd` (composition + DEV route) → `a318d225` (visual fixes) → `86212c19` (tests) → `9b756881` (dev params, testid, harnesses) → handoff + evidence.

### 8. Remaining work

**PPQ2-D (reveal):**
- Pass positional nodes to `ProPlayArenaRun`'s `revealSlots` prop. They are used only once `projection.reveal` exists, and they replace the tablet facts in place (PPQ2-C's shared cell), so the tablets never grow.
- Server data: `controller.projection.reveal.evidence` (`ProPlayEvidence`), `.explanation` (still internal copy, PPQ1 Q4), `.replayed`.
- Do not edit `arena-run/*` or the shared Arena files; ask this workstream for any seam change.

**PPQ2-E (route switch + completion):**
1. At `/lol/pro-play/quiz`, mount `<ProPlayArenaRun controller={useProPlayArenaController()} />`. Delete `ProPlayQuiz`'s own `usePublishReportableQuestion` in the **same** change, so the Arena stays the one publisher.
2. Add the path to Layout's full-bleed list. It is already in the LoL theme section.
3. Keep the SEO head and Back link.
4. The 21 PPQ0A page tests are the regression bar; port them to the arena DOM.
5. Remove the DEV route, or keep it for QA.

**Owner calls still open:**
- the end-summary tone (Q3; the current panel is neutral and provisional);
- the timeline marker during a reveal (it moves to the next position: server truth, PPQ2-B assumption 4);
- free vertical space in the dossier and session panels on tall desktops (PPQ2-C §8);
- player/team portraits and logos still need media keys in the quiz contract (PPQ1 Q6).

### 9. Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2-int log --oneline -9
# dev servers: launch.json "ppq2int" (:5276) and "ppq2int-base" (:5277)
# play:   http://localhost:5276/lol/dev/pro-play-arena            (live API)
#         http://localhost:5276/lol/dev/pro-play-arena?source=fixture
node docs/handoffs/ppq2int/cap.cjs <out> champion_player:pre,t1_lineage:wrong,default:next 390x844,1440x900
node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff      # then: control
```
