# Admin Quiz Review — daily-use UX pass

Owner review of CON1 found the console powerful but hard to work in: it started
too low on the page, was too narrow, used type too small to scan, and showed
too many controls at once. This pass restructured the surface. **No capability
was removed, no renderer identifier was renamed, and no backend contract
changed.** Every file touched is frontend presentation.

Files changed:

| File | Why |
| --- | --- |
| `src/components/Layout.tsx` | full-bleed the console; suppress two floating overlays over it |
| `src/pages/admin/AdminQuizWorkspace.tsx` | one bar of chrome instead of three; correct viewport token |
| `src/pages/admin/AdminQuizReview.tsx` | primary toolbar, progressive filters, list and detail rebuild |
| `src/components/admin/GenerateContentPanel.tsx` | simple mode + advanced/developer disclosures |

---

## 1. Vertical space

The first question row moved from **y=263 to y=166** (‑97px, ‑37%), identically
at 1440×900 and 1920×1080.

What was removed:

* the breadcrumb row, the page-title row and the tab row were three stacked
  bars carrying the same information side by side. They are now one row;
* the "Quiz Review Console / All sources / Export" bar merged into the search
  toolbar, which is where an operator already looks;
* the standalone V1 capability notice in the detail panel moved into
  Properties, where it is a footnote rather than a banner above the question.

`h-[calc(100vh-4rem)]` was also wrong: the shell header is `3.5rem`, not `4rem`,
so the console ran 8px short of the fold and could not follow a header change.
Both roots now read `h-[var(--app-viewport-h)]`, the documented authority.

## 2. Width

`/admin/quiz-content` joined the existing `isFullBleed` list in `Layout.tsx`.
It qualifies for the same reason Stat Check and Ranked do: it is a multi-column
console, not a reading column.

| | 1440 | 1920 |
| --- | --- | --- |
| page width, before | 1280 (capped by `max-w-7xl`) | 1280 — **63% of the viewport** |
| page width, after | 1440 | 1920 |
| question list, before | 560 | 560 |
| question list, after | **950** | **1312** |
| detail panel, before | 400 | 400 |
| detail panel, after | **490** | **608** |

Two consequences of full bleed had to be handled, and both were real defects
the first time the route escaped the column:

* **the console must paint its own `bg-background`.** The shell paints a
  centred `max-w-[88rem]` stage with feathered edges; without its own ground
  the console's left and right thirds rendered dark-on-dark;
* **the floating friends drawer and theme switcher had to go.** They sit at
  `bottom-6 left-6` / `bottom-6 right-6` — exactly where the console now puts
  pagination and the detail panel. Neither belongs on an internal admin tool.
  Suppressed for this route only; `Layout.adminConsole.test.tsx` pins all four
  facts.

The detail column is `w-[min(38rem,max(26rem,34vw))]` — a fraction with a floor
and a ceiling — and the *empty* placeholder uses the same width, so selecting a
question never changes the list's width.

## 3. Type and controls

| | before | after |
| --- | --- | --- |
| list row question text | 12px | **15px** |
| detail question text | 14px | **18px** |
| row metadata | 10px | 12px |
| status / difficulty / asset badges | 10px, 12px icons | 12px, 14px icons |
| list checkbox | 16px, 1px border | **20px, 2px border** |
| review verdict buttons | 10px pills | **14px, three-up grid** |
| simultaneously enabled controls | 78 | **62** |

## 4. Filters

The permanent 240px sidebar (8 selects, 5 difficulty buttons, 4 quick filters —
**17 controls always on screen**) is gone. The primary toolbar is Search,
Source, Status, More filters.

`More filters` is an absolutely-positioned overlay, not an inline block:
opening it must not shove the list down the page. It carries every filter that
was in the sidebar — category, certainty, format, ability slot, subject type,
active, set, difficulty, and the four shortcuts — and its trigger shows how
many of them are narrowing the list, so a short result is never a mystery.

Difficulty buttons now read `3 · Comparison` rather than a bare `3`.

## 5. Question list

Row anatomy is question text → one horizontal meta line (category · family ·
id · difficulty) → one horizontal signal cluster (shorts star, reviewer flag,
asset health, content readiness, review status).

The old row stacked five badges *vertically* down the right edge, which is what
made every row three lines tall and unreadable at a glance. Nothing was
dropped; it is laid out to be scanned.

## 6. Detail panel

The order is now the workflow:

1. **Question** — text, choices with the correct one marked, explanation
2. **Preview** — the production surface, unchanged
3. **Review** — Approve / Needs Fix / Reject as three large buttons, with
   Unreviewed and Missing Asset demoted beneath them, then the internal note
4. **Use this question** — Generate Content, Add to Shorts, and the computed
   asset/readiness badges
5. **Properties & technical detail** — collapsed `<details>`: difficulty,
   certainty, active, asset flag, provenance grid, set membership, asset
   images, raw metadata JSON

Previously the question text was the *seventh* section, below Review Status,
six toggles, Difficulty, Certainty, a metadata grid and pack badges — all with
equal visual weight.

`PRIMARY_REVIEW_STATUSES` and `SECONDARY_REVIEW_STATUSES` are both derived from
`REVIEW_STATUSES`, so a status cannot be dropped silently by the split.

**"Use this question" lists only routes that exist.** Admin Quiz Review has no
write path into Ranked, Daily or a Set — `ReviewPatchPayload` has no such field
and there is no pack-membership mutation in `quizApi` — so no button pretends
otherwise. Set membership is shown, read-only, under Properties.

## 7. Generate Content

The panel asks two operator questions and answers them by writing the **same**
`formats` and `states` the advanced controls write:

* **Where are you posting?** → `DESTINATIONS`, five publishable
  `RENDER_FORMATS` keys under operator names
* **What do you want?** → `INTENTS`, three ordered `RENDER_STATES` sets
* then one primary action: **Export** — the export itself, in the browser,
  labelled from the plan (`Export PNG` / `Export N PNGs as ZIP`). The local
  renderer moved into Developer tools. See `docs/CON1_ADMIN_EXPORT.md`.

Both derive their selected state by *reading the config back*, so an advanced
edit is reflected in simple mode rather than silently disagreeing with it. When
a post composition is chosen, the card question is replaced by a sentence
saying the composition owns its slides — matching the CLI, which rejects
`--post` with `--states`.

Everything else moved behind two disclosures:

* **Advanced options** — exact formats (all eight), post composition, question
  cards, difficulty badge, run name, overwrite
* **Developer tools** — Copy config, Copy command, and the exact CLI line

Native `<details>`, so content stays mounted: no remount, no scroll jump, no
JavaScript for the disclosure itself.

The diagnostic overrides `--allow-incomplete-presentation` and
`--allow-missing-assets` are still **not** offered anywhere in Admin, and the
readiness gate and blocking policy are untouched.

## 8. Terminology

UI labels only. `FORMAT_LABELS`, `STATE_LABELS` and `POST_LABELS` live in
`GenerateContentPanel.tsx` and map registry keys to operator words; no
constant, CLI flag, manifest field or export filename changed.

| identifier | label |
| --- | --- |
| `mobile-social` | Instagram Portrait |
| `vertical` | Vertical / Story |
| `portrait` | Instagram Feed |
| `square` | Square |
| `landscape` | Reddit / X |
| `broadcast` | Widescreen |
| `mobile-audit` / `desktop-audit` | Developer QA (mobile) / (desktop) |
| `states` | Question Cards |
| `correct` | Reveal |
| `answer-reveal` | Reveal post |
| `single-question` | Single-question post |

## 9. Nested scrolling

The filter sidebar's scroll area is gone. What remains: the question list, the
detail body, and the raw-metadata `<pre>` — which is inside the collapsed
Properties section and is bounded on purpose.

## 10. Tests

`npx vitest run --no-file-parallelism src/pages/admin src/components/admin src/components/Layout`

572 passed, 11 failed — **exactly the recorded pre-existing baseline** (10 in
`StructuralReview.test.tsx`, 1 in `AdminUsers.phase1.test.tsx`, both failing on
a clean tree). `tsc` errors unchanged at 11, none in a touched file.

Added:

* `Layout.adminConsole.test.tsx` — full bleed applies to this route and not to
  other admin pages; both overlays suppressed here and kept elsewhere
* `AdminQuizReview.generateContent.test.tsx` — simple mode writes real format
  keys and real render states, reflects an advanced edit instead of
  disagreeing with it, hides the card question under a post composition, makes
  the export the one primary action and keeps the local renderer inside
  Developer tools; and the advanced filters
  are all reachable one click behind More filters, which reports its count

Existing tests that reached advanced controls now open the disclosure first
(`openAdvanced()` / `openDeveloperTools()`). `<details>` keeps its children
mounted, so a `fireEvent.click` would have "worked" without opening — which is
exactly why the tests open it: a test that never opens the section cannot
notice if the section stops being reachable.

## 11. Verification

Real browser captures against the app's own dev server with every admin API
intercepted by a fixture, at 1440×900 and 1920×1080, before and after. Two
defects were found in the screenshots and only in the screenshots — the missing
background and the overlay collisions in section 2. DOM tests would not have
caught either.

## 12. Left for the owner

* **Broader Admin IA.** Only the Quiz Review header was touched. Broadcast
  Studio was demoted to a trailing ghost link here; whether it belongs on this
  page at all is an owner call.
* **Ranked / Daily / Set from Review.** These are the obvious missing "Use
  this question" routes. They need backend write paths that do not exist.
* **The All sources tab** got the type and width pass but not the structural
  one; it is still a four-column grid.
* **Diagnostics tab** untouched.
