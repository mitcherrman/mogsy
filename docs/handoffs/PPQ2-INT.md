# PPQ2-INT — Premium Pro Play Arena assembly

| | |
|---|---|
| Branch | `ppq2int/arena-assembly` (worktree `C:\Users\mlmit\mogzy-wt\ppq2-int`). Pushed as a feature branch only: not merged, not published |
| Base | origin/main `bdf4bbf1` (PPQ2-A + PPQ2-B), verified at start |
| PPQ2-C | Merged `--no-ff` from `1de127ef`. Its commits `5a880041` / `1de127ef` are preserved, and `ppq2c/premium-presentation` is untouched |
| Baseline tree | `C:\Users\mlmit\mogzy-wt\ppq2-int-base` (detached `bdf4bbf1`) |
| Dev servers | launch.json `ppq2int` :5276 and `ppq2int-base` :5277. Each sets `SWC_NATIVE_BINDING_CACHE`; node_modules is a junction to `ppq0c-int` |
| Route | DEV-only `/lol/dev/pro-play-arena`. The production `/lol/pro-play/quiz` route is **not** switched |
| Status | **All gates pass. STOP for control-center review** |

## 1. What it is

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

## 2. Invariants preserved, and where they are proven

| Requirement | Mechanism | Evidence |
|---|---|---|
| Server-authoritative grading | Grades, score and verdicts come only from the projection; the fixture server grades on the "server" side of the transport | PPQ2-B suites (239) unchanged; integration tests |
| Exactly-once submission | PPQ2-B's ref gate; the only input is the canonical grid's `onSelectOption` | `ProPlayArenaRun.test`: a 3-click burst sends 1 request, naming `question_id` |
| Reveal persists until Next | The projection holds the answered question; Next is the only advance | test: still revealed after a wait; Next mounts Q2 clean |
| Report identity, single publisher | `CanonicalArena` publishes from `view.report` + `surface.reportRef`; nothing in arena-run or the dev route publishes | test: mode/category/sessionId/round/runtimeQuestionId, answer only after grading; source guard on 4 files |
| One answer-rendering path | Content goes INSIDE the canonical buttons; nothing interactive inside a tablet | test; PPQ2-C guard; `AnswerGrid.elimination` result identical to base |
| Answer safety | All-or-none symmetric content (PPQ2-C), no tablet state before the reveal | seam tests; PPQ2-C 94 tests |
| Accessibility | `aria-label` stays `"A. Label"`; the divider is `aria-hidden`; the reserve is `aria-hidden` and invisible; Next takes focus after a reveal when focus was stranded, and scrolls into view on phones; 44px controls below `lg` | tests + matrix (`activeTestId = pro-play-next`) |

## 3. Shared Arena changes (this workstream only)

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

## 4. Visual defects found and resolved

| Defect | Root cause | Resolution | Measured |
|---|---|---|---|
| Faint Arena header title | The title is `text-muted-foreground/90`, near-white only under `.dark`. `/lol/*`, `/quiz/*` and `/combat-lab` force `dark theme-lol`; other paths follow the OS. The PPQ2-C preview and a `/dev/...` route render it dark-on-navy in a light-OS browser | The dev route lives under `/lol/`. Every production arena host (Ranked, Daily, Journey, `/lol/pro-play/quiz`) is already in the LoL section, so no shared CSS change was needed | Legible in every capture |
| Stage shrank when Next appeared | The HUD row is as tall as its control (Ranked always has Forfeit there) | Invisible same-size reserve on every frame | Stage height constant per viewport across all fixtures and states: 568.2 / 600.2 / 700.2 px at 1024 / 1280 / 1440 (was 736 → 696 at 1440) |
| Long header title under the app logo at 1024 | `Question n / N · s correct` widened the centred left block past the corner chip | The score moved to `titleDetail` (phone only); the desktop session panel shows it | Clear at 1024 |
| "Your pick" over the code row | An absolute bottom-right label vs a rich code row | Top-edge tab on content tablets | Probe overlap check: 0 in 94 captures |
| Phone tablet density | Facts and codes on two lines in a full-width single column | Codes share the facts line below `lg` | 4-choice tablets 79 → 62 px; stack 348 → 276 px |
| Next below the fold on phones | The page stacks below `lg` | `scrollIntoView({block:"nearest"})` | Next bottom ≤ viewport in all 36 phone/tablet captures |

## 5. Verification

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

## 6. Changed-file inventory (vs `bdf4bbf1`, PPQ2-C's own files excluded)

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

## 7. Commits

`5d5e1a8c` (merge PPQ2-C) → `34723476` (seam) → `740ed8bd` (composition + DEV route) → `a318d225` (visual fixes) → `86212c19` (tests) → `9b756881` (dev params, testid, harnesses) → handoff + evidence.

## 8. Remaining work

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

## 9. Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2-int log --oneline -9
# dev servers: launch.json "ppq2int" (:5276) and "ppq2int-base" (:5277)
# play:   http://localhost:5276/lol/dev/pro-play-arena            (live API)
#         http://localhost:5276/lol/dev/pro-play-arena?source=fixture
node docs/handoffs/ppq2int/cap.cjs <out> champion_player:pre,t1_lineage:wrong,default:next 390x844,1440x900
node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff      # then: control
```
