# PERF1 — Academy first visit and cross-page loading

Branch `perf/academy-first-visit`, cut from `origin/main` **`53159f2c`**. The brief named `42c4b897`, but main had moved
70 commits on by the time work started. The only overlap with this work was `src/lib/route-prefetch.ts` (+2 lines for the
Pro Play tournament route), so every "already verified" fact in the brief was re-checked against `53159f2c` and still held.

No loading screens, skeletons, fake delays or progress bars were added. Navigation is never held for a prefetch.

## Result (cold, desktop 1440×900, 10 Mbps / 40 ms; median of 2)

| milestone | before | after |
|---|---|---|
| `/` first contentful paint | 877 ms | 909 ms (unchanged, see note) |
| Landing Mogzy visible | **never before the hand-off** (lands at ~8.8 s, on the Hub) | **1125 ms** |
| auto-entry starts / reaches `/lol` | 2605 / 3536 ms | **1965 / 2907 ms** |
| `/lol` background visible | 13047 ms | **3104 ms** (first Hub frame) |
| book shells visible | 15516 ms | **3105 ms** (first Hub frame) |
| Patch Brief book visible | 16037 ms | **3105 ms** (first Hub frame) |
| Hub Mogzy visible | 8825 ms | **3105 ms** (first Hub frame) |
| four cover splashes visible | 9642 ms | 4706 ms (~1.6 s after the Hub; see remaining) |
| first Leaguecraft guide Mogzy (after the click) | 14298 ms | **210 ms** |
| `/lol` → Mogzy Archives content (after the click) | 2764 ms (blank fallback 2.7 s) | **55 ms** |
| `/lol` → Pro Play content (after the click) | 3206 ms (blank fallback 3.6 s) | **65 ms** |
| local image bytes, whole cold journey | 14.32 MB | **1.20 MB** |

FCP is bounded by the render-blocking Cinzel stylesheet and the app's JS, which this work does not touch. It moved by
noise (±70 ms between runs).

## Root causes (measured)

1. **Landing Mogzy and skyline were 4.3 MB of PNG** (`mogzy-mascot-base-v1.png` 2.25 MB, `academy-skyline.png` 2.0 MB),
   both requested at Low priority at ~0.8 s. Mogzy finished at ~8.8 s, so on a cold visit it was **never painted on the
   Landing**: the auto hand-off happened first.
2. **The Hub's art was ~12 MB and only started downloading when the Hub mounted.** Library (1.8 MB), book frame (2.4 MB),
   broadcast book (2.6 MB) and Commons (2.0 MB) all started together at hand-off and finished 9–12 s later.
3. **Hidden-breakpoint art was downloaded anyway.** An eager `<img>` inside `display:none` still downloads: desktops pulled
   the phone spine (1.19 MB), and phones pulled the four desktop cover splashes (~600 KB) plus the Commons painting.
4. **Serial manifest chain.** The Hub mounted, then fetched the Railway manifest, and only then could the splash requests begin.
5. **Archives and Pro Play route chunks were never warmed.** `/lol` warms only Hub, Combat Lab and Leaguecraft, so those
   two clicks sat on the transparent `RouteFallback` for 2.7–3.6 s cold (7.3 s on a direct `/lol` cold visit).
6. **Leaguecraft's guide drew the 1.02 MB `explaining` PNG at 40–64 CSS px** (`MogzyGuide` never forwarded a scale), queued
   behind ~11 MB of lobby paintings: 14.3 s after the click.
7. **Landing hold.** 1800 ms plus the 780 ms transition. The hint only started fading in at 1.1 s and reached 0.93 opacity
   by the hand-off, so the screen read as waiting for a click.

## Changes

### A. Landing timing (`MogzyEntryV2.tsx`)
- `AUTO_HOLD_MS` 1800 → **1100**. Measured in Chromium (warm cache, so the animation is what is observed): the title
  reaches full opacity at **1031 ms**, and the auto-start fires at **1129 ms** with the title at 1.00. The façade is at
  0.93 of its 1.4 s fade at that moment and fades out under the veil anyway. Screenshots at 1050 ms show the complete
  scene on desktop and phone. **No clipping.**
- Hint ("opening the academy"): on the automatic root it now fades in at 0.3 s over 0.6 s and is fully readable from
  **863 ms**. Copy unchanged; the faster timing plus a readable hint resolves the ambiguity, so no new copy was added.
  The `/dev` preview keeps its original slow reveal.
- Preserved and re-verified in a real browser: click / Enter / Space enter immediately (~850–900 ms to `/lol` =
  780 ms transition + navigation); history is replaced (Back from the Hub returns to the page before `/`); Back
  during the hold cancels the hand-off; reduced motion stays at 450 + 220 ms (657 ms measured); analytics unchanged.

### B. Mascot payload
- `MogzyArtScale` gains **`medium`**: `mogzy-mascot-base-v1-512.webp` (512×768, **71,658 B**, from the 2,248,415 B PNG).
  The Landing (≤117 CSS px wide, 1.18× entry zoom) and the Hub guide (≤167 CSS px) both use it, so the **Hub's Mogzy is
  already in cache on arrival**. The 240 px compact plate is only 1.44× at the Hub's largest size, so it was not used there.
  A DPR-2 capture at 1920×1080 (167×251 CSS px) is indistinguishable from the PNG (`handoffs/perf1/hub-mogzy-dpr2-png-vs-512webp.webp`).
- `compact` gains `holdingBook`: `mogzy-holding-book-transparent-192.webp` (192×256, **10,234 B**, from 969,581 B).
- `MogzyGuide` gains an optional, additive **`scale`** prop (default `"full"`, so every existing caller is unchanged);
  it applies to whichever pose is active. Leaguecraft lobby + signup → `compact` (40–64 CSS px; `explaining` 9,910 B,
  `base` 18,118 B, `holdingBook` 10,234 B). Hub → `medium`.
- Derivatives: Pillow 12.3, premultiplied-alpha Lanczos, WebP q90 `method=6`. Same crop, alpha, pose, facing. Sources untouched.
- The Commons screen still draws the source PNG via CSS: it renders Mogzy up to ~470 CSS px, beyond the 512 plate's 2× budget.

### C/D. One canonical Hub warm (`src/lib/hub/academy-hub-warm.ts`)
`warmAcademyHub(queryClient)` is idempotent and never awaited by any navigation or render. It is called:
1. by the Landing **after its own Mogzy and skyline have loaded** (budget = the hold), so the warm never competes with the
   screen being looked at;
2. by the Landing's hand-off (the visitor has committed; no-op if already started);
3. by the Hub's own mount, so **direct `/lol` visits get the same ordering**.

Order:
1. The champion manifest via **`queryClient.fetchQuery(championAssetsQuery)`**: the app's one client and the existing
   query definition, so the Hub's `useChampionAssets()` reads the same cache entry (unit-tested: one request in total).
2. Critical art at **high** priority, for **this breakpoint only** (the same `(min-width: 768px)` query as the Hall's
   `<picture>`, from one shared constant):
   - desktop: library background, book frame, Mogzy (512), Patch Brief book;
   - phone: library background, spine, Mogzy (512).
3. After those settle (or a 4 s budget): the four destination route chunks via the existing idle `prefetchRoute`,
   Leaguecraft's 10 KB first-use Mogzy, and (desktop only) the four cover splashes.

The loader is the existing **`prepareImage`** (ranked-core): priority-aware, de-duplicated per URL, never rejects, and
drops its element once settled. `prefetchImages` was not used: it is idle-scheduled at *low* priority by design, which
suits likely-next routes but is the wrong tool for the very next screen. No new loader or cache was added.

The Hub art URLs live in **`src/academy/hub/hub-art.ts`**, which both the Hub components and the warm import, so the
warmed URL is always the rendered URL.

The Patch Brief book was added to the desktop critical set after the first after-build showed it **missing** on the
Hub (`handoffs/perf1/hub-1440x900-patch-book-missing-before-fix.webp`). `AcademyBroadcastSurface` renders nothing until
its painting loads. That pop-in already existed, but was hidden because everything else was slow too. It is below the
fold on phones, so it is not warmed there.

### E. Route transitions (`route-prefetch.ts`)
- The per-path dedupe is kept. `prefetchRoute(path, { intent: true })` runs the chunk import **now**, and if an idle warm
  is already queued for that path, runs it early (only once).
- The Hub calls it on pointer-enter, focus and pointer-down of a desktop volume, and on pointer-down and focus of a phone
  book. A click is never delayed.
- All four destination chunks are idle-warmed after the critical art. Result: Archives 2764 → 55 ms, Pro Play 3206 → 65 ms
  (cold); Archives from a direct `/lol` cold visit 7316 → 85 ms.
- The fallback is still on screen for **1–3 frames (16–56 ms)** on every route, warm or not, because React 18.3's `lazy`
  suspends once on first render even when the chunk is already loaded. It is transparent, and making it zero would mean
  touching React internals, so it was left alone.

### F. Heavy Academy encodes
WebP q90, `method=6`, source pixel size (all sources are already at or under their 2× budget), alpha **bit-exact**
(max alpha delta 0). Candidates were generated at q80/85/90/95, compared at 2× zoom on high-detail crops
(`handoffs/perf1/encode-*.webp`) and in the real Hub. No visible difference at q85+; q90 was kept for margin.

| asset | before (B) | after (B) | px | RMS vs source (/255, over the page navy) |
|---|---|---|---|---|
| `public/mascot/mogzy-mascot-base-v1.png` → `-512.webp` (Landing, Hub) | 2,248,415 | 71,658 | 1024×1536 → 512×768 | — (resized) |
| `public/mascot/mogzy-explaining-transparent.png` → existing `-192.webp` (Leaguecraft) | 1,020,905 | 9,910 | → 192×288 | — (existing) |
| `public/mascot/mogzy-holding-book-transparent.png` → `-192.webp` (signup) | 969,581 | 10,234 | 1086×1448 → 192×256 | — (resized) |
| `src/academy/academy-skyline.png` → `.webp` (Landing) | 2,025,565 | 59,838 | 1024×1536 | 0.57 |
| `src/academy/hub/academy-library-desktop.png` → `.webp` | 1,766,943 | 161,024 | 1672×941 | 2.63 |
| `src/academy/hub/academy-library-mobile.png` → `.webp` | 1,920,746 | 208,478 | 941×1672 | 3.26 |
| `src/assets/academy-book-frame.png` → `.webp` (alpha) | 2,419,130 | 338,210 | 1024×1536 | 3.13 |
| `src/assets/book-spine-flat-v2.png` → `.webp` (alpha) | 1,186,442 | 169,890 | 2172×724 | 2.11 |
| `public/images/lol-hub/academy-broadcast-book.png` → `.webp` (alpha) | 2,626,543 | 329,028 | 1536×1024 | 2.44 |
| `src/academy/hub/academy-commons-desktop.png` → `.webp` | 2,024,448 | 208,600 | 1672×941 | 3.81 |

Broadcast book and Commons were not in the brief's list. They were added because the waterfall showed them (4.6 MB) as
the largest competitors of the Hub's critical art, and Commons was also downloaded on phones. The Welcome page's use of
the desktop library painting now shares the same WebP.

Hidden-breakpoint downloads: the phone spine and the desktop cover splashes are `loading="lazy"`. A lazy image with no
layout box is never fetched, and where it is on screen it has usually been warmed already.

## Full measurements

Method: production `vite build` served by `vite preview` (baseline = untouched `53159f2c` build on one port, after = this
branch on another). Headless Chromium (Playwright 1.63), `--no-proxy-server` (proxy auto-detection added ~2.8 s to the
first external connection in this environment), CDP throttling **10 Mbps / 40 ms** (this reproduces the owner's "Mogzy
absent for 2–3 s": 2.25 MB at 10 Mbps). No CPU throttle. Cold = fresh browser context; warm = a second page in the same
context. Milestones are taken from a per-frame in-page probe (`img.complete && naturalWidth`, the route-fallback element,
`data-entering`); request start/end/priority/bytes come from CDP. Destination journeys click a book 2.5 s after the Hub
mounts, as a visitor would. Two reps per scenario, median reported. External hosts (Railway, Supabase, Google Fonts) were
real network. Harness and raw summaries: `handoffs/perf1/harness/`, `baseline-summary.md`, `final-summary.md`.

### Cold — ms from navigation start

| viewport | Landing Mogzy | auto start | at `/lol` | `/lol` bg | shells / spines | covers (4) | Patch book | Hub Mogzy |
|---|---|---|---|---|---|---|---|---|
| 1440×900 | never → **1125** | 2605 → **1965** | 3536 → **2907** | 13047 → **3104** | 15516 → **3105** | 9642 → 4706 | 16037 → **3105** | 8825 → **3105** |
| 1366×768 | never → **1146** | 2595 → **1983** | 3528 → **2927** | 13012 → **3188** | 15512 → **3189** | 5870 → 4583 | — → **3189** | 9379 → **3189** |
| 1024×768 | never → **1130** | 2603 → **1961** | 3504 → **2856** | 13053 → **3002** | 15495 → **3125** | 5929 → 4511 | — → **3114** | 9428 → **3002** |
| 390×844 | never → **1125** | 2587 → **1933** | 3382 → **2725** | 13413 → **2902** | 12180 → **2903** | n/a | n/a | 9196 → **2903** |
| 375×667 | never → **1092** | 2577 → **1925** | 3369 → **2708** | 13643 → **2930** | 14161 → **2931** | n/a | n/a | 9627 → **2931** |
| 1440×900 reduced motion | never → **1138** | 1244 → 1302 | 1477 → 1526 | 11703 → **3546** | 14345 → **4221** | 3729 → 3388 | — → **4190** | 10961 → **1708** |
| 390×844 reduced motion | never → **1115** | 1237 → 1282 | 1470 → 1506 | 12153 → **3341** | 8979 → **3190** | n/a | n/a | 11020 → **1710** |
| direct `/lol` 1440×900 | — | — | 626 → 603 | 11011 → **3024** | 13368 → **3858** | 3577 → 3525 | 13789 → **3861** | 12868 → **1983** |
| direct `/lol` 390×844 | — | — | 612 → 612 | 11531 → **2943** | 8222 → **2677** | n/a | n/a | 12849 → **2044** |

(The baseline Patch-book metric was added mid-task, so that column has a before value only at 1440×900. The
network logs put the baseline Patch book at ~15.4 s at every desktop size.)

### `/lol` → destination (cold, ms after the click)

| journey | content before → after | route fallback on screen before → after | Leaguecraft guide Mogzy |
|---|---|---|---|
| 1440 → `/quiz` | 59 → 74 | 1 frame → 1 frame | **14298 → 210** |
| 390 → `/quiz` | 57 → 76 | 1–2 frames → 2 frames | **14212 → 224** |
| 1440 → `/combat-lab` | 83 → 96 | 2 frames → 2–3 frames | n/a |
| 390 → `/combat-lab` | 79 → 81 | 2 frames → 2 frames | n/a |
| 1440 → `/lol/docs` | **2764 → 55** | **144 frames (2.7 s) → 1 frame** | n/a |
| 390 → `/lol/docs` | **4084 → 40** | seen (duration not recorded) → 1–2 frames | n/a |
| 1440 → `/lol/pro-play` | **3206 → 65** | **200 frames (3.6 s) → 1–2 frames** | n/a |
| 390 → `/lol/pro-play` | **5014 → 55** | seen (duration not recorded) → 1–2 frames | n/a |
| direct `/lol` 1440 → `/lol/docs` | **7316 → 85** | **289–298 frames (7.2–7.3 s) → 2–3 frames** | n/a |

Image pop-in after a destination's content: `/quiz` still has 8 lobby images pending (desktop) when its content appears,
settling 16.2 s → 9.7 s after the click. That is the Leaguecraft lobby's own art (see remaining). Pro Play has 2 small
pending images (settled 297 ms after the click, down from 3.5 s). Combat Lab and Archives have none.

### Warm cache
Everything is from the HTTP cache in both builds. The Hub appears complete on its first frame (2.4–2.6 s after
navigation, shorter than before only because of the shorter hold). Every destination renders in 34–100 ms with a 1–3 frame
fallback.

## Tests

- Affected suites: `MogzyEntryV2*`, `LolHub*`, `mogzy-guide`, `LeaguecraftGuide`, `leaguecraft-guide`, `QuizSignUpGate`,
  `route-prefetch` (new), `lib/hub` (new), `components/mascot`, `components/lol` (incl. broadcast),
  `lib/ranked-core/media`: **32 files, 556 tests, all pass**.
- Startup and route suites: `App*`, `Layout*`, `components/startup`, `components/hud`, `pages/welcome`, `Quiz.guide`,
  `Quiz.hub`, `ProtectedRoute`: 559 pass, 9 fail. **All 9 fail identically on clean `origin/main` sources**
  (`App.routing-contract` retired multiplayer ×2, `Quiz.hub` "exactly one h1", `welcome/tomeGeometry` ×6), the same
  pre-existing set the MG-INT handoff recorded.
- New tests: Landing warm ordering (waits for the Landing's art; budget = hold; no warm after unmount; immediate on click;
  the preview never warms); warm breakpoint selection / ordering / idempotence / single cache entry / failure tolerance;
  `prefetchRoute` dedupe + intent; Hub warm-on-mount and hover/focus/press intent; mascot derivative existence and scale
  fallback; `MogzyGuide` `scale`.
- Updated: Landing hold 1800 → 1100. The "reduced motion is under ⅓ of full" assertion is now "under ½" (670 vs 1880 ms;
  the reduced-motion timings themselves are unchanged). Asset paths `.png` → `.webp` in three tests.
- `vite build` passes. `tsc -p tsconfig.app.json`: no errors in touched files. ESLint on touched files: no new findings
  (the existing `no-explicit-any` at `QuizSignUpGate.tsx:86` and three `only-export-components` warnings in
  `AcademyBroadcastSurface.tsx` are on untouched lines).

## Browser matrix (Chromium, production build)

1440×900, 1366×768, 1024×768, 390×844, 375×667, reduced motion at 1440×900 and 390×844, direct `/lol` at 1440×900
and 390×844. Each was run cold and warm, two reps. Destinations were run at 1440×900 and 390×844. High DPR: 1920×1080 at
DPR 2 for the Hub guide. Screenshots in `docs/handoffs/perf1/`.

Not covered: Safari/WebKit and Firefox; real devices; CPU throttling; HTTP/2. `vite preview` is HTTP/1.1 (6 connections
per host). Production is likely HTTP/2, which should help the queued small files further but changes no conclusion.

## Remaining cold-load bottlenecks

1. **Cover splashes** arrive ~1.6 s after the Hub on desktop (4.5–4.7 s). They are four ~150 KB Railway JPGs (1215 px)
   that can't be named until the manifest returns, and they start after the critical art. There is no bandwidth slack to
   start them earlier: the critical set finishes ~0.2 s before the Hub mounts. Fix candidate: a server-side ~600 px cover
   derivative (the window is ≤ ~300 CSS px).
2. **Reduced-motion and direct `/lol` cold visits** still show the background 1.4–2 s after the Hub appears (it was 10+ s).
   The 450 ms reduced hold, or no Landing at all, leaves no time to warm ahead. The art is now 0.5–0.9 MB, so this is
   network time, not waste.
3. **Leaguecraft lobby art** (~11 MB of PNG: classroom background, two parchments, five ~1 MB role mascots) is the largest
   remaining cold payload. On a cold `/quiz` its images settle 9.7 s after the click. Only the guide Mogzy was in scope here.
   RFX1 already has 384 px role derivatives for small surfaces; the lobby draws the figures large, so it needs its own sizing pass.
4. **Commons Mogzy** still uses the 2.25 MB source PNG via CSS (it renders up to ~470 CSS px). Below the fold, but it is
   fetched when the Hall's second screen is laid out in stage mode. A ~1024 px derivative would cover it.
5. Render-blocking Google Fonts CSS (Cinzel) gates FCP and app start. That is out of scope here, but on a slow first
   connection it is the first thing a visitor waits for.
6. The 1–3 frame `lazy()` fallback on every route change (see E).

## Files

New: `src/lib/hub/academy-hub-warm.ts` (+ test), `src/academy/hub/hub-art.ts`, `src/lib/route-prefetch.test.ts`,
10 WebP assets (above), this doc, `docs/handoffs/perf1/`.

Changed: `src/pages/dev/mogzy-entry-v2/{MogzyEntryV2.tsx, AcademyScene.ts, AcademyFacade.tsx, MogzyEntryV2.autoEnter.test.tsx}`,
`src/pages/LolHub.tsx` (+ `LolHub.test.tsx`, `LolHub.background.test.tsx`), `src/lib/route-prefetch.ts`,
`src/components/mascot/mascot-assets.ts` (+ `MogzyMascot.test.tsx`), `src/components/mogzy-guide/MogzyGuide.tsx`
(+ test), `src/components/quiz/{LeaguecraftGuide.tsx, QuizSignUpGate.tsx}`,
`src/components/lol/{AcademyHubBook.tsx, MobileAcademyBookStack.tsx, AcademyCommons.tsx}`,
`src/components/lol/broadcast/AcademyBroadcastSurface.tsx` (+ `AcademyBroadcastCenterpiece.test.tsx`),
`src/pages/welcome/AcademyWelcomePage.tsx`, `docs/MOGZY_GUIDE_HANDOFF.md` (contract note for `scale`).

Source PNGs are kept in the repo and are no longer bundled for these surfaces (Vite only emits what is imported).

## Verdict

Ready for owner visual review. On a cold first visit the Landing now shows Mogzy (1.1 s; before, never) and hands off
at ~1.9 s instead of ~2.6 s. The Hub's background, book shells, Patch Brief and Mogzy are present on its first frame
(~3.1 s; before, 8.8–16 s), and Archives / Pro Play open in ~60 ms instead of 2.8–3.6 s. Items for the owner's eye: the
1100 ms hold, and the earlier hint fade-in.
