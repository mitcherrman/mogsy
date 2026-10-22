# Worlds Dynasty · UX-7 implementation handoff — the complete campaign

**Status:** implemented and verified against a **real local E3B backend** on branch `ux/ux7-dynasty-campaign` (worktree `C:\Users\mlmit\mogzy-wt\ux7-campaign`), cut from the UX-6 tip `0e187917`.
- **Local only.** Nothing is pushed, merged or deployed.
- No backend file, migration, credential, production database or registry was touched. The E3B worktree (`.worktrees/wd-v2-e3b` @ `db12d6e5`) and the UX-6 worktree (`mogzy-wt/ux6-mgmt` @ `0e187917`) are unmodified; `git status` is clean in both.

**Route:** `/dev/dynasty-v2?view=campaign[&policy=narrow_early_mid_combo]` (DEV only, owner session, live backend).

**One line:** you begin a run, prepare in headquarters, play each BO5 with the unchanged UX-6 screens, record each result on the campaign, see exactly what carried, climb from the regional split through the playoffs to Worlds, and finish as world champions or eliminated with a placement and a legacy recap. Every progression fact on screen is the server's.

## 0. Verified starting state

| Item | Verified |
|---|---|
| E3B `80450127` → SHA record `db12d6e5` | local branch `roguelike/wd-v2-e3b-campaign`; the remote branch is stale (E3A tip), as the brief says; worktree clean |
| UX-6 `e2360683` → SHA record `0e187917` | `ux/ux6-dynasty-management`; worktree clean |
| Docs read | backend `CLAUDE.md` (git rules), UX-6 handoff, `WORLDS_DYNASTY_E3B_CAMPAIGN_API.md`, `WORLDS_DYNASTY_UX7_HANDOFF.md`, `routes/dynasty_campaign.py`, `campaign/{samples,simulate,service,engine}.py` |
| New worktree | `git worktree add -b ux/ux7-dynasty-campaign C:\Users\mlmit\mogzy-wt\ux7-campaign 0e187917`; `node_modules` is a junction to the main mogsy checkout (**delete the junction before any `git worktree remove`**) |

## 1. Phase 1 — the authoritative contract (checked against code and live responses)

| Need | Route / action | UX-7 use |
|---|---|---|
| Discovery | `GET /campaigns?include_finished=` → `resume.reason none/single/multiple` | `LiveCampaignClient.list`; single → read; multiple → picker (never auto-picked); finished runs → "Past runs" shelf |
| Start / resume | `POST /campaigns {start_key, qualification_policy, when_active_exists}` | automatic start sends `refuse` (409 `ACTIVE_CAMPAIGN_EXISTS` → the listed runs); "Start a new run" sends `create`; a retried start reuses its `start_key` |
| Read | `GET /campaigns/{id}` | every screen |
| Settle | action `settle_series {series_index}` | payload is the server's own `next.payload`; identical retry → `duplicate: true` |
| Abandon | action `abandon {confirm: "abandon"}` | from `actions[]`, after an inline confirmation |
| Play a series | `GET/POST /series/{id}` (revision 4) | the UX-6 transport, pinned to `current_series.series_id` (`CampaignSeriesTransport`) |

Verified live: `ACTIVE_CAMPAIGN_EXISTS`, `CAMPAIGN_CONFIG_MISMATCH`, `SERIES_NOT_FINISHED`, `STALE_SEQ`, `WRONG_SERIES`, duplicate settle, `DYNASTY_CAMPAIGN_NOT_FOUND`, 403 without a session, `CAMPAIGN_SERIES_CLOSED` after an abandon, campaign series absent from `GET /series`, revision 4 with the `campaign` block.

**Implemented by E3B and used:** all of the above. **Not implemented (and not needed):** no preview for arbitrary lineups (U6), no timers, no opponent management (U2), no route to list formats/opponents (the snapshot serves them).

**Contract gaps found (documented, no backend change needed):**

| # | Gap | Effect |
|---|---|---|
| C1 | `roster` is **null** on a run abandoned before any series settled (the backend's own `abandoned` sample shows it too); API §4 does not say so | The reader requires `roster` only while a series is open or once history exists |
| C2 | `story.stakes.rematch_of` is a **list of series indices**; `story.rival.meetings` includes the open meeting with `result`/`score` **null**; API §4.3 does not give the shapes | The first UI typed it as meetings and crashed on the live rematch window; fixed, pinned by a live capture test |
| C3 | Listing rows: `standing` is `{stage: [wins, losses]}` and `ending` is the kind string (API §5 says "standing", "ending") | Typed as served |
| C4 | Nothing in the snapshot says a series was **just** settled for this viewer | The transition screen is shown once per settlement with a device-local "seen" mark (presentation only) |

## 2. What was built

| File | Role |
|---|---|
| `src/lib/dynasty/e1/campaignContracts.ts` (new) | E3B types; `readCampaignSnapshot` (schema + revision ≥ 1 + phase/next/ending consistency) and `readCampaignList` refuse drift; stage names/tones (presentation) |
| `src/lib/dynasty/e1/campaignTransport.ts` (new) | `LiveCampaignClient` (list/get/start/act, error mapping, fresh state on refusals); `settleRequest`/`abandonRequest` built only from `next`/`actions`; `CampaignSeriesTransport` = the UX-6 `LiveSeriesTransport` pinned to one series (resume by id, never creates, never abandons, own store key) |
| `src/lib/dynasty/e1/useDynastyCampaign.ts` (new) | The only campaign authority hook: one request in flight, identical-body retry, newer-seq wins, STALE/WRONG_SERIES/SERIES_NOT_FINISHED/OVER adopt the server state with a notice |
| `src/pages/dev/dynasty-v2/campaign/CampaignFlow.tsx` (new) | Screens: start (policy + org branding), pick, headquarters, the BO5 (unchanged `Bo5Flow` in a campaign frame), result → record, transition, ending; finals-entrance and championship frames at the page root; a screen error boundary |
| `.../campaign/CampaignParts.tsx` (new) | Map, standing, stakes, opponent/rematch card, squad condition, between-series window, story strip, transition (carried), history, legacy, abandon control |
| `.../campaign/campaignView.ts` (new) | Pure pickers: beat art/priority (one beat per kind), stage now, final round from the served format, final five, seen marks |
| `.../bo5/Bo5Flow.tsx` | Optional `campaign` frame: run-bar round label, **HQ** instead of Leave (the series stays open), **Record the result** on the series screen, the campaign banner, back to HQ on `CAMPAIGN_SERIES_CLOSED`. Without the prop: unchanged |
| `.../bo5/brand.ts` (new) | `readBrand`/`writeBrand` moved out of `Bo5Flow.tsx` (shared; fast-refresh rule) |
| `.../bo5/Management.tsx` | `CarryForward` says "Carried at settlement" (not "Preview") on a campaign series |
| `.../cinematics.tsx` | `FullFrame` takes an optional `detail` line; the campaign passes "Best of 5 · series N of this run" (the default still says "Fearless draft", which E3B does not have) |
| `src/lib/dynasty/e1/liveTransport.ts` | Optional `storeKey` (campaign series keep their own presentation key) |
| `.../DynastyV2Prototype.tsx` | `?view=campaign` (lazy) |
| `fixtures/e3b-campaign-samples.json` | The backend's 13 samples, verbatim |
| `fixtures/e3b-live-capture.json` + `scripts/dynasty/capture_ux7_e3b_live.py` | Live states the samples lack: rematch window, abandoned before settlement, full listing |

**No progression logic exists in the client.** It never computes qualification, byes, eliminations, opponents, carry, budgets, eligibility, standouts or story; the series flow is UX-6's, unchanged.

## 3. Phases 2–4 — screens and their server data

| Screen | Server data | Action |
|---|---|---|
| **Headquarters** (hq room; stage identity: split cyan, playoffs ember, Worlds violet with pennants) | `current_series` (round, `stakes`, `elimination_if_lost` → "Must win", `bye`), `next_opponent` (+ `story.rival`/`stakes.rematch_of` → Rematch badge and prior meetings), `roster` (fatigue, `fatigue_power`, traits, conditions, practised champions, cohesion; live vs last settled), `between_series` (slots, break, idle rule, every activity with `eligible`/`unavailable_reason` by location), `map`, `history`, story strip | "Plan the N days" → the UX-6 preparation screen (one `commit_preparation`); abandon (asks once, inline) |
| **The BO5** | UX-6 unchanged (prep, squad draft, game, Baron, backstage, series) inside the campaign frame | series actions (UX-6) |
| **Series over** (refresh/other entry) | `current_series.series.score` | **Record the result** → `settle_series` with `next.payload` |
| **Transition** | `last_transition` (result, `decided` next round / byes / ending, standings, `carried`: break, fatigue end → after break per player, cohesion, practised proficiency, traits and conditions with games left, what expired), story beats of that series, map | "Into headquarters" |
| **Worlds Finals entrance** | shown once when the open series is the format's last round | skippable full frame |
| **Ending** | `ending` (kind, placement, text, opponent, record, series played), story (ending, standouts, practice payoffs, rematch, fatigue), map, legacy (record per stage, Baron totals, practice payoffs since practising, standouts), full history | championship: skippable trophy frame with the five who played the final and the final score; "Start a new run" |

**Story:** every caption is a `story.beats[].text`, verbatim; panels only pick art by beat kind. Beat selection keeps one per kind, prioritising ending, stakes, rematch, fatigue, standout, practice, last series, Baron. The `story.label` disclaimer is under every strip. No quotes, no real people, all names `SYN …`. Cinematics are skippable (button, Escape/Enter), static under reduced motion, never modal for story strips; the sound panel (mute, volume) stays in the campaign bar; no new media (the original Worlds mark and trophy are the VIS-F4 code-drawn slots).

## 4. Phase 5 — reliability (each verified live unless marked "test")

| Case | Behaviour |
|---|---|
| Refresh between series | picker (if several active) → the run → its transition (once) → HQ window |
| Refresh inside a BO5 | → re-enters the BO5 on the pinned series at the server's rev (game 5 of series 1, rev 105) |
| Duplicate clicks | triple-click on Record → one POST (backend log) |
| Lost response | Retry resends the identical body; the server answers `duplicate: true` (test, and live via a second client) |
| Stale revision | another client settled first → the UI's POST gets `STALE_SEQ`, adopts the fresh state, notice, transition (live) |
| Already settled | second settle with a new id → `WRONG_SERIES` (live); the UI treats it as stale |
| Settle too early | `SERIES_NOT_FINISHED` → refresh with a notice (test) |
| Multiple runs | never auto-picked; "Other runs" lists active runs even when one; finished runs open read-only from "Past runs" |
| Completion | champion and eliminated endings (live) |
| Abandon | inline confirm → `abandon` → abandoned ending (live); abandoned from another client while in the practice room → the series refuses with `CAMPAIGN_SERIES_CLOSED` → back to HQ → abandoned ending (live) |
| Backend rejection | the server's message in the error panel; Retry only for network/5xx; schema-missing and auth have their own text |
| Drawing error | a screen boundary offers "Reload the run" instead of blanking the route |

No confirmations other than abandon, no expiry rules, no navigation locks: HQ ↔ series is free at any time.

## 5. Phase 6 — two genuine campaigns on the real E3B backend

**Setup (scratch only, not committed):** `api_server:app` from `.worktrees/wd-v2-e3b` (read-only use) on `127.0.0.1:8768`; a fresh scratch SQLite DB with **both** `migrate_add_dynasty_v2_series` and `migrate_add_dynasty_v2_campaigns` applied to it only; `DYNASTY_ENABLED=1`; HS256 with a locally generated secret; the only auth stub is `routes._auth._owner_state`; the real `BankQuestionSource` over the read-only bank `C:/Users/mlmit/mogzy-data/lol_calc.db`. Frontend vite on 5427 (`VITE_E2E_AUTH=1`, `VITE_COMBAT_API_URL=http://127.0.0.1:8768`). Launch entries `ux7-backend` / `ux7-live` are in the backend repo's ignored `.claude/launch.json`; the launcher is `scratchpad/ux7/run_backend.py` of this session.

**Determinism (disclosed):** the route has no seed input. With `campaign_seed.txt` present, the launcher wraps `campaign.service.create_or_resume` so the next new campaign gets that seed. An engine-level scan (`seed_scan.py`, E3B's own `simulate.play_campaign` with the real bank, every Baron answered correctly) over 80 seeds found `wdcs_ux7_0053`, where E3B's **Periodize** strategy wins the title through a 3–0 bye and **No management** is eliminated after a rematch. The exact decision script of each strategy (prep plan per window, players and champions per game, backstage choice, Baron option ids) was exported and played **through the UI** by an in-page driver that only clicks the real controls by test id (it reads the series once per Baron question to map the planned option id to its on-screen position). Both runs then matched the prediction **series by series**.

**Campaign A — champion** (`wdc3_1c88e887…`, Periodize): 7 series.

| # | Round | Opponent | Plan | Result |
|---|---|---|---|---|
| 1 | Split week 1 | Basalt Union | scrim, practice top Duelist, VOD review | won 3–2 |
| 2 | Split week 2 | Drift Assembly | scrim, practice jng Juggernaut, VOD review | won 3–1 |
| 3 | Split week 3 | Amber Circuit | practice mid Artillery, VOD review | won 3–1 → **3–0 split, bye** |
| — | Playoff semifinal | — | — | **skipped_bye** |
| 4 | Regional final | Fjord Signal | practice bot Longbow, VOD review | won 3–1 |
| 5 | Worlds QF | Halcyon Works | practice sup Guardian, VOD review | won 3–1 |
| 6 | Worlds SF | Kestrel Forum | practice top Duelist, VOD review | won 3–1 |
| 7 | Worlds final | Meridian Tide | practice jng Juggernaut, VOD review | won 3–0 → **World champions** |

Breather after every game. Baron 42 of 42, 14 perfect. Carry seen on screen and in the read-back: cohesion rising to 0.80, five practised champions at 0.60–0.70 with "won N of M since practising", in_form/rattled and confidence carried with games left, the −30 break (−50 after the bye) applied before each window.

**Campaign B — eliminated** (`wdc3_65febc2b…`, same seed, no management: all-idle windows, no backstage choice): won 3–2, won 3–1, **lost 2–3** to Amber Circuit (split 2–1, qualified, no bye), **rematch semifinal** vs Amber Circuit won 3–1, regional final **lost 0–3** to Fjord Signal → **Regional runner-up**. Fatigue built 60 → 70 → 85 over three series (story beat "ended 3 straight series more fatigued"). Same squad, same dice: the management decisions alone changed the run from runner-up to champion.

Read-backs (`GET /campaigns/{id}`), both plans and the 80-seed scan are in the evidence folder. Also run live: an abandoned run (UI abandon), a run abandoned from another client mid-window, a mobile run to the Worlds QF, and a rematch-window capture run.

**Calibration note (for U1):** with every Baron answered correctly the 80-seed scan gives Periodize 66/80 titles, No management 27/80, Always train 17/80 (E3B's study, with its fixed answer pattern, reports 47% / 2% / 3%). Answer skill moves the title rate a lot.

## 6. Browser evidence, mobile and accessibility

`C:\Users\mlmit\OneDrive\Desktop\ux7-dynasty-shots\` (not committed):
- `desktop/`: Worlds QF HQ (stakes, must-win, story), squad condition with carried traits and the window, Worlds Finals entrance, championship trophy, champion ending + story, map with the bye + legacy, transition with carried fatigue, rematch HQ with the fatigue story, the BO5 in the campaign frame, elimination ending (before/after the art fix);
- `mobile-390/`: HQ top, the window; `mobile-360/`: Baron in the campaign frame, Worlds QF transition;
- `data/`: both campaign read-backs, the abandoned run, the listing, both plans, the seed scan.

Mobile: 390 and 360 px, `scrollWidth` equals the viewport on HQ, window, map, transition, ending, prep, draft, backstage, series and Baron. 360×780 Baron: "Go for the Baron" ends at 729 px (51 px clearance, as UX-6). One transient 398 px sample was seen once inside a game at 360 px and never reproduced over three further series (likely a mid-animation stinger); not fixed. Story strips use VIS-F2's equal columns: four panels at 360 px are tight but readable.

Accessibility: no unnamed controls and no target under 32 px on HQ; focus moves to each screen's heading; the current map node has `aria-current="step"`; full frames skip on click/Escape/Enter and are static under reduced motion; story strips are never modal; the sound panel (mute/volume) is in the campaign bar.

Hidden-pane traps (as before): screenshots lag and catch fades; add `html.reduce-motion` and screenshot twice. A full frame inside an animated screen was trapped by the transform (fixed now: frames render at the page root).

## 7. Automated checks

| Check | Result |
|---|---|
| Baseline at UX-6 `0e187917` (UX-6 worktree, read-only run): `vitest run src/pages/dev/dynasty-v2 src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts src/pages/dev/dynasty` | 11 files, **158 passed** |
| UX-7, same command | 13 files, **178 passed** (158 unchanged + 20 new) |
| `campaignTransport.test.ts` (11) | every sample/capture passes the gate; drift refusals; the undocumented shapes C1–C3; revision-4 series under the UX-6 gate; settle/abandon built from `next`/`actions` only; exact start/settle bodies; identical retry after a lost response; error mapping (active exists with listing, stale with fresh state, not finished, integrity, schema, auth); no score/result/placement in any body; the pinned series transport; beat selection; final round from the format |
| `CampaignFlow.test.tsx` (9) | HQ from discovery (stakes, window, opponent, map, eligibility as served) and abandon after asking; settle once on double click → transition with exact carried rows → next HQ; STALE_SEQ → notice, no second POST; several runs never auto-picked; start with policy + refuse → active runs offered; championship transition → trophy frame (final five) → legacy with the bye; elimination ending; refresh inside a started series re-enters the pinned BO5 (no standalone discovery) and HQ returns; live rematch window |
| `tsc --noEmit -p tsconfig.app.json` | only the 2 baseline errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`) |
| `eslint src/lib/dynasty/e1 src/pages/dev/dynasty-v2/{bo5,campaign} DynastyV2Prototype.tsx cinematics.tsx` | 0 problems |

## 8. Remaining gameplay and product decisions

**Backend / owner (E3B):**
1. **U1 calibration.** Answer skill and management swing title odds widely (§5 note); format values stay provisional.
2. **C1–C3** documentation (null roster, rematch shapes, listing row shapes) in the API doc.
3. **U6** lineup preview, **U2** opponent management, **U11** Fearless (the campaign frame avoids claiming it), timers (none; a run waits indefinitely).
4. The qualification policy is still an open owner decision; UX-7 asks for it at run start (default `broad_mid_win`, as E3B's samples).
5. Production stays NO-GO: E3B is local only, both migrations and the flag are owner-gated, real Supabase owner sign-in for this route is untested.

**UI (owner choices, not done):**
6. Org branding is presentation only (the squad is E3B's synthetic ten); org-specific squads need a backend roster per org.
7. "Seen" marks for the transition, finals entrance and trophy are device-local; another device shows the transition again once.
8. Whether HQ should auto-open the practice room on the first visit of each window (today: one click).
9. Story strips at 360 px could switch to two columns (a VIS-F2 component change).
10. The championship roll call shows synthetic `SYN …` names (kept for honesty).

## 9. Commit record

The implementation commit and this handoff's SHA record follow; see §9 of the next commit.
