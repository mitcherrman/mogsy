# J3 capture provenance (JOURNEY-UI3)

These files are **real backend output**, not hand-written fixtures.

- **Backend:** `League_Combat_Simulator` branch `journey3/daily` @ `174747b60e6ca73190de88297b75c097806d4ecb` (JOURNEY3). Nothing in that repo was modified.
- **Data:** a seeded copy of the canonical DB `C:\Users\mlmit\mogzy-data\lol_calc.db`, opened read-only. The seeding is J3's own end-to-end fixture (`test_journey3_daily.ranked_db`), with the ten launch champions' tables cloned.
- **Harness:** `capture_journey3_test.py.txt` (a pytest file, stored as text so the frontend tooling ignores it). Run it from the backend worktree:

  ```
  LOL_CALC_DB_PATH=…/lol_calc.db JOURNEY_CAPTURE_OUT=<dir> PYTHONPATH=. \
    python -m pytest capture_journey3_test.py -q -p no:cacheprovider
  ```

- **What each envelope is:** exactly what the real HTTP route `GET /api/ranked/matches/{id}` returned (FastAPI `TestClient` over `api_server.app`, clock and identity overridden), at a controlled server instant. **No guard was narrowed**: the backend's public guard (`answer_safety.assert_pre_reveal_safe`) ran unmodified on every read, including every purchase transition. JSON is stored compact, in the wire's own key order.
- **The module is the Daily's own:** each match's only segment is built by the Daily recipe's spec builders from a real `journey_slice` product (`content_sets.products.check`, day seed `day-ui3-capture`):
  - `*.standard` — `daily_challenge.recipe._journey_spec`: `mastery_slice` v2, 5 children, **150 s pooled active time**. Child 1 answered **wrong** on purpose (the Journey still advances, and its reveal still teaches).
  - `*.survival` — `_survival_journey_spec`: v2, 3 children, **30 s per child**, all correct.
  - `pantheon.survival.strikeout` — Survival ruleset with 2 strikes: wrong on child 0 and child 1 ends the stage on child 2 of 3 (**strike-out inside the Journey**; child 3 never reached).
  - `voli.standard.exhaust` — child 1 answered after 100 s, child 2 never answered: the **pool runs out** and the Journey ends on child 2 of 5.
- **The five recipes** are J3's reconstructed R1 launch set: `jungle.volibear_vs_leesin.first_clear` (voli), `mid.zed_vs_ahri.shadow_duel` (zed), `top.olaf_vs_sett.lane_trade` (olaf), `bot.lucian_vs_caitlyn.lane_pressure` (lucian), `support.pantheon_vs_leona.armor_lesson` (pantheon). **Content is wire truth for J3 only**: a backend lane is reconciling these recipes against R1, and a reconciled catalog re-seeds every Journey (new catalog digest), so these must be recaptured with the same harness against the reconciled SHA.

| Label | Moment |
|---|---|
| `child0-leadin` | 10 ms after match creation: the first card not yet open (no child exposed) |
| `childN-open` | 100 ms after child N opened |
| `childN-live` | a quarter of the think time into child N (pool running) |
| `childN-reveal` / `-reveal-late` | 500 ms / 1500 ms into child N's 1750 ms reveal |
| `childN-beat` | halfway through the transition beat before child N (child N not exposed) |
| `childN-stopped`, `childN-timeout`, `finished` | after the strike-out, the pool exhaustion, or the last answer |

A one-module capture ends its MATCH on the last answer (the bot has already finished), so the final reveal and the strike-out reads carry `segment_state: null` and `match_over: true`. In the real Daily the Journey is one module among many (Survival) or the last module (Standard); see the handoff for what the live flow showed.

- **`answers/`:** each child's correct answer, taken from the private payload. It is used by tests only, to assert that answers are ABSENT from the rendered DOM before their reveal.
