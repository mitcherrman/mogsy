# Worlds Dynasty RC0: frontend notes

The full RC0 handoff lives in the backend repo, `docs/roguelike/WORLDS_DYNASTY_RC0_HANDOFF.md` (`roguelike/wd-rc0-integration`). It holds the verdict, the integration map, the E2E results, the release checklist and the ranked blockers. This page covers only what changed in `mogsy`.

**Date:** 2026-10-22. **State:** local only; nothing is pushed or published.

## Branches

| Branch | Commit | |
|---|---|---|
| `ux/wd-rc0-integration` (worktree `C:\Users\mlmit\mogzy-wt\wd-rc0`) | `fe4cad0d` on UX-7 `1792ce2b` | The RC0 fix commit |
| `ux/wd-rc0-merge-preview` (`mogzy-wt/wd-rc0-merge-fe`) | `7816c7e8` = `origin/main` b2b3213b + RC0 | Preview only. Clean merge: tsc baseline-only, Dynasty vitest 182/182, `vite build` OK. |

`node_modules` in both worktrees is a **junction** to the main checkout. Delete the junction before any `git worktree remove`.

## What `fe4cad0d` changes

1. **`/admin/dynasty` serves the E3B campaign** through `DynastyCampaignPage` (behind `AdminRoute`).
   - The campaign used to be reachable only at the DEV route `/dev/dynasty-v2?view=campaign`, which a production build drops.
   - The ROG1-D1 run page needs `/api/admin/dynasty/runs*`, which the E3B backend does not serve. It is no longer routed in production, and stays in the DEV fixture preview `/dev/dynasty`.
   - The production bundle of the merge preview contains no `/dev/dynasty-v2` string and no v1 `/runs` call.
2. **Run boundaries.**
   - `CampaignRoute` wraps the flow. A failure outside a screen offers "Reload the run", which remounts the flow and re-reads the server.
   - The BO5 inside the campaign has its own boundary, which goes "Back to headquarters" and keeps the series open.
   - Before this, a draw failure in either place unmounted the whole app.
3. **`stageTitle` / `stageIdentity`.** A stage key the client does not know (a future format) keeps its served name and the split's look.
4. **The 398 px fix in `bo5/ServerGame.tsx`.**
   - The compact "published" stage-score strip now wraps. At 360 px it needed 385–418 px on one line.
   - The right-aligned stage-result stamp now grows leftwards. Its `scale(1.45)` entrance had overflowed to 370–373 px.
   - At 360×780 and 390×844, a full 7-series run then showed 0 overflow over 609 checks, every running animation scrubbed.

**Tests:**
- `src/pages/dev/dynasty-v2/campaign/CampaignRoute.test.tsx` (3).
- `src/App.dynastyRoute.test.ts` (+1). It pins the owner route and that `/dev/dynasty-v2` stays DEV-only.

## Contract notes

The shapes verified over 2,371 live responses (71 shape-distinct) are in the backend API doc §9. Two of them matter for frontend types that still claim more than the server sends:
- `Transition.decided.ending` is the raw settlement record, without `opponent`, `series_played` or `record`.
- `E3aManagement.entry_scenario` on campaign series is `{key: "campaign", …}`.

Neither is read in a way that breaks.

## Not changed (owner decisions)

- Baron feedback does not show the correct option after a wrong answer, although the server sends `feedback.correct_option_id`.
- The banner still reads "UX-7 · live E3B campaign".
- At 360 px the global friends-drawer button overlaps the left end of the HQ's sticky action button.
