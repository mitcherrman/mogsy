# PPQ2-INT — Premium Pro Play Arena assembly (IN PROGRESS, not pushed)

| | |
|---|---|
| Branch | `ppq2int/arena-assembly` (worktree `C:\Users\mlmit\mogzy-wt\ppq2-int`), local only |
| Base | origin/main `bdf4bbf1` (PPQ2-A + PPQ2-B), verified |
| PPQ2-C | merged `--no-ff` at `1de127ef` (original commits 5a880041 / 1de127ef preserved; branch untouched) |
| Baseline tree | `C:\Users\mlmit\mogzy-wt\ppq2-int-base` (detached `bdf4bbf1`) |
| Dev servers | launch.json `ppq2int` :5276, `ppq2int-base` :5277 (need `SWC_NATIVE_BINDING_CACHE`, set in the entry) |
| Status | **NOT pushed.** The pixel/DOM harness and the final screenshot matrix have not run yet (see §5) |

## 1. What was built

- **Seam** (commit 34723476): `docs/handoffs/ppq2c/proposed-regions-seam.patch` applied unchanged (5 shared files).
- **Shared follow-ups** (a318d225 / 9b756881):
  - `ArenaHeaderView.titleDetail`: drawn after the title **below `lg` only** (testid `ranked-header-detail`). It's absent for every existing mode.
  - `QuizAnswerOptions`: on a tablet that carries `optionContent`, "Your pick" becomes a gold tab on the tablet's top edge. Label-only tablets keep the classic bottom-right label.
- **Composition**: `src/components/pro-play/arena-run/`
  - `composeProPlayArenaStage.tsx`: `composeProPlayArenaView` plus `regions`, with the dossier on the left flank, the session panel on the right, the title `Question n / N`, `titleDetail` `"<score> correct"`, and a HUD action on every frame.
  - `ProPlayArenaRun.tsx`: takes the controller. It renders the stage, or the arena's empty frame for loading, error-only and the neutral end summary.
  - Next takes focus after a reveal and scrolls into view on phones.
  - An invisible reserve holds the HUD slot, so the stage never shrinks.
  - It never publishes reports: CanonicalArena is the single publisher.
- **DEV route** `/lol/dev/pro-play-arena?source=live|fixture`:
  - Registered DEV-only. It is full-bleed and under `/lol/` so it gets `dark theme-lol` like the real route.
  - A badge says Live API (with the host) or Fixture.
  - Fixture mode uses `fixtureTransport.ts`: real frozen payloads behind a simulated server with PPQ0A replay/409/404 semantics. Options: `set=default|two|four|keys`, `latency`, `fault=start|answer`.
  - The production `/lol/pro-play/quiz` route is untouched.
- **PPQ2-C tweak**: below `lg`, compact tablets put the code chips beside the role/seasons line. Phone tablets went from 79 to 62px; the 4-choice stack from 348 to 276px.

## 2. Visual defects found and resolved

| Defect | Cause / fix |
|---|---|
| Faint header title | `text-muted-foreground/90` is near-white only under `.dark`. Non-`/lol` routes follow the OS light scheme. Every production arena route is in the LoL section, so the dev route moved under `/lol/` |
| Stage shrank 40px when Next appeared | The HUD row is as tall as its control. The slot is now reserved from the first frame: 1440×900 stage is 700px constant pre/reveal/next |
| Long title slid under the app logo at 1024 | The score moved to the phone-only `titleDetail` |
| "Your pick" over the code row (1024) | It is now a top-edge tab on content tablets (probe: 0 overlaps) |
| Next below the fold on phones (850/844) | `scrollIntoView({block:"nearest"})` when focus was stranded |

Capture probe (`docs/handoffs/ppq2int/cap.cjs`):
- 0 violations and 0 page errors at 375/390/768/1024/1440 for 2- and 4-choice in pre/correct/wrong/next.
- The only finding left is the pre-existing 1024 x-overflow (1028/1024, every full-bleed arena).

Live API play was verified in the browser pane: answer → server reveal → Next → Q2 with score.

## 3. Tests

- New tests:
  - `arena-run/ProPlayArenaRun.test.tsx` (16): regions placement, one answer path, exactly-once burst, reveal held until Next, report identity and answer only after grading, no second publisher, Try again (answer and start), completion, fixture-server contract, DEV route registration.
  - `CanonicalArena.regionsSeam.test.tsx` (8): an absent seam is inert; a present one lands inside the canonical structure.
- Pro Play suites: 633/633 (PPQ2-B boundary and PPQ2-C source guards included).
- **Full suite, candidate vs clean `bdf4bbf1`, same chunks and toolchain:**
  - Failure sets are identical after two follow-ups:
    - (a) the `QuestionStageGeometry` "one ranked-header-title" guard. My testid contained that string, so it was renamed.
    - (b) `LobbyPreviewPage.premiumAnalytics` and `TeamSimPage.phase5a` failed once in the candidate only, then passed 74/74 on both trees on recheck (flaky under load).
  - The remaining failures are pre-existing on both trees (CRLF source guards etc.).
  - `src/test/security/pt2cProfileFrameAuthority.test.ts` OOMs on both trees (environment).
- `tsc -p tsconfig.app.json`: the same 2 pre-existing errors only.
- ESLint on changed files: 0 errors.

## 4. Changed files (vs `bdf4bbf1`, excluding the PPQ2-C merge itself)

Shared:
- `lib/ranked-core/arenaView.ts`
- `ranked-arena/CanonicalArena.tsx`
- `ranked-arena/AnswerGrid.tsx`
- `question-surface/InteractiveScenarioSurface.tsx`
- `quiz/QuizAnswerOptions.tsx`
- `App.tsx` (DEV route)
- `Layout.tsx` (full-bleed path)

New:
- `components/pro-play/arena-run/*`
- `pages/dev/pro-play-arena/{ProPlayArenaDev.tsx, devParams.ts, fixtureTransport.ts}`
- `ranked-arena/CanonicalArena.regionsSeam.test.tsx`
- `docs/handoffs/ppq2int/{cap.cjs, ppq2int-cert.cjs}`

PPQ2-C: `components/pro-play/arena/ProPlayOptionContent.tsx` (phone density only).

## 5. Remaining before push (gates not yet met)

1. **PPQ2-A pixel/DOM non-regression.** Run `node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff` (base :5277 vs candidate :5276, 15 states × 5 viewports, including the question probe with no regions), then `control` (base vs base). Expect DOM-identical for every existing caller.
2. **Final screenshot matrix into `docs/handoffs/ppq2int/`:**
   - `cap.cjs` at 375/390/768/1024/1280/1440;
   - two-choice (`champion_player`, `champion_team`) and four-choice (`t1_lineage`, `flex`, `patch`) in pre/selected (`:latency=60000`)/correct/wrong/next;
   - plus a `PPQ_SOURCE=live` pass.
3. **`vite build`.** Confirm the dev route, `fixtureTransport` and the fixtures are absent from the production bundle.
4. **CRLF.** Several working copies were rewritten LF by sed. Normalise them (fresh checkout) before the harness, because some source guards are CRLF-sensitive.
5. Then push `ppq2int/arena-assembly` only.

## 6. For PPQ2-D / PPQ2-E

- **PPQ2-D (reveal):** pass positional nodes to `ProPlayArenaRun`'s `revealSlots` prop. They are used only once `projection.reveal` exists and replace the tablet facts in place. `projection.reveal.evidence` / `.explanation` carry the server data. Do not edit the arena-run or shared files.
- **PPQ2-E (route switch):**
  - Mount `ProPlayArenaRun` with `useProPlayArenaController()` at `/lol/pro-play/quiz`.
  - Delete `ProPlayQuiz`'s `usePublishReportableQuestion` in the same change.
  - Add the route to Layout's full-bleed list.
  - Keep the 21 PPQ0A page tests as the bar.
- **Owner calls still open:**
  - end-summary tone (Q3; the current panel is neutral, provisional);
  - timeline marker during a reveal (it moves to the next position, PPQ2-B assumption 4);
  - the dossier/session panels have free vertical space on tall desktops.
