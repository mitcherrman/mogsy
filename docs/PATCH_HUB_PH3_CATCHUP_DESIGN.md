# PATCH HUB PH3-D — CATCH-UP UI/UX DESIGN CONTRACT

**"Catch Up: what changed after patch X?"**

Owner design gate. **This is a design document only**: no application code, nothing pushed, merged or deployed. It turns the proven PH3-B domain (`buildCatchUpReport`) and the PH3-C loader (`usePatchCatchUpLoader`) into a concrete, reviewable experience. Implementation (PH3-D build) starts only after the owner signs off on §25.

Authority order is unchanged: PH3-A audit (matcher rules) › PH3-B handoff (two-layer contract, wording rules §11) › PH3-C handoff (loader states, §11 integration task) › this document (presentation). Nothing here loosens a PH3-A/B rule.

---

## 1. Current baseline and drift

| Item | Value |
|---|---|
| Repo | `mitcherrman/mogsy` |
| `origin/main` | `d84c0ddd1785f7829206a14d2379691c28a329a6` (verified by `git fetch`, 2026-10-05) |
| PH3 base | `a1958ff3` (PATCHHUB-PH2-INT) |
| Drift since PH3 base | 2 commits: `2cf80003` SCBS1 (Stat Check Arena boundaries), `d84c0ddd` SCBS1 handoff |
| Drift footprint | `SCBS1_HANDOFF.md`, `e2e/ranked-statcheck-boundary.spec.ts`, `playwright.arena.config.ts`, `src/components/ranked-arena/*`, `src/lib/playtest/preset.ts`, `src/lib/ranked-core/modules/metaReflexModule*`, `src/pages/dev/ranked-shell-probe/*` |
| Overlap with Patch Hub / Catch-Up | **None.** No file under `src/pages/lol`, `src/components/patch-*`, `src/lib/patch-*`, `src/hooks/usePatch*` or `docs/PATCH_HUB_*`. `git merge-tree d84c0ddd patchhub/ph3c-catchup-loader` is clean. |
| PH3-A | `3f3eec28` on `patchhub/ph3a-continuity-audit` — docs + fixture only; **not an ancestor** of PH3-B/C (PH3-B copied the fixture). |
| PH3-B | `f1f40b06` on `patchhub/ph3b-catchup-domain` (base `a1958ff3`) |
| PH3-C | `8e068743` on `patchhub/ph3c-catchup-loader` (base PH3-B) |
| This document | `patchhub/ph3d-catchup-design` (base PH3-C `8e068743`), worktree `C:\Users\mlmit\mogzy-wt\ph3d-catchup-design` |
| Pushed / merged | none of the above |

Current Patch Hub presentation inspected: `src/pages/lol/PatchReports.tsx` (222 lines: masthead, patch chip row `?patch=`, search + type + Mogzy-status filters, section nav, sections, reconciliation notice, source footer, hash-scroll effect), `PatchHubMasthead`, `PatchHubSection` (direction buckets), `PatchHubSectionNav`, `PatchReportEntityCard` / `EntityHeader` / `AbilityGroup` / `ChangeLine` (`PatchReportValueChange`), `HistoricalContext`, `PatchReportEntrySlots`, and `patch-impact/PatchImpactChangeAnalysis` (PH2 slot).

---

## 2. Final UX thesis

> **Catch Up is the Patch Report re-read by entry instead of by patch.** Pick the last patch you know; Mogzy shows every Riot change after it, once, grouped by the thing that changed, in patch order — with a small Mogzy note only where Mogzy can prove a value moved across patches.

What makes it better than opening five patch notes:

1. **One place per champion/item.** Bel'Veth's 26.15 rework and 26.16 follow-up sit together; you never have to remember that she appeared earlier.
2. **Chronology inside the entry.** Each patch is a labelled step, oldest first, with Riot's exact `before → after`.
3. **Proven trails, not guesses.** Where (and only where) a value was changed and changed again, a one-line Mogzy note states the value fact ("Health Growth back to 105").
4. **Scale handled honestly.** Big mode sections (Arena, ARAM: Mayhem, Classic) are present, counted and one tap away instead of burying Summoner's Rift.

The ordinary single-patch Patch Report is untouched in content and behaviour.

---

## 3. Information architecture

```
Patch Hub (h1)
├── [Patch Report] [Catch Up]          ← view switch (new, small)
├── Patch Report view (unchanged)      ?patch=<v>
└── Catch Up view                      ?since=<v>
    ├── Catch Up header (h2): baseline picker + range line + totals
    ├── Coverage banner (only when needed)
    ├── Search (single input) + section nav
    ├── Sections (h3), merged across patches
    │   └── Entries (h4), alphabetical
    │       └── Patch steps (h5), oldest first
    │           └── Riot group (h6) → property: before → after
    │               └── Mogzy note (final step of a proven chain only)
    ├── Other announcements (cards with no itemised changes)
    └── Footer: per-patch Riot sources + "About Mogzy notes"
```

Two truth layers stay visible in the structure: everything in Sections is **Riot layer 1** (`report.lines` via `report.entities[].riotLines`); Mogzy notes are **decoration** on specific steps (`entity.chains`) and never create, hide or reorder a Riot line.

---

## 4. Route / query contract

| URL | View | Notes |
|---|---|---|
| `/lol/patch-reports` | Patch Report, latest | unchanged |
| `/lol/patch-reports?patch=26.17` | Patch Report 26.17 | unchanged |
| `/lol/patch-reports?patch=26.17#<change-anchor>` | Patch Report, scrolled | unchanged (deep-link target for Catch-Up) |
| `/lol/patch-reports?since=26.14` | **Catch Up**, changes in (26.14, latest] | new |
| `/lol/patch-reports?view=catchup` | **Catch Up**, idle (picker, nothing fetched) | new; written only when the user opens Catch Up with no baseline and no remembered baseline |
| `/lol/patch-reports?since=26.14#cu-<entity>` | Catch Up, scrolled to an entry | new; written by Catch-Up itself before leaving (see §14) |

Rules:

1. **`since` is the mode.** Its presence selects Catch Up; its value is the loader's `sincePatch`. The loader is `enabled` exactly when the view is Catch Up **and** `since` is non-empty (a URL carrying `since` is itself an explicit user action — a link they opened or a refresh of their own choice). Ordinary Patch Report rendering never mounts the hook.
2. **`patch` and `since` do not coexist.** Entering Catch Up drops `patch`; leaving drops `since`/`view`. If a URL carries both, Catch Up wins and `patch` is removed with `replace` (it is not reinterpreted as `through`).
3. **`through` is implicit latest in V1.** The loader's `throughPatch` is omitted. `through` is **reserved** for a future explicit end patch; V1 never writes it and removes it with `replace` if present (honouring a param no control can produce would create an untested surface).
4. **`since` value** is used verbatim as the listed spelling. Validation is the loader's/domain's (`range_invalid` details, coverage floor clamp); the UI never re-implements ordering.
5. **Search text is not in the URL** (matches the Patch Report page, whose filters are component state).

### History behaviour

| Action | History op | Back goes to |
|---|---|---|
| Switch Patch Report → Catch Up | **push** | the report the user was reading |
| Choose / change baseline inside Catch Up | **replace** | (same as above — tweaking a picker must not stack entries) |
| Switch Catch Up → Patch Report | **push** `?patch=<return patch>` | Catch Up at the same baseline |
| Follow a Catch-Up link to a Patch Report line | `replace` current entry with `?since=X#cu-<entity>`, then **push** `?patch=<v>#<change>` | Catch Up, scrolled to the entry the user left |

"Return patch" = the `patch` the user was on when they entered Catch Up (kept in router `location.state`); absent (refresh, direct link) → no `patch` param, i.e. latest.

### Refresh

Refresh preserves the view and baseline because both live in the URL. Catch Up re-renders from the shared TanStack cache when warm (0 requests, PH3-C §5) or re-fetches the range; scroll position is restored by the `#cu-` hash when present.

---

## 5. Entry / exit behaviour

### Entry control — a two-item view switch

Directly under the `Patch Hub` h1, inside `PatchHubMasthead`:

```
Patch Hub
[ Patch Report ]  Catch Up
```

- Two **links** (`<a>` via router `Link`), styled as a compact segmented control in the existing gold-border language. Not ARIA tabs: each changes the URL and the browser history, and each is a real navigation target.
- `aria-current="page"` on the active one; container `<nav aria-label="Patch Hub views">`.
- "Catch Up" has a one-line hint shown **only in the Patch Report view** at ≥ 640 px, right of the switch, muted: *"Missed a few patches? Pick the last one you know."* On < 640 px the hint is omitted (the picker copy carries it).

Why not a button near the patch chips: the chip row is a horizontally scrolling strip on mobile; a button there is either lost off-screen or forces another row. Why not a third control in the filter bar: Catch Up is a different reading of the hub, not a filter of one patch. The switch costs one short row and reads instantly.

### Entering

- **From Patch Report with a remembered baseline** (§13): push `?since=<remembered>`; content loads immediately. Picker shows the remembered value.
- **From Patch Report without one**: push `?view=catchup`; idle state (picker + one-sentence explanation), **nothing is fetched**; focus moves to the picker.
- **From a link** (`?since=…`): Catch Up directly.

### Exiting

- "Patch Report" in the view switch (push, §4).
- Every patch badge / line link (deep link, §14).
- Browser Back.

On entering Catch Up, the Patch Report's patch chip row, search/type/status filters, section nav and reconciliation notice are not rendered; the masthead shows only the h1 + view switch. The Patch Report detail query is **disabled** in Catch Up (it must not fetch the latest report in the background).

---

## 6. Patch picker design

A **native `<select>`** inside the Catch Up header.

```
I last knew patch  [ 26.14  ▾ ]
Showing changes in 26.15 – 26.19 · 26.14 itself is not included
```

- `<label for>`: **"I last knew patch"** (sentence reads as a statement of the reader's knowledge, never "last played").
- Options: every patch in the already-loaded `["patch-reports"]` index **except the newest**, newest first (same order as the chip row). Picking the newest would only produce "up to date"; it is still reachable by URL and handled (§17).
- Default selected: URL `since` › remembered baseline › none (`"Choose a patch…"` placeholder option, `disabled`, in idle state).
- `onChange` → `replace` `?since=<v>`; no submit button (native selects are keyboard-operable without one; change fires on commit on every platform we support).
- Helper line under it is the **range line**: `Showing changes in {first} – {through}` (or `Showing changes in {through}` for a one-patch range), followed by `· {since} itself is not included`. `{first}` = `report.includedPatches[0]` when loaded, else the plan's first required version.
- The index is the page's own `["patch-reports"]` query (already fetched for the chip row; no extra request).
- No end-patch control in V1 (§4.3).

Why native: correct semantics and the platform wheel/sheet on mobile for free; ten options need no custom listbox.

---

## 7. Result organization decision

### Real-corpus evidence (production 26.10–26.19, PH3-B trimmed corpus)

| Range | Patches | Riot lines | Entries | Entries changed in > 1 patch | Champions + Items lines | Arena + ARAM: Mayhem + Classic lines |
|---|---|---|---|---|---|---|
| since 26.18 | 1 | 214 | 50 | 0 | 38 | 173 |
| since 26.17 | 2 | 323 | 68 | 3 | 68 | 242 |
| since 26.14 | 5 | 987 | 264 | 20 (7 SR) | 207 | 752 |
| since 26.13 | 6 | 1,085 | 300 | 26 (11 SR) | 237 | 819 |
| whole corpus | 10 | 1,775 | 585 | 104 (37 SR) | 376 | 1,327 |

Sections per range (since 26.14): Champions 178 lines / 53 entries · Items 29 / 16 · Runes 4 / 3 · Systems 10 / 2 · Classic 382 / 44 · ARAM: Mayhem 165 / 61 · Arena 205 / 79 · Hall of Legends 10 / 1 · Apex Duo Restrictions 3 / 1 · Aegis of Valor 1 / 1 · plus 3 cards with no itemised lines (League of Legends Classic, Updated System Requirements, Team Voice).

Line counts per entry are heavy-tailed: median 2; the top entries are `Classic — General` (203 lines over 4 patches), Bel'Veth (46: a 43-line 26.15 rework + 3 in 26.16), a few Mayhem/Arena entries in the 20–60 range.

Proven chains: **2** in since 26.14 (Bel'Veth Health Growth 26.15→26.16; Sundered Sky Health 26.16→26.17), 0 in since 26.17/26.18, 5 over the whole corpus.

### Options assessed

- **A. Entity-first flat** (one list of entries, all sections mixed): wrong for this corpus. 75 % of lines are mode content; a flat alphabetical list interleaves 79 Arena augments and 61 Mayhem entries with SR champions, and an Arena "Locke" next to SR "Locke" invites exactly the cross-mode confusion PH3-B forbids (entity keys never merge across modes).
- **B. Patch-first** (26.15 in full, then 26.16…): this is "opening five patch notes" — it already exists as the Patch Report. It scatters the 20 multi-patch entries and puts chain steps patches apart.
- **C. Hybrid — section › entry › patch step**: official section first (keeps Riot's meaning: Arena stays Arena, Systems stays Systems), then **entity-first inside each section**, then chronological patch steps inside the entry.

### Decision: **C — section-scoped entity-first.**

This *is* the recommended entity-first pattern, scoped by official section because the corpus demands it. Concretely:

1. **Section order**: `Champions`, `Items`, `Runes` (section ids `patch-champions`, `patch-items`, `patch-runes` — the generic SR sections the report already special-cases) first; then every other section in **merged official order**: take the newest included report's `section_titles` order as the skeleton; insert each older-only section directly after its nearest preceding section from its own report (front if none). Deterministic, uses only Riot's ordering, no invented classification. Sections are keyed by `CatchUpSection.key` (`section_id`), so `Systems` and `Game Systems`, `Classic` and `League of Legends Classic` remain the distinct sections Riot published.
   *Why pin the three SR sections:* Riot puts one-off headline sections (Team Voice, Hall of Legends, Locke) before Champions inside a patch; across a range those headlines are not "the first thing", and the core question of a catch-up is "what happened to my champions and items". This is the only reordering Catch Up performs, and it is at section granularity.
2. **Entry order inside a section**: alphabetical by entity name (`localeCompare`, base sensitivity). Riot's own within-bucket order is alphabetical; direction buckets cannot survive across patches (Bel'Veth is a Riot "adjustment" in one patch and a "nerf" in the next), so direction moves down to the patch step.
3. **Step order inside an entry**: `appearances` order (oldest first), each step = one patch's card for that entity, its lines in the report's own group → change order (`riotLines` already carries page order).
4. **Large non-chainable sections render collapsed by default** — see §10 and Owner Decision 1.

---

## 8. Entry anatomy (the Catch-Up row)

A Catch-Up entry is **lighter than a Patch Report card**: no per-line Mogzy evidence disclosure, no reconciliation marks, no PH2 Patch Impact, no historical-context box. Those belong to the single-patch report, one tap away.

```
┌──────────────────────────────────────────────────────────────┐
│ [img] Bel'Veth                                     🔗         │  h4 + entry anchor link
│       Champion · 46 changes · 26.15, 26.16                    │  meta line
│       ◆ Mogzy: Health Growth back to 105                      │  summary chip (only if chain)
├──────────────────────────────────────────────────────────────┤
│ │ 26.15  ◆ Adjustment                         Open in report ↗│  h5 step header
│ │ ▸ Riot's note                                               │  disclosure (if context_text)
│ │ BASE STATS                                                  │  h6 group
│ │   Attack Speed        0.85 → 0.67                       🔗  │
│ │   Health Growth ●     105 → 110                         🔗  │  ● = part of a Mogzy trail
│ │   …                                                         │
│ │ Q · VOID SURGE                                              │
│ │   …                                                         │
│ │ 26.16  ▼ Nerf                               Open in report ↗│
│ │ BASE STATS                                                  │
│ │   Health Growth ●     110 → 105                         🔗  │
│ │   ┊ Mogzy · Back to 105, its value before 26.15  ▸ How?    │  continuity note
│ │ R · ENDLESS BANQUET                                         │
│ │   True Form Total Attack Speed  5 / 15 / 25% → 6 / 13 / 20% │
│ │   ◇ True Form Remora Indicator (prose, Riot's text)        │
└──────────────────────────────────────────────────────────────┘
```

| Element | Source | Rule |
|---|---|---|
| Image | `card.mogzy_image_path` › `official_image_url` › initials (reuse `EntityImage` from `PatchReportEntityHeader`, exported) | from the **newest** appearance's card; 40 px (< 640) / 48 px (≥ 640) — smaller than the report's 64/80 |
| Name | `entity.name` | `h4`, `[overflow-wrap:anywhere]` |
| Meta line | type label (as report: hidden for `system`), `riotLines.length` changes, patch list from `appearances` | patch list is plain text, comma-separated, wraps |
| Summary chip | `entity.chains` | only when ≥ 1 chain; §9 |
| Entry anchor | `cu-<entity.key slug>` | see note below |
| Step header (h5) | `Patch {patch}` visible as badge `{patch}`; direction chip | direction from the report-structure editorial resolution for that card (`DirectionChip`, exported; Riot-sourced directions plain, Mogzy-inferred labelled "(inferred)", absent → nothing) |
| "Open in report ↗" | `?patch={patch}#{appearance.entityAnchor}` | text link, same tab (§14) |
| Riot's note | `card.context_text` (trimmed) | collapsed `<details>` "Riot's note"; omitted when empty or when it is the section's shared intro (same `contextKey` test the report uses) |
| Group heading (h6) | `line.change.group_title` (+ ability slot badge like the report's ability group, text only — no ability icon) | omitted for empty group titles (items) |
| Line | property label + `PatchReportValueChange` (reused verbatim: raw strings, neutral arrow, wrap rules); prose lines render Riot's `detail_text` with the ◇ mechanic marker; `is_new` → "New" badge | identical grammar to the report so a reader never relearns notation |
| Line link 🔗 | `?patch={line.patch}#{line.target.change}` | icon link, `aria-label="{property} in Patch {patch} report"` |
| Trail dot ● | `line.chainId != null` and line is **not** the chain's last step | 6 px gold dot after the property, `title` + sr-only "continues in Patch {next}" |

**Entry anchor note:** Catch-Up entry ids are `cu-<entity.key slug>` (`cu-sr-champions-bel-veth`, `cu-arena-system-locke`), derived from the domain's `entity.key` (unique per range, mode-safe). They never reuse Patch Report anchors, so a hash can never be ambiguous between views.

**Long entries:** no truncation of Riot lines in SR sections. Bel'Veth's 43-line rework is shown in full; it is the content. Inside collapsed sections (§10) everything is behind the section disclosure anyway.

---

## 9. Continuity annotation anatomy

Chains are ≤ 5 across 1,775 lines; they must read as a quiet insight, not a feature.

### Where

1. **Final step** (primary): directly under the chain's **last** Riot line, indented, a single line in the existing Mogzy-insight style (gold-tinted text, small "Mogzy" eyebrow, same family as `HistoricalContext`/`PatchImpact`, but one line — no box):
   `Mogzy · Back to 105, its value before 26.15`
2. **Entry summary chip** (secondary, for scanning): in the entry header, `◆ Mogzy: Health Growth back to 105`. It is an in-page link to the final-step note (`#<note id>`). With 2+ chains on one entry: `◆ 2 Mogzy notes` (production max is 1).
3. **Earlier steps**: only the trail dot (§8). No text.

No page-level "Mogzy found 2 trails" banner, no filter, no trail graphic in V1. A trail visualization (`105 → 110 → 105` sparkline) was evaluated and rejected: the steps already sit vertically in order within the entry, so the trail *is* the entry; a mini graph would add a non-Riot visual that out-shouts Riot's lines and fails on rank arrays.

### Wording (from PH3-B `valueState`; verbatim Riot strings from `net.startRaw/endRaw`; computed numbers only from `net.components`)

| `valueState` | Note (final step) | Summary chip |
|---|---|---|
| `returns_to_start_value` | `Back to {startRaw}, its value before {firstStepPatch}` | `{property} back to {startRaw}` |
| `changed` | `Net since {since}: {delta}` | `{property} net {delta}` |
| `partially_returns_toward_start` | `Net since {since}: {delta} — part of the way back to {startRaw}` | `{property} net {delta}` |
| `moves_beyond_start` | `Net since {since}: {delta} — now past {startRaw}` | `{property} net {delta}` |
| `multi_step_non_monotonic` | `Net since {since}: {delta} (changed direction along the way)` | `{property} net {delta}` |
| `net_unavailable` | `Changed across {n} patches: {startRaw} → {endRaw}` | `{property} changed across {n} patches` |

- `{delta}`: one component → signed value with Riot's unit (`+40`, `−5%` rendered as `−5 percentage points` in the note and `−5 pts` in the chip); several components (rank arrays) → `per rank {d1} / {d2} / …`; a component with `delta` `0` prints `0`. `{since}` is `report.sincePatch` — valid because a chain only exists when every in-range occurrence of the identity is in it and coverage is complete (PH3-B).
- **Never**: "reverted", "undone", "rolled back", "Riot walked back", buff/nerf language, intent.
- `concurrentMechanical: true` → append to the disclosure (not the line): *"Riot also changed how this part of the kit works in {patch}. This note is about the number only."*

### "How?" disclosure (`<details>` on the note)

- Exact identity: *"Same parameter in both patches: {Group} · {Property}. Each patch's 'before' matches the previous patch's 'after'."*
- Approved alias (`identityProvenance: "approved_alias"`): *"Riot renamed {fromProperty} ({fromPatch}) to {toProperty} ({toPatch}). Mogzy links these two lines from a reviewed rename record; the values are Riot's."*
- Steps list: `{patch}: {before_raw} → {after_raw}` per step (verbatim).

Exact vs alias provenance is **only in the disclosure**. The note line is identical for both: both are proven; the distinction is evidence, not confidence tiers a reader must interpret.

---

## 10. Non-chainable / system change treatment

All Riot lines survive; the question is only default visibility.

1. **Every section with lines is rendered** with its heading (h3), line count and entry count, in §7 order, and is listed in the section nav.
2. **Collapse rule (default view, no search):** a section renders **collapsed** when it is non-chainable (`CatchUpSection.chainable === false`) **and** has more than **40** lines. Otherwise open. On the real ranges this collapses exactly Arena, ARAM: Mayhem and Classic (and `Classic — General`'s 203 lines with it) and keeps Systems, Runes, Hall of Legends, Apex Duo Restrictions, Aegis of Valor open. Data-driven; no hard-coded mode list.
   - Collapsed section = `<details>` whose `<summary>` is the full h3 row: `Arena · 205 changes in 79 entries · 26.15–26.19   Show ▸`. Body mounts on first open (performance: 752 lines across three sections), then stays mounted.
   - A non-empty search **force-opens** any section with matches (§12), so collapsing never hides a searched-for change.
3. **Section intro** (Riot's shared context, e.g. Arena's season copy): per patch, shown once inside the section as `Riot · {patch}: <text>` collapsed `<details>` list at the top of the section — the same hoisting test the report uses (`buildPatchReportStructure`'s `sharedContext`). Never repeated per entry.
4. **Champions cross-reference.** When the range contains any lines in `Systems`, `Game Systems` or `Support Adjustments`, the Champions section shows one muted line under its heading: *"Some changes apply to many champions at once and are listed by Riot under {Systems/Support Adjustments} — jump."* (links to that section). This is the PH3-A §2 guard: 26.16 "ADC MAGIC RESISTANCE" changes 27 champions from a Systems card, and a champion entry must never be read as complete.
5. **System entries** (`entity_type === "system"`, e.g. `Classic — General`, `Miscellaneous`): same entry anatomy, no image (initials tile is replaced by a neutral glyph), type label hidden (as in the report).
6. **Other announcements.** `report.cardsWithoutChanges` (Team Voice 26.19, Updated System Requirements 26.17, League of Legends Classic 26.15…) are listed after the last section under h3 "Other announcements": `{entityName} · {patch} — Open in report ↗`. Nothing is silently dropped.
7. No regrouping into "Champions / Items / Other Riot Changes": that label would merge Riot's distinct sections (Systems, Support Adjustments, Arena, Classic) under a Mogzy name and distort official meaning. Riot's section names stay.

---

## 11. Incomplete-coverage states

Banner source: `loader.issues`, `report.coverage.issues`, `report.continuity.status`, `range.clampedToCoverageFloor` (never the state name alone — PH3-C §10.3). Banner sits between the Catch Up header and the search row; `role="status"`; tone **neutral/amber**, never red, unless nothing at all loaded.

| Situation | Detection | Copy | Action |
|---|---|---|---|
| One or more patches failed / malformed / conflicting | `resources[].status ∈ {failed, malformed, conflicting}` | **"Patch 26.17 didn't load."** "Its changes are missing below, and Mogzy notes are hidden until every patch in the range loads." (plural: "Patches 26.16 and 26.17 didn't load.") | `Retry` button when `canRetry`; while `retrying`: "Retrying 26.17…" with the button disabled; content stays |
| Continuity withheld for a non-load reason (duplicate, unorderable, ordinal gap) | `continuity.status === "withheld"` and no failed resource | "Mogzy couldn't confirm these patches are consecutive, so Mogzy notes are hidden. Every Riot change that loaded is shown." | none |
| Soft chronology limit | `coverage.issues` has `unverified_adjacency` (continuity may still be `available`) | "Mogzy notes don't cross {from} → {to} (Mogzy can't confirm those patches are back to back)." | none |
| `through_not_listed` | loader issue | treated as the failed-patch row with "isn't available yet" wording | Retry |
| Baseline below coverage | `range.clampedToCoverageFloor` | "Mogzy's patch reports start at {coverageFloor}, so this starts there." (info, not warning) | none |
| All reports unavailable | `failed / reports_unavailable` | **"Couldn't load patches 26.15 – 26.19."** "This isn't 'nothing changed' — the reports didn't arrive." | Retry (prominent) |
| Index failed / malformed | `failed / index_failed | index_malformed` | "Couldn't load the patch list." | Retry |
| Domain error | `failed / domain_error` | "Something went wrong building this catch-up." | link "Open Patch Report" |
| Invalid baseline | `failed / range_invalid` | `since_unparseable`/unknown: "Mogzy doesn't have a report called '{since}'. Pick a patch:" (picker focused) · `since_after_through`: "{since} is newer than the latest report ({through})." | picker |

Rules: never imply complete continuity when incomplete (no Mogzy note, chip or trail dot renders when `continuity.status === "withheld"` — the domain already returns `chains = []`; the UI asserts it too). Never hide available Riot content behind the banner. A complete range with available continuity shows **no banner**.

---

## 12. Search / filter scope

**V1: one search input. Nothing else.**

- `type="search"`, label "Search this catch-up" (visually: placeholder "Search champions, items, abilities…"), same styling as the report's search.
- Matches (case/diacritic-insensitive, same fold as the report's `filterCards`): entity name, group title, property name. Not prose text in V1 (prose matches made the report's search noisy for mode notes).
- Effect: entries without a match are hidden; within a matching entry **all** its lines stay (a reader who searches "Bel'Veth" wants the whole entry; a reader who searches "Health Growth" sees the entries that touched it, with every step). Sections with zero matches are hidden; sections with matches force-open. Counter in an `aria-live="polite"` region: "12 entries match".
- Debounced 150 ms; clearing restores the default collapse state.

Rejected for V1 (each fails "materially improves a long result" or duplicates navigation):

| Control | Why not |
|---|---|
| Type filter | Sections already are the type split; section nav jumps there. |
| "Changed multiple times" | 7 SR entries in a 5-patch range; the meta line ("26.15, 26.16") already shows it at a glance. Candidate for V2 if owners see heavy use of long ranges. |
| "Has Mogzy trail" | ≤ 5 results corpus-wide; a filter would market the overlay over Riot content. |
| Patch filter | That is the Patch Report. |
| Mogzy status filter | Reconciliation is a single-patch concern; it stays in the report. |

---

## 13. Remembered baseline decision

**In V1, minimal:** remember the user's most recently chosen Catch-Up baseline, browser-local.

- Key `mogzy.patchHub.catchUp.since` in `localStorage`; every access in `try/catch`; absence or failure = no memory (feature still fully works).
- Written when the user picks a baseline in the picker (not when a `?since=` link is merely opened — a shared link must not overwrite someone's own baseline).
- Read only when entering Catch Up without `since` (§5). If the remembered patch is no longer listed, it is ignored.
- Visible: under the picker, muted, only when the current baseline came from memory: *"Remembered from your last catch-up · Forget"* (`Forget` clears the key, keeps the current view).
- Never worded as "last played", "last login", "since you were away". It is "the patch you last picked".
- No "new since your last catch-up" badges, no auto-advance of the baseline, no account sync (later, if ever).

Why V1: it is ~30 lines, it is what makes the second visit one tap, and it keeps no data off-device.

---

## 14. Deep-link behaviour

Every Riot line, every step and every entry can return to its canonical source in the normal Patch Report using the **existing semantic anchors** carried by PH3-B (`line.target.change`, `appearance.entityAnchor`). No backend ids.

| Link | URL | Visual |
|---|---|---|
| Line | `/lol/patch-reports?patch={line.patch}#{line.target.change}` | 🔗 icon at line end |
| Step | `/lol/patch-reports?patch={patch}#{appearance.entityAnchor}` | "Open in report ↗" on the step header |
| Other announcement | `?patch={patch}#{sectionAnchor}` | text link |

- **Same tab**, router navigation (push), so Back returns to Catch Up. Before pushing, Catch Up `replace`s its own entry with `?since={since}#cu-{entry}` so Back restores scroll to the entry (§4). Ctrl/Cmd-click and middle-click open a new tab natively because these are real `<a href>`s.
- Riot rationale stays in Catch Up (Riot's note disclosure); Riot's external notes are in the footer (one source link per included patch, `target="_blank" rel="noopener noreferrer"`, as the report does).
- **Required fix in `PatchReports.tsx`**: the hash-scroll effect runs on `[detail]` only. Coming back from Catch Up to a report whose detail is already cached gives the same `detail` object, so the effect would not re-run and the page would not scroll. The effect must also depend on the router location (`location.key` / `location.hash`). Acceptance test in §22.
- The `cu-` hash is applied after the Catch-Up content is rendered (same pattern as the report: scroll once the report is ready; for a collapsed section containing the target, open it first).

---

## 15. Responsive behaviour

Container: the page's existing `mx-auto w-full max-w-6xl px-4 py-8`. Entry column is capped at `max-w-4xl` inside it (Catch-Up lines are shorter than report cards; long measure hurts scanning). No horizontal scrolling anywhere in Catch Up; no horizontal timeline.

| Width | Behaviour |
|---|---|
| **320** | View switch: two items on one row (`Patch Report` / `Catch Up`, 14 px). Picker: label on its own line, `<select>` full width (min-height 44 px). Range line wraps. Entry header: 40 px image + name (wraps anywhere) + meta wrapping onto 2 lines; summary chip on its own line. Step: left rail (2 px gold/25 line) with patch badge; "Open in report ↗" drops below the badge row. Line: property on its own line, values below (`PatchReportValueChange` already wraps arrow+after as a unit; long rank arrays and parentheticals break with `overflow-wrap:anywhere`). Line 🔗 sits at the top-right of the property row (24×24 hit area, 44 px tall row via padding). Collapsed-section summary wraps to two lines (`Arena` / `205 changes · 79 entries · Show ▸`). |
| **375** | As 320 with more breathing room; meta usually on one line. |
| **768** | Line grid becomes two columns like the report (`sm:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)]`); step header on one row (badge, direction chip, link right-aligned). Image 48 px. Search input `max-w-xs` beside the section nav row. |
| **1280** | Same layout; entry column `max-w-4xl` centered within the 6xl container. Section nav wraps above the content as in the report (no sticky sidebar in V1 — the report has none, and two navigation idioms in one hub would feel like two products). |
| **1440** | Identical to 1280 (container is capped); whitespace grows, line measure does not. |

Patch badges are plain text in a pill (`26.15`), never truncated; direction chip wraps under the badge if needed.

---

## 16. Accessibility

- **Heading outline**: h1 Patch Hub › h2 `Catch Up` (with the range as text in the same heading's description, not a second h2) › h3 section › h4 entry › h5 `Patch 26.15` › h6 Riot group. The report's existing outline (h2 Patch Report › h3 section …) is untouched; the two views never render together.
- **View switch**: `<nav aria-label="Patch Hub views">` with two links, `aria-current="page"`. Fully keyboard-operable (Tab/Enter).
- **Picker**: native `<select>` with a visible `<label>`; helper text linked via `aria-describedby`; invalid-baseline message linked the same way.
- **Mode change focus**: entering Catch Up → focus the h2 (`tabIndex=-1`) when a baseline is present, the `<select>` when idle; leaving → focus the report's h2. Changing the baseline keeps focus on the select. A polite live region announces load completion: "Showing 987 changes in 264 entries across 5 patches" (or the incomplete variant).
- **Loading**: `aria-busy` on the results container; progress text "Loading 3 of 5 patches…" from `loading_reports {settled,total}` in the same live region (throttled to start/end, not every tick).
- **Links**: icon-only line links carry `aria-label="{property}, Patch {patch} report"`; "Open in report" is visible text with sr-only "Patch {patch} {entity}" suffix. All are real anchors.
- **Disclosures**: native `<details>/<summary>` for collapsed sections, Riot's note, Mogzy "How?"; summary text states the action ("Show Arena, 205 changes"). Collapsed section summaries contain the h3 so the outline stays complete when collapsed.
- **Values**: reuse `PatchReportValueChange` (sr-only "From … to …"); trail dot has sr-only "continues in Patch {next}"; Mogzy note starts with sr-only "Mogzy note:" so it is never mistaken for Riot text.
- **Colour**: direction chips keep glyph + word (▲ Buff / ▼ Nerf / ◆ Adjustment); Mogzy notes are distinguished by the "Mogzy" word, not colour alone. Banner tone is not the only signal (it has a heading line).
- **Reduced motion**: no expand/collapse animation, no smooth scroll under `prefers-reduced-motion: reduce` (chevron rotation already `motion-reduce:transition-none` in the report — same classes).
- **Targets**: ≥ 44 px tall rows for summary/links on touch.

---

## 17. Empty and error states

| State | What the user sees |
|---|---|
| **Idle** (no baseline) | h2 Catch Up · "Pick the last patch you know. Mogzy will show every change after it, grouped by champion, item and mode." · picker focused. 0 requests. |
| **Loading** | Header + picker (operable) + "Loading 3 of 5 patches…" + three skeleton entry rows. Previous result is not shown for a different range (the loader withholds half-loaded ranges). |
| **Since = latest** (`up_to_date`) | "You're up to date — {through} is the newest patch report." + "Open Patch Report {through}". |
| **One-patch range** | Normal rendering; range line "Showing changes in 26.19"; one muted line: "This is patch 26.19 grouped by entry. Open the Patch Report for Riot's full layout and Mogzy's per-change data." No Mogzy notes possible (needs ≥ 2 steps) and no copy about their absence. |
| **Entry with one change / one step** | Step header still shown (patch badge is the useful fact); meta "1 change · 26.17". |
| **No search matches** | "No entries match "{query}" in 26.15 – 26.19." + "Clear search". Banner (if any) stays. |
| **Incomplete range** | Banner per §11 + whatever loaded, rendered normally, no Mogzy notes. |
| **All unavailable / index failed / domain error / invalid baseline** | §11. |
| **Patch list empty** | Same as the report: "No patch reports have been built yet." (picker hidden). |

---

## 18. ASCII wireframes

### Mobile (375 px; 320 identical with tighter wraps)

```
┌─────────────────────────────────┐
│ MOGZY KNOWLEDGE                 │
│ Patch Hub                       │
│ ┌─────────────┬──────────────┐  │
│ │Patch Report │▌Catch Up     │  │  view switch
│ └─────────────┴──────────────┘  │
│ ▌Catch Up                       │  h2
│ ▌I last knew patch              │
│ ▌┌───────────────────────────┐  │
│ ▌│ 26.14                   ▾ │  │  native select
│ ▌└───────────────────────────┘  │
│ ▌Showing changes in 26.15–26.19 │
│ ▌· 26.14 itself is not included │
│ ▌987 changes · 264 entries      │
│ ▌Remembered from your last      │
│ ▌catch-up · Forget              │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Search champions, items…    │ │
│ └─────────────────────────────┘ │
│ Champions 53 · Items 16 ·       │  section nav (wraps)
│ Runes 3 · Systems 2 · Hall of   │
│ Legends 1 · Classic 44 · …      │
│                                 │
│ CHAMPIONS  53                   │  h3
│ Some changes apply to many      │
│ champions at once — Systems ›   │
│ ─────────────────────────────── │
│ [img] Bel'Veth            🔗    │  h4
│       Champion · 46 changes     │
│       26.15, 26.16              │
│       ◆ Mogzy: Health Growth    │
│         back to 105             │
│ │ 26.15  ◆ Adjustment           │  h5
│ │ Open in report ↗              │
│ │ ▸ Riot's note                 │
│ │ BASE STATS                    │  h6
│ │ Attack Speed              🔗  │
│ │ [0.85] → [0.67]               │
│ │ Health Growth ●           🔗  │
│ │ [105] → [110]                 │
│ │ …                             │
│ │ 26.16  ▼ Nerf                 │
│ │ Open in report ↗              │
│ │ BASE STATS                    │
│ │ Health Growth             🔗  │
│ │ [110] → [105]                 │
│ │ ┊ Mogzy · Back to 105, its    │
│ │ ┊ value before 26.15 ▸ How?   │
│ │ R · ENDLESS BANQUET           │
│ │ True Form Total Attack    🔗  │
│ │ Speed                         │
│ │ [5 / 15 / 25%] →              │
│ │ [6 / 13 / 20%]                │
│ ─────────────────────────────── │
│ [img] Master Yi           🔗    │
│       Champion · 3 changes      │
│       26.18, 26.19              │
│ │ 26.18 …                       │
│                                 │
│ ARAM: MAYHEM                    │  collapsed <details>
│ 165 changes · 61 entries        │
│ 26.15–26.19          Show ▸     │
│                                 │
│ ARENA                           │
│ 205 changes · 79 entries  Show ▸│
│                                 │
│ OTHER ANNOUNCEMENTS             │
│ Team Voice · 26.19  Open ↗      │
│ …                               │
│ ─────────────────────────────── │
│ Riot notes: 26.15 · 26.16 ·     │
│ 26.17 · 26.18 · 26.19           │
│ ▸ About Mogzy notes             │
└─────────────────────────────────┘
```

### Mobile — incomplete range

```
│ ▌Showing changes in 26.15–26.19 │
│ ┌─────────────────────────────┐ │
│ │ Patch 26.17 didn't load.    │ │  role=status, amber border
│ │ Its changes are missing     │ │
│ │ below, and Mogzy notes are  │ │
│ │ hidden until every patch    │ │
│ │ loads.          [ Retry ]   │ │
│ └─────────────────────────────┘ │
│ (content renders; no ◆ chips,   │
│  no ● dots, no Mogzy notes)     │
```

### Desktop (1280 / 1440)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ MOGZY KNOWLEDGE                                                                      │
│ Patch Hub                                                                            │
│ [ Patch Report |▌Catch Up ]                                                          │
│                                                                                      │
│ ▌Catch Up                                                                            │
│ ▌I last knew patch [ 26.14 ▾ ]   Showing changes in 26.15 – 26.19 · 26.14 excluded   │
│ ▌987 changes · 264 entries · 5 patches       Remembered from your last catch-up·Forget│
│                                                                                      │
│ [ Search champions, items, abilities… ]                                              │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Champions 53  Items 16  Runes 3  Systems 2  Hall of Legends 1  Classic 44  …     │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│        ┌──────────────────────────── max-w-4xl ─────────────────────────────┐        │
│        │ CHAMPIONS 53                                                       │        │
│        │ Some changes apply to many champions at once — see Systems ›       │        │
│        │ [img] Bel'Veth  🔗                ◆ Mogzy: Health Growth back to 105│        │
│        │       Champion · 46 changes · 26.15, 26.16                         │        │
│        │ │ 26.15  ◆ Adjustment                          Open in report ↗    │        │
│        │ │ ▸ Riot's note                                                    │        │
│        │ │ BASE STATS                                                       │        │
│        │ │ Attack Speed           [0.85] → [0.67]                       🔗  │        │
│        │ │ Health Growth ●        [105] → [110]                         🔗  │        │
│        │ │ …                                                                │        │
│        │ │ 26.16  ▼ Nerf                                Open in report ↗    │        │
│        │ │ Health Growth          [110] → [105]                         🔗  │        │
│        │ │                        ┊ Mogzy · Back to 105, its value before   │        │
│        │ │                        ┊ 26.15   ▸ How?                          │        │
│        │ ITEMS 16                                                           │        │
│        │ [img] Sundered Sky  🔗                 ◆ Mogzy: Health back to 400  │        │
│        │ │ 26.16                                        Open in report ↗    │        │
│        │ │ Recipe        [Tunneler (1150g) + … + 500g] → [… + 900g]     🔗  │        │
│        │ │ Healing       […] → […]                                      🔗  │        │
│        │ │ Health ●      [400] → [450]                                  🔗  │        │
│        │ │ 26.17                                        Open in report ↗    │        │
│        │ │ Health        [450] → [400]                                  🔗  │        │
│        │ │               ┊ Mogzy · Back to 400, its value before 26.16      │        │
│        │ │ Attack Damage [45] → [40]                                    🔗  │        │
│        │ …                                                                  │        │
│        │ CLASSIC · 382 changes in 44 entries · 26.16–26.19       Show ▸     │        │
│        │ ARAM: MAYHEM · 165 changes in 61 entries · 26.15–26.19  Show ▸     │        │
│        │ ARENA · 205 changes in 79 entries · 26.15–26.19         Show ▸     │        │
│        └────────────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

(On desktop the entry summary chip moves to the right of the name row; at < 640 px it drops under the meta line.)

---

## 19. Exact PH3-D implementation scope

1. View switch in `PatchHubMasthead` (Patch Report | Catch Up) + the Patch Report hint.
2. `PatchReports.tsx`: read `since` / `view`; branch to `<PatchCatchUpView>`; disable the report detail query and hide report-only chrome in Catch Up; fix hash-scroll dependency (§14); history ops per §4.
3. Catch-Up view on `usePatchCatchUpLoader({ sincePatch, enabled })` (through omitted), rendering every loader state (§11, §17).
4. Baseline picker from the existing index query; range line; totals.
5. Remembered baseline (§13).
6. Pure presentation helpers (no domain change): section ordering (§7.1), entry grouping into patch steps and Riot groups, collapse rule (§10.2), search filter (§12), continuity wording from `valueState` + `net` (§9), coverage-banner model (§11).
7. Sections, entries, steps, lines (reusing `PatchReportValueChange`; exporting `EntityImage` and `DirectionChip` from `PatchReportEntityHeader` without behaviour change), Riot's note, section intros, Champions cross-reference, Other announcements, footer sources.
8. Continuity note, summary chip, trail dot, "How?" disclosure.
9. Deep links with scroll-restoring `cu-` hash.
10. Tests (§23) and real-browser certification captures at the five widths.

---

## 20. Explicit non-goals

- No change to `src/lib/patch-catchup/**` (domain) or `src/lib/patch-catchup-loader/**` / `usePatchCatchUpLoader` (loader) beyond nothing; no new aliases; no matcher rule changes.
- No change to the single-patch Patch Report content, slots, PH2 Patch Impact, reconciliation display or filters (only the hash-scroll dependency fix and hiding chrome while in Catch Up).
- No explicit end-patch (`through`) control; no "everything Mogzy has" baseline below the coverage floor.
- No date/"last played"/match-history baseline; no account-synced memory; no "new since last visit" badges.
- No filters beyond search; no trail graph/sparkline; no top-of-page Mogzy summary.
- No Mogzy per-line evidence, reconciliation marks, Historical Context or Patch Impact inside Catch Up.
- No share buttons, quizzes, Combat Lab, Graph1, Pro Play, Studio.
- No Academy Patch Brief changes. No backend change; no `chronological_order`.
- No sticky/sidebar navigation.

---

## 21. Likely files / components

New (`src/components/patch-catchup/`):

| File | Role |
|---|---|
| `PatchCatchUpView.tsx` | Container: calls the loader, owns search state, focus/announce, state switch |
| `PatchCatchUpHeader.tsx` | h2, picker, range line, totals, remembered hint |
| `PatchCatchUpBaselinePicker.tsx` | Native select |
| `PatchCatchUpCoverageBanner.tsx` | §11 model → copy + Retry |
| `PatchCatchUpSection.tsx` | h3, collapse rule, section intros, cross-reference |
| `PatchCatchUpEntry.tsx` | h4 header, summary chip, steps |
| `PatchCatchUpStep.tsx` | h5 step, Riot's note, groups, lines, links |
| `PatchCatchUpContinuityNote.tsx` | note + How? disclosure |
| `presentation.ts` (+ `presentation.test.ts`) | pure: section order, grouping, collapse, search, wording, banner model |
| `remembered-baseline.ts` (+ test) | localStorage wrapper |
| `PatchCatchUpView.test.tsx`, `PatchCatchUpView.corpus.test.tsx` | component + real-corpus tests |

Modified:

| File | Change |
|---|---|
| `src/pages/lol/PatchReports.tsx` | mode branch, query disable, history ops, hash-scroll dependency |
| `src/components/patch-reports/PatchHubMasthead.tsx` | view switch (or new `PatchHubViewSwitch.tsx` rendered by it — the `PatchHub*` shell namespace per the report handoff ownership) |
| `src/components/patch-reports/PatchReportEntityHeader.tsx` | **export** `EntityImage`, `DirectionChip` only |
| `src/pages/lol/PatchReports.test.tsx` (or existing page tests) | view switch, hash-scroll regression |

Unchanged: everything under `src/lib/patch-catchup*`, `src/hooks/usePatchCatchUpLoader.ts`, `src/components/patch-impact/**`, `src/lib/patch-reports/**`.

---

## 22. Acceptance criteria

1. Patch Report view is byte-for-byte the same content as today for every `?patch=` (existing 458 Patch Hub component/page tests pass unchanged); opening it makes **0** Catch-Up requests and never mounts the hook.
2. `?view=catchup` with no remembered baseline: idle, picker focused, **0** report requests.
3. `?since=26.14` renders sections in the §7.1 order; **every** one of the range's Riot lines (987 for since 26.14; 1,775 for a below-floor baseline) is reachable — rendered, or inside a collapsed section that renders it on open — each exactly once (asserted against `report.lines` ids).
4. Arena, ARAM: Mayhem, Classic collapsed by default for since 26.14; Systems, Runes, Hall of Legends open. Search "Locke" (since 26.14) shows exactly four entries, each in its own section — Champions Locke (26.15), Arena Locke (26.15, 26.19), ARAM: Mayhem Locke (26.16), Classic Innervating Locket (26.17) — force-opening Arena, ARAM: Mayhem and Classic; the three Lockes never merge.
5. Bel'Veth (26.15, 26.16) and Sundered Sky (26.16, 26.17) show the note "Back to 105, its value before 26.15" / "Back to 400, its value before 26.16" under the final step, a summary chip, and trail dots on the earlier steps; no other entry shows any Mogzy note for since 26.14. Since 26.17 / 26.18: no notes anywhere.
6. The wording "revert", "undo", "rolled back" never appears in Catch-Up output (test over all 45 PH3-A ranges).
7. With any single patch failed (each of the ten in turn): banner names it, Retry refetches exactly that patch, **no** note/chip/dot renders, all loaded Riot lines render.
8. All-failed range shows "Couldn't load patches …", never an empty "no changes".
9. Every line link resolves: navigating to `?patch=<v>#<target.change>` scrolls the Patch Report to an element with that id (tested for the cached-detail case), and Back returns to Catch Up scrolled to the `cu-` entry.
10. Baseline change uses `replace`; entering/leaving Catch Up uses `push`; refresh preserves the view and baseline.
11. Remembered baseline: set only by the picker; unlisted value ignored; storage throwing does not break the page; "Forget" clears it.
12. No horizontal scroll at 320/375/768/1280/1440 (`document.documentElement.scrollWidth <= innerWidth`) with the Bel'Veth rework and Sundered Sky recipe lines visible.
13. Heading outline h1›h2›h3›h4›h5›h6 without skips in both default and searched states; axe (or equivalent) reports no violations on the Catch-Up view.
14. ESLint clean on new/changed files; `tsc` differential vs base shows the same 6 pre-existing errors.

---

## 23. Test / browser matrix

**Unit (vitest)** — `presentation.test.ts`: section order merge (newest skeleton, older-only insertion, SR pin, distinct keys for Systems/Game Systems), collapse rule thresholds, search fold & whole-entry retention, every `valueState` wording incl. multi-component and percent deltas, alias vs exact disclosure text, `concurrentMechanical` line, banner model for each loader issue/coverage issue, forbidden-word scan.
**Component (RTL)** — each loader state from fixtures (disabled, idle, loading_index, loading_reports, ready_complete, ready_incomplete per issue kind, retrying, every failure code); failed-patch fixture renders zero continuity elements; Retry calls `loader.retry`; focus moves on mode change; live-region text; view switch history ops (MemoryRouter); hash-scroll regression on `PatchReports`.
**Real corpus** — the PH3-B trimmed corpus through the real loader with the PH3-C fake backend: since 26.9, 26.13, 26.14, 26.17, 26.18, 26.19; line-id completeness; exact note set.
**Network** — Catch Up closed → 0 requests; since 26.14 cold → index + 5; returning from a deep link → 0.

**Browser certification (real dev server, production read-only API or captured corpus)**:

| Width | Since 26.14 complete | Since 26.18 (one patch) | One patch failed (blocked request) | Search "Locke" | Idle | Up to date |
|---|---|---|---|---|---|---|
| 320 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 375 | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 768 | ✓ | | ✓ | ✓ | | |
| 1280 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1440 | ✓ | | | | | |

Plus at 375 and 1280: deep link → report → Back (scroll restored); keyboard-only path (Tab to switch → picker → first entry link → collapsed section open); `prefers-reduced-motion: reduce`; dark theme (the hub's default) and light. Screenshots go in the PH3-D handoff for owner review before integration.

---

## 24. Integration / conflict considerations with current main

- `origin/main` moved `a1958ff3 → d84c0ddd` with SCBS1 only; zero file overlap with Patch Hub. PH3-C merges cleanly onto it (`git merge-tree` clean).
- **Recommended branching:** build PH3-D on `patchhub/ph3d-catchup-ui` from this design branch (which is PH3-C `8e068743` + this doc). Integrate the PH3 stack as one unit later (PH3-A docs + B + C + D) onto the then-current `origin/main`, re-running the full Patch Hub suites and the tsc differential there. Do not integrate B/C without D (they ship no user-visible value and add 450 KB of fixture).
- PH3-A docs/fixture are not ancestors of B/C/D; the integration must bring `docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md` (and its fixture) along, since PH3-B/C/D reference it as the authority.
- The only shared files PH3-D touches are `PatchReports.tsx`, `PatchHubMasthead.tsx` and `PatchReportEntityHeader.tsx` (exports). Anyone else editing the Patch Report page concurrently (e.g. further PH2 work) will conflict there; keep the PH3-D diff to those files small and mechanical.
- The primary OneDrive checkout is a stale feature branch with unrelated uncommitted files; do not build there.
- Bundle: Catch-Up components should be part of the Patch Reports route chunk (it is already lazy at route level); the domain + loader add no runtime dependency.

---

## 25. OWNER DECISIONS REQUIRED

1. **Default-collapse large mode sections in Catch Up.** Recommendation: yes — non-chainable sections with > 40 lines (today: Arena, ARAM: Mayhem, Classic) render as a counted, one-tap disclosure; search force-opens them. This departs from the PH1 rule "the actual gameplay change is visible by default" *for Catch Up only* (the Patch Report stays fully open). Without it, since 26.14 opens ~750 mode lines below ~200 SR lines on a phone. Alternative: all open (simpler, much longer page).
2. **Shell: a "Patch Report | Catch Up" view switch under the Patch Hub title, URL `?since=`.** PH3-C left the shell (tab/panel/route) to the owner. Recommendation: the view switch + `?since=` query on the existing route (§4–§5). Confirm, or choose a "Catch up since…" button beside the patch chips instead.

Everything else in this document is decided on evidence and needs no owner choice.

---

## Final

- **Recommended UX pattern:** section-scoped entity-first Catch Up — official section › entry (alphabetical) › patch steps (oldest first) › Riot's exact lines — with a one-line Mogzy value note only on the final step of a proven chain (plus a summary chip and trail dots), entered by a two-item view switch and a native "I last knew patch" picker on `?since=`.
- **Confidence:** 0.85. High on structure, routing, wording and states (each is forced by the corpus or the PH3-B/C contracts); moderate on the collapse threshold and chip density, which want a look at real captures.
- **Biggest UX risk:** readers treating an entry as the complete story for that champion or item when Riot published part of it elsewhere (Systems "ADC Magic Resistance" for 27 champions, Support Adjustments), or treating the *absence* of a Mogzy note as "no trend". Mitigations: Champions cross-reference line, sections never merged, "About Mogzy notes" footer, Mogzy notes worded as value facts only.
- **Implementation:** **GO pending owner approval** of the two decisions in §25.
