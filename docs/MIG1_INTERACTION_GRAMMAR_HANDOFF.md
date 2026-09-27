# MIG1 — Mogzy Interaction Grammar: Architecture & Handoff (MIG1.0)

Status: MIG1.0 audit only. No production code changed. Current code is authority; this doc records what it says.

## 1. Objective

A small vocabulary of reusable interaction primitives (Data Duel, Stat Drop, later Order Forge, Match Grid, Who Is This?, Graph Hunt, bracket/roster, Combat Snapshot) that renders inside the **existing** Ranked/Daily arena and serves both Leaguecraft (Ranked, Daily, Study Hall, Mastery, Combat) and Pro Play / authored stories — without a second arena, runtime, scoring engine, question bank, attempt store, or analytics lifecycle.

## 2. Base SHAs inspected (after `git fetch origin`, 2026-09-27)

| Repo | Branch | SHA |
|---|---|---|
| mogsy (frontend) | origin/main | `afa8e57a` test(admin): JREF2 launcher body carries production's browser correlation |
| League_Combat_Simulator (backend) | origin/master | `35450a27` feat(analytics): USERS2.3C-Daily correlation and Ranked wrapper provenance |

Note: both primary checkouts are on a dirty `envvis1-batch1-scene-channel` branch. The audit used clean worktrees at the origin tips (`mogsy/.worktrees/mig1-0-audit`, `League_Combat_Simulator/.worktrees/mig1-0-audit-ro`).

## 3. Existing architecture we reuse

Confirmed layering in current code (repo names in brackets):

```
CONTENT AUTHORITY        backend: Mastery facts/publication, pro_authority, quiz banks
        ↓                (freezes private payload; owns truth)
RANKED MODULE            backend: RoundModule (ranked_modules/contract.py:356)
 (authoritative contract)  generate_segment / validate_challenge_input / challenge_is_correct /
        ↓                  public_view / resolve_segment / challenge_reveals
FORMAT / HOST            backend: RankedFormat + SegmentSpec (ranked_formats/schema.py);
        ↓                Daily recipe composes in-memory formats and hosts child Ranked matches
FRONTEND MODULE          frontend: ModuleRenderer (src/lib/ranked-core/modules/types.ts) + registry
 RENDERER                 Viewport(publicRound, selection, onSelect, actions.submitChallenge, reveal…)
        ↓
INTERACTION PRESENTATION ← MIG lives here (new, frontend-only, pure)
        ↓
ARENA                    frontend: CanonicalArena (src/components/ranked-arena/CanonicalArena.tsx)
                         fed by ArenaViewModel (src/lib/ranked-core/arenaView.ts)
```

**Correction to the proposed ordering:** interaction presentation is not *above* the Ranked module; it sits *below* the frontend ModuleRenderer, which is itself the client half of a backend RoundModule. A primitive is something a module Viewport composes; it is not a host, a module, or an arena slot.

## 4. Ownership / boundary model

| Layer | Owns | Must not |
|---|---|---|
| Content authority (backend) | Facts, question generation, frozen private payload, correct answer, reveal fields | Know about UI primitives |
| RoundModule (backend) | Input shape validation, grading, points (RP1 `points.py`), child outcomes, canonical question refs, reveals | Leak answers pre-reveal (`answer_safety.assert_pre_reveal_safe`, `projections.py`) |
| Format/host (backend + page) | Segment pattern, clocks, Daily stages, Journey cursor, persistence, analytics correlation | — |
| ModuleRenderer (frontend) | Project `publicRound` → primitive props; map primitive response → `SegmentChoice`; call `submitChallenge` | Grade; invent answers |
| **MIG primitive (frontend)** | Layout, input affordance, local selection state, response emission, reveal *display* from supplied data, motion/sound hooks | Know domain facts, grade, score, persist, fetch, call `track()`, import Ranked/Daily/Pro Play clients |
| CanonicalArena | Chrome, rails, timer, beats, result/award presentation | Know about specific primitives |

## 5. What MIG owns vs does not own

MIG owns: `src/lib/interaction-grammar/` (primitive components, their generic prop/response types, a fixture format) and a DEV-only Interaction Lab route.

MIG does **not** own: grading, scoring, question banks, attempt/history tables, analytics events, audio engine, arena, module registry entries, answer transport, Review/History.

## 6. Reusable components / files and why

Frontend (`mogsy`):
- `src/components/ranked-arena/CanonicalArena.tsx` — the one arena. Props: `view`, `terminal`, slots `chrome/guidance/outro/warning`, `recovering`. Already hosted by Ranked (`pages/quiz-ranked/QuizRankedMatch.tsx`), Daily (`pages/quiz-daily-challenge/run/DailyRunPage.tsx`), Playtest (`components/playtest/PlaytestMatchHost.tsx`), Journey dev harness (`pages/dev/journey-arena/`).
- `src/lib/ranked-core/arenaView.ts` — `ArenaViewModel` is transport-free by design ("ARENA1 Step 3"); a lab can build one from fixtures. `ArenaSurfaceView.renderer` takes a `ModuleRenderer`. `ArenaRail` has an unused `{kind:"panel"}` slot (line 120) for non-PvP flanks.
- `src/lib/ranked-core/modules/{types.ts,registry.ts}` — ModuleRenderer contract; registry: `quiz.v1`, `item_cost_duel.v1`, Meta Reflex (`item_cost_duel.v4+`, `metaReflexModule.tsx`), `mastery_slice.v1`.
- `src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx` — **already dispatches `comparison_left_right` and `atomic_recall` interaction kinds over `single_choice | numeric | boolean` answer types.** This is the existing interaction dispatch; MIG primitives should become what it renders, not a sibling to it.
- `src/features/mastery/` (`MasteryChoiceInput`, `MasteryNumericInput`, `MasteryRevealView`) — reference numeric/choice inputs.
- `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` — existing fixture-only, presentation-only CanonicalArena harness (component-level DEV guard, line 1759). Closest precedent for the Lab.
- `src/lib/journey/{beat.ts,rail.ts}`, `src/lib/ranked-core/flow/useSpecialTransition.ts` — persistent boards / timed transition beats.
- Reveal vocabulary: `SurfaceReveal` (`src/lib/question-surface/contract.ts`), `ResolvedFeedback` (`src/lib/question-feedback/model`), `PointsFeedbackView` (`ranked-core/pointsFeedback.ts`), `AwardEvent` (`components/ranked-arena/AwardPops`), `header.centralResult`.
- Audio: `src/lib/audio/{engine.ts,sfx.ts,sfx-registry.ts,useSfx.ts}`, `components/audio/useRankedAudioBoundary.ts`, `pages/quiz-ranked/useRankedMatchSfx.ts` (SFX1/SFX2: one cue per settlement, module < Daily stage).
- Dev-route production-strip pattern: `src/lib/combat-lab/team-sim/featureGate.ts` + conditional `<Route>` in `src/App.tsx:606` + `src/App.teamSimRoutes.test.ts`.

Backend (`League_Combat_Simulator`):
- `ranked_modules/contract.py` (RoundModule, `ChildOutcome` with `answer: Any`, `canonical_question_ref`), `ranked_modules/registry.py`, `ranked_modules/mastery_slice.py` (v1/v2; `validate_challenge_input` :1827, `challenge_is_correct` :1861, `challenge_reveals` ~:1950), `ranked_modules/points.py`.
- `ranked_formats/schema.py` (`SegmentSpec` :150, `RankedFormat` :789); `daily_challenge/recipe.py` (Standard/Time Trial composition); `ranked_public/host.py:66` (`daily_stage_host`).
- `answer_safety.py`, `ranked_public/projections.py` — pre-reveal guarantees.
- `ranked_public/review.py`, `daily_challenge/run/review.py`, tables `ranked_segment_challenges` (`choice_json`), `ranked_segment_child_results`, `ranked_question_discoveries`, `daily_run_*`.

## 7. Current answer / input contracts

- Frontend (`src/lib/ranked-public/client.ts:510`):
  `SegmentChoice = { itemId } | { cardId } | { selected: string | number | boolean }`; `actions.submitChallenge(challengeIndex, choice)`; challenge index in URL.
- Backend (`schemas/ranked_public_schemas.py:172` `SegmentChallengeIn`, `extra="forbid"`): exactly one of `item_id`, `card_id`, `selected: StrictBool|StrictInt|StrictFloat|StrictStr` (strings 1–128 chars).
- Mastery answer types: `single_choice` (str ∈ `answer_options`), `boolean`, `numeric` (non-bool int/float). Numeric grading is binary: `EXACT_INTEGER` or `ROUNDED_DECIMAL` (same displayed rounding cell) — `mastery/questions/precision.py`. Input constraints (unit/step/decimals) published via `_numeric_input_constraints` (`mastery_slice.py:361`).
- Pro Play quiz (`routes/pro_play.py`, `pro_play/quiz_session.py`): separate in-memory session, `selected_answer: str`, **not** a RoundModule.

Mapping: Data Duel → `selected: "<option token>"` (single_choice / comparison_left_right). Stat Drop → `selected: <number>` (numeric). Both fit today's transport unchanged.

## 8. Confirmed limitations

1. **No structured answers.** Arrays/pairs/objects are rejected with 422 at `SegmentChallengeIn`. Order Forge / Match Grid cannot ship through Ranked without extension. Storage (`choice_json`) and `ChildOutcome.answer` already accept any JSON.
   Future extension point (do **not** do in MIG1): add one bounded `structured` field to `SegmentChallengeIn` + `as_choice`; add a matching `SegmentChoice` variant; add explicit answer-type branches in `mastery_slice.validate_challenge_input` (unknown types currently pass through silently — a latent hazard), `challenge_is_correct`, `bot_challenge_input`, reveal `player_answer`; check `ranked_public/service.py` validate/grade sites and `segment_flow.py:386/701`.
2. **No closeness scoring.** Stat Drop "how close were you" is display-only unless a future module grades bands. Grading stays binary.
3. **Pro Play has no Ranked module.** A Pro Play Data Duel in production would need Pro Play content to publish through an existing module (most likely as Mastery-style frozen children) — not a new runtime. Deferred until a lab-proven interaction needs it.
4. **Analytics has no DEV suppression** (`src/lib/analytics/track.ts`). The Lab must not mount controller hooks that call `track`/`useSurfaceEvent`.
5. **Dev routes are mostly registered unconditionally** in `App.tsx`; the Lab must use the team-sim gate pattern so it is stripped from production builds.

## 9. Overlap / conflict analysis

| Workstream | State at base | MIG1.1 impact |
|---|---|---|
| NAV1 back navigation | `origin/nav1/back-navigation-audit` docs-only; targets `quiz-ranked/*`, `quiz-daily-challenge/run/*`, `Layout`, `GlobalHud`, Settings/Profile | Do not touch those files. |
| Codex NAV1-E worktrees (leave contract, Ranked leave, Daily exit) | Active local worktrees | Same: avoid Ranked/Daily page files. |
| DCMOD / Daily | `dcmod/integrate-daily` merged; `dcmod/a–d` branches are 264 behind master, likely superseded (not verified per commit) | None; Lab does not touch Daily. |
| Journey (J2–J5, JREF2, motion, K2) | Landed | Reuse beats/rail read-only. |
| Ranked / CanonicalArena / RMOB / RS | Landed | Read-only consumption of `CanonicalArena`/`arenaView`. |
| Playtest | Landed | None. |
| USERS2 analytics/correlation | Landed through 3C (both repos) | Lab emits nothing. |
| Question-surface convergence (F1) | Design note, "no action without G-series sign-off"; proposes `answerType`-keyed adapters | **Direct conceptual overlap.** MIG primitives are the natural adapters; keep types compatible, don't edit `question-surface/*` in MIG1.1. |
| Mastery interaction/rendering | `MasterySliceChallengeSurface` dispatch landed | Don't modify in MIG1.1; adopt in MIG1.3. |
| Meta Reflex | Landed | None. |
| Pro Play quiz/data | Separate quiz; `src/lib/pro-play/statsApi.ts` + profile pages have uncommitted edits in the primary checkout | Lab uses static fixtures only; do not import `statsApi`. |
| ENVVIS1, ATLAS2, HUB* | Local worktrees | No overlap found. |

## 10. MIG1 phased plan

- **MIG1.0** — this audit.
- **MIG1.1** — frontend-only DEV Interaction Lab: Data Duel + Stat Drop, each with a Pro Play and a Leaguecraft fixture, rendered inside the real `CanonicalArena`.
- **MIG1.2** — reveal/motion/sound polish in the Lab (existing SFX registry cues, beats); mobile pass (RMOB constraints).
- **MIG1.3** — adopt primitives inside `MasterySliceChallengeSurface` for `comparison_left_right` / `numeric` (pure refactor, no contract change, snapshot parity). Coordinate with F1.
- **MIG1.4** — first production content path decision (e.g. Pro Play facts as frozen Mastery-style children). Backend work only then.
- **Later** — structured answers (§8.1) only once Order Forge/Match Grid is proven in the Lab.

## 11. MIG1.1 exact scope

1. `src/lib/interaction-grammar/` with two pure primitives:
   - `DataDuel` — props: `prompt`, two `{ token, label, sublabel?, media? }` sides, optional `metricLabel`; emits `{ selected: token }`; reveal props `{ correctToken, values? }` supplied by caller.
   - `StatDrop` — props: `prompt`, `unit`, `min/max/step/decimals` (same shape as Mastery numeric constraints); emits `{ selected: number }`; reveal props `{ correctValue, displayValue }`.
   - Responses typed as a subset of `SegmentChoice` so a future ModuleRenderer maps them 1:1.
2. Fixtures (static TS): Pro Play (e.g. two players' career KDA; Faker games played) and Leaguecraft (e.g. two champions' base AD; an ability cooldown). Fixtures hold the answer only on the **reveal** side object, never inside primitive input props.
3. A lab-local `ModuleRenderer` + fixture-built `ArenaViewModel` driving `CanonicalArena`; local fake "grading" in the lab controller only (clearly lab-scoped).
4. DEV route `/dev/interaction-lab`, production-stripped via gate + conditional route + route test.
5. Toggle: primitive × domain × phase (open/submitted/revealed) × viewport.

Out of scope: backend, transport, registry entries, audio engine changes, analytics, Ranked/Daily/Mastery production files.

## 12. Likely files MIG1.1 touches

- `src/lib/interaction-grammar/{types.ts,DataDuel.tsx,StatDrop.tsx,index.ts}` + tests
- `src/lib/interaction-grammar/__fixtures__/{proPlay.ts,leaguecraft.ts}`
- `src/pages/dev/interaction-lab/{InteractionLab.tsx,labRenderer.tsx,labArenaView.ts}` + test
- `src/lib/interaction-grammar/featureGate.ts` (DEV gate)
- `src/App.tsx` (one lazy import + one gated `<Route>`), `src/App.interactionLabRoutes.test.ts`

## 13. Must NOT touch in MIG1.1

`src/pages/quiz-ranked/*`, `src/pages/quiz-daily-challenge/*`, `src/components/ranked-arena/*` (consume only), `src/lib/ranked-core/arenaView.ts`, `src/lib/ranked-core/modules/*` (incl. registry, MasterySliceChallengeSurface), `src/lib/ranked-public/*`, `src/lib/question-surface/*`, `src/lib/analytics/*`, `src/lib/audio/*` (use existing cues only), `src/lib/pro-play/*`, `src/features/mastery/*`, `Layout`/`GlobalHud`/nav files, entire backend repo.

## 14. Test / QA expectations

- Vitest: primitives emit the correct `SegmentChoice` shape; primitive props types contain no answer fields pre-reveal; same component renders both fixtures with zero domain branching (grep test: no "Faker"/champion names in `interaction-grammar/*.tsx`).
- Route test: Lab route absent when gate is false (mirror `App.teamSimRoutes.test.ts`).
- Lab test: renders inside `CanonicalArena`; no `track` calls (spy).
- `npm run lint`, `npm test`, `npm run build` green.
- Manual: 375×812 and desktop screenshots for each primitive × domain × phase.

## 15. Open questions (genuinely unresolved)

1. Production home for Pro Play interactions: publish through `mastery_slice` children (preferred by reuse) or retire the standalone Pro Play quiz into Ranked? Decide at MIG1.4.
2. Should Stat Drop ever score closeness? Would require a new module grading policy; product decision.
3. F1 sign-off: will the G-series accept MIG primitives as the `interactionAdapters` implementation?

## 16. Recommended branch / worktree for MIG1.1

Branch `mig1/1-interaction-lab` from `origin/main`, worktree `mogsy/.worktrees/mig1-1-interaction-lab`. Frontend only.
