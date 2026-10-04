# Patch Impact domain layer (PH2-A)

Pure analysis of what a champion base-stat change in a patch report does to the
champion's stat at each level. No React, no I/O, no fetching: the caller supplies
every piece of evidence.

Contract source: `docs/PATCH_HUB_PH2_IMPACT_HANDOFF.md` (branch
`patchhub/ph2-impact-contract`, `f676dcb3`), plus the final policy decisions
below. Base: frontend `origin/main` `7c699a9a`.

```ts
analyzeChampionStatChange({
  card, change, patchVersion,
  canonical?,               // live /api/meta/champion-stats rows
  laterReports?,            // PatchReportDetail for every version after P
  laterVersionsExpected?,   // every version /api/patch-reports lists
  reconciliationByVersion?, // include P's own status
}): PatchImpactAnalysis     // unavailable | parameter_only | projected
```

| File | Job |
|---|---|
| `types.ts` | Contracts: analysis union, facts, projection, unavailable reasons |
| `families.ts` | V1 property gate; controlled Base Stats label classifier (continuity only) |
| `grammar.ts` | Anchored numeric grammar, a mirror of backend `base_stat_grammar` |
| `eligibility.ts` | Scope + property gate + parse → `EligibleLine` |
| `companion.ts` | Companion-state reconstruction (Riot compound / same card / canonical) |
| `continuity.ts` | Continuity proof across later reports; version coverage |
| `math.ts` | Facts, deltas, level projection, crossover (reuses `statAtLevel`) |
| `analyze.ts` | Assembly into `PatchImpactAnalysis` |
| `fixtures/` | Frozen real corpus 26.10–26.19 + hand-built report builders |

## Supported families (V1)

Parameter facts **and** level projection: HP, AD, Armor, MR, Mana (the pool,
`mp` / `mp_per_level`; mana *regeneration* is a different family), each as base
and per-level growth. Flat math only: `statAtLevel(base, growth, L)`.

Parameter facts only: `base_attack_speed`, `attack_speed_growth`
(`projection_deferred`). No projected attack speed.

Unsupported (`unavailable`): attack-speed ratio, regen, move speed, attack range,
ability lines, items, modes, non-Champions cards.

## Rules worth knowing

- `mogzy_property` is the only property gate. A null property is `unavailable`;
  nothing is re-mapped from wording. `mogzy_status`, `mogzy_current_raw` and
  report reconciliation never gate or feed parameter facts.
- Eligible lines: Champions-section champion cards, numeric, no ability slot,
  `group_title` "Base Stats" (stricter than the handoff: ability group titles can
  carry the slot even when `ability_slot` is empty).
- Companion order: compound line (both halves Riot) → same-card line → canonical
  with continuity proof. A rule that applies and fails ends in "unavailable".
- Levels are integers 1–18 (`assertImpactLevel` throws, `clampImpactLevel` is for
  UI input). A zero baseline gives `relDelta: null` plus a reason; never
  Infinity/NaN.

## Final continuity policy (family-scoped)

A line elsewhere in the champion's Base Stats history (P's own card or any later
report) is classified by `classifyBaseStatLine`:

1. `mogzy_property`, when present, via the 19-property family table.
2. Otherwise an **exact** label lookup (backend `_BASE_STAT_LABELS`, mirrored; the
   four documented no-column labels are "touches no canonical stat").
3. Anything else is `unclassified`.

Effect on a canonical-held companion in family F:

- a same-family line that is unmapped or mapped-but-unparseable blocks F only
  (`family_continuity_unproven`); HP uncertainty does not block AD;
- a line in another known family (e.g. Brand's mana regeneration) is ignored;
- an `unclassified` line blocks every canonical-dependent projection for the
  champion across the interval (`unclassified_base_stat_change`).

Interpretation to confirm: projections whose four values all come from Riot
(compound lines, same-card pairs) depend on no lineage and are never blocked by
this, e.g. Bel'Veth 26.15 health/armor despite the unclassifiable Total Attack
Animation line in the same card.

## Evidence-derived corrections to the handoff

- **Crossover level.** Vi 26.19 (63 + 3.5 → 61 + 3.9) first turns positive at
  L8, not "between L6 and L7": L7 is still −0.062. `crossoverLevel` = 8.
- **Counts.** Authoritative real-corpus split is 35 projected / 3 parameter-only
  / 15 unavailable (see `corpus.test.ts`). The handoff's 33 was the entity-wide
  rule; "34" was never a projectable count (it is the latest-change/canonical
  agreement check, replayed there as 39 of 39 changed halves).

## Known gaps

- No `riot_later_before` case exists in the real corpus; that path is covered by
  synthetic tests only.
- A canonical hotfix that never appeared in a patch note cannot be detected
  (disclosed residual risk in the handoff).
- `attackSpeedAtLevel` Jhin drift is out of scope (separate task).
