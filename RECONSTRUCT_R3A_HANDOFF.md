# RECONSTRUCT R3A — Visual hardening and layout continuity

**State: COMPLETE on a local branch. Nothing pushed, merged, deployed or published.**
R3B (host-owned timing, last-result presentation, match ending) is **not started** and is
specified in §9 for the owner to authorise after RANKED-INT1.

## 1. Bases and commits

| | |
|---|---|
| Frontend repo | `C:/Users/mlmit/OneDrive/Desktop/mogsy` (remote `github.com/mitcherrman/mogsy`) |
| Base | `origin/main` = `b2b1804afdd1eee1a328629033a6c074128a7e3d` (fetched; equals the last independently verified SHA; the local `main` checkout was stale at `0d3fbcbb`) |
| Branch / worktree | `reconstruct/r3a-final-polish` / `C:/Users/mlmit/mogzy-wt/reconstruct-r3a` |
| Code commit | `a389c0b3` — component, tests, instrumentation |
| Final commit | this handoff is committed on top of `a389c0b3` (`git log -1` on the branch) |
| Backend (read-only) | `origin/master` = `7e2cb3b7b28c6e774a2eaaf4fa04911ece30f3a1`, served from a detached worktree `C:/Users/mlmit/mogzy-wt/reconstruct-r3a-be` (clean, never modified) |
| RANKED-INT1 | read only: `mogzy-wt/ranked-int1-fe` @ `675d044a` (+ uncommitted). It does not touch `Reconstruct.tsx`, `reconstructModule.tsx` or `CanonicalArena.tsx`. |
| Side worktrees | `mogzy-wt/reconstruct-r3a-base` (detached `b2b1804a`, frozen baseline server). Both frontend worktrees hold a `node_modules` **junction** to the main checkout: never `git worktree remove` them without `rmdir`-ing the junction first. |

## 2. Files

Product code (one file):
- `src/components/interaction-grammar/Reconstruct.tsx`

Tests and dev-only instrumentation:
- `src/components/interaction-grammar/Reconstruct.test.tsx` (+12 tests, 1 arithmetic test updated)
- `e2e/ranked-reconstruct-r3a.spec.ts` — 37 browser tests (probe; contrast on painted pixels, no ellipsis, equation adjacency, fixed boxes)
- `e2e/r3a-real-backend/` — `play-match.mjs`, `analyse.mjs`, `sampler.mjs`, `rig/*` (serve/seed/mint/create), `README.md`: plays a full 3-round `admin.reconstruct` bot match in the real arena against a local real backend
- `playwright.arena.config.ts` — one added `testMatch` alternative (`reconstruct-r3a`)

Not touched: `reconstructModule.tsx`, `reconstruct.ts`, `reconstructReveal.ts`, any host/arena/pacing/registry/result/settlement file, any backend file, `index.css`.

## 3. Screenshot-by-screenshot findings

Evidence folder (not committed, 25 MB): `C:/Users/mlmit/mogzy-wt/reconstruct-r3a-evidence/{before,after,real-backend,data}`.
`before` = frozen base `b2b1804a`; `after` = `a389c0b3`. The probe screenshots mount the production
`QuizRankedMatch` on server-shaped fixtures; `real-backend` ones are from the real local match.

| Pair (before → after) | Finding |
|---|---|
| `1440x900-dark-fourSlot-wrong` | **The owner's screenshot, reproduced.** Four 130px cards, dark blue-gray (`rgba(29,40,57,.6)`) with dark-brown (`#2c2417`) text, names cut ("BASIC COMPO…", "BUIL…", "Glowi…", "Ruby …", "+ 150 g to comb…"), a ~106px dead band between the cards and the equation. After: four full-width rows on the tray's own navy card with light ink, figures right-aligned, nothing cut, equation 6px under the last row. |
| `1440x900-light-fourSlot-wrong` | Light theme was always legible (cream cards, ≥5.1:1) but equally cut and equally gapped. After: same rows on parchment cards. |
| `1440x900-dark-open-partial` | **The "unanswered vs revealed" inconsistency.** In the dark app theme the tray cards and sockets are navy with light text (the tray used the theme pair correctly) while the revealed cards were gray with brown text: two token systems on one board. After: unchanged unanswered board; the revealed rows are now the *same card*. |
| `1440x900-dark-stormrazor-wrong`, `…witsEnd-right` | 3- and 2-part builds, repeated part (×2 pill + "700 g each · 1400 g"), one and two sub-part lines. All rows single-run; sub-part line carries the combining term. |
| `1280x720-…`, `1280x600-…` | 1280x600 (compact tier, region 188px): all four rows + equation fit (30/30/42/42px rows). |
| `390x844-…`, `390x844-light-stormrazor-wrong` | Phone: rows wrap names/figures, never cut; repeated sub-part "Dagger ×2 250 g" and "+ 100 g to combine" share the line. |
| `360x640-dark-fourSlot-wrong` | The one build that cannot fit: list is 24px taller than its 232px; it scrolls **inside the list** (equation pinned, `tabindex=0`, "Breakdown, scrollable"). |
| `real-backend/…s2-3-evidence` | Real arena, real server reveal: 4-socket "Dusk and Dawn", wrong build, Evidence stage done, in the real header/rails/timeline. |
| `real-backend/…s3-4-outro` | **Final round, host-owned.** `DUEL COMPLETE · DEFEAT · 0 — 4` over the board at ~+0.5s of the outro; the board is under a `rgba(2,5,12,.62→.86)` scrim. |
| `real-backend/…s1-3a-settle` | Round 1 (wrong) at the settle stage; its evidence never reaches `done` before the host swaps rounds (§8). |

Also observed, **host-owned, not changed** (for the owner / R3B):
- **Light app theme: the rail banners' "You / Opponent / HP / points" text is dark ink on navy and unreadable** (`1440x900-light-fourSlot-wrong`, rails). Not Reconstruct's; same family as the breakdown defect, in `Rail`.
- **1280x600: the arena grid row overflows by ~60px** (`div.grid` `scrollHeight 464` vs `clientHeight 404`): rail content (the "Thinking…" bubble) paints over the timeline/Forfeit label. No scroll (`scrollTop` stayed 0).
- Phone <700px tall page-scrolls by design (`html` +88px at 360x640); `scrollY` stayed 0 across the whole match.

## 4. The CSS contrast defect: verified cause and correction

**Verified in the browser** (computed styles + painted pixels):

```
html.dark   BreakdownBlock li   background rgba(29, 40, 57, 0.6)   (dark:bg-card/60)
            name / figure       color rgb(44, 36, 23)              (--ranked-ink, fixed parchment ink)
            caption             rgba(58, 46, 26, 0.74)
            painted backdrop    rgb(107–109, 108–110, 103–106)
```
`BreakdownBlock` chose its surface from the **app theme** (`dark:bg-card/60`) and its words from the
**folio's fixed ink** variables. The folio (`.ranked-folio`) is the same vellum in both themes, so the
ink never changes while the card does. The tray (`SURFACE` = `bg-[#f4e9cc] … dark:bg-card dark:text-foreground`) chose both
from the theme pair, which is why the unanswered board was fine.

Measured WCAG contrast on painted pixels (`e2e` scorer, whole breakdown + verdict + status line):

| | before (b2b1804a) | after |
|---|---|---|
| dark theme, min over all text | **1.49 – 1.97** (names 2.9, figures 2.9, captions 2.0, "0/1 placed" 1.5) | **5.74** (2-part 8.63) |
| light theme, min | 5.08 – 5.18 | 5.73 |
| verdict / status line (on the folio) | 4.76 – 4.84 | unchanged (4.76 – 4.84) |

**Correction (root, not symptom):** one `SURFACE`/`CARD_FILL` token, ink chosen *with* the surface
(`CARD_INK`, `CARD_MUTED`), used by tray cards, sockets, breakdown rows and the equation; the
translucent `dark:bg-card/60` is gone and a test pins "no element on a themed card takes the folio's
fixed ink". No global theme change, no new colour family.

Other contrast values moved to fixed, measured numbers (against `#f4e9cc`):
focus ring `#2a2110` 13.1:1 (theme `ring-primary` was 2.5:1 / 2.1:1); right `#047857` 4.5:1 (was `emerald-500` 2.1:1);
wrong `#b91c1c` 5.4:1 (was `destructive` 4.1:1 light / 3.1:1 dark); drop-target `#8a6516` 4.4:1 (was `#b8872b` 2.7:1);
"n/m placed" chip `#9b1c1c` 6.7:1 / `#fca5a5` on navy.

## 5. Before / after layout measurements

**Breakdown composition** (1 + 3 recipes: 4, 3 and 2 parts; long names; repeated part; 1–2 sub-part lines)

| Viewport (region h) | cards→equation gap | truncated/ellipsised spans, 4-part | list overflow, 4-part |
|---|---|---|---|
| 1600x900 (280) | — → 6px | — → 0 | — → 0 |
| 1440x900 (280) | 106 → 6px | 9 → 0 | 0 → 0 |
| 1280x720 (248) | 76 → 6px | 8 → 0 | 0 → 0 |
| 1280x600 (188) | 36 → 4px | 8 → 0 (+1 line-clamp → 0) | 0 → 0 |
| 390x844 (288) | 43 → 6px | 1 → 0 | 0 → 0 |
| 360x640 (288) | 26 → 6px (was cut) | 6 → 0 | 0 → **24px** (scrolls inside the list) |

Rows (4-part, measured): 46/46/49/49 @1440x900, 42/42/48/48 @1280x720, 30/30/42/42 @1280x600,
38/38/64/65 @390. The 2- and 3-part builds always fit. The region (`REGION_*`) constants are untouched.

**Continuity.** Boxes sampled on every animation frame and every DOM commit; `Δtop` is document
coordinates (`getBoundingClientRect().top + scrollY`).

*Probe flow (production `QuizRankedMatch`, 72 runs: 6 viewports × 2 motion × 3 recipes × right/wrong, tap + Lock + real reveal):*
every structural region ≤ 1px in all 72, base and after (`base-matrix`, `after-matrix`, `final-matrix` JSON in `data/`).
Cross-recipe comparison of settled/open boxes: identical, except socket 0's *left* (42px between a 4- and 3-socket
board: game state moving, `justify-center`).

*Real local backend, 3 rounds, bot match (12 runs on the frozen base, 13 on the final code, + wrong×3 and 250 ms-latency runs on each; viewports 1600x900, 1440x900, 1280x720, 1280x600, 390x844, 360x640; both motion modes; dark and light):*

| | base | final |
|---|---|---|
| container deltas at the round swaps (shell, header, rails, board, body, module, target, sockets, status, region, footer, opponent line, timeline), 26 swaps | **0.0 px** top/height/left/width | **0.0 px** |
| movement inside a Reconstruct segment | **none** | **none** |
| `window.scrollY`, ancestor `scrollTop` (stage, body, grid) | 0 throughout | 0 throughout |
| focus ring/ Lock click scrolled anything (R2's incident) | no | no |
| horizontal scrollbar / `clientWidth` changes | none | none |
| **Host header, final round only** | 78 → 68 → 78 → 68 px (90 → 68 → 90 → 68 at ≥1500px) | identical (host unchanged) |

## 6. Reveal presentation findings

Real backend, no latency, per segment; ms after the reveal's first frame (= the lock ack):

| | marks | settle | evidence | done | notes |
|---|---|---|---|---|---|
| wrong board | 0 | 455–469 | 1055–1073 | 1502–1515 | 4 stages, `done` ≤1.5s |
| correct board | 0 | — (skipped) | 454–470 | 901–912 | `done` ≤ 0.9 s |
| reduced motion | — | — | **0** | **0** | first frame is the settled frame; `onRevealComplete` fires immediately |

- Every board shows the entire evidence: all parts, art, figures, sub-parts, combining terms, equation (2-, 3- and 4-part, correct and incorrect; `reconstruct-evidence-*` ids unchanged). Correct boards show no "your pick".
- No height change: `region`, `evidence`, sockets, status line identical across marks → settle → evidence → done (0.0px, all runs). The list's height is its content (fixed per reveal); it appears with the evidence layer.
- After the animation: text is static; contrast ≥5.7:1; no ellipsis.
- Focus: the primitive never moved it **except** that Lock unmounts the focused button, which sent focus to `<body>` (measured). Fixed: a lock made from inside the board lands focus on the prompt heading (`tabIndex=-1`); a lock from outside does not steal it.
- Assistive tech: one polite `role=status`; at reveal it reads *"3 of 4 parts right. The build is: Blasting Wand; Kindlegem; Sheen; Dagger. Parts 2800 g plus Combine 300 g equals Dusk and Dawn 3100 g."*; each socket carries "Right part." / "Your pick, Fiendish Codex, was wrong."; the breakdown is a real `<ul>`/`<li>`; a scrolling list is `tabindex=0` with a name.
- No leak: before Lock, the primitive's DOM has no mark, verdict, evidence, answer-tag, pick, `data-token` on empty sockets, or correctness word (checked in the browser).
- Animation was **not** lengthened (the clock is still ≤1.5s).

## 7. Round-to-round movement: verified cause

**Reconstruct-owned: none found.** A: the primitive (R2's compact tier, fixed regions, focus no longer scrolls) holds 0px
over 72 probe flows and every real round swap. The R1 `Lock focus scrolls a clipped stage` incident did not recur at 1280x600 or 1366x650-class sizes.

**Host-owned: one verified source.** The final round, on every desktop viewport:

```
ranked-header  78px (timer face, "of 0:30 shared round")
  → 68px at the lock ack  (match-over snapshot: activeRound null, no timer, no result yet)   ← board +10px up for ~1 commit … hundreds of ms on a slow network
  → 78px when revealHold starts (centralResult face)
  → 68px when the outro mounts (match-outro: no timer, no result)
```
Rails, board and body jump by the header delta (10px; 22px at 1600) and the module, vertically centred
(`lg:my-auto`), by half (5px/11px). The browser's own `layout-shift` observer reports it
(value 0.012–0.015, sources `ranked-question` 72→62, `div` 92→82). With 250 ms API latency the 68px state lasts ≥170 ms
(`getMatchResult` + `getResolvedRound` round trips between the snapshot and `setRevealHold(true)`).

Code path: `CanonicalArena.tsx:421` — `min-h-[4.25rem]` (68px) with the comment *"min-h still reserves the tallest state"*,
but the central display's tallest face (`CentralStage`: timer + duration note) is 78px (90px at `min-[1500px]`).
The transition-note face (`header.timer` and `header.centralResult` both null) is the 68px floor. Non-final rounds never
enter that face (the next round's clock keeps the timer face), which is why rounds 1→2→3 are flat.

Not causes (measured, ruled out): scrollbar presence/width (`clientWidth` constant), `scrollY`, any ancestor `scrollTop`,
focus (Lock/option click), font load (`document.fonts` loaded before play), art loading (fixed boxes), the module title/intro,
the swap itself (0.0px).

Remaining uncertainty: the owner's browser/network were not available; on a slower network the final-round dip is longer than measured here.
I cannot exclude additional movement from content *inside* the rails (not a box change; not sampled).

## 8. Root cause of the abrupt final-round transition

Real match, wrong final board, 1440x900, no latency (`realbaseW`/`realfinalW`; ms after the reveal's first frame):

```
 0     marks (ack: reveal is merged inline from the lock response; reveal clock starts)
 ~50   host: revealHold = true   (captureResolved → beginRevealHold(1500))
 ~455  settle
 ~1056 evidence stage begins (300ms fade)
 ~1502 evidence stage DONE        ┐
 ~1548 outro overlay mounts       ┘  hold released at +1500 from ~50 → board under scrim
 ~2763 end screen mounts (outro = 1216ms)
```
Evidence fully on screen for **34–44 ms**, visible at all for 489–491 ms, then covered by the outro's scrim for 1.2 s, then replaced.
Correct final board: evidence at ~455, done ~905, outro ~1550 → 1.1 s visible, 0.63 s settled.
Reduced motion: instant reveal, outro at ~1.5 s → 1.5 s fully settled (the animation is what eats the hold).

Why, exactly:

1. **Two clocks, both ~1.5 s, started ~50 ms apart.** The primitive's reveal clock (`RECONSTRUCT_TIMING`: marks 450, settle 1050, evidence 1500) starts at the lock ack (`orderForgeLockReveal` → `withInlineOrderForgeReveal`). The host's result hold starts at the *discovery of the settlement* and is `REVEAL_HOLD_MS = 1500` (`pacing.ts:31`) because Reconstruct sends none of what lengthens it: `hasEvidence` reads `conciseEvidence(settlement.questionExplanation)` (null), no level-up, and Reconstruct is not in INT1's `SERVER_PACED_REVEAL_MODULES`. The hold therefore ends when the clock ends: the teaching beat has *no* read time.
2. **`onRevealComplete` has no consumer.** `reconstructModule.tsx:175` renders `<Reconstruct …/>` without it, and `ModuleViewportProps` / `ModuleRenderer` (`modules/types.ts`) have no seam for "my own reveal is done / needs N ms".
3. **The final round has nothing to wait for but `revealHold`.** `useRankedMatch.ts` (completion branch ~l.778–833) calls `captureResolved(lastRound, …, {hold: liveCompletion && finalRoundUnseen})` — no `nextStartedAt`, so `anchoredRevealHoldMs` returns the nominal 1500; the outro effect (l.1323) starts `MATCH_OUTRO_MS = 1200` the instant `revealHold` is false; the outro (`RankedMatchOutro`, `ranked-beat--major` scrim `rgba(2,5,12,.62→.86)`) then covers the board and `MatchOverFrame` replaces it.
4. **Non-final rounds are worse for wrong boards.** The server's budget between rounds is `presentation_ms` 2900 = 1500 result + 1400 module title (`ranked_public/pacing.py module_transition_ms`); the client hold is `min(1500, msUntilNext − 1400)` ≈ 1400–1435 ms, which is *shorter than the 1500 ms reveal clock*: the next module swaps in **before `done`** (`evidence on screen 403–407 ms, CUT before done`). Correct boards: 975–1010 ms visible, 520–566 ms settled. A round that precedes the FINAL ROUND warning absorbs up to `REVEAL_ABSORB_CAP_MS = 2600` ms (1.58 s visible, 1.14 s settled): the *same* board is read for 3× longer depending on what comes next.
5. **A server-declared window is ignored.** The Reconstruct segment declares `reveal_window_ms = 3000` (`ranked_modules/reconstruct.py DEFAULT_REVEAL_WINDOW_MS`, on the wire in `segment_state` and the lock ack), but neither `module_transition_ms` nor the client uses it.
6. **Network latency masks it by accident**: with +250 ms per request the hold starts ~900 ms after the ack and the final wrong board is readable ~1.3 s (0.9 s settled): the owner's production feel will be better than localhost and will vary with RTT.

Authoritative completion vs presentation: the match is already complete and rated server-side at the lock; nothing the client holds changes it (`matchOver` is true from the lock's own snapshot). Reconnect / already-completed: `sawMatchLiveRef` is false on first snapshot → no outro, straight to the end screen (the final round's board is not replayed; the end screen's review carries it). Both are unchanged by anything proposed below.

## 9. Proposed R3B (not implemented): minimal host correction, precise code paths

Smallest change that gives every Reconstruct reveal a guaranteed readable window, in INT1's own shape:

1. **A module-declared read hold** — `modules/types.ts`: optional `ModuleRenderer.revealReadMs?: (state) => number` (pure, like `ownsResultReveal`), `reconstructModule.tsx` returns `RECONSTRUCT_TIMING.evidenceEnd + READ_MS` while a reveal is on. (Alternative with no seam: add `RECONSTRUCT_MODULE_ID` to INT1's `SERVER_PACED_REVEAL_MODULES` and feed `reveal_window_ms`; it is already on the wire.)
2. **`useRankedMatch.captureResolved` → `beginRevealHold`**: `nominal = max(…, moduleReadHold)`, **anchored to the ack**, not to discovery, so the clock and the hold start together (`ackAt` is `orderForgeLockReveal`'s merge time). The existing `max(...)` rule ("never shorten by adding a reason to lengthen") already holds.
3. **Final round** (client-only, no backend): `nextStartedAt` is null so `anchoredRevealHoldMs` returns the nominal unclipped; with `READ_MS ≈ 2500` the board is held ≈ 4.0 s (wrong) / 3.4 s (correct) after the lock, then `MATCH_OUTRO_MS` (1.2 s) → end screen. Reduced motion: clock 0 + 2.5 s. INT1's `finalServerPacedHoldMs(presentation_ms, title)` is the same idea from the server's recorded budget; for Reconstruct that budget is `RESULT_HOLD_MS + MODULE_TITLE_MS`, so `presentation_ms − title` = 1500 — **no extra time** until the backend's `module_transition_ms` learns Reconstruct's window. Do not rely on it for this module.
4. **Non-final rounds**: the server owns `started_at` (`presentation_ms` = 1500 + 1400). A client hold can only (a) absorb the 1400 ms module title, ≈ +1.4 s of board (readable ≈ 1.1 s after `done`, ~2.7 s total) — pass `special={tailMs: MODULE_TITLE_END_MARGIN_MS}` and skip the title for Reconstruct→Reconstruct — or (b) a **backend** change like Match Grid's `settlement_hold_ms` (MG-P2.1): `module_transition_ms` taking the module's `reveal_window_ms`, so `started_at` itself moves. (b) is the only path to 2.5 s readable in every round without eating the title; it is a server presentation-budget change and was out of R3A scope.
5. **Header**: `CanonicalArena.tsx:421` `min-h-[4.25rem]` → the measured tallest face (78px; 90px `min-[1500px]`) via a CSS variable shared with `CentralStage`, or make the transition-note face fill it. One line, host-owned, and the single verified source of "subtle shifting".
6. **Outro**: after the hold, unchanged (`MATCH_OUTRO_MS`, scrim); optionally start the scrim fade over the *last* 200 ms of the hold so the board is not cut.

**A — guaranteed hold, then automatic outro (recommended default)** vs **B — guaranteed minimum hold, then "View Match Results"**:

| | A auto outro | B explicit action |
|---|---|---|
| Bot match (instant settle) | one 4 s hold; flow identical to today + readable | player taps after reading; a bot "practice" loop gets a tap per match |
| Human opponent | whoever locks second gets the result in the lock response; the first waits on the opponent already. The hold starts at resolution for both. | same, plus a persistent client-only gate: a player who leaves the tab open stays on a finished match (server already complete, rating applied) |
| Reading speed varies | 2.5 s is a *guarantee*, not a ceiling: slow readers lose the board to the outro, but the end screen (review) holds the figures | no one is ever cut |
| Reconnect / completed | unaffected (no outro, end screen) | unaffected; the gate must not appear on reconnect |
| New UI/state | none | new button, focus target, SFX, reduced-motion path, tests |
| Risk | low | a manual gate on every match end (explicitly not approved by the owner) |

My recommendation is **A with a skip** (a tap/Enter shortens the hold; it never lengthens or gates). Neither is implemented.

## 10. Tests and browser results

**Unit / component (vitest, PowerShell with `SWC_NATIVE_BINDING_CACHE=C:\swc-native-cache`):**
- Focused Reconstruct set (primitive, lib, module renderer, host, result regression, server-capture contract, admin launch): **10 files, 236 tests, all pass** (primitive 88 = 76 existing + 12 new).
- Broad related set (`src/pages/quiz-ranked`, `src/lib/ranked-core`, `src/components/ranked-arena`, `src/lib/ranked-public`, the shell probe): 201 files, 2654 tests, **11 fail — the identical 11 fail on the frozen base `b2b1804a`** (source-text boundary tests in `AnswerGrid.elimination`, `CanonicalArena.boundary`, `DailyOnCanonicalArena.boundary`, `QuestionStageGeometry`, plus `masterySliceModule.visualLanguage` JP5 stylesheet ×2). Not mine, not touched.
- New failures: **none**.
- `tsc -p tsconfig.app.json`: only the 2 pre-existing onboarding/identity errors (same as R2). `eslint`: 0 errors on the changed files (1 pre-existing warning in `OrderForge.tsx`).

**Browser (Chromium, `chrome-headless-shell` 1228 via `executablePath`):**
- `e2e/ranked-reconstruct-r3a.spec.ts` **37/37** pass on the branch; **36/37 fail on the base** (all but "fixed boxes unchanged"): the spec detects the defect it guards.
- R2's `ranked-reconstruct-continuity.spec.ts` 10/10.
- Probe flow matrix 72/72 ≤1px, base and final.
- Real local backend, 3 rounds: 13 combinations on base and on final + wrong×3 (1440x900, 390x844) + 250 ms latency; no Reconstruct-owned movement; one host header dip (above).
- Interactions (1440x900 and 390x844): tap-to-add, duplicates (×2), remove by tapping a filled socket, drag-and-drop (forgiving snap), keyboard Enter/Delete, Lock enabled only when full, **two activations in one burst submit exactly once** (was twice in-burst; real double-clicks were already safe), focus lands on the prompt, region unchanged by every interaction, correct and incorrect reveals, three distinct recipes per match (2↔3↔4 sockets).
- Screenshots in all phases: open / first pick / full / locked / marks / settle / evidence-done / outro / end.
- Not done: a real **human-vs-human** match (no second human; the bot is driven inline, so "locked, awaiting opponent" can't be held); the owner's own browser/network; Safari/WebKit.

## 11. Remaining owner decisions

1. **Dark-theme card identity.** I kept the approved unanswered look (navy cards on the vellum in the dark app theme) and made the revealed rows match it. The alternative is parchment cards in both themes (drop `dark:bg-card dark:text-foreground` from `SURFACE`; one line, changes the unanswered tray).
2. **Final-round policy:** A (auto) vs B (explicit), and the read time (2.5 s proposed).
3. **Non-final rounds:** accept eating the module title (client-only, ~1.1 s settled) or authorise the backend presentation-budget change (`reveal_window_ms` into `module_transition_ms`).
4. **Host defects found, not mine:** light-theme rail text, header `min-h`, 1280x600 rail overflow. Owner and INT1 to assign.
5. **360x640 four-part build** scrolls 24px inside its list: accept, or tighten phone rows further at the cost of the caption wrapping.
6. `onRevealComplete` is still unwired; R3B needs the seam in §9.1 or INT1's server-paced set.

## 12. Contracts preserved

- **Authority:** nothing graded or computed on the client; every figure is a server string; the primitive still never imports `gradeAssembly` (source test); the new helper reads layout only.
- **Wire:** no payload, request or response change; `{placement}` identical from tap, drag and keyboard (pinned test); no backend change.
- **Interaction:** tap-to-add, forgiving drag, remove-by-tap, roving focus, Delete/Backspace, quantity pills (placed count only; no reuse limit drawn), "order doesn't matter" copy.
- **No leak** before Lock (browser-checked) and none added after.
- **Geometry:** region heights/tiers (`REGION_*`, compact tier) untouched; no phase-dependent outer dimension; the evidence layer is still the absolute crossfade over the mounted tray.
- **Hooks:** `data-mig-primitive`, `data-phase`, `data-reveal-stage`, all `data-part`/`data-testid` values of R2 are unchanged (plus `reconstruct-breakdown`, `data-scrolls`).
- **Reveal clock** unchanged (≤1.5s; reduced motion instant).
- **Host:** no shared timing, registry, service contract, result, settlement or outro file edited; INT1's worktree was read only.

## Reproduce

```bash
# probe-based (no backend): start vite (VITE_COMBAT_API_URL=<static server over a backend checkout> for real art)
node node_modules/@playwright/test/cli.js test -c playwright.arena.config.ts ranked-reconstruct-r3a ranked-reconstruct-continuity
# real backend: see e2e/r3a-real-backend/README.md
```
Windows notes: start vite yourself (`webServer.command` is POSIX), `SWC_NATIVE_BINDING_CACHE`, and an `executablePath` when the installed browser lags `playwright-core` (see the existing memory/R2 handoff).
