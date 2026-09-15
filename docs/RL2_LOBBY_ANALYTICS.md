# RL2 — Ranked Lobby: role queue context + Academy analytics

**State: APPROVED AND MERGED TO `main`.**
Branch `rl2/lobby-analytics`, based on `origin/main` `ac2f5745`. `main` had not
moved from that base at integration time, so **no rebase was required and there
were no conflicts**. No backend change was made, proposed-and-built, or
required to run what ships here.

Merged with the repo's `merge(main): …` non-fast-forward convention, the same
way the RL1 lobby redesign and the ES1 results screen were integrated.

Merging does not deploy. `mogzy.lol` updates only when the owner presses
Publish in Lovable; that was deliberately not touched by this pass.

---

## 1. Objective and approved decisions

**Centre parchment.** Two compact role-specific areas flanking the PLAY seal,
both re-reading on every role change: a Ranked record (wins / games / win rate)
on the LEFT, top-3 champion knowledge on the RIGHT, seal in the middle and
still dominant. No flavour copy.

**Right parchment.** An analytics carousel in the space RL1 reserved when it
removed the Academy portrait. Slide 1 (default) bar chart, accuracy by
category/module. Slide 2 donut, question distribution by category/module.
Compact Time / Mode / Role controls. Independent of the centre's role.
The Academy Rank / Personal Records block below it is untouched.

**Owner decisions carried into the build**

| Decision | Effect here |
|---|---|
| Do NOT raise the history fetch 20 → 50 | `Quiz.tsx:344` unchanged. The record is a **recent-form** figure and is labelled as one. |
| Never label a windowed record lifetime/total | The heading reads `Recent · <Role>`; "total", "lifetime", "all-time", "career" appear nowhere and are guarded by test. |
| Champion knowledge: production absent, demo in preview | `productionChampionKnowledge` returns `{state:"absent"}` unconditionally. |
| Do not parse `question_key` client-side | Guarded by test: the module may not `split(":")`, may not mention `primary_role`, may not embed a champion table. |
| Donut = distribution only, not correct-vs-incorrect | `DistributionSlice` carries `attempts` and no accuracy field at all, so a rate cannot reach an arc. |
| Time and Mode wired to real data; Role demo-only | See §4. |
| Reuse `recharts` / `ui/chart` | Both charts are `ChartContainer` + recharts, drawn in `LEAGUECRAFT_INK`. No new dependency. |
| Keep `RankedLobbyHero.tsx` from growing | It gained ~45 lines of wiring; all new UI is in the two new directories. |

---

## 2. Files

### New
| File | What it is |
|---|---|
| `src/lib/quiz/championKnowledge.ts` | The champion-knowledge **contract** — types, `topChampions`, `championIconPath`, and the production reader that returns absent. Holds no data. |
| `src/lib/quiz/championKnowledge.test.ts` | Production-is-absent, ranking by `correct`, and the no-client-parsing guard. |
| `src/components/quiz/lobby-queue-context/RoleQueueRecord.tsx` | Left flank: wins/games + win rate, `Recent ·` heading, em dash for a role with no rows. |
| `src/components/quiz/lobby-queue-context/RoleChampionKnowledge.tsx` | Right flank: three stacked champion medallions + names. |
| `src/components/quiz/lobby-queue-context/queueContext.test.tsx` | Both flanks, including absent vs empty. |
| `src/components/quiz/lobby-analytics/analyticsSlices.ts` | Pure derivation of both slides from one `TrendReport`. |
| `src/components/quiz/lobby-analytics/analyticsSlices.test.ts` | The honesty rules, without a chart. |
| `src/components/quiz/lobby-analytics/AccuracyBarChart.tsx` | Slide 1 — horizontal bars, fixed 0–100 axis. |
| `src/components/quiz/lobby-analytics/DistributionDonut.tsx` | Slide 2 — arcs are counts, total in the hole. |
| `src/components/quiz/lobby-analytics/LobbyAnalyticsFilters.tsx` | Time / Mode / Role pills. |
| `src/components/quiz/lobby-analytics/AcademyAnalyticsCarousel.tsx` | The carousel; mounts the shipped `usePerformanceTrends`. |
| `src/components/quiz/lobby-analytics/AcademyAnalyticsCarousel.test.tsx` | Slides, Time, Mode, the Role boundary, and the outage branch. |
| `src/pages/dev/lobby-preview/demoLobbyAnalytics.ts` | **Demo only.** Champion knowledge, an offline analytics source, an empty one, and the one role dimension in the product. |

### Modified
| File | Change |
|---|---|
| `src/components/quiz/RankedLobbyHero.tsx` | Three new optional props; the PLAY seal wrapped in a `play-row` with the two flanks; the reserved box now holds the carousel. |
| `src/components/quiz/RankedLobbyHero.test.tsx` | Two RL1 guards updated to the approved RL2 composition, one new guard added (see §6). |
| `src/components/quiz/LeaguecraftHub.tsx` | Pass-through of the three props only. |
| `src/pages/dev/lobby-preview/LobbyPreviewPage.tsx` | Supplies the demo sources; Timmy gets the populated ones, the newcomer the empty ones. |

A local `.claude/launch.json` was written in the worktree for the visual pass
and is **not** part of the commit — it is developer tooling, not RL2 source.

`src/pages/Quiz.tsx` is **not** modified. No file under `ranked-arena/`,
`quiz-ranked/` (match), `esports/` or any results surface is touched.

---

## 3. Real data path vs demo data path

| Surface | Production (`/quiz`) | Demo (`/dev/lobby-preview`) |
|---|---|---|
| Role record (wins/games/win rate) | **REAL.** `tallyRoleMastery(matchHistory)` over the account's own `GET /api/ranked/history` rows, already fetched by the lobby. | Frozen synthetic history, same derivation. |
| Champion knowledge | **ABSENT.** `productionChampionKnowledge` → `{state:"absent"}`. | `demoChampionKnowledge` — invented counts, canonical role filing. |
| Bar chart | **REAL.** `TrendReport.categories[]` / `modes[]` via `analyticsApi`. | `demoAnalyticsSource`, offline constants. |
| Donut | **REAL.** attempt counts from the same payload. | same. |
| Time filter | **REAL.** options from `capability.allowed_windows`; a change refetches. | Premium-shaped (7/30/90) for Timmy, Free-shaped (7 only) for the newcomer. |
| Mode filter | **REAL.** client-side over `modes[]`, which the server sends. | same. |
| Role filter | **INERT.** Rendered disabled; no narrowing of any kind is applied. | Operable — the only role dimension that exists anywhere. |

The demo module is imported by `LobbyPreviewPage.tsx` alone. The lobby's props
default to the production reader and the real API, so a production surface
would have to import the demo file by name to reach any of it.

---

## 4. Production absent-state behaviour

- **Champion knowledge** renders three empty medallions at full size and the
  line "Not tracked yet". `data-state="absent"`. This is deliberately distinct
  from `"empty"` ("No answers yet"), which means the account genuinely has no
  champion answers — a distinction production cannot currently reach.
- **Role record** with no rows for the selected role renders an em dash and
  "No recent games", never `0/0` or `0%`. Pre-R1 rows (`viewerRole: null`) are
  counted for no role and are not back-filled from the legacy class.
- **Role record while history is loading** renders the em dash, not a stale
  figure from the previous role.
- **Role filter** is disabled, with the full role name on `aria-label`/`title`.
- **A failed analytics request** renders "Analytics are unavailable." and is
  never drawn as an empty record or as a paywall — the same rule the workspace
  Trends pane holds, inherited by mounting the same hook.

---

## 5. Deviations from the brief, and why

1. **The Mode control chooses a dimension; it does not narrow the categories.**
   The payload carries per-category figures and per-mode figures and **no
   cross-tab between them**, so "my Item accuracy in Daily" is not a fact the
   server sends. Rather than fabricate it: *All modes* → the bars and arcs are
   CATEGORIES; a single mode → they are MODES, with the chosen one marked in
   the accent ink. Every figure drawn either way is one the server sent. The
   cross-tab is listed as a backend contract in §8.
2. **The champion medallions are stacked, not a row of three.** The centre
   sheet's writing area is 295px and the wax seal takes 144, leaving ~68 per
   flank; three 36px medallions measured 120 and ran 52px off the parchment.
   Stacking fits at every width and keeps the champion NAME beside each
   portrait, which the row could not.
3. **Role pills are abbreviated** (`Jng`, `Sup`) with the full word on
   `aria-label`/`title`. Six full words wrapped the group onto a second line,
   and in a fixed 280px box the chart pays for every wrapped line.
4. **The newcomer preview profile was given an empty analytics source.** It
   was otherwise showing "Questions answered 0" under a chart of 257 answers.

---

## 6. Tests

Run serially (`--no-file-parallelism`; parallel vitest runs on this repo
fabricate failures).

New: `analyticsSlices.test.ts` (10), `championKnowledge.test.ts` (7),
`queueContext.test.tsx` (8), `AcademyAnalyticsCarousel.test.tsx` (8).

Changed in `RankedLobbyHero.test.tsx`:
- *"reads role stage → PLAY seal … with nothing between them"* → *"… → PLAY
  ROW …"*. The adjacency rule is kept and widened: the stage's next sibling is
  the row, and the seal is inside it. The queue context sits BESIDE the seal,
  never between the stage and the seal.
- *"draws no Academy portrait, and no replacement visual in its place"* →
  *"… and gives the space to the analytics carousel"*. RL1 left that box
  "awaiting a decision"; RL2 is the decision. The portrait stays gone.
- **Added** *"flanks the seal with the role record and champion knowledge, in
  that order"*.
- The `hero-portrait-space` height guard (210/248/280) is **unchanged and
  passing** — the reserved heights stay on the same element.
- The MALT *"states the scope in the LABELS, never as a 'last N matches'
  footnote"* guard is **unchanged and passing**: a first draft of the record
  printed `roleRecordScopeLabel` under the figure and was removed.

**Result:** 240 tests over 10 focused files, 238 pass. The 2 failures are
**identical to clean `origin/main`** (verified in a detached baseline worktree):
`Quiz.rankedRole.test.tsx` "commits NOTHING for Practice after a role change",
and `LobbyPreviewPage.test.tsx` "is imported by the preview page ALONE"
(`src/test/security/pt14EntitlementSources.test.ts` references
`lobbyPreviewFixtures`, on main too). Zero new failures.

Typecheck: no error in any new or modified file (`tsc -p tsconfig.app.json`;
the repo's pre-existing baseline errors are unrelated and unchanged).

---

## 7. Visual verification (`/dev/lobby-preview`, local vite on :5231)

- **1440×900 desktop** — the three parchments render at the same 732px height
  as before; the reserved box measures exactly 280px with zero internal
  overflow, so the Academy column did not re-flow.
- **Centre** — `Recent · MID | 6/7 | 86% win rate` ‖ PLAY ‖ `MID BEST | Ahri
  Akali Annie`. Measured: sheet 295px, record 68px, seal 144px, knowledge 68px,
  right edge 860 = sheet edge. No overflow.
- **Role rotation** — stepping the carousel through all five roles rotates
  both flanks together with the left ledger: mid 6/7 → adc 1/2 → support 1/3 →
  top 2/4 → jungle 1/4, champions Ahri/Akali/Annie → Ashe/Jhin/Ezreal →
  Braum/Janna/Blitzcrank → Darius/Aatrox/Camille → Ekko/Elise/Amumu.
- **Independence** — rotating the centre role leaves the Academy bars
  byte-identical (78/71/65/58/52/43 before and after).
- **Carousel** — bars ⇄ donut wraps in both directions; donut draws 6 arcs
  (5 + a folded "Other") with 257 in the hole; Time 7d → 30d refetched and the
  total moved 257 → 1102; Mode `ranked` switched the caption to "Accuracy by
  mode" and marked the Ranked bar in accent; the demo Role control tilted the
  series and is `disabled` without the demo dimension.
- **390×844 mobile** — `document.scrollWidth - clientWidth = 0` (no horizontal
  overflow). The play row wraps to seal-first, then the two flanks side by
  side, so the seal is never below its own context. The box is 210px and both
  slides remain legible.
- **Defect found and fixed during verification:** at 210px recharts silently
  thinned the category axis to 3 of 6 ticks while all six value labels stayed
  — six anonymous bars with percentages on them. `interval={0}` on the `YAxis`
  now forces every row to keep its name.
- **Newcomer profile** — centre em dash + "No recent games", three empty
  medallions + "No answers yet", carousel "No answers in this window yet.",
  and a single `7d` Time pill (the Free shape).

---

## 8. Backend contracts still needed

Nothing below was built, and none of it blocks what ships here.

1. **Champion-level knowledge aggregate.** Per-champion correct/attempt totals
   for the calling account. `quiz_attempts` has no champion column,
   `quiz_questions` has none, and `question_id` is NULL for composed
   questions; the champion survives only inside `question_key`
   (`champion_attack_type:v1:<x>:<Champion>`, `quiz/family_contract.py`) at a
   position that differs per family. Server-side, from the family contract's
   own key templates. Suggested shape:
   `GET /api/quiz/analytics/champions?limit=3&role=<role>` →
   `{ ok, tier, window_days, champions: [{ champion, correct, attempts }] }`.
   Wiring point: the body of `productionChampionKnowledge`. Nothing else moves.
2. **Champion → role eligibility, served.** The authority exists
   (`ranked_public/data/champion_primary_roles.csv`, 173 rows, one primary role
   each, read by `ranked_public/champion_roles.py`) but no route exposes it, and
   it is deliberately NOT duplicated into the client. Either fold the
   restriction into contract 1 server-side (preferred — the client then never
   holds the table) or expose the map.
   Note the vocabulary boundary: the authority spells the bot lane `Bot`, the
   queue/wire spelling is `adc`.
3. **A role dimension on quiz analytics**, if the Role filter is ever to be
   real. No attempt records the role the reader held, and
   `routes/analytics.py` accepts `window` only. Until then the control stays
   disabled and narrows nothing.
4. **Per-mode category breakdown** (the cross-tab in §5.1), if Mode should
   narrow the category bars rather than switch dimension.
5. **A lifetime per-role Ranked aggregate**, if the record is ever to be a
   career figure. `HISTORY_MAX_LIMIT = 50` with no offset means no client can
   derive one — raising the cap does not fix it, a server-side aggregate does.

---

## 9. Next task

Review the visual pass and the §5 deviations. If the composition is accepted,
the open decisions are: approve contracts 1 + 2 (which is what turns champion
knowledge from absent into real), and decide whether the Role control should
ship disabled or be withheld until contract 3 exists.
