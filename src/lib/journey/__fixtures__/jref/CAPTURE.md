# JREF capture provenance (JP2 — Journey Stage Grammar)

**This is real backend output, not hand-written.** It uses the same method as `../m1/CAPTURE.md`.

**Backend.** `League_Combat_Simulator` at **`fe942a58`**, the production master, run from a throwaway detached worktree (`.worktrees/jp2-capture`). Nothing in the backend was modified.

**How the match is built.**
* The match is the admin preset `admin.zed_ahri_reference_journey`, created through `service.create_bot_match(..., preset=...)`.
* The Journey composes against the canonical DB opened `mode=ro`. This is the JREF2 suite's own `canonical_journeys` redirect.
* The Ranked tables live in a seeded scratch DB.
* Every snapshot is the real `GET /api/ranked/matches/{id}` response, read at a controlled server instant.
* The guard was not narrowed.

**Harness.** The harness is `capture_jp2_test.py.txt`. It is the M1 harness with two changes:
* the match is created from the preset instead of a Daily-shaped format;
* the timeout read is taken at the pooled clock's real exhaustion instant: the live read plus `active_time_remaining_ms`.

| File | What it holds |
|---|---|
| `zed_ahri.reference.json` | All four children answered correctly: the formula, 85, 24, 68. It includes the final window and `finished`. |
| `zed_ahri.reference.wrong.json` | Step 1 answered **wrong** (the `+70% AD` distractor) and Step 3 answered **wrong**. Every reveal still establishes its fact. |
| `zed_ahri.reference.timeout.json` | Step 4 spends the rest of the pooled 2:00. Its reveal carries `player_answer: null`, then the match completes. |

`answers/` holds each child's served options and correct answer from the private payload. The tests use it only to prove absence before a reveal, and to check which served string a tap submits.

**The chain as captured.** These values match the JREF release handoff §4.

The profiles (`zed.mid.v1` / `ahri.mid.v1`) and the checkpoint (1:45, wave 3) are private. They are proven by the backend suites, not by this capture. What the public payload shows:

| Level | Bonus AD | Formula | Raw damage | Armor | After armor |
|---|---|---|---|---|---|
| 2 / 2 | 20.8 | `70 / 92.5 / 115 / 137.5 / 160 (+70% bonus AD)` | 84.56 → 85 | 24.024 → 24 | 68.1804 → 68 |
