# PPQ2-E — Pro Play Arena on the production route

| | |
|---|---|
| Branch | `ppq2e/arena-route-integration` (worktree `C:\Users\mlmit\mogzy-wt\ppq2e`). Pushed as a feature branch only. **Not merged, not published** |
| Base | origin/main `a59526b2` (unchanged when the work started and at the end) |
| PPQ2-INT | `2367a004` merged `--no-ff` as `17431899`. All PPQ2-B/C/D/INT commits are preserved as ancestry, none duplicated. `src` is identical to the PPQ2-INT trial merge `7667ad45` |
| Status | **Certification candidate. Every gate below passes or matches clean main. STOP for control-center review** |

## 1. What changed

| Area | Change | File |
|---|---|---|
| Route | `/lol/pro-play/quiz` renders `ProPlayArenaRun` on `useProPlayArenaController()`. The lazy page, `route-prefetch` key and route line are unchanged | `src/pages/ProPlayQuiz.tsx` |
| Reporting | The page's own `usePublishReportableQuestion` is **deleted** in the same change. `CanonicalArena` is the only publisher | same |
| SEO / structure | The `SEOHead` (title, description, path) is kept, plus a visually hidden `<h1>Pro Play Quiz</h1>` | same |
| Way back | `ProPlayRouteChrome`, zero height, in the HUD band. Below `lg` it is `absolute` beside the hat and scrolls with the page; a fixed link floated over the stage while the page scrolled. From `lg` it is `fixed`, centred in the arena strip's empty centre track; beside the hat it ran over "PRO PLAY QUIZ" below ~1350px. On the empty frames (loading/error/end) it is phone-only, because from `lg` their panel covered it while it stayed focusable. Those panels carry their own Back to Pro Play, and the loading panel gains one from `lg` | `arena-run/ProPlayRouteChrome.tsx`, `ProPlayArenaRun.tsx` (`backLink`) |
| Full-bleed | `PRO_PLAY_QUIZ_ROUTE` joins Layout's full-bleed list. The route was already in the LoL theme section | `src/components/Layout.tsx` |
| Dock overlap (required fix) | See §2. The **whole reveal footer**, not only Next, is scrolled above the dock's clearance (`DOCK_SCROLL_MARGIN`, `block: "nearest"`, independent of focus; reduced motion → instant) | `ProPlayArenaRun.tsx`, `composeProPlayArenaStage.tsx` |
| 4px overflow | The arena frame's glow bleeds 0.25rem past the shell: 394/390 on the loading/error/end frames on phones, and 1028/1024 on every frame (PPQ2-A A5). `overflow-x: clip` on this route's arena wrapper trims it. That is not a scroll container: no scrollbar, no sticky/fixed side effects, and the dock and popovers are portalled | `ProPlayArenaRun.tsx` |
| 1024 plate / dossier clip | A reveal footer taller than the HUD reserve (long explanation, or the partial-evidence note) shrinks the height-locked stage. The plate cut 8–34px off its lower rows, and the dossier 5–6px. Both now **drop rows that duplicate something shown elsewhere, in a fixed order, instead of clipping** (`useYieldToFit`). Never the name, the relationship or the question | `arena/useYieldToFit.ts`, `ProPlayAnchorPlate.tsx`, `ProPlayQuestionDossier.tsx` |
| 1024 team tablets | A long region ("NORTH AMERICA · 2015–2026") ran past a 2×2 tablet under the verdict icon. From `lg` the region truncates, with the full text in `title`; seasons never truncate. Phones are unchanged | `arena/ProPlayOptionContent.tsx` |

**Not changed:**
- backend, contracts, grading or option order (server-owned);
- the controller, projection and reducer (PPQ2-B);
- the shared Arena files (`arenaView`, `CanonicalArena`, `AnswerGrid`, `QuizAnswerOptions`, `InteractiveScenarioSurface`). `Layout.tsx` is the only shared file touched: one route string;
- the Pro Play Hub, and Worlds content generation;
- the DEV route `/lol/dev/pro-play-arena`, kept for QA (DEV-only, excluded from the build).

**Completion screen:** unchanged neutral panel. Server score, received verdicts as pips, Play again, Back to Pro Play. No Ranked vocabulary, LP, rating, opponent or reward. A test asserts this.

**Timeline marker (documented, not changed).** After the grade, the server's `answered` advances, so the strip marks the graded node resolved and the *next* node current. Meanwhile the answered question stays on stage until Next (PPQ2-B assumption 4: server truth). The alternative is a presentation-only hold: keep the current marker on the revealed node until Next (`projection.reveal !== null` → `current = answered`). It changes no server progression and would be a one-line projection change plus timeline tests. It's the owner's call.

## 2. The 390 "Report pill over the explanation" finding

- **Real layout.** The dock tabs are `fixed bottom-4/5` (`MogzyDock`). Below `lg` the stacked arena already pads its bottom by `--mogzy-dock-clearance` (RMOB1), so the last content can rise above the pill.
- **What the evidence image was.** `pro_play-correct-evidence_partial-390x844.jpg` was taken by `ppq2int/cap.cjs` after `scrollTo(0,0)`. The fixed pill therefore landed on the footer as the page looked *before* the reveal scrolled.
- **The real gap.** PPQ2-INT scrolled **Next** above the clearance. From `sm` the explanation sits beside Next and can be taller than it, and nothing guaranteed the footer's text.
- **Now.** The footer element is the scroll target with the clearance as its `scroll-margin-bottom`.
- **Measured on the production route.** `route-cap.cjs` adds a probe that fails if any footer text or control intersects a dock tab, or if the footer bottom is inside the dock band, at the settled state and without resetting the scroll. Result: **0 violations in 57 captures** (375, 390, 768, 1024, 1440) covering normal, partial-evidence, absent-evidence and long-explanation reveals.
- **No added blank space.** The clearance padding already existed.
- **Desktop stage stable.** At 1024 and 1440 the stage height is constant with an ordinary footer (548 / 680 px). Only the over-reserve footers (70–110 px) take from the stage, as PPQ2-INT §2.6.3 accepted; the plate and dossier now yield rather than clip.
- **Report control.** Unchanged, keyboard-reachable ("Report a problem with this question", 117×46).
- **Remaining overlap.** The pill does still overlap the first timeline nodes at the settled phone position. That is arena-wide (Daily/Journey stacked arenas behave the same), and none of it is text.

## 3. Verification

| Gate | Result |
|---|---|
| **PPQ0C page suite** (`src/pages/ProPlayQuiz.test.tsx`) | **30/30.** All 21 PPQ0C/PPQ0A behaviours ported one for one; the DOM map is in the file header and no assertion was dropped. Plus 9 route tests: one publisher with server identity and answer only after grading; a page source guard; route registration and full-bleed; the back link on stage and on frames; loading back; keyboard → Next focus; frame clip; unmount mid-answer drops the late response |
| PPQ2-INT `arena-run` | 55/55, including 2 new dock-scroll tests (footer is the target; nearest; reduced motion → `auto`; no scroll when in view). The route-not-switched assertion is updated to the new truth |
| `useYieldToFit` | 4/4 (order, minimality, never drops un-marked rows, restores) |
| **Focused set** (`components/pro-play`, `lib/pro-play`, ProPlayQuiz, `CanonicalArena.questionSurface` + `regionsSeam`, `AnswerGrid.elimination`, `question-surface`, `lib/feedback`, `components/report`, `mogzy-dock`, Daily boundary) | Branch 1354 passed / 10 failed; clean main 978 / 10. **Identical failure set.** All 10 also fail on main: `AnswerGrid.elimination` ×2 (Windows separators), `QuestionMotifLayer` CRLF, Daily boundary ×2, `feedback/contract` SQL ×5 |
| **Single-answer-renderer guard** | `AnswerGrid.elimination` reports the **same file lists** on branch and main (only path separators differ). `QuizAnswerOptions` is still the only emitter of `data-quiz-choice` |
| **Single-report-publisher guard** | Source guards on `pages/ProPlayQuiz.tsx` + every arena-run/dev file, plus the runtime test above |
| Retry / replay / expiry / double-click / stale | Page: lost response → identical resend, replayed once, Q2 never graded; resends exhausted → Try again resends the same answer; 409 → GET resync with no foreign reveal; expiry → restart; 503 after grade; omitted next question → resync; final answer lost → same summary; 3-click burst → 1 request; nothing leaks in flight; unmount mid-answer. Controller suite: restart mid-answer drops the stale response; double start → one start; unmount drops responses |
| **Full Vitest suite**, fresh process per 110-file chunk, branch vs clean `a59526b2` (`ppq2e/suite-vs-main.txt`) | Branch 15,731 passed / 70 failed / 7 skipped; main 15,353 / 70 / 7. **Identical failing-test set: 0 new, 0 fixed.** 1 unhandled error on both (`useAuth must be used within AuthProvider`, same chunk). `pt2cProfileFrameAuthority` excluded on both (OOMs here, environment) |
| `tsc -p tsconfig.app.json` | Only the 2 errors that already exist on main (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| ESLint, PPQ2-E-changed files (13) | 0 errors. 1 `react-refresh` warning that already existed in `ProPlayOptionContent.tsx` at the merge base |
| **Production build** (`npm run build`, final tree) | Exit 0. `ProPlayQuiz-*.js` (67 KB) contains the arena: reveal footer, Next, route chrome, loading back, yield, frame clip. No page publisher in that chunk |
| Dev / fixture exclusion | 0 files in `dist/assets` contain the fixture transport, fixture payload ids, dev badge, `ProPlayArenaDev`, previews or "use fixtures". The legacy `data-pro-play-evidence` / `-progress` hooks are gone. The only dev trace is Layout's `"/lol/dev/pro-play-arena"` comparison string, as before |
| **Ranked / Daily / Journey vs clean main** (`ppq2int-cert.cjs diff`, 15 states × 5 viewports) | **DOM identical 75/75.** Pixel-identical 67/75; the other 8 rows are only the Rules-dock mascot (≈195 px) and the Friends button (x≈24). **Control (main vs main): 75/75 DOM, 65/75 pixel, the same two noise boxes**, so branch vs main is within baseline noise. Every Journey and question-probe row is pixel-identical |
| **Accessibility, live production route** (`route-a11y.cjs`, `a11y-*.json`) | 1440: Tab order HUD → Back → plate chips → tablets (focus ring present); Enter answers; focus moves to Next; tablets disabled; `role=status` "Incorrect. You picked A, Taliyah. The answer is D, Rumble."; sr-only per-option statistics list; Shift+Tab → Source; Enter opens a `role=dialog` with focus inside; Escape closes and returns focus to Source; Report reachable. 390 with OS reduced motion: every reveal node `static`, 0 animated nodes |

**Production-route captures** (`ppq2e/route/`, `route-extra/`, sheets `ppq2e/sheet-{390,1024,1440}.jpg`)
- Live API, real guest sessions: about 45 ordinary ephemeral quiz sessions; no other production writes.
- States at 390, 1024 and 1440: ungraded, selected (answer held in flight), correct, incorrect, two- and four-way, Source open, completed. Also partial-evidence, absent-evidence and long-explanation reveals: **synthetic** rewrites of the live answer response, labelled in each file name.
- 375 and 768: main, partial and long.
- **57 captures, 0 probe violations, 0 page errors.**
- Stage at 1024: 548 px with an ordinary footer, 490–530 px with the synthetic tall footers, plate and dossier yielding with no clip. Every-reveal stress runs (`PPQ_ALL=1`, 30 reveals at 1024 with long, partial and absent footers): 0 violations.

**Before/after:** the old page captured on clean main (`ppq2e/main-legacy/`; old-page tiles are in the 390 sheet's second row and the 1024/1440 sheets' last cells).

## 4. Files (vs the merge `17431899`)

- `src/pages/ProPlayQuiz.tsx` (rewritten) and `ProPlayQuiz.test.tsx` (ported + new).
- `src/components/Layout.tsx`.
- `src/components/pro-play/arena-run/`: `ProPlayArenaRun.tsx`, `composeProPlayArenaStage.tsx`, `ProPlayRouteChrome.tsx` (new), `ProPlayArenaRun{,.reveal}.test.tsx`.
- `src/components/pro-play/arena/`: `useYieldToFit.ts` (new) + test, `ProPlayAnchorPlate.tsx`, `ProPlayQuestionDossier.tsx`, `ProPlayOptionContent.tsx`.
- `docs/handoffs/PPQ2-E.md`, `docs/handoffs/ppq2e/**`: `route-cap.cjs`, `route-a11y.cjs`, `sheet.py`, `suite-diff.py`, evidence.

## 5. Next steps / open owner calls

1. **Review, then merge onto main.** Merge, don't rebase, so the PPQ2 ancestry is kept. FE-only change: after merge, Lovable Publish, then smoke-test `/lol/pro-play/quiz` live (guest run, Report, reveal on a phone).
2. Timeline marker hold during the reveal (§1): an owner call.
3. After Next, focus falls to the page body; the legacy page behaved the same. Optionally move it to the new question's stem or first tablet.
4. Follow-up: `lib/quiz-screenshot/presentation.ts` and `pages/dev/quiz-render/QuizRenderPage.tsx` still describe `ProPlayQuestionCard` as "the component ProPlayQuiz renders". That is stale now; those legacy components remain only for those tools. `revealSupportLine` (PPQ2-D) can import `ProPlayEvidence`'s helper or retire it with them.
5. Still open from PPQ2-INT:
   - 3–4-way support lines truncate at 1024–1440, with `title`;
   - "(authority revision n)" in explanations (backend, PPQ1 Q4);
   - player/team media keys (PPQ1 Q6);
   - free vertical space in the flanks on tall desktops.
6. Worlds 2026 editorial focus is untouched here, as instructed.

**Blockers:** none.

## 6. Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2e log --oneline -8
# launch.json (primary checkout): "ppq2e" :5281 (this branch), "main-a59526b2" :5280 (clean base)
node docs/handoffs/ppq2e/route-cap.cjs <out> 390x844,1024x768,1440x900 main,partial,absent,long
PPQ_ALL=1 node docs/handoffs/ppq2e/route-cap.cjs <out> 1024x768 long,partial,absent
PPQ_LEGACY=1 PPQ_BASE=http://localhost:5280 node docs/handoffs/ppq2e/route-cap.cjs <out>
node docs/handoffs/ppq2e/route-a11y.cjs 1440x900          # or: 390x844 reduce
CERT_BASE=http://localhost:5280 CERT_BRANCH=http://localhost:5281 node docs/handoffs/ppq2int/ppq2int-cert.cjs <out> diff
python docs/handoffs/ppq2e/suite-diff.py <baseChunksDir> <candChunksDir>
```
