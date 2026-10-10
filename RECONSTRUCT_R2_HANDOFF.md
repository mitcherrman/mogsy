# RECONSTRUCT R2 — Handoff

**Objective.** Reconstruct R2. It covers:
- lower-friction interaction;
- no false socket-order cue and no reuse-cap leak;
- plausible decoys;
- an educational reveal;
- measured layout continuity;
- the live 6–6 result contradiction.

**State: COMPLETE on local branches.** Nothing has been pushed, merged, deployed (Railway) or published (Lovable).

## Bases
- **Backend** `reconstruct/r2-backend`:
  - Worktree: `League_Combat_Simulator/.worktrees/reconstruct-r2-be`.
  - Based on origin/master `56f42070`, which was unchanged at fetch.
  - Clean baseline: `.worktrees/r2-baseline` (detached).
- **Frontend** `reconstruct/r2-frontend`:
  - Worktree: `mogsy/.worktrees/reconstruct-r2`, with a node_modules junction.
  - Based on origin/main `b94e0d7e`. Main had MOVED from the expected `c5b46e17`; the only new commits are a Lovable Drizzle SQL migration (`0001_own11_routine_owner_rpcs.sql`).
  - Clean baseline: `mogsy/.worktrees/r2-fe-baseline` (detached, plus the uncommitted replay harness used for R1 measurements).
- **Data:** the certified local DB is `C:\Users\mlmit\mogzy-data\lol_calc.db`, wiki rev 4065930. It is always opened `mode=ro`.

## Decisions (settled)
- **Interaction**
  - No select-then-place and no armed state.
  - Tap or click on a tray card adds one copy to the next empty socket. Repeated taps add copies.
  - Pointer drag (mouse, touch, pen) starts directly on the card.
  - Drops are forgiving: the socket row grown by 28px horizontally and 64px vertically is the drop zone, and the nearest socket centre wins. A drop on a filled socket replaces it.
  - Tapping a filled socket removes its part.
  - Keyboard: Enter/Space on a card adds; Delete/Backspace on a socket removes.
  - Every path goes through ONE helper, `placeFromTray`, so every path submits the identical `{placement}`.
- **No ordering cue:** empty sockets draw nothing (R1 drew 1, 2, 3). The accessible name says "Socket n of N" for navigation only, and announcements never name a position.
- **Quantity:** the tray shows only the placed count (×1, ×2, ×3). The uniform reuse limit is enforced but never drawn or announced.
- **Decoys v3, `stat-family-relevance`:**
  - Stat keys map to families. This classifies the wiki stat vocabulary, never items: magic, physical, marksman, durability, mana, enchanter. ah, ms and omnivamp are generic.
  - Target profile: its own families plus its direct parts' families (Sterak's Gage lists no flat AD).
  - Pool-item profile: its own families, or, when it has none, the families of the targets it builds into.
  - Gate: the item shares a family with the target, and at least half of its families are on-profile.
  - Rank: fit, then stat-axis overlap with the paired part, then same kind, then gold gap.
  - Too few plausible items: the target fails closed. Every v2 safety exclusion is kept.
- **Reveal**
  - The breakdown is worded by the host and every figure is a server string frozen at generation.
  - New reveal-only fields: `part_kind`, `combine_display` and `line_total_display` per direct part; `value_display` per child; target `base_display`. They are in both pre-reveal guards.
  - Rounds generated before R2 carry null for these, and the reveal omits those lines.
- **6–6 result.** The settlement was RIGHT: the bot finished first on both of its correct builds, so 3+3+0 against 2+2+2. The screen was wrong in two ways:
  - The rows print the base points, and the bonus was a 6px dot. It is now a legible "+1" chip, and each row ends with its `final_scores` total.
  - "Modules won" counted the viewer's correct answers. It now reads the backend's `scoring.modules_won`, which tallies each module's own `segment_result` from the same settlement log as `final_scores`. When any module stated no verdict it is null, and the screen then says "Modules correct" instead.
- **Continuity root cause.**
  - On a desktop window shorter than ~720px, the R1 board (478px) overflowed the stage body the arena leaves (424px at 1366×650).
  - `.ranked-panel` is `overflow: hidden`, and clicking Lock focused a half-clipped button.
  - Chrome scrolled the clipped stage, so the whole board jumped 16px at 1366×650 and 81px at 1280×600.
  - No box changed size, which is why R1's fixed-geometry tests could not see it.
  - Fix: a compact tier, `lg:[@media(max-height:719px)]`, where every box is a constant compact size so the board fits the 374px a 600px window leaves. Plus a tall tier (≥800px) that uses the spare parchment.

## Product questions (not changed)
- **Speed bonus:** a wrong-but-faster opponent still denies a correct player the speed bonus, because `strictly_faster` ignores correctness. This applies to every module.
- **Bot think time** is 5–11s, so a correct bot almost always takes the bonus on Reconstruct.
- **Decoy fail-closed binding constraint:** the kept R1 rule that a decoy may not contain a correct part. This is why 8 targets fail closed.

## Measured (rev 4065930; observations, not product truth)
- **Decoys**
  - v2: 106 eligible. 228 of 375 decoys fail the v3 gate, and 227 share NO stat family with their target, in 97/106 targets.
  - v3: 98 eligible; 8 `decoys_insufficient`: Fiendhunter Bolts, Phantom Dancer, Runaan's, RFC, Navori, Horizon Focus, Eclipse, Voltaic.
  - Fixture trays equal real-DB trays.
  - Every target with before/after trays and a per-decoy reason: `docs/RECONSTRUCT_R2_DECOY_AUDIT.md`. Tool: `scripts/reconstruct_decoy_audit.py`.
- **Action count:** a full build plus Lock went from 2N+1 actions to N+1. That is 7 → 4 for three sockets, 5 → 3 for two, 9 → 5 for four. Drag places in one gesture.
- **Continuity** (real Chromium via Playwright; boxes sampled on every rAF and every DOM commit through open → placements → Lock → locked → marks → settle → evidence → done → next segment):

| Viewport | R1 (origin/main) | R2 |
|---|---|---|
| 1600×900, motion / reduced | 0 / 0 | 0 / 0 |
| 1280×720 | 0 / 0 | 0 / 0 |
| 390×844 | 0 / 0 | 0 / 0 |
| **1366×650** | **16px jump at Lock** (both) | 0 / 0 |
| **1280×600** | **81px jump at Lock** (both) | 0 / 0 |
| 360×640 | 0 / 0 | 0 / 0 |

R2 holds every structural box (shell, stage, body, module, header, sockets, status, region, footer, socket, opponent line) to ≤1px frame-to-frame and over the whole flow. A fit check across Wit's End, Stormrazor and Dusk and Dawn (4 parts), open/wrong/right, at 6 viewports found 0 stage overflow, 0 breakdown overflow and 0 horizontal overflow.

## Files
- **Backend**
  - Code: `ranked_modules/reconstruct.py`, `ranked_recipe_catalog.py` (stats), `answer_safety.py`, `ranked_public/{points_view,service,persistence}.py`, `routes/ranked_public.py` (resume).
  - Fixture: `fixtures/reconstruct_recipe_graph_rev4065930.json` (+ `stats_json`).
  - Scripts: `scripts/reconstruct_{decoy_audit,probe_fixture}.py`.
  - Tests: `test_reconstruct_decoy_relevance.py`, `test_reconstruct_wire_contract.py` (draw regression and captures).
- **Frontend**
  - Primitive and helpers: `components/interaction-grammar/Reconstruct.tsx`, `lib/interaction-grammar/{reconstruct,types}.ts`.
  - Module and contracts: `lib/ranked-core/modules/reconstructModule.tsx`, `lib/ranked-public/contracts.ts`.
  - Results: `components/ranked-arena/ModuleBubble.tsx`, `pages/quiz-ranked/{RankedModuleDuel,RankedResultDuel,QuizRankedMatch,rankedResultsModel}.tsx/ts`.
  - Probe: `pages/dev/ranked-shell-probe/{reconstructBotReplay.ts,RankedShellProbe.tsx}`, used as `?q=reconstruct&recon=bot`.
  - Continuity spec: `e2e/ranked-reconstruct-continuity.spec.ts` (in `playwright.arena.config.ts`).
  - Fixtures, regenerated from the backend and never hand-edited:
    - `reconstructServerCapture.json` (`RC_WIRE_CAPTURE_PATH`);
    - `reconstructDrawResultCapture.json` (`RC_RESULT_CAPTURE_PATH`);
    - `reconstructProbeRounds.json` (`scripts/reconstruct_probe_fixture.py`).

## Tests
- **Backend**
  - All Reconstruct suites pass: module, flow, certification, wire (4), decoy relevance (22).
  - The related ranked/guard/order-forge/RP1 set fails identically on the branch and on clean `56f42070`; those failures are pre-existing (stale OWN1 admin harness and an RP1 clock issue).
- **Frontend:**
  - The primitive (76), lib (26), module (22), contract (18), host (4), result regression (4), results model and end screen pass.
  - The broad related set matches the clean baseline.
  - `tsc`: only the 2 pre-existing onboarding/identity errors.
  - eslint: 0 errors.
  - The continuity e2e spec: 10/10.
- Running the e2e spec locally needs an installed Chromium matching Playwright 1.64. This machine has build 1243, so it ran through a local config with `launchOptions.executablePath`.

## Remaining
- The 4-part breakdown and phone child labels can truncate long child names; the full name is in `title`.
- The continuity spec serves the captured round, so wiki art loads only when `VITE_COMBAT_API_URL` points at a static server over the backend checkout. Geometry is art-independent, because the art boxes are fixed.
- The owner playtest decides the product questions above.

## Next
Owner playtest of both branches together on a short and a tall desktop window. Then decide push/merge.
