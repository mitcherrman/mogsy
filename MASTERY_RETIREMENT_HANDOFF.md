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

### Journey Library placement history and superseding decision

**Status: resolved by the later October 7 product decision.** The October 3
context and the October 8 audit finding are preserved below because they
explain why the first Phase 1 commit intentionally stopped before changing
public discovery.

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

At that audit point, no public navigation or route was changed and the two
available choices were:

1. approve Journey Library as the public successor, restore a public
   `/quiz/journeys` discovery entry, and then remove the `/quiz/mastery` hub
   entry; or
2. keep Journey Library admin-discovered for now, in which case removing the
   only `/quiz/mastery` public entry would leave no approved public Journey
   discovery destination and that portion of Phase 1 must remain paused.

The user's newer explicit October 7 retirement decision selects option 1 and
supersedes the October 3 deferral: standalone Mastery is retired as a public
product and `/quiz/journeys` is the public Journey destination. The October 3
admin placement remains useful historical context, not the controlling product
decision for this workstream.

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
- `tsc --noEmit -p tsconfig.app.json` — **FAIL** on six existing unrelated
  diagnostics: one in `src/components/onboarding/OnboardingProfile.tsx`, one
  in `src/lib/identity/connections.ts`, and four assertions in
  `src/lib/quiz/practiceLeaveContract.test.ts`. No error names a modified
  file.
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

The placement-decision portion of this paragraph was completed by the
superseding October 7 decision and the continuation update below. The
production-inspection requirement remains open.

---

## 2026-10-08 continuation — public Journey discovery

### Starting state and drift

- Fetched and pruned `origin` before making this continuation's changes.
- The existing unpushed Phase 1 commit was preserved at
  `58822892feb2e44681fa72aef4cc780d9647b08d`; the worktree was clean and the
  local branch was one commit ahead of its remote before this continuation.
- `origin/journeys/mastery-retirement-plan` remains
  `c40aa9162a661f29146a30285dcfc98df7750d20`.
- `origin/main` remains
  `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33`; it has not moved since the
  previous audit. Current history comparison reports two branch-only and six
  main-only commits from the merge base. No main commit was merged, rebased,
  cherry-picked, or overwritten.

### Journey Library functional verification

The public route was verified beyond route existence:

- `GET /api/journeys` is an identity-free read in the shared Ranked client;
  mutating launch calls use the established `ranked_write` authentication
  boundary.
- Signed-out and anonymous-guest UI tests prove the catalog remains browsable,
  Start displays the account gate, auth links return to `/quiz/journeys`, and
  no launch request is sent.
- Signed-in Free-account tests prove there is no Premium client gate and the
  exact `(recipe_id, recipe_version)` is sent to the server.
- Server refusal tests cover 401/403 account requirements, stale/inactive
  versions, unavailable content, an existing active match, and rate/feature
  failures. Stale or unavailable content fails closed; the client does not
  silently substitute or retry a different version.
- Browser certification covers desktop/mobile browsing, filtering, unavailable
  cards, signed-out gating with zero launches, exact-version launch into the
  existing Ranked arena, persisted `journey_library` host recovery, return to
  the Library, and History labelling.
- A read-only request to the repository-configured production backend
  (`web-production-83e53.up.railway.app`) returned HTTP 200,
  `journey_library_list.v1`, 14 active Journeys, and 14/14 currently available.
  The list matched the captured approved recipe ids and versions.
- A production POST to the launch endpoint **without credentials** returned
  HTTP 401 `AUTH_REQUIRED` (`a verified session is required`). It created no
  authenticated match and confirms the deployed authorization boundary rejects
  signed-out launch attempts. No authenticated production launch was performed.

Conclusion: signed-out browsing, account-gated launch, deployed authorization,
approved-content availability, exact-version handling, and the canonical arena
handoff are sufficiently verified for a navigation-only discovery change.

### Active-workstream conflict check

- `origin/seo/journey-library-discovery` remains at `49a6c396`. Relative to
  current `origin/main`, its effective diff touches only
  `src/lib/seo/sitemap.ts` and `src/lib/seo/sitemap.test.ts`.
- This continuation does not touch those sitemap files, metadata, `App.tsx`,
  or any SEO/discovery commit. Nothing was cherry-picked or integrated.
- The older `journey-lib-admin-placement` worktree/branch still exists and
  explains the October 3 state. The October 7 decision supersedes its product
  placement; its files were not overwritten through branch integration.
- No Daily Challenge, Ranked gameplay, Creator Studio, Graph1, Pro Play, or
  other workstream files were changed.

### Navigation implementation

The existing quiet Leaguecraft utility-row link was reused without adding a
new panel or changing layout:

- destination: `/quiz/mastery` -> canonical `JOURNEY_LIBRARY_ROUTE`
  (`/quiz/journeys`);
- label: **Mastery Journey** -> **Journey Library**;
- test id/feature flag naming now describes Journey Library rather than the
  retired product;
- focused tests require exactly one Journey Library discovery link and no
  `/quiz/mastery` discovery link on the hub.

Preserved unchanged:

- `/quiz/mastery` and `/quiz/mastery/:masterySetId` route declarations;
- legacy catalog/player internal compatibility links and resume behavior;
- every legacy Mastery session API;
- `mastery_sessions`, `mastery_session_answers`, and all historical records;
- Summoner Spell Mastery;
- Daily Challenge and Journey/Ranked gameplay.

Changed files in this continuation:

- `src/pages/Quiz.tsx`
- `src/pages/Quiz.hub.test.tsx`
- `MASTERY_RETIREMENT_HANDOFF.md`

### Verification results

- Pre-change focused Journey Library contracts/page/route suite: **PASS**,
  4 files and 26/26 tests.
- Journey Library Chromium browser certification: **PASS**, 7/7 tests.
- Post-change focused hub discovery test: **PASS**, 1/1 selected test
  (29 unrelated tests skipped).
- Post-change Journey Library plus preserved legacy Mastery suite: **PASS**,
  5 files and 47/47 tests.
- Full `src/pages/Quiz.hub.test.tsx`: **baseline failure only**, 29/30 passed.
  The sole failure remains line 189's pre-existing expectation that the hub
  render contains one `LEAGUECRAFT` `h1`; it observes zero. The new Journey
  Library discovery test and updated hierarchy assertion pass.
- ESLint on `Quiz.hub.test.tsx` and the prior modified Mastery files: **PASS**.
- ESLint on `Quiz.tsx`: **baseline failure only**, 12 pre-existing
  `@typescript-eslint/no-explicit-any` errors and one pre-existing hooks warning.
  Linting committed pre-change `HEAD:src/pages/Quiz.tsx` through stdin produces
  the same 12 errors and one warning; only later line numbers shift because the
  navigation comment is shorter.
- `tsc --noEmit -p tsconfig.app.json`: **baseline failure only**, the same six
  diagnostics as the previous run: two unrelated generated-table typing errors
  (`OnboardingProfile.tsx`, `identity/connections.ts`) and four
  `historyAction: "PUSH"` errors in `practiceLeaveContract.test.ts`. No changed
  file is named.
- `git diff --check`: **PASS** apart from Windows LF-to-CRLF notices.

### Remaining production inspection and next exact step

The live Journey Library list/auth boundary is verified, but the legacy
retirement gates remain unchanged. Before redirecting existing Mastery URLs or
disabling legacy writes, production inspection must still establish:

- active/incomplete legacy session counts and recent activity;
- answer/reveal coverage and resume compatibility;
- endpoint traffic by status over an agreed compatibility window;
- the deployed legacy publication registry, including Summoner Spell Mastery;
- session expiry/resume semantics from the real backend schema.

**Next exact action:** perform the approved read-only production
`mastery_sessions` / `mastery_session_answers` and request-log inspection, then
define the compatibility window. Do not redirect legacy player/session URLs or
disable session creation until that evidence is reviewed. In parallel, product
still needs to select the canonical modern home for Summoner Spell Mastery
before Phase 3/4 removal work.

---

## 2026-10-08 production compatibility audit

This section is a read-only observation of the deployed system. It does not
infer production state from the frontend checkout.

### Audit starting point and safeguards

- The worktree was clean at `c68604d93427452b7e1aad410a87c72698e464f6`.
  Git ancestry checks confirm that both required commits are present:
  `58822892feb2e44681fa72aef4cc780d9647b08d` and
  `c68604d93427452b7e1aad410a87c72698e464f6`.
- No branch was merged, rebased, cherry-picked, pushed, or overwritten. No
  production configuration, session, database row, route, or deployment was
  changed. No credentials, owner ids, session ids, IPs, or request ids were
  printed or copied into this handoff.
- Database aggregates were run against SQLite URI
  `file:/data/lol_calc.db?mode=ro`. The deployed resolver was separately
  exercised over incomplete rows only to classify whether the production code
  can still resolve them; that code path performs reads and deterministic
  artifact construction only.

### Actual deployed backend identity and available access

- The frontend's configured production host is
  `web-production-83e53.up.railway.app`.
- Railway's domain ownership identifies the production service as **`web`** in
  project `sweet-analysis`, not the similarly named
  `League_Combat_Simulator` service. The latter currently has no public domain,
  so using its deployment metadata as the public backend identity would have
  been wrong.
- `web` is deployed from `mitcherrman/League_Combat_Simulator`, branch
  `master`, commit `f3a164f15ef440530000cd50db68eb9f986974b1`
  (successful deployment created 2026-10-07 23:51:31Z).
- Authorized access available for this audit: read-only Railway project,
  service/deployment metadata, HTTP and deployment logs, production-container
  shell reads, deployed source reads, and direct SQLite reads. There is no
  local `psql`/Supabase production database session and no separate external
  log sink visible from this worktree.
- An anonymous `GET /api/mastery/sets` reached that host and returned 401
  `AUTH_REQUIRED`, consistent with the deployed route's
  `require_verified_identity`. That response is an authorization result, not
  evidence of an empty catalog. No production user token was used.

### Deployed Mastery catalog

The catalog was instantiated inside the running production container from the
deployed registry at the deployed commit. It has exactly three public sets:

| Public set | Set id prefix | Steps | Display revision |
| --- | --- | ---: | --- |
| Ahri E vs Syndra E — Cooldowns, Haste & Burst | `mset_ebd7533f…` | 6 | `disprev_ahri-syndra-e.v2` |
| Olaf — cooldowns and mana, from level 1 to 11 | `mset_d7c1ccd7…` | 16 | `disprev_olaf-cooldown-mana-progression.v1` |
| Summoner spells — cooldowns, haste, and the sources that give it | `mset_bbb59f3c…` | 56 | `disprev_summoner-spell-mastery.v1` |

**Summoner Spell Mastery is therefore still deployed, public in the legacy
catalog, pinned by set/artifact identity, and resolver-valid.** Its authoritative
curriculum remains `mastery/chains/summoner_spell_mastery.py`; the registry
builds that source directly and does not contain a second question copy.

### Production session and answer aggregates

Snapshot time: 2026-10-08. The two source tables are `mastery_sessions` and
`mastery_session_answers` in `/data/lol_calc.db`.

- 41 sessions, 14 distinct owners.
- 12 completed; 29 incomplete (`24 question`, `5 reveal`).
- First creation: 2026-07-19 16:59:57Z.
- Last creation and last recorded activity: 2026-09-14 06:22:14Z.
- 148 recorded answers across 20 sessions: 125 correct, 0 marked hint-used.
  All 12 completed sessions account for 122 answers; eight incomplete sessions
  contain the remaining 26 answers.
- There are 15 stored curriculum identities. Four still resolve through the
  deployed registry; eleven are retired/unregistered identities.

Per-curriculum aggregate (hash prefixes are content identities, not user or
session identifiers):

| Curriculum / identity | Catalog state | Sessions | Users | Complete / incomplete | Answers | Last activity (UTC) |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `mset_aaf6c055…` | unregistered | 3 | 2 | 1 / 2 | 6 | 2026-07-20 16:01:46 |
| `mset_f4853f2b…` | unregistered | 8 | 4 | 4 / 4 | 28 | 2026-07-24 18:35:51 |
| `mset_25a343e4…` | unregistered | 3 | 2 | 1 / 2 | 14 | 2026-07-20 16:01:46 |
| `mset_2bb607c2…` | unregistered | 2 | 1 | 1 / 1 | 15 | 2026-07-20 16:01:46 |
| `mset_7ce81bc5…` | unregistered | 3 | 1 | 2 / 1 | 26 | 2026-07-20 18:03:59 |
| Lux — Final Spark (`mset_fe141742…`) | registered, non-public prototype | 3 | 1 | 2 / 1 | 29 | 2026-07-20 19:23:40 |
| Jarvan IV — Cataclysm (`mset_435999de…`) | registered, non-public prototype | 4 | 4 | 0 / 4 | 0 | 2026-07-21 22:01:39 |
| `mset_d7456fd4…` | unregistered | 4 | 4 | 0 / 4 | 0 | 2026-07-23 13:09:23 |
| `mset_8e377948…` | unregistered | 1 | 1 | 0 / 1 | 0 | 2026-07-23 13:33:50 |
| `mset_2f02e445…` | unregistered | 2 | 2 | 0 / 2 | 0 | 2026-07-23 19:01:00 |
| `mset_033c4c85…` | unregistered | 1 | 1 | 0 / 1 | 0 | 2026-07-23 19:21:55 |
| `mset_5216fd2f…` | unregistered | 4 | 3 | 1 / 3 | 24 | 2026-07-24 18:36:56 |
| Summoner Spell Mastery (`mset_bbb59f3c…`) | public | 1 | 1 | 0 / 1 | 6 | 2026-08-24 22:33:41 |
| `mset_4c10742e…` | unregistered | 1 | 1 | 0 / 1 | 0 | 2026-08-24 22:35:50 |
| Ahri vs Syndra v2 (`mset_ebd7533f…`) | public | 1 | 1 | 0 / 1 | 0 | 2026-09-14 06:22:14 |

Creation-date aggregate:

| UTC date | Sessions | Distinct users | Incomplete |
| --- | ---: | ---: | ---: |
| 2026-07-19 | 9 | 3 | 3 |
| 2026-07-20 | 13 | 2 | 8 |
| 2026-07-21 | 5 | 5 | 5 |
| 2026-07-23 | 6 | 2 | 6 |
| 2026-07-24 | 5 | 2 | 4 |
| 2026-08-24 | 2 | 1 | 2 |
| 2026-09-14 | 1 | 1 | 1 |

`completed = 0` is **not** equivalent to resumable. Running the deployed
`_published_for_session` resolver against every incomplete row produced:

- 7 resolver-valid sessions: four Jarvan prototype, one Lux prototype, one
  Summoner Spell Mastery, and one public Ahri-vs-Syndra v2 session;
- 22 sessions across eleven retired identities that fail with
  `MASTERY_SET_NOT_FOUND` because their pinned artifact is no longer in the
  deployed registry and has no resolvable generated recipe.

No identities or answer payloads were inspected. The 22 failures already exist
in production; this retirement branch did not cause them.

### Endpoint-log evidence and its boundary

- Railway HTTP logging is available: a capped unfiltered query returned 1,000
  production requests covering 2026-10-08 16:48:01Z–17:20:41Z. It is therefore
  incorrect to describe logging as unavailable.
- Exact 30-day queries returned no `/api/mastery/progress` or
  `/api/mastery/sessions` records. The only `/api/mastery/sets` record was this
  audit's anonymous GET, status 401 at 2026-10-08 17:18:29Z.
- Deployment-log search returned 72 records containing the word `mastery`, but
  sanitized request parsing found only that same audit GET; the others are
  startup/application messages, not request evidence.
- The accessible `web` service has only one successful deployment in its
  retained deployment list, beginning 2026-10-07 23:51:31Z. Railway's dynamic
  request paths are indexed by literal session URL, and the accessible query
  interface did not produce a wildcard/template aggregate. The unfiltered
  feed is capped and covered only about 32 minutes at current traffic volume.

Therefore the log result is **not “zero historical traffic.”** It establishes
no observed legacy request traffic in the accessible current-deployment
window beyond the audit probe. Earlier endpoint traffic and dynamic session
GETs are unobserved. Independently, database timestamps establish that no
successful Mastery answer/advance/create write has updated these tables after
2026-09-14 06:22:14Z.

### Deployed resume and expiry semantics, including the frontend

Backend at production commit `f3a164f1…`:

- `POST /api/mastery/sessions` calls `start_or_resume`. It returns the newest
  row for the authenticated owner and set where `completed = 0`; otherwise it
  creates a session. Resume and creation are therefore coupled behind one
  endpoint.
- There is no age predicate, expiry column, TTL, cleanup check, or last-activity
  cutoff in `find_active_session`. A resolver-valid incomplete session does not
  expire merely because it is old.
- Ownership is the verified JWT subject. Existing-session routes return the
  same 404 for missing and wrong-owner sessions.
- Current/answer/advance resolve the session's pinned artifact. A missing old
  artifact fails `MASTERY_SET_NOT_FOUND`; generated content can fail
  `MASTERY_GENERATED_SET_STALE` when canonical truth moved.
- Answers are immutable per step: the same answer is idempotent; a different
  second answer is 409. A reveal survives reload. Advance moves the
  server-owned cursor or completes the session.

Frontend at this branch:

- Opening an allowed legacy set always calls `startSession(setId)`. The browser
  does not select a session id from local storage; the backend chooses resume
  versus create.
- The parameterized public player first requires membership in the current
  `/api/mastery/sets` catalog. Consequently registered non-public prototypes
  are not reachable through `/quiz/mastery/:masterySetId`, even though their
  sessions remain resolver-valid; retained dev wrappers are their only current
  frontend seam.
- A restored reveal is rendered from the server and auto-advances on the modern
  interaction path. Conflicting submissions resync with `GET .../current`.
- Completed “Try again” invokes the same start call; because no incomplete row
  exists, the backend creates a fresh attempt.

### Can the modern Journey curriculum accommodate Summoner Spell Mastery?

Not with the deployed `JourneyRecipe` contract as it exists today.

- Every recipe requires `player` and `opponent` starts with **two different
  champions**.
- Its objective engines are the champion/matchup grammar over champion ability,
  stat, damage, and comparison families. It has no non-champion subject kind or
  summoner-spell curriculum reference.
- The Journey Library intentionally adds no content authority; it lists and
  launches approved `JourneyRecipe` versions as `mastery_slice` configs.
- The existing Ranked SSM decorator is also not a modern Journey recipe. It is
  a separate, flag-gated provider that reads the same
  `mastery/chains/summoner_spell_mastery.py` source.

Copying 56 SSM questions into Journey recipe JSON would create the duplicate
content authority this retirement plan forbids. The safe modern-home design is
to extend the Journey grammar/composer with a non-champion curriculum/reference
kind that consumes the existing pinned SSM artifact/provider (or an extracted
single canonical SSM content module). The existing chain remains the sole
question authority until that adapter and its identity/version rules are
designed and tested.

### Evidence-supported compatibility policy

1. **Now:** keep the completed Phase 1 discovery/noindex change. Preserve both
   legacy routes, all session/answer rows, all Mastery endpoints, and the SSM
   registry entry. Do not claim `completed = 0` means resumable.
2. **Before stopping new legacy attempts:** add an explicit backend
   compatibility mode that separates “resume an existing resolver-valid row”
   from “create a new standalone session.” The current combined
   `start_or_resume` endpoint cannot safely be disabled without also breaking
   resume.
3. **Grandfather resolver-valid sessions:** keep current/answer/advance/summary
   and artifact resolution for the seven verified sessions through the agreed
   window. Preserve historical rows indefinitely unless a separate retention
   decision and export exists.
4. **Decide the 22 broken rows explicitly:** choose whether to restore their
   pinned artifacts for true compatibility or document them as non-resumable
   historical attempts. A redirect cannot repair them, and silently counting
   them as resumable would be false.
5. **Do not retire SSM runtime/content:** first ship a modern, non-duplicating
   SSM home backed by the canonical source, verify migration/launch behavior,
   and preserve the existing incomplete SSM attempt.
6. **Observe before endpoint removal:** enable or obtain a route-template log
   query with enough retention to cover an agreed compatibility window. The
   current accessible logs begin with the October 7 deployment and cannot prove
   September or earlier read traffic. A reasonable initial gate is at least 90
   days after the last successful legacy write **and** 30 days of complete
   route-template logging with no non-audit use, but the clock cannot start from
   the currently incomplete log observation.

### Remaining decisions, unknowns, and next exact action

Required decisions:

- Restore the eleven retired artifact identities needed by the 22 incomplete
  rows, or formally classify those rows as preserved history but non-resumable.
- Approve the compatibility-window gate (the proposed minimum is 90 days after
  last write plus 30 days of complete endpoint logging).
- Choose the modern SSM adapter shape while keeping one content authority.

Still unknown:

- Authenticated legacy read traffic before the current deployment/log window.
- Dynamic current/summary GET traffic that does not update SQLite.
- Whether a separate Railway/observability export with longer HTTP retention
  exists outside the access available here.

**Next exact action:** in the backend workstream, design (without deploying)
an explicit retirement compatibility contract: resume-only start behavior,
resolver treatment for the eleven missing identities, and a Journey
non-champion SSM reference to the canonical curriculum. In parallel, obtain a
30-day-or-longer route-template log export. Do not alter production or redirect
legacy player URLs until those decisions are reviewed.
