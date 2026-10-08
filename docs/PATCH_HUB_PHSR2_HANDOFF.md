# PHSR2 — Mogzy Impact discovery (Summoner's Rift Patch Hub)

Branch `patchhub/phsr2-impact-discovery`, worktree `C:\Users\mlmit\mogzy-wt\phsr2`.
Base: origin/main `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` (verified before branching).
Code commit: `1ccb51d2`. Not pushed, merged or deployed.

## What changed

The closed Explore disclosure named nothing ("Explore impact"). It now says what opens,
chosen from PH2 state only (`src/components/patch-impact/cta.ts`, pure):

| PH2 state | Closed label | Accessible name continues |
|---|---|---|
| `projected`, `projection.crossoverLevel = N` | **View crossover at level N** | base X before/after at every level 1–18, and where the difference changes sign |
| `projected`, no crossover | **View level 1–18 impact** | base X before/after at every level 1–18 |
| `parameter_only` + `history_incomplete` (loadable; opening loads it) | **View level 1–18 impact** | *loads* base X before/after at every level 1–18 |
| `parameter_only`, settled (only shown once already open) | **View impact details** | what Mogzy can and cannot project |
| `unavailable` / no analysis / deferred family | no disclosure (unchanged) | — |

- Label text is visible; the continuation is `sr-only` inside the native `<summary>`
  (its accessible name). `data-cta` = `crossover | levels | details` for tests/captures.
- CTA styled as a gold, medium-weight text link (hover underline), still a 40px target,
  chevron kept for disclosure affordance. No card, no fill.
- Compact summary: "MOGZY IMPACT" title at full gold (was /80), left rail /45 (was /30).
  Section label "Projected stat impact" → **"Resulting stat"**; Explore slider label
  "Projected stat impact · champion level" → **"Resulting {base AD} · champion level"**.
- Not changed: graph, slider, ticks, readout, provenance, PH4-A copy link, loader,
  PH2 math, visibility rules for Explore, any file outside `src/components/patch-impact/`.

### Decisions worth an owner glance
- **"See where this becomes a buff" was not used**: the Impact copy rule (format.ts +
  `PatchImpact.test.tsx` BANNED regex) forbids buff/nerf. "View crossover at level N" carries
  the same promise neutrally.
- Draven-type lines are `parameter_only/history_incomplete` while closed (canonical
  growth not loaded yet), so the CTA cannot know about a crossover and never claims one.
  If the loaded projection had a crossover, the label would switch to the crossover form
  after opening (no 26.10–26.19 corpus line does this).
- One corpus line, Bel'Veth 26.15 Attack Damage, is loadable when closed but settles to
  `unclassified_base_stat_change` after loading: it shows "View level 1–18 impact" closed,
  then "View impact details" plus the existing "not available" line once open. The closed
  label is a promise PH2 cannot settle without the fetch; accepted as honest-by-default.
- Projected-without-crossover uses one label ("View level 1–18 impact") rather than
  splitting "level-by-level" vs "1–18": both open the same view.

## Real lines (26.19, production corpus)

| Line | PH2 closed | CTA | After open |
|---|---|---|---|
| Vi Attack Damage `63 + 3.5/Level → 61 + 3.9/Level` | projected, crossover 8 | View crossover at level 8 | graph, "Crosses at 8" tick; no fetch |
| Draven Attack Damage 62 → 64 | loadable | View level 1–18 impact | projected, no crossover |
| Fiora Health Growth 99 → 105 | loadable | View level 1–18 impact | projected |
| Lillia Armor 22 → 24 | loadable | View level 1–18 impact | projected |
| Ryze Armor Growth 4.2 → 4.7 | loadable | View level 1–18 impact | projected |
| LeBlanc 26.17 Attack Speed Growth | parameter-only (deferred) | none | — |
| Vi Passive Shield 12% → 10% | out of scope | none (no Impact) | — |

## Tests

- New `PatchImpact.discovery.test.tsx` (20 tests): pure CTA choice for crossover / no
  crossover / parameter-only / unavailable; CTA reads `crossoverLevel` verbatim (mutated
  13 → "level 13", null → levels); Vi/Draven/Fiora/Lillia/Ryze through the real wiring
  (report structure → PatchImpactChangeAnalysis → loader) with zero requests while closed;
  Draven never says cross/sign before or after load; Vi Shield and LeBlanc have no CTA;
  accessible names; vocabulary rule; opening Vi shows graph, crossover tick, slider moves
  the readout, PH4-A "Copy link to this change" copies `?patch=26.19#…`, still no fetch.
- `PatchImpact.test.tsx`: one assertion updated for the "Resulting stat" label.
- Results: `src/components/patch-impact` 8 files / 143 tests pass. Regression set
  (`PatchReports*` incl. ph4a/ph4c/history/catchup, `usePatchImpactLoader`,
  `usePatchHubShare`, `lib/patch-impact*`, `lib/patch-hub-share`, `patch-reports`,
  `patch-hub-share` components): 19 files / 287 tests pass.
- ESLint `src/components/patch-impact`: clean.
- `tsc -p tsconfig.app.json`: 2 errors, both in untouched files
  (`OnboardingProfile.tsx`, `identity/connections.ts`) → 0 new vs main.

## Browser (headless msedge, Supabase blocked, local dev server on 5362)

Captures in `docs/phsr2-captures/` (`{desktop,m375}-{vi,draven,fiora}-{closed,open}.png`,
`report.json`). At 1280 and 375:
- every Explore closed on load (`autoOpen: 0`); CTA 40px tall, gold;
- `PatchImpactLevelChart` chunk and `/api/meta/champion-stats` not requested before the
  first open (0 → 1 after);
- page horizontal overflow 0. The only descendants past the line edge when open are
  PH4-B's `sr-only` data table (visually clipped; pre-existing).
- Riot's value boxes stay the dominant element; Impact remains a rail annotation.

## Integration

Ready. Touches only `src/components/patch-impact/` (PatchImpact.tsx, PatchImpactExplore.tsx
one label, new cta.ts, tests). Likely-conflict surface with sibling PHSR workstreams: none
expected unless another stream edits `PatchImpact.tsx`'s summary/header block. Tests or
captures elsewhere that match the old text "Explore impact" or "Projected stat impact"
would need the new labels (none in this repo at base).
