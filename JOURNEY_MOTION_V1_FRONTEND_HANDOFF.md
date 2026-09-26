# JOURNEY-MOTION-V1 — Frontend handoff (state-beat motion)

**Branch:** `jm1/motion-frontend`, based on `94e4ae74` (JP1 presentation + K2 knowledge marks). Commits are local only and have not been pushed.

| | SHA |
|---|---|
| Frontend implementation + tests + m1 captures | `c1b88ca6` |
| This handoff | the tip of `jm1/motion-frontend` (see the final report) |
| Backend (`League_Combat_Simulator`, `jm1/motion-backend`) | `176a0630` implementation, `92951659` handoff |

## 1. Beat policy (server-owned)

| | Old | New |
|---|---|---|
| One transition before a child | 1500 (level), 2000 (purchase), 2500 (first back) | **900 ms** |
| Several before one child | **summed**, e.g. level + Cloth Armor = 3500 ms, level + Long Sword = 4000 ms | **1300 ms**, one grouped beat |
| Reveal fields during a beat | `own_revealing_card_index` / `own_reveal_until` named the previous child **until the next child opened**. The client kept the reveal on screen, which masked the beat. | The reveal is reported only for its own 1750 ms window. During the beat both fields are `null`. |

The client **never** decides a beat's length. `useJourneyBeat` still compares server time with `beat.until` (= `own_card_started_at`), and the question stays mounted, `inert` and veiled until then. `beat.ms` (the sum of the transitions' shares) is only a pacing hint, and it equals the frozen `open_delays_ms[child]`.

## 2. What the player sees now

**Before:** a 0.88-opacity dark scrim over the whole board, a large stamp, and staged uppercase text lines. For 2.5–4 s the board looked like a transition screen.

**Now:** no scrim. The board stays fully readable and **the objects that changed animate in place**. Everything uses transform, opacity, shadow or filter, so nothing lays out, and every final value is on screen from the first frame.

| Change | Object | Motion | Time |
|---|---|---|---|
| Level | `LevelBadge` | The new number rolls up into place beside the struck-through old one (`Lv 4 6`), plus one green pulse | 360 ms |
| Ability rank | `AbilityRankPips` | Contracts with a max rank: the **new** pip(s) fill. J3 (no max rank): the **rank digit** pops. One pulse on the icon. Other abilities are untouched. | 380 ms (+120) |
| Ultimate unlock | R tile | The lock it wore lifts off and fades (a ghost `Lock`, shown only while animating), and the icon goes grayscale → bright flash → active | 700 ms |
| Item acquired | That inventory slot only | The item pops into its slot, plus one ring pulse | 420 ms (+100) |
| Item stat line | Tag anchored to that slot | `+10 AH · +20 AD` / `+15 Armor` fades in. It sits in the empty stats line above the items on a phone, or the empty stats row below them on the band. It is absolutely positioned and opens inward. | 220 ms (+220) |
| Stamp | Board header, in place of the node label | `First back`, `Lv 6 · R unlocked`, `Lv 4 · First back`, `Purchase`, `Rank up` | 180 ms |

- **Every motion ends by about 800 ms**, so it lands inside the 900 ms beat. A test enforces `delay + duration ≤ 900` for every beat animation.
- **Status text is kept for assistive tech.** The `journey-beat` region (`role=status`, `aria-live=polite`) is now `sr-only` and still carries the full stamp words and every event line ("Lee Sin · +15 Armor (Cloth Armor)").
- **Veil copy is unchanged.** The question's veil still shows the short "Board updating…" chip.
- **When the server opens the child, the next child replaces the beat.** The stamp, the status region and the gain tags unmount. The lasting marks (green faces, struck-through old level, `data-new` slot, the stat chip's `gained` face) stay for the whole child, as before. Focus outlines appear only after the beat, because a pending board has no focus refs, so the beat's motion and the question's focus never compete.

### Grouped beat

All transitions before one child are one moment. `adaptJourneyJ3` already folds them into one `JourneyTransition`, and the motion layer animates every changed object in parallel within the same beat.

Example: J-A child 4. There is one stamp (`Lv 6 · R unlocked`), one status region, and these motions together:

- both level rolls;
- Volibear's W and Lee Sin's Q rank pops;
- both R unlocks;
- Lee Sin's Cloth Armor pop with `+15 Armor`.

The stamp reads a progression as one moment. A plain purchase beside it is carried by its slot and tag. The recipe's narration (`First back` / `Recall`) is kept.

### Dependency highlighting (V1, deliberately minimal)

Only one link is drawn: an item → **its own** stat line. The rule is a `stat_change` whose `source` names an item this transition bought on the same side. Both facts are explicit in the public events, and the numbers are the server's `delta`s, never summed or derived.

**Deferred:** item → ability links (e.g. Caulfield's → Volibear Q). The public data does not state one, and inferring it would be guessing. The test `no ability pulses because of an item` pins this.

### Stat deltas

- **J3 `stat_change`** (an item's DELTA): rendered as the slot tag during the beat, and afterwards as the existing `gained` chip face.
- **`stat_delta`** (from/to, J2 contract): unchanged. It keeps its `Armor 51.59 → 91.59` chip face and its pulse.
- **Stats during a pending beat:** J3 does not publish the next child's stats during its beat. The pending board has none, so no `AH 0 → 10` total is shown and none is computed client-side.

## 3. Knowledge marks (K2) survive

- Marks are keyed by object (`player:volibear:Q`), and computed from the live segment state. A beat changes neither.
- Every ability and portrait still sits in its same-size `journey-know-host`. Animations target the tile inside the host, so the `!` never moves and never unmounts.
- **Captures:** on voli `child2-beat` (Caulfield's), the marks are *identical* to `child1-reveal-late` (Q `!`, `⏱ 12s ①`). The modified-cooldown fact child 2 asks (Q @ 10 AH) is absent at beat-start, mid-beat, beat-end, open and live. It appears only at `child2-reveal`.
- The Q tile does **not** pulse for Caulfield's (see the deferral above).

## 4. Reduced motion

| Setting | Behavior |
|---|---|
| OS `prefers-reduced-motion: reduce` | Every beat animation sits inside `@media (prefers-reduced-motion: no-preference)`, so none runs. The unlock ghost is `display: none` unless it is animating. The stamp mounts without framer motion (`initial=false`). |
| App **Settings → Reduce Motion** (`html.reduce-motion`) | The global rule only shortens durations, and the delays would still hold a new item hidden briefly. So `.journey-board *` gets `animation: none` and the ghost lock is hidden. Browser check: **0 running animations** in a grouped beat. |

In both cases the state still reads: green rims, the struck-through old level, green pips or digit, the new item, the stat tag and the stamp. **The server beat is unchanged** (measured 1294 ms under reduce, against 1300 ms).

## 5. Responsive certification (real browser)

Method: the dev arena `/dev/journey-arena?capture=m1-…` on the Vite dev server replays the real m1 captures through `readPublicRound` → `masterySliceModule` → `CanonicalArena`, with server time pinned to each capture. A probe clicked from the previous reveal into `childN-beat-start` (the server's beat +10 ms) and sampled every 10 ms. It recorded:

- the `data-beat` active → idle span;
- the board rect;
- the running CSS animations on the board;
- the stamp's clip state;
- each gain tag's containment inside the board;
- page overflow.

It then stepped to the `childN-open` capture.

**Visible beat (ms, active → idle) by width.** The server's remaining beat at the capture instant is 890 ms for a single beat and 1290 ms for a group, so measured values are within one 10 ms sample of the server.

| Case | 375 | 390 | 1024 | 1280 | 1440 |
|---|---|---|---|---|---|
| 1. Single purchase (voli c2, Caulfield's, first back) | 906 | 892 | 903 | 899 | 897 |
| 2 / 3 / 4 / 5. Level + rank + R unlock + purchase, grouped (voli c4) | 1300 | 1304 | 1311 | 1305 | 1300 |
| 2 / 3 / 4. Level + Q rank + R unlock (ahri c1, Survival) | 900 | 900 | 894 | 905 | 909 |
| 5. Grouped level 4 + first-back Long Sword (pantheon c4) | 1305 | 1298 | 1310 | 1293 | 1293 |

**Board y / height (px): identical before, during (every sample) and after, in every case.**

| Width | Board y / height |
|---|---|
| 375 | 159.3 / 121.1 |
| 390 | 159.3 / 126.5 |
| 1024 | 127.0 / 199.7 |
| 1280 | 127.0 / 208.0 |
| 1440 | 133.0 / 200.0 |

**Other results, at every width and in every case:**

- **Page horizontal overflow:** none.
- **Stamp clipped:** never.
- **Gain tags:** every tag is inside the board: `+10 AH · +20 AD`, `+15 Armor`, `+10 AD`.
- **Knowledge mark (case 7):** the Q `!` is present throughout.
- **Beat → next child (case 8):** the child is mounted on the `-open` capture and the beat is idle.
- **Stat delta (case 6):** covered by the item stat tags above.

**Running animations on the board** (grouped voli c4, 375): 19. They are:

- `changed-pulse`, `level-roll` on both levels;
- `changed-pulse`, `pip-fill` on subject W and opponent Q;
- `changed-pulse`, `unlock-art`, `unlock-lock`, `pip-fill` on both R tiles;
- `changed-pulse`, `item-in`, `gain-in` on the opponent's slot 0 and its tag.

On the single purchase there are 3, all on the new slot and its tag.

**Pre-existing and unchanged:** the board's `scrollWidth` exceeds `clientWidth` by 2 px, from JP1's splash underlay bleed and the truncated node label. Both are clipped by the board's `overflow: hidden` and are not visible.

**Next-child exposure:** the server opens the child at exactly `settle + 1750 + beat` (captures: closed at `beat-end`, −1 ms; open at the boundary). The client polls **at** `own_card_started_at` + 60 ms (`useRankedMatch`, JOURNEY-UI3) and immediately after the reveal window. Now that the reveal no longer spans the beat, the beat is shown from the first poll after the reveal window.

**Answer-time accounting:** the pooled clock reads "Paused" throughout the beat (screenshot at 1280). Server-side proof is in the backend tests.

## 6. Tests

New file: `src/lib/ranked-core/modules/masterySliceModule.motion.test.tsx`, 20 tests, over the real m1 captures through the production viewport.

- **Captures carry the policy:** 900 / 1300, shares that sum to the delay, and the child closed through `beat-end` and open at the boundary.
- **Correct object:**
  - single purchase: only `item-subject-0` is new; no level, rank or unlock moves;
  - level beat: exactly the 6 served objects are `data-changed`, the rank digits of W and Q are new, both Rs have the unlock ghost, and unrelated abilities are untouched;
  - R is locked before the level beat.
- **Explicit stat delta from public data only:** every number on the tag is a served `stat_change.delta`; a tag appears only on the new slot. Pure test: a stat line from the other side, one with no source, and a `stat_delta` all produce no tag.
- **Grouped:** one stamp, one status region, every line in server order, the tag on Lee Sin's slot. The 1300 ms beat ends exactly at the open instant (still active at −1 ms, idle at +1 ms). Pantheon keeps `Lv 4 · First back`.
- **Knowledge:** Q marks are identical before and during the beat. The asked fact is absent through beat and live, and present at the reveal. No item → ability pulse.
- **Geometry contract:** the status region is `sr-only`, the stamp sits inside the header line, the tag is absolutely positioned, and there is no scrim. The same board and band nodes persist through beat → next child.
- **Reduced motion:** every animation is gated, each fits inside 900 ms, and the ghost is hidden by default. Under a reduced `matchMedia` the state still reads and the beat still ends at the server instant.

Existing suites were adapted with no assertion weakened. `journey-beat` / `journey-beat-line` keep their test ids and text, so the J3 / J5 / K2 / hosted-match tests pass unchanged.

**Runs** (Journey, Ranked core, quiz-ranked, ranked-arena, ranked-public and dev pages): **3421 passed, 12 failed, 4 skipped**. The 12 failures are **identical on the untouched base `94e4ae74`** (diffed file by file):

- `AnswerGrid.elimination` ×2;
- `QuestionStageGeometry` ×3;
- `LobbyPreviewPage` ×2;
- `syntheticRankedHistory` ×1;
- `StatCheckPage` ×3;
- `statCategoryIcons` ×1.

One K2 test ("tap opens, second tap closes") failed once under full parallel load and passes in isolation, 30/30 twice.

**Production build:** `npm run build` succeeds (Vite, plus both prerender verifications).

## 7. Deferred / not done

- **Item → ability dependency highlighting.** Not stated by the public data.
- **Pooled-clock "Paused" affordance changes.** Not needed; the clock already reads Paused.
- **Out of scope, as briefed:** SFX, calculator/formulas, item knowledge marks, new fact kinds, and any curriculum or recipe change.
- **J2 legacy boards** get the same CSS motion for free, keyed on the same attributes. They were not separately certified: no J2 content is live.

## 8. Files

- `src/components/journey/JourneyTransitionBeat.tsx`: `JourneyBeatStamp` (visible) and `JourneyTransitionBeat` (sr-only status).
- `src/components/journey/JourneyStateBoard.tsx`: the `beatStamp` header slot, and item gain tags while the beat runs.
- `src/components/journey/JourneyModuleStage.tsx`: passes the stamp.
- `src/components/journey/JourneyPrimitives.tsx`: level `__from` / `__to` hooks, the unlock ghost and art hook, the rank-digit `data-new`, and inventory gain tags.
- `src/lib/journey/beat.ts`: `beatStamps`, `beatShortStamp`, `itemGainTags`.
- `src/index.css`: the Motion V1 block (replaces the scrim-era beat styles).
- `src/lib/journey/realFixtures.ts`: the `m1-*` captures in the dev arena.
- `src/lib/journey/__fixtures__/m1/`: real captures and the harness (`CAPTURE.md`).
