# RCP1 frontend certification — two-option `champion_choice` option media

Companion to backend branch `rcp1/runtime-champion-presentation`
(League_Combat_Simulator, commits e643bee5, a6560334). No contract changes.

## Backend emits (RCP1)
- `champion_stat_level`: premise champion portrait (`presentation`).
- `champion_stat_compare`: two `champion` option-media icons, no `presentation`.
- `champion_highest_base_stat`: champion option-media icons.
- named-champion `champion_attack_type` / `champion_resource`: premise champion portrait.
- champion-choice (melee/ranged) attack-type: champion option-media icons.

## Change (test-only)
- `src/lib/ranked-core/adapters/optionMediaFixtures.ts`: `TWO_CHAMPION_OPTION_QUESTION`,
  dumped from the backend `question_record(...).public_view()`; added to
  `OPTION_MEDIA_QUESTIONS` (adapter `it.each` suites now cover it).
- `src/components/ranked-arena/AnswerGrid.optionMedia.test.tsx`: two-option duel renders
  `data-answer-layout="stacked"`, `data-answer-count="2"`, and two
  `data-option-media-state="ok"` champion icons with API-origin URLs.

## Results
- vitest: `AnswerGrid.optionMedia.test.tsx` + `adaptToViews.optionMedia.test.ts` — 47 passed.
- No rendering defect found; no production frontend change.
- Render path (code-read): contracts.ts readOptionMedia → adaptToViews.ts
  questionViewFromPublicQuestion → quizModule.tsx → InteractiveScenarioSurface.tsx
  (<4 options → stacked) → AnswerGrid.tsx → QuizAnswerOptions.tsx OptionMediaIcon.
  Daily stages play through `QuizRankedMatch` (DailyRunPage.tsx), the same path.

## Visual certification — NOT done
Not practical with local tooling: the local backend `lol_calc.db` is empty (0 bytes), so
runtime champion questions cannot be composed or resolved, and the local backend
answers Public Ranked with 503 FEATURE_DISABLED. Next step: run against an environment
with the canonical DB and Public Ranked enabled, and check the four cases (level
portrait, two-champion compare icons, named attack-type/resource portrait,
champion-choice attack-type icons).
