# JP5 capture provenance (round 3: typed workings + per-child reveal windows)

**Real backend output, not hand-written.** Same method as `../jref/CAPTURE.md` and `../m1/CAPTURE.md`.

**Backend.** `League_Combat_Simulator` branch `jp5/journey-structured-working` at `96fff403` (on JP4 `fc95e81e`), worktree `.worktrees/jp5-structured-working`. Local only: nothing pushed or deployed.

**Harness.** `capture_jp5_test.py.txt` (run from the backend worktree with `LOL_CALC_DB_PATH` = the local canonical copy, opened `mode=ro` for composition; Ranked tables in a seeded scratch DB; no guard narrowed). It is the JREF + M1 harness with one change: every reveal is read against the child's OWN frozen window (`reveal_windows_ms`), at +500 ms, +1500 ms, +3700 ms (windows >= 4400 ms) and window - 150 ms.

| File | Match | What it holds |
|---|---|---|
| `zed_ahri.reference.json` | admin preset `admin.zed_ahri_reference_journey` | all correct; windows `[1750, 4000, 1750, 6000]`; Step 2 `raw_damage_working.v1`, Step 4 `combat_working.v1` |
| `zed_ahri.reference.wrong.json` | same | Steps 1, 2 and 4 wrong |
| `zed_ahri.reference.timeout.json` | same | Step 4 spends the pool: its reveal still holds 6000 ms |
| `voli.standard.json` | Daily Standard module 10 (J-A) | Combat 6000, haste `cooldown_working.v1` 6000 (12s, 10 AH, 0.9091, 11), comparison 1750 |
| `pantheon.standard.json` | Daily Standard (S-A) | three Combat children at 6000; Step 3's live dependency (Leona armor 50) |
| `voli.survival.json` | Daily Survival slot | haste 6000, Combat 6000 |
| `ahri.survival.json` | Daily Survival slot | an R under Kindlegem haste (`cooldown_working.v1`, answer 127) at 6000 |

`answers/` holds each child's served options and answer (private payload), used only to prove absence before a reveal.
