# Worlds Dynasty · UX-3 handoff — Real BO5 vertical slice

**Status:** implemented and verified locally on branch `ux/ux3-dynasty-real-bo5` (worktree `C:\Users\mlmit\mogzy-wt\ux3-bo5`), cut from VIS-F4 `756ca7ad`. Dev-only route `/dev/dynasty-v2?view=bo5`. Nothing pushed, merged or deployed. No backend file, credential, migration or production data was touched.

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

## 6. E2 dependencies (verified vs pending)

**Verified (in use):** E1 `snapshot.e1` shape at `786dc81b`, E1 BO5 convention, E2A §C8 objective states and §C2 "no count from the client".

**In progress, not used:** at handoff time the backend worktree holds **uncommitted** E2 work by the other instance: `routes/dynasty_series.py` (`/api/admin/dynasty/v2`), `dynasty/combat_v2/series/{engine,questions,service,snapshot}.py`, `migrate_add_dynasty_v2_series.py`, and a 5-line `api_server.py` router include. Read only, never imported by the capture. Its surface maps onto this adapter as follows (to confirm once committed):

| UX-3 transport | E2 (in progress) | Gap to close |
|---|---|---|
| `create` | `POST /series` `{start_key, qualification_policy, user_preset, opponent_preset}` | the UI must pick presets; `start_key` = idempotency key |
| `resume` | `GET /series/{id}` | need a "my active series" read, or keep the id client-side |
| `lockLineup` | action `lock_lineup` | — |
| `advance` | action `advance` | — |
| `openObjective` | action `open_objective` | — |
| `answerQuestion` | action `answer_objective` (×3) | — |
| `settleObjective` | (none: E2 appears to settle on the third answer) | make it a no-op read in the live transport |
| `choosePlan`, `decide` | (none) | keep client-side (plan = default lineup) until E3 adds between-game actions |
| `rev` + `requestId` | `expected_seq` + `action_id` | rename in the live transport |
| envelope | `dynasty.combat_v2.series.snapshot.e2` | write an `e2 → SeriesEnvelope` mapper and a contract test against a captured e2 response |

Also still pending: RUN-2 production persistence (owner-gated migration), E3 between-game state, real question content (Elder/Soul have 0 questions), owner choice of qualification policy.

## 7. Owner decisions / follow-ups

1. Qualification policy (narrow used here as E2A's provisional baseline).
2. Whether the series/plan choice should exist server-side (E2 currently has none).
3. Recovery/tactical effects need E3 before they can be offered.
4. Org choice is cosmetic until org rosters exist server-side.
5. Next slice (UX-4): a `LiveSeriesTransport` against the committed E2 API, its contract test against a captured e2 response, and a real local-backend run (HS256 + E2E persona recipe; the real-auth NO-GO from ROG1-D2 still applies to any owner deploy).

## 8. Verification record (final run)

- `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty` → 8 files, **110 passed**.
- `tsc --noEmit -p tsconfig.app.json` → only the two pre-existing baseline errors.
- `eslint src/lib/dynasty/e1 src/pages/dev/dynasty-v2/bo5 walkout.tsx DynastyV2Prototype.tsx` → clean.
- Capture re-run: byte-identical fixture (sha256 prefix `762fc19fa8d5556e`), recorded against backend worktree HEAD `d279233b` (E1 code `786dc81b`; the uncommitted E2 files are not imported).
- Browser pane (`ux3-bo5` launch entry, port 5424): one full live series at 1280×800, 390×844 and 360×780; no console errors.
- Re-capture recipe: `PYTHONPATH=<backend>/.worktrees/wd-v2-combat python -I scripts/dynasty/capture_ux3_bo5_fixture.py` from the mogsy root (`UX3_SERIES_SEED`, default 3). Any capture change must keep `e1.contract.test.ts` and the 3–2 series tests green.
