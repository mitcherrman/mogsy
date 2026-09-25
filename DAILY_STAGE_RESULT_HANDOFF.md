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
