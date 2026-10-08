# Standalone Mastery Retirement Handoff

## Objective

Retire the legacy standalone Mastery Journey product in favor of the modern
Journey architecture without losing unique curriculum or historical learner
records.

User-facing terminology after migration:

- **Journey** — a guided League learning experience.
- **Journey Library** — the public place to discover Journeys.

Do not maintain "Mastery" and "Journey" as competing user-facing products.

## Verified architecture

### Legacy standalone Mastery

Frontend:

- `/quiz/mastery` — authenticated Mastery catalog.
- `/quiz/mastery/:masterySetId` — dedicated legacy Mastery player.
- Uses `src/features/mastery/live.ts` and the standalone Mastery APIs.

Backend:

- Published artifact registry in `mastery/publication/registry.py`.
- Standalone sessions in `mastery_sessions`.
- Per-step answers in `mastery_session_answers`.
- Own session/player/progress lifecycle.
- Historical/prototype artifacts remain registered for compatibility, but the
  actual public catalog exposes only three curricula:
  1. the default Ahri E vs Syndra E set,
  2. Olaf cooldown/mana,
  3. Summoner Spell Mastery.

### Modern Journey architecture

- Reviewed `JourneyRecipe` curriculum.
- Composed through the canonical Journey composer.
- Served as `mastery_slice`.
- Hosted by canonical Ranked match infrastructure / arena.
- Also used by Daily Challenge.
- `/quiz/journeys` is the public Journey Library.
- The modern Daily Journey recipe catalog currently contains 26 matchup
  curricula across all five roles.
- The separate Library-only approval file currently contains no additional
  recipes/approvals; it is the expansion seam, not a second content authority.

The backend explicitly retired the old static `mastery_set_id` Ranked config
shape because retaining it would preserve a duplicate content authority.

## Product decision

Treat standalone Mastery as **deprecated** and Journey Library as its
successor.

This is an upgrade/architecture migration, not two distinct products.

## Content disposition

### Ahri vs Syndra

Retire the legacy curriculum as a public Mastery destination. The modern
Journey catalog already contains Ahri vs Syndra curricula, including a level-6
variant.

No requirement to reproduce the old six questions byte-for-byte.

### Olaf cooldown/mana

Retire the legacy standalone delivery path. Preserve useful curriculum ideas
only where they belong in modern generated/Journey content.

Do not keep the legacy runtime solely to preserve this set.

### Summoner Spell Mastery

**Preservation requirement.**

This is the one legacy public curriculum without a verified equivalent in the
modern Journey catalog. Do not delete it with the old runtime.

Before final legacy API/player removal, either:

1. re-author/migrate this curriculum into an appropriate modern content
   product, or
2. establish another canonical modern home for non-matchup curricula.

Do not force it into a matchup recipe merely to complete the retirement.

## Historical data

Preserve existing `mastery_sessions` and `mastery_session_answers` as
historical learner records.

Do not rewrite old sessions as Ranked/Journey matches and do not fabricate
cross-system history.

Legacy history can later be projected read-only if product history needs it.

## Migration phases

### Phase 1 — stop competing discovery

- Journey Library becomes the sole public Journey discovery destination.
- Remove legacy Mastery entry points from navigation/discovery where any
  remain.
- Add `noindex` to legacy Mastery catalog/player surfaces.
- Keep existing legacy routes/API operational temporarily for active/historical
  compatibility.
- Do not redirect active player/session URLs until resume behavior is audited.

### Phase 2 — modern progression parity

Inventory which learner-facing concepts are still worth carrying forward:

- resume/recovery,
- attempts,
- completion,
- best/latest score,
- last played,
- recommendations / continue-learning cues.

Implement wanted concepts from canonical Journey/Ranked facts. Do not make the
new Journey Library permanently depend on legacy `mastery_sessions`.

### Phase 3 — preserve unique curriculum

Move Summoner Spell Mastery (and only other genuinely unique content found by
a final audit) onto a canonical modern content product.

### Phase 4 — route retirement

After active-session compatibility and unique-content preservation are green:

- redirect `/quiz/mastery` to `/quiz/journeys`;
- map old detail links only when a deterministic equivalent exists;
- otherwise land safely in Journey Library with clear context;
- stop creation of new standalone Mastery sessions.

### Phase 5 — infrastructure cleanup

Only after dependency search and production verification:

- remove legacy Mastery player code,
- retire unused standalone Mastery write APIs,
- remove obsolete publication/runtime machinery that has no remaining reader,
- retain historical tables/data unless a separately approved retention policy
  says otherwise.

## Explicit non-goals

- Do not change Daily Challenge gameplay.
- Do not change Journey question semantics during retirement.
- Do not delete historical learner data.
- Do not claim old Mastery history is canonical Ranked history.
- Do not keep duplicate content authority for compatibility.
- Do not delete Summoner Spell Mastery without a verified replacement.

## Desktop verification / next task

1. Run a repository-wide dependency search for every legacy Mastery frontend
   route/component/API and backend endpoint.
2. Verify whether any current navigation still links to `/quiz/mastery`.
3. Inspect production usage before disabling new session creation.
4. Determine whether active legacy sessions exist and define a compatibility
   window.
5. Design the modern home for Summoner Spell Mastery.
6. Implement Phase 1 as a small isolated change.
7. Run frontend/backend tests and production smoke checks before progressing to
   later phases.

---

## 2026-10-08 Phase 1 audit and implementation update

### Checkout and drift verification

- Fetched `origin` with pruning before changing files.
- Remote task branch remained exactly at the dispatched starting head:
  `c40aa9162a661f29146a30285dcfc98df7750d20`.
- `origin/main` remained exactly at the dispatch-preparation head:
  `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33`.
- The task branch is the handoff commit directly behind `origin/main`
  (`git rev-list --left-right --count origin/journeys/mastery-retirement-plan...origin/main`
  returned `0 1`). The one main-only commit is the unrelated DV2-P0 Daily
  compatibility change and was not merged into this workstream.
- The shared `main` checkout contained many unrelated untracked files. It was
  not modified. Work moved to the dedicated worktree
  `.worktrees/mastery-retirement`, on local branch
  `journeys/mastery-retirement-plan` tracking the same remote branch. The
  dedicated worktree was clean before implementation and no other worktree
  owned the branch.

### Repository-wide legacy dependency audit

This repository contains the frontend and Supabase project, but not the
Railway/Python Mastery backend named elsewhere in this handoff. Backend source
claims below remain handoff evidence until checked in that backend repository;
they are not re-inferred from this frontend.

#### Routes and discovery

- `src/App.tsx` keeps both authenticated compatibility routes operational:
  - `/quiz/mastery` -> `MasteryJourneysPage`
  - `/quiz/mastery/:masterySetId` -> `MasteryJourneyPlayerPage`
- `src/pages/Quiz.tsx` still has `HUB_MODULES.masteryJourney: true` and renders
  the only product-level navigation entry to `/quiz/mastery`, labelled
  **Mastery Journey** (`hub-mastery-link`). Therefore current navigation still
  points to `/quiz/mastery`.
- Other `/quiz/mastery` links are compatibility links inside the legacy
  catalog/player (catalog cards, recommendation, invalid/error return, and
  player back-link), not separate discovery entrances.
- `src/lib/feedback/contract.ts` retains the `/quiz/mastery` -> `Mastery`
  reporting category. This is compatibility/reporting metadata, not discovery.
- Neither `/quiz/mastery` nor `/quiz/journeys` is present in the tracked
  sitemap/robots sources on this branch.
- The protected `/dev/mastery/*` routes and `/dev/mastery-generated` remain
  developer/prototype consumers. The admin artifact reviewer route remains an
  admin consumer. They were not changed.

#### Standalone frontend runtime and API surface

- `src/pages/quiz-mastery/MasteryJourneysPage.tsx` loads the standalone catalog
  and learner progress and renders Start/Resume/Replay/recommendation state.
- `src/pages/quiz-mastery/MasteryJourneyPlayerPage.tsx` validates public-catalog
  membership before mounting `MasteryPlayerLive`; this is the current guard
  against creating a session for an unpublished/unknown set.
- `src/features/mastery/live/MasteryPlayerLive.tsx` owns standalone session
  start/resume, current-question recovery, answer, advance, summary, and local
  presentation state.
- `src/features/mastery/live/api.ts` is the complete frontend client surface:
  - `GET /api/mastery/sets`
  - `GET /api/mastery/progress`
  - `POST /api/mastery/sessions`
  - `GET /api/mastery/sessions/:sessionId/current`
  - `POST /api/mastery/sessions/:sessionId/answer`
  - `POST /api/mastery/sessions/:sessionId/advance`
  - `GET /api/mastery/sessions/:sessionId/summary`
  - dev-only `POST /api/mastery/dev/generated-mastery-session`
  - admin `GET /api/admin/mastery/artifacts/:artifactDigest`
- No endpoint was disabled, redirected, or changed in Phase 1.

#### Shared code that must not be removed with the standalone player

The `src/features/mastery` directory is not synonymous with the retired
standalone runtime. Modern Journey/Ranked code currently imports and depends on:

- `MasteryAssetsProvider` / `MasteryAssets` from Journey components and
  `MasterySliceChallengeSurface`;
- prompt, comparison, question, and comparison-value contracts;
- interaction registry, inline reveal, prompt/comparison formatting, and
  reveal-state types/timing;
- player formatting and answer types used by the canonical Journey/Ranked
  surfaces and post-match review.

Future cleanup must first separate these shared presentation/contracts from
the standalone live session client. Deleting `src/features/mastery` wholesale
would break the modern Journey architecture.

#### Historical data and unique curriculum

- This change does not touch `mastery_sessions`, `mastery_session_answers`,
  any migration, any session/answer client method, or any data-retention path.
- Summoner Spell Mastery has no frontend-local curriculum copy to migrate or
  delete. Repository documentation locates its authority in the separate
  backend (`mastery/chains/summoner_spell_mastery.py`) and identifies it as the
  unique curriculum that must be preserved. No curriculum or serving flag was
  changed here.

### Journey Library placement conflict — decision required

Current `main` contains commit
`a2f9bd01906458bc2cada139f16fa34f3b1cf9d0` (2026-10-03), **Move Journey
Library entry from public Leaguecraft hub to admin Ranked > Playtests**. Its
current code says the permanent public product is undecided:

- the public `/quiz/journeys` route remains directly routable and ungated;
- `src/pages/Quiz.tsx` does not advertise it;
- `src/pages/admin/areas/AdminRankedPage.tsx` links it from Ranked > Playtests
  and explicitly describes it as not advertised publicly pending a decision.

Later commits that add public Journey Library metadata/sitemap discovery
(`50842ef1`, `2b1d57e5`, `49a6c396`) exist on other refs but are **not ancestors
of current `origin/main`**. Therefore this handoff's statement that Journey
Library is the public discovery destination conflicts with the current
mainline admin-only discovery decision.

No public navigation or route was changed. Product must choose one:

1. approve Journey Library as the public successor, restore a public
   `/quiz/journeys` discovery entry, and then remove the `/quiz/mastery` hub
   entry; or
2. keep Journey Library admin-discovered for now, in which case removing the
   only `/quiz/mastery` public entry would leave no approved public Journey
   discovery destination and that portion of Phase 1 must remain paused.

### Production-only verification (do not infer from source)

Before disabling session creation, redirecting player URLs, or choosing a
compatibility-window end date, inspect the production backend/database and
request logs for:

1. the exact production `/api/mastery/sets` response, including all public set
   ids/revisions and confirmation that Summoner Spell Mastery is still served;
2. `mastery_sessions` totals by set and lifecycle state, distinct owners,
   newest/oldest activity, and counts active or incomplete in recent time
   windows;
3. `mastery_session_answers` coverage for those sessions, including whether
   active sessions have resumable answers/reveals and whether orphaned rows
   exist;
4. recent authenticated traffic for catalog, progress, session creation,
   current/resume, answer, advance, and summary endpoints, separated by
   endpoint and status code;
5. the deployed backend version, publication registry, relevant flags, and
   actual session-expiry/resume rules.

The frontend `mastery_opened` event can show authenticated surface reach, but
it cannot prove production session creation, active-session age, answer
history, or safe retirement. Database/log inspection is required for those
facts. Use the real backend schema when writing queries; column names and
lifecycle semantics must not be guessed from the frontend response contracts.

### Smallest safe Phase 1 implementation

Implemented only the Phase 1 action independent of the discovery decision:

- both `/quiz/mastery` catalog and `/quiz/mastery/:masterySetId` player states
  now render `SEOHead` with `noindex, nofollow`;
- added regression coverage for the catalog and for the player while catalog
  membership is still unresolved;
- preserved all routes, navigation, session/resume behavior, endpoints,
  internal compatibility links, historical records, and curriculum.

Modified files:

- `src/pages/quiz-mastery/MasteryJourneysPage.tsx`
- `src/pages/quiz-mastery/MasteryJourneyPlayerPage.tsx`
- `src/pages/quiz-mastery/MasteryJourneys.test.tsx`
- `MASTERY_RETIREMENT_HANDOFF.md`

### Verification results

- Focused test:
  `vitest run src/pages/quiz-mastery/MasteryJourneys.test.tsx` — **PASS**,
  1 file, 21/21 tests.
- Broader relevant test run:
  `vitest run src/features/mastery src/pages/quiz-mastery
  src/App.journeyLibraryRoute.test.ts src/pages/Quiz.hub.test.tsx` — **FAIL**,
  38 files passed / 1 failed; 441 tests passed / 1 failed (442 total).
  The only failure is the unrelated existing assertion
  `Quiz.hub.test.tsx:189`, which expects one `LEAGUECRAFT` `h1` but observes
  zero. In the same file, **Mastery** navigation and **Journey Library
  placement** tests passed. No changed file contributes to the failed render.
- ESLint on the three modified TypeScript/TSX files — **PASS**, no output.
- `tsc --noEmit -p tsconfig.app.json` — **FAIL** on five existing unrelated
  errors: one in `src/components/onboarding/OnboardingProfile.tsx`, one in
  `src/lib/identity/connections.ts`, and three assertions reported across four
  lines in `src/lib/quiz/practiceLeaveContract.test.ts`. No error names a
  modified file.
- The first sandboxed focused-test attempt executed zero tests because Windows
  returned `EPERM` while resolving the shared pnpm store. Re-running with read
  access produced the passing 21/21 result above.
- `git diff --check` — **PASS** (only Windows LF-to-CRLF notices).

Backend tests and production smoke checks are not available in this frontend
checkout and were not fabricated.

### Blockers and next exact action

Blockers for the remaining Phase 1 discovery change and all later phases:

- product decision on public Journey Library discovery versus the current
  admin-only placement;
- production database/session/log inspection and a resulting compatibility
  window;
- a canonical modern home for Summoner Spell Mastery before legacy runtime or
  API removal.

**Next exact action:** obtain the Journey Library placement decision. If public
discovery is approved, update the single `src/pages/Quiz.tsx` utility link and
its focused hub tests from `/quiz/mastery` to `/quiz/journeys` (without
redirecting or disabling either legacy route), then run the focused hub,
Journey Library, Mastery, lint, and typecheck gates. Separately, arrange
read-only production backend/database inspection before proposing Phase 2-4
dates or endpoint changes.
