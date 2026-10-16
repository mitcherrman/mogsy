# Academy Core V3.5 — The Living Hextech Orrery (Phase 1 – Phase 3 production integration)

Design branch `design/academy-core-v35-floating-orrery` (cut from `origin/main` `6407559a`; approved at **`abd50e5a`**, preserved).
Integration branch **`academy-core/v35-production-integration`** (from `main` `f5f90c72`, re-merged with `main` `10534633`, `f6e5f6ca` and `c5521d3e`), PR → `main`.
The Orrery is the `/lol` home on that branch. Nothing is merged, deployed or published. Frontend only: no backend, Supabase, Railway,
database, env, flag or audio change.

> Status: the whole V3.5 experience (Phase 1, Phase 2, P2T, P2C's Pro Play, P2L.1's six-shutter Lux iris) is **approved** at `abd50e5a`.
> **§P3, the production integration, is built and verified, and STOPPED at release readiness for the owner's inspection.** Start with
> §P3 "Unresolved" and the release procedure.

## P3. Phase 3 — production integration (`/lol` becomes the Orrery)

The owner approved the whole V3.5 experience at `abd50e5a` (including the six-shutter Lux iris) and asked for it to be prepared for
`https://mogzy.lol/lol`. Design is closed: this pass changes no visual. Work happened on a dedicated branch,
**`academy-core/v35-production-integration`**, cut from the latest `main`. `design/academy-core-v35-floating-orrery` is preserved
untouched at `abd50e5a`. Nothing is merged, deployed or published.

### Starting state (re-verified at the start of the pass)

- `origin/main` = **`f5f90c72`**; `design/academy-core-v35-floating-orrery` = **`abd50e5a`**.
- The V3.5 branch is **6 ahead / 25 behind** `main`; merge-base `6407559a`.
- The 25 `main` commits are Perfect Timing PT0–PT4.4, PGM1 More Challenges and a custom one-time offer. **None touch the Core**: not
  `src/pages/academy-core/`, `route-prefetch`, `Layout`, the Landing or the Hall. On shared files, `main` added routes to `src/App.tsx`
  (Perfect Timing, More Challenges) plus one analytics contract entry, `sitemap.xml` and two e2e specs. `package.json` is unchanged.

### Audit: what production `/lol` needed beyond the preview

| Concern | Production V3 (`main`) | V3.5 preview | Integration decision |
|---|---|---|---|
| Route | `/lol` → `R.AcademyCore` (route-prefetch registry → `pages/academy-core/AcademyCorePage`) | DEV-only lazy route `/lol/dev/academy-core-v35` | The Orrery **takes the production entry file** `AcademyCorePage.tsx`, so the route, the registry, the prefetch map and the Landing hand-off are unchanged |
| Code location | `src/pages/academy-core/` | `src/pages/dev/academy-core-v35/` | Modules move (`git mv`, history kept) to `src/pages/academy-core/orrery/`; no production code under `pages/dev/` |
| `hub_entered` (funnel) | emitted by the home | deliberately not emitted (dev preview) | **Emitted** (`useSurfaceEvent("hub_entered")`). `src/test/funnel/canonicalSurfaces.test.tsx` requires exactly one emitter, so the V3 page could not stay alongside |
| SEO | indexed: Hall title, description, keywords, JSON-LD, canonical `/lol` | `noindex`, preview title | **The V3 block verbatim** |
| Book doors analytics, book-open and focus cues, 240 ms activation, modified clicks, reduced motion | V3 page inline | already ported in `useCoreNavigator` | kept (no audio change: the same cues V3 plays) |
| Daily / Ranked / Patch Report / radio / Mogzy / Hall / Commons | V3 | the same components and links | unchanged |
| Preview URLs | `/lol/dev/academy-core`, `/dev/academy-core` → `/lol` | — | plus `/lol/dev/academy-core-v35`, `/dev/academy-core-v35` → `/lol` in every build |
| Auth | Daily status read only with a session | same hook | unchanged (verified, below) |
| Backend / Supabase / Railway / DB / env / flags / audio | — | — | **none needed**, none made |

The V3 Four-Book Core's implementation is replaced, not kept beside the Orrery: the funnel test forbids a second `hub_entered` emitter,
and an unrouted copy would be dead code. It stays in git history, and the rollback below restores it mechanically. Its shared
modules (`AcademyCoreInstrument`, `MogzyOperator`, `academy-core-destinations`, `academy-core-warm`, `academy-core.css`) are the
Orrery's own dependencies and are unchanged in this pass. The instrument's non-compact V3 path and its V3-only CSS are now unused by
any route; I left them in place (removing them is optional cleanup, not release work).

### Commits on `academy-core/v35-production-integration`

1. **`608d72ac`** — merge of `design/academy-core-v35-floating-orrery` (`abd50e5a`) into `main` `f5f90c72`. Clean: `src/App.tsx`
   auto-merged, keeping `main`'s Perfect Timing and More Challenges routes and the V3.5 DEV route. No conflict anywhere, so no
   blanket resolution was needed.
2. **`06eb0566`** — the cutover:
   - `src/pages/academy-core/AcademyCorePage.tsx`: the Orrery page, with `hub_entered`, the production SEO and a production header.
   - `src/pages/academy-core/orrery/*`: the Orrery modules, moved unchanged (one comment updated).
   - `src/App.tsx`: the DEV-only lazy route removed; the two V3.5 preview URLs redirect to `/lol`; the comment updated. Against
     `main` this is +2 routes and a comment.
   - `src/pages/academy-core/AcademyCorePage.test.tsx`: the Orrery's page test, mounted at `/lol`. The preview-only "noindex, no
     `hub_entered`" test is inverted to "indexed home: V3 SEO block, `hub_entered` once".
   - `e2e/academy-core-v35.spec.ts`: targets `/lol`. "/lol is still V3" becomes "/lol is the Orrery and the preview URLs redirect";
     the two tests that asserted the V3 page's crystal and projections at `/lol` are removed. The instrument's V3 defaults stay
     covered by unit tests: `AcademyCoreInstrument.lens.test.tsx` and "V3 stays V3 unless a caller opts in".
   - `e2e/academy-core.spec.ts`, the home's contract spec, now runs against the Orrery:
     - books are aimed by position, because they orbit (a locator click waits for an element to stop moving);
     - V3's fixed-pair geometry checks are dropped (upper/lower pair ratios, level pairs);
     - the phone check becomes "upper tier, then the Core, then lower tier";
     - the projections' manifest icons (Lux and the Pro Play lineup) are an allowed set, not "none";
     - run captures go to `test-results/` instead of overwriting the committed V3 evidence.
3. **`a757f1a5`** — merge of `origin/main` `10534633`. `main` moved during verification: PR #50, Perfect Timing PT5. Clean, and no file
   overlaps the Core.
4. `202069c9` — this handoff and the production-build evidence.
5. **`f2d3257f`** — merge of `origin/main` `f6e5f6ca`. `main` moved again: PR #51, JUX1-F1 Journey board attention and the compact board.
   Clean, and no file overlaps the Core. Re-verified on this merge:
   - `tsc`: the 2 baseline errors only;
   - the Core, funnel and routing unit suites plus JUX1's changed tests: 359 passed, the 3 baseline `App.*` failures;
   - `npm run build`: exit 0, with the Orrery chunk unchanged (60.6 kB JS);
   - the Core specs in Chromium: 78 / 78.
6. `e172a3e6` — the handoff records that merge.
7. **`17f8b66f`** — merge of `origin/main` `c5521d3e`. `main` moved again: PGM2, all thirteen bonus games public.
   - `src/App.tsx` is the one file both sides touch. It auto-merged cleanly, and against `main` this PR's entire `App.tsx` change is
     still the comment and the two V3.5 redirects.
   - Re-verified on this merge:
     - `tsc`: the 2 baseline errors only;
     - the Core, funnel, routing and More Challenges unit suites plus PGM2's 12 changed test files: 504 passed, the 3 baseline `App.*`
       failures;
     - `npm run build`: exit 0 (Orrery chunk 60.6 kB JS);
     - the Core specs in Chromium: 78 / 78.
8. The tip: this record. Its SHA is in the PR and the release report.

### Verification

All results below are measured on the integration branch. The full unit-suite comparison ran at `06eb0566`. After `main` moved and was merged in (`a757f1a5`), typecheck, the targeted suites, the build and the browser suites were re-run there.

**Unit tests: full suite, compared with pristine `main` `f5f90c72`.** The whole vitest suite cannot run in one process on this machine
(it runs out of heap), so both trees were run the same way: 27 chunks of 40 files, then the files of each crashed chunk in groups of 8,
then one by one.

| | `main` `f5f90c72` | integration | |
|---|---|---|---|
| test files | 1,047 | 1,051 | +4: `OrreryEngine`, `OrreryProjections`, `orrery-motion` and `AcademyCoreInstrument.lens` tests (the page test replaces V3's) |
| passed (chunked run) | 16,706 | 16,751 | |
| distinct failing tests | 113 in 48 files, plus `pt2cProfileFrameAuthority` out of memory | the same set | **0 new failures** |

The integration-only names were checked one by one:
- 6 `pt2eProfileThemeAuthority` tests fail identically on `main` when run alone; they sat in `main`'s crashed chunk.
- 7 `LobbyPreviewPage.premiumAnalytics` tests are flaky on both trees, failing at random between runs.

Examples of the baseline: `App.routeGuards` (platform-policies route) and `App.routing-contract` (retired multiplayer routes), 3 tests
failing identically on `main`.

Tests this release depends on, all passing:
- `src/test/funnel/canonicalSurfaces.test.tsx`: exactly one `hub_entered` emitter, which is the home.
- `src/pages/academy-core/academyCoreRoute.test.ts`: the route and the prefetch registry.
- `route-prefetch`.
- The Orrery suites: page 41, projections 12, motion, engine, lens.

**Typecheck and lint.**
- `tsc -p tsconfig.app.json`: only the 2 baseline errors (`OnboardingProfile.tsx:180`, `connections.ts:263`, both on `main`).
- `eslint` on every changed file: 0 errors; 2 warnings, both on `main` (`App.tsx:453`, `AcademyCoreInstrument.tsx:55`).

**Production build.**
- `npm run build` (vite build, then the item and champion prerender and their verifiers) exits 0.
- The Orrery is its own lazy chunk: `AcademyCorePage` 60.6 kB JS (18.7 kB gzip) + 53.5 kB CSS (11.6 kB gzip).
- The Tailwind "ambiguous class" warnings come from files this branch does not change.
- The build regenerates `public/sitemap.xml` (423 entries); see "Unresolved" below. Not committed.

**Browser, development server** (`playwright.academy-core.config.ts`, the frontend-only config with deterministic stubs):

| Spec | Chromium | Firefox |
|---|---|---|
| `e2e/academy-core.spec.ts`: the home's contracts at `/lol` (23) | 23 / 23 (re-run on `a757f1a5`: 23 / 23) | 20 / 23 headless* |
| `e2e/academy-core-v35.spec.ts --grep-invert evidence`: the Orrery (55) | 55 / 55 (re-run on `a757f1a5`: 55 / 55) | 40 / 55 headless* |

\* Headless Firefox renders this scene at about 2 fps on this machine, so every Firefox failure is a motion or timing magnitude
(for example, the activation measured at 522 ms, or the orbit travelling 77 px against a 100 px floor). See "Unresolved" 1–2. Firefox
behaviour was certified separately, headed, against the production build: **12 / 12**.
- the orbit runs;
- Combat routes by pointer, with a 285 ms activation;
- Ctrl-click opens a new tab and Enter routes;
- the crystal cycles all four previews;
- the arrows step one book per press and hold;
- Lux and the six shutters render;
- reduced motion routes immediately;
- the lite orbit runs;
- no page errors.

These cover:
- desktop 1366×768, 1920×1080 and 1280×660, and phones 390×844, 320×568 and 430×932: no overflow, covers, first screen, 44 px targets,
  200 % text zoom;
- all four book destinations by pointer, and Enter by keyboard;
- the measured 240 ms activation; rapid clicks; Ctrl-click left to the browser;
- the crystal readout and keyboard;
- drag, fling and snap; the two-arrow selector;
- the six-shutter Lux iris (geometry and reveal), the Pro Play 5 v 5, Combat and Archives;
- quality tiers, reduced motion, and the loop paused when not shown;
- Daily / Ranked / Patch Report links; the preview redirects; `/lol#academy-commons`; client-side Hall and Commons links;
- `/lol/hall` preserved and `noindex`, with `/lol` indexable;
- the Landing hand-off with no Hall-only art; the Daily read only with a session; silence before a gesture and when muted;
- what art loads.

**Browser, production build** (`vite preview` of `dist/`, Edge, real production reads, nothing stubbed): **51 / 51 checks**:
- direct load and reload of `/lol` (HTTP 200 through the SPA fallback) and of `/lol/hall`;
- the production title, canonical `https://mogzy.lol/lol`, no `robots` on `/lol`, and `noindex, nofollow` on `/lol/hall`;
- the orbit moving (about 38 px in 1.5 s);
- Lux from the live manifest (`…/assets/champions/Lux/icon.png`), six shutters, and ten Pro Play icons;
- an arrow turn that holds the orbit;
- all four books routing (pointer: Combat, Leaguecraft, Archives, Pro Play), Enter on Archives, and Back to the Orrery;
- `/lol/dev/academy-core-v35`, `/dev/academy-core-v35` and `/lol/dev/academy-core` → `/lol`, and
  `/lol#academy-commons` → `/lol/hall#academy-commons`;
- `/` → `/lol`, with no Hall chunk or Hall art and no `daily-run` read without a session;
- `main`'s new `/quiz/more-challenges` rendering;
- the phone stacked layout with no overflow, and reload;
- reduced motion: no running loop and still books; lite honoured; a hidden tab freezing the engine's transforms (resuming when visible);
- no page errors. The only console errors are anonymous `401`s from `/quiz`'s own reads after a book opens it, as on `main`.

Stills: `docs/handoffs/academy-core-v35/prod-*.png`.

**Newer `main` functionality.** `main`'s 25 commits do not touch the Core. Their own unit tests are inside the full-suite comparison
above, with no new failures. Their e2e specs:
- `perfect-timing-owner` (arena config): **55 / 55** on `a757f1a5`, including PT5's new tests; 38 / 38 before PT5 landed.
- `interaction-labs-access` (production bundle): 20 / 21. The one failure ("the owner's bookmark /admin/perfect-timing lands on …")
  fails identically against `main`'s own bundle.

After merging PT5: `tsc` shows only the 2 baseline errors. Unit tests for the Core, funnel, routing, Perfect Timing and playtests:
564 passed, 3 failed, the same 3 `App.*` baseline failures. `npm run build` exits 0.

### Release procedure (not executed: it needs the owner's explicit go) and rollback

Frontend only: no backend, Supabase, Railway, database, env, flag or audio step. Production for `mogzy.lol` is the Lovable project
connected to this GitHub repository: Lovable builds whatever is on `main`, and nothing reaches `mogzy.lol` until someone presses
**Publish** in Lovable (the same procedure as V3's release, `ACADEMY_CORE_V3_INTEGRATION_HANDOFF.md` §7–§8).

1. **Re-check `main`.** `git fetch origin`. If `origin/main` moved past `c5521d3e`, merge it into
   `academy-core/v35-production-integration` (merge, do not rebase). Then re-run `tsc`, the Core unit tests and
   `npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts e2e/academy-core-v35.spec.ts --grep-invert evidence --project=chromium`
   (headless Firefox is too slow for this scene's motion assertions; see "Unresolved" 2).
2. **Merge the PR** into `main` with a **merge commit**, not squash or rebase, so rollback is a single revert.
3. **Lovable Publish** from `main`. **Publish ships all of `main`, not just this PR.** At `c5521d3e` that includes PGM2's frontend
   (`93de0546`, which its own handoff lists as "awaiting Lovable"), and whatever else on `main` is unpublished. Decide whether those
   go out together, or publish `main` before merging this PR so the two releases stay separate. Note the previous published version in Lovable's history first: it is the fastest rollback.
4. **Verify on `https://mogzy.lol`**, in a private window, then signed in:
   - `/` → automatic hand-off → `/lol` shows the Orrery: the four books orbit the Core, the Patch Report and radio float on the left,
     Daily and Ranked are present, and Mogzy is at the edge.
   - Reload `/lol` (F5) and open `/lol` directly in a new tab: the Orrery, not a 404.
   - Each book routes after the short activation (Leaguecraft `/quiz`, Pro Play `/lol/pro-play`, Combat `/combat-lab`, Archives
     `/lol/docs`). Ctrl-click opens a new tab. The crystal cycles the four projections without navigating (Leaguecraft shows Lux behind
     the six-shutter iris; Pro Play the 5 v 5 around the Rift). The two arrows turn the orbit.
   - `/lol/hall` (direct and reloaded) shows the Hall, and its Commons are reachable. `/lol#academy-commons` ends on
     `/lol/hall#academy-commons`. `/lol/dev/academy-core-v35` and `/lol/dev/academy-core` redirect to `/lol`.
   - DevTools: `/lol` has the title "Mogzy LoL Quiz | League of Legends Trivia and Training", a canonical `…/lol` and no `robots`
     meta; `/lol/hall` has `noindex`.
   - Network, cold `/` → `/lol`: no `academy-library-*`, `book-spine-*` or `LolHub-*` request; `/api/daily-run/today` only when
     signed in.
   - Phone (or DevTools 390×844): the composed two-tier arrangement, no horizontal scroll, and books and crystal respond to taps.
   - OS "reduce motion" on: nothing loops, and books route at once.
   - Console clean. Analytics: `hub_entered` once per session. Audio: nothing on arrival; mute silences everything.
   - New `main` features still reachable: `/quiz/more-challenges`, the Daily, `/admin/playtests/perfect-timing` (owner).
5. **Watch for about an hour:** the error rate, the `/lol` funnel (`hub_entered`, `leaguecraft_cta_clicked`), and Search Console coverage
   of `/lol` (the crawled DOM changes; the title, description and canonical do not).

**Rollback**

Frontend only, with no data to undo.

- **Fastest:** in Lovable, re-publish the previous version noted in step 3. That restores the prior build within minutes.
- **Source of truth:** `git revert -m 1 <merge commit>` on `main` (one PR), then Lovable **Publish**.
  - `/lol` returns to the V3 Four-Book Core: its implementation comes back with the revert, and its route, registry and funnel wiring
    never changed.
  - All V3.5 code leaves `main` (it stays on `design/academy-core-v35-floating-orrery` and on this branch), so
    `/lol/dev/academy-core-v35` 404s again.
  - Nothing else moves, because the merge touches only the Core's own files, `App.tsx` (two redirects and a comment) and the two Core
    specs.

### Unresolved / for the owner

1. **Firefox frame rate in the full tier (owner decision; I don't consider it release-blocking).** On this machine, with Playwright's Firefox
   build headed, `/lol` runs at **60.3 fps on V3 (`main`)** and **33–35 fps on the V3.5 full tier** (median frame 33.3 ms, p95 50.1 ms,
   three rounds). The **lite tier runs at 57.8 fps**. Edge and Chromium hold 60 fps on the full tier.
   - Behaviour in Firefox is correct (12/12 functional probe), and the orbit moves at full speed: motion is time-based, so it is only
     less smooth.
   - The automatic step-down to lite does not trigger, because Firefox alternates ~33 ms and ~17 ms frames and the counter (frames over
     30 ms, minus two per fast frame) never reaches 150.
   - Not verified in a stock Firefox with hardware WebRender: Playwright's build may render without GPU acceleration.
   - Options:
     - (a) ship as is;
     - (b) a small follow-up: judge the step-down on a rolling median frame time (for example > 25 ms over 2 s) instead of a run of
       slow frames, so a sustained ~30 fps scene drops to lite on its own;
     - (c) start Firefox in lite.

   (b) and (c) change what some visitors see (lite drops decorative extras), so I have not made either.
2. **Headless Firefox cannot certify this scene.** It renders at about 2 fps here (7 frames in 3 s), so 18 of the 78 browser tests fail
   on motion and timing magnitudes, not behaviour. Run headed, 7 of those 18 pass. The rest hit a harness problem:
   `page.setViewportSize` hangs in headed Firefox on Windows (8 tests), plus waits that expire under an occluded headed window. The
   direct headed functional probe passed 12/12. V3's Firefox certification ran the lighter V3 scene.
3. **PR tooling.** The `gh` CLI is not installed on this machine. The branch is pushed; the PR's state is in the release report.
4. **The Lovable side cannot be inspected from here.** The publish and rollback steps above follow the repository's documented practice
   (`README.md`; `ACADEMY_CORE_V3_INTEGRATION_HANDOFF.md` §7–§8). The previous published version must be noted in Lovable's history
   before publishing.
5. **Observed on `main`, not changed here.**
   - Lovable commit `96d0bb7d` ("Changes") removed 865 lines (the champion pages) from `public/sitemap.xml`. `npm run build` regenerates
     the sitemap (423 entries) before the bundle is assembled, so the built sitemap is complete; only the committed copy is stale.
   - The test baselines listed under Verification.
   - `interaction-labs-access` "the owner's bookmark /admin/perfect-timing lands on …" fails identically on `main`'s bundle.
   - The `arena` and `interaction-labs` Playwright configs start their web server with a Unix path (`node_modules/.bin/vite`) that
     Windows `cmd` cannot run. I started those servers by hand.
6. **Now-unused V3 code.** The instrument's non-compact (V3 chassis) path and V3-only rules in `academy-core.css` are no longer used by
   any route. Removing them is optional cleanup, deliberately left out of this release.
7. **`main` moves fast.** It moved three times during this pass (`f5f90c72` → `10534633` → `f6e5f6ca` → `c5521d3e`), each merged and
   re-verified here, none touching the Core. Release step 1 (re-merge `main` and re-run the checks) matters for that reason; the PR
   page also shows whether it still merges cleanly.
8. **Unpublished work on `main` ships with this.** Lovable publishes all of `main`, including PGM2's frontend (`93de0546`); see release
   step 3.
9. **Known since earlier passes.** The 128 px Lux icon is soft on HiDPI. The admin registry still labels `/lol` "LoL Hub" (cosmetic).
   Click latency includes the approved 240 ms activation, as V3 did.

### Evidence (production build, real data, Edge)

- `prod-desktop-1366x768-lol.png` (`/lol` at 1366×768) and `prod-phone-390x844-lol.png` (the phone composition).
- `prod-desktop-leaguecraft-lux.png` (the six-shutter Lux iris) and `prod-desktop-pro-play.png` (the 5 v 5).
- `prod-desktop-lol-hall.png` (the Hall at `/lol/hall`).
- `prod-check.json`: the 52 production-build checks, with their measured details.

All of these are in `docs/handoffs/academy-core-v35/`.

### Next

Owner inspection of the PR (`academy-core/v35-production-integration` → `main`), then the release procedure above. Nothing is merged,
deployed or published.

---

## P2L.1. Leaguecraft — Lux geometry correction: the chamber's iris

Base `1be55f14` (HEAD and remote verified). Owner feedback: the glass pieces should fit the chamber cleanly, as symmetrical pieces at
its corners, and rotate to reveal the face underneath; the P2L panes read as odd-shaped crystals shuffling around at random. Only the
concealment geometry and its motion changed. Lux (the manifest icon), the window, the light sweep, the gold crystal, the
navigator-driven reactions, Pro Play, Combat, Archives, the books, orbit, selector, sizes, everything else on the page and production V3
are untouched. No backend change. Phase 3 has not started.

**On "pentagon":** the chamber around Lux is a **hexagon**. The Leaguecraft iris has six blades, and the Lux window is a pointy-top
hexagon aligned with them; the P2C pentagon was removed in P2L. So the shutters are derived from the six corners of that chamber, the
only geometry they can belong to. If you meant a literal five-sided chamber, say so: the shutter construction below works for any
regular polygon, but the window would then no longer match the iris.

### What changed in the geometry

The three free panes (a blue slab, a violet hexagonal shard and a gold blade on their own paths) are gone. In their place is **an
iris of six identical shutters that is part of the window itself**:

- The hexagonal window is divided into six equal triangles: centre, corner *k*, corner *k + 1*. Shutter *k* is that triangle, **hinged
  at corner *k***, with its base lying along one edge of the window.
- The shutter is drawn once (`SHUTTER_POINTS`, in its hinge's own coordinates) and repeated by 60° rotations about the centre, so the
  six are exactly symmetrical. They alternate Hextech blue and violet glass with pale-gold edges, a reeded texture, a sheen, and one
  facet line from the hinge.
- A small gold **hinge jewel** sits on the frame at each corner, the visible pivot of each shutter.
- The shutters live inside the window's clip, under the frame: as they swing out they slide under the frame and never past it.
- The refraction copy of the portrait (now a plain 1.14× magnification about the centre, like a lens) is masked to the six shutters,
  so Lux's features shift at every shutter edge.

**Why this geometry is clean:** pivoting every shutter outward by the same angle θ about its own hinge opens **a central hexagonal
aperture** (inradius R·sin θ, with a narrow slot back to each hinge, as in a camera iris), and **the shutters never overlap**. The
open share of the window is exactly θ/60: at 0° it is fully covered, and at 60° every shutter has swung out of the window. The
aperture is centred on her face. Both properties are unit-tested on the geometry and measured in the browser.

### How the animation changed

All motion is now **rotation about the hinges**. One parameter, the shutter angle, tells the whole story. Nothing translates or
drifts.

| loop (14 s) | angle | what you see |
|---|---|---|
| 0–8 % | 16° | rest: a small central aperture over her eyes and nose, the rest of her behind glass |
| 8–34 % | 16° → 46° | the six shutters pivot open together, rippling round the ring (each 0.1 s ahead of the next) |
| 34–60 % | 46° | open: most of her face revealed; the light beam crosses her (36–62 %) and the shutter edges glint |
| 60–80 % | 46° → 5° | the iris closes |
| 80–86 % | 5° | closed: she is seen only through the glass, refracted |
| 86–100 % | 5° → 16° | settles back to rest; 100 % equals 0 %, so the loop has no seam |

The navigator reactions are extra pivots about the same hinges (CSS transitions on a parent group, so they compose with the loop):

- **Entering Leaguecraft:** the shutters swing in from outside the window (62° → 0°, 900 ms).
- **Reaching for the Leaguecraft book** (hover or keyboard): every shutter opens a further 16°.
- **Opening the book** (the existing 240 ms activation): they swing right out (62°), so Lux is fully revealed.

Reduced motion and lite show the composed rest (16°, about a quarter of the window open over her face). Off-focus, off-screen and
hidden-tab suspension are unchanged (the loop is paused unless Leaguecraft is shown and the scene is live).

### Files

Changed only:
- `src/pages/dev/academy-core-v35/OrreryProjections.tsx`: `Shutter`, `AtHinge`, `SHUTTER_POINTS` replace `Pane`/`PANES`, and the
  hinge jewels are added. The Pro Play section is untouched.
- `academy-core-v35.css`: the Lux block now holds the shutter, hinge, loop and state rules (the pane rules are removed).
- `orrery-projections-data.ts`: the unused `LUX_GLASS_SCALE` is removed.
- `OrreryProjections.test.tsx`, `AcademyCoreV35Page.test.tsx`, `e2e/academy-core-v35.spec.ts`: tests and the evidence suite.

The shared `AcademyCoreInstrument.tsx` is not modified.

### Tests (measured)

| Suite | Result |
|---|---|
| vitest: V3.5 + V3 (`AcademyCorePage`, route, warm, lens) + `route-prefetch` | **154 / 154** (projections 12, was 10; the Lux tests rewritten for the iris) |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` + `e2e/academy-core.spec.ts` (bundled Chromium) | **80 / 80** (see note) |
| `tsc` | only the 2 pre-existing baseline errors |
| `eslint` | 0 errors; the 1 pre-existing warning (`AcademyCoreInstrument.tsx:55`) |

Note: in the full run, 79 passed and the P2T selector test "the whole orbit turns" failed once: the orbit turned 27 px against a
40 px floor while an Edge capture was loading the machine. It is untouched by this pass and passed 3/3 when re-run on its own.

What the tests check:

- **Unit, on the geometry:**
  - the six shutters share one polygon, each is placed by `rotate(60k) translate(0 -R)` with its hinge on corner *k*, and they
    alternate blue and violet;
  - sampling the window at θ = 0, 5, 16, 30, 46 and 60°, the open share equals θ/60 (to 0.05) and the overlap is under 0.5 %;
  - no panes, reticle, roles, emblem or text remain, and the only images are Lux.
- **Browser (frames seeked deterministically with the Web Animations API):**
  - each shutter's hinge lies on its window corner on screen (within 0.5 px);
  - the six shutters agree in every hold (within 0.5°), at 16°, 46° and 5°;
  - the measured open share of the window follows θ/60, with no overlap;
  - the central face region is more than 95 % open at the height of the reveal and less than 30 % open when closed;
  - while opening the reveal only grows (by more than 40 points), and the ripple runs round the ring;
  - the loop seam agrees within 0.05°, and the light crosses while the iris is open;
  - book hover adds 16° (more than 20 points more of her revealed), and activation swings the shutters to 62° (more than 97 % revealed)
    while the real click still navigates;
  - lite and reduced motion are at rest (16°, about a quarter of the window open) with nothing running.

**Pixel regression** (Edge, reduced motion, identical framing): idle, Pro Play, Combat and Archives have **0 changed pixels**
against both the P2C and the P2L captures. Only Leaguecraft differs.

### Performance (A/B against `1be55f14` served side by side, headless Edge, 1366×768, four pairs per state)

| main-thread busy, mean of 4 | before | after |
|---|---|---|
| idle | 27.7 % | 29.5 % (one outlier pair, 28.2 → 36.4; the other three ±4) |
| Leaguecraft pinned | 31.6 % | 31.9 % |
| Pro Play pinned | 28.4 % | 29.2 % |

These differences are within run-to-run noise. rAF holds at a 16.7 ms median and about 360 frames per 6 s in every run. The document
has 12 more animation objects (six shutters plus their six mask twins, all paused unless Leaguecraft is live). No console or page
errors.

### Evidence (`docs/handoffs/academy-core-v35/`, real art, recorded in Edge at its real frame rate)

- **`orrery-lux-iris-loop-closeup.webm`** (14 s, the lens cropped and enlarged 2×): exactly one loop, rest → pivot open → open with the
  light → close → closed → rest.
- `orrery-lux-mystery-closeup.webm` (40 s, close-up) and `orrery-lux-mystery.webm` (41 s, full 1366×768 frame; add ~1.5 s to these
  times). The sequence:
  - 0 s: the shutters swing in;
  - ~1–15 s: one whole loop;
  - ~16 s: book hover opens the iris further;
  - ~21 s: the crystal goes to Pro Play;
  - ~23–37 s: the arrow selector brings Leaguecraft back;
  - ~37 s: the book is opened, the shutters swing out, and the room opens.
- Actual size: `lux-1366x768-leaguecraft.png` (full desktop frame) and `lux-actual-size.png` (lens at 1×).
- Close-up at 3×: `lux-closeup.png`.
- The loop, frame by frame (3×): `lux-frame-1-rest.png`, `lux-frame-2-opening.png`, `lux-frame-3-open-sweep.png`,
  `lux-frame-4-closing.png`, `lux-frame-5-closed.png`, `lux-frame-6-settling.png`.
- Reveal states: `lux-book-intent.png` (book hovered) and `lux-activation.png` (book opening: shutters swung out).
- `lux-reduced-motion.png` and `lux-lite.png`: the composed rest.
- Phone 390×844: `lux-mobile-390x844.png` and `lux-mobile-390x844-crystal.png` (window 72 × 83 CSS px).
- Pro Play unchanged: `lux-regression-actual-size-pro-play.png`.

### Limitations and owner questions

1. **Hexagon, not pentagon** (see above). This follows the chamber's six iris blades.
2. **Slots to the hinges.** Rigid triangular shutters pivoting at the corners open a central hexagon plus a narrow slot back to each
   hinge (the camera-iris look in the frames). This is what keeps the shutters from ever overlapping. Fully hiding the slots would need
   larger, overlapping blades, and overlapping translucent glass darkens unevenly.
3. **Brief full reveal.** It happens within the existing 240 ms activation (no extra delay is allowed). The longer reveals are the
   loop's open hold (about 3.6 s) and book hover.
4. The P2L notes on the 128 px icon's HiDPI softness and on headless activation timing still apply.

### Next

Owner review of the iris. Nothing else is started: no PR, merge, deploy, publish, audio change, other projection or Phase 3.

---

## P2L. Leaguecraft — "Arcane Mystery: Lux"

> Reviewed. Its three free glass panes and their drifting loop are **superseded by §P2L.1**. The subject, asset, window, light sweep,
> gold crystal, states and isolation below still stand.

Base `4b77dd9c`. Only the Leaguecraft crystal projection changed (plus its crystal tint, below). Pro Play (5 v 5 + Rift), Combat,
Archives, the books, orbit, drag, arrow selector, crystal/dial/Orrery sizes, Patch Report, radio, Mogzy, Daily/Ranked, routing, audio,
analytics, auth and production V3 are untouched. No backend, database, Supabase or Railway change. Phase 3 has not started.

### Objective

Replace the pentagon, the five role icons and the scroll/quill with one large, recognisable champion, Lux, partially concealed by moving
Hextech glass, as a cinematic mystery that loops seamlessly and reacts to the existing navigator only.

### Design

- **The subject.** Lux's genuine square champion icon fills a pointy-top hexagonal window of corner radius 86 (inradius ≈ 74.5) inside
  the Leaguecraft iris opening (104). The window is aligned with the iris, so the blades frame it and never cover it. At 1366×768 the window
  measures **140 × 162 px** (e2e: ≥ 130 px wide and > 60 % of the lens). It is the projection's main attraction: there is no medallion,
  text or other subject. The window has a dark backing, a soft vignette, a pale-gold frame and an outer halo.
- **The glass.** Three translucent panes in front of her: a **blue** lens slab, a **violet** hexagonal shard and a **pale-gold** blade. Each
  has a defined double edge (dark outer line, bright inner line), a reeded texture, a sheen, light streaks and a drop shadow, with
  controlled opacity, so she is visible through the glass but obscured. A **refraction copy** of the portrait (offset and magnified 1.14×)
  is drawn only where the panes are (an SVG mask that reuses the panes' own animation classes, so the refraction moves exactly with the
  glass). Under each pane her features are visibly displaced, which is what sells it as glass.
- **The loop (14 s, CSS).** The panes drift and rotate through four arrangements: A (0 %) → B (28 %) → C (52 %) → D (76 %) → A (100 %).
  Each arrangement covers different regions (e.g. A: eyes and mouth; B: mouth exposed, one eye covered; C: eyes exposed, mouth covered).
  From 36–62 % a beam of arcane light sweeps across the portrait, then a beat later along the glass. The pane edges glint as it passes,
  and the portrait breathes 3.5 % at the midpoint. Keyframe 100 % equals 0 %, so the loop has no seam.
- **Reactions, via the existing navigator only (no new controls, no second click).**
  - Entering Leaguecraft: the panes slide in from the rim (900 ms).
  - Reaching for the Leaguecraft **book** (hover or keyboard focus, `data-intent="book"` on the stage): the panes part a little
    (≈ 20–27 units), revealing more of her.
  - **Opening** the book (`data-activating="leaguecraft"`, the existing 240 ms activation): they part fully (≈ 72 units) and dim to 0.5,
    so Lux is revealed as the room opens.
  - Leaving: they slide back to the rim.
- **Crystal tint.** P2C had made the Leaguecraft crystal violet, sharing Pro Play's colour. It is now a deeper **gold** (one
  V3.5-scoped rule), so the violet and blue glass reads against it and Leaguecraft and Pro Play are distinct again.

### Asset source

The manifest's own `Lux` icon (`/api/assets/champions` → `assets/champions/Lux/icon.png`, 128 × 128, served 200), resolved with
`getChampionIcon(manifest, "Lux")`. It is the same authority and request the book covers and the Pro Play plates use. No splash art, no
invented or external URL, no fallback image: if the manifest lacks Lux, the window stays dark glass (unit-tested). The icon loads after the
critical art, like the other projections.

### Animation implementation

- Everything is CSS transforms and opacity on SVG groups, plus one SVG mask and one clip path. There is no script, React state, canvas or
  WebGL in the animation. Each pane is nested `engage > drift > pane`: `engage` carries the focus/intent/activation states (CSS
  transitions), and `drift` carries the 14 s keyframes. With `transform-box: view-box; transform-origin: 0 0`, the CSS transforms behave
  like SVG transform attributes in the lens's local units.
- **Suspension.** The loop's animations are `paused` by default and run only under
  `.acore-svg[data-ambient="on"][data-focus="leaguecraft"]`. They hold still (paused, not removed) when another room is shown, the scene is
  off screen, or the tab is hidden (the instrument's existing `data-ambient`), so returning never jumps.
- **Reduced motion:** a polished still in arrangement A (no loop, no sweep).
- **Lite tier:** the mystery stays (panes in arrangement A, the engage/intent/activation transitions); the loop, beam, glints, breathing
  and the halo's filter are removed (`animation: none`).

### Files

Changed only:
- `src/pages/dev/academy-core-v35/OrreryProjections.tsx`: `LuxMysteryProjection` replaces the study composition. The Pro Play section is
  byte-unchanged.
- `orrery-projections-data.ts`: `MYSTERY_CHAMPION`, `LUX_WINDOW_RADIUS`, `LUX_GLASS_SCALE`.
- `OrreryCore.tsx`: a `mystery` prop feeds the Leaguecraft override.
- `AcademyCoreV35Page.tsx`: resolves the Lux icon from the manifest and sets `data-intent` on the stage.
- `academy-core-v35.css`: the Lux block replaces the Leaguecraft pentagon/emblem block, plus the gold Leaguecraft crystal.
- `OrreryProjections.test.tsx`, `AcademyCoreV35Page.test.tsx`, `e2e/academy-core-v35.spec.ts`: tests and an evidence suite.

**The shared `AcademyCoreInstrument.tsx` is not modified in this pass**: it already has the opt-in `projectionOverrides` and `lensScale`
from P2C/P2T, and V3 passes neither.

### Tests (measured)

| Suite | Result |
|---|---|
| vitest: V3.5 (motion, engine, page 41, **projections 10**) + V3 (`AcademyCorePage`, route, warm, lens) + `route-prefetch` | **152 / 152** |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` (bundled Chromium) | **58 / 58** (7 new Lux tests; the P2C pentagon test removed) |
| Playwright `e2e/academy-core.spec.ts` (production V3) | **23 / 23** |
| `tsc` | only the 2 pre-existing baseline errors |
| `eslint` | 0 errors; the 1 pre-existing warning (`AcademyCoreInstrument.tsx:55`) |

What the new e2e tests check (frames are sampled deterministically by seeking the CSS animations with the Web Animations API):

1. **Genuine icon:** the portrait's href is the manifest's Lux icon, the window is ≥ 130 px wide at 1366 and > 60 % of the lens, and
   there are three panes in front.
2. **Motion and seam:** the panes take four distinct arrangements over the loop, and the 0 % and 100 % matrices agree within 0.05.
3. **Genuine concealment:** `isPointInFill` on the pane geometry at her eyes and mouth shows the covered set changes between arrangements.
4. **Light sweep:** the beam is dark before the sweep, bright mid-sweep, and gone after.
5. **Off-focus suspension:** the loop runs only while Leaguecraft is shown and is paused otherwise.
6. **Intent and activation:** hovering the book parts each pane by > 10 units, the activating state parts each by > 40 (measured ≈ 72),
   and the real click still navigates to the room.
7. **Lite:** no `o35-` animations, with the portrait and three panes present.

Phones and reduced motion are covered by the extended responsive test (portrait visible, window > 60 px, no running `o35-` animation).
Unit tests cover:
- the no-reticle / no-roles / no-emblem / no-text rule, and that the only images are Lux;
- a null portrait renders no image;
- the window's corners project below the iris's 104 on every blade normal;
- isolation: Combat and Archives markup is byte-identical with and without the overrides, and `/lol` has no override.

**Pixel regression** (Edge, reduced motion, identical framing, against the `4b77dd9c` captures): **idle, Pro Play, Combat and Archives
have 0 changed pixels**. Only Leaguecraft differs.

### Performance (A/B against `4b77dd9c` served side by side, headless Edge, 1366×768, manifest including Lux)

| main-thread busy | before | after |
|---|---|---|
| idle | 37.8 / 33.1 % | 37.7 / 36.3 % |
| Leaguecraft pinned | 57.0 / 52.3 % | 51.8 / 58.1 % |
| Pro Play pinned | 47.3 / 53.2 % | 51.8 / 51.6 % |

The differences are within run-to-run noise (each pair overlaps), and rAF stayed at a 16.7 ms median in every run. The document carries 12
more animation objects, the paused Lux loop. This machine's absolute numbers are higher than in P2C's session; compare within the table
only. No console or page errors.

### Evidence (`docs/handoffs/academy-core-v35/`, real art from the asset host, recorded in Edge at its real frame rate)

> The P2L recordings and stills were re-captured for §P2L.1 under the same file names; the four pane-arrangement frames
> (`lux-frame-b/c/d/sweep.png`) were removed. See §P2L.1's evidence list.

- `orrery-lux-mystery-closeup.webm` and `orrery-lux-mystery.webm` (now showing the §P2L.1 iris).
- Actual size: `lux-1366x768-leaguecraft.png` (full frame) and `lux-actual-size.png` (lens at 1×).
- Close-up at 3× device pixels: `lux-closeup.png`.
- States: `lux-book-intent.png` (book hovered), `lux-reduced-motion.png`, `lux-lite.png`.
- Phone 390×844 at 2×: `lux-mobile-390x844.png` (full) and `lux-mobile-390x844-crystal.png`. The window measures 72 × 83 CSS px (the
  phone lens is about half the desktop one); she is still the clear subject and recognisable.
- Pro Play regression: `lux-regression-actual-size-pro-play.png`, for comparison with `crystal-redesign-actual-size-pro-play.png`. The
  pixel-exact comparison is the reduced-motion diff above. These two motion-on stills differ only where the rings and orbit lines turned.

### Limitations and owner questions

1. **Resolution.** The manifest's icon is 128 px. At 1366 it is drawn about 1.25× (sharp enough to read at a glance). On 2×/3× HiDPI
   screens and in the 3× close-ups it is visibly soft. A sharper source would need a larger manifest asset (e.g. a square crop of the
   loading art), which the brief excluded ("no splash"), so it is not done.
2. **Activation timing in headless tests.** The full reveal happens within the existing 240 ms activation, before the route changes. Edge
   measures 25 → 72 units by ~230 ms (and the recording shows it). Bundled headless Chromium paints too slowly to catch it reliably, so the
   e2e test asserts the activating state directly and then checks that the real click navigates.
3. **Reveal duration.** Because the activation is 240 ms, the full reveal is brief by design: the brief allowed no extra delay or second
   click. The longer, intentional reveal is the book hover.
4. **Leaguecraft's crystal is gold again** (it was violet in P2C). Say if you would rather keep it violet.
5. **Test-suite side effect (pre-existing, not changed):** `e2e/academy-core.spec.ts` rewrites the committed V3 stills in
   `docs/handoffs/academy-core-v3-integration/` whenever it runs. I restored them before committing.

### Next

Owner review of the Leaguecraft mystery. Nothing else is started: no PR, merge, deploy, publish, audio change, other projection or
Phase 3.

---

## P2C. Crystal redesign — Leaguecraft (pentagon + scroll/quill) and Pro Play (5 v 5)

> Superseded for Leaguecraft by §P2L. The Pro Play half below is current.

Base `2a543a0f` (branch, HEAD and remote verified; clean tree). Only the Leaguecraft and Pro Play projections changed. The books, orbit,
drag and inertia, arrow selector and hold, lens size, Core and rings, Patch Report, radio, Mogzy, Daily/Ranked, navigation, analytics,
Combat and Archives projections, audio and backend are untouched. Production `/lol` is untouched (verified by test).

### What changed

**Leaguecraft** now draws the composition Pro Play used to draw: the targeting reticle (it rotates to lock on when the room is focused),
the five real role icons on the pentagon (r 76, 72° apart, the same `CORE_OBSERVE_ROLES` files), and the violet crystal field. Ahri's
portrait is replaced by a **scroll-and-quill medallion**, drawn as vector art: a navy-violet disc with the gold lamp ring, a parchment
sheet with ink lines between two brass-capped rolls, a white-violet quill with a gold nib crossing it, and a glint off the quill's tip.
It is centred in the reticle and shown at about 60 px across at 1366 wide (drawn at r 26, displayed 1.2×). It grows into place as the room
is focused and, under ambient motion, floats ±1.2 units with a soft pulsing glow (the existing `acore-pulse` keyframes). The Leaguecraft iris
opening (104, wider than Pro Play's 88) was left as it is: the composition is fully visible inside it.

**Pro Play** now shows **5 v 5 around Summoner's Rift**, in the Archives' language: a central circular subject (r 46, in the instrument's own
art clip) in a layered crystal field, with five champion icon plates on an **upper arc** and five opposing plates on a **mirrored lower arc**
(r 74, 23° steps, icons r 12 — about 22 px at 1366 wide). The sides are told apart by subtle blue and ember ring tints and a tinted plate
plus a fine dashed trace under each arc. As the room is focused the two sides slide out from the centre into place (as the Archives' strata
spread), and a dashed ring around the Rift turns slowly. There is no text, no patch content, no players, no results.

**Fit (local lens units):** every icon's outer edge is within 86 of the centre along every iris blade normal (the open Pro Play iris is a
hexagon of inradius 88), so no blade covers a portrait once the iris is open. Icons are 5.5 apart and 15 clear of the Rift ring. Everything is
inside the lens (r 118). This is unit-tested exactly and checked in the browser at real scale.

### Assets and provenance

- **Champion icons:** the champion manifest's own `icon` files (`/api/assets/champions`, the same authority and request the book covers
  already use), resolved with `getChampionIcon`. Lineup, top → support: blue **Gnar, Lee Sin, Azir, Jinx, Thresh**; red **K'Sante, Vi,
  Orianna, Kai'Sa, Nautilus** (manifest keys verified against production on 2026-10-16). A representative decorative lineup, not a real
  match. If the manifest lacks a name the plate stays empty; no image is guessed. The icons load after the critical art, like the other
  projections.
- **Summoner's Rift centre:** `src/assets/academy-core/rift-lane-turret.webp` (256 × 256, 13 KB), a derivative of two assets the product
  already ships:
  - `src/assets/ranked/lane.png`, the owner-supplied Summoner's Rift lane scene (ENVVIS1, `d0090576`, 2026-09-20; it shows the lane,
    brush and base wall);
  - the backend's canonical turret render, `assets/structures/turret.png` (the `quiz.structure_assets` registry art).

  The turret is composited on the lane, which is the same pairing the quiz's `lane_turret` environment scene uses. I chose this over a lane
  crop alone: at the real ~86 px size, plain lane crops read as generic grass and dirt, while the turret makes the image read as Summoner's
  Rift at once. No external Riot URL was fetched or invented; both sources are already in use in Mogzy under its existing fan-project terms.

### Isolation

`AcademyCoreInstrument.tsx` (shared with V3) gained one opt-in prop, `projectionOverrides` (Leaguecraft and/or Pro Play artwork drawn in the
lens's local space inside the room's own mode group). When it is absent, the V3 projections render exactly as before. V3.5 passes its
designs from `OrreryProjections.tsx`. The Leaguecraft violet palette and the new styles are V3.5-scoped CSS (`.o35-root`).

### Files

New: `OrreryProjections.tsx` (both designs), `orrery-projections-data.ts` (lineup, Rift art, arc geometry), `OrreryProjections.test.tsx`,
`src/assets/academy-core/rift-lane-turret.webp`. Changed: `AcademyCoreInstrument.tsx` (+`projectionOverrides`, two conditional wrappers),
`OrreryCore.tsx` (passes the overrides), `AcademyCoreV35Page.tsx` (lineup icons from the manifest), `academy-core-v35.css` (Leaguecraft
palette and reticle lock, emblem, 5 v 5 styles), `AcademyCoreV35Page.test.tsx`, `e2e/academy-core-v35.spec.ts` (stub manifest gained the
lineup names; new tests; an evidence suite).

### Tests

| Suite | Result |
|---|---|
| vitest: V3.5 (motion 39, engine 7, page 41, **projections 8**) + V3 (`AcademyCorePage` 32, route 9, warm 5, lens 2) + `route-prefetch` 7 | **150 / 150** |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` (Chromium) | **52 / 52** (46 previous + 6 new) |
| `tsc` | only the 2 pre-existing baseline errors |
| `eslint` | 0 errors; the 1 pre-existing warning (`AcademyCoreInstrument.tsx:55`) |

The new checks cover:

1. Exactly five role icons on the r 76 pentagon, the emblem centred and ≥ 56 px, and no champion portrait in Leaguecraft.
2. Exactly ten champion icons, five per side, each on its side, inside the iris's inscribed circle, clear of the Rift ring, and ≥ 18 px.
3. The Rift image centred, ≥ 80 px and served (200).
4. All four modes switch, and only Leaguecraft and Pro Play carry overrides.
5. The arrow selector and the crystal stay in step.
6. `/lol` still has the V3 magnifier and the Ahri track mark, and no override.
7. Phones and reduced motion show the same two projections, with no overflow.
8. No page errors.

Unit tests also check that Combat and Archives markup is byte-identical with and without the overrides. Pixel diffs at identical framing
against the `2a543a0f` captures show **idle, Combat and Archives with 0 changed pixels**; only Leaguecraft and Pro Play differ.

### Performance (A/B against `2a543a0f` served side by side, headless Edge, 1366×768, 60 Hz this session)

| | before | after |
|---|---|---|
| idle | 29.6 / 31.2 % | 28.2 / 30.4 % |
| Leaguecraft pinned | 33.0 / 32.9 % | 34.8 / 34.5 % |
| Pro Play pinned | 32.1 / 32.7 % | 32.6 / 31.2 % |

60 fps was held in every run. The only measurable difference is about +1.7 points while Leaguecraft is pinned (the emblem's float and glow
animations). No console or page errors.

### Evidence (`docs/handoffs/academy-core-v35/`, real art, Edge)

- `orrery-crystal-redesign.webm` — 26 s: the crystal cycles Leaguecraft → Pro Play → Combat → Archives twice, holding on the two new ones;
  then the arrows bring Pro Play round, with the crystal following.
- Actual desktop size: `crystal-redesign-1366x768-leaguecraft.png` and `crystal-redesign-1366x768-pro-play.png` (full frames).
- All four modes at 1×: `crystal-redesign-actual-size-{leaguecraft,pro-play,combat-lab,archives}.png`.
- Close-ups at 3× device pixels, same framing: `crystal-redesign-closeup-leaguecraft.png`, `crystal-redesign-closeup-pro-play.png`.
- Phones (390×844 at 2×): `crystal-redesign-mobile-390x844-leaguecraft.png`, `crystal-redesign-mobile-390x844-pro-play.png`.

### Limitations and owner questions

1. **Leaguecraft and Pro Play now share the violet crystal.** The brief lists the violet field as part of the composition Leaguecraft
   inherits, and nothing asked for Pro Play's colour to change, so it stayed violet. Leaguecraft's halo, comet, needle and tether stay gold.
   If you would rather Leaguecraft keep its gold crystal, or Pro Play move to another tint, it is one CSS rule.
2. **On phones the ten icons are small** (about 11 CSS px, read from the 2× capture; the phone lens is about half the desktop one). They are
   visible but not individually identifiable at a glance. The emblem stays clear (measured over 28 CSS px).
3. The champion icons depend on the asset host. While it is slow, the plates show empty until the icons arrive (the same behaviour as the
   book covers).
4. The Rift image is a derivative composite, documented above. If you would prefer an untouched source image (e.g. a lane crop only, or the
   Nexus scene), it is a one-file swap.

### Next

Owner review of the two projections. Nothing else is started: no PR, merge, deploy, sound or Phase 3.

---

## P2T. Phase 2 targeted improvements — the arrow selector and the larger crystal

Base: `b2518371` (verified HEAD and remote, clean tree before work). Nothing else was changed: no new text, no other visual work, no audio,
no backend. Production `/lol` is untouched (the shared instrument got one opt-in prop whose default is the V3 value; verified by test).

### Change 1 — two arrows that turn the orbit

**What you see.** Two small round Hextech buttons (navy disc, gold ring, blue inner ring, gold chevron) beneath the Core, flanking the
front of the orbit — exactly the place a selected book comes to rest, so the pair reads `‹ [book] ›`. No text, labels, counters or panels;
the names are `aria-label` only ("Previous book" / "Next book", group "Turn the orbit"). Hover brightens, press dips, keyboard focus shows a
gold outline. Targets are ≥ 44 px. On phones the same pair sits centred under the composed books.

**Direction.** `›` (right) turns the orbit the way it already idles: the near side moves left and the book coming from the **right** is
brought to the front; `‹` does the opposite. Each press advances exactly one book in the books' real order around the orbit; it wraps after four.

**Motion lifecycle (one controller, in the existing state machine).** `SpinModel` (orrery-motion.ts) gained two phases:

```
free / inertia / snapping / dwell --arrow--> steering --(turn ends)--> held
held --arrow--> steering (one more book)      steering --arrow--> steering (re-planned, one more book)
held | steering --grab (drag / press on open space)--> grabbed --> (existing fling/snap/dwell/free)
held | steering --crystal click--> free (the crystal's own preview takes over)
```

- *Which book*: from any free-running phase the target is the **next book to arrive at the front** in the arrow's direction
  (`nextArrival`); a book already within 20° of the front is skipped, so the first press from idle is always a visible turn (20°–110°).
  While steering or held, each press adds exactly one quarter turn to the planned target, so rapid presses are counted exactly, never dropped
  or doubled, and opposite presses cancel cleanly. No timers, no completion callbacks: nothing can go stale.
- *How it moves*: a cubic Hermite from the orbit's **current position and angular velocity** to the target with zero end velocity
  (accelerate, glide, decelerate); ~1.2 s a quarter turn, up to 2.2 s for several queued steps. Taking over a fling or a snap keeps position
  and speed continuous; the start slope is bounded so the turn can never overshoot its target or reverse unexpectedly.
- *Foreground*: the selected book comes to rest **in the orbit** at front-centre (angle 90°), directly beneath the crystal — the whole orbit
  turns, all four books keep their relative positions, depth and scale. It is lit and on top, but grows only 4 % (not the hover 14 %) so it
  does not climb over the lens. It is **held**: the idle orbit does not resume and carry it away. Releasing is intentional: a drag of the orbit,
  a press on open space, or using the crystal.
- *Reduced motion*: the orbit is placed at the selection at once; no loop runs. *Phones* (no orbit): the arrows step the preview round the
  composed ring clockwise (right) / anticlockwise (left); the chosen book is lit and grows slightly with a 300 ms transform transition;
  nothing moves away from the finger.

**One preview, two sources.** `useCoreNavigator` keeps a single `pinned` destination plus `pinSource: "crystal" | "selector"`. The arrows
set it (`select`), so the crystal projection, its tint and tempo, the bearing needle, the tether, Mogzy's line and the screen-reader readout
all show the selected book. The crystal still only cycles previews and never navigates; its cycle continues from whatever is previewed
(after an arrow selected Leaguecraft, the crystal shows Pro Play next) and it releases the arrow hold first (the crystal-pinned book then
rests beside the lens, as before). Only crystal pins pull a book out of the orbit; selector pins never do. Hover and keyboard focus are
temporary emphasis layered on top: one emphasised book at a time, and the selection comes back when they leave. The arrows never navigate;
books still navigate with the 240 ms activation, modified clicks, prefetch (an arrow selection also prefetches its room) and analytics unchanged.

### Change 2 — a larger crystal inside the same Core

`AcademyCoreInstrument` gained one optional prop, `lensScale` (default **0.78**, the V3 value — production unchanged). V3.5 passes
**0.96** (`V35_LENS_SCALE`, OrreryCore.tsx). Everything in the crystal assembly — lens plate, facets, inner hexagon, glow, all four projections,
their clip paths, and the iris blades and rim — is authored in the lens's local space under that one transform, so it scales as one
coherent unit with no clipping or misalignment. Geometry (viewBox units): lens radius 92 → **113** (+23 % across, +51 % area), now filling
the dial's dark enamel band up to its edge (r 118); the iris rim sits at r ≈ 117–120, clear of the scale ticks (r 128+); the bezel (r 150),
ticks, rings, gyroscopes, orbit and the whole 640-unit Core are unchanged. The crystal button's hit area is resized to match the lens
(40 % → 49.2 % of the instrument), and the inner energy is a little brighter (glow opacity 0.55 → 0.75, a soft accent glow on the inner hexagon) —
V3.5-scoped CSS only. Measured at 1366×768: lens 178.8 px → **220.0 px** wide in the same 446.75 px instrument (ratio 0.400 → 0.493).

Consequence (accepted, tested): a near-side book passing front-centre — including the selector's held book — now overlaps the **bottom rim**
of the larger lens by up to ~25 stage units. It never reaches the projection art or the lens centre (unit-tested over the whole orbit), and the
crystal remains clickable everywhere above it.

### Files

`orrery-motion.ts` (selector phases, `nextArrival`, `steerDuration`, `hermite`), `OrreryEngine.ts` (`steer`, `releaseSelection`, `selected`,
smaller held emphasis, `data-spin` on the stage for inspection/tests), `useCoreNavigator.ts` (`pinSource`, `select`, `clearSelection`),
`AcademyCoreV35Page.tsx` (arrows, crystal/drag release wiring, phone ring), `OrreryCore.tsx` (`V35_LENS_SCALE`), `academy-core-v35.css`
(selector, crystal hit area/glow, phone transition), shared `src/pages/academy-core/AcademyCoreInstrument.tsx` (+`lensScale` prop, 9 lines),
tests: `orrery-motion.test.ts`, `OrreryEngine.test.ts`, `AcademyCoreV35Page.test.tsx`, new `AcademyCoreInstrument.lens.test.tsx`, `e2e/academy-core-v35.spec.ts`.

### Tests

| Suite | Result |
|---|---|
| vitest: V3.5 (`orrery-motion` 39, `OrreryEngine` 7, page 39) + V3 (`AcademyCorePage` 32, route 9, warm 5, **lens 2**) + `route-prefetch` 7 | **140 / 140** |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` (Chromium) | **46 / 46** (32 previous + 14 new) |
| `tsc -p tsconfig.app.json` | only the 2 pre-existing baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| `eslint` on changed files | 0 errors; 1 pre-existing warning (`react-refresh/only-export-components`, `AcademyCoreInstrument.tsx:55`, the existing `BOOK_SLOTS` export) |

New coverage — selector: exactly two buttons, no visible text, names, ≥ 44 px, unobstructed, beneath the Core; right advances one book per press
in orbit order and wraps after four, left reverses; all four (including a back-facing book) reach the front; the whole orbit turns together;
the held book is front-centre, still for 3 s, on top, and one click navigates; rapid presses count exactly; takes over a fling and a snap;
a drag releases the hold and the orbit resumes; the crystal projects the selection and its own cycle continues from it; Enter/Space and focus
ring; reduced motion places at once; phones 390 / 320 step clockwise without orbiting. Crystal: lens/instrument 0.48–0.51 (was 0.400), Core,
rings and dial unchanged; iris, hit area and all four projections centred and inside the lens; `/lol` keeps the V3 ratio (0.192).
Unit: turns preserve relative positions exactly, monotone with no overshoot, continuity on take-over, single controller, reduced-motion placement.

Not new failures but fixed test design along the way: two Phase 2 tests relied on wall-clock timing / a stationary pointer and became flaky
under load; they now wait on the engine's `data-spin` phase and park the pointer. A "books stopped moving" heuristic misfired on cold pages
(frames can stall for a few hundred ms), which is why `data-spin` exists. No console errors were seen in the browser probes.

### Performance (measured, same harness, A/B against `b2518371` served side by side)

Headless Edge, 1366×768, CDP main-thread busy / style recalc over 6 s idle, alternating before/after:

| | before (b2518371) | after |
|---|---|---|
| full, steady pairs | 38.0 % / 34.3 % | 35.3 % / 35.0 % |
| lite | 28.7 % | 30.1 % |
| full, 390×844 | 24.5 % | 27.6 % |

All runs held the display rate (75 Hz in this session, rAF p95 13.4 ms). Differences are within run-to-run noise (±3 points); I see no
measurable regression. (These absolute numbers are higher than Phase 2's because this session ran at 75 Hz rather than 60 Hz: more frames
per second. Compare within a table only.) Not measured on real GPU hardware.

**Recording caveat found while doing this:** Playwright's bundled headless Chromium renders this scene at **~8 fps while recording** on this
machine (Edge: ~70 fps), and the engine caps a frame step at 50 ms, so recordings made in it show the motion slowed and choppy. The new
recording was made in Edge (`V35_EVIDENCE_CHANNEL=msedge`). The earlier Phase 1 and Phase 2 recordings were made with the bundled Chromium
and therefore **understate the real speed and smoothness**; they were not re-recorded (out of scope).

### Evidence (`docs/handoffs/academy-core-v35/`, real art)

- `orrery-selector-and-crystal.webm` — 32 s, 1366×768, Edge: idle orbit → `›` (whole orbit turns, book held) → `›` → `‹` (reverses) → a
  back-facing book brought round (two steps, the second mid-turn) → three rapid `›` → the enlarged crystal cycling all four projections →
  `›` then a click on the selected book → its room (Pro Play). A white ring marks the pointer.
- `selector-desktop-1366x768-idle.png`, `selector-desktop-1366x768-selected.png`, `selector-desktop-1920x1080-selected.png`
- `selector-mobile-390x844-stage.png`, `selector-mobile-390x844-full.png`
- `crystal-before-after.png` — identical framing (1366×768, reduced motion so books and rings hold still, 380 px crop on the instrument),
  before = `b2518371`, after = this change, for idle and all four projections.

### Outstanding / for the owner

1. The held book overlaps the bottom rim of the larger lens (see Change 2). If you want a clean gap, the options are a slightly smaller lens
   (0.90 gives ~+15 % instead of +23 %) or holding the selected book a little lower — your call; neither was done unasked.
2. On phones the arrows sit under the composed books (there is no room beneath the Core between the tiers without redesigning the layout).
3. Hover / keyboard on another book temporarily shows that book while the selection stays held — this is deliberate; say if you would rather a
   focused book become the selection.
4. Still Chromium/Edge only; no real-GPU numbers; Phase 1/2 recordings understate motion (above).

### Next recommended work (not started)

Owner review of these two changes; then Phase 3 as previously proposed (integration plan), sound only with your go-ahead on the shared audio registry.

---

## P2. Phase 2 — advanced interaction polish

Scope was handoff §7 items 2, 3 and 5 (items 1 and 6 had nothing to fix / need the owner; item 4 is deferred, see below).

| Item | What changed |
|---|---|
| **Drag-to-spin** | Grab the orbit from **empty space** (never from a book, link or the crystal, so every click contract is untouched). The orbit follows the pointer; a fast release **flings** (inertia, capped at ~1.7 rad/s); the books then **settle onto the nearest symmetric composition** (the four corners: none behind the dial), **pause 1.8 s**, and the slow orbit resumes. A slow release is a nudge (no inertia, no snap). A hovered book damps the coast quickly and cancels the snap, so a book never slides out from under a resting cursor. `cursor: grab / grabbing`; `touch-action: pan-y` so vertical touch still scrolls. Off under reduced motion and in the phone layout. State machine = `SpinModel` in `orrery-motion.ts` (pure, tested); the engine owns the pointer API (`grab` / `dragBy` / `release`). |
| **Richer focus** | (a) The focused cover **swings open on its spine** (3D, −24°) and **light spills from its pages** (accent-coloured `pagelight`). (b) The Core's rings and comets change **tempo per room** (Measure ×2.5 races, Observe ×1.3, Inquiry ×1.6, Strata ×0.65 slow), eased through `Animation.playbackRate`, no restart. (c) The attended **comet takes the room's colour**. (d) The lit tether is a **beam** (double glow). (e) **Activation camera push**: the scene scales 4 % toward the Core for the 240 ms. |
| **Keyboard** | **Arrow keys** step focus through the books (wrapping), on top of Tab; modified arrows and other controls are untouched. Fixed a bug found while capturing: moving keyboard focus between books left the *previous* book emphasised behind the new one (blur's release was cancelled by the next focus in the same tick); now each focus clears the other channel. A unit test fails without the fix. |
| **Performance** | (a) **Quality tiers**: `?quality=lite|full` (forced, never overridden), else Save-Data / ≤2 cores / ≤2 GB → lite, else full; and a **frame-rate monitor** drops a full scene to lite once if ≥150 frames after warm-up exceed 30 ms. Lite keeps the orbit, books, dial, first comet/gyro/ring set, tethers, Patch Report; it drops fragments, twinkle, extra comets/gyro rings/rune ring, sparks, one aurora, two shafts and the glow filters. (b) Every CSS animation in the Core, environment and Patch Report is **paused when the stage is off screen / the tab is hidden** (`data-ambient=off`). |
| **Sound** | **Deferred, deliberately.** The only way to add orbit / focus cues is to extend the shared audio registry and renderers (`sfx-registry.ts`, `sfx-renderers.ts`), which are used by the whole app and have per-cue user settings. That is a cross-cutting change that needs your go-ahead, not a preview-only one. V3's `hub.destination.focus` and `bookRuffle` cues are reused as before. |

### Phase 2 verification

| Suite | Result |
|---|---|
| `vitest src/pages/dev/academy-core-v35` | **63 / 63** (28 motion-maths incl. 6 for the spin state machine; 5 engine tests: drag API, frame-rate monitor, tempo ramp; 30 rendered-page tests incl. drag, arrow keys, quality tiers, the focus bug) |
| `playwright … e2e/academy-core-v35.spec.ts --grep-invert evidence` | **32 / 32** (22 Phase 1 + 10 Phase 2: drag → coast → symmetric snap → dwell → resume; click-after-drag; cursor; reduced motion; ring tempo; cover swing + page light + comet colour; arrow keys; lite tier; **auto-degrade under a 40 ms/frame main-thread hog**; forced `full` never degrades) |
| V3 regression `vitest src/pages/academy-core src/lib/route-prefetch.test.ts` | 53 / 53 (run at the end of Phase 1; no V3 file touched in Phase 2) |
| `eslint` on the new files | clean |

Two e2e assertions were load-sensitive and were made robust rather than loosened blindly: total orbit travel (≈1,300 px / 9 s on an idle machine; the loop slows with frame rate, so the floor is 450 px) and "the books pass each other" (now watches until they have, up to ~35 s). Locator clicks cannot be used on orbiting targets (Playwright waits for them to hold still), so the tests aim by coordinates or at a point proven to hit the book.

Performance, same harness as Phase 1 (headless Chromium, software compositing, 1366×768, main-thread busy / style recalc, 60 fps held in every case):

| | busy | style |
|---|---|---|
| V3 `/lol` | 7.4–7.9 % | 1.8–2.0 % |
| V3.5 **full** | 24–27 % | 9–11 % |
| V3.5 **lite** | 18–20 % (15 % in a quieter run) | 6 % |
| V3.5 full / lite, phone | 17 % / 14 % | 8 % / 5 % |

(The machine was busier than in Phase 1, so the V3 baseline also read higher; the ratio is what to compare: full ≈ 3.3× V3, lite ≈ 2.4×.) Ablating the lite tier moved the number by ≤ 2 points per item (books' glow filters, Patch Report animation, instrument internals): the remaining cost is spread thin, not one hotspot. Not measured on real GPUs or low-end devices: the quality monitor exists because that cannot be known from here.

Evidence added (`docs/handoffs/academy-core-v35/`): `orrery-phase2-interaction.webm` (38 s: idle, fling right → coast → snap → dwell → resume, fling left, hover with cover swing and beam, crystal through all four rooms with tempo changes, keyboard arrow + Enter with the camera push), `phase2-1366x768-{fling-midcoast,snapped,hover-cover-crack,crystal-measure,keyboard-focus,lite}.png`.

### Phase 2 known issues / owner questions

1. The cover swing and page light are **subtle** at 1366 wide (a thin lit edge on the right of the focused cover). Easy to push further (angle, glow); I held back so it does not fight the crystal. Your call.
2. **Fling feel** (max speed, coast length, 1.8 s dwell, snap stiffness) is tuned by reasoning and a handful of recordings, not by hands-on play. Constants are at the top of the drag section of `orrery-motion.ts`.
3. A book can still slide under a *resting* cursor during a fling; hovering damps the coast within ~0.3 s and holds it there. If you would rather the orbit never stop for a passing book, say so.
4. The front-right focus pose now sometimes overlaps Mogzy's bubble (bubble is on top, not clickable): shift the pose or Mogzy.
5. Sound is deferred (above). Lite tier visuals have not been reviewed by you; `?quality=lite` shows them.
6. Still Chromium-only; still no real-GPU numbers; the integration items (§7.6) are untouched.

### Phase 3 candidates (not started)

Integration plan (swap `/lol` to the orrery via `useCoreNavigator`, `bare` instrument prop, Layout full-bleed, restore `hub_entered`, delete the V3 chassis, Firefox/WebKit runs, release and rollback notes); sound design if you approve touching the shared audio registry; real-device performance pass; tuning from your hands-on notes.

---

# Phase 1 (approved)

> Phase 1 status at the time: STOPPED FOR OWNER VISUAL REVIEW; approved ("the look and motion work").

## 1. Objective

Turn the V3 Four-Book Hextech Navigator (a pentagon chassis with four recessed book slots on a bench) into a much more
ambitious, animated, interactive scene: a large living Hextech Core floating in open magical space, the four real
champion-art books orbiting it, a floating Patch Report, and a deliberately composed (not orbiting) phone layout —
while preserving every V3 interaction contract and reusing V3's books, crystal, data, routing, Mogzy, Patch Report and audio.

## 2. What was built

| Brief item | Result |
|---|---|
| 1. Open atmospheric composition | Full-bleed deep-navy sky, violet / blue / gold haze, three light shafts, two parallax star fields, ten drifting Hextech fragments, vignette. No wall, pilasters, lamp or bench. |
| 2. No chassis, slots, clips, arms, floor | None of `.acore-chassis`, `.acore-cradle*`, `.acore-arm`, `.acore-room*`, `.acore-books-mounted` exist in the DOM (asserted). The compact instrument still *emits* four fixed-angle `.acore-channel` stub elements and the bezel cursor; both are `display:none` in the V3.5 sheet (asserted by reading the CSS). See §6. |
| 3. Significantly larger living Core | Dial ≈ 1.4× the V3 dial at 1366×768 (≈ 305 px across vs ≈ 220 px) with the ring assembly reaching ≈ 640 px, i.e. ~2.9× the dial's width and most of the stage's height. Layered: breathing halo ×2, periodic + per-focus shockwave, flat tick ring, counter-rotating rune ring, three comet arcs of flowing energy, **three gyroscopic rings in real CSS 3D** (they cross in front of and behind the crystal), a bearing needle that points at the book the Core is attending to, a curved `MODE · …` readout. |
| 4. Four genuinely orbiting books | `orrery-motion.ts` / `OrreryEngine.ts`. Each book rides an elliptical orbit (period 50 s) with depth-scaled size, depth-ordered stacking (far books pass *behind* the Core, near books *in front*), a few degrees of yaw toward the Core, always upright. Independent levitation per book (`translate` + `rotate` keyframes, four different periods). Faint dashed orbit path + orbital plane glow, and an energy **tether** from the Core to each book (lit and flowing for the attended one). |
| 5. Working navigation, hover and focus | Same `<Link>`s, hrefs and aria names as V3. **Hover** emphasises the book *in place* (grows, top of stack, others dim, orbit eases to 3.5 % speed, tether lights, crystal projects the room, Mogzy reacts) — it never runs from the pointer. **Keyboard focus and the crystal's pinned preview** have no pointer to lose, so that book is brought toward the viewer to a resting place beside the crystal. |
| 6. Floating Patch Report | The real `AcademyBroadcastCenterpiece` + radio, untouched, now levitating (7.5 s, slight 3D tilt) with a halo, a cast glow, a slowly turning rune circle beneath and rising sparks. Daily / Ranked and the Academy heading sit as floating lettering and rune-pills in the same space. |
| 7. Considered mobile presentation | No orbit. Two staggered tiers of floating books around a smaller Core (same rings), limited levitation, tap-to-focus, 44 px+ targets down to 320 px, Mogzy in the gutter, Patch Report floating below. |

## 3. Decisions (and why)

1. **Pose engine, not CSS 3D, for the books.** Positions come from one rAF loop writing `transform` onto four elements. That is what makes
   "stabilise under the cursor, then resume" and "bring the keyboard-focused book forward" possible; a pure-CSS orbit can only pause. React never
   re-renders for motion (page state changes only on focus).
2. **Pointer vs keyboard are separate.** A book under the cursor stays put (emphasis in place). Only books with no pointer on them travel to the
   front composition. This is the answer to the brief's "avoid pointer-chasing / hard-to-click movement".
3. **Real 3D for the gyro rings only.** Depth-sorting rings against the flat crystal is exactly what CSS `preserve-3d` is good at; it is free of JS.
4. **Design units + one `--u`.** The stage is 960×700 units (360×640 on phones); `.o35-stage` is a size container and `--u` is derived from it
   in CSS. No ancestor `transform: scale()` (it softens the books' text). Books are laid out at their largest drawn size and only ever scaled *down*
   or by the small emphasis growth, so text stays crisp.
5. **Far books go behind the Core.** This is the orrery. Consequence: a far book is partly hidden behind the dial for part of each revolution (§6).
   A circular `dial-block` absorbs pointer events over the dial disc only, so books are reachable everywhere the Core does not cover them.
6. **Compact V3 instrument reused as-is** (crystal, iris, bezel, all four projections, `focus`/`activating`/`media` props). Its fixed-angle bezel
   cursor is hidden and replaced by an engine-driven needle, because per-channel angles are meaningless when the books move.
7. **V3 logic lifted, V3 page untouched.** `useCoreNavigator` is the V3 page's focus / 240 ms activation / crystal-cycle logic as a hook
   (plus the pointer/keyboard split). It duplicates ~100 lines of `AcademyCoreHome` on purpose, to keep `/lol` byte-identical; Phase 2 should
   make the production page use the hook.
8. **Dev preview emits no `hub_entered`** (it would count looks at the preview as Landing→Hub conversions). `noindex`. One line to restore at integration.

## 4. Files

New (all under `src/pages/dev/academy-core-v35/` unless noted):

| File | Role |
|---|---|
| `AcademyCoreV35Page.tsx` | The page: composition, data hooks (as V3), engine wiring, two layouts. |
| `orrery-motion.ts` | Pure orbit mathematics: poses, depth, stacking, front composition, phone composition, easing, tether paths. |
| `OrreryEngine.ts` | The rAF controller (writes transforms, tether paths, needle, parallax; pauses off-screen / hidden tab / reduced motion). |
| `useCoreNavigator.ts` | V3 focus / activation / crystal-cycle behaviour, lifted into a hook. |
| `OrreryCore.tsx` | The enlarged Core around the unchanged V3 `AcademyCoreInstrument` (compact). |
| `OrreryEnvironment.tsx` | The open-space backdrop (memoised, aria-hidden, deterministic star field). |
| `academy-core-v35.css` | All presentation, scoped `.o35-`; loaded after the V3 sheet. |
| `orrery-motion.test.ts`, `AcademyCoreV35Page.test.tsx` | 43 unit / component tests. |
| `e2e/academy-core-v35.spec.ts` | 22 real-browser tests + an opt-in evidence suite. |
| `docs/handoffs/academy-core-v35/` | Evidence (below). |

Changed: `src/App.tsx` (+12 lines): a `import.meta.env.DEV`-gated lazy import and route for `/lol/dev/academy-core-v35` (and `/dev/…` redirect), the same pattern as
the other dev previews. **No other existing file is modified.** Reused unchanged: `academy-core-destinations`, `AcademyCoreInstrument`, `MogzyOperator`,
`academy-core-warm`, `academy-core.css`, `AcademyHubBook`, `AcademyBroadcastCenterpiece`, all data hooks.

## 5. Verification

### Motion is measured, not assumed

Positions of the four book wrappers sampled from a real browser (1366×768, idle, centres in px):

```
t=0   leaguecraft [1013,567]  pro-play [550,481]  combat-lab [745,280]  archives [1207,365]
t=3   leaguecraft [ 900,577]  pro-play [523,429]  combat-lab [856,265]  archives [1231,410]
t=6   leaguecraft [ 783,566]  pro-play [535,377]  combat-lab [971,270]  archives [1220,461]
t=9   leaguecraft [ 678,546]  pro-play [584,335]  combat-lab [1077,295]  archives [1173,509]
```

(≈ 35–50 px/s; widths change 125→170 px with depth.) The e2e suite asserts, over 9 s: every book travels > 100 px and the four together > 800 px, at least two books visibly
change apparent size, and the left-to-right order of the books changes. A further test asserts near books have a higher z-index than the Core and far books a lower one.
Hovered, the same book drifts < 25 px over 1.2 s and grows ≥ 6 %; the *other* books' travel falls below 30 % of free-orbit travel and recovers (> 2.5×) after the pointer leaves.

### Tests run

| Suite | Result |
|---|---|
| `vitest src/pages/dev/academy-core-v35` | **43 / 43** (22 orbit-maths properties + 21 rendered-page tests: contracts, structure, engine over fake time, reduced motion, phone layout) |
| V3 regression: `vitest src/pages/academy-core src/lib/route-prefetch.test.ts` | **53 / 53** (V3 untouched) |
| `playwright -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts --grep-invert evidence` | **22 / 22** (Chromium) |
| `eslint` on the new files | clean |
| `tsc -p tsconfig.app.json` | only the 2 pre-existing baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`), same as `origin/main` |

The e2e suite also covers: the V3 240 ms activation measured in-page (200–350 ms, then navigation); modified clicks left to the browser; keyboard Tab + focus ring + Enter;
the crystal cycling without navigating and the chosen book coming forward; reduced motion (zero running animations, books static, navigation immediate); phones at 390/320/430
(no overflow, no orbit, ≥ 44 px targets, Patch Report below); touch tap; **every control hit-testable** (this caught a real bug: the decorative Patch Report halo was intercepting
clicks on Ranked — fixed with `pointer-events:none`); `/lol` is still the V3 Core.

### Performance (honest numbers)

Measured over 6 s of idle in headless Chromium (software compositing), 1366×768, CDP `Performance.getMetrics`, V3 `/lol` vs V3.5 in the same harness:

| | main-thread busy | style recalc | script | rAF median / p95 |
|---|---|---|---|---|
| V3 `/lol` | 5.5–6.8 % | 1.2–1.5 % | ~0 % | 16.7 / 16.8 ms |
| **V3.5** | **17–19 %** | 6.8–7.1 % | 0.6–0.8 % | **16.7 / 16.8 ms** (60 fps held) |
| V3.5 mobile (390×844) | ~11 % | ~5 % | ~0 % | 16.7 / 16.8 ms |
| V3 mobile | 5.5 % | 1.5 % | ~0 % | 16.7 / 16.8 ms |

V3.5 costs roughly three times V3 on the main thread; it does not drop frames. A first build measured 21–24 %; one inherited custom property written per frame
(forcing subtree style recalcs) and SVG-group twinkle (whole-sky repaints) were found by ablation and fixed. With every CSS animation disabled the scene is ~10 %, so about
7 points are the ~80 compositor animations in aggregate (no single one dominates: each ablation moved the number by < 1 point). Not measured: real GPU hardware, a throttled laptop,
battery. Treat the numbers as relative, and see §7 for the Phase 2 levers.

### Evidence (`docs/handoffs/academy-core-v35/`, real champion splash art from the asset host)

- `orrery-motion-desktop.webm` — **29 s, 1366×768**: 7 s idle orbit, hover of Leaguecraft then Pro Play (needle, tether, projection, Mogzy), the crystal previewing all four rooms with
  each chosen book coming forward, then a click on Combat Simulation → 240 ms activation → navigation to Combat Lab. A white ring marks the pointer (headless capture has no cursor).
- `desktop-1366x768-orbit-t00s … t18s.png` — four stills six seconds apart (the books in four different places).
- `desktop-{1366x768,1920x1080,1280x660}-idle.png`, `desktop-1366x768-hover-{leaguecraft,pro-play}.png`, `desktop-1366x768-crystal-{leaguecraft,pro-play,combat-lab,archives}.png`.
- `mobile-{390x844,320x568,430x932}-{top,full}.png`, `mobile-390x844-crystal-preview.png`.

Regenerate: `V35_EVIDENCE=1 npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts -g evidence` (the recording lands in `_video/raw.webm` with a `meta.json`
of the ready / end offsets; the committed file is that clip trimmed and re-encoded with Playwright's bundled ffmpeg).

## 6. Known issues and honest limits

1. **Far books pass behind the Core.** Each book is partly hidden for roughly a fifth of every revolution (a hovered far book pops in front of the Core while hovered). Intended for an orrery, but it is
   the first thing I would ask you about (§8).
2. **Instrument DOM residue.** `AcademyCoreInstrument` compact still renders four `.acore-channel` stubs and the bezel cursor (hidden by CSS). Phase 2: a `bare` prop on the instrument.
3. **Performance cost** (above): 60 fps held in a software-rendered headless browser; ~3× V3's main-thread time; not measured on real GPUs or low-end devices.
4. **Chromium only.** Not run in Firefox / WebKit. Uses `translate`/`rotate` keyframes, `color-mix()`, `@property`, CSS masks and `preserve-3d`; all current in Firefox/Safari but unverified here (V3's Firefox config exists: `playwright.academy-core.config.ts`).
5. **Full-bleed hack.** `<main>` is capped at 1280 px by the shell; the preview breaks out with `width:100vw` and `html:has(.o35-root){overflow-x:clip}`. Fine for a dev route; production should opt the page out in `Layout`.
6. **1024–1180 px wide desktops** get a smaller orrery (scale ≈ 0.65–0.8; books ~125–150 px, text still legible) because the Patch Report column is fixed.
7. **Preview-only deviations from V3:** no `hub_entered`, `noindex`. Daily status with a *real* authenticated session remains unverified (as in V3).
8. **Mobile bubble.** When a room is previewed on a phone Mogzy's bubble overlays the right of the Core for as long as the preview is pinned (hidden at idle).
9. **Behaviour suite uses stubbed (icon) art**; the evidence set uses real art. `/lol` was verified unchanged by test, not by build: I did not run a production build.
10. Support books are dimmed while one is focused (opacity 0.66); their titles are less crisp then. Tunable.

## 7. Next phase (advanced interaction polish — not started)

Candidates, in the order I would take them, once you have judged the look and motion:
1. Fix whatever the visual review rejects (speed, depth range, Core ring density, support dimming, how far books hide behind the dial).
2. Direct manipulation: drag-to-spin with inertia and snap, scroll / wheel nudge, pointer-led parallax tuning.
3. Richer focus choreography: book "opens a crack" on hover, Core ring tempo and tint per room, a light beam to the focused book, optional gentle camera push on activation.
4. Sound design for orbit and focus (V3 cues are reused today).
5. Performance pass: pause off-screen environment groups, one pre-composed backdrop, adaptive quality tier, measure on real hardware.
6. Integration plan: make `/lol` use `useCoreNavigator` and the orrery, `bare` instrument prop, Layout full-bleed, restore `hub_entered`, delete the V3 chassis, Firefox/WebKit runs, release notes / rollback (route swap).

## 8. Questions for the owner

1. Is the 50 s orbit period right, or should it be slower / livelier?
2. Are books passing **behind** the Core acceptable, or should every book always stay in front of / beside it?
3. Is the Core now the focal point enough (ring density, glow), or too busy?
4. Patch Report: keep it as a floating artifact in a left column, or integrate it into the orbit space more (e.g. closer to the Core)?
5. Phone: composed floating arrangement (current), or a very slow, small-amplitude drift as well?

## 9. Run it (Phase 1; historical — the route is now `/lol`, the code `src/pages/academy-core/`)

```bash
cd <worktree>            # C:\Users\mlmit\mogzy-wt\acore-v35
node node_modules/vite/bin/vite.js --port 5352 --strictPort
# open http://localhost:5352/lol/dev/academy-core-v35   (desktop width ≥ 1024 for the orbit; narrower for the phone composition)
npx vitest run src/pages/dev/academy-core-v35
npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts --grep-invert evidence
```

## 10. Guarantees (Phase 1; historical — see §P3 for the production integration)

- Production `/lol` is unchanged: the only edit to an existing file is `src/App.tsx` (+12 lines, DEV-gated, identical in form to the other dev previews); the route does not exist in a production build.
- No backend / Supabase / Railway changes. No PR, merge or deploy. Only the V3.5 branch is pushed.
- Reused unchanged: destinations and routes, the 240 ms activation, crystal cycling, modified-click behaviour, reduced-motion handling, Mogzy dialogue and reactions, Patch Report and radio, Daily / Ranked shortcuts, analytics for the book doors, image warm-up and prefetch.
