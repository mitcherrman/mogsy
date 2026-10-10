# JATTN1 — Journey board attention grammar (backend + frontend handoff)

One handoff for both repos (identical copy in each).

> **Integrated onto current mainline (GM1-R2) — see §12.** §12's bases, branches and deploy order supersede the table below and the "(or together)" in §3 / §10 / §11.7: **frontend publish first → verify → backend deploy second.**
>
> **Re-integrated onto frontend main after PPQ2-A — see §13.** The frontend candidate is now `jattn1/integration-fe-ppq2a` on `924f0192`; the backend candidate is unchanged (`13ef9aef`).
>
> **Forward-integrated onto PPQ2-B (frontend) and PHSR5 (backend) — see §14.** §14's candidates supersede §12/§13's SHAs; the release order is unchanged.

| | Backend `League_Combat_Simulator` | Frontend `mogsy` |
|---|---|---|
| Verified base | `origin/master` **`56f42070`** | `origin/main` **`b94e0d7e`** |
| Branch (local, not pushed) | `jattn1/board-attention-be` | `jattn1/board-attention-fe` |
| Code commit | **`677baf7e`** (unchanged by JATTN1.1) | **`a5dde91a`** + JATTN1.1 **`06a4201f`** |
| Worktree | `mogzy-wt/jattn1-be` | `mogzy-wt/jattn1-fe` |

No push, no deploy, no Lovable publish.

## 1. What the learner now sees — three cues, three looks

| State | Meaning | Look | Source (never guessed) |
|---|---|---|---|
| **CHANGED** | the simulated state changed going into this child | green: existing beat motion, stamp, gain tags; **resting face = thin green inner rim** on every changed object for that child (ability tiles now keep it; item slots moved from an outer ring to the same inner rim) | `state.transition` (gone on the next child) |
| **SAVED** | a revealed fact is retained on the board | gold: persistent `!`; **~1.6 s "Saved" tag** anchored to the exact object during the reveal hold | K2 knowledge join (revealed facts only) + the held child's index |
| **RELEVANT NOW** | this object is what the current question is about | **two opposing notched ice rails** just above and below the object (JATTN1.1; was corner brackets), drawn in once per child, static after | server `focus` + `focus.target_stat` only |

* Saved ≠ correct: a wrong or timed-out reveal saves the same fact with the same cue. No cue says "Correct" or "You learned".
* **Portrait `!` now = a champion stat SAVED by a reveal.** A stat a premise merely STATED stays inspectable in the portrait popup (the portrait is still a button, label "…, stats to review") but carries no `!`. (This reverses JP5's owner rule "stated counts too", per this brief.)
* The old gold `.journey-focus` glow is gone from board objects; the State sheet's own outline now uses the same ice colour.
* Relevant is **objective focus only**: the attacker's portrait is no longer outlined just because the premise states its stats (JP5's `statesInputsAt` tier is retired from the board). No `relies_on` tier.
* Reload: the `!` is simply there; the Saved tag/glow never replays (latch seeds silently on mount, and fires only for a fact that arrives while ITS child's reveal is held).
* Screen reader: the existing reveal live region gains one polite line, e.g. `Saved to the board: Ashe W cooldown, 18 seconds` (value = the reveal's own public display). Changed stays in the beat region. Relevant objects append `relevant to this question` to their names (ability `img`, its `!` button, portrait button, level chip, item slot).
* No popover ever opens by itself; no static champion/ability data is fetched.

## 2. One-time Mogzy board coach (replaces the portrait-only coach)

* Armed by the **first fact the board saves, any kind** (ability cooldown/formula/raw damage or champion stat).
* Built on the Mogzy Guide substrate: `useMogzyGuide` (priority `first-use`, `once: "show"`, TTL-as-dismissal), guide storage key **`mogzy-guide:v1:journey-board:board-saves-v1`** (new, Journey-specific; browser-local only). Compact non-modal strip **docked inside the board over its header line** (JATTN1.1; was the JPX portalled placement), with Mogzy's face (`MogzyMascot` `explaining`, compact art), `role="status"`, never focused.
* **Clock-free only.** `clockFreeUntil` = the instant the viewer's next answer window opens (`own_card_started_at` while it is in the future, i.e. the reveal hold + the following beat; ∞ once finished). Starts only with ≥ **2000 ms** clock-free left, else stays latched for the next clock-free window; lifetime = min(**7000 ms**, time left) and it is removed at that instant → it can never consume answer time (Survival included).
* In practice (production windows): a 1750 ms cooldown/stat reveal with no beat defers it; a 4000 ms raw / 6000 ms damage/haste reveal shows it (≈3.5–6 s). Ashe/Jinx: armed at Step 1, shown at Step 2's reveal.
* Copy: fine "The board saves facts as you go. Hover or click highlighted parts for context." / coarse "… Tap highlighted parts for context." (`useCoarsePointer`, lifted to `src/hooks/useCoarsePointer.ts`, re-exported from `QuestionReviewHost`).
* Dismiss: tap on it, Escape, any pointer/Enter/Space on the board, TTL, or the clock-free deadline. Waits while a board popover is open (Radix trigger `data-state="open"`).

## 3. Exact data contract additions (backend, additive, no version bump)

1. **`children[i].state.focus.target_stat`** — Combat children only, and only when the child's own calculation reads the target's resistance: `"armor"` (physical) / `"magic_resist"` (magic), from `formula_disclosure.damage_type` via `TARGET_STAT_BY_DAMAGE_TYPE`, cross-checked against `Produced.reads_stats[target]` (fail closed: unknown type or unread stat → key absent). Raw-damage children carry no key. Value-free.
2. **Knowledge object on `ability_raw_damage` and `ability_damage` facts** — `object: {type:"ability", key:"<side>:<champion_id>:<slot>", side, champion_id, slot}` (the attacker's ability, side from the node → mirror-safe), `context: {rank}`, `unit: null`. Flows to `learner.established[]`, private ledger, and `learner.asks_fact` (Combat children's `asks_fact` is now non-null). Target identity stays in the after-armor fact key.

**Version policy:** stays `journey_knowledge_object.v1`. The descriptor shape is unchanged (`object` was always `ability | champion | null`, `context` keys from the existing set) — only a former `null` now names an existing type; K1 declared the keys additive and identity-free. `target_stat` follows JP4/JPX's additive-optional-key precedent.

**Proof nothing else moved:** composition keys + bundle digests identical to base for every composition; `test_jattn1_is_purely_additive[*]` composes each servable/reference/extended Journey with both semantics switched off and gets byte-equal serving/state blocks and equal public/private blocks after removing only the JATTN1 keys; the JHASTE1 byte pins hash the blocks through the same normalizer.

**Deploy order: frontend first (or together).** The J3 reader is a strict allowlist: the currently deployed frontend REFUSES a combat focus carrying `target_stat` (the Journey would not draw). The new frontend reads it optionally, so it is safe on the old backend.

## 4. Frontend semantic cleanup

* **B1** `stat_change.source.item_id` now reaches the view model (`JourneyEvent.stat_change.sourceItemId`); item gain tags join their purchase **by item id**, name only as the fallback for an id-less (older) change.
* **B2** raw damage is marked from its structured object (`asks_fact`/`established`); the `abilities.<slot>.raw_damage` regex anchor runs only for a pre-JATTN1 payload (`object: null`). After-armor damage has an object now but is still not a board mark (kept off pending playtest — it relates two objects and is state-bound).
* `focus3` uses `targetStat` only — the "whichever resistance is on the board" guess is gone. An old payload without the key draws no target cue (no inference).

## 5. Files

Backend: `mastery/setup_state/journey.py`; tests `test_jattn1_board_attention_semantics.py` (new), `test_journey_k1_knowledge_objects.py`, `test_jhaste1_base_cooldown_contract.py`.

Frontend: `src/lib/journey/{attention.ts (new), adapter.ts, beat.ts, contract.ts, j3.ts, knowledge.ts, realFixtures.ts}`; `src/components/journey/{JourneyStateBoard, JourneyPrimitives, JourneyChampionPortraitPopup, JourneyKnowledgeMark, JourneyModuleStage, JourneyStageQuestion}.tsx`, `useKnowledgeCoach.ts` (rewritten: board coach), `useSavedNow.ts` (new); `src/hooks/useCoarsePointer.ts` (new); `src/components/quiz/workspace/QuestionReviewHost.tsx` (re-export); `src/lib/ranked-core/modules/{masterySliceModule.tsx, MasterySliceChallengeSurface.tsx}`; `src/pages/dev/journey-arena/JourneyArenaHarness.tsx` (host of new captures); `src/index.css` (JATTN1 section, placed before the OF4 block; removed the gold portrait focus rule); fixtures `src/lib/journey/__fixtures__/jattn1/` (9 real captures + harness + CAPTURE.md); tests `jattn1.attention.test.ts`, `masterySliceModule.jattn1.test.tsx`, `masterySliceModule.boardCoach.test.tsx` (new) + updated `JourneyModuleStage`, `j3.adapter`, `masterySliceModule.{journey,jp4,knowledge,portraitPopup,stageGrammar}` tests; screenshots `docs/handoffs/jattn1-board-attention/`.

## 6. Tests (affected suites only; base = untouched worktrees, same DB / same machine)

**Backend** (`LOL_CALC_DB_PATH` = canonical `mogzy-data/lol_calc.db`; 21 Journey / Daily / Library / preset files): branch **688 passed / 39 failed**, base **642 passed / 39 failed** — the 39 are the identical set on both (pre-existing: JCHAIN1 / JFND1 / K1 digest pins drifted against the current DB, plus admin-launch tests). +46 new tests (`test_jattn1_board_attention_semantics.py`: target_stat correctness + value-freedom, damage objects + mirror sides, structured raw object == the old regex anchor, every-prefix pre-reveal safety, Ashe R vs Jinx R, additivity per composition). The JHASTE1 byte pins (38 Combat compositions) now hash through the JATTN1 normalizer; all 76 pass.

**Frontend** (`lib/journey`, `components/journey`, `lib/ranked-core`, `components/mogzy-guide`, `pages/dev`, `lib/ranked-public`, `pages/quiz-ranked`, `components/ranked-arena`, `features/mastery`, `components/quiz/workspace`): branch **4947 passed / 52 failed**; base (same set without `quiz/workspace`, which is 309/309 on base) **4591 passed / 49 failed**. Every file whose failure set differed was re-run in isolation on both trees: **identical** — only the base's 2 CRLF-regex stylesheet tests in `visualLanguage` remain; the rest were load timeouts (`lobby-preview`, `rfx1b3`, `visualLanguage`) that pass alone (one `premiumAnalytics` 5 s timeout passed 39/39 on rerun). New: `jattn1.attention.test.ts` (20), `masterySliceModule.jattn1.test.tsx` (19), `masterySliceModule.boardCoach.test.tsx` (13). Updated for the new semantics: `JourneyModuleStage`, `j3.adapter`, `masterySliceModule.{journey, jp4 (old coach tests moved), knowledge, portraitPopup, stageGrammar}`. `tsc -p tsconfig.app.json`: only the 2 known Supabase errors. ESLint on changed files: 0 errors.

Environment notes: the main checkout's `lol_calc.db` is a 0-byte placeholder (the canonical DB is `C:/Users/mlmit/mogzy-data/lol_calc.db`); SWC's native addon refuses its default cache under `AppData/Local/swc` (sandbox ACL), so tests and the dev server ran with `SWC_NATIVE_BINDING_CACHE=C:/Users/mlmit/mogzy-wt/.swc-cache`.

## 7. Visual certification (`/dev/journey-arena`, real JATTN1 captures, headless Edge, 1280×800 and 390×844 touch)

`docs/handoffs/jattn1-board-attention/{desktop,mobile}-{1..8}-*.png` (+ `geometry.json`): 1 saved ability fact (Ashe W, Step 1 reveal) · 2 saved champion stat (Jinx armor) · 3 Pickaxe beat / resting rim · 4 level 3→6 + W/R ranks beat / resting · 5 Combat relevant (W + Jinx portrait via `target_stat`) · 6 Ashe R vs Jinx R (both R bracketed, no Jinx R `!`) · 7 first-use coach (Step 2 reveal) · 8 reduced motion (OS + `html.reduce-motion`).

* All 20 states: the right cues, and **board and question rects identical before/after every transition** (no reflow/jump).
* Polish found in round 1 — items 1, 2 and 4 are FIXED in JATTN1.1 (§11):
  1. ~~The coach covered the arena header bar (desktop) and the phone match bar / timer.~~
  2. ~~The QF1 question-motif corner marks rhymed with the Relevant corner brackets.~~
  3. During a reveal the Relevant cue of the just-answered question stays (static) beside the Saved tag; correct by the brief ("static for that question"); unchanged.
  4. ~~Coach Mogzy crop showed mostly the hat.~~

## 8. Answer safety

* `target_stat` and the damage objects carry no number; every reached prefix of every servable/reference/extended Journey passes `assert_pre_reveal_safe`; asks_fact numbers never equal the answer.
* Final Ashe R vs Jinx R: focus names both sides' R symmetrically; asks_fact `null`; no `ability_cooldown:jinx:R` fact and no `opponent:jinx:R` object anywhere in the reached payload (backend test + real capture + DOM test).
* The open child's fact is never in K2 knowledge on any live snapshot of the nine captures; the Saved line only exists once a reveal is in the payload.
* No concern found. One behavioural note: Combat children's `asks_fact` is now non-null; any client that keys "asked object" UI on `asks_fact` will now see the attacker's ability for Combat children (the current frontend only marks the allowed kinds).

## 9. Hosts

Same module (`masterySliceModule` → `JourneyModuleStage` → board) for Daily Standard, Survival, admin playtest (reference + extended) and Journey Library; nothing keys on host (source test). Captured and tested: Daily Standard (Volibear, Pantheon), Survival (Volibear, Ahri), admin reference (Zed/Ahri, right/wrong/timeout), admin extended (Ashe/Jinx, right/wrong). Library uses the identical path (no Library capture taken). No Daily cadence, Survival timing, result screen, Review, role or navigation change.

## 10. Owner playtest before integration

1. Coach timing/readability: it shows only ~3.5–6 s and only on long reveals (cooldown/stat reveals defer it); copy wraps on phones over the match bar.
2. Portrait `!` now appears only for revealed stats (stated premise stats no longer mark) — confirm the intended reversal of JP5's rule.
3. Attacker portrait no longer highlighted on Combat children (objective focus only).
4. ~~Whether after-armor damage should become a board mark~~ — decided for JATTN1: **no**; it keeps its reveal and claims nothing (§11.1).
5. ~~Reticle vs QF1 motif corners~~ — replaced by rails (§11.3).
6. Deploy frontend before backend.

## 11. JATTN1.1 follow-up (frontend `06a4201f`; backend unchanged)

### 11.1 The one Saved rule

**A fact is "saved to the board" exactly when it is behind a persistent gold `!` on the board on screen** — `persistentBoardFacts()` (`src/lib/journey/attention.ts`):

* an ability fact of K2's marked kinds (cooldown, cooldown under haste, revealed formula, raw damage) on an ability the board draws (its `!` card lists it); or
* a champion stat the portrait popup lists as LEARNED (`ChampionPortraitPopup.learnedFacts`, new — exactly the facts behind the portrait's `!`).

The transient **Saved tag**, the **coach trigger** and the reveal's **"Saved to the board: …"** line all read this one list, so each implies a persistent inspectable `!`, and nothing outside it is called Saved. Scope of persistent marks is unchanged.

Audit (what the round-1 code did): post-mitigation `ability_damage` was already excluded (not a K2 marked kind). One real gap fixed: the tag/coach/line read K2 knowledge directly, while the portrait `!` reads the popup, which lists only its seven stat rows — a revealed champion stat outside those rows would have been tagged "Saved" with no `!`. Also fixed: a Saved tag that started late in a short (1.75 s) reveal could outlive the hold by ~350 ms into the next child; it now ends with the hold.

Damage after armor: its normal answer/Reasoning-Chain reveal is unchanged; no Saved tag, no coach arming, no "Saved to the board" line.

### 11.2 Coach placement

Docked **inside the board** (no portal), absolutely positioned over the board's own header line, top-anchored (a wrapped second line grows down into the board, never up): desktop a centred single-line pill; ≤ 26 rem container a full-width two-line strip at the existing 11 px size (copy not shrunk). Measured on the real harness, Step 2 reveal: desktop coach `130–166` inside board `127–401`, sides start `188`; phone coach `142–175` inside board `139–339`, kit row `208+`. **No overlap with the match header / timer / phone match bar, the question, the answers, or the subject's kit; board and question rects identical before/after.** Still non-modal (`role="status"`, no focus), clock-free only, dismissed by tap / Escape / board interaction. While it shows it covers the board's eyebrow, micro-chain and State/Calc buttons for its few seconds (a tap there dismisses it first).

### 11.3 Relevant-now shape

Two opposing **notched rails**: a short ice bar just above and one just below the object, each with a centred notch pointing at it (`.journey-reticle::before/::after`, a clip-path bar). Object-local, no sides and no corners (so never the QF1 corner motif), not a rim (never Changed's green inner rim), not a badge (never Saved's gold `!`). Works at compact size (2 px bar, 3 px notch, 2 px outset); draws in by closing vertically; static after; no animation under either reduced-motion switch. Matchup compares stay symmetric (both R tiles in Ashe R vs Jinx R).

### 11.4 Mogzy crop

Same art (`explaining`, compact plate) and the same 1.75 rem / 1.625 rem round frame; the image is now framed on the hat brim, "m" and eyes (`width 160%`, offset −30 % / −25 %) instead of the hat crown.

### 11.5 Tests (focused)

* `jattn1.attention.test.ts` 24/24 (+4): every persistent board fact on every snapshot of all nine captures is a fact its object's `!` lists (> 200 checked); five post-mitigation reveals (Ashe/Jinx Steps 4 and 6, Zed/Ahri Step 4, its timeout, Volibear Step 2) save nothing and have no saved line; a champion stat outside the popup rows is not Saved; wrong (Ashe W cooldown and raw) and timed-out (K1 Volibear Q) reveals of persistent facts are Saved.
* `masterySliceModule.jattn1.test.tsx` 26/26 (+7): six captures played end to end — every Saved tag sits on an object wearing its `!`, only during a reveal, with the saved line in the reveal region; a damage-after-armor reveal shows no tag and no line; rail shape (no corner gradients); symmetric R cues.
* `masterySliceModule.boardCoach.test.tsx` 15/15 (+2): a 6 s damage reveal (plenty of clock-free time) neither shows nor stores the coach, and the next genuine Save (raw damage) does; the coach is a child of the board, not of the question.
* Journey suites (`lib/journey`, `components/journey`, `lib/ranked-core/modules`): **810/812**, the 2 failures being the base's own CRLF-regex stylesheet tests. Arena / match / guide / mastery (`components/ranked-arena`, `pages/quiz-ranked`, `components/mogzy-guide`, `features/mastery`): 1685/1694, all 9 failures in the base's pre-existing set. `tsc`: only the 2 known Supabase errors; ESLint on changed files: 0 errors.

### 11.6 Re-certification (`docs/handoffs/jattn1-board-attention/`, re-captured)

All 20 states (desktop 1280×800 + phone 390×844 touch): saved ability fact, saved champion stat, Pickaxe beat/resting, level+rank beat/resting, Relevant combat, Ashe R vs Jinx R, first-use coach, reduced motion. `geometry.json` now records the coach's overlaps (`timer/question/answers/mobileBar/sides: false, insideBoard: true` on both devices) and the unchanged board/question rects.

### 11.7 Integration readiness

Ready for integration from the JATTN1 side, with the one ordering constraint unchanged: **deploy the frontend first (or together)** — the deployed J3 reader refuses `focus.target_stat`. Remaining owner-taste items, not blockers: the coach covers the board's own header line for its few seconds; the rails' weight at phone size.

## 12. Integration onto current mainline (JATTN1 + JATTN1.1 → GM1-R2)

Local candidates only: no push, no deploy, no Lovable publish.

| | Backend `League_Combat_Simulator` | Frontend `mogsy` |
|---|---|---|
| Verified base (fetched) | `origin/master` **`72c32c89`** | `origin/main` **`d6c67abc`** |
| Drift since Q's base | `144b28e7`, `72c32c89` (GM1-R2) | `98dac0d9`, `d6c67abc` (GM1-R2) |
| Branch / worktree | `jattn1/integration-be` / `mogzy-wt/jattn1-int-be` | `jattn1/integration-fe` / `mogzy-wt/jattn1-int-fe` |
| Q's commits, cherry-picked `-x` | `677baf7e`→`7bfd2d1c`, `15462bc1`→`fea573c3`, `5a475444`→`cad58035` | `a5dde91a`→`3f2cda29`, `b176bf8e`→`13d17791`, `06a4201f`→`ba337a0f`, `f63e4a61`→`6bb53a80` |
| Untouched base worktree (for comparisons) | `mogzy-wt/jattn1-int-be-base` | `mogzy-wt/jattn1-int-fe-base` |

### 12.1 Overlap audit and conflicts

* **Files:** no file is touched by both GM1-R2 and JATTN1, in either repo. Both cherry-picks applied with **zero conflicts**. Integrated tree = current main + exactly Q's delta: each Q file is byte-equal to Q's tip, and each GM1-R2 file is byte-equal to current main.
* **Semantic overlap, checked:**
  * GM1-R2 grew both pre-reveal guards: backend `answer_safety.FORBIDDEN_PRE_REVEAL_KEYS` and frontend `_FORBIDDEN_SEGMENT_KEYS` (`base_display`, `line_total_display`, `part_kind`, …). No Journey payload, fixture or `mastery/` emitter uses any of them, and Journey `assert_pre_reveal_safe` still passes on every prefix.
  * GM1-R2's `contracts.ts` additions (Reconstruct `partKind` / `combineDisplay` / `lineTotalDisplay` / sub-part `valueDisplay` / `baseDisplay`, result `modulesWon`) are untouched. Q's `targetStat` lives in `journey/j3.ts`, behind the same `readPublicRound` path. No union member or field was dropped.
  * Backend `ranked_public` service, persistence, points and route changes (`modules_won`, `load_resolved_rounds`) are intact. Journey serving does not pass through them.

### 12.2 Contract after integration (unchanged from §3)

Real captures with Q's harness (`__fixtures__/jattn1/capture_jattn1_test.py.txt`) from both backends: 9 Journeys, 315 snapshots each.

* **Integrated backend vs Q's committed fixtures:** Journey content is byte-identical, so the fixtures remain representative and were not regenerated. Only bot pace, deadlines, score and winner vary run to run.
* **Integrated vs current-main backend:** Journey differences are exactly
  * `children[].state.focus.target_stat` added;
  * `learner.established[].object` null → `{type:"ability",…}`;
  * `established[].context.rank` added;
  * Combat `learner.asks_fact` null → object.

  Nothing else changed. Still `journey_knowledge_object.v1`, no version bump.

### 12.3 Deploy order: frontend publish first → verify → backend deploy second

| Frontend ↓ / Backend → | current main (no `target_stat`) | integrated (JATTN1) |
|---|---|---|
| **current main `d6c67abc`** | 315/315 snapshots read | **181/315 REFUSED** (8 of 9 Journeys): `focus carries a field J3 does not publish: "target_stat"` → **unsafe** |
| **integrated** | 315/315 read; 0 `targetStat` | 315/315 read; 328 Combat foci carry `targetStat` |

Permanent proof: `masterySliceModule.jattn1DeployCompat.test.tsx` (9 tests) plays the same Journeys from both backends through `readPublicRound` → the production module. Fixtures in `__fixtures__/jattn1/prior-backend/` are real current-main captures (see `CAPTURE.md` there).

* Saved tags, the saved line and board presence are **identical** at every snapshot.
* Relevant gains only the `target_stat` target-portrait rail; the older payload infers nothing.
* The reader stays strict: an out-of-range `target_stat`, an unknown Combat-focus key, and `target_stat` on a non-Combat focus are all refused.

### 12.4 Tests (integration vs untouched current-main base, same machine and DB)

**Backend** (`LOL_CALC_DB_PATH` = `mogzy-data/lol_calc.db`):

| Group | Integrated | Base |
|---|---|---|
| Journey / Daily / Library / preset | 766 passed / 39 failed | 720 passed / 39 failed |
| GM1-R2 (`test_reconstruct_{certification,decoy_relevance,flow,module,wire_contract}`, `test_answer_safety_guard`, `test_rp1_points_projection`, `test_lh24_points_only_scoring`) | 173 / 20 | 173 / 20 |

* Journey: the +46 are `test_jattn1_board_attention_semantics.py` (46/46). The 39 failures are the identical set Q recorded (31 JCHAIN1 + JFND1/K1/JLONG1/JREF2 digest pins + JL1/playtest preset).
* GM1-R2: the 20 failures are the same set on both trees (`test_rp1_points_projection`: `RankedServiceError: round 2 opens at …`). Pre-existing on main.

**Frontend** (`lib/journey`, `components/journey`, `lib/ranked-core`, `components/mogzy-guide`, `components/quiz/workspace`, `hooks`, `lib/ranked-public`, `pages/quiz-ranked`, `components/ranked-arena`, `{components,lib}/interaction-grammar`, `pages/dev`; 324 files):

* Integrated: 4958 passed / 33 failed.
* After isolated re-runs, the failure set is **identical to base**:
  * 2 `visualLanguage` CRLF stylesheet tests;
  * QuestionStageGeometry 4, AnswerGrid.elimination 2, DailyOnCanonicalArena.boundary 2, CanonicalArena.boundary 1 (CRLF source scans, same on base);
  * premiumAnalytics 3, TeamSim 1, syntheticRankedHistory 1.
* Integration-only failures under full-suite load: `visualLanguage` "Daily Journeys too", `rfx1b3` 540 vs ≥ 550 ms, and 15 lobby-preview `STACK_TRACE_ERROR` timeouts. Each passes in isolation on both trees (97/97; `visualLanguage` failures match base).
* JATTN1 suites: `jattn1.attention` 24/24, `masterySliceModule.jattn1` 26/26, `boardCoach` 15/15, `jattn1DeployCompat` 9/9. Updated Journey suites are all green.
* GM1-R2 / Reconstruct (Reconstruct, reconstruct, reconstructModule, reconstructReveal, contracts.reconstruct.serverCapture, contracts.rp1, QuizRankedMatch.reconstruct{,Result}, rankedResultsModel, ModuleBubble): **199/199**.
* `tsc -p tsconfig.app.json`: only the 2 known Supabase errors. ESLint on the new file: clean.
* Environment note: the first full base run hung on one worker (~15 CPU-min, all other workers idle). It was killed and re-run in three capped groups, and completed normally.

### 12.5 Visual re-certification at current main (`/dev/journey-arena`, headless Edge, 1280×800 + 390×844 touch)

* All 22 states (Q's 1–8 + new 9–11 on both devices) are in `docs/handoffs/jattn1-integration/geometry.json`.
* States 1–8: cues, saved lines, marks, coach rects and board/question rects are **identical to Q's §11.6 geometry** on both devices, so Q's screenshots stand.
* New host states (screenshots in the same folder):
  * 9 — Daily Standard Pantheon Combat: E + Leona portrait rails via `target_stat`;
  * 10 — Survival Volibear Q: Saved tag + `!` + in-board coach;
  * 11 — Daily Standard Volibear R vs Lee Sin R: symmetric rails.
* Before/after rects are equal in every state (no reflow).
* Coach overlaps `timer/question/answers/mobileBar/sides` = false and `insideBoard` = true on both devices. Copy is fine-pointer on desktop and tap on phone. Mogzy crop is unchanged and recognizable, and the rails remain visible at phone size.
* Survival note: its first cooldown reveal has 2150 ms of clock-free time (≥ the 2000 ms minimum), so the coach shows there for about 2.1 s and leaves at the next answer window. Ashe Step 1 (1250 ms) defers as before. This is correct by the clock-free rule, and it never takes answer time.

### 12.6 Hosts and untouched behaviour

* Daily (`DailyRunPage` → hosted `QuizRankedMatch`), Survival, admin playtest and Journey Library (→ `/quiz/ranked`) all render `masterySliceModule`. JATTN1 adds no host-keyed logic (the "host" names in the diff are CSS hook elements).
* No change to Daily cadence, Journey counts, Survival timing, curriculum, result screens, roles, Review or navigation. GM1-R2's `QuizRankedMatch` / result edits are untouched.

### 12.7 Readiness

Ready for a **frontend-first** release:

1. Publish the integrated frontend.
2. Verify Journeys still draw on the current backend (the expected state: no target-portrait rail on Combat children).
3. Deploy the integrated backend.
4. Verify the target rail appears.

Never deploy this backend while the current-main frontend is live.

## 13. Re-integration onto frontend main after PPQ2-A (frontend only)

Local candidates only: no push, no deploy, no Lovable publish. No JATTN1 behaviour changed; this is the §12 frontend delta replayed onto the new main.

| | Backend `League_Combat_Simulator` | Frontend `mogsy` |
|---|---|---|
| Verified base (fetched) | `origin/master` **`72c32c89`** (unmoved) | `origin/main` **`924f0192`** |
| Drift since §12 | none | `84ddda8b` PPQ1 docs, `75b50b66` PPQ2-A seam, `924f0192` PPQ2-A docs |
| Candidate | **`13ef9aef`** (unchanged, not rebuilt) | branch `jattn1/integration-fe-ppq2a`, worktree `mogzy-wt/jattn1-int2-fe` |
| Untouched base worktree | `mogzy-wt/jattn1-int-be-base` | `mogzy-wt/jattn1-int2-fe-base` (`924f0192`) |

### 13.1 Method

The five JATTN1 commits of `d6c67abc..38af3531` were cherry-picked `-x` onto `924f0192`, so no old main commits were replayed:

* `3f2cda29`→`473f6728`
* `13d17791`→`e104d31f`
* `ba337a0f`→`fe53d563`
* `6bb53a80`→`bafac011`
* `38af3531`→`4c1a1756`

This handoff commit follows them. **Zero conflicts.**

**Proof of exactness:**

* `git diff 924f0192 4c1a1756` is patch-identical (hunk bodies) to `git diff d6c67abc 38af3531`.
* `git diff 38af3531 4c1a1756` is exactly PPQ2-A's `d6c67abc..924f0192`.

### 13.2 Overlap audit

* **Files:** the only file both touch is `src/index.css`.
* **`src/index.css`, reconciled by a clean 3-way merge, nothing hand-edited:**
  * PPQ2-A's one rule (`.ranked-academy[data-phone-stacked="true"]::before { inset: 0 }`) stays inside the existing `max-width: 1023.98px` block at ~L15350. That is where `CanonicalArena.questionSurface.test.tsx` source-scans for it.
  * The JATTN1 section stays where §5 put it (before the OF4 block, ~L18772), including its reduced-motion rules. The removed gold portrait-focus rule (~L17770) is still removed.
  * No duplicated block.
* **Selector audit:**
  * Every selector JATTN1 adds or changes is `.journey-*`, plus `html.reduce-motion .journey-*`. None matches the PPQ2-A question surface (`InteractiveScenarioSurface`, `ranked-question`, `[data-surface-region]`). None of the PPQ2-A files contain a `journey-` class.
  * PPQ2-A's only selector is the `data-phone-stacked` frame bleed.
* **Semantic audit:**
  * PPQ2-A's `phoneStacked` and its `panel`-flank `hidden lg:block` apply only when a flank is `kind: "panel"`. Outside admin pages, the only producer of a `panel` flank is the dev question probe. Every Journey host (Daily, Survival, admin playtest, Library) uses combatant or card flanks, so neither rule can reach a Journey board.
  * PPQ2-A's `ArenaSurfaceView` union: Journey uses the `module` member (`kind` absent). Its `<Viewport>` props are unchanged.
  * `reportSnapshot`/`arenaView` changes do not touch the J3 reader. JATTN1 does not touch any PPQ2-A file.

### 13.3 Deploy compatibility (re-certified with fresh captures)

* The capture harness was re-run on both backends: `72c32c89` and `13ef9aef`, 9 Journeys, 315 snapshots each.
* The `13ef9aef` Journey content is identical to the committed `__fixtures__/jattn1/` (non-Journey diffs only: bot pace, deadlines, score).
* Every snapshot was read through `readPublicRound` on each frontend.

| Frontend ↓ / Backend → | current `72c32c89` | integrated `13ef9aef` |
|---|---|---|
| **current main `924f0192`** | 315/315 read → **safe** | **181/315 REFUSED** (8 of 9 Journeys, `focus carries a field J3 does not publish: "target_stat"`) → **unsafe** |
| **integrated (this branch)** | 315/315 read; 0 `targetStat` → **safe** | 315/315 read; 328 Combat foci carry `targetStat` → **safe** |

The reader was not weakened. Release order is unchanged:

1. Publish this frontend.
2. Verify Journeys draw on the current backend.
3. Deploy `13ef9aef`.
4. Verify the target rail.

Evidence: `docs/handoffs/jattn1-ppq2a/four-pair-reader.json`.

### 13.4 Tests (integrated vs untouched `924f0192`, same machine, run concurrently)

**Scope:** `lib/journey`, `components/journey`, `lib/ranked-core`, `components/mogzy-guide`, `components/quiz/workspace`, `hooks`, `lib/ranked-public`, `pages/quiz-ranked`, `components/ranked-arena`, `{components,lib}/interaction-grammar`, `pages/dev`, `components/question-surface`.

**Totals:**

| Tree | Files | Passed | Failed |
|---|---|---|---|
| Integrated | 334 | 5168 | 17 |
| Base `924f0192` | 330 | 5098 | 15 |

**Failure comparison:** after an isolated re-run, the failure set is **identical to base**.

* The only difference under load was `LobbyPreviewPage.premiumAnalytics`: 3 failures on the integrated run vs 1 on base. Alone it passes 39/39 on both trees.
* Shared failures:
  * QuestionStageGeometry 4, DailyOnCanonicalArena.boundary 2, AnswerGrid.elimination 2, visualLanguage 2 (CRLF source scans);
  * CanonicalArena.boundary 1, QuestionMotifLayer.qf1 1, syntheticRankedHistory 1, premiumAnalytics 1.

**Suites by group:**

| Group | Integrated | Base |
|---|---|---|
| JATTN1: `jattn1.attention` 24/24, `masterySliceModule.jattn1` 26/26, `boardCoach` 15/15, `jattn1DeployCompat` 9/9 | **74/74** | — |
| JATTN1-updated suites (`JourneyModuleStage`, `j3.adapter`, `masterySliceModule.{journey,jp4,knowledge,portraitPopup,stageGrammar}`) | 187/187 | 189/189 (jp4's 2 old coach tests were moved by JATTN1) |
| GM1-R2 / Reconstruct (same 10 files as §12.4) | 199/199 | 199/199 |
| PPQ2-A (`CanonicalArena.questionSurface` 21, `CanonicalArena.rm1Integration` 10, `QuizRankedMatch.geometry` 19) | **50/50** | 50/50 |
| Host files (Daily boundary/history, Survival finish, playtest access, question library) | 127/129 | 127/129 (the same 2 CRLF scans) |

**Static checks:** `tsc -p tsconfig.app.json` reports only the 2 known Supabase errors.

### 13.5 PPQ2-A coexistence (PPQ2-A's own `ppq2a-cert.cjs`, unmodified except for env-overridable origins)

* **Existing callers, `924f0192` (5241) vs integrated (5242),** 12 states × 5 viewports:
  * Ranked ×9 and Daily-hosted: **DOM identical 50/50**. Pixel deltas are only PPQ2-A's documented noise: the mascot sprite (195 px at 1165,739 / 1325,839) and the Friends button (1,050 px).
  * The two Journey states differ by design (JATTN1 cues).
  * Evidence: `ppq2a-existing-callers-924f0192-vs-int.json`.
* **Journey vs the previously certified candidate `38af3531` (5243):**
  * Re-run: **DOM identical and 0 pixels > 24 in 10/10.** In the first run, champion art failed to load on one side of two desktop rows (initials fallback). This did not reproduce.
  * So PPQ2-A changes nothing on the Journey board. Evidence: `journey-38af3531-vs-int.json`.
* **Question probe `/dev/arena-question-probe`** (8 states × 5 viewports + Ranked `opts4` reference):
  * The integrated probe equals PPQ2-A's committed `docs/handoffs/ppq2a/probe.json` in every geometry field: 45/45 rows, 0 differences.
  * It also equals a fresh `924f0192` probe: 0 differences, and **all 40 screenshots byte-identical**.
  * The only violations are PPQ2-A's documented pre-existing 1024×768 1028 px overflow (Ranked reference included). Page errors: 0.
  * Evidence: `ppq2a-probe-int.json`.

### 13.6 Visual re-certification (`/dev/journey-arena`, J3 harness, headless Edge, 1280×800 + 390×844 touch)

* All 13 states × 2 devices are recorded in `docs/handoffs/jattn1-ppq2a/geometry.json`. Every field is **identical** to §12.5's committed geometry and to the `38af3531` candidate run side by side. The states are:
  * saved ability and saved champion stat;
  * Pickaxe beat/resting and level+rank beat/resting;
  * Relevant combat, and Ashe R vs Jinx R (symmetric rails, no Jinx R `!`);
  * coach desktop/phone and reduced motion;
  * Daily Standard Combat/R-compare and Survival Saved.
* **Layout:** no reflow (board and question rects equal before and after, every state).
* **Coach (both devices):**
  * inside the board;
  * no timer, question, answer, mobile-bar or kit overlap;
  * fine-pointer copy on desktop, tap copy on phone;
  * Mogzy recognizable.
* **Rails:** visible on phone.
* **Remaining pixel deltas:** small boxes (about 25 px) at the Saved-tag/Mogzy animation phase and on the bot flank banner. This harness runs on the live clock.
* §7/§11.6/§12.5 screenshots stand.

### 13.7 Readiness

Ready to return for the **frontend-first** release: this frontend candidate + backend `13ef9aef`, in the §12.7 order. Never deploy `13ef9aef` while `924f0192` (or any frontend without JATTN1) is live.

## 14. Forward-integration onto PPQ2-B / PHSR5 (no file overlap)

Local candidates only: no push, no deploy, no Lovable publish. No JATTN1 content changed, and no visual or capture work was repeated.

| | Backend `League_Combat_Simulator` | Frontend `mogsy` |
|---|---|---|
| Verified base (fetched) | `origin/master` **`63847f4f`** | `origin/main` **`bdf4bbf1`** |
| Drift | `10479421`, `5ef8e79b`, `63847f4f` (PHSR5): `knowledge_engine/patch_report/{authority,builder}.py`, 3 Patch Hub tests, `docs/PATCH_HUB_PHSR5_FRESHNESS_HANDOFF.md` | `1be4ac80`, `bdf4bbf1` (PPQ2-B): `src/lib/pro-play/arena/**` (11 files), `docs/handoffs/PPQ2-B.md` |
| File overlap with JATTN1 | none | none |
| Method | cherry-pick `-x` of the 4 JATTN1 commits of `72c32c89..13ef9aef` (+ this handoff) | cherry-pick `-x` of the 6 commits of `924f0192..0e123adc` (+ this handoff); 0 conflicts |
| Branch / worktree | `jattn1/integration-be-phsr5` / `mogzy-wt/jattn1-int3-be` | `jattn1/integration-fe-ppq2b` / `mogzy-wt/jattn1-int3-fe` |

**Tree equivalence (both repos):**
* The new delta over the new base is patch-identical to the certified delta (hunk bodies).
* Every JATTN1 file is byte-identical to the certified candidate (`0e123adc` / `13ef9aef`).
* Every drift file is byte-identical to current main/master.
* `git diff <certified candidate> <new code tip>` lists exactly the drift files and nothing else: frontend 12 files (PPQ2-B), backend 6 files (PHSR5).

**Why the prior evidence stands:**
* **Frontend:** PPQ2-B touches no CSS, layout, Journey, ranked-core, ranked-public or component file. `src/lib/{journey,ranked-public,ranked-core}`, `src/components` and `src/index.css` are byte-identical between `924f0192` and `bdf4bbf1`. So §12.5/§13.5–13.6 geometry and screenshots stand.
* **Backend:** `mastery/` and `ranked_public/` are byte-identical to `13ef9aef`, and no Journey code imports `patch_report`. So the JATTN1 payload is unchanged:
  * value-free `focus.target_stat`;
  * ability objects on raw/final damage facts;
  * `journey_knowledge_object.v1`, with no version bump;
  * nothing else.

  The real fixtures in `__fixtures__/jattn1/` remain representative.

**Strict-reader boundary (by equivalence to §13.3's measured run):**

| Frontend ↓ / Backend → | current `63847f4f` | integrated (this §) |
|---|---|---|
| **integrated (this §)** | safe: its reader is identical to `0e123adc`, and the payload is identical to `72c32c89` (315/315) | safe: 315/315 |
| **current main `bdf4bbf1`** | safe | **unsafe**: its reader is byte-identical to `924f0192`, which refused 181/315 on `target_stat` |

`jattn1DeployCompat` (9/9) re-plays both backends' real fixtures through the production reader on this tree. The reader was not weakened.

**Focused tests:**

* **Frontend: 10 files, 334/334.**
  * JATTN1 suites: `jattn1.attention`, `masterySliceModule.{jattn1,boardCoach,jattn1DeployCompat}`.
  * PPQ2-B suites: all 5 `src/lib/pro-play/arena` tests.
  * `CanonicalArena.questionSurface` (PPQ2-A).
  * GM1-R2 / Reconstruct were not re-run, because no shared contract file changed.
* **Backend: 241 passed / 1 failed.**
  * JATTN1 suites: `test_jattn1_board_attention_semantics`, `test_journey_k1_knowledge_objects`, `test_jhaste1_base_cooldown_contract`, `test_answer_safety_guard`.
  * PHSR5 suites: `test_patch_editorial_authority`, `test_patch_ops_stored_direction_recovery`, `test_patch_semantic_card_identity`.
  * The 1 failure is `test_journey_k1_knowledge_objects::test_identity_is_unchanged`, a K1 digest pin. It is in §12.4's pre-existing 39-failure set and also fails on `13ef9aef` and on the untouched `72c32c89`.

**Release order (unchanged):**

1. Publish this frontend.
2. Verify Journeys draw on backend `63847f4f`.
3. Deploy this backend.
4. Verify the target rail.

Never deploy this backend while `bdf4bbf1` (or any frontend without JATTN1) is live.
