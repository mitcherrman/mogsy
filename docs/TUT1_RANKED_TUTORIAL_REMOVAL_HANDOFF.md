# TUT1 — Ranked Tutorial removal

> **Status: complete, in two passes.** Pass 1 (`33d27b2f`) removed the feature
> and left its storage dormant for hypothetical existing users. The owner then
> confirmed there are none, so the hard-cleanup pass removed the compatibility
> residue as well: the redirect routes, the legacy welcome outcome, the two
> profile columns, the two inert `app_settings` rows and the tutorial surface
> variant. Sections below reflect the FINAL state.

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
| `/onboarding/ranked-tutorial` | the mandatory tutorial page | **not declared** |
| `/quiz/tutorial` | the voluntary/replay tutorial page | **not declared** |
| `/dev/ranked-tutorial` | dev prototype page | **not declared** |

Pass 1 kept the first two as `<Navigate to="/quiz/ranked" replace />` for old
bookmarks. With no users there is no bookmark to honour, so the hard-cleanup
pass removed the route declarations outright — they now fall through to
`NotFound` like any other unknown path. `src/App.tsx` contains the string
"tutorial" zero times, which a test asserts.

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
(`SurfaceVariant "tutorial"` was preserved in pass 1 and removed in the
hard-cleanup pass — see below.)

## Persistence — deleted, not dormant

Pass 1 left the storage in place on the assumption that existing accounts'
completion state might matter. It does not. Migration
`supabase/migrations/20260912120000_tut1_drop_ranked_tutorial_residue.sql`:

```sql
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS ranked_tutorial_completed_at,
  DROP COLUMN IF EXISTS ranked_tutorial_version;

DELETE FROM public.app_settings
  WHERE key IN ('tutorial_auto_popup_enabled',
                'tutorial_completion_required_for_new_users');
```

**Why the column drop is safe and isolated.** Nothing depends on either column
BY NAME — no index, constraint, RLS policy, view, trigger or function
signature. `handle_new_user()` (current definition in
`20260822120000_auth3_canonical_username.sql`) inserts only
`(user_id, display_name, is_anonymous)` and never referenced them.
`admin_list_profiles()` is `RETURNS SETOF public.profiles` with `SELECT *` —
a dependency on the table's ROW TYPE, not on these columns, so it follows the
new shape automatically and is deliberately not redefined here. The generated
types in `src/integrations/supabase/types.ts` were updated to match, in all
four places they appeared (profiles Row/Insert/Update and the
`admin_list_profiles` return shape).

**Why the `app_settings` rows are safe to delete.** They are rows in a
key/value store with no reader on either side: since `33d27b2f` the frontend's
`POLICY_KEYS` has not named them and `parsePlatformPolicy` has not parsed them,
and the backend never enforced them (`services/platform_policy.py` enforces only
Combat Sim tokens and Global Premium Access). Deleting them removes two dead
keys from the admin's view of that table and changes no behaviour.

The two migrations that created this residue
(`20260718120000_ranked_tutorial_completion.sql`,
`20260730120000_platform_access_tutorial_policies.sql`) are **not edited**.
They are applied history; the new migration is the correction on top of them.
A fresh database therefore creates the columns and rows and then drops them,
and an existing one simply drops them — both converge on the same schema.

Also removed in this pass:

- `AcademyWelcomeOutcome` is now `"explored" | "signed-in"`. The legacy
  `"tutorial"` value is no longer accepted: a stored outcome of `"tutorial"`
  fails `VALID_OUTCOMES` and reads as "never seen the introduction", which is
  the correct answer when nobody is carrying one.
- `SurfaceVariant "tutorial"` and its `VARIANT_DEFAULTS` entry. Traced first:
  its only consumer was one demo row in the dev arena inspector, which is
  deleted with it. It was a density preset created for and named after the
  scripted tutorial — residue, not a generic rendering mode. `standard`,
  `competitive` and `speed` are untouched.

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

## Remaining cleanup

None in the frontend. Searching the repo for Ranked tutorial concepts returns
only: this handoff, the historical migrations that created the residue, the
migration that removes it, explicit "this was deleted" notes in older audit
docs, and the tests that assert the absence.

Backend (`League_Combat_Simulator`) still carries three prose mentions —
`ranked_public/queue.py`, `services/platform_policy.py`,
`docs/ranked-public-service.md` — all describing a tutorial requirement as
"out of scope". No backend code, table, endpoint or gate was ever involved, so
nothing there needs a deploy.
