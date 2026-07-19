# F1 Question Surface → Mastery convergence map (Path A)

Status: **design note only.** This phase (Path B) shipped an F1-owned
`InteractiveScenarioSurface` for Base Ranked + Ranked Tutorial. It deliberately
does **not** import Mastery types, and Mastery has **no** dependency on F1. This
document records how the two could later converge into one shared module, so the
F1 surface can be promoted/renamed rather than discarded.

Do not act on this document without cross-workstream (G-series) sign-off.

## The two surfaces today

| | F1 `InteractiveScenarioSurface` | Mastery `MasteryQuestionView` |
|---|---|---|
| Contract | `question-surface/contract.ts` (reuses ranked-core `QuestionView`) | `features/mastery/contracts/playerQuestion.ts` (`MasteryPlayerQuestion`) |
| Answer types | `single_choice` only (via `AnswerGrid`) | `single_choice` + `numeric` + `boolean` |
| Rich visual | Broadcast `ScenarioCard` (+ text fallback) | `MasteryChampionPortrait` / patch badge / matchup panel |
| Interaction | Quiz `QuizAnswerOptions` (reused) | `MasteryChoiceInput` / `MasteryNumericInput` |
| Reveal | `QuizAnswerFeedback` + Ranked `RevealPanel` | `MasteryRevealView` |
| Hidden-info guard | `assertNoCorrectness` (key blocklist) | `readPlayerQuestion` allowlist projection |
| Assets | `resolveQuizAssetUrl` + `useChampionAssets` | `MasteryAssets` / `MasteryAssetsProvider` |

## 1. Overlapping presentation fields
`prompt` ↔ `promptText`; `category`/`scenarioKind` ↔ Mastery matchup/patch context;
`options{id,index,label,media}` ↔ Mastery `single_choice` choices; `reveal` ↔
Mastery reveal facts; `permissions` (ranked-core `InteractionPermissions`) has no
direct Mastery analogue (Mastery gates via its state machine). These map cleanly
to a shared `LeagueQuestionPresentation` superset.

## 2. Answer types F1 does not yet support
`numeric` and `boolean`. F1's surface renders only choice options. Convergence
should introduce an **interaction adapter** seam: the surface picks an input
component by `answerType` (choice → `QuizAnswerOptions`; numeric → a numeric
input; boolean → a two-option control). Mastery's `MasteryNumericInput` /
boolean flows are the reference implementations to lift into the shared seam.

## 3. numeric/boolean as future interaction adapters
Add `answerType: "single_choice" | "numeric" | "boolean"` to the neutral contract
and an `interactionAdapters` registry keyed by it. `single_choice` stays on the
reused `AnswerGrid`. This keeps variants (density/media) orthogonal to input type.

## 4. Hidden-information guard reconciliation
Two styles today: F1's `assertNoCorrectness` (blocklist at the transport reader)
vs Mastery's allowlist projection (`readPlayerQuestion` + recursive
`assertNoAnswerKey`). Allowlist is strictly safer (default-deny). Convergence
should standardize on **one** guard — likely the allowlist projection at the
transport boundary — but this must be a joint decision; **this phase keeps
`assertNoCorrectness` unchanged** as instructed.

## 5. Canonical asset resolver
Standardize on `resolveQuizAssetUrl` (path→URL, all media types) + `useChampionAssets`
(manifest + react-query cache). Today there are ~10 resolvers with duplication
(two `/api/assets/champions` fetchers incl. `MasteryAssetsProvider`; duplicate
Combat-Lab components; two base-URL defaults). Converging Mastery onto
`useChampionAssets` removes the second fetch. Time Trial stays OUT (its opaque
anti-cheat blob must never be replaced by a plaintext resolver).

## 6. Files that would move/rename during convergence
- `src/lib/question-surface/contract.ts` → promote to `src/lib/league-question/contract.ts`
  (add `answerType`, absorb overlapping Mastery fields).
- `src/components/question-surface/InteractiveScenarioSurface.tsx` → the shared
  surface (rename drops the "Interactive"/"Scenario" scoping once it owns all modes).
- Mastery `MasteryQuestionView` numeric/boolean inputs → interaction adapters under
  the shared surface (owned jointly; not moved unilaterally).
- Consolidate asset resolvers; retire `MasteryAssetsProvider.loadManifest` in favor
  of `useChampionAssets`.

Nothing above is done in this phase. The F1 surface is intentionally small and
neutral so this promotion is a rename + extension, not a rewrite.
