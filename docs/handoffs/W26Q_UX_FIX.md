# W26Q-UX — Worlds 2026 Quiz: auto-advance, one screen, one HUD

Date: 2026-10-23. Verification level: **L2** (unit/integration tests + owner-authorized bounded headless browser runs).
Status: **SHIPPED UNDER AN OWNER VERIFICATION WAIVER (2026-10-23).** The owner explicitly authorized releasing without further tests, type checks, build or visual verification, accepted the risk of unverified layout and interaction defects, and approved removing the decorative anchor plate below 760 px. The wording below (written before the waiver) still describes what is and is not verified: the viewport matrix was never green and the last batch of edits was not type-checked or built locally. Original status: **IN PROGRESS, NOT RELEASE-READY.** Code and unit tests are done; the viewport matrix is **not yet green** (see §6). Nothing is committed, pushed, merged, published or deployed.

| | |
|---|---|
| Repo | `mitcherrman/mogsy` (frontend only; no backend change) |
| Branch / worktree | `worlds26/ux-fix` at `C:\Users\mlmit\mogzy-wt\w26q-ux`, from `origin/main` `29943ddb` (includes W26Q #104 `608f9312`) |
| Rules read | `CLAUDE.md`, `AGENTS.md` (browser safety), memory notes for W26Q, Practice PM2, capture tooling |

## 1. What was asked

Worlds-only: auto-advance after a **server-confirmed grade**; no Next / See results controls; reveal and accessibility intact; every state fits a **non-scrolling** viewport; `mogzy.lol` shown at all widths; consistent HUD; no layout jumps. No global CSS regressions, no unrelated route changes, no merge or publish.

## 2. What the code did before (inspected)

- `Worlds2026Quiz` renders `ProPlayArenaRun` (the Pro Play Quiz's run) with a preset. The reveal ended in a **Next / See results** button (`NextControl`); `controller.next` was the only advance.
- Below `lg` the Pro Play arena was a *stacked, scrolling* column (`phoneStacked`), not the Ranked/Daily/Practice phone one-screen frame (`phoneOneScreen`).
- The route chrome was a zero-height back link; no `mogzy.lol` anywhere. Daily and Practice carry the domain in their header row.
- Practice (PM2) already had the reference pattern: `phoneOneScreen`, a held reveal box, `usePracticeAutoAdvance` + `usePracticeRevealPause`, and a header row with the domain. This change reuses those two hooks and that pattern. Ranked and Daily were read as the contract for the one-screen frame; they are untouched.
- The sitewide `Footer` rendered under `/lol/pro-play/quiz/worlds-2026` (it is hidden for `/quiz*`), which alone made the document scroll on every phone.

## 3. What changed (all opt-in; the Pro Play Quiz is byte-for-byte unchanged in behaviour)

| File | Change |
|---|---|
| `src/pages/Worlds2026Quiz.tsx` | passes `presentation="one-screen"` |
| `src/components/pro-play/arena-run/ProPlayArenaRun.tsx` | new `presentation: "standard" \| "one-screen"` prop. One-screen: no Next/See results (only the recovery **Try again** over an errored question remains); auto-advance armed **only** by `projection.reveal` (exists only after a received server grade), keyed on `session_id:question_id`; `controller.next` is the advance (same exactly-once path, refuses while a request is in flight, resyncs when the grade carried no next question); pause on focus/press inside the reveal, open dialog/dock panel, hidden tab; scoped class `pp-one-screen`; compact-stage hook (`(max-width:1023.98px) and (max-height:760px)`) |
| `src/components/pro-play/arena-run/proPlayAutoAdvance.ts` (new) | pure hold rule: staging time (0 under reduced motion) + reading time (max of the 2600 ms evidence beat and 1200 + 45 ms/char, capped 12 s) |
| `src/components/pro-play/arena-run/composeProPlayArenaStage.tsx` | `oneScreen` option: `phoneOneScreen: true`, dense footer, hairline meter, footer ref; when `compact`, no anchor plate and `mediaScale: "none"` |
| `src/components/pro-play/arena/reveal/ProPlayRevealFooter.tsx` | optional `dense`, `densityTier`, `advance`, `footerRef`. Dense = one row at every width; per-option statistics move into the **Source** disclosure (kept sr-only in the footer) so the held box never grows a row per option. Defaults leave the Pro Play Quiz unchanged |
| `src/components/pro-play/arena-run/ProPlayRouteChrome.tsx` | new `ProPlayOneScreenChrome`: way back + position + **`mogzy.lol`**, one real row below `lg` (Practice's row), zero-height with fixed items from `lg` (back centred, domain at the band's right clear of the identity cluster). One back link in the DOM, same `pro-play-back` test id and label |
| `src/components/Footer.tsx` | hidden on exactly `/lol/pro-play/quiz/worlds-2026` (the `/quiz` precedent) |
| `src/index.css` | one block scoped to `.pp-one-screen` / `.pp-advance-meter`: reveal box height token, text tiers, Community trigger waits on phones, landscape budget. No existing rule edited |

Accessibility kept: the live verdict sentence (`role=status`), explanation, Source disclosure, per-option statistics (sr-only), focus handoff to the new stem after an advance, 44 px hit areas, reduced motion (no staging delay, no meter). The auto-advance pauses while the player is inside the reveal, so a keyboard or screen-reader user can hold it.

**Known tradeoffs for the owner**
1. **Compact screens (phones shorter than 760 px, and all landscape phones) do not draw the anchor plate.** On 360x640 the plate plus a 3-line prompt cannot fit the frame; Practice makes the same trade for questions without art. The stem, the reveal's metric/scope and the Source panel still carry the competition and metric.
2. **No site footer on this route** (legal links reachable from other pages), as for `/quiz`.
3. **Auto-advance has no user control beyond pause-on-focus/press** (and Back). Hold is ~4–5 s for a 60-character explanation. Tunable in one file.

## 4. Tests (exact)

Run in the worktree with the repo's own vitest config (no scratch config needed on this machine today):

```
npx vitest run src/pages/Worlds2026Quiz src/components/Footer src/components/pro-play
```
Result before the last two edits to the footer/stage: 24 files passed. After them, the files touching the change were re-run:

```
npx vitest run src/pages/Worlds2026Quiz.oneScreen
→ Test Files 1 passed (1) · Tests 10 passed (10)
```
and the suites above (25 files, 830 tests): **829 passed, 1 failed**, the failure being my own new compact-plate assertion (wrong marker), fixed and re-run green (10/10 above). The `src/components/pro-play`, `src/lib/pro-play`, `src/pages/pro-play` suites were green in the earlier run; the full set was **not** re-run after the final edits (see §6 blockers).

New/changed tests: `Worlds2026Quiz.oneScreen.test.tsx` (10: no Next/See results; advance only after the grade, exactly once, never while pending, pause on focus and resume, focus lands on the new stem, dense reveal with statistics in Source and sr-only, plate on tall / off on compact, mogzy.lol + position + one back link in question/loading/unavailable/end), `Worlds2026Quiz.test.tsx` (full real session now plays by advancing, no button), `proPlayAutoAdvance.test.ts` (hold rules), `Footer.w26qux.test.tsx`.

`tsc --noEmit -p tsconfig.app.json`, run before the second batch of edits: only 2 pre-existing errors in files not touched (`OnboardingProfile.tsx`, `identity/connections.ts`). **Not re-run after the second batch** (blocked, §6). ESLint on the changed files: clean (first batch).

## 5. Browser evidence (owner-authorized, AGENTS.md exception)

Authorization: "Yes, up to 3 runs", 2026-10-23. Bundled Playwright headless Chromium shell only, 1 worker, 1 page at a time, no profile, owned `127.0.0.1` static server, fixture-fed API (`worlds2026PresetSession.json`), everything else aborted, hard timeout, `try/finally` teardown, no leftover processes checked after each run. Harness: `docs/handoffs/w26q-ux/ux-cert.cjs`.

- **Run 1 (aborted, no data):** harness bug — the static server compared a Windows path with `/` separators, so every asset returned `index.html`. Fixed (`path.resolve`).
- **Run 2 (19 captures, 0 passed; real measurements):** 360x640, 390x844, 844x390 reached. Screenshots: `…\scratchpad\run2\shots\*.png`, results `…\scratchpad\run2\ux-cert-results.json` (scratchpad of this session, not committed).
- **Run 3: NOT RUN.** Remaining authorized run is unused (§6).

Run 2 findings, and what each led to:

| Finding (run 2) | Cause | Fix made (unverified) |
|---|---|---|
| Document 1296 px tall in a 640 px viewport, on every phone and the loading frame | sitewide Footer under the route | Footer hidden on the route |
| 360x640: shell 680 px in 600 px available; reveal box under the bottom bar | anchor plate 122 px + 3-line prompt + 76 px reveal | compact stage: no plate, `mediaScale: none`, reveal 72 px |
| Reveal footer 243 px (footer taller than its reserve) at 360x640; ~180 px at 390x844 | per-option statistics drawn visibly (4 rows) | dense footer: statistics in Source, one row |
| Frame moved question→reveal (`match, shell, hud`, and at 390x844 `answers, bottom`) | same footer growth | same |
| 844x390: answers below the fold, reveal unreachable | landscape needs its own budget | landscape block in the scoped CSS (prompt 36 px, answers 100 px, 44 px targets, one-row reveal) |
| "brand meets the HUD chips" on every frame | probe counted a pointer-events:none wrapper; screenshots show `mogzy.lol` clear of the chips at 360, 390 and 844 | probe fixed; **needs the next run to confirm** |
| `mogzy.lol` visible on every captured frame; one back link; position `1 / 10`; no Next/See results control | — | confirmed in run 2 |

Not yet seen at all: 740x360, 1024x768, 1440x900, 1920x1080, the end/unavailable/error frames beyond phone portrait, and the real-time auto-advance check. **The "fits every viewport / no jumps" claim is therefore unverified.**

## 6. Blockers and next step

1. The resource guard blocked the rebuild and `tsc`: `available RAM 3,333 MB < required 4,000 MB` and another session's `pytest` (pid 16180) running outside the guard. I did not retry in a loop or bypass it.
2. To finish: when the guard allows, rebuild (`npx vite build --outDir <scratch>/dist`), run `tsc --noEmit -p tsconfig.app.json` and the full pro-play/page suites, then **run 3** of the authorized browser matrix (49 captures + 2 timing checks). Expect another round of CSS adjustment at 360x640, 844x390/740x360 and the desktop widths; if the matrix needs more than the one remaining authorized run, ask the owner again.
3. After a green matrix: copy the final screenshots into `docs/handoffs/w26q-ux/shots/` and fill §5 with the pass table. Do not merge or publish without owner approval; Lovable publish is the owner's.

## 7. Files not touched

`CanonicalArena`, `ArenaShell`, `QuizAnswerOptions`, Ranked, Daily, Practice and every other route; the Pro Play Quiz's own page; no backend; no `index.css` rule outside the new scoped block.
