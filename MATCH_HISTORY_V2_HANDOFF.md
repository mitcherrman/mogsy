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
