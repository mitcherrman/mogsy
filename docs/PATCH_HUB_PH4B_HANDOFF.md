# Patch Hub PH4-B: Impact level graph

Frontend only. No backend, domain (`lib/patch-impact`, `lib/patch-catchup`), Combat Lab, quiz, Studio or Graph1 changes. No new dependency (recharts `^2.15.4` is already a public-page dependency).

## 1. Baseline

| | |
|---|---|
| Base SHA (`origin/main`, verified after `git fetch`, no drift) | `a14747c24b1a5f248caac79854c2f831049f8e46` |
| Branch | `patchhub/ph4b-impact-graph` |
| Final SHA | `git rev-parse patchhub/ph4b-impact-graph` (the commit that adds this file; a SHA cannot name itself) |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph4b` (outside OneDrive; `node_modules` junction) |
| Audit input | `docs/PATCH_HUB_PH4_ACTIONS_AUDIT.md` read from `patchhub/ph4-actions-audit` (84f996b3); not copied or merged |

## 2. Files changed

New (all under `src/components/patch-impact/graph/`)
- `chart-model.ts`: pure data layer: `impactGraphEligibility`, `hasPlottableLevels`, `buildImpactChartModel`, `chartYAxis`
- `PatchImpactGraph.tsx`: eager shell (caption, text key, hidden table, axis note, lazy canvas, local error boundary)
- `PatchImpactLevelChart.tsx`: the recharts canvas (the only file importing `recharts`; lazy)
- Tests: `chart-model.test.ts` (25), `PatchImpactGraph.test.tsx` (35), `test-support.ts` (corpus rows and analyses, canvas width stub, pointer helper)

Edited
- `components/patch-impact/PatchImpactExplore.tsx`: mounts `<PatchImpactGraph>` between the level control and the readout (3 lines)
- `components/patch-impact/README.md`: "Level graph (PH4-B)" section
- `docs/PATCH_HUB_PH4B_HANDOFF.md`: this file

Not touched: `lib/patch-impact/**`, `lib/patch-impact-loader/**`, `usePatchImpactLoader`, `PatchImpact.tsx`, `PatchImpactChangeAnalysis.tsx`, `PatchReports.tsx`, anything PH4-A added, `package.json`.

## 3. Graph eligibility contract

`impactGraphEligibility(analysis)` returns `{ ok: true, projection }` only when PH2's verdict is `status: "projected"` **and** `projection.levels` is exactly 18 rows in order L1..L18 with finite `before`, `after` and `absDelta`.

| PH2 verdict | Graph |
|---|---|
| `projected`, complete 18 rows (Vi 26.19, Draven 26.19, Bel'Veth…) | yes |
| `projected` but a missing or invalid row | no (and no placeholder) |
| `parameter_only` (LeBlanc attack-speed growth, any attack-speed shape, `history_incomplete`) | no |
| `unavailable` (Vi Passive Shield 12% → 10%, mechanics, text, unmapped) | no |
| `null` / `undefined` | no |

Explore itself only renders for `projected` analyses, so the graph is also structurally unreachable for everything else. There is no Items graph: PH2 exposes no analogous projection.

## 4. PH2 authority boundary

- Input is `StatProjection`: `levels[]`, `crossoverLevel`, `checkpoints`, `family` (for the "base AD" label). Nothing else.
- Imports in the three production files: `recharts`, React, `@/lib/patch-impact/types` (types only) and `../format` (PH2's display helpers). None of `league-docs`, `patch-impact/{math,analyze,companion,families,grammar,continuity,eligibility}` or the loader.
- No `statAtLevel`, `riotLevelMultiplier`, growth constant, champion name, `fetch`, `useQuery`.
- Enforced by tests: a source scan (imports, forbidden identifiers, `0.7025`, champion-specific strings, network calls), a spy test (`statAtLevel` / `riotLevelMultiplier` are never called while drawing or interacting), and a **mutation-style authority test**: a projection whose numbers follow no stat curve (and whose `absDelta` is deliberately inconsistent) must be drawn exactly as supplied. Mutating `chart-model.ts` to `after: before + absDelta` makes two tests fail (checked).

## 5. Chart data contract

```ts
ImpactChartPoint = { level, before, after, absDelta }          // copied field for field from LevelPoint
ImpactChartModel = {
  points: 18 × ImpactChartPoint,
  xTicks: projection.checkpoints,                               // 1, 6, 11, 18
  crossoverLevel: projection.crossoverLevel | null,             // dropped only if it names no plotted level
  y: { domain, ticks, fromZero },                               // visual bounds from the supplied values
  statLabel: "base AD" …                                        // projectedStatLabel(family)
}
```

Every plotted dot carries `data-series`, `data-level`, `data-value` (the exact PH2 number), so tests (and DevTools) can compare screen to data.

## 6. Axis / domain policy

`chartYAxis(values)`, derived only from the supplied before/after values:

1. **Real curve** (spread ≥ 25% of the top value; every champion's level curve): crop to the data with 8% headroom each side, floored at 0, bounds snapped to 1/2/5 × 10ᵏ ticks (never more than 7). The curve's own growth dominates the height, so a +2 change stays a few percent of the plot rather than being blown up.
2. **Near-flat** (spread < 25% of the top value, e.g. values that barely change with level): anchor at 0. A cropped axis would stretch a small difference across the whole plot.
3. **Disclosure:** when the lower bound is not 0 the caption says "The vertical axis starts at 40, not 0." (exact bound from the model).
4. Degenerate input (empty, all zero) gets `[0, 1]`.

Measured: Vi 26.19 and Draven 26.19 both get 40–140 in steps of 20 (curve ≈ 61–127). Draven's +2 is ≈ 2% of the plot height: two close parallel lines, which is the honest picture (the exact delta sits in the readout and tooltip). Tests: Vi bounds contain every value; Draven's before/after gap < 5% of the domain and < 6% of the pixel height; flat curve anchors at 0; ticks aligned, ≤ 7, evenly stepped.

## 7. Crossover behaviour

PH2 owns it. The graph draws a dotted vertical line labelled "crosses at N" at `projection.crossoverLevel` only; nothing is detected from the values. Vi 26.19: PH2 says 8, the marker sits at the level-8 x position (verified in DOM and browser). Draven: PH2 says null, no marker. Tests: changing PH2's crossover moves the marker; `null` removes it; crossing data with PH2 saying `null` stays unmarked. The Explore sentence "The difference changes sign at level 8." and the "Crosses at 8" tick button are unchanged and remain the text equivalents; the hidden table marks the crossover row.

## 8. Selected-level synchronization

The scrubber's `level` (state in `PatchImpact`) is the single source of truth. The chart draws a vertical gold marker and enlarges both points at that level (`data-selected`). Slider, ticks, arrow/Page/Home/End keys all move it. The model is memoised on `projection` only: moving the level never rebuilds the chart data (test counts `buildImpactChartModel` calls). A click or tap on the plot calls the same `onLevelChange` (clamped by `PatchImpact`), so the slider, readout and marker follow. The plot adds no tab stops.

## 9. Performance and network

- **Zero requests from the graph.** Opening it and moving the level make no requests (unit tests assert fetch/XHR/beacon counts; browser run below).
- **Lazy:** `React.lazy(() => import("./PatchImpactLevelChart"))`, so recharts glue loads when Explore first opens a projected row. A same-height reserved block shows while it loads (no layout jump); a local error boundary hides the graph if the chunk fails (Explore's text stays).
- No animation (`isAnimationActive={false}` everywhere): nothing to disable for reduced motion.
- Width is measured with a `ResizeObserver` and the SVG is exactly the container width, so it can never cause horizontal page scroll. Height 176px (< 480px wide) / 208px. The figure is capped at 44rem so a desktop chart is not stretched across a wide card.

## 10. Tests

| Run | Result |
|---|---|
| PH4-B: `graph/chart-model.test.ts` | 25 pass |
| PH4-B: `graph/PatchImpactGraph.test.tsx` | 35 pass |
| PH4-A + PH1/PH2/PH3 regression set (`components/patch-impact`, `lib/patch-impact`, `patch-impact-loader`, `lib/patch-hub-share`, `usePatchHubShare`, `hooks/usePatch*`, `pages/lol/PatchReports*`, `lib/patch-reports`, `components/patch-reports`, `patch-catchup`, `lib/patch-catchup`, `patch-catchup-loader`, `components/patch-hub-share`, `components/lol/broadcast`), `--maxWorkers=4` | 42 files, **822 tests pass** (the PH4-A set was 40 files / 762; +2 files / +60 tests) |
| ESLint on `graph/` and `PatchImpactExplore.tsx` | 0 errors, 0 warnings |
| `tsc -p tsconfig.app.json --noEmit` | 6 errors on this branch and on a clean checkout of `a14747c2` (the `ph4a` worktree, same SHA); outputs byte-identical (OnboardingProfile, identity/connections, 4× practiceLeaveContract.test) |

Requested list → coverage: 1 renders for a projection; 2 and 3 no graph for parameter-only, unavailable (Vi Passive Shield), history-incomplete, and a Jhin-shaped attack-speed line; 4 points equal supplied values (model and DOM); 5 stat helpers never called (spy) plus source scan; 6 Vi 18 levels; 7 and 8 crossover from PH2 and follows it; 9 Draven constant +2 and parallel (constant pixel gap); 10 slider/ticks/keyboard/plot sync; 11 and 12 zero requests (Vi: 0 total; Draven: only PH2's own evidence request, none after the graph and interactions); 13 tooltip values and formatting; 14 SVG equals a 320px container, 640px picks the roomier height, nothing wider; 15 caption, 18-row table with crossover note, `aria-hidden` picture, dashed vs solid and hollow vs filled, text key; 16 PH4-A "Copy link to this change" sits after the graph and still writes the canonical URL; 17 the whole PH2 Explore and Impact suites pass unchanged. Real-corpus examples use the frozen production corpus (26.10–26.19) through the real analyzer.

## 11. Browser certification

Real route (`/lol/patch-reports?patch=26.19#<anchor>`), Vite dev server on this worktree (port 5344), **production API, read-only**, headless Edge via Playwright (script kept in the session scratchpad), plus the built-in browser for visual and tooltip checks. Fonts and Supabase were blocked in the headless runs to avoid stalls.

| Check | Desktop 1280 | Mobile 375 (touch) | Narrow 320 (touch) | Desktop, reduced motion |
|---|---|---|---|---|
| Vi graph: 36 points, 18 levels × 2 | yes | yes | yes | yes |
| Canvas / SVG width | 704 (capped) | 295 | 240 | 704 |
| Crossover marker | "crosses at 8", x equals the level-8 point | same | same | same |
| Slider ↔ marker sync (5, 7 via keyboard, 18 via End) | exact, readout level equal | same | same | same |
| Hover tooltip (level 9) | Before 86.6 / After 87.3 / Delta +0.7 | same (touch) | same | same |
| Click / tap plot at level 9 | slider 9, readout 86.6 / 87.3 / +0.7 | same | same | same |
| Draven: graph, no crossover, click → level 10 | yes | yes | yes | yes |
| Vi Passive Shield (`…__c-shield`) | no Impact, no graph | same | same | same |
| LeBlanc 26.17 AS growth (parameter-only) | Impact shown, no Explore, no graph | same | same | same |
| PH4-A "Copy link to this change" | present, canonical URL, 40px | same | same | same |
| Horizontal overflow (before and after interaction) | 0 | 0 | 0 | 0 |
| Duplicate IDs | 0 | 0 | 0 | 0 |
| Console / page errors | none | none | none | none |
| Animations running inside the graph | 0 | 0 | 0 | 0 |
| Focusable elements inside the figure | 0 | 0 | 0 | 0 |

Network (same flow, production API): Draven's open triggers exactly one request, `GET /api/meta/champion-stats` (PH2's own evidence fetch), **identical on this branch and on a `a14747c2` server without the graph**; the set of API paths is identical; slider, tick, keyboard and plot interaction add 0 API requests; Vi (all inputs Riot's) adds 0 on open. The only extra network is the lazy static JS chunk.

Keyboard: the slider takes focus and ArrowRight/End move the marker; the graph adds no tab stops. Screenshots were reviewed for desktop, 375 and 320 (Vi hover, Draven).

## 12. Known limitations

- Draven-style base-only changes (+2 at every level) draw two nearly overlapping lines. That is the honest scale; the exact value is in the readout and tooltip. The graph earns its place on crossover and growth changes (Vi 26.19, Bel'Veth 26.15).
- The plot is not keyboard-operable; the scrubber, tick buttons and hidden table are the keyboard and screen-reader path. Hover is mouse/touch only.
- At 320px the 18 points per line are close together (radius 2); readable but dense.
- The tooltip border follows the page theme (teal in the current theme) rather than a dedicated chart style.
- Jhin: the frozen corpus has no Jhin line. Coverage uses a Jhin-shaped attack-speed line (parameter-only) and a source scan that forbids champion-specific code.
- Not verified: Safari/iOS rendering, light theme, real touch devices. Screenshots under the headless/emulated viewports only.

## 13. Bundle implications

Production builds of this branch and of `a14747c2` (`vite build`, same machine):

| Chunk | Main | PH4-B |
|---|---|---|
| `PatchReports` (route chunk) | 130,011 B (40,044 gz) | 134,996 B (41,646 gz): +4,985 B (+1.6 KB gz) |
| `PatchImpactLevelChart` (lazy) | n/a | 4,144 B (1,779 gz) |
| `vendor-charts` (recharts) | 422,473 B | 422,473 B, unchanged |

`recharts` is already in `vendor-charts`, which `index.html` already preloads on main (other public pages use it), so PH4-B adds no new dependency weight and no new initial request. The route grows by ~1.6 KB gzipped (model, shell, hidden table, key). The recharts-using component is lazy, so the Patch Report page does not execute it until a projected Explore opens.

## 14. Merge instructions

```bash
git fetch origin && git rev-parse origin/main        # expect a14747c2…, else inspect drift
git merge --no-ff patchhub/ph4b-impact-graph
npx vitest run src/components/patch-impact src/lib/patch-hub-share src/pages/lol/PatchReports --maxWorkers=4
```

No conflicts expected: the only edit to an existing source file is three lines in `PatchImpactExplore.tsx`. Rollback: revert the merge (no data or schema). Do not run the whole Vitest suite in one process. Not pushed, not deployed.

## 15. Recommendation for PH4-C

Yes: "Open {Champion} in Combat Lab" is the next smallest useful slice. It is champion-only through the existing `buildCombatLabMatchupUrl({ attacker })` (already used by Pro Play), needs no backend or Combat Lab change, and fits the report's `entityActions` slot. Guardrails from the audit still apply: eligible only for Champions-section champion cards with a `mogzy_entity_ref` that yields a valid slug; copy says "Open Vi in Combat Lab", never "test this change" (Combat Lab has no patch parameter and may land on the reader's last items and level); no level, item, rune or patch parameters; no before/after wording. Do not expand it into historical patch simulation. Then PH4-D: integration and a combined browser pass.
