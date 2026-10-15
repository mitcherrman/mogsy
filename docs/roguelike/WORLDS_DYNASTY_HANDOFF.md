# Worlds Dynasty: Handoff

> **Read this before starting any Worlds Dynasty work.** Full evidence is in `docs/roguelike/WORLDS_DYNASTY_ROG0_AUDIT.md`.

## Objective
Build Worlds Dynasty, an owner-only League esports roguelike, by reusing existing Mogzy systems. The player:
- drafts 7 pros (5 starters and 2 substitutes) with rarity;
- picks a Worlds 2026 org;
- picks champions by historical proficiency;
- plays an 8-team tournament resolved by 5 positional battles plus a weighted team battle (BO3/BO5, Fearless);
- earns relics and powers, some through hosted Mogzy knowledge encounters.

## Repos
- **Frontend:** `mitcherrman/mogsy`. Vite/React, Supabase.
- **Backend:** `mitcherrman/League_Combat_Simulator`. FastAPI, SQLite on Railway; the code is at the repo root.

## Decisions (ROG0, proposed, pending owner approval)
1. **No new service.**
   - Backend: a new package `lcs/dynasty/` that mirrors `lcs/daily_challenge/run/` (guarded `BEGIN IMMEDIATE` transitions, deterministic IDs, an event log).
   - Persistence: SQLite through `migrate_add_dynasty_runs.py`.
2. **Server-authoritative, deterministic sim.**
   - Truth is `seed + catalog_digest + ruleset_version + events`; `state_json` is only a cache.
   - Seeds are sha256-labelled and fed to `random.Random`. They are never sent to the client.
3. **Battle model.**
   - Lanes use an Elo-style logistic over `rating + proficiency + relic mods`.
   - The team battle uses weighted lane power with a swingier scale.
   - The game score is 0.6 × team battle + 0.4 × lanes won.
   - **Do not use `team_combat` / SIM2.** It is paid, Premium- and flag-gated, unseeded, and needs hand-authored action plans.
4. **Data.**
   - A frozen, digest-sealed `dynasty/data/catalog.v1.json`, built by a read-only script over `pro_canonical_player_games` and `pro_player_champion_stats`.
   - Rating = shrunk win rate plus a league offset. Rarity = rating percentile.
   - **Never invent stats.** Never present simulated results as history.
5. **Encounters.**
   - Hosted Ranked bot matches via `create_bot_match(format_override, host=dynasty_encounter_host(...))` and `QuizRankedMatch host={...}`, the same way the Daily Challenge does it.
   - The first module is **Order Forge v2**, the only one already proven under a non-Ranked host.
6. **Owner-only access.**
   - Backend: `require_admin` plus an env kill-switch `DYNASTY_ENABLED`.
   - Frontend: `<AdminRoute>` at `/admin/dynasty`.
7. **Rewards** are run-scoped in v1. Mogzy has no currency or inventory store.
8. **Visuals.** Extract `ChampionCard`, `FlippableCard`, `PlayerHand` and `ItemChoicePanel` out of `src/pages/dev/champion-card-duel/` into `src/components/{cards,choice}/` without changing behaviour. Directly reuse:
   - `RoleEmblem`, `RoleMascot`, `TeamCrest`, `PlayerPortrait` (usually a monogram);
   - `useChampionAssets`, `fanLayout`, `animationConfig`, `useCountUp`, `MatchOverFrame`;
   - the SFX registry;
   - `TournamentBracket` (for ROG2).

## Key files
| Area | Files |
|---|---|
| Run template | `lcs/daily_challenge/run/{service,ports,plan}.py`, `lcs/daily_challenge/wiring.py:721`, `lcs/routes/daily_run.py`, `lcs/migrate_add_daily_runs.py` |
| Hosting | `lcs/ranked_public/host.py:47,93`, `lcs/ranked_public/service.py:3923`, `mogsy/src/lib/ranked-core/flow/matchHost.ts`, `mogsy/src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` |
| Module contracts | `lcs/ranked_modules/contract.py:359`, `mogsy/src/lib/ranked-core/modules/{types,registry}.ts` |
| Hosted-encounter test template | `lcs/test_order_forge_v2_daily.py` |
| Auth / owner gate | `lcs/routes/_auth.py:129`, `mogsy/src/components/AdminRoute.tsx` |
| Pro data | `lcs/pro_authority/schema.py` (`:227`, `:271`), `lcs/pro_authority/tournament_context.py:449` (`WORLDS_2026`, 19 teams, lineups `not_certified`), `lcs/pro_promotion/policy.json:94` |
| Duel engine (rules shape) | `mogsy/src/pages/dev/champion-card-duel/championCardDuelEngine.ts` |

## Current state
- **ROG0 audit is complete.** No implementation code has been written.
- No Dynasty, roguelike or relic code exists in either repo.

## Blockers
1. **Production read access.** This session was blocked from reaching Railway, so all production counts are unverified.
2. **Stale 2026 data.** The 2026 canonical data ends around 2026-07-14, and the PRODATA2 delta is unapproved.
3. **Uncertified Worlds 2026 lineups.**
4. **`RANKED_PUBLIC_ENABLED`** must be on for encounters.

## Open owner questions
- Which data window: ship labelled "through July 2026", or apply the delta first?
- Which orgs: the 19 editorial teams or the 16-team watchlist?
- Should runs grant XP?
- Which encounter modules come after Order Forge?
- What does "Fable 5" refer to? It was not found in the code.

## Tests run during ROG0
- **Frontend:** 142/142 passed (Card Duel engine, fanLayout, animationConfig, matchHost, `QuizRankedMatch.hosted`).
- **Backend:** 82/82 passed (stat_check engine and parity, `order_forge_v2_daily`, `dcmod_b_daily_run`, `prodata2_delta_2026`).

## Next task: ROG1-A, Sim core (needs owner approval first)
**Scope:** `lcs/dynasty/{rng,rating,relics}.py` and `lcs/dynasty/sim/{battle,opponents}.py`. Pure, with no DB.

**Tests:**
- a **synthetic, clearly labelled** fixture;
- determinism and replay;
- variance bounds (a +10 favourite wins 65–80% of the time; no outcome is 0% or 100%);
- rating shrinkage monotonicity;
- a balance script.

This needs neither production access nor any UI. After that comes ROG1-B (catalog), which is blocked on access and the data-window decision. The full sequence is in audit §7.
