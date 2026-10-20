# VIS-F2 support · 01 · State / moment map

The backbone the other five docs key on. Every media slot (02), audio cue (03), ambient layer (04) and storyboard (06) names a **moment id** from this table, so the visual pass and later wiring share one vocabulary.

**Sources:** UX-1 flow + VIS-F1 screens (`mogzy-wt/vis-f1`, `src/pages/dev/dynasty-v2/`), E1 snapshot API (`.worktrees/wd-v2-combat/docs/roguelike/WORLDS_DYNASTY_EVENTS_E1_SNAPSHOT_API.md`, beats + `settlement.how`), master plan §§7, 11, 21.
**Status:** proposal. No moment here is a rule; budgets are presentation targets.

## Conventions

- **Moment id:** `dyn.<scope>.<moment>`; scope ∈ `run`, `season`, `prep`, `draft`, `game`, `obj`, `result`, `series`, `end`, `meta`.
- **Weight** sets how much presentation a moment may take:
  - **W0 tick** — inline, ≤ 300 ms, never blocks input (clicks, pips).
  - **W1 beat** — in-flow card or stamp, ≤ 700 ms (event card, stage stamp).
  - **W2 hero** — owns the focus stage, ≤ 1.5 s, tap advances (stage open, objective stakes, game result).
  - **W3 signature** (**owner-approved 2026-10-19**, only `dyn.series.finals_intro` and `dyn.end.championship`): may take the full frame for **≤ 3 s**, is **immediately skippable** (any tap, click, Space, Enter or Esc jumps to the resting frame), never auto-repeats, and can be replayed from the showcase. This is the only exception to UX-D0 §13 "no full-screen takeovers"; no other moment may use it.
- **Reduced motion:** every moment at every weight resolves to its resting frame (VIS-F1 rule). W3 becomes a static full-frame hero card with the same text and crests, shown until the player continues; its sting still plays (sound is not motion).
- **Hook:** where the moment comes from — a UX-1 screen/step today, an E1 `beat` (or `settlement.how`) once UX-3 wires the backend.
- **PROTOTYPE-ONLY:** behaviour the UX-1 prototype shows but the backend event catalog does not implement (Elder, Dragon Soul, Dragon questions). Build it, but keep it behind the prototype fixtures and label it in UI copy and test names until backend support lands.

## E1 compatibility rules

Checked against `docs/roguelike/WORLDS_DYNASTY_EVENTS_E1_SNAPSHOT_API.md` and `dynasty/combat_v2/events/catalog.py` in `.worktrees/wd-v2-combat` @ `d279233b`:

1. **E1 covers one game.** Game and objective moments map to E1 `beat`s. Run, season, recruit, prep, draft and series moments have **no backend contract yet** (E3 / SEASON-1); they hook to UX-1 screens only.
2. **Nothing plays ahead of its beat.** A moment may animate only after its beat has arrived. "Announced / resolving" motion is allowed between a beat's arrival and its card reveal (E1 §5), never before. No moment may hint at an unrevealed event, a reserved slot or a future draw.
3. **A published tally is final.** Post-stage moments (Dragon, Baron) may restyle or collapse the published tally (VIS-F1 does), but must never animate it changing.
4. **Skip is client-only.** Skipping a W2 or W3 moment changes presentation, never the action sequence; the next `advance` is still the player's or the flow's.
5. **Settlement is one of three `how` values:** `double_winning_closeout`, `objective_closeout`, `late_decides`. Each has exactly one game-ending moment below.

## Run / meta

| Moment id | Trigger (UX-1 today → E1/backend later) | Screen | Weight |
|---|---|---|---|
| `dyn.run.home` | Home mount | Home | W1 |
| `dyn.run.resume` | Resume card tapped | Home → run bar | W0 |
| `dyn.run.org_focus` | Org card focused (first tap) | Org select | W0 |
| `dyn.run.org_choice` | Org confirmed | Org select → Stars | **W2** (storyboard S1) |
| `dyn.run.star_pick` | Star selected (2 of 3) | Stars | W1 |
| `dyn.run.academy_fill` | Academy stand-ins assigned | Roster | W1 |
| `dyn.meta.legacy_shelf` | Legacy shelf open | Home | W1 |
| `dyn.meta.unlock` | New unlock earned (run end or series) | Run end / series result | **W2** |

## Season and between-series

| Moment id | Trigger | Screen | Weight |
|---|---|---|---|
| `dyn.season.hub` | Season path mount | Season | W1 |
| `dyn.season.node_advance` | Current node moves after a series | Season | W1 |
| `dyn.season.stage_transition` | Crossing a segment boundary: Regular → Playoffs → (Play-In) → Worlds | Season | **W2** |
| `dyn.season.transfer_open` | Transfer window gap reached | Season → Recruit | W1 |
| `dyn.season.sign_player` | Recruit confirmed (swap or fill bench) | Recruit | **W2** (S2) |
| `dyn.prep.action_pick` | Prep action selected | Prep | W0 |
| `dyn.prep.confirm` | Prep actions confirmed, deltas applied | Prep | W1 |
| `dyn.prep.event` | Optional prep event card | Prep | W1 |
| `dyn.prep.scout_reveal` | Scout tier revealed | Scout | W1 |
| `dyn.series.briefing` | Series intro (opponent committed) | Scout / pre-draft | W1, **W2 for Worlds**; `dyn.series.finals_intro` replaces it for the final |
| `dyn.series.finals_intro` | First entry into the Worlds final series | Pre-draft | **W3** (S6) |

## Draft

| Moment id | Trigger | Screen | Weight |
|---|---|---|---|
| `dyn.draft.open` | Draft mount for game N | Draft | W1 |
| `dyn.draft.champ_select` | Champion chip selected | Draft | W0 |
| `dyn.draft.role_lock` | One role row locked | Draft | W1 |
| `dyn.draft.lock_all` | Five roles locked → comp read-out | Draft | **W2** (S3) |
| `dyn.draft.fearless_strike` | Previously used champion shown struck | Draft | W0 |
| `dyn.draft.comp_warning` | Composition warning chip appears | Draft | W0 |

## Game (one per Early / Mid / Late reached)

| Moment id | UX-1 step → E1 beat | Weight | Notes |
|---|---|---|---|
| `dyn.game.stage_open` | stage start → `stage_open` | W2 | Mood light shifts (Early dawn / Mid gold / Late ember) |
| `dyn.game.event_small` | event card → `event_revealed` (kind small) | W1 | E1 ids: `early.scuttle_control`, `early.tower_plates`, `small.solo_kill`, `mid.item_spike`, `late.side_lane_pressure`, `late.clutch_play` |
| `dyn.game.event_rare` | rare card → `event_revealed` (rare, e.g. `early.duelist_1v2_turret`) | W1 + sheen | Champion-conditional |
| `dyn.game.event_quiet` | — → `no_eligible_event` | W0 | Neutral "quiet stretch" line; never filler |
| `dyn.game.contests` | reveal start → `contests` | W1 | 330 ms lane rhythm, Skip |
| `dyn.game.stage_tally` | tally publish → `stage_tally` | W1 | Count-up + five-state stamp |
| `dyn.game.state_winning` / `_losing` | state stamp = Winning / Losing | W1 | Extremes get distinct audio |
| `dyn.game.lead_shift` | lead meter moves | W0 | |
| `dyn.game.closeout_double` | → `settlement.how = double_winning_closeout` | **W2** | No Late rendered |
| `dyn.game.late_verdict` | Late tally → `settlement.how = late_decides` | **W2** | Verdict stamp |

## Objective encounters

| Moment id | UX-1 → E1 | Weight | Notes |
|---|---|---|---|
| `dyn.obj.dragon_start` | Dragon card → `post_stage` then `event_revealed` `early.dragon` | W2 | E1: skill-free, **post-stage** after the Early tally (feeds carry, never the Early score). The UX-1 Dragon **question** is **PROTOTYPE-ONLY** (E1 hosts no Dragon encounter) |
| `dyn.obj.herald` | → `event_revealed` `early.rift_herald` | W1 | E1: skill-free, pre-score |
| `dyn.obj.soul_point` | none | W1 | **PROTOTYPE-ONLY / reserved**: Dragon Soul is deferred in E1 (`models.py`: "Dragon soul / Elder are deferred") |
| `dyn.obj.baron_start` | Baron stakes → `objective_prompt` (`encounter_kind = baron_three_question`, `question_count = 3`) | **W2** (S4) | Only `mid.baron_qualified` opens the 3Q; the 3/3 closeout row only when `closeout_on_perfect` |
| `dyn.obj.baron_unqualified` | → `event_revealed` `mid.baron_contest` (opponent's Baron) or `mid.baron_unqualified` (narrow catalog only) | W1 | Skill-free card, no stakes ladder |
| `dyn.obj.elder_start` | Elder 3Q (UX-1 fixtures) | **W2** | **PROTOTYPE-ONLY**: no Elder event or encounter in the backend catalog |
| `dyn.obj.teamfight` | → `event_revealed` `late.decisive_teamfight` | W2 | E1: skill-free, pre-score |
| `dyn.obj.late_baron` | → `event_revealed` `late.baron` | W1–W2 | E1: skill-free, pre-score |
| `dyn.obj.question` | Each question shown | W0 | |
| `dyn.obj.answer_right` / `_wrong` | Answer graded (server; E2 replaces E1's caller-supplied count) | W0 | Ring / shake (VIS-F1). Show only after grading arrives; never pre-mark an option |
| `dyn.obj.outcome_3` | → `objective_result` `baron_ace_closeout` | **W2** (S5) | Ends game only if `closeout_on_perfect` |
| `dyn.obj.outcome_2` | `baron_with_trades` | W2 | "success" arrival |
| `dyn.obj.outcome_1` | `baron_heavy_losses` | W2 | "partial" arrival |
| `dyn.obj.outcome_0` | `enemy_baron_team_wiped` | W2 | "disaster" arrival |
| `dyn.obj.closeout` | → `settlement.how = objective_closeout` | **W2** | |

## Results and ending

| Moment id | Trigger | Weight |
|---|---|---|
| `dyn.result.game_win` / `_loss` | Game result mount | W2 |
| `dyn.result.deltas` | Confidence / fatigue / cohesion rows tick | W1 |
| `dyn.result.trait_earned` | New trait (e.g. Overconfident) | W1 |
| `dyn.series.match_point` | Either side on 2 wins | W1 (pulse) |
| `dyn.series.point_won` / `_lost` | BO5 pip fills | W1 |
| `dyn.series.tactic` | Between-game tactic pick | W1 |
| `dyn.series.win` / `_loss` | Series result mount | W2 |
| `dyn.series.elimination` | Lost elimination series | W2 → `dyn.end.defeat` |
| `dyn.end.championship` | Worlds final won | **W3** (S7) |
| `dyn.end.defeat` | Run ends on elimination | W2 (never W3: no punitive takeover) |
| `dyn.end.legacy_card` | Legacy card settles (both endings) | W2 |

## Frequency sanity check (one BO5, broad Baron policy)

Per game: ~3 W2 (stage opens) + 3–6 W1 events + 1 W2 objective + 1 W2 result. A 5-game series is ~25–30 W2 moments. That is why **W2 must be tap-through and ≤ 1.5 s**, why only `finals_intro` and `championship` are W3, and why ambient layers (04) must be sparse.
