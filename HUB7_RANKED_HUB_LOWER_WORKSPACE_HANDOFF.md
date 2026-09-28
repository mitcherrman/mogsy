# HUB7 — Ranked Hub lower workspace correction

Date: 2026-09-28. Branch `hub7/ranked-hub-lower-workspace`, from `origin/main` **`6ec71d35`**.

## Objective

The Ranked Hub below the hero now reads **QUICK STUDY → HISTORY**. The legacy Practice Packs and Practice Builder are removed from the composition entirely. They were not collapsed. History internals are unchanged. There are no backend changes.

## What changed

| File | Change |
|---|---|
| `src/components/quiz/LeaguecraftHub.tsx` | Removed the study row (Packs panel, Builder slot, retired Time Trial slot), `PracticeTile`, and the props `showPractice`, `timeTrial`, `builder`, `setsLoading`, `onRefreshSets`. Wrapped the rail in a `hub-quick-study` section with a **Quick Study** heading ("Pick a subject to practise."). |
| `src/components/quiz/workspace/primitives.tsx` | `SectionHeading` takes an optional `id` so the section is `aria-labelledby` it. |
| `src/pages/Quiz.tsx` | Removed the `practicePanel` flag, the `PracticeBuilderPanel` mount, the Builder preset state and `handleBuiltSession`, and the `onPractiseWeakness` hand-off. |
| `src/pages/dev/lobby-preview/LobbyPreviewPage.tsx` | Dropped the two removed props. |
| Tests | See below. |
| `scripts/hub7-probe.mjs` | Before/after composition probe (Edge channel). |

## Practice Packs audit

| Legacy thing | What it did | Still used elsewhere? | Valuable data/logic? | Preserved | UI removed |
|---|---|---|---|---|---|
| Practice Packs panel (`LeaguecraftHub` study row, `PracticeTile`) | Listed `/api/quiz/sets` (All Current Questions, Champion Basics, Item Knowledge, Jack of All Trades Practice, New Player Basics) as chips that called `onSelectSet` | The panel: no. The sets and `onSelectSet`: yes. They power the match-entry record's Practice footer (`goToPractice`) and History's empty-record "Start practising" action | Yes. The sets reach Champion Basics, Runes and Game Fundamentals, which no rail tile covers | Sets are still loaded; `handleSelectSet` and the set runner are unchanged; the backend sets are untouched and reusable for Study Hall / Quiz Forge | Heading, panel, chips, `HUB_MODULES.practicePanel` |

## Practice Builder audit

| Legacy thing | What it did | Still used elsewhere? | Valuable data/logic? | Preserved | UI removed |
|---|---|---|---|---|---|
| `PracticeBuilderPanel` + `usePracticeBuilder` + `builderApi` (`/api/quiz/builder/*`, Premium-gated server side) | Pool (bank/owned/missed/weak), category, subject, difficulty and count; build, run and save sets | **No other entry point.** No route mounts it, and `/quiz` was its only host | Yes: the server capability, pool rules and saved sets | Component, hook, client, its tests and all server routes are kept, unmounted. Premium entitlement is untouched | The mount on `/quiz`, the preset hand-off state, `handleBuiltSession` |
| Weakness → Builder hand-off (`onPractiseWeakness`) | "Practise" button on recurring weaknesses inside History › Owned & Missed | No | The weakness list itself is kept | The weakness list still renders (factual); `RecurringWeaknesses` still supports the action if a host passes it | The action button only. It would otherwise have been a dead control |

Existing `practice_builder` History records are unaffected: the source label is data on the rows, and no reader was changed.

## Quick Study

It is the existing `QuizCategoryRail`: same six tiles (Objectives, Waves, Summoners, Items, Abilities, Vision), same art, the same `handleSelectCategory` in-place start, Vision still `aria-disabled` "Coming soon", and the same focus return. The only additions are the heading and a section wrapper. There is no new copy beyond a one-line hint.

## History placement

History (`hub-record-section`, `#history`) is the next section after Quick Study with nothing between them. Gap from the top of the rail to the top of History:

| Size | Before | After |
|---|---|---|
| 1440 | 490 | 108 |
| 1280 | 466 | 84 |
| 390 | 598 | 169 |
| 320 | 598 | 169 |
| 390 @ 200% | 1184 | 307 |
| 320 @ 200% | 1248 | 307 |

Daily, Ranked and Practice rows, filters, stage selection, analytics, Popover/Sheet, Free/Premium gating and the `#review`/`#trends` → `#history` canonicalisation are unchanged. No History file was edited.

## Tests

New or rewritten:
- `Quiz.hub.test` "HUB7: reads QUICK STUDY then HISTORY" covers:
  - the Quick Study heading and the six-tile rail;
  - no Packs, Builder or legacy pack rows;
  - History directly after Quick Study;
  - zero `builderApi` calls and zero `practice_builder*` funnel events on visit.
- `Quiz.hub.test`: a no-paywall test for the Quick Study and History regions.
- `LeaguecraftWorkspace.test`: no Packs or Builder whatever the `sets` payload holds.
- `pt17bBuilderBoundaries`: the Builder is kept but mounted nowhere on `/quiz`, and the `practicePanel` flag is gone.
- `Quiz.practiceMissed`: now starts its set session through History's empty-record action instead of a pack chip.

Existing coverage kept green: rail launch (`Quiz.hub`), empty-record Practice CTA, `#review`/`#trends` (`LeaguecraftWorkspace.test`), Daily/Ranked/Practice History (`DailyHistory`, `LobbyPreviewPage.history`), Premium analytics, Popover/Sheet (`LobbyPreviewPage.premiumAnalytics` 39/39), Builder unit tests, trends and premium.

Touched files: 214/215. The one failure (`keeps exactly one h1`) fails identically on `6ec71d35`.

Wider focused run, with failures identical on baseline:
- `QuestionTimeline` popover: 14 timeouts, and 14 on baseline.
- `Quiz.rankedRole` "commits NOTHING for Practice": fails on baseline too.
- `noStaticLeagueFacts` and `users1AudienceIdentity` guards: 3, and 3 on baseline.

## Typecheck / lint / build

- `tsc -p tsconfig.app.json`: only the two baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`).
- ESLint on changed files: `Quiz.tsx` has 12 `no-explicit-any` errors and 1 warning, the same as baseline; `LeaguecraftWorkspace.test.tsx` has the existing `@ts-nocheck`. Nothing new.
- `npm run build`: passes.

## Screenshots

`%TEMP%\hub7shots\` (18 MB, not committed):
- `before-*` = production mogzy.lol, guest.
- `after-*` = local build, guest.
- `after-preview-*` = `/dev/lobby-preview` with the first Daily expanded.

Each set is captured at 1440, 1280, 390, 320, 390@200% and 320@200%, plus `*-first-screen` shots. Re-run with `node scripts/hub7-probe.mjs <label> <base> <outDir> [preview]`.

## Mobile

- 390 and 320: Quick Study folds to 3×2, and History follows directly.
- 200% text: same order, and the ellipsised tile labels are unchanged from before.
- Horizontal overflow 0 at every size except 320 @ 200%, where it is 52px. That comes from the **global HUD header** (Sign up / music / avatar cluster), is identical before and after, and is outside the Ranked Hub.

## Production

See the final report in the session. The push goes to `origin/main`, then the owner publishes in Lovable if it does not auto-publish, then check mogzy.lol `/quiz` for QUICK STUDY → HISTORY with no Practice Packs or Practice Builder.

## Remaining issues (owner decisions)

1. **The Premium matrix still sells the Builder.** `src/lib/premium/matrix.ts` (`practice-builder`, and `recurring-weaknesses`' "one-tap handoff into the Practice Builder") and `/lol/premium` still describe it, but the Builder now has no entry point. It needs a destination (planned: Combat Simulation / Quiz Forge) or copy changes. Not changed here, because that is a commercial decision.
2. Knowledge Breakdown and the Mastery / Diagnostics utility line still sit below History (pre-existing and out of HUB7 scope).
3. The global HUD overflows by 52px at 320 @ 200% text (pre-existing).
