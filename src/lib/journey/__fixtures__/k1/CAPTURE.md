# K1 capture provenance (K2 knowledge marks)

**Real backend output, not hand-written.** Same harness and method as `../j3/CAPTURE.md` and `../j4/CAPTURE.md`, run against the K1 contract:

- **Backend:** `League_Combat_Simulator` branch `k1/knowledge-objects` @ `597a2432` (K1 final: implementation `502cbc06` + handoff; base `f6b6f012`, the J6 deployed head). It was run from a throwaway detached worktree, and nothing in the backend was modified.
- **Contract:** `journey_public_state.v1` + `knowledge_object_contract: "journey_knowledge_object.v1"`. It adds `object` / `context` / `unit` on ledger facts and `learner.asks_fact` per child.
- **Harness:** `capture_k2_test.py.txt`. This is the J4 harness with these changes:
  - the K1 wrong-answer pattern;
  - J5 final-window reads (`final-reconnect`);
  - a pooled-clock timeout read inside the final window;
  - the servable `mid.ahri_vs_syndra` survival, whose final child is answered wrong.

  The real HTTP route was used, and the guard was **not** narrowed.

| File | What it proves |
|---|---|
| `voli.standard.json` | K1's own sample: child 0 **wrong**, child 1 right, child 2 **wrong**. Q r1 = `"12"`, then Q r1 @ 10 AH = `"11"` on the **same** ability. The ledger value is 10.909…. The stated formula (deferred) is on the same object. |
| `pantheon.standard.json` | **Opponent champion** fact: `opponent:leona`, armor at level 3 = `"50"` (the ledger value is 50.08). |
| `ahri.survival.json` | The **final child** (Ahri R r1 @ 10 AH) is answered **wrong** (`"117"`), and the reveal gives `"127"`. It has no later child, so the mark comes from `asks_fact` + its reveal. R already carries `"140"` (R r1, ②), and Q has a **flat** cooldown (`rank: null`, `"7"`). Includes `final-reconnect`. |
| `voli.standard.timeout.json` | Child 0 spends the whole 150 s pool. The mark comes from a **timed-out** reveal (`player_answer: null`) in the final window, plus a reconnect. |
| `voli.survival.json` | Two facts on one ability (Q r1 at ①, Q r1 @ 10 AH at ②), all correct. |

`answers/` holds each child's correct answer from the private payload. Tests use it only to prove that an answer is **absent** before its reveal.
