# Academy Pulse — PULSE-2A: real Academy data

Lane: PULSE-2A / DATA (GitHub issue mitcherrman/mogsy#151). Branch `pulse/p2a-real-data`, base frontend `main` **a0f426d4** (verified as origin/main on 2026-10-24). Backend audited at `League_Combat_Simulator` `master` **0a0d88f2**. Draft PR: see §8. Nothing is merged or published.

## 1. Outcome

Production Pulse now gets its content from a **per-viewer live provider** (`src/features/academy-pulse/content/live/`).

| Viewer | What Pulse shows | Network |
|---|---|---|
| Signed out, auth still resolving, **anonymous guest session**, or no AuthProvider | The public editorial catalogue from PULSE-1 §9, unchanged | **None** |
| Signed-in account, Free | Editorial, plus **Your Daily record** (newest Daily: score and C/A) and **Your Practice & Time Trial** (the server's snapshot of recent answers) | 2 self-scoped GETs |
| Signed-in account, Premium | Editorial without the Premium promotion, plus Your Daily record, the **server-fitted Daily accuracy trajectory** and the **server's Practice window** (series and comparable movement) | Same 2 GETs |
| Any account whose reads fail, are refused or exceed 3 s | Exactly the guest catalogue | Reads aborted |

All other cadence slots stay empty for everyone, and the existing scheduler skips them: community activity, leaderboards, sponsor, creator, community challenge and event. The data needed for them does not exist or is not consented (§2).

## 2. Data-source and entitlement matrix

Verified in code at the SHAs above. "Self" means the server scopes the read to the JWT subject; no user id is accepted from the caller. Freshness: no personal endpoint sets cache headers, and every one is computed live from SQLite per request (`api_server.py:560-587` has no cache middleware). Any route can answer 503 `patch_ops_maintenance`.

### Used by Pulse

**`GET /api/history/v1?limit=&cursor=`** (`routes/history.py:27`, projection `history/daily.py:735-890`)
- **Audience:** account only.
- **Gate:** `require_account_identity`. Signed out → 401; anonymous → 403 `ACCOUNT_REQUIRED`.
- **Free fields:** `run_id`, `plan_date`, `completed_at`, `main{daily_score}`, `parent`, `basic{score, correct, answered, accuracy 0–1}`, `stages[].basic` (with an in-stage `longest_streak`), `analytics_capability`.
- **Premium fields:** `analytics{historical_average, previous_run_delta_pp, personal_best, trajectory{direction, fitted_change_pp, values 0–1}, …}` and `population` (anonymous percentiles, cohorts of at least 100). The server attaches these only when `can_view_trends`. Free gets `analytics:null`.
- **Freshness:** live. Newest first; only completed or v5-main-settled runs.
- **Pulse uses:** the newest record via `dailyHeadline`; the trajectory only when `state=available` and `sufficiency=sufficient`. Population is never used.

**`GET /api/quiz/analytics/trends?window=`** (`routes/analytics.py:105`, `services/personal_analytics.py:641-716`)
- **Audience:** account only.
- **Gate:** `require_account_identity`.
- **Free fields:** an allow-list projection of the last 50 answers: `current{attempts, correct, accuracy 0–100, active_days}`, `recent_answers`, `span_days`, `categories`, `modes`. No comparison keys at all.
- **Premium fields:** a 7/30/90 window, plus `previous`, `delta{direction, comparable}`, `series[]`, per-category direction and `recurring_weak`.
- **Freshness:** live. Read-only (three SELECTs).
- **Scope:** counts Practice and Time Trial only.
- **Pulse uses:** called with no window, so the server picks the caller's first allowed window. Free → a card; Premium → a reading.

**Premium session** (`usePremiumSession` → Supabase RPC `my_pro_entitlement`)
- **Audience:** account. Self-scoped by RLS.
- **Fields:** `effective_pro`.
- **Freshness:** once per session.
- **Pulse uses:** only to **drop** the Premium promotion. It never unlocks content: Premium scenes come only from server payloads.

### Verified, not used by Pulse

**`GET /api/daily-run/today`** (`routes/daily_run.py:505`)
- **Audience and gate:** account or verified guest; `require_player`.
- **Fields:** today's run: `status`, `main_completed_at`, `main_score`, stages.
- **Freshness:** live. It may close the caller's own stale prior-day runs (an idempotent write).
- **Why not:** the Orrery already reads it for the Daily seal, and Pulse repeating "today's Daily" adds nothing.

**`GET /api/game-modes/me/summary`** (`routes/public_game_modes.py:303`)
- **Audience and gate:** account or verified guest; `require_player`; rate-limited.
- **Fields:** `overall{games_played, streak_days, …}`, `modes{}`.
- **Why not:** `streak_days` counts bonus games and Daily **Time Trial/Survival**, but not the main Daily or Practice. Shown as a "streak" it would mislead, so it needs an owner wording decision.

**`GET /api/quiz/achievements/{user_id}`** (`routes/quiz.py:1143`)
- **Audience and gate:** self only via `resolve_profile_read_user_id` (another user's UUID → 403).
- **Fields:** 6 static quiz achievements: `title`, `description`, `threshold`, `unlocked`, `unlocked_at`.
- **Why not:** there is no tier, rarity or percent-of-players. The Activity scene needs both, and inventing them is forbidden.

**`GET /api/quiz/progress/{user_id}`** (`routes/quiz.py:600`)
- **Audience and gate:** self only (same rule).
- **Fields:** XP, `current_streak`/`best_streak` (consecutive correct answers), XP rank tier.
- **Why not:** "rank" here is an XP tier, not a position among players. Usable later as an insight, but it needs a scene contract.

**`GET /api/ranked/progression`, `/history`, `/module-stats`** (`routes/ranked_public.py`)
- **Audience and gate:** account; Ranked must be enabled; rate-limited.
- **Fields:** rating, tier; `history` includes `opponent_display_name`.
- **Why not:** Ranked is outside the Pulse brief, and `history` exposes other players' names.

**`GET /api/mastery/progress`** (`routes/mastery.py:239`)
- **Audience and gate:** account or verified guest.
- **Fields:** per-set progress, `best_score`, `active_session`.
- **Why not:** a candidate for "continue where you left off", but it needs a scene and owner copy.

**`GET /api/quiz/stats`** (`routes/quiz.py:245`)
- **Audience and gate:** public, no auth.
- **Fields:** platform `total_attempts`, `overall_accuracy`, question counts.
- **Why not:** it is the only public aggregate, and no scene fits it honestly yet.

**`GET /api/game-modes`** (`routes/public_game_modes.py:68`)
- **Audience and gate:** public.
- **Fields:** the mode catalogue.
- **Why not:** a game-discovery candidate (owner copy).

### Never used: owner-only or internal

**`GET /api/daily-run/admin/users/{id}/history`** (`routes/daily_run.py:163`)
- **Gate:** `require_admin` (owner Supabase session plus MFA via `owner_auth_state`). A player gets 403.
- **Fields:** a user's full Daily runs. `no-store`, and the read is logged.
- **Pulse:** forbidden. A test pins that Pulse reads no admin, internal, owner, population or user-keyed route.

**`GET /api/quiz/admin/progress-users`** (`routes/quiz.py:1216`)
- **Gate:** `require_admin`.
- **Fields:** the top 50 users' XP and streaks.
- **Pulse:** forbidden.

**`/api/internal/history-population/*`** (`routes/internal_history_population.py`)
- **Gate:** a bearer service token.
- **Fields:** population refresh and status.
- **Pulse:** forbidden.

**Admin analytics tables** (Supabase, RLS owner-read)
- **Gate:** owner.
- **Pulse:** forbidden (issue #151).

### Absent: no authoritative source exists

| Capability | Finding | What would be needed |
|---|---|---|
| Community leaderboard / ranking / percentile of app users | **None.** `pro_play_stats._leaderboard` ranks esports pros, not Mogzy users. No consent, opt-in or public-profile flag exists in the backend. | A new, consented, public read keyed on `public.profiles.id` (backend comment `supabase_auth.py:278-281`) and an owner consent policy. **Leaderboard stays disabled.** |
| Community player activity (who achieved what) | None | A consented public activity feed |
| Consecutive-day Daily streak | None (the parent run keeps no streak) | A backend definition of a Daily streak |
| Achievement tier / rarity / % of players | None | Backend fields |
| Recommendations / "next for you" | None | A backend endpoint; the client must not infer one |
| "Players today" count | None | A public aggregate |

Identity correlation: Pulse holds no user id beyond the in-memory cache key. Requests carry only the Supabase bearer token, the same path History and the Practice record use (`authedRequest`: a GET never mints an identity). Item ids are fixed strings (`live-daily-record`, `live-daily-trend`, `live-practice`), because a scene puts its id into the DOM. Run ids and refs are never copied into items (unit-tested).

## 3. Design

```
usePulseViewer ── useAuth (permanent account only) + usePremiumSession
   │
createLivePulseProvider(viewer) ── guest: publicPulseCatalogue (peek = load, no reads)
   │                              account: peek = warm cache or null; load = reads ⟶ items
   ▼
AcademyPulse (usePulseContent) ⟶ usePulseRotation (unchanged) ⟶ buildPulseCycle (unchanged) ⟶ scenes (unchanged)
```

- **No second scheduler.** Live items are ordinary `PulseItem`s in existing categories, drawn by existing scene kinds. Cadence, rotation and scenes are untouched.
- **Placement.** The viewer's Daily record is a News-kind item in the `player-activity` slot. Premium readings are Insight-kind items in `personal-insight`, and the Free Practice card is a News-kind item there. Why not put everything in `personal-insight`: the scheduler never plays two scenes of the same kind back to back. For a Premium viewer the Premium slot is dropped, so a News-kind personal card in `personal-insight` would always follow the editorial News scene, and most cycles would skip it.
- **Bounded.** One deadline for both reads (`LIVE_READ_TIMEOUT_MS = 3000`). A read still running is aborted and contributes nothing; the other read's scene still shows.
- **Cancellation-safe.** The shell's AbortSignal aborts every read. `load` rejects only on that abort, which the shell ignores. Any other failure (401/403, 5xx, contract violation, timeout) returns the editorial catalogue, never `{}`.
- **Warm cache.** It holds one viewer for 5 minutes, and only a complete answer (both reads succeeded). A different viewer clears it. A Premium-status change re-creates the provider, and the warm cache serves it without a second read.
- **Cold account start.** The glass stays empty for at most the read budget, instead of drawing editorial scenes that the record would replace a moment later. Guests draw at once.
- **Viewer switch** (shell fix in `AcademyPulse.tsx`). A catalogue now belongs to the provider that produced it. A new provider shows its own `peek` in the same render, and the scene `AnimatePresence` is keyed by provider. A sign-out or account switch therefore cuts the previous viewer's scene immediately rather than leaving it on screen while the next load runs or while it plays an exit animation.
- **Entitlement.** The client never decides what Premium may see:
  - the trajectory appears only if the server attached analytics, marked them `available` and reported `sufficient` evidence;
  - Premium Practice content appears only if the server's `tier` is `premium`;
  - a Free payload's absent comparison keys are never rebuilt (no Free sparkline of per-run accuracy, no client-computed delta);
  - the Premium promotion is hidden when the session says `pro` or a server payload says Premium.
- **Copy.** Each figure is formatted with History's and the Practice record's own helpers: `dailyHeadline`, `planDateLabel`, `signedPoints`, `recentSpanLabel`, `windowLabel`. Scope wording follows the Practice record: "Practice & Time Trial".
- **DEV.** The dev server and the lab still play the labelled fixtures. `VITE_ACADEMY_PULSE_CONTENT=live` makes the dev server use the live provider (CI uses this for the browser spec). Production always uses the live provider, which still behaves exactly as PULSE-1's public editorial feed for every guest.

## 4. Changed files

New (lane-owned):
- `src/features/academy-pulse/content/live/live-reads.ts` (+ test): the two reads and the trends contract check.
- `…/live/live-items.ts` (+ test): pure projections.
- `…/live/live-provider.ts` (+ test): the provider, its budget, cache and fallback.
- `…/live/useLivePulseProvider.ts` (+ test): viewer identity and provider memo.
- `e2e/academy-pulse-live.spec.ts`: GitHub-runner browser acceptance.
- `docs/handoffs/ACADEMY_PULSE_P2A.md`: this file.

Edited (final integration, the lane's assignment in #151):
- `src/features/academy-pulse/AcademyPulse.tsx`: default provider is the live one (DEV fixtures unless `VITE_ACADEMY_PULSE_CONTENT=live`); `usePulseContent` is per provider; the scene presence is keyed by provider. Its test gains 2 provider-switch tests.
- `src/features/academy-pulse/content/pulse-provider.ts`: header comment only. `publicPulseCatalogue`/`publicPulseProvider` are unchanged and remain the editorial base.
- `.github/workflows/academy-pulse.yml`: an additive step running the live spec with `VITE_ACADEMY_PULSE_CONTENT=live`, plus its path filter.

**Not touched:** `model/pulse-types.ts`, `model/pulse-cadence.ts`, scenes, `AcademyCorePage.tsx`, `App.tsx`, migrations, the Admin Pulse UI (P2B), partner content (P2C), `e2e/academy-pulse.spec.ts` (REL), and the backend. **No shared type change**, so no contract PR is needed.

## 5. Evidence

Local, L2. Unit/integration only: no local browser was run (AGENTS.md, #151).

| Check | Result |
|---|---|
| Baseline `src/features/academy-pulse` on a0f426d4 | 55/55 |
| `src/features/academy-pulse` with this branch | **89/89** (34 new: items 14, provider 9, reads 5, viewer 4, shell 2) |
| `src/pages/academy-core` + `AcademyRadioStrip` | **200/200** |
| `tsc -p tsconfig.app.json` | 0 errors in touched files. The 2 reported errors (`OnboardingProfile.tsx:180`, `lib/identity/connections.ts:263`) are in files this branch does not touch. |
| eslint on every touched file, including the spec | 0 problems |
| Spec typecheck alone | **Not run.** The mogzy resource guard blocked it (≈0.8 GB RAM free of the 5.5 GB required, League client open). CI compiles the spec. |

Local vitest used the documented workaround: an esbuild-JSX scratch config plus a `@rollup/wasm-node` require hook, because shared swc and native rollup are blocked on this machine.

Browser (GitHub runner, `academy-pulse` workflow, new step):
- guest: no personal read;
- anonymous session: no personal read;
- Free: record and Practice card, exact request paths and bearer token, Premium invitation present, no "Sample";
- Premium: Insight scene, no Premium promotion;
- failure plus hang: editorial within the budget, never "quiet".

Stills are written to `test-results/academy-pulse-live/` in the `academy-pulse-evidence` artifact. CI result: §8.

## 6. Risks and owner questions

1. **The "Player activity" chip on the viewer's own Daily card.** It is the viewer's own activity, but the chip could be read as community activity. The kicker says "Your Daily record". Alternatives: an owner cadence change, or a new category, which is a shared-type change through #151.
2. **Insight probe wording.** `InsightScene` labels each point "Day N" with a % tip. Daily trajectory points are runs, and Practice points are days studied. Accurate wording needs an optional per-item point label on `InsightItem`, a shared-type change for #151.
3. **Cold start for accounts.** The glass can be empty for up to 3 s on a slow backend. The alternative is to draw editorial and accept a scene swap.
4. **The Premium promotion stays visible while entitlement is `unknown`.** This is conservative: no content is unlocked by the client.
5. **Freshness.** Personal scenes are read once per mount, with a 5-minute warm cache. A Daily finished in another tab appears on the next visit.
6. **Owner wording decisions** for the verified but unused sources in §2: the game-modes `streak_days` scope, Mastery "continue", XP tier, `/api/quiz/stats`.
7. **Unverified until CI runs:** the live spec's selectors on the real page, and the Supabase RPC stub making `proStatus=pro`. If the stub doesn't take, the server-says-Premium path still hides the promotion for the Premium payloads.

## 7. Next

- P2B/P2C publish their content contracts, then integrate admin and partner items through the same provider (`withLiveItems`).
- Leaderboard and community activity need a backend consent model and a public read first. That is backend work, owner-gated.
- Decide §6.1–6.2, then make one shared-type PR (point labels, optional category) through #151.

## 8. PR and CI

Recorded after the push: see the PR description and the #151 report.
