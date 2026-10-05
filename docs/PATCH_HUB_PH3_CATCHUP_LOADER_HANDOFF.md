# PATCH HUB PH3-C — CATCH-UP LOADER (HANDOFF)

Frontend data-loading/state layer that acquires exactly the evidence the PH3-B Catch-Up domain needs ("what changed after patch X through patch Y?") from the existing Patch Report APIs and TanStack cache. **No UI, no `PatchReports.tsx` change, no backend change, no new aliases, nothing pushed, merged, published or deployed.**

This file is the durable context for PH3-D (the Catch-Up UI). Read it, then `docs/PATCH_HUB_PH3_CATCHUP_HANDOFF.md` (PH3-B: the two-layer contract and the UI wording rules, §2, §3, §11). PH3-B is authoritative for all Catch-Up truth; this layer does not interpret it.

---

## 1. Baseline

| Item | Value |
|---|---|
| Frontend repo | `mitcherrman/mogsy` |
| `origin/main` at start | `a1958ff32de9e8c621124992d2340466f56fe89e` (verified by `git fetch`; **no drift** since the handoff, so no overlap with Patch Reports / React Query / patch-catchup code) |
| PH3-B commit (PH3-C base) | `f1f40b06` (`patchhub/ph3b-catchup-domain`), branched with `git worktree add -b … f1f40b06` (not by copying files) |
| Branch | `patchhub/ph3c-catchup-loader` |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph3c-catchup-loader` (outside OneDrive; `node_modules` is a junction to the PH3-B worktree's) |
| Backend | untouched |
| Not modified | `PatchReports.tsx`, every Patch Hub / Patch Impact component and loader, `patch-reports/api.ts`, backend |

The only PH3-B file touched is `src/lib/patch-catchup/index.ts`: an **export-only** addition of `isInRange`, `orderVersions`, `validateRange` (already public in `patch-range.ts`) so the loader uses the domain's own range logic instead of re-implementing it. No behaviour changed; all 137 PH3-B tests pass unmodified.

---

## 2. Architecture

```
usePatchCatchUpLoader({ sincePatch, throughPatch?, enabled? })      src/hooks/usePatchCatchUpLoader.ts
   │  useQuery  ["patch-reports"]            ← fetchPatchReports   (index; enabled only when active)
   │  planCatchUpRange(index, since, through) → versions in (since, through]   plan.ts        (pure)
   │  useQueries ["patch-report", v] for each  ← fetchPatchReport(v)  (parallel, shared cache)
   │  assembleCatchUp(plan, entries)          → validate, de-dup, ONE buildCatchUpReport call  assemble.ts (pure)
   └─ deriveCatchUpLoaderState(...)           → state                                     state.ts    (pure)
```

| File | Role |
|---|---|
| `src/lib/patch-catchup-loader/types.ts` | Public types (state, failure, resource, issue, `CatchUpLoader`) |
| `…/plan.ts` | Query keys, freshness, `planCatchUpRange` (index validation, `through` resolution, fetch set) |
| `…/assemble.ts` | `reportProblem` (structural validation), `dedupeReportsByPatch` / `reportsAgree`, `assembleCatchUp` (the single domain call) |
| `…/state.ts` | `deriveCatchUpLoaderState` |
| `…/index.ts` | Public exports |
| `…/test-support.ts` | Fake backend that stubs global `fetch` (real accessors run; every count is a real HTTP request; any other URL throws) |
| `src/hooks/usePatchCatchUpLoader.ts` | The only React/TanStack wiring |
| Tests | `plan.test.ts` (24), `assemble.test.ts` (33), `guards.test.ts` (10), `usePatchCatchUpLoader.test.tsx` (47) = **114** |

### Public API

```ts
import { usePatchCatchUpLoader } from "@/hooks/usePatchCatchUpLoader";

const loader = usePatchCatchUpLoader({
  sincePatch,        // baseline, EXCLUDED. null/undefined/"" → state "idle" (nothing fetched)
  throughPatch,      // INCLUDED. null/undefined → newest orderable patch the index lists
  enabled,           // explicit opt-in; default FALSE
});

loader.state            // CatchUpLoaderState, §3
loader.report           // PH3-B CatchUpReport | null (only in ready_complete / ready_incomplete)
loader.coverage         // report.coverage (same object) | null
loader.range            // { sincePatch, throughPatch } as resolved | null
loader.listedVersions   // the index listing exactly as returned | null
loader.requiredVersions // report versions this range needs, oldest first
loader.resources        // one { version, status, message } per required version
loader.issues           // loader-side reasons coverage is incomplete (complements report.coverage.issues)
loader.retryableVersions, loader.retrying, loader.canRetry, loader.retry()
```

`report` is the **unmodified** `buildCatchUpReport` result. The loader never post-processes it.

---

## 3. State model

Operational outcome and Catch-Up coverage are separate axes. A loader can succeed operationally while coverage is incomplete.

| `state.status` | Meaning | `report` |
|---|---|---|
| `disabled` | `enabled` false. No subscription, no request, nothing surfaced (even if the cache holds data) | null |
| `idle` | Enabled, but no baseline yet. Nothing fetched | null |
| `loading_index` | Waiting for `/api/patch-reports` | null |
| `loading_reports` `{pending, settled, total}` | Some requested report has **never produced a result**. The report is withheld so a half-loaded range is never shown as a gap | null |
| `ready_complete` | Every patch in (since, through] loaded cleanly, no loader issue, and `coverage.complete` | present |
| `ready_incomplete` | A report exists but coverage is not complete: a report failed / was malformed / conflicted, `through` is unlisted, **or the domain reported any coverage issue** (gap, unverified adjacency). Riot lines for the loaded patches are complete; the domain withholds continuity | present |
| `failed` `{failure}` | No report could be produced | null |

`failure.code`: `index_failed` (request rejected) · `index_malformed` (not `{patches:[{patch_version:string}]}`) · `range_invalid` (`detail` = PH3-B's `since_unparseable` / `through_unparseable` / `since_after_through`, or `no_listed_patches`) · `reports_unavailable` (range non-empty but **no** usable report; `versions` = missing patches — this is deliberately not an empty "nothing changed" report) · `domain_error` (the domain threw; surfaced instead of crashing the page).

`resources[].status`: `pending` · `loaded` · `failed` · `malformed` · `conflicting` · `duplicate_collapsed`.
`issues[].kind`: `report_request_failed` · `report_malformed` · `report_conflict` · `through_not_listed`.

A consumer decides "is continuity usable?" from **`report.continuity.status`** (domain), not from the loader state. `ready_incomplete` with `continuity.status === "available"` is possible only for the soft `unverified_adjacency` case.

---

## 4. Query keys and cache behaviour

Raw network resources use the **existing** canonical keys and accessors; there is no duplicate cache and no derived cache.

| Resource | Key | Accessor | Fresh for |
|---|---|---|---|
| Index | `["patch-reports"]` | `fetchPatchReports` | 30 min (our observers) |
| Report | `["patch-report", version]` | `fetchPatchReport(version)` | 30 min (our observers) |

(Same keys as the Patch Reports page and PH2-C; `guards.test.ts` pins them against both, including the page's literal source.) The `queryFn` for each is the **bare accessor**, so the cached value is byte-identical to what the page stores; validation happens on the way out, never in the `queryFn` (a malformed payload must not become an error entry the page then sees).

Observer options: `staleTime` 30 min · `retry: false` · `retryOnMount: false` · `refetchOnWindowFocus/Reconnect: false`. Freshness is judged per observer, so a report the page fetched seconds ago with `staleTime: 0` is still fresh for Catch-Up.

* **Cache sharing is two-way.** Anything the page / PH2 loaded is reused; anything Catch-Up loads lands on the same keys (tested by reading `getQueryData` and by a page-style reader that then makes 0 requests).
* **No derived/assembled-report cache.** The domain build over all ten reports takes tens of milliseconds, is a pure function of cached reports, and a derived key would add invalidation risk (it would have to be keyed by range **and** the loaded/failed set). The report is memoised per consumer on the identity of the loaded report objects, so re-renders and retry start/stop never rebuild it (tested). One range's incomplete result cannot poison another: each range's result is derived from its own keys.
* **No champion stats.** `["league-docs","champion-base-stats"]` is never read, fetched, or imported (static guard + runtime).
* **Disabled/idle consumers are inert** even while other consumers warm the same keys.

---

## 5. Network accounting (verified by tests that count real `fetch` calls)

Corpus index = 26.10 … 26.19. "list" = `GET /api/patch-reports`.

| Scenario | Requests |
|---|---|
| disabled mount / re-renders / unmount / `since` null | **0** |
| `since 26.18 → 26.19`, cold | list + `26.19` = **2** (never 26.18) |
| `since 26.15 → 26.19`, cold | list + 26.16, .17, .18, .19 = **5**, each once, issued in parallel |
| `since = through` | list = **1** (up to date, no report) |
| `since 26.9 → 26.19` (below the coverage floor), cold | list + all ten = **11** |
| selected `26.19` already cached and fresh, `since 26.18` | list = 1 (0 report requests) |
| selected `26.19` and list both cached and fresh | **0** |
| list cached only | the reports only (no list) |
| two consumers (same hook call, or two `renderHook`s), same range | still **5** (one per resource) |
| second consumer after the range loaded | **0** |
| overlap: 26.15→19 loaded, then 26.17→19 | **0**; then 26.14→19 | only `26.15` |
| move baseline 26.17 → 26.15 | only 26.16, 26.17 (no list) |
| `26.17` failed, `retry()` | exactly `26.17` = **1** (no list, no other report) |
| failed `26.17`, another consumer mounts | **0** (no silent re-request; only `retry()` re-requests) |
| any scenario | no URL other than the index and `/api/patch-reports/<v>`; every request is a `GET`; 0 champion-stats |

Fetch set = listed versions `v` with `since < v ≤ through` by PH3-B's `isInRange` (semantic numeric, never lexical, never list order, never release dates/timestamps). `through` that the index does not list is **not requested** (no 404 probing); it surfaces as `through_not_listed` and the domain's `missing_report`.

---

## 6. Failure behaviour (fail-closed; nothing synthesised)

What PH3-B receives: `reports` = only reports that **loaded and validated**, at most one per semantic patch, as the very cached objects (complete — never reduced to chainable cards, so Systems / Support Adjustments / mode lines survive); `listedVersions` = the **full** index listing as returned. A bad report is therefore absent from `reports` while its patch stays in the listing, and PH3-B reports `missing_report`, withholds **all** continuity (`chains = []`) and still returns every Riot line it has. No empty report is invented; no listing entry is dropped to hide a failure.

| Situation | Resource | Loader state | Domain effect |
|---|---|---|---|
| index rejects | – | `failed/index_failed` | – (no report request is made) |
| index malformed | – | `failed/index_malformed` | – |
| invalid range | – | `failed/range_invalid` | – (no report request) |
| one report rejects | `failed` | `ready_incomplete` | `missing_report`, continuity withheld |
| payload wrong patch / no `cards` / bad card or change shape / non-array `section_titles` | `malformed` | `ready_incomplete` | same |
| two spellings of one patch differ materially | both `conflicting` | `ready_incomplete` | neither is passed; same |
| two spellings of one patch agree | one `loaded`, the other `duplicate_collapsed` | unaffected | one report passed |
| every report in the range fails | all `failed` | `failed/reports_unavailable` | no report (never "0 changes") |
| `through` unlisted | – | `ready_incomplete` + `through_not_listed` | `missing_report` |
| domain throws | – | `failed/domain_error` | – |

**Structural validation** (`reportProblem`): object; `patch_version` exactly equals the requested spelling; `cards` is an array; every card is an object with an array of object `changes`; `section_titles` is an array when present (the structure builder tolerates its absence). Riot's words are never judged here.

**De-duplication (PH3-B decision 7 / limitation 8).** PH3-B's output is input-order-dependent only when it is handed two reports for one patch, so the loader guarantees it never is. Reports are grouped by *semantic* patch (`26.4` and `26.04` are one patch, `comparePatchVersions`). A group whose members **agree** collapses to its representative (the smallest spelling, so it never depends on request or listing order); a group that **disagrees materially** fails closed — none of its members is passed. "Agree" = identical `section_titles` and `cards` (deep equal); build metadata (`built_at`, `source_url`, `historical_context_summary` whose `adapter_elapsed_ms` changes per request, `reconciliation`) is not content. In practice a duplicate can only arise from an index that lists two spellings of one patch; both are requested so the conflict is detectable.

Year-boundary / `25.S1.x` / hotfix limitations are the **domain's** (`unorderable_version`, `unverified_adjacency`, `ordinal_gap`) and surface unchanged in `report.coverage`; the loader neither sorts them lexically nor repairs them. V1 only needs 26.10–26.19.

---

## 7. Retry behaviour

`retry()` re-requests **only failed resources**: the index when it failed or was malformed (then the reports follow automatically); otherwise each `failed` / `malformed` / `conflicting` report, via `queryClient.refetchQueries({queryKey, exact:true}, {cancelRefetch:false})`. Successful reports are never refetched (tested: 26.17 failed → exactly one request, for 26.17). It is a no-op when nothing is retryable or a retry is already in flight (`canRetry`).

While a retry runs the previous incomplete report stays on screen (`retrying: true`, state stays `ready_incomplete`, `report` is the same object). TanStack resets an errored, data-less query to `pending` on refetch; the hook keys "failed" off `errorUpdateCount` and remembers the last error message to avoid that blank. A retry that fails again stays incomplete and retryable.

---

## 8. Range-change behaviour

Everything the consumer sees is derived on each render from the **current** range's keys. There is no manual "latest request wins" state, so a late response for a range the caller has left cannot replace the current result — it only warms the shared cache (tested with held responses: since 26.15→26.17 mid-flight, results unchanged after the old requests land; switching back costs 0 requests). Observers for patches that stay in range persist, so they neither refetch nor reset. Disabling mid-flight surfaces nothing. Requests the caller left are not cancelled (the accessors take no abort signal); they finish into the cache, which is what Catch-Up and the Patch Report page want anyway.

---

## 9. Tests and certification

* `src/lib/patch-catchup-loader/**` + `src/hooks/usePatchCatchUpLoader.test.tsx`: **114 / 114**.
  * Required list: disabled→0 requests; X-excluded/Y-included set; semantic ordering (26.2 < 26.10, no consecutive-minor assumption); cached list reuse; cached report reuse; parallel loads (all four requests in flight while every response is held); duplicate-request dedupe; overlapping-range reuse; retry-only-failed; one missing report → incomplete; conflicting duplicate → fail closed; malformed report (7 shapes); range change with the old request pending; two simultaneous consumers; every report passed exactly once (identity-checked against the cache); complete 26.10–26.19 corpus (1,775 Riot lines, exactly the five PH3-B chains, result `toEqual` a direct domain call); zero chains when **any** single patch of the ten is missing; no champion-stats request; no non-GET request.
  * Mutation check (not committed): including X in the fetch set (36 failures), disabling the conflict check (4), defaulting `enabled` to true (3), and passing a reduced listing (16) are each caught.
* PH3-B `src/lib/patch-catchup` + PH2 `patch-impact`, `patch-impact-loader`, `usePatchImpactLoader` + `patch-reports` libs + the new loader: **20 files, 506 tests pass**.
* Patch Hub components/pages (`src/components/patch-reports`, `src/components/patch-impact`, `src/pages/lol`): **33 files, 458 tests pass** (ordinary Patch Hub behaviour unchanged).
* ESLint (`--max-warnings 0`) on the new loader, hook, hook test and the PH3-B index: clean.
* `tsc -p tsconfig.app.json --noEmit` differential against the exact base `f1f40b06`: **6 errors before, the same 6 after (identical set), 0 in the loader.** The 6 are pre-existing (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts` ×4).
* Repo `strict` is false, so discriminated unions must be narrowed with `=== false` / `=== true`, not truthiness (see `plan.ts`, `state.ts`).

---

## 10. Known limitations

1. **The index can be up to 30 minutes stale** (shared freshness window, same as PH2-C). "Through = latest" resolves against the cached index; a patch published inside that window is not seen until it is stale. An explicit `throughPatch` the cached index does not list is reported as `through_not_listed`, not probed.
2. **Failed resources are re-requested only by `retry()`** (`retryOnMount: false`). A cached failure persists for the cache lifetime until retried; the page's own observers keep their default behaviour on the same keys.
3. **`ready_incomplete` is broader than "something failed".** It also covers any domain `coverage.issues` entry, including the soft `unverified_adjacency` (year boundary) where continuity is only blocked across the boundary. Use `report.continuity.status` and `report.coverage.issues`, not the state name, to word the banner.
4. **Payload size**: ~1.9 MB uncompressed for all ten reports; load only the range (done), in parallel (done). A cold 10-patch Catch-Up is 11 requests.
5. **The domain is re-run per consumer** (memoised by cached-object identity); two mounted consumers of one range build twice. Cheap, and avoids a derived cache.
6. **The materiality rule for conflicting duplicates** (`section_titles` + `cards` deep-equal) is deliberately strict: any card difference, even a `mogzy_status` change after reconciliation, is a conflict. It only triggers for an index that lists two spellings of one patch, which production does not today.
7. **`domain_error` is a guard, not an expected state.**
8. All PH3-B limitations stand (low chain recall by design, no `chronological_order`, aliases owner-only, `historical_context` ignored).

---

## 11. PH3-D — exact integration / UI task (owner design gate first)

**PH3-D is GO** for the loader contract. Build the Catch-Up surface on `usePatchCatchUpLoader`; do not re-implement loading, ordering, de-duplication, caching or retry, and do not touch the domain.

1. **Mount point and trigger.** A Catch-Up entry on the Patch Hub (owner decides the shell: tab, panel or route). Mounting it must stay free: pass `enabled` only from an explicit user action (open Catch-Up / pick a baseline). The remembered patch (browser-local) and the `?since=` route are UI concerns owned by PH3-D; feed them in as `sincePatch`. Do not call the hook from ordinary Patch Hub rendering.
2. **Baseline picker** populated from the page's existing `["patch-reports"]` list (already loaded; no extra request). `throughPatch`: omit for "latest", or pass the report the user is viewing.
3. **State rendering.** `idle` → prompt for a baseline; `loading_index` / `loading_reports` → progress (`settled/total`); `failed` → message by `failure.code` with a Retry button when `canRetry`; `ready_*` → render `report`. `retrying` → show a subtle "retrying" on the banner, keep the content.
4. **Coverage banner** from `loader.issues` + `report.coverage.issues` + `report.continuity.status`: failed/malformed/conflicting patches (name them from `resources`, offer `retry()`), `through_not_listed`, `range.clampedToCoverageFloor` ("Coverage starts at {coverageFloor}"), `unverified_adjacency`. "Some patches failed to load; trends are hidden" when `continuity.status === "withheld"`.
5. **Content** — follow PH3-B §11 (PH3-C2) unchanged: render `report.lines` grouped by patch/section/entity as the **primary** content; chains are decoration on lines (`line.chainId`) and an optional summary, never the list of changes; always show non-chainable sections (`sections[].chainable === false`: Systems, Support Adjustments, modes); quote Riot values verbatim; computed deltas only from `net.components`; wording from `valueState` (`returns_to_start_value` → "Value back to {startRaw}", never "reverted/undone"); deep links `?patch=<line.patch>#<line.target.change>`.
6. **Do not** add aliases, loosen any matcher rule, derive chronology from timestamps, or merge Catch-Up chains into the Patch Report page's own slots (`PatchImpact` is untouched).
7. **Tests to add in PH3-D**: the UI renders from loader fixtures for each state; a failed-patch fixture never shows a chain; Catch-Up closed → 0 requests; `retry()` wiring; deep-link targets resolve on the Patch Report page.

Out of scope for PH3-D (unchanged from PH3-B): Combat Lab, graphs, quizzes, Pro Play, Studio, share buttons, `chronological_order` (backend).
