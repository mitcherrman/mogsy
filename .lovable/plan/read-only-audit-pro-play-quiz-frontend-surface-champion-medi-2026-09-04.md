# Read-only audit: Pro Play quiz frontend surface + champion media strategy

No code was changed. Findings below are all from reads of the current tree.

## 1. Pro Play quiz consumers

| Role | Path |
| --- | --- |
| Quiz player page (only consumer of the Pro Play quiz API) | `src/pages/ProPlayQuiz.tsx` |
| Hub / route constants (`PRO_PLAY_ROUTE`, `PRO_PLAY_QUIZ_ROUTE`) | `src/pages/ProPlayHub.tsx` |
| Route registration | `src/App.tsx` (`/lol/pro-play`, `/lol/pro-play/quiz`, `/lol/pro-play/graphs`) |
| Lazy chunk + prefetch map | `src/lib/route-prefetch.ts` (keys `ProPlayHub`, `ProPlayQuiz`, `ProPlayGraphs`) |
| Tests | `src/pages/ProPlayQuiz.test.tsx`, `src/pages/ProPlayHub.test.tsx` |
| Unrelated Pro-data surfaces (do not read the quiz API) | `src/pages/lol/ProPlayGraphs.tsx`, `src/pages/lol-docs/LeagueDocsProData.tsx`, `LeagueDocsProChampionDetail.tsx`, `LeagueDocsProChampionIndex.tsx`, `src/hooks/useProChampions.ts` |

`ProPlayQuiz.tsx` renders text only today: `question.topic`, `question.question_text`, then the shared primitives `QuizAnswerOptions` and `QuizAnswerFeedback` (`src/components/quiz/`). It never reads `question.presentation`.

## 2. API typings / contract

- `src/lib/pro-play/api.ts` — the whole client. `ProPlayQuestion` already declares `presentation: Record<string, unknown>`; also `index`, `number`, `total`, `topic`, `question_id` (opaque digest), `question_text`, `choices: string[]`. Envelopes: `ProPlayTurn`, `ProPlayAnswerTurn`, `ProPlaySessionState`, `ProPlayAnswerResult` (`reveal: Record<string, unknown>`), plus `ProPlayApiError` with `{ detail: { code, message } }` mapping.
- Base URL: `import.meta.env.VITE_COMBAT_API_URL` (fallback `http://127.0.0.1:8000` in this file, unlike the manifest hook's Railway fallback — worth aligning later).
- Endpoints: `POST /api/pro-play/quiz/sessions`, `POST /api/pro-play/quiz/sessions/{id}/answer`.

## 3. Admin / review consumer

There is **no** Pro Play admin or review consumer. Searches across `src/pages/admin/**` and `src/lib/admin/**` return no Pro Play references, and `src/lib/admin/admin-registry.ts` has no entry. The closest analogues, if one is later wanted, are `src/pages/admin/AdminQuizReview.tsx` and the Ranked candidate preview reader (`readPublicQuestion` in `src/lib/ranked-public/contracts.ts`) plus `src/lib/question-preview/questionPreviewApi.ts`.

## 4. Champion asset / media lookup strategy (two systems, deliberately separate)

1. **Question-embedded, backend-authored paths (what quiz surfaces use).**
   - Reader: `src/components/quiz-broadcast/scenario-cards/questionMediaEntities.ts` (`metadata.assets.entities.{champions,items,abilities,runes,summoner_spells}`, role + status tagged).
   - Single-subject reader / card selection: `src/components/quiz-broadcast/scenario-cards/classify.ts` (`metadata.assets.subject.type`, `metadata.presentation.scenario_type`), types in `.../types.ts`.
   - URL resolution: `resolveQuizAssetUrl` in `src/lib/quiz/api.ts` — relative path joined to the API base, `http(s)://` passed through, `globalThis.__MOGSY_ASSET_BASE__` override for Remotion export.
   - Ranked path into the same surface: `src/lib/ranked-core/adapters/scenarioSource.ts` maps `presentation` straight into a `QuizQuestion.metadata`; the surface is `src/components/question-surface/InteractiveScenarioSurface.tsx`.
   - Champion splash card: `src/components/quiz-broadcast/scenario-cards/ChampionScenarioCard.tsx`.
2. **Manifest lookup (hub/docs/combat surfaces, not quiz questions).**
   - `src/hooks/useChampionAssets.ts` fetches `GET {VITE_COMBAT_API_URL}/api/assets/champions` and exposes `getChampionIcon/Splash/Loading/Cutout/Skins` keyed by **display name** (`"Akali"`). `resolveAssetUrl` mirrors the quiz resolver.
   - Consumers: `src/components/combat-battles/ChampionPortrait.tsx`, `src/features/mastery/player/MasteryAssets.tsx` + `live/MasteryAssetsProvider.tsx`, `src/pages/CombatLab.tsx`, `src/pages/LolHub.tsx`, `src/pages/LeagueSwipeGame.tsx`, etc.
   - A stale Deno fallback manifest exists at `supabase/functions/assets-champions/index.ts` (10 hard-coded champions, Data Dragon URLs) — not the path quiz surfaces take.
   - Ability icons cannot be derived from the champion name: `scripts/generate-ability-icon-map.ts` documents Riot spell keys and case-inconsistent folders (`Wukong` → `MonkeyKing`, manifest reports `KaiSa` for on-disk `Kaisa`).

## 5. Smallest stable champion identifier the backend should emit

Emit both of these per champion, inside `presentation.assets` (subject and/or `entities.champions[]`):

- `id` — the backend's canonical asset-safe champion name, i.e. exactly what `champion_asset_name` in `routes/meta.py` produces and what the on-disk `assets/champions/<folder>` directory is called (`"Kaisa"`, `"MonkeyKing"`, `"Chogath"`). This is the smallest thing that stays stable across display-name/skin changes and is already the field `base()` in `questionMediaEntities.ts` reads (`id?: string | number`).
- `name` — human display name for labels/alt text. `questionMediaEntities.ts` **drops any entity without `name`**, so it is mandatory, and `classifySubject` falls back to `id` for the label.

Then include **relative** media paths (`icon`, `splash`, `loading`, optional `default_skin`) of the form `assets/champions/<folder>/...`. Both resolvers already join relative paths to the API base, so no external URL is ever needed frontend-side, and no manifest fetch is required for question rendering. Display-name keys alone are not sufficient (manifest casing is unreliable on a case-sensitive host); folder-safe `id` is.

## 6. What makes additive `presentation` metadata backward compatible today

- `ProPlayQuestion.presentation` is already typed and required, and `ProPlayQuiz.tsx` ignores it — adding keys changes nothing until a renderer opts in.
- `getQuestionMediaEntities` returns `null` when `assets.entities` is absent, and `null` again when every collection is empty; every existing consumer keeps reading `assets.subject`.
- Per-entity optional fields degrade individually: unknown `role` → `"context"`, unrecognised `status` → dropped, missing `icon` → `null` (caller shows a fallback), missing `name` → entity dropped. `flattenMediaEntityIcons` skips icon-less entities.
- `selectScenario` in `classify.ts` is ordered `presentation.scenario_type` → `assets.subject.type` → legacy `classifySubject`, so unknown scenario types fall through to existing treatments rather than blanking a card.
- The Ranked transport applies a soft sanitizer (`src/lib/ranked-public/contracts.ts`): a `presentation` blob is dropped to `null` if any key name contains `correct`, `solution`, or `explanation`, if depth > 8, or if node count > 600 — so keep additive blobs free of those tokens and modest in size. Option media is all-or-nothing per array.
- `ChampionScenarioCard` / `ChampionPortrait` / `MasteryAssets` all render a text fallback on a null URL, so partial media never breaks a surface.

## 7. Notes / no action taken

- No UI redesign proposed, nothing published, no files edited other than this report.
- Two unrelated observations worth a future ticket: the divergent default API base in `src/lib/pro-play/api.ts`, and the stale `supabase/functions/assets-champions` manifest.
