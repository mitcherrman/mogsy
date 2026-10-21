# W26Q — Worlds 2026-exclusive Pro Play Quiz (handoff)

Date: 2026-10-19/20 (local), evidence read 2026-10-20 03:50–03:56 UTC.
Status: **tested integration candidate, pushed as feature branches with draft PRs** — backend mitcherrman/League_Combat_Simulator#66, frontend mitcherrman/mogsy#104. Nothing was merged, published, deployed, migrated or ingested. No production database was opened, and no live data was changed. The only production reads were public GET endpoints. Pass 2 (2026-10-20) is §15.

| Repo | Branch | Base | Worktree |
|---|---|---|---|
| backend `mitcherrman/League_Combat_Simulator` | `worlds26/quiz-backend` | `origin/master` `84567e11` | `C:\Users\mlmit\mogzy-wt\w26q-be` (clean baseline: `w26q-be-base`) |
| frontend `mitcherrman/mogsy` | `worlds26/quiz-frontend` | `origin/main` `2cd80efb` | `C:\Users\mlmit\mogzy-wt\w26q-fe` (clean baseline: `w26q-fe-base`) |

**Labels.** **VERIFIED** means we observed it in a response, the corpus or a test run during this pass. **INFERRED** means we reasoned it.

---

## 1. Verdict

1. **The canonical corpus cannot supply a single Worlds 2026 question today (VERIFIED).**
   - It holds zero Worlds 2026 games, drafts, player-games or team-games.
   - So the three existing stat families have zero Worlds 2026 supply.
   - This blocks only statistical questions (picks, bans, games, champion pools), not the quiz.
2. **A Worlds-only quiz is still possible, and it is honest.**
   - It is built on a new **tournament-fact family** fed by the certified PW4-A tournament authority:
     - completed match results;
     - certified bracket and stage outcomes;
     - the certified Riot-primer field.
   - On production's real feed of 2026-10-20 it yields **60 eligible questions**, enough for full, varied 10-question sessions.
   - Supply grows as matches finish: about 154 at the end of the event, from synthetic projections.
3. **There is no fallback, by construction.**
   - A preset session plans and freezes all 10 questions at start, from one snapshot.
   - It never calls the general families.
   - If supply ever fell below a valid session, the start is refused with `PP_PRESET_UNAVAILABLE` (503), and the frontend shows an honest unavailable panel.
4. **The stat families are wired but switched off.**
   - They join the pool only for canonical tournament ids listed in `certified_canonical_tournament_ids`, which is **empty**.
   - Every stat question is re-checked for scope after it is frozen.

## 2. Task 1 — official Worlds 2026 data traced into Mogzy (VERIFIED)

Source of truth: production `GET /api/live-esports/tournament/worlds-2026`, fetched 2026-10-20 03:50:14Z. It is saved verbatim as `live_esports/fixtures/worlds_2026_feed_prod_2026-10-20.json`.

**Freshness and certification:**
- `source_ok: true`, `stale: false`.
- Schedule and standings were both fetched at 03:50:14.932Z.
- Coverage: `basis: standings`, `complete: true`, 46/46 matches.

**Progress:**
- 6 of 46 matches are completed: the whole Play-In.
- Swiss has not started (`phase_detail: play_in → swiss`).

**Play-In results (real):**

| Match id | Cell | Result |
|---|---|---|
| 115660588583171786 | Upper Bracket – Semifinals | KC 3–2 C9 |
| 115660588583040710 | Upper Bracket – Semifinals | MVK 3–0 FUR |
| 115660588583171790 | Upper Bracket – Finals | KC 3–0 MVK |
| 115660588583171794 | Lower Bracket – Semifinals | FUR 3–1 C9 |
| 115660588583171798 | Lower Bracket – Finals | MVK 3–1 FUR |
| 116299649498303884 | Finals | KC 3–0 MVK |

- **Play-In outcome:** KC won the Play-In (bracket authority `standings`); C9, FUR and MVK were eliminated.
- **Games played:** 22.

**Where the data lives:**

| Layer | Worlds 2026 content | Evidence |
|---|---|---|
| Upstream schedule + standings (tournament_context_v2) | 46 matches, 6 completed, certified | prod feed above |
| LIVE1 hot store | All 22 Play-In games, with players, champions and sides verified (10/10 identities resolved, e.g. game 115660588583171787) | `GET /api/live-esports/games/{id}` and `/players` |
| **Canonical corpus** (`pro_canonical_games`, drafts, player/team games) | **0 games** | Production `/api/pro-play/stats/teams?year=2026&league=World%20Championship` gives `games: 0`. Production `/api/pro-play/stats/filters` lists competition "World Championship" with `last_year: 2025`. Local corpus (2026-10-17 copy): max game date 2026-08-23, 0 rows matching Worlds 2026 |
| Historical import | ends 2026-07-10 | production `/api/docs/pro/years/2026` |

**Why the canonical corpus has nothing:**
- Leaguepedia collection stopped on 2026-07-11 (PRODATA1).
- PRODATA2 made LIVE1 link-only (it never mints canonical games).
- The 2026 delta promotion is `production_apply_approved=false`.

LIVE1 game-level data was **not** used for questions. It is live-poll data with no certified per-game winner, and turning it into questions is a new data path that needs its own review (§10).

## 3. Task 2 — tournament identifiers (VERIFIED; nothing guessed)

**Upstream (lolesports) — the authority the quiz uses:**
- League `worlds` `98767975604431411`.
- Tournament `115660540725177488` (slug `worlds_2026`).
- Standings stage slugs:
  - `play_ins`: 6 match ids;
  - `swiss`: rounds 1–5, with 8/8/8/6/3 match ids;
  - `knockouts`: 7 match ids.
- These are PW4-A's certified ids, and every one is re-read from the live standings on each feed.

**Canonical (Leaguepedia) — none exist.**
- Past events are filed as `"Worlds 2025 Main Event"` / `"Worlds 2025 Play-In"`.
- The Worlds 2026 names cannot be known until Leaguepedia files the games, so they are **not** guessed.
- The generic "World Championship" league is **not** used as a shortcut: it also files Regional Finals (e.g. "LPL 2025 Regional Finals").
- `certified_canonical_tournament_ids` stays `()` until the certification step in §9.

## 4. Task 3 — which families can produce Worlds 2026 questions (VERIFIED by enumeration)

Measured with `pro_authority.question_enumeration.iter_questions(Filters(tournaments=…), dedupe=True)`. This is an exact, anchor-side tournament filter across all 12 generation shapes. Existing floors are unchanged.

| Tournament scope | Canonical games | Slots visited | Eligible | After semantic dedup | Team family | Win-rate questions |
|---|---|---|---|---|---|---|
| **Worlds 2026 (any name)** | **0** | **0** | **0** | **0** | 0 | 0 |
| Worlds 2025 Main Event + Play-In (proxy for a full event) | 84 | 2,608 | 46 | 27 | 0 | 0 |
| Worlds 2024 Main Event + Play-In | 106 | 2,716 | 179 | 95 | 0 | 0 |
| MSI 2026 | 61 | 2,010 | 20 | 12 | 0 | 0 |

**Worlds 2025 breakdown:**
- Champion scope: 8 questions (bans 3, picks 2, presence 3).
- Player→Champion: 17, mostly `champion_share`.
- Champion→Player: 2.
- Team: **0**.

**Scope leakage in `on_demand`, measured.**
- `generate_pro_question(..., constraints={"tournament_id": X})` honours the id only on the champion-anchored shapes that also pass `champion_key`.
- The scope-anchored samplers ignore it:
  - champion-scope family;
  - player-scope shapes;
  - team-scope shapes.
- So `on_demand` with a tournament constraint can leak. The preset therefore never uses `on_demand` sampling: it uses enumeration plus post-freeze re-verification (§5).

## 5. Task 4 — the server-side preset (implemented)

**`POST /api/pro-play/quiz/sessions?preset=worlds_2026`**
- Without `preset` the endpoint is byte-identical to today's general quiz.
- A test asserts the general path is called, and that a general session summary has no `preset` key.

**Flow** (`pro_play/presets.py`, `pro_play/quiz_session.start_preset_session`):
1. Read the tournament feed **once**, through the same function the public tournament page uses (`routes.live_esports.tournament_feed`): same 120 s cache, retry cooldown and stale rules.
2. Build the candidate pool **by enumeration**: tournament facts, plus stat questions only for certified canonical ids.
3. Plan 10 questions under the session rules. Up to 24 seeded re-plans are tried before declaring the pool insufficient.
4. Freeze all 10 into the session. `next_question` serves `session.planned[slot]`, with **no family draw and no fallback**. Grading, `question_id` idempotency, replay, conflicts and the reveal all use the existing `ServedQuestion` code unchanged.

**Session rules** (re-checked on every served session by the tests):
- No repeated fact (`semantic_key`).
- **Asks / discloses.**
  - Each question declares the facts it tests and the facts its stem, choices or reveal show.
  - No question may test a fact another question tests or shows, in either order, since a reveal is seen before the next question.
  - Example: "Who won FUR vs C9 in the lower-bracket semifinal?" shows that both entered the Play-In, so it never shares a session with "Which of these teams began in the Play-In?" about either of them.
- At most 3 questions per template; at least 4 templates.
- No template repeats an answer: never three "Play-In Stage" answers in one session.
- Round-robin over the categories Match / Bracket / Field (and Stats when certified).
  - Modal mix on the real feed: 3 Match / 2 Bracket / 5 Field.
  - Every one of 200 seeded sessions contained results questions.

**Leak-proofing in every shape:**
- Fact questions read only the context's certified registry and the feed's standings-filed matches.
- A match id absent from the standings stage lists (e.g. a Worlds 2025 row on the same league page) is never asked.
- Stat questions must pass `stat_instance_scope(frozen_instance) ⊆ certified ids`:
  - the champion family's `tournament_id`;
  - the entity families' `T:` scope window;
  - a season or all-time window yields no tournament, so it fails closed with `PresetScopeLeak`.

**Other endpoint:**
- `GET /api/pro-play/quiz/presets/worlds_2026` returns availability, the reason, supply counts, `as_of` and source flags.
- It is answer-safe: counts only.

**Error codes:**
- `PP_UNKNOWN_PRESET`: 404.
- `PP_PRESET_UNAVAILABLE`: 503, with the message "There aren't enough verified Worlds 2026 questions for a full quiz yet."

**Session payload additions:**
- `session.preset = {id, label, tournament, context_id, as_of}`.
- `question.topic` is `Match` / `Bracket` / `Field`.
- `question.context` follows the existing presentation contract:
  - relationship, metric chip;
  - scope tag "Worlds 2026" (+ stage);
  - editorial tags `recent_esports` + `worlds_2026`;
  - symmetric thin team cards (code, label, opaque id only — no region, seed or record, any of which can be an answer).
- `result.evidence` names each option by its exact label (the arena's join rule), with `provenance`:
  - source, upstream league and tournament ids;
  - match id, stage, cell and round;
  - schedule/standings `fetched_at`, `feed_stale`;
  - `definition_version: tournament_fact_v1`.

### The tournament-fact family (`pro_authority/tournament_fact_family.py`)

**Templates.** Every one states only a fact that can no longer change.

| Category | Template | Needs |
|---|---|---|
| Match | `match_winner` — "Who won A vs B in the Worlds 2026 {stage}?" | certified completed match |
| Match | `series_score` — Bo3/Bo5 only | same |
| Bracket | `play_in_winner` | Play-In `bracket_authority == standings`, winner derived by PW4-A |
| Bracket | `swiss_advanced` / `swiss_eliminated` | 3 verified wins / 3 verified losses (irreversible) |
| Bracket | `swiss_undefeated` (3–0) | additionally `swiss.unverified_completed_matches == 0` |
| Bracket | `elimination_stage` | Play-In certified eliminated list; 3 Swiss losses; a lost certified knockout match |
| Bracket | `tournament_champion` | knockout `bracket_authority == standings` + `champion_code` |
| Field | `team_region`, `play_in_entrant`, `region_team_count`, `swiss_tier` | PW4-A certified registry (Riot primer 2026-10-05 + getTeams) |

**"Certified completed match" means all of the following:**
- the feed is contract v2 with `coverage.basis == "standings"`;
- the match id is filed under its own stage in standings;
- `state == completed`;
- both teams are mapped participants, not TBD;
- outcomes are exactly one win and one loss, and agree with `winner_code`;
- the winner's game wins equal the best-of majority, and the loser's are below it;
- no warning names the match.

**Not in this family, by design:**
- players or lineups (all `not_certified`);
- statistics;
- in-progress records;
- dates in stems;
- sponsor names. Labels are canonical team keys with a registry disambiguator stripped when unique (e.g. "LYON").

**Answer safety:**
- Choices and stem names are in `display_order(question_key, …)` order: neither the stem nor the choices lead with the winner (tested).
- Pre-answer payloads pass `assert_pre_reveal_safe`.
- Questions are hashed into the opaque `question_id`, so `pro_tournament_fact:…` never reaches a client.

## 6. Task 5 — sample-size rules (resolved without lowering any floor)

**No existing threshold was changed.** The doc decision of 88d99ad5 stands.

1. **Fact questions are not statistics.** A single completed match result or bracket outcome has no sample to be too small. These are the questions the tiny-sample problem made impossible before, and they are exact.
2. **Stat questions keep today's floors untouched.** Measured on a full Worlds (2025):
   - the floors already exclude every win-rate question (0 of 27);
   - they exclude every team question;
   - so a certified Worlds 2026 id cannot produce a deceptive win rate from a 3-game sample. A test asserts no `win_rate` metric appears.
3. Evidence and provenance are kept per question (§5). Each stat question keeps its own `authority_revision` / sample-size evidence unchanged.

## 7. Task 6 — supply by tournament state (VERIFIED: real feed + synthetic projection)

**How the synthetic states were made:**
- Results are written onto the real upstream 2026-10-11 schedule and standings fixtures and run through the real `tournament_state_v2`.
- The Play-In results are the real ones. Swiss and knockout results are invented by a seeded format-correct simulator (16 teams, 8/8/8/6/3 Swiss rounds) **in tests only**.
- The Play-In state built this way reproduces production's real supply exactly (60 = 60).

| State | Total | Match | Bracket | Field |
|---|---|---|---|---|
| Pre-event / feed unavailable | 44 | 0 | 0 | 44 |
| **Play-In complete (= production 2026-10-20)** | **60** | 12 | 4 | 44 |
| Swiss after round 3 (synthetic) | 90 | 40 | 6 | 44 |
| Swiss complete (synthetic) | 132 | 58 | 30 | 44 |
| Quarterfinals done (synthetic) | 144 | 66 | 34 | 44 |
| Event complete (synthetic) | 154 | 72 | 38 | 44 |

**Degraded feeds:**
- Upstream down or standings unverified: the quiz degrades to field-only questions (44, still a valid varied session).
- Stale feed: completed results are still asked, because they are final; `provenance.feed_stale = true` records it.
- **Owner call (§11-B):** whether a field-only quiz should be offered at all.

## 8. Task 7 — frontend (CanonicalArena / PPQ2 contracts unchanged)

**New route and page:**
- Route `/lol/pro-play/quiz/worlds-2026` (`PRO_PLAY_WORLDS_QUIZ_ROUTE`) renders the page `src/pages/Worlds2026Quiz.tsx`, lazy and on the full-bleed arena list.
- The page is `useProPlayArenaController({preset: "worlds_2026", modeLabel: "Worlds 2026 Quiz"})` + `ProPlayArenaRun`.
- Grading, replay, reveal, Next and the end panel are the Pro Play arena's own, untouched.

**Branding:**
- The header eyebrow and every frame panel read "Worlds 2026 Quiz", taken from the server's `session.preset.label` (`proPlayModeLabel`).
- The general quiz still reads "Pro Play Quiz".
- "Back to Worlds" links to `/lol/pro-play/tournament/worlds-2026`.

**Honest unavailable state:**
- `PP_PRESET_UNAVAILABLE` renders `pro-play-unavailable`: the server's message in normal tone, a note that questions come only from verified Worlds 2026 facts and never from earlier Worlds, plus Try again and Back to Worlds.

**Entry point:**
- `TournamentV2` (the published/rollback Worlds page, v2 contexts are Worlds only) gains a "Worlds 2026 quiz" link beside "Pro Play quiz".
- The **flagged Worlds experience** (UX4/UX6 zero-scroll, live in production) was deliberately **not** modified. Its layout is pixel-swept, so adding a CTA there is an owner/design decision (§11-A).

**API:**
- `startProPlayQuiz(preset?)`.
- `getProPlayPresetAvailability(preset)`.
- Optional `preset` field on the session type. Additive and backward-compatible.

## 9. Task 8 — tests and evidence

### Backend: `test_worlds_2026_quiz.py`, 40 tests, all pass

**Coverage:**
- **150 seeded full sessions (1,500 served questions)** across 5 tournament states plus the real production feed.
- Every question is played through `submit_answer`, half right and half wrong, and checked against an **independent oracle** computed from the raw ground truth:
  - match winner and score;
  - Swiss records;
  - elimination stages;
  - champion;
  - region, entry, tier and region counts from the registry.
- Session rules re-checked on every session:
  - 10 unique keys and semantic keys;
  - asks/discloses disjointness;
  - template cap and ≥4 templates;
  - answer diversity;
  - answer position not parked (<60% in any slot);
  - pre-answer payload free of forbidden keys;
  - subject cards aligned and symmetric.
- **Exclusivity:**
  - `on_demand.generate_pro_question` is patched to fail; 20 preset sessions still complete;
  - every question carries upstream tournament id `115660540725177488`;
  - a rogue match id outside standings is never asked.
- **Partial and missing data:**
  - pre-event; feed `None`; feed provider raising; standings missing; v1-shaped feed;
  - warned match; 6 malformed-result mutations; unverified Swiss result; uncertified bracket;
  - mid-Swiss never asks an active record; stale feed.
- **Snapshot freeze:** the feed changes mid-session and nothing served moves.
- **Unavailable:** an oversized preset gives `PP_PRESET_UNAVAILABLE`, nothing is stored, no fallback draw happens, and availability reports `insufficient_supply`.
- **HTTP:**
  - preset start; idempotent GET; replay (`replayed: true`, same result and score); `PP_ANSWER_CONFLICT`;
  - play-through to complete; unknown preset 404; unavailable 503;
  - availability is answer-safe; the no-preset path is the general quiz.
- **Stat path on the real local corpus:**
  - Worlds 2025 ids stand in for certified ids;
  - 27 candidates, every frozen instance's own scope ⊆ ids, no `win_rate`;
  - stats take a share of planned sessions;
  - an out-of-scope freeze fails closed (`PresetScopeLeak`).
- **Mutation check:** 7/7 deliberate defects are caught (reversed score, wrong winner, active counted as eliminated, standings-stage filter removed, leak rule removed, winner-first ordering, 3–0 guard removed). Script: `scratchpad/mutate.py` pattern.

### Backend regression

The 9 Pro Play / tournament suites:
- quiz, on_demand, stem order;
- worlds and tournament context;
- enumeration, question context, bounded scopes;
- W26Q.

| | Result |
|---|---|
| Branch | 540 passed, 8 failed, 5 skipped |
| Base `84567e11` | 501 passed, 8 failed, 5 skipped |

The **failure sets are identical**. All are pre-existing: review-sample/taxonomy admin routes, and the date-dependent `test_route_walks_pages_and_uses_each_id_for_its_own_read`.

### Frontend

**`src/pages/Worlds2026Quiz.test.tsx`, 7 tests, all pass.** They are driven by `worlds2026PresetSession.json`, a **real session captured from the backend's own HTTP routes**. They cover:
- the preset request URL; branding; the back link;
- a full play-through to the server's score;
- the unavailable panel; the mode-label rules; the preset and general start URLs;
- the arena's reveal model consuming the real evidence;
- no answer keys pre-grading.

**Regression (`src/lib/pro-play`, `src/components/pro-play`, `ProPlayQuiz`, `src/pages/pro-play`, `Layout`):**
- Branch: 29 failed / 1,829 passed. Clean main `2cd80efb`: 29 / 1,829. The failure sets are **identical**.
- The 29 are pre-existing: `ProPlayTournamentWorlds`, since main's tracked `.env` has the Worlds flag on (UX6 note).

**App route tests + tournament components:** 3 failed / 135 passed on both, identical.

**`tsc -p tsconfig.app.json`:** the same 2 pre-existing errors as main (`OnboardingProfile.tsx`, `identity/connections.ts`), none new.

**Production build (scratch esbuild config + rollup-wasm hook, the machine's known workaround):** succeeds; `Worlds2026Quiz-*.js` is its own lazy chunk.

**Not done:** browser screenshots. `AGENTS.md` forbids local browser automation without explicit per-run approval, so visual checks belong in CI or an approved run.

## 10. Remaining blockers (exact)

1. **Statistical Worlds 2026 questions — data, not code.**
   - The canonical corpus has 0 Worlds 2026 games.
   - Unblocking needs, in order:
     - a Leaguepedia/OE import of the Worlds 2026 games, via the PRODATA2 delta path (`production_apply_approved=false` today; the bot credential is still the PRODATA2 blocker);
     - a canonical rebuild;
     - certification of the canonical tournament id(s).
   - **Certification step (owner/data steward):**
     - list the distinct `tournament_id` of canonical games whose `live1_game_id` / source link maps to a game id in the official feed's `matches[].live1_game_ids`;
     - confirm the count matches the completed-game count (22 for the Play-In);
     - add the exact ids to `PRESETS["worlds_2026"].certified_canonical_tournament_ids`;
     - re-run `test_certified_stat_tournaments_never_leak_scope` with them.
   - **Expected yield** at the event's end, from Worlds 2024/2025: about 27–95 extra questions, champion and player shapes only.
2. **LIVE1 game-level facts (picks, per-game winners) are not used.** They need a certified per-game winner and a reviewed path; this is optional future work.
3. **Lineups:** still `not_certified` (PW2 D2/D6). No player questions until then.

## 11. Owner decisions

- **A. Entry point.** DONE in pass 2 (§15.2): one compact control in the Worlds experience command bar, visually certified 50/50. Owner review of the look is still welcome; there is no open decision.
- **B. Field-only mode. Current default, PENDING OWNER SIGN-OFF (not permanent policy).**
  - What it means: before results exist, or with upstream down, a session is all field facts (region, entry stage, seed tier, region counts). It is honest, but lighter.
  - Where it is marked: `pro_play/presets.py`, at the `worlds_2026` entry.
  - To require results instead: set a minimum Match+Bracket count enforced in `plan` (a one-line rule).
- **C. Labels. Current default, PENDING OWNER SIGN-OFF (not permanent policy).** Canonical team keys ("Team Liquid", "Cloud9", "LYON") rather than Worlds sponsor names ("Team Liquid Alienware", "Cloud9 Kia"). Marked at `tournament_fact_family.team_labels`.
- **D. Report identity.** There is a proposal (§15.4) that needs owner approval. It is not applied, so reports still file under mode "Pro Play Quiz".

## 12. Deployment order and owner actions

1. **Backend first.**
   - Review, then merge `worlds26/quiz-backend` into `master`. Railway `web` auto-deploys `master`.
   - It is additive: a new query parameter and a new GET. The general quiz is unchanged; no schema, no migration, no data.
   - Post-deploy smoke (read-only):
     - `GET /api/pro-play/quiz/presets/worlds_2026` should return `available: true` and `supply.total` ≥ 60;
     - `POST /api/pro-play/quiz/sessions?preset=worlds_2026` should return `session.preset.id == "worlds_2026"`.
2. **Frontend second.**
   - Review, then merge `worlds26/quiz-frontend` into `main`.
   - The owner then does Lovable Publish, then a live smoke of `/lol/pro-play/quiz/worlds-2026`: play 10 questions, and confirm the "Worlds 2026 Quiz" header and "Back to Worlds".
   - If the frontend ships before the backend, the page shows the arena's error panel. The general quiz is unaffected either way.
3. **Rollback.** Revert either merge. The frontend route is isolated; the backend parameter is opt-in.

## 13. Files

**Backend:**
- `pro_authority/tournament_fact_family.py` (new) — the family.
- `pro_play/presets.py` (new) — preset registry, pool, planner, availability, stat scope guard.
- `pro_play/quiz_session.py` — `preset`/`planned` session fields, `start_preset_session`, `_next_planned_locked`, topic passthrough, `preset` summary key (preset sessions only).
- `routes/pro_play.py` — `?preset=`, `GET /quiz/presets/{id}`, two error codes.
- `pro_authority/on_demand.py` — public `freeze_spec` seam (wraps `_freeze`).
- `live_esports/fixtures/worlds_2026_feed_prod_2026-10-20.json` — the production feed.
- `test_worlds_2026_quiz.py`.
- This handoff.

**Frontend:**
- `src/pages/Worlds2026Quiz.tsx` (+ test).
- `src/lib/pro-play/api.ts`, `routes.ts`.
- `arena/projectProPlayArena.ts`, `arena/useProPlayArenaController.ts`, `arena/index.ts`.
- `components/pro-play/arena-run/ProPlayArenaRun.tsx`.
- `components/pro-play/tournament/TournamentV2.tsx`.
- `App.tsx`, `components/Layout.tsx`, `lib/route-prefetch.ts`.
- `__fixtures__/worlds2026PresetSession.json` (captured).

## 14. Next step

1. Owner sign-off on §11-B and §11-C (defaults), and a decision on §11-D (§15.4).
2. Mark both PRs ready.
3. Merge the backend (#66) and smoke it (§12).
4. Merge the frontend (#104).
5. Lovable Publish.

## 15. Pass 2 (2026-10-20)

Code commits: backend `1093738f`, frontend `42c6ec3c` (each branch tip adds only this handoff).

### 15.1 CI and the Perfect Timing failure — BASELINE, not a regression (VERIFIED)

**CI on the pass-1 heads:**
- Backend #66 `safety`: success.
- Frontend #104: `validation` and `patch-deck` succeeded; `owner-prototypes` (workflow `interaction-labs-integration`) failed.

**The failure.** Exactly 1 of 21 Playwright tests:

`e2e/interaction-labs-access.spec.ts:84` › "the owner's bookmark /admin/perfect-timing lands on /admin/playtests/perfect-timing…"

`owner-playtest-page` mounts (`data-mode="perfect-timing"`) but stays `hidden`. The 453 unit tests passed.

**Baseline proof:**
- The workflow runs only on PRs that touch `src/App.tsx` (among other paths), so it never runs on main itself.
- The identical test fails in every run of the last day on unrelated branches: `patchhub/phd-release` (`1989cb4b`, run 39364334634), `academy-startup/release-rc2.2` (`a7e4c69d`, run 39234180840, 2026-10-19 09:37Z) and `notifications/v2` (run 39378985845).
- Both `1989cb4b` and `a7e4c69d` are **ancestors of the clean base** `2cd80efb`.
- The W26Q branch touches no Perfect Timing, interaction-labs or admin file.

**Not reproduced locally.** That would mean a browser run against the admin route with an owner sign-in, which `AGENTS.md` does not permit unprompted, and the CI evidence on base ancestors already settles it.

**No Perfect Timing code was changed.** Owner: a separate fix is needed on main. Until then, `owner-prototypes` stays red on every App.tsx PR.

### 15.2 Worlds 2026 Quiz CTA in the flag-enabled Worlds experience (implemented, certified)

**What and where.** `QuizChip` in `WorldsExperience.tsx`: one fixed-size control in the command bar's existing right cluster, beside the phase chip, in all three bar layouts.

| Layout | Form | Size |
|---|---|---|
| Desktop ≥ 1280 px | labelled chip "Quiz" | 73 × 28 |
| Desktop 1024–1279 px | icon-only | 28 × 28 |
| Portrait phone | icon-only | 36 × 44 tap target |
| Landscape phone | icon-only | 36 × 44 tap target |

All forms carry the accessible name "Worlds 2026 Quiz" and link to `/lol/pro-play/quiz/worlds-2026`. The control has no motion and adds no row and no scroll container.

**Phase-chip wording on desktop 1024–1279 px.** The phase chip now uses the phone bar's existing short wording there, keeping the stage's full name: "Knockouts now", "Play-In done", "Complete". From 1280 px the long label is unchanged.

Why this was needed: the certification found "Knockouts in progress" plus the five-tab nav leave no room for any control at 1024 × 768. Two collisions were found and fixed during certification:
- the labelled chip met "Discover" in the Play-In-complete state;
- the icon chip met it in the knockout state.

**Visual certification (owner-approved runs).**
- Setup:
  - Playwright's bundled headless Chromium shell, not Edge or Chrome;
  - production build with the Worlds flag on, served by a self-owned static server;
  - 1 worker, no windows, reduced motion emulated, a 10-minute hard cap, try/finally teardown; no browser process was left behind.
- Result: **50 / 50** = 5 states × 10 viewports.
  - States: pre-event, the real Play-In-complete feed, and synthetic Swiss R3, quarterfinals done and event complete.
  - Viewports: 1920×1080, 1440×900, 1280×800, 1280×600, 1024×768, 768×1024, 390×844, 360×640, 844×390 and 740×360; phones run as mobile with touch.
- Each case checks:
  - the page does not scroll in either axis;
  - the bar height: desktop 56 px, landscape 44 px; the portrait bar is 93 px, i.e. the 44 px row + nav, unchanged;
  - the CTA is fully in view and does not overlap the title, the nav or the phase chip;
  - the title is not clipped;
  - no overflowing scroller exists inside the experience;
  - the nav does not meet the phase chip;
  - reduced motion is applied.
- Evidence (frontend repo): `docs/handoffs/w26q/cta-cert-results.json`, `docs/handoffs/w26q/cta-cert.cjs` and 6 screenshots in `docs/handoffs/w26q/shots/`.

**Tests:**
- `QuizCta.test.tsx`, 6 tests:
  - one CTA per layout, in the phase chip's row;
  - fixed heights, no animation or scroll classes;
  - icon-only on phones;
  - present on Overview, Stages, Teams and Schedule across Play-In, Swiss, knockout and complete states with no scroll container;
  - desktop short/long phase wording.
- Worlds experience suites: 145 / 145.
- Focused regression (`src/lib/pro-play`, `src/components/pro-play`, `ProPlayQuiz`, `src/pages/pro-play`, `Layout`, `Worlds2026Quiz`, `App.ux3aRoutes`): **29 failed / 1,848 passed**, with the failure set **identical** to clean main (the pre-existing Worlds-flag tests).
- A wider run including `src/pages/dev` differed only in `LobbyPreviewPage.premiumAnalytics`, a known load flake. It also fails on base, in different tests, and passes 39/39 on both branch and base when run alone.
- `tsc`: the same 2 pre-existing errors.
- Production build: OK.

**Not covered:** a "phone recording" layout. No layout by that name exists in the Worlds experience. The certified phone cases (390×844, 360×640, 844×390, 740×360, with touch and isMobile) cover portrait and landscape.

### 15.3 Defaults marked pending owner sign-off

Field-only sessions and canonical team labels stay as the current defaults. Both are marked **PENDING OWNER SIGN-OFF** in code and here (§11-B, §11-C); neither is permanent policy.

### 15.4 Report filing — proposal, not applied

**How reports file today (frontend `src/lib/feedback`).** A question report is a `feedback` row with:
- `entry_intent = "question_report"`;
- `category`, the CHECK-constrained, server-visible column, which is `"Leaguecraft"` for both quizzes (`PRO_PLAY_REPORT_IDENTITY.category`);
- a client-written `report_context` jsonb holding:
  - `mode`: free text, capped, currently `"Pro Play Quiz"` for both;
  - `route`: already `/lol/pro-play/quiz/worlds-2026` for Worlds reports;
  - `runtime_question_id`, the prompt and the choices.

The admin view labels a report "Question Report · {reason} · {mode}". Nothing filters on the mode string; mode is display only.

**Smallest correct change (proposed):**
- For a preset session, set the report identity's `mode` to the arena's mode label ("Worlds 2026 Quiz"), e.g. pass `proPlayModeLabel(state)` into `projectProPlayReportable` / the arena's report identity.
- Keep `category: "Leaguecraft"`.

**Why this is safe:**
- It needs no schema, column, CHECK or migration change.
- Reports land in the same category bucket, so nothing is silently separated.
- The admin label tells them apart.
- Historical rows are untouched.

**Dependency:** any owner dashboard or saved query that counts reports by the exact `mode` text would see a second value. The repo has none, but out-of-repo queries such as Supabase SQL views are unknown.

Not applied, because it changes report records and the brief asks for a proposal.

### 15.5 Statistical Worlds questions — the asks/discloses gap (recorded, enforced)

**The gap.**
- Stat candidates (`presets.stat_candidates`) declare **no** `asks` / `discloses`.
- So the planner cannot stop a stat reveal from answering a fact question, or the reverse. For example, "Chovy has 4 games on Ahri at Worlds 2026" shows that Gen.G played at least two series, and "Faker's most-played champion at Worlds" names T1's run.
- Stat questions also say nothing about the Play-In or Swiss records they imply.

**Enforced in code.**
- `presets.STAT_DISCLOSURE_RULE_IMPLEMENTED = False` gates `candidate_pool`.
- Certifying a canonical tournament id is **not** enough to activate statistical questions: this flag must also flip, together with the rule and its tests.
- `test_stat_gate_holds_even_with_a_certified_id` asserts this.
- The stat path's scope test still runs, with the gate opened only inside that test.

**Required before activation (10.1a):**
- every stat candidate declares:
  - `asks` = its semantic fact;
  - `discloses` = each named team's/player's participation and stage presence in the window, plus any match/series outcome its counts imply;
- tests prove no stat and fact pair in a session violates the rule, mirroring `assert_session_rules`;
- the mutation check is extended.

**Backend tests now:** 41 / 41.

### 15.6 Merge readiness

**Backend #66 — code-ready, CI blocked by billing:**
- On the pass-2 tip (`2343b28c`) the `safety` check did **not run**. GitHub refused to start the job: "recent account payments have failed or your spending limit needs to be increased" (2026-10-20 10:42Z).
- This is an account billing problem, not a code failure. **Owner action:** fix GitHub Actions billing or the spending limit, then re-run `safety`.
- The pass-1 tip `dec442b3` passed the same check, and pass 2 changed only the stat gate, tests and docs.
- Locally the W26Q tests pass 41/41 and the 9-suite regression matches base. The change is additive.
- Waiting on owner sign-off on §11-B/§11-C (defaults) and the draft-to-ready step.

**Frontend #104 — code-ready:**
- Tests and visual certification pass.
- CI on the pass-2 tip `141b7f73`: `validation` and `patch-deck` are green. `owner-prototypes` is red on the same single test (453/453 unit, 20/21 e2e). That is the pre-existing Perfect Timing baseline failure (§15.1). It is not caused by this PR, but it keeps the check red until main is fixed. The owner can merge over it knowingly or fix main first.
- It depends on the backend being deployed first.
- §11-D is open but does not block: reports file safely as today.


## 16. Owner sign-off and release-preparation update (2026-10-20)

Owner approved all three product defaults:
- **Field-only:** allow a verified field-only 10-question session when results are unavailable. Do not broaden to other tournaments.
- **Teams:** canonical stable team names; no sponsor-name substitution.
- **Reporting:** Worlds 2026 Quiz is its own free-text mode label, with existing **Leaguecraft** report category; no schema change.

Frontend PR #104 implements reporting mode selection from the *server-confirmed* session preset (`session.preset.id == worlds_2026`); the general Pro Play Quiz report identity remains unchanged. A contract test checks the projected report and reportable snapshot. Frontend commits `5ecd2604` and `7ffe8c27` (code/test), awaiting CI after push. The owner has **not authorized any production merge, deploy or Lovable Publish**.

CI release risks remain: backend safety workflow last failed without execution due to reported Actions billing restrictions; frontend owner-prototypes historically fails the unrelated Perfect Timing owner page test. Check latest CI once generated, and verify the exact underlying failure before release. Both PRs remain draft pending explicit merge approval. Merge backend first, Railway smoke, frontend second, Lovable Publish only after explicit permission.
