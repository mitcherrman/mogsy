# Pro Play Quiz × Canonical Arena handoff

- **PPQ1** (sections 0–15 below): research and design audit; changed no product code.
- **PPQ2-A** (the section immediately below): the neutral question seam in `CanonicalArena`, now implemented on branch `ppq2a/neutral-question-seam`. **It supersedes the §5 sketch where they differ.**

---

## PPQ2-A — Neutral question seam (IMPLEMENTED)

| | |
|---|---|
| Base | origin/main `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` |
| Branch | `ppq2a/neutral-question-seam` (worktree `C:\Users\mlmit\mogzy-wt\ppq2a-frontend`), unpushed, not merged |
| Scope | Arena architecture only. `ProPlayQuiz` is untouched; no answer or reveal behaviour changed; no fake Ranked state |

### A1. Previous coupling

- **The centre surface.** `ArenaSurfaceView` was a single interface whose `publicRound: PublicRoundView` was required. That is a full Ranked match envelope: matchId, players, winner, segment, scoring.
- **The only way into the stage** was `renderer.Viewport(ModuleViewportProps)`, which is also fed from a public round.
- **The report snapshot** read `publicRound.question/matchId/activeRound`.
- **Consequence:** a mode with no Ranked match could only reach the stage by fabricating a round.

### A2. Final seam type (`src/lib/ranked-core/arenaView.ts`)

```ts
export type ArenaSurfaceView = ArenaModuleSurface | ArenaQuestionSurface;

export interface ArenaModuleSurface {      // the previous interface, renamed
  kind?: "module";                         // absent = this member → every existing producer unchanged
  renderer: ModuleRenderer | null; publicRound: PublicRoundView; segmentState; selection;
  permissions; actions; skewMs; entryPresentationMs?; reveal; onSelect; ownsSubmission;
  inputOpen; hasContent; feedback?; surfaceVerdict?; surfaceSettings?;
}

export interface ArenaQuestionSurface {
  kind: "question";
  question: QuestionView;                  // neutral: questionId, prompt, options[{id,index,label,media?}], category
  selectedOptionId: string | null;
  permissions: InteractionPermissions;     // externally supplied gating; never widened
  onSelectOption: (option: AnswerOptionView) => void;
  reveal: SurfaceReveal | null;            // backend-authoritative; null until graded, always
  inputOpen: boolean;
  reportRef?: QuestionReportRef | null;    // { sessionId, questionNumber } for the question reporter
}
```

**What it deliberately has no field for:** a match, a player, a round, a segment, a winner, a score, a rating or a clock. A source guard test fails if one is added.

### A3. How `CanonicalArena` uses it (the only consumer)

- **Resolved once:** `questionSurface` / `moduleSurface` / `ownsSubmission` (`ownsSubmission` is true only for a module that declares it).
- **The stage.** It is the same `ranked-question` section, `ranked-folio ranked-question-stage` classes, wrappers and `QuestionResultOverlay`. The only member-specific line is the child:
  - the question member → `<InteractiveScenarioSurface variant="competitive" scenarioSource={null} …>`, the same component the `quiz` module viewport mounts;
  - the module member → `<Viewport …>`, with props byte-for-byte as before.
- **Module-only paths:** the fail-closed "unsupported module" panel and `ownsResultReveal`.
- **Report.** The arena stays the single publisher: `questionSurfaceReportSnapshot` (new, in `reportSnapshot.ts`), under the same answer rule (`canonicalAnswer` only when `reveal.revealed`). It carries `sessionId` and `roundNumber` from `reportRef`, and no matchId.
- **Panel flanks.** A `panel` flank is a **desktop flank**: below `lg` its cell is `hidden lg:block`, the same rule duel banners get on a phone. Combatant flanks are unchanged.
- **Phone frame.** `ArenaShell` gains `phoneStacked`. `CanonicalArena` sets it only when the arena is not the duel composition **and** a flank is a `panel`. Its one CSS rule (inside the existing `max-width: 1023.98px` block) clears the frame glow's −4px bleed, mirroring the existing `data-phone-arena` rule.
- **Probe page frame.** `Layout` lists `/dev/arena-question-probe` as full-bleed, so the probe measures the arena's own footprint. **PPQ2-B must add the Pro Play arena route the same way**; it is what Ranked's routes have.

### A4. Why no fake Ranked state is required

The question member's input is exactly what the canonical question surface consumes: a `QuestionView` plus a `SurfaceReveal`. Everything else the arena needs already has a neutral form:

| Arena part | Neutral form |
|---|---|
| Flanks | `{kind:"panel"}` |
| Header | `ArenaHeaderView` with `timer:null` and `centralResult:null`, so no clock and no result display |
| Result beats | `roundBeat`, `segmentBeat` and `cardBeat` all `null` |
| Timeline | `projectRoundTimeline({totalRounds, outcomes, settlements: [], viewerSlot: "p1"})`. The finite-plan, mode-stated-verdict path ARENA1 built for solo modes. `viewerSlot` is inert with no settlements. |
| Ability HUD | `abilityHud:null` |
| End screen | `terminal` not used (completion is out of scope) |

### A5. Phone and panel-flank behaviour

- **No duel composition.** Below `lg` a question arena with panel flanks is not `mobileDuel`: no `data-phone-arena`, no `MobileMatchBar`, no `MobileBottomBar`.
- **What shows on a phone:**
  - the header strip (eyebrow plus title);
  - the stage, stacked;
  - the timeline;
  - the shell's `--mogzy-dock-clearance` padding, with the app dock's floating Report pill serving the report control.
- **Panels are hidden** below `lg`.
- Measured at 375 and 390: no flank visible, no duel bar, no combatant, all tablets in the viewport, no document x-overflow (it was 379/375 before the `phoneStacked` rule), no nested scroller, no stage clip.
- **Pre-existing, unchanged:**
  - Every non-duel `ArenaShell` (for example the Ranked end screen) still overflows 4px on phones on base (379/375).
  - At exactly 1024×768 every full-bleed arena, Ranked included, is 1028px wide (frame bleed plus timeline buffer node).
  - Both are left as is so existing output stays identical.

### A6. Invariants (encoded in `CanonicalArena.questionSurface.test.tsx`)

1. A question surface renders inside the one stage section, with folio and footprint classes and the three `data-surface-region`s.
2. Options are drawn in the given order. `onSelectOption` receives the chosen option, and nothing else is submitted.
3. No `publicRound` and no `renderer` on the member; no fail-closed panel; no combatant, HP or score testids.
4. No duel phone composition. Panel cells are `hidden lg:block`. The frame carries `data-phone-stacked`, and its CSS sits in the phone query.
5. No clock, no central result, and an empty record window.
6. The timeline shows 10 positions with the mode's verdicts.
7. `reveal` is null in `pre` and `selected`, and no tablet reads `correct` before grading. Tablets resolve only from the server's reveal.
8. The report snapshot has no canonical answer before the reveal, the answer after it, `sessionId` and `roundNumber`, and no `matchId`.
9. Source guards:
   - `CanonicalArena` names no mode (no "pro play");
   - both members end in `<InteractiveScenarioSurface`;
   - `ArenaQuestionSurface` carries no `publicRound`/`segmentState`/`renderer`/`matchId`/`players`/`skewMs`/`actions`/`winner`;
   - `@ts-expect-error` proves that a `publicRound` on the member fails typecheck.

### A7. Non-regression evidence

Artifacts are in `docs/handoffs/ppq2a/`: `existing-callers-diff.json`, `control-base-vs-base.json`, `probe.json`, the probe screenshots, and the `ppq2a-cert.cjs` script.

**Existing callers: base `d528bf9f` (5241) vs branch (5242), same browser.**
- **Setup.** Clock frozen with `page.clock.setFixedTime`, animations frozen. Each page was full-page screenshotted and given a DOM signature: tag, testid and class of every element under the arena root.
- **States (12):**
  - Ranked: `short`, `opts4`, `media`, `family`, `points=6:11-8`, `metareflex`, `orderforge`, `masteryRecall`, `end=victory`;
  - Daily-hosted: `host=daily&ruleset=standard`;
  - Journey: `/dev/journey-arena?capture=zed&step=6`, with host ranked and daily.
- **Viewports (5):** 375×812, 390×844, 1024×768, 1280×800, 1440×900.

| Check | Result |
|---|---|
| DOM signature | **identical in 60/60** (element count, testids and classes, in order) |
| Screenshot size | identical in 60/60 |
| Pixels (>24/255) | identical in 44/60, including **every Daily and Journey state** |
| Remaining 16 | Only three noise classes: the Rules-dock mascot sprite (a 195-pixel box at 1165,739 / 1325,839), the Friends button (about 1,050 pixels at 24,652, Supabase-dependent), and scattered text anti-aliasing (4–78 pixels) |

**Control: base vs base on the same 9 Ranked states, 45 rows.**
- DOM identical in 45/45; pixels identical in 31/45.
- The **same** noise classes appear at the same coordinates (mascot 195 px, Friends 1,050 px, anti-aliasing 12–18 px).
- So every base→branch pixel delta is within base's own run-to-run variance.

**Neutral surface: `/dev/arena-question-probe`.** 8 states × 5 viewports on the branch.
- **States:** 2/3/4 options; short and long prompts (150-character stem) and labels; pre, selected, revealed-correct and revealed-wrong; panel and empty flanks.
- **Desktop footprint:** the stage box equals Ranked `opts4` exactly:

| Viewport | x | width |
|---|---|---|
| 1024 | 250.6 | 522.7 |
| 1280 | 326.8 | 626.4 |
| 1440 | 406.8 | 626.4 |

  Height differs only because Ranked mounts its ability dock.
- **Clean on all 40 states:** 0 stage clip, 0 nested scrollers, 0 tablet clipping, 0 page errors.
- **Last tablet in the viewport** in every state at every size (worst case: 4 long options at 375, bottom 687/812).
- **Phone (375/390):** no `data-phone-arena`, no duel bar, no bottom bar, no combatant, flanks hidden, header visible, 0 x-overflow.
- **1024 x-overflow:** reported in all states and identical to Ranked base (1028/1024, pre-existing; see A5).

**Suites: clean sequential runs, identical file list, `--maxWorkers=4`.** Covered: ranked-arena, ranked-core, quiz-ranked, ranked-shell-probe, journey-arena, quiz-daily-challenge, daily-challenge, journey, question-surface, feedback, report, pro-play.

| | Files | Tests | Failed |
|---|---|---|---|
| base | 224 | 3,219 | 17 (7 files) |
| branch | 225 | 3,240 | 17 (7 files) |

- **Failure sets are identical.** No test fails on the branch that passes on base, or the reverse.
- The branch's +21 tests are the new suite.
- The 17 are pre-existing environment failures in this CRLF checkout:
  - source guards matching `\n` (`QuestionMotifLayer.qf1`, `AnswerGrid.elimination`, `CanonicalArena.boundary` academy, `DailyOnCanonicalArena.boundary` ×2, `QuestionStageGeometry` ×4, `masterySliceModule.visualLanguage` ×2);
  - `lib/feedback/contract` ×5, which reads SQL migrations.
- Unhandled errors: only the known `[vitest-worker] Timeout calling "onTaskUpdate"` (base 7, branch 6) plus one identical TypeError in both runs.

**Typecheck** (`tsc -p tsconfig.app.json --noEmit`): base and branch both report the same 2 pre-existing errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`), with none added.

**Build** (`vite build`): base and branch both succeed with the same 9 chunk-size warnings. The probe's code is absent from the production bundle (no `questionProbeView`, probe copy or probe panel). The only trace is the route string in `Layout`'s full-bleed comparison.

### A8. Files changed

| File | Change |
|---|---|
| `src/lib/ranked-core/arenaView.ts` | union, `ArenaModuleSurface` (renamed, `kind?`), `ArenaQuestionSurface`, `QuestionReportRef` |
| `src/lib/ranked-core/reportSnapshot.ts` | `questionSurfaceReportSnapshot` |
| `src/components/ranked-arena/CanonicalArena.tsx` | member resolution, question child, report branch, panel-flank phone rule, `phoneStacked` |
| `src/components/ranked-arena/ArenaShell.tsx` | optional `phoneStacked` → `data-phone-stacked` |
| `src/index.css` | one rule: `.ranked-academy[data-phone-stacked="true"]::before { inset: 0 }` in the phone query |
| `src/components/Layout.tsx` | probe route in the full-bleed list |
| `src/App.tsx` | DEV-only `/dev/arena-question-probe` route (`import.meta.env.DEV`, like `/dev/lobby-preview`) |
| `src/pages/dev/arena-question-probe/{questionProbeView.ts, ArenaQuestionProbe.tsx}` | synthetic probe view and page (new) |
| `src/components/ranked-arena/CanonicalArena.questionSurface.test.tsx` | new suite (21 tests) |
| `src/components/ranked-arena/CanonicalArena.rm1Integration.test.tsx` | type-only: narrows its surface spread to `ArenaModuleSurface` |
| `src/pages/quiz-ranked/QuizRankedMatch.geometry.test.tsx` | the two HUD-row source guards now assert the resolved local (`const ownsSubmission = moduleSurface?.ownsSubmission === true;` and `{!ownsSubmission && (`); the "not gated on progression" checks are kept |

### A9. Exact contract PPQ2-B should consume

PPQ2-B builds `projectProPlayArena(state) → ArenaViewModel` and passes it to `<CanonicalArena view={…} chrome={…} />`:

```ts
{
  report: { mode: "Pro Play Quiz", category: "Leaguecraft" },
  header: { eyebrow: "Pro Play Quiz", title: `Question ${q.number} / ${q.total}`,
            transitionNote: null, playtestNote: null, presenceNote: null,
            timer: null, timerLabel: "" },
  roundBeat: null, segmentBeat: null, cardBeat: null,
  left:  { kind: "panel", node: <ProPlayDossierPanel/> },   // desktop only
  right: { kind: "panel", node: <ProPlayRunPanel/> },        // desktop only
  surface: {
    kind: "question",
    question: { questionId: q.question_id, prompt: q.question_text, category: q.topic,
                options: q.choices.map((label, index) => ({ id: String(index), index, label })) },
    selectedOptionId,                                   // index string of the locked choice
    permissions: answered || busy ? NO_INTERACTIONS : { ...NO_INTERACTIONS, canSelectAnswer: true },
    onSelectOption: (o) => answer(q.choices[o.index]),  // the API still takes the label
    reveal: result ? { revealed: true, isCorrect: result.is_correct,
                       correctOptionId: String(q.choices.indexOf(result.correct_answer)),
                       explanation: null } : null,      // null until the server graded
    inputOpen: !result && !busy,
    reportRef: { sessionId: session.session_id, questionNumber: q.number },
  },
  abilityHud: null, status: error ? { text: error, isError: true } : null,
  hudAction: result ? <NextButton/> : null,
  timeline: projectRoundTimeline({ roundNumber: q.number, completedRounds: session.answered,
    segmentRoundNumber: q.number, settlements: [], viewerSlot: "p1",
    totalRounds: session.total, outcomes /* Map<number, "correct"|"incorrect"> from received results */ }),
  revealHold: false, progressionEnabled: false,
}
```

Notes for PPQ2-B:
- Remove `ProPlayQuiz`'s own `usePublishReportableQuestion`; the arena publishes.
- Option media for champion options can ride `AnswerOptionView.media` later.
- Pro Play presentation slots (anchor plate, identity rows, on-tablet evidence) are **not** in this seam. Add them in PPQ2-C as additive, absent-for-everyone props, the way JP4 added `promptNode`.
- Completion (a neutral end tone) is still an open owner question (Q3); no terminal was added.

---

# PPQ1 — Pro Play Quiz × Canonical Arena: architecture and premium-visual audit

Research and design only. **No product code was changed** in PPQ1.

| | |
|---|---|
| Frontend audited | `mitcherrman/mogsy` origin/main **`d528bf9fe87e22371ff3dacf4eeb2f58fe383a33`** (worktree `C:\Users\mlmit\mogzy-wt\ppq1-frontend`, detached) |
| Backend audited | `mitcherrman/League_Combat_Simulator` origin/master **`f3a164f15ef440530000cd50db68eb9f986974b1`** (worktree `C:\Users\mlmit\mogzy-wt\ppq1-backend`, detached) |
| Date | 2026-10-07 |
| Evidence | `docs/handoffs/ppq1-current/`: current-page captures of all 10 distinct frozen fixtures × 5 viewports, through mocked quiz endpoints (no production writes), plus `probe.json` and the capture script |

---

## 0. Objective

Move the existing Pro Play quiz (`/lol/pro-play/quiz`) into Mogzy's **one canonical Ranked Arena** without inventing match, opponent, HP or ELO semantics. Use Mastery Journey's strongest visual ideas where they are semantically honest, and make the backend's statistical evidence the premium reveal.

## 1. Two pre-existing answer-safety defects (P0, backend, already live)

Both were found during this audit. Both are **independent of the Arena move** and should be fixed before (or with) PPQ2.

### 1a. Pairwise stems name the correct answer first — always

- **Root cause.** Every pair picker takes `(ranked[i], ranked[i+d])` from a list ordered `ORDER BY {metric} DESC`:
  - ranking queries: `pro_authority/reader.py:66, :144, :211, :569, :590`;
  - pair pickers: `question_family.py:157-167`, `player_champion_question_family.py:392-399, :441-447`, `team_champion_question_family.py:365-372, :413-420`.
  - `_gap_ok` demands a strict gap, and no metric is lower-is-better, so `a` is always the answer.
- **Where it leaks.** Every pairwise stem is written `"{a} or {b}"`: `question_family.py:235-236`, `pcqf.py:567-570, :700-703`, `tcqf.py:516-519, :647-650`.
  - Only `choices` is shuffled (`rng_for(question_key)`).
  - The session serves `question_text` verbatim (`on_demand.py:857`, `pro_play/quiz_session.py:136`).
- **Observed in the frozen fixtures.** 5 of 5 distinct pairwise questions name the answer first:
  - "Weiwei or H4cker" → Weiwei
  - "Azir or Ahri" → Azir
  - "Splyce or Fnatic" → Splyce
  - "Viktor or Jarvan IV" → Viktor
  - "Nuguri or Clear" → Nuguri
- **Stored rows carry it too.** `pro_champion_scope_comparison` and `pro_player_champion_comparison` are orchestrated bulk families writing the same stems into `quiz_questions` (`quiz/generator_registry.py:571-587`). A fix needs a rebuild of those pairwise rows.
- **No test covers stem order**, and the `quiz_session.py:139-145` comment claims "no ordering".
- **The frontend cannot mitigate it.** The stem is server-authored and the product rule forbids rewriting it.
- **Fix (owner-gated backend change).** Build the stem from the shuffled order (or a seeded independent shuffle). Add a test asserting the stem's first-named option does not equal the answer at better than chance over the corpus. Rebuild the stored pairwise rows.

### 1b. The answer endpoint is not idempotent

- **The defect.** `POST /quiz/sessions/{id}/answer` carries no question id. It grades `session.current()` and serves the next question in the same response (`quiz_session.py:412-430`, `routes/pro_play.py:109-140`).
- **How it bites.** A lost response plus a retry grades the **next, unseen** question with the stale selection. The current page invites exactly this: on a network error it clears the selection and re-enables the options (`ProPlayQuiz.tsx:101-104`).
- **Related loss.** If the next draw fails after grading, the endpoint 503s and the graded reveal is lost.
- **Fix (owner-gated).**
  - Accept `question_id` in the answer body and reject a mismatch with a typed 409.
  - Return the stored result for a repeat answer to an already-graded id.
  - Return the result even when the next draw fails, with `question:null` plus a retryable `next_error`.
  - The Arena controller then resyncs via `GET /quiz/sessions/{id}` on any transport error and never blind-retries.

Also noted, lower priority:
- Explanations carry internal copy ("(authority revision 1 / 2)") and round to `.0%`, while evidence uses `.1%` (`question_family.py:126-129`).
- Sessions live in one process's memory (TTL 3600 s, cap 2000) and are lost on restart.

---

## 2. Verified current architecture

### 2.1 Lifecycle (backend `routes/pro_play.py`, prefix `/api/pro-play`; guest-open)

| Call | Behaviour |
|---|---|
| `POST /quiz/sessions` | Create the session (`secrets.token_urlsafe(16)`, `SESSION_LENGTH=10`) and serve question 1 |
| `GET /quiz/sessions/{id}` | Re-serve the pending question, or draw the next, or `question:null` plus summary when complete |
| `POST /quiz/sessions/{id}/answer` `{selected_answer}` | Grade against the frozen instance, then return `result` plus the next question in one response |

- Errors: `{detail:{code,message}}` with `PP_SESSION_NOT_FOUND 404`, `PP_SESSION_COMPLETE 409`, `PP_NOTHING_TO_ANSWER 409`, `PP_NO_QUESTION_AVAILABLE 503`, `PP_AUTHORITY_UNAVAILABLE 503`.
- End of session: `session{session_id,total,answered,score,complete}` only. No per-question history is persisted.
- Play again is a new POST.

### 2.2 Grading authority

Grading is server-side only: an exact match against the frozen `instance.answer` (`on_demand.py:190-194`). The client receives `correct_answer` only in `result`. The frontend holds no key and no scoring (`ProPlayQuiz.tsx:21-33`).

### 2.3 Pre-answer contract (what a pre-answer surface may draw)

`question`: `index, number, total, topic ("Champion"|"Player"|"Team"), question_id (sha256[:16], opaque), question_text, choices (shuffled), presentation, context`.

- **`context`** (`question_context.py:238-258`, guarded by `assert_pre_reveal_safe` and `assert_symmetric`):
  - `relationship{id,label,anchor_entity,subject_entity}`
  - `scope_tags[{id,type,label,tooltip,priority}]`
  - `metric{id,label,kind,tooltip}`
  - `editorial_tags[]`
  - `anchor`
  - `subjects[]` in the same shuffled order as `choices`
- **Player subject or anchor:** `label, id, role{id,label,tooltip}, seasons{first,last,label}, teams[≤4]{label,short,region,seasons}, teams_total, media{kind:"player",key:null}`.
- **Team subject or anchor:** `label, id, short, region, seasons, leagues[]{label,tooltip}, leagues_total, media{kind:"team",key:null}`.
- **Champion subject or anchor:** `label, id, media{kind:"champion", key:<manifest key>}`.
- **Scope anchor:** `label, id, media{kind:"scope", key:null}`.
- **`presentation`:** `shape, metric, candidates` (= `choices` order), plus `scope_key/league_slug/tournament_id/patch`, or `scope_label/player_display|team_display/champion_key`.
  - It is not an answer leak, but it is legacy. **The Arena must not read it.**

### 2.4 Post-answer contract

`result`: `is_correct, selected_answer, correct_answer, explanation, reveal (legacy), evidence`.

- **`evidence`** (`question_context.py:538-564`): `metric{…}, form ("pairwise"|"ranking"), scope_label, correct_label, subjects[], authority{revision,revisions,metric_definition_version,policy_version}`.
- **Per-subject fields by metric** (all carry `label` and server-formatted `display`):

| metric | fields |
|---|---|
| win_rate | games, wins, losses, win_rate |
| games_played / wins | games, wins |
| champion_share | games, total_games_in_scope, champion_share |
| picks | picks, games_picked, scope_games |
| bans | bans, games_banned, scope_games |
| presence | picks, bans, presence, scope_games |

- **No rank positions are served.** Subjects stay in shuffled option order.
- **No KDA exists.**

### 2.5 Families, relationships, shapes, choice counts, metrics

| relationship | family | pairwise (2 choices) metrics | ranking (3–4 choices) metrics |
|---|---|---|---|
| `scope_champion` | `pro_champion_scope_comparison` | picks, bans*, presence | picks, bans*, presence |
| `player_champion` | `pro_player_champion_comparison` | games_played, wins, win_rate, champion_share | games_played, wins |
| `champion_player` | same | games_played, wins, win_rate | games_played |
| `team_champion` | `pro_team_champion_comparison` | games_played, wins, win_rate | games_played, wins |
| `champion_team` | same | games_played, wins, win_rate | games_played |

\* Bans only when ban coverage is complete.

- **Ranking size:** the top 4; minimum 3 eligible, else the shape is skipped (`ranking_choice_count=4`, `min_candidates_for_ranking=3`).
- **Session mix:** families rotate 4/3/3 per 10; three slots prefer `recent` content.

### 2.6 Scopes (`scope_tags.type`)

`league | pro_play ("ALL PRO PLAY") | tournament | year | patch | all_time`.

- Champion-scope questions are always bounded: a league or tournament on one patch.
- Entity questions run all-time, season or tournament windows.
- `recent_esports` is an editorial tag. All three families are recent-capable (`on_demand.py:82`). The `question_context.py:374` docstring saying otherwise is stale.

### 2.7 Media (verified)

- **Champions:** every champion subject and champion anchor has a manifest key, resolved through `useChampionAssets` (`getChampionLoading`/`getChampionSplash`/`getChampionIcon`).
- **Players, teams, leagues and scopes:** `key:null` by contract.
- **The `/api/pro-play/media/*` authority exists** (public; `routes/pro_play_media.py`) but needs canonical lp_page or team keys. The quiz sends only **opaque 16-hex ids**, so **player portraits and team logos cannot be resolved from quiz data today**. That would be a backend contract change (an owner gate).

### 2.8 Current frontend presentation

- **Page:** `ProPlayQuiz.tsx`, a `max-w-2xl` page with no Arena.
- **Card:** `ProPlayQuestionCard` composes these parts, in order:
  - `ProPlayChampionAnchor`: loading-art band, champion anchors only;
  - `ProPlayContextRail`: wrapped chips — relationship, scopes, metric, editorial;
  - the verbatim stem;
  - `ProPlaySubjectCards`: symmetric player/team identity cards only, with a 2×2 grid for rankings;
  - `QuizAnswerOptions`: text only, **no `optionMedia`**.
- **Reveal:** `QuizAnswerFeedback`, then `ProPlayEvidence` (generic per-metric, `display` verbatim, `data-correct` mark), then Next or See results.
- **Summary:** a plain card with "Play again".
- **Report:** published by the page itself (`ProPlayQuiz.tsx:49-63`, `sessionId` plus `roundNumber`; the answer only after `result`).

Measured weaknesses (`docs/handoffs/ppq1-current/probe.json`):

1. **4-way champion→player and champion→team rankings put the 4th answer below the fold:**
   - `flex`: last choice bottom 920 px at 1024×768, 922 px at 375×812;
   - `t1_lineage`: 915 and 883 px.
   - Cause: a 242 px anchor band plus a 224–252 px 2×2 card grid stacked above the options. **Identity cards and option buttons repeat the same names.**
2. **Player, team and scope anchors render no anchor at all.** The rich anchor card the server sends (for example Zeka · MID · 2025 · HLE) is dropped, and champion options show no art although every champion has a key.
3. **The ranking reveal stacks to 389 px** under the options, and the verdict and explanation repeat the evidence numbers.
4. No horizontal overflow at any size.

---

## 3. Verified Arena seams and coupling

**Production callers.** `CanonicalArena` has exactly **one** production caller: `QuizRankedMatch` (`:1043, 1119, 1308, 1723`). Daily and Journey are **not** independent callers:
- Daily stages are real backend Ranked matches hosted through `MatchHost` (`DailyRunPage.tsx:40-51`).
- Journey is the `mastery_slice` segment module inside a Ranked or Daily match.
- `/dev/journey-arena` is the only direct non-`QuizRankedMatch` mount. It replays **real captured** `PublicRoundView`s and fabricates rails and header for dev only.
- The "Tutorial" mentioned in `arenaView.ts` comments does not exist on main.

### Mode-neutral (reusable as-is)

- `ArenaShell` and the `.ranked-academy` skin.
- `.ranked-folio` and the navy tablets.
- The stage section with its three-region geometry (`.ranked-question-stage`, `index.css:2518-2660`).
- `InteractiveScenarioSurface` / `AnswerGrid` / `QuizAnswerOptions` (with `optionMedia`).
- `CentralStage`, with `timer:null` meaning it is not mounted.
- `RoundTimeline` via `projectRoundTimeline({totalRounds, outcomes})`. Its `outcomes` path was built for solo modes (`roundTimeline.ts:306-317`).
- `QuestionResultOverlay` with a viewer-only `resultFeedback`.
- `CardResultBeat`.
- The slots `chrome`, `guidance`, `status`, `hudAction`, `outro`, `warning`.
- `ArenaRail {kind:"panel"}`: real, but **unused anywhere** (`arenaView.ts:54`).

### Tied to Ranked transport (blockers)

| Coupling | Where | Consequence for solo Pro Play |
|---|---|---|
| `ArenaSurfaceView.publicRound: PublicRoundView` **required, non-null** | `arenaView.ts:239` | The centre viewport can only be fed a full match envelope: matchId, matchStatus, players, winnerId, activeRound, segment, scoring and presence (`ranked-public/contracts.ts:773-840`). |
| `ModuleViewportProps.publicRound`, `segmentState`, `actions.submitChallenge(challengeIndex, SegmentChoice)`, `skewMs` | `modules/types.ts:58-126` | Every module renderer, `quizModule` included, is fed from a Ranked round. |
| `rendererForSegment(publicRound.segment)`, with the "unsupported module" fallback copy | `registry.ts:62-65`, `CanonicalArena.tsx:746-757` | Keyed on the Ranked segment. |
| `arenaReportSnapshot` reads `publicRound.question`, `.matchId`, `.activeRound.roundNumber` | `reportSnapshot.ts:51-88` | No session slot. |
| `roundBeat` → `RoundResultBeat` reads `players.p1/p2` and the opponent outcome; damage copy | `RoundResultBeat.tsx:307-355`, `resultKind.ts:19-25` | A solo mode must pass `roundBeat:null`. |
| `ArenaTerminalView.result: "victory"\|"defeat"\|"draw"` and `player: CombatantView` (hp, xp, classId…) required | `arenaView.ts:431-433`, `MatchOverFrame.tsx` | A 7/10 quiz is none of the three results. `identity`/`summary`/`heading` slots exist; `opponent` is already optional. |
| `RevealPanel` (terminal reveal): opponent column plus HP audit | `RevealPanel.tsx:166-203` | Pass null. |
| Phone one-screen composition (`MobileMatchBar`, `data-phone-arena`, `MobileBottomBar` incl. the phone Report tab) only when **both** rails are combatant banners | `CanonicalArena.tsx:253-254, 538-541`; `index.css:15620-15624` | Panel rails fall back to the desktop header strip plus a `grid-cols-2` rail row above the stage on phones. That path is **exercised by no production mode today** and must be certified. |
| CentralStage default copy "of M:SS shared round" / "Time's up" | `CentralStage.tsx:169, 276-278` | Irrelevant if `timer:null`. Pro Play is untimed. |

**Fabricating a Ranked round is not an intended seam.** The only fabrications are a dev harness (with real captures) and unit tests (`publicRound: null as never`). Building a fake `PublicRoundView` for production would invent matchId, players, winner and scoring: **rejected**.

---

## 4. Journey primitives (classification)

Sources: `masterySliceModule.tsx`, `MasterySliceChallengeSurface.tsx`, `components/journey/*`, `JOURNEY_PRESENTATION_V1_HANDOFF.md`, `JOURNEY_KNOWLEDGE_UI_V1_HANDOFF.md`, `docs/RANKED_MASTERY_SLICE_HANDOFF.md`. Captures viewed: `docs/handoffs/jp-integration/jpint-zed-ahri-step4-reveal-{1280,390}.jpg`, `docs/handoffs/journey-presentation-v1/1440-matchup.jpg`, `docs/handoffs/jp5-equation-unfold/r9/board-after-{1440,375}-*.png`, `docs/handoffs/jp4-reasoning-language/jp4-final-desktop1440-step4-live.jpg`.

Premise corrections:
- `JourneyFocusMedia.tsx` was deleted in JP2 (`a5180a0f`).
- There is no `JourneyRail` component; `lib/journey/rail.ts` is a data projection drawn by `JourneyCrest`.

| Tier | Components |
|---|---|
| **1. Reusable as-is** | `ScenarioMediaBand` (media region container); `RoleEmblem` / `QuestionRoleEmblems` (`backed` on parchment; canonical role SVGs); `roleIdentityFor` accents; `.ranked-folio` + navy tablets (free inside `.ranked-academy`); `useChampionAssets` getters |
| **2. Presentation primitive (lift, rename out of `journey-*` scope)** | `JourneyPair` (two-row value comparison; reads no Journey state); `JourneyMagnitude`; the `ExactWorking` black-glass popover (`.journey-know-pop`); the `--jp3-corner` gold corner-bracket recipe (`index.css:17172-17194`); the `SideArt` loading→splash→fallback art pattern (`JourneyStateBoard.tsx:120-136`); `useFittedQuestion` (largest font that fits a fixed box); the `JourneyPath`-style self-fitting eyebrow |
| **3. Visual inspiration only** | The dark board plate: navy-black gradient, gold top glow, champion loading art at the outer edges fading to a centre seam with a VS medallion, gold-hairline seam on phones. The persistent media plate above a keyed question region. Crest box reservation. The JP1 focus plate (splash halves plus VS plus metric label, `docs/handoffs/journey-presentation-v1/1440-matchup.jpg`). |
| **4. Journey-specific: do NOT reuse** | `JourneyStateBoard` as a whole (levels, ranks, items, attacker/target); `JourneyModuleStage` beat gate; `masterySliceModule` dispatch; knowledge marks, `JourneyStateSheet`, transition beats, portrait popups, rank pips, inventory slots, `StatChip`; Journey crests (show level and ability ranks); the reasoning *chain* semantics (formula steps). Pro Play has no derivation chain, only two to four served values. |

---

## 5. Architecture options

| | **1. Typed question surface in CanonicalArena** (recommended) | 2. Pro Play ModuleRenderer via fake `PublicRoundView` | 3. ArenaShell + primitives, no CanonicalArena | 4. Pro Play as a backend Ranked segment (Daily-style hosted match) |
|---|---|---|---|---|
| Idea | `ArenaSurfaceView` becomes a union: the existing module surface, or a `question` surface that renders the canonical `InteractiveScenarioSurface` directly from a `QuestionView` + `SurfaceReveal`, inside the same stage section | Wrap each Pro Play turn in a synthesized `PublicRoundView` and route through `quizModule` | Pro Play page composes `ArenaShell`, folio, `AnswerGrid` and timeline itself | Backend serves Pro Play as a `pro_play.v1` segment in a solo Ranked match |
| Files | `arenaView.ts`, `CanonicalArena.tsx` (surface branch at `:624-757`), `InteractiveScenarioSurface.tsx` (+`mediaNode`), `AnswerGrid`/`QuizAnswerOptions` (+positional `optionDetail`), `MatchOverFrame`/`ArenaTerminalView` (neutral end), new `lib/pro-play/arena/*`, new `components/pro-play/arena/*`, `ProPlayQuiz.tsx` | same + a fake-round factory | new page-level copies of the grid and stage | backend: match creation, segment, polling; frontend: module renderer |
| Data flow | Pro Play API → `projectProPlayArena(turn, result, outcomes)` → `ArenaViewModel{surface:{kind:"question"}}` → `CanonicalArena` → `InteractiveScenarioSurface` | API → fake round → `quizModule` | API → bespoke layout | Ranked poll loop |
| Duplication | none: one stage, one question surface, one tablet grid | low code, high semantic debt | **high**: a lookalike arena, the fork the design rule forbids | low frontend, large backend |
| Transport coupling | none: the surface variant has no match fields | **invents** matchId, players, winner, scoring | none | **adopts** Ranked transport, auth and deadlines for a self-paced guest quiz |
| Answer-safety risk | low: `reveal` is null until `result`, symmetric slots enforced by tests | medium: fake fields can be misread by future arena code as real | medium: no shared tests | low, but a rebuild |
| Ranked/Daily/Journey impact | additive: the module branch is byte-identical (`kind` defaults to module); new props absent for all existing callers, like JP4's `promptNode` | none, but pollutes types | none | shared backend risk |
| Responsive | inherits the certified stage geometry; the panel-rail phone path must be certified (§9) | same | re-derive everything | inherits |
| Testing | boundary + geometry tests extended; new Pro Play projection tests; real-fixture harness | must prove fakes are never read | full new matrix | large |
| Maintainability | **best**: one arena; future solo modes reuse the variant | worst: fiction in the type system | worst: drift | heavy |
| Verdict | **Selected** | **Rejected** (invented match semantics) | **Rejected** (lookalike copy) | **Rejected** (invents a match and an opponent; guest flow lost) |

### Selected design: the "question surface" variant

```
ArenaSurfaceView =
  | ArenaModuleSurface      // today's interface, `kind?: "module"` (absent = module → existing callers unchanged)
  | ArenaQuestionSurface {
      kind: "question";
      question: QuestionView;            // from a Pro Play → neutral question projection
      scenarioSource: null;              // Pro Play supplies its own media node instead
      selectedOptionId: string | null;
      permissions: InteractionPermissions;
      onSelectOption(option): void;
      reveal: SurfaceReveal | null;      // null until `result` exists — always
      inputOpen: boolean; hasContent: boolean;
      // presentation slots, all ReactNode/positional, all absent for every other caller:
      mediaNode?; promptNode?; context?; promptFooter?;
      optionDetail?: (ReactNode | null)[];   // pre-answer identity rows, length = options
      optionReveal?: (ReactNode | null)[];   // per-option evidence, rendered ONLY when reveal.revealed
      answerFooter?: ReactNode;              // reveal-only evidence footer / Next
    }
```

- **What the arena does.** It renders the variant inside the **same** `ranked-question` section, folio and body wrappers. Only the child differs: `InteractiveScenarioSurface` instead of `renderer.Viewport`. Geometry, no-inner-scroll and the result overlay are untouched.
- **What the Pro Play controller owns.** All transport (start, answer, resync), selection locking and per-question outcome recording. Outcomes are recorded only from results the client actually received; that is real state, not invented.
- **What it passes to the arena:**
  - `roundBeat/segmentBeat/cardBeat: null`, `abilityHud: null`, `timer: null`.
  - `timeline: projectRoundTimeline({totalRounds: session.total, outcomes})`.
  - `left/right: {kind:"panel"}`.
  - `report: null`, because Pro Play keeps publishing its own snapshot with `sessionId`.
  - A neutral terminal (below).
- **Terminal.** Add an end tone that is neither victory nor defeat (`result:"complete"`), and make `player` optional when `identity` is supplied (an extension of ARENA1 Step 5's optional `opponent`). The scoreline is `score / total` from the server summary.
  - The alternative is to keep the summary as a final `question`-variant state without `terminal`. **Owner decision Q3.**

---

## 6. Question-shape matrix and premium presentation

**Global layout (desktop ≥1024):**
- Left rail panel: **Question dossier.**
- Centre folio, with the three canonical regions:
  - **media** = anchor plate (yields first);
  - **prompt** = chip rail + verbatim stem;
  - **answers** = identity tablets.
- Right rail panel: **Your run.**
- Bottom: `RoundTimeline` with 10 nodes.

**Rails carry only real, answer-independent data:**
- **Left: Question dossier.**
  - The relationship label.
  - Each scope tag with its tooltip text shown in full (e.g. "LPL — Tencent LoL Pro League", "ALL TIME — Every season available in this scope").
  - The metric label and definition (`metric.tooltip`).
  - The `recent_esports` marker.
- **Right: Your run.**
  - Question `number / total`.
  - Server `score` / `answered`.
  - Per-question outcome pips from received results.
- **Never** an opponent, HP, ELO, damage or streak multiplier.
- On phones both rails are hidden. The score moves into the header strip and the dossier into the chip rail tooltips.

| Shape | Anchor plate (media region) | Options (answers region) | Pre-answer allowed | Reveal only | Phone fallback |
|---|---|---|---|---|---|
| **Champion → Player, 2** | Champion loading art (existing `ProPlayChampionAnchor` crop), dark plate, gold corner brackets | Two facing **identity tablets** A \| B: name, `RoleEmblem` + role label (FLEX = label, no glyph), years in scope, team short-codes with "+N". Replaces `ProPlaySubjectCards` (names no longer repeated). | Role, scoped years, scoped teams (contract identity) | Each tablet gains `display` plus support line; correct tablet ring; delta sentence = server explanation | Plate compacts to ~7.75 rem art strip; tablets stack 1-col with 2-line identity |
| **Champion → Player, 3/4** | Same champion plate | 2×2 identity tablets (3 → 2+1 with fixed slot sizes) | same | Per-tablet value; **positions never reorder**; no frontend rank numbers (server sends none) | 2×2 grid kept (current RQ measurement), identity trimmed to role + years; teams in tooltip |
| **Champion → Team, 2 / 3–4** | Champion plate | Team identity tablets: name, short + region, years, leagues chips; SKT T1 and T1 stay separate | same | same | same as above |
| **Player → Champion, 2** | **Player dossier plate** (no portrait exists): role emblem in a crest box, name, years, team short-codes, on the dark plate. Symmetric for every question of the shape because there is one anchor. | Two champion tablets with icons (`optionMedia`; all champions have keys). Media band may show **both champions' loading art facing**, VS medallion (Journey focus-plate inspiration) — both sides always drawn. | Champion art for all options | Values on tablets, share/games support line | Plate = one-line dossier strip; champion icons in tablets; facing art dropped |
| **Player → Champion, 3/4** | Player dossier plate | 2×2 champion tablets with icons; optional four-portrait line-up strip in the plate, lettered A–D | same | same | Line-up dropped; icons kept |
| **Team → Champion, 2 / 3–4** | **Team dossier plate**: short code monogram crest (no logo exists), name, region, years, leagues | Champion tablets with icons (as above) | same | same | as above |
| **Scope → Champion, 2 / 3–4** | **Competition plate**, typographic: competition label, year/patch chips; no art (scope media null). The long scope stem stays verbatim in the prompt region. | Champion tablets with icons; pairwise may use facing art | Champion art for all options | picks/bans/presence values with "of N scope games"; presence shows picks · bans | Plate becomes the chip rail only |

**Scope variants:**
- recent, tournament, patch and all-time are chips only (`scope_tags` order is the server's; never re-sort or re-filter).
- `recent_esports` gets the editorial chip plus a "Recent" ribbon on the plate.
- None changes the layout.

**Option media symmetry rule:** a slot is mounted for **every** option or none.
- Champion options: always mounted. A failed image keeps the fixed box (existing `OptionMediaIcon` behaviour).
- Player and team options: no art slot until the server supplies keys for **all** subjects of that question.
- Never show art for a subset.

### Premium reveal (§G): a new renderer over the same evidence contract

`ProPlayEvidence`'s logic is right: it is generic per metric, shows `display` verbatim, and its `supportLine` is metric-aware. But its layout (a separate stacked card under the options) is what costs 389 px.

Keep the contract and logic; move the rendering **onto the tablets**:

1. **Beat 1 (0 ms).**
   - The selected tablet locks.
   - The arena's `QuestionResultOverlay` stamps CORRECT/INCORRECT from a viewer-only `resultFeedback`.
   - The correct tablet gets the gold-green ring.
   - A wrong pick keeps its "Your pick" mark.
2. **Beat 2 (~250 ms, instant under reduced motion).** Each tablet unfolds its value row:
   - the `display` headline;
   - the `supportLine` (extracted verbatim from `ProPlayEvidence`);
   - a `JourneyPair`-style bar **only if the owner approves** a visual scale from server raw values (Q5). Text values alone are the default.
3. **Answer footer.**
   - `evidence.scope_label`.
   - The explanation (once the backend drops the "authority revision" tail, Q4).
   - The `authority` metadata behind an info disclosure (black-glass popover).
   - The **Next** / **See results** action, as the arena's `hudAction` or the answer footer.

Rules:
- No frontend arithmetic beyond composing the existing support line from present integer fields.
- No ranks.
- No re-sorting.
- The next question mounts only on Next (the server already delivered it in the answer response).

---

## 7. Answer-safety invariants (to encode as tests)

1. Pre-answer render reads only `question` (+ narrowed `context`). `result`, `evidence` and `reveal` are unreachable until an answer is graded, and `SurfaceReveal` stays null until then.
2. **Symmetry.** Every option tablet renders the same row set in the same order, with "—" for absent values. Media slots are all or none. No option gets richer pre-answer content because of any property.
3. Options render in server `choices` order and keep their positions through the reveal. There is no sort by value, ever.
4. The stem is rendered verbatim and never re-expanded or rewritten (BE fix 1a is the remedy for order).
5. Evidence `display` is shown verbatim. No statistic is recomputed. Support lines use only fields present.
6. The answer is submitted with `question_id` (after BE fix 1b). No blind retry; resync via GET on error.
7. The report snapshot includes `canonicalAnswer` only once `result` exists.
8. No `presentation.*`, family id, `scope_key` sentinel, or `reveal` (legacy) read anywhere in the Arena path.
9. Rails and header contain no opponent, HP, ELO, damage or match vocabulary. Extend the `DailyOnCanonicalArena.boundary` vocabulary scan to the Pro Play arena files.
10. The pairwise stem's first-named option equals the answer at chance rate (a backend corpus test after fix 1a).

---

## 8. Visual language: adopt vs avoid

- **Adopt (visual only):**
  - navy/gold Ranked Academy frame and `.ranked-folio` parchment;
  - the dark anchor plate with gold top glow;
  - gold corner brackets;
  - champion loading-art crops at the plate edge with a scrim;
  - a facing comparison with VS medallion (pairwise only, both sides always drawn);
  - gold hairline seams;
  - black-glass disclosure for metadata and authority;
  - `RoleEmblem` glyphs;
  - navy answer tablets with letter chips;
  - unfold motion for the value rows.
- **Avoid:**
  - Journey state board, attacker/target chips, levels, abilities, items;
  - "STEP n OF n" chains;
  - knowledge marks;
  - reasoning formula chains;
  - combatant banners with HP;
  - a VS treatment for 3–4-way rankings (there is no "versus" among four);
  - any portrait placeholder that looks like real player art.

---

## 9. Responsive and accessibility certification matrix

| Viewport | Expectation |
|---|---|
| 375×812, 390×844 | Panel rails hidden; header strip shows title plus `n/10` plus score; plate ≤ ~7.75 rem; 4 tablets in 2×2 with the 4th tablet bottom ≤ viewport height pre-answer for every fixture; reveal may grow the **page** (document scroll), never a nested scroller |
| 1024×768 | Stage reserve 16 + 8.125 + 10.375 rem; plate yields first; identity tablets fit the 166 px answers region (2 rows × ~3 lines) or take the dense tier; no stage clip |
| 1280×800, 1440×900 | Answers reserve 8 rem; facing art at full plate; the long scope stem (≈150 chars, `recent` fixture) seats in the 8.125 rem prompt region |
| All | No document x-scroll; no element with `overflow:auto` inside the stage (existing geometry source guard); long names truncate with `title`; wrapped scope chips (up to 5 incl. editorial) never push answers; keyboard: tablets are buttons with A–D order, chip tooltips focusable (existing `ProPlayTooltip`), Next focus-managed after reveal; touch targets ≥ 44 px; `prefers-reduced-motion` **and** `html.reduce-motion` disable unfold and VS motion (Journey's dual switch) |

**Known risk:** the non-`mobileDuel` phone path (panel rails) has no production user today. Certify it first: header strip height, empty rail row collapse, dock clearance, and the Report tab (phone Report lives in `MobileBottomBar`, which is mobileDuel-only).

---

## 10. Dev harness and certification plan (do not build yet)

**`/dev/pro-play-arena?fixture=<key>&state=pre|selected|reveal-correct|reveal-wrong|summary`**
- Production-gated: register under the same `import.meta.env.DEV` pattern as `LobbyPreviewPage`.
- Feeds the **real frozen payloads** (`PRO_PLAY_SAMPLES`) through the **production** `projectProPlayArena` and `CanonicalArena`. No transport, no invented values.

**Fixture coverage.** 10 distinct payloads exist:
- `champion_player`
- `player_champion`
- `team_champion`
- `champion_team`
- `scope_champion` (= `patch`)
- `recent` (= `tournament`)
- `flex`
- `pro_play`
- `nuguri_clear`
- `t1_lineage`

`multi_team` = `champion_player` and `all_time` = `player_champion` are duplicates. **Missing shapes**, to capture before certification:

| relationship | missing shape and metric |
|---|---|
| `team_champion` | pairwise |
| `player_champion` | ranking × wins |
| `champion_player` | pairwise × wins / games_played |
| `scope_champion` | presence (any) |
| any | a 3-choice ranking |

Capture via a backend script against the canonical DB with the same builders, as `nuguri_clear` was.

**Matrix and checks:**
- 14+ fixtures × 5 states × 7 widths (375, 390, 768, 1024, 1280, 1440, 1920).
- Probes per state:
  - last-tablet bottom vs viewport;
  - stage clip (`scrollHeight − clientHeight = 0`);
  - x-overflow;
  - broken images;
  - page errors;
  - text clipping in tablets;
  - a pre-answer leak scan (the existing `ProPlayQuestionCard.test` number scan, run on the rendered arena DOM);
  - symmetry (identical row count per tablet).
- **Non-regression.** `/dev/ranked-shell-probe` pixel diff at 1280×800 and 390×844 must stay at 0 pixels over threshold, proving the module branch is byte-identical.
- Capture tooling: reuse `docs/handoffs/ppq1-current/cap-current.cjs` (mocked quiz routes) for the live page.

---

## 11. Phased implementation plan

| Phase | Scope | Gate |
|---|---|---|
| **PPQ0 (backend)** | Fix 1a (stem order + rebuild stored pairwise rows + corpus test) and 1b (answer idempotency by `question_id`, result-preserving next-draw failure); strip "authority revision" from explanations | Owner approves the contract change; deploy BE first |
| **PPQ2-A** | Arena seam: `ArenaSurfaceView` union + `CanonicalArena` question branch + `InteractiveScenarioSurface.mediaNode` + positional `optionDetail`/`optionReveal` in `AnswerGrid`; neutral terminal tone; boundary tests proving Ranked/Daily/Journey byte-identical | Owner reviews the type change |
| **PPQ2-B** | `lib/pro-play/arena/projectProPlayArena.ts` (turn + result + outcomes → `ArenaViewModel`), `ProPlayArenaController` (start, answer with id, GET resync, outcomes), report publishing kept | Unit tests on all fixtures |
| **PPQ2-C** | Presentation: anchor plates (champion / player dossier / team dossier / competition), identity tablets, rails panels, chip rail restyle on parchment | Screenshots at 7 widths |
| **PPQ2-D** | Reveal: on-tablet evidence (reusing `supportLine`), answer footer, authority disclosure, motion + reduced motion | Owner screenshot review |
| **PPQ2-E** | `/dev/pro-play-arena` harness, missing-shape fixtures, full sweep + ranked-shell-probe non-regression; switch `/lol/pro-play/quiz` to the Arena | Certification |

## 12. Files likely involved

- **Frontend (modify):**
  - `src/lib/ranked-core/arenaView.ts`
  - `src/components/ranked-arena/CanonicalArena.tsx`
  - `src/components/question-surface/InteractiveScenarioSurface.tsx`
  - `src/components/ranked-arena/AnswerGrid.tsx`
  - `src/components/quiz/QuizAnswerOptions.tsx`
  - `src/components/ranked-arena/MatchOverFrame.tsx`
  - `src/pages/ProPlayQuiz.tsx`
  - `src/lib/pro-play/api.ts` (answer body)
  - `src/index.css` (scoped `.pro-play-arena *` rules only)
- **Frontend (new):**
  - `src/lib/pro-play/arena/*` (projection, controller hook)
  - `src/components/pro-play/arena/*` (plates, identity tablet rows, rail panels, reveal rows)
  - `src/pages/dev/pro-play-arena/*`
- **Reuse unchanged:**
  - `contract.ts`
  - `proPlaySamples.ts`
  - `ProPlayTooltip`
  - `ProPlayChampionAnchor` crop logic
  - `ProPlayEvidence.supportLine` (export it)
  - `RoleEmblem`
  - `useChampionAssets`
- **Backend:**
  - `pro_authority/question_family.py`
  - `player_champion_question_family.py`
  - `team_champion_question_family.py`
  - `pro_play/quiz_session.py`
  - `routes/pro_play.py`
  - tests

**Do NOT reuse:**
- `JourneyStateBoard`, `JourneyModuleStage`, `masterySliceModule`;
- the `quizModule` path (needs `PublicRoundView`);
- `CombatantPanel` / `MobileMatchBar` / `RevealPanel` / `RoundResultBeat`;
- `ProPlaySubjectCards` as a separate block (its row logic moves into the tablets).

## 13. Tests

- Extend `CanonicalArena.boundary.test.tsx` (module variant unchanged; question variant renders `InteractiveScenarioSurface` in the stage section).
- Extend `QuestionStageGeometry.test.tsx` (stage class still once; no `--qs-*` override by Pro Play files; no inner overflow).
- New `projectProPlayArena.test.ts`:
  - every fixture;
  - `reveal` null pre-answer;
  - tablets in `choices` order;
  - symmetric details;
  - no opponent fields.
- Port the `ProPlayQuestionCard.test` answer-safety and number-leak scans to the arena render.
- Controller tests: retry, resync, idempotent answer, 503-after-grade.
- Backend tests: the stem-order corpus test and the answer idempotency test.

## 14. Open questions (owner)

1. Approve PPQ0 backend fixes 1a/1b and the stored-row rebuild?
2. Approve the `ArenaSurfaceView` union (a second *input* to the one stage, not a second renderer)?
3. End screen: neutral `terminal` tone, or the summary as a final in-arena state?
4. May the backend drop "(authority revision …)" from player-facing explanations, and align explanation precision with evidence?
5. On-tablet magnitude bars scaled from server raw values: allowed, or text values only?
6. Ship player and team media keys in the quiz contract (canonical keys or pre-resolved asset paths)? Until then, monogram crests only.
7. Seasons and teams on identity tablets correlate with games played (career length). This is accepted by contract (`question_context.py:48-53`); confirm for `games_played` questions.

## 15. Next task

PPQ2-A is **done**; see the section at the top.

**PPQ2-B (next):** move `/lol/pro-play/quiz` onto `CanonicalArena` through the `ArenaQuestionSurface` contract in §A9.
- `projectProPlayArena` plus a controller hook.
- Panel flanks: dossier and run.
- Timeline outcomes from received results.
- The arena publishes the report.
- The route joins Layout's full-bleed list.

PPQ2-B keeps today's presentation inside the arena; the Pro Play visuals are PPQ2-C. **PPQ0** (the backend stem-order and answer-idempotency fixes) stays owner-gated and independent.
