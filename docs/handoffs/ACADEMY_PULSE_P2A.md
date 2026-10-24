# Academy Pulse — PULSE-2A: real Academy data

Lane: PULSE-2A / DATA (GitHub issue mitcherrman/mogsy#151). Branch `pulse/p2a-real-data`, draft PR mitcherrman/mogsy#154. Nothing is merged or published.

- **Current integration:** `origin/main` **6e334d60** (which includes PULSE-1.2 #152, `edac9d7d`) was merged into the branch at `5d1543d5`. The code head tested in CI is **f735bd59** (§8). Later commits are docs only.
- **Original base:** `main` **a0f426d4**.
- **Backend audited:** `League_Combat_Simulator` `master` **0a0d88f2**.

## 1. Outcome

Production Pulse now gets its content from a **per-viewer live provider** (`src/features/academy-pulse/content/live/`).

| Viewer | What Pulse shows | Network |
|---|---|---|
| Signed out, auth still resolving, **anonymous guest session**, or no AuthProvider | The public editorial catalogue from PULSE-1 §9, unchanged | **None** |
| Signed-in account, Free | Editorial, plus **Your Daily** (newest Daily: score and C/A) and **Your Practice & Time Trial** (the server's snapshot of recent answers) | 2 self-scoped GETs |
| Signed-in account, Premium | Editorial without the Premium promotion, plus Your Daily, the **server-fitted Daily accuracy trajectory** and the **server's Practice window** (series and comparable movement) | Same 2 GETs |
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

- **No second scheduler.** Live items are ordinary `PulseItem`s in existing categories, drawn by existing scene kinds. Cadence and rotation are untouched; scenes have label-only edits (below).
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
- **Truthful labels** (command center, 2026-10-24):
  - **Your Daily.** The viewer's own Daily card is labelled **"Your Daily"** wherever a category label appears: the nameplate chip, the slide's accessible name, the scene pips, the expanded header and the ticker. Its kicker also reads "Your Daily". `pulseItemLabel(item)` (`live-items.ts`) overrides the label for that one live item id only; every other item, including any non-live item with the same id, keeps `CATEGORY_LABEL`. No shared type changed.
  - **Chart points.** `InsightScene` probes are named by their place in the series, e.g. "3 of 5: 88%", and the list is announced as "<seriesLabel>, oldest first". They no longer say "Day N", because a point may be a Daily run or a day studied. `seriesLabel` says which. The visible tip still shows the value.
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
- `src/features/academy-pulse/AcademyPulse.tsx`:
  - default provider is the live one (DEV fixtures unless `VITE_ACADEMY_PULSE_CONTENT=live`);
  - `usePulseContent` is per provider;
  - the scene presence is keyed by provider;
  - labels come from `pulseItemLabel`.
  - #152's focus-restore (`openedByKeyboard`/`restoreFocusTarget`), `data-holds` diagnostics and `userPaused`-driven Pause control are preserved unchanged by the merge.
  - Its test gains 2 provider-switch and 2 label tests.
- `src/features/academy-pulse/PulseExpanded.tsx`, `scenes/TickerScene.tsx`: the category label comes from `pulseItemLabel`.
- `src/features/academy-pulse/scenes/InsightScene.tsx`: probe and list labels (see §3).
- `src/features/academy-pulse/content/pulse-provider.ts`: header comment only. `publicPulseCatalogue`/`publicPulseProvider` are unchanged and remain the editorial base.
- `.github/workflows/academy-pulse.yml`: an additive step running the live spec with `VITE_ACADEMY_PULSE_CONTENT=live`, plus its path filter.

**Not touched:** `model/pulse-types.ts`, `model/pulse-cadence.ts`, `model/pulse-rotation.ts`, `usePulseRotation.ts`, `AcademyCorePage.tsx`, `App.tsx`, migrations, the Admin Pulse UI (P2B), partner content (P2C), `e2e/academy-pulse.spec.ts` (REL), and the backend. **No shared type change**, so no contract PR is needed.

## 5. Evidence

Local, L2. Unit/integration only: no local browser was run (AGENTS.md, #151).

| Check | Result |
|---|---|
| Baseline `src/features/academy-pulse` on a0f426d4 | 55/55 |
| `src/features/academy-pulse` on the first head 89a1372b | 89/89 (34 new: items 14, provider 9, reads 5, viewer 4, shell 2) |
| `src/features/academy-pulse` on the combined head f735bd59 (with #152) | **94/94** (adds #152's updated tests, 2 label item tests and 2 label shell tests) |
| `src/pages/academy-core` + `AcademyRadioStrip`, combined head | **200/200** |
| `tsc -p tsconfig.app.json` | 0 errors in touched files. The 2 reported errors (`OnboardingProfile.tsx:180`, `lib/identity/connections.ts:263`) are in files this branch does not touch. |
| eslint on `src/features/academy-pulse` and the live spec | 0 errors. 17 `react-refresh/only-export-components` warnings in scene files: the existing pattern, none new. |
| Spec typecheck alone | **Not run.** The mogzy resource guard blocked it (≈0.8 GB RAM free of the 5.5 GB required, League client open). CI compiles the spec. |

Local vitest used the documented workaround: an esbuild-JSX scratch config plus a `@rollup/wasm-node` require hook, because shared swc and native rollup are blocked on this machine.

Browser (GitHub runner, `academy-pulse` workflow, new step):
- guest: no personal read;
- anonymous session: no personal read;
- Free: record and Practice card, exact request paths and bearer token, Premium invitation present, no "Sample"; the chip reads "Your Daily", there is a "Scene N: Your Daily" pip, and no "Player activity" pip;
- Premium: Insight scene, no Premium promotion;
- failure plus hang: editorial within the budget, never "quiet".

Stills are written to `test-results/academy-pulse-live/` in the `academy-pulse-evidence` artifact. CI result: §8.

## 6. Risks and owner questions

1. ~~"Player activity" chip on the viewer's own Daily~~ **Resolved** (command-center default): it is labelled "Your Daily" everywhere, with no shared type. A dedicated category remains an option for later, as a shared-type change through #151.
2. ~~Insight "Day N" probes~~ **Resolved**: probes are named by their place in the series. Per-point dates or run labels would need an optional field on `InsightItem`, a shared type, so that is not done.
3. **Cold start for accounts.** The glass can be empty for up to 3 s on a slow backend. The alternative is to draw editorial and accept a scene swap.
4. **The Premium promotion stays visible while entitlement is `unknown`.** This is conservative: no content is unlocked by the client.
5. **Freshness.** Personal scenes are read once per mount, with a 5-minute warm cache. A Daily finished in another tab appears on the next visit.
6. **Owner wording decisions** for the verified but unused sources in §2: the game-modes `streak_days` scope, Mastery "continue", XP tier, `/api/quiz/stats`.
7. **The Premium browser case** passes. It cannot tell whether the RPC stub (`proStatus=pro`) or the server-says-Premium path hid the promotion: both hide it, and both are unit-tested separately.

## 7. Next

- P2B/P2C publish their content contracts, then integrate admin and partner items through the same provider (`withLiveItems`).
- Leaderboard and community activity need a backend consent model and a public read first. That is backend work, owner-gated.
- Optional, later: one shared-type PR through #151 (a per-point label on `InsightItem`, a dedicated "your record" category).

## 8. PR and CI

PR mitcherrman/mogsy#154 (draft). All runs on GitHub's runner, with bundled headless Chromium.

| Head | Content | Workflow | Run | Result |
|---|---|---|---|---|
| 89a1372b | first P2A head, on a0f426d4 | `academy-pulse` | 40073772559 | success: vitest 361/361; `academy-pulse.spec` 21/21; live spec 5/5 |
| 89a1372b | | `academy-core-orrery` (dispatch) | 40074472756 | success |
| **f735bd59** | **combined: main 6e334d60 (incl. #152) + P2A + labels** | `academy-pulse` | **40089419144** | **success** (details below) |
| **f735bd59** | | `academy-core-orrery` (dispatch; its path filter doesn't fire for Pulse-only changes) | **40089423141** | **success** (details below) |

`academy-pulse` on f735bd59:
- vitest **366/366**;
- production build and the DEV-lab bundle guard passed;
- `e2e/academy-pulse.spec.ts` **25/25**, including #152's "mouse-opened expanded view closed with Escape does not leave rotation paused", "keyboard-opened … keeps the keyboard focus hold", Pause-holds and parked-cursor cases;
- `e2e/academy-pulse-live.spec.ts` **5/5**.

`academy-core-orrery` on f735bd59:
- vitest **277/277**;
- production build passed;
- `academy-core-v35.spec` **68 passed, 10 skipped** (its evidence suites, skipped by the workflow's design);
- `academy-core.spec` **23/23**.

Evidence artifact: `academy-pulse-evidence`, including `academy-pulse-live/`.

**Integration-ready:** yes, as a draft for command-center review. It is not merged and not published.
