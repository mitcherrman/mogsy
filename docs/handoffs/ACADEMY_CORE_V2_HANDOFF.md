# Academy Core V2 — Hextech Workshop refinement — Handoff

**Status:** built, tested, measured; **waiting for the owner's visual acceptance**. Nothing merged, deployed or changed in production; `/lol` is not replaced.

| | |
|---|---|
| Branch | `design/academy-core-v1` (worktree `.worktrees/academy-core-v1`), continued from V1 |
| Base | `origin/main` @ `7be45341` (V1 base). `origin/main` is now `fe2c3503`, 124 commits on — see "Integration risk" |
| Head | see `git log -1 design/academy-core-v1` |
| Preview route | **`/lol/dev/academy-core`**, alias **`/dev/academy-core`** |
| Run locally | `npx vite --host 127.0.0.1 --port 8125` from the worktree, open `http://127.0.0.1:8125/dev/academy-core` |
| V1 handoff | `docs/handoffs/ACADEMY_CORE_V1_HANDOFF.md` (architecture and contracts, unchanged) |

## What changed since V1 (before / after)

| | V1 | V2 |
|---|---|---|
| Scene | console text left, instrument floating right on flat black | one workshop: navy wall with pilasters, a brass-edged bench both instruments stand on, a warm lamp over console + book, Hextech spill from the Core |
| Patch Report | a rectangular "Academy Broadcast" link plate | the **real `AcademyBroadcastCenterpiece`** — live Patch Brief pages, icons, "Read full report", and the Academy Radio dock — standing on the bench under Daily / Ranked (desktop); the **existing mobile variant** below the four rooms (phones) |
| Aperture | flat radial "lens" | a **faceted Hextech crystal** behind the six-blade iris, re-tinted per room, with a halo through the aperture |
| Materials | single-tone metal, thin strokes | bevelled chassis with base plate and feet, brushed bezel with rivets and bevel light/shadow, deep-blue enamel band with gold hairlines, drop shadows, a Hextech reflection on the body |
| Projections | abstract glyphs only | **real League media**: Ryze under a brass magnifier (INQUIRY), stat shards on the caliper jaws + a range arc (MEASURE), the live patch's champion icons on the strata with the patch label (STRATA), Ahri tracked by the reticle with the five role marks (OBSERVE) |
| Mogzy | a 110 px peeking plate hidden behind the chassis | **at the controls**: 512 px rest plate beside the Core facing it, a pose per room (holding book / raising hand / explaining / peeking — the existing compact plates), a parchment bubble with the one-line preview, idle bob, a hop on change |
| Loading | book list query only; no warm | page-scoped warm in the PERF1 convention; projections only after the critical art; no Hall-only art requested |
| Commons link | landed on the Hall | **lands on the Commons** (hash-gated effect in the Hall) |

Evidence: `docs/handoffs/academy-core-v1/*.png` (before) and `docs/handoffs/academy-core-v2/*.png` (after), same viewports and states.

## Decisions

- **Book placement.** Under the actions in the console column, width `clamp(272px, 24vw, 380px)` — the same 200–380 px band the Hall gives it, so its page typography (sized in container units) stays at the approved legibility. The component's layout box is the drawn painting with its intrinsic size declared, so the height is reserved before a byte arrives. The hero is `min-height`, so on short desktops (≤ 720 px tall) the console grows and the page scrolls; the book is never shrunk below 272 px and never overlaps the stage (asserted in e2e at 1280×660).
- **One feed, two consumers.** `usePatchBriefFeed()` (the Hall's own hook, shared query keys and cache) feeds both the book and the Archives projection, so the strata icons are URLs the book has already requested — no second patch read.
- **Projection media** comes from existing infrastructure only: `championAssetsQuery` + `getChampionIcon` for Ryze / Ahri (the Hall's cover champions for those rooms, from `HUB_BOOK_COVER_CHAMPION`), the Patch Brief entries, `/public/assets/journey/mogzy-stat-shards/*.png` (2–3 KB), `/public/assets/ranked/mogzy-role-icons/*.svg` (< 1.5 KB). No new assets were made.
- **Mogzy** uses the existing `MogzyArtScale` encodes: `base` medium (512, the Landing / Hall file, so usually cached) at rest; the four compact 192 px derivatives for reactions, drawn ≤ 170 CSS px. The full guide substrate was not mounted (its bubble/placement model is built for the Hall's lanes); the operator's bubble is decorative and the same sentence reaches AT through `aria-describedby`.
- **Warm (`academy-core-warm.ts`).** A twin of `warmAcademyHub`, deliberately separate: the Hall's warm fetches the library painting, the book frame and the phone spine — the old four-book assets the Core does not draw. Order: manifest via the app's one query definition → Mogzy 512 + (desktop) book at **high** priority → after they settle: the four poses, shards, roles, the phone book (low), the two manifest icons, the four destination chunks at idle. Idempotent, never awaited by a render. **Production step (not done):** when the Core replaces `/lol`, the Landing's hand-off must call this warm instead of `warmAcademyHub`, and the Hall's list retires.
- **Commons deep link.** The Hall now honours `#academy-commons` once on mount through its own `navigateHubFold("commons")` (reduced motion jumps; phones use the authored pager). It is gated on a hash nothing in production emits, so every other `/lol` visit is behaviourally identical; `LolHub.commonsHash.test.tsx` asserts both. **This is the one production-file edit in V2 and needs your approval**; reverting it is one commit and the Core's link would again land on the Hall.
- **Motion budget.** Springs re-tuned to settle in ≈ 450–550 ms (brief: 400–650), CSS state transitions 300–600 ms, Mogzy hop 480 ms. Idle: lens breathe 7 s, idle sweep 40 s, caret blink, Mogzy bob 4.2 s — all paused when the stage leaves the viewport or under reduced motion (OS or in-app). Navigation is never held for any of it.

## Integration risk (origin/main advanced to `fe2c3503`)

Checked with `git merge-tree` (no files written): one textual conflict in `src/components/Layout.tsx` (both sides appended to the full-bleed list — trivial), `src/App.tsx` auto-merges, and none of the Core's dependencies moved (`LolHub.tsx`, broadcast components, `academy-hub-warm.ts`, mascot assets, `daily-challenge/run/entry.ts`, `hub-guide.ts`, `route-prefetch.ts` are byte-identical to the V1 base). `Quiz.tsx` gained a Role Challenge mode (RC8) and still reads `play=1` through `openPlayOnMount`, so the Ranked contract holds. The worktree was **not** merged or rebased, per the brief.

## Files

| File | Change |
|---|---|
| `src/pages/dev/academy-core/AcademyCoreInstrument.tsx` | V2 materials, crystal, projections with `CoreMedia`; same geometry and motion system |
| `src/pages/dev/academy-core/AcademyCorePage.tsx` | workshop composition, real book (desktop + mobile), warm, projection media, Mogzy operator |
| `src/pages/dev/academy-core/MogzyOperator.tsx` | **new** — Mogzy at the controls |
| `src/pages/dev/academy-core/academy-core-warm.ts` | **new** — page-scoped warm (PERF1 convention) |
| `src/pages/dev/academy-core/academy-core.css` | V2 styles (room, bench, book, operator, instrument materials) |
| `src/pages/dev/academy-core/academy-core-destinations.ts` | unchanged |
| `src/pages/LolHub.tsx` | +1 effect: `#academy-commons` honoured on mount (**production file**) |
| `src/pages/LolHub.commonsHash.test.tsx` | **new** |
| `src/pages/dev/academy-core/AcademyCorePage.test.tsx`, `academyCoreWarm.test.ts` (new), `academyCoreRoute.test.ts` | unit contracts |
| `e2e/academy-core.spec.ts` | V2 inspection + evidence |
| `e2e/academy-core-perf.spec.ts` | **new** — CDP perf harness, Hub vs Core |
| `docs/handoffs/academy-core-v2/` | screenshots, `perf.json`, `perf.md` |

## Tests

| Suite | Result |
|---|---|
| `vitest run src/pages/dev/academy-core` (page, route, warm) | **31 / 31 pass** |
| `vitest run src/pages/LolHub.commonsHash.test.tsx` | **2 / 2 pass** |
| Touched areas: `src/pages/LolHub*`, `src/pages/dev/academy-core`, `src/App.*`, `src/components/Layout*`, `src/components/lol/broadcast`, `src/lib/hub` | 29 files, **356 pass, 3 fail — baseline** (`App.routing-contract` ×2 retired `/multiplayer` routes, `App.routeGuards` admin platform-policies regex; all three fail identically on untouched `origin/main` sources, as recorded in the V1 handoff) |
| `tsc --noEmit -p tsconfig.app.json` | 0 errors in changed files; the 2 baseline errors in untouched files remain |
| `playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts` | **19 / 19 pass** |
| `playwright test ... e2e/academy-core-perf.spec.ts` (9 scenarios, Hub and Core) | **9 / 9 ran** |
| Full `vitest run` | not completed — a worker OOMs inside existing suites on this machine (see V1 handoff) |

What the inspection suite asserts (all viewports 1366×768, 1440×900, 1920×1080, 1280×660, 390×844, 320×568, 430×932): no horizontal overflow; Daily, Ranked, four bays, the book, Mogzy and the Commons link inside the first screen on desktop; the real book shows the live brief, its "Read full report" link opens the full Patch Report, and its radio dock is present; the book never overlaps the stage; hover drives all five states, Mogzy's four poses and the projections (specimen icon, four strata icons from the live brief); Tab reaches every entrance with a visible outline; Enter navigates on the first action; Daily → `/quiz/daily-challenge`, Ranked → `/quiz?play=1`; `/dev/academy-core` alias; **`/lol#academy-commons` scrolls the Commons into view**; OS reduced-motion → zero running animations inside the page; no library / book-frame / spine request is made; phones: actions precede the instrument, rooms precede the mobile book, every target ≥ 44 px, no overlaps, a touch press engages the state and the tap routes, a focused row drives the state; 200 % text zoom keeps every label.

## Performance

Method (PERF1's, re-run fresh): one production `vite build` served by `vite preview`; headless Chromium via Playwright with CDP throttling **10 Mbps / 40 ms**; cold = fresh browser context, warm = a second page in the same context; one 4× CPU-throttled run for interaction; external hosts (Railway, Supabase, Google Fonts) real, exactly as PERF1. Milestones are a per-frame in-page probe installed before any app script (root painted, primary CTA on screen, four rooms laid out, book painting decoded, Mogzy plate decoded); bytes from CDP `Network.loadingFinished`; CLS from buffered `layout-shift` entries (no input); hover→state is pointer-enter to the instrument's `data-focus` flip (Core) — for the Hub there is no equivalent state, so that cell is hover + 50 ms and **not comparable**; click→Archives is click to the destination's first heading. One rep per cell (the harness is in the repo; `docs/handoffs/academy-core-v2/perf.json` has every raw value). The two pages are compared **direct-visit to direct-visit**; the Landing → Hub journey only exists for the Hall today (the Landing's warm targets the Hall's art), so that journey's Core twin is a production step, not something this preview can measure honestly.

Existing Home Hub (`/lol`) vs Academy Core V2 (`/lol/dev/academy-core`), ms from navigation start unless noted:

| viewport | page | cold FCP | CTA usable | rooms | book painted | Mogzy | CLS | cold bytes (images) | requests | warm CTA | warm bytes | click → Archives | hover → state |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | Hub | 1064 | 1407 | 1407 | 3528 | 1897 | 0.046 | 3474 KB (2164 KB) | 268 | 935 | 71 KB | 144 | (115, n/c) |
| 1366×768 | **Core** | 1120 | **1262** | **1262** | **2486** | **1772** | **0.0004** | **2334 KB (974 KB)** | 260 | **720** | 64 KB | **98** | 109 |
| 1920×1080 | Hub | 1132 | 1364 | 1364 | 3798 | 1934 | 0.033 | 5685 KB (4360 KB) | 270 | 847 | 88 KB | 124 | (137, n/c) |
| 1920×1080 | **Core** | 1088 | **1161** | **1161** | **2385** | **1616** | **0.0002** | **2334 KB (974 KB)** | 260 | **626** | 64 KB | **94** | 104 |
| 390×844 | Hub | 1088 | 1395 | 1395 | 3296 | 1947 | 0.059 | 3103 KB (1787 KB) | 265 | 884 | 71 KB | 68 | (106, n/c) |
| 390×844 | **Core** | 1108 | **1211** | **1211** | **2702** | **1585** | **0.001** | **2334 KB (974 KB)** | 260 | **663** | 64 KB | 72 | 96 |
| 320×568 | Hub | 1052 | 1324 | 1324 | 3229 | 1945 | 0.090 | 3112 KB (1787 KB) | 265 | 846 | 71 KB | 72 | (102, n/c) |
| 320×568 | **Core** | 1112 | **1245** | **1245** | **2773** | **1757** | **0.002** | **2334 KB (974 KB)** | 260 | **648** | 64 KB | 66 | 82 |
| 1366×768, 4× CPU | Hub | 1344 | 1800 | 1800 | 3825 | 2233 | 0.046 | 3489 KB | 268 | 1314 | 71 KB | 329 | (156, n/c) |
| 1366×768, 4× CPU | **Core** | 1420 | **1599** | **1599** | **2160** | **1810** | 0.003 | **2334 KB** | 260 | **923** | 64 KB | **277** | 271 (max long task 53 ms) |

Reading it:

- **No regression on any cold-load milestone; the Core is ahead on every one.** FCP is within noise (±70 ms, the render-blocking Cinzel stylesheet and the app JS bound it, as in PERF1). The primary CTA is usable 100–200 ms earlier; the book painting is on screen **1.0–1.4 s earlier** (it is in the critical set and nothing competes with it); Mogzy 100–350 ms earlier.
- **Bytes.** A cold Core visit moves **2.33 MB** at every size (974 KB images) versus 3.1–5.7 MB for the Hall (1.8–4.4 MB images). The difference is the art the Core does not draw: library painting, book frame / spine, the four cover splashes and, on wide desktops, the Commons painting and its 2.25 MB source-PNG Mogzy. The Core's own additions are the four reaction plates (≈ 39 KB), two 128 px champion icons (≈ 50 KB) and the tiny shards / role SVGs; the 20-odd Patch Brief icons are shared with the Hall's book.
- **Layout shift.** 0.0002–0.003 across the board (Hub 0.03–0.09). Two sources were found and removed during this pass: the sitewide Footer painting at the generic 50 vh route fallback and being pushed down when the chunk mounted (fixed with a route-specific fallback that holds the hero's height), and the two actions wrapping to a second row for ~30 ms during the Cinzel font swap (fixed by deciding the row/column layout from the console's width with a container query, never from font metrics). The title and link row are pinned to one line for the same reason.
- **Interaction.** Hover → instrument state 82–109 ms unthrottled (React state flip + first spring frame), 271 ms with a 53 ms long task under 4× CPU throttle — responsive, no visible stutter in the captures. Click → Archives content 66–98 ms unthrottled (route chunk already warmed), 277 ms at 4× (Hub 329). Warm visits: CTA at 626–720 ms (Hub 846–935), 64 KB on the wire.
- **Idle.** Four cheap CSS animations (lens breathe, idle sweep, caret, Mogzy bob), all paused off-screen and under reduced motion; no rAF loop. The ResizeObserver that places the bench runs on resize only.
- **Not covered:** Safari/WebKit and Firefox, real devices, HTTP/2 (`vite preview` is HTTP/1.1), the Landing → Hub journey for the Core (see Method).

## Unresolved / notes for the owner

- The Hall edit for the Commons deep link (above) needs your approval.
- Authenticated click-through was again not exercised (no e2e persona tokens here); the Ranked record opens for a guest exactly as from the lobby.
- The Daily page for a pure guest with no anonymous session shows its own "couldn't start" state after the start intent — same as from the lobby.
- The full `vitest run` still OOMs a worker on this machine inside existing suites (see V1 handoff); targeted suites are authoritative.

## Explicit statement

No merge into `main`, no deployment, no migration, no backend / Supabase / Railway / billing change. `/lol` keeps its content, art and loading logic; the only change there is the hash-gated effect described above. Only the isolated branch was pushed.
