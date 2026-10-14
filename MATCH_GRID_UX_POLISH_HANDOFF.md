# Match Grid MG-UX1 — Approved Frontend Polish

Status: **owner-approved, implementation pending**. No scoring or bot changes.

Base: `main` at `4b13c042ef88bff0f3d261b69a3277ecf4ffc2e6`. Recheck origin/main before work. Work on `mg-ux1/match-grid-polish` in an isolated worktree; do not edit main in place.

## Objective
Improve readability, teaching reveal containment, responsiveness and interaction clarity of the existing admin-only Match Grid rune-to-tree game. Preserve existing gameplay and visual identity; do not redesign it.

Approved priorities:
1. Make long rune names distinguishable: no confusing 8.5px/58px captions; a complete name must be accessible by hover/focus/tap/touch even in dense layouts. Avoid overlap, maintain >=44px hit targets.
2. Stop horizontal/vertical clipping of correction ledger. Exact boards get a concise success summary (board remains visible); incorrect boards prominently explain only corrected runes. Full review still available. No teaching content hidden behind timed scrolling.
3. Better use actual available stage/parchment within module boundaries. Preserve constellation for 3 trees, improve rail/ledger for 4–5. No within-round layout jumps and no clashing labels.
4. Improve held/target/placement/Lock feedback, instruction wording and empty well treatment with stable footprint.
5. Tighten responsive typography and wording.

## Verified root causes
- `src/components/match-grid/matchGrid.css`: `.mg-sigil-caption` nowrap/ellipsis; ledger variant `width:58px; font-size:8.5px`; `.mg-ledger-cards` flex overflow-x:auto with min-width 150px cards, while `.mg-root` overflow:hidden.
- `src/components/match-grid/MatchGrid.tsx`: around lines 125–175 picks rail by measured arena `maxHeight`. Rendered sigils have full aria-label but visually truncate. Bottom `Ledger` maps perfect boards to every group and all its members, causing clipped cards; wrong boards produce corrections.
- `src/lib/match-grid/layout.ts`: RAIL constant `rowH=56, sigil=44, sealR=24, firstSeatX=164, pitchX=58, columnW=310, wellPitch=58`, only uses a narrow strip of stage.
- `src/lib/ranked-core/modules/matchGridModule.tsx`: `useStageRoom` measures real arena height and feeds `maxHeight`. Keep server-authoritative reveal and opaque tokens.

## Safety and exclusions
- **DEFER** bots, versus play, timer/speed bonuses, grading, points and all competitive balancing. Owner has not chosen whether these are standalone games or Daily Challenge modules.
- Do not modify shared Ranked Arena toasts/HUD/results in this task; record those separately. No backend/Supabase/Railway work, migrations, deployment or automatic publication.
- Preserve server answer secrecy (no correctness or canonical map before lock), drag/tap-tap/keyboard accessibility, reduced-motion support, stable entity nodes and layout across open→lock→reveal.

## Acceptance evidence
Check 1600×900, 1280×720, 1366×650, 1280×600, 390×844, 360×640 plus tall desktop. All 3/4/5-tree boards: open, partially assigned, fully assigned, perfect and wrong reveals, transition. Include full-name access on mouse/keyboard/touch. All visible correction details readable within available reveal window, no overflow/collisions, ≥44px clickable targets, structural shift ≤1px. Use existing unit tests and browser suites (`MatchGrid.test.tsx`, `layout.rail.test.ts`, `e2e/match-grid-arena-continuity.spec.ts`, `e2e/match-grid-live-release.spec.ts`). Run typecheck/lint and compare against clean current-main baseline, documenting only new failures.

## Delivery
Implement in isolated worktree, commit to this branch, open a **draft PR** (don't merge), and provide before/after screenshots and a short `MATCH_GRID_UX_POLISH_HANDOFF.md` update: tests, changed files, design decisions, risks and remaining tasks. Request owner visual acceptance before any production release.