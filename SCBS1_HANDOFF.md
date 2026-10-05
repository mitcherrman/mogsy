# SCBS1 — Stat Check boundary stability

Narrow production defect: the Stat Check Arena shifted when a block opened (its first card) and again when it closed (its last card and the module after it), while the cards between held still.

Local only. Not pushed, not published, not deployed.

## 1. Base
`origin/main` = `a1958ff32de9e8c621124992d2340466f56fe89e` (fetched at the start; re-checked at the end).

## 2. Branch / worktree
- Branch `scbs1/statcheck-boundary-stability`
- Worktree `.worktrees/scbs1`

## 3. Exact reproduction
Through the real `QuizRankedMatch` (real controller, real arena, real Stat Check viewport), not a hand-built card. `/dev/ranked-shell-probe?q=opts4&mrlive=1&lol=1` (add `&frame=0` for a phone) walks a block one **server snapshot per click** (`src/pages/dev/ranked-shell-probe/statCheckLiveScript.ts`):

`pre-first` (a quiz round) → `loading` → `starting` → `first` card (with the 1800 ms entry beat up) → `first-reveal` → `middle` → `middle-reveal` → `final` → `final-reveal` → `waiting` → `completion` (next quiz round)

Every frame of every transition is sampled (50 ms) and compared with the quiz round the block opened from (arena) and with the settled first card (Stat Check). Viewports: 1280×800, 375×812 (required), plus 1920×1080 and 360×740.

## 4. BEFORE (origin/main components, same probe and spec)
Max movement in px over all sampled frames.

**The arena shell did not move on a desktop.** At 1280×800 and 1920×1080 the match box, header strip, focus column, folio and Module Rail were 0.0 in every frame, pre-first → completion. VISCONT1 was right about that. What moved was what the shell holds.

| 1280×800 | what | px |
|---|---|---|
| first boundary | "Starting…" → first card: card content (`n / 5`, prompt, cards) | **131.0** (surface 195.9/296 → 177.4/333) |
| first boundary | entry beat ending, with the first card up: surface / content | **6.0** (surface 171.4/345 → 177.4/333) |
| last boundary | final card → its reveal / the wait: `n / 5` | **+33.0**; cards **−33.0**; surface top **+18.5**, height 333 → 296 |
| middle (1920×1080) | a recognition card (large art) vs a named card | **6.0** surface, **12.0** content |

| 375×812 | what | px |
|---|---|---|
| first boundary | **Module Rail** (bottom-bar strip): left edge 100.5 → 12.0, width 183.4 → 271.8 | **88.5** |
| first boundary | "Starting…" → first card: surface 386.7/59 → 287.7/257 | **93–105** |
| first boundary | entry beat ending (surface 281.7/269 → 287.7/257) | **6.0** |
| last boundary | final card → the wait: cards 392.7 → 361.7; surface top 287.7 → 318.7, height 257 → 195 | **31.0** |
| last boundary | Module Rail returns on the next quiz round | **88.5** |
| middle | consecutive cards | 2.0 |

360×740 is the same within 1px.

## 5. Root cause (traced, three causes)
1. **The Stat Check surface was a different height in every phase, centred in the folio.** `MetaReflexViewport` drew "Loading" (one line), "Starting…" (two), the live card (header + prompt + 12rem row + note ≈ 333px) and the wait (which dropped the header and the prompt, ≈ 296px), each exactly as tall as it happened to be. The one reserve, `lg:min-h-[18.5rem]`, was 37px **short** of the live card and absent below `lg` — it reserved nothing at either end. So content jumped by half the height difference (all of it, 33px, for the cards once the prompt went) when a block opened and when its last card settled. Cards between were one height and held still. The card row also sized itself (`min-h-[7.5rem]` / `lg:min-h-[12rem]`), so a recognition card (large art) was taller than a named one at ≥1500px.
2. **The entry sting was the first child of a `space-y-3` stack.** It is `absolute`, but `space-y-3` still gave the next sibling a 12px top margin for exactly as long as the beat was up (1800 ms) and took it away when the beat ended: a 6px jump on the first card, on a desktop and on a phone.
3. **The phone's Module Rail stretched ~88px for the whole block.** The Report tab exists only while a mode publishes a *question* (`useReportableQuestion`), so it is absent for the whole of a Stat Check block. `MobileBottomBar`'s two tab slots were sized by their tab, so the empty left slot collapsed to 0 and the rail between them took its width. **Shared seam:** Mastery slice and Order Forge blocks have no Report tab either; measured the same 88.4px on both before the fix (§11).

## 6. Files changed
- `src/lib/ranked-core/modules/metaReflexModule.tsx` — one `BlockFrame` for every phase; `CardPrompt` two-line slot; `SettledCard` fills the row; error line in the status slot; surface is `relative` and not a `space-y` stack.
- `src/components/ranked-arena/MobileBottomBar.tsx` — both tab slots are fixed boxes (`TAB_SLOT`).
- `src/lib/playtest/preset.ts` — one stale label (§10).
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx`, `…/statCheckLiveScript.ts` — the `?mrlive=1` block script (dev route only).
- `e2e/ranked-statcheck-boundary.spec.ts` (new), `playwright.arena.config.ts` (testMatch).
- `src/components/ranked-arena/QuestionStageGeometry.test.tsx`, `src/lib/ranked-core/modules/metaReflexModule.level.test.tsx` — source-scan tests that pinned the old structure now pin the new one.

## 7. Fix
- **`BlockFrame`**: every phase (loading, unavailable, starting, answer, reveal, waiting) renders the same four slots, each of a declared height: header · prompt block (level slot `h-5` + a 2-line prompt slot, 3rem/3.5rem) · **card row (`h-[9rem] lg:h-[13rem]`)** · status line (`h-5`). A phase with less to say leaves its slots empty instead of giving the height back. The wait now draws the last card's header, prompt and settled card in place. Sized by arithmetic from the art slots (96/112/144/160px) and a two-line label, not by measuring; nothing is clipped.
- Surface is `relative` with the sting absolute and no sibling margin.
- `MobileBottomBar` slots: `h-8 w-[5.75rem]` each side (Report is 88.5×32), so the rail has one width whichever tabs are mounted.
- Not done: no DOM measuring, no ResizeObserver, no per-question ids, no animation, no arena enlargement, no generic Arena geometry change.

## 8. AFTER (same spec, same probe)
Every anchor: **0.0 px** in every sampled frame of every step, pre-first → completion, at all four viewports.

| | 1280×800 | 375×812 | 1920×1080 | 360×740 |
|---|---|---|---|---|
| Stat Check surface (top / height), every phase | 155.4 / 377 | 263.7 / 305 | 301.4 / 377 | 227.7 / 305 |
| Arena anchors (match, header, focus column, folio, rail / bottom bar + both slots + rail) | 0.0 | 0.0 | 0.0 | 0.0 |
| Stat Check slots (progress, level, prompt, card row, status, choices) | 0.0 | 0.0 | 0.0 | 0.0 |

The surface grows from 333/296 to 377 on desktop (305 on phone): the two-line prompt slot (+28) and a 13rem row (+16). It still sits inside the folio at 1024×768, 1280×720, 1366×768, 1440×900, 1536×730, 390×844, 360×640 and 320×568, with no clipped card and no page scroll (a quiz round already scrolls at 360×640 and 320×568; Stat Check does not).

## 9. Tests
- **New** `e2e/ranked-statcheck-boundary.spec.ts`, 8/8 at 1280×800, 375×812, 1920×1080, 360×740: (a) arena anchors ≤ 0.5px in every sampled frame, quiz → Stat Check → quiz; (b) the Stat Check surface and its slots ≤ 0.5px in every phase; (c) nothing clipped, no vertical or horizontal page overflow; (d) a card still answers ("Locked in"), reveals (`data-reveal="correct"`), advances to the server's card, and the block completes into the ordinary quiz. It fails on origin/main's components (4/4 geometry tests) and passes after. `SCBS1_REPORT=<prefix>` writes the per-step movement table.
- Existing smoke on the fixed tree, 1280×800 + 375×812: `ranked-visual-continuity` (every ordinary round; live rich→compact; **Stat Check shares the shell, level slot LVL 11 → none → LVL 20**), the Daily stages (Standard, Time Trial, Survival), `ranked-arena-fit` (RMOB1/RMOB2 phone composition, Stat Check seating): **185 passed, 1 failed** — `RMOB2 compact phone HUD is 40px tall` (44 ≠ 40), the inherited failure named in `VISCONT1_INTEGRATION_HANDOFF.md`; the global HUD is untouched.
- Vitest sweep (ranked-arena, ranked-core, ranked-public, quiz-ranked, playtest, probe, mogzy-dock, ranked-rules, report, quiz-daily-challenge): 2668 passed, 11 failed. The 11 are the inherited Windows source-scan names (AnswerGrid.elimination ×2, DailyOnCanonicalArena.boundary ×2, QuestionStageGeometry ×4, CanonicalArena.boundary ×1, masterySliceModule.visualLanguage ×2); QuestionStageGeometry and CanonicalArena.boundary were re-run on origin/main and fail identically. No new failure name.
- `tsc -p tsconfig.app.json`: 6 errors, none in touched files (same 6 as the base). ESLint: 0 errors on touched files.
- Not rerun: the Phase 1 certification matrix; `pnpm build`.

## 10. Naming
Contract: internal `meta_reflex` / `item_cost_duel` / `META_REFLEX_*`; users see **Stat Check**. Audited every `Meta Reflex` / `meta-reflex` / `reflex` in `src`, `public`, `index.html`, outside tests, comments and identifiers.
- **Fixed (1):** `src/lib/playtest/preset.ts` outro — "…reflex blocks, Mastery…" → `${META_REFLEX_LABEL} blocks`.
- Already correct: the block header, the entry beat ("Stat Check"), the timeline, the header centre, the result beat, the playtest interstitial.
- **Left on purpose:** admin/analytics "Legacy Meta Reflex (retired)" (the retired standalone game, a different product); parse-error text "is not a Meta Reflex card kind" (`contracts.ts`, a contract diagnostic naming the wire contract); persisted ids and categories (`meta-reflex`, `meta_reflex`).
- Known, not touched: the feedback category "Stat Check" clash recorded in `PHASE1_FRONTEND_INTEGRATION_HANDOFF.md` (needs a DB/config follow-up).

## 11. Shared-mode implications
- `MobileBottomBar` is shared by every phone Ranked and Daily match. Measured on `q=opts4` / `q=metareflex` / `q=masteryRecall` / `q=orderforge` at 375×812: **before** the rail was 183.4px wide on a quiz round and **271.8px** on the other three (88.5px left-edge jump); **after** it is 167.0px (104.0–271.0) on all four. So Mastery and Order Forge phones had the same jump and are fixed by the same seam, with no change in their own code.
- The visible quiz rail is 16.4px narrower on a phone (a fixed right slot as well as a fixed left one).
- Desktop: the floating Community/friends trigger drops 56px when the Report tab is absent (and rises again after the block). It is `Layout` chrome (`FloatingFriendsButton` `lifted`) outside the Arena shell, by design for non-quiz routes, so **not changed**. Command center may want a decision.
- Order Forge, Mastery and the quiz arena otherwise untouched; `ranked-visual-continuity` ordinary rounds and Daily stages are unchanged at both viewports.

## 12. Result SHA
See the final message / `git log -1` on `scbs1/statcheck-boundary-stability`. Code commit is the one before this file's commit.

## 13. Ready for command-center review
Yes, with two notes: the desktop friends-trigger lift (§11) is deliberately unchanged, and the spec needs its own dev-server port if another worktree already holds `:8123` (`playwright.arena.config.ts` reuses whatever answers there).
