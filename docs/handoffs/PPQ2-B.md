# PPQ2-B — Pro Play Arena projection and controller

| | |
|---|---|
| Base | origin/main `d6c67abc1b4d85a4d1d5c77b36c0a14074ff7db3` (includes PPQ0C `00a006ac`) |
| Branch | `ppq2b/arena-projection` (worktree `C:\Users\mlmit\mogzy-wt\ppq2b-arena`), local only: not pushed or merged |
| Scope | `src/lib/pro-play/arena/**` and this handoff. Nothing else is touched: not the live page, `api.ts`, `answerFlow.ts`, `contract.ts`, `arenaView.ts` or any Arena component |
| Parallel streams | PPQ2-A (`ppq2a/neutral-question-seam` @ `2e0083b8`, integration `ppq2a/integration-main` @ `924f0192`); PPQ2-C (presentation) |

## What it is

Typed **data** plus one hook. No component lives under `src/lib/pro-play/arena/`.

| File | Role |
|---|---|
| `types.ts` | State, projection and PPQ2-C data types. Also the **local mirror** of PPQ2-A's `ArenaQuestionSurface` (`ProPlayArenaQuestionSurface`, `ProPlayArenaReportRef`) |
| `state.ts` | `proPlayArenaReducer`: a pure state machine for start, answer, resync, advance. `canSubmitAnswer` and `canResendAnswer` are the exactly-once gates |
| `projectProPlayArena.ts` | `projectProPlayArena(state) → ProPlayArenaProjection`, a pure function |
| `composeArenaView.ts` | `composeProPlayArenaView(projection, {left, right, hudAction, onSelectOption})` returns an `ArenaViewModel`-shaped object, or null when no question is on stage |
| `useProPlayArenaController.ts` | The hook. It owns transport (via PPQ0C `submitProPlayAnswer` / `resyncProPlaySession`), the epoch and the synchronous ref gate |
| `index.ts` | Barrel |

### `ProPlayArenaProjection`

| Field | Content |
|---|---|
| `phase` | `loading`, `question`, `revealed`, `complete` or `error` |
| `report` | `{mode: "Pro Play Quiz", category: "Leaguecraft"}` |
| `header` | `ArenaHeaderView`: eyebrow `Pro Play Quiz`, title `Question n / N`, no timer, no notes |
| `surface` | `ProPlayArenaSurfaceData` (the question surface without its callback), or null |
| `dossier` | Left-rail data from `question.context`: relationship, scope tags in server order, metric, `recent`, anchor, and `optionSubjects` (one per option, all or none) |
| `run` | Right-rail data: server `score` / `answered` / `total`, plus `pips` |
| `timeline` | The canonical `projectRoundTimeline` finite-plan strip: `totalRounds = session.total`, observed `outcomes`, `settlements: []`, `matchOver = session.complete` |
| `reveal` | Post-grade only. The server's `is_correct`, the selected and correct labels and ids, `explanation`, narrowed `evidence` and `replayed` |
| `next` | `{label: "Next" \| "See results", enabled}`, present only while a reveal shows |
| `status` / `error` | The error line, plus `action` saying what Try again does (`answer`, `resync` or `restart`) |
| `terminal` | `{score, total, answered, pips}` from the server summary, present once the last reveal is dismissed |
| `reportable` | An FB1-4 `ReportableQuestionSnapshot` for a page that publishes reports itself. `canonicalAnswer` is null until graded |

### Controller API

```ts
const { state, projection, selectOption, next, tryAgain, restart } =
  useProPlayArenaController({ transport?, autoStart = true, retryDelaysMs?, sleep? });
```

- `selectOption(option | optionId)` maps the option index to the server's label and submits `{sessionId, questionId, selectedAnswer}`.
- `tryAgain()` does what `projection.error.action` says.
- `next()` mounts the delivered next question or the summary. If a mid-run reveal arrived without a next question, it resyncs instead.

## Requirements → where they are enforced

| # | Requirement | Mechanism | Test |
|---|---|---|---|
| 1 | Server authoritative | Grade, score, answered, total and evidence are copied verbatim. No label comparison exists anywhere (enforced by a boundary regex) | `server-owned scoring` (an inconsistent payload keeps the server verdict); mutation "local grading" is caught |
| 2 | Server choice order | `options = choices.map((label, i) => ({id: String(i), index: i, label}))` | Every fixture; mutation "option sort" is caught by 17 tests |
| 3 | Answer-safe pre-answer | The pre-answer branch never reads `result` | Deep walk: every `*correct*`, `*evidence*`, `*explanation*`, `*reveal*` and `*canonical*` key is null, and no statistic key is present (every fixture) |
| 4 | `SurfaceReveal` null before grade | `reveal = graded ? {…} : null` | Every fixture; mutation caught by 13 tests |
| 5 | No fake Ranked semantics | Beats, ability HUD and timer are null. Flanks are `panel`. No settlements. No terminal victory or defeat | Key and value scan of both projections for every fixture; source vocabulary scan |
| 6 | Pips from observed results only | `outcomes` is written only by `applyGraded`. An answered position with no received grade is `unobserved` | `run history uses only observed results`; 409-resync test; mutation "guessed pips" is caught |
| 7 | Exactly-once, retries, resync, expiry | Ref-mirrored reducer gate, PPQ0C `submitProPlayAnswer`, epoch | Controller tests: click burst, retryable resend identical ×4, 503 replay, 409, 404, restart mid-answer, unmount |
| 8 | Reportable metadata, no leak | `report` + `surface.reportRef`, and `reportable.canonicalAnswer` only after the grade | Fixture tests |
| 9 | All fixtures, 2-choice and ranking | 14 frozen fixtures, 5 relationships, 2- and 4-choice | `the fixture corpus` + `describe.each` |
| 10 | Terminal from the server | `terminal` reads `session.score/total/answered` | `terminal completion`; controller `final summary` |

**Stale updates.** The reducer drops any grade whose session id or question id is not the one on stage. The epoch drops every continuation after a restart or unmount. The epoch is defence in depth: removing it alone is not caught by the tests, because the reducer's identity check already drops the same late response. That check is the tested guard; removing it is caught.

## Contract assumptions (unresolved; flagged for integration)

1. **PPQ2-A types are mirrored, not imported.** `ProPlayArenaQuestionSurface` and `ProPlayArenaReportRef` copy §A2 field for field.
   - *Verified:* a throwaway worktree of `ppq2a/integration-main` (same base `d6c67abc`) was checked with this directory plus a compat file. Both directions of `ProPlayArenaQuestionSurface ⇄ ArenaQuestionSurface` assign, `ProPlayArenaReportRef ≡ QuestionReportRef`, and `ProPlayArenaViewModel → ArenaViewModel` assigns. tsc showed only the 2 pre-existing errors, and a negative control did fail. The scratch worktree was removed.
   - *At integration:* replace the two mirror types with re-exports of `ArenaQuestionSurface` / `QuestionReportRef`, and drop the `Omit<ArenaViewModel, "surface">` narrowing in `composeArenaView.ts`.
2. **`SurfaceReveal.explanation` is null** (per §A9) because the server explanation still carries internal copy (PPQ1 Q4). The explanation travels in `projection.reveal.explanation` for PPQ2-C to decide.
3. **`SurfaceReveal.evidence` is null.** Pro Play's per-metric evidence is richer than `FeedbackEvidence`, so it travels as `projection.reveal.evidence` (`ProPlayEvidence`) for PPQ2-C/D's on-tablet reveal.
4. **Timeline during a reveal.** After grading, `session.answered` has already advanced, so the canonical strip marks the graded node `resolved` (with its verdict) and the next position `current`. This is server truth, not a lag. If the owner wants the marker held on the revealed question, that is a presentation choice for PPQ2-C.
5. **Report publishing.** The arena path relies on PPQ2-A's arena-side publishing (`report` + `reportRef`). `projection.reportable` is the same snapshot the live page publishes today, for any non-arena caller. Use one, never both.
6. **Non-retryable failure (e.g. 422).** This keeps today's page semantics: the selection is released and Try again restarts. The stage keeps the question visible with the error line instead of replacing the card.
7. **No terminal tone.** `terminal` is data only. Owner Q3 (a neutral `MatchOverFrame` tone, or an in-arena summary) is still open, and nothing here assumes either answer.
8. **Option ids are index strings.** This matches the Ranked module path and §A9. Identity is per question, and the label is what the API receives.

## Integration needs

- **PPQ2-A must land first.** Then do assumption 1's two-line swap, and mount `<CanonicalArena view={composeProPlayArenaView(projection, slots)} />` on the route, which joins Layout's full-bleed list.
- **From PPQ2-C:** components for `left` / `right` (from `projection.dossier` / `.run`), the `hudAction` Next button (from `projection.next` → `controller.next`), the error panel (from `projection.error` → `controller.tryAgain`) and the summary (from `projection.terminal` → `controller.restart`).
- **Live page switch** (`ProPlayQuiz.tsx`): replace its local state with `useProPlayArenaController()` and remove its `usePublishReportableQuestion` once the arena publishes. Its 21 PPQ0A tests are the regression bar.
- **Optional.** Extend the `DailyOnCanonicalArena.boundary` vocabulary scan to `lib/pro-play/arena` (this branch has its own `arena.boundary.test.ts`).

## Verification

| Gate | Result |
|---|---|
| `vitest run src/lib/pro-play/arena` | **195 / 195** in 4 files (projection 138, state 17, controller 14, boundary 26) |
| Mutation checks (8) | 7 caught. The epoch-only mutation is not, by design (see Stale updates) |
| Neighbouring suites (`src/lib/pro-play`, `ProPlayQuiz.test`, `components/pro-play`, `sharedLayer.boundary`, `DailyOnCanonicalArena.boundary`) | 603 / 605. The 2 failures are in `DailyOnCanonicalArena.boundary` ("manual progression control", "parent run is the ONLY Daily runtime"). Both fail identically on the clean base `d6c67abc` with this directory removed, so they predate this branch |
| `tsc -p tsconfig.app.json` | 2 errors, both pre-existing (`OnboardingProfile.tsx`, `identity/connections.ts`); 0 under `pro-play` |
| `eslint src/lib/pro-play/arena` | clean |
| `vite build` (to a temp outDir) | OK, built in 33.7 s, 0 errors. Nothing imports this directory yet, so the bundle is unaffected. The full `npm run build` prerender chain was not run |
| Compatibility with PPQ2-A | verified (assumption 1) |

Tooling note: the worktree's `node_modules` is a junction to `mogzy-wt/ppq0c-int/node_modules`. Tests and the build ran with `SWC_NATIVE_BINDING_CACHE=C:\Users\mlmit\mogzy-wt\.swc-cache-ppq0c`. pnpm was not run.
