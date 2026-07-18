# Ranked Mode Compatibility Log (F1)

Practical record of the shared Ranked frontend surface that Tutorial (E2),
Time Trial / Daily (E1), and future Daily Boss work builds on. Owned by the
F1 workstream. Update when a shared contract or component changes.

## Canonical contracts — `src/lib/ranked-core/` (v1, validated)

- `viewTypes.ts` — `CombatantView`, `AbilityView`, `QuestionView` /
  `AnswerOptionView`, `SubmissionView` (phases `selecting → reviewing →
  locked`), `TimerView` (supports `paused` for tutorial directors),
  `InteractionPermissions` + `NO_INTERACTIONS`, `LevelUpOptionView`,
  `PlayerSlot`, and `ResolvedRoundView` (= the settlement adapter output —
  reveal-only; no parallel combat-result model exists).
- `adapters/adaptToViews.ts` — `combatantViewsFromPlayers` /
  `combatantViewsFromPublicRound`, `abilityViewsFromPrivatePlayer`,
  `questionViewFromPublicQuestion` (option id = stringified backend index;
  submissions always use `option.index`). Structural input types
  (`PublicCombatantSource`, `PrivateAbilitySource`, `PublicQuestionSource`)
  accept both the strict envelope adapters and tolerant playable readers.
- `permissions.ts` — `permissionsForSubmissionPhase`, `restrictPermissions`
  (restriction can only remove, never grant — the tutorial gating primitive).
- `timerMath.ts` — skew-safe display countdown; never authoritative.
- `backend/` + `transport/` — the strict backend settlement and envelope
  contract layers (schema versions `ranked_duel.*.v1`), relocated from
  `src/pages/dev/ranked-duel-prototype/` in Phase D.
- `abilityDisplay.ts` — presentation-only ability labels keyed by backend
  ability ids.

## Canonical components — `src/components/ranked-arena/`

`CombatantPanel` (+`HealthMeter`, `ExperienceMeter`), `TimerDisplay`,
`QuestionPanel`, `AnswerGrid` (wraps `components/quiz/QuizAnswerOptions`
unchanged), `AbilityTray`, `SubmissionReview`, `RevealPanel`,
`LevelUpPanel`, `MatchOverFrame`. All stateless/controlled, mode-neutral
(no tutorial/boss/time-trial flags), permission-driven, reveal-safe.

## Validated consumers

- **Staff duel** (`src/pages/dev/ranked-duel-prototype/staff-duel/`,
  Phase D): first real consumer — plays live backend matches end to end
  through the shared arena via the pure `staffDuelProjection.ts` controller
  layer. The canonical review-before-confirm flow produces exactly one
  atomic backend submission per round.

## Transitional shims (delete when their consumers migrate)

Re-export shims marked "TEMPORARY COMPATIBILITY SHIM" remain at
`src/pages/dev/ranked-duel-prototype/backend-adapter/*`,
`.../transport-adapter/*`, and `.../staff-duel/abilityDisplay.ts` for the
fixture prototype, transport-client loaders, and read-composition panel.

## Known limitations

- **Max HP**: the backend public projection has no `max_hp`; the staff duel
  uses an explicit observed high-water mark (`staffDuelProjection.ts`).
  `CombatantView.maxHp: null` means unknown — components render no
  proportional bar. A public client needs trusted starting HP (or a backend
  `max_hp` projection field).
- `AnswerGrid` resolves clicks by label internally; duplicate option labels
  in one question are flagged in the staff arena rather than silently
  mis-mapped (the exercised bank has unique options).
- `rankedDuelReadComposition.ts` remains the intended public-client state
  seam; it is deliberately not wired into the proven staff session hook.

## E1 / E2 status

- **E1 (Time Trial / Daily)**: no shared code consumed or changed;
  `QuizAnswerOptions` untouched. Timer skew discipline reimplemented in
  `timerMath` (no E1 import).
- **E2 (Ranked tutorial)**: presentation on `ranked-tutorial-prototype` is
  now materially stale — canonical equivalents exist for its combatant
  panel, ability panel, answer/lock flow, Level 2 choice, and reveal.
  Migration (rebase + adopt `ranked-arena` components driven by the
  tutorial director through `InteractionPermissions`/`TimerView.paused`)
  should happen after the staff duel validates in real use. Tutorial-owned
  systems (step machine, fixtures, copy, instructional/sim panels, tutorial
  completion) stay E2's.

## Next expected migration

E2 tutorial presentation onto the shared arena; then Daily Boss (needs a
backend boss engine emitting the same resolved-round shape) as the third
consumer. Public Ranked additionally needs identity, matchmaking,
persistence, reconnect, and a public question bank.
