# Patch Impact presentation (PH2-B)

`<PatchImpact />` is the reusable, presentation-only "Mogzy Impact" block for one
champion base-stat change. It is meant to be inserted through Patch Report's
existing `changeAnalysis` slot, under Riot's own line, and to stay visually
secondary to it.

It takes an already-computed `PatchImpactAnalysis` from `src/lib/patch-impact`
(PH2-A). It does not fetch, does not import the analyzer, does no stat math
(every number is read from `projection.levels`), and never reads Mogzy's
per-line status or promote-time "current raw" snapshot.

```tsx
<PatchImpact
  analysis={analysis}                 // PatchImpactAnalysis | null | undefined
  projectionStatus="idle"             // "idle" | "loading" | "error"
  onExplore={() => {}}                // reader opened Explore (every open)
  onRequestProjection={() => {}}      // projection not loaded but loadable
  defaultOpen={false}
  defaultLevel={18}
  onLevelChange={(level) => {}}
/>
```

| Analysis | Renders |
|---|---|
| `unavailable`, `null`, `undefined` | nothing |
| `parameter_only`, `projection_deferred` (attack speed) | parameter change only. No Explore, no slider, no error tone |
| `parameter_only`, `history_incomplete` | parameter change. Explore appears only if `onRequestProjection` is given or `projectionStatus` is not `idle` |
| `parameter_only`, any other reason | parameter change only (no Explore) |
| `projected` | parameter change, level-18 projected summary, Explore with the 1–18 slider |

## Loading contract (no remount)

1. Initial render: `parameter_only` / `history_incomplete`.
2. Reader opens Explore: `onExplore` fires, and `onRequestProjection` fires once
   per open while `projectionStatus === "idle"`.
3. Wrapper fetches and passes `projectionStatus="loading"` (quiet `role=status`).
4. Wrapper passes the richer `projected` analysis (and `"idle"`). Same instance:
   the open state and the selected level are kept.
5. `"error"`: a quiet message plus "Try again" (calls `onRequestProjection`).
   It never auto-retries and never restyles Riot's line.

## Provenance (quiet, in the Explore footer and as `data-impact-provenance`)

- `riot_parameter`: parameter facts, Riot only.
- `riot_projection`: every numeric input is Riot-authored: `riot_line`,
  `riot_same_card` (including compound Riot values) and `riot_later_before`
  (a later Riot patch's before-value used to reconstruct the companion).
- `mogzy_companion_projection`: at least one input's actual value is
  `canonical_current`. Nothing else counts: the domain's `trust.usesMogzyData`
  flag is not consulted, so continuity validation never makes a projection
  read as Mogzy-backed.

## Copy rules

Names the parameter ("Armor growth", "Base AD") and the projected *base* stat
("Base AD at level 18"). Never "power", "stronger", "weaker", buff/nerf,
win rate, tier, rankings, Pro Play or Combat Lab (a test enforces it).

## Accessibility and motion

Native `<details>`/`<summary>`; a named native `<input type="range">` with
`aria-valuetext` ("Level 11: 98.5 → 95.8 base AD"); arrows step 1, Page keys 3,
Home/End jump; 1 / 6 / 11 / 18 markers (plus the domain's crossover level) are
real buttons. There is no JS animation. The only transitions (chevron, marker
colour) carry `motion-reduce:transition-none` and are also zeroed by the app's
`html.reduce-motion`.

## Level graph (PH4-B)

Inside Explore, between the level control and the readout, a projected change
shows a Before / After line chart for levels 1–18 (`graph/`).

- **PH2 is the only authority.** The graph is fed `projection.levels`,
  `projection.crossoverLevel` and `projection.checkpoints` and nothing else. It
  never imports the stat curve, the analyzer or the family registry, never
  derives a value, and never decides crossover semantics (a source-scan test
  enforces the imports; a mutation test feeds it values that follow no curve).
- **Eligibility** (`impactGraphEligibility`): only a `projected` analysis with
  exactly 18 ordered, finite rows. Parameter-only (attack speed, history gaps),
  unavailable, mechanics and text changes get no graph and no placeholder.
- **Structure:** `chart-model.ts` (pure: rows, eligibility, y-axis policy),
  `PatchImpactGraph.tsx` (eager shell: caption, key, text table, lazy loading),
  `PatchImpactLevelChart.tsx` (the only file that imports `recharts`; lazy).
- **Level sync:** the scrubber's `level` is the single source of truth. The chart
  draws it (a vertical marker and enlarged points); a click or tap on the plot
  calls `onLevelChange`. Moving the level never rebuilds the data.
- **Y axis:** cropped to the curve with 8% headroom (floored at 0), but anchored at
  0 when the plotted values are near-flat (spread < 25% of the top value), so a
  small change is never stretched across the plot. A cropped axis is disclosed in
  text ("The vertical axis starts at 40, not 0.").
- **Not colour alone:** Before is a dashed grey line with hollow points, After a
  solid gold line with filled points; the key is text. The picture is
  `aria-hidden`; a visually hidden table lists all 18 levels (marking the
  crossover row) and the scrubber and readout carry the same numbers.
- **No animation**, no extra tab stops, no network: opening the graph or moving
  the level makes no request. The recharts chunk is a static asset loaded when
  Explore first opens a projected row.
