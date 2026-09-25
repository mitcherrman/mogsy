# J4 capture provenance (JOURNEY-UI3 final recipe recapture)

**Real backend output, not hand-written.** Same harness and method as `../j3/CAPTURE.md`, run against the R1-reconciled catalog:

- **Backend:** `League_Combat_Simulator` branch `journey4/catalog-reconcile` @ `a273a2165842cc181df5b90b43da8e3ce04dd559` (JOURNEY4, final: code `8ea9765f` + handoff). The run used J4's own clean worktree; nothing in that repo was modified.
- **Harness:** `capture_journey4_test.py.txt` is the J3 harness with J4's recipe ids (`jungle.volibear_vs_leesin`, `mid.zed_vs_ahri`, `top.olaf_vs_sett`, `bot.lucian_vs_caitlyn`, `support.pantheon_vs_leona`). The real HTTP route was used, and the backend guard was **not** narrowed.
- **Contract:** unchanged from J3 (`journey_public_state.v1`). Every snapshot reads through the production parser and the J3 reader (`lib/journey/j4.recapture.test.ts`).
- **What changed is content only:**
  - new children, transitions and values;
  - some children now have **two** transitions before them (e.g. J-A child 5: level + purchase, one 3.5 s beat).
- **The content-specific frontend tests stay on the J3 captures.** J4 is held to the contract invariants.
