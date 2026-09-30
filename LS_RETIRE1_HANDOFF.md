# LS-RETIRE1 — Standalone League Swipe Retirement (implementation handoff)

**Status:** Implemented and certified. One commit on branch `ls-retire1/retire-league-swipe`. **Not pushed.**
**Base:** `origin/main` @ `cb2ccff7` (NAV1-E2Q). This was confirmed current by `git fetch` before branching. It was **not** branched from local `main`, which is 255 commits behind.
**Worktree:** `C:\Users\mlmit\OneDrive\Desktop\mogsy\.worktrees\ls-retire1`
**Audit this implements:** `LS_RETIRE1A_HANDOFF.md`, included in this commit for traceability.
**Date:** 2026-09-29

## 0. Readiness

**✅ READY FOR SC-RENAME2.**

Standalone League Swipe (the old standalone "Meta Reflex") is gone from active product code:
- There is no page, no lib, and no route that renders it.
- No registry, hub card, profile section, CTA or sitemap entry still lists it.
- No mint reason or analytics emitter still refers to it.

The only remaining runtime `/league-swipe` references are the three redirect routes, plus one historical changelog string.

**Ranked/Daily Meta Reflex, Champion Card Duel, the backend, Supabase objects and migrations are byte-for-byte untouched.** The diff has 0 files under `supabase/`, `src/integrations/`, `ranked-core`, `ranked-public`, `quiz-ranked`, `ranked-arena`, the daily dirs, or any champion-card-duel dir.

SC-RENAME2 was **not** started.

---

## 1. Files removed (22)

```
src/pages/LeagueSwipeHub.tsx
src/pages/LeagueSwipeGame.tsx
src/pages/LeagueSwipeStats.tsx
src/pages/LeagueSwipeGame.test.tsx
src/pages/LeagueSwipeGame.focusedStat.test.tsx
src/pages/LeagueSwipeGame.idempotency.test.tsx
src/pages/LeagueSwipeGame.level.test.tsx
src/pages/LeagueSwipeGame.statDuel.test.tsx
src/pages/LeagueSwipeGame.verdictAuthority.test.tsx
src/pages/LeagueSwipeStats.test.tsx
src/pages/Quiz.metaReflex.test.tsx
src/lib/league-swipe/api.ts
src/lib/league-swipe/branding.ts
src/lib/league-swipe/devForcedPair.ts
src/lib/league-swipe/factualCategories.ts
src/lib/league-swipe/submissionId.ts
src/lib/league-swipe/deriveOnRead.test.ts
src/lib/league-swipe/devForcedPair.test.ts
src/lib/league-swipe/factualCategories.test.ts
src/lib/league-swipe/focusedStatModes.test.ts
src/lib/league-swipe/recordSwipeResult.idempotency.test.ts
src/lib/league-swipe/submissionId.test.ts
```

Per the approved decision, **no League Swipe read helper was relocated.** Shared contracts those tests guarded remain covered elsewhere (audit §10.1):
- Backend: `test_meta_reflex_routes.py`, `test_factual_duel.py`, `test_mrlvl1_level_aware_meta_reflex.py`.
- Frontend: `ChampionLevelBadge.test.tsx`, `metaReflexModule*.test.tsx`, `QuizRankedMatch.metaReflex.test.tsx`.

**Kept (shared):** `src/components/ChampionLevelBadge.tsx`. Ranked `metaReflexModule.tsx:29` still uses it; only its comment changed.

## 2. Companion edits (29 modified, 1 added)

| File | Change |
|---|---|
| `src/App.tsx` | Removed the 3 `LeagueSwipe*` component bindings and 3 page routes. Added 3 explicit `<Navigate to="/quiz" replace />` routes (§3). |
| `src/lib/route-prefetch.ts` | Removed the 3 lazy page imports, the `/league-swipe*` prefetch matchers, and `LeagueSwipeHub` from the `/lol` warm set. |
| `src/components/profile/LeaguePublicProfile.tsx` | Removed:<ul><li>the **Recent League Takes** section and its `fetchMyRecentResults` query (reads `league_swipe_results` + `verify-batch`)</li><li>the "View all swipe stats" button (`/league-swipe/stats`)</li><li>the Meta Reflex CTA button (`/league-swipe`)</li><li>the `prettyEntity` helper and 5 now-unused icons</li></ul>Rewrote the header comment. |
| `src/components/profile/LeaguePublicProfile.test.tsx` | Dropped the `@/lib/league-swipe/api` mock. Added a retirement suite: no takes section on own or other profile, no swipe/Meta Reflex text, and exactly two CTAs (Quiz, League Hub). |
| `src/pages/Quiz.tsx` | Removed the dead `metaReflex` hub flag (it was `false`), its card block, the branding import and the now-unused `Zap` icon. |
| `src/pages/Quiz.hub.test.tsx` | Comment refreshed. Added an assertion that no `a[href^="/league-swipe"]` renders. |
| `src/components/lol/HexTrainingHero.tsx` | Orphaned component (no importer). Removed its `swipe` mode, the `"swipe"` type member, the branding import, `Zap`, and the swipe-only "Community Pick" panel. The quiz and lab modes are unchanged. |
| `src/lib/startup-shell.ts` + `startup-shell.test.ts` + `Layout.themeIsolation.test.tsx` | Removed `/league-swipe*` from `isLolSectionPath` and its tests. The lookalike-path test is kept. |
| `src/lib/seo/sitemap.ts`, `public/sitemap.xml` | Removed the `/league-swipe` entry. The XML was hand-edited to match what `scripts/generate-sitemap.ts` now emits. |
| `src/pages/AdminDiagnostics.tsx` | Removed the `/league-swipe` route probe. |
| `src/lib/admin/analytics/metrics.ts` + test | `meta_reflex` is now `label: "Legacy Meta Reflex (retired)"`, `presentation: "retired"`, and its gap text was rewritten (§4). |
| `src/lib/analytics/activityLifecycle.ts` + test | `meta_reflex_round` now has `humanName: "Legacy Meta Reflex (retired)"`, `currentEvents: []`, and retired migration notes. |
| `src/lib/auth/anonymous-identity.ts` | Removed the unused `"meta_reflex_vote"` mint reason and its boundary-table row. |
| `src/test/funnel/canonicalSurfaces.test.tsx` | Removed the `LeagueSwipeHub` wiring row and dropped `meta_reflex_opened` from the single-emitter list. Added: `meta_reflex_opened` has **zero** emitters. |
| `src/test/guards/users1AudienceIdentity.test.ts` | Removed `LeagueSwipeGame.tsx` from the page list. Replaced "keeps Meta Reflex's mint at the vote" with "no longer mints for the retired standalone vote". |
| `src/test/guards/noRetiredMogsyArchitecture.test.ts` | Replaced `hits(/league-swipe/).length > 0` with `hits(/metaReflexModule/)` (current Ranked Meta Reflex). Added the **LS-RETIRE1** suite:<ul><li>no import of the retired namespace or pages</li><li>no `league_swipe_*` in runtime code</li><li>`/league-swipe` appears only in `App.tsx` (as exactly three `Navigate → /quiz` routes) and `lol-changelog.ts`</li></ul> |
| **NEW** `src/App.leagueSwipeRetirement.test.tsx` | Redirect contract against the real `appRouter.routes` (§3). |
| Comment/doc only | `ChampionLevelBadge.tsx`, `HexPanelLink.tsx`, `feedback/contract.ts` + test, `LolHub.tsx`, `LolHub.test.tsx`, `docs/NAV1_NAVIGATION_MATRIX.md` (row now reads "retired, redirect-only"), `docs/USERS2_ACTIVITY_LIFECYCLE.md` (retirement note; historical analysis kept). |

## 3. Redirect behaviour

```tsx
<Route path="/league-swipe" element={<Navigate to="/quiz" replace />} />
<Route path="/league-swipe/stats" element={<Navigate to="/quiz" replace />} />
<Route path="/league-swipe/:gameSlug" element={<Navigate to="/quiz" replace />} />
```

- **Placement and matching.** The routes sit inside the Layout group, in the original route position. Because they are declared explicitly, the bare `/league-swipe` is claimed by its own route and never reaches the root `/:slug` invite-link resolver (`CustomLink`). Nothing falls to `*`.
- **REPLACE.** Browser Back skips the retired URL.
- **Unit contract** (`App.leagueSwipeRetirement.test.tsx`, 12 tests, all green):
  - `matchRoutes(appRouter.routes, …)` resolves `/league-swipe`, `/league-swipe/`, `/league-swipe/stats`, `/league-swipe/item-cost-duel` and `/league-swipe/favorite-champion?forcePair=a,b` to the explicit redirect routes, never `/:slug` or `*`.
  - Each element is `Navigate` with `to="/quiz"` and `replace`.
  - Rendering the registered elements lands on `/quiz` with `historyAction === "REPLACE"`, and the `/:slug` stub is never rendered.
  - No `/league-swipe*` route registers a non-`Navigate` element.
- **Browser, real dev server** (`vite` on the worktree, port 8093):
  - All three URLs landed on `/quiz` after one hop; `history.length` grew by exactly 1 per visit.
  - For bare `/league-swipe`, the page's resource list (250 entries) contained no `invite_links` request, no `CustomLink` chunk, no `league_swipe`, no `meta-reflex` and no `LeagueSwipe` chunk.
- **Pre-existing behaviour, unchanged.** A visitor who has not opened `/lol` this session is sent from `/quiz` on to `/lol` by `Quiz.tsx:804` (`redirect_to_hub`, identical on `origin/main`). A first-time visitor following an old bookmark therefore ends up exactly where a first-time visitor to `/quiz` does. The legacy URL itself never renders a broken or ambiguous page.

## 4. Analytics treatment

- **Nothing persisted was renamed.**
  - `meta_reflex_opened`, `meta_reflex_started` and `meta_reflex_completed` stay registered in `src/lib/analytics/contract.ts`.
  - The `meta_reflex` metric id and the `meta_reflex_round` activity id are kept.
  - Historical `analytics_events` rows stay governed.
- **Admin presentation.**
  - The `meta_reflex` branch is labelled **"Legacy Meta Reflex (retired)"** with `presentation: "retired"`, following the existing "Daily Score Attack (retired)" precedent.
  - It is excluded from `CURRENT_GAMEPLAY_MODES`, so it is never shown as a current gameplay mode.
  - Population drill-downs that resolve through `GAMEPLAY_MODES` show the retired label.
- **Emitters.** The only emitter, `LeagueSwipeHub.tsx`, is deleted. `canonicalSurfaces.test.tsx` now asserts that zero files emit `meta_reflex_opened`. Ranked/Daily Meta Reflex is measured inside `ranked_*` / Daily, as before.

## 5. Retained DB and backend artifacts, and why

| Artifact | Why it stays |
|---|---|
| Tables `league_swipe_games`, `_matchups`, `_results`, `_entity_ratings`, `_preferences` + RLS, grants, indexes, FKs | Historical persistence. No drop, per decision. Now write-dormant, since nothing calls `record_league_swipe_result`. |
| Functions `record_league_swipe_result` (v2), `get_league_swipe_stats`, `league_swipe_derived_rating`, `league_swipe_recompute_ratings` | Historical and operator tooling. No frontend caller remains. |
| All 7 migrations (`20260710120000_league_swipe.sql`, `20260710130000_funnel_events.sql`, `20260711090000_league_swipe_stats.sql`, `20260813120000…0300_meta_reflex_*.sql`) | Immutable schema history; migrations are hand-applied. **`20260813120000_meta_reflex_reset_test_data.sql` TRUNCATEs League Swipe play tables and must never be replayed.** The only sanctioned future change is the `20260710120000 → 20260710120100` version-collision rename inside the separately authorised ledger backfill. |
| `src/integrations/supabase/types.ts` League Swipe entries | Generated from the live schema; they must match while the tables exist. |
| Backend `GET /api/meta/champions`, `GET /api/meta/champion-stats` | **Shared.** Used by Combat Lab, League Docs, Champion Card Duel and the build scripts. |
| Backend `GET /api/meta-reflex/factual/categories`, `GET …/factual/pool/{id}`, `POST …/factual/verify`, `POST …/factual/verify-batch` | **UNUSED after this frontend retirement.** They had no other frontend caller; the profile was the last `verify-batch` caller and is removed. Left in place for a later backend-only cleanup task. **Keep `factual_duel.py`**: Ranked/Daily content uses its champion-stat helpers (`meta_reflex_content.py:70`, `ranked_formats/schema.py:1221`). |

## 6. Verification results

Per the owner's instruction, the entire 824-file suite was **not** run: it hit JavaScript heap OOM twice on this 15 GB machine. A targeted, serial (`--no-file-parallelism`) regression strategy was used instead. **Every failing test was reproduced on a pristine `git archive` snapshot of `origin/main` @ cb2ccff7.**

| Gate | Result |
|---|---|
| **Batch 1 — directly affected** (22 files: the new redirect test, App routing/data-router/guards/startup/CCD route tests, `components/profile/*`, Quiz hub, startup-shell, Layout theme, canonical surfaces, both guards, admin analytics, activity lifecycle, HexTrainingHero, feedback contract, LolHub, SEO, adminQuizRetirement) | 372 pass / 11 fail. **All 11 reproduce identically on baseline:** `App.routing-contract` ×2 (`/multiplayer`, known), `feedback/contract` ×5 (DB CHECK mirror), `users1AudienceIdentity` ×2 (`types.ts` / `is_human` scans), `Quiz.hub` h1 ×1, `LeagueProfileStats` guest ×1. Every League Swipe assertion is green. |
| **Batch 2a — Ranked core/public, Daily, level badge** (86 files) | **1148 / 1148 pass.** 2 vitest-internal `Timeout calling "onTaskUpdate"` RPC errors under load (a known repo symptom), not test failures. |
| **Batch 2b — `quiz-ranked` + `ranked-arena`** (98 files) | 1175 pass / 7 fail. **All 7 reproduce identically on baseline** (`AnswerGrid.elimination`, `DailyOnCanonicalArena.boundary`, `QuestionStageGeometry`). |
| **Batch 3 — `components/quiz` (Meta Reflex review/timeline) + Champion Card Duel** (64 files) | 1381 pass / 4 skipped / 20 fail. **All 20 reproduce identically on baseline** (`QuestionTimeline` MALT B1 ×14 and `ChampionCardDuelPage` item UI ×3, both 5 s timeouts; `statCategoryIcons` ×1; `playModeCard.styles` ×2). None of these files imports anything this change touched. |
| **Batch 4 — profile/routing/analytics/admin/guards/security** (67 files) | 64 files ran (1072 pass / 24 fail) before a worker hit heap OOM. **All 24 reproduce identically on baseline** (`test/security/*` migration and fence scans, `noStaticLeagueFacts`, `Quiz.rankedRole` ×1). Of the 3 unrun files, `play1DirectorSchema` (21/21) and `users2SessionIntelligenceSchema` (3/3) pass alone. `pt2cProfileFrameAuthority` OOMs even alone **on baseline as well**; it only reads `supabase/migrations`, which this change does not touch. |
| **Typecheck** `tsc --noEmit -p tsconfig.app.json` | 6 errors, **identical set to baseline**, all in untouched files (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts`). |
| **Lint** (eslint on all 27 changed/new TS files; same files at baseline) | 17 problems, both before and after; **identical findings** ignoring line shifts. No new findings; the new test file is clean. |
| **`vite build`** | ✅ 4620 modules, built in 1m17s. **No `LeagueSwipe*` chunk emitted.** `league-swipe` appears only in `index-*.js` (redirect routes) and `LolDevChangelog-*.js` (historical text). |
| **Browser — redirects** | ✅ See §3. |
| **Browser — profile** | `/user/:profileId` is behind `ProtectedRoute`. Rendering a real profile would mean signing in to production Supabase or browsing a real user's production profile, and neither was done. With a placeholder id, the route rendered its normal "Profile not found" shell with no swipe text and no `/league-swipe` links. The profile component itself is certified by `LeaguePublicProfile.test.tsx`: own and other profile, no takes section, no swipe/Meta Reflex text, and exactly the Quiz and League Hub CTAs. |
| **No active import of `src/lib/league-swipe`** | ✅ `git grep "from '…league-swipe"` is empty. The guard test enforces this permanently. |

**Environment notes:**
- Several baseline failures, such as "applied migrations stay byte-identical", are consistent with this Windows checkout's CRLF working-tree line endings. They are **not** related to this change.
- The npm `build` script's `prebuild` step (`generate-sitemap.ts`) was deliberately not run, because it rewrites `public/sitemap.xml` from live backend data. It reads `seo/sitemap.ts`, which no longer lists `/league-swipe`, so the next real build emits the same removal.

## 7. Residual search certification

Search: `League ?Swipe | LeagueSwipe | league_swipe | league-swipe` (case-insensitive) over the committed tree.

| Location | Class |
|---|---|
| `supabase/migrations/20260710120000_league_swipe.sql`, `20260710130000_funnel_events.sql`, `20260711090000_league_swipe_stats.sql`, `20260813120000/100/200/300_meta_reflex_*.sql` | Historical migration / database persistence |
| `src/integrations/supabase/types.ts` (19) | Generated database types |
| `src/App.tsx` (3 routes + JSX comment) | Intentionally retained legacy redirect |
| `src/lib/lol-changelog.ts:84` | Non-active compatibility artifact: a historical changelog `routes` list rendered as `<code>` text, not a link |
| `src/lib/admin/analytics/metrics.ts`, `src/lib/analytics/activityLifecycle.ts` | Explicitly retired analytics/history presentation ("Legacy Meta Reflex (retired)") |
| Comments in `LeaguePublicProfile.tsx`, `HexPanelLink.tsx`, `feedback/contract.ts`, `ChampionLevelBadge.tsx`, `LolHub.tsx`, `HexTrainingHero.tsx` | Historical documentation (comments stating the retirement) |
| Tests: `App.leagueSwipeRetirement`, `noRetiredMogsyArchitecture`, `users1AudienceIdentity`, `canonicalSurfaces`, `LeaguePublicProfile`, `Quiz.hub`, `LolHub`, `feedback/contract` | Retirement guards (negative assertions and redirect contract) |
| `LEGACY1_HANDOFF.md`, `USERS1_HANDOFF.md`, `docs/FUNNEL1_HANDOFF.md`, `docs/MOGZY_HUB_REDESIGN_HANDOFF.md`, `docs/USERS1_PRODUCTION_SQL.md`, `docs/community-reconciliation-checks.sql`, `docs/gr1-…audit.md`, `docs/meta-reflex/*.md`, `LS_RETIRE1A_HANDOFF.md`, this file | Historical documentation |
| `docs/NAV1_NAVIGATION_MATRIX.md`, `docs/USERS2_ACTIVITY_LIFECYCLE.md` | Current docs, updated to state the retirement |

**Zero active product/runtime code treats League Swipe as a current game mode.** This is enforced by the `LS-RETIRE1` suite in `noRetiredMogsyArchitecture.test.ts`:
- no import of the namespace or pages;
- no `league_swipe_*` in runtime code;
- `/league-swipe` only as the three `Navigate → /quiz` routes plus the changelog.

Its companions: `canonicalSurfaces` (zero `meta_reflex_opened` emitters), `users1AudienceIdentity` (no `meta_reflex_vote` minting) and `App.leagueSwipeRetirement`.

## 8. ⚠️ Stale-branch warning — do not resurrect removed files

These branches' **own commits** (since their merge-base with `origin/main`) modify files this change deletes. Merging or rebasing any of them onto a post-LS-RETIRE1 main will raise **modify/delete conflicts**.

**Resolve every such conflict as DELETE.** Do not replay their League Swipe content.

| Branch | LS files modified | Last commit |
|---|---|---|
| `codex/sh11a-foundation` | 4 | 2026-09-21 |
| `codex/sh11b-daily` | 4 | 2026-09-21 |
| `codex/sh12-personalized` | 4 | 2026-09-21 |
| `codex/sh13-mastery-matchup` | 4 | 2026-09-21 |
| `dcmod/d-hub`, `origin/dcmod/d-hub` | 4 | 2026-09-21 |
| `envvis1-batch1-scene-channel` | 4 | 2026-09-20 |
| `mrlvl1-phase3-level-badge` | 4 | 2026-09-20 |
| `sc-rename1-phase1` | 5 | 2026-09-28 |
| `sc-rename1-integration` | 1 | 2026-09-29 |

Most of these carry pre-USERS1 / MRLVL1-era copies of `LeagueSwipeGame.tsx`, `league-swipe/api.ts` and the level/focusedStat tests. Examples: a `signInAnonymously` mount effect that USERS1 deliberately removed, and changes already on main as `7bc6581b`.

**SC-RENAME2 in particular must start from post-LS-RETIRE1 main, not from `sc-rename1-*`.**

The guard suite and `rg -n "league-swipe|LeagueSwipe" src` catch any resurrection.

## 9. Rollback

- **Code:** `git revert <LS-RETIRE1 commit>`, then redeploy the frontend. This restores all 22 files, the routes, registries, profile section and analytics labels byte-for-byte.
- **Data:** none needed. No Supabase object, grant, RLS policy or row was touched, so a reverted frontend resumes reading and writing immediately.
- **Backend:** none needed. No backend file was touched, and the `/api/meta-reflex/factual/*` endpoints are still deployed.
- **Sitemap:** the revert restores `seo/sitemap.ts` and `public/sitemap.xml`; the next build regenerates it anyway.

## 10. Notes for SC-RENAME2

- Ranked/Daily Meta Reflex is untouched and still named "Meta Reflex". The full Meta Reflex → Stat Check rename is SC-RENAME2's job.
- **Naming collision to resolve there:** Champion Card Duel already owns `/quiz/stat-check*` and `/dev/stat-check`, and the frozen mint id `"stat_check_room"`.
- `/league-swipe*` must remain redirect-only. Do not reuse it for Stat Check.
- The `meta_reflex_*` analytics names and ids are persisted history. Do not rename them as part of a UI rename.

## 11. Integration onto current `origin/main` (2026-09-30)

- **Starting `origin/main`:** `b8651dbe2182d7684cdd9401585dacf6c423d040` (NAV1-WK1). Original retirement base was `cb2ccff7`.
- **Branch / worktree:** `ls-retire1/integration-main` at `.worktrees/ls-retire1-int`. Not pushed.
- **Main since `cb2ccff7`:** exactly one commit (`b8651dbe`), touching only `docs/NAV1_*`, `docs/NAV1_WK1_WEBKIT_HANDOFF.md` and `e2e/nav1/*`. It has zero file overlap with the retirement.
- **Method:** `git cherry-pick 37edf9f4` → clean, **0 conflicts**. Nothing hand-resolved; no League Swipe file restored.
- **Protected paths:** `git diff b8651dbe..HEAD` touches nothing under `supabase/`, `src/integrations/`, `backend/`, ranked/daily/champion-card-duel code.

### Certification
| Gate | Result |
|---|---|
| `vite build` | ✅ succeeds; no `LeagueSwipe*` chunk. `league-swipe` only in `index-*.js` (3 redirects) and `LolDevChangelog-*.js` (history). |
| Retirement / App routing / profile / analytics-admin / guards / Quiz hub / funnel / feedback (45 files) | 646 pass / 12 fail. New `App.leagueSwipeRetirement.test.tsx` and all retirement assertions green. |
| Ranked/Daily Meta Reflex + Champion Card Duel + quiz components + level badge (124 files) | 2080 pass / 16 fail (`playModeCard.styles` ×2, `QuestionTimeline` MALT B1 ×14; none import touched code). |
| Baseline compare | All 12 + 16 failures reproduce on a pristine `b8651dbe` checkout using the same `node_modules`. Exception noted: a second pristine checkout with its **own** install passed `LeagueProfileStats` guest and `QuestionTimeline`, but a pristine `b8651dbe` using the shared `node_modules` fails them identically (15/15), so that difference is environment (install), not this change. |
| Remaining baseline failures | `App.routing-contract` ×2, `feedback/contract` ×5, `Quiz.hub` h1, `noStaticLeagueFacts`, `users1AudienceIdentity` ×2, `playModeCard.styles` ×2 — identical on pristine `b8651dbe`. |

### Residual search (`League ?Swipe|league_swipe|league-swipe`, excluding `supabase/` and generated types)
Runtime code: `App.tsx` (3 redirects + comment), `lol-changelog.ts` (historical string). Comments only: `HexPanelLink`, `LeaguePublicProfile`, `metrics.ts`, `activityLifecycle.ts`, `feedback/contract.ts`. Tests/guards asserting absence or redirect: `App.leagueSwipeRetirement`, `noRetiredMogsyArchitecture`, `LeaguePublicProfile`, `Quiz.hub`, `LolHub`, `canonicalSurfaces`, `users1AudienceIdentity`, `feedback/contract.test`. Docs/handoffs: historical. **No import of `src/lib/league-swipe`; no active implementation.**
