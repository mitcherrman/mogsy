# LS-RETIRE1A — Standalone League Swipe Retirement: Safety Audit Handoff

**Type:** Safety audit only. No source code was deleted, renamed, moved, modified or committed. This file is the only artifact, and it is uncommitted.
**Date:** 2026-09-29
**Frontend baseline:** `origin/main` @ `cb2ccff7` (NAV1-E2Q). This was read from a `git archive` snapshot and cross-checked against clean worktrees at the same commit.
**Backend baseline:** `League_Combat_Simulator` `origin/master` @ `1002230a`, read with `git grep` / `git show`. Production entry point: `uvicorn api_server:app`.

> ⚠️ **Baseline warning for the implementer:** local `main` in `C:\Users\mlmit\OneDrive\Desktop\mogsy` is **stale**. It is 14 commits ahead of `origin/main` and **255 behind**, last updated 2026-09-20. The OneDrive checkout is on `envvis1-batch1-scene-channel` with uncommitted edits. LS-RETIRE1B **must branch from `origin/main`**, not local `main`.

---

## 0. Verdict

## ✅ SAFE TO IMPLEMENT — as the scoped change in §6/§7, not as a bare file deletion

**Nothing current depends on standalone League Swipe:**
- Ranked Meta Reflex, Daily Meta Reflex, Practice and Champion Card Duel have **zero** runtime, persistence or backend dependency on it (proof in §2).
- No SQL object, trigger, cron job, edge function or backend service expects the frontend to keep using it.

**The one live-product dependency is on the profile page.** It is **not** in Ranked. `LeaguePublicProfile` (rendered on `/user/:profileId`) does three things:
- reads `league_swipe_results` through `@/lib/league-swipe/api`;
- calls the League-Swipe-only backend `verify-batch`;
- shows two live buttons into `/league-swipe*`.

It must be edited **in the same change**, following Decision **D1** in §12.

A bare deletion of the files in §6 (without the §7 edits) is **NOT safe**. It breaks the Vite build (`route-prefetch.ts`, `App.tsx`, `Quiz.tsx`, `LeaguePublicProfile.tsx`, `HexTrainingHero.tsx`) and fails about 12 test files.

There are no technical blockers, only four owner decisions (§12). Each one has a recommended default.

---

## 1. Answers to the ten required questions

**1. Does current Ranked/Daily Meta Reflex import ANY League Swipe frontend code? — NO.**
- `src/lib/ranked-core/modules/metaReflexModule.tsx:27-43` imports only react, lucide, `@/components/ChampionLevelBadge`, `@/components/ranked-arena/MetaReflexSting`, `@/lib/quiz/api`, ranked-core `timerMath`/`viewTypes`, `ranked-public/contracts` and `./types`.
- A grep for `league.swipe` across `lib/ranked-core`, `lib/ranked-public`, `lib/daily-challenge`, `pages/quiz-ranked`, `pages/quiz-daily-challenge`, `components/ranked-arena`, `components/quiz` and `lib/quiz` finds **0 hits**.
- The only shared module is `src/components/ChampionLevelBadge.tsx`. It lives **outside** the League Swipe namespace, has no imports, and must be kept.
- `Quiz.tsx` imports the branding constants, but it is the `/quiz` hub (`App.tsx:515`), not the Ranked match (`/quiz/ranked`) or Daily (`/quiz/daily-challenge`). The only use is a card behind `HUB_MODULES.metaReflex: false` (`Quiz.tsx:135`) that never renders.

**2. Does Ranked/Daily depend on any `league_swipe_*` table, RPC, view, config or stored data? — NO.**
- Every `league_swipe_*` table read, and both RPCs (`record_league_swipe_result`, `get_league_swipe_stats`), are called only from `src/lib/league-swipe/api.ts` (lines 655, 670, 676, 717, 743, 878, 988).
- Ranked persistence is the Railway backend. It uses `POST /api/ranked/matches/{id}/segments/{n}/challenges/{i}` (`ranked-public/client.ts:455-537`, called from `useRankedMatch.ts:1235`).
- Daily uses `/api/daily-run` (`lib/daily-challenge/run/client.ts:73,127-134`) and renders through `QuizRankedMatch`.
- No `ranked_*`, `quiz_*`, `daily_*` or stat-check SQL object references `league_swipe_*`.
- The 2026-08-13 `meta_reflex_*` migrations are **standalone League Swipe** migrations; each file's header says "Meta Reflex (internally League Swipe)".

**3. Does League Swipe merely consume shared factual APIs, or does current Meta Reflex depend on League-Swipe-specific backend infrastructure? — League Swipe is a consumer only.**
- Ranked Meta Reflex never calls `/api/meta-reflex/*`. It receives its cards inside the Ranked round payload.
- On the backend, Ranked shares the **Python module** `factual_duel.py`, specifically its champion-stat helpers:
  - `meta_reflex_content.py:70` imports `champion_stat_growth_column`, `champion_stat_value_at` and `champion_stat_variants`;
  - `ranked_formats/schema.py:1221` imports `champion_stat_variants`.
- Ranked does **not** share the `/api/meta-reflex` routes.
- The backend never reads or writes `league_swipe_*`.

**4. Which API endpoints are genuinely shared versus League-Swipe-only?**

| Endpoint | Defined (backend `origin/master`) | Non-LS frontend callers | Classification |
|---|---|---|---|
| `GET /api/meta/champions` | `routes/meta.py:47` | Combat Lab (`combat-lab/api.ts:553`), `CombatLabDiagnostics.tsx:279`, build scripts (`generate-sitemap.ts:61`, `prerender-champions.ts:45`, `generate-ability-icon-map.ts:49`) | **SHARED — B** |
| `GET /api/meta/champion-stats` | `routes/meta.py:202` | `league-docs/api.ts:38` → `useChampionBaseStats`, used by League Docs pages and Champion Card Duel (`dev/champion-card-duel/ChampionCardDuelPage.tsx:209`) | **SHARED — B** |
| `GET /api/meta-reflex/factual/categories` | `routes/meta_reflex.py:42` | none (no frontend caller at all) | LS-family, unused. Keep for now. |
| `GET /api/meta-reflex/factual/pool/{id}` | `routes/meta_reflex.py:74` | none | **LS-only.** Keep for now; retire later in a separate backend task. |
| `POST /api/meta-reflex/factual/verify` | `routes/meta_reflex.py:187` | none | **LS-only.** Keep for now. |
| `POST /api/meta-reflex/factual/verify-batch` | `routes/meta_reflex.py:242` | `LeaguePublicProfile.tsx:141`, indirectly through `fetchMyRecentResults` | LS-only **after D1**. Keep. |
| `factual_duel.py` (module) | — | — | **SHARED with Ranked/Daily — B** |

**5. Can all three public routes be removed without breaking internal links, redirects, auth return paths, bookmarks or navigation? — YES, provided the §7 edits land in the same change.**
- **Internal links.** The only *live* senders are the two buttons on `LeaguePublicProfile` (`:311` → `/league-swipe/stats`, `:341` → `/league-swipe`). The Quiz hub card is flag-off and `HexTrainingHero` is orphaned (its only importer is its own test).
- **Redirects.** No existing `<Navigate>` targets `/league-swipe`. There is no `vercel.json`, `netlify.toml`, `_redirects` or `_headers` file.
- **Auth return paths.** There is no allow-list: `resolveReturnTo` accepts any same-origin path.
  - The HUD signup link carries the current pathname (`lib/hud/identity.ts:34`).
  - A pending upgrade stores `returnTo` in localStorage (`lib/auth/account-upgrade.ts:60-95`).
  - A user mid-signup at deploy time could return to a dead URL. The redirect below covers this.
- **Bookmarks (fall-through behaviour if the routes are simply deleted):**
  - Bare `/league-swipe` is caught by the root `/:slug` route (`App.tsx:655`). `CustomLink` queries `invite_links` for code `LEAGUE-SWIPE`, shows a loading flash, then renders NotFound. That is a wasted Supabase query.
  - `/league-swipe/stats` and `/league-swipe/:slug` fall to `*` NotFound (`App.tsx:656`). NotFound is a soft 404: `noindex`, HTTP 200.
  - **Recommendation (D2):** add explicit `<Navigate replace>` routes, following the precedent at `App.tsx:517` (`/quiz/daily` → `/quiz/daily-challenge`).

**6. Would any user records, history or analytics surfaces crash or render incorrectly if the League Swipe UI disappears? — Only `LeaguePublicProfile`, which fails at compile time rather than crashing at runtime.**
- It imports `fetchMyRecentResults`, `SwipeOwnResult` and `META_REFLEX_NAME` from League Swipe, and renders "Recent League Takes" (own profile only).
- `LolHistory` and Ranked history do **not** read `league_swipe_*`.
- Admin feedback shows `page_url` as plain text (`AdminFeedback.tsx:588`), so old feedback rows from `/league-swipe` pages still render.
- Admin analytics would keep showing "Meta Reflex" as a *current* branch with zero opens. That is misleading but not broken (see D3).
- `lol-changelog.ts:84` lists `/league-swipe` as `<code>` text, not a link.

**7. Are route-prefetch, lazy-loading, sitemap, SEO, admin or analytics registries assuming the pages exist? — YES. All are listed in §7 and all are fixable in the same change.**
- `route-prefetch.ts:59-61` (lazy imports) and `:113-116` (`/lol` warms `LeagueSwipeHub`, plus the three `/league-swipe*` matchers).
- `App.tsx:75-77, 532-534`.
- `startup-shell.ts:51-52` (`isLolSectionPath`).
- `seo/sitemap.ts:49` and the generated `public/sitemap.xml:69`.
- `AdminDiagnostics.tsx:49` (route probe).
- `admin/analytics/metrics.ts:145-154`, `analytics/activityLifecycle.ts:94-105`, `analytics/contract.ts:66,75-76`.
- `test/funnel/canonicalSurfaces.test.tsx:219,235`.

**8. Does any League Swipe test cover shared functionality that must survive elsewhere? — NO shared behaviour is lost.** Every shared contract is already covered elsewhere (§10.1):
- Server-authoritative verify.
- Item-cost and stat parity with Ranked.
- Magic resist excluded.
- No ties dealt.
- Level badge showing null rather than LVL 1 when the level is missing.
- Double-submit protection.

The one exception depends on D1: if the profile "Recent Takes" section is **kept**, the client-side tests for `fetchMyRecentResults`/`verifyFactualBatch` (`deriveOnRead.test.ts:73-193`, `focusedStatModes.test.ts:138-162`) must be ported with the relocated functions.

**9. Are there production Supabase jobs, functions or triggers that still expect the frontend to use League Swipe? — NO.**
- `pg_cron` is installed, but no migration calls `cron.schedule`.
- There are no triggers or views on `league_swipe_*`.
- `supabase/functions/*` never mentions League Swipe.
- `league_swipe_recompute_ratings` is an operator-only manual tool (EXECUTE revoked from PUBLIC, anon and authenticated).
- Account lifecycle (`purge-anonymous-users`, `identity-link`, `admin-user-actions`, guest upgrade) never touches `league_swipe_*`. `user_id`/`voter_id` have no foreign key, so deleting an auth user leaves orphaned rows rather than failing.

**10. Which files can be deleted with zero current-product dependency?** The 22 files in §6, **once the §7 edits are applied in the same commit**.

---

## 2. Dependency graph (`origin/main` @ cb2ccff7)

```
                        ┌──────────────── STANDALONE LEAGUE SWIPE (retire) ─────────────────┐
 App.tsx:75-77,532-534 ─┤  /league-swipe          → LeagueSwipeHub.tsx ──emits meta_reflex_opened
 route-prefetch:59-61,  │  /league-swipe/stats    → LeagueSwipeStats.tsx                     │
   113-116              │  /league-swipe/:slug    → LeagueSwipeGame.tsx ─┬─ ChampionLevelBadge ◄──── metaReflexModule.tsx (RANKED)  [KEEP]
                        │                                                 ├─ anonymous-identity ("meta_reflex_vote")
                        │  src/lib/league-swipe/                          │
                        │    branding.ts ◄──────────┬── Quiz.tsx (dead card, flag=false)   [edit]
                        │                           ├── HexTrainingHero.tsx (orphan)       [edit]
                        │                           └── LeaguePublicProfile.tsx            [edit — LIVE]
                        │    api.ts ◄───────────────┴── LeaguePublicProfile.tsx: fetchMyRecentResults
                        │      │  factualCategories.ts, submissionId.ts, devForcedPair.ts  │
                        └──────┼────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼─────────────────────────────┐
          ▼ Supabase (KEEP)    ▼ Railway backend (KEEP)       ▼ Railway backend (SHARED, KEEP)
  league_swipe_games       /api/meta-reflex/factual/pool     /api/meta/champions ◄── Combat Lab, sitemap/prerender scripts
  league_swipe_matchups    /api/meta-reflex/factual/verify   /api/meta/champion-stats ◄── League Docs, Champion Card Duel
  league_swipe_results     /api/meta-reflex/factual/verify-batch
  league_swipe_entity_ratings      │
  league_swipe_preferences         ▼
  record_league_swipe_result   factual_duel.py ◄── meta_reflex_content.py ◄── ranked_public/*, daily_challenge/recipe.py (RANKED/DAILY)
  get_league_swipe_stats           (SHARED module)       ranked_formats/schema.py
  league_swipe_derived_rating
  league_swipe_recompute_ratings

 RANKED / DAILY META REFLEX (active)                    CHAMPION CARD DUEL (active, /quiz/stat-check*, /dev/stat-check)
  metaReflexModule.tsx → ranked-public/client.ts          champion-card-duel/*, champion-card-duel-online/*
   → /api/ranked/* , /api/daily-run  (Railway)             → /api/stat-check/* ; league-docs/api → /api/meta/champion-stats
   NO edge into src/lib/league-swipe, NO league_swipe_*    NO edge into League Swipe
```

---

## 3. A/B/C/D classification

### A — SAFE TO REMOVE (used only by standalone League Swipe)

| Item | Evidence |
|---|---|
| `src/pages/LeagueSwipeHub.tsx`, `LeagueSwipeGame.tsx`, `LeagueSwipeStats.tsx` | Imported only by `route-prefetch.ts:59-61` and their own tests. They import only surviving shared modules (SEOHead, useSurfaceEvent, useChampionAssets, ChampionLevelBadge, anonymous-identity, lucide). |
| `src/lib/league-swipe/api.ts` | Its only non-LS importer is `LeaguePublicProfile.tsx:20` (resolved by D1). |
| `src/lib/league-swipe/branding.ts` | Its non-LS importers are `Quiz.tsx:21-25` (dead card), `HexTrainingHero.tsx:9` (orphan) and `LeaguePublicProfile.tsx:21`. All three are edited in §7. `META_REFLEX_STATS_ROUTE` is referenced nowhere. |
| `src/lib/league-swipe/devForcedPair.ts`, `factualCategories.ts`, `submissionId.ts` | Only importers are LS files. `newSubmissionId`, `resolveFactualCategory` and `parseForcedPair` have no outside references. |
| All 13 LS test files (§6) | Test LS-only modules. Shared contracts are covered elsewhere (§10.1). |
| Routes `App.tsx:532-534` + `const LeagueSwipe*` at `:75-77` | Replaced by redirects (D2). |
| `route-prefetch.ts:59-61`, `:114-116`; `"LeagueSwipeHub"` key in `:113` | Lazy registry and prefetch matchers. Keep the `/lol` row itself. |
| `startup-shell.ts:51-52` `/league-swipe` branch + `startup-shell.test.ts:119-129` + `Layout.themeIsolation.test.tsx:73` | Theme classification for a removed surface. These three must change together. |
| `seo/sitemap.ts:45-49` entry + `public/sitemap.xml:68-72` | `public/sitemap.xml` is regenerated by `prebuild`/`predev` (`scripts/generate-sitemap.ts`). |
| `AdminDiagnostics.tsx:49` route probe | Would probe a redirect or NotFound. |
| `test/funnel/canonicalSurfaces.test.tsx:219` row + `meta_reflex_opened` in the `:229-243` single-emitter list | The only emitter is `LeagueSwipeHub.tsx:26`. Ranked does not emit it. |
| `test/guards/users1AudienceIdentity.test.ts:61-66` LS list entry + `:72-86` test | Asserts the LS page exists and mints the anonymous identity at vote time. |
| `Quiz.tsx` `metaReflex` flag (`:98-99`, `:135`) + card block (`:1591-1621`) + branding import (`:21-25`) | Dead: the flag is `false`. |
| `Quiz.metaReflex.test.tsx` (whole file) | Asserts `META_REFLEX_ROUTE === "/league-swipe"` and "module stays whole". Its non-LS checks are already in `Quiz.hub.test.tsx:247, 579-595`. |
| `HexTrainingHero.tsx` `swipe` mode entry (`:39-49`) + branding import (`:9`) + `"swipe"` key type member | The component is orphaned. Minimal edit; deleting the orphan is optional and out of scope. |
| `anonymous-identity.ts:45` table row, `:71` `"meta_reflex_vote"` reason | Optional cleanup; an unused union member is legal TypeScript. |
| Stale comments: `LolHub.tsx:1136-1138`, `LolHub.test.tsx:3-4,230-232`, `Quiz.hub.test.tsx:590-592`, `feedback/contract.ts:117-119`, `contract.test.ts:222-223`, `HexPanelLink.tsx:11`, `ChampionLevelBadge.tsx:27-32` | Comment-only. `ChampionLevelBadge.tsx` itself is **B**. |

### B — MUST PRESERVE

| Item | Why |
|---|---|
| `src/components/ChampionLevelBadge.tsx` (+ test) | Imported by Ranked `metaReflexModule.tsx:29`. |
| **All 7 migration files:** `20260710120000_league_swipe.sql`, `20260710130000_funnel_events.sql` (tombstone), `20260711090000_league_swipe_stats.sql`, `20260813120000_meta_reflex_reset_test_data.sql`, `20260813120100_meta_reflex_variant_discriminator.sql`, `20260813120200_meta_reflex_preferences_and_derived_ranking.sql`, `20260813120300_meta_reflex_vote_rpc_v2.sql` | Migrations are applied by hand, so these files are the only schema history. The only sanctioned change is the pending `20260710120000` → `20260710120100` version-collision rename (`docs/community-reconciliation-checks.sql:117-138`), and only inside the separately authorised ledger backfill. **R0 (`…120000_meta_reflex_reset_test_data.sql`) TRUNCATEs League Swipe tables and must never be replayed.** |
| Supabase tables `league_swipe_games`, `_matchups`, `_results`, `_entity_ratings`, `_preferences` + indexes, RLS policies, grants, FKs | Historical persistence. No drops in this program. |
| RPCs/functions `record_league_swipe_result` (v2), `get_league_swipe_stats`, `league_swipe_derived_rating`, `league_swipe_recompute_ratings` | Historical persistence and operator tool. They will simply have no caller. |
| `src/integrations/supabase/types.ts:2037-2263, 3964, 4067-4196` | Generated types; they must match the live schema while the tables exist. `noRetiredMogsyArchitecture` already excludes this file. |
| `meta_reflex_opened/started/completed` in `src/lib/analytics/contract.ts:66,75-76` | Historical `analytics_events` rows keep a governed name. No SQL constraint depends on them. |
| `admin/analytics/metrics.ts` `meta_reflex` entry | Keep the entry, but flip `presentation` to `"retired"` (D3). The `"retired"` precedent is at `metrics.ts:172`. |
| `src/lib/lol-changelog.ts:84` | Historical changelog record. |
| Backend `/api/meta/champions`, `/api/meta/champion-stats`, `factual_duel.py` and its tests | Shared with Combat Lab, League Docs, Champion Card Duel, build scripts, and Ranked/Daily content. |
| Backend `/api/meta-reflex/factual/*` + `test_meta_reflex_routes.py` | Leave untouched in this program. They become caller-less after RETIRE1B and can be retired in a later backend-only task. |
| `src/components/SwipeComments.tsx` | Blog comments; the shared name is a coincidence. |
| Ranked/Daily Meta Reflex (`ranked-core/modules/metaReflexModule*`, `ranked-public/*`, `quiz-ranked/*`, daily run) | Active product; untouched. |
| Champion Card Duel (all files) | Active product; untouched. |

### C — SAFE TO MOVE/ABSORB (must be edited or relocated before, or in the same commit as, deletion)

| Item | Owner after retirement | Required action |
|---|---|---|
| `LeaguePublicProfile.tsx:20-21, 104-106, 139-143, 284-321, 318, 341-343` | Profile (`/user/:profileId`, via `UserProfile.tsx:469`) | **D1.** Recommended: remove the "Recent League Takes" query and section, and the Meta Reflex CTA. Alternative: move `fetchMyRecentResults` + `verifyFactualBatch` + `resolveFactualCategory` + `modeForStoredRow` into a profile-owned read-only module with ported tests. |
| `LeaguePublicProfile.test.tsx:33-35` | Profile | Remove the `vi.mock("@/lib/league-swipe/api")`, or re-point it to the relocated module. |
| `META_REFLEX_NAME/ROUTE/TAGLINE` consumers (`Quiz.tsx`, `HexTrainingHero.tsx`, `LeaguePublicProfile.tsx`) | — | Remove the uses (all dead or in D1 scope). **Do not relocate the constants.** Ranked's module does not use them, and future "Stat Check" naming is a separate program. |
| `test/guards/noRetiredMogsyArchitecture.test.ts:158` (`hits(/league-swipe/).length > 0`) | Guards | This assertion contradicts the goal. It would only stay green because `lol-changelog.ts` or a redirect still contains the string, which is a false guarantee. Replace it with a real Ranked Meta Reflex anchor (e.g. `hits(/metaReflexModule/)`), and optionally assert the redirect. |

### D — UNCERTAIN / owner decision (traced; ownership established, policy choice open)

| Item | Status |
|---|---|
| D1 — profile "Recent League Takes" | A product decision. Both options are technically safe. See §12. |
| D2 — redirect targets for the three URLs | Recommended: `/league-swipe` and `/league-swipe/*` → `/quiz`. See §12. |
| D3 — `metrics.ts` / `activityLifecycle.ts` `meta_reflex` / `meta_reflex_round` entries | Registry-only, with no runtime consumers. Recommended: keep, and mark retired. Their tests (`metrics.test.ts:350,358-363,385-388,645-651`, `activityLifecycle.test.ts:31`) move only if the entries are edited. |
| D4 — backend `/api/meta-reflex/factual/*` | Ownership is established: LS-only. Timing is the open question. Recommended: out of scope; handle in a later backend task after RETIRE1B has been in production for one cycle. |

---

## 4. Current Ranked/Daily Meta Reflex dependency conclusion

**Ranked and Daily Meta Reflex have no dependency on standalone League Swipe:**
- **No frontend imports.**
- **No Supabase dependency:** no `league_swipe_*` tables, RPCs, views or stored data.
- **No backend dependency on `/api/meta-reflex/*`.**

They share exactly two things, neither of which is in the retirement set:
1. `src/components/ChampionLevelBadge.tsx`, a presentational component outside the LS namespace.
2. The backend Python module `factual_duel.py`, used for its champion-stat helpers only.

`metaReflexModule.tsx:19-24` documents that the Ranked module "computes nothing" and renders server `segmentState`. There is no duplicated logic to rescue.

The pending local commit `0e1bcd5e` (MRLVL1 Phase 3) is **already on `origin/main` as `7bc6581b`**, with byte-identical changed lines. It adds no Ranked→LS edge.

## 5. Champion Card Duel dependency conclusion

**Champion Card Duel does not depend on League Swipe.**
- Code: `src/pages/champion-card-duel/`, `src/pages/dev/champion-card-duel/**`, `src/lib/champion-card-duel-online/`, `src/hooks/useChampionCardDuelInvites.ts`, `src/assets/champion-card-duel/`.
- Routes: `App.tsx:603-607`.
- A grep for `league.?swipe|meta.?reflex|branding` in those files finds 0 hits.
- It uses `/api/stat-check/*` and `/api/meta/champion-stats` (via `league-docs/api.ts`, which stays).
- Its only coupling to this change is that `App.tsx` and `route-prefetch.ts` must still compile.
- `App.championCardDuelRoutes.test.ts` is unaffected.

⚠️ **Naming collision to flag, not a blocker.** Champion Card Duel is served at `/quiz/stat-check*` and `/dev/stat-check`. The brief says Ranked Meta Reflex "will later become Stat Check". RETIRE1B must **not** reuse `/league-swipe` or `stat-check` paths for Ranked, and the future rename program must resolve this route and namespace clash explicitly.

---

## 6. Exact safe deletion set (22 files, only together with §7)

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
src/lib/league-swipe/api.ts                         (if D1 = relocate: move the 4 read-side functions out FIRST)
src/lib/league-swipe/branding.ts
src/lib/league-swipe/devForcedPair.ts
src/lib/league-swipe/factualCategories.ts           (if D1 = relocate: move the stored-row mapping out FIRST)
src/lib/league-swipe/submissionId.ts
src/lib/league-swipe/deriveOnRead.test.ts           (if D1 = relocate: port :73-193 FIRST)
src/lib/league-swipe/devForcedPair.test.ts
src/lib/league-swipe/factualCategories.test.ts
src/lib/league-swipe/focusedStatModes.test.ts       (if D1 = relocate: port :138-162 FIRST)
src/lib/league-swipe/recordSwipeResult.idempotency.test.ts
src/lib/league-swipe/submissionId.test.ts
```
(22 files: 11 under `src/pages/`, 11 under `src/lib/league-swipe/`; the directory is then empty and goes too.)

No asset files are League-Swipe-only: the pages import no images or audio, and nothing in `public/` or `src/assets/` belongs to them. No e2e spec references `/league-swipe`.

## 7. Required same-commit edits (the "relocate first" set)

1. **`src/App.tsx`**
   - Remove `:75-77` and the routes at `:532-534`.
   - Add redirects inside the Layout group, *before* the `/:slug` route (D2):
     `<Route path="/league-swipe" element={<Navigate to="/quiz" replace />} />`
     `<Route path="/league-swipe/*" element={<Navigate to="/quiz" replace />} />`
2. **`src/lib/route-prefetch.ts`**
   - Remove `:59-61` and `:114-116`.
   - Drop `"LeagueSwipeHub"` from the `/lol` row at `:113`.
3. **`src/components/profile/LeaguePublicProfile.tsx`** + its test: apply D1 and remove both `/league-swipe*` buttons.
4. **`src/pages/Quiz.tsx`**: remove the `metaReflex` flag type and value, the card block and the branding import. Trim the stale `Quiz.hub.test.tsx:588-595` comment; keep its negative assertion.
5. **`src/components/lol/HexTrainingHero.tsx`**: remove the `swipe` mode, its type member and the import.
6. **`src/lib/startup-shell.ts:51-52`** + `startup-shell.test.ts:119-129` + `Layout.themeIsolation.test.tsx:73`, changed together.
7. **`src/lib/seo/sitemap.ts:45-49`**, then regenerate `public/sitemap.xml` (`npm run build` does this; or run `tsx scripts/generate-sitemap.ts`).
8. **`src/pages/AdminDiagnostics.tsx:49`**: remove the probe.
9. **`src/test/funnel/canonicalSurfaces.test.tsx`**: remove the `:219` row and `meta_reflex_opened` from the `:229-243` list.
10. **`src/test/guards/users1AudienceIdentity.test.ts`**: remove the LS list entry and the `:72-86` test.
11. **`src/test/guards/noRetiredMogsyArchitecture.test.ts:158`**: replace the assertion (§3-C).
12. **D3**: in `metrics.ts:153`, set `presentation: "retired"` and update the gap text. Update `metrics.test.ts` accordingly. Keep the `analytics/contract.ts` names.
13. **Optional:** `anonymous-identity.ts:45,71` cleanup, stale comments (§3-A), and docs (`docs/NAV1_NAVIGATION_MATRIX.md:68`, `docs/FUNNEL1_HANDOFF.md`, `docs/USERS2_ACTIVITY_LIFECYCLE.md`).

**Must NOT be touched in RETIRE1B:**
- `supabase/migrations/**`
- `src/integrations/supabase/types.ts`
- `ChampionLevelBadge.tsx`
- any `ranked-core` / `ranked-public` / `quiz-ranked` / daily / champion-card-duel file
- `lol-changelog.ts`
- any backend file

## 8. Retained compatibility and persistence set

- **Supabase:**
  - 5 `league_swipe_*` tables with their indexes, RLS policies, grants and FKs;
  - 4 functions/RPCs;
  - all 7 migration files;
  - `types.ts` entries.
  - The tables become write-dormant: nothing calls `record_league_swipe_result` after RETIRE1B. Historical rows stay intact.
- **Analytics:**
  - Historical `analytics_events` rows with `meta_reflex_opened` remain valid. The table only checks name format (`funnel1b1_analytics_foundation.sql:227-228`).
  - Contract names stay registered.
- **Backend:** `/api/meta/*` (shared); `/api/meta-reflex/factual/*` (dormant, retained); `factual_duel.py` (shared).
- **URLs:** `/league-swipe` and `/league-swipe/*` stay resolvable through redirects, so bookmarks, crawlers and pending `returnTo` values degrade gracefully.
- **Side note:** `20260730150000_league_profiles_rpc.sql:104` mentions default grants to `sandbox_exec` roles. The v2 RPC migration only revoked grants from anon/authenticated. This is unchanged by retirement; a later DB hygiene task could check it.

## 9. Feedback implications

- `src/lib/feedback/contract.ts` has **no** League Swipe or Meta Reflex category or surface id, and `ROUTE_CATEGORY_PREFIXES` has no `/league-swipe`. Past feedback from those pages was categorised "General".
- Stored feedback rows whose `page_url` is `/league-swipe…` still render in `AdminFeedback` (plain text at `:588`). Nothing breaks, and there is nothing to migrate.
- `contract.test.ts:220-227` asserts that Meta Reflex is *not* a category. That negative check still passes; only comment text goes stale.
- After retirement, feedback submitted from a redirected URL is recorded against `/quiz`. That is expected.

## 10. Test plan

### 10.1 Shared coverage that already survives (no porting needed)

| Shared contract | Surviving coverage |
|---|---|
| Server-authoritative verify; lying client rejected; unjudged ≠ wrong; batch order and cap | Backend `test_meta_reflex_routes.py:121-365`, `test_factual_duel.py:284-346` |
| Item-cost and stat parity, standalone = Ranked | `test_meta_reflex_routes.py:77,91`; `test_factual_duel.py:86-139`; `test_mrlvl1_level_aware_meta_reflex.py:361-406` |
| Magic resist excluded; no ties dealt | `test_factual_duel.py:167,255,261,266`; `test_quiz1_meta_reflex_content.py:328,688`; `test_mrlvl1…:674` |
| Level badge; missing level is null, never 1 | `ChampionLevelBadge.test.tsx:19-54`; `metaReflexModule.level.test.tsx:68-171` |
| One tap, one submission | `QuizRankedMatch.metaReflex.test.tsx:161,170`; `metaReflexModule.test.tsx:132`; backend `test_quiz1_meta_reflex_additive.py:830`, `test_ranked_admin_bot_match.py:799,879` |
| Server-owned reveal and correctness | `metaReflexModule.test.tsx:144,153-202`; `metaReflexModule.reveal.test.tsx:158-201`; `contracts.metaReflex.test.ts:160` |

The only coverage that is **lost**, and only matters if D1 = relocate: the client-side row alignment and unjudged-mapping logic in `fetchMyRecentResults`, and `modeForStoredRow`. Port `deriveOnRead.test.ts:73-193` and `focusedStatModes.test.ts:138-162`. If the profile section is kept, also add a profile-level test for the three-state marker, which is untested today.

### 10.2 BEFORE implementation (on a fresh branch from `origin/main`, record results)

1. `npm test` (full vitest). Record the pass/fail baseline.
   - **Known pre-existing red:** `src/App.routing-contract.test.ts:36-50` asserts `/multiplayer` `<Navigate>` routes that do not exist in `App.tsx` (only a comment at `:62`).
   - Do not attribute that failure, or any other baseline failure, to this change.
2. `npx tsc --noEmit -p tsconfig.app.json`. Record the error **count**; the baseline has known errors.
3. `npm run lint`.
4. `npm run build`. This also regenerates the sitemap and runs the prerender scripts.
5. `npm run test:e2e` and `npx playwright test --config e2e/nav1/playwright.config.ts`.
6. Backend (unchanged, sanity only): `pytest test_meta_reflex_routes.py test_factual_duel.py test_mrlvl1_level_aware_meta_reflex.py test_quiz1_meta_reflex_content.py test_quiz1_meta_reflex_additive.py test_quiz1_meta_reflex_mixed_flow.py test_meta_reflex_card_reveal.py`
7. Snapshot: `rg -n "league-swipe|LeagueSwipe|league_swipe" src e2e scripts public`.

### 10.3 AFTER implementation

1. Same commands as 10.2 steps 1-5. Pass/fail must be **identical or better**, apart from deleted LS test files. The tsc error count must not increase.
2. The `rg` snapshot may show only these survivors:
   - `integrations/supabase/types.ts`
   - `lol-changelog.ts:84`
   - the two redirect routes in `App.tsx`
   - the updated guard test
   - comments explicitly marked historical
3. **Targeted unit suites must be green:**
   - All `Quiz.*.test.tsx`
   - `LeaguePublicProfile.test.tsx`, `UserProfile.*.test.tsx`
   - `startup-shell.test.ts`, `Layout.themeIsolation.test.tsx`
   - `canonicalSurfaces.test.tsx`, `users1AudienceIdentity.test.ts`, `noRetiredMogsyArchitecture.test.ts`
   - `seo/sitemap.test.ts`, `App.dataRouter.test.tsx`, `adminQuizRetirement.test.ts`, `App.championCardDuelRoutes.test.ts`
   - `metaReflexModule*.test.tsx`, `QuizRankedMatch.metaReflex.test.tsx`, `ChampionLevelBadge.test.tsx`
   - `metrics.test.ts`, `activityLifecycle.test.ts`
   - `HexTrainingHero.audio.test.tsx`
4. **Add tests:**
   - The redirect contract: `/league-swipe`, `/league-swipe/stats` and `/league-swipe/item-cost-duel` all land on `/quiz`, and bare `/league-swipe` does **not** hit `CustomLink`.
   - A negative assertion that no `href="/league-swipe…"` renders on `/user/:id`.
5. **Manual smoke:**
   - A Ranked match with a Meta Reflex segment: card, level badge, reveal, submit.
   - A Daily Challenge run containing Meta Reflex.
   - Champion Card Duel: `/quiz/stat-check` → bot match.
   - `/user/<own id>` renders with no console errors.
   - `/lol` loads, and its prefetch no longer requests a LeagueSwipe chunk.
   - Old URLs redirect.
   - `/admin/diagnostics` shows no failed probe.
6. **Post-deploy:** confirm the `record_league_swipe_result` call count drops to 0. Confirm no new errors for `/api/meta-reflex/factual/*` (these should go quiet, apart from profile traffic if D1 = relocate).

## 11. Rollback plan

- **Code.** RETIRE1B should be a **single revertable commit**, or a small series merged as one PR, on a branch from `origin/main`. Rollback is `git revert <sha>` followed by a redeploy of the frontend. This restores the pages, lib, routes and registries byte-for-byte.
- **Data.** Rollback needs **no data or schema step**, because RETIRE1B does not touch Supabase or the backend. Tables, RPCs, grants and RLS stay live throughout, so a reverted frontend resumes reading and writing immediately. Historical rows are never at risk.
- **Backend.** Nothing to roll back; the backend is untouched.
- **Sitemap.** A revert restores `seo/sitemap.ts`, and the next build regenerates `public/sitemap.xml`.
- **Stale-branch hazard.** These local branches still carry older League Swipe file content:
  - `codex/sh11a-foundation`, `codex/sh11b-daily`, `codex/sh12-personalized`, `codex/sh13-mastery-matchup`
  - `dcmod/d-hub` and `origin/dcmod/d-hub`
  - `envvis1-batch1-scene-channel`, `mrlvl1-phase3-level-badge`, `sc-rename1-phase1`

  Examples: the pre-USERS1 `signInAnonymously` mount effect in `LeagueSwipeGame.tsx`, and `api.ts`/test changes. Merging any of these after RETIRE1B would **resurrect the deleted files** as modify/delete conflicts. Reviewers must resolve such conflicts as "delete". The updated guard test and the `rg` gate catch any resurrection.

## 12. Owner decisions (defaults recommended)

| # | Decision | Recommended default | Alternative |
|---|---|---|---|
| **D1** | Profile "Recent League Takes" (own-profile list of past League Swipe picks + "View all swipe stats") | **Remove the section and the Meta Reflex CTA.** After retirement no new takes are written, so the list would be permanently frozen. It links to a removed page, and it is the last caller of an LS-only backend endpoint. History stays safe in `league_swipe_results`. | Keep as a read-only "legacy takes" list. Relocate `fetchMyRecentResults`, `verifyFactualBatch`, `resolveFactualCategory`, `modeForStoredRow` and the `SwipeOwnResult` type into a profile-owned module (e.g. `src/lib/profile/legacyLeagueTakes.ts`), port `deriveOnRead.test.ts:73-193` + `focusedStatModes.test.ts:138-162`, and drop the stats link. |
| **D2** | Redirect target for old URLs | `/league-swipe` and `/league-swipe/*` → `/quiz` (the Ranked-first hub). Ranked Meta Reflex has no URL of its own, and `/quiz/ranked` may show a gate to anonymous visitors. | `/league-swipe/stats` → `/lol/history` (route exists at `App.tsx:557`). |
| **D3** | Admin analytics registry | Keep the `meta_reflex` / `meta_reflex_round` entries and event names; set `presentation: "retired"`. | Delete the entries and update `metrics.test.ts` / `activityLifecycle.test.ts`. |
| **D4** | Backend `/api/meta-reflex/factual/*` | Out of scope. Retire in a later backend-only task once profile traffic has gone to zero. Keep `factual_duel.py`. | — |

---

## 13. Final statement

**SAFE TO IMPLEMENT.**

Standalone League Swipe can be retired without breaking current Mogzy behaviour, provided RETIRE1B:
1. branches from `origin/main` (not local `main`);
2. deletes the §6 set **together with** every §7 edit in one revertable change;
3. applies D1 to `LeaguePublicProfile`, the only live-product consumer;
4. adds the `/league-swipe*` redirects;
5. leaves all Supabase objects, migrations, generated types, `ChampionLevelBadge`, Ranked, Daily, Champion Card Duel and the backend untouched;
6. passes the §10 before/after gates, with `App.routing-contract.test.ts` treated as a pre-existing failure.

There are no technical blockers. The only open items are the owner decisions D1–D4, each with a safe default.

Audit stopped here. Nothing was implemented.
