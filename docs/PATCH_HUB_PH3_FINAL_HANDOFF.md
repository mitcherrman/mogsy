# PATCH HUB PH3 — CATCH-UP FINAL INTEGRATION AND CERTIFICATION (HANDOFF)

This is the final PH3 integration of Patch Hub Catch-Up ("what changed since patch X?") onto current `main`, with its certification. **Nothing was pushed, merged to `main`, published or deployed.** Production was read only, through public GETs.

The authorities stay where they were. PH3-A (`PATCH_HUB_PH3_CONTINUITY_AUDIT.md`) is the authority for identity rules. PH3-B (`PATCH_HUB_PH3_CATCHUP_HANDOFF.md`) is the authority for Catch-Up truth. PH3-C (`PATCH_HUB_PH3_CATCHUP_LOADER_HANDOFF.md`) covers loading. PH3-D (`PATCH_HUB_PH3_CATCHUP_DESIGN.md`, `PATCH_HUB_PH3_CATCHUP_UI_HANDOFF.md`) covers UI and routing. This file records only what the integration consumed, changed and proved.

---

## 1. Baseline

| Item | Value |
|---|---|
| Repo | `mitcherrman/mogsy` |
| `origin/main` (verified with `git fetch`, 2026-10-05) | **`a5c0edb0990db7db6dc94c46fe020ff4ae40e4a8`** |
| Drift since the PH3-D certification base `d84c0ddd` | `874f6ba5` "Work in progress" and `a5c0edb0` "Update plan". Only `src/integrations/supabase/types.ts` changed (+350 lines: `analytics_visitor_user_links`, `playtest_*` tables, and `analytics_*` / `playtest_*` RPCs). **It does not overlap Patch Hub or Catch-Up.** |
| Drift since the PH3 base `a1958ff3` | 11 files (SCBS1 Stat Check + the types file). Their names do not intersect the 49 PH3-D files. |
| Integration branch | `patchhub/ph3-final-integration` |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph3-final` (outside OneDrive; `node_modules` junction) |
| Clean baseline checkout | `C:\Users\mlmit\mogzy-wt\ph3-final-base` (detached at `a5c0edb0`) |
| Dev server | `ph3-final` entry in the primary checkout's `.claude/launch.json`, port 5341, production API `web-production-83e53.up.railway.app` |

---

## 2. Integration strategy and lineage

All PH3 branches fork from `a1958ff3`. PH3-D UI already contains PH3-B → PH3-C → PH3-D design → PH3-D UI. PH3-A is not in that ancestry.

| Step | Commit | What |
|---|---|---|
| 1 | `145a562e` | `git merge --no-ff patchhub/ph3d-catchup-ui` (@`30bab38b`) onto `a5c0edb0`. It merged automatically with no conflicts. The merged tree equals `30bab38b` plus exactly the 11-file main drift: `git diff patchhub/ph3d-catchup-ui HEAD` shows only those files. The original SHAs are preserved. |
| 2 | `53b98f45` | PH3-A audit doc preserved (see §3). |
| 3 | `fe2d202c` | Back-scroll fix found in this certification (§8). |
| 4 | (this file) | Final handoff. |

### PH3 commits consumed

| Slice | Branch | Commits | How |
|---|---|---|---|
| PH3-A audit | `patchhub/ph3a-continuity-audit` | `3f3eec28` | Audit doc carried over as a file (not merged, to avoid a duplicate fixture) |
| PH3-B domain | `patchhub/ph3b-catchup-domain` | `f1f40b06` | via merge |
| PH3-C loader | `patchhub/ph3c-catchup-loader` | `8e068743` | via merge |
| PH3-D design | `patchhub/ph3d-catchup-design` | `4fb47266` | via merge |
| PH3-D UI | `patchhub/ph3d-catchup-ui` | `9874057e`, `6bfd107e`, `30bab38b` | via merge |

---

## 3. PH3-A preservation decision

- PH3-A committed `docs/PATCH_HUB_PH3_CONTINUITY_FIXTURE.json`. PH3-B committed `src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json`. **Both are blob `3b12643af20aeac2e4082cfbc087ab3140edc009`, byte-identical.**
- **One canonical fixture:** `src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json`. It is the copy the PH3-B corpus tests import (`test-support.ts`).
- `docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md` is preserved verbatim from `3f3eec28`, except for two fixture-path references:
  - the Deliverables bullet now links the canonical copy and records the original path, commit and blob;
  - §15 notes that the copy was made, in PH3-B.
- The `patchhub/ph3a-continuity-audit` branch was **not** merged. Merging it would have added the duplicate fixture, and removing it afterwards would only add history noise. The branch is still available as the provenance record.

---

## 4. Final architecture (unchanged from PH3-D)

```
src/lib/patch-catchup/**            PH3-B pure domain: Riot coverage + proven continuity chains
src/lib/patch-catchup-loader/**     PH3-C pure loader core: plan, assemble, guards, state
src/hooks/usePatchCatchUpLoader.ts  PH3-C hook: canonical query keys, parallel, fail-closed, retry-only-failed
src/components/patch-catchup/**     PH3-D presentation model, route contract, remembered baseline, view + rows
src/components/patch-reports/PatchHubViewSwitch.tsx, PatchHubMasthead.tsx (slot), PatchReportEntityHeader.tsx (exports)
src/pages/lol/PatchReports.tsx      mode/router orchestration; report hash-scroll keyed on router location
```

`PatchCatchUpView` is the only caller of `usePatchCatchUpLoader`. In Catch-Up mode the Patch Report's detail query is disabled. PH2 Patch Impact (`changeAnalysis` slot) and PH1 Patch Report are untouched.

---

## 5. Routing contract (locked, verified)

| URL | Meaning |
|---|---|
| `?patch=<v>` / none | Patch Report (normal) |
| `?since=<X>` | Catch-Up for `(X, latest]`; `through` is implicit latest in V1 |
| `?view=catchup` | Catch-Up with no baseline (idle, nothing fetched) |
| `patch` + `since`, `through`, `view` + `since` | Never coexist. The extra params are stripped with replace |

History rules:
- Entering or leaving Catch-Up **pushes**; changing the baseline **replaces**.
- A line or step link first replaces the Catch-Up URL with `#cu-<entry>`, then pushes `?patch=<v>#<anchor>`.
- Back returns to the Catch-Up entry.
- Local baseline key `mogzy.patchHub.catchUp.since.v1`. Only the picker writes it. It is never called "last played".

---

## 6. Invariants verified on the integrated tree

### Corpus (PH3-B domain over the committed 26.10–26.19 corpus; independent probe plus the suite)

| Range | Riot lines (each exactly once) | Chains |
|---|---|---|
| full (since 26.9, below floor) | **1,775** (1,775 unique ids and payload objects) | **exactly 5**: Doran's Helm Health (exact), Bel'Veth Health Growth (exact), Sundered Sky Health (exact), Sylas Q Initial Damage (approved alias), Mordekaiser R Stat Steal (approved alias) |
| since 26.10 | 1,619 | 4 (Doran's Helm excluded: its first step is the excluded baseline) |
| since 26.14 | **987** | **exactly 2**: Bel'Veth, Sundered Sky |
| since 26.18 | 214 | **none** |

- All 45 PH3-A `(since, end]` ranges match the fixture (`corpus.test.ts`).
- False-positive fences stay unlinked: Arena Protein Shake, Arena Serylda's Grudge, Classic General ×2, SR vs Arena Locke, Riven's dual R groups, Bel'Veth R, Poppy Q ×2, and the others in `corpus.test.ts`.

### UI (presentation + browser)

| Invariant | Result |
|---|---|
| Section order | Champions › Items › Runes, then Riot order. Since 26.14: Aegis of Valor › Apex Duo Restrictions › Hall of Legends › Systems › Classic › ARAM: Mayhem › Arena |
| Entity-first grouping | Entries are alphabetical within every section, and patch steps are chronological within every entry (checked for every section at 1280) |
| Collapse (fresh loads) | Only non-chainable sections with > 40 lines start collapsed. Since 26.14: Classic (382), ARAM: Mayhem (165), Arena (205); Systems (10) and the small mode sections stay open. Since 26.18: Classic (100) and Arena (62) collapsed; ARAM: Mayhem (11) open. Since 26.10: Classic (382), ARAM: Mayhem (351), Arena (494) collapsed; Role Quest Adjustments, Support Adjustments (24), Locke, ARAM and the other sections are open and kept under Riot's names. Reader toggles persist across baseline changes inside one visit (PH3-D design) |
| Search | "Locke" force-opens all three collapsed sections. SR Champions Locke, Arena Locke and ARAM: Mayhem Locke stay separate entries. Clearing the search restores the 3 collapsed sections. A no-match query shows its message |
| Riot lines | Every line survives. Values are Riot raws: Bel'Veth Health Growth `105 → 110` (26.15) then `110 → 105` (26.16); Sundered Sky Health `400 → 450` then `450 → 400`. Line links are labelled "View Patch 26.19 change: Aatrox Cooldown", step links "View in Patch 26.15 report: Alistar", with 0 unlabeled links. Headings run h2 Catch Up › h3 sections. Systems "ADC MAGIC RESISTANCE" is present since 26.14 and since 26.10 |
| Continuity notes | Only on PH3-B chains, on the final step. Bel'Veth "Back to 105, its value before 26.15". Sundered Sky "Back to 400, its value before 26.16". Since 26.10 adds Mordekaiser "Back to 10%, its value before 26.14" and Sylas "Back to 40 / 60 / 80 / 100 / 120 (+40% AP), its value before 26.12" |
| Semantic-intent words | None in Mogzy text. The only "revert" occurrences on screen (since 26.10) are Riot's own text, shown verbatim: the Mordekaiser and Heartsteel Riot notes, and the Karthus line label "Q (reverted to match SR)". There is no "last played" anywhere |
| Incomplete coverage | Riot content stays and Mogzy continuity is hidden (below) |

### Network (headless msedge, `request` events; SPA navigation from `/terms` so counts are exact)

| Scenario | Requests |
|---|---|
| Normal `?patch=26.19` cold | `/api/patch-reports`, `/api/patch-reports/26.19` (Catch-Up view never mounted) |
| Chip → 26.18 / back → 26.19 | `26.18` / 0 |
| PH2: open Vi Explore / Draven Explore | 0 / `/api/meta/champion-stats` only (that request comes from PH2, never from Catch-Up) |
| Switch to Catch-Up (idle `?view=catchup`) | **0** |
| Pick 26.14 (list + 26.19 cached) | `26.15`–`26.18` |
| 26.14 → 26.18 / → 26.10 | 0 / `26.11`–`26.14` |
| Open every section, search, clear, no-match, keyboard toggles | **0** |
| Cold `?since=26.14` (refresh) | list + `26.15`–`26.19` |
| Deep link to cached 26.17, same-patch hash change, Back ×2, Arena link + Back | **0** each |
| 26.17 forced 500 → Retry | Retry = exactly `/api/patch-reports/26.17` |
| Catch-Up → Patch Report (26.19 older than 60 s) | `26.19`. This is the page's pre-existing stale-while-revalidate (app `staleTime` 60 s), unchanged on purpose; see PH3-D handoff §11 |

No Catch-Up request ever touches `champion-stats`. Catch-Up reads the canonical query keys shared with the Patch Report (cache hits above).

---

## 7. Tests

The run used the regression set from the PH3-D handoff §14, plus the Jhin attack-speed regression, `feedback/contract`, playtest and AudienceSections (as a sanity check on the new Supabase types). Command: `vitest run <set> --maxWorkers=4` (the full 820-file suite OOMs here in one process). Script: `vt.sh` in the session scratchpad.

| Tree | Files | Tests |
|---|---|---|
| **Integration (final, `fe2d202c`)** | 63 passed, 1 failed (64) | **1,129 passed, 5 failed** |
| Clean `a5c0edb0` (same set; PH3 paths absent) | 52 passed, 1 failed (53) | 810 passed, 5 failed |

- **The 5 failures are identical on both trees:** `src/lib/feedback/contract.test.ts`, which compares the feedback contract with the DB CHECK constraints. They are pre-existing and unrelated, and the same 5 the PH3-D handoff recorded.
- The +319 tests are exactly the PH3 suites:
  - PH3-B: chains 64, corpus 39, patch-range 20, value 14;
  - PH3-C: assemble 33, guards 10, plan 24, hook 47;
  - PH3-D: presentation 27, route 8, page 33 (32 + 1 new).
- Also in the set:
  - PH2: `patch-impact` incl. the Jhin regression in `analyze.test.ts`, `patch-impact-loader`, `usePatchImpactLoader`, `components/patch-impact`;
  - Jhin attack speed: `league-docs/attack-speed`, `LeagueDocsChampionDetail.attack-speed`;
  - PH1: `lib/patch-reports` incl. `patch-brief` and `patch-brief.unchanged`, `components/patch-reports`, PatchReports page and history tests;
  - Academy Broadcast (Centerpiece, `patch-brief` surface, `usePatchBriefFeed`), LolHub + background, PageReportControl, playtest, AudienceSections.
- Mutation check for §8: with the fix stashed, the new test fails.

**ESLint** (`--max-warnings 0`) on all 43 changed TS/TSX files (`git diff --name-only --diff-filter=AM a5c0edb0 HEAD`): **clean**.

**TypeScript** (`tsc -p tsconfig.app.json --noEmit`) on a clean checkout of `a5c0edb0`: **6 errors**. On the integration tree, before and after the fix: **6 errors, an identical set**:
- `OnboardingProfile.tsx(180)`;
- `identity/connections.ts(263)`;
- `practiceLeaveContract.test.ts(37–40)` ×4.

The PH3 differential is **0**.

---

## 8. Defect found and fixed during certification

**Symptom (production data, headless msedge, and reproduced with a real mouse click):**
1. Catch-Up since 26.14.
2. Sundered Sky 26.17 line link → Patch Report.
3. Click a section-nav link on the report (`PatchHubSectionNav`, a native `<a href="#…">`).
4. Back → report anchor (correct).
5. Back → `?since=26.14#cu-sr-items-sundered-sky`, but the page sat at **y = 0** (entry 26,409 px below) instead of the entry.

**Cause.** The trace showed the Catch-Up `#cu-` effect did call `scrollIntoView` (y → 26,313). About 55 ms later, after `popstate`, the browser's own history scroll restoration (`history.scrollRestoration = "auto"`) moved the page to a stale position. Without the intermediate fragment navigation it did not happen, which is why the PH3-D certification (direct Back) passed. The PH3-D code was byte-identical in the merge, so this was latent in PH3-D, not an integration regression.

**Fix (`fe2d202c`, `PatchCatchUpView.tsx`).**
- The `#cu-` scroll is re-applied once on the next animation frame, only if the element is still connected.
- The frame is cancelled on unmount.
- There is no change to routing, history, URL contract, network or product semantics. The report-side hash scroll (PH3-D fix #13) is unchanged: report Back after a section-nav click was verified correct without it.

**Proof.**
- After the fix, the same flows land at top = 96 px:
  - Sundered Sky: section-nav click, then Back ×2;
  - native `location.hash` change, then Back ×2;
  - Arena Akali line: Back re-opens Arena and lands at top 96.
- New page test: fragment navigation then Back ×2 re-applies the scroll. It fails without the fix.

---

## 9. Browser certification

**Setup.**
- Real route `/lol/patch-reports`, Vite dev server on the integration worktree (port 5341).
- Production API read-only.
- Headless Playwright (msedge). Supabase requests were aborted by the harness: 400 aborted requests produced the `net::ERR_FAILED` console lines, which are not app errors.
- The in-app Browser pane was hidden and too slow for the matrix (same reason as PH2).

### Width matrix

Report = `?patch=26.19`; Catch-Up = `?since=26.14`, `26.18`, `26.10`, with **every** `<details>` and every "How?" open.

| Width | Page overflow (report / 3× Catch-Up) | Elements outside viewport (Catch-Up) | Duplicate IDs | Lines 14 / 18 / 10 | Notes since 14 | Select height |
|---|---|---|---|---|---|---|
| 320 | none / none | 0 | 0 | 987 / 214 / 1,619 | Bel'Veth, Sundered Sky | 44 px |
| 375 | none / none | 0 | 0 | 987 / 214 / 1,619 | same | 44 px |
| 768 | none / none | 0 | 0 | 987 / 214 / 1,619 | same | 37 px |
| 1280 | none / none | 0 | 0 | 987 / 214 / 1,619 | same | 37 px |
| 1440 | none / none | 0 | 0 | 987 / 214 / 1,619 | same | 37 px |

- Since 26.18 has 0 notes at every width, and since 26.10 has 4.
- At 320/375 the only horizontally scrolling element is the existing PH1 patch-chip row (`nav … overflow-x-auto`, by design). Its off-screen chips are the 6 "outside" buttons on the report. Document `scrollWidth` equals the viewport.
- The view switch is one row: 46 px at mobile widths, 38 px from 768.

Screenshots (session scratchpad, not committed):
- `report-375`, `report-1280`;
- `since14-top-320`, `since14-top-1280`;
- `since14-belveth-320`, `since14-belveth-1280`;
- `incomplete-375`.

Visual check: the report is intact (chips, filters, section nav, Mogzy data notice); Catch-Up shows the h2, the picker, the range line, totals, search and the section nav. Bel'Veth shows its chip and Riot raws at 320.

### Flows

| Check | Result |
|---|---|
| Normal report | Unchanged; switch "Patch Report" is current; chip switching works |
| PH2 Patch Impact | 5 Explore toggles on 26.19. Vi "Crosses at 8"; Draven projects (2 sliders) and keyboard End → 18. 0 page errors |
| Keyboard mode switch | Enter on "Catch Up" → `?view=catchup`, focus on `SELECT#patch-catchup-baseline` labelled **"I last knew patch"**. Enter on "Patch Report" → `?patch=26.19`, focus `#patch-report-heading`. Back → `?since=26.14` |
| Section disclosure (keyboard) | Focus summary; Enter opens ("Hide", sr-only "Classic, 382 changes"); Space closes |
| Deep links | Line link label "View Patch 26.17 change: Sundered Sky Health". **Cached** target top 96 with 0 requests. **Same-patch hash change** (native) top 96 with 0 requests. **Cold** `?patch=26.17#…` load scrolls to the target (top 90). **Back** to Catch-Up lands on the entry at 96. Arena (collapsed) Back re-opens Arena at 96 |
| Refresh on `?since=26.14` | Re-renders 987 changes · 260 entries · 5 patches |
| Incomplete (26.17 → 500, 375 px) | Banner "Patch 26.17 didn't load. Its changes are missing below, and Mogzy notes are hidden until every patch in the range loads." with Retry. 785 lines (987 − 202). Notes, chips and trail dots all 0. **Retry → exactly `/api/patch-reports/26.17`**, then 987 lines with both notes back and the banner gone |
| Reduced motion | Playwright `reducedMotion: "reduce"` (real emulation; `matchMedia` true). 0 of 7,228 Catch-Up and switch elements have a running transition or animation. `scroll-behavior: auto` |
| Console | No app console errors or page errors. The only non-Supabase console error is the forced 500 of the incomplete test |

---

## 10. Known limitations

1. Every PH3-D limitation (PH3-D handoff §12) and every PH3-B and PH3-C limitation stands. These include:
   - low chain recall by design;
   - owner-only aliases;
   - index freshness ≤ 30 min;
   - whole-entry search with detail-text matches (production "Locke" also lists Classic and ARAM: Mayhem "General" entries);
   - disclosure state not kept across leaving.
2. The §8 fix re-applies the scroll once, one frame later. If a browser restored scroll even later than the next frame, Back would again land on the stale position. That was not observed in Chromium (msedge); other engines were not tested.
3. The Patch Report keeps the app-default 60 s `staleTime`. Returning to a report after 60 s triggers one background refetch, as before PH3.
4. Browser certification was headless msedge with Supabase aborted. Account-dependent chrome (signed-in HUD) is not represented.
5. The PH3-A audit's historical instructions (§15) mention the original docs path; the canonical copy is noted inline.

---

## 11. Final commit and merge instructions (owner)

Branch `patchhub/ph3-final-integration`:
- `145a562e` merge;
- `53b98f45` PH3-A audit;
- `fe2d202c` fix;
- the commit carrying this file, which is the branch tip.

It is based directly on `a5c0edb0`. Not pushed.

```bash
git fetch origin
git rev-parse origin/main          # expect a5c0edb0990db7db6dc94c46fe020ff4ae40e4a8
git switch main && git merge --ff-only origin/main
git merge --ff-only patchhub/ph3-final-integration   # fast-forward when main is still a5c0edb0
# if main has moved: git merge --no-ff patchhub/ph3-final-integration, then re-run tsc + the §7 set
git push origin main               # owner only
```

Do not merge `patchhub/ph3a-continuity-audit` separately (duplicate fixture; its content is here). The PH3-B/C/D branches are fully contained.

---

## 12. Verdict

**PH3 final: READY** for owner merge. All locked semantics, corpus, network, test, lint, TypeScript and browser checks pass on the integrated tree. One latent PH3-D Back-scroll defect was found and fixed with a regression test (§8).
