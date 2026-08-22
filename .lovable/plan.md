# Audit: Daily Challenge vs Time Trial, and Ranked bot/practice reuse

Read-only audit at HEAD. Every claim marked **[verified]** was read directly in the files cited; **[inference]** marks reasoning not proven by a single read (backend behaviour, in particular, was not inspected — there is no backend source in this repo).

## 1. Routes and entry points

**[verified]** `src/App.tsx`:
- `/quiz` → `Quiz` (line 493) — hosts **legacy Daily Challenge in-page**.
- `/quiz/daily` → `QuizDailyScoreAttack` (line 494) — **Time Trial / Daily Score Attack**, a different feature (`src/pages/QuizDailyScoreAttack.tsx` → `src/pages/dev/daily-score-attack/DailyScoreAttackPage` with `production`).
- `/dev/daily-score-attack` → same `DailyScoreAttackPage` without `production` (line 538).
- `/quiz/ranked` → `QuizRankedPage` (line 495).
- `/dev/ranked-duel`, `/dev/ranked-arena-inspector`, `/dev/ranked-tutorial`, `/quiz/stat-check/bot` are separate prototype/bot surfaces (lines 532, 540, 539, 535).
- All three `/quiz*` play routes are wrapped in `RequireRankedTutorial`.

Legacy Daily Challenge entry points (no route of its own) **[verified]**:
- `QuizDailyChallengeCard` (`src/components/quiz/QuizDailyChallengeCard.tsx`) rendered at `src/pages/Quiz.tsx:1207`, `onPlay={handlePlayDailyChallenge}`.
- `LeaguecraftHub` match-entry scroll, prop `onPlayDailyChallenge` (`src/pages/Quiz.tsx:1158`), mode id `daily` from `src/lib/quiz/playModes.ts` (`PLAY_MODES`, `playModeVisibility`).
- Slot arbitration: `HUB_MODULES.timeTrial` / `HUB_MODULES.dailyChallenge` in `src/pages/Quiz.tsx` (~lines 85-106, 1194-1210). The Time Trial card (`QuizScoreAttackCard`) replaces the legacy card when `fetchScoreAttackToday` reports the feature enabled; otherwise the legacy card stays (comment at `Quiz.tsx:398`).
- Deep link `/quiz` + `location.state.openPlay` opens the scroll (used by `QuizRankedPage`'s no-match fallback).

## 2. Legacy Daily Challenge frontend flow (all in `src/pages/Quiz.tsx`) **[verified]**

State:
- `phase: QuizPhase` = `"sets" | "loading-questions" | "active" | "result" | "error"` (line 405).
- `dailyChallenge: DailyChallengeState` seeded from `getDailyChallenge()` (localStorage, `src/lib/quiz/featured-mock.ts`, UTC-day reset) then overwritten by backend via `applyDailyChallengeResponse` (line 563).
- `isDailyChallenge` ref (line 482) is the only thing distinguishing a daily run from a normal set run; `dailyBonusXpEarned` ref (509).
- `isDailyChallengeComplete()` (`src/lib/quiz/dailyChallengeStatus.ts`) is the pure predicate the card/record uses (union of `completed`, `remaining <= 0`, `answered >= target`, guarded on `target > 0`).

Start: `handlePlayDailyChallenge` (594) sets the ref, calls `startHistorySession("daily")`, `setPhase("loading-questions")`, `quizApi.getDailyChallenge(userId)`, filters `questions.filter(q => !q.answered)`; empty → `setPhase("sets")` (silent bounce, 613); otherwise `setPhase("active")`. Guest funnel event `quiz_guest_started` with `quiz_mode: "daily_challenge"`.

Interaction: shared with normal quiz — `phase === "active"` block (1413+) renders category badges, `Progress` (`currentIndex + 1 / questions.length`), champion/item/rune/summoner artwork resolved through `resolveQuizAssetUrl`, and the shared answer UI. Submit branches at line 777: daily uses `quizApi.submitDailyChallengeAnswer`, normal uses the standard submit. Response drives `setDailyChallenge` from `dcResult.daily_progress` (answered/correct/completed/daily_streak/remaining) and `dcResult.daily_bonus_xp_earned`.

Score/progress: no client-side scoring — counts come from `daily_progress`; local mirror `recordDailyAnswer` exists in `featured-mock.ts` **[inference: used only for the cached card display, not as authority]**.

Completion: `setPhase("result")` (877); daily branch at 1881 renders inline `DailyChallengeResult` (defined inside `Quiz.tsx`, not a separate file) with `dailyChallenge.correct/target`, `bonusXp`, plus `AdSlot placement="daily_challenge_results"`. Exit clears the ref and returns to `"sets"`.

Reload/resume: **[verified]** phase always initialises to `"sets"`; there is no persisted in-progress run. "Resume" is emergent — a re-entry refetches the day's set and filters out `answered` questions, so the player continues where the server says they were. Streak/answered counts render instantly from localStorage before the backend sync.

## 3. Endpoints used by legacy Daily Challenge **[verified]** (`src/lib/quiz/api.ts`, base `VITE_COMBAT_API_URL` || `http://127.0.0.1:8000`)

- `GET /api/quiz/daily-challenge[?challenge_date=]` — `quizApi.getDailyChallenge` (identity from JWT; `userId` arg is unused).
- `POST /api/quiz/daily-challenge/submit` — `quizApi.submitDailyChallengeAnswer` (`authedRequest`).
- `POST /api/quiz/sessions` / `POST /api/quiz/sessions/{id}/complete` — history session, `mode: "daily"`.
- Ambient hub calls on the same page: `/api/quiz/progress/{id}`, `/api/quiz/categories/{id}`, `/api/quiz/achievements/{id}`, `/api/quiz/history`, `/api/quiz/entitlement`, and `GET /api/daily-score-attack/today` (via `fetchScoreAttackToday`) for slot arbitration.

## 4. Current Ranked bot/practice path

**[verified]** `src/pages/quiz-ranked/QuizRankedPage.tsx` is now *menuless*: the pre-match screen that offered combat class + Easy/Standard/Hard bot difficulty was retired. There is **no live UI entry point that creates a bot match** — `createBotMatch` (`src/lib/ranked-public/client.ts:265`, `POST /api/ranked/bot-matches`, args `classId`, `difficulty: BotDifficulty | null`) has no non-test call site anywhere in `src` (grep over `src` excluding tests returns only the client definition and a doc comment).

**[verified]** What remains of the bot path:
- `getActiveMatch()` (`client.ts:248-257`) returns `{ matchId, isBotMatch }` and is the only way an in-flight bot match is rediscovered (`RankedMatchHost` mount effect); with no match the route does `Navigate to="/quiz" state={{ openPlay: true }}`.
- `isBotMatch` is parsed in `src/lib/ranked-public/contracts.ts:890` and per history entry at `:1259`.
- Once a match id exists, bot and human matches render through the identical component: `QuizRankedMatch matchId viewerUserId`.

**[verified]** Bot timing/difficulty/answer simulation is **entirely server-side** — the frontend contains no bot answer simulator, no timer for a bot, no difficulty heuristics. `useRankedMatch` (`src/pages/quiz-ranked/useRankedMatch.ts`) only polls public/private views with backoff+abort, heartbeats (`HEARTBEAT_MS = 10000`), keeps a bounded `damageLog` (`DAMAGE_LOG_LIMIT = 8`), and holds a presentation-only reveal (`REVEAL_HOLD_MS = 1500`, `REVEAL_HOLD_LEVEL_UP_MS = 2600`). Actions: `answer`, `selectAbility`, `chooseLevelTwo`, `submitSegmentChallenge`, `retry`. Phases: `recovering | active | reviewing | locked | progression | match_over | recovering_error | fatal`.

**[verified]** HP/damage/timeline/result flow — all authoritative pass-through, projected by `src/pages/quiz-ranked/rankedViews.ts` (`projectCombatants`, `projectRevealDamage`, `projectRevealOutcomes`, `projectRoundHistory`, `projectTimer`, `projectPermissions`, `projectAbilities`, `projectAbilityPermissions`, `projectSurfaceReveal`, `projectMascotReactions`) plus `roundTimeline.ts` (`projectRoundTimeline`, `observeRoundKinds`). Components composed in `QuizRankedMatch.tsx`: `CombatantPanel` (HP/XP/damage trail), `TimerDisplay`, `RoundTimeline`, `RevealPanel`, `RoundResultBeat`, `SegmentResultBeat`, `SegmentTranscript`, `AbilityTray`, `LevelUpPanel`, `MatchOverFrame`. Question rendering is delegated to segment modules via `rendererForSegment` (`src/lib/ranked-core/modules/registry.ts`; `quizModule.tsx`, `metaReflexModule.tsx`, `itemCostDuelModule.tsx`).

Adjacent bot surfaces **[verified]**: `/quiz/stat-check/bot` (`src/pages/stat-check/StatCheckBotPage.tsx`) is a separate Stat Check game with a fictional bot profile, unrelated to Ranked arena code. `/dev/ranked-duel` (`src/pages/dev/ranked-duel-prototype/duelMachine.ts`) is a **client-side** duel state machine with local `DAMAGE`/`XP` tables — a prototype, not the production path.

## 5. Reuse assessment of ranked-arena components

Reusable unchanged (pure presentation over view props):
- `TimerDisplay`, `RoundTimeline`, `AnswerGrid`, `QuestionPanel`, `RevealBanner`, `RevealPanel`, `SegmentTranscript`, `abilityArt`, `classIdentity`, `roleIdentity`, `LevelUpPanel`, `AbilityTray`, plus the whole module layer (`registry.ts` + `quizModule` and its `InteractiveScenarioSurface` composition).

Reusable with an explicit single-player mode:
- `CombatantPanel` (needs a "no opponent" or PvE-dummy variant; today it is instantiated twice from `projectCombatants`), `RoundResultBeat` / `SegmentResultBeat` (copy assumes two duelists), `MatchOverFrame` (result copy + rating delta), `rankedViews.ts` projections keyed on `opponentUserId` / settlement `players.p1/p2`, and `revealNames` in `QuizRankedMatch.tsx` (hardcodes "You"/"Opponent").

Ranked-specific (would need real backend contract work, not just props):
- `useRankedMatch.ts` (two-player polling, presence, progression, ability drafts), `src/lib/ranked-public/client.ts` + `contracts.ts` (match/round/settlement envelopes), `RankedRolePicker`, `RankedTierPanel`, `useRankedQueue`, `useRankedProgression`, `RankedMatchHistory`.

Should not be reused:
- `src/pages/dev/ranked-duel-prototype/*` (client-authoritative damage/XP — reusing it would move scoring authority into the browser), and the legacy `featured-mock.ts` local counters as anything but a display cache.

## 6. Files likely involved in converting legacy DC into a single-player Ranked-style run

Entry/host: `src/App.tsx`, `src/pages/Quiz.tsx`, `src/components/quiz/LeaguecraftHub.tsx`, `src/components/quiz/play-scroll/PlayScrollRecord.tsx`, `src/lib/quiz/playModes.ts`, `src/lib/platform-policy/policy.ts`, `src/components/quiz/QuizDailyChallengeCard.tsx`, `src/lib/quiz/dailyChallengeStatus.ts`, `src/lib/quiz/featured-mock.ts`.

Data/contract: `src/lib/quiz/api.ts` (daily endpoints), `src/lib/ranked-public/contracts.ts` + `client.ts` (if the run adopts ranked envelopes), `src/lib/ranked-core/adapters/adaptToViews.ts` + `scenarioSource.ts`, `src/lib/ranked-core/viewTypes.ts`, `permissions.ts`, `timerMath.ts`.

Arena/run shell: a new single-player controller sibling to `src/pages/quiz-ranked/useRankedMatch.ts`, `rankedViews.ts`, `roundTimeline.ts`, `QuizRankedMatch.tsx`, and the `src/components/ranked-arena/*` set listed in section 5. `src/pages/dev/daily-score-attack/*` (`dailyScoreAttackMachine.ts`, `dailyScoreAttackClient.ts`, `dailyScoreAttackTypes.ts`) is the closest existing single-player run precedent — server-authoritative reducer with a phase machine — and is the natural shape to copy.

Two open facts that gate any conversion **[inference, needs backend confirmation]**: whether the daily-challenge endpoints can emit per-question reveal/damage-shaped payloads, and whether a single-player "match" can be created server-side (the retired `POST /api/ranked/bot-matches` is the only PvE creation endpoint the client knows).

No files were modified.
