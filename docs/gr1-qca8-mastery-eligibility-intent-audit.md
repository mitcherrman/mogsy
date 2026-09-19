# GR1 × QCA8 — Mastery family eligibility: intent audit

> **STATUS: CORRECTED (2026-09-19).** The §9 correction was implemented exactly: backend
> `5769dee3` (branch `gr1/qca8-mastery-compat`, base `5c15cb5d`, not pushed) sets both families to
> `modes=(PRACTICE, MASTERY)`. Verified on the canonical DB with the §7 probe: Champion Mastery
> 3,238 → **6,787** (level-stat 0 → 3,549), Matchup `champion_stat_compare` 0 → **2,183**, pairs
> with zero comparisons 109 → **0** — identical to the pre-QCA8 baseline. Stored rows stay 0;
> DAILY / RANKED / TIME_TRIAL stay excluded; a Mastery regression test now pins eligibility. The
> audit below is kept as written.

**AUDIT ONLY.** No runtime code, family contract, test, Mastery or QCA code was changed. Nothing
committed or pushed. The question was not "did Mastery lose content" (it did; the reusable-state
audit already measured it) but **was that loss decided, or a side effect**.

| | |
|---|---|
| Backend audited | `origin/master` **`5c15cb5d`** (fetched 2026-09-19). No commit after `35f055bc` (QCA9) touches `quiz/family_contract.py`, `quiz/mode_gate.py` or `mastery/publication_gate/`. |
| Before / after | `b7ccf8e0~1` = **`23d0f688`** vs `5c15cb5d`. `git diff 23d0f688 5c15cb5d -- mastery/ quiz/mode_gate.py` = one unrelated file (`mastery/chains/summoner_spell_mastery.py`, +24). |
| DB | Canonical `/Users/macmoney/League_Combat_Simulator/lol_calc.db` (5.7 GB), `mode=ro`, `LOL_CALC_DB_PATH` set, probe asserts size > 1 GB so a worktree stub cannot be measured. Registry resolved **173/173** at both SHAs. |
| Context docs | `RANKED_MASTERY_SLICE_HANDOFF.md`, `gr1-matchup-mastery-structural-audit.md` (this repo); `gr1-reusable-state-architecture-audit.md` exists only in `/Users/macmoney/mogsy-wt-rfx1/docs/`. Read for current behaviour only; their reading of QCA8 intent was not relied on. |

---

## 1. Declarations over time (loaded from `FAMILY_CONTRACTS` at each SHA, not read off diffs)

| SHA | Commit | `champion_stat_level` | `champion_stat_compare` | families declaring MASTERY |
|---|---|---|---|---|
| `b6852567~1` | before QCA2A | practice, daily, ranked, **mastery** | practice, daily, ranked, **mastery** | 58 |
| `2387e8f5` … `61427a6a` | QCA3 → QCA7 | unchanged | unchanged | 58 |
| **`b7ccf8e0`** | **QCA8** | **practice** | **practice** | **56** |
| `35f055bc` | QCA9 | practice | practice | 56 |
| `5c15cb5d` | HEAD | practice | practice | 56 |

MASTERY was on both since `da04f276` / `8d59ff96` (DC1, 2026-08-12), before the Mastery gate
existed (`90fdd81e`, 2026-08-28). **FACT: QCA8 is the only commit in the QCA series that removes
MASTERY from any family.** QCA4–QCA7 narrowed only families that never declared MASTERY.

## 2. What QCA8 said it was doing

`b7ccf8e0` (commit, `docs/qca8_recognition_and_stat_runtime.md`, `_QCA8_STAT` note):

* **Scope for the two stat families = storage/architecture.** "had ZERO production rows and stay
  at zero … RECONCILED rationale and IMPACT_RECOMPUTE_SWEEP were sweeping a population of
  nothing"; curve callers move to `quiz.champion_stat_authority`.
* **Mode rationale, single sentence, applied to all six:** "All six narrow to PRACTICE, the only
  surface with a runtime consumer." The contract note says "for the reason QCA4 stated".
* **QCA4's reason** (`docs/qca4_runtime_casual_seam.md` §Deferred) is about *row* consumers: Time
  Trial and Daily freeze `question_id INTEGER NOT NULL`, so they cannot hold a row-less question;
  modes were narrowed "rather than keep a mode declaration nothing honours".
* **Impact analysis enumerated:** Time Trial (recognition rows) and Ranked `shared_bank`
  (recognition bans). **Neither the commit, the doc, the contract notes nor the 957-line test
  file contains the word "Mastery".**

## 3. Tests

| Test | Asserts | Evidence of Mastery intent? |
|---|---|---|
| `test_qca8…::test_the_contracts_declare_the_runtime_key_shape_and_practice_only` (QCA8) | `contract.modes == ("practice",)` for **all six** in one loop | Exact equality excludes Mastery **mechanically**; it is one blanket assertion over six families, four of which never had MASTERY. No Mastery-specific assertion. |
| same test renamed `…_and_consumer_modes` (QCA9) | stat families `== ("practice",)`, others add `time_trial` | Docstring reason is Time Trial history only. |
| `test_qca9…::test_practice_only_runtime_families_never_enter_time_trial` | stat families absent from Time Trial | About Time Trial only. |
| `test_dc1_phase6…` (edited by QCA8) | curve correctness via `rc.compose` | Storage-vs-family distinction: "properties of the FAMILY, not of the storage". |
| `mastery/tests/test_phase4d2_publication_gate.py` | gate == `families_for_mode(MASTERY)` | Tautological; would pass either way. |

No test anywhere pins Mastery eligibility of either family, so QCA8's suite could not signal the
change. No test asserts Mastery **must not** consume them. The only "Practice-only" tests are
framed as consumer-*runtime* statements, never as Mastery product decisions.

## 4. GR1 depended on both families before QCA8

* **Champion Mastery.** `mastery/knowledge/bank.py` `_HINT_LEVEL_STAT.quiz_family_id =
  "champion_stat_level"`. GR1 capability audit (backend `31c0bbe8`, 09-12): four servable families,
  level-stat **52%** of the corpus; the only 5 single-category champions are level-stat-only.
  GR1 product readiness (`36cfef96`, merged 2026-09-12 19:43, **before** QCA8 on 09-14 05:31):
  "Scope held. The four servable families are unchanged (… `champion_stat_level`)", a level-stat
  wording fix across 3,482 candidates, a category-run interleave built for "the deep level-stat
  category".
* **Matchup Mastery.** `mastery/matchup/composer.py` `_HINT_BASE_STAT_COMPARE.quiz_family_id =
  "champion_stat_compare"`. GR1 rank fix `b9f7cd73` and tie policy `16db3690` (both 09-13, before
  QCA8) tuned base-stat ties (`base_magic_resist`, `movement_speed`) in this family.
* **Ownership.** `mastery/publication_gate/policy.py` delegates *by design* to
  `quiz/family_contract.py` ("a decision for the family-contract workstream to make … not for
  Mastery to route around"). So QCA had **authority** to change Mastery eligibility; authority is
  not evidence it **meant** to.

QCA8 therefore changed an existing, actively-developed Mastery contract; it did not expose unused
families.

## 5. The QCA workstream knew Mastery was a mode consumer

* `docs/workstreams/QCA1_QUIZ_CONTENT_CENSUS.md`: lists every `mode_gate` consumer, including
  "Mastery (`mastery/publication_gate/policy`) … Verified by reading every one." Its
  recommendation for both families was **MIGRATE / REGENERATE** ("the bank was never built in
  production") — not narrowing.
* `QCA2A_QUIZ_CONTENT_CLEANUP.md` measured "Every mode still serves: … Mastery 6,431".
* `QCA3_ARCHITECTURE_CLEANUP.md` §5: "GR1/Mastery was not touched" — Mastery was a stated
  out-of-scope boundary for the series.
* QCA8 did not carry the QCA1 consumer list into its impact analysis.

## 6. QCA9 inherited, it did not decide

QCA9's `_QCA8_STAT` text: "QCA9 deliberately did NOT add TIME_TRIAL … these two never served
Time Trial before QCA8 (they were PRACTICE/DAILY/RANKED/MASTERY …), so there was nothing to
restore." QCA9 **saw** MASTERY in the prior declaration and applied a Time-Trial-only restoration
rule ("re-add a mode only when something in it can actually draw a composed question"). Its scope
was `dsa_*` tables. It made no statement about Mastery. The "Practice-only" state is QCA8's,
carried forward.

## 7. Reproduced effect (policy-gate level, pre-dedupe; same probe, same DB, only the SHA differs)

| | `23d0f688` (before QCA8) | `5c15cb5d` (HEAD) |
|---|---|---|
| Champion Mastery, 173 champions, gate-eligible | **6,787** | **3,238** |
| · `champion_stat_level` | 3,549 | **0** — all 3,549 `family_mode_ineligible` |
| · cooldown rank / flat / cost rank | 2,076 / 133 / 1,029 | 2,076 / 133 / 1,029 (unchanged) |
| Matchup, 249 pairs (150 seeded random + 5 dual-form champs × 20) — `champion_stat_compare` | **2,183** | **0** |
| · `ability_cooldown_compare` | 1,908 | 1,908 (unchanged) |
| Pairs with **zero** eligible comparisons | **0** | **109** (108 involve aphelios/elise/jayce/nidalee/udyr; plus `reksai|shyvana`) |

Consistent with the reusable-state audit's post-dedupe figures (6,695 → 3,213; 880 of 14,878 pairs
lose all comparisons). The Ranked `mastery_slice` path goes through the same gate
(`mastery/synthesis/service.py` → `publication_gate.gate`), so it is affected identically.

## 8. Conclusion

**FACT**
* QCA8 removed MASTERY from exactly these two families and no others, in the same line that
  removed DAILY/RANKED, under one rationale written for six families.
* That rationale ("Practice is the only surface with a runtime consumer", QCA4's reason) concerns
  consumers that need a stored `question_id`. The Mastery gate consumes the **declaration**, not
  rows, and was live and serving these families. The premise is false for MASTERY.
* QCA8's commit, doc, contract notes and tests never mention Mastery; its impact analysis
  enumerated only Time Trial and Ranked `shared_bank`.
* GR1 shipped work explicitly built on both families in the 36 hours before QCA8.
* QCA1 (same series) listed Mastery as a consumer and recommended regenerate, not narrow.
* QCA9 saw the prior MASTERY declaration and chose only on Time Trial grounds.

**INFERENCE**
* The removal is collateral. The narrowing was a blanket mode reset applied to all six families.
  For four of them it was measured; for these two it was assumed harmless because they had zero
  rows. Row count was the wrong measure for the one consumer that never reads rows.
* Nothing indicates a product view that level-stat or base-stat comparisons are unsuitable for
  Mastery. The only prior product hold on `champion_stat_compare` (DC1 phase 7) is the
  two-option coin-flip problem **in Time Trial**.

**UNCERTAINTY**
* The author was not consulted. A deliberate but unrecorded view is possible, but no artifact
  supports it.
* The QCA8 test's exact-equality assertion does technically forbid MASTERY. It reads as a
  consequence of the blanket narrowing, not a separate decision.
* Counts are local DB (lags production). The mechanism is code, not data.

### Classification: **B — clearly unintended / collateral Mastery removal** (both families, same mechanism; not D)

**Confidence: high** that it was unintended. There is no positive evidence of intent. A false
premise was stated, and the series' own census contradicts it. Medium on "no one would endorse
it if asked", which is a separate owner question.

## 9. Narrowest correction concept (not implemented)

**Restore a consumer mode, nothing else:** `modes=(PRACTICE, MASTERY)` on `champion_stat_level`
and `champion_stat_compare`.

* **Do not** rematerialize rows. QCA8's zero-row guard and runtime composition stay intact. Mastery
  composes its own candidates from ChampionFacts and only asks the contract for eligibility.
* **Do not** restore DAILY or RANKED. They have no runtime consumer, `shared_bank` draws rows, and
  QCA4's reasoning genuinely holds there. **Do not** add TIME_TRIAL (QCA9's standing decision).
* **Do not** change `runtime_casual` or `champion_stat_authority`. No runtime caller asks for
  mode `mastery`, so Practice and Time Trial serving is unaffected.
* The same change must update `_QCA8_STAT`'s "MODES NARROWED TO PRACTICE" text and the QCA8/QCA9
  contract test's expected tuple. Add a Mastery-side test pinning both families as
  gate-eligible, so the next mode reset fails loudly instead of silently.
* An owner still decides whether Mastery should keep following `family_contract` modes or get its
  own eligibility declaration (reusable-state audit §13 Q1). The one-line restore is valid under
  the current design either way.
