# PPQ2-E — Pro Play Arena route integration (IN PROGRESS: not yet certified)

| | |
|---|---|
| Branch | `ppq2e/arena-route-integration` (worktree `C:\Users\mlmit\mogzy-wt\ppq2e`), pushed as a feature branch only |
| Base | origin/main `a59526b2` (unchanged at start) + PPQ2-INT `2367a004` merged `--no-ff` (`17431899`); src identical to the PPQ2-INT trial merge |
| Status | **Partial.** The session hit its usage limit before the regression gates. Do not merge |

## Done
- `/lol/pro-play/quiz` = `ProPlayArenaRun` on `useProPlayArenaController()` (`src/pages/ProPlayQuiz.tsx`). The same lazy page and route line are kept, so App/route-prefetch are unchanged.
- The page's `usePublishReportableQuestion` is deleted; CanonicalArena is the only publisher. A source guard covers `pages/ProPlayQuiz.tsx`, and a page test proves one publisher with the right identity (answer only after grading).
- Kept: the SEO head, a sr-only `h1`, loading/error/Try again/resync/expiry/restart/completion (controller), and keyboard input (canonical buttons).
- Back to Pro Play: `ProPlayRouteChrome`. It is absolute in the HUD band below `lg`, so it scrolls with the page instead of floating over the stage. From `lg` it is fixed, as on Ranked.
- Layout full-bleed: `PRO_PLAY_QUIZ_ROUTE` added.
- **Dock overlap (390 partial evidence).** Real-layout finding: the evidence shot comes from `cap.cjs` running `scrollTo(0,0)` before a full-page capture. In the real flow, Next was already scrolled above the dock. A real gap remained: only Next was the scroll target, and from `sm` the explanation sits beside Next and can be taller. Now the whole reveal footer is scrolled into view (`DOCK_SCROLL_MARGIN`, nearest, independent of focus). The live captures show the footer clear of the Report pill in normal, partial, absent and long-explanation reveals at 390. The pill still covers the first timeline nodes, which is arena-wide behaviour.
- Found and fixed: the frame glow bleed overflowed the loading/error/end frames at 390 (394/390) and every frame at 1024. Fix: `overflow-x-clip` on the route's arena wrapper (no shared Arena change).
- Completion panel unchanged: neutral, server score and verdicts only.
- **Timeline marker** unchanged: it advances at grade (server truth). The alternative, holding visual focus on the revealed node until Next, is presentation-only and not built.

## Verified so far
- `ProPlayQuiz.test.tsx` passes 29/29: all 21 PPQ0C/PPQ0A behaviours ported one for one (selector map in the file header) plus 8 route tests.
- `arena-run` passes 55/55 (2 new dock-scroll tests).
- `tsc -p tsconfig.app.json`: only the 2 pre-existing errors.
- ESLint on changed files: clean.
- `npm run build` exit 0 (before the last chrome/clip commit; re-run needed). The quiz chunk contains the arena. No fixture, dev page or preview code is in dist; only the Layout path string `/lol/dev/pro-play-arena`, as before. The legacy `data-pro-play-evidence` is gone from dist.
- Live production-route a11y (`route-a11y.cjs`, files in this dir):
  - 1440: Tab reaches the tablets; Enter answers; focus moves to Next. The `role=status` verdict is present. Shift+Tab reaches Source; Enter opens the dialog with focus inside; Escape returns focus to Source. The Report tab is reachable (117×46).
  - 390 with reduced motion: every node is `static`, with 0 animated nodes.
  - After Next, focus falls to BODY. The old page behaved the same; this is a possible follow-up.
- Production-route capture sweep (`route-cap.cjs`, live guest sessions; variants are labelled synthetic response rewrites): **390 complete, 0 violations**. The 1024/1440 run was still in progress when the session ended; `route/run.log` and `route/probe.json` may be incomplete.

## Left (blocking certification)
1. Finish or re-run the capture sweep at 1024 and 1440:
   `node docs/handoffs/ppq2e/route-cap.cjs docs/handoffs/ppq2e/route 1024x768,1440x900`
2. Capture the old page on main (:5280, launch entry `main-a59526b2`) for comparison:
   `PPQ_LEGACY=1 PPQ_BASE=http://localhost:5280 node docs/handoffs/ppq2e/route-cap.cjs <out>`
3. Run the full Vitest suite in chunks on `mogzy-wt/main-a59526b2` and on this worktree, then diff the failures. The chunk script pattern is in the session scratchpad `vt-chunks.sh`; per memory, don't run it concurrently with a capture sweep.
4. Run the focused PPQ2-B/C/D guards (`lib/pro-play/arena`, `components/pro-play`, `AnswerGrid.elimination` vs base, `CanonicalArena.questionSurface`/`regionsSeam`, `lib/feedback`, `components/report`).
5. Run the Ranked/Daily/Journey DOM and pixel harness:
   `CERT_BASE=http://localhost:5280 CERT_BRANCH=http://localhost:5281 node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff`
   The only shared-file change is `Layout.tsx`, one route string.
6. Re-run `npm run build`, then `git checkout -- public/sitemap.xml`.
7. Follow-up (not blocking): `quiz-screenshot/presentation.ts` and `QuizRenderPage` still describe `ProPlayQuestionCard` as the production renderer.

Launch entries: `ppq2e` :5281 (this branch); `main-a59526b2` :5280 (clean base).
