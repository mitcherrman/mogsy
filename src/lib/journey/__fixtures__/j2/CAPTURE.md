# J2 capture provenance (JOURNEY-UI2) — RETIRED from gameplay by JOURNEY-UI3

> **JOURNEY-UI3:** J3 replaced this wire. The production parser now REFUSES a J2 Journey block (no `public_state_contract`, and its `cost` key fails the generic pre-reveal walk). Only `olaf.standard.v2.json` is kept, for the ISOLATED J2 reader test (`lib/journey/j2.adapter.test.ts`). The other J2 captures were removed; the real captures now live in `../j3/`.

These files are **real backend output**, not hand-written fixtures.

- **Backend:** `League_Combat_Simulator` branch `journey2/core` @ `52e9d929` (JOURNEY2). Nothing in that repo was modified.
- **Data:** a seeded copy of the canonical DB `C:\Users\mlmit\mogzy-data\lol_calc.db`, opened read-only. The seeding is the same as J2's own E2E fixture (`test_journey2_core.ranked_db`).
- **Harness:** `capture_journey_test.py.txt` (a pytest file, stored as text so the frontend tooling ignores it). Run it from the backend worktree:

  ```
  LOL_CALC_DB_PATH=…/lol_calc.db JOURNEY_CAPTURE_OUT=<dir> PYTHONPATH=. \
    python -m pytest capture_journey_test.py -q -p no:cacheprovider --rootdir=<dir>
  ```

- **What each envelope is:** exactly what `GET /matches/{id}/public` composes, `project_public(rehydrated, now, presence=None, segment_state_for(...), ruleset_state_for(...))`. It is sampled at each moment of real Bot matches:

  | Label | Moment |
  |---|---|
  | `child0-open` | Before the first card's lead-in ends (nothing exposed yet) |
  | `child0-live` | The first card open |
  | `childN-reveal` | 500 ms into a reveal |
  | `childN-beat` | Halfway through a transition beat (next child not yet exposed) |
  | `childN-open` | 100 ms after the next child opened |

  The runs covered are:
  - `*.standard.v2`: the 6 J2 recipes on `mastery_slice` v2 per-child clocks. Child 1 was answered **wrong** on purpose, and the Journey still advances.
  - `volibear.survival.stop`: a Survival ruleset with 2 strikes. The stage ends on child 2 of 3.
  - `olaf.standard.block`: `mastery_slice` v1 with one pooled 150 s block deadline.
- **`answers/`:** each child's correct answer, taken from the private payload. It is used by tests only, to assert that answers are ABSENT from the rendered DOM before their reveal.

## The one capture-time narrowing (a J2 defect)

J2's purchase transitions carry item-cost narration at `challenges.journey.transitions[].changes[].items_added[].cost`. The backend's own public guard (`answer_safety.assert_pre_reveal_safe`, used by `project_public`) bans the key `cost` everywhere. So the real `/public` route raises as soon as a purchase transition becomes visible.

To capture the payload the frontend would receive, the harness runs the real guard on a copy with **only that key path** removed. Every other key, including `cost` anywhere else, is still enforced.

The frontend reader accepts `cost` at that exact path only (`lib/journey/j2.ts`). **J3 must fix this on the backend:** either scope the guard, or rename the narration key.
