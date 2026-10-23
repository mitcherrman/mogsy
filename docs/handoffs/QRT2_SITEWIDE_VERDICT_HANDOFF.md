# QRT2 — sitewide verdict clarity and readable reveal timing

State: implementation **not started**. Separate frontend branch `qrt2/sitewide-verdict-clarity` forked from `main` on 2026-10-22. No merge or deploy. This is the durable handoff for a **fresh Claude instance**; start here and inspect current code/history before edits.

## Objective / owner requirements

An answer click must acknowledge selection instantly, then show a server-authoritative, unmistakable **CORRECT / INCORRECT / TIME'S UP** result with (when disclosure is allowed) the correct answer, the player's selected wrong answer, and any short explanation/evidence. Give the player real time to read it; do not steal next-card answer time to fake a longer reveal.

QRT1 already handles **Mastery Journey** exact reveal windows (ordinary 2250 ms; raw calculation 5000 ms; mitigated damage / haste 7000 ms) and submit-ack presentation. Companion **draft** PRs: frontend [#134](https://github.com/mitcherrman/mogsy/pull/134), backend [#97](https://github.com/mitcherrman/League_Combat_Simulator/pull/97). They are **not merged** as of this handoff; don't duplicate, cherry-pick or conflict with their files without explicitly coordinating. QRT1's Equation Unfold fold point stays **3.2 seconds**.

## Product decisions

- **Preserve outcome-dependent server reveal holds in puzzle modes**: Reconstruct / Scrub exact 3400 ms, wrong or timeout 4000 ms; Match Grid all exact 3000 ms vs wrong 4500 ms; Assembly exact 3600 ms vs wrong 4400 ms. These corrections need longer reading time after an error. Preserve frozen sessions and the server's current pacing.
- For ordinary quiz rounds, current FE `src/lib/ranked-core/pacing.ts` still uses 1500 ms nominal, 2600 ms when level-up/evidence, and a 900 ms late-poll minimum. This is **not** the requested sitewide result. Proposed product baseline for review: **2250 ms ordinary, >=3000 ms with real evidence**, but verify server scheduling/clock compensation in backend before changing. Do NOT extend a frontend hold past next answerable time.
- For Meta Reflex, current backend is 1500 ms; Order Forge has two pacing layers. Do not raise frontend-only timers. Audit actual state deadlines and make coordinated backend adjustments where appropriate.
- Practice already pauses auto-advance on focus/hover/hidden and uses 1500ms simple or explanation-length reading time. Preserve reader-controlled pauses; audit whether simple Practice also needs the proposed ordinary-question baseline.
- Pro Play / Worlds quizzes have manual Next; don't replace it with forced auto-advance.
- Daily unresolved retry: **never disclose correct answers before the backend says `disclosureAllowed`**. Distinguish a scored miss from a fully resolved question.
- Do not invent a verdict, correct index, explanation or state client-side. Treat timeout separately from incorrect. Correctness and selected/correct answer come from canonical server payloads.
- Never make a fixed overlay block answer buttons, introduce mobile scroll, shift layout during reveal, or cause the next question timer to count invisibly.

## Current code anchors (verified by GitHub source inspection)

- `src/lib/question-feedback/model.ts`: existing `ResolvedFeedback`, `FeedbackVerdict`, `VERDICT_HEADLINE`, `sealed`. Reuse rather than build an independent verdict model.
- `src/components/ranked-arena/QuestionResultOverlay.tsx`: current viewer and delayed opponent stamps, accessibility `sr-only` status, reduced-motion support.
- `src/components/ranked-arena/RoundResultBeat.tsx`: current fixed-height top result, viewer `text-sm` / `lg:text-base`; outcome/tone already `font-black`; don't enlarge blindly on 360px phones.
- `src/components/ranked-arena/RevealBanner.tsx`: existing `resultHeadline` and `text-lg` verdict, but not necessarily the active Ranked screen.
- `src/components/quiz/QuizAnswerOptions.tsx`: `data-choice-state` (idle/selected/correct/incorrect-selected), `markSelectionOnReveal`, per-option art; already marks selected and correct without leaking answers before reveal.
- `src/lib/ranked-core/pacing.ts`: `anchoredRevealHoldMs`, `serverPacedHoldMs`, `finalServerPacedHoldMs`; holds and server title/next-card deadlines matter.
- QRT1 handoff: `docs/handoffs/QUESTION_REVEAL_UX_HANDOFF.md` in `reveal/qrt1-frontend` or [PR #134](https://github.com/mitcherrman/mogsy/pull/134), including the complete inventory of result renderers, timings and recommended shared-component approach.

## Suggested implementation slices

1. **Audit and test first**: map active result surfaces (do not modify inactive banners), verdict source, selected/correct highlights, disclosure and timing contract per mode. Reproduce too-small verdict/too-fast reveal with deterministic tests and mobile captures.
2. **Shared presentation foundation**: unify `FeedbackVerdict` -> labels, icons, tones and selected-vs-correct treatment. Make one small `VerdictLine`-based heading or adapter; avoid one monolithic mega-renderer. Introduce clear accessible text even in color-blind and reduced-motion cases; preserve no-double-announcement intent.
3. **Incremental mode adoption**: Ranked/Daily quiz questions first, then Practice, standalone/legacy Mastery, Meta Reflex, puzzle modes, Pro Play/Worlds. Where layouts genuinely differ, share semantics/tokens instead of forcing a single layout.
4. **Clock-safe reading time**: modify FE/BE timing only in coherent pairs where authoritative scheduling requires it. Include retries, incorrect, timeout, final card, reload/resume, late arrival, server failures and locked-next-question visibility. Do not regress QRT1's submit-ack or frozen windows.
5. **Acceptance**: 360x640, 390x844, 430x932, desktop; normal long-copy, image choices, selected wrong vs correct, correct, timeout, retry-limited Daily, 1.5s-poll delays, reduced-motion, screen reader; no page scroll or layout shift; full allotted visible reveal when network allows; no new failures versus the same clean baseline.

## Execution and release gates

- Use a fresh isolated worktree; both other local repo checkouts were dirty. Work on this branch or update it against current main after review; avoid changing `main` directly.
- Before finalizing, reconcile QRT1 PR #134 / #97 and rebase/reconcile any overlapping changes; don't merge pending timing changes implicitly.
- Maintain this handoff with decisions, files, tests, screenshots/metrics, PR links, blockers and next task.
- No Docker, Railway access assumption, production data writes, merge, publish or deployment. Submit scoped draft PR(s) with local/baseline differential evidence and explicit ordered rollout.
- Quality first; explain any hard-to-prove live timing limitations rather than calling them fixed.

## Current dependencies and blockers

As checked 2026-10-22 local, QRT1 frontend #134 was 4 commits behind main and backend #97 26 commits behind master. The backend showed six GitHub Actions failures; logs were not retrievable through the connector, so root cause is **unknown**. Both PRs are mergeable and draft. Address these release gates in parallel, without blocking UI work that can be safely developed in isolation.

**Next task:** implement QRT2 Phase 2A foundation and the Ranked/Daily active question-result surface, with testable before/after mobile captures; keep cross-mode adoption in smaller follow-up PRs.
