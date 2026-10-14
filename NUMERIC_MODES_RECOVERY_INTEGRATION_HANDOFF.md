# NUM-REC1 — Original Numeric Modes Integration Handoff
Date: 2026-10-14. Status: source branches verified; integration pending.

## Verified original work
- Stat Drop: mig1/1-interaction-lab @ b932af4b65e1a2225e4adb20a87430723788b358. Read docs/MIG1_INTERACTION_GRAMMAR_HANDOFF.md. Preserve original StatDrop.tsx and InteractionLab.tsx; production grading/answer-independent scale still unresolved.
- Combat Estimate: combat-estimate/ce1-fable @ 7929f2dc4d68ac948e5dd3c0128eca7a206cee1f. Read COMBAT_ESTIMATE_CE1_HANDOFF.md. Preserve original two-beam EstimateBeam and CombatEstimateLab; local stand-in grading and historical captured authority are not a production backend.
- Grading research: combat-estimate/ceg1-grading-audit @ 14ece9460f57a196f228e7a669c7c2a2f05652b4. Read COMBAT_ESTIMATE_CEG1_HANDOFF.md. Research-only provisional tolerance; not approved for Ranked grading.
- Owner verified clean Windows worktrees, original tracked handoffs and prelim secret-pattern screening; branches are pushed unchanged.

## Preserve cloud-only numeric-lab changes
- Separate Claude worker reported commit 952e61ad and patch 0001-NUM-LAB-Stat-Drop-Combat-Estimate-prototype-playtest.patch; GitHub has neither the commit nor a numeric implementation PR as of this handoff. Save/download patch or grant worker GitHub write capability before its ephemeral container is discarded.
- Cloud worker's assertion that Combat Estimate was never implemented is contradicted by original verified source. Original designs take precedence; selective admin-routing, mobile/testing improvements from the newer patch may be reused only after code review.

## Next assignment — SAME numeric Claude instance, Opus 5.5 MEDIUM
1. Read this handoff and all three original handoffs in full, compare source and new patch. Preserve the original Stat Drop and two-beam Combat Estimate designs; do not overwrite with generic numeric widgets or made-up fixture games.
2. Integrate prototypes in an isolated worktree on lab/numeric-mode-playtests; production-build authenticated owner-only route is target. Historical /dev routes disappear in production and alone do not satisfy owner request.
3. Ensure real authorization; UI lazy-loading is not an authentication boundary. Do not publish answer-bearing fixture/stand-in-server JSON in publicly retrievable production assets. If this needs new authenticated backend routes, document exact safe backend plan and block deployment pending command center review.
4. Clearly distinguish historical verified game facts, dev fixture values, and server-authoritative grading. Never label fake fixtures as League facts; for any ungraded visual test show Prototype - not server-authoritatively graded.
5. Collect owner feedback on exact vs tolerance policy and input experience; do not silently adopt CEG1 provisional policy. No bot/versus or Ranked competitive scoring.
6. Re-run original unit/browser tests and new cross-integration tests for mobile/keyboard/touch/reveal/answer secrecy/auth/accessibility. Compare baseline regressions; preserve independent MG-UX1, Assembly, Scrub, Role Challenge and Patch Ops work.
7. Open draft PR (no merge or deploy) with screenshots, tests, feature provenance, and update handoff with status/blocks/release gates.

## Acceptance
- Both original mechanics accessible for owner review via appropriately protected live admin experience, accurately labelled for their actual grading authority, without exposing private answers or changing public game modes. Backend truth remains a separate certification gate.
