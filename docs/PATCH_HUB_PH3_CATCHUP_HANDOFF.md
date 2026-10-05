# PATCH HUB PH3-B — CATCH-UP DOMAIN LAYER (HANDOFF)

Pure frontend domain layer that answers **"What changed after patch X through patch Y?"** and organises the answer into trustworthy longitudinal data. No UI, no fetch, no React, no storage, no backend change, nothing pushed or deployed.

This file is the durable context for the next fresh instance (PH3-C loader + UI). It says what was built, what was decided, and what is deliberately **not** done. You should not need to re-read the PH3-A audit to continue — but its rules are the authority, so read §14–§15 of `docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md` (on `patchhub/ph3a-continuity-audit`) before changing any matcher rule.

---

## 1. Baseline

| Item | Value |
|---|---|
| Frontend repo | `mitcherrman/mogsy` |
| Base | `origin/main` = `a1958ff32de9e8c621124992d2340466f56fe89e` (verified by `git fetch`; no drift from the PH3-A audit base) |
| Branch | `patchhub/ph3b-catchup-domain` |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph3b-catchup-domain` (outside OneDrive; `node_modules` is a junction) |
| Detached base worktree (tsc differential) | `C:\Users\mlmit\mogzy-wt\ph3b-base` @ `a1958ff3` |
| PH3-A audit consumed | commit `3f3eec28`, branch `patchhub/ph3a-continuity-audit`, worktree `C:\Users\mlmit\mogzy-wt\ph3a-continuity-audit`: `docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md` and `docs/PATCH_HUB_PH3_CONTINUITY_FIXTURE.json` (read directly; the fixture is copied verbatim into `src/lib/patch-catchup/fixtures/`) |
| Backend | untouched |

Everything is in `src/lib/patch-catchup/**` plus this document. `PatchReports.tsx`, `patch-impact` (presentation, domain, loader), Patch Hub UI and the backend are **unmodified**. Shared code is reused by import only: `comparePatchVersions` / `parsePatchVersion` (`patch-impact/continuity`), `normalizeAbilitySlot` and `buildPatchReportStructure` (`patch-reports/report-structure`), `reportEntityAnchors` / `sectionKey` / `sectionAnchor` / `cardAnchors` (`patch-reports/semantic-ids`), and the `mkCard` / `mkChange` test builders.

---

## 2. The product contract in one picture

Catch-Up has **two truth layers**. The types make the distinction impossible to miss.

| Layer | Where | What it is |
|---|---|---|
| **1. Riot coverage** | `CatchUpReport.lines` (and `entity.riotLines`) | **Every** Riot-authored change line in `(since, through]`, **exactly once**, chronological report order, every section (Champions, Items, Systems, Support Adjustments, Arena, ARAM, Classic…). Never dropped because it cannot be chained. |
| **2. Mogzy continuity** | `CatchUpReport.continuity.chains` (and `entity.chains`) | An **optional overlay**: proven same-parameter chains over **SR Champions and SR Items only**. A strict subset of layer 1. **Never "all changes"** for an entity or a range. |

Why it matters (PH3-A): 26.16 "ADC MAGIC RESISTANCE" changes 27 champions from a Systems card, and Imperial Mandate AP lives in Support Adjustments. A champion view built from chain data alone would silently omit real changes. `report.sections` (with `chainable: false`) exists so the UI can say "Also changed in Systems / Support Adjustments".

---

## 3. API

```ts
import { buildCatchUpReport } from "@/lib/patch-catchup";

const result = buildCatchUpReport({
  reports,          // loaded PatchReportDetail[], any order; out-of-range reports ignored
  sincePatch,       // baseline — EXCLUDED
  throughPatch,     // explicit last patch — INCLUDED (the domain never reads "latest" itself)
  listedVersions,   // optional but strongly recommended: the /api/patch-reports index
  aliases,          // optional; default VERIFIED_ALIASES; pass [] to turn aliases off
});
// → { ok: true, report: CatchUpReport } | { ok: false, reason: "range_invalid", detail }
```

`detail` is `since_unparseable | through_unparseable | since_after_through`. `since === through` is `ok: true` with `range.status = "up_to_date"` and no lines.

### CatchUpReport (see `types.ts`, fully documented)

- `range` — `{ sincePatch, throughPatch, semantics: "since_exclusive_through_inclusive", status, coverageFloor, clampedToCoverageFloor }`.
- `includedPatches` — loaded patches in range, oldest first.
- `coverage` — `{ complete, expectedPatches, loadedPatches, missingPatches, duplicatePatches, unorderablePatches, issues[] }`. Each issue has `kind` (`missing_report | duplicate_report | unorderable_version | ordinal_gap | unverified_adjacency`) and `withholdsContinuity`.
- `lines: CatchUpRiotLine[]` — **layer 1**. Each line: `id`, `patch`, `order`, `entityKey`, `sectionKey`, `target` (the Patch Report page's own anchors — `?patch=<patch>#<target.change>` deep-links it), `card` and `change` (the **original payload objects**, same references, untouched), `key` (continuity key or null), `eligibility`, `chainId`, `identityRefusal`.
- `cardsWithoutChanges` — cards with no change lines (nothing is silently dropped).
- `sections` — per section: `chainable`, `lineCount`, `entityKeys`, `patches`.
- `entities` — `{ key, scope, name, appearances, riotLines (ALL), chains (subset) }`.
- `continuity` — **layer 2**: `{ status: "available" | "withheld", withheldReasons, chains, unclassified, refusals, aliases }`.
- `totals` — `{ riotLines, chainedLines, unchainedLines, chains, entities }`.

### CatchUpParameterChain

`id`, `identity` (JSON key string of the first step), `scope`, `entityKey`, `entityName`, `keys[]` (2 for a renamed property), `identityProvenance: "exact" | "approved_alias"`, `linkBasis[]`, `steps[]` (≥ 2, oldest first), `valueState`, `netUnavailableReason`, `net`, `concurrentMechanical`.

Each `CatchUpStep` has `patch`, `line`, the original `change`, the semantic `target`, `key`, `before` / `after` (`ValueFact`: verbatim `raw`, `canonical`, `template`, exact-decimal `numbers`) and `linkFromPrevious`.

`net` = `{ startPatch, endPatch, startRaw, endRaw, components }`. `startRaw` / `endRaw` are verbatim Riot strings (always safe to show). `components` are exact per-component `{ start, end, delta }` strings, or `null` when no state could be derived. Percent deltas are percentage points.

### Value states (precise definitions in `classify.ts`)

Chain of `n ≥ 2` steps, values `v0 … vn` (`v0` = before the first step, `vm` = value before the last step). Precedence, first match wins:

| `valueState` | Rule | PH3-A name |
|---|---|---|
| `returns_to_start_value` | `canonical(vn) === canonical(v0)`; needs no comparability | `exact_undo` |
| `net_unavailable` / `incomparable_shape` | value templates differ (rank count, `%`, ratio basis, qualifiers…) | `net_only: incomparable_shape` |
| `multi_step_non_monotonic` | some component changed direction **before** the final step (`v0…vm` not monotone); only endpoints + net deltas are stated | (PH3-A E labelled these relative to start; split out here) |
| `changed` | every moved component continued: `sign(dn)=sign(d0)`, `\|dn\|>\|d0\|` | `continued` |
| `partially_returns_toward_start` | every moved component: same sign, `0<\|dn\|<\|d0\|` | `partial_undo` |
| `moves_beyond_start` | every moved component: opposite sign, both non-zero | `over_revert` |
| `net_unavailable` / `mixed_components` | any other component behaviour (starts moving only in the last step, returns exactly while others do not, does not move in the last step) or disagreement between components | `net_only: mixed_components` |

Here `d0 = vm − v0` and `dn = vn − v0`, per numeric component, in exact decimals (`BigInt`-scaled; no floats). The domain states what the **values** did; it never says "reverted/undone" and never buff/nerf. A UI can render "Back to 105" from `returns_to_start_value` + `net.endRaw`, and "Net since 26.14: +5" from `net.components`.

---

## 4. Decisions you should know about

### Rules taken verbatim from PH3-A (do not loosen)

- **Identity** = exact key: scope (`sr.champions` | `sr.items`) + entity + ability slot **and** group title + property name, after `canonicalLabel` (NFKC, curly quotes, Unicode dashes, whitespace, trailing `:`, case-fold — no token rewriting).
- **Value continuity** (`later.before == earlier.after`, via `canonicalValue`) is a **gate**, never identity.
- `mogzy_property` and `mogzy_entity_ref` are **veto-only** (both non-null and different → refuse).
- **Per-patch uniqueness**: a key that occurs more than once in a patch (any card, any line kind) is ambiguous; the identity fails closed. Nothing is picked arbitrarily.
- **Identity-level fail-closed**: if an identity has ≥ 2 in-range occurrences and *any* occurrence is ambiguous/ineligible or an adjacent link fails, the identity gets **no chain at all** in that range.
- Only `change_kind === "numeric"` lines with eligible values (non-null, has a digit, no `…`/`...`, not a sentinel) and not a no-op can chain.
- Chains need **both** endpoints in range (X excluded). A chain whose earlier step is at or before X is not shown.

### Where the brief and PH3-A leave a choice, and what was chosen (stricter wins)

1. **Gaps withhold the whole range, not just the gap.** The brief says to suppress claims "requiring continuity across that gap"; PH3-A §12 says a missing/failed in-range report withholds **every** continuity claim. The stricter rule is implemented: `continuity.status = "withheld"`, `chains = []`, Riot lines still returned in full, and `coverage` says exactly why. A claim "net since X through Y" would otherwise be wrong whenever any patch in `(X, Y]` is unseen (it could have changed the parameter after the last seen step).
   - Hard (withholds): `missing_report` (listed or `through` but not supplied), `duplicate_report`, `unorderable_version`, `ordinal_gap` (same-year plain `YY.N` hole).
   - Soft (blocks only links across it): `unverified_adjacency` (year boundary `25.24→26.1`, `25.S1.x`, hotfix forms) — adjacency cannot be proven without the backend's `chronological_order`.
2. **A break is not "repaired" and later changes do not start a fragment chain.** The brief says later changes "may start a new chain"; PH3-A rule 13 / case H says an identity with a break gets no chain in that range, because a post-break fragment presented as "net since X" would be misleading. Implemented as PH3-A: no fragments. The lines remain; each carries `identityRefusal`, and `continuity.unclassified` lists the identity with the reason. If the owner wants post-break fragments, that is a deliberate rule change (add a `startsAfterBreak` marker, never a net since X).
3. **`multi_step_non_monotonic` is a split of PH3-A case E.** PH3-A labels `100→110→120→105` "partial undo relative to 100"; here that is `partially_returns_toward_start` (path to `vm` is monotone). `multi_step_non_monotonic` is reserved for direction changes **before** the last step (e.g. `100→110→105→108`). Net endpoints and deltas are still provided.
4. **Numeric normalisation is PH3-A §10, not PH2's grammar.** `patch-impact/grammar.ts` is a mirror of the backend's *base-stat* grammar (flat/compound/percent scalars, JS floats, rejects arrays and parentheticals). Catch-Up compares arbitrary ability values (rank arrays, ratios, parentheticals), PH3-A requires exact decimals, and PH2's own header says it must not be reused for this. `value.ts` implements exactly the enumerated folds: spacing, case, quotes/dashes, `ability power→ap`, `attack damage→ad`, seconds unit attached to a digit, decimal literal form. Qualifiers, parentheticals, `%`, trailing text and a unit's presence/absence always survive.
5. **Coverage floor.** With `listedVersions`, a baseline older than the oldest listed patch is *clamped*: Riot lines start at the floor (included), `range.clampedToCoverageFloor = true`, and no gap is reported for the span before the floor. Without `listedVersions` the floor is unknown, so the same range is withheld (`ordinal_gap`). **Always pass `listedVersions` from the loader.**
6. **No release-date catalog, no timestamps.** Ordering is `comparePatchVersions` only. Versions that are not dotted integers (`25.S1.1`, `26.12b`) cannot be placed, so they are reported (`unorderable_version`) and withhold continuity rather than being guessed.
7. **Duplicate reports** for one patch are a caller error: the first in input order supplies the lines (so this is the one input shape whose output depends on order), and continuity is withheld.
8. **Refusal precedence for a line:** `out_of_scope` → `not_numeric` → `value_ineligible` → `no_op_line` → `key_incomplete` → `key_ambiguous_in_patch`. `key_incomplete` (blank entity or property name) is the one reason not in PH3-A's list; it is a fail-closed addition (one production line — Zeri 26.10 R, a blank-property mechanical line — is `not_numeric`, so it never reaches it).
9. **Entity identity** never merges across modes: `<scope>|<name>` for SR scopes, `<section>|<type>|<name>` otherwise (an Arena "Locke" is a different entity from SR "Locke").
10. **Order and anchors come from the Patch Report page itself**: `buildPatchReportStructure` supplies official section order → entity → group → change order and the anchors, so a Catch-Up deep link cannot disagree with the report it points into.

### Corpus note (hash of the production capture)

The 10 production reports were re-captured on 2026-10-04 (public read-only GETs). 26.10–26.15 match the PH3-A full-body SHA-256 byte for byte. 26.16–26.19 have the **same byte length** but a different hash; a field-level diff of two consecutive 26.16 captures shows the only changing field is `historical_context_summary.adapter_elapsed_ms` (a per-request timing no Catch-Up code reads). The committed corpus is therefore trimmed to the fields the domain reads, and the tests pin the SHA-256 of each **trimmed** report plus the PH3-A card/line inventory (718 cards, 1,775 lines; SR 376 lines / 153 cards / 113 entities).

---

## 5. Alias registry (`aliases.ts`)

Exactly the two PH3-A Tier B rows, each pinned to scope, entity, slot, group title, both patches and the **verbatim raw strings** of both lines, with PH3-A's evidence and approval text kept in the row:

| id | Entity / group | From → To |
|---|---|---|
| `sylas-q-26.12-26.15` | Sylas, `Q - Chain Lash` (slot Q) | 26.12 "Initial Damage" → 26.15 "First Lash Damage" |
| `mordekaiser-r-26.14-26.15` | Mordekaiser, `R - Realm of Death` (slot R) | 26.14 "Stat Steal" → 26.15 "Stolen Stats" |

A row is a **link, not a synonym**. At runtime it must resolve to exactly one line pair whose pinned strings match, with the old key absent from the later patch and the new key absent from the earlier one, no occurrence of either key strictly between, contiguity verified, and the shared veto/continuity gates passing. Otherwise the row is refused (`alias_row_unresolved` / `alias_evidence_failed` / the failing gate) and no link exists. A row whose patches are outside the range is `inactive_out_of_range` and silent. Every alias outcome is in `continuity.aliases`.

Explicitly **not** aliased (PH3-A: plausible but unsafe; need external authority): Bel'Veth R, Poppy Q ×2, Qiyana, Xin Zhao, Locke, LeBlanc, Naafiri, Senna, Quinn, Imperial Mandate (cross-section), Arena Redemption, Arena Now You See Me. Only the owner extends the list, and a new row needs a second authority (PH3-A §8.3).

---

## 6. Files

All under `src/lib/patch-catchup/` unless noted.

| File | Role |
|---|---|
| `types.ts` | All public types, with the two-layer contract documented at the top |
| `value.ts` | `canonicalLabel`, `canonicalValue`, `isEligibleValue`, `valueTemplate`, `valueFact`, exact-decimal arithmetic |
| `patch-range.ts` | Semantic ordering, adjacency, range validation, coverage analysis |
| `keys.ts` | Closed scope map (`scopeOfCard`), `continuityKey`, key strings |
| `aliases.ts` | `VERIFIED_ALIASES` |
| `lines.ts` | Layer 1: collect every Riot line in page order with semantic anchors and line-level gates |
| `chains.ts` | Layer 2: alias resolution, identity groups, adjacent-link gates, chain assembly |
| `classify.ts` | Value-state classification over exact decimals |
| `build.ts` | `buildCatchUpReport`; entity and section aggregation; `buildCatchUpReportInternal` (test seam) |
| `index.ts` | Public exports |
| `test-support.ts` | Builders, corpus loader, PH3-A fixture typings |
| `fixtures/real-corpus-26.10-26.19.json` | Trimmed production corpus (452 KB) |
| `fixtures/ph3a-continuity-fixture.json` | PH3-A fixture, verbatim copy (121 KB) |
| `value.test.ts`, `patch-range.test.ts`, `chains.test.ts`, `corpus.test.ts` | 137 tests |
| `docs/PATCH_HUB_PH3_CATCHUP_HANDOFF.md` | this file |

Corpus fixture fields per change: `group_title, ability_slot, property_name, change_kind, is_new, before_raw, after_raw, mogzy_property`; per card: `entity_type, entity_name, entity_slug, section_id, section_title, mogzy_entity_ref`; per report: `patch_version, section_titles`. To re-capture: `GET /api/patch-reports/<v>` for each listed version, keep exactly those fields, keep every section.

---

## 7. Production results (26.10–26.19, `since` below the floor so everything is in range)

- **Riot lines accounted for: 1,775 / 1,775**, each exactly once (per patch 156, 173, 231, 130, 98, 201, 261, 202, 109, 214). For `since = 26.10` it is 1,619. Cards with no change lines (10) are reported separately.
- **Chains: 5.** Identities (`identity` strings):

| Entity | Identity key | Provenance | Value state |
|---|---|---|---|
| Doran's Helm | `["sr.items","doran's helm",null,"","health"]` | exact | `changed` (110 → 150, +40; 26.10 + 26.13) |
| Bel'Veth | `["sr.champions","bel'veth",null,"base stats","health growth"]` | exact | `returns_to_start_value` (105; 26.15 + 26.16; `concurrentMechanical`) |
| Sundered Sky | `["sr.items","sundered sky",null,"","health"]` | exact | `returns_to_start_value` (400; 26.16 + 26.17) |
| Sylas | `["sr.champions","sylas","Q","q - chain lash","initial damage"]` | approved_alias | `returns_to_start_value` (26.12 + 26.15) |
| Mordekaiser | `["sr.champions","mordekaiser","R","r - realm of death","stat steal"]` | approved_alias | `returns_to_start_value` (10%; 26.14 + 26.15; `concurrentMechanical`) |

- **Zero identity-level refusals** in the production corpus (`unclassified = []`, `refusals = []`).
- Line-level gates over the 1,775 lines: `out_of_scope` 1,399; SR `candidate` 351, `not_numeric` 17, `value_ineligible` 7 (Bel'Veth ×5, Senna, Viego), `no_op_line` 1 (Cassiopeia E 65%→65%, 26.18).
- All **45** PH3-A `(since, end]` ranges reproduce `expected_chains_by_range` exactly (identity, steps, tier, state). Doran's Helm appears only when the baseline predates 26.10.
- Aliases off → exactly the 3 Tier A chains. Scope allowlist removed (test seam) → still exactly the 3 Tier A chains, and none of the four prior-rule false positives chains in any mode.

---

## 8. Tests

`corpus.test.ts` (39) asserts, over the production corpus: fixture integrity (trimmed-report SHA-256, inventory); **invariant A** (every input line in every one of the 45 ranges + the whole corpus returned exactly once, by object reference; per-patch counts; entities sum to the lines; empty cards reported; determinism under shuffled order); **invariant B** (only the five identities; `expected_links` raw endpoints; aliases on/off; value states and net deltas; `concurrentMechanical` flags; all 45 ranges; X-excluded chain cuts); every one of the 93 PH3-A candidate-table rows is locatable and none of the 88 non-proven ever shares a chain; the named fences (Protein Shake, Serylda's Grudge, both Classic — General pairs, SR vs Arena Locke, 26.15 Riven duplicate R groups, Bel'Veth R, Poppy, Qiyana, Xin Zhao, LeBlanc, Naafiri, Senna, Quinn, Imperial Mandate); the 7 `value_ineligible` lines; the scope-allowlist-removed ablation; real-data coverage failures (missing 26.14, unlisted 26.16).

`chains.test.ts` (64) covers synthetic cases: every value-state (scalar net, exact return, partial, beyond-start, three-step, non-monotonic, oscillation-to-start, exact decimals, percent points, rank arrays unanimous / mixed / shape change / exact return, ratio-basis drift); later.before mismatch; units mismatch; cosmetic value and label folds; mechanical/no-op/unparseable lines inside an identity; duplicate-key ambiguity (same card, two cards, mechanical twin); same slot/different group; same value/different property; same property/different mode; item vs champion; `mogzy_property` and `mogzy_entity_ref` vetoes (and never creating identity); range effects (X excluded, intermediate patches, listed-missing, ordinal gap, year boundary); aliases (on/off, other entity, other group, outside pinned patches, inactive range, drifted pinned string, coexistence, key between, before mismatch, alias+exact extension); `concurrentMechanical`; coverage invariants (every line once, original references, page anchors, immutability on deep-frozen input, order independence).

`patch-range.test.ts` (20) and `value.test.ts` (14) cover ordering (`26.2 < 26.10`, `25.04 = 25.4`, unorderable forms), adjacency, range validation, up-to-date, clamping, missing/duplicate/unorderable coverage, and every PH3-A §15 token rule.

Mutation check (not committed): dropping the group from the key, skipping the before-mismatch gate, widening the scope, letting `mogzy_property` create identity, and folding `5` ≡ `5s` each fail 6–19 tests.

---

## 9. Certification

- Focused PH3-B tests: **137 / 137** pass.
- Patch-report libs (`src/lib/patch-reports`) + PH2 domain/loader (`src/lib/patch-impact`, `src/lib/patch-impact-loader`) + PH3-B together: **15 files, 366 tests pass** (no regression).
- ESLint on `src/lib/patch-catchup`: **15 files, 0 errors, 0 warnings**.
- `tsc -p tsconfig.app.json --noEmit` differential against the exact base `a1958ff3` (detached checkout): **6 errors before, the same 6 after (identical set), 0 in `patch-catchup`.** The 6 are pre-existing (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts` ×4).

---

## 10. Known limitations

1. **Low recall by design.** 5 chains over the whole 26.10–26.19 corpus (PH3-A: about 0.4 recall). Renames and format drift dominate the misses; recall grows only through reviewed alias rows. Do not optimise beyond the fixture.
2. **A Catch-Up view is not complete from chains.** Layer 1 is the complete list; chains are an overlay. The domain cannot detect SR changes published in a Systems card (26.16 ADC MAGIC RESISTANCE) — it only surfaces the section.
3. **"Back to a previous value" means back to the value before the first step** (`returns_to_start_value`). A return to an *intermediate* earlier value (`100→110→120→110`) is not separately labelled; the facts (`steps`, per-step `before`/`after`) are there.
4. **Riskiest case (PH3-A §16, unchanged):** an exact-key link across an ability rework that kept its group title and property label (Bel'Veth 26.15 Q is the template). The values stay true Riot values; `concurrentMechanical` and value-scoped wording are the mitigations. No payload gate can detect it.
5. **Year boundaries / `25.S1.x` / hotfix versions** are unlinkable until the backend exposes `chronological_order`. Display is unaffected.
6. **Backend `historical_context` is ignored** (PH3-A rule 15). Today it classifies 0 lines. If it ever becomes `analyzed` and disagrees with a Catch-Up value state for the same line, the Catch-Up label must be suppressed — a reconciliation test still has to be written once data exists.
7. **Report re-promotion** that rewrites raw text makes links and alias rows disappear (fail-closed by design). 322 of 322 PH2 lines still matched on 2026-10-03; the PH3-B corpus is re-pinned by trimmed hash.
8. **Duplicate input reports** make output depend on input order (see decision 7). The loader must de-duplicate.
9. **Cosmetic folds only**: a value that differs in any non-listed way (`175%` vs `175% against Monsters`, a dropped `(Levels 1 / 6 / 11)`, `5` vs `5s`) is a before-mismatch. That costs recall, never correctness.
10. `PatchContinuityKey.scope` accepts a `test:` form only for the audit's scope-removed ablation (`buildCatchUpReportInternal`). Production code only ever produces `sr.champions` / `sr.items`.

---

## 11. Next task — PH3-C (loader + presentation), GO

**PH3-C is GO**, conditional on keeping the two-layer contract in the UI.

Suggested split (loader first, then UI, each gated by the owner):

### PH3-C1 — loader (no UI)

- A TanStack Query hook (mirror `src/lib/patch-impact-loader/evidence.ts`: shared cache keyed per patch, fail-closed, lazy) that:
  1. fetches the index (`fetchPatchReports`) → `listedVersions`, and `throughPatch` = the newest listed version (the domain does not read "latest");
  2. fetches `fetchPatchReport(v)` for every listed version in `(since, through]` (baseline `since` itself is **not** needed);
  3. passes **only successfully loaded** reports as `reports` and the **full** listing as `listedVersions` — a failed load then surfaces as `missing_report` and withholds continuity automatically (never swallow a failure by dropping the version from the listing);
  4. de-duplicates by patch.
- The payload is about 1.9 MB uncompressed for all 10 reports; load only the range, in parallel, and reuse the Patch Report page's shared per-patch cache so opening Catch-Up after a Patch Report is free.
- Test with a fake fetcher: complete range, one failed patch, index failure, `since` below the floor, `since` = latest.

### PH3-C2 — presentation (owner design gate first)

Rules the UI must follow:

- Render `report.lines` grouped by patch/section/entity as the **primary** content. Chains are decoration on lines (`line.chainId`) and an optional summary — **never** the list of changes.
- Always show the Systems / Support Adjustments sections (`sections[].chainable === false`) so a champion view is never read as complete.
- Quote Riot values **verbatim** (`step.change.before_raw/after_raw`, `net.startRaw/endRaw`); anything computed (deltas) comes from `net.components`.
- Wording from `valueState`: `returns_to_start_value` → "Value back to {startRaw}" (never "reverted/undone"); `changed` / `partially_returns_toward_start` / `moves_beyond_start` / `multi_step_non_monotonic` → "Net since {X}: {delta}" where available; `net_unavailable` → endpoints only. If `concurrentMechanical`, state the value, not an intent.
- Coverage banner from `coverage.issues` / `continuity.status === "withheld"` ("Some patches failed to load; trends are hidden"); an `unverified_adjacency` note when relevant; `range.clampedToCoverageFloor` → "Coverage starts at {coverageFloor}".
- The "remembered patch" (browser-local) and the `?since=` route are UI concerns and belong in PH3-C2, not the domain.
- Deep links: `?patch=<line.patch>#<line.target.change>`.

### Not in scope for PH3-C

Combat Lab, graphs, quizzes, Pro Play, Studio, share buttons, new aliases (owner only), `chronological_order` (backend), any change to the Patch Report page's own slots (`PatchImpact` is untouched).
