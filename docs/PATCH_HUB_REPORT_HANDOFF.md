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

## Current state

Contract/handoff created. No production UI or backend code has been changed yet.

## Next task

Implement PH1 in parallel only after each worker reads this file and confirms its owned files/non-goals.
