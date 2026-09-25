# DC-LANE-C — Daily stage result (frontend)

Frontend only. No backend changes.

## Baseline
- `origin/main` = `1d4ed80f`. It is an ancestor of `dcsurv/survival-ux` @ `fe33aaa7`, so that branch still applies cleanly. This branch (`dclane-c/daily-stage-result`) is built on top of it.
- Backend contract read, not modified: `League_Combat_Simulator` `dcsurv/integrate-master` @ `622b7bf1` (`ranked_rulesets/contract.py` `view()`, `daily_challenge/wiring.py` `_live`).

## Flow
stage gameplay → Daily stage result (Ranked end-screen language) → **Continue** → next stage tag … → Review → Review's stage result → **See today's results** → final completion (unchanged).

- The result no longer disappears on a timer. It stays up until the player presses Continue.
- Continue exists only in the `stage-result` phase, and that phase only exists after the parent run has advanced past the stage. `continueFromResult` clears a presentation latch. It never calls the transport. A boundary test guards this.
- The next stage is not launched until Continue, so no child clock starts behind the result.
- While the stage is scoring (`stage-settling`), the same screen is shown with "Scoring stage…" and a disabled "Scoring…" button.
- Review now gets its own stage result before the final completion. The final completion screen itself is not redesigned.

## Reuse
`DailyStageResult` renders `ResultHero` (the mascot, eyebrow, headline and score used by Ranked and the other modes), `ResultStatGrid` and `ResultActions`. `buildDailyStageResult` fills the shared `GameResultsModel`:
- `state: "complete"` always. The screen never says Victory, Defeat or Draw.
- The eyebrow reads `Daily Challenge · Stage N of M`, or `Final stage` for Review.
- The only action is Continue. There is no Play Again, no Ranked queue and no lobby exit.

| kind | headline | score |
|---|---|---|
| Standard / Weak Areas | Stage complete | correct / answered |
| Time Trial | Time's up (bank drained) · Stage complete | correct / answered |
| Survival | Out of strikes · Survived | correct, with **no denominator** |
| Review | Review complete | correct / answered, with no "for Review" stat |

## Monetization placement (not wired)
`DailyRunPage` takes an optional prop `stageResultPlacement(ctx) => ReactNode`. Its output renders between the result content and Continue, and only once the result is settled. `ctx` contains ids and the stage kind, and nothing it could use to advance the run. Continue sits outside the slot and never waits on it. Production passes nothing.

## Survival contract
- `ranked-public/contracts.ts` reads `payload.ruleset.live_strikes` and `payload.ruleset.own_stage_finished`. Both are null when absent.
- `survivalHumanFinished`: when `own_stage_finished` is a boolean, it is the whole answer. The DC-SURV-UX inference is only a fallback for older payloads.
- `survivalStatus.strikesUsed` = `live_strikes ?? strikes`.
- Daily `live.strikes.live` and `live.own_stage_finished` are read. `projectDailyFlow` moves a Survival stage to `stage-settling` when `own_stage_finished` is true. The child stays mounted but hidden and keeps polling. Whichever signal arrives first wins: the arena's or the Daily's.
- The chrome shows the larger of Daily `used`/`live` and the arena's live count.

## Remaining backend dependency
- `dcsurv/integrate-master` (which provides `live_strikes` / `own_stage_finished` in both the Ranked public projection and Daily `_live`) must reach backend `master` and production. Until then the frontend falls back to the DC-SURV-UX inference, and no Daily `own_stage_finished` arrives.
- The stage result (`correct`, `answered`, `score`, `ended_by`, `misses`) is read unchanged from the existing `result` contract. Survival shows no strike count on the result because the settled `result` does not carry one. A `strikes` field on the result would allow it.

---

# JOURNEY-UI0 — Mastery Journey state board: presentation requirements

This section is read-only research. No production code was changed. It is based on the `26ed7f0c` candidate, and the backend was read at `dcgr/content-integration` and `master`. The layout numbers come from a real browser: `/dev/ranked-arena-inspector`, plus a throwaway `CanonicalArena` probe with banner rails and Daily chrome that was not committed. All paths are under `src/`.

## 1. Existing regions and components
| Region | Component / testid | Facts that matter for a Journey |
|---|---|---|
| Frame | `ArenaShell` `quiz-ranked` (`components/ranked-arena/ArenaShell.tsx:91-104`) | From `lg` the height is fixed (`--ranked-stage-h`). The `chrome` row is one line (`min-h-7`); the Daily puts `DailyStageChrome` there. |
| Desktop grid | `CanonicalArena` `ranked-arena-grid`, 23 / 54 / 23 fr from `lg` (`CanonicalArena.tsx:606-621`) | Rails: `combatant-{id}`. Centre: `ranked-focus-column` → `ranked-question` (`.ranked-question-stage`). **No mode may add height to the question box** (`:641-642`). |
| Flank | `CombatantPanel` `presentation:"banner"` (`CombatantPanel.tsx:886-1023`) | Top to bottom: `RoleCrest` mascot, name/role, `ScoreTally`, `ModuleHistoryStrip` (`flex-1`), `AwardPops`, status. **No children/extra slot.** `CombatantView` has no items, ranks or stats (`lib/ranked-core/viewTypes.ts:41-88`). |
| Phone | `MobileMatchBar` `ranked-mobile-matchbar`; `MobileBottomBar` (Report / timeline / Rules dock tabs via `useMogzyDockTabHost`, `MobileBottomBar.tsx:54`) | The phone layout is used only when **both** rails are banners (`CanonicalArena.tsx:251`). The banners are hidden on the phone. |
| Rail seam | `ArenaRail {kind:"panel", node}` (`lib/ranked-core/arenaView.ts:113`) | Unused. Using it drops the banner **and** turns the phone match bar off. Rejected. |
| Scenario media | `ScenarioMediaBand` in `[data-surface-region="media"]` (`components/question-surface/ScenarioMediaBand.tsx`; `index.css:2520, 2939-2954`) | Desktop reserve 16rem (17.25rem when the viewport is ≥861px tall). Aspect `band` 16/7 (16/7.5 at `lg`). On the phone it takes its natural height. |
| Slice surface | `lib/ranked-core/modules/masterySliceModule.tsx`, `MasterySliceChallengeSurface.tsx:330-338` | One challenge at a time. It draws a new `ScenarioMediaBand` for each challenge, and `toPlayerQuestion` hard-codes `state: null`, `matchupIdentity: null` (`:104, :118`). |
| Gold standard | `CombatCalculationScenarioCard` (the cooldown card; payload `CombatCooldownSubject`) + `quiz-broadcast/scenario-cards/primitives.tsx` | Splash, `ScenarioBadge`, `ScenarioEntityStrip` (36px `EntityIconSlot`, **not exported**, `:228`), `ScenarioSubject` (ability glow + slot letter), `ConditionChip` Level/Rank (`:346`), `ScenarioDivider`, `ScenarioEntry` item pills. **One side only; no rank pips; no fixed item slots.** |
| Matchup | `MatchupScenarioCard` | Two splash halves with a VS seam. `level` and `abilityRank` are **one shared scalar** (`scenario-cards/types.ts:522-523`). This is the known per-side defect. |
| State data (standalone) | `features/mastery/player/MasteryStatePanel.tsx`, `MasteryTransitionPanel.tsx`, `features/mastery/contracts/stateView.ts:36-76` | Has the full field set (level, ranks, AP/AD/haste, armour/MR, gold, inventory, HP/resource, effects) and "before → after" text, but in shadcn styling. It never reaches the arena. |
| Role identity | `RoleCrest` / `RoleEmblem` / `roleIdentity.tsx` | The player's role mascot. In a Journey it gives way to the champion, but the role emblem stays as a small tag. |

## 2. Measurements (real browser)
| Viewport | Banner (w×h) | Banner inner column | Crest | Free height under the module strip | Centre column / question |
|---|---|---|---|---|---|
| 1440×900 | 267×690 | 171px | 171×136 | ≈114px | 626px wide |
| 1280×800 | 263×590 | 169px | 169×134 | ≈16px | 618px wide |
| 1024×768 (`lg` min) | 204×558 | **131px** | 131×104 | **≈16px**, and the module strip already wraps | 480px wide |
| 375×812 phone | hidden | — | match bar 60px high, 127px per side, 40px crests | — | focus column 598px; bottom bar 49px; chrome 32px |
| 390 phone (card-mode question) | — | — | — | — | question 480px, of which media band 134px and answers 225px |

**What the numbers mean:**
- The banner **cannot hold the full state.** At `lg` it is 131px wide and has about 16px of spare height.
- The phone has **about 120px** left after a normal question card.
- The only region that exists on both platforms, is wide enough for two sides, and already has height reserved is the **question card's media band.**

## 3. Recommended desktop placement: a hybrid
1. **Flanks (identity plus always-visible headline state).** While a Journey is on screen, each banner's `RoleCrest` mascot is replaced by that side's **champion portrait**, gold-ringed with the `ScenarioSubject` ring treatment.
   - Under the portrait: **`Lv N`** and a **QWER rank-pip row**. The pips are about 131px wide at `lg`, so they fit.
   - Left banner = the Journey **subject**. Right banner = the **opponent champion**, which is where the opponent mascot sits today.
   - Score, module strip and status stay exactly as they are, because the duel still scores.
   - No items or stats go in the banners, because the measured width and height rule it out.
2. **Centre media band → `JourneyStateBoard` (the full current state).**
   - Two halves with the `MatchupScenarioCard` VS seam: **subject on the left, opponent on the right**, the same sides as the banners, so it reads as one game state from the flanks to the board.
   - Each half is 240-313px wide × about 16rem tall and contains:
     - a small portrait, name and `Lv`
     - QWER icons with rank pips
     - **6 fixed item slots** in one row (28px each is about 188px)
     - **2-3 stat chips**
   - The two halves need not be symmetric. The subject half may lead with the asked ability; the opponent half with defensive stats.
   - It **replaces** the per-challenge splash for Journey challenges. It is **keyed on the journey id, not the challenge**, so it persists and animates from one question to the next. The question card below it becomes prompt + answers only.
3. **Rejected options:**
   - Full state in the flanks: too narrow, and hidden on the phone.
   - `ArenaRail panel`: loses the banner and the phone match bar.
   - The `chrome` row: one line, and the stage height is fixed.
   - A new column: the grid is proportional and already full.

## 4. Recommended phone treatment
- **Match bar:** the 40px crest becomes the champion icon with a small `Lv` corner badge, so identity stays visible when the page scrolls.
- **Media band → a compact board with two stacked rows**, about 56px per side and about 124px in total. That is no taller than today's 134px band, so the geometry doesn't change. Each row holds:
  - portrait (28px), name, `Lv`
  - QWER pips
  - 6 items at 20px
  - only the **focus** stat chips (at most 2)
  
  The subject is on top and the opponent below, matching the match bar's left and right.
- **Expandable detail:** tapping the board opens a **sheet through the existing dock-tab host** (a "State" panel beside Report and Rules) with the full stats for both sides. The same component, in a `detail` density, serves as the desktop "More" popover.
- **Not a carousel:** it would hide one side, and the two-sided comparison is the point. Not stacked full headers either, which would cost about 250px and push the answers below the fold.

## 5. Transition presentation
- Transitions play **on the board itself**, between challenges, in the reveal-hold / lead-in window, before the next question can be answered. They play in order, about 250-400ms each, and the whole beat stays at or under about 2s:

  | Event | Treatment |
  |---|---|
  | `LEVEL 4` | The level badge flips with a gold burst (the `AwardPops` keyframe pattern). |
  | Q rank 1 → 2 | The pip fills and shows a `+1` pop. |
  | R unlocked | The R icon goes from locked (greyed) to lit, with the `ScenarioSubject` glow. |
  | Recall | A board-wide stamp "RECALL · N gold", then items land in their slots. |
  | Item purchased / completed / component consumed | Slot fill using `EntityIconSlot`'s `purchased`/`sold` status styling. |
  | `+ Null-Magic Mantle`, `+ Sorcerer's Shoes` | An item-name toast on the slot. |
  | MR 32 → 50, penetration, Ability Haste | A **delta chip** (`MR 32 → 50`, green or red). |

- **Deltas persist:** the delta chip stays for the whole next question (until the next transition), so understanding it doesn't depend on catching the animation. Only a short **change-log line** ("Level 4 · Q2 · Mantle") is text. There are no paragraphs.
- **Reduced motion:** no animation, but the delta chips and the change line still show.
- **Timing:** the server owns the timer, so the beat must fit a server-given window (see §6 `transition_window_ms`). In Standard the slice runs on a pooled 120s timer; in Survival it is 30s per question. The beat must not spend player time silently.

## 6. Fields the backend contract needs to provide (JOURNEY1)
Per slice segment (public, pre-reveal safe):
- `journey`: `journey_id`, `engine` (`champion|matchup|combat`), `step_index`, `step_count`, `checkpoint_label` (short, e.g. "Lv 6 · first recall"), and `state_version` (monotonic).
- `sides[]` (exactly 2), each with:
  - `side`: `subject` | `opponent`
  - identity: `champion_id`, `champion_name`, `icon`, optional `splash`, optional `form`, optional role tag
  - `level`
  - `abilities[]`, one per slot:

    | Field | Meaning |
    |---|---|
    | `slot` | Q/W/E/R |
    | `ability_id`, `name`, `icon` | identity |
    | `rank` | current rank |
    | `max_rank` | maximum rank |
    | `unlocked` | whether it is unlocked |

  - `inventory[]` with a fixed `slot` 0-5: `item_id`, `name`, `icon`, and `status` of `held|new|consumed|removed`
  - `gold`: optional
  - `stats[]`: `key`, `label`, `value`, `unit`, `tier` (`core` = always visible | `detail`)
  - `health` / `resource`: `{current, max|null}` **only when the Journey tracks them.** Absent means not drawn.
  - `effects[]`: optional
- `transitions[]` since the previous displayed `state_version`, in order: `id`, `kind` (`level|ability_rank|ability_unlock|item_acquire|item_complete|component_consumed|item_removed|recall|gold|stat_delta`), `side`, `before`, `after`, `label`.
- `transition_window_ms`, or an `answerable_at` that already excludes the beat.
- **Per challenge:**
  - `state_version` the challenge is asked against.
  - `focus[]`: references to premise facts (`side` + `stat:key` | `ability:slot` | `item:slot`) to highlight.
  - A **short prompt** that refers to the board ("Your Q now deals…?"). This changes the backend "chain rule" (`ranked_public/mastery_slices.py:28-36`): a fact is restated structurally in the board, not in prose.
  - **Per-side ability and rank for Matchup.** This removes the shared `level`/`abilityRank` scalar.
- **Naming:** keys must avoid the tokens that `assertSegmentIsPreRevealSafe` / the presentation guard reject (`answer`, `reveal`, `correct`, `solution`, `explanation`, `winner`; `ranked-public/contracts.ts:854, 1056-1111`).

Backend state that already exists to build from:
- `mastery/state/canonical_state.py` (`ChampionCanonicalState`)
- `mastery/transitions/transitions.py` (`LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`, `ITEM_COMPLETION`, `COMPONENT_CONSUMPTION`, `ITEM_REMOVAL`, `GOLD_*`)
- `mastery/chains/timeline.py` (`TimelineCheckpoint`)

Recall is not a transition type there: it is gold plus a legal purchase, so the wire needs an explicit `recall` grouping for the stamp.

## 7. Answer-leak safety rules
1. The board shows the state **as of the start of the current challenge** (its `state_version`). A transition that results from a challenge is published only after the viewer's own reveal of that challenge (`own_challenge_reveals`), and never earlier.
2. **Withholding happens on the server.** Any value the current challenge asks for is **absent from the payload** and sent only as `{key, withheld:true}`, which the board draws as `?`. Examples: post-mitigation damage, effective MR after penetration, the cooldown after haste. CSS hiding is not enough.
3. The **frontend computes nothing.** No formulas and no local derived stats: it shows backend values only, including deltas.
4. `focus[]` may name **premise inputs only**. It must never single out an answer option. For example, it must not highlight the one item of four that is the answer.
5. Transitions **never anticipate** the next question. If Q3 asks "MR after buying Mantle?", the Mantle purchase may appear, but MR must be withheld until Q3 is answered.
6. The opponent/bot's progress through the slice never changes the board. Journey state is authored, not played.
7. After the Survival `own_stage_finished` signal, no further transitions are applied. The arena already stops drawing gameplay at that point.

## 8. Components to reuse
- **Scenario-card primitives:** `ScenarioBadge`, `ConditionChip`, `ScenarioDivider`, `ScenarioSubject` (ability glow + slot letter), `EntityIconSlot` status styling, and the `--sc-fit` / `cqmin` sizing rules (`primitives.tsx:21-54`).
- **Split geometry:** `MatchupScenarioCard`'s split and VS seam.
- **Motion:** the `AwardPops` pop keyframes.
- **Copy:** the `MasteryTransitionPanel` before → after semantics.
- **Types:** the `MasteryStatePanel` field set, as the reference for the view type.
- **Arena pieces:** `RoleCrest`'s slot in `CombatantPanel`, the `MobileMatchBar` crest, the dock-tab host (`useMogzyDockTabHost`) for the phone sheet, and `ScenarioMediaBand`'s region tokens.

## 9. Likely extensions or new components
| New / extend | What |
|---|---|
| **new** `JourneyStateBoard` (`components/journey/`) | Two-sided board with densities `band` (desktop), `compact` (phone) and `detail` (sheet/popover). Keyed on `journey_id`. |
| **new** `AbilityRankPips` | Shared rank pips. None exist today; `pages/CombatLab.tsx` (~5931-5949) has a local version. |
| **new** `InventorySlots` | Fixed 6 slots. Export `EntityIconSlot` from `primitives.tsx`. |
| **extend** `ConditionChip` → `StatChip` | Adds `delta {before, after}`, `focus`, `withheld`. |
| **new** `useJourneyTransitionBeat` | Presentation-only sequencer over `transitions[]`, honouring reduced motion and `transition_window_ms`. |
| **extend** `ArenaRail` `combatant` + `Rail` (`CanonicalArena.tsx:122-138`) + `CombatantPanel` | An optional `identityOverride {portrait, level, abilityPips}` that replaces the crest mascot. |
| **extend** `MobileMatchBar` | Champion icon crest plus a `Lv` corner badge. |
| **extend** `masterySliceModule` / `MasterySliceChallengeSurface` | When a segment carries `journey`, mount the board in the media region once per slice instead of a band per challenge, and pass state through (`state` is `null` today). |
| **extend** `ranked-public/contracts.ts` | Add `readJourneyState` and register the fields with the pre-reveal walker. |
| resolved by the board | The Combat state-aware premise and Matchup per-side rank. The board carries both sides' state, so both card defects disappear for Journey challenges. The legacy cards remain for non-Journey slices. |

## 10. Conflicts with the Daily stage-result work (this branch)
- **No layout conflict:** the stage result is drawn outside the arena, and the board lives inside it.
- **Chrome row:** `DailyStageChrome` sits in the one-line chrome row, so the board must not go there. `stageContentLine` ("Champion Mastery — Ahri") may later want the Journey title. That is optional.
- **Survival cut-off:** `own_stage_finished` can end a Journey slice in the middle. The pending stage result appears at once, the hidden child keeps polling, and the board must not play a beat. Rule 7 above covers this.
- **Stage result content:** it has no Journey content, and needs none for now. A later "Journey progress" line on the stage result would need a settled `result.journey` field.
- **Boundary guard:** the Daily-run guard (no `GameResultsBody` / Victory / Defeat in Daily files) doesn't touch the board, because it lives in arena/module code.
- **Out-of-date comment:** the comment at `CanonicalArena.tsx:249-250` still says the Daily keeps a card flank. The hosted match passes banners today (`QuizRankedMatch.tsx:1365-1372`), so the Daily gets the phone match bar. That is correct for the Journey plan, but the comment should be fixed during JOURNEY-UI1.

## 11. Next implementation task, once JOURNEY1 freezes the contract
**JOURNEY-UI1: frontend only, hosted and Ranked arena.**
1. Add `JourneyStateView` and its reader in `ranked-public/contracts.ts`, with parser tests and pre-reveal walker tests. Include withheld fields and forbidden keys.
2. Build `AbilityRankPips`, `InventorySlots` (exporting `EntityIconSlot`) and `StatChip`, in the gold primitives.
3. Build `JourneyStateBoard` (`band` / `compact` / `detail`), fed by fixtures, and add `/dev/ranked-arena-inspector` states for:
   - Champion, Matchup and Combat engines
   - a withheld stat
   - each transition kind
   - 375, 390, 1024, 1280 and 1440 widths
4. Wire it into `masterySliceModule` / `MasterySliceChallengeSurface`: mount once per slice, keyed on `journey_id`, and fall back to today's per-challenge band when `journey` is absent.
5. Add `useJourneyTransitionBeat`, gated by `transition_window_ms` and reduced motion.
6. Add the `identityOverride` for the banner crest and the `MobileMatchBar` crest, plus the phone "State" dock sheet.
7. Tests:
   - geometry unchanged: the question box height is identical with and without the board
   - no answer-derived value is rendered before the reveal
   - Survival finish stops the beats
   - Daily hosted flow unaffected
8. Certify in a real browser at 375, 390, 1024, 1280 and 1440, then run the production build.

---

# JOURNEY-UI1 — Journey state board: presentation layer (frontend)

Frontend only. Local commit on `dclane-c/daily-stage-result`, not pushed.
- **Code commit:** `507445dc115f16abbdeacf89c50f266e878c289b`. This handoff update is the commit after it.
- **Not wired into production Daily or Ranked.** Every new arena prop is optional and absent in production, so today's arena is unchanged.

The contract is the provisional `journey.public.v0`, written against the backend `JOURNEY1_HANDOFF.md` (`dcgr-integ` worktree, untracked, on `64852eab`).

## 1. What was built
**Architecture:** one board per Journey module, persisting across child questions.
- `JourneyModuleStage` mounts `ScenarioMediaBand` → `JourneyStateBoard` once, keyed on `journeyKey`. The child question sits beneath it; the caller keys it per child, as the slice does today.
- It is fed only the canonical public state (`segment_state.journey`). It never assembles state from question prose, and it computes no stat, cooldown, damage, resistance or item effect.

| Area | Where |
|---|---|
| Contract + typed allowlist reader | `src/lib/journey/contract.ts` |
| Closed premise-stat vocabulary, labels, formatting (no arithmetic) | `src/lib/journey/stats.ts` |
| Beat timing, lasting marks, event copy (pure) | `src/lib/journey/beat.ts` |
| Rail identity projection | `src/lib/journey/rail.ts` |
| Fixtures (JOURNEY1 §7 arcs A, C, F; explicit beat simulation `withBeat`) | `src/lib/journey/fixtures.ts` |

**Components** (`src/components/journey/`):
- `JourneyPrimitives.tsx`:
  - `JourneyPortrait`: gold ring; cool rim for the opponent.
  - `LevelBadge`: shows "Lv 5 6" with the old level struck through.
  - `AbilityRankPips`: Q/W/E/R icon, slot badge and pips; rank 0 shows as locked.
  - `InventorySlots`: six fixed slots; empty slots dashed; new items get a green rim.
  - `StatChip`: three faces, all at a fixed height — plain, delta ("51.59 → 91.59") and withheld ("?").
- `JourneyStateBoard.tsx`: the two-sided board, with a VS seam, or an attacker → target arrow for Combat.
- `JourneyTransitionBeat.tsx`: the beat overlay on the board — a stamp (Recall / Level up / Ultimate unlocked / Purchase), the transition label, and staged event lines.
- `JourneyStateSheet.tsx`: the expanded State sheet. It uses the existing bottom `Sheet` and shows both sides together.
- `JourneyModuleStage.tsx`: the module-level composition, the beat gate and the reveal hold.
- `useJourneyBeat.ts`: compares server time to `beat.until` and arms one timer.
- `JourneyCrest.tsx`:
  - `JourneyBannerCrest` sits in the desktop banner's mascot slot, reserving the slot with its own classes.
  - `JourneyMatchBarCrest` replaces the 40px crest in the phone match bar.

**Seams extended** (all optional; absent means byte-identical):

| File | Change |
|---|---|
| `components/question-surface/ScenarioMediaBand.tsx` | `children` draws a card in place of the classified `ScenarioCard`, inside the same geometry; also adds `className` and `data-band-kind`. |
| `lib/ranked-core/arenaView.ts` | Combatant rail gains `journey?: JourneyRailIdentity \| null`. |
| `components/ranked-arena/CanonicalArena.tsx` (`Rail`) | Relays it. |
| `components/ranked-arena/CombatantPanel.tsx` | `journey` replaces the role crest in the banner. |
| `components/ranked-arena/MobileMatchBar.tsx` | `rail.journey` replaces the crest. |
| `src/index.css` | `.journey-*` rules. Density is a **container query on the band**, not a viewport query. |

**Fixture infrastructure:**
- `/dev/ranked-arena-inspector`: 8 `Journey — …` states on the real question card, using the inspector's Mobile 375 / Narrow 1024 / Full buttons.
- `/dev/journey-arena?arc=a|c|f&step=N`: new dev route, `src/pages/dev/journey-arena/`. It is the real `CanonicalArena` with banner rails, the phone match bar, and a fixture module rendering `JourneyModuleStage` above the real `InteractiveScenarioSurface` with `mediaScale: "none"`, so the page has exactly one band.
  - Its step controls simulate the server poll and stamp the beat instant.

## 2. Presentation (locked, as built)
- **Desktop:**
  - Subject champion in the left banner, opponent champion in the right banner: portrait, `Lv`, champion name and Q/W/E/R pips, in the role mascot's box.
  - The full two-sided board sits in the question's media band. On a Journey the per-child scenario band is gone and the question card below is prompt plus answers.
- **Phone:**
  - Both champions are always visible, as two stacked rows in the same band: `[portrait] NAME · Lv · Atk/Tgt …… focus stats` / `Q W E R ▢▢▢▢▢▢`.
  - The phone match bar shows each champion with a level corner.
  - The **State** button opens the full sheet.
  - No carousel.
- **Hierarchy:**
  - Always visible: identity, level, ranks, items.
  - Band density shows all of a side's premise stats. Compact shows at most 2 per side, choosing what the question focuses on first, then what just changed.
  - The sheet has everything.
- **Transitions:**
  - They play between children, on the board: the changed facts pulse, a stamp appears, and one line per event is staged in the server's order.
  - While the canonical beat runs, the next question stays **mounted in its box but `inert`, `aria-hidden` and veiled** ("Board updating…"). No clock is touched: the client only waits for the server's `until`.
  - The deltas (the "Lv 5 → 6" level badge, delta chips, new-item rims, raised pips) **persist for the whole following child**, because the server keeps the transition on that child's state.
  - With reduced motion there is no animation; the gate and the lasting marks are unchanged.
- **Matchup:** each side draws its own ranks, e.g. arc A child 2: Jarvan Q3 W1 E1 R1 vs Olaf Q3 W0 E2 R1. The shared-scalar defect cannot occur on a Journey board.
- **Combat:** `focus.combat` tags the sides Attacker/Target and turns the seam into an arrow. `focus.refs` outline the attacker's ability, rank and stats, the target's armor/resistance and penetration, and items. The board does **not** solve Combat: it has no key under which a damage, cooldown or effective-resistance number could be published.

## 3. Contract used: `journey.public.v0` (wire, snake_case)
```jsonc
// segment_state.journey — per viewer, always describing the viewer's CURRENT child
{
  "contract": "journey.public.v0",
  "journey_key": "journey:jungle-first-recall-j4-olaf@1",   // opaque, stable for the whole Journey
  "plan": "standard" | "survival",
  "title": "First Recall → Defensive Purchase",            // optional
  "step": { "index": 2, "count": 5, "node_id": "n1", "node_label": "Jarvan IV's first back" },
  "sides": [                                               // exactly one subject + one opponent
    { "side": "subject", "champion_id": "JarvanIV", "champion_name": "Jarvan IV", "icon": null,
      "level": 6,
      "abilities": [ { "slot": "Q", "rank": 3, "max_rank": 5, "name": "Dragon Strike", "icon": null }, … W, E, R ],
      "items": [ { "slot": 0, "item_id": 3133, "name": "Caulfield's Warhammer", "icon": null } ],   // 0..5, fixed
      "stats": [ { "key": "bonus_attack_damage", "value": 20 },
                 { "key": "armor", "withheld": true } ],   // withheld: NO value key at all
      "vitals": null },                                    // only when tracked
    { "side": "opponent", … } ],
  "transition": {                                          // only on the child right after a node change
    "from_node": "n0", "to_node": "n1", "label": "Jarvan IV buys Caulfield's Warhammer (1050g)",
    "events": [
      { "kind": "purchase", "side": "subject", "group": "recall", "items": [ { "slot": 0, "item_id": 3133, "name": "…", "cost": 1050 } ] },
      { "kind": "stat_delta", "side": "subject", "key": "ability_haste", "from": 0, "to": 10 }
      // also: level {from,to} · ability_rank {slot,from,to} · ability_unlock {slot} · item_removed {item_id,name}
    ],
    "beat": { "ms": 1800, "until": "2026-09-25T12:00:01.800Z" } },   // canonical; until = next child answerable
  "focus": { "refs": [ { "side": "subject", "kind": "ability", "key": "Q" },
                       { "side": "opponent", "kind": "stat", "key": "armor" } ],   // also item {key: slot}, level
             "combat": { "attacker": "subject", "target": "opponent" } | null }
}
```
**Stat vocabulary (closed):** `health`, `attack_damage`, `bonus_attack_damage`, `ability_power`, `ability_haste`, `armor`, `magic_resist`, `lethality`, `armor_penetration_percent`, `magic_penetration`, `magic_penetration_percent`.

**Safety is a typed allowlist:**
- Every object is read against its exact key set, and an unknown key anywhere fails the read. `answer`, `correct`, `reveal`, `explanation` and `cooldown` are all refused as "not allowed", not by a name list.
- A withheld stat that carries a `value` (even `null`) is refused.
- Cross-checks against the resulting state reject:
  - an event that restates a withheld stat;
  - a delta whose `to` differs from the board;
  - a level or rank event that does not rise to the board;
  - a purchase of an item not held;
  - a removal of an item still held;
  - a focus ref to something absent;
  - an attacker equal to the target.
- `tryReadJourneyPublicState` returns `null` for a malformed block, so a surface draws no board rather than crashing a match.

## 4. Divergences from JOURNEY1 (the backend must decide; J2 should fold these in)
1. **The public state is per viewer, not per child.**
   - `mastery_slice.public_view` publishes **every** child at segment open (`ranked_modules/mastery_slice.py:1780-1789`).
   - A node state attached to each child would therefore publish later premises early, and JOURNEY1's reinforcement makes a later premise an earlier *answer*. In arc C, the armor asked in child 1 (44.195) is the stated premise of child 3.
   - So the state lives in `segment_state.journey` and advances with `own_next_challenge_index`.
   - **This same leak already exists in JOURNEY1's design through the children's PROMPTS:** child 3's prompt text, which states armor 44.195, is public at segment open while child 1 asks for it.
   - The backend must either publish children progressively, or never let a later child's premise equal an earlier child's asked target inside one Journey. The ledger (`asked` vs `displayed`, §13) has the data to enforce the second.
2. **A public node projection with per-child withholding.** JOURNEY1 keeps nodes private and publishes only `{beat, node_label, transition_note}`. The board needs level, ranks (`ranks_after(level)`), fixed item slots and premise stats per side. A stat is `withheld` when the current child's ledger `asked` target is that stat (e.g. `champion_stat_level` asks Garen's armor).
3. **Stats map from `derive_side`:**

   | Board key | `derive_side` source |
   |---|---|
   | `attack_damage` | `attack_damage.total` |
   | `bonus_attack_damage` | `attack_damage.bonus` |
   | `ability_power` | `ability_power.total` |
   | `ability_haste` | `ability_haste.total` |
   | `armor` | `armor.total` |
   | `magic_resist` | `magic_resist.total` |
   | `health` | `health.at_level` |
   | `lethality`, `armor_penetration_percent` | penetration premises |

   Cooldowns (`ability.<slot>.cooldown.*`) are deliberately **not** board stats.
4. **Lossless per-event transitions.** JOURNEY1's `transitions:[{from,to,side,axes,note,gold}]` must expand to typed events:
   - `level`;
   - `ability_rank` (the skill-path diff);
   - `ability_unlock`;
   - `purchase`, with slot and cost;
   - `item_removed`, for component consumption;
   - `stat_delta`, public and non-withheld only.

   **Recall:** there is no recall authority (JOURNEY1 §7: gold is narration only), so `group: "recall"` is a **presentational grouping chosen by the recipe** (e.g. arc type "First Recall"), not a timing claim. Owner decision.
5. **A canonical beat.** `transition.beat {ms, until}` is new. The server must not open the next child's answer window before `until`.
   - Under per-child clocks (PRE-1, Survival) that is a later `answerable_at`.
   - Under Standard's **pooled block clock** (M10, 150 s) the beat would spend the player's pool unless the block deadline is extended by `ms`, as `reveal_window_ms` already is.
   - The reveal window and the beat should be sequential: the board holds the previous state during the reveal hold, then plays the beat.
6. **Focus and combat roles.** `focus.refs` come from the ledger's `displayed` premise refs for the current child. `focus.combat` comes from the Combat child's attacker, including the reverse direction (arc D #5).
7. `vitals` (HP/resource) are supported but optional; JOURNEY1 lists them as later. `title`, `icon` and ability `name` are optional.

## 5. Measurements (real browser, `/dev/journey-arena` + inspector)
| Viewport | Board density | Band (w×h) | Overflow | Banner / bar crest | Question box across a beat |
|---|---|---|---|---|---|
| 1440×900 | band, roomy (≥34rem wide and ≥14rem tall) | 584×256 | none (board 256/256, sides 212/212) | 171×136 = the role mascot slot, identical; score 180px below the crest top in both | y=463, h=256 before, during and after |
| 1280×800 | band | 576×208 | none | 169×134 = the mascot slot at this width | unchanged |
| 1024×768 | band (≥26rem) | 438×200 | none (sides 162/162) | 131×104 | unchanged |
| 390×844 | compact | 352×127 | none (rows 49/49); page scrollWidth 390 | 40px crest, champion + level | unchanged |
| 375×812 | compact | 337×121 (the arena's own phone band) | none (rows 46/46); page scrollWidth 375 | 40px crest, champion + level | question 130/614, answers 439/210 before, during and after |

**What was checked in the browser:**
- **Beat (1440, arc A 4→5):** at +0.6 s the stage is active, the question `inert`, and the lines are staged. After the beat, "Armor 51.59 → 91.59" stays in its delta face and Chain Vest keeps its new-item mark.
- **Level-up beat, captured mid-beat:** "LEVEL UP" stamp; both banners at LV 7 in the changed state; "Board updating…" over the veiled question.
- **Phone unlock (375, arc F):** "Ultimate unlocked", then "LV 5 → 6", R lit and focused, and Ahri's armor delta.
- **Withheld (390, arc C child 1):** "ARMOR ?" with focus rings. The board's DOM never contains 44.195; it appears only as answer option C. The sheet reads "? — asked in this question".
- **State sheet on the phone:** both sides stacked, all stats by long label, no page overflow.

## 6. Tests
**New: 35 tests.**
- `src/lib/journey/contract.test.ts` (18):
  - every fixture reads;
  - one journey key per run;
  - per-side ranks;
  - side-order normalisation;
  - withheld has no value, and a withheld stat with a value (or `null`) is refused;
  - unknown and answer-bearing keys are refused at every level;
  - no key exists for a cooldown, damage or effective resistance;
  - a transition restating a withheld stat is refused;
  - contradicting events, bad focus refs, structural breakage and an unknown contract are refused;
  - the tolerant reader returns null;
  - beat instant boundaries;
  - marks; event lines; staging; formatting.
- `src/components/journey/JourneyModuleStage.test.tsx` (17):
  - one band node across children, and exactly one band;
  - the beat gate (inert and veiled until the server instant, open 1 ms after);
  - deltas persist after the beat;
  - a refresh after `until` plays no beat;
  - no instant means no beat;
  - the reveal hold keeps the previous state and defers the beat;
  - level, rank and unlock marks;
  - withheld `?` with the value nowhere in the DOM, sheet included;
  - no cooldown or damage on the board;
  - Matchup per-side ranks;
  - Combat roles and focus;
  - compact stat priority;
  - the sheet;
  - the banner crest replaces and then restores the role crest;
  - the phone crest;
  - a source guard: the Journey layer imports no calculation, combat, engine or service module.

**Focused suites, run together:** journey, ranked-arena, question-surface, quiz-broadcast, game-results, ranked-core, ranked-public, daily-challenge, question-surface lib, quiz-daily-challenge, quiz-ranked, the arena inspector and features/mastery.
- **Result:** 222 of 225 files, 2850 of 2856 tests.
- **The 6 failures are pre-existing:** identical by name at `fe33aaa7`, before any Lane C or Journey work:
  - `QuestionMotifLayer.qf1` (1)
  - `AnswerGrid.elimination` (2)
  - `QuestionStageGeometry` (3)

**Other checks:**
- `npm run build` passes.
- `tsc -p tsconfig.app.json`: 20 errors, all pre-existing, none in a touched file.

**Correction to the earlier stage-result commit `26ed7f0c`:** `components/ranked-arena/DailyOnCanonicalArena.boundary.test.tsx` failed 3 tests from that commit on. It was outside the suites that run covered. It is fixed here by narrowing the guard the same way `dailyRun.boundary` was:
- `DailyStageResult.tsx` and `stageResultModel.ts` are registered as Daily files;
- "Continue" is allowed only in `DailyStageResult.tsx`;
- every other manual-progression token is still banned.

The stage result's prop is renamed `onContinue` → `onProceed` so the page carries no "Continue" token.

**Pre-existing failures, reproduced on a clean worktree at `18b84d7f`, untouched:**
- `pages/dev/lobby-preview/syntheticRankedHistory.test.ts` (1)
- `pages/dev/lobby-preview/LobbyPreviewPage.test.tsx` (2)

`pages/dev/team-sim/TeamSimPage.phase5a.test.tsx` failed once under full-folder load and passes on its own.

## 7. Scope kept
- No Daily wiring, no stage-result change, no scoring change, no Champion Focus.
- No backend field beyond the provisional contract above.
- The Matchup and Combat card code paths are unchanged. The legacy per-child band still renders for every non-Journey slice.

## 8. Exact integration task once J2 returns (JOURNEY-UI2)
1. **Contract.** Replace the fixtures' wire with J2's real `segment_state.journey` samples, and re-run the reader tests on them. In `ranked-public/contracts.ts`, have `SegmentStateView` gain `journey: JourneyPublicState | null` via `tryReadJourneyPublicState(raw.journey)`, and confirm the pre-reveal walker passes it.
2. **Module.** In `masterySliceModule.tsx` `MasterySliceChallengePhase`:
   - when `state.journey` is present, wrap the keyed `MasterySliceChallengeSurface` in `<JourneyModuleStage state={state.journey} skewMs={skewMs} holdPrevious={holding !== null}>`;
   - thread `skewMs` from `ModuleViewportProps`;
   - add a `media="none"` prop to `MasterySliceChallengeSurface` so a Journey child skips its own `ScenarioMediaBand`, and pass `settings={{ mediaScale: "none" }}` on the prose path;
   - drop the "Opponent: X of N done" line above it only if design asks.
3. **Rails.** In `pages/quiz-ranked/QuizRankedMatch.tsx`, while the current segment's state carries `journey`, set `left.journey = journeyRailIdentity(journey, "subject")` and `right.journey = …("opponent")`. The viewer is always the subject; the bot's flank is the opponent champion. This applies to hosted and plain Ranked alike.
4. **Survival.** Once `own_stage_finished` is set, the arena already stops presenting gameplay (the hosted placeholder), so no later transition can play. Add one test asserting no `journey-beat` after the finish signal.
5. **Timing.** Confirm J2's `beat.until` ordering against `reveal_window_ms` and Standard's block deadline (§4.5), and adjust `holdPrevious` if the server sequences them differently.
6. **Certify.** Re-run the browser widths (375, 390, 1024, 1280, 1440) on a real Bot match with a J2 Journey, run the focused suites and the build, and commit locally.

---

# JOURNEY-UI2 — the Journey board on the REAL backend contract (J2)

Frontend only. Local commits on `dclane-c/daily-stage-result`, not pushed.
- **Code commit:** `f57a097c2c8e3d3b68438f54205dc505d7a5a224`. This handoff update is the commit after it.
- **Builds on:**
  - C2 Journey board `507445dc`
  - C2 handoff `8d2ef937`
  - Daily stage result `26ed7f0c`
- **Backend consumed:** `League_Combat_Simulator` `journey2/core` @ `52e9d929` (JOURNEY2), read-only. **J3 does not exist yet:** no branch, no handoff. Everything below stops at a clean adapter boundary (§2), and nothing guesses J3's wire.
- **Daily is not production-enabled for Journey.** J2's `journey_slice` is not requestable by the Daily yet (J2 §3), and nothing here changes the Daily run.

## 1. Backend contract consumed (J2, verified by real capture)
A Journey segment's `segment_state.challenges` public view is a **reached prefix**:

```
challenges: {
  prompt, challenge_count,               // challenge_count = the whole module (5 / 3)
  challenges: [ ...reached children only... ],
  journey: {
    journey_version: "mastery_journey.v1", recipe_id, recipe_version,
    title, role, arc_type, plan, child_count,
    children: [ {index, child_id, engine: champion|matchup|combat, domains,
                 state: {player|opponent: {champion, level, ranks:{Q..R}, items:[names]}},
                 premise: {ability_damage?: {ability_name, champion, slot, damage_type,
                                              flat_by_rank[], ratios[{stat,label,ratio}]}},
                 withheld: [{fact, what, slot, champion, established_in_child}],
                 asks: {engine, family, metric, subject_ref, subject, withheld: true},
                 reinforces: [i...]} ],
    transitions: [ {transition_id, kind: level|purchase|recall, note, beat_ms, before_child,
                    changes: [{side, champion, level:[from,to]|null,
                               ranks:{slot:[from,to]}, items_added:[{item_id,name,cost}]}]} ],
    open_delays_ms: [ ... ] } }
```

**Cursor semantics** (J2 `segment_flow.journey_cursor`), as observed:
- A child appears only once it **opens**.
- During a transition **beat**:
  - `own_next_challenge_index` has advanced;
  - the next child is **absent** from `challenges`;
  - the transition is present;
  - `own_card_started_at` is the future instant the server opens that child.
- A Survival stop exposes exactly the **played** prefix.

The Combat premise is the child's structured `prompt_semantics.scenario` pairs, plus the Journey block's `premise.ability_damage` when the formula is **stated**, or a `withheld` marker naming the teaching child when it is **recalled**. Reveals are the existing `own_challenge_reveals` (`correct_answer`, verbatim `explanation`).

**Real fixtures, all generated from J2:** `src/lib/journey/__fixtures__/j2/`, with provenance in `CAPTURE.md` and the harness in `capture_journey_test.py.txt`. They are 8 sequences of exact `GET /matches/{id}/public` envelopes, captured from real Bot matches on the canonical DB at each moment (lead-in, child open, reveal, beat, next open, Survival stop, pooled block). Coverage:
- all six J2 recipes: Olaf/Jarvan IV, Volibear/Garen, Zed/Ahri, Lucian/Caitlyn, Senna/Pyke, Ahri/Syndra;
- a Survival strike-out on child 2 of 3;
- a Standard v1 pooled block.

The R1 launch recipes named in the brief (Volibear/Lee Sin, Olaf/Sett, Pantheon/Leona, ...) **do not exist yet** in any backend branch, so no fixture was invented for them. Zed/Ahri and Lucian/Caitlyn exist in J2 and are captured.

## 2. The adapter boundary (the only provisional part)
| Layer | File | Swaps for J3? |
|---|---|---|
| J2 wire reader: typed allowlist, fail-closed | `src/lib/journey/j2.ts` | **Yes.** Add `j3.ts` beside it |
| Adapter: wire + viewer cursor -> board view model + per-child context | `src/lib/journey/adapter.ts` | **Yes.** Add a J3 branch |
| Board view model + board / rails / sheet / beat components | `lib/journey/contract.ts` types, `components/journey/*` | No |
| Parse hook | `ranked-public/contracts.ts` `readSegmentState` -> `segmentState.journey` | One line (which reader) |

**What the adapter shows, and from where** (all server values, nothing computed):
- **Board sides:** the latest reached child's node state.
- **During a beat:** the node after the transition. The transition's own lossless `changes` (level `[from,to]`, ranks `[from,to]`, `items_added`) are applied as given.
- **Focus:** from the current child's `asks`. Champion: the subject and slot. Matchup: both sides' slot. Combat: attacker and target by the asked subject.
- **Withheld `?`:** a Champion "stat at level" ask (`base_armor` / `base_attack_damage` / `base_health` / `base_magic_resist`) puts `?` on the asked side.
- **Marks:** a transition's marks show only while the child it precedes is on screen.
- **Beat instant:** `beat.until = own_card_started_at`, only while that child is still unexposed.

**What J2 does not publish, so the board does not show it** (no guessing):
- **Max rank:** ranks print as a number on the ability tile, never pips of a guessed length.
- **Numeric item ids on the state:** icons resolve for items that arrived in a transition (`item_id`); otherwise a monogram.
- **Ability names on the state.**
- **Per-side public stats and stat deltas:** J2 has no stat on the node. The Combat stats live in the child's premise (section 5).
- **Learner-state semantics:** the backend's `reinforces` link is rendered ("Builds on step N"). "Newly introduced / newly revealed" are J3's, and are not inferred.

## 3. Journey State Board integration (C2 design, unchanged)
- **Module level:** `masterySliceModule` wraps every branch (question, beat, between children, waiting) in one `JourneyModuleStage`, so the board mounts **once per Journey** and persists across children. This is proven by a test holding the same band DOM node from child 1 to 5 on a real capture.
  - The existing reveal hold drives `holdPrevious`.
  - `skewMs` is threaded from the viewport.
- **Media region:** the Journey child draws **no** band of its own (`JourneyChild`), and inside `.journey-question` the motif art and the structural views' progress/identity row (`data-mastery-meta`) are hidden. The board owns step, champions and art, so nothing is drawn twice. **Non-Journey modules take the untouched `OrdinaryChild` path.**
- **Rails:** `QuizRankedMatch` sets `rail.journey = journeyRailsFor(segmentState.journey, cursor)[side]` only while the live segment carries a Journey block.
  - Desktop banners show the champion crest in the mascot's exact box.
  - The phone match bar shows the champion with a level corner.
  - Without a Journey: the exact existing UI (asserted).
- **State sheet:** reads the same board view model. There is no extra fetch, withheld stays withheld, and nothing unpublished is printed ("rank 1", never "rank 1 / null").
- **Height budget** (desktop, height-locked card):
  - the Journey band is capped at 12.5rem from `lg` (what the band density needs);
  - the stage's region reserves are released **inside `.journey-question` only**;
  - the Journey question is the one region that may scroll when a long served reveal exceeds the card;
  - the board never shrinks.

## 4. Matchup rendering
- **Per-side context:** `comparison_semantics.side_contexts` is now read (`sideContexts`, optional; the key pin was updated deliberately — it is structural, like `context`).
- **Prompt:** when the two sides' ranks differ, each side names its own ("...: Garen E (Judgment) [rank 1] or Volibear E ... [same at every rank]?"). Identical sides keep the old sentence byte for byte. **There is no shared-rank assumption.**
- **Side strip:** a Journey-only `JourneyMatchupSides` strip shows each champion's ability and **own** rank, in the **board's** side order (the Journey player left), whatever the backend's A/B order.
- **Reveal:** the backend's explanation verbatim. It states both exact values ("Jarvan IV ... 120 seconds. Olaf ... 100 seconds.").

## 5. Combat rendering
- **Explicit renderer:** `JourneyCombatQuestion` shows the **served** premise in compact rows:
  - attacker: ability, slot and rank; AD / bonus AD / lethality / armor pen; level and items;
  - target: level, items, **armor**;
  - any unrecognised premise key: humanised, never dropped;
  - the formula: **stated** (flat by rank with the current rank underlined, plus each served ratio), **recalled** ("Formula: recall it — ... stated in step N"; the numbers are **not** restated), or absent;
  - a rounding instruction, only when served.
- **Question sentence:** built from the structured semantics, never from prose.
- **Answer:** through the Ranked prose surface.
- **Arithmetic: none.** The one conversion is presentational: a ratio coefficient written as a percentage (1 -> 100%).
- **Desktop duplicates:** from `lg`, level/items (which the board above also shows) are not repeated.
- **Reveal:** the backend's explanation verbatim ("110.268 damage, which rounds to 110 for this question"). J2 serves **no structured derivation** (raw -> effective armor -> mitigation -> final), so none is rendered and none is computed. **J3 dependency.**

## 6. Timing behavior
- **The client owns no clock.**
- **Beat:** the beat is the server's. The next child is not in the payload until it opens, so there is no question to enable early (J2 also refuses an early submit).
  - The board veils the question area until `own_card_started_at` (skew-corrected).
  - After that, "Step N of M is opening..." holds until the next poll exposes the child.
- **Between children:** a reveal hold ending before the next child opens now reads "Step N ... is opening...". It used to fall through to "Mastery Slice complete / Waiting for the opponent", which was wrong mid-Journey and is fixed.
- **Marks:** the level-up badge, rank digits, new-item rims and R unlocks stay for the whole following child.
- **Standard pooled clock:** the existing header clock shows the server's **one block deadline**. On J2 v1 that is 150 s plus reveal compensation ("2:21 of 2:37" on the real block capture): one clock, never five.
  - Holding the display still during reveal/transition needs a server field. J2's v1 block extends its deadline instead, and does not add beats (J2 section 7.2). **J3 dependency.**
  - Nothing is paused or recomputed locally.

## 7. Survival termination
- `live_strikes` / `own_stage_finished` (public ruleset) and the Daily equivalents are consumed as before (DC-SURV-UX / Lane C).
- When `own_stage_finished` flips mid-Journey, the hosted arena leaves gameplay at once. There is no board and no beat, the hidden child keeps polling for settlement, and **no transition or future child is shown**.
- **Tested on the real stop capture, through the real `QuizRankedMatch`:**
  - the stop itself;
  - the deferred C2 regression: a transition present on the wire at the moment of the stop still never plays.
- The stopped Journey view is the played prefix only, with no pending child.

## 8. Tests
**New:**
- `lib/journey/j2.adapter.test.ts` (28):
  - every real snapshot parses through the real `readPublicRound`;
  - the `cost` carve-out is exactly one path wide (`cost` anywhere else still fails the walk);
  - unknown or answer-bearing Journey keys fail the read;
  - an unwithheld `asks` fails;
  - adapter cursor/beat/marks/focus/withheld/Combat/Survival on real data;
  - no child's answer on its own board before its reveal (6 recipes);
  - an out-of-order prefix fails.
- `lib/ranked-core/modules/masterySliceModule.journey.test.tsx` (23, real captures through the real viewport):
  - persistence;
  - media ownership;
  - ordinary slices untouched;
  - **answer leaks:**
    - future child text is not rendered;
    - a future item transition is not rendered before its beat;
    - current-child premises do not appear before reach;
    - the withheld answer is in neither the board DOM nor the State sheet DOM;
    - a previously revealed fact appears later only when served;
    - no unanswered child's answer on board or sheet, across 6 recipes;
  - server-timed beat, level-6 beat, between-children message;
  - Matchup per-side;
  - Combat stated/recalled;
  - verbatim reveal;
  - Survival stop.
- `pages/quiz-ranked/QuizRankedMatch.hosted.test.tsx` (+3, real captures through the real hosted `QuizRankedMatch`):
  - Journey crests replace the role mascots, and the board is present;
  - the real Survival stop leaves gameplay with no board and no beat;
  - **no transition after `own_stage_finished`**.

**Updated deliberately:**
- `features/mastery/contracts/comparisonSemantics.test.ts` (`sideContexts` in the structural key pin).
- The C2 inspector Journey states now render real captures.

**Focused regression:** journey, ranked-arena, question-surface, quiz-broadcast, game-results, ranked-core, ranked-public, daily-challenge, question-surface lib, quiz-daily-challenge, quiz-ranked, arena inspector, features/mastery.
- **224 of 227 files, 2904 of 2910 tests.**
- **The 6 failures are the known pre-existing set, identical by name to C2's and base `fe33aaa7`'s**, and their offender arrays keep their base lengths:
  - `QuestionMotifLayer.qf1` (1)
  - `AnswerGrid.elimination` (2)
  - `QuestionStageGeometry` (3)

**Other checks:**
- `npm run build` passes. The harness is a 6 kB lazy chunk; captures load on demand via `import.meta.glob`.
- `tsc`: the same 20 pre-existing errors, none in a touched file.
- **Noted, not touched (pre-existing):** `QuizRankedMatch.hosted.test.tsx:348` has a literal backspace inside a regex (`/^\bvs\b/` was mangled).

## 9. Browser certification (real captures, real arena, `/dev/journey-arena`)
Every snapshot of all 8 captures (85 per width) was replayed at each width. For each one I measured: page overflow, card body fit, board and side overflow, the Journey question's internal scroll, phone band height, phone crest and match bar.

| Width | Result |
|---|---|
| **1440x900** | No overflow of any kind. The Journey question scrolls <= 25 px, only during Volibear's Combat reveals. |
| **1280x800** | No overflow. The Journey question scrolls 19-109 px only while a Combat reveal's long served explanation is up; the card never clips. |
| **1024x768** | No overflow; the card body fits (546/546) at every step. Worst case is a Combat reveal: the question scrolls about 105 px while the board keeps its 200 px band. |
| **390x844** | No overflow (scrollWidth 390). The band is a constant 127 px (no jump). Champion crest in the match bar at every step. |
| **375x812** | No overflow (scrollWidth 375). The band is a constant 121 px. Crests present. |

**Also checked visually:**
- the board persisting;
- the server-timed recall beat with the veiled next step;
- the level-6 beat raising both levels and unlocking both Rs;
- Matchup per-side ranks;
- the Combat premise with a stated formula, and with a recalled one;
- the phone State sheet (both sides, no gaps printed);
- the pooled block clock;
- the Survival stop placeholder.

## 10. Remaining backend dependencies (J2 -> J3)
1. **Blocker for going live:** J2's public route raises on its own guard (`answer_safety` bans `cost`) as soon as a purchase transition is visible: `items_added[].cost`. The frontend accepts `cost` at that path only; the backend must scope its guard or rename the key.
2. A public per-side **stat** projection and **stat deltas** (e.g. "Armor 51.59 -> 91.59", "AH 0 -> 10") on the node/transition. J2 has neither; the board is ready for both.
3. **Max rank**, ability names and numeric item ids on the node state (for pips and icons).
4. A structured **Combat derivation** on the reveal (raw -> effective armor -> mitigation -> final), in served numbers.
5. **Learner semantics** (newly introduced / newly revealed / reinforced) as fields. Also J2's ledger policy (`introduced_only`, reveals do not establish) versus J3's "established once stated OR revealed".
6. **Standard's pooled active clock:** 150 s active time with reveal/transition beats **not** consumed, plus a field the display can hold still during a beat. J2 leaves Standard untouched, and its v1 block adds no beats.
7. The J2 Survival carrier's post-match **review gating** to the played prefix (J2 section 7.1).
8. The **R1 launch recipes**, when they exist; recapture with the same harness.

## 11. Exact final integration task (when J3 lands: JOURNEY-UI3)
1. **Capture J3:** re-run `__fixtures__/j2/capture_journey_test.py.txt` against the J3 branch into `__fixtures__/j3/` (Standard v2 or the new pooled clock, Survival stop, every R1 recipe), with **no guard narrowing** (J3 fixes item 1).
2. **Reader:** add `src/lib/journey/j3.ts` (typed allowlist) and a J3 branch in `adapter.ts`. Map:
   - stats and deltas -> `JourneySide.stats` / `stat_delta` events;
   - `max_rank` -> pips;
   - item ids -> icons;
   - learner semantics -> the board's focus/marks only if J3 sends them;
   - pooled-clock hold field -> the header timer's `paused`.

   Keep `j2.ts` until the backend retires J2.
3. **Combat reveal:** render the served derivation steps in order (raw -> effective armor -> mitigation -> final), verbatim numbers, in `JourneyCombatQuestion`'s reveal.
4. **Daily:** after J3's `journey_slice` is requestable (J2 section 8), run the Daily Standard M10 and Survival slots end to end in a real Bot match. Confirm the hosted flow, stage result and Survival stop, and re-certify 375/390/1024/1280/1440.
5. Run the focused suites (compare against the 6 known failures) and the build, commit locally, and do not push.


---

# JOURNEY-UI3 — the Journey on the ACTUAL J3 contract, played through the real Daily

Frontend only. Local commits on `dclane-c/daily-stage-result`, **not pushed**.
- **Base:** `68fa8230e568a222d33dc86bb043a58a66d215e1` (UI2 handoff tip; UI2 code `f57a097c`, C2 board `507445dc`, C2 handoff `8d2ef937`).
- **Final:** the code commit and this handoff commit after it (`git log --oneline -3`).
- **Backend tested:** `League_Combat_Simulator` `journey3/daily` @ `174747b60e6ca73190de88297b75c097806d4ecb`, read-only. Every capture, both live Daily runs and every finding below are against this SHA.
- **J4 (`journey4/catalog-reconcile`) finished during this task, at `a273a2165842cc181df5b90b43da8e3ce04dd559`.** The final recipe recapture was run against it (§1.1).
  - All five reconciled recipes were captured in both plans, plus a strike-out and an exhaustion.
  - J4 changed **content only**; the public contract is unchanged.
  - Every J4 snapshot passes the production parser, the J3 reader, the adapter and the leak invariants.
  - The live Daily runs (§7, §8) were played on J3 `174747b6` (with J3's reconstructed recipes). **A live replay on J4 was not done**; the J4 content was certified through captures and the harness.

## 1. Captured J3 contract (real HTTP, no guard narrowing)
Harness: `src/lib/journey/__fixtures__/j3/capture_journey3_test.py.txt` (provenance in `j3/CAPTURE.md`). Each snapshot is the JSON the real route `GET /api/ranked/matches/{id}` returned (FastAPI TestClient over `api_server.app`, canonical DB read-only). The Bot matches' only module is **the Daily's own Journey module**, built by the Daily recipe's spec builders (`_journey_spec`: v2, 5 children, `active_time_seconds=150`; `_survival_journey_spec`: v2, 3 children, 30 s). The backend's public guard ran **unmodified**.

Captures: the five launch recipes × Standard and × Survival (10); a Survival **strike-out inside the Journey** (strike 3 on child 2 of 3); a Standard **pool exhaustion**; and `review.reask.json`, the real Daily Review child read from the live stack (§6, B3).

`segment_state.challenges.journey` (reached prefix only):
```
{ journey_version: "mastery_journey.v1", public_state_contract: "journey_public_state.v1",
  ledger_policy, reveal_policy, recipe_id, recipe_version, title, role, arc_type, plan, child_count,
  children: [ { index, child_id, engine, domains,
      state: { contract, state_version, state_key,
               sides: { player|opponent: { side, champion_id, champion, level,
                          abilities: [{slot, name, rank, unlocked}],   // E,Q,R,W order on the wire
                          inventory: [{item_id, name}],               // NO cost
                          stats: { <premise stat>: number | "recalled" } } },
               focus: {engine, objective, side|sides, slot|stat, target_side?},
               withheld: [{side, field: "stats.armor" | "abilities.Q.cooldown" | ..., reason: asked|recalled,
                           fact?, established_in_child?}] },
      premise: {ability_damage?: {ability_name, champion, slot, damage_type, flat_by_rank, ratios}},
      withheld: [{fact, what: ability_damage|target_armor, champion, side?|slot?, source: stated|revealed,
                  established_in_child}],
      asks: {engine, family, metric, subject_ref, subject, withheld: true},
      learner: {established: [{fact, kind, label, source, value, child}], relies_on: [...], states: [...]},
      reinforces: [i...] } ],
  transitions: [ { transition_id, kind: level|purchase, presentation: first_back|null, note, beat_ms,
                   before_child, state_version,
                   events: [ level_up{side,from,to} | ability_rank_up{side,slot,from,to,unlocked}
                           | item_acquired{side,item_id,name} | stat_change{side,stat,delta,source} ],
                   changes: [lossless legacy record; items_added {item_id, name} only] } ],
  open_delays_ms: [...] }
```
Pooled clock fields on the segment state: `active_time_ms` (150000), `active_time_remaining_ms`, `active_time_running`; `card_timer_ms` is null, and `own_card_deadline` = open + remainder (during a reveal or beat it is the NEXT child's open + remainder). Survival: `card_timer_ms` 30000.

Daily Review re-ask (`reask: true`): `{journey_version, reask, public_state_contract, children: [one child, no child_id], transitions: [], open_delays_ms: [0]}`. It is self-contained (nothing recalled). It is not in J3's §10 contract; it was found in play (B3).

### 1.1 Final recipe recapture on J4 (`a273a216`)
`__fixtures__/j4/` (provenance in `j4/CAPTURE.md`) holds the same harness run with J4's recipe ids, through the real HTTP route with no guard narrowing. It has 12 files: the five R1 recipes × Standard and × Survival, plus a strike-out and an exhaustion. What changed for the frontend:
- **Two transitions can now precede ONE child.** J-A child 5 has level + purchase, played as one 3.5 s beat. Pantheon child 5 has level + first-back purchase. The adapter groups them and sums the beat (tested).
- The recipe ids lost their suffixes (e.g. `bot.lucian_vs_caitlyn`). The titles are "Lucian vs Caitlyn" etc.
- Otherwise the same vocabulary. `j4.recapture.test.ts` runs every J4 snapshot through parse → no gold → adapt → a server-only beat → no unrevealed answer on the board.

### Field status (the brief's list)
| Wanted | Status |
|---|---|
| champion identity, level, ranks, ability names, unlocked | **exists** |
| item ids (icons) | **exists** (`inventory[].item_id`) |
| per-side public stats | **exists**, but only the stats this child's premise states |
| withheld / recalled markers | **exists** (`state.withheld`, with reason and teaching child) |
| stat deltas | **exists as DELTAS** (`stat_change.delta`), never totals. Rendered as "+20 AD (Serrated Dirk)" and "▲20"; no total is computed |
| state version / key | **exists** (used for keys, not displayed) |
| focus / combat roles | **exists** (`state.focus`) |
| learner semantics (stated / revealed / relied-on) | **exists**. Rendered only as recall provenance ("recall · revealed in step 1") |
| max rank | **missing**: ranks still print as numbers (unchanged from UI2) |
| structured Combat working | **missing**: prose only (§4) |
| item gold | **absent by design** (J3 §12.6) |

## 2. J2 adapter status and the cost blocker
- **The J2 cost blocker is gone on the real HTTP route.** Every purchase-transition envelope (`*.standard` child3-beat, `*.survival` child2-beat) passes the backend guard. No capture has a `cost`, `price` or `gold` key anywhere (a test checks every file).
- **UI2's accommodation is removed, which makes the contract stricter.** The Journey block is **no longer lifted out** of the generic pre-reveal walk (`ranked-public/contracts.ts`). It goes through the same walk as every other key, then through J3's exact allowlist. A `cost` reintroduced anywhere in the block (changes, events or sides) now fails the whole segment (tested).
- **Production parses J3 only.** A block without `public_state_contract` (J2) is refused with `not a journey_public_state.v1 block`. `j2.ts` and `adaptJourneyJ2` are kept **isolated**, with their own test and one kept J2 capture; the other J2 captures were deleted.
- **The view model carries no item gold at all.** The v0 fixture reader now refuses `cost` too, and gold is gone from the beat lines.
- The generic answer-safety guards are untouched.

## 3. Pooled clock (server-authoritative)
`projectJourneyTimer` (`pages/quiz-ranked/rankedViews.ts`) is used by `QuizRankedMatch` only while the live segment is a Journey.
- **Standard.** The digits are `min(active_time_remaining_ms, own_card_deadline − server now)`.
  - While a child is open, it ticks down to that child's deadline.
  - During a reveal or beat, the server's deadline is the NEXT child's open + remainder. The display therefore **holds exactly at the server's remainder** and starts counting at the server's own open instant, with no client pause and no poll needed.
  - `paused` (the existing "Paused" face) is the server's `running: false`, and only until that instant.
  - Exhaustion shows 0.
- **Survival.** `min(card_timer_ms, own_card_deadline − now)`: the child's own 30 s, full and still until it opens. The old header showed the round's projected block (~95 s).
- **Why the round clock was wrong.** For a pooled Journey the round's `active_deadline` is the projected end of the block. It moves with every reveal and beat (captured: 2:36 → 2:42 → 2:37 → 2:45), so the old header ticked through reveals and jumped between polls.
- The ticks are anchored on the child's own deadline (`useCountdownNow`).
- **Measured live** in a real Daily, module 10:
  - the clock ran only while a child was answerable;
  - at each submit it froze (e.g. 2:13 held through the 1.75 s reveal, and 2:17 held through the reveal plus the 2.5 s Pickaxe beat);
  - it resumed at the server's open instant;
  - a reconnect (page reload mid-Journey) showed the server's remainder;
  - exhaustion (run 1, child 4 left open) ended the Journey on child 4, child 5 was never presented, and the Daily moved on to the stage result.
- The clock's secondary line still shows the duel standing ("TIED", "BEHIND BY 22 PTS") rather than "of 2:30 Journey time". The boundary guard (`DailyOnCanonicalArena.boundary`) forbids Ranked from supplying `timerNotes`, so no note was added (see §9, comprehension).

## 4. Combat reveal
- **What J3 sends, structured:**
  - the formula disclosure: either stated (`premise.ability_damage`) or a `withheld` formula recall naming the teaching child;
  - the attacker's stats;
  - the target's armor: a stated number, or `"recalled"` with the teaching child and its source;
  - penetration, levels and items.
- **The reveal is still server prose only.** Example: `"... ability physical damage after armor at Caitlyn target, 4 target level, none target items, recalled target armor, ...: 83.548 damage, which rounds to 84 for this question."`
- **No structured working is served.** J3 has no raw → effective armor → mitigation → final breakdown, so none is rendered, none is computed, and no prose is parsed. **Backend follow-up:** a structured `working` on the Combat reveal.
- **How a recalled target armor is rendered:**
  - premise: "recall · revealed in step 1";
  - board chip: "recall · step 1";
  - state sheet: "recall it — revealed in step 1".
- **How a recalled formula is rendered:** "Formula: recall it — ... stated in step 3".

## 5. Learner state
- **Correctness is never read.** The adapter does not look at reveals; a test flips every `is_correct` and the view does not change. Progression is the server cursor.
- The ledger's "revealed" provenance is rendered where a question relies on it (§4).
- `learner.established` values are **not** shown, because a recall question asks the player to remember them.
- Verified on the wire: child 1 was answered wrong in every Standard capture, and child 2's `learner.established` still lists child 1's fact with `source: revealed`.

## 6. Code changes (frontend)
| Area | Change |
|---|---|
| `lib/journey/j3.ts` (new) | Typed allowlist reader for J3 and for the Review re-ask shape. Cross-checks: an asked stat is absent, `"recalled"` appears only where the state names a recall, stats come from the closed vocabulary, children are a contiguous prefix, and the retired `recall` kind is refused. |
| `lib/journey/adapter.ts` | `adaptJourneyJ3`: the board comes from the latest reached child; the beat from typed events; withheld and recalled stats; focus; child context including the recall `source` and `boardStats`. The J2 adapter is isolated. |
| `lib/journey/contract.ts`, `beat.ts`, `stats.ts` | Stat `withheldReason` / `recalledFrom`; a `stat_change` event; the purchase group `first_back`; no gold; the formatter keeps every served digit. |
| `ranked-public/contracts.ts` | The Journey block goes through the generic walk and then the J3 reader; the pooled-clock fields are parsed. |
| `components/journey/*` | Recalled-stat face, the "▲N" corner badge, the "First back" stamp, the sheet's recall text, and the Combat premise's recall display and on-board de-duplication. |
| `rankedViews.ts`, `QuizRankedMatch.tsx` | The Journey clock (§3). |
| `useRankedMatch.ts` | Journey server-instant polls (B1). |
| `masterySliceModule.tsx` | J3 adapter; for a Journey, the reveal hold is gated on the server's revealing index (B10). |
| `SegmentTranscript.tsx` | A `mastery_slice` settlement is named "Mastery" (B2). |
| `index.css` | From `lg`, inside `.journey-question` only: the category row is hidden and the heading is 1rem (B5). At every width, a Journey's surface wrapper is not vertically centred (B9). |
| dev harness / inspector | J3 captures and the production clock. |

## 7. Standard end-to-end (the real frontend Daily flow)
**The live stack:**
- Backend: the real `api_server.app`, served by a scratch h11 ASGI server (uvicorn is not installed), over **J3's own `canonical_daily` fixture chain**.
  - Real: the Daily routes, planner, recipes, Ranked service, bot, pooled clock and Survival ruleset.
  - The Journey is composed by the REAL `compose_journey` on the canonical DB.
  - Splash and MR content are stubbed exactly as the Daily fixture stubs them.
  - The clock is real UTC time.
- Frontend: the real frontend (`vite`, `VITE_E2E_AUTH=1`) in the browser.
- None of the harness is committed.

**Run 2 (clean, after the fixes):**
1. Daily entry: "Today's Challenge" → Begin → Standard.
2. The frozen format, read from the DB, is `quiz quiz quiz quiz MR quiz quiz quiz MR mastery_slice(journey, 5, 150 s)` = **S S S S MR S S S MR JOURNEY**.
   - Module 10 is `bot.lucian_vs_caitlyn.lane_pressure`, today's rotation head, as J3 predicts.
   - The header reads "10 / 10 · FINAL".
   - The Journey is ONE module on the timeline (node 10), with its five children inside it.
3. Module 10 opens with a 2.9 s lead-in, the clock held at 2:30 (paused).
   - The board mounted once and stayed the same node through all five children.
   - Champion crests replaced the role mascots.
4. The five children, with 4 s think time each:
   - Caitlyn's armor at level 4, shown as `?` → answered 38 ✓.
   - Matchup, Q cooldown, Lucian Q rank 2 vs Caitlyn Q rank 2 in board order → reveal "...9 seconds. ...8 seconds. Lucian wins by 1 seconds." ✓
   - Combat with a stated formula and recalled armor → 84 ✓.
   - **First-back beat** (Pickaxe): stamp "First back", "+25 AD (Pickaxe)", visible 2.3 s of 2.5 s.
   - Combat with a recalled formula and recalled armor → 102 ✓.
   - **Purchase beat** (Caitlyn's Cloth Armor): visible 1.9 s of 2.0 s.
   - Combat with the armor stated → 92 ✓.
5. The DB has five child records, all `correct`. The header settlement reads "Mastery ... +5".
6. The Daily stage result: "STAGE COMPLETE · Standard · 6 / 10 correct · Answered 10 · 60% · 24 pts · 11 for review · Up next Time Trial · Continue". There is no Victory or Defeat.
7. Continue → Time Trial → its result ("Time's up · The bank ran out") → Continue → Survival → Review → "Daily Challenge Complete" (Standard 6/10, Time Trial 0/4, Survival 4/6 out of mistakes, Review 3/3).

**Run 1 (before the fixes):**
- It found bugs B1, B2 and B3.
- It exercised pool **exhaustion** and a **reconnect** live. A Vite hot reload crashed the page mid-child-4; that is a dev-only Fast Refresh hook-order artefact. The reload landed on the settled Standard result, with child 4 `timeout` and child 5 absent.

## 8. Survival end-to-end
**Run 2:**
1. Splash 1 was answered wrong on purpose (strike 1); Splash 2–5 were correct.
2. Slot 6 is the Journey: the same recipe, **3 children, 30 s each**. The header showed 0:30, held through reveals, then counting down.
3. Child 1 wrong (strike 2), child 2 wrong → **strike 3 mid-Journey**.
4. Within 400 ms the arena was gone and the Survival result was shown: "OUT OF STRIKES · 4 correct · Answered 6 · 67% · Finish: Out of mistakes · 3 for review".
5. **Child 3 and its Pickaxe transition never rendered.**
6. DB: the Journey rows are (6,0 incorrect) and (6,1 incorrect), and there is nothing for child 2.
7. Match review (`GET .../review`): `journey_reached_children: 2`, challenges [0, 1], 2 Journey children, transitions [] — the reached prefix only.

**Run 1 (with the B1 fix):** the beat was visible 2.30 s of 2.5 s, and the child was exposed 0.10 s after the server opened it.

## 9. ACTUAL PLAY FINDINGS
### Bugs
- **B1 (fixed): poll latency burned pooled time and truncated beats.**
  - On the 1.5 s poll, a child appeared 0.5–1.0 s after the server opened it. The clock was already running over "Step N is opening...".
  - The 2.5 s purchase beat was visible for only 1.25 s, because the transition is published when the beat starts.
  - Fix: for a Journey, poll at `own_card_started_at` and at the end of each new reveal window.
  - After the fix: the child is visible ≤ 0.1 s after it opens, and the beats are visible 2.3 s of 2.5 s and 1.9 s of 2.0 s.
- **B2 (fixed): the header named a Journey "Item Cost Duel".** `segmentTitle` treated every settled segment as an ICD or Meta Reflex block, so a `mastery_slice` v2 settlement read "Item Cost Duel loss: you 2/3...". It now reads "Mastery", the live header's existing name.
- **B3 (fixed): Daily Review could not play a re-asked Journey child.** Review re-asks a Journey miss as a one-child `reask: true` block. The strict reader refused the unknown key, so the Review match showed "This match needs a newer client" and then timed out. The reader now accepts that exact shape.
- **B4 (fixed): the board rounded a served premise.** It showed "AD 70.162" beside the premise's "70.1625"; J3 states four decimals.
- **B5 (fixed): at 1024×768, a live Combat child's answers were cut off** and "Lock in" sat 57 px below the card's fold. J3's premise card repeated every stat the board now shows. Fix: the on-board de-duplication (UI2's own rule, extended to J3's board stats), plus, from `lg` inside `.journey-question`, a hidden category row and a 1rem heading.
- **B6 (fixed, found on the wire): the header clock** (§3). It ticked through reveals and beats, and in Survival it showed the block instead of the child's 30 s.
- **B9 (fixed): the board jumped during every transition beat.** During a beat the next child is not in the payload yet, so the module shows a one-line placeholder. The arena's surface wrapper centres short content (auto block margins), so the whole board slid to the middle of the card and back: 1440 band y 133 → 262 → 133, and 390 band y 159 → 332 → 159. A Journey now takes the body from the top at every width (a `:has(> .journey-viewport)` rule), and the band position is constant through reveal → placeholder → beat → next child (§10).
- **B10 (fixed): a reconnect replayed the last reveal over an open child.** On a fresh mount, UI2's reveal hold re-armed for the latest settled child and showed its reveal for a full 1.75 s. This happened even when the server had already opened the next child: the board showed child 5 and the pooled clock was running, while the question area showed child 4's reveal (found in the width sweep). For a Journey, the hold is now entered only while the server's `own_revealing_card_index` still names that child. A reconnect during the real reveal still shows it (tested both ways).
- **B7 (open, Daily chrome): "STRIKES 0/3" after a Survival strike-out.** The stage chrome resets to 0 on the result screen right after "Out of strikes".
- **B8 (open, not reproduced): the Time Trial arena stayed on "BANK 0:40"** after the server had already ended the stage (`time_bank_exhausted`, `own_stage_finished`). A reload showed the result. Run 2 did not reproduce it. This is outside the Journey.
- **Not a product finding:** in run 1, Survival reached Review about 1 s after I restarted my automation. I cannot rule out that the harness clicked Continue.

### Comprehension issues
- **The Combat reveal is a label dump** (§4), and it never states the recalled armor value it used. A player who got it wrong cannot see why.
- **One change has two names.** The beat says "+25 AD (Pickaxe)" (a `stat_change` on `attack_damage`), while the next premise and the board show "Bonus AD 25".
- **The clock's meaning is not shown.** Nothing on screen says the Standard clock is ONE 150 s pool for five questions; the secondary line shows the duel standing instead. Survival's per-child clock looks the same.
- **Duel framing inside the Daily arena header:** "Mastery loss: you 5/5 · opp 5/5 · +5".
- **The stage summary mixes grains.** "Answered 10 / 6 correct" counts the five-question Journey as one module, while "For review 11" counts questions.
- **Two answer CTAs in one Journey.** Structural children use "Submit answer" (radio buttons); Combat children use "Lock in answer" (tablets).
- Copy: "Lucian wins by 1 seconds."
- **The beat repeats its note.** For a single purchase, the stamp's label ("Zed buys Serrated Dirk.") and the first event line ("ZED BUYS SERRATED DIRK") say the same thing. Both are served (`note` and `item_acquired`); presentation was left as is.
- **A board state is not shown during a beat.** J3 publishes the next child's premise stats only when that child opens, so the band's stat row is empty for the beat (by design, rather than showing stale numbers). Only the event lines carry the deltas at that moment.

### Pacing issues
- **The final child's reveal is never shown.**
  - Module 10 is the last module, so the last answer completes the match.
  - The arena hands back to the stage result 1.5 s later (measured), with no reveal of child 5; its explanation is never seen.
  - The same happens for the Survival child that strikes out and for the Survival Journey's last child.
- **Measured cadence** (Standard, 4 s think time): answer → 1.75 s reveal → beat where present (2.5 s or 2.0 s) → next child. The lead-in before child 1 is 2.9 s, with the clock held.
- Once polled on time (B1), the beats fit their windows.

### Content issues
Observed in play on J3's reconstructed recipes, then re-checked against J4's reconciled captures:
- **Survival repeats Standard.** The day's Survival slot 6 is the same recipe, and its first question was identical to Standard's (same text, same four options). This is J3's blocker 4, confirmed in play on J3. It was not re-verified live on J4.
- **J3 reconstruction:** every recipe opened with "the opponent's armor at level N". **J4 (R1):** four of five open with a cooldown of the Journey's own ability. Only S-A keeps the armor lesson.
- **Combat density on one ability** (J4):
  - Zed Standard is 3 Combat children on E (Survival: 3 of 3 Combat on E);
  - Lucian Standard is 3 Combat children on Q;
  - Pantheon Standard is 3 Combat children on E.
  - In J3 the Lucian recipe was likewise 3 of 5 on Q.
- The **Matchup** child now comes last in J4's J-A and M-A (R vs R), right after the level-6 beat.

## 10. Browser certification
**Automated sweep.** Playwright drove headless Edge through the real `/dev/journey-arena` (production parser, `masterySliceModule`, `CanonicalArena`) with a fresh page load per snapshot. Live children were probed after the reveal hold had expired. The run covered every snapshot of all 23 captures (12 J3 + 11 J4) at each width: 418 snapshots per width, 329 of them showing a board. It measured:
- page overflow;
- board and side overflow;
- answers or lock-in horizontally outside the card;
- (desktop) any answer control below the visible question area;
- truncated chips;
- band size and **band y-position**;
- the Journey question's internal scroll.

| Width | Board snapshots | Issues | Band (w×h) | Band y | Live-question scroll | Reveal scroll |
|---|---|---|---|---|---|---|
| 375×812 | 329 | 0 | 337×121 (constant) | 159 (constant) | 0 | 0 |
| 390×844 | 329 | 0 | 352×127 (constant) | 159 (316) / 139 (13)* | 0 | 0 |
| 1024×768 | 329 | 4 × 2 px** | 446×200 (constant) | 127 (constant) | ≤ 2 px | ≤ 97 px |
| 1280×800 | 329 | 0 | 584×208 (constant) | 127 (constant) | 0 | ≤ 41 px |
| 1440×900 | 329 | 0 | 584×200 (constant) | 133 (constant) | 0 | 0 |

\* The 13 are the dev harness's own chrome line wrapping for longer capture labels. Production's Daily chrome is one fixed line.
\*\* In J4's Volibear cooldown-under-haste child (structural, 4 options), the Submit button's box ends 2 px inside the scroll area. It is fully visible in the screenshot, so this is not clipping.
- Reveals may scroll inside the Journey question (a long served Combat explanation), as UI2 allowed. The board never shrinks.
- The harness's settled-match stand-in (`CanonicalArena view={null}`) overflows by 4 px at 375/390. That is harness-only: production shows `DailyRunPage`'s own settling screen. Separately, the **Daily page shell** itself has a 4 px `scrollWidth` excess at 375 in the pane (no element box exceeds the viewport). It is pre-existing and outside the Journey; not chased.
- Before the fixes, the same sweep found B5 (1024 Combat answers below the fold), a chip overflow from a delta badge (replaced by the chip's "changed" face), and, in a targeted beat measurement, B9 (the board jump).

**Visually inspected** (headless screenshots, the harness pane, and the live pane):
- Champion fact with a withheld stat: 375 (harness) and 1440 (live Daily).
- Matchup, per-side: 1440 (live Daily).
- Combat with a stated formula and recalled armor: 1024 before and after B5 (harness), 1440 (live Daily).
- Combat with a recalled formula: 1440 (harness); this is the shot that exposed B10.
- The reveal, with the pooled clock "2:06 · Paused": 1440 (harness).
- The purchase ("First back") beat, with its "Board updating…" veil: 1440 (harness); this exposed B9.
- The level-6 beat: 390 (harness).
- The J4 double-transition beat ("Both champions reach level 6. · Lee Sin buys Cloth Armor."): 1440 (harness).
- The J4 structural child at 1024 (the 2 px case).
- The Survival child clock (0:30) and the Survival strike-out: live, 1440.
- The Daily stage results (Standard, Time Trial, Survival "Out of strikes", Review) and "Daily Challenge Complete": live, 1440.
- The completed day at 375: live.

**Not visually inspected at phone widths in the live flow:** the stage results. They are Lane C's certified component, unchanged here.


## 11. Tests
**New or rewritten** (all on real captures):
- `lib/journey/j3.adapter.test.ts` (59):
  - every J3 capture through `readPublicRound`;
  - **the J2 cost blocker:** a real purchase transition passes the guard, the walk and the allowlist; no gold key anywhere (every file); a `cost` reintroduced in changes, events or sides fails the whole segment; the J2 block is refused;
  - allowlist refusals: answer-bearing keys, an asked stat with a value, an unnamed `"recalled"`, a non-vocabulary stat, an unwithheld ask, retired `recall`, a broken prefix;
  - adapter: board, withheld `?`, recalled provenance, **learner** (a wrong answer still teaches; the view is independent of `is_correct`), transition absent before its reveal and present during its beat, typed events and deltas, marks persisting, level/unlock, no transition after `own_finished` or exhaustion, no unrevealed answer as a board value in any capture;
  - the Review re-ask (parse, board, refusals).
- `lib/journey/j4.recapture.test.ts` (14): the contract invariants over every J4 snapshot, plus the double transition grouped into one beat.
- `pages/quiz-ranked/journeyTimer.test.ts` (8): **pooled clock**:
  - it counts only while open, is held through a reveal and through a beat, and resumes at the server's open instant;
  - a reconnect reads the same remainder;
  - the round deadline is not used;
  - exhaustion shows 0;
  - Survival shows 30 s per child;
  - a non-Journey segment gets no Journey clock.
- `lib/ranked-core/modules/masterySliceModule.journey.test.tsx` (25):
  - the board persists child 1 → 5, owns the media region, and ordinary slices are untouched;
  - **answer-withholding**: no future child, transition or premise shown; `?` on both the board and the sheet; a recalled armor with no number; no unanswered answer on the board or sheet for all five recipes;
  - **the server-timed beat / reveal hold**;
  - **Matchup per-side ranks**, in board order even when the wire lists the opponent first, with a verbatim reveal of both values;
  - **the Combat renderer**: stated formula, recalled formula and armor, the exact served digits on the board, on-board de-dup, a verbatim reveal, and no working rendered;
  - the Review re-ask renders;
  - **reconnect** while the next child is open does not replay the old reveal, and a reconnect during the server's reveal still shows it (B10).
- `pages/quiz-ranked/QuizRankedMatch.hosted.test.tsx` (+6, rewritten on J3, through the real **hosted `QuizRankedMatch`**):
  - crests;
  - the pooled clock digits, both running and held (reveal, beat);
  - Survival's per-child clock;
  - **a Survival strike-out mid-Journey** leaves gameplay with no board, no beat and no future child;
  - no transition after `own_stage_finished`.
- `lib/journey/j2.adapter.test.ts` (5): the isolated J2 reader, and production refusing J2.
- `components/ranked-arena/SegmentTranscript.test.tsx` (+1): a `mastery_slice` block is "Mastery".
- Deliberate pin updates:
  - `contract.test.ts` and `JourneyModuleStage.test.tsx`: gold removed from the beat lines; `withheldReason`; the formatter keeps four decimals (+1 test).

**Daily module ordering, result transition and Continue** are covered by the existing Daily suites (inside the focused set) and were verified live (§7). **Responsive geometry** was checked by the browser sweep (§10).

**Focused regression.** The suites: journey, ranked-arena, question-surface, quiz-broadcast, game-results, ranked-core, ranked-public, daily-challenge, question-surface lib, quiz-daily-challenge, quiz-ranked, arena inspector, features/mastery.
- On the final code: **230 files, 2975 tests, 2969 passed.**
- **The 6 failures are the known pre-existing set, identical by name to C2/UI2:** `QuestionMotifLayer.qf1` (1), `AnswerGrid.elimination` (2), `QuestionStageGeometry` (3).
- A mid-task run caught one new failure, `DailyOnCanonicalArena.boundary` (Ranked must not supply `timerNotes`). It was fixed by removing the note, not by relaxing the guard.

**Other checks:**
- `tsc -p tsconfig.app.json`: no error in any touched file (the pre-existing unrelated errors remain).
- `npm run build` passes on the final code (`built in 26.56s`, the champion prerender verified). The build's line-ending rewrite of `public/sitemap.xml` was reverted and is not committed.
- The J3 and J4 capture envelopes are emitted as **lazy** chunks, fetched only by `/dev/journey-arena` and the inspector. This is the same `import.meta.glob` pattern UI2 used for J2. The `answers/` subfolders are not globbed, so no private answer ships.


## 12. Remaining backend follow-ups / blockers
1. **R1 recapture: done on captures (J4 `a273a216`, §1.1).** Still pending: a **live** Daily replay on J4, i.e. module 10 and a Survival Journey in the real browser flow. It needs no code change; the contract is identical.
2. A structured Combat reveal working (§4).
3. `max_rank` on the public state, for pips.
4. Optional: a public "reveal window ends at" instant, so the client can poll the beat's publication exactly. Today it uses the submit time plus the frozen window.
5. Product decisions:
   - showing the final child's reveal before the hand-back (§9, pacing);
   - the Survival/Standard repetition;
   - labelling the clock;
   - naming the stat (AD vs bonus AD).
6. Daily chrome B7 (frontend, Daily lane).
