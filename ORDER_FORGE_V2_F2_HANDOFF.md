# OF3-F2 handoff — Order Forge SFX

Branch `of3/f2-order-forge-sfx`, from origin/main `838628f9`. Frontend only; no visuals, no backend, no new sounds or audio system.

## Behaviour
| Cue | When | Event | eventId |
|---|---|---|---|
| Lock | server ACCEPTS the Order Forge submission (`submitSegmentChallenge` `onAccepted`) | `ranked.answer.lock` | `ranked:${matchId}:segment:${n}:card:0:lock` |
| Verdict | first appearance of `ownChallengeReveals[0].orderForge.isCorrect` | `ranked.answer.correct` / `.incorrect` | `ranked:${matchId}:segment:${n}:card:0:verdict` |
| Verdict (fallback) | settled `segment_reveal` for the viewer (`correct>0` / `incorrect>0`), no own reveal observed | same | **same verdict id** |

Refused/stale submissions play nothing. Drag, grip, reorder, hover and focus play nothing (no code path reads them). `useSfx` is not in `OrderForge.tsx` / `orderForgeModule.tsx`.

## Fallback
`useRankedMatch` already exposes `lastSegmentSettlement` + `lastSegmentRoundNumber` (round number == segment number for segments). `QuizRankedMatch` passes the settlement to `useRankedMatchSfx`, which derives `orderForgeSettled` and, on a NEW settlement with `revealHold` live, emits the verdict with the same id. Hydration/resume (hold skipped, first observation is baseline) stays silent. Timeout (neither correct nor incorrect stated) is silent.

## No double-fire
Both paths emit the identical eventId; the engine's global eventId dedupe (`sfx.ts` `rememberEventId`, covered by `sfx.test.tsx` "dedupes a stable eventId") drops the second. No new dedupe system. The watch's `orderForgeVerdictSegment` is used ONLY to decide award suppression, not to gate the cue.

## SFX2 hierarchy
Fallback verdict is the settlement's single cue: the award/speed phrase is suppressed for that settlement (one cue per settlement). If the verdict already came from the own reveal, the later settlement keeps its ordinary `ranked.points.awarded` (Journey precedent). Standard/Meta Reflex/Journey paths unchanged. Like Journey/Meta, nothing sounds while `terminal` (the match-result sting owns that moment) — a final-segment verdict is therefore covered by the result sting.

## Tests
- `useRankedMatchSfx.test.ts`: 11 new Order Forge cases (own correct/incorrect, fallback, same-id, no award stack, award after own reveal, hydration silent, timeout silent, reorder silent, Standard unchanged).
- `useRankedMatch.segment.test.tsx`: accepted lock once with stable id; refused lock silent.
- Observer-level tests prove the ids are identical; the actual once-only drop is the existing engine dedupe test (no hook+real-engine test added).

## Files
`src/pages/quiz-ranked/useRankedMatchSfx.ts`, `useRankedMatch.ts`, `QuizRankedMatch.tsx` (one prop), `useRankedMatchSfx.test.ts`, `useRankedMatch.segment.test.tsx`, this file.
