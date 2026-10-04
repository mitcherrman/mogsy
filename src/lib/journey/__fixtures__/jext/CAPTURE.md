# JEXT capture provenance — Ashe vs Jinx Extended Journey (11 children)

**Real backend output, not hand-written.** Same method as `../jref/CAPTURE.md`.

* **Backend:** `League_Combat_Simulator` branch `mj-long/variable-length-journey` @ `7c203aeb` (JLONG1), run from its worktree. Nothing in the backend was modified.
* **Preset:** `admin.ashe_jinx_extended_journey`, created with `service.create_bot_match(..., preset=...)`; Journey composed against the canonical `lol_calc.db` opened `mode=ro`; Ranked tables in a seeded scratch DB.
* **Harness:** `../jref/capture_jp2_test.py.txt` with the preset and champions changed (`Ashe`, `Jinx`) and the walk's output prefix renamed. Every snapshot is the real `GET /api/ranked/matches/{id}` response.
* **File:** `ashe_jinx.extended.json` — all eleven children answered correctly (51 snapshots, including both mid-Journey transition beats before children 5 and 7 and the finish). `answers/` holds the harness's private answer sheets (the correct run plus wrong/timeout walks) for reference only; the wrong and timeout snapshot sets were captured but not kept.
* **Shape facts the frontend relies on:** `plan: "extended"`, `child_count: 11`, `challenge_count: 11`, pooled clock `330000` ms, children and open delays served progressively, transitions `before_child` `[4, 6]` (0-indexed).
