# JATTN1 capture provenance (board attention grammar)

**Real backend output, not hand-written.** Same method as `../jp5/CAPTURE.md` and `../jext/CAPTURE.md`.

**Backend.** `League_Combat_Simulator` branch `jattn1/board-attention-be` (on `origin/master` `56f42070`), worktree `mogzy-wt/jattn1-be`. Local only: nothing pushed or deployed. It adds, value-free, `focus.target_stat` on a post-mitigation Combat child and the attacker's ability knowledge object on `ability_raw_damage` / `ability_damage` facts (`journey_knowledge_object.v1`, unchanged contract).

**Harness.** `capture_jattn1_test.py.txt` — the JP5 harness (`../jp5/capture_jp5_test.py.txt`) plus the JLONG1 admin preset `admin.ashe_jinx_extended_journey`. Run from the backend worktree with `LOL_CALC_DB_PATH` = the local canonical copy (opened `mode=ro` for composition), Ranked tables in a seeded scratch DB, `JOURNEY_CAPTURE_OUT` = this folder. Every snapshot is the real `GET /api/ranked/matches/{id}` response (transport guard included). No guard narrowed.

| File | Host | Children | What it holds |
|---|---|---|---|
| `zed_ahri.reference.json` (+ `.wrong`, `.timeout`) | admin preset `admin.zed_ahri_reference_journey` | 4 | formula → raw damage (`target_stat` absent) → Ahri armor → damage after armor (`target_stat: armor`); wrong = Steps 1, 2, 4; timeout on Step 4 |
| `voli.standard.json` | Daily Standard module 10 (J-A) | 5 | Steps 1 and 3 wrong; Caulfield's beat; final R comparison |
| `pantheon.standard.json` | Daily Standard (S-A) | 5 | Leona armor, Cloth Armor beat, three Combat children |
| `voli.survival.json`, `ahri.survival.json` | Daily Survival slot | 3 | per-child clocks; Ahri Step 3 wrong |
| `ashe_jinx.extended.json` (+ `.wrong`) | admin preset `admin.ashe_jinx_extended_journey` | 11 | Pickaxe purchase before Step 5 (`stat_change.source.item_id: "1037"`), the level 4 → 6 + W/R rank beat before Step 7, final Ashe R vs Jinx R comparison; wrong = Steps 1, 2, 10, 11 |

Reveal windows are the production base (`reveal_window_ms: 1750`, per-child `own_reveal_window_ms`). `answers/` holds each child's served options and answer (private payload), used only to prove absence before a reveal.
