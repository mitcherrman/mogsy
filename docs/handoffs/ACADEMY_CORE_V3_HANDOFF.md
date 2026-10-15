# Academy Core V3 — handoff (owner visual acceptance pending)

Branch `design/academy-core-v1`. Route `/lol/dev/academy-core` (preview only; `/lol` untouched, nothing merged or deployed, no backend changes).
Design as implemented in d8bd07fa: four real `AcademyHubBook` covers inside the Hextech Core (Leaguecraft + Pro Play upper, Combat Sim + Archives lower), crystal cycles previews, one-click nav after a 240 ms activation, Patch Report island + radio kept separate, compact Daily / Ranked.

## What this pass did
- Ran the V3 inspection suite (17 tests) and the perf harness against a fresh production build.
- **Defect fixed — runaway page height on short desktops (1280×660 / 1280×720, live data):** `--acore-floor` was measured from the hero's bottom while the island's bottom padding derived from it, so when the island (taller with a real, large Patch Brief) set the hero height, the two fed each other and the page grew without bound (5k → 21k px). The mocked e2e brief is small, so the suite never saw it. Fix: cap the measured floor at 140 px (`AcademyCorePage.tsx`). Verified with live data: scrollHeight 1113 px at 1280×660, stable.
- Test fixes: `loads one frame…` asserted no Ryze/Ahri icons, but those are the patch brief's own icons (island + strata); now asserts only brief icons are requested. Perf harness updated for V3 selectors (`academy-core-slot-*`), output dir → `academy-core-v3`.
- **Process note:** the first perf run silently hit a stale V2 server already holding port 8126; those numbers were discarded. All figures below are from this build on port 8137.

## Results
| check | result |
|---|---|
| `playwright … e2e/academy-core.spec.ts` | 17 / 17 pass (1366, 1920, 1280×660, 390, 320, 430; hover, one-click, rapid click, reduced motion, crystal, touch, text zoom) |
| vitest `src/pages/dev/academy-core` | 33 / 33 pass |
| perf harness | 9 / 9 ran |
| `tsc` | no errors in academy-core files (repo has pre-existing unrelated errors, e.g. `lib/identity/connections.ts`) |

Perf (10 Mbps / 40 ms, one rep per cell; full table in `academy-core-v3/perf.md`, raw in `perf.json`):

| | Core | Hub |
|---|---|---|
| 1366×768 cold CTA | 1193 ms | 1678 ms |
| 1366×768 covers painted | 2874–2898 ms | 3608 ms |
| CLS | ≤ 0.009 | 0.03–0.09 |
| cold bytes 1366 (images) | 3231 KB (1841) | 3489 KB (2164) |
| requests | 302 | 268 |
| click → Archives content, 1×  | 316 ms (incl. 240 ms activation) | 163 ms |
| hover → state, 4× CPU | 391 ms, max long task 61 ms | 263 ms (not comparable: Hub has no state flip, measure is hover+50) |

Honest read: loading is ahead of the Hub on every cold milestone and layout shift is near zero. Core adds ~30 requests (four splashes + frame) and ~110 ms more click latency by design (the activation beat). The 4× hover figure is the one number to watch; single rep, one 61 ms long task, not investigated further.

## Open items for the owner
1. Visual acceptance of the screenshots in `docs/handoffs/academy-core-v3/` (e2e fixtures render every cover as Ahri; real covers are Ryze / Ahri / Akali / Viktor — `desktop-1280x660-short.png` is live data).
2. At 1280×660 with a large live brief the island, not the stage, sets the hero height, leaving a gap between chassis feet and the bench. Acceptable to me; flag if not.
3. Is the 240 ms activation worth the +150 ms to content? Reduced-motion users skip it.
4. Port 8126 is held by a stale V2 preview server (PID 26548 at the time) — not mine, left running.
