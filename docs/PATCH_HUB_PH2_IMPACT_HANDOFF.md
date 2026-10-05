# PATCH HUB PH2 V1 — PATCH IMPACT: INTEGRATION AND CERTIFICATION HANDOFF

Status: **integrated and certified locally.** This is on branch `patchhub/ph2-integration` and has not been merged, pushed or deployed.

This document supersedes the PH2 contract/audit in `f676dcb3`, which is docs-only on `patchhub/ph2-impact-contract`. That audit was used as source material and was **not** cherry-picked. Its counts, crossover level, trust wording and wiring plan were superseded during PH2-A/B/C; §3 below lists every correction.

## 1. Baseline and inputs

| Item | Value |
|---|---|
| Integration base | frontend `origin/main` `cceae3ea1e4b8e4c889ebf1e3c92a90c502f071a`, verified 2026-10-04. It includes PH1 Patch Hub, the JLONG Journey/Ranked work, and the Jhin League Docs attack-speed fix. |
| Branch | `patchhub/ph2-integration` |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph2-integration`, created **outside** the OneDrive-synced repo, because an earlier PH2-B worktree had NUL-byte corruption. `node_modules` is a junction to the primary checkout. |
| Clean baseline checkout | `C:\Users\mlmit\mogzy-wt\ph2-base`, detached at `cceae3ea`, used for the TypeScript differential |

### Commits consumed

Each was applied with `git cherry-pick -x` from committed objects only. No files were copied from worker worktrees.

| Order | Worker commit | Slice | Integration commit |
|---|---|---|---|
| 1 | `c05ec713939c5d479acf3633756fb98359388b4d` | PH2-A pure domain (`src/lib/patch-impact/`) | `3bd58466` |
| 2 | `e863f03218e69867409f709cdac599b21d3d215a` | PH2-B presentation (`src/components/patch-impact/`) | `8e281a2e` |
| 3 | `8f5b462fa6528d7a878fe453a3fc7fe8f9c09b78` | PH2-B provenance correction | `2e5f724d` |
| 4 | `47d5ec99dc28a7cf83999c7a06d17eada5247778` | PH2-C lazy evidence loader (`src/lib/patch-impact-loader/`, `src/hooks/usePatchImpactLoader.ts`) | `0782107d` |
| 5 | — | Integration wiring, tests and this handoff | the commit that adds this file |

`f676dcb3` (the docs-only contract) was read as source material and is replaced by this file.

### Drift check and conflicts

- All four implementation commits add **new files only**.
- Between the PH2 lineage base `7c699a9a` and `cceae3ea`, the only change in any module that PH2 imports is in `src/lib/league-docs/api.ts`:
  - `ATTACK_SPEED_GROWTH_FROM_BASE` was added;
  - `attackSpeedAtLevel` gained an optional `championName` parameter.
- PH2-A imports only `statAtLevel` / `riotLevelMultiplier` and the `ChampionBaseStats` type, and it never calls `attackSpeedAtLevel`.
- **Result: all four cherry-picks were conflict-free.** The trees for `src/lib/patch-impact`, `src/components/patch-impact` and the PH2-C files are byte-identical to `8f5b462f` / `47d5ec99`, and a NUL-byte scan was clean.
- The fence is untouched. `git diff cceae3ea` is empty for:
  - `src/lib/league-docs/**` and `src/pages/lol-docs/**`, so the Jhin behaviour is preserved;
  - `src/lib/patch-reports/**` and `src/components/patch-reports/**`;
  - `src/lib/combat-lab/**`.

## 2. Final architecture (actual wiring)

```
PatchReports.tsx
  slots = useMemo({ changeAnalysis: (ctx) =>
            <PatchImpactChangeAnalysis ctx={ctx} patchVersion={detail.patch_version} /> },
          [detail.patch_version])
  <PatchHubSection section slots>            (PH1 seam, unchanged)
    → PatchReportEntityCard → PatchReportAbilityGroup → PatchReportChangeLine
        Riot exact before → after
        {slots.changeAnalysis(ctx)}          ← Impact renders here
        Mogzy evidence row / changeActions
        HistoricalContext

PatchImpactChangeAnalysis (src/components/patch-impact/PatchImpactChangeAnalysis.tsx)
  isImpactScopedLine(card, change)?  no → null (no hook mounted)
  ImpactBoundary (error boundary → null on throw)
    LoadedPatchImpact               ← the component body owns the hook
      usePatchImpactLoader({ card: ctx.entity.card, change: ctx.change, patchVersion })
      toPresentationState(loader)    (src/components/patch-impact/presentation-state.ts)
      <PatchImpact analysis projectionStatus onRequestProjection />
```

- **Hooks rules.** The render prop only returns an element. The hook lives in `LoadedPatchImpact`'s body.
- **Mount cost.** Lines outside Champions › Base Stats mount no loader. The gate is the same `isImpactScopedLine` that PH2-A's analyzer uses, so it cannot change any verdict.
- **Version source.** `patchVersion` comes from the loaded `detail.patch_version`, not from the URL. The cards and the version therefore always belong to the same report.
- **Error containment.** Anything that throws inside Impact, such as a payload the analyzer cannot read, drops only that annotation. Riot's line and the rest of the report stay on screen.

### State adapter (PH2-C → PH2-B)

| Loader `state.status` | `projectionStatus` | `onRequestProjection` | Result |
|---|---|---|---|
| `idle` | `idle` | `requestProjection` | PatchImpact requests once when Explore opens |
| `loading` | `loading` | — | The same instance keeps Explore open |
| `failed` | `error` | `requestProjection` (retry) | Shows "Try again"; the parameter fact is unchanged |
| `ready`, analysis is projected or a settled parameter-only verdict | `idle` | — | Final analysis |
| `ready`, analysis still `history_incomplete` (defensive) | `error` | — | No retry, because a retry would reread the same cached evidence |
| `not_required` | `idle` | — | Riot-only projection; nothing to load |
| `unavailable` | `idle` | — | PatchImpact renders the parameter fact (parameter-only) or nothing (unavailable) |

**Callback rule.** `onExplore` is **not wired.** `onRequestProjection` is the only evidence trigger. PatchImpact fires it once per open while the status is `idle`, and on Retry. The loader's `requestProjection` is itself idempotent: it is a no-op while loading or ready, and refetches only after a failure.

## 3. Final contract (corrections to the f676dcb3 audit)

| Topic | Old audit | Final |
|---|---|---|
| Real-corpus split, 53 Base Stats rows, 26.10–26.19 | 33 projected / 5 parameter-only / 15 unavailable | **35 / 3 / 15** |
| What "34" meant | — | It was never a projection count. It was the canonical-current comparison (latest change vs live canonical), replayed in PH2-A as 39 of 39 changed halves. |
| Uncertainty rule | Entity-wide: any unclassified Base Stats line blocks the champion | **Family-scoped** (see below) |
| Riot-only projections | — | Never blocked by canonical uncertainty |
| Vi 26.19 crossover | "between L6 and L7" / L7 | **L8**. L7 is still −0.062. |
| Provenance label | "Uses Mogzy data" if any half is `canonical_current` **or** `riot_later_before` | Follows the numeric inputs; see §3.2 |
| Wiring | `usePatchImpactEvidence` + `PatchReportImpactSlot` under `components/patch-reports` | `usePatchImpactLoader` + `PatchImpactChangeAnalysis` under `components/patch-impact` (§2) |
| Lazy keys | `["patch-reports", v]` | The existing keys: `["patch-reports"]`, `["patch-report", v]`, `["league-docs","champion-base-stats"]` |
| Initial render | "no new requests beyond champion-stats" | **Zero** Impact requests on render; `champion-stats` is fetched only after an Explore that needs it |

### 3.1 Family-scoped continuity

These rules apply to a canonical-held companion in family F, in P's card or any later report.

- A same-family line that is unmapped, or mapped but unparseable, blocks **F only** (`family_continuity_unproven`). HP uncertainty blocks HP, AD uncertainty blocks AD, and so on.
- A known line in another family, such as Brand's mana regeneration, is ignored.
- A Base Stats line that cannot be classified to **any** known family (`unclassified_base_stat_change`) blocks every Mogzy-dependent projection for that champion across the interval.
  - Example: Bel'Veth 26.15 AD, because of "Total Attack Animation".
- A projection whose complete numeric state comes from Riot (compound lines, same-card pairs) depends on no Mogzy continuity and is never blocked by this rule.
  - Example: Bel'Veth 26.15 health and armor.

**Supported in V1 (full projection):** HP, AD, Armor, MR and Mana (the pool), each as base and growth.

**Attack speed:** `base_attack_speed` and `attack_speed_growth` produce **parameter facts only** (`projection_deferred`). There is no AS projection.

**Unsupported (no Impact UI):**

- AS ratio, regen, move speed and attack range;
- ability lines, items and mode-section cards;
- a null `mogzy_property`;
- anything outside Champions › Base Stats.

### 3.2 Provenance (final rule, from `8f5b462f`)

Provenance describes the **numeric inputs** behind the displayed result. The provenance helper is `impactProvenanceKind` in `src/components/patch-impact/provenance.ts`.

| Analysis | Label (`data-impact-provenance`) |
|---|---|
| Parameter-only | `riot_parameter` |
| Projection whose inputs are all Riot-authored: `riot_line`, `riot_same_card`, compound halves and `riot_later_before` | `riot_projection` |
| Projection with at least one `canonical_current` input | `mogzy_companion_projection` |

The PH2-A domain flag `trust.usesMogzyData` is **not** used for the label. It has broader continuity semantics and can be true for `riot_later_before`.

### 3.3 Loader and cache behaviour (PH2-C)

- Nothing loads until `requestProjection()`. Mounting, re-rendering and slider moves are network-free.
- Need-detection is PH2-A's own answer: `parameter_only` with `history_incomplete` on a no-evidence run. Riot-only projections need nothing and fetch nothing.
- Evidence is gathered through `queryClient.fetchQuery` on the existing keys. It consists of:
  - the version list;
  - canonical stats;
  - P's own report;
  - every strictly later report.
- Assembled evidence is cached per selected patch under `["patch-impact","evidence",P]` and shared by every row in P. A row sees it only after its own request.
- Freshness: reports 30 min; canonical 1 h, which matches `useChampionBaseStats`. The evidence query uses `staleTime: Infinity` and `retry: false`.
- Ordering uses PH2-A's `comparePatchVersions` (numeric), never list order or a lexical sort.
- Failure handling:
  - P missing from the version list fails closed with `patch_chain_malformed`.
  - Reconciliation is passed through as the payloads report it. An absent block stays absent, and nothing is synthesised.

## 4. Corpus certification

The real corpus is frozen production reports 26.10–26.19 plus a champion-stats snapshot (`src/lib/patch-impact/fixtures/real-corpus-26.10-26.19.json`). It was checked at three layers:

| Layer | Test | Result |
|---|---|---|
| Domain | `src/lib/patch-impact/corpus.test.ts` | 35 / 3 / 15 |
| Loader | `src/lib/patch-impact-loader/corpus.test.ts` | Loader output equals hand-fed PH2-A for all 53 rows. 11 are Riot-only with no fetch. One list, one stats table, each report at most once. |
| **Wiring (new)** | `src/components/patch-impact/PatchImpactChangeAnalysis.corpus.test.tsx` | All 53 rows go through `buildPatchReportStructure` → slot ctx → `PatchImpactChangeAnalysis` → loader → `PatchImpact`, with every offered Explore opened. Rendered verdicts are **35 projected / 3 parameter-only / 15 unavailable (no DOM)**. Mounting makes zero requests; there is one list, one stats table, and each report at most once. |

No row is reclassified by the UI or the wiring.

**3 parameter-only:**

- Bel'Veth 26.15 AD: `unclassified_base_stat_change`;
- Locke 26.15 Health: `identity_unresolved`;
- LeBlanc 26.17 AS growth: `projection_deferred`.

**15 unavailable:**

- 13 with a null property;
- Alistar move speed;
- Bel'Veth "Total Attack Animation" (mechanical).

## 5. Browser certification (actual `/lol/patch-reports` route)

### Setup

- Vite dev server from the integration worktree on port 5297. The data is **production, read-only**, from `web-production-83e53.up.railway.app`.
- Headless Playwright with msedge. Google Fonts CSS was served from cache, Supabase was aborted (harness), and Railway assets came from a disk cache. API requests were never intercepted, except in the error test.
- Scripts were kept in the session scratchpad and are not committed.

### Width matrix (26.19, after opening Vi and Draven Explore by keyboard)

| Width | Page / body horizontal overflow | Duplicate IDs | Riot `after` vs Impact text | Order values → Impact → evidence | Page errors |
|---|---|---|---|---|---|
| 320 | 0 / 0 | none | 15 px bold vs 12 px muted | ✓ all 5 rows | 0 |
| 375 | 0 / 0 | none | 15 vs 12 | ✓ | 0 |
| 768 | 0 / 0 | none | 15 vs 12 | ✓ | 0 |
| 1280 | 0 / 0 | none | 15 vs 12 | ✓ | 0 |
| 1440 | 0 / 0 | none | 15 vs 12 | ✓ | 0 |

**Console errors.** Every load logged 28–30 `net::ERR_FAILED` console errors. All of them are `kewgjwrzpzpeltwidvuc.supabase.co` requests that the harness deliberately aborted, as confirmed with `requestfailed` logging. **The app logged zero console errors** in every flow, and there were zero page errors.

### Network (actual route)

| Scenario | Requests |
|---|---|
| Mount, any patch | `/api/patch-reports`, `/api/patch-reports/<P>`. Nothing else, including for all 53 rows. |
| 26.19: open Vi (Riot-only compound) | 0 |
| 26.19: open Draven (canonical) | `/api/meta/champion-stats` only. The list and 26.19 were cache hits. |
| 26.19: then Fiora, Lillia, Ryze | 0 (shared evidence) |
| Slider and keyboard on Vi and Draven | 0 |
| 26.18: open Bard (Riot-only) | 0 |
| 26.18: open Viego (canonical) | `champion-stats`, `26.19` |
| 26.18 → switch to 26.19 → open Draven | 0 (26.19 report and stats already cached) |
| 26.15: open Zac (canonical, older patch) | `champion-stats`, `26.16`, `26.17`, `26.18`, `26.19`, each once. 26.10–26.14 are never fetched. |
| 26.15: then Bel'Veth Health (Riot same-card) | 0 |
| Error test (stats → 500, then retry) | `champion-stats` ×2 (first failed, retry succeeded) |

### Interaction

- **Explore by keyboard.** It opens with Enter (Vi) and with Space (Draven). Space closes it, and Space reopens it.
- **Slider keys on Vi and Draven.** These are native range keys:
  - Home → 1, End → 18;
  - ArrowLeft → 17, ArrowDown → 16, ArrowRight → 17, ArrowUp → 18;
  - from 1, PageUp → 4 and PageDown → 1.
- **Checkpoints.** The buttons 1 / 6 / 11 / 18 set the slider and `aria-pressed` correctly.
- **Levels 1 and 18.** Vi L1 is 63 → 61 (−2, −3.2%) and L18 is 122.5 → 127.3 (+4.8, +3.9%). Draven L18 is 119.8 → 121.8 (+2, +1.7%).
- **Crossover.** Vi 26.19 shows a "Crosses at 8" button and the text "The difference changes sign at level 8". L8 is 83.2 → 83.5. Bel'Veth 26.15 Health crosses at 9.
- **Loading → projected.** Draven goes `parameter_only/loading/open` → `projected/slider/open`. Explore never closed.
- **Error → retry.** The state shows "could not be loaded… parameter change above is unaffected" with a Try again button. Riot's "62 → 64" stays visible. After retry the row is projected (`mogzy_companion_projection`) with Explore still open.
- **Provenance on screen:**
  - Vi, Bard, Bel'Veth and Vayne: `riot_projection`;
  - Draven, Fiora, Lillia, Ryze, Viego and Zac: `mogzy_companion_projection`. Zac's base input is marked as Mogzy data and its growth as Riot.
- **Attack speed.** LeBlanc 26.17 shows a parameter fact "Attack speed growth 2.35% → 1.5% −0.85 pts · −36.2%", with no Explore and no projection.
- **Permanently unavailable rows** render no Impact DOM. Riot's line is unchanged. Rows checked:
  - Alistar Move Speed 330 → 335;
  - Bel'Veth AS Ratio 0.85 → 0.67;
  - Bel'Veth Model Size;
  - Bel'Veth Basic Attack Damage Modifier.
- **Settled no-projection.** Bel'Veth 26.15 AD goes from `history_incomplete` to `unclassified_base_stat_change` after the load. Explore stays open with "A level projection is not available for this change."
- **Locke 26.15** (`identity_unresolved`) shows the parameter fact with no Explore.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, the Explore chevron has `transition-property: none`. Loading → projected works.

## 6. Tests, lint, TypeScript

### Combined run

`vitest run --maxWorkers=4` passed **30 files, 539 tests, 0 failures**. It covered:

- `src/lib/patch-impact`, `src/lib/patch-impact-loader` and `src/hooks/usePatchImpactLoader`;
- `src/components/patch-impact`, which includes the new wrapper tests and the wiring corpus test;
- `src/lib/patch-reports`, which includes the Patch Brief tests and `patch-brief.unchanged`;
- `src/components/patch-reports` and `src/pages/lol/PatchReports`, which includes the history integration;
- `src/lib/league-docs/attack-speed` and `src/pages/lol-docs/LeagueDocsChampionDetail.attack-speed` (the Jhin tests);
- `src/components/lol/broadcast` (Academy Broadcast and the Patch Brief feed);
- `src/pages/LolHub`, `src/test/funnel/canonicalSurfaces` and `src/lib/route-prefetch`.

### New tests

**`PatchImpactChangeAnalysis.test.tsx`** contains:

- 7 adapter cases covering every loader state;
- 4 tests on the real `PatchReports` page with a URL-routed fake backend, so the real accessors run. They check:
  - Impact appears only on Base Stats rows, ordered values → Impact → evidence;
  - mount makes exactly 2 requests and zero evidence requests;
  - one Explore makes 1 stats request plus later reports, with the list and P as cache hits;
  - slider moves, close/reopen and a Riot-only Explore make zero requests;
  - the error → retry path;
  - one open makes one request.

**`PatchImpactChangeAnalysis.corpus.test.tsx`** checks 35 / 3 / 15 through the wiring.

### Jhin regression

The current-main tests pass:

- Jhin L1 is 0.625 and L18 is 0.94375;
- League Docs displays 0.625 at L1 and ≈0.944 at L18;
- non-Jhin champions with a 0.0 ratio stay flat;
- a missing ratio falls back to base.

PH2 adds no attack-speed projection.

### ESLint

ESLint passed on all 36 changed or added TS/TSX files: **0 errors, 0 warnings**.

### TypeScript (`tsc -p tsconfig.app.json --noEmit`)

The integration tree has **6 errors**. Clean `cceae3ea`, in a separate detached checkout, has **6 errors**. The two lists are **identical**, file, position and message. All six are pre-existing:

- `OnboardingProfile.tsx(180,48)`;
- `identity/connections.ts(263,13)`;
- `quiz/practiceLeaveContract.test.ts` lines 37–40.

PH2 introduces none.

## 7. Files changed by integration (beyond the four cherry-picks)

| File | Change |
|---|---|
| `src/pages/lol/PatchReports.tsx` | Memoised `slots` with `changeAnalysis` → `PatchImpactChangeAnalysis`, passed to `PatchHubSection` |
| `src/components/patch-impact/PatchImpactChangeAnalysis.tsx` | New. Scope gate, error boundary, and the hook-owning component |
| `src/components/patch-impact/presentation-state.ts` | New. Pure `toPresentationState` |
| `src/components/patch-impact/index.ts` | New exports |
| `src/components/patch-impact/PatchImpactChangeAnalysis.test.tsx` | New |
| `src/components/patch-impact/PatchImpactChangeAnalysis.corpus.test.tsx` | New |
| `docs/PATCH_HUB_PH2_IMPACT_HANDOFF.md` | New (this file) |

## 8. Known limitations

- **No `riot_later_before` case exists in the real corpus.** That path, and its Riot-only provenance, is covered by synthetic PH2-A and PH2-B tests only.
- **Canonical hotfixes are undetectable.** A canonical correction that never appeared in a patch note (a wiki correction or a B-patch) cannot be detected. The Explore provenance footer always names the canonical value it relied on.
- **Stored `mogzy_property` values are build-time.** Rows whose labels master's resolver now maps stay unavailable until the reports are re-promoted. These are Mana, Attack Speed, Attack Speed Ratio and the regen labels, affecting Camille, Poppy, Bel'Veth and LeBlanc. The frontend never re-maps from wording.
- **Old patches fetch every later report.** An old patch's first canonical Explore reads every later report, for example four for 26.15 and up to nine for 26.10. This happens once per cache window and is shared by all rows.
- **Theoretical edge case.** A "ready but still `history_incomplete`" result shows as a failed load without retry. The loader's own chain check should make this unreachable.
- **Browser certification used a headless harness.** The in-app Browser pane was hidden and too slow for the matrix. The harness aborted Supabase, so the account-dependent HUD chrome is not represented.

## 9. Future V1.1

- **Attack speed remains excluded from projection.** V1 shows AS parameter facts only.
- **Jhin is fixed in League Docs.** Jhin's exceptional attack-speed semantics (growth scales from base AS; `ATTACK_SPEED_GROWTH_FROM_BASE`) are now fixed on main (`cceae3ea`). A V1.1 AS projection must call that parity-tested helper and must never use flat math.
- **AS ratio availability still matters.** `/api/meta/champion-stats` has no `attack_speed_ratio`. Ratio lines in the stored payloads have a null `mogzy_property`, so a same-patch ratio change, like LeBlanc 26.17, is not detectable by mapping. Canonical ratio also disagrees with Riot (Vayne 0.658 vs `.67`). Backend follow-up: add the ratio (plus `hp5_per_level`, `mp5`, `mp5_per_level`) to `champion-stats`.
- **Whisper is a separate backend problem.** Jhin's AD and move speed from Whisper are not modelled by Combat Lab. Jhin's 3% growth lives in JhinPassive, not the character record, so it is probably not bonus AS for Whisper.
- **Other candidates:**
  - regen projections, once the columns are exposed;
  - move speed and attack range as parameter-only;
  - optional backend `mogzy_components` per compound line, which would retire the frontend grammar mirror;
  - re-promoting 26.10–26.19 to lift the null-property blocks.
