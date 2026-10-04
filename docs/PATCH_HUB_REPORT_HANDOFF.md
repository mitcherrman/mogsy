# PATCH HUB / PATCH REPORT — HANDOFF

## Objective

Replace the current `/lol/patch-reports` destination with the first Patch Hub / Patch Report foundation.

The public product name is **Patch Hub**. **Patch Report** is the main report inside it.

The report must remain immediately familiar to League players (Riot-style section/champion/ability/change grammar and exact `before → after` notation) while establishing reusable contracts for Mogzy-only interactive analysis.

Do not redesign the Academy Patch Brief book. It is the entry point and is already correct.

## Verified baselines

- Frontend `main`: `798d8436434708355240aec4d405411e9f7ae028`
- Backend `master`: `1b62f1a3ae2b7b0be2e6db4027067c6b8efb2a8b`
- Current public route: `/lol/patch-reports`
- Current page: `src/pages/lol/PatchReports.tsx`
- Current entity renderer: `src/components/patch-reports/PatchReportEntityCard.tsx`
- Current history renderer: `src/components/patch-reports/HistoricalContext.tsx`
- Patch read model client: `src/lib/patch-reports/api.ts`
- Academy Patch Brief projection: `src/lib/patch-reports/patch-brief.ts`

## Important verified capabilities already present

- Patch report payload preserves official `section_id` / `section_title`.
- Backend provides provenance-aware `editorial_direction` = buff / nerf / adjustment.
- Numeric changes carry exact raw before/after values.
- Ability slot and icon are present where parsed.
- Historical context already supports exact/partial/over revert, return-to-historical-state, flags, elapsed patches/days and references.
- Reconciliation truth is separate from Riot patch truth and must remain visible.
- League Docs already exposes canonical base stats, per-level growth and Riot's nonlinear level formula.
- A complete curated multi-role champion authority already exists backend-side.
- Pro Stats already supports patch, role and champion filtering plus picks, bans, presence, win rate and detailed stats.
- Graph1 already supports animated ranked races/boards, champion-stat level progression, exact checkpoints and deterministic video export.
- Matchup Study already proves the runtime-composed, server-frozen contextual Leaguecraft-session pattern.
- Content Studio already supports single-question, answer-reveal, multi-question and daily/social packages, but is local/admin tooling.

## Product rules

### Layer 1 — familiar patch notes

The first read must work without touching anything:

1. Patch / official section
2. Buffs / Nerfs / Adjustments where authoritative
3. Champion/entity identity
4. Riot rationale once at the correct semantic level
5. Ability/system heading and icon
6. Exact `before → after` change

The actual gameplay change is visible by default. Expansion is for deeper Mogzy evidence, not for seeing the patch note.

Shared section copy (Arena / Classic / Mayhem etc.) must render once at section level instead of being repeated on every exploded entity.

### Layer 2 — Mogzy analysis

Design hooks/contracts now; ship only the safe first slice initially:

- precise parameter percentage delta
- before/after mode
- level projection for supported champion-stat growth changes
- historical/revert context
- future: role-relative rank/percentile
- future: pro-play context/trends
- future: modeled Combat Lab downstream effects

Never label a parameter delta as total champion “power”. Distinguish parameter change, projected stat impact and modeled action impact.

### Layer 3 — play / explore / create

The report architecture must leave stable actions for:

- Quiz this change
- Quiz this champion
- Quiz this patch
- History / ability history
- Compare roster / role lens
- Graph it
- Open in Combat Lab when supported
- Open League Docs
- Share this finding
- Content Studio/admin handoff
- Patch Story guided playback

These actions should hand off to the owning system rather than reimplementing those systems inside Patch Report.

## First implementation target (PH1)

Ship the semantic/UI foundation only:

1. Rename visible product surface to **Patch Hub**.
2. Replace the six-tile database-summary-first composition with a compact patch masthead / navigation.
3. Render official patch sections clearly.
4. For canonical SR champion/item content, expose Buff / Nerf / Adjustment grouping using backend editorial authority.
5. Replace collapsed entity cards with open readable report entries:
   - identity
   - rationale
   - ability/system group
   - exact changes
6. Keep reconciliation visible but visually secondary to Riot truth.
7. Render section-level context once.
8. Preserve source/provenance footer.
9. Introduce stable semantic identifiers/anchors for section, entity, group/ability and individual change.
10. Introduce component/domain seams for future `PatchImpactAnalysis` and contextual actions without implementing speculative analysis.

## Explicit non-goals for PH1

Do not implement yet:

- overall power score / tier list
- solo-queue ingestion
- user “My Champions” persistence
- new Graph1 renderer
- new Combat Lab math
- public Content Studio execution
- patch quiz provider/session
- arbitrary causal relationship extraction
- backend parser rewrites unless a frontend blocker is proved
- Academy Patch Brief redesign
- global navigation redesign
- route rename/migration

## File ownership / parallelization

Freeze this contract before parallel coding.

### A — report shell / information architecture

Own:
- `src/pages/lol/PatchReports.tsx`
- new page-level components under `src/components/patch-reports/` whose names start `PatchHub`

Do not edit entity-entry internals owned by B.

### B — readable entity/change presentation

Own:
- `src/components/patch-reports/PatchReportEntityCard.tsx` (may replace with a new renderer)
- `HistoricalContext.tsx` only if needed
- new components whose names start `PatchReport`

Do not edit page shell.

### C — contract/tests

Own:
- `src/lib/patch-reports/api.ts` only for additive typing/helpers over fields the backend already returns
- focused Patch Report tests
- semantic anchor/id helper tests
- characterization of repeated section context and editorial direction behavior

Do not redesign UI.

### Integration

Integration instance starts from latest `origin/main`, not from an old worker base. Cherry-pick/replay certified commits in dependency order and resolve only proven overlaps.

## Acceptance criteria for PH1

Desktop and mobile:

- “Patch Hub” is the product heading.
- A user can reach the actual first champion numeric change without opening a disclosure.
- Champion rationale appears once per champion.
- Shared Arena/Classic/Mayhem intro copy appears once per official section, not once per entity.
- Ability names/icons and exact `before → after` notation are immediately visible.
- Buff/Nerf/Adjustment grouping never overrides a stronger backend authority with local guessing.
- Reconciliation status remains truthful and visible but does not dominate every entity header.
- Search still works.
- Patch deep links still survive refresh.
- No horizontal overflow at 320/375 px.
- Keyboard navigation remains valid.
- Existing Patch Brief projection and Academy Broadcast behavior are unchanged.
- Old backend payloads that omit additive editorial/history fields degrade safely.

## Tests / certification expected

- Existing Patch Report tests.
- New focused tests for open-by-default change rendering.
- New test proving shared section context deduplication.
- New test proving backend editorial authority drives grouping when present.
- New test for stable anchor generation.
- Academy Patch Brief regression tests.
- Browser pass at 375, tablet, 1280, 1440.
- Verify latest heterogeneous patch and at least one older patch.
- Verify direct `?patch=` load + refresh.
- Verify source link and reconciliation notice.

## Current state — PH1 integrated and certified (local only)

Branch `patchhub/ph1-integration` (worktree `.worktrees/ph1-integration`). Not merged, not pushed, not deployed.

- Integration base: `origin/main` `30b1266f85e57d0e4f6847c99030c8b00a5af929` (verified before editing).
- Final integration code commit: `bdae352f` (see the commit after it for this handoff).
- Commits on the branch:
  - `fd504e86` — PH1-C cherry-picked as-is (`-x 7488d51f`): the canonical semantic layer.
  - `59a5932f` — A (`a5e1e1a1`) and B (`9b766ace`) applied `--no-commit`, then reconciled onto C before committing.
  - `bdae352f` — section/direction anchor scroll margin (found in route certification).

### Integration map (before editing)

- Textual overlap: none. C only touched `src/lib/patch-reports/*`; A touched the page, the page test and `PatchHub*`; B touched the entity components, `HistoricalContext.test` and the history-integration test.
- Conceptual duplication: three semantic models (A `PatchHubModel`, B `PatchReportModel`, C `report-structure` + `semantic-ids`), and two shared-context strippers (A `stripSharedContext` on the card + B `isSharedContext` in the entity), which would both have acted.
- Canonical owner per responsibility:

| Responsibility | Canonical | Source |
|---|---|---|
| Section / entity / group / change IDs | `lib/patch-reports/semantic-ids.ts` | C (B's and A's anchors dropped; A's used `card.id`) |
| Official section grouping + order | `lib/patch-reports/report-structure.ts` | C grouping + A's `section_titles` ordering |
| Editorial direction grouping | `report-structure.ts` | C's structure, A's backend-only rule (C's local fallback removed) |
| Shared section context | `report-structure.ts` | C's pair-safe rule, decided once |
| Ability group split + slot/name parsing, `hasExactValues` | `report-structure.ts` | B's rules, moved into the lib |
| Legacy payload degradation | `report-structure.ts` | A's flat gate + C's tolerance |
| Entity rendering | `components/patch-reports/PatchReport*` | B |
| Page shell / masthead / nav / section | `pages/lol/PatchReports.tsx`, `PatchHub*` | A |

Removed duplicates: `components/patch-reports/PatchHubModel.ts` (+test), `components/patch-reports/PatchReportModel.ts` (+test), C's unused `resolveEditorialClaims` (duplicate of the Patch Brief resolver).

### Canonical semantic-layer decisions (evidence: production 26.10–26.19 payloads, read-only)

- **Editorial direction.** A non-null backend `editorial_direction` puts the entry under Buffs / Nerfs / Adjustments. A null claim goes under "Other changes". If no card in a section has a non-null claim (the field is absent in older payloads, or every claim is null as in 26.10–26.13), the section renders flat. The Patch Brief's local numeric classifier is not used by the report. A test pins the intended divergence: the brief still classifies locally, and `patch-brief.ts` is unchanged.
- **mogzy_inferred.** In grouped sections the entry carries a "◆ Adjustment (inferred)" chip. Riot-sourced entries rely on the bucket heading. Mode, rune and system sections show no direction chips.
- **Runes are not direction-grouped.** Across 26.10–26.19, runes only carry `mogzy_inferred` or null, and modes are all `mogzy_inferred`. That agrees with C, the Patch Brief gate and the contract ("canonical SR champion/item"). A grouped Runes; that was dropped.
- **Shared Riot context.** Text repeated on ≥2 cards of one section is hoisted only if those cards do not all share an identical change list. Twins are an "A / B" block, and the prose stays on both entities with `pairedWith` ("Riot wrote this for Gluttonous Greaves / Immortal Path"; 26.10 Items is the real case). A's and B's "count > 1" rule would have promoted that pair rationale to an Items intro. The structure decides once, `PatchHubSection` renders the intro once, and the entity renders only `entity.context`.
- **Search** filters a structure built from the whole report (`filterReportStructure`). Anchors, buckets and the hoisted intro never change because of a filter.
- **Ability groups** split by Riot `group_title` (B). C's group-by-slot rule merged 26.15 Riven's "R - Blade of the Exile" and "R - Wind Slash" into one heading. Group anchors stay keyed by slot (C) with an occurrence suffix: `g-r`, `g-r-2`.
- **IDs.** The grammar is `s-<section>` › `__e-<type>-<name>` › `__g-<slot|title>` › `__c-<property>[-n]`, plus `__d-<direction>` for buckets. No `card.id`. On all 10 production payloads (26.10–26.19) there are 0 duplicate and 0 non-URL-safe IDs, and every change is accounted for (26.19: 214/214, 26.18: 109/109).
- **Heading outline:** h1 Patch Hub › h2 Patch Report · {version} › h3 section › h4 Buffs/Nerfs/… › h5 entity › h6 ability. In flat sections: h3 › h4 entity › h5 ability. B's `headingLevel` default of 3 only applies to standalone use; the shell always passes 4 or 5.
- **B's history-integration test change** is kept. The old test clicked a collapse button that no longer exists; open-by-default is the intended behaviour.
- **Extension seam:** `PatchReportEntrySlots` (entity, group, change analysis, change actions), threaded through `PatchHubSection` `slots`. It is unused today, so there are no dead buttons.
- No backend change. `card.id` is not stable and there is no per-change ID. Neither blocks PH1, because the derived IDs suffice.

### Tests (final run, combined)

`vitest run src/lib/patch-reports src/components/patch-reports src/pages/lol/PatchReports src/components/lol/broadcast src/pages/LolHub --maxWorkers=4`: **14 files, 275/275 passed.** This covers Patch Report, Patch Brief (`patch-brief.test` 35 and C's `patch-brief.unchanged` fence 3), Academy Broadcast 50 and LolHub 99.

- ESLint on every changed file: exit 0.
- `tsc -p tsconfig.app.json --noEmit`: 6 errors, byte-identical to a clean detached checkout of `30b1266f` (`.worktrees/ph1-int-base`). They are proven pre-existing (OnboardingProfile, identity/connections, quiz/practiceLeaveContract.test); none are in Patch Hub files.
- Untouched (diff vs base is empty): `patch-brief.ts`, `api.ts`, `filter.ts`, `src/components/lol/**` (Academy Patch Brief / Broadcast).

### Route certification (`/lol/patch-reports`, local Vite on this worktree, production API read-only)

| Check | 320 | 375 | 768 | 1280 | 1440 |
|---|---|---|---|---|---|
| 26.19 page overflow / offenders | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| 26.18 page overflow / offenders | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| Changes readable without expansion (26.19 214/214, 26.18 109/109) | ✓ | ✓ | ✓ | ✓ | ✓ |
| First champion numeric change visible, no click | ✓ | ✓ | ✓ | ✓ | ✓ |
| Duplicate DOM ids | 0 | 0 | 0 | 0 | 0 |

The patch selector scrolls horizontally inside its own strip on phones (by design); it does not cause page overflow.

Verified on the real route:

- **Shell:** "Patch Hub" h1 and "Patch Report · 26.19" h2.
- **26.19 sections in Riot's order:** Team Voice, Champions, Items, Systems, Classic, ARAM: Mayhem, Arena.
- **Champions buckets:** Buffs 7 / Nerfs 8 / Adjustments 2, matching backend claims. Two inferred chips.
- **Section intros:** the Classic, Mayhem and Arena intros render once (Arena's is shared by 26 entities). There are 0 repeats on entities, and all 17 champion rationales are kept.
- **26.18:** the Mayhem intro renders once. 78 mechanical changes render as prose. All 6 `is_new` changes have NEW badges (e.g. Zaahen "Cooldown Behavior"). Guinsoo's "Buff (inferred)".
- **Navigation:**
  - Clicking the patch selector updates `?patch=` and `aria-current`.
  - Direct `?patch=26.19` works.
  - Refresh keeps the patch and the hash target.
  - A cold-load deep link to `#s-patch-champions__e-champion-bard__g-base-stats__c-armor` lands the change at 96px, below the header.
  - Section nav via keyboard (Enter) lands the heading at 96px and preserves `?patch=`.
- **Search:** "bard" narrows to Arena › Bard. The intro is still shown once and is not re-promoted onto the entity.
- **Keyboard and `<details>`:** the entity permalink and evidence `<summary>` are in the tab order. Enter opens and Space closes the native `<details>`, with focus kept. There is no positive tabindex.
- **Reduced motion:** the only transitions (chevron, permalink) carry `motion-reduce:transition-none`, and the compiled `@media (prefers-reduced-motion: reduce)` rule is present. Mogzy's `html.reduce-motion` setting brings them to ~0s. There are no animations, and `scroll-behavior` is auto.
- **Source and reconciliation:** the Riot source link (masthead + footer, `target=_blank`) and the reconciliation notice (above the report when not RECONCILED; masthead pill links to `#patch-data-status`) are present.
- **Console:** 0 errors.

### Known issues / follow-ups

- On 1280×800 the first champion change sits ~1230px down, because Riot's own first section (26.19 Team Voice, 26.18 Hall of Legends) and the not-reconciled notice come first. It is readable without interaction, and the nav jumps straight to Champions.
- The browser pane cannot emulate OS reduced motion. That path was verified via the compiled media rule plus the app-level class, not by OS emulation.
- Riot sometimes omits `ability_slot` (26.13 Locke); the slot is then derived from the "Q - Name" title.
- Backend still has no stable per-change ID; derived IDs are rebuild-stable but depend on Riot's `property_name` wording.

## Next task

Owner review of the integration branch and screenshots. Do not merge, push or deploy until the owner approves.
