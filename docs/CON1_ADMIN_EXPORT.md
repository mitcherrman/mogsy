# CON1 — direct content export from Admin Quiz Review

## Objective

Make `/admin/quiz-content` the one normal place to find, review, configure,
generate and export content. The previous primary action, **Open Content
Workspace**, handed the daily workflow to a loopback server on the operator's
own machine. The normal flow is now:

> find question → Generate Content → choose platform → choose card sequence →
> **Export**

with no local server, no localhost terminology and no navigation away from the
page. The local renderer survives as a developer tool for the things a browser
genuinely cannot do.

## Audit findings

### What was already in the repo

| Capability | Where | Verdict |
| --- | --- | --- |
| Blob download | `src/hooks/useScreenshot.ts` | anchor + `URL.createObjectURL`; the pattern, not the renderer |
| ZIP | `jszip@3.10.1` — `quiz-broadcast/DeveloperTools.tsx`, `scripts/content-studio/server.ts` | reused as-is |
| DOM capture | `html2canvas@1.4.1` — `useScreenshot`, `useGifExport` | **unusable here, measured below** |
| Deterministic renderer | `/dev/quiz-render` (`QuizRenderPage.tsx`) + `scripts/quiz-screenshots/capture.ts` | the shared render surface; reused unchanged |
| Filenames / run layout | `src/lib/quiz-screenshot/paths.ts` | reused; no new naming rule |
| Publishing gates | `presentationGate.ts`, `assetGate.ts` | reused; overrides still CLI-only |
| Readiness preflight | `readiness.ts` | already wired into the panel; unchanged |

No `modern-screenshot`, `dom-to-image` or equivalent was present, and none was
added. **No dependency was added at all** — `package.json` is untouched.

### The narrowest shared render surface

`[data-quiz-render-stage]` in `QuizRenderPage.tsx`. It already declares its own
pixel width and height from `RENDER_FORMATS`, already suppresses the arena's
viewport-fixed backdrop and paints the ground inside itself, and already stamps
`data-quiz-render-ready` after fonts and images settle. Playwright screenshots
exactly that element. Admin now mounts the same component and rasterises the
same element — there is no second renderer, no second presentation model and no
copied layout.

### What genuinely still needs the CLI

Node filesystem writes, run directories and run history, `manifest.json`,
contact sheets, `--finalize-run`, the capture-time QA sweep (console errors,
failed requests, overflow/clipping geometry, cross-state layout-stability
gates), the diagnostic overrides, and the two **audit formats** — which render
the harness as a responsive document at a device viewport, so what they capture
*is* the viewport. Those stay in Developer tools. `buildExportPlan` refuses an
audit format in the browser rather than exporting a picture of the operator's
monitor.

## The gap that was proved, not assumed

`html2canvas` was tried first because it was already a dependency. Against the
Playwright capture of the same cards it differed on **26–41% of pixels**:

| format / state | pixels differing | mean Δ (of 255) |
| --- | --- | --- |
| `mobile-social` question | 37.2% | 9.9 |
| `mobile-social` correct | 37.6% | 10.0 |
| `vertical` question | 37.8% | 11.1 |
| `square` question | 41.0% | 11.2 |
| `landscape` question | 26.2% | 8.2 |

Concretely, and visible at a glance: it draws text inside a scaled ancestor
glyph-by-glyph with the wrong advances ("T h o r n m a i l"), drops the vellum
texture entirely, mis-crops the chamber ground, and loses the answer tablets'
inset lighting. It re-implements CSS painting in JavaScript; the composition
depends on multi-layer backgrounds, inset box-shadows and a `transform: scale()`
fit, which is precisely where that re-implementation fails. **Not publishable.**

Only after that was a different mechanism proposed, and the smallest one that
works: an `<svg><foreignObject>` rasterised through an `<img>`, which uses the
browser's own layout and paint engine. Three constraints, each with a named
cause and a named fix, all found by measurement:

1. **No network.** Stylesheets, `@font-face` sources and images must be inline.
   Anything unreachable is reported; an unreadable `<img>` on the card fails the
   capture rather than exporting a hole.
2. **No animation clock.** It rasterises at time zero, so
   `animation: quiz-choice-enter 350ms … backwards` with a per-index delay
   painted its FROM keyframe — **all four answer tablets came out at
   `opacity: 0`** while the layout was otherwise perfect. Fixed the way the
   runner already fixes it (`reducedMotion: reduce`), which `index.css` itself
   documents as safe because the resting state is the visible one.
3. **No document ancestors.** Re-parenting the stage loses everything it
   inherited from `<html>`/`<body>`. The answer labels fell back to the SVG's
   default serif while the Cinzel headings — which name their face — stayed
   right. Theme classes, every `:root`/`body` custom property and the
   inheritable text properties are re-seeded from the live render.

A fourth cause was found by the parity harness rather than by inspection: the
harness fits its zoom by **measuring**, and layout runs under the *viewport's*
media queries. Mounted in Admin, cards were measured at the operator's monitor
width and the CLI measures at the format's width, which moved `landscape`'s card
by ~10px of height. The export surface is therefore an **iframe sized to the
format** — an iframe *is* a viewport. After that change 16 of 17 parity cases
fit a bit-identical zoom.

## Browser vs Playwright — measured

`npx tsx scripts/quiz-screenshots/verify-browser-export.ts` compares the
exporter against `captureOne` (the function the CLI and Content Studio use) over
`visual-qa-fixture.json`. Because a picture that *moved* and a picture that
*changed* are different defects, the diff aligns twelve horizontal bands
independently: `maxBandShift` is how far content drifts, `alignedMeanDelta` is
what is left once aligned (0–255), `worstBandAligned` is the worst single band.

| case | content class | dimensions | fitted zoom | max drift | aligned Δ | worst band |
| --- | --- | --- | --- | --- | --- | --- |
| `vq-01 mobile-social question` | plain stored MCQ | 1080×1350 ✓ | same | 5px | 0.62 | 1.67 |
| `vq-01 mobile-social correct` | plain stored MCQ | 1080×1350 ✓ | same | 5px | 0.64 | 1.67 |
| `vq-01 square question` | plain stored MCQ | 1080×1080 ✓ | same | 6px | 1.20 | 3.95 |
| `vq-04 mobile-social question` | **item recipe, asset-bearing** | 1080×1350 ✓ | same | 5px | 1.25 | 2.47 |
| `vq-04 mobile-social correct` | item recipe, asset-bearing | 1080×1350 ✓ | same | 5px | 1.16 | 2.51 |
| `vq-05 vertical question` | family-band presentation | 1080×1920 ✓ | same | 15px | 1.47 | 9.94 |
| `vq-07 landscape question` | family band, two-column | 1200×675 ✓ | same | 10px | 3.76 | 12.50 |
| `vq-07 landscape correct` | family band, two-column | 1200×675 ✓ | same | 10px | 3.76 | 12.49 |
| `vq-08 mobile-social question` | **Mastery** | 1080×1350 ✓ | same | 5px | 0.75 | 2.47 |
| `vq-08 mobile-social correct` | Mastery | 1080×1350 ✓ | same | 5px | 0.72 | 2.47 |
| `vq-09 mobile-social question` | **Daily frozen card** | 1080×1350 ✓ | same | 15px | 1.30 | 4.49 |
| `vq-09 vertical question` | Daily frozen card | 1080×1920 ✓ | same | 15px | 1.80 | 13.98 |
| `vq-03 mobile-social question` | **Pro Play `question.context`** | 1080×1350 ✓ | same | 5px | 0.67 | 1.67 |
| `vq-03 mobile-social correct` | Pro Play | 1080×1350 ✓ | same | 5px | 0.66 | 1.67 |
| `vq-12 square question` | Pro Play, player scope | 1080×1080 ✓ | **2.02 vs 2.06** | 12px | 8.45 | 18.75 |
| `vq-10 mobile-social question` | explanation family | 1080×1350 ✓ | same | 5px | 0.93 | 2.71 |
| `vq-10 mobile-social explanation` | explanation card | 1080×1350 ✓ | same | 3px | 0.95 | 3.26 |

Reading it honestly:

* **Dimensions match exactly on all 17.** Four formats covered
  (Instagram Portrait, Vertical/Story, Square, Reddit/X 16:9).
* **16 of 17 fit a bit-identical zoom.** Card framing, typography, wrapping,
  assets, badges and the reveal/explanation states are the same composition —
  the diff images are pure edge outlines with black interiors, which is the
  signature of placement, not of a different picture.
* **The residual is vertical drift, not divergence.** Content sits up to 3–15px
  lower toward the bottom of the frame; aligned, the difference is 0.6–3.8 of
  255 (0.2–1.5%), i.e. anti-aliasing. It comes from sub-pixel rounding
  accumulating through a `transform: scale()` of ~2.3.
* **One real outlier.** `vq-12` (Pro Play, square) fitted 2.06 where the CLI
  fitted 2.02. The harness quantises its measured card height to an 8px block
  precisely to absorb this noise; this case lands on a block boundary, so a
  sub-pixel measurement difference crosses it. 1 of 17. Not fixed.

Baselines, exports and per-case JSON land in
`quiz_content_exports/browser-export-parity/` (gitignored).

## Implementation

| File | Role |
| --- | --- |
| `src/lib/quiz-screenshot/browserCapture.ts` | **new** — element → PNG blob. No layout, no format table, no question model |
| `src/lib/quiz-screenshot/exportPlan.ts` | **new** — pure: selection + config → ordered cards, filenames, delivery, button label |
| `src/lib/quiz-screenshot/runBrowserExport.ts` | **new** — mounts `QuizRenderPage` in a format-sized iframe, applies the gates, captures |
| `src/lib/quiz-screenshot/deliverExport.ts` | **new** — one PNG, or a JSZip archive in the run-directory layout |
| `src/components/admin/GenerateContentPanel.tsx` | CTA is the export; local renderer moved into Developer tools |
| `scripts/quiz-screenshots/verify-browser-export.ts` | **new** — the parity + behaviour harness above |

### Decisions worth keeping

* **The CTA is derived from the plan**, never counted separately: `Export PNG`
  for one card, `Export N PNGs as ZIP` for more. Multi-file downloads are a
  promise browsers do not keep (Chrome prompts, Safari drops), so >1 card is
  always an archive — and the label says so rather than implying N saves.
* **Archive layout is the CLI's**: `<run>/question_000123/<format>_<state>.png`.
  A test caught that stringified ids skipped `questionSlug`'s zero-padding,
  which would have made a browser export and a CLI run of the same question
  write different directories.
* **The zoom envelope is reproduced.** `generate.ts` fits on the `question` card
  and forces that zoom on every other card of the same question+format; the
  runner does the same through the harness's own `?scale=`. Without it a
  carousel's slides breathe.
* **`MemoryRouter` is keyed by URL.** It reads `initialEntries` once, so
  re-rendering one root silently produced card one every time — every state and
  format in a run came out identical. Caught by the parity harness.
* **`CaptureResult` uses a string discriminant.** The project compiles with
  `strict: false`; without `strictNullChecks` an `ok: true | false` union stops
  narrowing and the failure branch type-checks as the success one.
* **Providers.** The export root mounts outside the app tree, so it supplies the
  app's own `queryClient` (not a second one) and a `TooltipProvider`.

### Fail-closed behaviour is unchanged

`evaluatePresentationGate` and `evaluateAssetGate` are called on the mounted
stage with `allowIncomplete: false` / `allowMissingAssets: false` — the same
modules, the same attributes, the same backend-computed `asset_status`. The
runner's `<img>`-never-painted backstop is reproduced. The diagnostic overrides
are still offered nowhere in Admin. A blocked card produces **no file** and is
named with its reason in the panel; a partial run reports every card it did not
produce rather than shipping a short archive quietly.

## Tests

* `src/lib/quiz-screenshot/exportPlan.test.ts` — 11 tests: Cases A/B/C/D,
  post expansion, timestamp run directories, audit-format refusal, empty
  selection/destination/cards, traversal in a run name, label and hint copy.
* `src/lib/quiz-screenshot/deliverExport.test.ts` — 3 tests: single PNG, ZIP
  **contents read back and asserted**, nothing saved when every card is blocked.
* `src/pages/admin/AdminQuizReview.generateContent.test.tsx` — 26 tests,
  3 new/rewritten: the CTA names the real card count, the local renderer lives
  inside Developer tools and the normal path mentions no localhost, an audit
  format disables the export with a specific reason.
* `src/components/admin/GenerateContentPanel.handoff.test.tsx` — 13 tests,
  1 updated for the moved link.
* `scripts/quiz-screenshots/verify-browser-export.ts` — 17 image comparisons
  plus 3 real-browser behaviour checks, **all passing**:
  unresolved required asset blocks (0 files, the CLI's own message) ·
  a 4-card run delivers `bundle.zip` with the 4 expected paths (6.1 MB) ·
  **the export never touches the Admin document** (0 root mutations, root class
  unchanged, `#initial-shell` kept) · no request to the Content Workspace API
  during a normal export.

`npx vitest run --no-file-parallelism src/pages/admin src/components/admin
src/lib/quiz-screenshot src/pages/dev/quiz-render` → **1014 passed, 11 failed**,
exactly the recorded pre-existing baseline (10 `StructuralReview.test.tsx`,
1 `AdminUsers.phase1.test.tsx`; both fail on a clean tree). `tsc` errors
unchanged at 11, none in a touched file.

## Known limitations

1. **`vq-12` zoom boundary** — 1 of 17 parity cases fits 2.06 against the CLI's
   2.02. See above. A fix would mean changing the harness's quantisation, which
   is shared with the CLI, so it was left alone.
2. **Vertical drift of up to 15px** in the lower bands of tall cards. Same
   composition, same zoom; sub-pixel rounding through a ~2.3× scale.
3. **Audit formats are CLI-only**, by design.
4. **Cross-origin assets need CORS**, and production has it: the Railway backend
   serves `access-control-allow-origin: *` on `/assets/*` (verified). Offline
   fixture runs need a CORS-capable static server over the backend repo's
   `assets/` tree, as `scripts/quiz-screenshots/README.md` already documents.

## Owner-review pass (2026-09-08)

### The Admin theme flash — cause and fix

`QuizRenderPage` carries two document-level effects: it puts `dark theme-lol` on
the root (it mounts outside Layout, and the live quiz is always League-themed)
and it strips the `#initial-shell` boot splash. Both read a bare `document`.

React renders the export tree **from the parent realm**, so inside an iframe
that `document` is still Admin's. The harness was therefore theming and
stripping the wrong page: `/admin/quiz-content` is not a League-section route,
so the whole console visibly turned League-dark for the length of every export.

The fix is one optional prop. `QuizRenderPage({ renderDocument })` addresses the
document it is actually rendering into; the route passes nothing and is
byte-identical; the exporter passes the iframe's document. `createStageFrame`
also now strips any sitewide `theme-*` before asserting `dark theme-lol`,
mirroring `Layout.tsx`'s own rule — otherwise an operator's chosen theme could
change what the exported PNG looks like.

A regression check was added to the verification harness (`export never touches
the Admin document`): it sets a sitewide theme, watches `<html>` with a
`MutationObserver` and plants an `#initial-shell` for the duration of a real
export.

> **0 root mutations, root class unchanged, splash kept, card still captured.**

Parity after the fix is unchanged — 17/17 dimensions, 16/17 identical zoom, the
same per-case numbers — so the fidelity was not bought with a rendering change.

### Live Admin visual pass — done

The supported path is the repo's own local acceptance harness: `VITE_E2E_AUTH=1`
plus a persona in `localStorage`, which `AdminRoute` and `useAuth` already
honour (`src/lib/e2e/identity.ts`). It is double-gated — `import.meta.env.DEV`
**and** the explicit flag — so Vite eliminates it from any production build.
Nothing was bypassed or weakened; the admin API's data was stubbed for the pass,
the gate was not. A dev server was run on port 5200 with the flag, and the
review list served from `visual-qa-fixture.json`.

| checked | result |
| --- | --- |
| Generate Content stays in the right-side workflow | yes — panel at x=1069, w=519, inside the detail column |
| normal CTA wording | `Export 2 PNGs as ZIP` default · `Export PNG` at one card · `Export 3 PNGs as ZIP` at three |
| normal-path localhost wording | none, in the primary block or anywhere readable without opening a disclosure |
| Advanced options | collapsed (`open` absent) |
| Developer tools | collapsed (`open` absent) |
| Open Content Workspace | 1 inside Developer tools, 0 in the primary block |
| layout jump on state change | none — the button's box is byte-identical at 1, 2 and 3 cards (x=1086, y=581, 485×40) |
| theme change during export | none — `MutationObserver` recorded 0 root mutations through a real export |
| widths / text / buttons fit | yes; the mid-export screenshot is pixel-identical to the idle one but for the button |

The export was then run **from the real button**: it produced a real download,
`2026-09-08_152700.zip` (3.0 MB), containing

```
2026-09-08_152700/question_001000/mobile-social_question.png   1080x1350
2026-09-08_152700/question_001000/mobile-social_correct.png    1080x1350
```

— the CLI's run-directory layout with the zero-padded id, and both files are
correct, publishable cards.

Screenshots for review, under the session scratchpad `.../scratchpad/admin/`:
`01-list.png`, `02-detail.png`, `03-generate-panel.png`, `04-three-cards.png`,
`05-exporting.png` (the theme-flash proof), `06-after-export.png`, plus the
extracted PNGs under `zx/`.

### `vq-12` — the Pro Play square outlier

Opened side by side. **Publishable; no change made.**

* **What moves:** nothing within the card. The whole folio is uniformly ~2%
  larger (zoom 2.06 vs 2.02) — it spans x≈108–972 instead of 118–962, and its
  bottom edge sits at y≈922 instead of ≈912. The context rail, the prompt, the
  four tablets and the CTA all keep their relative positions.
* **Wrapping:** unchanged. The prompt breaks after "champions does" in both.
* **Clipping:** none. The folio's bottom clears the QR block by ~13px against
  the authority's ~23px — tighter, no collision.
* **Card / asset geometry:** proportional only. No band, chip or emblem changes
  shape or relationship.
* **Consistency within a run is preserved:** the zoom envelope forces one fitted
  zoom across every card of a question+format, so two slides of one post are
  always the same size as each other. The divergence is browser-vs-CLI only.

No fix was implemented. The cause is `cardRef.scrollHeight` — an integer —
differing by a pixel between the two environments and crossing the harness's
`Math.ceil(h / 8) * 8` block. That quantisation is shared with the CLI and
exists precisely to absorb this noise (it does, on the other 16 cases). Changing
it would change CLI output too, and special-casing Pro Play would be exactly the
renderer divergence this workstream is built to avoid. Left for owner judgement.

## Git state

Frontend `/Users/macmoney/mogsy`, branch `main`, **uncommitted**:

```
 M docs/ADMIN_QUIZ_REVIEW_UX.md
 M src/components/admin/GenerateContentPanel.tsx
 M src/components/admin/GenerateContentPanel.handoff.test.tsx
 M src/pages/admin/AdminQuizReview.generateContent.test.tsx
 M src/pages/dev/quiz-render/QuizRenderPage.tsx
?? docs/CON1_ADMIN_EXPORT.md
?? scripts/quiz-screenshots/verify-browser-export.ts
?? src/lib/quiz-screenshot/browserCapture.ts
?? src/lib/quiz-screenshot/exportPlan.ts
?? src/lib/quiz-screenshot/exportPlan.test.ts
?? src/lib/quiz-screenshot/runBrowserExport.ts
?? src/lib/quiz-screenshot/deliverExport.ts
?? src/lib/quiz-screenshot/deliverExport.test.ts
```

No backend change. No dependency change (`package.json` / `package-lock.json`
untouched). Backend `/Users/macmoney/League_Combat_Simulator` was not modified.

`QuizRenderPage.tsx` is new to this list: it gained the optional
`renderDocument` prop described above. The route's own behaviour is unchanged.

> **THIS CHECKOUT IS SHARED.** During the review pass a concurrent session ran
> `git reset` to `9d15e52b^` followed by a fast-forward merge of `origin/main`
> (visible in `git reflog`). A hard reset discards uncommitted **tracked**
> changes, and it silently wiped every tracked-file edit in this workstream —
> the whole `GenerateContentPanel.tsx` rewrite, both test files and the UX doc.
> Untracked new files survived. All of it was re-applied and re-verified. A copy
> of the full state (`git diff` patch plus every untracked file) is kept outside
> the repo at
> `/private/tmp/claude-501/-Users-macmoney-League-Combat-Simulator/0a9b1d0b-631f-40b3-8c9c-9100dcaaa39f/scratchpad/con1-backup/`
> so a repeat is recoverable. Committing this branch is the real fix.

## Exact next task

Owner review of the three items above. Then, in order:

1. **Commit this work** — the shared checkout has already destroyed it once.
2. Push `main`, then **press Publish in Lovable** — a push alone does not deploy
   the frontend.
3. Decide the two remaining measured limitations: the ≤15px vertical drift and
   the single `vq-12` zoom boundary. Either accept them for published content,
   or keep the CLI as the authority for anything that has to be frame-perfect.
