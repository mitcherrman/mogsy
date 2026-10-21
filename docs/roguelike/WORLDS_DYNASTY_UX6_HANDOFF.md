# Worlds Dynasty · UX-6 handoff — Playable management loop (E3A in the cinematic BO5)

**Status:** implemented and verified against a **real local E3A backend** on branch `ux/ux6-dynasty-management` (new worktree `C:\Users\mlmit\mogzy-wt\ux6-mgmt`), cut from UX-5 `bcb73349`.
- **Local only.** Nothing is pushed, merged or deployed.
- No backend file, credential, migration, production database or registry was touched.
- The E3A worktree (`.worktrees/wd-v2-e3a`) and the UX-5 worktree (`mogzy-wt/ux3-bo5`) are unmodified; their `git status` is clean.

**Route:** `/dev/dynasty-v2?view=bo5&transport=live[&policy=broad_mid_win][&scenario=fresh][&management=off]`.
- New live series are E3A management series; the entry state defaults to `congested_schedule`.
- `&management=off` creates a plain e2 series.
- The gate is the snapshot itself: `schema_revision >= 3` with a `management` block. Any other series renders the UX-5 flow unchanged.

**One line:** you enter headquarters, see your ten-player squad as the server holds it, plan three preparation days, pick a squad player and a champion per role, play each game on the VIS-F4 stage with the server's management terms explained stage by stage, make one backstage adjustment between games, and end on what carries forward. Every number on those screens is the server's.

## 0. Verified starting state

| Item | Verified |
|---|---|
| E3A `bc928207` → handoff record `516cf7a5` | on `roguelike/wd-v2-e3a-management`; `git merge-base --is-ancestor bc928207 516cf7a5` = true; parent `3cbdc1e0` (E2 hardened); worktree clean |
| UX-5 `bcb73349` | tip of `ux/ux3-dynasty-real-bo5`; `756ca7ad` (VIS-F4) is an ancestor; worktree clean |
| Docs read | `CLAUDE.md` (both repos; git rules), UX-3 handoff §6/§9/§10 (UX-4/UX-5), `WORLDS_DYNASTY_E3_HANDOFF.md`, `WORLDS_DYNASTY_E3A_API.md`, `fixtures/dynasty_series_e3a_samples.json` |
| New worktree | `git worktree add -b ux/ux6-dynasty-management C:\Users\mlmit\mogzy-wt\ux6-mgmt bcb73349`; `node_modules` is a junction to the main mogsy checkout (**delete the junction before any `git worktree remove`**) |

## 1. Phase 1 — the integration contract (checked against code and real responses)

Every E3A operation the UI needs is already exposed over HTTP by `routes/dynasty_series.py` (prefix `/api/admin/dynasty/v2`, `DYNASTY_ENABLED` + `require_admin`):

| Need | Route / action | Used by |
|---|---|---|
| Create an E3A series | `POST /series` + `management_rules`, `entry_scenario` (both or neither) | `LiveSeriesTransport.create` |
| Discovery / resume | `GET /series` (rows carry `management_rules`, `entry_scenario`), `GET /series/{id}` | unchanged UX-5 path; the picker labels E3A rows |
| Preparation | action `commit_preparation {activities}` (phase `preparation`) | `commitPreparation` |
| Squad + champions | action `lock_lineup {game, champions, players}` (players required on E3A) | `lockSquad` |
| Between games | action `choose_tactic {game, choice}` (phase `tactics`) | `chooseTactic` |
| Game, Baron | `advance`, `open_objective`, `answer_objective` | unchanged |
| Retries | identical `expected_seq` + `action_id` body → `duplicate: true` | unchanged hook retry |

**No second management implementation was written in the frontend.** The client sends ids and choices only. It never computes fatigue, power, cohesion, proficiency or eligibility.

**Backend gaps found (none blocks the loop):**

| # | Gap | Effect in UX-6 |
|---|---|---|
| G1 | **No preview for a changed lineup** (E3A owner decision U6). `lineup.preview` covers only the suggested five on the suggested champions. | When the owner changes a player or champion, the draft says so. Each card keeps its own server values (fatigue, net management power, proficiency on the picked champion, the reserve's cohesion cost). The exact inputs appear after locking, both in-game and in `management.combat_inputs`. Nothing is estimated. |
| G2 | No listing route for entry scenarios | The two keys `congested_schedule` and `fresh` (API §1) are a constant in `e3acontracts.ts`. The server's own scenario record is shown once a series exists. |
| G3 | Champion profiles exist only in the `lineup` phase (`champion_pool`) | The preparation practice picker names champions from their key (`syn_c1_artillery` → "Artillery"), with the server's proficiency value. |
| G4 | No abandon route (open since E2) | Unfinished E3A series stay in discovery. The capture leaves one fresh-scenario series, and the UI refusal check leaves another. |
| G5 | Opponent champion profiles (open since UX-4) | Unchanged. |
| G6 | Trait and expiry ledger entries use `before`/`after`/`delta: null`, with the power in `value` | Rendered as "gains In form (+1.5 power, 2 games)" and "… ended". Not documented in API §3.2; worth a line there. |

## 2. What was built

| File | Role |
|---|---|
| `src/lib/dynasty/e1/e3acontracts.ts` (new) | Types for the `management` block (API §3): player rows, ledger, effects, decisions, combat inputs, carry-over. `readE3aManagement` refuses a drifted block. Presentation helpers parse the server's own `e3a.*` source ids and name them, with no rules. |
| `e2contracts.ts` | Phases `preparation`/`tactics`, actions `commit_preparation`/`choose_tactic`, lineup E3A extras, `management`, discovery fields. `readE2Snapshot` requires `management` exactly when `schema_revision >= 3`. It refuses E3A phases on a series without management, and an E3A lineup without `players_by_role`/`suggested_players`/`preview`. `isManaged()` is the gate. |
| `e2mapper.ts` | On an E3A series the status comes from the **server phase alone**: preparation → prep, lineup → drafting, tactics → between games. The e2 client stand-ins (`plan`, `decisions`) are ignored. The `management` block is passed through verbatim as `envelope.management`. Per-role drafts get a per-game lineup id (`custom-g<n>`). |
| `liveTransport.ts`, `transport.ts`, `useDynastySeries.ts`, `fixtureServer.ts` | `commitPreparation`, `lockSquad`, `chooseTactic`, and `create` with the management fields. `choosePlan`/`decide`/`lockLineup` are **refused locally** on an E3A series, so `players` is never dropped (API §5.8). The two E3A decisions carry no client phase check: the server refuses a wrong phase with its own message and the fresh state, and an identical retry must reach it. The contract double refuses all three (no management state). |
| `src/pages/dev/dynasty-v2/bo5/Management.tsx` (new) | The screens, in VIS-F4's plates, monograms and role emblems: `SquadScreen` (headquarters), `PreparationScreen`, `SquadDraftScreen`, `TacticsScreen`, `ManagementInfluence` (in-game), plus the shared `ChangeList`, `EffectsPanel`, `CarryForward` and `CombatInputsPanel`. |
| `bo5/managementView.ts` (new) | Pure read helpers: `influenceRows` (every management contest component, linked to `combat_inputs`), the explain-sheet split, and starter names. |
| `bo5/Bo5Flow.tsx` | The E3A screens wired into the existing state machine, plus the home screen's entry-state choice, the banner, E3A picker tags, rooms that follow the squad (starters, cohesion), the lock-in with player names, the result-screen ledger, and series carry-forward with the reserves fielded per game. |
| `bo5/ServerGame.tsx` | The management strip under each revealed tally. The "Why" sheet groups the `modifier:e3a.*` components under **Management** and lists the opponent's. Player names on the lineup strip and the walkout. |
| `scripts/dynasty/capture_ux6_e3a_live.py` + `fixtures/e3a-live-capture.json` (993 KB) | Real E3A responses from the local backend: 22 states, including every refusal and both duplicate retries (§5). |
| `e3aTransport.test.ts` (12), `bo5/Management.test.tsx` (6) | §5. |

## 3. Phases 2–5 — how each screen is backed

| Screen | Server data shown | Action sent |
|---|---|---|
| **Home** | The entry state choice (Congested schedule / Fresh squad) | `create` with `management_rules` + `entry_scenario` |
| **Headquarters** (`hq` room) | `management.entry_scenario`; ten `you.players` rows (identity, role, core/reserve, stage ratings, fatigue with `fatigue_power`, `net_management_power`, traits, conditions, the reserve's `substitute_cohesion_cost`); `recent_changes` (the entry ledger) | — |
| **Preparation** | `decisions.preparation` (title, effects, opportunity cost, `eligible`, `unavailable_reason`, `slots`, `idle_day`, `rule`); `effects` grouped by `scopes` | One `commit_preparation` with the whole plan in day order. Ineligible options cannot be added; nothing else is pre-validated. |
| **Room follows the activity** | Rest/idle → HQ, scrims/practice → practice room, VOD review → war room (VIS-F4 compositions; presentation only) | — |
| **Draft** (war room) | `lineup.players_by_role` (two cards per role, with proficiency on the selected champion; practiced picks ★), role pools filtered by `champion_pool`, `lineup.preview` for the suggestion (§1 G1 otherwise), `recent_changes` since the last decision | `lock_lineup` with `champions` + `players` |
| **Game** | Each tally's `modifier:e3a.*`, `proficiency` and `team:cohesion` components, verbatim, each linked to `management.combat_inputs` (for example "t_user-mid on Artillery: proficiency 0.60, practiced (prep.d3.champion_practice)", "cohesion 0.58 − 0.05 (1 reserve) = 0.53", "t_user-top at fatigue 66"); "Why" sheet groups | unchanged |
| **Result → backstage** | `recent_changes` (what game *n* did, with reasons); `decisions.tactics.options` (effects, scope, eligibility) | One `choose_tactic` for `after_game` |
| **Series** | Per game: the reserves fielded (`games[].players`); `carry_over.carry_out` labelled **Preview**; the last game and the settlement | — |

E1/E2 rules are unchanged: one transition per `advance`, server-hosted and server-graded Baron questions, Q3 feedback from `objective_results`, local settle, and identical-body retries.

## 4. Phase 6 — full local BO5 acceptance (real backend)

**Setup** (scratch only, not committed). A real `api_server:app` runs from `.worktrees/wd-v2-e3a` @ `516cf7a5` on `127.0.0.1:8767`. The launcher is UX-5's, with BACKEND set to `wd-v2-e3a` and the port to 8767, and with:
- a fresh scratch SQLite DB with `migrate_add_dynasty_v2_series` applied to that file only;
- `DYNASTY_ENABLED=1`, and HS256 with a newly generated local secret (`SUPABASE_ALLOW_HS256=1`); the only stub is `routes._auth._owner_state`;
- the real `BankQuestionSource` over the read-only bank `C:/Users/mlmit/mogzy-data/lol_calc.db`;
- **a comparison harness:** with `fixed_seed.txt` present, the launcher wraps `service.create_or_resume` so that every new series gets that seed. The route has no seed input, and this is the only way two strategies share squad state *and* dice. Both series of a pair show the same `pins.seed_fingerprint`.

The frontend is vite `ux6-live` on port 5426 (`VITE_E2E_AUTH=1`, `VITE_COMBAT_API_URL=http://127.0.0.1:8767`) with the E2E persona (`admin:true`). The launch entries `ux6-backend`/`ux6-live` are in the backend repo's ignored `.claude/launch.json`.

**Strategies.** Both use `congested_schedule`, `broad_mid_win`, the balanced champions every game and Baron answer A, and both are played entirely by clicking through the UI:
- **A, recover and scout:** rest, rest, VOD review (Late); breather after every game; core five.
- **B, train hard and rotate:** scrim, scrim, practice mid on Artillery; quick review after every game; jungle reserve in game 2.

### 4.1 Results

| Pair | Series (A / B) | Result |
|---|---|---|
| Seed 1, fingerprint `2a45b19a69de734e` | `wds2_8ef4ef8b…` / `wds2_be2a68f8…` | A **0–3**, B **0–3**: same score, different inputs and stage points |
| Seed 2 (`wdss_ux6scan0002…`), fingerprint `2ded4930875ce8df` | `wds2_1ecaa2c7…` / `wds2_cae53ca2…` | A **3–0**, B **2–3** (five games) |

Seed 2, per game, read back from the server (`games[].management_at_start`). "Lanes E" is the net management power per lane in Early.

| Game | A: points · fatigue · lanes E · cohesion (power) · team | B: points · fatigue · lanes E · cohesion (power) · team |
|---|---|---|
| 1 | **won** 3·4·4 · 0 ×5 · 0 ×5 · 0.56 (+0.6) · VOD Late +3 | lost 2·1·3 · 66/66/71/66/66 · −3.6/−3.6/−4.1/−3.6/−3.6 · 0.72 (+2.2) · mid Artillery +2.0 |
| 2 | **won** 1·5·4 · 5 ×5 · +0.5/−2.5/+0.5/−1.0/−2.5 (traits) · 0.58 (+0.8) | **won** 1·4·4 · jng **reserve** at 5 · −6.6/0/−4.1/−5.1/−6.6 · 0.69 (+1.9 after the reserve's −0.05) · quick review Mid +1.5 |
| 3 | **won** 5·5·4 · 10 ×5 · −2.5/−1/+0.5/−1/−1 · 0.60 (+1.0) | **won** 5·5·4 · 96/76/100/96/96 · down to the −8.0 net cap · 0.74 (+2.4) |
| 4 | — | lost 2·1·1 · 100/91/100/100/100 · −4.5…−7.5 · 0.76 (+2.6) |
| 5 | — | lost 4·4·1 · 100 ×5 · −5.5…−7.5 · 0.78 (+2.8); Baron 0/3 |

Carry-forward (preview): A cohesion 0.62, fatigue 25 → 0 after a break. B cohesion 0.80 (max), mid Artillery 0.60 permanent, fatigue 100 → 70.

**How seed 2 was chosen** (disclosed, not hidden). An engine-level replay of exactly these two UI strategies, with the same answers from the same read-only bank (scratch script `seed_scan.py`, importing the E3A worktree read-only), reproduced both seed-1 UI series exactly, including the Baron counts. Over 40 seeds:
- **24 of 40 end with a different series score**;
- **A wins 26 of 40 series, B wins 12 of 40.**

Seed 2 is one of the differing seeds. The UI replay matched the engine prediction exactly: A 3–0 with Barons 0/0/1, and B 2–3 with Barons in games 2, 3 and 5. This agrees in direction with E3A's own 100-seed study (recover and scout 95%, train hard 66%), whose size is still owner decision U1.

### 4.2 The brief's checks

| Check | Evidence |
|---|---|
| Decisions accepted and persisted server-side | `GET /series/{id}` for all four series returns `decisions.preparation.committed`, `tactics_taken` and `games[].players`, matching what was clicked (`data/compare-seed*.json` in the evidence folder) |
| Combat inputs differ as expected | §4.1. Fatigue and the net cap, proficiency +2.0 only for B's practiced mid pick, cohesion 0.56 vs 0.72, VOD review vs quick review, and the reserve's −0.05 in B's game 2. |
| Explanations match the actual modifiers | The strip and sheet render the contest components verbatim. A test asserts every `modifier:e3a.*` is listed once with its value, and that each player's `net_management_power` equals the sum of their e3a components (the server invariant the UI relies on). Live: B's game-1 strip read fatigue −3.6 ×4, mid −4.1, Artillery +2.0, cohesion +2.2, matching the server preview and the E3A replay evidence §5. |
| Between-game state carries forward | The draft's "Since your last decision" ledger (game *n* + the break); fatigue rising game by game in B; traits gained and expiring; carry-out |
| Duplicate actions are idempotent | Captured: `prep_duplicate` and `tactic_duplicate` → `duplicate: true`, same `seq`. The transport retries with the identical body (test). The hook drops double clicks. |
| Invalid or stale actions are refused | Captured: `OVER_BUDGET` 422, `WRONG_PHASE` 409 ×2, `WRONG_GAME` 409, `STALE_SEQ` 409 → `STALE_REVISION`, `ACTIVITY_INELIGIBLE` 422 (fresh rest). Live UI: two VOD reviews → "ACTIVITY_INELIGIBLE: day 2 (vod_review): At most 1 VOD review per window.", rev stayed 0. |
| Refresh and discovery | A reload in A's draft resumed at rev 30, same screen, ledger intact. A Vite full reload in B's break resumed at rev 24 (result → backstage). The first page load resumed the capture's unfinished fresh series via discovery `single`. The picker labels E3A rows. |
| Baron remains server-graded | Requests carry option ids only. Counts come from the server (0/3, 1/3 across 7 live Barons). Q3 feedback is from `objective_results`. |
| The UI never computes outcomes | No transport method accepts a count, score or management number (bodies asserted). Status comes from the server phase. All shown values are server fields. |
| Old E2 gameplay remains supported | `&management=off` creates an e2 series. An e2 snapshot renders the UX-5 roster/plan/draft/decision flow (test). The UX-5 picker tests are unchanged. |

**Browser** (pane at 1280×800, 390×844 and 360×780, reduced motion on for clean captures):
- `scrollWidth` equals the viewport on squad, prep, draft, game, backstage, Baron and series. The only wider elements are the clipped fixed background SVGs.
- 360×780 Baron: "Go for the Baron" ends at 729 px, a **51 px clearance** (UX-3: 51). The question's option D ends at 711 px.
- `html.reduce-motion`: 0 motion-gated elements.
- The audio panel opens from the run bar, and mute toggles ("muted") and restores.
- Scene transitions: hq → practice → warroom → tunnel/stadium → backstage → trophy, following the screens.
- Backend log: every Dynasty request returned 200 except the deliberate 422. Console errors were the known global-HUD noise (`/api/stat-check/invites` 503, Supabase 401).

**Evidence (not committed):** `C:\Users\mlmit\OneDrive\Desktop\ux6-dynasty-shots\`:
- `desktop/` (9): home and entry state, HQ squad, prep in the practice room, draft, server preview, the game-1 management strip, the "Why" sheet, backstage;
- `mobile-390/` (3);
- `mobile-360/` (7): result, backstage, Baron stakes and question, series 2–3, carry-forward, server refusal;
- `data/`: both comparison read-backs and the 40-seed scan.

## 5. Automated checks

| Check | Result |
|---|---|
| Baseline at `bcb73349` (UX-5 worktree, read-only run): `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty` | 9 files, **140 passed** |
| UX-6, same command | 11 files, **158 passed**: the 140 unchanged plus 18 new |
| New `e3aTransport.test.ts` (12) | Captured states are rev 3 and the e2 captures stay rev 2; drift refusals; status from phase only (client stand-ins ignored); block passed verbatim; influence rows equal the components and the net-power invariant; create body with and without management; the whole plan as one action, plus the identical retry; refusals → readable errors with the fresh state, and stale → `STALE_REVISION`; `lockSquad` sends the reserve; the e2 stand-ins are refused on E3A; tactic duplicate; no score/number in any body; discovery with management pins |
| New `bo5/Management.test.tsx` (6) | Create → HQ → prep (room follows activity) → a server refusal shown verbatim → the plan sent whole; draft preview vs a changed lineup, with the reserve sent; the in-game strip; result → backstage → tactic → next draft ledger; series reserves and carry-forward; the e2 flow without management |
| `tsc --noEmit -p tsconfig.app.json` | only the 2 baseline errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`), the same as UX-5 |
| `eslint src/lib/dynasty/e1 src/pages/dev/dynasty-v2/bo5 DynastyV2Prototype.tsx` | 0 problems |
| Capture fixture | No `Authorization`/bearer/JWT, no owner id, no email, no seed (only `seed_fingerprint`). Requests carry ids and choices only. Re-capture: `UX6_TOKEN=<owner bearer> python -I scripts/dynasty/capture_ux6_e3a_live.py` against a **fresh** scratch DB. |

Smart App Control did not block rollup this session: vite and vitest ran natively.

## 6. Owner decisions and outstanding dependencies

**Backend (owner/E3A):**
1. **U6, the preview endpoint for arbitrary lineups** (§1 G1). It is the one thing that would let the draft show exact inputs before locking a changed lineup.
2. **U1, calibration.** Seed 2 shows a 3–0 vs 2–3 swing from management alone. The 40-seed scan has A winning 26 and B 12, which is in line with E3A's study.
3. G2–G6 in §1: a scenario listing, champion profiles outside the lineup phase, an abandon route, opponent champion profiles, and documentation of the null trait ledger entries.
4. Still open from E3A: U2 opponent management, U4 campaign linkage (carry-forward is a preview), U5 roster depth, U7 E1 duels ignoring modifiers, U9 scrims training only the core five, U10 the mandatory explicit tactic, U11 Fearless, U12 policy/timers/abandonment/migration/flag.

**UI (owner choices, not done):**
5. The draft offers only role-pool champions (the server also accepts off-role picks at 0.45 proficiency). The three champion sets are kept as presets.
6. The UI never reveals the correct option of a wrong Baron answer (unchanged since UX-3).
7. Production stays NO-GO: E3A is local only, the migration and flag are owner-gated, and real Supabase owner sign-in for this route is untested (ROG1-D2).

## 7. Commit record

Recorded in the commit that follows this one (the UX-4/E3A convention).
