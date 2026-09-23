# LEGACY1 — Eradicate retired Mogsy architecture from active code

**State: PHASE 1 COMPLETE (inventory). Phases 2–4 in progress.**

Read this file first. It is the record of what retired Mogsy architecture was
found in the active codebase, what was deleted, and what was deliberately left
in place. Where it says HISTORICAL_ONLY, the artifact still exists but is **not**
current product architecture and must never be built against.

---

## Objective

Remove retired product concepts from the active codebase so a future engineer or
agent opening the repo sees **one coherent current Mogzy product**, not several
generations of abandoned Mogsy architecture competing for authority.

Owner directive: historical preservation is no longer the priority. The previous
phase (FUNNEL1C / ADMIN2, §24 of `docs/FUNNEL1_HANDOFF.md`) *archived* the
retired voting product under `/admin/arena` and labelled it "preserved, not
removed". That is now considered harmful — agents find it and build against it.
If a concept is no longer part of current Mogzy and has no active production
dependency, it is deleted.

## Current main / base

```
frontend origin/main   cf9f5a8a  docs(gr1): first playable state-aware Champion Slice
worktree               .worktrees/legacy1
branch                 legacy1/eradicate-retired-mogsy
baseline typecheck     25 errors across 16 files (pre-existing)
baseline tests         see "Tests" below
```

## The decisive finding

`src/lib/site-config.ts:20` — **`LEAGUE_ONLY_MODE = true`**, permanently.

`App.tsx`'s `leagueGate()` redirects every route it wraps to `/lol`. That means
the entire retired Mogsy user product is **already unreachable in production**:

```
/  /home  /play  /swipe  /swipe-game  /swipe/preset/:id  /swipe-leagues
/leagues/:type  /leaderboard/:leagueId  /shop  /elo-check  /referral
/multiplayer  /multiplayer/game/:gameId   (the last two are already bare redirects)
```

No production user can reach any of them. Their page components, their admin
tooling and their supporting libraries are therefore dead runtime, not "legacy
but live". This is the evidence the frontend deletions rest on — not the
presence of the word "arena".

## Semantic traps (do NOT delete these)

Current Mogzy re-uses words the retired product used. Each of these is
**KEEP_CURRENT**:

| Looks retired | Actually is |
|---|---|
| `src/components/ranked-arena/*`, `playwright.arena.config.ts`, `/dev/ranked-arena-inspector` | the **current Ranked** match screen ("arena" = the match surface) |
| `DIAMOND` in `src/lib/progression/tiers.ts`, `RankEmblem`, `RankedLobbyHero` | the **Diamond rank tier** (League tier name), not the retired currency |
| `/league-swipe`, `src/lib/league-swipe/*`, `league_swipe_*` tables | **Meta Reflex**, a current product |
| `src/lib/funnel-analytics.ts` | the **current** analytics emitter (writes `analytics_events`); FUNNEL1B repaired it |
| `comments` table, `AdminComments`, `SwipeComments` | **blog post comments are current** (`pages/blog/BlogPost.tsx`); only the league/matchup use is retired |
| `redeem-gift` / `verify-gift` edge functions | current **premium entitlement** provenance (PT1.4) |
| `/quiz/matchup`, `ProPlayMatchup` | current Champion Mastery / Pro Play |

## Retired domains audited

### 1. Arena / voting-era Mogsy (user product)
Unreachable behind `LEAGUE_ONLY_MODE`. Pages `Home, Play, Swipe, SwipeHub,
SwipeLeagues, SwipePreset, Leagues, Leaderboard, EloCheck, Shop, Referral,
Index (legacy landing), Multiplayer, MultiplayerGame`; the swipe card /
animation / ad component families; `lib/elo.ts`, `lib/card-animations.ts`,
`lib/ad-analytics.ts`, `lib/mock-data.ts`.
**Verdict: DELETE.**

### 2. Arena Admin (`/admin/arena` + its satellites)
`AdminArenaPage`, `AdminCollections`, `AdminBots`, `AdminPromotedLeagues`,
`AdminRankSettings`, `ArenaArchiveStats`, `AdminPresetItems` (orphan),
`CardPreviewEditor` (orphan), and the four standalone shells `/admin/play`,
`/admin/gaming`, `/admin/demo`, `/admin/arena/data-graphs` (+ `/admin/data`
redirect, `lib/admin-data-sources.ts` — the 34-graph Match & Rank builder).
**Verdict: DELETE**, except `AdminSounds` (below).

### 3. `/moderator`
Five tabs, all retired-product: Collections, League Bots, Comments, Invite
Links, Elo Check. Only Comments has a current use (blog moderation), which
People › Moderation already provides.
**Verdict: DELETE the page; blog-comment moderation stays in People.**

### 4. Diamonds / retired economy
`diamonds`, `elo_shields`, `reveals`, `rewinds`, `boost_credits`,
`default_diamonds`, `grant_diamonds`, `reward_diamonds`, `referrer_diamonds`,
`shop_ad_type: "diamonds"`. Surfaces: `AdminUsers` (economy field editor, "Most
Diamonds" sort, balance column), `AdminInviteLinks`, `AdminCustomLinks`
(orphan), `AdminSettings`, `lib/admin/admin-users.ts`, `lib/admin-csv-export.ts`,
the `shop-grant-diamonds` registry entry, `Shop.tsx`.
**Verdict: DELETE the UI and runtime paths. Columns stay (HISTORICAL_ONLY).**

### 5. Match & Rank
The 34-graph builder (`/admin/data` → `admin-data-sources.ts`), Arena ranks
(`AdminRankSettings` + `mock-data.ts` thresholds), `snapshot-global-elo`,
image-click analytics (`image_clicks`), the `ad_events` ledger graphs.
**Verdict: DELETE.** Current **Ranked** is untouched.

### 6. Legacy Admin architecture
Already removed by FUNNEL1C: `pages/Admin.tsx` (17-tab shell),
`admin-directory.ts`, `AdminDirectory`, `AdminDirectoryCard`. What remains is
the **redirect residue** that only preserves dead concepts:
`/admin/legacy-dashboard`, `/admin/legacy-directory`, `/admin/directory`,
`/admin/data`, `/admin/users`(→ current view, keep), plus the `arena` area kind
`"archived"` and the `ARCHIVE` disposition in the registry.
**Verdict: DELETE the dead-concept redirects and the `archived` area kind.**

### 7. Old analytics predating FUNNEL1
`admin-data-sources.ts` (34 graphs), `ArenaArchiveStats`, `AdminAdAnalytics`
(`ad_events`), `ad-analytics.ts`, `lib/ads/analytics.ts` image-click counters.
Canonical analytics remain `analytics_events` / `analytics_visitors` /
`analytics_sessions` + Railway + `/admin/analytics`.
**Verdict: DELETE.**

### 8. MIGRATE_THEN_DELETE — current capability inside a retired shell
| Capability | Currently mounted in | Moves to |
|---|---|---|
| **Audio Studio** (`AdminSounds` + `lib/audio/admin-sfx-bindings.ts`, canonical `audio_assets` / `audio_event_bindings`, SFX1.6) | `/admin/gaming` (Arena) | Studio › **Audio** |

This is the single most important finding after `LEAGUE_ONLY_MODE`: a **current**
SFX1 surface was only reachable through the retired Arena shell.

### 9. UNKNOWN_DEPENDENCY / deliberately not touched
* Supabase edge functions `snapshot-global-elo`, `populate-preset-images` —
  referenced only from `/admin/about` prose. Local source deleted; the
  **deployed** functions must be removed from the Supabase dashboard by hand.
  Recorded so that is not forgotten.
* Every retired **database table and column**. See "Database" below.

## Database

**Nothing is dropped.** No table, column, function, trigger or RPC belonging to
the retired product is removed, because production state cannot be proven
disposable from the repo alone and a wrong drop is unrecoverable. The rule
applied instead: *remove every active UI and runtime reference, and stop
presenting them as current product architecture.*

HISTORICAL_ONLY — present in production, no active runtime reader after this
workstream, **not current architecture**:

```
leagues · league_memberships · preset_items · preset_item_images · matches
votes · image_clicks · elo_history · elo_check_league_settings
global_elo_snapshots · multiplayer_games · multiplayer_players
multiplayer_settings · custom_animations · animation_usage_logs
ad_creatives · ad_events · custom_links · tutorial_tips(arena rows)
profiles.diamonds · profiles.elo_shields · profiles.reveals
profiles.rewinds · profiles.boost_credits
invite_links.grant_diamonds · user_invite_settings.reward_diamonds
user_invite_settings.referrer_diamonds · app_settings.default_diamonds
app_settings.shop_ad_type · app_settings rows for swipe/gaming/play config
```

Migration history under `supabase/migrations/` is immutable and is **not**
rewritten. Its contents are history, not documentation of current state.

## Deleted frontend artifacts

_(filled in during Phase 3)_

## Deleted backend artifacts

_(filled in during Phase 4)_

## Docs cleaned

_(filled in during Phase 6)_

## Guards added

_(filled in during Phase 7)_

## Tests

_(filled in during Phase 9)_

## Current state

Phase 1 inventory complete and recorded above. Deletion phases in progress on
`legacy1/eradicate-retired-mogsy`.

## Unresolved dependencies

* Deployed Supabase edge functions `snapshot-global-elo` and
  `populate-preset-images` need manual removal in the dashboard.
* `UserProfile.tsx` still reads the `comments` and league-membership tables for
  a profile's legacy activity; whether the current profile should show any of it
  is a product decision, not a cleanup one.

## Next task

Finish Phases 2–9, then reconcile onto current `origin/main` before pushing.
