# Academy Core V3 — production integration candidate (awaiting owner authorization)

| | |
|---|---|
| Branch | `academy-core/v3-production-integration` |
| Code tip | **`a7f6df0d`** (the docs commit that adds this file follows it; `git log -1` on the branch is the final SHA) |
| Reconciled with | `origin/main` **`7f6b365e`** (merge commit `235eee0b`; originally cut from `805529a0`) |
| Accepted V3 source | `design/academy-core-v1` @ `0b580a1d` — unchanged |
| State | Nothing merged, no PR, nothing published. No Supabase / Railway / backend / production-config change. |

The external preparation handoff that was missing in the first pass has since been reviewed by the owner's side and contained no requirements beyond the approved brief; nothing here is blocked on it.

## 1. What this release does (frontend only)

| area | behaviour |
|---|---|
| `/lol` | Academy Core V3. Fallback holds the hero's height (`AcademyCoreFallback`). Shares one lazy importer (`R.AcademyCore`) with prefetch. |
| `/lol/hall` | The previous Home Hub, with Academy Commons, unchanged (same component). `noindex`, canonical `/lol/hall`. |
| `/lol#academy-commons` | Forwarded (replace) to `/lol/hall#academy-commons`, which the Hall already honours on mount. Any other fragment renders the Core. |
| Preview URLs | `/lol/dev/academy-core` and `/dev/academy-core` redirect to `/lol`. Source moved `src/pages/dev/academy-core` → `src/pages/academy-core`. |
| Core links | Commons and Hall are client-side `<Link>`s (the first was a full-reload `<a href>`). |
| Prefetch | `/lol` → `AcademyCore + CombatLab + Quiz`; `/lol/hall` → `LolHub`. |
| Landing warm-up | Landing hold and hand-off call `warmAcademyCore`; the Hall's library painting, spine and `LolHub` chunk are no longer fetched on the journey. The Hall still warms itself on a direct visit. |
| SEO | Preview `noindex` removed; `/lol` carries the Hall's exact title / description / keywords / `WebApplication` JSON-LD, canonical `/lol`. Sitemap unchanged. |
| Shell | `Layout` full-bleed and `Footer` hidden for `/lol/hall` exactly as for `/lol`. |
| Analytics | `hub_entered` is emitted by the Core (once per session, `useSurfaceEvent`). One emitter per canonical event is a repo contract, so the Hall no longer emits it. |
| Audio | The Core plays the Hall's `hub.application.enter` and `bookRuffle` cues through the existing engine (see §4). Kept per owner decision. |
| Daily read | Authenticated status is read only when a session exists (`useDailyChallengeStatus({ enabled })`; default unchanged for `/quiz`). |
| Activation | The 240 ms beat is cleared again if the Core is still mounted after navigating (see §2). |

Preserved: four real champion-art books (Ryze / Ahri / Akali / Viktor, the Hall's titles and crops), the interactive crystal, the real Patch Report book and Academy Radio, Mogzy operator, Daily and Ranked shortcuts, the 240 ms one-click activation (modified clicks and reduced motion are immediate).

## 2. Integration decisions

1. **Merge, not rebase.** `origin/main` (6 commits, UGMP unified playtests) was merged into the already-pushed branch. Only `src/App.tsx` and `src/components/Layout.tsx` changed on both sides; the merge was clean and a diff against `origin/main` shows only this work's hunks in both files. Admin playtest routing (`/admin/playtests/:mode`, legacy redirects) and its guards are untouched.
2. **`.env` parity.** The first pass had dropped `VITE_WORLDS_EXPERIENCE_ENABLED="true"` because a local `.env` had been copied over the tracked one. Restored from `origin/main` (`98ff691d`). `git diff origin/main HEAD -- .env package.json package-lock.json vite.config.ts tsconfig.app.json supabase .github public index.html .lovable` is empty. The Worlds chunk set of the built bundle is identical to `main`'s.
3. **No other env / flag / infra change.** The branch diff vs `main` outside `docs/` and `e2e/` is the 15 modified or added files outside `src/pages/academy-core/` (and the e2e specs) listed by `git diff --name-status origin/main HEAD`.
4. **`hub_entered` moves from the Hall to the Core.** A direct visit to `/lol/hall` that did not pass through the Core is not counted. Deliberate; noindex and reached from the Core in practice.
5. **Audio cues kept** (§4).
6. **Latent bug fixed while verifying Firefox.** After a book click the activating state was never cleared; if the Core stayed mounted (slow destination chunk, or Back immediately) the instrument stayed in its activation visual. A flaky Back-navigation e2e exposed it. Now cleared 1.5 s after navigating and on `popstate` / `pageshow`; covered by two unit tests and the e2e.

## 3. Test results

Baseline = detached checkout of `origin/main` `7f6b365e`, run with the same commands.

| check | result |
|---|---|
| `tsc -p tsconfig.app.json` | 2 errors, both pre-existing on `main` (`OnboardingProfile.tsx`, `lib/identity/connections.ts`); none in touched files |
| Vitest — Core, route contract, Landing, Hall, funnel, prefetch, startup fallbacks | 12 files, 230 tests pass |
| Vitest — 164-file union (every tree-walking / source-contract test + every test touching a changed module, incl. UGMP playtests) | 33 failures, **all 33 also fail on `origin/main`**; 0 new (`App.routeGuards`, `App.routing-contract`, ranked-arena ×4, `admin-registry.routes`, `feedback/contract`, `useSafeTemporalBack`, `masterySliceModule.jp5`, `ProPlayHub`, `ProPlayTournamentExperience`, `featuredSwitchUx3a`, `AdminPlatformPolicies`, `InteractionLab`, `syntheticRankedHistory`, `AnswerGrid.elimination`). The full suite OOMs as one process (known), so it was not run as a single run. |
| Playwright `e2e/academy-core.spec.ts`, **Chromium** | 23 / 23 |
| Playwright same spec, **Firefox 157** (Playwright build v1555) | 23 / 23. Firefox was installed on request (123.8 MiB, `npx playwright install firefox`). |
| Production build (`vite build`) | succeeds |
| Firefox, production build + live backend | 1366×768, 1280×660, 390×844, 320×568: Landing → `/lol`, 4 covers decoded, Patch 26.20 brief, no overflow, 0 console errors, no Hall art fetched, book click routes |
| Chromium, production build + live backend | same, plus 0 4xx responses; page height stable 768 / 1080 / 764 (short desktop) / 1284 / 1116; reduced motion 0 running animations |
| Route sweep on production builds (17 paths, main vs candidate) | identical except the intended ones; no page errors. `/admin/playtests/rangefinder` anonymous → `/lol` on both. |
| Console / layout shift | `main` and candidate both 0 console errors. CLS 0.0196 (desktop) / 0.003 (phone) on both = the Landing's own "Enter Mogzy" button at ~250 ms. The Core's own shift: one 0.0001 at 2.4 s. |
| Duplicate downloads (production caching) | none from the Core; only `analytics_events ×2` (main also has `app_settings ×2`). `tidecaller.webm` is aborted/retried by the radio on both. |

Evidence: `docs/handoffs/academy-core-v3-integration/` (`live-*` = production build, real data; others = e2e fixtures, where every cover renders as Ahri by design; `perf.md`, `perf.json`, `perf-rows/`).

### Not verified
- **Real authenticated Daily status.** No authorized test credentials were available and none were invented; no production account was created or signed into. Verified only with the repo's local e2e persona (fake token, backend stubbed, dev server): one `/api/daily-run/today` read with a `Bearer` header and a working Daily shortcut. Resume / completed labels are unit-tested, **not observed against the live backend**. First signed-in check belongs in the post-publish verification (§7).
- Safari / WebKit, and real touch hardware (touch is emulated).
- Audio *audibility* on real devices (below, only the gating is proven).

## 4. Audio

Proven with a Web Audio start counter on the production build (positive control included):

| condition | sounds started |
|---|---|
| unmuted, page just loaded, no gesture | 0 |
| unmuted, after hover / crystal / book click | 8 (hover focus cue, book-open cue) — the cues work |
| muted (`mogsy-sounds-muted=1`), same interactions | 0 |

The engine itself returns before playing when muted, before config is ready, or before a user gesture (`src/lib/audio/sfx.ts`), so arrival is silent for a fresh visitor exactly as on the Hall. `hub.application.enter` has no built-in generator (silent unless an Audio Studio binding exists); `bookRuffle` obeys its per-cue setting (`play_book_ruffle`).

## 5. Performance (current `main` vs candidate)

Both production builds served by one static server with the production cache policy (verified on `mogzy.lol`: hashed `/assets` immutable, document `no-cache`). CDP 10 Mbps / 40 ms, real Railway / Supabase hosts, cold contexts, median of 3, Landing `/` → automatic hand-off → `/lol`.

| 1366×768 | main (Hub) | candidate (Core) |
|---|---|---|
| home arrival | 2751 ms | 2758 ms |
| CTA / four rooms | 2904 ms | 2990 ms |
| four covers decoded | **4475 ms** | **2990 ms** (decoded on arrival) |
| Patch Report book painted | 3197 ms | 3025 ms |
| bytes before hand-off (reqs) | 2024 KB (173) | 2451 KB (176) |
| bytes after hand-off (reqs) | 1515 KB (98) | **806 KB (99)** |
| total / images | 3539 / 2222 KB | **3257 / 1898 KB** |
| retired Hall art / `LolHub` chunk | fetched | **none** |

390×844 journey: arrival 2700 → 2705 ms, CTA 2898 → 2909 ms, book 4660 → 4444 ms, total 3162 → 3257 KB, no spine / library / `LolHub`. Direct cold `/lol`: CTA 1424 → 1230 ms (1366), 1394 → 1188 ms (390); covers 3358 → 2917 ms; 3471 → 3190 KB. Warm CTA 335 → 298 ms.

Interaction: click → Archives content 79 → 304 ms at 1×, 245 → 364 ms at 4× CPU — the accepted 240 ms activation (reduced motion skips it: click → route 69 ms measured). Pointer → state flip measured in-page: 29–44 ms at 1×, 66–126 ms at 4× CPU. The Playwright hover figures in `perf.md` include actionability waits and are not latencies.

Bundle: entry chunk +1.0 KB raw (+0.2 KB gz); Core chunk 28.5 KB + 22.7 KB CSS (gz 8.9 / 5.4); `LolHub` 69 → 49 KB raw; `index.css` unchanged.

Reading it: the Landing hold now fetches the Core's art, so the Core arrives with covers decoded and the post-hand-off cost halves; net bytes are lower. Click latency is the one regression, by design. Warm-reload *bytes* are bimodal in the harness for both builds and are not reported as a result.

## 6. Outstanding risks

1. **Authenticated Daily label unobserved against the live backend** (§3).
2. **`hub_entered` definition change** — direct `/lol/hall` entries are uncounted (§2.4).
3. **Click latency +~225 ms** (accepted trade-off; unchanged from V3 acceptance).
4. **Audio parity** is an addition to V3; silent by default unless the per-cue setting / an Audio Studio binding makes it audible.
5. **SEO** is client-rendered as before, but the crawled `/lol` DOM changes; watch Search Console for `/lol` after publish.
6. **`main` may move again.** Re-merge before the PR; only `App.tsx`, `Layout.tsx`, `Footer.tsx`, `route-prefetch.ts`, `LolHub.tsx`, `MogzyEntryV2.tsx` are shared.
7. **Admin registry / diagnostics** still list `/lol` as "LoL Hub" and not `/lol/hall` (cosmetic; left alone to avoid registry↔router agreement tests).
8. **Pre-existing failures** (2 tsc, 33 vitest) are on `main` and untouched; reproducible with the baseline command in §8.
9. A stale preview server from earlier sessions may still hold port 8126 (not this work's).

## 7. Exact production-release procedure (needs explicit owner authorization — none given)

Frontend only. No backend, Supabase, Railway, env or flag step.

1. `git fetch origin && git merge origin/main` on the branch if `main` moved; re-run `npx tsc -p tsconfig.app.json --noEmit` and `npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts --project=chromium` and `--project=firefox`.
2. Open the PR `academy-core/v3-production-integration` → `main`; merge (merge commit, so the revert is one step).
3. Lovable **Publish** from `main`.
4. Verify on `mogzy.lol`, anonymous then signed in:
   - `/` → automatic hand-off → `/lol` shows the Core: four covers, Patch Report book, radio, Daily and Ranked.
   - Each book routes (240 ms beat); Ctrl-click opens a new tab; the crystal cycles previews without navigating.
   - `/lol/hall` shows the Hall; its "Explore the Academy" reaches the Commons.
   - `/lol#academy-commons` ends on `/lol/hall#academy-commons` at the Commons.
   - `/lol/dev/academy-core` redirects to `/lol`.
   - View source / DevTools: `/lol` has the Hall's title and no `robots` meta; `/lol/hall` has `noindex`.
   - Network tab on a cold Landing → `/lol`: no `academy-library-*`, `book-spine-*` or `LolHub-*` request; one `/api/daily-run/today` only when signed in.
   - Console clean. Signed-in: Daily label reads Play / Resume correctly (**the unverified item**).
   - Analytics: `hub_entered` appears once per session.
   - Audio: nothing plays on arrival; mute silences everything.
5. Watch for an hour: error rate, Search Console coverage of `/lol`.

## 8. Rollback

Frontend only, no data to undo: `git revert -m 1 <merge commit>` on `main`, then Lovable **Publish**. `/lol` returns to the Hub (its component is untouched, so the revert is mechanical); `/lol/hall` disappears (404 → Not found), `/lol#academy-commons` returns to its original same-page behaviour. If a revert PR is too slow, re-publishing the previous Lovable version restores the prior build.

## 9. Reproduce

```
# baseline and candidate production builds, served with the production cache policy
npx vite build --outDir <tmp>/cand --emptyOutDir          # run in each worktree
PERF_MAIN=http://127.0.0.1:8140 PERF_CAND=http://127.0.0.1:8141 PERF_REPS=3 PERF_VPS=1366,390 \
  npx playwright test -c playwright.frontend.config.ts e2e/academy-core-integration-perf.spec.ts
npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts --project=chromium
npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts --project=firefox   # needs: npx playwright install firefox
# baseline vitest: detached `git worktree add --detach <dir> origin/main`, same vitest command, diff the failing set
```
