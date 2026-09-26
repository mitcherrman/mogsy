# M1 capture provenance (JOURNEY-MOTION-V1)

**Real backend output, not hand-written.** It uses the same harness and method as `../k1/CAPTURE.md`, run against the Motion V1 backend:

- **Backend:** `League_Combat_Simulator` branch `jm1/motion-backend` (base `597a2432`, K1). It adds two things:
  - the semantic beat policy `journey.beat.semantic.v1`: one transition before a child is 900 ms, and two or more grouped transitions are 1300 ms, never a sum;
  - a reveal that is reported only for its own frozen window, not through the beat after it.
- **Harness:** `capture_motion_test.py.txt`. This is the K2 harness with one change: every beat is read three times, at its first instant (`childN-beat-start`, +10 ms), its middle (`childN-beat`) and its last millisecond (`childN-beat-end`, 1 ms before the server opens the child). The real HTTP route was used, and the guard was **not** narrowed.

| File | What it proves |
|---|---|
| `voli.standard.json` | Single purchase: Caulfield's (first back, +10 AH / +20 AD) before child 2 = **900 ms**. Grouped beat: level 6 + R unlock + W rank for Volibear, level 6 + Q rank + R unlock for Lee Sin, then Lee Sin's Cloth Armor (+15 armor), before child 4 = **1300 ms** (shares 650 + 650). Volibear Q carries a K2 `!` through the Caulfield's beat. |
| `pantheon.standard.json` | Cloth Armor beat (900 ms) before child 3, then grouped level 4 + first-back Long Sword (1300 ms) before child 4. |
| `ahri.survival.json` | Survival (per-child clock): level 6 + Q rank 1→3 + R unlock on both sides (900 ms) before child 1, and Kindlegem (900 ms) before child 2. |
| `voli.survival.json` | Survival single purchase (900 ms). |

In every beat read, `own_revealing_card_index` is `null`: the answer reveal ended at its own window, and the state beat runs after it. `answers/` holds each child's correct answer from the private payload, for absence tests only.
