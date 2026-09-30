# Order Forge V2 frontend integration handoff

Branch: `of3/order-forge-v2-frontend-integration` (local worktree `.worktrees/of3-integration`).
Base: `origin/main` `838628f9bdf22a7300efd73a4862c1285809318d` (fetched; matches expected).
Final SHA: see the pushed branch head (this file is committed on top of the two cherry-picks; the two code commits are below).

## Integrated commits (cherry-picked, zero conflicts)
| Source | Original SHA | Integrated SHA |
|---|---|---|
| F1 `of3/f1-order-forge-visual` | `4f482b57dfc8d7baa5ea114f6c4b18d006c49c86` | `7fefc721` |
| F2 `of3/f2-order-forge-sfx` | `1b8c439a6d87a4aa0dad091b38204cbdd32a2532` | `5d1ccf87` |

## Scope verification (diff vs origin/main, code commits)
- `src/assets/ranked/base-shop.jpg` included (67,076 bytes).
- No `CanonicalArena` changes; no backend / supabase / migration / functions files; no grading, order state, submission, reveal-authority or contract-reading changes.
- Not published to Lovable. `main` not touched.

## Visual changes (F1)
Module-local only: faint blurred `base-shop.jpg` backdrop behind Order Forge (aria-hidden, inert, static, parchment scrim); wider playable stack at md/xl; circular rank badge at md+; height-gated tall-desktop tier (>=860px) with taller rows/art/Lock In; short desktops get width only; phone layout unchanged. Screenshots in `docs/of3-f1/`.

## Audio changes (F2)
Lock cue on server-accepted Order Forge submission (`ranked.answer.lock`); verdict cue (`ranked.answer.correct/incorrect`) from own reveal, with settled `segment_reveal` fallback using the same eventId (engine dedupe prevents double fire); award phrase suppressed for a fallback-verdict settlement; silent on hydration, timeout, refused submissions, and all drag/reorder interaction. No new sounds or audio system.

## Certification (run in the integration worktree)
| Check | Result |
|---|---|
| Vitest: `interaction-grammar`, `ranked-core` (primitives, modules, contract), `quiz-ranked` (incl. `useRankedMatchSfx`, segment SFX) | 115 files / 1458 tests pass |
| Playwright `Order Forge` (arena config): desktop fit 1920x1080 ... 1600x900, 1366x768, 1280x720, 1024x768 open+revealed; phones 360x740, 360x800 (page scroll, 44px controls); F1 backdrop + input (drag, keyboard ArrowDown, up/down buttons) at 1600x900, 1280x720, 360x800 | 25/25 pass |
| Playwright full arena-fit/result-fit/outro-axis suite | 430 pass, 1 fail (pre-existing, below) |
| Playwright `ranked-sfx` e2e (edge) | 6/6 pass |
| `npm run build` | exit 0 (build rewrites `public/sitemap.xml`; reverted, not committed) |
| `eslint .` | 315 errors / 236 warnings, **identical to clean origin/main**; 0 errors in touched files |

Note: an earlier full-suite run showed RMOB1 phone timeouts while the machine was under load; re-run in isolation 84/84 pass, and the clean full run had no RMOB1 failures.

## Failures compared against clean origin/main (`838628f9`)
- `RMOB2 compact phone HUD › is 40px tall...` (expected 40, got 44): fails identically on origin/main. Pre-existing, not attributable.
- `AnswerGrid.elimination` (2), `DailyOnCanonicalArena.boundary` (2), `QuestionStageGeometry` (3): 7 failures, identical set on origin/main. Pre-existing source-scan tests.
- Full-repo `vitest run` runs out of memory on this machine (both trees); not attributable to this change.

## Coverage gaps (honest)
- Touch scrolling is covered by the phone 360x740/360x800 Playwright tests (page scroll, grip touch-action, 44px controls); no dedicated physical-device test.
- Reduced motion: F1 added no motion (static backdrop); no new dedicated reduced-motion test was added in this integration.
- Real-engine once-only SFX drop relies on the existing engine eventId-dedupe test; no hook+engine integration test.

## Environment notes
- `package-lock.json` on origin/main is out of sync with `package.json` (drizzle deps), so `npm ci` fails; deps installed with `npm install --no-package-lock`.
- `playwright.arena.config.ts` webServer fails under Windows cmd; vite was started manually on :8123.
- SWC native cache needed `SWC_NATIVE_BINDING_CACHE` pointed at a user dir.

## Remaining backend dependencies
Frontend assumes the existing server contract: `ownChallengeReveals[0].orderForge.isCorrect`, `segment_reveal` settlement (`correct`/`incorrect`), server-authored prompt/labels/media, `submitSegmentChallenge` accept/refuse. Nothing new was added; any V2 server authority changes beyond these remain backend-owned and unverified here.
