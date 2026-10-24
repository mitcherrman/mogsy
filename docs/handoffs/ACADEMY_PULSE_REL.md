# Academy Pulse — PULSE-1.2 reliability verification

Branch `pulse/rel-verify`, based on `main` a0f426d4 (which includes #140 PULSE-1 and #148 PULSE-1.1). Verification level L2: targeted unit tests plus the `academy-pulse` browser workflow on GitHub Actions only (AGENTS.md). No local browser automation was used.

## Method

1. I read the merged rotation model (`model/pulse-rotation.ts`), its clock (`usePulseRotation.ts`) and the hold wiring in `AcademyPulse.tsx` (hover grace, focus-visible, interaction, expanded, offscreen, hidden). I traced each owner-reported symptom through them.
2. I added DEV-only diagnostics: `data-holds` on the device lists every active hold. In production it is `undefined`: no polling and no cost.
3. For the confirmed defect: a narrow fix, plus unit and browser regressions.

## Findings

| Owner-reported symptom | Status | Evidence |
|---|---|---|
| Auto-transition stops unexpectedly | **Fixed by #148.** A mouse click no longer creates a permanent focus hold (only `:focus-visible` holds), and hover is a 6 s idle grace. | Code trace. The #148 tests remain, and the new expand/close test shows rotation resuming on its own. |
| Next/Previous prevents future rotation | **Fixed by #148.** A manual move clears the `hover` and `interaction` holds; mouse focus doesn't hold. | Reducer tests; #148 browser test "automatic advancement after clicking Next" |
| Answering or interacting leaves a lingering pause | **Not reproducible.** The interaction hold ends 10 s after the last interaction, or at once on a manual move. A disabled answer button drops focus, and blur releases the focus hold. | Code trace; jsdom question test |
| Expand and close restores rotation | **Correct.** The `expanded` hold follows the dialog's open state. Focus returns to the opener: a mouse close leaves no focus-visible hold. | New browser test: `data-holds` is empty after close and the next scene arrives by itself |
| **Play/Pause appears inconsistent** | **Confirmed defect, fixed here.** | See below |

### The Play/Pause defect (still present after #148)

The icon and label followed `playing`, meaning "no hold at all". A mouse moving onto Pulse to reach Pause creates the transient `hover` hold, so the button flipped to ▶ "Play" as the pointer arrived. The toggle then read "not rotating" as "paused" and **resumed** instead. The first mouse click on Pause therefore did nothing visible, and only the second paused. Keyboard focus had the same effect.

**Fix (narrow):**
- The button and `toggle-user` now follow the viewer's own Pause (the `user` hold).
- Pressing Pause always adds it. Pressing Play removes it along with the transient `hover`, `focus` and `interaction` holds, as #148 intended.
- Play never overrides `expanded`, `offscreen` or `hidden`.
- Transient holds still freeze the dwell clock and progress line; they just no longer change what the button offers.
- Files: `model/pulse-rotation.ts`, `usePulseRotation.ts` (exposes `holds`), `AcademyPulse.tsx` (label, icon, DEV `data-holds`).
- Unchanged: layout, scenes, cadence, provider and every other Home Hub system.

**Tests:**
- Two #148 tests encoded the faulty behaviour (expecting "Play" while hovering or keyboard-focused). They now assert the corrected semantics.
- New reducer test, new jsdom test and two new browser tests: the mouse path to Pause, and expand/close restoring rotation.

## Verification

- Local vitest: `src/features/academy-pulse` + `AcademyCorePage.test.tsx`, 139/139 passing.
- CI `academy-pulse` on draft PR #152 (run 40073116223, 676838a8): **pass**, including unit tests, the production build and the Chromium acceptance suite.
- The first CI run (45dffadd) failed 2 browser cases:
  - My new expand/close test read a scene with a single-element locator, but two scenes coexist during the overlapping transition (rotation had in fact advanced). It now uses the spec's `incomingScene` helper.
  - A #148 test asserted the faulty behaviour itself: clicking while hovering resumed. It now asserts that the first click pauses and the second resumes.

## Remaining uncertainties

- **Keyboard users:** a visible keyboard focus inside Pulse still holds rotation until focus leaves, which is intended (WCAG). After Escape closes the expanded view, focus returns to Expand as visible focus, so rotation stays held until the user tabs away. That is correct for keyboard users, but a mouse user who closes with Escape gets the same hold.
- **Not verified on real hardware:** the owner's live browser (Lovable build) and touch devices. Touch never creates a hover hold, by design.
- The handoff `ACADEMY_PULSE_HANDOFF.md` opening header still says #140 is unmerged. I left it alone (out of scope); §§9–10 are current.
