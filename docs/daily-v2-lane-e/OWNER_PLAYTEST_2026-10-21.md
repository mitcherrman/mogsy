# Daily three acts (V2) — owner playtest (lane E, 2026-10-21)

**Local only.** V2 stays off publicly. Nothing was pushed, merged, deployed or
imported. The playtest runs:
* the backend worktree `daily-v2/e-integration` @ `aa7b5113`;
* the frontend worktree `daily-v2/e-integration` @ `162ef8ed`;
* a COPY of the bank (canonical + the 27 takedown rows). The canonical file is
  never opened for writing.

## 1. Play it

**URL:** <http://localhost:8790/admin/creator-replay> → **Play a three-act take**

It is reachable only on this computer. Verified in a real browser (the Claude
app's browser pane): the admin page, a full take, Review and a second take.
From another device (a phone) it cannot be reached; see §5.

### Start the two servers

Both entries are already in `mogsy/.claude/launch.json` (the primary checkout,
git-excluded):
* `dv2-e-backend` → :8711;
* `dv2-e-frontend` → :8790.

In the Claude app, ask for them to be started. By hand, run each in its own
terminal.

Backend: the harness runs the backend worktree's app against the playtest
copy, with the flags below.

```bash
cd /c/Users/mlmit/OneDrive/Desktop/League_Combat_Simulator/.worktrees/daily-v2-e && E_DB='C:\Users\mlmit\AppData\Local\Temp\claude\C--Users-mlmit-OneDrive-Desktop-mogsy\070d3646-86fa-454f-9cd3-3c6105180ab9\scratchpad\playtest\lol_calc.db' python /c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/daily-v2-e/docs/daily-v2-lane-e/harness/server.py
```

Frontend: Vite with e2e auth, pointed at the local backend. The `--require`
hook works around Windows Application Control blocking rollup's native module.

```bash
cd /c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/daily-v2-e && VITE_E2E_AUTH=1 VITE_COMBAT_API_URL=http://127.0.0.1:8711 NODE_OPTIONS="--require C:/Users/mlmit/AppData/Local/Temp/claude/C--Users-mlmit-OneDrive-Desktop-mogsy/070d3646-86fa-454f-9cd3-3c6105180ab9/scratchpad/hook.cjs" node node_modules/vite/bin/vite.js --port 8790 --strictPort --host 127.0.0.1
```

### Sign in (local test owner; no Supabase, no password)

Each backend start writes a fresh 12-hour test token to
`docs/daily-v2-lane-e/harness/persona.json`. That file is untracked; never
commit it.

1. Open <http://localhost:8790/> and the browser's developer console.
2. Run `localStorage.setItem('mogsy_e2e_identity', JSON.stringify(<paste persona.json here>))`.
3. Open <http://localhost:8790/admin/creator-replay>.

Repeat after every backend restart: the signing secret is new each time.

### Configuration in force

| setting | value |
|---|---|
| `DAILY_THREE_ACTS_V2` | `owner` (V2 is reachable only from the owner route) |
| `DAILY_THREE_ACTS_CERT_SCOPE` | `serveable` (owner gate 9: owner playtest only) |
| `DAILY_THREE_ACTS_CONFIG` | unset → lane E's launch config: caps 1/act 2/day; daily minion-XP, wave/laning and Order Forge level-1 quotas |
| `RANKED_PUBLIC_ENABLED`, `RANKED_FORMATS_ENABLED`, `RANKED_SHARED_BANK_ENABLED`, `RANKED_MODULE_ITEM_COST_DUEL_ENABLED`, `RANKED_MASTERY_SLICES_ENABLED`, `RANKED_BOT_ENABLED` | `1` |
| `SUPABASE_*` | removed; HS256 test token, `require_admin` overridden to the local test owner |
| frontend | `VITE_E2E_AUTH=1`, `VITE_COMBAT_API_URL=http://127.0.0.1:8711` |
| database | the playtest copy (`scratchpad/playtest/lol_calc.db`, canonical + takedown). App startup also imports the 42 VISION42 rows into it, as it does on every deployment |

## 2. Repeat takes and reset

**Another take:** press **Play a three-act take** again.
* Each press creates a separate owner run with policy
  `creator:three_acts:<nonce>`.
* The official Daily, its history, streaks, ratings and analytics never see it.
  Verified after two takes: 0 official runs for the test owner, 0 rating rows;
  every child match is `creator_replay` with `rating_eligible: false`.
* Every take on the same UTC day replays the **same** 19-segment day: takes do
  not avoid earlier takes.

**Continue after the main stage:** "Play More Challenges" → the take's own
Survival → Time Trial → Review. Before the fix in §4 (D3) this led to the
public catalog.

**Reset everything:** stop the backend and replace the copy. Never point
`E_DB` at the canonical file.

```bash
python -c "import sqlite3; s=sqlite3.connect(r'C:\Users\mlmit\AppData\Local\Temp\claude\C--Users-mlmit-OneDrive-Desktop-mogsy\070d3646-86fa-454f-9cd3-3c6105180ab9\scratchpad\devdb\lol_calc.db'); d=sqlite3.connect(r'C:\Users\mlmit\AppData\Local\Temp\claude\C--Users-mlmit-OneDrive-Desktop-mogsy\070d3646-86fa-454f-9cd3-3c6105180ab9\scratchpad\playtest\lol_calc.db'); s.backup(d)"
```

## 3. What was played (two full takes, 2026-10-22 UTC day)

### Take 1 — desktop, 1280×720

Wrong answers and timeouts were partly deliberate.
* Result: **12/21 correct, 9 missed, Daily score 31**.
* Server: 21 per-answer results (12 correct, 8 timeouts, 1 incorrect).

| # | set · band · clock | interaction | content | seen |
|---|---|---|---|---|
| 1 | Early 1 · E · 18 s | quiz, **3 options** | minion XP — exact minion, duo L2 (Act 1) | renders as three stacked tablets; timed out |
| 2 | Early 1 · M · 33 s | **Order Forge v2**, 4 cards | level-1 Health (Tryndamere, Renekton, Teemo, Annie) | real champion portraits; arrows (mouse) → "Exactly right" +2 |
| 3 | Early 1 · H · 48 s | quiz | combat cooldown (Tryndamere E + Sundered Sky) | answered wrong → "Incorrect +0" |
| 4 | Early 2 · E | quiz | ability cost, rank 1 | timed out |
| 5 | Early 2 · M | quiz, **2 options** (runtime) | level-1 armor: Soraka vs Swain | matchup card with both splashes; correct +2 |
| 6 | Early 2 · H | quiz | **wave/laning**: minion pushing bonus (Act 1) | correct +3 |
| 7–9 | Meta Reflex · 3 × 6 s | item_cost_duel v5 | IE vs Doran's Ring; Zac vs Akshan (L18 HP); Horizon Focus vs Blighting Jewel (AP) | 1/3 (two timeouts); breakdown lists the right answer **and both values**: 3500 vs 400, 2538 vs 2429, 75 vs 25 |
| 10 | Mid 1 · E | quiz | **middle-rank** cooldown, rank 3 | timed out |
| 11 | Mid 1 · M | quiz | item recipe | timed out |
| 12 | Mid 1 · H | quiz | **takedown** assist split, L12 victim | correct |
| 13 | Mid 2 · E | quiz | **middle-rank** cost, rank 4 | correct |
| 14 | Mid 2 · M | quiz, **2 options** | ultimate cooldown comparison | correct |
| 15 | Mid 2 · H | quiz | jungle item vs Baron | correct |
| 16 | Late 1 · E | quiz | item exact stat | correct |
| 17 | Late 1 · M | quiz | item recipe | correct |
| 18 | Late 1 · H | quiz | combat cooldown (3 items) | let it time out |
| 19 | Late 2 · E | quiz | item cost | timed out |
| 20 | Late 2 · M | quiz | item built from components | correct |
| 21 | Late 2 · H | quiz | super-minion wave composition | correct |

### Take 2 — phone widths

* **390×844:** take start, three-option question, Order Forge.
  * Order Forge: **mouse drag** on the handle reorders (it lands one slot off
    when dropped between rows); arrow buttons; "Lock in this order" → +2.
* **360×740:** reload mid-round **resumed** at 3/19 with the same question.
* **320×640:** the four answer tablets sit at 388–600 px, inside the
  viewport.
* At every width the page width equals the viewport (no horizontal scroll).
  Only a decorative background layer extends past the edge, clipped.
* Review on a clean run: re-asked the missed three-option minion-XP question
  (1/1, +2).

Touch: the pane delivers clicks as mouse events even at phone sizes, so real
finger touch is **not verified**. Drag uses the same handle; a phone check by
the owner is the remaining step.

Screenshots: `docs/daily-v2-lane-e/playtest-*.jpg`.

## 4. Defects and observations

| id | severity | what | status |
|---|---|---|---|
| D1 | **high** | **Quiz rounds run 5 s short.** The server keeps the 18/33/48 s duration, but the bot locks in instantly every round, which applies Ranked's opponent **pressure** (5 s). The answer windows become **13/28/43 s** (`pressure_applied: true`, deadline = start + duration − 5). Order Forge (pressure 0) keeps its full 33 s. | not changed. Proposed fix: `pressure_seconds=0` on V2 quiz segments (one line in `v2_recipe._segment_for`; owner decision, since V1 Daily has the same behaviour) |
| D2 | medium | Round 1 is first visible at 0:08–0:11 of its 13 s: the opening "Daily Challenge" splash overlaps the first question's clock | not changed |
| D3 | **high** | From a take's result, "Play More Challenges" (and a bonus stage's "More Challenges") opened the **public** catalog, whose "Start Today's Daily" would start an **official** run. The take's own Survival / Time Trial / Review were unreachable. This affected V1 creator replays too | **fixed** FE `162ef8ed` (creator page turns the catalog off; buttons continue in place) + test |
| D4 | low | Meta Reflex breakdown counts two timed-out cards as "Incorrect 2 · Unanswered 0" while their rows say "No answer" | not changed |
| D5 | low | Quiz answer tablets have no accessible name in the accessibility tree (screen readers hear "button") | pre-existing arena; not changed |
| D6 | low | At 360 px the "Combat calculation" badge overlaps the top of the champion name | not changed |
| D7 | observation | No act-boundary beat: the acts show only in the timeline groups (E1 E2 MR M1 M2 L1 L2) and the category heading | design question |
| D8 | observation | The take's result says "Today's Challenge · Daily score". It is an owner take and changes nothing official, but the wording does not say so | design question |
| D9 | observation | In a take, Time Trial ended after 4 questions ("The bank ran out") on this dev bank. The console logged `completion_reason "time_bank_exhausted"` (unknown to the FE adapter) and segment-transcript parse errors (`players.<id>.correct must be a number`). Survival / Time Trial are V1 stages | not V2; flag for the V1 owner |
| D10 | observation | Review re-asked 1 of 20 misses (V1 Review sizing rule) | not changed |
| D11 | — | In take 1, Review sat on its intro while its question expired. Caused by my hot-reload edits landing mid-flow; it did not reproduce on a clean take | not a product defect |
| — | info | Local console noise: `/api/stat-check/invites` → 503 (needs Supabase) | harmless locally |

## 5. The 21 answer interactions available today

| interaction | in the 19-segment day | verified in the browser |
|---|---|---|
| 4-option quiz | E/M/H slots | yes |
| 3-option quiz (minion XP exact minion) | Early E | yes (desktop + 390) |
| 2-option quiz (stored comparison; runtime level-1 stat compare) | Early/Mid M | yes |
| Order Forge v2 (level-1 / level-18 stats, range, move speed, item stats), 4 cards | M slots; at least one level-1 board per day | yes: mouse arrows, mouse drag, lock, reveal |
| Meta Reflex v5, 3 cards × 6 s | segment 7 (answers 7–9) | yes; values in the breakdown. The 1.5 s on-card reveal is too fast for pane screenshots |
| Takedown questions | Mid/Late H | yes (dev copy only; production needs the gate 8 import) |
| Vision | possible E slots | rows present; none drawn on this day |
| Summoner-spell Slice, Chronoscope, Match Grid, Reconstruct | not available | module/content gaps (pass 5 report §5) |

## 6. If the owner cannot use this computer: minimal private preview (needs approval)

1. Push both `daily-v2/e-integration` branches. Deploy them to a
   **non-production** backend and frontend (a Railway preview service plus a
   Lovable/Vite preview). Nothing goes to `main`/`master`.
2. Backend env:
   * `DAILY_THREE_ACTS_V2=owner` and `DAILY_THREE_ACTS_CERT_SCOPE=serveable`;
   * the six `RANKED_*` flags above;
   * that environment's own database copy (never production's).
3. Optional: the takedown rows. Re-verify the economy manifest for 26.20/26.21
   first (gate 8), then run the generator import against the preview database.
4. The owner signs in normally (real Supabase owner) and opens
   `/admin/creator-replay` → **Play a three-act take**.
5. Rollback: unset `DAILY_THREE_ACTS_V2`. The route returns 404 and nothing
   else changes.
