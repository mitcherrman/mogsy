# PATCH HUB / PHSR1 — CONSUMER MOGZY DATA STATUS — HANDOFF

Launch-readiness workstream 1 of 4. The aim was to make Mogzy's reconciliation and status layer readable to a normal League player, focused on Summoner's Rift report content, without weakening its factual integrity. This is presentation only: no backend enum, payload or database contract changed.

## 1. Base and result

| | |
|---|---|
| Repo | `mitcherrman/mogsy` |
| Base (`origin/main`, verified, no drift) | `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` |
| Branch | `patchhub/phsr1-consumer-status` |
| Worktree | `C:\Users\mlmit\mogzy-wt\phsr1` |
| Final SHA | see `git log -1` on the branch (single squashed commit on `d528bf9f`) |
| State | committed locally. Not merged, pushed or deployed. |

## 2. The finding that shaped the wording

**Per-line Mogzy status and value are build-time snapshots.** `patch_report_changes.mogzy_status` / `mogzy_current_raw` are written by `resolver.resolve_change` during `promote-report`. Mogzy updates its own data later, in `reconcile-knowledge`, and the API serves the line rows unchanged (`routes/patch_reports.py`). Only the patch-level census reflects the update.

Draven 26.19 Base AD is the proof:

| Source | Value |
|---|---|
| Riot | 62 → 64 |
| Report line (built before reconcile) | `mismatch`, `mogzy_current_raw` 62 |
| Reconciliation row (local DB; census identical to prod 11/0/24/7/0/173) | `ALREADY_RECONCILED` / `APPLIED`, 64 |
| **Production `/api/meta/champion-stats`, 2026-10-07** | **`ad: 64`** |

Vi (61 / 3.9), Lillia (24), Fiora (105) and Ryze (4.7) are the same: their lines say `mismatch` or `needs_interpretation`, and prod already holds Riot's value.

So the old "Mogzy currently: 62" was false in production, and the brief's candidate "Mogzy data update pending" would be false for Draven too. Every line-level sentence now speaks about **the moment the report was built**, and points to the patch-level status for what happened after.

A second backend fact: on a **formula** property (`*_formula`), the resolver labels every line `mismatch` without comparing anything (resolver.py, "Reporting a per-line 'matches' here would be actively harmful"). A formula `mismatch` therefore means "flagged for the formula check", not "Mogzy's value differs".

## 3. Vocabulary (old → new)

### Line and entity status (`MogzyStatus`, `src/lib/patch-reports/mogzy-status.ts`)

| Enum (unchanged) | Old label | New label | Why it stays true for every resolver path |
|---|---|---|---|
| `matches` | Matches | **Mogzy data current** | Mogzy's value already equalled Riot's new value at build. |
| `applied` | Applied | **Mogzy data updated** | Same as `matches`, and Mogzy applied the value itself. |
| `pending` | Pending | **Mogzy update in review** | Different at build, with a proposal awaiting review. |
| `mismatch` | Mismatch | **Mogzy data update flagged** | True for a plain value that differed at build *and* for a formula line flagged without comparison. It does not claim "pending" (many are already applied, Draven included) or promise application (7 of them in 26.19 are held for review). Amber, not red: Riot is not in dispute. |
| `unresolved` | Unresolved | **Not yet matched to Mogzy data** | The entity is unknown to Mogzy, or Mogzy has no stored value for the property. |
| `needs_interpretation` | Needs interpretation | **Not auto-checked by Mogzy** | Prose change, a value shape Mogzy can't read as numbers, or a formula with no stored value. "Needs Mogzy review" was rejected: 109 of the 26.19 lines are prose, and nobody reviews those. |
| `not_represented` | Not represented | **Not modeled by Mogzy** | No Mogzy property holds this number. |

The status mark drops the "Mogzy:" prefix (each label names Mogzy itself) and adds a screen-reader prefix "Mogzy data status:" plus a `title` gloss. `data-mogzy-status` keeps the raw enum.

### Patch banner (`PatchDataStatusNotice`)

| Old | New |
|---|---|
| Gameplay data current | Mogzy's gameplay data is up to date with this patch |
| Gameplay data partly current | Mogzy's gameplay data is partly updated for this patch |
| Gameplay data not reconciled (FAILED) | Mogzy's gameplay data update didn't finish |
| Gameplay data not reconciled (absent / PUBLISHED_NOT_RECONCILED) | No full Mogzy data update is recorded for this patch |
| "11 changes applied to Mogzy's canonical data · 24 held — Mogzy cannot model yet, 7 held — needs a decision" | "Of the 42 gameplay-number changes Mogzy's data update checked: 11 now up to date in Mogzy · 24 not modeled by Mogzy yet · 7 need a Mogzy review." and "173 other notes — wording-only changes, bug fixes, announcements and mode-specific changes — had nothing for Mogzy to update." |

The body always opens with "Riot's patch notes below are complete." and ends with "This describes Mogzy's own data — it never changes or disputes Riot's notes." When a reconciliation is recorded, the banner adds: "Mogzy notes on individual changes were recorded when this report was built, before this update ran."

**Denominator.** The reconciliation counts in its own units: 215 items for 26.19, against 214 report lines, because Vi's "63 + 3.5/Level" splits into base and growth. The first layer therefore states only `checked` (11+24+7+0 = 42) and `NO_MOGZY_CONSUMER` (173). It never states 214, never states 215, and never implies the report's lines are the denominator. The 215 total and the units caveat are under Technical details.

| Terminal state | Consumer meaning (Technical details) |
|---|---|
| `AUTO_APPLIED` | Up to date — Mogzy now has Riot's new value |
| `AUTO_APPLIED_REVIEW` | Up to date, with a note for a follow-up check |
| `HELD_RUNTIME_WORK` | Not modeled by Mogzy yet — Mogzy keeps the previous value |
| `HELD_AUTHORITY` | Needs a Mogzy review before it can be applied |
| `FAILED` | Couldn't be processed |
| `NO_MOGZY_CONSUMER` | Nothing for Mogzy to update |
| unknown future key | shown raw, never folded into a consumer count |

## 4. Evidence hierarchy

**Patch banner**
1. Eyebrow "Mogzy data status", consumer headline, and a Riot-first sentence.
2. Counts against the `checked` denominator, the nothing-to-update note, and the build-time note.
3. `Technical details` (closed): raw status, operation id, the backend `meaning` as "Pipeline note", every terminal state with its count, and the 215 units caveat.

**Change line**
1. Summary (closed): coloured dot plus consumer label.
2. Opened: the plain-English explanation (`explainChangeStatus`), then "Mogzy's value when this report was built: 62" when a non-formula value exists.
3. Nested `Technical details` (closed): Status code (raw enum), Mogzy property, "Mogzy value at build" or "Mogzy formula at build", and Review (proposal status and id).

Nothing the old disclosure showed was removed; the raw parts are one level down. A nested chevron only rotates for its own `<details>` (`[details[open]>summary>&]`), so an open outer disclosure doesn't rotate the inner one.

**Redundancy rule** (`restatesEntityStatus`). A line's row is hidden only when it would repeat the entry header: same status as `aggregate_status`, no `mogzy_property`, no `mogzy_current_raw`, no proposal status or id, and not a Mogzy Impact line (`isImpactScopedLine`). Previously this applied only to *mechanical* `not_represented` / `needs_interpretation` lines. Because the resolver always sets `mogzy_property` for `mismatch` / `unresolved` / `matches` / `applied` / `pending`, the only rows the wider rule can hide are untracked `not_represented` / `needs_interpretation` lines that match their header.

| 26.19 | Lines | Status rows before | After |
|---|---|---|---|
| SR sections (Champions, Items, Systems, Team Voice) | 41 | 41 | 27 |
| Whole report | 214 | 105 | 53 (browser-measured: 53) |

The whole-report drop includes Arena / Mayhem / Classic lines. That comes from the same generic rule, not mode-specific code.

**Mogzy Impact.** On Impact-scoped lines (Champions › Base Stats) the explanation adds "Mogzy Impact works from Riot's published numbers." The slot always returns an element, so Impact presence comes from `isImpactScopedLine`, not from the slot output.

## 5. Files

| File | Change |
|---|---|
| `src/lib/patch-reports/mogzy-status.ts` | **new**: labels, glosses, `explainChangeStatus`, `trackedValueAtBuild`, `isFormulaEvidence`, `restatesEntityStatus`, `summarizeReconciliation` |
| `src/components/patch-reports/PatchReportStatus.tsx` | consumer labels, amber `mismatch`, sr-only prefix, `title` gloss, `data-mogzy-status`, `data-testid` |
| `src/components/patch-reports/PatchReportChangeLine.tsx` | layered evidence, wider redundancy rule (moved to lib) |
| `src/components/patch-reports/PatchDataStatusNotice.tsx` | consumer banner and Technical details |
| `src/lib/patch-reports/phsr1-sr-fixtures.ts` | **new**: verbatim prod excerpts (26.19 Draven, Aurora, Aphelios, Elise, Vi and reconciliation; 26.10 Anivia); rationale prose and `historical_context` dropped |
| `src/lib/patch-reports/mogzy-status.test.ts` | **new**, 17 tests |
| `src/components/patch-reports/PatchReportChangeLine.phsr1.test.tsx` | **new**, 9 tests |
| `src/components/patch-reports/PatchDataStatusNotice.test.tsx` | rewritten, 7 tests |
| `src/components/patch-reports/PatchReportEntityCard.test.tsx` | 4 assertions moved to the new labels and fields; the test file belongs to the entity-card owner, the component is untouched |

Not touched: `PatchReports.tsx`, `PatchHubMasthead.tsx`, `PatchHubSectionNav.tsx`, `PatchReportEntityHeader.tsx`, `PatchReportEntityCard.tsx`, `PatchReportAbilityGroup.tsx`, `patch-impact/*`, Combat Lab handoff, mode presentation.

## 6. Tests

Required cases and where they're covered:

| # | Requirement | Test |
|---|---|---|
| 1 | each consumer label | `mogzy-status.test` "maps each status…", "never uses the engineering terms…" |
| 2 | enum untouched | "labels every backend status, and only those"; `data-mogzy-status` raw-enum check in phsr1 "source truth" |
| 3 | banner consumer copy | `PatchDataStatusNotice.test` "26.19: consumer headline…" (no canonical/held/HELD_/reconcil in the first layer) |
| 4 | counts truthful | "26.19: counts stay exact…", `summarizeReconciliation` 11/24/7/0/173/42/215 |
| 5 | no report-line denominator | first layer excludes 214 and 215; `total !== REPORT_26_19_LINE_COUNT` |
| 6 | redundant rows suppressed | Aphelios / Elise: 0 evidence rows |
| 7 | differing status kept | Aurora R under a flagged header |
| 8 | tracked value reachable | Draven 62, Vi 63, Anivia 19 (`patch-report-evidence-value`) |
| 9 | raw property / formula under Technical | Aurora `ability_damage_formula` and formula, Vi shield formula, Draven `base_ad` |
| 10 | Draven not contradictory | Riot 62→64, the build-time sentence, "not Riot's patch note", the Impact sentence, no currently/pending/disput |
| 11 | Aphelios no five rows | header states it once; 1 label in the card |
| 12 | SR source truth unchanged | deep-frozen real cards render every before/after verbatim and are unmutated |

Runs on the branch:
- `vitest run src/components/patch-impact src/lib/patch-impact src/lib/patch-impact-loader src/pages/lol/PatchReports src/components/patch-catchup src/lib/patch-reports src/components/patch-reports --maxWorkers=4`: **31 files, 521/521 passed** (PH1, PH2 Impact, PH3 Catch-Up, PH4 share / graph / Combat Lab page tests).
- ESLint on all 9 changed files: clean.
- `tsc -p tsconfig.app.json --noEmit`: 2 errors on the branch, the same 2 on base `d528bf9f` (`src/lib/identity/connections.ts`, `src/components/onboarding/OnboardingProfile.tsx`). **0 new.**

## 7. Browser certification

Local Vite on this worktree (port 5381, `.claude/launch.json` entry `phsr1`) against the production API, read-only. Combat Lab links were not clicked, so no anonymous users were created.

| Check | Desktop | 375px |
|---|---|---|
| Banner: RECONCILED_WITH_HELDS consumer copy, 42 / 11 / 24 / 7 / 173 | ✔ | ✔ |
| Draven: Riot 62 → 64, Impact "Base AD 62 → 64 +2", then "Mogzy data update flagged" with the build-time 62; no contradiction | ✔ | ✔ |
| Aphelios: header "Not modeled by Mogzy", 0 line rows, 5 Riot lines | ✔ | ✔ |
| Aurora: E flagged (formula under Technical), R "Not modeled by Mogzy" kept | ✔ | ✔ |
| Vi: base "Not auto-checked by Mogzy" (63 at build, `base_ad`), passive flagged (shield formula) | ✔ | ✔ |
| Elise: 0 line rows | ✔ | — |
| Overflow with **every** banner and evidence disclosure opened (incl. Lucian's long formula) | — | 0 offending elements; document width 375 |
| Disclosure target height | 32px (unchanged `min-h-8`) | 32px |
| Keyboard: summary focusable (tabIndex 0), Enter toggles, focus ring visible, accessible name "Mogzy data status: Mogzy data update flagged (show what this means for this change)" | ✔ | ✔ |
| Nested chevrons rotate independently (measured after paint; the hidden pane lags transitions) | ✔ | ✔ |
| Console errors | none | none |
| Status rows measured: 53 (matches the rule computed over the payload) | ✔ | ✔ |

## 8. Known limitations

- **Line status is still a build-time snapshot.** The frontend can't say per line whether a flagged change was later applied, because the API exposes only the patch census. The copy is truthful about that, but it can't be specific. **Backend follow-up:** serve each reconciliation row's terminal state (`knowledge_patch_reconciliation_changes`) beside the report line, keyed by change digest. Line labels could then say "Updated after publish" or "Held for review" directly.
- **The banner says "this patch", not "26.19".** `PatchDataStatusNotice` receives only `reconciliation`, and passing the version needs a one-line change in `PatchReports.tsx` (another workstream's file). An optional `patchVersion` prop is a safe follow-up.
- **The masthead pill (`PatchHubMasthead.tsx`) still reads "Mogzy data not reconciled" / "partly current".** Suggested alignment for its owner: RECONCILED "Mogzy data up to date", WITH_HELDS "Mogzy data partly updated", FAILED "Mogzy data update didn't finish", absent "No Mogzy data update recorded".
- **`src/lib/patch-reports/filter.ts` `STATUS_LABELS`** still holds the old labels. It isn't imported anywhere (dead export); point it at `MOGZY_STATUS_LABEL` or delete it.
- **Vi base AD `needs_interpretation`** reflects the build-time resolver failing to read the compound "63 + 3.5/Level" line; reconciliation later split and applied both halves. The label "Not auto-checked by Mogzy" is accurate for the build, and the banner's build-time note covers the gap.
- **26.10–26.15 (pre-reconciliation-lane) banners** say "No full Mogzy data update is recorded for this patch" while some lines say "Mogzy data updated" (legacy proposal path, e.g. Anivia). The body says "no record of a full check", which allows individual updates.

## 9. Integration

1. Rebase or cherry-pick the single commit onto the integration base. The only expected overlap is with whoever touches `PatchReportEntityCard.test.tsx` (4 assertion lines) or adds a slot that reads `patch-report-evidence`.
2. `PatchImpactChangeAnalysis.test.tsx` still finds `patch-report-evidence` after Impact (order unchanged) and passed.
3. Re-run the vitest command in §6, plus ESLint and the tsc diff.
4. Merge order against PHSR2/3/4 doesn't matter for these files. If PHSR3 (sticky nav) or the masthead owner changes the `#patch-data-status` anchor, keep `data-testid="patch-data-status"` / `id` wiring in `PatchReports.tsx`; this branch doesn't touch it.
5. No backend deploy needed; works against current production payloads.
