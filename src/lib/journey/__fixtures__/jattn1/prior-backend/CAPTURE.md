# JATTN1 prior-backend captures (deploy-order proof)

**Real backend output, not hand-written.** Same harness, seeds and instants as `../CAPTURE.md` (`../capture_jattn1_test.py.txt`), run on the backend **without** JATTN1: `League_Combat_Simulator` `origin/master` **`72c32c89`** (GM1-R2), canonical DB opened `mode=ro`, Ranked tables in a seeded scratch DB.

| File | Same Journey as | What it lacks vs `../` |
|---|---|---|
| `zed_ahri.reference.json` | `../zed_ahri.reference.json` | `focus.target_stat`; `object`/`context.rank` on damage facts; non-null Combat `asks_fact` |
| `pantheon.standard.json` | `../pantheon.standard.json` | same |

Journey-wise the two sets differ **only** in those keys (bot pace, deadlines and score vary run to run). Used by `src/lib/ranked-core/modules/masterySliceModule.jattn1DeployCompat.test.tsx`: this frontend must draw both backends identically except for the `target_stat` target cue.
