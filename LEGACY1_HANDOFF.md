# LEGACY1 — Eradicate retired Mogsy architecture from active code

**State: PHASES 1–10 COMPLETE on `legacy1/eradicate-retired-mogsy`, pushed and
verified. The only step left is merging to `main`, which is the owner's call
because `main` is the production ref.**

Read this file first. It records what retired Mogsy architecture was found in
the active codebase, what was deleted, and what deliberately stayed. Where it
says HISTORICAL_ONLY, the artifact still exists in production but is **not**
current product architecture and must never be built against.

---

## Objective

Remove retired product concepts from the active codebase so a future engineer or
agent opening the repo sees **one coherent current Mogzy product**, not several
generations of abandoned Mogsy architecture competing for authority.

Owner directive: historical preservation is no longer the priority. The previous
phase (FUNNEL1C / ADMIN2, §24 of `docs/FUNNEL1_HANDOFF.md`) *archived* the
retired voting product under `/admin/arena` and labelled it "preserved, not
removed". That proved harmful — agents found it and built against it. If a
concept is no longer part of current Mogzy and has no active production
dependency, it is deleted. `docs/FUNNEL1_HANDOFF.md` §25 records that
supersession inside the document future agents actually read.

## Current main / base

```
frontend origin/main   cf9f5a8a  docs(gr1): first playable state-aware Champion Slice
branch                 legacy1/eradicate-retired-mogsy
worktree               .worktrees/legacy1
backend                League_Combat_Simulator — audited, NOTHING to change (below)
```

## The decisive finding

`src/lib/site-config.ts` exported **`LEAGUE_ONLY_MODE = true`**, permanently,
and `App.tsx`'s `leagueGate()` redirected every route it wrapped to `/lol`:

```
/  /home  /play  /swipe  /swipe-game  /swipe/preset/:id  /swipe-leagues
/leagues/:type  /leaderboard/:leagueId  /shop  /elo-check  /referral
/multiplayer  /multiplayer/game/:gameId   (the last two already bare redirects)
```

No production user could reach any of them. Their pages, their admin tooling and
their supporting libraries were dead runtime — not "legacy but live". That is the
evidence the frontend deletions rest on, not the presence of the word "arena".
The flag itself is now deleted: keeping it advertised a restorable Mogsy.

Deletions were computed from an **import graph**, not from names: with
`App.tsx`, `main.tsx`, every file under `scripts/` and every file under `e2e/`
as roots, the files reachable ONLY from the retired roots were deleted. Nothing
shared with a current surface was touched.

## Semantic traps — do NOT delete these

Current Mogzy reuses words the retired product used. Each is **KEEP_CURRENT**,
and the guard test asserts they are still present:

| Looks retired | Actually is |
|---|---|
| `src/components/ranked-arena/*`, `playwright.arena.config.ts`, `/dev/ranked-arena-inspector` | the **current Ranked** match surface ("arena" = the match screen) |
| `DIAMOND` in `lib/progression/tiers.ts`, `RankEmblem`, `RankedLobbyHero`, and the backend's `progression_tiers.py` | the **Diamond rank tier**, not the retired currency |
| `/league-swipe`, `lib/league-swipe/*`, `league_swipe_*` | **Meta Reflex**, a current product |
| `lib/funnel-analytics.ts` | the **current** analytics emitter (writes `analytics_events`) |
| `comments`, `AdminComments`, `SwipeComments` | **blog post comments are current** (`pages/blog/BlogPost.tsx`); only the league/matchup use was retired |
| `redeem-gift` / `verify-gift` | current **premium entitlement** provenance (PT1.4) |
| `/quiz/matchup`, `ProPlayMatchup` | current Champion Mastery / Pro Play |

## Retired concepts audited, and their verdicts

| Concept | Verdict | Outcome |
|---|---|---|
| Arena / voting-era user product (Swipe, Play, Leagues, Leaderboard, Shop, Elo Check, Referral, Multiplayer, the pre-Mogzy landing) | DELETE | gone |
| Arena Admin (`/admin/arena` + Collections, League Bots, Promoted Leagues, Arena Ranks, ArenaArchiveStats, the orphan preset-items editor) | DELETE | gone |
| `/admin/play`, `/admin/gaming`, `/admin/demo` shells | DELETE | gone |
| Match & Rank graph builder (`/admin/data` → `/admin/arena/data-graphs`, `admin-data-sources.ts`, 34 graphs) | DELETE | gone |
| `/moderator` (Collections · Bots · Comments · Invites · Aura Check) | DELETE | gone; blog-comment moderation and the roster stay in People › Moderation |
| `/admin/about` "Internal Docs" — a hand-written encyclopedia of the old product | DELETE | gone; All Tools is the inventory of record |
| Dead-concept redirects `/admin/directory`, `/admin/legacy-directory`, `/admin/legacy-dashboard`, `/admin/data` | DELETE | gone — a redirect to nowhere is not compatibility, it is a rumour |
| Diamonds / retired economy (diamonds, ELO shields, reveals, rewinds, boost credits, `default_diamonds`, `grant_*`, `reward_*`, `referrer_*`, `shop_ad_type`) | DELETE | every UI and runtime path gone; columns kept (below) |
| Old analytics (`ad_events` graphs, image-click counters, `ArenaArchiveStats`, `ad-analytics.ts`) | DELETE | gone; canonical analytics untouched |
| `LEAGUE_ONLY_MODE` and every `!LEAGUE_ONLY_MODE` branch | DELETE | gone |
| `showLegacyMogsy` profile escape hatch (boost, favorites, legacy frames) | DELETE | gone |
| **Audio Studio** (`AdminSounds` + `lib/audio/admin-sfx-bindings.ts`) | **MIGRATE_THEN_DELETE** | **moved to Studio › Audio at `/admin/audio-studio`, then the `/admin/gaming` shell was deleted** |
| `/:slug` custom links | MIGRATE_THEN_DELETE | narrowed to invite-code resolution; swipe-league, curated-config and `grant_diamonds` resolution deleted |
| Admin CSV export | MIGRATE_THEN_DELETE | trimmed to current account tables; league/item/match/Elo/Aura sections deleted |
| `AdminSettings` | MIGRATE_THEN_DELETE | trimmed to `require_auth`, the only setting anything reads |
| Supabase edge functions `snapshot-global-elo`, `populate-preset-images` | DELETE (source) | local source gone; **deployed functions still need manual removal** |
| Every retired **database** table and column | HISTORICAL_ONLY | nothing dropped — see Database |
| Premium "Animated card styles" row | DELETE | withdrawn; it promised the retired product's swipe cards |
| Staff profile-frame picker | KEEP_CURRENT | kept, gated on the moderator check alone (see Unresolved) |

## The most important finding after the flag

**A current capability was reachable only through a retired shell.** The Audio
Studio — SFX1's operator surface over the canonical `audio_assets` and
`audio_event_bindings` stores — was the ninth tab of `/admin/gaming`, the retired
voting product's "Gaming Config" page, beside swipe-game and card-animation
configuration no live route could reach. It was rehomed to Studio › Audio
**before** that shell was deleted: same gate, same RLS, same component. This is
why "trace every capability before deleting the route by name" is in the
instructions, and it is the one place it paid.

## Deleted frontend artifacts

108 files deleted, ~29,400 lines. By family:

```
pages            Home Play Swipe SwipeHub SwipeLeagues SwipePreset Leagues
                 Leaderboard EloCheck Shop Referral Index Multiplayer
                 MultiplayerGame Moderator AdminPlay AdminGaming AdminDemo
                 AdminData AdminAbout admin/areas/AdminArenaPage
components       the Swipe card/ad/timer/overlay family, components/animations/*
                 (11 card animations + router), components/multiplayer/* (8),
                 ProfileCard CardStatsFooter CategoryBubble EloChangeIndicator
                 HomeFriendsSection MatchupCapture ProCinematicAd
                 ScrollToCommentsHint SliceBattleAnimation SwipeAnimationPicker
                 HomeBlogStrip FavoritesEditor ui/drawer
admin components AdminAdAnalytics AdminAds AdminBots AdminCardAnimations
                 AdminCardStatsPreview AdminCollections AdminCustomLinks
                 AdminEloCheck AdminFirstGameTriggers AdminLeagueSettings
                 AdminMultiplayer AdminPlayItemEditor AdminPlayLeagueItems
                 AdminPresetItems AdminPromotedLeagues AdminRankSettings
                 AdminSwipeGameConfig AdminSwipeTabConfig ArenaArchiveStats
                 CardPreviewEditor
hooks            useAdSystem useAnimationSound useCardAnimation useGifExport
                 useGlobalPremiumAccess useLeagueAnimationRules
                 useMultiplayerGame usePlayLayout useScreenshot useShopSound
                 useSwipeSound useSwipeTimer
lib              ad-analytics admin-data-sources card-animations elo
                 gif-to-video
tests            AdminBots Moderator.phase1 Index.audio useAdSystem
                 sfx-adapters
assets           assets/mogsy-text-logo.png
docs/scripts     docs/ADMIN_MIGRATION_LEDGER.md + scripts/generate-admin-ledger.ts
                 — the capability-preservation ledger whose premise ("Lost: 0")
                 is exactly what this workstream retired
```

## Deleted backend artifacts

**The Railway backend (`League_Combat_Simulator`) has no retired-Mogsy surface
and was not modified.** Audited directly: no `preset_item`, `swipe`, `vote`,
`elo_check` or currency code exists there, and every `diamond` hit in the Python
source is the Diamond **rank tier** in `progression_tiers.py`. The retired
product was Supabase-side only.

Supabase edge functions deleted (source): `snapshot-global-elo` (global Elo
snapshots for the retired ranking) and `populate-preset-images` (preset-item
images). Nothing in `src/`, the migrations or the scripts invoked either; their
only references were prose in the deleted `/admin/about`.

## Database

**Nothing is dropped.** No table, column, function, trigger or RPC belonging to
the retired product is removed: production state cannot be proven disposable from
the repo alone, and a wrong drop is unrecoverable. The rule applied instead is
*remove every active UI and runtime reference, and stop presenting them as
current product architecture.*

HISTORICAL_ONLY — present in production, **no active runtime reader after this
workstream**, not current architecture:

```
tables     leagues · league_memberships · preset_items · preset_item_images
           matches · votes · image_clicks · elo_history · elo_check_games
           elo_check_league_settings · global_elo_snapshots · multiplayer_games
           multiplayer_players · multiplayer_settings · custom_animations
           animation_usage_logs · ad_creatives · ad_events · custom_links
           profile_photos · profile_favorites · saved_profiles
columns    profiles.diamonds · .elo_shields · .reveals · .rewinds
           .boost_credits · .active_boost_until · .age · .location
           .status_message · .socials · .swipe_animation
           invite_links.grant_diamonds / _boost_credits / _elo_shields /
             _reveals / _rewinds / recommended_categories / recommended_league_ids
           user_invite_settings.* (the reward_ / referrer_ currency rows)
app_settings
           default_diamonds · max_photos_per_user · favorites_mode ·
           swipe_timer · shop_ad_config · show_match_count ·
           show_swipe_progress · card_bg_opacity · nav_tab_mode ·
           card_stats_config · maintenance_mode · allow_anonymous_browsing ·
           rank_tiers
functions  activate_boost · resolve_custom_link · increment_custom_link_visits
```

`require_auth` is the one `app_settings` row that kept a reader (`useAuth`,
`useAppSettings`, Operations › Configuration).

Migration history under `supabase/migrations/` is immutable and was **not**
rewritten: its contents are history, not a description of current state. The
guard test excludes it for that reason, and excludes
`src/integrations/supabase/types.ts` too, which is generated from the live
database and therefore still lists the retired tables.

## Docs cleaned

* `docs/FUNNEL1_HANDOFF.md` — new **§25**, plus a banner under the state block:
  §24's `ARCHIVE` verdicts are a record of that phase's decision, not current
  state. Its Analytics content is unchanged and still current.
* `docs/ADMIN_MIGRATION_LEDGER.md` — deleted with its generator.
* In-code prose that stated the retired flag as current fact was rewritten in
  `Quiz.tsx`, `AdminPushNotifications.tsx`, `FloatingFriendsButton.tsx`,
  `useProfileConfig.ts`, `MogzyIdentityMenu.tsx`, `GlobalHud.tsx`, `Layout.tsx`,
  `admin-registry.ts`, `AdminShell.tsx`.
* `docs/COM1_SOCIAL_AUDIT.md` and the other phase handoffs were left as written:
  they are dated audits that already identify these surfaces as retired debt,
  and rewriting them would destroy the record. The distinction a reader needs —
  current architecture vs historical residue — is drawn here and in §25.

## Guards added

`src/test/guards/noRetiredMogsyArchitecture.test.ts` scans **active runtime
source only** (comments stripped, test files excluded, `supabase/migrations/**`
and the generated Supabase types excluded, so history stays writable):

* no `path=` / `to=` declaration for any retired route
* no reader or writer of `grant_diamonds`, `default_diamonds`,
  `reward_diamonds`, `referrer_diamonds`, `elo_shields`, `boost_credits`,
  `active_boost_until`, `activate_boost`
* no `LEAGUE_ONLY_MODE`
* no import of a deleted module
* no `kind: "archived"` area and no `disposition: "ARCHIVE"`
* **and the positive half:** the Audio Studio is still mounted from its new home,
  and `ranked-arena` / `DIAMOND` / `league-swipe` are still present — so a future
  over-zealous cleanup cannot delete current Ranked or Meta Reflex by matching
  the same words.

Existing suites were converted from preservation proofs into absence guards:
`admin-registry.test.ts` (eradicated paths, no retired tool id, no tool
mentioning diamonds, Audio Studio rehomed), `admin-registry.routes.test.ts` (no
retired route declared), `AdminShell.areas.test.tsx` (no Arena rail entry, no
`/moderator` link, `Moderator.tsx` proven gone, no diamond control).

## Tests

Baseline captured on `origin/main` (`cf9f5a8a`) in this worktree before any edit.
The full suite OOMs in one process on this machine — as FUNNEL1 §24.9 recorded —
so it was run in per-directory chunks with `--max-old-space-size=8192`, and
`src/test/security` file-by-file because it OOMs even alone.

```
                    baseline               after
admin               3 fail / 642           3 fail / 619
components         31 fail / 2923          29 fail / 2923
pages              20 fail / 3468          20 fail / 3467
lib                14 fail / 3699          13 fail / 3693
hooks               0 fail / 108            0 fail / 97
misc                0 fail / 750            0 fail / 750
test/guards         1 fail / 2              1 fail / 2  + new guard: 7 pass
test/security      24 fail across 19 files (1 file OOMs alone, on main too)
typecheck          25 errors / 16 files    20 errors / 12 files
production build   —                       vite build OK
```

Three failures were introduced by this work and all three are fixed: `AdSlot`
and `ads/policy` asserted `/shop` and `/moderator` were ad-blocked routes (they
no longer exist, so those deny-list entries were dead config), and
`botLabels.test.ts` read two files this workstream deleted. **Zero new failures
remain.** Every other failure reproduces on `cf9f5a8a` untouched, and no
typecheck error is new — the five that disappeared were in deleted files.

## Current state

* Retired Mogsy architecture is gone from active frontend code, from Admin, and
  from the two Supabase edge functions that served it.
* Admin's rail is ten current areas: Overview · Analytics · People · Leaguecraft
  · Ranked · Simulation · Game Data · Studio · Operations · Developer. There is
  no archived area, and `archived` is no longer a kind an area can have.
* Current Mogzy capabilities preserved: Leaguecraft, Daily Challenge, Ranked
  (including its "arena" match surface), Study Hall / Practice, Quiz Forge,
  Champion Mastery, Meta Reflex, Pro Play, canonical League data, FUNNEL1
  analytics, auth / identity, the premium and entitlement model, Studio,
  Operations — plus the Audio Studio, which had to be moved to be kept.

## Unresolved dependencies / open items

1. **Deployed edge functions.** `snapshot-global-elo` and
   `populate-preset-images` still exist in the Supabase project and must be
   deleted in the dashboard, with any schedule attached to the first. Local
   source is gone, so nothing will redeploy them.
2. **Profile frame selection has no shipped UI.** The picker was only ever
   reachable through the deleted legacy toggle and is now staff-only.
   `profile_frame` itself is current (PT2C owns its authority, Admin › People
   sets it, every surface renders it) and the premium matrix still lists frames
   as a benefit. Whether Premium gets a picker is a product decision.
3. **Database residue.** The tables and columns above are safe to drop only once
   someone confirms the production rows are disposable. Until then they are
   documented here and nowhere else: no UI, no runtime reader, no doc that
   presents them as current.
4. `src/test/security/pt2cProfileFrameAuthority.test.ts` OOMs when run alone, on
   `origin/main` as well. Pre-existing; not investigated here.

## Integration (Phase 10)

`origin/main` did **not** move during this workstream — it is still `cf9f5a8a`,
so there was nothing to reconcile and no newer work to preserve. The branch is
pushed:

```
branch pushed   legacy1/eradicate-retired-mogsy
commits         84eca41f  delete the retired Mogsy voting product
                6edcab4a  delete the retired economy, and the flag
                a64b3651  guards, docs, and the last of the stale references
diff vs main    152 files changed, 1141 insertions(+), 29360 deletions(-)
```

**Merging to `main` is deliberately left to the owner.** `main` is the Lovable
production ref (FUNNEL1 §16.4), so a fast-forward publishes a 29k-line deletion
to the live site. Everything is verified and the branch is ready; the last step
is one the owner should take knowingly. `git merge --ff-only
legacy1/eradicate-retired-mogsy` on `main` is all it needs.

## Next task

Merge, then delete the two deployed edge functions in the Supabase dashboard
(Unresolved #1). After that the natural follow-on is the Admin IA question the
owner raised — People + Analytics possibly collapsing into Users, Ranked moving
inside Leaguecraft — which is now answerable against a surface that contains
only current product.
