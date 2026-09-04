# Read-Only Audit: Pro Play Quiz Frontend Surface & Champion Media Strategy

## Goal
Map the current Pro Play quiz frontend consumers, API response contracts, any admin/review consumers, and the champion asset/media lookup strategy used by quiz surfaces. Identify the smallest stable champion identifier the backend should emit so the frontend can later resolve splash/icon media without external URLs. Note backward-compatibility expectations for additive `presentation` metadata.

## Scope
- Read-only exploration. No code edits, no UI redesign, no publish.
- Focus on Pro Play quiz surfaces and related asset-resolution paths.

## Deliverables
1. **Frontend consumers**: exact file paths for Pro Play quiz pages, hooks, components, and route wiring.
2. **API contracts**: TypeScript typings and runtime expectations for Pro Play quiz API responses (`presentation`, `question_id`, `choices`, `reveal`, error envelopes, etc.).
3. **Admin/review consumers**: exact file paths of any admin or review surfaces that consume Pro Play quiz data.
4. **Champion asset lookup strategy**: how quiz surfaces currently resolve champion splash/icons (manifest, embedded paths, fallback logic).
5. **Recommended backend identifier**: the smallest stable champion key/folder name the backend should emit for frontend media resolution.
6. **Backward-compatibility notes**: current handling of missing/unknown `presentation` fields and additive metadata.

## Method
- Search codebase for `ProPlay`, `pro-play`, and quiz API consumers.
- Inspect `src/lib/pro-play/api.ts`, `src/pages/ProPlayQuiz.tsx`, and related asset utilities (`questionMediaEntities.ts`, `useChampionAssets.ts`, `resolveQuizAssetUrl`).
- Cross-check admin pages under `src/pages/admin/**` and `src/lib/admin/**` for Pro Play review surfaces.
- Report findings in chat with exact file paths and no implementation changes.
