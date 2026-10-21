# Worlds Dynasty · UX-3 handoff — Real BO5 vertical slice

**Status:** implemented and verified locally on branch `ux/ux3-dynasty-real-bo5` (worktree `C:\Users\mlmit\mogzy-wt\ux3-bo5`), cut from VIS-F4 `756ca7ad`. Dev-only route `/dev/dynasty-v2?view=bo5`. Nothing pushed, merged or deployed. No backend file, credential, migration or production data was touched.

**UX-4 update (2026-10-20):** a `LiveSeriesTransport` now drives the same BO5 from the committed E2 series API (`?view=bo5&transport=live`). It was verified with a contract test against captured real e2 responses and with full BO5s against a real local backend. See §6 (mapping) and §9 (record).

**Verdict in one line:** the BO5 is now driven end to end by **genuine E1 machine output** through a typed adapter boundary, but it is served by an **in-browser contract double**, not a live server. **Full integration is NOT claimed:** E2 (objective hosting + series API) is still being built by the separate E2 instance (uncommitted at handoff time; §6).

## 0. Verified starting state

| Item | Verified |
|---|---|
| UX-1 `b3d70cfc` → VIS-F1 `3d79759c` → VIS-F2 `ae8e67fc` → VIS-F3 `87da1f17` → VIS-F4 `756ca7ad` | each `git merge-base --is-ancestor … 756ca7ad` = true; VIS-F4 is the tip of `vis/vis-f4-cinematic-production` |
| E1 `786dc81b` | exists, local only, on backend `roguelike/wd-v2-combat-a2` (worktree `.worktrees/wd-v2-combat`, HEAD `d279233b` = E2A docs) |
| `AGENTS.md` | absent in both repos (as VIS-F4 noted); `CLAUDE.md` git rules followed |
| E2 | E2A is a contract doc only (`d279233b`). E2 implementation exists **only as uncommitted work** in the backend worktree (§6) |

## 1. Phase A — survey findings (code, not assumptions)

| Question | Answer |
|---|---|
| What ran on synthetic fixtures? | Everything in VIS-F4's `/dev/dynasty-v2`: `engine.ts` (client-side stage scoring, events, Baron qualification, objective outcomes, series tally, prep/tactic effects), `fixtures.ts` (orgs, players, champions, `SYN_QUESTIONS`). It is untouched and still serves the visual prototype. |
| What does E1 expose? | A pure Python read model `snapshot(state, viewer, detail)` (schema `dynasty.combat_v2.events.snapshot.e1`) over a one-transition-per-`advance` machine. **No HTTP route, no run wiring, no persistence.** Objective `questions` is `null`; `submit_objective_action` trusts a caller-supplied count (the E2A trust hole). |
| Series / between-game state? | None in E1. E1's own BO5 estimate (`qualification_study.bo5`) treats games as independent, first to three. Persistent effects are typed `consequences.pending`, "applied to nothing" until E3. |
| Owner-only Dynasty routes today | v1 run service `routes/dynasty_run.py` (ROG1-C1, unmerged): `require_admin` + `DYNASTY_ENABLED`, append-only actions with `UNIQUE(run_id, action_id)`. One v1 match, no Combat v2. Frontend `/admin/dynasty` (ROG1-D1) drives it. |
| Auth / run identity | Owner bearer via `AdminRoute` / `useOwnerAuth`; run identity = server `run_id` + client `action_id` idempotency + `expected_seq`. UX-3 mirrors that discipline (`rev` + `requestId`) but runs on the DEV route with no auth, because no live endpoint exists. |
| Reusable modules | VIS-F4 visuals (Scene/environments, WalkoutSequence, ObjectiveSpectacle/BaronPit, CloseoutBanner, casters, crowd, stingers, parts), ROG1-D1's recorded-fixture pattern. |

**Smallest viable path chosen:** record real E1 output once (all decision branches) → serve it through a typed transport whose contract matches what E2 must provide → swap the transport when E2 lands. No speculative live API was built.

## 2. What was built

| File | Role |
|---|---|
| `scripts/dynasty/capture_ux3_bo5_fixture.py` | Runs the **real E1 machine** (backend worktree on `PYTHONPATH`) and records `snapshot()` after every single transition. Narrow policy, seed 3, three legal lineups (E1 study strategies EARLY / SCALING / BALANCED) × five games vs BALANCED_2, and **all four counts 0–3** for each Baron encounter. Lossless delta codec, round-trip asserted. Re-running it is byte-identical (sha256 `762fc19f…`). |
| `src/lib/dynasty/e1/fixtures/ux3-bo5.json` | The recorded fixture (1.06 MB, dev route only, lazy chunk). 15 game paths + 8 Baron branches. |
| `src/lib/dynasty/e1/contracts.ts` | **VERIFIED** E1 snapshot types; **PENDING** `SeriesView` / `ObjectiveSessionView` (E2A §C8) each tagged with an `authority` marker. |
| `src/lib/dynasty/e1/transport.ts` | `DynastySeriesTransport`: the only surface the UI calls. Contract rules: quote `rev`, carry `requestId`, one transition per `advance`, **no method accepts a count or an outcome**. |
| `src/lib/dynasty/e1/fixtureServer.ts` | The contract double: cursor into recorded frames, rev/stale checks, request-id replay, persistence (localStorage) for refresh/resume, fault injection, series tally from E1 settlements, E2A-shaped objective hosting with a private placeholder answer key that never reaches an envelope. |
| `src/lib/dynasty/e1/useDynastySeries.ts` | One request in flight (duplicate clicks dropped), stale-response rejection by `rev`, Retry resends the **same** `rev`+`requestId`, STALE adopts the server's fresh envelope, resume on mount (StrictMode-safe `alive` ref). |
| `src/pages/dev/dynasty-v2/bo5/{Bo5Flow,ServerGame,ServerObjective,present}.tsx` | The BO5 screens on VIS-F4 visuals; screen = series `status`; every number from a snapshot. |
| `walkout.tsx` (+1 optional prop), `DynastyV2Prototype.tsx` (`?view=bo5`, lazy) | The only edits to VIS-F4 files. |

## 3. Phase B/C — the supported path and how each step is backed

| # | Step | Backed by |
|---|---|---|
| 1 | Choose an organization | **Branding only** (crest, colour, name) — stated on screen. Org-specific rosters need RUN-2. |
| 2 | Legal starting roster | The server's five synthetic players (`t_user-<role>`); ratings come from the lineup plan. Roster assembly is not hosted (stated). |
| 3 | Prepare for the opponent | Opponent dossier = recorded server lineup; preparation = choose the series game plan (`choosePlan`) |
| 4 | Draft a valid lineup | Three legal lineups; double rejects anything else (`ILLEGAL_LINEUP`) |
| 5 | Walkout | VIS-F4 lock-in (server lineup) + walkout; controls stay live during it |
| 6 | Early / Mid / Late | Recorded E1 beats, one transition per request; Continue chains to the next pause beat, Skip ahead to the next tally/objective/settlement |
| 7 | Eligible objective events | Only where E1 qualified it (narrow policy): 2 of 15 recorded game paths. Dragon / Herald / Late Baron / teamfight appear as **skill-free E1 event cards**; Dragon/Elder/Soul **question** encounters remain prototype-only (contract test) |
| 8 | Submit answers for grading | Open → 3 answers locked and graded by the host → Settle (no count in any request) |
| 9 | Real score and consequences | E1 category, narrative and effects of the chosen branch; contest tiles, carry, labels from the tally |
| 10 | Finish, backstage | Settled game stays on stage until "See the game result"; result screen from the series tally |
| 11 | Between-game decision | Keep / change the plan (real: changes the next E1 setup). Recovery is shown **disabled, E3 pending**, and the double refuses it |
| 12 | Until one team has three | Series tally from E1 settlements, first to three (E1 BO5 convention) |
| 13 | Series result + persistent state | Per-game rows, decisions, and all E1 `consequences.pending`, labelled "pending and applied to nothing (E3)" |

Seven-point scoring is E1's: five 1-point role contests + one 2-point composition contest (contract test over every recorded stage). Bands, Winning+Winning closeout, Baron 3/3 closeout and "Late decides" are asserted against the recorded data, not re-derived in the UI. Crowd level = server carry; casters quote the published score and label; stingers fire once per server beat (keyed by `seq`); match point / "game five decides it" come from the series tally. Labels kept: "Generated in-run event", "Simulated", synthetic sources, the UX-3 banner.

## 4. Phase D — reliability

| Case | Behaviour | Evidence |
|---|---|---|
| Loading / backend error | Loading screen; resume failure → retryable error panel | UI test |
| Disconnect, response lost after apply | Error panel, UI does not guess; Retry resends the same request; applied once | UI + server tests |
| Duplicate clicks | Dropped while a request is in flight (exactly one transition) | UI test |
| Stale response | Older `rev` never replaces a newer envelope; STALE_REVISION carries and adopts fresh state | hook + server tests |
| Refresh during an encounter | Resumes at the same rev, locked answers kept, same questions | UI test + **live browser refresh** |
| Submission in progress | Options disabled, "Locking your answer…" | UI |
| Server-side settlement | Series updates only from E1 `settlement`; the UI reads it | server test |
| Exit and re-entry | "Leave" discards (dev); reopening the route resumes from storage | UI |
| Unsupported objective kinds | Double refuses (`UNSUPPORTED_OBJECTIVE`), nothing graded; panel shows a neutral "no host" card | server test |

Checkpoint identity: every request quotes `rev` (+ `expected seq` for `advance`); no outcome is inferred from a timer. Tile reveals, walkout and lock-in are presentation only.

## 5. Phase E — results

| Check | Result |
|---|---|
| New tests | `e1.contract.test.ts` 8, `fixtureServer.test.ts` 7, `Bo5Flow.test.tsx` 7 → **22 / 22** |
| Dynasty regressions (dev/dynasty-v2 incl. VIS-F4's 53, lib/dynasty, admin/dynasty, dev/dynasty, App.dynastyRoute) | **110 / 110** in 8 files (includes the 22 new) |
| Full BO5 to first-to-three | Server test and UI test: W L L W W = **3–2**, Barons 3/3 and 3/3 (6 answers graded, no more). Live browser: same series, game 5 Baron answered **2/3** → `baron_with_trades` → Late 6–1 → **3–2** |
| All four Baron branches | 0/1/2/3 → the four E1 categories (server test) |
| No duplicated grading | `gradedAnswers` counter asserted; replays and duplicate answers refused |
| No client authority | no transport method takes a count/outcome; source guard test: no UI module imports the answer key; envelopes and storage never contain `"correct":` |
| Deterministic presentation | fixture byte-identical on re-capture; one beat per frame asserted |
| Phones | 390×844 and 360×780: `scrollWidth == viewport` on draft, game, Baron, series. 360×780 Baron "Go for the Baron" bottom 729 px → **51 px clearance** (VIS-F4: 38 px) after clamping E1's qualification text on phones; "Next question" 33 px |
| Reduced motion / mute | `html.reduce-motion`: 0 motion-gated elements, static lock-in, walkout goes straight to the stage beat; ambience/mute control present |
| tsc / eslint | tsc: only the 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`); eslint on all new/changed files: 0 problems |

Evidence (not committed): `C:\Users\mlmit\OneDrive\Desktop\ux3-dynasty-bo5-shots\` — `desktop/` 15 captures (home → prep → lock-in → walkout → event → tally → Baron stakes/question/refresh-resume/graded/settled → closeout → result → backstage → series), `mobile-390/` 2, `mobile-360/` 5. Captured from integrated gameplay of recorded E1 output through the contract double. Pane-capture trap: a frame right after navigation can show the entrance fade.

## 6. E2 dependencies (UX-4: verified against the committed E2)

E2 is committed on backend `roguelike/wd-v2-e2-series`: implementation `b022b21a`, handoff `590b9010`, API `docs/roguelike/WORLDS_DYNASTY_E2_API.md`. UX-4 (§9) built the live transport against it. The mapping, as implemented:

| UX-3 transport | E2 | How the live transport maps it |
|---|---|---|
| `create` | `POST /series` `{start_key, qualification_policy, user_preset, opponent_preset}` | `start_key` = the request id, so a retried create resumes the same series. Presets `balanced` vs `balanced2`. Policy `narrow_early_mid_combo` by default; `&policy=broad_mid_win` on the URL picks the other one. |
| `resume` | `GET /series/{id}` | E2 has no "my active series" read, so the id is kept client-side (`mogzy.dynasty.ux4.live.v1`). A 404 `DYNASTY_SERIES_NOT_FOUND` forgets it. |
| `lockLineup` | action `lock_lineup` `{game, champions}` | The lineup id maps to the E1 study's champion set. It is offered only if all five are in `champion_pool`. |
| `advance` | action `advance` `{game, machine_seq, steps: 1}` | One E1 transition per request, as in UX-3. |
| `openObjective` | action `open_objective` `{game, encounter_id}` | — |
| `answerQuestion` | action `answer_objective` `{game, encounter_id, question_id, option_id}` (×3) | The UI's option index maps to the current question's `option_id`. The client sends ids only. |
| `settleObjective` | (none: E2 grades, seals and applies on the third answer) | **A read** (`GET`) that acknowledges the grade (§9.2). |
| `choosePlan`, `decide` | (none) | Client-side, with the double's rules (recovery refused, keep = same plan). The server never sees them. |
| `rev` + `requestId` | `expected_seq` + `action_id` | A retry resends the identical body. E2 answers `duplicate: true` and never applies it twice. |
| envelope | `dynasty.combat_v2.series.snapshot.e2` | `e2mapper.ts` maps e2 to `SeriesEnvelope`. A contract test runs against a captured real e2 run (§9). |

Still pending: RUN-2 production persistence (the migration is owner-gated), E3 between-game actions, real question content beyond Baron (Elder and Soul have 0 questions), and the owner's choice of qualification policy.

## 7. Owner decisions / follow-ups

1. Qualification policy (narrow used here as E2A's provisional baseline).
2. Whether the series/plan choice should exist server-side (E2 currently has none).
3. Recovery/tactical effects need E3 before they can be offered.
4. Org choice is cosmetic until org rosters exist server-side.
5. ~~Next slice (UX-4): a `LiveSeriesTransport` against the committed E2 API.~~ Done: see §9. The real-auth NO-GO from ROG1-D2 still applies to any owner deploy.

## 8. Verification record (final run)

- `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty` → 8 files, **110 passed**.
- `tsc --noEmit -p tsconfig.app.json` → only the two pre-existing baseline errors.
- `eslint src/lib/dynasty/e1 src/pages/dev/dynasty-v2/bo5 walkout.tsx DynastyV2Prototype.tsx` → clean.
- Capture re-run: byte-identical fixture (sha256 prefix `762fc19fa8d5556e`), recorded against backend worktree HEAD `d279233b` (E1 code `786dc81b`; the uncommitted E2 files are not imported).
- Browser pane (`ux3-bo5` launch entry, port 5424): one full live series at 1280×800, 390×844 and 360×780; no console errors.
- Re-capture recipe: `PYTHONPATH=<backend>/.worktrees/wd-v2-combat python -I scripts/dynasty/capture_ux3_bo5_fixture.py` from the mogsy root (`UX3_SERIES_SEED`, default 3). Any capture change must keep `e1.contract.test.ts` and the 3–2 series tests green.

## 9. UX-4 — live E2 transport (2026-10-20)

**Status:** implemented and verified against a **real local backend** on branch `ux/ux3-dynasty-real-bo5` (worktree `C:\Users\mlmit\mogzy-wt\ux3-bo5`). **Committed locally as `dd8d5374`** (on UX-3 `91d97ea3`); see §9.6. Nothing was pushed, merged or deployed. No backend file was changed, and no production database or migration was touched. Route: `/dev/dynasty-v2?view=bo5&transport=live`. Without `transport=live`, the UX-3 contract double is unchanged and remains the default.

### 9.1 What was built

| File | Role |
|---|---|
| `src/lib/dynasty/e1/e2contracts.ts` | Types for the e2 snapshot fields the client reads. `readE2Snapshot` refuses a wrong schema or missing phase parts, so a drifted response fails loudly instead of rendering half a game. |
| `src/lib/dynasty/e1/e2mapper.ts` | Pure mapping from an e2 snapshot plus client state to a `SeriesEnvelope`. It maps series status from `phase`, lineups from `champion_pool`, the tally from `games[]`, consumed effects from `between_games.consumed`, the E2 objective block to the E1 prompt shape, and hosted questions to `ObjectiveQuestionView`. |
| `src/lib/dynasty/e1/liveTransport.ts` | `LiveSeriesTransport` over `ADMIN_API_BASE_URL` + `/api/admin/dynasty/v2`, with the owner bearer from `buildAdminHeaders`. HTTP errors become transport codes: `STALE_SEQ`/`STALE_CHECKPOINT` → `STALE_REVISION` with a fresh read; 401/403 → `AUTH`; `DYNASTY_DISABLED` → `DISABLED`; `BAD_LINEUP` → `ILLEGAL_LINEUP`; other 4xx → `NOT_ALLOWED` with a fresh read; 5xx (incl. `OBJECTIVE_CONTENT_UNAVAILABLE`) → retryable `SERVER`; no answer → `NETWORK`. |
| `src/lib/dynasty/e1/liveTransport.test.ts` + `fixtures/e2-live-capture.json` | The contract test (17 tests). It runs against **real e2 responses** captured from the local backend, one per UX state (create, game start, advance, Baron offered, Q1, after Q1, after Q2, settled, between games, completed). The questions are live bank content, not the `[SAMPLE FIXTURE]` samples. |
| `scripts/dynasty/capture_ux4_e2_live.py` | Re-captures that fixture over HTTP. It plays a whole BO5, sending only the snapshot's own `next` actions with lineup balanced and always option A, and retries until a series contains a Baron. |
| `Bo5Flow.tsx`, `ServerObjective.tsx`, `present.ts`, `authority.ts`, `useDynastySeries.ts`, `contracts.ts`, `transport.ts` | Transport selection (`?transport=live`, `&policy=`) and copy that is honest about the authority: a live banner; "E2 · server-hosted questions"; "consumed once" instead of "pending E3"; "See the outcome" instead of "Settle". Also: four answer letters (E2 serves A–D; UX-3 had three) and the `e2_series`/`e2_objective` authority markers and `AUTH`/`DISABLED` codes. |

### 9.2 The one mapping that is not 1:1 (owner should know)

E2 grades, seals and applies the Baron **in the same request as the third answer**. That response no longer carries the encounter: `current_game.objective` is `null`, and question 3's own feedback is never returned, only `games[].objectives[].correct_count`. The UX-3 flow has a separate graded → settle → outcome beat. To keep it:
- The transport caches the last in-progress encounter view and the option it sent.
- The mapper derives question 3's mark as the server count minus the marks of questions 1–2. Nothing is re-graded.
- Until "See the outcome" (a `GET`), the mapper shows the game paused at the objective: it holds back the trailing `objective_result` beat and the objective event.
- The hold applies only to the response that settled the encounter, and only when the cache exists. Another device, or a later read, shows the server's outcome directly.

**Backend follow-up:** keep a settled-encounter view (answers with feedback and the grade) in the snapshot after settlement. The derivation would then go away.

### 9.3 Verification record

**Setup.** A real `api_server:app` runs from `.worktrees/wd-v2-combat` @ `590b9010` on `127.0.0.1:8766`.
- Scratch SQLite DB in the session scratchpad. `migrate_add_dynasty_v2_series.migrate()` was applied to **that file only**.
- `DYNASTY_ENABLED=1`. HS256 auth with a locally generated secret and `SUPABASE_ALLOW_HS256=1`; the real `_decode_token` verified every bearer.
- Only `routes._auth._owner_state` was stubbed (owner for one minted user id).
- The series question source was overridden to the **real** `BankQuestionSource` over the read-only bank copy `C:/Users/mlmit/mogzy-data/lol_calc.db` (opened `mode=ro`), because the scratch DB has no quiz bank.
- Frontend: vite `ux4-live` on port 5425 (`VITE_E2E_AUTH=1`, `VITE_COMBAT_API_URL=http://127.0.0.1:8766`), with the persona in `mogsy_e2e_identity` (`admin:true`). The launcher and token are scratch-only and not committed.

| Check | Result |
|---|---|
| `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty` | 9 files, **127 passed** (110 UX-3 + 17 UX-4) |
| `tsc --noEmit -p tsconfig.app.json` | only the two baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| `eslint src/lib/dynasty/e1 src/pages/dev/dynasty-v2/bo5 DynastyV2Prototype.tsx` | clean |
| **Full live BO5, narrow policy** (series `wds2_8ad0c461…`) | Played by clicking through `/dev/dynasty-v2?view=bo5&transport=live` at 1280×800: org → roster → plan → draft → walkout → Early/Mid/Late, game by game. Won **3–0**, no Baron qualified. Server record = UI (per-stage points `4·4·4`, `4·5·6`, `2·5·4`; seq 70; 67 one-step `advance` events). |
| **Full live BO5 with Barons, `&policy=broad_mid_win`** (series `wds2_dedb5d98…`) | Five games, lost **2–3**. Four real Baron encounters, 12 server-graded answers: 1/3 "Baron at a heavy cost", then 0/3 ×3. Questions such as "How long does Baron Nashor take to respawn?" came from the live bank. A reload between Q1 and Q2 resumed at Q2 with Q1 still marked. The graded beat showed "1 of 3 … already applied", and "See the outcome" did not advance `seq` (a read). Server record = UI (score, stage points, counts). |
| Request outcomes (backend access log) | Every Dynasty request returned 200: 574 action POSTs, 12 creates, 8 reads. The one 403 was a deliberate non-owner probe. Console errors were all from the global HUD (`/api/stat-check/invites` 503, Supabase 401, `/api/assets/champions` 500), the same noise ROG1-D1 saw. |
| Phone 390×844, live 4-option question | No horizontal overflow; option D ends at 723 px of 844; letters A–D. |

The narrow policy qualified **no** Baron in 5 live UI series, and in 2 of 5 capture series. That is why the Baron run used `broad_mid_win`. It is evidence for the open policy decision, not a defect.

### 9.4 Found, not fixed (backend; out of scope here)

1. The settled encounter is dropped from the snapshot (§9.2).
2. There is no "my active series" read. The series id lives in localStorage, so a new device starts a new series.
3. The opponent's champions are not in `champion_pool` and have no profile anywhere in the snapshot. The opponent dossier shows names derived from keys, with no class or ratings.
4. There is no abandon/delete route. "Leave" and "New series" only forget the series on the client; the server keeps it `active`.
5. E2 fixes player ratings per series (`user_preset`), so a lineup choice changes champions only. In the UX-3 double the lineup also changed the players' phase ratings.

### 9.5 Owner decisions (unchanged plus new)

1. Qualification policy (now with the frequency evidence in §9.3).
2. Whether the game plan and between-game choice should be server actions (E3). Today they are client-side and not recorded.
3. The backend follow-ups in §9.4.
4. Production: the migration and flag stay owner-gated. The real Supabase owner sign-in (ROG1-D2 NO-GO) is still untested for this route.

### 9.6 Commit record (2026-10-20)

**Commit:** `dd8d5374` "UX-4: drive the Dynasty BO5 from the live E2 series API". It is local only (not pushed or merged) and changes 15 files:
- added: `scripts/dynasty/capture_ux4_e2_live.py`, `src/lib/dynasty/e1/{e2contracts,e2mapper,liveTransport,liveTransport.test}.ts`, `src/lib/dynasty/e1/fixtures/e2-live-capture.json`, `src/pages/dev/dynasty-v2/bo5/authority.ts`;
- modified: `src/lib/dynasty/e1/{contracts,transport,useDynastySeries}.ts`, `src/pages/dev/dynasty-v2/{DynastyV2Prototype.tsx,bo5/Bo5Flow.tsx,bo5/ServerObjective.tsx,bo5/present.ts}`, this handoff.

**Checks before the commit:**

| Check | Result |
|---|---|
| Working diff | Only UX-4 source, tests, the captured fixture, its capture script and this handoff. Nothing else. |
| Fixture `e2-live-capture.json` (268 KB) | No `Authorization` header, bearer or JWT. No email, owner/user/sub id, UUID or seed; only the server's `seed_fingerprint`. Requests carry ids only. `correct`/`correct_option_id` appear only in `feedback` on questions already answered, which is E2's own post-answer reveal. Question content is 3 public prompts from the read-only bank, served through E2's question contract. The capture script reads the token from the environment and never writes it. |
| Contract invariants | `rev`→`expected_seq` and `requestId`→`action_id`. A retry resends the identical body, and E2 answers `duplicate: true`. No count, correctness or outcome is ever sent (asserted in `liveTransport.test.ts`). Stale responses are rejected by the hook. The answer-3 hold-back (§9.2) is unchanged; no new response shape was invented. |
| Dev-only exposure | The route is registered only when `import.meta.env.DEV` (`App.tsx:317`). `LiveSeriesTransport` is imported only by `bo5/Bo5Flow.tsx` inside that route and selected only by `?transport=live`. It calls the owner-only `/api/admin/dynasty/v2` with the admin bearer, and the server still enforces `require_admin` and `DYNASTY_ENABLED`. Public users get neither the route nor the module. |
| Tests | `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty`: 9 files, **127 / 127 passed**. No regressions. |
| tsc | Only the 2 pre-existing baseline errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`), the same ones recorded as the ROG1-D2 baseline. |
| eslint (all UX-3/UX-4 files) | 0 problems. |

**Live BO5 evidence** (from §9.3, not repeated at commit time; the code is unchanged since): series `wds2_8ad0c461…` was won 3–0 under the narrow policy with no Baron. Series `wds2_dedb5d98…` was lost 2–3 under `broad_mid_win`, with four real Barons and 12 server-graded answers. A mid-encounter reload resumed at Q2. The server record matched the UI.

**Unresolved backend dependencies** (all owner-side, not fixed here):
1. A settled-encounter view after the third answer (§9.2). Until then the client derives Q3's mark; do not change it without a backend contract.
2. A "my active series" read; today the series id lives in localStorage.
3. Opponent champion profiles in the snapshot.
4. An abandon/delete route.
5. Lineup-dependent player ratings (E2 fixes `user_preset` per series).
6. A server-side game plan and between-game decisions (E3).
7. The qualification policy decision.
8. Production: `migrate_add_dynasty_v2_series` and `DYNASTY_ENABLED` stay owner-gated, and real Supabase owner sign-in for this route is untested (ROG1-D2 NO-GO).
