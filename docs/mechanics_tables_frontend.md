# Mechanics tables — player-facing frontend

The reader's half of the mechanics-table system: the Mogzy Archives shelf that
renders the backend's player study tables.

## Objective

Turn `mechanics_tables` (backend) into a finished reference experience inside
Mogzy Archives, without the frontend ever becoming a second source of truth.

```
canonical authority          league_mechanics manifests   (backend)
  -> canonical table         CanonicalTable / CanonicalFact
  -> player study table      StudyTable / StudyRow
  -> GET /api/mechanics/tables
  -> data client + renderer  (THIS document)
  -> /lol/docs/mechanics
```

**The frontend states no mechanics value.** It performs no game arithmetic,
embeds no canonical numbers, and reads nothing from the question banks. Every
number a player sees is a string or integer taken verbatim from the payload.
The only transformation applied to a value is `formatDisplayNumber` — the
existing shared display-rounding helper that trims trailing zeros on exact
decimal strings ("19.50" -> "19.5"). Decimals are never parsed to float.

## Backend contract

Router: `routes/mechanics_tables.py`, mounted at `/api/mechanics/tables`
(read-only, no database access). Verified live on Railway during this work.

| Endpoint | Returns | Size |
|---|---|---|
| `GET /api/mechanics/tables` | every category with its study/canonical table ids, titles, subtitles and row counts | ~6 KB |
| `GET /api/mechanics/tables/study/{table_id}` | one study table, rows and all | 1–14 KB |
| `GET /api/mechanics/tables/canonical/{table_id}` | canonical facts with full provenance | **not consumed** |

Both consumed endpoints accept `?patch=`; the frontend never sends it, so the
backend's `DEFAULT_PATCH` (the newest patch the certified manifests declare
themselves verified through) always wins. A manifest bump moves the whole
surface with no frontend change.

The canonical endpoint is deliberately unused: `fact_id`, `mechanic_ids` and
`implementation_allowed` are internal review vocabulary, not player vocabulary.

### Study-table shape

```jsonc
{
  "table_id": "minion_stats.study.base",
  "category": "minion_stats",
  "title": "Minion base stats",
  "subtitle": "What each lane minion is worth and how tough it is …",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": ["minion_stats.base"],   // internal
  "columns":  [{ "key", "label", "unit", "kind" }],
  "sections": [{ "key", "label", "note" }],
  "rows":     [{ "row_id", "label", "section", "values": {…}, "fact_ids": [], "note"? }],
  "notes":    ["…"]
}
```

Observed vocabulary across all 23 published tables (patch 26.15):

* `kind` — `text` (27), `number` (35), `time` (8)
* `unit` — `gold` (9), `minions` (5), `percent` (4), `experience` (3), `seconds` (1)
* cell types — string (950) and integer (174); no booleans or nulls in the
  live data, though the client and renderer handle both
* 68 of 1192 cells are absent: study tables are legitimately **sparse**, and a
  missing cell means "nothing to say here", never zero
* widest table: 7 columns; longest: 78 rows

Two conventions the renderer had to discover, because they are not declared:

1. **`row.label` is always the row header** — an implicit leading column.
2. **Some tables declare that column anyway**, as a leading column no row ever
   populates (`minion_stats.study.base` -> `"stat"`,
   `minion_behavior.study.pushing_examples` -> `"level_advantage"`). The
   renderer treats a never-populated first column as the label header, and
   otherwise emits a blank header with screen-reader-only text. See
   *Unresolved* below.

### Fetch strategy

Index once (~6 KB, `staleTime: Infinity`), then each study table on demand and
cached forever. All 23 tables together are only 108 KB, so a single bulk fetch
would also have been viable — but the backend has no bulk-rows endpoint, and
per-table loading needs no backend change and keeps a deep link to one table at
one request. A category page fetches its tables in parallel via `useQueries`.

**No backend change was required or made.**

## Frontend architecture

| File | Role |
|---|---|
| `src/lib/mechanics-tables/api.ts` | wire types, errors, normalization, `fetchTablesIndex` / `fetchStudyTable`, query keys |
| `src/lib/mechanics-tables/presentation.ts` | slugs, shelf grouping, labels, icons, route helpers — no mechanics values |
| `src/lib/mechanics-tables/render-model.ts` | layout choice, cell formatting, section grouping, row filtering |
| `src/lib/mechanics-tables/fixtures.ts` | live payload samples, **imported by tests only** |
| `src/components/mechanics-tables/StudyTableView.tsx` | the one renderer, plus `VerifiedThroughBadge` |
| `src/pages/lol-docs/mechanics/MechanicsReferencePage.tsx` | shelf / category / single-table, one component |

Everything reaches the backend through `COMBAT_API_BASE_URL`
(`VITE_COMBAT_API_URL`), the repo's single API base — no new env var.

### Types

No `any`. Optional metadata is tolerated structurally: `normalizeStudyTable`
and `normalizeTablesIndex` fill in missing arrays and strings so the renderer
can rely on shape, but never invent, reorder or reinterpret a value. A column
`kind` or `unit` this build has never seen renders (kind falls back to text,
unit is humanized from its own token). A category with no presentation entry
appears with a derived label and slug rather than disappearing. A cell whose
value is outside the scalar contract (array/object) is dropped to "not
applicable" instead of printing `[object Object]`.

### The renderer

One component, zero per-table branches, no table id anywhere in it. Every
decision comes from payload shape:

* **`list` layout** when the table has exactly one data column of kind `text`
  — a rules sheet renders as a `<dl>`, which reads far better than a 1×N grid
  and needs no horizontal scroll on a phone. 8 of 23 tables take this path.
* **`table` layout** otherwise: semantic `<table>`, `<th scope="col">` headers,
  `<th scope="row">` row labels, `<th scope="colgroup">` section bands, and an
  `sr-only` `<caption>`.
* **Units**: shown once under the column header (`gold`, `XP`, `seconds`,
  `minions`). `percent` is the exception — it also rides on each value, because
  a bare `30` in a percent column is not readable as a percentage.
* **Sparse cells**: an em dash plus screen-reader "Not applicable". Never 0.
* **Cell width is data-driven**: text over 48 characters gets prose width and
  wraps; shorter text is held on one line, so a two-column table does not
  stretch across a desktop page.
* **Row filter** on tables of 16+ rows (9 of 23), matching label *and* cell
  text, with a "Showing N of M rows" status and a no-match message.
* **Notes** render as a footnote list under the table.

## Archives integration

* Route: **`/lol/docs/mechanics`** (`/:categorySlug`, `/:categorySlug/:tableSlug`)
* Entry: a new **Mechanics Tables** tile on the League Docs landing.
* The existing Mechanics tile was renamed **Mechanics Explorer** — it links to
  `/lol/mechanics` and that is what it is. Its pin test now matches that name,
  because a bare `/Mechanics/` matched both tiles.
* Patch Reports, champion docs and pro-data pages are untouched.
* No fifth hub entrance. Mechanics tables live under Archives, as intended.
* Sitemap: the shelf is a static entry; per-category and per-table routes are
  not enumerated (the generator does not read the mechanics index, and the
  shelf links to all of them).

Explorer and Tables are siblings on purpose and cross-link both ways: the
Explorer answers "what is it right now, for my inputs"; the Tables answer
"show me the sheet".

## Category map

Backend categories are the navigable unit. Shelves are presentation only.

| Shelf | Backend category | Reader label | Slug | Tables |
|---|---|---|---|---|
| Minions & waves | `minion_waves` | Minion waves | `minion-waves` | 3 |
| | `minion_stats` | Minion stats | `minion-stats` | 3 |
| | `minion_behavior` | Minion behaviour | `minion-behavior` | 3 |
| | `wave_economy` | Wave XP & gold | `wave-economy` | 3 |
| The map | `jungle_objectives` | Jungle & objectives | `jungle-objectives` | 1 |
| | `structures` | Structures | `structures` | 5 |
| | `base_systems` | Base & respawn | `base-systems` | 3 |
| Economy | `takedown_economy` | Takedown gold | `takedown-economy` | 2 |

Table slugs are **derived**, not mapped: the id minus its category prefix and
the `study.` marker (`minion_waves.study.wave_times` -> `wave-times`). A table
published tomorrow is linkable with this build unchanged.

## Table coverage — 23 / 23

Verified by fetching every table from production and rendering it. All render
through the generic renderer; none needed a specialized implementation; no
rows were lost to sectioning; no internal identifier leaked into the DOM.

| table_id | Category | Layout | Rows × cols | Notes |
|---|---|---|---|---|
| `minion_waves.study.schedule` | minion-waves | list | 9 × 1 | |
| `minion_waves.study.composition` | minion-waves | table | 18 × 6 | filter |
| `minion_waves.study.wave_times` | minion-waves | table | 78 × 2 | filter; longest table |
| `minion_stats.study.base` | minion-stats | table | 8 × 6 | declared label column ("Stat") |
| `minion_stats.study.scaling` | minion-stats | table | 11 × 4 | |
| `minion_stats.study.defenses` | minion-stats | table | 4 × 3 | |
| `minion_behavior.study.aggro` | minion-behavior | table | 4 × 2 | sentence-length row labels |
| `minion_behavior.study.pushing` | minion-behavior | list | 8 × 1 | base rules |
| `minion_behavior.study.pushing_examples` | minion-behavior | table | 3 × 4 | derived scenarios; percent on cells |
| `wave_economy.study.xp_by_wave` | wave-economy | table | 54 × 5 | filter; solo/duo sections |
| `wave_economy.study.level_breakpoints` | wave-economy | table | 18 × 4 | filter |
| `wave_economy.study.gold_by_wave` | wave-economy | table | 27 × 4 | filter |
| `jungle_objectives.study.timers` | jungle-objectives | table | 11 × 3 | |
| `structures.study.stats` | structures | table | 6 × 6 | |
| `structures.study.plates` | structures | table | 13 × 2 | |
| `structures.study.turret_combat` | structures | list | 13 × 1 | |
| `structures.study.base` | structures | list | 10 × 1 | |
| `structures.study.overgrowth_bulwark` | structures | list | 13 × 1 | |
| `base_systems.study.fountain` | base-systems | list | 6 × 1 | |
| `base_systems.study.homeguard` | base-systems | list | 6 × 1 | |
| `base_systems.study.death_timers` | base-systems | table | 22 × 2 | filter; sparse first column |
| `takedown_economy.study.kill_gold` | takedown-economy | table | 18 × 7 | filter; widest table |
| `takedown_economy.study.bounty` | takedown-economy | list | 13 × 1 | |

Backend/derived distinctions the backend already makes are preserved as
separate tables and shown as such — `minion_behavior.pushing` (base facts) vs
`pushing_examples` (derived scenarios), `takedown_economy` facts vs bounty
scenarios. The frontend does not merge them.

## Source / patch trust

Every table and the shelf show **"Verified through patch 26.15"** — the
backend's own `verified_through`, rendered verbatim. It is deliberately not
worded as "current patch": the backend certifies *through* a patch, not up to
today. `DataSourcesNotice` (the existing Archives attribution block) carries
"Tables certified through patch 26.15." No internal operational metadata
(`fact_id`, `table_id`, `implementation_allowed`, `source_table_ids`,
`mechanic_ids`) reaches the reader — a test asserts this against real payloads.

## Responsive behaviour

One data path for every width — no mobile-specific logic.

* Wide tables scroll horizontally **inside their own region**, with the row
  label column frozen (`position: sticky`, opaque `hsl(var(--card))` so rows
  cannot show through).
* The scroll region is `role="region"` + `tabIndex=0` with a label, so a
  keyboard-only reader can scroll it; a right-edge fade and a "Scroll sideways"
  hint appear only while there is more to the right.
* Single-prose-column tables become a stacked `<dl>` — nothing to scroll.
* Row header has a 7.5 rem minimum so short labels ("Level 1") do not wrap, and
  a 16 rem maximum so long prose labels still do.

Verified at **375 px** and **1280 px** across all 8 category routes and the
shelf: **zero page-level horizontal overflow** anywhere; wide tables report
overflow only within their own scroller.

## Accessibility

* One `<h1>` per page; table titles are `<h2>` on a category page and `<h3>`
  standalone; shelf headings are `<h2>`.
* Real table semantics: `scope="col"` / `scope="row"` / `scope="colgroup"`,
  `sr-only` `<caption>`.
* Scrollable table regions are focusable and labelled.
* Sparse cells announce "Not applicable" rather than reading as blank.
* Breadcrumb is `<nav aria-label="Breadcrumb">` with `aria-current="page"`;
  sibling-table navigation is a labelled `<nav>` with `aria-current`.
* Filter input has a real (sr-only) `<label>`; result count is `role="status"`.
* Every link and button carries a visible `focus-visible` ring.
* The verified badge spells out its meaning; status is never colour-only.

## Performance

* Index: 1 request, cached forever — asserted by test (one index call, not one
  per category card).
* Single-table deep link fetches exactly that table — asserted by test.
* Page is a lazy route chunk: **28.78 kB raw / 9.25 kB gzipped**. Fixtures are
  test-only and are not bundled.

## Tests — 78 added, all passing

| File | Tests | Covers |
|---|---|---|
| `src/lib/mechanics-tables/api.test.ts` | 10 | URL shape, 404 message, unreadable error body, real-contract parse, missing optional metadata, non-object payload, non-scalar cells, unknown category kept, empty category hidden |
| `src/lib/mechanics-tables/render-model.test.ts` | 23 | text/number/decimal/percent/boolean/time/absent cells, unit vocabulary and unknown units, label-column detection, list vs table, sectioning incl. orphan rows, unknown table shape, empty table, filter threshold, filtering |
| `src/lib/mechanics-tables/presentation.test.ts` | 8 | every live category mapped, unique slugs, derived slugs, unmapped-category fallback, shelf grouping, URL builders |
| `src/components/mechanics-tables/StudyTableView.test.tsx` | 19 | semantic table + row headers, label header, list layout, sections, units, sparse cells, booleans, verified badge wording, notes, unknown shape, empty table, filter + no-match, keyboard-scrollable region, sr-only caption, no identifier leaks |
| `src/pages/lol-docs/mechanics/MechanicsReferencePage.test.tsx` | 17 | shelf lists every category, patch wording, single index fetch, loading state, category renders all tables, sibling deep links, breadcrumb, unknown category/table, single-table deep link, one fetch only, cross-category render, index error + retry recovery, one table failing leaves the rest readable, nothing published |
| `LeagueDocsLanding.mechanics-tile.test.tsx` | +1 | the Archives tile links to `/lol/docs/mechanics` |

Fixtures are captured verbatim from the live API; long tables are truncated
**per section** so every band survives. No value was edited, no row synthesised,
and no mechanics constant is written by hand anywhere in the test data.

### Full-suite comparison (failure sets, not totals)

| | Test files | Tests |
|---|---|---|
| baseline `e135cbe0` | 11 failed / 546 | 42 failed, 8094 passed |
| this branch | 11 failed / 551 | 42 failed, 8172 passed |

**Identical failure set** — same 11 files, same 42 tests, same 163 unhandled
errors (`AdminUsers.phase1`, `AcademyRadioControls`, `LeaguecraftWorkspace`,
`adminCredentials`, `admin-registry`, `ads/consent`, `e2e/identity`,
`quiz-broadcast/engine`, `Quiz.rankedRole`, `StructuralReview`,
`onboarding-gate`). All pre-existing; none touch this work. +5 files, +78 tests.

`tsc --noEmit` produces the same 8 pre-existing error files as the baseline and
none in the new code. `eslint` is clean on all new paths. `npm run build`
succeeds including the prerender and sitemap verification steps.

## Visual verification

Rendered against the **live production API** in the browser preview:

* shelf at desktop — categories grouped into three shelves with row counts
* `takedown-economy/kill-gold` at desktop and 375 px — 7 columns, units under
  headers, frozen "Level N" column while scrolling sideways
* `base-systems/fountain` at 375 px — the `<dl>` rules-sheet layout
* `minion-stats` at desktop — the declared "Stat" label column, section bands
  with their notes, em-dash sparse cells
* `minion-waves/wave-times` at desktop — 78 rows with the filter
* `wave-economy/level-breakpoints` — fresh deep-link load, correct table

Fixed during this pass: the frozen row header wrapping "Level 1" onto two
lines, and short text cells being given prose width (which stretched two-column
tables across the page).

Note: the browser pane reports `document.hidden` while backgrounded, so
screenshots of deep-scrolled content come back blank. Structural checks
(`read_page` / DOM assertions) were used for the remaining surfaces, and the
23-table coverage check ran against genuinely fetched production payloads.

## Unresolved / known limitations

1. **Blank label-column header on 21 of 23 tables.** Two tables declare the
   row-label column explicitly; the rest leave it implicit, so those tables get
   a visually blank leading `<th>` with `sr-only` "Row". The honest fix is on
   the backend — have every study table declare its label column the way
   `minion_stats.study.base` already does — but it is cosmetic, the data is not
   misread, and no backend change was in scope here.
2. `base_systems.study.fountain` publishes the obelisk's reach as a bare
   `"1250"` with no unit, so it renders unitless. That is the backend's string;
   inventing a unit would be inventing data.
3. Ambient page ornaments in the Mogzy layout occasionally sit over the
   breadcrumb. Pre-existing and global, not specific to this surface.

## Future enhancements (not implemented)

* Icons/illustrations per category and per minion type.
* Diagrams — a wave-timing strip, a lane map for structures.
* Cross-linking a table row to the quiz questions bound to the same canonical
  facts (the backend already holds `QuestionFactLink`; the study payload does
  not expose it, and it should not without an answer-safety review).
* A "jump to game time" affordance shared with the Mechanics Explorer.
* Global Mogzy search over table rows — deliberately separate scope.
