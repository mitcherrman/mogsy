# WORD PUZZLE WP1.1 — Glyph Press repair and certification

**Status: certified for owner playtest.** Local only. Not pushed, merged, published or deployed.

| | |
|---|---|
| Branch / worktree | `word-puzzle/wp1-fable` · `C:/Users/mlmit/mogzy-wt/wp1-fable` |
| Base (`origin/main`) | `12054aab` |
| Fable's WP1 commit | `8798b2dc` (reported, verified: tree was clean, 54/54 unit) |
| WP1.1 code commit | the commit titled `WP1.1: …` immediately after `8798b2dc` (`git log -2 --format=%h%n%s`) |
| Playtest URL | `/dev/word-puzzle` (DEV-only; absent from a production build) |
| Screenshots | `C:/Users/mlmit/OneDrive/Desktop/word-puzzle-wp1-shots` (163 PNGs) |

This was a repair, not a redesign. Product thesis, visual identity and interaction mechanics are Fable's, unchanged. No gameplay mechanic, scoring rule or animation was added.

## 1. Playtest it

Dev servers (entries live in the *backend worktree's* ignored `.claude/launch.json`):

- `wp1-assets` — python static server of `League_Combat_Simulator/.worktrees/reconstruct-r1-be` on **8799** (champion/item art).
- `wp1-fe` — vite on **5260** with `VITE_COMBAT_API_URL=http://127.0.0.1:8799`.

Useful URLs: `?round=<id>` (zephyr, kaisa, heimerdinger, infinity-edge, rabadons-deathcap, ace-in-the-hole, sleepy-trouble-bubble, command-shockwave, life-form-disintegration-ray, shurima), `&state=open|filled|locked|revealed-right|revealed-wrong|revealed-partial`, `&motion=reduce`, `&seed=<any>`.

## 2. Defects fixed (root cause, fix, proof)

### 2.1 "Cannot update WordPuzzleLab while rendering GlyphPress"
- **Root cause.** `toggleArmed` raised the cue *inside a `setArmed` functional updater*:
  `setArmed((a) => { if (!a) onCue?.("arm"); return !a; })`. React runs an updater during render whenever the component already has a queued update (it cannot take the eager path). The lab's `onCue` is `setLastCue`, a `WordPuzzleLab` setter, so it was called mid-render of `GlyphPress`. **The previous handoff's suspects (`flushSync` in `useStageRoom`, the `onRevealComplete` path) were not the cause.** Reproduced in the real browser before touching code (type → Sound; the stack's top frame was `GlyphPress`, cue `arm`).
- **Fix.** `GlyphPress.tsx` `toggleArmed`: `if (!armed) onCue?.("arm"); setArmed(!armed);` — the cue is raised from the handler. The warning is not suppressed.
- **Proof.** Same synthetic sequence in the same in-app browser: **1 React warning before → 0 after**. Every Playwright run records `console.error`/`warning`/`pageerror` and fails on any React `Warning:`.

### 2.2 Lock could submit twice
- **Root cause.** `lock()` only checked `phase === "open"`. A host that acknowledges asynchronously (the production seam will) keeps `phase` open for a beat; two clicks in that beat both called `onLock`.
- **Fix.** `lockedRef` in `GlyphPress.tsx`: set on Lock, cleared when `open`, `value` or `ledger` change (so a host that *refuses* a lock can accept a corrected one).
- **Proof.** Unit test: three clicks in one batch → `onLock` ×1; re-renders don't repeat it; an edit re-arms it.

### 2.3 Lab: a late "server" answer landed on the next round (found while testing "Next works repeatedly")
- **Root cause.** `WordPuzzleLab` set `window.setTimeout`s for the stand-in server (sounding 260 ms, lock 420 ms, pre-arranged reveal 300 ms) and never cancelled them. Pressing Next inside that window let round N's answer apply to round N+1.
- **Observed on the pre-fix lab (Playwright):** new round showed sounding record **`E ×3`** it never made; after Lock→Next the new round came up **`revealed`**.
- **Fix.** `WordPuzzleLab.tsx`: a tracked timer registry (`later` / `cancelTimers`), cancelled when the round changes and on unmount.
- **Proof.** e2e "a late answer from the previous round never lands on the next" — red on the committed lab, green on the fix. (First draft of this test was vacuous — the sounding was never issued; it now asserts the tile is `pending` when Next is pressed.)

### 2.4 Orphaned trailing letter on broken words (found in certification screenshots)
- **Root cause.** The long-word break filled each row greedily: "DISINTEGRATIO-" over a lone **"N"** (1280×720) and "…ATI-" over **"ON"** (1600×900).
- **Fix.** `glyphPress.ts` `flow()`: a word that must break is split into near-equal chunks over the *same number of rows* greedy used (falls back to greedy if equal chunks don't fit). Now "DISINTE-" / "GRATION".
- **Proof.** Unit test (red against greedy: chunks `4,4,4,2`); screenshots at 1280×720, 1600×900, 360×640.

### 2.5 Reveal reads unchanged where it should (verified, no change needed)
Lock → reveal → Next repeated 15 times (every round, open and revealed): clean each time. `onRevealComplete` fires once, only at stage `done` (asserted at all six viewports: never raised while inking), once under reduced motion across re-renders with new callback identities, once per remount, and never after unmount (rAF cancelled). Unit + e2e.

## 3. Bounded visual corrections (the three Fable issues)

| # | Issue | Change | Where |
|---|---|---|---|
| 1 | Desktop sockets small | Sizes now `64/56/48/44/40…20` (was 44 max). Sizes **above 44 are only taken when no word has to break**, so long phrases keep the prototype's layout exactly (unit-tested equal to the old table). Short rounds on a roomy forme now set at 64px (1366×650: Zephyr/Kai'Sa/Ace in the Hole/Shurima = 64px). | `glyphPress.ts`, `FORME_CELL_SIZES`, `FORME_UNBROKEN_ABOVE` |
| 2 | Player tiles vs engraved | Inverted *value*, not just hue: player = raised pale vellum, dark ink, hard edge; engraved = recessed dark brass plate, bright gold glyph; given has a brass rim, sounded a cyan rim. | `glyphPress.css` |
| 3 | Drum rim fade hid ⌫ | Rim fade 56px/0.85 → 18px/0.5. ⌫ clear at rest (see 1366×650 shots). | `glyphPress.css` |

**A regression of my own, caught by looking at the 1600×900 reveal:** restyling engraved tiles made *given* and *missing* near-identical (both dark body, gold outline). **Missing** is now a hollow slot with a **dashed** outline — solid dark plate = given/sounded, dashed hollow = left blank, bright gold = right, ember + struck glyph = wrong. Distinct at every size and without relying on colour.

## 4. Files modified (vs `8798b2dc`)

```
src/components/interaction-grammar/GlyphPress.tsx       arm cue out of the updater; single-shot Lock
src/components/interaction-grammar/glyphPress.css       tile values, dashed missing, 18px rim fade
src/lib/interaction-grammar/glyphPress.ts               socket sizes + no-break rule; even-chunk word break
src/pages/dev/word-puzzle/WordPuzzleLab.tsx             cancellable stand-in server timers
src/components/interaction-grammar/GlyphPress.test.tsx  +7 lifecycle tests
src/lib/interaction-grammar/glyphPress.test.ts          +4 layout tests; 44→64 expectation updated
e2e/word-puzzle-continuity.spec.ts                      extended 14 → 22 tests; was unrun in WP1
WORD_PUZZLE_WP1_HANDOFF.md                              this file
```
Not touched: shared Ranked infrastructure, Pro Play, Journey, Daily Challenge, backend modules, `authority.ts`, `types.ts`, `useStageRoom.ts`, App/Layout/Footer.

## 5. Verification results

| Gate | Result |
|---|---|
| Focused unit (`glyphPress`, `authority`, `GlyphPress`) | **65/65** (54 baseline + 11) |
| Regression tests red against the defect | arm purity ×2 + lock-once (3 failing on original code, 22 others pass); lab timers (e2e, `E ×3`); even-split (`4,4,4,2`) |
| Playwright `word-puzzle-continuity` | **22/22**, on the final code |
| Typecheck `tsc -p tsconfig.app.json` | 2 errors, **identical on clean base `12054aab`** (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`; Supabase typing). **0 in WP1 files.** |
| ESLint (WP1 files) | clean |
| `npm run build` | exit 0 |
| Dev-only boundary in `dist` | lab, fixture, authority, primitive, CSS: **absent**. Only `"/dev/word-puzzle"` path literals in the shell chrome (like `/dev/ranked-shell-probe`). Route registered only under `import.meta.env.DEV`. |
| Full vitest | Worker pool died (`Channel closed`) in **both** base and branch runs, so no summary line. Failing-file sets: base 38 / branch 35. The one branch-only file (`canonicalSurfaces.test.tsx`) **passes 23/23 in isolation**. `noStaticLeagueFacts` fails identically on base (22 violations both) — WP1 adds none. **No failure attributable to WP1.** |

### 5.1 Browser matrix (all 6 viewports × normal and reduced motion = 12 lifecycles)
Each lifecycle: OPEN → INPUT (keys + tile tap) → SOUNDING (hit + miss) → CORRECTION (Home/arrows/Backspace, drum keys) → LOCK → REVEAL → NEXT.

| Viewport | Frames sampled (motion / reduced) | Worst movement, any region incl. block | Console / React warnings |
|---|---|---|---|
| 1600×900 | 340 / 143 | **0.00 px** | none |
| 1280×720 | 438 / 165 | **0.00 px** | none |
| 1366×650 | 460 / 153 | **0.00 px** | none |
| 1280×600 | 461 / 153 | **0.00 px** | none |
| 390×844 | 544 / 168 | **0.00 px** | none |
| 360×640 | 540 / 170 | **0.00 px** | none |

Regions: root, head, forme, block, plaque, drum, plate, lock, status, stage — sampled every animation frame and DOM commit. The Next-round transition separately holds ≤1px for every region except the new round's own block.

Also asserted per run: no page/stage/instrument scroll, no horizontal overflow, no socket/mark/tick clipped by the bed, `data-overflow=false`, focus on forme/drum/‹/›/Sound/Lock moves nothing, all five reveal kinds present (given, sounded, right, wrong, missing), every round fits at 360×640, 390×844, 1280×600, 1366×650.

### 5.2 Targets (rendered, not nominal)
- **All 31 controls ≥ 44×44 at every viewport**: ‹ ›, Sound, Lock, all 27 drum tiles (incl. ⌫). Rendered = layout size (no transform shrink).
- **Sockets are not all 44px.** They are fitted to the forme. Worst case is the longest round:

| Socket side (px); `*` = some open sockets < 44 | 360×640 | 390×844 | 1280×600 | 1366×650 | 1280×720 | 1600×900 |
|---|---|---|---|---|---|---|
| Life Form Disintegration Ray (25 glyphs) | 28* | 44 | 28* | 32* | 36* | 44 |
| Sleepy Trouble Bubble (19) | 36* | 44 | 36* | 44 | — | — |
| Rabadon's Deathcap (16) | 32* | 44 | 44 | 56 | — | — |
| Command: Shockwave (16) | 32* | 44 | 44 | 48 | — | — |
| Heimerdinger / Infinity Edge / Ace (12) | 40* | 44–64 | 44 | 44–64 | — | — |
| Zephyr / Kai'Sa / Shurima (5–7) | 44 | 44–48 | 64 | 64 | — | — |

  Floor held at ≥ 24px (WCAG 2.5.8). See limitation L1.

### 5.3 Behaviour checks
- **Keyboard:** letters set, Backspace/Delete clear, arrows/Home/End move, drum arrows/Enter, Escape disarms; nothing submits on Enter.
- **Touch** (390×844, 360×640, 12/12 repeats): tap tile, tap ⌫, tap socket, finger-drag the drum (turns, sets nothing), arm + tap tile, tap Lock, reveal.
- **Repeated letters:** sounding Heimerdinger's E (×3) engraves all three; typing a sounded glyph again sets nothing; one free glyph can fill two sockets.
- **Punctuation:** Kai'Sa `'` and Command: Shockwave `:` render as marks, are never sockets, cannot be typed, survive the reveal.
- **Reduced-motion parity:** same seed + inputs ⇒ settled reveal snapshot is **deep-equal** with and without motion (every socket state/origin/result/face/struck glyph, answer, score, lock label, status, live region, sounding record).
- **Reveal labels/sources:** for verified and dev-only rounds × solved/wrong/partial: lock label ↔ verdict (`Solved`/`Partly set`/`Missed`), score pattern, live-region sentence, and footnote equals the fixture's `label · revision N` (or the dev-only line).

## 6. Authority and leak validation (Phase D)

- **Contract:** `GlyphPressPublic` has no field that can hold an answer (structure is kinds and indices; the unit test pins it). Canonical glyphs reach the primitive only through `GlyphPressReveal`, which the lab hands down only after grading at reveal time. `GlyphPressResponse` is asserted *not* assignable to `SegmentChoice` (the production seam widens it later). The primitive's source is pinned not to import `authority.ts` or the lab.
- **DOM, all 10 rounds, open → after a sounding → locked:** the normalized answer appears in **no text node and no attribute** other than a clue image's `src`. `data-result`, `data-verdict`, answer and score are empty/absent until the reveal.
- **Reported, not suppressed (L3):** `kaisa` → `…/assets/champions/Kaisa/icon.png`, `heimerdinger` → `…/Heimerdinger/W_HeimerdingerW.png`.
- **Unverified region round (`shurima`)** stays in the rotation but is labelled *dev-only · unverified* in the lab chrome, in the primitive's category label, and in the footnote ("Unverified demonstration content — development only."). Asserted in e2e. No production answer bank was built.

## 7. Remaining limitations (owner's call; none blocks playtest)

- **L1 — Sockets under 44px on the long phrases of short/narrow viewports** (table above): 28–36px for Life Form Disintegration Ray at ≤720px tall or 360 wide, 32–36px for Sleepy Trouble Bubble at 360/1280×600. This is the fit, not a regression (≥ the prototype's sizes everywhere, and larger on short rounds). Every socket action is also reachable at 44px+ (type a glyph, ⌫ tile, arrows/Backspace), and the cursor auto-advances, so sockets are tapped only to correct. Making them 44px on a 25-glyph phrase at 360×640 isn't possible without scrolling the forme or a different input model.
- **L2 — Sounding a glyph that was *given at start* is legal and spends a sounding** (the drum doesn't mark given glyphs "placed"). A rule decision, deliberately not changed here.
- **L3 — Clue image paths can spell the answer** for champion-name rounds (static asset hosting). Not a contract leak; the production seam should serve opaque clue assets.
- **L4 — Punctuation marks are `aria-hidden`.** A screen-reader user hears "Socket 4 of 5" with no apostrophe. Not in the brief; flagged for the production pass.
- **L5 — The lab authority is not secret from devtools** (the fixture ships in the dev bundle). By design: the lab owns the *contract*; the backend will own secrecy.
- **L6 — Existing unit tests print "not wrapped in act(...)"** from the reveal clock under fake rAF. Noise only; all pass.
- **Env, not product:** `shurima@1366×650` failed to render `gp-block` within 5s in three consecutive runs under heavy machine load (a Playwright worker also died with a native exit code in that window). It then passed in every later run, including both full-suite runs on the final code, and 6/6 in isolation; the first-paint wait is now 15s. The cause was not pinned down beyond load. Chrome swallowed a tap that followed a zero-delay synthetic swipe (no `click` in the event log); the touch drag now moves at finger pace. The React Router future-flag notice and one font-preload note appear on every route (checked on `/`) and are the only two messages the spec filters.

## 8. Reproducing

```
# servers: preview_start wp1-assets, wp1-fe   (or the launch.json commands above)
# throwaway config (do not commit): baseURL http://localhost:5260,
#   launchOptions.executablePath = ~/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe
$env:WORD_PUZZLE_SHOTS='C:/Users/mlmit/OneDrive/Desktop/word-puzzle-wp1-shots'
$env:SWC_NATIVE_BINDING_CACHE='C:\swc-native-cache'
npx vitest run src/lib/interaction-grammar src/lib/word-puzzle src/components/interaction-grammar
npx playwright test -c <throwaway-config> word-puzzle-continuity
```
Details: memory `mogsy-playwright-arena-windows`. On this machine the installed browser build lags the package.

## 9. Exact next step

Owner playtests `/dev/word-puzzle` (suggested: `round=life-form-disintegration-ray` at 1280×720 and on a phone, plus `rabadons-deathcap` at 1600×900). If accepted, the next step is **backend productionization, coordinated by the command center**: a `glyph_press.v1` module with `SegmentChoice` widened to `{ glyphs }`, a server-side ledger and grader, opaque clue assets, and a decision on L2. No WP1.2 is proposed.
