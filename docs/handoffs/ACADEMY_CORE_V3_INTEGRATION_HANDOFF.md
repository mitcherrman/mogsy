# Academy Core V3 — production integration candidate (awaiting owner authorization)

Branch `academy-core/v3-production-integration`, cut from `origin/main` `805529a0`.
Accepted source: `design/academy-core-v1` @ `0b580a1d` — **unchanged**.
Nothing merged, nothing deployed, no Supabase / Railway / backend / production-config change.

> **Process note.** The task referenced an attached
> `MOGZY_ACADEMY_CORE_V3_INTEGRATION_PREP_HANDOFF_2026-10-15.md`. It was not on disk
> (not in Downloads, Desktop, or the repo) and was not in the message, so this work follows
> the written brief plus `docs/handoffs/ACADEMY_CORE_V3_HANDOFF.md`. If that file holds
> constraints beyond the brief, they have not been applied — please re-send it.

## What changed

| area | change |
|---|---|
| Route | `/lol` renders the Core (`R.AcademyCore`, shared lazy importer, so the route and the prefetch share one chunk). Fallback holds the hero height (`AcademyCoreFallback`). |
| Hall preserved | The previous Home Hub, with Academy Commons as its second screen, is served unchanged at **`/lol/hall`**. Same component, same behaviour. |
| Preview URLs | `/lol/dev/academy-core` and `/dev/academy-core` redirect to `/lol`. Source moved `src/pages/dev/academy-core` → `src/pages/academy-core`. |
| Navigation | Core's Commons and Hall links are client-side `<Link>`s (were a full-reload `<a href>` and a link back to itself). Commons → `/lol/hall#academy-commons`; Hall → `/lol/hall`. A legacy `/lol#academy-commons` deep link is forwarded (replace) to `/lol/hall#academy-commons`; the Hall already honours that fragment on mount. Any other fragment on `/lol` renders the Core. |
| Prefetch | `/lol` → `AcademyCore + CombatLab + Quiz` (no `LolHub`); new `/lol/hall` → `LolHub`. Core Commons/Hall links prefetch the Hall chunk on intent. |
| Landing warm-up | `MogzyEntryV2` (hold and hand-off) calls `warmAcademyCore` and preloads `CORE_MOGZY_REST_SRC` (same file as before). The Hall's library painting, spine and `LolHub` chunk are no longer fetched on the journey. The Hall still runs its own warm on mount for direct visits. |
| SEO | Preview-only `noindex`/"(preview)" title removed. `/lol` carries the Hall's exact title, description, keywords and `WebApplication` JSON-LD, canonical `/lol`. `/lol/hall` is `noindex` with canonical `/lol/hall` (no duplicate structured data). Sitemap unchanged. |
| Shell | `Layout` full-bleed and `Footer` hidden for `/lol/hall` as for `/lol`; preview path removed from `Layout`. `startup-shell` already matches `/lol/*`. |
| Analytics | **Found in review:** the Core did not emit the funnel's `hub_entered`. It now does (same `useSurfaceEvent`, once per session). Because the contract allows one emitter per canonical event (`canonicalSurfaces.test.tsx`), the Hall no longer emits it; that test and `LolHub.test.tsx` were updated to say so. `contract.ts` comment updated. |
| Audio parity | Core plays the Hall's `hub.application.enter` arrival cue and the `bookRuffle` book-open cue (same per-cue gate, `usePlaySfx`). Both default-silent unless bound, as in the Hall. Flagging because it is an addition to V3 — remove two lines in `AcademyCorePage.tsx` if unwanted. |
| Daily read | **Found in perf run:** the Core's Daily status read is authenticated, so every session-less visitor (the common first visit) produced a guaranteed 401 + a console error that the Hall never had. `useDailyChallengeStatus({ enabled })` is new (default unchanged for `/quiz`); the Core passes `!!user`. The label is "Play Daily Challenge" in both cases (unknown status), so behaviour is identical. |

Preserved and re-verified: four real champion-art books (Ryze / Ahri / Akali / Viktor with the Hall's titles and crops), interactive crystal, real Patch Report book + Academy Radio, Mogzy operator, Daily and Ranked shortcuts, 240 ms one-click activation (modified clicks and reduced motion are immediate).

## Verification

| check | result |
|---|---|
| `tsc -p tsconfig.app.json` | only the 2 pre-existing errors (`OnboardingProfile.tsx`, `lib/identity/connections.ts`); none in touched files |
| vitest — Core, route contract, Landing, Hall, funnel, analytics, prefetch | all pass (Core page 30 tests incl. new legacy-hash, hub_entered, SEO, Daily-gating, book cue) |
| vitest — 143-file union (every tree-walking / source-contract test + every test touching a changed module) | 24 failures, **all identical on `origin/main`** (baseline run on a detached checkout); 0 new |
| Playwright `e2e/academy-core.spec.ts` (dev server, mocked data) | **22 / 22**: 1366, 1920, 1280×660, 390, 320, 430; hover, one-click, rapid click, modified click, reduced motion, crystal, touch, 200 % text zoom, redirects, legacy hash, client-side Commons/Hall, Hall preserved + noindex, Landing → Core journey, signed-in vs session-less Daily read |
| Production build, live backend (`captures`) | 4 covers decoded, real **Patch 26.20** brief (Buffs / Nerfs / Adjustments with real icons), no horizontal overflow at 1366 / 1920 / 1280×660 / 390 / 320, page height stable (768 / 1080 / 764), 0 console errors, 0 4xx, reduced motion: 0 running animations |
| Perf | below |

Screenshots: `docs/handoffs/academy-core-v3-integration/` (`live-*` = production build + real data; the rest = e2e fixtures, every cover renders as Ahri by design). Raw perf rows in `perf-rows/`, aggregate in `perf.md` / `perf.json`.

### Authenticated paths — what was and was not tested
No authorized test credentials were provided, and no production account was created or signed into. A signed-in persona was exercised on the local e2e dev server only (the repo's `VITE_E2E_AUTH` seam, fake token, backend stubbed): the Daily read happens exactly once with a `Bearer` header and the Daily shortcut routes; a session-less visitor makes no authenticated read. Real-account resume / completed Daily labels are covered by unit tests, **not** against the live backend.

## Performance — main vs integration

Both production builds served by one static server with the production cache policy (verified from `mogzy.lol`: hashed `/assets` immutable, document `no-cache`). CDP 10 Mbps / 40 ms, real Railway / Supabase. Median of 3 cold contexts. Journey = real Landing `/` → automatic hand-off → `/lol`.

| 1366×768 journey (cold) | origin/main (Hub) | integration (Core) |
|---|---|---|
| home arrival | 2779 ms | 2873 ms |
| CTA / four rooms visible | 3047 ms | 3132 ms |
| four covers decoded | **4554 ms** | **3132 ms** (already warm on arrival) |
| Patch Report book painted | 3168 ms | 3132 ms |
| bytes before hand-off (reqs) | 2023 KB (173) | 2450 KB (176) |
| bytes after hand-off (reqs) | 1515 KB (98) | **806 KB (99)** |
| total / images | 3539 / 2222 KB | **3257 / 1898 KB** |
| retired Hall art / `LolHub` chunk | fetched (library painting, `LolHub`) | **none** |
| duplicate network URLs | analytics ×2, app_settings ×2 | analytics ×2 |
| CLS | 0.0196 | 0.0197 |

390×844 journey: arrival 2743 → 2752 ms, CTA 2933 → 3000 ms, book painted 4714 → 4476 ms, total 3161 → 3257 KB, Hall spine + library + `LolHub` no longer fetched, CLS 0.0026 both.

Direct cold `/lol` 1366: CTA 1452 → 1276 ms, covers 3414 → 2946 ms, 3471 → 3189 KB; 390: CTA 1494 → 1281 ms, 3094 → 3189 KB.

Bundle: entry chunk +1.0 KB raw (+0.2 KB gz); Core chunk 28.5 KB + 22.7 KB CSS (gz 8.9 / 5.4); `LolHub` chunk 69 → 49 KB raw (Hall-only code; shared modules moved to shared chunks); `index.css` unchanged.

What the numbers mean:
- **Layout shift.** The 0.02 CLS is the Landing's own "Enter Mogzy" button settling at ~250 ms, identical on main. The Core's own shift is 0.0001.
- **The Core moves cost earlier, not away.** The Landing hold now downloads the Core's art (+427 KB before hand-off) so the Core arrives with covers decoded; the post-hand-off cost halves. Net bytes are lower (−282 KB). On a very slow link the hold is the busier moment.
- **Click latency is the one regression, by design.** Click → Archives content 147 ms (Hub) → 335 ms (Core) at 1×, 347 → 433 ms at 4× CPU: the accepted 240 ms activation (reduced motion skips it; reduced-motion click → route measured 84–234 ms).
- **Hover.** The harness figure (≈ 130–440 ms) includes Playwright's actionability waits and is not a latency. Measured in-page, pointer → `data-focus` flip is 29–44 ms at 1×, 66–126 ms at 4× CPU; long tasks at 4× are 50–76 ms (≈ 15 ms of real work).
- **Harness caveat.** Warm-reload *bytes* are bimodal in the harness for both builds (a rep sometimes re-downloads; the same on main), so warm bytes are not reported as a result. Warm CTA times (~400–460 ms) are comparable.

## Outstanding risks

1. **Missing attached handoff** (above).
2. **Direct `/lol/hall` visits are not counted as `hub_entered`** (one-emitter contract). Negligible in practice (noindex, reached from the Core), but it is a deliberate change to the funnel definition — owner call. Alternative: let the Hall emit and the Core not (no: the Core is the home).
3. **Click latency +~190 ms** is the accepted trade-off; unchanged from V3 acceptance.
4. **`bookRuffle` / arrival cue** parity is an addition to V3 (audio only if an Audio Studio binding exists).
5. **No live-account Daily verification** (see above). The first signed-in Daily label (Resume / Play) in production is unobserved.
6. **SEO is client-rendered**, same class as before, but the crawled `/lol` DOM changes. Hall is noindex; Search Console should be watched for `/lol` after publish.
7. **Admin registry / diagnostics** still label `/lol` "LoL Hub" and do not list `/lol/hall` (cosmetic; not changed to avoid registry↔router agreement tests).
8. **Pre-existing failures** on `origin/main` (2 tsc errors, 24 vitest failures in 143 files; full list reproducible with the baseline run) are untouched.
9. **Environment:** Windows App Control blocks rollup's native module for some tools; vitest/vite/playwright worked here via the default setup. The full vitest suite OOMs in one process (known); it was run as the targeted union above, not as a single full run.
10. A stale preview server from earlier sessions still holds port 8126 (PID 26548); not mine, left running.

## Release steps (frontend only — needs explicit owner authorization)

No backend, Supabase, Railway or environment change is required; no flag.

1. Owner authorizes. Open a PR `academy-core/v3-production-integration` → `main` (branch base `805529a0`; if `main` moved, re-check the six overlapping files: `App.tsx`, `Layout.tsx`, `Footer.tsx`, `route-prefetch.ts`, `LolHub.tsx`, `MogzyEntryV2.tsx`) and merge.
2. Lovable **Publish** the frontend from `main`.
3. Verify on `mogzy.lol` (anonymous, then signed in): `/` → `/lol` shows the Core with four covers and the Patch Report book; the four books, Daily and Ranked route correctly; `/lol/hall` shows the Hall; `/lol#academy-commons` lands on the Commons at `/lol/hall#academy-commons`; `/lol/dev/academy-core` redirects to `/lol`; page source `<title>` and `robots` meta on `/lol` (indexable) vs `/lol/hall` (`noindex`); no console errors; `hub_entered` appears once per session in analytics.
4. Rollback: revert the merge commit on `main` and Publish again — `/lol` returns to the Hub (the Hall's component is untouched, so the revert is mechanical). Frontend-only; no data to undo.

## Reproduce

```
npx vite build --outDir <tmp>/cand --emptyOutDir          # integration
node <static server with prod cache policy> <tmp>/cand 8141
PERF_MAIN=http://127.0.0.1:8140 PERF_CAND=http://127.0.0.1:8141 PERF_REPS=3 PERF_VPS=1366,390 \
  npx playwright test -c playwright.frontend.config.ts e2e/academy-core-integration-perf.spec.ts
npx playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts
```
