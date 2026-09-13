# TUT1 — Ranked Tutorial removal

## Objective

Remove the obsolete scripted Ranked tutorial from the product end-to-end.

Production Ranked is points-based. The tutorial taught HP, damage, knockout,
XP, leveling and ability unlocks — the retired combat-scoring model — so every
active surface it touched was teaching something the product no longer does.
It was not migrated, rewritten, or preserved behind a flag. Future
learn-by-doing belongs in **Bot Ranked / practice**, not in a separate scripted
flow.

Normal Ranked, Bot Ranked, Daily Challenge, Meta Reflex, Stat Check, the Mogzy
Rules Scroll and unrelated onboarding are untouched.

## Base

| Repo | Branch | Base SHA |
| --- | --- | --- |
| `mitcherrman/mogsy` (frontend) | `origin/main` | `92b02332` |
| `mitcherrman/League_Combat_Simulator` (backend) | `origin/master` | `b55806f8` |

Work was done in a fresh worktree cut from `origin/main`. The shared checkouts
at `/Users/macmoney/mogsy` and `/Users/macmoney/League_Combat_Simulator` were
not modified.

**No backend change was needed.** The audit found no tutorial-specific backend
code, table, endpoint or gate — only four prose mentions (`ranked_public/queue.py`,
`services/platform_policy.py`, `quiz/item_filters.py`, two docs), none of which
implement or gate anything.

## The gate that was removed

`RequireRankedTutorial` (`src/components/RequireRankedTutorial.tsx`) was the
forced-tutorial authority. It wrapped `/quiz`, `/quiz/matchup`, `/quiz/daily`,
`/quiz/daily-challenge` and `/quiz/ranked`, read the account's profile through
`useRankedTutorialStatus`, and redirected any account without a completion stamp
to `/onboarding/ranked-tutorial`. Those five routes now mount their page
directly.

## Routes

| Route | Before | After |
| --- | --- | --- |
| `/quiz/ranked`, `/quiz`, `/quiz/daily`, `/quiz/daily-challenge`, `/quiz/matchup` | `<RequireRankedTutorial>` | opens directly |
| `/onboarding/ranked-tutorial` | the mandatory tutorial page | `<Navigate to="/quiz/ranked" replace />` |
| `/quiz/tutorial` | the voluntary/replay tutorial page | `<Navigate to="/quiz/ranked" replace />` |
| `/dev/ranked-tutorial` | dev prototype page | removed entirely |

The two redirects are all that is left of the old URLs: a bookmark lands on
Ranked instead of a dead shell, and no tutorial implementation sits behind
either one.

## Deleted

- `src/components/RequireRankedTutorial.tsx` (+ test)
- `src/hooks/useRankedTutorialStatus.ts` (+ test)
- `src/lib/ranked-tutorial/` — `onboarding.ts`, `adminReplay.ts` (+ tests)
- `src/pages/onboarding/` — the whole directory (mandatory/replay page, run-mode,
  admin-replay and profile-handoff tests)
- `src/pages/dev/ranked-tutorial/` — the whole directory: state machine, step
  table, fixtures, arena adapter, onboarding context, and the six panels
  (`InstructionPanel`, `RoundRevealCoach`, `TutorialProgress`,
  `TutorialCompletePanel`, `QueueSimulationPanel`, `RecoverySimulationPanel`,
  `AdsProEducationPanel`)
- `src/components/quiz/LeaguecraftTutorialLink.tsx` — the "Start / Replay
  tutorial" link, the only UI entry to `/quiz/tutorial`
- `src/components/lol/LolWelcomeIntro.tsx` (+ 2 tests) — the first-visit overlay
  whose single action was "Start Tutorial"
- `src/components/ranked-arena/TutorialOnCanonicalArena.boundary.test.tsx`

## Entry points removed

- Leaguecraft lobby (`/quiz`): the tutorial link, in both the header row and the
  utility line.
- `/lol` hub: the automatic first-visit tutorial overlay and the policy
  evaluation behind it.
- `/welcome` (Academy introduction): the "Start the tutorial" exit. The page now
  has one exit, "Enter the Academy".
- Admin › Ranked › Matches: the "Launch Tutorial" replay panel.
- Admin › Platform Policies: the **Automatic Tutorial Popup** and **Required
  New-User Tutorial** switches.
- Admin registry: the `ranked-tutorial-replay` and `dev-ranked-tutorial` entries.
- Post-auth routing: `computePostConversionDestination` no longer takes a
  profile and can no longer send anyone to a tutorial; `Home.tsx`'s
  profile-setup handoff into the tutorial is gone.
- `lol_start_tutorial_clicked` funnel event.

## Preserved on purpose

- **The shared arena.** `CanonicalArena`, `ranked-core` (`viewTypes`,
  `arenaView`, `pacing`, `settlementViews`, the module registry), the question
  surface and the answer grid. The tutorial was a CONSUMER of these, never their
  owner — Ranked and the Daily Challenge render through the same layer.
- **The Mogzy Rules Scroll** (`src/components/ranked-rules/`). It remains the
  lightweight rules/help affordance and was not expanded to replace anything.
- **Tutorial TIPS** — `TutorialTipPopup`, `useTutorialTips`, `AdminTutorialTips`
  and the `tutorial_tips` / `tutorial_tip_dismissals` tables. A different
  feature: admin-authored contextual coach-marks on legacy Mogsy routes. Sharing
  the word "tutorial" is not a reason to delete it.
- **`SurfaceVariant "tutorial"`** in `lib/question-surface/contract.ts` — a
  presentation density preset on a shared contract, exercised only by the dev
  arena inspector. Removing it would touch shared code for no product reason.

## Persistence left dormant

Per the conservative policy for historical data:

- `profiles.ranked_tutorial_completed_at` and `profiles.ranked_tutorial_version`
  are **left in the database**, with their migration
  (`20260718120000_ranked_tutorial_completion.sql`) intact. No application code
  reads or writes them any more, which is what makes any account's old
  completion state irrelevant to Ranked access. They remain in the generated
  Supabase types. Dropping columns is a migration this removal does not need.
- The `app_settings` rows `tutorial_auto_popup_enabled` and
  `tutorial_completion_required_for_new_users` are **left in place** and are now
  inert: `POLICY_KEYS` no longer names them and `parsePlatformPolicy` no longer
  parses them, so their value in any state produces the default policy.
- The `quiz:gate:tutorial_popup_dismissed` sessionStorage key is removed from
  active logic. No migration machinery was built to erase old client values.
- `AcademyWelcomeOutcome` keeps `"tutorial"` as a **legacy read-only** value.
  Nothing writes it, but a visitor who took that exit before the removal has
  `{"outcome":"tutorial"}` in localStorage, and rejecting it would re-show the
  Academy introduction to someone who has already been through it.

## Bot Ranked

Verified, not modified. Bot Ranked runs through `ranked_public` /
`QuizRankedPage`; nothing in that path referenced tutorial completion before or
after this change, and `QuizRankedPage.host`, `QuizRankedMatch.botParity` and
the whole `lib/ranked-public` suite pass unchanged. No code assumed tutorial
completion before bot play.

Future introductory guidance belongs in the Bot Ranked / practice path. Nothing
was built toward that here — it is out of this workstream's scope.

## Tests

`src/App.tutorialRemoval.test.ts` is the new standing proof of the removal:
no tutorial modules ship; no production file names a tutorial machine, step
table or eligibility helper; no production file reads either dormant profile
column (while the generated types still carry them — proof nothing was dropped);
no production surface links to a tutorial route; the admin replay is gone; the
policy switches are gone; the retired HP/damage/Training-Golem copy appears
nowhere; and the shared arena, the Rules Scroll and Tutorial Tips still exist.

Updated alongside it: `App.routeGuards`, `App.startupFallbacks`,
`admin-registry.routes`, `AdminShell.areas` (§18 now asserts the absence),
`AdminPlatformPolicies`, `policy` / `botLabels` / `playModes`, `AuthCallback`,
`post-conversion-route`, `auth-destination`, `Quiz.hub`, `LolHub`,
`AcademyWelcomePage`, `QuizRankedViewport`, `QuestionStageGeometry`,
`CanonicalArena.boundary`, `DailyOnCanonicalArena.boundary`,
`Layout.themeIsolation`.

Results, all from the worktree:

- Full suite: **56 failed / 10785 passed**, against an `origin/main` baseline of
  **66 failed** measured the same way. Failure SETS compared: **zero new
  failures**, and 10 pre-existing failures fixed (`LolHub.background.test.tsx`
  was throwing on a partial `useAppSettings` policy mock; it now builds from
  `DEFAULT_PLATFORM_POLICY`).
- `tsc --noEmit`: clean (baseline also clean).
- `vite build`: succeeds.
- `eslint` on the changed files: 19 errors / 3 warnings, byte-identical to the
  same files on `origin/main` — all pre-existing `no-explicit-any`.

## Remaining cleanup (none blocking)

- The dormant DB columns and the two inert `app_settings` rows, if a future
  schema pass wants them gone.
- Backend prose in `ranked_public/queue.py`, `services/platform_policy.py`,
  `docs/ranked-public-service.md` still mentions a tutorial requirement as
  "out of scope"; harmless, and not worth a backend deploy on its own.
- `SurfaceVariant "tutorial"`, if the surface contract is ever revised.
