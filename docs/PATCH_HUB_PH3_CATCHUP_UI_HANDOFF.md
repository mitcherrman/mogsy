# PATCH HUB PH3-D — CATCH-UP UI (HANDOFF)

User-facing Catch-Up for the Patch Hub: "what changed after the patch I last knew?". Built on the PH3-B domain and the PH3-C loader exactly as committed, following the approved design contract (`docs/PATCH_HUB_PH3_CATCHUP_DESIGN.md`) and the owner's locked decisions. **Frontend only. Nothing pushed, merged, published or deployed. Backend untouched.**

Read this first, then the design contract for rationale. PH3-B (`PATCH_HUB_PH3_CATCHUP_HANDOFF.md`) stays the authority for Catch-Up truth; PH3-C (`PATCH_HUB_PH3_CATCHUP_LOADER_HANDOFF.md`) for loading.

---

## 1. Baseline

| Item | Value |
|---|---|
| Repo | `mitcherrman/mogsy` |
| `origin/main` (verified by `git fetch`, 2026-10-05) | `d84c0ddd1785f7829206a14d2379691c28a329a6` (SCBS1 ×2 on top of the PH3 base `a1958ff3`; no Patch Hub overlap) |
| Branch | `patchhub/ph3d-catchup-ui` |
| Base | `4fb47266` (`patchhub/ph3d-catchup-design` = PH3-C `8e068743` + design doc), via `git worktree add -b … 4fb47266` — no uncommitted files copied |
| Commits | `9874057e` (UI + tests), `6bfd107e` (link labels, touch targets, test typing), plus the docs commit carrying this file |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph3d-catchup-ui` (`node_modules` junction) |
| Dev server entry | `ph3d-ui` in the primary checkout's `.claude/launch.json`, port 5333 |

### PH3 commits consumed

| Slice | Branch | Commit | In PH3-D ancestry |
|---|---|---|---|
| PH3-A audit (docs + fixture) | `patchhub/ph3a-continuity-audit` | `3f3eec28` | **No** (see §13) |
| PH3-B domain | `patchhub/ph3b-catchup-domain` | `f1f40b06` | yes |
| PH3-C loader | `patchhub/ph3c-catchup-loader` | `8e068743` | yes |
| PH3-D design | `patchhub/ph3d-catchup-design` | `4fb47266` | yes (parent) |

No file under `src/lib/patch-catchup/**`, `src/lib/patch-catchup-loader/**`, `src/hooks/usePatchCatchUpLoader.ts`, `src/components/patch-impact/**` or `src/lib/patch-reports/**` was changed.

---

## 2. Owner decisions — as implemented

| # | Decision | Implementation |
|---|---|---|
| 1 | Entity-first within official Riot sections | section › entry (alphabetical, `localeCompare` base) › patch steps (oldest first) › Riot group › Riot line |
| 2 | Champions, Items, Runes first; others keep Riot-derived order | `orderSectionKeys`: pins `patch-champions`, `patch-items`, `patch-runes`; the rest = newest included report's order as skeleton, each older-only section inserted after its nearest preceding section from its own report (front if none). Derived from `report.lines` (which follow each report's own page order) — no hard-coded list |
| 3 | Non-chainable section with > 40 Riot lines starts collapsed (Catch-Up only) | `defaultCollapsed = !chainable && lineCount > 40`. Native `<details>`; the `<summary>` contains the h3 with Riot's name, "N changes in M entries · first–last", and a visible **Show / Hide** (sr-only "Show Arena, 205 changes"). Body mounts on first open, then stays mounted. Search force-opens any section with matches. Patch Report is untouched |
| 4 | Compact `Patch Report | Catch Up` switch in the masthead | `PatchHubViewSwitch` under the h1: `<nav aria-label="Patch Hub views">`, two real links, `aria-current="page"`, segmented pill in the existing gold language; hint "Missed a few patches? Pick the last one you know." at ≥ 640 px in report view only |
| 5 | Routing | `?patch=` normal, `?since=` Catch-Up, never both; `?view=catchup` = Catch-Up with no baseline yet (idle, nothing fetched); enter/exit **push**, baseline change **replace**; `through` reserved, stripped with replace, never read |
| 6 | Baseline language | native `<select>` labelled **"I last knew patch"**; helper "{range line} · 26.14 itself is not included."; never "last played" |
| 7 | Remember baseline | `localStorage["mogzy.patchHub.catchUp.since.v1"]`, written only by the picker |
| 8 | Search | one input ("Search this catch-up"); no other filters |
| 9 | Restrained Mogzy overlay | one-line note under the chain's final Riot line, a header chip, a trail dot on earlier steps; value wording only |
| 10 | Provenance only in "How?" | exact vs approved-alias text lives in the note's `<details>` "How?"; the note line is identical for both |
| 11 | Incomplete coverage | available Riot lines stay; every note/chip/dot disappears when continuity is withheld; neutral amber banner names failed patches; Retry = loader `retry()` |
| 12 | Deep links | every line → `?patch=<v>#<line.target.change>`, every step → `?patch=<v>#<appearance.entityAnchor>`; same tab; Back returns to Catch-Up at the entry |
| 13 | Cached-report anchor bug | fixed (§8) |

---

## 3. Architecture

```
src/pages/lol/PatchReports.tsx            mode/router orchestration only
 ├─ PatchHubMasthead (+ viewSwitch slot)
 ├─ PatchHubViewSwitch                    Patch Report | Catch Up
 ├─ [report mode] unchanged Patch Report (chips, filters, sections, notice, footer)
 └─ [catchup mode] PatchCatchUpView       ← the ONLY place usePatchCatchUpLoader is called
      ├─ PatchCatchUpControls             h2, "I last knew patch" select, range line, totals, remembered hint
      ├─ PatchCatchUpCoverageNotice       banner + Retry
      ├─ search input + section nav
      ├─ PatchCatchUpSection              h3 (plain or <details>), intros, cross-reference
      │    └─ PatchCatchUpEntry           h4 entry, chip, steps (h5), groups (h6), lines
      │         └─ PatchCatchUpContinuityNote / Chip
      ├─ Other announcements (cards without changes)
      └─ footer: Riot sources per patch + "About Mogzy notes"
```

| File | Role |
|---|---|
| `src/components/patch-catchup/presentation.ts` | Pure model: section order, entry/step/group grouping, collapse rule, search, continuity wording, coverage notices, range line |
| `…/route.ts` | Pure URL contract (`readPatchHubRoute`, `catchUpSearch`, `reportSearch`, `patchReportHref`, router-state reader) |
| `…/remembered-baseline.ts` | Guarded localStorage wrapper |
| `…/render-context.ts` | Context shared by rows (chain lookup, wording context, leave-to-report handler) |
| `…/PatchCatchUpView.tsx` | Container: loader, search, disclosure state, `#cu-` scroll, focus, deep-link bookkeeping, every loader state |
| `…/PatchCatchUpControls.tsx`, `PatchCatchUpCoverageNotice.tsx`, `PatchCatchUpSection.tsx`, `PatchCatchUpEntry.tsx`, `PatchCatchUpContinuityNote.tsx` | Presentation |
| `src/components/patch-reports/PatchHubViewSwitch.tsx` | View switch |
| `src/components/patch-reports/PatchHubMasthead.tsx` | `viewSwitch` slot; report h2 gets `id="patch-report-heading" tabIndex=-1` for focus on return |
| `src/components/patch-reports/PatchReportEntityHeader.tsx` | **exports** `EntityImage` (optional `sizeClassName`, default classes unchanged) and `DirectionChip`; no behaviour change |
| `src/pages/lol/PatchReports.tsx` | mode branch, detail query disabled in Catch-Up, URL hygiene, remembered-baseline entry, focus, hash-scroll fix |

Reused verbatim: `PatchReportValueChange` (Riot raw strings, neutral arrow, sr-only "From … to …", wrap rules), `hasExactValues`, `buildPatchReportStructure` (context hoisting), `resolveCardEditorial` / `isDirectionGroupedCard`, `slugifySegment`.

---

## 4. Routing and history

| Action | URL | History |
|---|---|---|
| Patch Report (unchanged) | `?patch=26.19` / none | as before |
| Switch → Catch Up, remembered baseline listed | `?since=<remembered>` (state `returnPatch`, `fromMemory`) | push |
| Switch → Catch Up, none remembered (or unlisted) | `?view=catchup` | push |
| Idle `?view=catchup` once a listed remembered baseline is known | `?since=<remembered>` | replace |
| Pick / change baseline | `?since=<v>` | **replace** |
| Switch → Patch Report | `?patch=<returnPatch>` or no params (latest) | push |
| Line / step / announcement link | first `replace` → `?since=X#cu-<entry>`, then the link pushes `?patch=<v>#<anchor>` | Back → Catch-Up scrolled to the entry |
| URL with `patch`+`since`, `through`, or `view`+`since` | `patch`/`through`/`view` removed | replace |
| Refresh `?since=26.14` | unchanged; Catch-Up re-renders (cache or fetch) | — |

The active switch item prevents default (no duplicate entries). Modifier/middle clicks on any link open a new tab natively (real `<a href>`), and skip the `#cu-` bookkeeping.

---

## 5. UI grammar

- **h2 Catch Up** (focus target after switching in with a baseline) › picker › range line "Showing changes in 26.15 – 26.19 · 26.14 itself is not included." › totals "987 changes · 260 entries · 5 patches" › "Remembered from your last catch-up · Forget" (only when the baseline came from memory).
- Banner (when needed) › search › section nav (wraps, never scrolls).
- **h3 section** "Champions · 178 changes in 53 entries · 26.15–26.19". Champions shows "Some changes apply to many champions at once and are listed by Riot under Systems." when Systems / Game Systems / Support Adjustments are in range (links to those sections; no semantic join is claimed).
- **h4 entry** with 40/48 px image (initials fallback; system entries get a neutral ◇ tile), meta "Champion · 46 changes · 26.15, 26.16", optional chip "◆ Mogzy: Health Growth back to 105" (links to the note).
- **h5 step** "Patch 26.15" pill + Riot direction chip (SR champion/item cards only, Mogzy-inferred labelled, same gate as the report) + "View in Patch 26.15 ↗" (sr-only "report: Bel'Veth"). Riot's own card note in a collapsed "Riot's note" `<details>` (section-shared intros are hoisted once per section into "Riot's section notes" instead).
- **h6 group** = Riot's group title verbatim (omitted when empty, e.g. items).
- **Line**: property label, `PatchReportValueChange` or Riot's prose (◇ mechanic marker), "New" badge, link icon with `aria-label="View Patch 26.17 change: Sundered Sky Health"`.
- **Note** (final chain line only): "MOGZY Back to 105, its value before 26.15" + "How?" (identity sentence, verbatim per-step `before → after`, concurrent-mechanic caveat).
- **Other announcements**: cards with no itemised changes ("Team Voice · 26.19 — View in Patch 26.19").
- Footer: one Riot source link per included patch; "About Mogzy notes" explains that a missing note is **not** "no trend".

Wording (from `valueState`, values verbatim, deltas only from `net.components`):

| valueState | Note | Chip |
|---|---|---|
| `returns_to_start_value` | Back to {startRaw}, its value before {firstStepPatch} | {property} back to {startRaw} |
| `changed` | Net since {since}: {+d} {property} | {property} {+d} since {since} |
| `partially_returns_toward_start` | … — part of the way back to {startRaw} | as changed |
| `moves_beyond_start` | … — now past {startRaw} | as changed |
| `multi_step_non_monotonic` | … (changed direction along the way) | as changed |
| `net_unavailable` (or no components) | Changed across {n} patches: {startRaw} → {endRaw} | {property} changed across {n} patches |

Percent deltas read "percentage points"; rank arrays "per rank +5 / 0 / −5". When the baseline is below the coverage floor (`clampedToCoverageFloor`), `{since}` becomes "before {firstStepPatch}" so no claim is made about unseen patches (production: Doran's Helm "Net since before 26.10: +40 Health"). "revert/undo/rolled back/walked back" never appear (tested over all 45 PH3-A ranges).

---

## 6. Section-collapse rule

`!section.chainable && section.lineCount > 40` (PH3-B `CatchUpSection`). Production since 26.14: **Classic (382), ARAM: Mayhem (165), Arena (205)** collapsed; Champions, Items, Runes, Aegis of Valor, Apex Duo Restrictions, Hall of Legends, Systems open. Since 26.18: Classic and Arena collapsed, ARAM: Mayhem (≤ 40 in 26.19) open. Threshold is strict (40 open, 41 collapsed — tested).

Disclosure state: reader toggles are kept per section; while a search is active a separate per-query state applies (matching sections default open), so clearing the search restores the default collapse state. A `#cu-…` hash (Back from a report) opens the section holding its target.

---

## 7. Local-storage behaviour

- Key `mogzy.patchHub.catchUp.since.v1`, plain version string. Every access in `try/catch`; throwing storage = nothing remembered.
- Written only by the picker. Opening a `?since=` link never writes it; URL `since` always wins.
- Read only when entering Catch-Up without a baseline (switch link target, or `?view=catchup`). Ignored unless it is version-shaped **and** listed by the current index.
- Normal Patch Report mode never auto-enters Catch-Up because of it (tested).
- "Forget" removes the key and keeps the current view.

---

## 8. Deep-link / cached-report scroll fix

Before: `useEffect(…, [detail])` read `window.location.hash`. Navigating to a report already in the React Query cache, or changing the hash on the same report, produced the same `detail` and never re-scrolled.

Now (`PatchReports.tsx`): the effect depends on `[catchUp, detail, location.key, location.hash]` from the router, scrolls once per navigation (`location.key + hash` token), decodes the hash defensively, and calls `scrollIntoView?.()` (no smooth behaviour, no timers). Cold loads still scroll when `detail` arrives. Catch-Up has its own equivalent for `#cu-` targets (after opening the containing section). Mutation check: restoring `[catchUp, detail]` fails the same-report hash-change test.

---

## 9. Tests

| Suite | Tests |
|---|---|
| `src/components/patch-catchup/presentation.test.ts` | 27 — section order (corpus + synthetic older-only insertion), every line once, alphabetical/chronological, collapse rule incl. 40/41 threshold, chain decoration only on PH3-B lines, withheld → none, SR/mode Locke isolation, unique ids, announcements + cross-reference, search fields/order/whole-entry/no-match, every valueState wording, alias provenance only in How?, mechanical caveat, forbidden words over all 45 PH3-A ranges, coverage notices (single/plural/floor/withheld), range line |
| `src/components/patch-catchup/route.test.ts` | 8 — route contract, URL builders, router state, remembered baseline (round trip, unlisted/malformed ignored, throwing storage) |
| `src/pages/lol/PatchReports.catchup.test.tsx` | 32 — real loader + accessors against a fake `fetch` over the production corpus: normal mode requests unchanged and loader never mounted; no auto-enter; switch semantics; enter (push, idle, focus, 0 requests); baseline replace + storage + exact fetch set; exit (push, return patch, focus) + Back; remembered entry + Forget; unlisted remembered ignored; URL wins; `patch`/`through` stripped; idle; loading (progress, aria-busy); X excluded / latest implicit / accounting; up to date; invalid baseline; all-failed; every line once with exact values; section/entry/step order; notes only on chains; one-patch range; collapse + body unmounted; 0 requests for search/toggles; search opens collapsed + Locke isolation; no-results; heading outline + labels + unique ids; wrap-safe markup; incomplete banner + no decoration + retry exactly one request; canonical links; cached deep link scroll + 0 requests + Back; Back into a collapsed section; cold-load scroll; hash change on cached report; missing/malformed anchors |

Owner list 1–28 maps onto the above (1 normal unchanged · 2 enter · 3 leave · 4 replace · 5 X excluded · 6 latest implicit · 7 persistence · 8 invalid ignored · 9 loader disabled · 10 loading · 11 complete · 12 banner · 13 retry · 14 exact values · 15 notes on chains · 16 withheld · 17 section order · 18 entity-first · 19 chronological · 20 Locke · 21 collapsed · 22 ≤ 40 open · 23 search opens · 24 no results · 25 canonical URL · 26 cached scroll · 27 disclosure/keyboard semantics · 28 wrap-safe markup).

Note: `createMemoryRouter`/`RouterProvider` throws a jsdom `AbortSignal` incompatibility in this environment, so the page tests use `MemoryRouter` with a probe recording `useLocation` / `useNavigationType` (PUSH / REPLACE / POP).

### Certification runs (worktree, then the trial integration tree — identical)

- PH3-D (35 + 32) · PH3-C loader (67 + 47 hook = 114) · PH3-B domain (137) · PH2 (`patch-impact` 136, `patch-impact-loader` 6, `usePatchImpactLoader` 26, `components/patch-impact` 61) · PH1 (`lib/patch-reports` 87, `components/patch-reports` 27, `pages/lol` incl. existing PatchReports page/history tests) · LolHub / broadcast / PageReportControl: **60 files, 1,092 tests, all pass.**
- `src/lib/feedback/contract.test.ts`: 5 failures, **identical on the base `4fb47266`** (pre-existing, unrelated; not in the 1,092).
- ESLint `--max-warnings 0` on every new/changed file: clean.
- `tsc -p tsconfig.app.json --noEmit`: base `4fb47266` 6 errors; PH3-D 6; trial merge (origin/main `d84c0ddd` + PH3-D + PH3-A) 6 — **identical set** (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts` ×4).

---

## 10. Browser certification (real `/lol/patch-reports`, Vite dev server on this worktree, production read-only API)

| Check | Result |
|---|---|
| Normal mode | unchanged chips/filters/sections; switch shows "Patch Report" current; fits one row at 320 px |
| Since 26.14 complete | 987 lines · 260 entries · 5 patches; notes **Bel'Veth** "Back to 105, its value before 26.15" and **Sundered Sky** "Back to 400, its value before 26.16"; nothing else annotated |
| Since 26.18 | one-patch range (214 lines), no notes, one-patch hint |
| Since 26.10 | 1,619 lines · 9 patches; notes Bel'Veth, Mordekaiser (alias: Stat Steal → Stolen Stats, "Back to 10%, its value before 26.14"), Sylas (alias: Initial Damage → First Lash Damage), Sundered Sky. Doran's Helm correctly absent (its 26.10 step is the excluded baseline) |
| Since 26.9 (below floor) | 1,775 lines · 10 patches; floor notice "Mogzy's patch reports start at 26.10, so this starts there."; all five chains incl. Doran's Helm "Net since before 26.10: +40 Health" |
| Mode sections | Arena / ARAM: Mayhem / Classic present and counted; Systems "ADC MAGIC RESISTANCE" card intact; ARAM, Locke, Support Adjustments, Role Quest sections kept with Riot names (since 26.10) |
| Locke | search "Locke" (since 26.14): Champions Locke 26.15 · Arena Locke 26.15, 26.19 · ARAM: Mayhem Locke 26.16 · Classic Innervating Locket 26.17 — separate sections, never merged. On production data it also lists "Classic — General" and "ARAM: Mayhem — General" because Riot's detail text there mentions Locke (detail text is searchable per owner decision 8; the trimmed test corpus has no detail text, hence 4 there) |
| Large collapsed section | collapsed by default; summary heights 70–98 px at 375; keyboard Enter toggles; "Hide Arena, 205 changes" when open |
| Search into collapsed | all three force-opened; clearing restores collapsed |
| Incomplete / retry | 26.17 forced to 500 in-page: banner "Patch 26.17 didn't load.", 785 lines (987 − 202), 0 notes/chips/dots; Retry → exactly `GET /api/patch-reports/26.17`, then 987 lines and both notes |
| Deep link | Sundered Sky 26.17 Health line → `?patch=26.17#s-patch-items__e-item-sundered-sky__g-general__c-health`, push, target scrolled to `top = 96` (scroll-margin), 0 requests |
| Back | `?since=26.14#cu-sr-items-sundered-sky`, entry scrolled to top 96, 0 requests; from an Arena line, Back re-opens Arena and scrolls to `cu-patch-arena-system-akali` |
| Refresh with `?since=` | every width below was a full page load on `?since=26.14` |
| Widths 320 / 375 / 768 / 1280 / 1440 | with **every** `<details>` open (all 987 lines): `scrollWidth ≤ innerWidth`, 0 elements outside the viewport, 0 horizontal scroll containers, 0 duplicate ids; entry column 896 px at 1280/1440; select 44 px tall on mobile |
| Console / page errors | 0 during load, search, toggles, deep link, Back, exit. (One error seen earlier came from a Vite HMR module version mid-refactor, not reproducible on clean loads.) |
| Reduced motion | every animated/transitioning element in Catch-Up and the switch carries `motion-reduce:transition-none` or `motion-safe:animate-pulse`; emitted rules verified under `(prefers-reduced-motion: …)`; page `scroll-behavior: auto`. OS-level emulation is not available in the pane, so this is a CSS-rule audit |
| Focus | switch → Catch-Up focuses the select (idle) or h2; switch → Patch Report focuses `#patch-report-heading` |

Screenshots were taken at 320 (Bel'Veth note + How?), 375 (coverage banner), 1280 (Bel'Veth rework, Systems card, collapsed sections) during certification; they are not committed.

---

## 11. Network certification (in-page `fetch` instrumentation; SPA navigation from `/terms` so counts are exact)

| Scenario | Requests |
|---|---|
| Normal Patch Report `?patch=26.19` (cold) | list + `26.19` — identical to pre-PH3-D; Catch-Up loader never mounted |
| Switch to Catch-Up (idle) | **0** |
| Pick 26.14 after viewing 26.19 | `26.15`, `26.16`, `26.17`, `26.18` (list and 26.19 reused) |
| Cold `?since=26.14` | list + 5 (PH3-C accounting) |
| Change baseline 26.14 → 26.18 / → 26.10 / → 26.9 | 0 / `26.11`–`26.14` / `26.10` |
| Search, open/close sections | **0** |
| Deep link to cached report, Back | **0**, **0** |
| Retry with 26.17 failed | exactly `26.17` |

Freshness note: the Patch Report's own detail query keeps the app default `staleTime` (60 s, `src/lib/query-client.ts`). Inside that window a deep link costs 0 requests; after it, the report renders and scrolls from cache immediately and the page's pre-existing stale-while-revalidate policy issues one background refetch — the same behaviour as clicking a patch chip before PH3-D. This was deliberately not changed ("normal Patch Report must make the same requests").

---

## 12. Limitations

1. **Riot-note hoisting** is computed per patch from the cards that have lines; a card with no changes (only in "Other announcements") does not take part. This was not diffed against the report patch by patch; a payload where an empty card shares a mode intro could hoist differently (the text is still shown, either per step or once per section).
2. **Disclosure state is not kept across leaving and returning**; Back re-opens only the section containing the `#cu-` target.
3. **Search keeps whole entries** and matches patch versions as substrings ("26.1" matches 26.10–26.19). Detail-text matching makes mode "General" entries appear for champion names they mention (by design).
4. **Clamped baselines** use "Net since before {first step}" instead of "since {X}" — stricter than the design table; no production chain other than Doran's Helm is affected.
5. The concurrent-mechanic caveat says "in this range": the domain flags the chain, not the patch.
6. Entry count for since 26.14 is **260** (domain entities); the design's 264 counted cards differently. Totals always come from the domain.
7. Index freshness (≤ 30 min, PH3-C) and every PH3-B limitation stand (low chain recall by design, no `chronological_order`, aliases owner-only).
8. Reduced motion verified by CSS rule audit, not OS emulation (§10).
9. Entity images come from the Railway asset host; slow loads show the initials tile first.

---

## 13. PH3-A artifacts

PH3-A `3f3eec28` (`docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md`, `docs/PATCH_HUB_PH3_CONTINUITY_FIXTURE.json`) is **not** an ancestor of PH3-B/C/D. Verified 2026-10-05: its fixture is byte-identical to `src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json`, and `git merge-tree patchhub/ph3d-catchup-ui patchhub/ph3a-continuity-audit` is clean (docs-only, two new files). The integration must merge that branch deliberately (step 4 below) so the audit — the authority PH3-B/C/D cite — ships with the code.

---

## 14. Exact integration instructions (owner gate first)

```bash
git fetch origin
git rev-parse origin/main                    # expect d84c0ddd… or re-verify drift
git switch -c patchhub/ph3-integration origin/main
git merge --no-ff patchhub/ph3d-catchup-ui   # brings PH3-B, PH3-C, design, PH3-D
git merge --no-ff patchhub/ph3a-continuity-audit   # PH3-A audit + fixture (docs only)
```

Then, in that tree (`node_modules` junction):

1. `npx tsc -p tsconfig.app.json --noEmit` → expect exactly the 6 pre-existing errors.
2. `npx vitest run src/components/patch-catchup src/pages/lol src/lib/patch-catchup src/lib/patch-catchup-loader src/hooks/usePatchCatchUpLoader.test.tsx src/lib/patch-impact src/lib/patch-impact-loader src/hooks/usePatchImpactLoader.test.tsx src/components/patch-impact src/components/patch-reports src/lib/patch-reports src/pages/LolHub.test.tsx src/components/lol/broadcast src/components/report/PageReportControl.test.tsx --maxWorkers=4` → 60 files / 1,092 tests (do not run the full 820-file suite in one process here; it OOMs).
3. ESLint on `src/components/patch-catchup`, `src/components/patch-reports`, `src/pages/lol/PatchReports*.tsx`.
4. Browser smoke on `/lol/patch-reports` and `?since=26.14` at 375 and 1280.

A trial of exactly this (detached, local, discarded) on 2026-10-05: both merges clean, tsc 6 = 6, 60 files / 1,092 tests pass.

Do not integrate B/C without D. Do not push without the owner.

---

## 15. Verdict

**Final PH3 integration: GO** (owner review of the screenshots/behaviour above, then integrate per §14). No open defects; limitations in §12 are documented trade-offs, none affects Riot-line completeness or continuity truth.
