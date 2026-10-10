# JATTN1 — Journey board attention grammar (backend + frontend handoff)

One handoff for both repos (identical copy in each).

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
