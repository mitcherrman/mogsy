# GAMEPLAY-ANALYTICS / RANKED-AUDIT — handoff (2026-10-19)

Branch `analytics/gameplay-attribution`, from `origin/main` 74d5dd49. Frontend only: **no Railway change, no database change, no production write, no migration, no auth/MFA change.**

## What the production counts are, and are not
The previous audit's counts (Daily 2,164; bonus 895; Role 16; direct 12; playtest 24; journey library 2; all `opponent_type=bot`; `multiplayer_games` empty) were **not re-queried here** (no production credentials in this session) and must be treated as a dated snapshot.

One correction to how that evidence reads: `multiplayer_games` is the **legacy Supabase duel table** (migrations March–May 2026), not where Ranked lives. Ranked matches are in Railway's own store (`ranked_matches`); this analytics surface sees them only as `ranked_started` / `ranked_completed` rows in `analytics_events`. So "`multiplayer_games` has zero rows" says nothing about Ranked PvP. The PvP question can only be answered from `ranked_started` rows (see queries below).

## Verified contracts (read from code, with refs)
Railway repo `League_Combat_Simulator`, `origin/master` 84567e11:
- **Starting Ranked** is `POST /api/ranked/queue` only (`routes/ranked_public.py` `join_queue`). It requires a verified non-anonymous account. `match_with_bot` creates an unrated bot match and requires Premium or admin (`_authorize_ranked_bot`). Existing matches are reached via `/matches/{id}/…` and `/active-match`, which start nothing.
- **Owner pause:** `platform_policy.queue_mode_enabled("ranked")` is checked in `join_queue` **before** the bot branch; a non-admin gets **503 `RANKED_QUEUE_PAUSED`** ("Existing matches may continue"). Admins bypass it. Four independent switches exist (`daily`, `role`, `ranked`, `bonus`; `services/platform_policy.py`); each gates only NEW starts of its own route. Daily stage children are created by the Daily run service, not `/queue`, so **pausing Ranked does not touch the Daily engine**. Separately `RANKED_QUEUE_ENABLED` (env kill switch, 503 `RANKED_QUEUE_DISABLED`) and availability windows apply.
- **When did it take effect?** The server-side refusal code landed in commit `11f0e00f` (2026-10-15 on the Railway repo; queue-pause reader `feat(queues)` same day). The moment the owner actually set `queue_ranked_enabled=false` is a row in Supabase `app_settings` and is **not derivable from code**; I did not read it. Query below.
- **`host` is stamped on the match** (`ranked_public/host.py`): `direct`, `daily_challenge` (+ parent run id, stage index/kind), `bonus_game` (`session_preset = bonus.<mode id>`), `role_challenge` (+ run id), `playtest`, `journey_library`, `study_hall`. Provenance copied onto each `ranked_*` event: `is_bot_match`, `opponent_type` (`bot`/`human`), `creation_source`.
- **`host=direct` is not PvP.** It is also the analytics fallback for a match with no stored host (`service._match_host`). Genuine player-versus-player = `opponent_type=human` AND `is_bot_match=false`.
- **Not recorded anywhere:** a Daily *parent* completion and any whole-Daily start/finish. Only the stage child match has `ranked_started`/`ranked_completed`. Full-challenge completion therefore cannot be reported without a Railway change (suggested follow-up, not done).

Frontend: `/quiz/ranked` (`QuizRankedPage.tsx`) only discovers existing matches (`getActiveMatch`, `getMatchResult`; GETs) and never starts one; with no match it returns the visitor to `/quiz`. The only browser callers of `joinQueue` are the public queue hook and two admin/playtest hosts (pinned by a new guard test).

## Changes
1. **Daily entry click** — new product event `daily_challenge_entry_clicked` (`src/lib/analytics/dailyEntry.ts`, registered in `contract.ts`), metadata bounded to `entry_surface` (`home_hub` | `leaguecraft` | `other`) and `control` (closed list): Home Hub button `academy_core_daily_button`; Leaguecraft `play_seal_ranked_closed` (PLAY when Ranked is not open), `play_scroll_daily_clause`, `play_scroll_resume_optional`, `centre_stage_daily_panel`. A click observation only. Arrivals without a click (URL, refresh, bookmark, Back, More Challenges bonus-stage Play) carry no entry event and the timeline says nothing about their door. More Challenges cards already emit `more_challenges_mode_selected`; the timeline now names the mode.
2. **Attribution** (`roundAttribution.ts`): Daily stage / More Challenges (mode name from `session_preset`) / Role Challenge / Ranked vs bot / Ranked vs player / playtest / journey / study hall / unknown, from server rows only. Browser-reported rounds and route names never attribute. Contradictory provenance (human + `is_bot_match`, bot + not bot) stays unknown; `rankedHostBucket` (Users → Engagement) got the same rule.
3. **Timeline** (`visitorJourney.ts`, `OverviewVisitorJourneys.tsx`): each action has a kind chip — Page view, Button click, Game start, Stage completed, Game completed, Session — plus literal titles ("Daily Challenge stage 2 (Time Trial) started", "Pressed the Daily Challenge button on the Home Hub (Academy)", "Pressed Play on Survival in More Challenges"). Technical evidence (opponent type, bot match, creation source, completion reason) stays collapsed. "Last observed activity" remains a received timestamp, never an exit.
4. **After Daily** (`afterDaily.ts`, "After the Daily Challenge" card on Overview): per browser, anchored on its last recorded Daily stage activity; first different game started later; return = a later session on a later UTC day, counted only for browsers with ≥ 1 full day of follow-up, otherwise "not enough follow-up time". Browser-based, no cross-device identity.
5. **Ranked start guard:** `useRankedQueue({ startAllowed })` refuses to send a join/bot-join when the host knows Ranked is closed (public scroll passes `modes.ranked`); the record's mode handler ignores a hidden mode; client now treats server `RANKED_QUEUE_PAUSED` as unavailable (previously unknown ⇒ generic retryable error). Recovery of an existing match/queue entry is not gated. Server remains the real enforcement.
6. `AdminShell.areas.test.tsx`: same one-file `QueryClientProvider` fix as PR #94 (identical content, so either merge order is clean).

## Tests (local, LF checkout, Windows)
- New/updated: `dailyEntry.test`, `visitorJourney.test`, `afterDaily.test`, `OverviewVisitorJourneys.attribution.test`, `metrics.test` (host bucket), `useRankedQueue.test` (+4), `AcademyCorePage.test` (+1), `rankedStartSurfaces.test` — all pass.
- Typecheck vs main baseline: clean. ESLint on changed files: clean.
- Remaining local failures were already present on `edc96f7d` before these changes (the Windows-path and stale-role ones are understood; the Quiz ones are not): `Quiz.guide/hub/playScroll/rankedRole` (the PLAY record never appears in jsdom; root cause NOT investigated — the availability hook is pinned open in that suite, so it is not that; identical counts 4/14/55 on `edc96f7d` before any of these changes), Windows path-separator source-scan guards (`noStaticLeagueFacts`, `users1AudienceIdentity`, `AdminPlatformPolicies`), `admin-registry.routes` (stale `master_admin` role assertions since 8253bf88).
- Because of that Quiz-suite state the Leaguecraft click wiring (`play_seal_ranked_closed`, `play_scroll_*`, `centre_stage_daily_panel`) is covered by code review and type check, **not** by a rendering test; only the Home Hub click is test-covered. Worth a follow-up once those suites are date-pinned.
- CI: `.github/workflows/gameplay-analytics.yml` (Linux: focused tests, build, TS baseline). No browser run was added; the owner Overview route needs an MFA session and was not rendered.

## Read-only queries for the owner (NOT run by me)
```sql
-- What kind of Ranked rounds exist (as of now)
select metadata->>'host' as host, metadata->>'opponent_type' as opp, metadata->>'is_bot_match' as bot, count(*)
from analytics_events where event_name='ranked_started' and source_system='railway' group by 1,2,3 order by 4 desc;
-- Any genuine player-vs-player round
select min(received_at), max(received_at), count(*) from analytics_events
where event_name='ranked_started' and source_system='railway'
  and metadata->>'opponent_type'='human' and coalesce(metadata->>'is_bot_match','false')='false';
-- When the Ranked pause setting last changed
select key, value, updated_at from app_settings where key in ('queue_ranked_enabled','queue_daily_enabled','queue_bonus_games_enabled','queue_role_challenge_enabled');
```

## Limitations / follow-ups
- No whole-Daily completion or abandonment event (needs Railway emission).
- Daily entries via paths with no click event stay unattributed on purpose.
- New event is browser-side: blocked trackers lose it; it does not prove a run began.
- Owner-only Admin remains the only reader; MFA/privacy unchanged.
