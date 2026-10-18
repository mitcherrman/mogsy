# Worlds Dynasty UX-D0: handoff

**Status:** Design/documentation only. Local branch, **not pushed, merged or deployed**.
**Branch:** `ux/ux-d0-dynasty-design` in the `mogsy` repo, worktree `C:\Users\mlmit\mogzy-wt\ux-d0`, cut from `roguelike/rog1d1-dynasty-frontend` @ `14702285` (that branch and its PR were not modified).
**Spec:** `docs/roguelike/WORLDS_DYNASTY_UX_D0_SPEC.md` (screen flows as mermaid, wireframes, reuse map, fixtures, phased plan, open decisions).

## Verdict
No new design system. Build Dynasty from: Worlds-experience plates and `motion.ts`; D1's controller, contracts and reveal; Ranked `CanonicalArena` only for the three-question objective encounters; Journey's in-place delta pattern for mental-state changes; `game-results` for series/run endings; `ProPlayEvidence`-style server-verbatim evidence for the optional "why this baseline" panel.

## Key design calls
1. One decision per screen; state capped at Confidence + Fatigue per player, team Cohesion, in-match Pressure.
2. Season = path of BO5 nodes with a gap strip (Prep / Transfer window / Event); bracket fixed, prep routes branch.
3. Stage view: seven pips (5 lanes + a 2-pip team tile), five labelled states, a lead meter marked "not points"; Late never rendered after a Mid closeout.
4. Events are beats with scope/sign/duration effect chips and a ledger; rare champion events spark only when partly unlocked.
5. 3Q encounters show a qualitative outcome ladder up front; capped per game; not every major is interactive.
6. Explanation = sheet with two tabs (simulation vs historical baseline) and three source chips (Verified real-world / Dynasty rules / Generated in-run event).

## Not verified
Component paths were verified by reading source in the D1 worktree. The app was not run and no screenshots were reviewed; layout, timing targets (game ≈ 90 s, run 30-45 min) and all numbers are proposals. All fixtures are synthetic.

## Needs owner decision first
See spec §17 (O-1..O-11); most impactful: starting roster policy, which majors are interactive, season length/elimination, whether to show Form.

## Next step
Owner reviews the spec, then authorizes **UX-1**: DEV-only clickable prototype on synthetic fixtures (new files only, no routing/auth/shared-CSS changes beyond a dev route), with Playwright screenshots at 390x844 and 1440x900.
