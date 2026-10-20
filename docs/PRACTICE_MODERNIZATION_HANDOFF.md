# PM1 — Quick Study, More Challenges and Practice-in-the-arena

Read this first if you pick this work up in another instance. Read `AGENTS.md`
too: browser tests run on GitHub Actions only, never on the user's desktop.

## Objective

Three coordinated UI upgrades on the Leaguecraft hub (`/quiz`), with no change
to gameplay or persistence:

1. **Quick Study** — a premium Academy treatment for the six subject tiles.
2. **More Challenges** — a substantial invitation in place of the plain row.
3. **Practice** — the Practice runner presented in the canonical Ranked arena
   instead of the legacy card/progress bar/answer list.

## Historical findings

- `QuizCategoryRail` became the Practice chooser in PRAC1 (`9b03d8fd`); Vision
  was enabled later (`8c9c1f73`, VISION42). Three rail tests and one hub test
  still asserted "Vision unavailable" on `main` and failed; PM1 updates them.
- More Challenges arrived in PGM1 (`41fc080f`) as a text row between Quick Study
  and History; the HUB7 hub test still asserted "nothing between them" and
  failed on `main`. PM1 updates it to "exactly More Challenges between them".
- The Pro Play quiz (PPQ2-A/B, `bdf4bbf1`) already runs a non-Ranked, solo,
  server-graded question through `CanonicalArena` using the question member of
  the surface union (`ArenaQuestionSurface`) and `panel` flanks. PM1 follows
  that precedent exactly rather than inventing a new path.
- `main` (e0fa3fa7) already has many failing unit tests on a Windows checkout:
  82 in the Quiz/arena suites alone, mostly (a) Ranked "coming soon" pausing the
  PLAY scroll (`PUBLIC_RANKED_COMING_SOON`) and (b) source-guard tests that
  match `\n` against CRLF files (`core.autocrlf=true`). These pass or fail
  independently of PM1; see "Tests" for the exact diff.

## Relevant files

| Area | File |
| --- | --- |
| Practice state machine (unchanged behaviour) | `src/pages/Quiz.tsx` |
| Practice → arena projection (pure) | `src/lib/quiz/practiceArena.ts` |
| Practice arena composition | `src/components/quiz/practice-arena/PracticeArena.tsx` |
| Question art for the stage's media region | `src/components/quiz/practice-arena/PracticeQuestionMedia.tsx` |
| Left flank (subject, badges, XP, rank) | `src/components/quiz/practice-arena/PracticeSubjectPanel.tsx` |
| Category badge styles (moved out of Quiz.tsx) | `src/components/quiz/practice-arena/practiceCategoryStyle.ts` |
| Right flank (reused unchanged) | `src/components/pro-play/arena/ProPlaySessionPanel.tsx` |
| Arena (reused unchanged) | `src/components/ranked-arena/CanonicalArena.tsx`, `ArenaShell.tsx` |
| Picture-choice seam (additive) | `src/lib/ranked-core/viewTypes.ts` (`AnswerOptionView.imagePath`), `src/components/ranked-arena/AnswerGrid.tsx` |
| Quick Study | `src/components/quiz/QuizCategoryRail.tsx` |
| More Challenges | `src/components/quiz/MoreChallengesInvite.tsx` |
| Hub composition | `src/components/quiz/LeaguecraftHub.tsx` |
| Browser acceptance | `e2e/pm1/practice-modernization.spec.ts`, `playwright.pm1.config.ts`, `.github/workflows/practice-modernization-acceptance.yml` |

## Architecture decisions

- **Presentation adapter, not a second runner.** `Quiz.tsx` keeps every handler
  (`handleSelectAnswer`, `handleNext`, replay, play again, history sessions,
  XP, gate/nudge, SFX, leave guard, results). Only the `loading-questions`,
  `active` and `error` render branches changed: they now mount `PracticeArena`
  outside the reading-width container, so `ArenaShell` owns width, the HUD-band
  reclaim and the viewport-height stage exactly as on `/quiz/ranked`.
- **Ranked's real components.** `CanonicalArena` → `ArenaShell` → the question
  stage (`ranked-question-stage` folio) → `InteractiveScenarioSurface`
  (competitive variant) → `AnswerGrid` → `QuizAnswerOptions`; the header strip
  and its `CentralStage` result face; the finite `RoundTimeline`. Nothing is
  re-skinned by hand.
- **No Ranked game state.** The view model carries no timer, opponent,
  combatant, abilities, round/segment/card beats, reveal hold, rating or
  matchmaking. Both flanks are `panel`s. The centre display shows only the
  backend's verdict and `xp_earned` after grading.
- **Answer safety.** Options are served order, `id = String(index)`. `reveal`
  exists only after the backend grades. A failed submit uses the
  `UNVERIFIED_ANSWER` sentinel (same text the legacy card showed) and is drawn
  as "Answer not verified" — never as Incorrect, never as a revealed answer.
  Outcomes are keyed by position so a failed submit leaves its node neutral.
- **Report identity preserved.** The arena's `report` is `null`; `Quiz.tsx`
  keeps publishing Practice's own snapshot (static question id + question key,
  which the arena snapshot cannot carry). One `CanonicalArena` element serves
  loading/question/error so it never remounts under the page's publisher.
- **Explanation placement.** The competitive surface suppresses its prose
  panel; Practice's explanation, correct answer, pro-data source link and XP
  live in a reveal footer in the arena's HUD row (Pro Play's pattern), with a
  same-height reserve before grading so revealing never resizes the stage.
- **Picture choices.** One additive field, `AnswerOptionView.imagePath`, lets
  `AnswerGrid` hand `QuizAnswerOptions` its own picture-choice objects. Absent
  for every Ranked/Daily/Pro Play option, which render byte-identically.
- **Quick Study height budget.** The heading moved inside the rail's plate
  (leading edge from `xl`, top row below), paying for larger gilded frames at
  the same first-screen height. `lg` uses a slimmer 40px frame because
  1024–1279 has the least width per tile.
- **More Challenges** reuses the catalog's own `GameArt` medallions (time
  trial, survival, match grid) inside an `mc-gallery` scope; still one link
  with `moreChallengesState("leaguecraft")`, fetches nothing, lists no modes,
  states "Unrated: none of them change your Daily score or Ranked rating."
- **Way back.** "Back to League hub" (aria-label kept from the legacy header)
  sits beside the HUD hat below `lg` and in the subject panel from `lg`; CSS
  shows exactly one. Both go through the unchanged NAV1 leave guard.

## Implementation status

- [x] Quick Study redesign
- [x] More Challenges redesign
- [x] Practice arena adapter and Quiz.tsx integration
- [x] Unit/regression tests
- [x] Remote browser acceptance green (run 39358499833; integrated with main at 44afc3ed: run 39359065180, also green)
- [ ] Screenshots visually reviewed — skipped by the owner (artifact download needed a GitHub sign-in this machine did not have)
- [x] Merged to `main` — `c0fc4292` (merge commit of `practice-modernization/pm1` @ `9afa4669` onto `6fc8c343`), pushed 2026-10-19. Screenshot review skipped at the owner's request; the automated geometry checks stand in for it.
- [ ] Production verified

## Tests and screenshots

Unit (local, Windows): new/updated — `practiceArena.test.ts` (9),
`PracticeArena.test.tsx` (11), `QuizCategoryRail.test.tsx` (16),
`LeaguecraftHub.moreChallenges.test.tsx` (4), `Quiz.practiceMissed.test.tsx`
(13, incl. the PM1 arena + report-identity test), `AnswerGrid.test.tsx` (10).

Browser: `practice-modernization-acceptance` workflow, artifact
`practice-modernization-evidence` (`test-results/pm1/*.png`).

### Browser acceptance (GitHub Actions, bundled Chromium, 1 worker)

Run https://github.com/mitcherrman/mogsy/actions/runs/39358499833 — both jobs
green: `pm1-browser` 10/10 and `unit-and-build` (PM1 unit suites, `tsc`,
`vite build`). Per viewport (1920x1080, 1440x900, 1280x800, 390x844, 360x640,
844x390) it asserts: six Quick Study tiles inside the plate with no truncated
label; no horizontal page scroll; More Challenges heading, link and unrated
line; for every one of the ten questions, pre-answer and revealed: the full
prompt visible and unclipped, every tablet inside the stage and unclipped, no
inner scroll container in the arena, and on desktop the whole arena inside the
viewport; picture choices render four images; the reveal footer's explanation
and XP; results; replaying the three misses. Separately: loading → error →
Try again, keyboard-only play (Next takes focus; the new stem takes focus),
reduced motion, and the leave guard.

### First-screen geometry, branch vs `main` (same spec, same runner)

| viewport | lobby bottom | Quick Study bottom — main | — PM1 |
| --- | --- | --- | --- |
| 1920x1080 | 834 | 938 | 926 |
| 1440x900 | 827 | 931 | 919 |
| 1366x768 | 802 | 906 | 894 |
| 1280x800 | 790 | 894 | 882 |
| 1024x768 | 782 | 886 | 883 |

On `main` the lobby rack already reaches 790/827px at 1280x800/1440x900, so
Quick Study was below the fold there before PM1. PM1 ends it 3–12px higher
everywhere. More Challenges is ~34px taller than the old row, which moves
History down by that much (below the fold at every size).

### Unit (local, Windows)

New/updated: `practiceArena.test.ts` (9), `PracticeArena.test.tsx` (11),
`QuizCategoryRail.test.tsx` (16), `LeaguecraftHub.moreChallenges.test.tsx` (4),
`Quiz.practiceMissed.test.tsx` (13), `AnswerGrid.test.tsx` (10). Branch vs
`main` over quiz, question-surface, pro-play, lib/quiz, lib/ranked-core,
lib/feedback and Daily (4,249 tests): no new failures; 3 fixed.

## Commit and PR links

- Branch: `practice-modernization/pm1`
- No PR yet: this machine has no `gh`, and using the stored Git credential for
  the REST API was (rightly) blocked. CI runs on push to the branch.

## Deployment verification

Lovable does not deploy on push: the owner must press **Publish** in Lovable
(see the DCGI1/Assembly handoffs). Before publish, https://mogzy.lol served
`/assets/index-DH3O7p14.js` (pre-PM1); it was still serving that bundle ~12
minutes after `c0fc4292` was pushed.

After publish, run `pm1-production-verify` (push any change under
`e2e/pm1-prod/` to a `practice-modernization/**` branch, or dispatch it). It
is read-only: GET pages, art and real Practice questions; every non-GET
(session, attempt, analytics, anonymous sign-in) is answered locally. It checks
the PM1 markers on the hub, the More Challenges invitation, real questions in
the canonical arena at 1440x900 and 390x844 (fit, no horizontal scroll), the
reveal footer and the leave guard.

## Unresolved issues

- Pre-existing failing unit tests on `main` (Ranked coming-soon and CRLF source
  guards) are not addressed here.
- `fill_blank` questions are retired on the backend; the arena keeps a typed
  input fallback in the HUD row, untested in the browser.
