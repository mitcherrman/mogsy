# Match History V2 — Command Center Handoff
Date: 2026-10-19
Status: planning and parallel-track kickoff; no UI edits, tests or deployment performed yet.
Base: mitcherrman/mogsy main @ 19ef674eca7e02c85479e452517c1985772d849e
Integration branch: history-v2/command-center-20261019

## Objective
Improve the Daily/Ranked shared question inspector: compact hierarchy, user/correct answer legibility, useful proven imagery, readable explanations/structured calculations and unobtrusive historical context, preserving the parchment identity.

## Decisions and constraints
- Keep the existing one-entry Daily -> Stage -> Question layout. No new history screen.
- Preserve shared question inspector, frozen historic answers, reveal/sealed gating, read-only review, stage/match accuracy and history semantics.
- Do not infer combat inputs from prose or invent data. Use existing frozen structured fields; identify concrete backend gaps before suggesting wire-contract changes.
- Preserve fine-pointer popover (max-height min(24rem, Radix available height), ~29rem width) and touch bottom sheet, keyboard/focus behavior and no horizontal overflow.
- Maintain art specificity: use proven icon hints, do not substitute a misleading champion/ability for generic category artwork.
- AGENTS.md/CLAUDE.md: never launch local Edge/Chrome browser automation. Remote GitHub Actions for browser acceptance; local headless Chromium needs explicit approval.
- Avoid multiple agents editing same files. Never deploy/merge without owner approval.

## Verified relevant files
- src/components/quiz/workspace/QuestionReviewCard.tsx (shared review and family-specific bodies; MasterySliceBody, QuizBody, JourneyCombatWorking)
- src/components/quiz/workspace/QuestionReviewHost.tsx (mobile sheet)
- src/components/quiz/workspace/questionTimelineParts.tsx (desktop popover)
- src/components/quiz/workspace/QuestionInspector.tsx (single-question trigger)
- src/components/quiz/workspace/HistoryQuestionTimeline.tsx (History question navigation)
- src/components/quiz/workspace/analytics/QuestionContext.tsx (history facts and sticky summary)
- src/components/quiz/workspace/DailyRunRow.tsx (Daily -> Stage -> Question structure)
- src/components/quiz/workspace/questionIcons.ts (proven/fallback art)
- src/components/quiz/workspace/QuestionReviewCard.mastery.test.tsx (frozen questions, full options, sealed rounds, combat working)
- src/components/quiz/workspace/QuestionReviewHost.test.tsx
- src/components/quiz/workspace/HistoryQuestionTimeline.test.tsx
- DAILY_V2_P2B_HISTORY_HANDOFF.md

## Parallel worktracks and ownership
A — UI implementation (Sonnet 5.5 high; fresh instance): Own ONLY QuestionReviewCard.tsx and focused tests added/updated for it. No edits to QuestionContext, host, timeline or backend. First inventory rendered question kinds and tests, then design a compact presentation respecting visual and provenance rules. Present proposed UI behaviors before complex changes; implement approved scoped refinements. Return branch/SHA, files, tests, risks.
B — Explanation evidence audit (Sonnet 5.5 medium; fresh instance): READ ONLY. Inspect mastery question contract, combatWorking, semantic payloads, history fixtures and actual formatting paths. Produce field-by-field availability matrix for quiz, mastery and combat cases, identifying explicit gaps and safe opportunities to improve clarity. No parsing magic, no writes.
C — Acceptance and regression audit (Sonnet 5.5 low; fresh instance): READ ONLY. Build a matrix of existing tests and necessary additional tests for correct/incorrect, multi-challenge partial, timeout/sealed, family variants, long text, missing images, keyboard, narrow mobile, and 24rem popover. Specify GitHub Actions browser acceptance, no local browser automation. No writes.
Integration — same command center after receiving A/B/C reports. Resolve findings, authorize targeted follow-ups only, rebase/integrate once, run test/build and CI visual checks; require explicit owner approval to merge/deploy.

## Known visual pain points from owner screenshots
- Leona level 3 armor: four options plus repeated 'YOUR ANSWER 57 / CORRECT ANSWER 50'; long stack.
- Pantheon E versus Leona: dense raw technical context text ('after armor', attacker/target inputs etc.) obscures comprehension.
- Mixed-size labels, low scanability, heavy text. Prefer icons and meaningful structure, not decorative asset invention.

## Gates
1. Track B audit confirms safe fields and risks; A remains frontend-only unless approved.
2. Track C regression matrix covers all body families and responsive host behavior.
3. A implementation diffs stay scoped, review correctness/readability first, no live-data rewriting.
4. Targeted Vitest, TS/build differential, CI browser 320/360/390 mobile + desktop and keyboard checks; screenshots reviewed.
5. No unapproved merge or deploy.

## Current state / next task
Branch and handoff created. Start A/B/C from the *same main commit* in separate isolated worktrees or cloud environments; tell every instance to read this file first. Collect each report, then coordinate integration. No implementation has started yet.

## Track B/C evidence received (2026-10-19; read-only agents)

### Track B: structured explanation evidence (source: agent report, NOT yet independently backend-verified)
- ReviewMasteryChallenge parser and fields: src/lib/ranked-public/contracts.ts lines 3774-3798, 3910-3956 on base. Contains promptSemantics and comparisonSemantics; correctAnswer/explanation/combatWorking/comparisonValues gated by reveal. An unrevealed record with reveal-only data must be refused.
- Pantheon E scenario in pantheon.standard.json: promptSemantics.template='ability_damage_under_state', metric, ability ref/name, scenario key/value pairs with levels, target, items, armor, AD, lethality and percent pen. Typed combat_working.v1 can describe damage math. Existing JourneyCombatWorking supports rows layout.
- Existing review card currently prints serialized combat prompt and inline chain; candidate improvements: reuse semantic formatting from JourneyCombatQuestion.tsx and JourneyCombatWorking rows, preserve original frozen explanation, never compute/reconstruct numeric results.
- Raw damage and haste cooldown working variants reportedly dropped by the review parser. DO NOT expand reader union casually; separate proof/test/approval required.
- Mastery review row does NOT carry proven per-ability presentation.assets, nor structured unrounded Leona armor; do not infer per-ability icons or parse explanation prose for numbers.
- ComparisonValues appears to carry operator/deltaDisplay, currently underused.
- Agent did NOT confirm backend production review rows actually include working for older/frozen runs. Preserve fallback; verify backend before wire-contract claims.
- Scope decision: NO backend changes for V2 initially. Read-only B report accepted as preliminary frontend evidence; implementation must verify specific typed fields in source.

### Track C: acceptance audit (test names/YAML ONLY, not assertion bodies)
- Existing tests cover Mastery slice counts, sealed state, combat working, quiz timeline, some icon fallback, host focus and touch, Daily->Stage->Question; quality of each assertion was not audited.
- Deficiencies: mixed subchallenge row visuals, duplicate answer labels, unsubmitted/timeouts, long layouts, actual browser geometry at 320/360/390, desktop 1280x800/1280x560, fallback image, real keyboard focus, other family render consistency.
- Recommend isolated GitHub Actions acceptance workflow based on .github/workflows/daily-result-compact-acceptance.yml with a dedicated history-review harness and playwright config. Test real geometry, 44px touch targets, bounded 24rem desktop popover, 85dvh sheet, no horizontal spill, state screenshots. Respect AGENTS.md; no local browser launch.
- Caveat: existing workflow lockfile status not verified; C did not run tests. Check npm ci; do not assume.
- Beware test ask 'correct/wrong values appear exactly once' may conflict with preserving answers: distinguish semantic summary duplication from the single value's legitimate occurrence in full options or explanation. Preserve pedagogically useful options and accessible labels.

### Updated integration decisions
1. Track A keeps sole ownership of QuestionReviewCard.tsx, tests. Share Track B evidence before finalizing UI. Only change family-specific code after inspecting actual source/fixtures; don't generalize beyond reviewed families.
2. New Track D — CI browser acceptance (Sonnet 5.5 medium, fresh): own ONLY e2e/history-review/**, playwright.history-review.config.ts and .github/workflows/history-review-acceptance.yml. This is implementation work after evidence audit; keep independent from A and avoid component modifications. Prefer existing permitted harness patterns. CI only; no local browsers.
3. Integration after Track A/D deliver: compare against base and confirm no overlapping files, test, screenshot inspect, merge only with owner approval.
4. Never claim verified production working payload without backend evidence; source audit is not deployment truth.

## Next action
Get Track A state/diff; send narrowed B conclusions above. Start D in separate isolated instance only if user wants parallel CI test work now. No production change or deployment.

## Track A reported complete locally (2026-10-19, NOT verified independently)
- Isolated local branch history-v2/a-ui-20261019 at a3a0c481f858c9df723440231ba7ce2a305f6c65, based on 19ef674e. GitHub remote ref does not exist (confirmed via API 404).
- Claimed edits: QuestionReviewCard.tsx, new QuestionReviewCard.hierarchy.test.tsx, new MATCH_HISTORY_V2_TRACK_A_HANDOFF.md.
- Claimed 27 new tests pass, 50 related files / 778 tests pass, 19 failures in 9 unrelated CSS/source-structure files reproduce against original card; 2 inherited TS errors; lint clean. None verified by command center until branch pushed.
- UI: answer pair mine/right, compact options strip, outcome chip, proven icon header, tidier working, folded 'Full explanation' prose when structured working present. User approved folded prose. Other family bodies only changed common header.
- NEXT: tell SAME Track A instance to read updated command-center handoff, assess B findings and explicitly report whether semantic Combat prompt + row-format working are implemented. Make only targeted corrections to owned files, rerun relevant tests, push remote branch, provide remote SHA and test evidence. No merge or deploy.
- Keep Track D independently on CI harness and acceptance. Do not rely on claimed browser results until remote CI actually runs.
