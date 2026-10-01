# JP4 — Journey Reasoning & State Language

| | |
|---|---|
| Frontend branch / worktree | `jp4/journey-reasoning-language` at `mogsy/.worktrees/jp4-reasoning-language` |
| Starting SHA | `3295c51c` (JP3 screenshots + handoff; JP3 code `2f9c2827`) |
| JP4 code commit | `9ed7938b` — `feat(journey): JP4 Journey reasoning & state language` |
| Screenshots + this handoff | the commit after `9ed7938b` (docs only) |
| Backend branch / worktree | `jp4/journey-stat-mods-contract` at `League_Combat_Simulator/.worktrees/jp4-stat-mods-contract`, commit **`fc95e81e`** (base `origin/master` `1002230a`) — see its `JP4_STAT_MODS_CONTRACT_HANDOFF.md` |
| Production / Railway / Patch Ops / item maintenance | **Untouched.** Nothing pushed, integrated, deployed or triggered. |
| Status | Local commits only. Awaiting owner screenshot review. |

## 1. Objective

JP2 fixed the stage and JP3 gave it a visual language. JP4 changes how the content **composes inside** the fixed regions: the question fits its box, the board becomes the learner's notebook with mirrored halves, the state shows where numbers come from, and every reveal is a real, readable Reasoning Chain. The board, question, answer and reveal regions do not move (§8).

## 2. Owner locks applied

| Lock | Where |
|---|---|
| Fixed question box, adaptive type (~18–30px desktop, ~17–23px phone), centred, balanced | `JourneyQuestionText.useFittedQuestion`, `index.css` JP4 §1 |
| Journey **Path** (header progress) ≠ **Reasoning Chain** (a reveal's causal working) | `JourneyStateBoard.JourneyPath` (`journey-path*`), `lib/journey/reasoning.ts` + `JourneyReasoning.tsx` |
| One fixed Reasoning Node; strong `+ − = →` | `JourneyReasoningNode`, `index.css` JP4 §6 |
| Stat mnemonic map (owner-locked items), never read as inventory | `lib/journey/statIcons.ts`, `JourneyIcons.StatMnemonicIcon` (round) vs `ItemIcon` (square) |
| Stat shards are real scenario state, from the authority | backend `stat_mods` → `j3.ts` → `JourneySide.shards` → `ShardPage` |
| Mirrored fixed halves; state never widens a half | `lib/journey/anchors.ts`, `SidePanel`, `index.css` JP4 §3 |
| Current state vs learned knowledge: never reprint a learned value | `anchors.ts` faces `value / asked / revealed / learned / recall` |
| Teach the `!` once | `useKnowledgeCoach.ts`, State sheet legend |
| `? → value → settled !` | anchor faces `asked → revealed → learned` |
| Hide irrelevant zero modifiers | `anchors.ts` (a `0` that is not focused/changed is not board state) |
| Bonus AD provenance | backend `stat_sources` → anchor sources + breakdown card + State sheet |
| Step 2 "Rank 1", "70% of 21" | `rawReasoning`, `JourneyQuestionText.bindRank` |
| Armor formula `100 / (100 + Armor)`; primary whole, exact apart | `combatReasoning`, `isArmorFormula`, `ExactWorking` |
| Precision: "rounded for display", never "rounded up" | `reasoning.ts`, `JourneyStateAnchor.SourcesCard` |
| One scene: shared Rift under both arts | `JourneyStateBoard` `BOARD_SCENE` (ENVVIS1 `lane.png` via `resolveEnvironmentSceneArt`) |
| Host owns Player Columns | `QuizRankedMatch` (`journeyRails … && !host`), `index.css` JP3 §1 recede keyed on the crest |
| Curriculum / scenario / recipe / calculations unchanged | no curriculum, recipe or calculation file touched in either repo |

## 3. Data audit (before editing) and the backend contract

1. **Shards did not reach the frontend.** Scenario profiles own them (`zed.mid.v1` `[5008, 5008, 5001]`, `ahri.mid.v1` `[5005, 5008, 5001]`), but `journey.public_state()` published only identity, kit, inventory and the premise stats. Owner decision: backend authority wins — Zed's third shard is **Health Scaling (5001)**, not flat Health.
2. **Bonus-AD sources did not exist** anywhere in public (or even derived per source server-side). Back-calculating `20.8 − 10` in the frontend would have been fabrication.
3. **Armor formula: no blocker.** `combat_working.v1` serves raw, armor, effective armor, multiplier, final, penetration. The frontend draws `100 / (100 + E)` only after checking that the served multiplier equals it to the server's 4-place rounding (`isArmorFormula`); otherwise it shows the served multiplier as served.

Owner chose Option B. **Backend `fc95e81e`** adds two optional side keys (full detail in the backend handoff):

* `stat_mods` — the page, row order, authority ids/names; **part of `state_key`**; emitted for any side with a page.
* `stat_sources.bonus_attack_damage` — per-item canonical AD + per-shard share via the existing Adaptive Force rule; **fail-closed** (omitted unless the parts reproduce the served value at binding precision); **not** part of `state_key`.

Measured blast radius (same DB, pristine vs branch): 31 Daily compositions keep every composition key, bundle, private block, step and `state_key`; 24 Daily public blocks gain `stat_sources` (items only). The reference Journey's `state_key` changes (its shard page is state). Backend differential regression: branch failure set = pristine failure set.

**Deployment order:** the production frontend's J3 reader is a strict allowlist (proved: JP3 code fails 23 stage tests on the new fixtures). **Deploy this frontend first, then the backend.**

Other audit answers: item art — `MasteryAssets.itemIconUrl(id)` (all 14 mnemonic items exist in the backend asset store); board footprint — the growing stats/readout chip row; permanent pills — `AbilityReadoutChip` and filled withheld `StatChip`s; K2 anchors — `player:zed:E`, `opponent:ahri`; question seam — the surface's prompt `h2` (new optional `promptNode`); reveal seam — `JourneyReveal`; scene — ENVVIS1 `lane.png`; Player Columns — `journeyRailsFor` and the JP3 recede CSS applied to **every** host, Daily included.

## 4. Files

Frontend (`9ed7938b`):

* **New** — `lib/journey/statIcons.ts` (mnemonics, shard art), `lib/journey/anchors.ts` (board anchor rules), `lib/journey/reasoning.ts` (chain builders), `components/journey/JourneyIcons.tsx`, `JourneyStateAnchor.tsx`, `JourneyReasoning.tsx`, `JourneyQuestionText.tsx`, `useKnowledgeCoach.ts`; tests `lib/journey/jp4.contract.test.ts`, `ranked-core/modules/masterySliceModule.jp4.test.tsx`; assets `public/assets/journey/mogzy-stat-shards/*.png` (the owner's 7 files, byte-identical, moved from the accidental nested `mogzy_stat_shards/mogzy_stat_shards/` path — the original copies in the main checkout were left in place).
* **Changed** — `lib/journey/j3.ts` (optional `stat_mods`/`stat_sources`, strict shapes, cross-checks), `contract.ts` (`JourneyShard`, `JourneyStatSource`), `adapter.ts`, `knowledge.ts` ("Rank 1"), `components/journey/JourneyStateBoard.tsx`, `JourneyStageQuestion.tsx`, `JourneyStateSheet.tsx`, `JourneyCalcFlow.tsx` (reduced to `displayExplanation`), `JourneyKnowledgeMark.tsx` (docs), `question-surface/InteractiveScenarioSurface.tsx` (optional `promptNode`), `pages/quiz-ranked/QuizRankedMatch.tsx` (host gate), `pages/dev/journey-arena/JourneyArenaHarness.tsx` (host modes; one-line chrome), `index.css` (JP4 section; JP3 recede scoped; micro-chain → path), JREF fixtures + `CAPTURE.md` (re-captured on `fc95e81e`), and the JP2/JP3/K2/JOURNEY5 tests whose locks JP4 intentionally supersedes (§10).

Backend (`fc95e81e`): `mastery/runes/stat_mods.py`, `mastery/setup_state/derive.py`, `mastery/setup_state/journey.py`, tests `test_jref1…`, `test_journey2_core.py`, `test_jchain1…`, `JP4_STAT_MODS_CONTRACT_HANDOFF.md`.

## 5. Icon vocabulary

* **Stat mnemonics** (owner-locked, by canonical item id): Armor 1029 Cloth Armor · Health 1028 Ruby Crystal · AD/Bonus AD 1036 Long Sword · AP 1052 Amplifying Tome · MR 1033 Null-Magic Mantle · Move Speed 1001 Boots · Attack Speed 1042 Dagger · Crit 1018 Cloak of Agility · Mana 1027 Sapphire Crystal · Mana Regen 1004 Faerie Charm · Health Regen 1006 Rejuvenation Bead · Ability Haste 2022 Glowing Mote · Lethality 2020 The Brutalizer · Magic Pen 3020 Sorcerer's Shoes. Percent armor pen has no mapped item (words only). Drawn as a **round gold-ringed badge**; real items are **square tiles** — they never share a shape, and a mnemonic never sits in an item slot.
* **Shards**: served id → owner art (`5008 adaptive_force`, `5005 attack_speed`, `5007 ability_haste`, `5010 move_speed`, `5001 scaling_health`, `5011 flat_health`, `5013 tenacity`); names always from the payload.
* **Standard sizes**: `inline` (1.15em, question text, cards), `anchor` (chip height − 4px), `source` (62% of chip), `node` (18px, a node's corner), `board` (shard column).
* **Question icons** by rule per kind (max 3, first occurrence, `aria-hidden`, the words unchanged): Combat — the ability + the target champion; stat recall — the champion + the stat's mnemonic; formula — the ability; other — the champions named.

## 6. Board / state grammar

* **Halves**: `id` (shard column · portrait · name/level/role) · `kit` · `items` · ONE `anchors` row, the same rows on both halves at every step (tested over every reference snapshot). The shard column is drawn on both halves whenever either has a page; on a phone it rides the portrait's outer edge.
* **Anchors** (`anchors.ts`, at most 2, chosen by importance, drawn in reading order): `value` (an input: "Bonus AD 21" + sources; a transition's `52 → 92` delta kept all child long), `asked` (`?`), `revealed` (the value at its reveal, with `!`, glows once), `learned` (relied on, learned earlier: icon + `!` only), `recall` (relied on, not learned here: "recall · step N"). Zero modifiers not asked about are hidden (State sheet keeps them). A raw damage learned earlier is not an anchor at all — Zed E's own `!` carries it.
* **Notebook**: after Step 2, 85 is never board text again (Zed E `!` → "Raw damage 85 · learned Step 2"); after Step 3's reveal, 24 lives on Ahri's Armor anchor `!` ("Armor 24 · learned Step 3"). Wrong and timed-out answers establish identically (K2 is correctness-free; tested on all three paths).
* **Coach**: the first freshly learned `!` (Step 1's reveal in a real run) shows "Learned facts live on the board. Hover or tap to recall." for 5.2s or until tapped, pulses the new `!`, and never returns in that browser (per-viewer `localStorage`, with a per-load fallback; a reload mid-Journey shows none). The State sheet has a permanent `! Learned knowledge` legend.
* **Scene**: lane art (darkened) under the whole board → each champion's art from its own edge → a softer reading grade → UI.

## 7. Question typography and math presentation

* **Question**: the prompt region keeps its JP2 height; `useFittedQuestion` picks, before paint, the largest size in `[--jq-q-min, --jq-q-max]` (half-pixel steps) whose real content extent (margins included) fits; re-fits on width change and when web fonts land. Centred, `text-wrap: balance`, "Rank N" never splits from its ability. Certified sizes: phones 19.5–23px, 768 19–26px, desktop 20–30px.
* **Step 2** — subject "[E] Shadow Slash — Rank 1"; `[70 · Base damage] + [70% of 21 = 15 · Bonus AD damage] = [85 · Raw damage]`. The 15 is the served raw minus the served flat (no multiplication); exact: "Exact bonus AD: 20.8 · 70% of 20.8 = 14.56 · 70 + 14.56 = 84.56 · Shown as 85 · rounded for display".
* **Step 3** — `[Ahri · Lv 2] → [Armor · 24]`; exact "24.024 · Shown as 24".
* **Step 4** — `[85 · Raw damage] → [24 · Ahri armor] → [100 / (100 + 24) ≈ 0.806 · Damage taken] → [68 · Final damage]`, arrows (not `×`/`=`: 85 × 0.806 = 68.5 would not read as 68). Exact: "84.56 · 24.024 · 100 ÷ (100 + 24.024) = 0.8063 · 84.56 × 0.8063 ≈ 68.1804 · Shown as 68".
* A Daily Combat child that states its formula shows it on the verdict line ("Aegis Assault — Rank 1 · 55 + 100% total AD (81) + 150% bonus AD (10)"); penetration adds `− [pen] = [effective]` nodes. Node width follows the reveal box's own width (a container query), height the viewport's reserve; 5+ nodes use the dense tier. Comparisons, cooldowns and other children keep their served explanation (no fabricated chain).

## 8. Certification

**Geometry probe** (headless Edge, every snapshot of reference correct / wrong / timeout + Daily M1 Pantheon, Volibear, Ahri Survival, at 375, 390, 768, 1024, 1280, 1440, 1920): **0 violations, 0 page errors** — no anchor outside its half, no board clipping, no prompt overflow, no reveal overflow (x or y), uniform node sizes, no node text clipping, no tablet overflow, no document x-overflow. One value per region per width:

| Viewport | Board y / h | Question y / h | Prompt | Answers | vs JP3 |
|---|---|---|---|---|---|
| 375×812, 390×844 | 139 / 200 | 347 / 432 | 347 | 495 | identical sizes; −20px absolute (harness chrome, below) |
| 768×1024 | 155 / 240 | 403 / 348 | 403 | 507 | identical |
| 1024×768 | 127 / 214 | 349 / 324 | 349 | 493 | identical |
| 1280×800 | 127 / 302 | 437 / 268 | 437 | 545 | identical |
| 1440×900 | 133 / 390 | 531 / 268 | 531 | 643 | identical |
| 1920×1080 | 145 / 558 | 711 / 268 | 711 | 823 | identical |

Known and unchanged: the Survival final reveal's 10px header shift (JP3 §8). The dev harness's chrome line is now one truncating line (its label used to wrap differently per snapshot, which moved the stage 20px on phones for one Volibear snapshot); on phones that puts the whole harness stage 20px higher than JP3's captures — dev chrome only; every region's size and spacing is identical.

**Daily** — host-owned columns certified in the harness (Daily host: role mascots, JUNGLE/TOP, points; no crest, no recede) and in `QuizRankedMatch.hosted.test.tsx` (a hosted Journey keeps the role mascots). Daily Standard (Pantheon, Volibear) and Survival (Ahri) draw the same stage grammar; Daily sides carry no shard page (none published).

**Ordinary Ranked** — `/dev/ranked-shell-probe` (text, media, Mastery recall, Mastery stat, long question) at 1280×800 and 390×844, JP3 vs JP4: **0 pixels** differ by more than 24/255 except a 36×36px floating dock button whose pulse is not frame-aligned.

## 9. Screenshots

`docs/handoffs/jp4-reasoning-language/`, headless Edge from the committed `9ed7938b` (clean tree, fresh dev server), through `/dev/journey-arena`, page clock frozen at the shot. Reveal shots arrive by the harness's ▶ (so the glow is real); the coach appears only at Step 1's reveal, as in a real run.

| # | File |
|---|---|
| 1–8 | `jp4-final-desktop-step{1..4}-{live,reveal}.jpg` (1280×800) |
| 9–11 | `jp4-final-desktop1440-step2-reveal`, `-step4-live`, `-step4-reveal` (1440×900) |
| 12–17 | `jp4-final-mobile-step{2,3,4}-{live,reveal}.jpg` (390×844) |
| 18–19 | `jp4-final-daily-pantheon-desktop` / `-mobile` (Daily Standard host, Step 5 reveal) |

## 10. Tests

* **New**: `jp4.contract.test.ts` (12 — reader strictness/optionality, shard/mnemonic vocabulary + art on disk, chain builders, armor-formula check, no second engine); `masterySliceModule.jp4.test.tsx` (22 — shards from authority, mirror invariants over every snapshot, zero modifiers, mnemonic ≠ inventory, sources + breakdown, notebook never reprints, coach once / dismiss / reload, question icons, adaptive sizing, node geometry, operators, host ownership, ordinary surface untouched).
* **Updated (JP4 supersedes the lock)**: `stageGrammar` (Steps 2–4 + K2 timelines), `visualLanguage` (notebook, glow faces, Journey Path, precision), `journey`, `journey5`, `knowledge` ("Rank 1", faces), `JourneyModuleStage` (anchor row), `QuizRankedMatch.hosted` (host keeps mascots). Popover-heavy files take the repo's 25s budget (jsdom popovers are slow on this machine; JP3's own run of the same tests takes 8s each).
* **Broad frontend** (journey, ranked-core, ranked-arena, quiz-ranked, daily, question-surface, mastery, ranked-public, dev, quiz-broadcast — 4,308 tests): JP4 failures ⊂ JP3 failures; the 12 shared are pre-existing and unrelated (source-scan/dev-page suites). JP4 also clears JP3's CRLF motif test and the stageGrammar timeout.
* `tsc -p tsconfig.app.json`: the same 2 pre-existing Supabase errors. ESLint on changed files: 0 errors (fast-refresh warnings, the existing pattern). `npm run build`: passes (regenerated `sitemap.xml` reverted).
* **Backend**: see its handoff (10 new tests; differential regression equal to pristine).

## 11. Known follow-ups

1. **Deploy order**: frontend (tolerant reader) before backend `fc95e81e`.
2. Bot opponent pacing is nondeterministic run to run, so every re-capture differs in bot-driven fields (recorded in `jref/CAPTURE.md`).
3. Long names still truncate on phone rows ("PA…", "LE…") — pre-existing, unchanged.
4. `stat_sources` is narrow (bonus AD). Next candidates: total AD, AP, armor from items (same helper pattern, same fail-closed rule).
5. Optional icon candidates (not added — they would decorate, not identify, today): item icons in a Daily purchase beat line; the ability icon in a cooldown reveal's explanation; champion portraits in comparison answer tablets (the answer region is JP3-locked).
6. JR1 (Journey-aware results) should decide whether review/results adopt the Reasoning Chain and precision policy (`JourneyCombatWorking` still prints exact decimals in match review).
7. Survival header 10px completion shift (pre-existing).

## 12. Next task

1. Owner review of `docs/handoffs/jp4-reasoning-language/jp4-final-*`. Live replay: run this branch's dev server and open `/dev/journey-arena?capture=jref-zed-ahri` (also `-wrong`, `-timeout`; Daily `m1-pantheon`, `m1-voli`, `m1-ahri-survival`; `?host=ranked|daily` overrides the host).
2. On approval: integrate the frontend onto the then-current `origin/main` and deploy it; then integrate and deploy backend `fc95e81e`.
3. Then **JR1 — Journey-aware results**.
