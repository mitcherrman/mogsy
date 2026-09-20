# RFX1 — Ranked Flow, Feedback & Preloading · Phase 1 (audit + proposal)

Status: **audit only**. No product code changed. Phase 2 is not approved.

## Objective

After a Ranked answer it is not clear enough whether the player was right. The
question card itself should react, with four distinct events: user correct,
user incorrect, opponent correct, and opponent incorrect.

The match should also enter, move between modules and reveal each next question
without hard cuts, pop-in or layout movement. Loading work should be real,
bounded and tiered. This phase establishes what Ranked actually does today and
proposes the smallest architecture that gets there.

## Baseline

| | |
|---|---|
| Frontend worktree | `/Users/macmoney/mogsy-wt-rfx1`, branch `rfx1/phase1-audit` |
| Baseline | fresh `origin/main` **`4c29f7ba7ecf8dad50c0413aaf044b85a9786ddf`** |
| Backend read for authority/timing | `League_Combat_Simulator` `origin/master` **`fc2e8be9`**: `ranked_public/service.py` and `ranked_public/pacing.py` (read only) |
| Browser method | Production `vite build` served by `vite preview`. The real `/dev/ranked-shell-probe` mounts the real `QuizRankedMatch`, `useRankedMatch` and `CanonicalArena`. A scripted server state machine is layered over the probe's in-page fetch interceptor. Headless Chromium runs under CDP throttling: desktop 1440×900 at 9 Mbps with 40 ms latency, and phone 390×844 at 1.6 Mbps with 150 ms latency and 4× CPU slowdown. The scripts live in the session scratchpad and are not committed. |

The in-app browser pane reports `document.hidden`, which stops
`requestAnimationFrame`. Every frame-level number below therefore comes from
Playwright, not the pane.

---

## ⚠ Assumptions the audit shows are wrong

1. **The user result and the opponent result are not separate events for an
   ordinary round.**
   - A quiz round resolves only when both players have submitted or the
     deadline passes (`duel_round_engine.is_ready_to_resolve`).
   - One settlement (`GET /rounds/N/resolved`) carries both players' outcomes
     and points.
   - Until then the viewer sees only "Answer locked — waiting for opponent…".
   - "User result → opponent result" can only be a presentation stagger over
     one authoritative fact. It cannot be two state transitions.
2. **The next question cannot be known during the current round.**
   - The server generates round N+1 in the same transaction that resolves
     round N (`_resolve` → `_start_round`).
   - The client learns about N+1 in the same snapshot that tells it N
     resolved.
   - A "Tier 3 during the stable current round" preload is therefore
     impossible for quiz rounds without a backend change.
   - The only window is the lead-in described in item 3.
   - Exception: a **Meta Reflex block publishes all 5 cards up front**.
3. **The between-module window already exists, and the server owns it.**
   - `pacing.module_transition_ms` = result hold (1500 ms, or 2600 ms when the
     settlement carries evidence) + `MODULE_TITLE_MS` (1400 ms).
   - Round N+1's `started_at` is set in the future by that amount, so it is
     answerable at `resolved_at + 2900 ms` (or 4000 ms).
   - Any RFX1 feedback or transition must fit inside that window, or the
     backend constants must change. Changing them is a contract change.
4. **For block modules there is no per-card "opponent correct / missed".**
   - Meta Reflex publishes the opponent's *progress* only
     (`opponentChallengesCompleted` and `opponentFinished`), never
     correctness.
   - The opponent's result exists only as a block aggregate at settlement
     (`SegmentRevealPlayer.correct / incorrect / segmentResult`).
   - The binary `OPPONENT CORRECT / MISSED` wording fits quiz rounds only.
     Blocks need an aggregate form such as `OPPONENT 3/5`.
5. **Round 1 has no lead-in, and the first snapshot read opens it.**
   - `_presentation_for_previous_round` returns 0 for segment 1.
   - `get_rehydrated` (the snapshot read) calls `_advance`, which starts
     round 1 at `now`.
   - An entry intro that fetches the first question therefore spends round 1's
     answer time.
   - In a live match the opponent's first poll opens it regardless of what
     this client does.
   - **A real "prepare before reveal" intro needs a backend entry lead-in.**
     Reported here, not done.
6. **The biggest jank source is image weight, not the React swap.** See
   Measurements M4. The persistent chrome is about 7 MB of full-resolution
   PNGs, and the Ranked route loads about 5 MB more of non-Ranked Mogzy art.

---

## A. Current entry lifecycle

1. **The lobby's PLAY seal** opens the match-entry scroll.
   - The route is `/quiz` (`Quiz.tsx` → `LeaguecraftHub` → `RankedPlayScroll` →
     `PlayScrollRecord`).
   - `RankedPlayScroll` owns `useRankedQueue`
     (`src/pages/quiz-ranked/useRankedQueue.ts`).
2. **Queue polling runs from the moment the record mounts.** `getQueueStatus`
   polls every 2000 ms, or 700 ms while `pairing`, with backoff capped at
   8000 ms. Joining (`joinWithoutClass`, or with `matchWithBot` for an admin)
   is `POST` join, then polling.
3. **`matched`** comes from queue status, or `getActiveMatch` during pairing.
   - At this point the only thing known is **`matchId`**.
   - No question, opponent role or snapshot has been fetched yet.
4. **The handoff waits `DEFAULT_HANDOFF_MS = 800` and does no work**
   (`PlayScrollRecord.tsx:102, 410-421`).
   - It then calls `navigate("/quiz/ranked", { state: { matchId } })`
     (`Quiz.tsx:1448`).
   - This is the natural home for the future intro's real work.
5. **The route chunk loads.**
   - It is `lazy(() => import("./pages/quiz-ranked/QuizRankedPage"))` with
     Suspense `RouteFallback` (`App.tsx:206, 565`).
   - Its chunks are `QuizRankedPage` 2 KB and `QuizRankedMatch` 13 KB
     gzipped, plus shared chunks.
   - `route-prefetch.ts` has no `/quiz/ranked` entry, so nothing is warmed.
6. **`QuizRankedPage` → `RankedMatchHost`.**
   - It reads `matchId` from router state (`entry="fresh"`), otherwise
     `getActiveMatch` (`entry="recovered"`).
   - `useProfileIdentity` resolves the viewer's display name in parallel.
7. **`QuizRankedMatch` → `useRankedMatch(matchId, viewer, {entry})`.**
   - For `fresh`: one `GET /matches/:id` (public snapshot).
   - For `recovered`: `POST /resume` first, then the poll.
   - Until the first snapshot lands, `CanonicalArena view={null}` renders the
     "Entering the arena…" / "Recovering match…" placeholder. Measured at
     27–70 ms against the in-page fixture; production adds about 1–2 API
     round trips at roughly 110–250 ms each (curl TTFB to the prod API).
8. **The first snapshot drives the first real render, in one step.** Its
   contents:
   - players, including **frozen `role`** for both seats and bot identity
     (`playtest.isBotMatch`)
   - scoring
   - `activeRound` with the timer
   - the **full first question**
   - presence

   The arena renders the whole match at once:
   - header / `MobileMatchBar`
   - both rails with `RoleMascot` (the URL comes from the role)
   - `InteractiveScenarioSurface`
   - the timeline

   Only then is `GET /private` fetched, sequentially; it does not gate the
   render.
9. **Every image is discovered by that render.** The first-round question art,
   role mascots, arena background, vellum and banner all start loading at
   arena mount (M3/M4). Nothing is preloaded or decoded.

What is known when:

| Stage | Known |
|---|---|
| Lobby | Viewer's own role |
| `matched` | `matchId` only |
| First snapshot | Opponent identity/role, bot flag, question 1, clock |
| First render | All media URLs |

What can be prepared before the arena reveal without backend changes:
- the route chunk
- the viewer's own mascot
- the static chrome (background, vellum, banner, role icons)

Question-1 media can be prepared only by fetching the snapshot, and that
opens round 1's clock (Assumption 5).

## B. Current round lifecycle (ordinary quiz round)

State owners:
- `useRankedMatch` (`src/pages/quiz-ranked/useRankedMatch.ts`): polling,
  capture and hold.
- `QuizRankedMatch` (`src/pages/quiz-ranked/QuizRankedMatch.tsx`): the lagging
  surface and the projections.
- `CanonicalArena`: rendering.

| # | Event | State that changes | Kind |
|---|---|---|---|
| 1 | Snapshot with `activeRound = N` | `publicRound` and `roundNumber`; the surface adopts it through `renderedRound` | server |
| 2 | Answerable gate | `msUntilAnswerable(startedAt)`, re-evaluated only on the **1 s tick** or a poll (`QuizRankedMatch.tsx:319, 902`) | derived |
| 3 | Click | `answer()` sets `selectedOptionId` and `submitting=true`, then `POST /rounds/N/submission`, then `poke()` | local optimistic (which option is in flight; not a lock) |
| 4 | Next poll | the player's `hasSubmitted` makes `phase="locked"` and the status reads "Answer locked — waiting for opponent…" | server |
| 5 | Opponent answers | public `players[opp].hasSubmitted` (the rail shows "Thinking…" or not) | server, **progress only** |
| 6 | Server resolves N and opens N+1 (future `started_at`) in one transaction, on some participant's request | — | server |
| 7 | Poll sees `activeRound` go N→N+1 | `captureResolved(N)` fetches `/rounds/N/resolved` and runs `adaptBackendSettlement`, which sets `lastResolved`, `damageLog`, `revealHold=true` and a timer. It also calls **`setSelectedOptionId(null)`**. Then `setPublicRound(N+1)`. | server (authoritative) + one presentation timer |
| 8 | Reveal beat, `REVEAL_HOLD_MS` 1500 (2600 with evidence) | the surface stays on N because `canAdvanceSurface` is false. `projectSurfaceReveal` marks the correct option. The header `CentralStage` shows the verdict and points (`centralResult`). Rails show `projectRevealOutcomes/Feedback`, mascot reactions and `AwardPops`. The stage drops to `opacity-60`. | derived from the settlement, gated by `revealHold` |
| 9 | Hold ends | `renderedRound = N+1`: **the new question replaces the old in place, in the same frame**. `CentralStage` flips to the module title for `MODULE_TITLE_MS` 1400. Input stays locked until `started_at`. | presentation |
| 10 | `started_at` reached (next 1 s tick) | `inputOpen=true` | derived |

Authoritative vs cosmetic:
- **Authoritative:** `publicRound` / `privatePlayer`, the adapted
  `lastResolved` (outcomes, `correctOptionIndex`, `modulePoints`) and
  `lastSegmentSettlement`.
- **Optimistic:** `selectedOptionId` and `submitting`.
- **Presentation:** `revealHold`, `renderedRound`, the `CentralStage`
  title/result face, `AwardPops` and mascot actions.

Correctness is **never inferred locally**.

## C. User result authority

- **Correctness:** `lastResolved.players.p1.outcome`, one of
  `correct | incorrect | timed_out`. It comes from `/rounds/N/resolved`, and
  p1 is always the viewer.
- **Correct answer:** `lastResolved.correctOptionIndex`. The backend builds the
  resolved projection only after settlement.
- **Points:** `lastResolved.modulePoints[viewerId].basePoints`.
- **Speed bonus:** `lastResolved.modulePoints[viewerId].speedBonusPoints`.
  Rendering goes through `pointsFeedback.ts`.
- **All of these arrive at the same moment** (step 7). Nothing is available
  earlier, and nothing is inferred.
- **Current success/failure styling is spread across several places:**
  - `QuizAnswerOptions` choice states (`correct` / `incorrect-selected`)
  - `CentralStage` result face (header)
  - `CombatantPanel` outcome/award/reaction (rails)
  - `MobileMatchBar` on phone

  There is no treatment on the card itself beyond a highlighted correct tablet
  and the stage dimming to 60%.
- **Defect (confirmed in all 6 runs and in the screenshot):**
  - The player's own wrong pick is not shown at reveal. `useRankedMatch`
    clears `selectedOptionId` in the same batch that starts the hold, so the
    grid renders `correct,idle,idle,idle` instead of
    `correct,idle,incorrect-selected,idle`.
  - The settlement carries no selected index, so after the clear the
    information is gone.
  - Fixing it is frontend-only: keep the round-N selection until the surface
    leaves round N.
- **Meta Reflex:**
  - Per-card viewer correctness is live from `segmentState.ownCardReveals` via
    `ownRevealingCardIndex`, server-scored and restorable
    (`cardBeat.ts: projectCardBeat`).
  - The block total comes from `lastSegmentSettlement`.
- **Mastery slice:** per-question viewer reveals come from
  `segmentState.ownChallengeReveals`, and the block total at settlement.
- **Combat Calculation / family cards:** these are ordinary quiz rounds with a
  different band (`data-band="family"`) and the same resolution path.

**Recommended triggers:**
- `USER_CORRECT` / `USER_INCORRECT` fires when a live-captured settlement is
  being revealed on the surface: `revealHold === true` and
  `lastResolved.roundNumber === surfaceRoundNumber`.
- Its event id is `${matchId}:r${round}:user`, and the verdict is
  `lastResolved.players.p1.outcome`, with `timed_out` as its own variant.
- For blocks, the per-card cue uses `cardBeat` (id
  `card:${round}:${challengeIndex}`) and the block cue uses the segment
  settlement.

## D. Opponent result authority and timing

- **Source:** `lastResolved.players.p2.outcome` and
  `modulePoints[opponentId]`. The same settlement delivers it at the same
  instant as the user's result. It is supplied directly, not derived.
- **Before settlement the only opponent fact is `hasSubmitted`** (progress).
  An `OPPONENT_ANSWERED` cue is possible, but it carries no correctness.
- **Bot vs live:**
  - The bot is server-side. It "thinks" for a deterministic 2–6 s
    (`bot.think_delay_seconds`) and is driven by the same lazy `_advance`.
  - The client path is identical; only `playtest.isBotMatch` and the label
    differ.
  - In a live match, resolution can be triggered by the *opponent's* request,
    so this client can learn about it up to about 1.5 s (one poll) after the
    server resolved. The `revealHold` timer is anchored to local discovery,
    while `started_at` is anchored to server resolution, so a late discovery
    squeezes the module-title window.
- **Points and correctness** are one transition (one settlement). The score in
  `publicRound.players[].score` moves in the same snapshot.
- **Exactly once per module:** yes.
  - `captureResolved` fires only on an `activeRound` number change inside a
    mounted controller, and `resolvedRef` dedupes.
  - `revealHold` is set **only** by live capture. `recover()` and the resume
    backfill set `lastResolved` without a hold.
  - So gating on `revealHold` already prevents replay on refresh, reconnect or
    remount.

  Known edge cases:
  - If the poll backs off long enough for two rounds to settle between
    snapshots, only the older round is captured (`previous`), and the skipped
    round's beat is lost. No replay happens.
  - `RoundResultBeat` in the header record window is keyed by round, so its
    entrance replays once on resume. This is cosmetic.
- **An opponent result already resolved before entering or restoring** should
  play no event. The settled result belongs in the record/ledger, as it does
  today.

**Recommended triggers:**
- `OPPONENT_CORRECT` / `OPPONENT_INCORRECT` use the same gate as the user
  event, with the verdict from `lastResolved.players.p2.outcome` and event id
  `${matchId}:r${round}:opp`. `timed_out` shows as "missed".
- Blocks: `OPPONENT_BLOCK` is an aggregate (`correct`/`challengeCount`,
  `segmentResult`) from `lastSegmentSettlement` when the block settles.

## E. Round replacement

- **There is no explicit transition state.** Replacement is immediate when
  `revealHold` flips false.
- `QuizRankedMatch.tsx:305-316`: `renderedRound` lags `publicRound`, and the
  whole swap is `setRenderedRound(live)` during render.
- The surface is **deliberately not remounted**. The `Viewport` and
  `InteractiveScenarioSurface` stay mounted, and only the answer grid is keyed
  on `questionId`. `QuizRankedMatch.revealBeat.test` "keeps the same question
  section node mounted" pins this.
- The media band uses `AnimatePresence mode="wait"` (0.35 s opacity), which is
  time-based and does not wait for images.
- There is no old/new DOM overlap and no blank state for quiz rounds.

Where visible jank comes from, all measured:
1. **Next-round art is requested only at the swap.** The payload has been
   known for 1.5 s before that (M2), so the new question paints with an
   empty or blurred band.
2. **Mixed old/new on screen during the hold.**
   - The surface shows round N, but everything that reads the *live* snapshot
     already shows N+1.
   - That includes the header module label ("2 / 10"), the timer (sitting at
     the next round's full "0:30") and the phone match bar.
   - See the screenshot of the reveal: the old question sits under "0:30 ·
     2/10".
3. **The swap changes geometry.**
   - A text/compact card changes to a cinematic/family card, so the question
     body grows.
   - Desktop CLS is 0.008 (body 524→550 px).
   - Phone CLS is 0.029–0.058 (body 316→476/499 px). It is inherent to the
     change of shape, but it happens with no cover.
   - Image loads themselves caused **no** shift, because band geometry is
     reserved.
4. **The user's wrong pick disappears** at the moment of reveal (section C).
5. **The grid briefly reopens after submit (phone):** `open` for about 25 ms
   between the submit response and the poke poll. Once observed.
6. **Input opens up to about 1 s late** because `answerablePending` is only
   re-checked by the 1 s tick.

## F. Asset/media inventory (Ranked-reachable)

Two resolvers:
- `resolveQuizAssetUrl`: payload paths on the combat API origin.
- `useChampionAssets.resolveAssetUrl`: the champion manifest
  `/api/assets/champions`, which a second cache in `MasteryAssetsProvider`
  fetches again.

There is no CDN and **no preconnect** to the API origin.

| Pathway | URL known | Load starts | Waits for load? | decode() | Geometry reserved |
|---|---|---|---|---|---|
| Role mascots, `RoleMascot` → `/mascot/ranked/{role}mogzy.png` (one pose; actions are CSS) | first snapshot (role) | arena mount; lazy by default, eager on the stage crest and mobile bar | no | no | yes (aspect 6/7, fixed crest) |
| Role emblems (SVG, under 1.4 KB) | snapshot or payload | mount | no | no | yes (width/height attributes) |
| Arena background `ranked-academy-duel-bg.png` (2.0 MB), vellum `ranked-vellum-texture.png` (2.3 MB), banner `navy-banner2.png` (1.26 MB) | static CSS | when the class applies at arena mount | no | no | n/a (backgrounds) |
| Scenario band (item, champion, spell, rune, jungle-pet icons, splash) via `classify.ts` | question payload | surface render | no; the Ken Burns card shows empty | no | yes (aspect and `--qs-media-h`) |
| Champion splash via manifest | payload + manifest JSON | after both | no | no | yes |
| Static per-family art (`item-shopkeeper.png` 713 KB, `jungle_grass_background.png` 649 KB, `academy-hall.jpg`, `Spellcaster.jpg`) | payload picks the card | surface render | no | no | yes |
| Motif layer (`champ-combat.png` 1.25 MB, etc.; CSS `::before`) | `topic.motif` | when the class applies | no | no | yes (absolute) |
| Option media (`option_media[].icon`) | payload | render, `loading="lazy"` | no | no | yes (h-7 slot) |
| Timeline node icons | `topic.iconHint` | render, lazy | no | no | yes |
| Meta Reflex card art | **the block payload has all 5 cards** | only when that card becomes current | no | no | yes (fixed box) |
| Reveal-only assets (spoiler subjects, answer-upgrade splash, recipe missing component) | often already in the payload | only after reveal | — | — | yes |
| Non-Ranked Mogzy art on the route: `GlobalHud` hat (850 KB); `MogzyIdentityMenu` base (2.2 MB); Rules-scroll `MogzyExplainsPanel` explaining / peeking / raising-hand (about 1 MB each) | static | page mount | no | no | yes |

Existing helpers:
- `route-prefetch.ts: prefetchImages`: `new Image`, idle, low priority. Only
  used by Swipe.
- `welcome/useSceneReady`: the **only `decode()` use**, with a cap and a gate.
- `welcome/sceneAssets.warmAcademyWelcomeScene`.
- `BroadcastQuestionScene.collectUrls`: extracts scenario URLs from a
  question.

None of these are used in Ranked. There is no `React.lazy` inside the match.

**Hidden-information constraint:** preloading reveal-only assets before
settlement would expose the answer in the network panel. The preload
extractor must use the same *pre-reveal* selection the renderer uses.

## G. Measurements (production build, throttled, fresh cache)

**M1. Entry, from hard load to an interactive question.**
- Desktop: DCL 673 ms, arena and question at 2156 ms, band art decoded at
  2435 ms.
- Phone: arena at 6015 ms, art at 6595 ms.

The "Entering/Recovering" placeholder showed for 27–70 ms here. Production
adds 1 (fresh) or 2 (recovered) API round trips of about 110–250 ms.

**M2. Round replacement, click to next question.** Six runs covered
desktop/phone × item card, jungle pet and Combat Calculation. Typical desktop
run (next = item-analysis card):

| t (ms from click) | What happened |
|---|---|
| +120 | submission POST; "Submitting…", then "Answer locked — waiting for opponent…" |
| +3131 | poll sees N+1 and fetches `/resolved`; at **+3147** the hold starts (result face `INCORRECT +0`), the grid shows `correct,idle,idle,idle` (**own pick lost**) and the stage dims to 0.6 |
| +4651 | hold ends; the **new question replaces the old in one frame**; band 0/4 images loaded; CLS 0.008 |
| +4639 → +4870 | next-round images requested **at** the swap, loaded 180–230 ms after it |
| +6170 | input opens (resolution + 2900 lead-in + up to 1 s tick) |

Next-round media request start minus payload known was **+1.5 s in every run**
(payload at ≈3.13–3.26 s, first image request at ≈4.63–4.74 s).

- Phone, jungle pet: `jungle_grass_background.png` (649 KB) finished **3.5 s
  after the swap and 2.3 s after input opened**.
- Phone swap CLS: 0.029 (item), 0.048 (jungle), 0.058 (Combat Calculation).
- Duplicated requests: the same URL rendered twice (for example, item 3078
  as the hero and as a strip tile) produced one network request. Browser
  cache reuse works; no duplicate fetches were seen.

**M3. Cold-entry chrome waterfall (CDP, full, including in-flight
requests).**

Desktop, 9 Mbps, **12.6 MB of images** for one Ranked question:

| Asset | Finished (ms from nav) |
|---|---|
| arena mount | 3058 |
| `topmogzy` 1.0 MB | 8596 |
| `midmogzy` 0.95 MB | 12190 |
| `ranked-academy-duel-bg` 2.0 MB | 14017 |
| `ranked-vellum-texture` 2.3 MB | 14685 |
| `navy-banner2` 1.26 MB | 14634 |
| `mogzy-mascot-base-v1` 2.2 MB | 16143 |

In other words, the arena and its parchment chrome finish about 5–13 s
*after* the question was interactive. The question's own item icons (API
origin, about 6 KB each) finished within about 250 ms.

Phone, Slow 4G:
- Arena at 6979 ms.
- The `midmogzy` role mascot finished at 36991 ms.
- `topmogzy`, the arena background, vellum and `mogzy-mascot-base-v1` were
  **still pending at 52 s**.

Role mascots are 1254×1254 PNGs displayed at about 104 px.

**M4. What that means.** The jank a phone player sees at match start and
throughout the first minute is the chrome streaming in (parchment texture,
backdrop and mascots). It competes for bandwidth with every question's art.
No React change fixes this. Only asset weight, or ordering and priority, can.

**M5. Console.** One unrelated 403 came from the probe environment
(unauthenticated app-shell read). There were no Ranked errors or warnings.

**Not measured, with reasons:**
- Real authenticated production matches: no credentials available to me.
- A real module title between rounds: the probe fixtures carry no
  `topic.category`, so `liveModuleTitle` was null. Code reading shows it plays
  for 1400 ms from the swap.

Evidence screenshots (scratchpad, not committed):
- `shot-phone-junglePet-1-reveal.png`: the own wrong pick is not marked, and
  the header already reads the next round's "0:30 · 2/10".
- `shot-phone-junglePet-2-swap.png`: the new question is visible, the band
  background has not loaded, and answers are still staggering in.

## H. Existing timing/orchestration

| Timer | Where | Duration | Role |
|---|---|---|---|
| match poll | `useRankedMatch.ts:616` | 1500 ms, backoff to 8 s | drives everything; no realtime, no `visibilitychange` |
| heartbeat | `:757` | 10 s | presence |
| **reveal hold** | `beginRevealHold` `:389` (`pacing.ts`) | 1500, or 2600 with evidence or level-up | the only round-flow hold; client-anchored |
| 1 s render tick | `QuizRankedMatch.tsx:319` | 1000 ms | clock display **and** the answerable gate |
| module title | `CentralStage.tsx:126` | 1400 ms | header face after the hold |
| award pops | `AwardPops.tsx:85` | 900 ms, bonus +380 | rails |
| MR sting | `MetaReflexSting.tsx:49` | 720 ms | block entry |
| MR card tick | `metaReflexModule.tsx:47` | 100 ms | per-card countdown |
| mascot actions | `RoleMascot` (`animationend` / WAAPI) | 500–820 ms CSS | reactions |
| lobby handoff | `PlayScrollRecord.tsx:419` | 800 ms | idle wait before navigation |
| queue poll | `useRankedQueue.ts:286` | 2000 / 700 ms | queue |

The timing is coherent in intent. There is one hold owner and the server owns
the boundary. It does have four real defects:

1. The hold is anchored to *local discovery*, not to server `started_at`.
2. The answerable gate has 1 s granularity.
3. `cardAward` is a new object on every render, so `useAwardPops` re-runs on
   the 1 s tick and never clears its pops. They stay invisible only because
   they end at opacity 0 with fill-mode.
4. `CentralStage`'s title timer can be cancelled mid-flight by a result
   arriving, and then stick.

Unrelated (do not fix in RFX1): `useRankedQueue` keeps polling after unmount,
and `revealHold` survives a `matchId` change.

## I. Reduced motion

- **OS `prefers-reduced-motion` is broadly respected**, mostly in CSS:
  - `index.css` blocks for the result beat, header face, pops, lead pulse,
    timeline and tablets
  - Tailwind `motion-reduce:` in the arena components
  - `RoleMascot.prefersReducedMotion()` in JS

  The house pattern is "still arrives, doesn't move" (`index.css:1112-1125`,
  `1191-1209`).
- **The app's own Settings → Reduce Motion (`html.reduce-motion`) is not
  handled by Ranked.** The global rule sets `animation-duration: 0.001ms`, so
  every fill-mode-both animation that ends at opacity 0 is **never visible**.
  That includes point pops, the MR sting and the lead pulse.
- Reusable pieces:
  - hook shape: `pages/welcome/usePrefersReducedMotion.ts` (live, test-safe;
    OS only)
  - class check: `AcademyBulletin.tsx:58` / `LolHub.tsx:234` (reads
    `html.reduce-motion` too, but copy-pasted)

  RFX1 needs a single `useRankedReducedMotion()` covering both signals.

---

## Proposed RFX1 architecture (smallest coherent)

Keep `useRankedMatch` as the one authority. Add **one pure projection and one
small hook** that derive a *presentation flow* from what already exists.
Duplicate no state and add no new server calls.

### Flow phases (derived, not stored)

```
entering          no publicRound yet (existing placeholder → intro later)
answering         surface round is active and inputOpen
awaiting          phase==="locked" (own submission confirmed, no settlement)
revealing         revealHold && lastResolved.roundNumber === surfaceRoundNumber
module_intro      surface shows N+1, now < started_at (existing 1400 ms title window)
```

Next-round preparation is **not** a separate phase. It is a sub-phase of
`revealing`. During the hold the next round's payload is already in
`publicRound`, so preparation runs *under* the reveal and never adds a
separate wait unless the media is still not ready at hold end. There it is
bounded by the budget described next.

### Events

Each event is computed from the settlement plus the event id. It is never
stored as authority. A `Set<string>` ref of played ids per mount prevents a
second playback when React re-renders.

| Event | Gate | Id |
|---|---|---|
| `USER_RESULT {verdict: correct\|incorrect\|timed_out, points, speed}` | revealing | `${matchId}:r${n}:user` |
| `OPPONENT_RESULT {verdict, points}` | revealing, presented after a stagger of about 400–600 ms *inside* the same hold | `${matchId}:r${n}:opp` |
| `CARD_RESULT` (MR, Mastery) | `projectCardBeat` / `ownChallengeReveals` | `card:${n}:${i}` |
| `OPPONENT_BLOCK_RESULT {correct, of}` | block settlement + hold | `${matchId}:r${n}:oppblock` |

Restored and reconnected matches produce **no events**, because `revealHold`
is only set by live capture (already true today). Their last result stays in
the record window and ledger, as now. The bot and live paths are identical.

### Two small timing changes (inside the existing server budget)

1. Anchor the hold end to the server: `holdEnd = min(discovered +
   REVEAL_HOLD, startedAt(N+1) − MODULE_TITLE_MS)`, adjusted for skew.
   A late-discovered settlement then shortens the reveal instead of eating
   the title window. `started_at` is already in `publicRound`.
2. Schedule one timeout to open input at `started_at`, instead of waiting
   for the 1 s tick.

### Keep own selection through the reveal

Record `{round, optionId}` at submit and pass it as `surface.selection` while
`surfaceRoundNumber === round`. With this the `incorrect-selected` tablet
renders, and the card overlay can say "you chose C". This is frontend-only.

### Card-level feedback surface

Add one absolutely positioned overlay layer inside `ranked-question-stage`
(like `QuestionMotifLayer` / `LevelUpPanel`). It uses
`pointer-events:none`, contributes no layout, and places no content in flow.
The user verdict (✓ CORRECT / ✗ INCORRECT / TIMED OUT) renders on the
parchment. The opponent verdict renders as a right-edge treatment
(OPPONENT CORRECT / OPPONENT MISSED / OPPONENT 3/5). The existing
`opacity-60` dimming is replaced by the overlay's own treatment, so the
question and tablets remain readable.

### Reduced motion

`useRankedReducedMotion()` covers both the OS signal and
`html.reduce-motion`. Under reduced motion the overlay shows the same explicit
text and icon statically (no travel or scale), and remains visible for the
hold. An `html.reduce-motion` override is added for the Ranked keyframes that
must still arrive.

### Scope boundaries

- There is no global animation framework. Everything lives in
  `lib/ranked-core/flow/` (pure) and one hook used by `QuizRankedMatch`.
- The Daily arena, which shares `CanonicalArena`, receives nothing unless it
  passes the new optional view field.

## Proposed preload design

A new `src/lib/ranked-core/media/preload.ts` module, with no dependencies:

```ts
prepareImage(url, { priority: "high"|"low", decode: boolean, timeoutMs }): Promise<"ok"|"error"|"timeout">
// module-level Map<normalizedUrl, Promise> dedupe; new Image(); fetchPriority; img.decode()
// never rejects; failure/timeout resolve (render must never block on a broken image)
roundMedia(publicRound): string[]
// PRE-REVEAL urls only, via the SAME selectors the renderer uses
// (scenarioSourceFromPublicQuestion → classify, option_media, topic.motif → css url map,
//  MR block.cards[*] sides, mastery challenge presentation). Never reveal-only assets.
```

A hook, `useRoundMediaPreparation(live, rendered)`, runs in `QuizRankedMatch`.
Stale-round protection is keyed by round number: results for a superseded
round are ignored. Aborting is unnecessary because images are cached anyway.

| Tier | What | When knowable | Blocking? |
|---|---|---|---|
| 1 — persistent | role mascots (both seats), arena background, vellum, banner, role icons | viewer role: in the lobby; opponent role: first snapshot; chrome: static | **Not blocking.** Start at the 800 ms handoff (the viewer's own mascot and the chrome) and on the first snapshot (the opponent mascot). Decorative. |
| 2 — current round | band subject art, family art, option icons, motif | snapshot of that round | **Soft-blocking for the first reveal only:** hold the surface in an intro/placeholder until decoded or a 600 ms cap. Mid-match this is Tier 3's job. |
| 3 — next round | the same extractor on `publicRound` while the surface lags (the 1.5 s hold) | **only at resolution** (same snapshot) | Soft-blocking at the swap: the swap may wait for decode up to `started_at − MODULE_TITLE_MS`, never later. MR: all 5 cards at block start. |

Everything else stays lazy. In addition:
- De-prioritise the non-Ranked Mogzy art on the route (`fetchpriority=low`, or
  defer the Rules-scroll mascots until opened).
- Add `<link rel="preconnect">` to the combat API origin.
- Add a `/quiz/ranked` entry to `route-prefetch` so the chunk warms during the
  lobby handoff.

**Highest-leverage item, and an owner decision:** re-encode (not re-draw) the
Ranked chrome and mascots at display resolution, for example a 256 px WebP
mascot at roughly 30 KB instead of 1 MB. This alone removes most of M3.
It is not new art, but it changes shipped assets, so it needs approval.

## Files likely to change in Phase 2

- `src/pages/quiz-ranked/useRankedMatch.ts`: keep the round selection; anchor
  the hold end to `started_at`.
- `src/pages/quiz-ranked/QuizRankedMatch.tsx`: the flow projection, the swap
  gate, preparation, and the `answerable` timeout.
- `src/lib/ranked-core/flow/rankedFlow.ts` (new, pure) and a test.
- `src/lib/ranked-core/media/preload.ts` and `roundMedia.ts` (new) and tests.
- `src/lib/ranked-core/arenaView.ts`: an optional `feedback` field on the view.
- `src/components/ranked-arena/CanonicalArena.tsx`: mount the overlay layer
  and replace the `opacity-60` dim.
- `src/components/ranked-arena/QuestionResultOverlay.tsx` (new).
- `src/components/ranked-arena/MobileMatchBar.tsx`: read the surface round,
  not the live one, while revealing (or pass the lagged label).
- `src/components/quiz/play-scroll/PlayScrollRecord.tsx`: Tier 1 warm during
  the 800 ms handoff.
- `src/lib/route-prefetch.ts`: the `/quiz/ranked` entry.
- `index.html`: preconnect.
- `src/index.css`: overlay styles and the `html.reduce-motion` overrides.
- A new hook, `useRankedReducedMotion` (shared).
- Later, after the backend decision: `QuizRankedMatch` / `CanonicalArena`
  placeholder → intro.

## Tests to add or extend (focused)

- `rankedFlow.test.ts`:
  - one user event and one opponent event per settlement
  - none on resume, remount or reconnect
  - blocks produce the aggregate
  - `timed_out` is mapped
- `QuizRankedMatch.revealBeat.test.tsx`:
  - the own wrong pick renders `incorrect-selected` during the hold
  - the overlay renders with an unchanged `ranked-question` rect
  - the surface node is still not remounted
- `useRankedMatch` hold anchoring: a late discovery shortens the hold to
  `started_at − 1400`; input opens at `started_at` without waiting for the
  tick.
- `preload.test.ts`: dedupe, never-rejects, timeout, stale-round ignore;
  `roundMedia` excludes reveal-only assets (spoiler subjects, the upgrade
  splash, the missing recipe component).
- e2e `ranked-arena-fit.spec.ts`: add one "result overlay visible" state per
  locked viewport plus 390×844, asserting the existing box contract (no
  clipped tablets, no horizontal overflow, no nested scroll, stage rect equal
  before and after the overlay). Extend the fit harness; do not rewrite it.
- Reduced motion: an overlay text/icon smoke test under both the OS media
  query and `html.reduce-motion`.

## Risks / unresolved

1. **Entry intro vs round-1 clock (backend).** Round 1 has a 0 lead-in and
   opens on the first snapshot read. A useful intro needs either an entry
   lead-in for segment 1 on the backend, or acceptance that the intro only
   covers pre-snapshot work (chunk, chrome, own mascot). This needs an owner
   decision before an intro slice.
2. **Opponent stagger inside a fixed server budget.** The user cue, the
   opponent cue and the module title must fit in 2900 ms minus poll latency.
   Longer beats require raising the backend `RESULT_HOLD_MS` or
   `MODULE_TITLE_MS` together with the frontend constants.
3. **Asset re-encoding** is the dominant performance lever and is outside a
   pure code change. It needs an owner decision.
4. **Evidence line at reveal.** `EvidenceLine` renders under the grid when
   present. It was not exercised by the fixtures (explanation null). On a
   locked desktop stage it may compress the media during the reveal. Phase 2
   should measure this with an evidence fixture.
5. **A skipped round under long backoff** loses its beat (it is never
   replayed). This is acceptable, but should be documented.

## Recommended Phase 2 slices

1. **Correctness truth fixes (small, no visuals):** keep the own selection
   through the reveal; anchor the hold to `started_at`; open input at
   `started_at`; stop the mobile bar and header module label reading the next
   round during the hold; memoise `cardAward`.
2. **Flow projection + card overlay:** `rankedFlow` with the four events (and
   the block aggregate), the overlay layer with user and opponent treatments,
   reduced motion, and geometry and fit tests.
3. **Targeted preload:** `preload.ts` / `roundMedia`, Tier 3 under the hold
   with a bounded swap gate, MR whole-block preload, Tier 1 in the lobby
   handoff, preconnect, and route warm.
4. **(Needs decisions from Risks 1 and 3)** the entry intro that performs the
   work, and the chrome asset re-encode.

---
---

# Phase 2A — resolution sequencing and authoritative correctness feedback

Status: **implemented and committed on `rfx1/phase2a`. Not merged.**

The branch sits on `origin/main` **`3c9ddfc4`**. Main moved only two
docs-only commits from the Phase 1 baseline `4c29f7ba`
(`docs/gr1-reusable-state-architecture-audit.md`, `docs/gr1-qca8-…`,
`docs/RANKED_MASTERY_SLICE_HANDOFF.md`), and none overlaps a file changed
here. Nothing needed reconciling.

## Phase 2A decisions (approved inputs, applied as given)

1. **Normal rounds.** One authoritative settlement (`/rounds/N/resolved`)
   produces both the viewer cue and the opponent cue. The opponent cue is a
   later *visual* beat: a CSS `animation-delay` of 400 ms. It is not a state
   transition, not a timer and not a network event, and it never touches
   match state or next-round timing.
2. **Meta Reflex and Mastery.**
   - The viewer gets a per-card cue only where the server publishes it
     (`segmentState.ownRevealingCardIndex` + `ownCardReveals`).
   - The opponent gets **nothing per card**.
   - At block settlement, the cue is the block aggregate (`OPPONENT 3 / 5`).
     Mastery per-question overlay cues are not added (see Remaining).
3. **Next-round payload at resolution.** It is exposed as one seam,
   `upcomingRound(live, presented)`, which is published on the view model as
   `upcomingRound`. It is non-null for exactly the reveal beat. Phase 2A does
   nothing with it; Phase 2B's preloader attaches here.
4. **The server owns timing.** No beat was lengthened. The reveal hold is now
   *capped* by the server's `started_at` (see Exact timing).
5. **Round-1 lead-in** is not implemented; it is recorded under Remaining
   Phase 2B work below.

## Flow implementation

`src/lib/ranked-core/flow/rankedFlow.ts` is pure. It stores nothing and clones
no match state. `QuizRankedMatch` derives every value per render from:
- the controller's live snapshot (authority),
- the surface's lagging `renderedRound` (the one reference that already
  existed), and
- the settlement.

**Presentation phases** (`projectPresentationPhase`, published as
`view.presentationPhase`):

| phase | condition |
|---|---|
| `revealing` | `revealHold && lastResolved.roundNumber === presented round` |
| `module-intro` | the presented round's `started_at` is still in the future (server time via skew) |
| `waiting` | the server has the viewer's submission (`phase === "locked"`) |
| `answering` | otherwise |

**Events (cues)** come from `projectResultFeedback`:

| cue | source | id |
|---|---|---|
| viewer `round` {correct, incorrect, timed_out} | `lastResolved.players.p1.outcome` | `${matchId}:r${n}:user` |
| opponent `round` | `lastResolved.players.p2.outcome` (same settlement) | `${matchId}:r${n}:opp` |
| viewer `card` (Meta Reflex) | `cardBeat` while `ownRevealingCardIndex` names it | `${matchId}:r${n}:c${i}:user` |
| viewer / opponent `block` | `lastSegmentSettlement.reveal.players[id].correct / challengeCount` | `…:user` / `…:opp` |

**How round N is held while the server already has N+1.**
- `headerRound` = the surface round during `revealing`, otherwise the live
  round.
- These all read `headerRound` / `headerRoundNumber`:
  - the header module label ("1 / 10"), which also feeds the phone bar
  - the round title
  - the module title and its event id
  - the `FINAL` suffix
- The timer is **null** during `revealing`. The desktop centre shows the result
  face; the phone clock shows its existing `–:––` placeholder.
- The "Preparing next round…" transition note is suppressed during
  `revealing`.
- Scores, rails, award pops and the ledger still read live state and the
  settlement, because they *are* round N's result.
- The timeline is unchanged: node N shows resolved and the current marker is
  on N+1. That is round N's result, not N+1 content, and changing the
  timeline's plan logic is out of scope.

**Replay protection.**
- The round and block overlays render only while `revealHold` is true, and
  only live capture ever sets that (resume/backfill restore `lastResolved`
  without it). Refresh, reconnect and remount therefore never replay a cue.
- Each stamp is keyed by its event id, so polls and re-renders keep the same
  DOM node (tested).
- Cards: `QuizRankedMatch` records the card that was already revealing when
  the mount first saw the match (`cardBaselineRef`) and never cues it.

## Result overlay behavior

`src/components/ranked-arena/QuestionResultOverlay.tsx` is mounted as the last
child of the `ranked-question` section, which is `.ranked-panel`: relative and
overflow-hidden.

Geometry:
- `position:absolute; inset:0; pointer-events:none; z-index:15`
- no flow height, no overflow, no scroll

Contents (final, after the pre-merge visual polish):
- **Edge treatment:** an inset 3 px ring plus a 22 px inner glow (was 56 px at
  0.42 alpha; now 0.30). Green for success, red for failure, gold for a mixed
  block.
- **Tint (`.ranked-result-edge::before`):** a radial tint from the top
  (0.32 → 0.12 → 0.06 alpha) that **hits and settles**: opacity 0 → 1 by
  ~135 ms, down to 0.28 by ~450 ms, held at 0.28 (900 ms keyframe). The old
  full-strength top-26% linear wash is gone. Parchment texture and text stay
  visible. Under reduced motion, the animation is removed, so the tint renders
  directly at the settled 0.28.
- **Viewer stamp** at top centre, unchanged in size:
  - ✓ `CORRECT` (green)
  - ✗ `INCORRECT` (red)
  - ⏱ `TIMED OUT` (red)
  - `n / m CORRECT` for a block
  - Meta Reflex no longer appends `Card n`; the header's `n / 5` carries the
    position.
- **Opponent stamp** sits **directly under** the viewer stamp, centred, in one
  flex column (`.ranked-result-stack`, top 0.75rem, 0.4rem gap). The
  right-edge anchor and slide-in are removed.
  - Size: a small pill, 0.62rem type (0.70rem at ≥1024px), 1 px border,
    0.22/0.6rem padding.
  - Measured height: 20–21 px, against the viewer stamp's 35 px (mobile) and
    45 px (desktop).
  - It fades down 4 px, with a 450 ms delay and a 280 ms duration. It becomes
    fully visible about 600–630 ms after the viewer stamp.
  - Labels: `OPPONENT CORRECT` / `OPPONENT MISSED` (a timeout also reads
    MISSED), and `OPPONENT n / m` for a block.
- A single `role="status"` sr-only line announces both. The stamps themselves
  are `aria-hidden`.

The stage's reveal dim (`opacity-60`) is **not applied** when an overlay is
present, because it would dim the overlay and the tablets. It still applies to
a level-2 choice and to a reveal with no cue.

## Selected / correct answer behavior

- `useRankedMatch` keeps `answeredSelection = {roundNumber, optionId}` from
  the click. It is not cleared on the round boundary; the next answer
  supersedes it, and a failed submit clears it.
- `QuizRankedMatch` passes it as the surface selection only while the surface
  presents that round. Otherwise it passes the live `selectedOptionId`, which
  is still cleared at the boundary as before.
- This is a record of what was sent; the verdict still comes only from the
  settlement (`correctOptionIndex` and `p1.outcome`).
- `QuizAnswerOptions` gains an opt-in `markSelectionOnReveal`, passed by
  `AnswerGrid`. After a reveal, the picked tablet gets `data-your-pick`, a
  gold ring and an absolutely positioned **"YOUR PICK"** tag, so no tablet
  resizes. This is combined with the existing states:
  - picked and wrong: red tablet with ✗ + YOUR PICK
  - the true answer: ✓ on the correct tablet
  - picked and right: ✓ + YOUR PICK on one tablet

  The Quiz page is unchanged because the prop is off by default.

### Meta Reflex settled card (polish pass)

`metaReflexModule.tsx` `ChoiceCard` gains a `picked` prop (from the server's
`selectedCardId`). A settled side gets an absolutely positioned top-centre tag,
so the card does not resize:
- the wrong pick: red `✕ YOUR PICK` on a red-tinted card
  (`border-red-600 bg-red-500/15`)
- the untaken correct side: green `✓ CORRECT`
- the picked correct side: green `✓ YOUR PICK · CORRECT`

`aria-label`s state the same facts in words. There is no redesign of the card
layout.

## Exact timing behavior

**Reveal hold, anchored to the server** (`pacing.anchoredRevealHoldMs`):

```
hold = max(900, min(nominal, msUntil(started_at(N+1)) − 1400))
```

- `nominal` is 1500 ms, or 2600 ms with evidence, as before.
- With the normal 2900 ms server lead and on-time discovery, nothing changes.
- A late discovery (the client polls up to 1.5 s after the server resolved)
  now shortens the reveal instead of eating the module-title window.
- The 900 ms floor (`REVEAL_HOLD_MIN_MS`) is the smallest window in which both
  beats land.

**Input opens at `started_at`.** `useServerInstantWake(started_at, skewMs)`
schedules one timeout for the server instant (via skew) plus 8 ms of slack. It
is re-armed only when the instant or skew changes, and cleared on change and
unmount. It decides nothing; its re-render re-reads the same server fields.
There is no new polling loop.

**Opponent beat:** CSS 400 ms delay, 300 ms entrance, inside the hold.

**Latent bug fixed** (it was exposed by the shorter holds). `useAwardPops`
used to clear its removal timers whenever `event` changed identity, and its
played-set then blocked re-arming, so a pop could stay in state for the rest
of the match. This was Phase 1 §H defect 3. Timers now belong to the mount and
are cleared only on unmount.

## Reduced-motion behavior

- `src/hooks/useReducedMotionPreference.ts` is one live signal:
  - OS `prefers-reduced-motion`, through a media-query listener
  - Mogzy Settings → Reduce Motion, through a class observer on
    `html.reduce-motion`
- Under either, the overlay gets `ranked-result-overlay--still`: no movement
  and **no delay**, so both stamps are simply present with the same words and
  icons. The CSS fallbacks for both switches outrank the global 0.001 ms rule.
- The selected and correct tablet states are unaffected.
- Award pops under `html.reduce-motion` used to be invisible (their keyframe
  ends at opacity 0 and the global rule ran it in 0.001 ms). They now fade in,
  hold and fade out. This is scoped to `.ranked-award-pop`.

## Tests

New:
- **`src/pages/quiz-ranked/QuizRankedMatch.rfx1.test.tsx`** (10 tests). It
  runs the real controller against a server that resolves N and opens N+1 in
  one snapshot, with future `started_at` and live `server_time`:
  - the wrong pick persists and the correct answer shows at the same time
  - a correct pick is marked as both the pick and the answer
  - the pick is dropped after the swap
  - header and phone bar show `1 / 10` with no clock during the reveal, then
    `2 / 10` together
  - viewer and opponent cues come from one settlement with separate ids, the
    opponent is a separate element, and the stage is not dimmed
  - OPPONENT MISSED on a timeout
  - no replay across polls and after the beat
  - no replay on restore
  - reduced motion (`html.reduce-motion`) keeps every word
  - **input opens within 250 ms of `started_at`.** This test was verified to
    **fail** with the wake-up removed (4.6 s run, opened on the tick).
- **`src/lib/ranked-core/flow/rankedFlow.test.ts`** (12 tests): cue
  derivation and ids, restored / non-presented cases, block aggregate, card
  cue with no opponent, phase projection including skew, the `upcomingRound`
  seam, and hold anchoring.
- **`src/lib/ranked-core/flow/useServerInstantWake.test.tsx`** (5 tests):
  wakes exactly at the instant under fake timers, skew conversion, a
  superseded instant leaves one timer and unmount leaves none, and both
  reduced-motion switches.

Changed:
- `QuizRankedMatch.revealBeat.test.tsx` "delivers the result in the TOP
  strip" asserted `"Round 2"` in the strip **during** round 1's reveal. That
  was exactly the mixed-round state Phase 2A was approved to remove. It now
  asserts "Round 1" and not "Round 2" during the hold, and "Round 2" after it.

Regression runs (vitest, batched):

| Scope | Files | Tests | Failures |
|---|---|---|---|
| all `src/pages/quiz-ranked` | 48 | 509 | 0 |
| `src/components/ranked-arena` + `src/lib/ranked-core` + question-surface + `QuizAnswerOptions` | 79 | 1099 | 0 |
| other consumers of the changed components | 27 | 521 | 1 |

The one failure is `Quiz.rankedRole.test.tsx` "commits NOTHING for Practice
after a role change". It **reproduces on baseline with these changes
stashed**, so it is unrelated and was not fixed.

- `tsc -p tsconfig.app.json`: 14 errors, identical to baseline, none in
  touched files.
- `vite build`: OK.
- **Playwright `playwright.arena.config.ts` fit suite (unchanged): 400 passed,
  2 failed.**
  - `ranked-result-fit` "1600x900 › missing modules 4 and 7" failed with a
    `page.evaluate` error on the full run and **passes on rerun** at all
    7 viewports: a flake.
  - `ranked-arena-fit` "RMOB2 compact phone HUD › is 40px tall" reports 44
    instead of 40. It **fails identically on `origin/main` `3c9ddfc4`**, so it
    is pre-existing, unrelated and not fixed.
  - Every arena seating, clipping, no-scroll and media-yield case passed.

## Browser measurements (production build, real arena via the probe, scripted server)

These cover a normal round (wrong pick → cinematic item card next), Combat
Calculation next (right pick), and a live Meta Reflex card. "User"/"Opp" are
ms from reveal start until each stamp is at full opacity. The measured gap
between the two is 550–590 ms.

| viewport | overlay geometry Δ (stage, body, grid, 4 tablets) | h-overflow / doc scroll / nested scroll | header/phone bar during reveal | user / opp visible |
|---|---|---|---|---|
| 390×844 | 0 px, both beats | none / none / none | `1 / 10`, `–:––` | +80 / +673 |
| 360×800 | 0 px, both beats | none / none / none | `1 / 10`, `–:––` | +79 / +640 |
| 1440×900 | 0 px, both beats | none / none / none | `1 / 10`, `–:––` | +97 / +666 |
| 1280×720 | 0 px, both beats | none / none / none | `1 / 10`, `–:––` | +91 / +652 |

- Choice states during the reveal:
  - wrong pick: `correct, idle, incorrect-selected+PICK, idle`
  - right pick: `correct+PICK, idle, idle, idle`
- After the swap, the header, phone bar and card move to `2 / 10` together and
  no pick or overlay survives.
- **Meta Reflex:** the viewer stamp shows `INCORRECT` (polish pass: was `INCORRECT · Card 1`), there is **no
  opponent stamp**, and stage and body geometry are unchanged at all 4
  viewports.
- Console: only 403/429 responses from the probe's unauthenticated
  production-API reads (environmental, also present in Phase 1).
- The screenshots live in the session scratchpad (`p2a-*.png`) and are not
  committed.

**Pre-existing, observed and not changed:**
- The desktop header centre face (`CentralStage`) computes `rgb(15,23,41)`
  ink on the dark strip in the probe, so the header's own verdict and clock
  read very faintly. The card overlay now carries the result, but the header
  contrast should be looked at separately.
- The Ranked Rules scroll auto-opens on a first visit and can cover the right
  rail on desktop (probe, fresh context).

## Files changed

New:
- `src/lib/ranked-core/flow/rankedFlow.ts`
- `src/lib/ranked-core/flow/useServerInstantWake.ts`
- `src/hooks/useReducedMotionPreference.ts`
- `src/components/ranked-arena/QuestionResultOverlay.tsx`
- tests: `src/lib/ranked-core/flow/rankedFlow.test.ts`,
  `src/lib/ranked-core/flow/useServerInstantWake.test.tsx`,
  `src/pages/quiz-ranked/QuizRankedMatch.rfx1.test.tsx`

Modified:
- `src/pages/quiz-ranked/useRankedMatch.ts`: `answeredSelection` and the
  anchored hold.
- `src/pages/quiz-ranked/QuizRankedMatch.tsx`: presented round, cues, wake-up
  and selection.
- `src/lib/ranked-core/pacing.ts`: `anchoredRevealHoldMs`,
  `REVEAL_HOLD_MIN_MS`.
- `src/lib/ranked-core/arenaView.ts`: optional `resultFeedback`,
  `presentationPhase`, `upcomingRound`.
- `src/components/ranked-arena/CanonicalArena.tsx`: mounts the overlay; no dim
  under an overlay.
- `src/components/ranked-arena/AnswerGrid.tsx` and
  `src/components/quiz/QuizAnswerOptions.tsx`: the "Your pick" marker.
- `src/components/ranked-arena/AwardPops.tsx`: timer lifetime.
- `src/index.css`: overlay styles and the reduced-motion overrides.
- `src/pages/quiz-ranked/QuizRankedMatch.revealBeat.test.tsx`: one assertion
  inverted, as described above.
- `docs/handoffs/RFX1.md`

## Remaining Phase 2B work (approved direction)

1. **Server-owned Round-1 lead-in** (backend, `League_Combat_Simulator`):
   - `ranked_public/service.py::_presentation_for_previous_round` returns 0
     for `rn <= 1`. Give segment 1 an entry lead-in there.
   - Reuse `pacing.py` (for example an `ENTRY_LEAD_MS` of about
     `MODULE_TITLE_MS`) so `_start_round → _open_segment` sets round 1's
     `started_at` in the future through the existing `answerable_at`
     mechanism.
   - Round 1 is opened lazily by the first snapshot read
     (`get_rehydrated → _advance → _start_round`).
   - The full answer duration is preserved because `started_at` is the
     answerable instant.
   - Frontend: the intro can then fetch the first snapshot, prepare round-1
     media, and reveal at `started_at − title`.
2. **Targeted Tier 1/2/3 preloading.** `prepareImage` (dedupe, `decode()`,
   never rejects, timeout) plus `roundMedia(publicRound)` (pre-reveal assets
   only; never spoiler or reveal-only assets). The attachment points:
   - `view.upcomingRound` during `revealing`, with a bounded swap gate that
     never passes `started_at − 1400`
   - Meta Reflex: the whole `block.cards` at block start
   - Tier 1: during the lobby's 800 ms handoff
   - also: preconnect to the API origin and a `/quiz/ranked` route-prefetch
     entry
   - **No preload of the whole asset universe.**
3. **Ranked image optimization.** Candidates below. Don't overwrite canonical
   art that is used larger elsewhere.
4. **Entry intro**, once item 1 lands. It performs real work, with a minimum
   of about 700–1000 ms only to avoid a flash.
5. **Smaller follow-ups:**
   - Mastery-slice per-question viewer cue (from `ownChallengeReveals`; it
     has no server reveal-window index today)
   - header centre-face contrast (pre-existing)
   - the 25 ms grid re-open after submit (Phase 1 §E.5)
   - `CentralStage` title timer can stick (Phase 1 §H.4)

### Image optimization candidates (Phase 2B; measured in Phase 1 M3)

| asset | now | used by | recommendation |
|---|---|---|---|
| `public/assets/ranked/ranked-vellum-texture.png` | 2292 KB, 1254² | `index.css` (Ranked folio only) | tile-able texture: WebP ~768² q≈80, globally safe (single consumer) |
| `public/assets/ranked/ranked-academy-duel-bg.png` | 2040 KB, 1672×940 | `index.css`, dev QuizRenderPage | full-bleed backdrop: WebP/AVIF 1672×940 q≈75 (plus an optional 960w for phones via `image-set`) |
| `public/assets/ranked/navy-banner2.png` | 1256 KB, 959×1641 | `index.css`, `CombatantPanel` | rail about 15–17 rem wide: WebP ~640w q≈82 (alpha) |
| `public/mascot/ranked/{top,jg,mid,bot,sup}mogzy.png` | 858–1023 KB each, 1254² | `RoleMascot` in the arena (~104 px), **also the lobby `RankedClassCarousel`, `PlayScrollRoleSelector` and result duel (larger)** | Ranked derivative at 2× the largest *Ranked-arena* size (~256² WebP alpha, ~30–60 KB); keep the originals for the lobby until its rendered size is measured |
| `public/mascot/mogzy-mascot-base-v1.png` | 2195 KB, 1024×1536 | `MogzyIdentityMenu` (HUD avatar), `MogzyHubGuide`, `mascot-assets` | HUD avatar derivative (~96² WebP); the hub guide keeps the original |
| `public/mascot/mogzy-hat-transparent.png` | 849 KB, 1254² | `GlobalHud` only (~37 px) | globally safe: ~128² WebP |
| `public/mascot/mogzy-{explaining,peeking,raising-hand}-transparent.png` | ~1 MB each, 1024×1536 | Rules-scroll `MogzyExplainsPanel` (36–56 px) plus other `MOGZY_MASCOT_ASSETS` uses | panel-size derivatives (~160 px tall WebP); also defer until the panel opens |
| `public/assets/ranked/jungle_pets/jungle_grass_background.png` | 648 KB, 1280×720 | `jungleAtmosphere.ts` (question band) | WebP ~960w q≈75; Tier-3 preload covers the rest |

Ignore sub-50 KB files (role SVGs, item icons).

## Final Phase 2A visual polish (pre-merge)

Scope: presentation only. There are no changes to state, the result flow,
event ids, timing, scoring, layout or the preload seam.

Changes:
1. Opponent result stacks centred under the player stamp at about 60% of its
   height, on both mobile and desktop.
2. The wash goes from a heavy hit to a faint tint. The ring and the stamp
   carry the verdict.
3. The Meta Reflex settled card names the pick and the correct side.
4. There is no `Card N` in the stamp.

Verification: production build, the probe harness, Playwright. Screenshots are
in the session scratchpad `pol-*.png`.

| state | stage/body/grid/tablets Δ | h-overflow / doc scroll / nested | stamp → opponent rects |
|---|---|---|---|
| 390×844 wrong + opp correct | 0 | none | 184×35 @y123 → 162×20 @y165 |
| 390×844 correct | 0 | none | 162×35 → 162×20 @y165 |
| 390×844 Meta Reflex wrong | 0 (mr-surface too) | none | stamp only |
| 1440×900 correct / wrong | 0 | none | 223–257×45 @y105 → 180×21 @y156 |
| 390×844 reduced motion (all 3) | 0 | none | same rects; both present at t=0 |

Viewer → opponent full visibility measured 600–630 ms apart.

Harness note: 3× DPR mobile screenshots take longer than the rest of the
hold, so the "opponent" capture must use `scale: "css"`. The Phase 2A 390
opponent shots had captured the next round.

Phase 2A is ready to merge.

## Integration

Merged to frontend `main` as merge commit `1ee7ac59` (`--no-ff`, approved tip `e784a1af` preserved) on 2026-09-19, over `origin/main` `82b7acf6` (+2 docs-only gr1 commits since the branch base `3c9ddfc4`, no file overlap). Phase 2A is complete; Phase 2B1 is next.

---
---

# Phase 2B1: Round-1 lead-in and targeted media preloading

Status: **implemented and committed on two scoped branches. Not merged.** No
visible intro and no asset re-encoding; both belong to Phase 2B2.

## Baselines

| | |
|---|---|
| Frontend | `/Users/macmoney/mogsy-wt-rfx1-2b1`, branch `rfx1/phase2b1`, on `origin/main` **`0bddb784`**. Phase 2A (merge `1ee7ac59`) is present. `main` did not move during the work. |
| Backend | `/Users/macmoney/lcs-wt-rfx1-2b1`, branch `rfx1/phase2b1-round1-leadin`, on `origin/master` **`fc19ba57`**. `master` moved to `cf1d2db2` (Combat Lab items only), with no overlap; the branch was rebased onto it. |

## ⚠ The Phase 1 premise about Round 1 was wrong

Phase 1 §A.5 said the first snapshot read opens Round 1. On current master it
does not. **Round 1 is opened inside the creation transaction**: in the queue's
pairing pass, or in the admin bot match (`create_match_rows → _open_segment`).
Its `started_at` was set to the creation instant. The clock therefore already
ran while the client:
- discovered the match (up to one 2 s queue poll),
- played the lobby's 800 ms matched beat,
- loaded the route, and
- fetched the first snapshot.

The player lost about 2–3 s of Round 1 **today**, before any intro existed.

The same fact makes stability simple. `started_at` is written once, at
creation, and every read only rehydrates it.

## Round-1 lead-in contract (backend)

`ranked_public/pacing.py`:

```
ENTRY_DISCOVERY_MS = 2000   # mirrors useRankedQueue POLL_MS
ENTRY_HANDOFF_MS   = 800    # mirrors PlayScrollRecord DEFAULT_HANDOFF_MS
MODULE_TITLE_MS    = 1400   # existing
entry_lead_ms("queue")        = 2000 + 800 + 1400 = 4200
entry_lead_ms("bot_playtest") =        800 + 1400 = 2200   # the creating POST returns the id; no discovery poll
entry_lead_ms(anything else)  = 0                          # admin_test, direct, fixtures, legacy
```

`create_match_rows` passes `entry_lead_ms(creation_source)` as the
`presentation_ms` of segment 1's `_open_segment`. This is the **same mechanism**
every later round uses:
- `answerable_at = now + lead`, and that becomes the round's `started_at`;
- the deadline, the card deadlines, the bot's response offset, the engine's
  "answer received before round start" guard and the speed bonus all derive
  from `started_at`.

The configured answer window is therefore unchanged. It simply begins later.

**Why 4.2 s rather than the ~1.4 s suggested.** The lead is anchored at
**creation**, not at a read. A 1.4 s lead would be entirely consumed before
the client even has the payload (discovery plus handoff is already about
1.8–2.8 s). Each term mirrors a client constant, and nothing is added for
effect. The admin/staff test path keeps 0, so existing fixtures and the staff
tool are unchanged.

## Stable timestamp behavior (proof)

`started_at` is persisted in the `ranked_rounds` row inside the creation
transaction. No read path recomputes it:
- `get_rehydrated` (snapshot), the `/resume` route and the heartbeat all
  rehydrate from the row;
- `_advance` never re-opens an existing round.

Tests in `test_ranked_answerable_boundary.py`:
- `test_repeated_reads_never_move_round_1s_start`:
  - reads by both participants at T0, T0+300 ms, start−1 ms, start, start+1 s
    and start+4 s;
  - the order alternates, so neither "first" nor "second" reader can anchor
    the round;
  - a heartbeat between reads.
  - `started_at` and `active_deadline` are identical at every read.
- `test_reconnect_does_not_restart_the_lead_in`: a read during the lead, then
  a read 7 s after the boundary, return the original `started_at`.
- `test_round_1_gets_one_future_authoritative_start[queue|bot_playtest]`:
  `started_at == created + entry_lead_ms`.
- `test_round_1_answer_duration_is_unchanged[queue|bot_playtest]`:
  `deadline − started_at` equals the zero-lead staff match.
- `test_round_1_submission_before_the_boundary_is_refused`: start−1 ms is
  refused, and response timing is measured from `started_at`.
- `test_round_2_lead_in_is_unaffected_by_the_entry_lead_in`.
- `test_entry_lead_in_is_the_entry_path_and_nothing_else`.

Bot matches: the bot already answers at `round.started_at + offset`
(`_drive_one_bot_match`), so it moved with the boundary and needed no change.
Two fixtures that answered bot-match Round 1 at the creation instant
(`test_ranked_item_cost_duel_runtime._reach_icd` and
`test_ranked_one_click_interactions`) now answer relative to the round's own
`started_at`. They were pinned to the old contract.

## Tier 1: persistent assets

| Asset | Trigger |
|---|---|
| `ranked-academy-duel-bg.png`, `ranked-vellum-texture.png`, `navy-banner2.png` (CSS backgrounds, `rankedChrome.ts`) | **lobby matched beat** (`warmRankedEntry`), then arena mount (a dedupe no-op) |
| the viewer's own role mascot (`/mascot/ranked/{role}mogzy.png`, the role they queued as, which is the role the match froze) | lobby matched beat |
| the opponent's mascot (and the viewer's again) | the first snapshot that names the frozen roles |
| the Ranked route code (`import("@/pages/quiz-ranked/QuizRankedPage")`, the same specifier `App.tsx` lazily imports) | lobby matched beat |

`PlayScrollRecord`'s handoff effect calls `warmRankedEntry(displayRole)` and
then waits its unchanged 800 ms. No delay is added.
- **Deliberately not warmed:** the other four mascots, and every non-Ranked
  Mogzy image (HUD avatar, hat, Rules-panel poses).
- **No `preconnect`:** the lobby has been polling the queue on the same API
  origin the whole time, so that connection is already warm.

Priorities:
- chrome: `low`, no decode (CSS);
- arena mascots: `low`, because at ~1 MB each they must not outrank question
  art;
- own mascot at the handoff: `auto`, because nothing else is loading then.

`rankedChrome.ts` is kept tiny on purpose: the lobby bundle imports it, and it
must not pull in the question-surface code.

## Tier 2: the current round

`useRankedMediaPreparation({ live, presented })` in `QuizRankedMatch` prepares
the **presented** round's media (critical: `high` + decode; best-effort: `low`)
as soon as its payload is known. The effect is keyed by
`matchId:round:questionId`, so polls of the same round restart nothing.

**Round 1's bounded entry wait** (`useEntryPreparation` +
`pacing.entryPrepBudgetMs`):
- When the first snapshot arrives with lead-in remaining, the arena keeps its
  **existing** "Entering the arena…" placeholder while Round 1's critical media
  loads and decodes.
- It waits at most `min(ENTRY_PREP_CAP_MS 1500, msUntil(started_at) −
  ENTRY_MIN_LEAD_MS 700)`.
- The decision is made once, synchronously, from the first snapshot, so the
  arena never flashes before the placeholder.
- A reload into a running round has no budget and does not wait (tested).
- Gameplay wins: the question is revealed when media is ready **or** the
  budget ends. Input opens at `started_at` either way. The frontend never
  extends the start.

## Tier 3: the next round

The same hook prepares `upcomingRound(live, presented)` (the Phase 2A seam)
**the moment it exists**, which is the snapshot that starts the reveal. The
requests therefore begin about 1.5 s **before** the swap instead of at it.

**Bounded swap gate.** `useRankedMatch` keeps its single reveal-hold owner. It
gains an optional `prepareRound(round)`:
- When the nominal (server-anchored) hold expires, if the next round's
  critical media is still in flight, the hold stays up until that media
  settles.
- It never stays up past `started_at − SWAP_MEDIA_MIN_LEAD_MS (1000)`.
- Because the hold itself is extended, the Phase 2A presentation stays
  coherent: the overlay, the header "1 / 10", the null clock and the old
  question all remain N together, with no mixed state.
- A hold token stops a superseded hold's media wait from ending a newer hold.
- Input still opens at `started_at` (`useServerInstantWake`, unchanged).

## Meta Reflex

A Meta Reflex block round carries all five cards in
`segmentState.block.cards`. `rankedRoundMedia` returns **both sides of all five
cards**, so the whole block is prepared when the block round becomes known:
- as Tier 3 during the previous round's reveal;
- at the latest as Tier 2 at block start.

Advancing card by card re-requests nothing (tested). Preparation is bounded to
the active block: only that round's payload is read.

## Anti-cheat findings

`rankedRoundMedia(round)` is pure. Its only input is the **public** round (plus
an optional champion manifest and the viewport width). It never reads a
settlement, `correctOptionIndex`, a private payload or any answer field.

| Risk | Finding | Handling |
|---|---|---|
| Spoiler subject (subject is the answer) | Pre-reveal the card is `placeholder` | Uses `selectScenario(src, false, null)`, exactly what `HeroBand` renders pre-reveal. Nothing is requested (tested). |
| Reveal-time champion upgrade (`deriveRevealSubject` → splash of the **correct option**) | The one truly answer-dependent URL on the surface | Never computed. No option splash is requested even with the manifest present (tested). |
| Build-path `missingComponent` (the recipe **answer**, drawn only after reveal) | Parsed from the payload by `getItemAnalysisSubject` | Never read. A payload carrying `missing_component_*` produces no request for it (tested). |
| Option icons | Could single out an option | Requested for all options or none, with the same positional all-or-nothing rule as `questionViewFromPublicQuestion` (tested). |
| Meta Reflex recognition art | The file name would be the answer | Already served by the positional `/api/ranked/media/segment-card/{match}/{seg}/{i}/{side}.png`. The URL names a side, never a subject. The backend serves both sides of every card symmetrically and never says which is correct, so preloading all five cards reveals nothing a player is not shown (tested). |
| Mastery slice | — | Structural path: `revealActive=false` / `correctAnswer=null`, as the surface hard-codes. Prose path: the compact band only. |
| Next-round (Tier 3) | N+1's payload is already in the public snapshot during N's reveal | Nothing new is exposed. |

Conclusion: every preloaded URL is one the pre-reveal surface itself requests
for that payload. The network panel shows nothing a DOM inspection of the
visible question would not.

## Preload/decode implementation

- **`prepareImage(url, {priority, decode, timeoutMs})`** (`media/prepareImage.ts`):
  - a module-level `Map<normalizedUrl, entry>` dedupes in-flight and completed
    loads;
  - uses `new Image()` + `fetchPriority` + `decoding=async`, then `decode()`
    where supported (a decode failure still counts as `ok`);
  - **never rejects**: `"ok" | "error" | "timeout"`;
  - the timeout belongs to the caller, so a later caller can still join the
    same load;
  - errors are forgotten (a later round may retry); successes are
    remembered;
  - the `HTMLImageElement` is dropped on settle, and no decoded bitmap is
    retained. The browser HTTP cache does the caching.
  - The map is capped at 400 settled entries.
- **`rankedRoundMedia(round)`** (`media/roundMedia.ts`) → `{critical,
  bestEffort}`:
  - covers quiz (family / compact / cinematic bands, option icons), Meta
    Reflex, legacy Item Cost Duel and the Mastery slice;
  - motif accents are best-effort and skipped below 640 px, where the layer is
    `display:none`;
  - a test pins every motif and chrome path to `index.css`.
- **Champion manifest:** read **optionally** through `QueryClientContext` with
  the now-exported `championAssetsQuery`, the same query every champion card
  uses, so only the fetch starts earlier. The arena still renders without a
  provider (tests, probes).
- **Performance marks** (measurement only): `ranked-prep:{tier1,current,next,entry}:{start,ready}:…`.

## Entry preparation state (for 2B2)

- `view.entryPhase` = `projectEntryPhase(...)`, one of `match-unresolved |
  preparing | ready | live`.
- The placeholder also carries `data-entry-phase` (`match-unresolved` /
  `preparing`).
- `ready` means the first question is prepared and on screen before
  `started_at`. `live` means `started_at` has passed.

Phase 2B2's visible intro can occupy exactly the `preparing` + `ready` window.

## Measurements

Method:
- Production builds under `vite preview`: **before** = `origin/main` `0bddb784`
  (:8451); **after** = this branch (:8452).
- The real `/dev/ranked-shell-probe` (real `QuizRankedMatch` and arena) with a
  scripted server wrapped around the probe's interceptor.
- Headless Chromium with CDP throttling:
  - phones: 1.6 Mbps, 150 ms, 4× CPU;
  - desktop: 9 Mbps, 40 ms.
- Request start = CDP `requestWillBeSent`, because Resource Timing omits
  in-flight requests.
- Cold entry, per the backend change:
  - before: `started_at` = first read − 2.4 s, the typical entry path already
    spent;
  - after: `started_at` = first read + 1.8 s (4.2 s queue lead − 2.4 s).
- Scripts and screenshots are in the session scratchpad
  (`rfx1-2b1-measure.mjs`, `b1-*.png`), not committed.

**Cold Round 1** (ms from first snapshot):

| run | R1 media req | R1 media done | decoded | question visible | `started_at` | input active | answer time kept |
|---|---|---|---|---|---|---|---|
| before 390 media | 38 | 659 | — | 40 | **−2400** | 40 | lost ≥2.4 s |
| after 390 media | 11 | 571 | 571 | 611 | 1800 | 1832 | full |
| before 390 Combat Calc | 51 | 4932 | — | 57 | −2400 | 57 | lost ≥2.4 s |
| after 390 Combat Calc | 11 | 4783 | budget 1110 | 1148 | 1800 | 1819 | full |
| after 360 media / Combat Calc | 11 / 11 | 602 / 4728 | 603 / 1109 | 641 / 1147 | 1800 | 1814 / 1814 | full |
| before 1440 media | 11 | 328 | — | 21 | −2400 | 21 | lost ≥2.4 s |
| after 1440 media | 3 | 340 | 340 | 349 | 1800 | 1822 | full |
| after 1440 Combat Calc | 3 | 1263 | 1104 | 1117 | 1800 | 1811 | full |

- Tier 1 chrome starts before the first snapshot in both builds, because the
  CSS applies on the placeholder shell. Mascots start 3–11 ms after the
  snapshot (after) versus 11–50 ms (before).
- The probe has no lobby, so the handoff warm is covered by tests instead: the
  matched beat calls `warmRankedEntry` with the queued role, and it requests
  only the chrome plus that one mascot.
- On a phone the Combat Calculation splash (a 5 s download) cannot finish
  inside the lead-in. The entry wait gives up at its budget (1.1 s) and
  gameplay proceeds.

**Round N → N+1** (ms from the server resolving N; next lead 2900):

| run | snapshot with N+1 | next media req | next media done | swap | `started_at` | input |
|---|---|---|---|---|---|---|
| before 390 Combat Calc | 1 | **1523** | pending at 6.5 s | 1524 | 2900 | 2919 |
| after 390 Combat Calc | 1 | **30** | 5861 | 1922 (gate, capped) | 2900 | 2916 |
| before 390 jungle pet | 0 | **1523** | pending | 1525 | 2900 | 2921 |
| after 390 jungle pet | 1 | **28** | pending | 1921 (capped) | 2900 | 2916 |
| before 360 Combat Calc / jungle | 0–1 | 1521 / 1517 | pending | 1523 / 1517 | 2900 | 2920 / 2927 |
| after 360 Combat Calc / jungle | 0–1 | 34 / 32 | 5853 / pending | 1917 / 1921 | 2900 | 2915 / 2916 |
| before 1440 Combat Calc | 0 | 1507 | 2714 | 1526 | 2900 | 2920 |
| after 1440 Combat Calc | 0 | **9** | 1176 (ready 1180) | 1526 (no wait needed) | 2900 | 2948 |
| before 1440 jungle | 0 | 1506 | pending | 1513 | 2900 | 2926 |
| after 1440 jungle | 0 | **9** | 5257 | 1911 (capped) | 2900 | 2915 |

- **`next media request start < question swap` in every after-run**, by
  1.5–1.9 s. Before, the requests started at the swap.
- Desktop Combat Calculation is now decoded **before** the swap: 1180 ms
  against a 1526 ms swap.
- Where media cannot arrive in time (phone), the swap waits only until
  `started_at − 1000`.
- Input opens 15–48 ms after `started_at` in every run, before and after.

**Meta Reflex** (block round mounted from the probe): before, **2** API images
were requested at mount (card 1 only). After, **9** distinct card images were
requested at mount (−261…+257 ms), which is every card side the probe's block
carries. Cards 2–5 no longer wait to become current.

**Browser checks:** at 390×844, 360×800 and 1440×900, every scenario showed
no horizontal overflow, no document scroll and no nested scroll. The only
console error is the probe-environment 403 already recorded in Phases 1/2A. No
mixed old/new surface appeared, because the hold extension keeps round N
coherent. Phase 2A feedback is unchanged (48/509 quiz-ranked tests, including
`QuizRankedMatch.rfx1.test.tsx`). When images never load, the entry wait and
the swap both end at their budgets and gameplay continues (`rfx1b1` tests).

## Tests

Frontend (new):
- `media/prepareImage.test.ts` (7): dedupe by normalized URL, reuse of an
  in-flight load, reuse of a completed load, decode, error without rejection
  plus retry, timeout at budget, a later caller joining past a timeout, and
  null.
- `media/roundMedia.test.ts` (14):
  - bands: recipe, lifecycle family, cinematic Combat Calculation, shopkeeper,
    jungle pet, compact, motif by viewport, stylesheet pinning;
  - **anti-cheat**: `missingComponent`, spoiler, champion upgrade,
    all-or-nothing options, no settlement input;
  - Meta Reflex: all 5 cards.
- `media/useRankedMediaPreparation.test.tsx` (3): Meta Reflex block prepared
  as Tier 3 and at block start, and no re-request per card.
- `media/warmRankedEntry.test.ts` (2): chrome plus only the own mascot, and
  dedupe.
- `pages/quiz-ranked/QuizRankedMatch.rfx1b1.test.tsx` (5, real controller):
  - Tier 3 request while the result is still on the card, and before the swap;
  - the swap gate waits, capped at `started_at − 1000`, with input AT
    `started_at`;
  - the Round-1 placeholder is `preparing` and bounded, with input at
    `started_at`;
  - no wait on resume;
  - the wait ends early when media is ready.
- `RankedPlayScroll.test.tsx` (+1): the matched beat warms with the queued
  role.

Backend (new, in `test_ranked_answerable_boundary.py`): the 9 cases listed
above.

Results:

| Suite | Result |
|---|---|
| vitest: quiz-ranked, ranked-arena, ranked-core, question-surface, quiz, quiz-broadcast, hooks, question-surface lib | 184 files / 2716 tests: 1 failure (`LeaguecraftRecord.vellum` "draws only from Ranked art already committed here"). It **fails identically with these changes stashed**; pre-existing and not fixed. |
| vitest: media + play-scroll after the handoff tests | 6 files / 198 passed |
| `tsc -p tsconfig.app.json` | 14 errors, the baseline count, none in touched files |
| `vite build` | OK |
| Backend Ranked suite, fresh worktree (empty stub DB) | 318 failed / 2312 passed on **both** pristine master and the branch. Identical failure sets; environment-caused (503 from an empty bank). |
| Backend bank-dependent suites against a copy-on-write clone of the real `lol_calc.db` | The branch's failure set is a **subset** of pristine master's. The differences are 1–3 order/time flakes (`test_quiz1_phase11_answer_disclosure`, `test_ranked_public_routes::test_submission_flow_and_resume`) that flip on both trees. |

## Files changed

Frontend (`rfx1/phase2b1`):
- new:
  - `src/lib/ranked-core/media/prepareImage.ts`
  - `src/lib/ranked-core/media/roundMedia.ts`
  - `src/lib/ranked-core/media/rankedChrome.ts`
  - `src/lib/ranked-core/media/useRankedMediaPreparation.ts`
  - `src/lib/ranked-core/media/warmRankedEntry.ts`
  - the 5 test files above
- modified:
  - `src/pages/quiz-ranked/QuizRankedMatch.tsx`: preparation hooks, the entry
    wait, `entryPhase`, `prepareRound`;
  - `src/pages/quiz-ranked/useRankedMatch.ts`: the `prepareRound` option and
    the bounded swap gate inside the existing hold;
  - `src/lib/ranked-core/pacing.ts`: `SWAP_MEDIA_MIN_LEAD_MS`,
    `swapMediaWaitMs`, `ENTRY_PREP_CAP_MS`, `ENTRY_MIN_LEAD_MS`,
    `entryPrepBudgetMs`;
  - `src/lib/ranked-core/arenaView.ts`: optional `entryPhase`;
  - `src/components/ranked-arena/CanonicalArena.tsx`: placeholder
    `data-entry-phase`;
  - `src/components/quiz/play-scroll/PlayScrollRecord.tsx`: Tier 1 at the
    handoff;
  - `src/hooks/useChampionAssets.ts`: exported `championAssetsQuery`, same
    query;
  - `src/components/quiz/play-scroll/RankedPlayScroll.test.tsx`: +1 test;
  - this handoff.

Backend (`rfx1/phase2b1-round1-leadin`):
- `ranked_public/pacing.py`: `ENTRY_DISCOVERY_MS`, `ENTRY_HANDOFF_MS`,
  `entry_lead_ms`;
- `ranked_public/service.py`: creation passes the entry lead to
  `_open_segment`, plus a docstring;
- `test_ranked_answerable_boundary.py`: +9 tests;
- `test_ranked_item_cost_duel_runtime.py` and
  `test_ranked_one_click_interactions.py`: Round 1 is answered relative to
  its own `started_at`.

## Unresolved / notes

1. **Lead-in value (owner check).** It is 4.2 s for queue matches and 2.2 s
   for bot matches, anchored at creation, rather than ~1.4 s. The reasoning is
   under "Why 4.2 s" above. Until the 2B2 intro exists, the player sees Round
   1's question, locked, for about 1.2–1.8 s before it opens. That is the same
   visible-but-locked state later rounds already have during the module
   title.
2. **The swap gate can overlap the header title by up to 400 ms.** The title
   (1400 ms) plays from the swap. When the gate holds to `started_at − 1000`
   on a slow phone, the header face is still showing the title for its last
   ≤400 ms after input opens. Input is unaffected. Setting
   `SWAP_MEDIA_MIN_LEAD_MS = MODULE_TITLE_MS` removes the overlap and
   effectively disables the gate.
3. The staff/admin `create_test_match` path keeps a 0 lead-in.
4. On phones, a 5 s Combat Calculation splash and the 648 KB jungle ground
   still cannot load inside any lead-in. That is asset weight, which Phase
   2B2 addresses.

## Phase 2B2 image analysis (measured; nothing converted)

Rendered sizes are from the production build at 1440×900, 1920×1080 and
390×844 @3×. Output sizes are **in-memory WebP estimates** made with Pillow;
no file was written.

| asset | now | rendered in Ranked | other usages | Ranked-specific derivative? | recommendation | est. bytes |
|---|---|---|---|---|---|---|
| `ranked-vellum-texture.png` | 2292 KB, 1254² | stretched (`cover, 100% 100%`): 626×704 (1440), 743×872 (1920), 374×644 @3× phone | CSS only (4 selectors, all Ranked/Leaguecraft folio) | no, a global swap is safe | WebP at **1254²** q≈78 (keep resolution: the phone @3× is already at its limit) | ~67 KB (−97%) |
| `ranked-academy-duel-bg.png` | 2040 KB, 1672×940 | `::after` cover: 1216×896, 1440×1076, 390×796 | dev `QuizRenderPage` | no | WebP 1672×940 q≈75, plus an `image-set` 960w for phones | ~95 KB / 37 KB (−95%+) |
| `navy-banner2.png` | 1256 KB, 959×1641 | rails 267×704 (1440), 316×872 (1920); **hidden on phone** | `CombatantPanel` (the same rail) | no | WebP **640w** alpha q≈82 | ~51 KB (−96%) |
| `{top,jg,mid,bot,sup}mogzy.png` | 858–1023 KB each, 1254² | 89×104 (1440), 105×123 (1920), 43×43 @3× phone | **lobby `RankedClassCarousel` / `RankedLobbyHero` at larger sizes** | **yes**: keep the originals for the lobby | Ranked arena derivative **256²** WebP alpha | ~13–15 KB each (−98%) |
| `mogzy-mascot-base-v1.png` | 2195 KB, 1024×1536 | HUD avatar 75×112 | `MogzyHubGuide` (large), `mascot-assets` | **yes** | HUD derivative 240×360 WebP | ~18 KB (−99%) |
| `mogzy-hat-transparent.png` | 849 KB, 1254² | GlobalHud 37×37 (28 phone) | GlobalHud only | no, global | 128² WebP | ~4 KB (−99%) |
| `mogzy-{explaining,peeking,raising-hand}-transparent.png` | ~1 MB each, 1024×1536 | Rules scroll 36–56 px | `AcademyCommons`, `MogzyDock`, `QuestionReportScroll`, welcome `sceneAssets` (larger) | **yes** | panel derivatives ~160×240 WebP; also defer until the Rules panel opens | ~8 KB each (−99%) |
| `jungle_grass_background.png` | 648 KB, 1280×720 | question band | `jungleAtmosphere.ts` only | no | WebP 960w q≈75 | ~15 KB (−98%) |
| `question-accents/champ-combat.png` | 1221 KB, 1405×1119 | desktop motif (hidden <640 px) | CSS only | no | WebP ~700w q≈80 | ~138 KB (−89%) |
| `src/assets/ranked/item-shopkeeper.png` | 712 KB | item card backdrop | Broadcast cards | check the Broadcast size first | WebP at its rendered cutout size | not measured |

Total Ranked-arena chrome plus both mascots goes from about **7.5 MB to about
0.25 MB**, and the non-Ranked Mogzy art on the route from about **5–6 MB to about
45 KB**. That is the dominant remaining cost on phones (Phase 1 M3/M4).

## Concrete Phase 2B2 recommendation

1. **Derivatives, not overwrites.**
   - Add `*.webp` siblings for the four global-safe assets: vellum, backdrop
     (+960w `image-set`), banner, hat.
   - Add Ranked-specific derivatives for the five role mascots (256²), the
     HUD avatar and the three Rules poses.
   - Keep every original that a larger surface uses: the lobby carousel/hero,
     the hub guide and welcome.
   - Point only `index.css`, `RoleMascot` (arena sizes), `GlobalHud`,
     `MogzyIdentityMenu` and `MogzyExplainsPanel` at them, then update
     `RANKED_CHROME_URLS` / `MOGZY_ROLE_ASSETS`-for-arena.
   - Verify visually at 3× DPR.
2. **Entry intro** on `view.entryPhase` / `data-entry-phase`:
   - it occupies `preparing` → `ready`;
   - it reveals at `started_at − ~700 ms` or when ready;
   - it never extends `started_at`;
   - with 2B1's lead-in it has about 1.2–1.8 s on a queue match and more on a
     bot match.
3. Defer the Rules-scroll mascots until the panel opens, and set
   `fetchpriority=low` on the HUD art on `/quiz/ranked`.
4. Revisit `SWAP_MEDIA_MIN_LEAD_MS` (note 2) once assets are light. The gate
   will rarely need to hold at all.

---

## Phase 2B1 closeout (approved before merge)

Two items, both timing. Nothing in the preload architecture changed: the
Round-1 lead-in, the three tiers, `prepareImage`, the media descriptor, the
anti-cheat rule, the Meta Reflex block preload, the bounded waits and input at
the server's `started_at` are all as described above.

### 1. Queue lead-in: unchanged at 4200 ms

Approved as restoration of time previously lost before first interaction.
Still applied once, at match creation.

### 2. Bot lead-in: traced, and kept at 2200 ms

The bot entry path, read rather than assumed:

| term | present on the bot path? | evidence |
|---|---|---|
| discovery poll | **No** | `POST /api/ranked/queue` with `match_with_bot` creates the match **inside that request** (`routes/ranked_public.py` → `_create_admin_bot_match` → `service.create_bot_match`) and returns a **matched** queue snapshot carrying the id. `useRankedQueue.joinWithoutClass` applies that status directly; nothing polls for it. |
| 800 ms lobby handoff | **Yes** | `matchWithBot` "changes nothing about this state machine … the existing matched → handoff beat carries the player into the arena with no extra state, no polling, and no bot-specific branch". `PlayScrollRecord`'s handoff effect is keyed on `queue.state === "matched"`, which a bot join reaches the same way a pairing does. |
| module-title window | **Yes** | The same `MODULE_TITLE_MS` beat every round is owed; the arena has no bot-specific presentation. |

So the bot lead-in is `ENTRY_HANDOFF_MS + MODULE_TITLE_MS = 2200`, and it
differs from the queue's 4200 by exactly the discovery term. A test pins both
that arithmetic and the source-level fact that the bot join creates its match
in its own request.

**Client-side time between bot creation and first payload**: the join
response, the SPA navigation (its chunk warmed at the handoff by Tier 1) and
the first snapshot fetch — about **0.3–0.6 s** on top of the 800 ms handoff,
so roughly **1.1–1.4 s** in total. Measured against a modelled 1.4 s, Round 1
was decoded at **112 ms** and visible at **146 ms** after the first snapshot,
leaving about **0.65 s** of prepared, locked question before `started_at`.
That is why nothing was added: the unmodelled 0.3–0.6 s is spent **inside** the
title window, never out of the answer window. The queue's 2000 ms discovery
term is an upper bound that absorbs the same costs on its own path; padding the
bot path to match would be inventing time.

### 3. The presentation cutoff

**Invariant: once `started_at` is reached the arena is unmistakably the live
question. No intro face may be up while input is open.**

Before this closeout the module title ran `MODULE_TITLE_MS` from the swap, so
a swap that had waited for media could leave the header's module face up past
`started_at` (measured at 36–53 ms on the baseline, and up to ~400 ms in the
worst gated case).

Two changes, both anchored on the server instant, and **neither delays input
or reduces preload time**:

1. `pacing.moduleTitleWindowMs(msUntilAnswerable, nominal)` caps the title at
   `started_at − MODULE_TITLE_END_MARGIN_MS (150)`. `QuizRankedMatch` passes
   it through `view.header.moduleTitleWindowMs` and `CentralStage` uses it
   instead of the fixed beat. A round that is **already** answerable (a late
   discovery) plays **no** title at all.
2. `projectPresentationPhase` leaves `module-intro` at the same boundary
   (`cutoffMarginMs`, default 150 ms), and a second `useServerInstantWake` at
   `presentationCutoffAt(started_at)` makes that flip happen **then**, rather
   than being re-evaluated by the render that opens input.

`view.presentationPhase` and `view.entryPhase` are now also published as
`data-presentation-phase` / `data-entry-phase` on the arena root, so the
invariant is observable in tests and in the browser.

The swap gate is unchanged (`started_at − 1000`), so media preparation keeps
the same window; only the title shortens under it.

### Closeout measurements

Same method as above (production builds, real arena via the probe, CDP
throttling: phone 1.6 Mbps / 150 ms / 4× CPU, desktop 9 Mbps / 40 ms). Cold
entry models the path already spent before the first snapshot: queue ≈2.4 s,
bot ≈1.4 s.

**Cold entry** (ms from the first snapshot):

| run | media req | decoded | question visible | `started_at` | input active | input − start |
|---|---|---|---|---|---|---|
| bot, before, 390 | 58 | — | 61 | **−1400** | 61 | **+1461 (1.4 s already lost)** |
| bot, after, 390 | 13 | 112 | 146 | 800 | 818 | **+18** |
| bot, before, 1440 | 10 | — | 15 | −1400 | 15 | +1415 (lost) |
| bot, after, 1440 | 3 | 104 | 110 | 800 | 823 | **+23** |
| queue, before, 390 | 40 | — | 43 | −2400 | 43 | +2443 (lost) |
| queue, after, 390 | 12 | 700 | 734 | 1800 | 1821 | **+21** |
| queue, before, 1440 | 9 | — | 11 | −2400 | 11 | +2411 (lost) |
| queue, after, 1440 | 3 | 275 | 284 | 1800 | 1811 | **+11** |

Full answer duration is preserved in every after-run: input opens 11–23 ms
after the authoritative instant, and the whole configured window follows it.

**Round N → N+1, with a named module so the title actually plays** (ms from
the server resolving N; next lead 2900):

| run | next media req | next decoded | swap | module face | `started_at` | input | intro ends before start? |
|---|---|---|---|---|---|---|---|
| before, 390 | 36 | — | 1521 | 1546 → **2953** | 2900 | 2914 | **No — 53 ms past** |
| after, 390 | 31 | pending | 1923 (gate) | 1947 → **2794** | 2900 | 2923 | **Yes, 106 ms before** |
| before, 1440 | 15 | — | 1536 | 1536 → **2936** | 2900 | 2914 | **No — 36 ms past** |
| after, 1440 | 11 | 1224 | 1522 | 1522 → **2797** | 2900 | 2948 | **Yes, 103 ms before** |

- After, phone: `presentationPhase` ran `revealing@15 → module-intro@1923 →
  answering@2776`, i.e. the arena was `answering` **124 ms before**
  `started_at`. Desktop: `answering@2797`, 103 ms before.
- Next-round media still begins **before the swap** (31 ms vs a 1923 ms swap
  on phone; 11 ms vs 1522 ms on desktop), unchanged by the closeout.
- The title still plays: 847 ms (phone) and 1275 ms (desktop) of it.
- Geometry: no horizontal overflow, no document scroll, no nested scroll at
  390×844 or 1440×900 in every run. Only the known probe 403 in the console.

### Closeout tests

- `rankedFlow.test.ts` (+2): `module-intro` ends a margin **before**
  `started_at` and never at or after it; `moduleTitleWindowMs` shortens,
  floors at 0 for an already-answerable round, and is unchanged with no next
  round.
- `QuizRankedMatch.rfx1b1.test.tsx` (+2, real controller): with media that
  never loads (the slow-phone case) the title plays but **every sample from
  `started_at` onwards** is the live question — no `module` face, no
  `module-intro` phase, and no sample where input is open under an intro; and
  a round that is already answerable plays no title at all. The harness
  fixture now carries a `topic.category`, without which no title plays and the
  assertion would be vacuous.
- `test_ranked_answerable_boundary.py` (+1, and the lead-in test extended):
  the bot lead-in equals the queue lead-in minus the discovery term, and the
  bot join creates its match inside its own request.

### Closeout files changed

Frontend: `src/lib/ranked-core/pacing.ts` (`MODULE_TITLE_END_MARGIN_MS`,
`moduleTitleWindowMs`, `presentationCutoffAt`),
`src/lib/ranked-core/flow/rankedFlow.ts` (cutoff margin),
`src/components/ranked-arena/CentralStage.tsx` (capped title window),
`src/components/ranked-arena/CanonicalArena.tsx` (passes the window; publishes
both phases as data attributes), `src/lib/ranked-core/arenaView.ts`
(`moduleTitleWindowMs`), `src/pages/quiz-ranked/QuizRankedMatch.tsx` (computes
the window, second wake at the cutoff), plus the two test files.

Backend: `ranked_public/pacing.py` (the traced bot derivation, documented) and
`test_ranked_answerable_boundary.py`. **No behavioural backend change**: the
lead-in values are unchanged.

### Integration

Merged on 2026-09-19, both with `--no-ff`, each merge content-identical to its
approved tip:

| | |
|---|---|
| Frontend | `rfx1/phase2b1` (approved tip **`5d83fd57`**) → `main` as merge **`98542527`**, over `origin/main` **`f2a3e766`**. The remote had not moved since the closeout; nothing to reconcile. |
| Backend | `rfx1/phase2b1-round1-leadin` (approved tip **`0b2474f4`**) → `master` as merge **`295fd58f`**, over `origin/master` **`89b5ce4b`**. The remote moved twice during integration — an items commit (`57016334`, Jak'Sho / Anguish) and a Mastery setup-state commit (`89b5ce4b`) — with **no file overlap** either time. The branch was rebased onto the first (`cf747eca`, byte-identical content) and merged onto the second. |

Verified on the merge results: queue lead-in 4200 ms, bot 2200 ms, every other
creation source 0; frontend Ranked suites 127 files / 1717 tests passing; the
production build clean; backend 117 tests passing across the Ranked suites and
the moved items suite.

Phase 2B1 is complete. Phase 2B2 (the visible entry intro on `view.entryPhase`,
and the image derivatives analysed above) is next.

---

# Phase 2B2: Ranked asset optimization and the visible entry intro

Status: **implemented and committed on one frontend branch. Not merged.**
No backend change: the Round-1 lead-in contract from Phase 2B1 is untouched,
and nothing here extends `started_at` or reduces the answer window.

## Baselines

| | |
|---|---|
| Frontend | `/Users/macmoney/mogsy-wt-rfx1-2b2`, branch `rfx1/phase2b2`, on `origin/main` **`b901ea0e`**. Phase 2B1 (merge `98542527`) is present and verified. `main` had moved one docs-only commit past the `368a60c3` named in the task; no overlap. |
| Backend | unchanged. `master` `295fd58f` (the 2B1 merge) is the contract this phase assumes. |

---

## Part 1 — asset optimization

The Phase 2B1 candidate table was re-measured against `origin/main` before
anything was converted. Every figure in it held (±1%).

### Method

- Re-encoded with Pillow 12.3 (`method=6`), never overwriting a source.
- Sized from MEASURED rendered dimensions plus DPR headroom, not from the
  source. Where a bigger surface draws the same artwork, the original stays
  and Ranked asks for a derivative by name.
- WebP only. No AVIF: the second format buys ~15% more on art that is already
  down 97%, and costs a decode path and a fallback.

### Changed assets

| old path (kept) | new path | old px | new px | old bytes | new bytes | change |
|---|---|---|---|---|---|---|
| `assets/ranked/ranked-vellum-texture.png` | `assets/ranked/ranked-vellum-texture.webp` | 1254x1254 | 1254x1254 | 2293 KB | 67.2 KB | −97.1% |
| `assets/ranked/ranked-academy-duel-bg.png` | `assets/ranked/ranked-academy-duel-bg.webp` | 1672x940 | 1672x940 | 2041 KB | 95.3 KB | −95.3% |
| `assets/ranked/ranked-academy-duel-bg.png` | `assets/ranked/ranked-academy-duel-bg-960w.webp` | 1672x940 | 960x540 | 2041 KB | 38.8 KB | −98.1% |
| `assets/ranked/navy-banner2.png` | `assets/ranked/navy-banner2-768w.webp` | 959x1641 | 768x1314 | 1257 KB | 69.4 KB | −94.5% |
| `mascot/ranked/topmogzy.png` | `mascot/ranked/topmogzy-384.webp` | 1254x1254 | 384x384 | 1023 KB | 24.0 KB | −97.7% |
| `mascot/ranked/jgmogzy.png` | `mascot/ranked/jgmogzy-384.webp` | 1254x1254 | 384x384 | 866 KB | 19.5 KB | −97.7% |
| `mascot/ranked/midmogzy.png` | `mascot/ranked/midmogzy-384.webp` | 1254x1254 | 384x384 | 948 KB | 21.0 KB | −97.8% |
| `mascot/ranked/botmogzy.png` | `mascot/ranked/botmogzy-384.webp` | 1254x1254 | 384x384 | 876 KB | 23.0 KB | −97.4% |
| `mascot/ranked/supmogzy.png` | `mascot/ranked/supmogzy-384.webp` | 1254x1254 | 384x384 | 859 KB | 17.9 KB | −97.9% |
| `mascot/mogzy-mascot-base-v1.png` | `mascot/mogzy-mascot-base-v1-240.webp` | 1024x1536 | 240x360 | 2196 KB | 17.7 KB | −99.2% |
| `mascot/mogzy-hat-transparent.png` | `mascot/mogzy-hat-transparent-128.webp` | 1254x1254 | 128x128 | 850 KB | 4.3 KB | −99.5% |
| `mascot/mogzy-explaining-transparent.png` | `mascot/mogzy-explaining-transparent-192.webp` | 1024x1536 | 192x288 | 997 KB | 9.7 KB | −99.0% |
| `mascot/mogzy-peeking-transparent.png` | `mascot/mogzy-peeking-transparent-192.webp` | 1024x1536 | 192x288 | 999 KB | 9.4 KB | −99.1% |
| `mascot/mogzy-raising-hand-transparent.png` | `mascot/mogzy-raising-hand-transparent-192.webp` | 1024x1536 | 192x288 | 971 KB | 8.5 KB | −99.1% |
| `assets/ranked/jungle_pets/jungle_grass_background.png` | `.../jungle_grass_background-960w.webp` | 1280x720 | 960x540 | 649 KB | 15.4 KB | −97.6% |
| `assets/ranked/question-accents/champ-combat.png` | `.../champ-combat-704w.webp` | 1405x1119 | 704x561 | 1221 KB | 139.4 KB | −88.6% |

**20.1 MB of source art → 580 KB of derivatives.** No original was deleted or
overwritten; a test asserts every source still exists, because the lobby
carousel, `MogzyHubGuide` and the welcome scenes still draw them large.

### Usage scope, per asset

| asset | scope | why |
|---|---|---|
| vellum, backdrop, banner, hat, jungle grass, champ-combat | **global swap** | every consumer draws them at or below the derivative's size; `index.css` / `GlobalHud` / `jungleAtmosphere` point at the WebP and nothing else references the PNG |
| the five role plates | **Ranked-specific derivative** | the lobby's `RankedClassCarousel` draws them nearly full-bleed on a parchment stage; the arena draws the same five at 43–123 CSS px |
| `mogzy-mascot-base-v1` | **HUD-specific derivative** | the HUD avatar is 75x112 inside a 36px circle; the hub guide draws the same portrait large |
| the three Rules poses | **panel-specific derivative** | 56px portrait and 36px tab; `AcademyCommons`, `MogzyDock` and the welcome scenes draw them larger |

### How a surface asks for a size

Two optional props, both defaulting to the source, both falling back to the
source when no derivative exists — so asking is always safe and a missing file
is never a broken image:

- `RoleMascot art="full" | "compact"` → `getRankedRoleMascotPath(role, scale)`;
- `MogzyArt` / `MogzyMascot` `scale="full" | "compact"` →
  `getMogzyArtAssetPath(asset, scale)`.

`art`/`scale` is a statement about THIS host's box, never an inference: nothing
in the component can see how big the box ended up. The arena hosts that pass
`compact` are `roleIdentity.tsx` (both crests), `MobileMatchBar`,
`RankedResultDuel` and the new `RankedEntryIntro`.

### The backdrop is chosen by VIEWPORT, not by DPR

`image-set(1x/2x)` was written first and reverted: a 390px phone at DPR 3 takes
the LARGEST encode, which is the one case that can least afford it. `index.css`
declares `--ranked-backdrop-image` on `.ranked-academy` and overrides it under
`@media (max-width: 640px)`; `.ranked-academy::after` reads the variable, so
exactly one file is ever requested.

`rankedChrome.ts` gained `rankedBackdropUrl(viewportWidth)` and
`RANKED_BACKDROP_NARROW_URL` so **Tier 1 warms the encode the stylesheet will
paint**. Tests pin both URLs to the two `--ranked-backdrop-image` declarations.

### Preload URL == render URL

`rankedRoleMascotUrl` now returns the `compact` path, which is the exact string
the arena's `<img>` carries. A test asserts the identity for all five roles,
and the production waterfall below shows zero duplicate old+new requests.

---

## Part 2 — the visible entry intro

`src/components/ranked-arena/RankedEntryIntro.tsx`, rendered through the
existing placeholder slot: `CanonicalArena`'s `recovering` prop gained an
optional `intro?: ReactNode`, a slot in the same spirit as `guidance`, so the
arena never learns what a duel card is. `message` stays required, so a mode
always has the fallback sentence and this can never become the only way to
fill the slot. Ranked supplies the card; the Daily and every dev harness are
byte-identical.

### States

`view.entryPhase` (`projectEntryPhase`, Phase 2B1) drives it directly. No
second state machine, no invented clock, no percentage — `prepareImage`
settles per URL and a byte count is not available to it.

| entryPhase | card | status line |
|---|---|---|
| `match-unresolved` | neutral crests, "You" / "Opponent" | "Seating the duelists…" |
| `preparing` | real names, roles and role mascots | "Preparing the first question…" |
| `ready` | same | "Take your mark." |
| `live` | never seen — the card is gone by then | — |

`data-entry-phase`, `data-bot-match` and `data-reduced-motion` are published on
the card, so the state is observable in a test and in the browser without
reading copy.

### Timing — it buys no time of its own

- **Eligibility:** `entry === "fresh"` AND the match is not over. A recovery
  keeps its honest "Recovering match…" sentence: a player rejoining a match in
  progress is not being introduced to it.
- **Exit:** `entryIntroExitAt(started_at)` = `started_at − ENTRY_MIN_LEAD_MS`
  (700 ms), the same margin the 2B1 preparation wait already respects. A
  second `useServerInstantWake` fires AT that instant, so the card comes down
  then rather than on the next 1s tick or poll.
- **No minimum-duration timer.** None is needed: the card is up from the
  arena's FIRST paint, which on every real path precedes the first snapshot by
  the route transition plus one request. A lead-in that is already spent — a
  reload into a running round, a staff match created with a 0 lead, a very late
  first snapshot — yields `false` on the first render that sees it. Server
  timing wins every time.
- **`useEntryIntro` is a one-way latch** (`flow/useEntryIntro.ts`), and the
  latch is the whole point rather than defensive coding. The natural predicate
  is "how long until Round 1 is answerable", and that reads `null` —
  indistinguishable from "no round yet" — in three ordinary states: between a
  settled round and the next, on a phased segment with no engine round, and on
  a completed match. Derived alone, the card would drop over the arena every
  time a round settled, and sit over the playtest host's result screen for
  ever. Both are covered by tests.

### Queue vs bot

Both paths are the same code; only the server's lead differs.

| | server lead | modelled client spend before the first snapshot | intro window |
|---|---|---|---|
| queue | 4200 ms | ~2400 ms (2 s discovery poll + 800 ms handoff) | ~1.1 s |
| bot | 2200 ms | ~1400 ms (800 ms handoff + join/navigation/fetch) | ~0.1–0.7 s |

The bot card is genuinely brief. Nothing was padded to make it longer: the
2200 ms is the traced sum of the terms the bot path actually has (2B1
closeout §2), and inventing time would be the one thing this phase must not do.
See **Remaining issues**.

### Identity

Real information only. The viewer's own display name comes from the page
(`viewerLabel`, "You" when the account has none); the opponent's is
`opponentLabelFor` — "Opponent", or **"Bot"** on a bot match — because the live
Ranked projection redacts participant names by design. A bot match titles
itself **Academy Duel** rather than Ranked Duel. A seat whose role the match
did not freeze draws the same neutral crest the arena rails draw, labelled
"Duelist"; nothing waits for metadata the contract does not provide, and the
LC1 rule holds — the role LABEL ships with every mascot.

### Motion

Entrance only, and short: the card fades and settles (260 ms), the two seats
arrive from their own sides (320 ms) and the VS scales in (380 ms). **Nothing
plays on exit** — an exit animation would be exactly the frame budget the first
question is owed. `prefers-reduced-motion` drops the block entirely, and the
app's own Settings → Reduce Motion is read through `useReducedMotionPreference`
and answered by `[data-reduced-motion="true"]`: a plain 180 ms fade, same card,
same words, same layout.

### Layout

Mobile: one row, 4.5rem figures, compact; it sits in the placeholder's slot at
the top of the shell — where the question itself is about to appear — so the
reveal is a swap in place and nothing travels. Desktop: 8.5rem figures, capped
at 44rem and centred, so it reads as a card rather than a banner across a
1440px arena. The global header and the mobile bottom controls are untouched.

---

## Performance measurements

Production builds under `vite preview`: **before** = `origin/main` `b901ea0e`
(:8461), **after** = this branch (:8462). Headless Chromium, CDP throttling —
phone 1.6 Mbps / 150 ms / 4x CPU, desktop 9 Mbps / 40 ms. Request start from
`Network.requestWillBeSent`; a request with no `loadingFinished` is reported as
PENDING rather than as 0 bytes, which is the honest reading of the before-case.
Scripts and screenshots are in the session scratchpad, not committed.

### Initial Ranked image weight (one arena, both duelists, motif on desktop)

| run | images requested | source bytes | finished in 20 s | transferred | still pending |
|---|---|---|---|---|---|
| before 390 | 12 | **12 422 KB** | 3 | 7.3 KB | **9** |
| after 390 | 12 | **258 KB** | 12 | 265.6 KB | **0** |
| before 360 | 12 | **12 422 KB** | 3 | 7.3 KB | **9** |
| after 360 | 12 | **258 KB** | 12 | 265.6 KB | **0** |
| before 1440 | 13 | **13 669 KB** | 13 | 13 676.9 KB | 0 |
| after 1440 | 13 | **455 KB** | 13 | 462.9 KB | 0 |

- Phone: **−97.9%**, and the difference is not only bytes. Before, the entire
  Ranked chrome and BOTH duelist mascots were still in flight after 20 seconds
  — they never arrived inside a match. After, the last image lands ~2.35 s
  after its request.
- Desktop: **−96.7%**; the last image moved from **16.65 s** to **2.20 s**.
- **Request count is unchanged** (12 / 13 either way). No duplicate old+new
  loading: the requested lists contain only derivative URLs, which is the
  waterfall proof that no hidden component still holds a PNG reference.
- Phone takes `ranked-academy-duel-bg-960w.webp` (38.8 KB) and desktop the full
  `ranked-academy-duel-bg.webp` (95.3 KB) — one file each, never both.

### Entry timing (ms from navigation; cold entry modelled as in 2B1)

`?entry=fresh&lead=1800` models the queue path (4200 ms lead less the ~2400 ms
already spent); `lead=800` models the bot path (2200 less ~1400).

| run | intro first seen | intro last seen | question visible | input active | question before input |
|---|---|---|---|---|---|
| queue 390 (phone throttle) | 7205 | 8308 | 8397 | 9047 | **650 ms** |
| queue 1440 | 1912 | 3007 | 3044 | 3741 | **697 ms** |
| bot 390 (phone throttle) | 6057 | 6154 | 6238 | 6882 | **644 ms** |
| bot 1440 | 1774 | 1869 | 1897 | 2604 | **707 ms** |

- **`intro & input-open coexisting samples: 0` in every run**, sampled at 25 ms
  across the boundary. The card is never up while input is open.
- The arena is revealed 644–707 ms before input opens, i.e. at
  `started_at − 700` as designed, and the full configured answer window still
  follows the server's instant.
- The observed phase sequence is `match-unresolved → ready`: with the optimized
  assets, Round 1's critical media settles inside one 25 ms sample even on the
  throttled phone, so `preparing` is real but rarely visible. It is asserted
  directly in `QuizRankedMatch.rfx1b1.test.tsx` and `.rfx1b2.test.tsx`.

### Slow-phone behaviour

At 1.6 Mbps / 150 ms / 4x CPU the phone runs above ARE the slow-phone case.
- Every optimized asset arrives; nothing is still downloading seconds into
  gameplay, which is what the 9-pending before-run was.
- With an `Image` that never settles at all (`rfx1b2` "decorative media never
  blocks entry", and `rfx1b1`'s `imageMode = "never"`), the arena is still
  revealed on the server's schedule and input still opens within 250 ms of
  `started_at`. Decorative art cannot block entry.

### Visual fidelity

Matched production screenshots, animations frozen and reduced-motion on, so the
only difference measured is the encode:

| viewport | RMS difference | subpixels differing by more than 8/255 |
|---|---|---|
| 390x844 @3x | **0.68 / 255** | 6 141 of 8 887 320 (**0.069%**) |
| 1440x900 @2x | **4.69 / 255** | 97 779 of 15 552 000 (**0.629%**) |

At 8x amplification the only structure visible is (a) the champ-combat motif's
pencil lines, which are drawn at 13–30% opacity under `grayscale(1)` and are
indistinguishable side by side at 1:1, and (b) a sub-pixel chromatic fringe on
the banner's gold embroidery. Side-by-side crops of the banner (rod, cloth
folds, embroidered edge, point, mascot) and of the parchment with the motif
were reviewed at 1:1 and are not tellable apart. The larger 1440 figure is the
motif, which is desktop-only and hidden below 640 px.

---

## Browser verification

Production build, real `QuizRankedMatch` and real arena through
`/dev/ranked-shell-probe`. Screenshots captured:

1. `b2-intro-mobile.png` — 390x844 @3x, queue duel (Jungle vs Mid);
2. `b2-intro-desktop.png` — 1440x900 @2x, same;
3. `b2-intro-mobile-bot.png` — 390x844, **Academy Duel**, "Bot", neutral crest;
4. `b2-intro-desktop-bot.png` — 1440x900, same;
5. `b2-intro-mobile-reduced.png` — reduced motion: identical information and
   layout, no travel;
6. `b2-q1-mobile.png`, `b2-q1-desktop.png` — the first question immediately
   after the intro: parchment, mascots, header and answer grid all present and
   stable at first paint, no pop-in.

Geometry: no horizontal overflow, no document scroll and no nested scroll at
1440x900 in every run. At 390/360 the probe's own fixed state-picker toolbar
overflows horizontally — it does so identically on `origin/main` and is a probe
artifact, not an arena one.

### Probe additions (dev surface only)

The probe's canned envelopes carry a fixed 2026-07-18 clock, so a round is
answerable on the first render and the entry window could not be reached at
all. Three small additions, all dev-only:
- `?entry=fresh` passes `entry="fresh"` to the real controller;
- `?lead=<ms>` stamps `server_time` to the real clock and anchors round 1's
  `started_at` ONCE, `lead` ms ahead of the first envelope served — the same
  write-once discipline the backend applies inside the creation transaction, so
  repeated reads never move it;
- `?bot=1` now also marks a LIVE round as a bot match (it previously applied
  only to the end screen), which is what makes the arena's bot vocabulary
  reachable in the probe at all.

---

## Tests

New:
- `src/lib/ranked-core/media/rankedAssets.rfx1b2.test.ts` (11): every
  derivative exists; every SOURCE still exists; each arena plate is under
  40 KB and is a different file from the lobby's; whole arena chrome under
  250 KB desktop / 200 KB phone; **preload URL == render URL** for all five
  roles; the backdrop encode matches the media query at 390 / 640 / 641 / 1440
  and both URLs are pinned to the two `--ranked-backdrop-image` declarations;
  a compact pose falls back to its source when no derivative exists; and the
  replaced heavyweights are not requested — no Ranked chrome PNG is left in any
  `url(...)` in `index.css`, the HUD and Rules scroll point at their own small
  encodes, and all four arena role hosts pass `art="compact"`.
- `src/pages/quiz-ranked/QuizRankedMatch.rfx1b2.test.tsx` (11, real
  controller + real arena): the card is up on the first paint before any
  request resolves and invents no identity; it names both duelists and draws
  the 384px plates once the match resolves; a bot match is an **Academy Duel**
  against **Bot** with the neutral crest; the arena is revealed a margin before
  `started_at` and input opens AT `started_at`; **sampled across the boundary,
  zero samples have the card up with input open and zero have it up at or after
  `started_at`**; no card at all for a reload into a running round, for a fresh
  entry whose lead-in is spent, or for a fresh entry into a finished match; the
  card does not come back when a later round is between snapshots; media that
  never loads does not block entry; reduced motion keeps every word.
- `flow/rankedFlow.test.ts` (+5): `entryIntroHolding` holds above the margin,
  is over AT it and past the start, treats `null` as an intro state and a
  `NaN` start as no window; `entryIntroExitAt` is exactly
  `started_at − ENTRY_MIN_LEAD_MS`; and `ENTRY_MIN_LEAD_MS >
  MODULE_TITLE_END_MARGIN_MS`, so the card is gone strictly before the module
  title's own cutoff.

Updated (contract moved, behaviour deliberately superseded):
- `QuizRankedMatch.rfx1b1.test.tsx` (2): the PREPARATION wait is still bounded
  by `ENTRY_PREP_CAP_MS` — the card reports `ready` inside the cap even when
  nothing loads — and the ARENA's reveal is now the later, server-anchored
  instant. Both still assert input at `started_at`.
- `QuizRankedMatch.entry.test.tsx`, `GlobalHud.test.tsx`,
  `CombatantPanel.banner.test.tsx`, `QuestionMotifLayer.qf1.test.tsx`,
  `QuizRankedMatch.sameRoleBot.test.tsx`, `warmRankedEntry.test.ts`: pinned
  asset URLs moved to the derivatives.
- `LeaguecraftRecord.vellum.test.tsx`: the allow-list gained the new chrome
  paths, plus the two subdirectory prefixes (`question-accents`,
  `jungle_pets`) that were **already** breaking this test on `origin/main`.

### Results

| | before (`origin/main` `b901ea0e`) | after |
|---|---|---|
| full `vitest run` | 16 files / 59 tests failing | 16 files / **58** tests failing |
| new failures | — | **none** |
| fixed | — | `LeaguecraftRecord.vellum` allow-list (pre-existing) |
| `tsc --noEmit -p tsconfig.app.json` | 23 lines of output | 23 lines — identical, none in an RFX1 file |
| `npm run build` | clean | clean (173/173 prerendered champion pages verified) |

Failure SETS were compared, not totals, and both runs were made serially in
matched worktrees with hardlinked `node_modules`. The 58 remaining failures are
the documented pre-existing baseline (pglite security suites, Broadcast engine,
ProPlayHub, consent/gate stores, admin panels and so on) and are untouched by
this phase. Ranked-adjacent suites specifically: 184 files / 2802 tests, all
passing.

Phase 2A result feedback is unchanged and verified: `QuizRankedMatch.rfx1.test.tsx`
(10 tests) passes, including the overlay, the kept selection, the
one-presented-round rule and the reduced-motion wording.

---

## Files changed

Assets (16 new files under `public/`, no original removed or overwritten):
the three chrome encodes plus the 960w backdrop, five `*-384.webp` role plates,
`mogzy-mascot-base-v1-240.webp`, `mogzy-hat-transparent-128.webp`, three
`*-192.webp` Rules poses, `jungle_grass_background-960w.webp`,
`champ-combat-704w.webp`.

New source:
- `src/components/ranked-arena/RankedEntryIntro.tsx`
- `src/lib/ranked-core/flow/useEntryIntro.ts`
- `src/lib/ranked-core/media/rankedAssets.rfx1b2.test.ts`
- `src/pages/quiz-ranked/QuizRankedMatch.rfx1b2.test.tsx`

Modified:
- `src/components/mascot/mascot-assets.ts` — `MogzyArtScale`,
  `MOGZY_ROLE_ASSETS_COMPACT`, `MOGZY_MASCOT_ASSETS_COMPACT`, and the `scale`
  parameter on both path resolvers;
- `src/components/mascot/RoleMascot.tsx` — the `art` prop;
- `src/components/mascot/MogzyMascot.tsx` — the `scale` prop;
- `src/components/ranked-arena/roleIdentity.tsx`,
  `src/components/ranked-arena/MobileMatchBar.tsx`,
  `src/pages/quiz-ranked/RankedResultDuel.tsx` — `art="compact"`;
- `src/components/hud/GlobalHud.tsx`,
  `src/components/hud/MogzyIdentityMenu.tsx`,
  `src/components/ranked-rules/MogzyExplainsPanel.tsx` — small encodes;
- `src/index.css` — the four chrome/motif references, the viewport-keyed
  `--ranked-backdrop-image`, and the entry-intro rules;
- `src/lib/question-surface/jungleAtmosphere.ts` — the 960w atmosphere;
- `src/lib/ranked-core/media/rankedChrome.ts` — WebP chrome,
  `rankedBackdropUrl`, `RANKED_BACKDROP_NARROW_URL/_MAX_PX`, compact mascot
  warm;
- `src/lib/ranked-core/media/roundMedia.ts` — the motif URL;
- `src/lib/ranked-core/media/warmRankedEntry.ts` — comment only;
- `src/lib/ranked-core/pacing.ts` — `entryIntroExitAt`, `entryIntroHolding`;
- `src/components/ranked-arena/CanonicalArena.tsx` — the `recovering.intro` slot;
- `src/pages/quiz-ranked/QuizRankedMatch.tsx` — eligibility, the latch hook and
  the card;
- `src/pages/dev/quiz-render/QuizRenderPage.tsx` — the backdrop WebP;
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` — `?entry=fresh`,
  `?lead=`, live `?bot=1`;
- the seven updated test files above;
- this handoff.

---

## Remaining issues

1. **The bot intro is short (~0.1–0.7 s).** The bot lead-in is 2200 ms and
   about 1.4 s of it is spent before the client holds the payload, so the card
   has only the remainder less the 700 ms reveal margin. It is honest and it
   never flashes (the card is up from first paint, through the route
   transition), but if the owner wants the bot card to read at the same weight
   as the queue card, the fix is a BACKEND one — raise `entry_lead_ms(
   "bot_playtest")` by ~1 s in `ranked_public/pacing.py` — not a frontend
   wait. Nothing was padded here.
2. **`champ-combat-704w.webp` is still 139 KB**, the largest remaining single
   asset, because the artwork is a noisy pencil drawing that WebP compresses
   poorly. It is desktop-only (the motif layer is `display:none` below 640 px)
   and it is the one asset whose 8x-amplified diff shows structure. 1024w would
   cost 285 KB for a difference not visible at 1:1; the current encode is the
   one that was reviewed.
3. **`src/assets/ranked/item-shopkeeper.png` (696 KB) was not converted.** It
   is a bundled (not `public/`) Broadcast card backdrop whose rendered size is
   set by the Broadcast composition rather than by Ranked, and 2B1 flagged it
   as "check the Broadcast size first". Out of scope here; it is not on the
   Ranked entry path.
4. **`SWAP_MEDIA_MIN_LEAD_MS` was left at 1000** (2B1 note 4 suggested
   revisiting it once assets are light). With the derivatives the gate now
   rarely has anything to wait for, so it is inert rather than wrong; changing
   it would be a pacing change in a phase that promised not to make one.
5. The probe overflows horizontally at 390/360 because of its own fixed
   state-picker toolbar. Pre-existing, identical on `origin/main`, and not on
   any product route.

---

## Integration

Merged on 2026-09-19 with `--no-ff`, content-identical to the approved tip.

| | |
|---|---|
| Frontend | `rfx1/phase2b2` (approved tip **`e8a19853`**) → `main` as merge **`b7908b21`**, over `origin/main` **`b901ea0e`**. |
| Movement | **The remote had not moved.** `b901ea0e` was already the branch's own parent, so there was no overlap, no rebase and **nothing to reconcile**. `git diff e8a19853 <merge>` is empty. |
| Backend | **No change.** `master` stays at the Phase 2B1 merge **`295fd58f`**; the Round-1 lead-in contract (queue 4200 ms, bot 2200 ms, every other creation source 0) is untouched by this phase. |

Verified on the merge result: `ENTRY_MIN_LEAD_MS` 700, `ENTRY_PREP_CAP_MS`
1500, `MODULE_TITLE_END_MARGIN_MS` 150 and `SWAP_MEDIA_MIN_LEAD_MS` 1000 all
unchanged; the intro path contains no local timer, minimum or padding of any
kind; `projectEntryPhase` is still the only thing that drives the card;
`rankedRoleMascotUrl` still returns the rendered `compact` path; all eight
high-resolution source assets still present; `item-shopkeeper.png` untouched.
Ranked-adjacent suites 184 files / 2802 tests passing, and the production build
is clean (173/173 prerendered champion pages verified).

**RFX1 is COMPLETE.** Pushed to `origin/main`; the site still needs an owner
**Lovable Publish** before any of it reaches mogzy.lol — a push to `main` is
not a deploy.

---

# RFX1 final state

**Phase 1** audited the Ranked entry and round lifecycles and found two of the
original premises wrong: the result overlay was not driven by one settlement,
and Round 1 was not opened by the first read.

**Phase 2A** made resolution sequencing and correctness feedback authoritative:
one settlement drives the viewer's cue and the opponent's separate beat, the
player's own pick survives the reveal alongside the correct answer, and N+1
never shows over N.

**Phase 2B1** gave Round 1 a real, server-owned lead-in — `entry_lead_ms`,
4200 ms on the queue path and 2200 ms on the bot path, written ONCE inside the
match creation transaction — which restored the 1.4–2.4 s of Round 1 that
players had been losing before their first interaction. It added three tiers of
targeted media preparation (persistent chrome and both mascots, the presented
round, the next round under the previous reveal), all bounded by server
instants, all anti-cheat clean, and a presentation cutoff so no intro face can
survive `started_at`.

**Phase 2B2** made the arena light enough for that lead-in to matter and gave
the player something to look at during it. Ranked's initial image weight fell
from **12.4 MB to 258 KB on a phone** and from **13.7 MB to 455 KB on desktop**
— on a throttled phone the chrome and both duelist mascots used to still be in
flight after 20 seconds and now land in about 2.3 s — with every original kept
for the surfaces that draw it large. On top of that preparation, a Ranked /
Academy Duel card names the match, both duelists and their roles, occupies the
period the server already owned, and is gone by `started_at − 700 ms`.

The invariant the whole workstream now holds: **the player sees the duel, then
a prepared and stable first question, and input opens at the server's instant
with the entire configured answer window still ahead of it.** Nothing the
client does extends, shortens or anticipates that instant.

---

# Phase 2B3: presentation timing, the countdown clock and match-outro plumbing

Status: **implemented and committed on two scoped branches. Not merged.**
No visual or copy design: the intro card is 2B2's, and the outro is a neutral
`MATCH COMPLETE` placeholder that exists so the lifecycle is visible and
testable. Both designs are explicitly left to the owner.

## Baselines

| | |
|---|---|
| Frontend | `/Users/macmoney/mogsy-wt-rfx1-2b3`, branch `rfx1/phase2b3`, on `origin/main` **`aa62fc22`**. Phase 2A / 2B1 / 2B2 all verified present (`RankedEntryIntro.tsx`, `flow/useEntryIntro.ts`, `projectEntryPhase`, `moduleTitleWindowMs`, `entry_lead_ms`). |
| Backend | `/Users/macmoney/lcs-wt-rfx1-2b3`, branch `rfx1/phase2b3-presentation-leadin`, on `origin/master` **`1bddaf71`**. The 2B1 merge `295fd58f` is an ancestor. |
| Method | Production `vite build` under `vite preview`; the real `/dev/ranked-shell-probe` (real `QuizRankedMatch`, real `useRankedMatch`, real `CanonicalArena`); headless Chromium under CDP throttling. Scripts are in the session scratchpad, not committed. |

## Phase 2B3 objective

Three presentation behaviours stopped being accidents of load speed:

1. the pre-match intro is a **deliberate, repeatable beat** — at least 2 s of
   VISIBLE card on every genuine fresh entry, measured from its real first
   paint, followed by ~700 ms of locked, prepared question;
2. the Ranked countdown **ticks like a clock** — each visible number occupies
   one real second, anchored to the authoritative deadline;
3. the match ends through a **real match-complete beat** instead of cutting
   from the final answer straight to the end screen.

The entry timing contract was corrected once after review; the section below
is the final one, and the first draft's `ENTRY_INTRO_MAX_MS` is gone.

## Intro timing contract

**Corrected before merge.** The first draft measured the floor from a modelled
`ENTRY_ROUTE_PAINT_MS = 300`, which left the bot path meeting it *exactly*
(zero headroom), and capped the intro at `ENTRY_INTRO_MAX_MS = 2600`, which
handed a fast queue entry's surplus to the locked preview instead — up to
2119 ms of prepared question the player could not answer. Both are fixed
below; `ENTRY_INTRO_MAX_MS` no longer exists.

### The client contract

```
arenaRevealAt     = started_at − ENTRY_MIN_LEAD_MS          (the one fixed point)
introVisibleUntil = arenaRevealAt
subject to:  introVisibleUntil − firstVisibleAt >= ENTRY_INTRO_MIN_MS
```

`firstVisibleAt` is the card's **actual first paint on this device**, captured
by the coordinator on its first eligible render. It is not a modelled
estimate: it is what the floor is measured from, what the tests assert on, and
what the card publishes as `data-intro-ms`, so the contract is checked against
what the player saw.

Because the reveal is pinned to `started_at`, **there is no ceiling on the
intro**. Any surplus presentation budget goes to the card and the locked
preview stays at its 700 ms. A longer card is presentation; a longer inert
preview is a stall.

| | value |
|---|---|
| minimum visible intro | `ENTRY_INTRO_MIN_MS` **2000 ms**, from the real first paint |
| locked arena preview | `ENTRY_MIN_LEAD_MS` **700 ms** (unchanged since 2B1) |
| intro ceiling | **none** |

### The server keeps the floor

`started_at` is written once inside the creation transaction and the client
only ever CLIPS, so the floor is a property of `entry_lead_ms`: each path's
lead is that path's own worst-reasonable spend **before the card can paint**,
plus the presentation.

```
ENTRY_DISCOVERY_MS     2000   queue only — useRankedQueue POLL_MS, an upper
                              bound that also absorbs that poll's round trip
ENTRY_JOIN_RTT_MS       500   bot only — the create-and-return POST's round
                              trip; the queue has no equivalent because the
                              discovery bound already covers the same cost
ENTRY_HANDOFF_MS        800   both — PlayScrollRecord DEFAULT_HANDOFF_MS
ENTRY_ROUTE_PAINT_MS    400   both — the warm SPA route swap to the card's
                              FIRST PAINT. MEASURED at 9–62 ms across four
                              throttle profiles × five warm swaps; the
                              constant is ~6× the worst of those, and the
                              headroom is the point.

ENTRY_INTRO_MIN_MS     2000
ENTRY_ARENA_PREVIEW_MS  700
ENTRY_PRESENTATION_MS  2700   identical on both paths

queue        = 2000 + 800 + 400 + 2700 = 5900   (2B1: 4200)
bot_playtest =  500 + 800 + 400 + 2700 = 4400   (2B1: 2200)
everything else                        =    0   (unchanged)
```

Both paths therefore leave **exactly 2700 ms** once the card paints, on their
worst-reasonable entry — the floor plus the preview. The two leads differ only
in how the same "find out the match exists" cost is bounded: a poll period on
one, a request on the other.

**`ENTRY_JOIN_RTT_MS` is new.** 2B1 explicitly declined it ("padding it would
be inventing time"), and under 2B1's model — where the lead only refunded real
losses — that was right. Under 2B3 the presentation is a promise, and the bot
path is the one path where no other term bounds that cost. It is a bound, not
a measurement; Phase 1 measured 110–250 ms TTFB against production and
bot-match creation does real question-bank work on top.

**`MODULE_TITLE_MS` leaves the entry formula.** Round 1's orientation beat is
the duel card now, not the module name in the header.

**Extension rules.** 2B1's `useEntryPreparation` still keeps the card up while
Round 1's *critical* media decodes, bounded by `min(ENTRY_PREP_CAP_MS 1500,
msUntil(started_at) − 700)`. Slow loading may lengthen the presentation; it can
never shorten the preview or move `started_at`. A lead that is short or already
spent (a reload into a running round, a staff match with a zero lead) ends the
card early or never shows it.

## Countdown clock

### Old root cause (two faults, one symptom)

1. **The tick source was mount-anchored.** `QuizRankedMatch` ran
   `setInterval(() => setTick(t => t + 1), 1000)` from mount, and the timer
   value was recomputed from a raw `Date.now()` *during render*. The instant a
   number was DUE to change (a property of the deadline) and the instant a
   render happened to observe it were unrelated, and the offset was re-rolled
   on every remount. Worse, the interval was not the only thing that
   re-rendered: a poll landing between ticks flipped the digit early and the
   interval flipped the next one on schedule, so intervals alternated
   short/long.
2. **Every poll adopted a raw clock skew.** `snapshotSkewMs = serverTime −
   localNowAtReceipt`, and the server stamps `serverTime` before a round trip
   that varies from poll to poll. Since `remaining = deadline − now − skew`, a
   200 ms swing in the skew moved *every* boundary by 200 ms. This is the
   dominant fault on a real network and is invisible on localhost — which is
   why the probe alone never reproduced it.

Audited and found already correct, so left alone: `Math.ceil` semantics,
`projectTimer`'s `min(durationSeconds, …)` cap during the lead-in, the `0`
clamp (no negative can render), timeout resolution (the backend resolves it;
the display is never authoritative), and the fact that the desktop
(`CentralStage` → `TimerDisplay`) and mobile (`MobileMatchBar` → `Clock`)
clocks already read ONE `header.timer`.

### New clock source

`useCountdownNow(deadlineIso, skewMs)` returns a `nowMs` that changes **only
at deadline-relative second boundaries**. `timerMath.msUntilSecondBoundary`
gives the distance to the next one; the hook schedules a single `setTimeout`
at it (+6 ms, so an early-firing timer cannot produce a duplicate render for
one digit) and re-arms from there. `projectTimer` is unchanged and still pure —
it simply stops being handed a `Date.now()` that every render re-rolled.

### Second-boundary semantics (confirmed against the existing convention)

`remainingSeconds` is a **ceiling**, as the arena has shipped since the mode
did. "30" means *more than 29 s and at most 30 s remain*, and it occupies that
whole second: a full 30 s round reads `30` at the instant it opens and holds it
for 1000 ms. `1` lasts one real second; `0` appears only when truly expired;
nothing negative can render.

### Resync behaviour

`timerMath.reconciledSkewMs` keeps the **highest** reading. The least-delayed
round trip is the most accurate, and it is also the safe one — an overstated
skew shows the player *less* time than they have, never more. A step DOWN
larger than `SKEW_RESYNC_THRESHOLD_MS` (750 ms) is the clock itself moving and
is adopted at once; ordinary latency noise never is. Round timestamps
themselves are immutable (proved in 2B1: `started_at` is written once inside
the creation transaction and no read path recomputes it), so there is nothing
else for a later snapshot to correct.

### Background-tab behaviour

The hook listens for `visibilitychange` and, on return, clears its pending
timer and takes one fresh sample. The value is derived from the clock, so that
sample IS the correct remaining time — the missed seconds are **not** animated
through.

---

## Module-transition contract

Audited; the between-module window itself is unchanged (`module_transition_ms`
= result hold 1500/2600 + `MODULE_TITLE_MS` 1400, and 2B1's swap gate still
ends by `started_at − SWAP_MEDIA_MIN_LEAD_MS 1000`). One rule added:

* `MODULE_TITLE_MIN_MS` **600 ms**. `moduleTitleWindowMs` now returns **0**
  when the room left is below the floor, so the title is **skipped rather than
  flashed**. A beat the player cannot read is worse than no beat.
* Nothing is ever *extended* to reach the floor; the boundary stays the
  server's. Under fast load the title plays its nominal beat; under a media
  wait it shortens to the 850 ms the swap gate guarantees; under a late
  discovery it plays not at all.
* Measured (browser, production-shaped latency): identical before and after —
  reveal ~900 ms, then `module-intro` ~1005–1030 ms. Part 3 adds a floor, not
  a pacing change.

---

## Match-complete lifecycle

### Before

```
snapshot carries match_over
  → phase = "match_over" in the SAME render
  → MatchOverFrame replaces the arena
  → the final round captured with { hold: false } — its reveal never played
  → a second effect released any hold in flight, for good measure
```

Measured in the browser: `server-completed@0 → end-screen@311`. The last answer
of the duel was the one answer whose verdict the player never saw land.

### After

```
snapshot carries match_over
  → liveCompletion decided from sawMatchLiveRef, BEFORE any await
  → the outro is CLAIMED in the same batch (phase = "match_outro";
    the end screen cannot mount, input is closed)
  → the result row and the final settlement are fetched
  → the final round is captured WITH its ordinary reveal hold
  → outro.ready → the beat presents for MATCH_OUTRO_MS
  → phase = "match_over" → MatchOverFrame
```

Three defects had to be fixed for that sequence to hold:

1. **`{ hold: false }`** on the final round — now `hold: liveCompletion &&
   finalRoundUnseen`, where `finalRoundUnseen` is `resolvedRef.current !==
   lastRound`. A played-out match settles its final round inside the
   transaction that ends it, so nothing has captured it; a **forfeit**'s last
   completed round was captured (and revealed) earlier, so it correctly gets
   no second reveal.
2. **The "a finished match releases any hold" effect** ran on the first render
   that saw `matchOver`, which lands *after* the completion poll armed the
   reveal — so the one hold the player most needed was guaranteed to be
   cancelled. It now stands aside while an outro is owed.
3. **The surface adopted the completion snapshot.** `active_round: null` ended
   the final round's presentation before its settlement had even been fetched.
   `canAdvanceSurface` now refuses a snapshot that is `matchOver` with no
   active round: a completed match publishes no round to present.

A browser run with production-shaped latency caught a fourth, which the jsdom
tests could not: the end screen flashed for ~320 ms in the gap between the
completion snapshot and the two reads behind it, then the arena came *back*.
Claiming the outro in the same batch as the snapshot removes it; `ready` is
what keeps the beat from announcing the end before the verdict it follows.

## Outro presentation state

* Controller phase **`match_outro`** (`MatchPhase`), from the instant the
  completion is observed until the beat is spent.
* Presentation phase **`match-outro`** (`RankedPresentationPhase`), published
  as `data-presentation-phase`, for the beat itself only — ranked AFTER
  `revealing`, so the final round's verdict plays first.
* `MATCH_OUTRO_MS` **1200 ms**, one constant, retunable without touching the
  state machine that plays it.
* The arena renders it through a new optional `outro?: ReactNode` seam on
  `CanonicalArena` — the same spirit as `guidance` and `recovering.intro`, so
  the arena never learns what a duel's ending is. (`guidance` is the Daily's
  seam and a boundary test forbids Ranked using it.)

### Outro information contract

`flow/matchOutro.ts` exposes one minimal typed payload, `MatchOutroView`:
`id`, `matchId`, `result` (win/loss/draw — from `outcome`/`winnerUserId` only,
never by comparing two scores), `terminalReason`, `viewerScore` /
`opponentScore` (the engine's committed `finalScores`), `viewerLabel` /
`opponentLabel`, `viewerRole` / `opponentRole` (the frozen seats),
`finalRoundNumber`, `ratingDelta` (when the history row already carries one).

Deliberately **not** included: the timeline, transcript and discovery list
(the end SCREEN's material), the rails' score-animation state (a second
authority over the same numbers) and any rating TIER (the client holds no
thresholds).

---

## Replay protection

| event | plays when | cannot replay because |
|---|---|---|
| fresh-match intro | `entry === "fresh"`, match not over, and the exit instant is still ahead | `useEntryIntro` is a one-way latch per mount; a recovery is not eligible at all; a spent lead yields `false` on the first render that sees it |
| final round's reveal | the completion is live AND `resolvedRef.current !== lastRound` | `resolvedRef` is the same ref that stops a re-poll double-capturing a settlement |
| match outro | `sawMatchLiveRef.current` — this mount observed at least one OPEN snapshot — and `outroStartedRef` is unset | both are refs; `stoppedRef` also ends polling at completion. A refresh or a reconnect onto a finished match reads `match_over` on its FIRST snapshot, so nothing is owed and nothing ever appears |

The outro's id is deterministic (`<matchId>:outro`), as the 2A result cues are.

---

## Reduced motion

`prefers-reduced-motion` and the app's own Settings → Reduce Motion
(`useReducedMotionPreference` → `[data-reduced-motion="true"]`) change the
ANIMATION and never the pacing:

* **Intro** — unchanged duration; the card fades instead of travelling (2B2's
  behaviour, now with the 2B3 minimum behind it). Tested.
* **Module transitions** — the window is a pacing constant, untouched.
* **Outro** — `MATCH_OUTRO_MS` either way; a 180 ms fade replaces the 260 ms
  rise. Tested.

---

## Measurements

Production builds under `vite preview`: **before** = `origin/main` (:8472),
**after** = this branch (:8471). Headless Chromium, CDP throttling — phones
1.6 Mbps / 150 ms / 4× CPU, desktop 9 Mbps / 40 ms.

### Intro — deterministic on both paths, at every viewport

`lead` models what the server's lead-in has LEFT by the time the card paints:
`entry_lead_ms` less that path's own spend. Queue worst `5900 − 3200 = 2700`,
bot worst `4400 − 1700 = 2700`; "typical" adds the slack a real entry usually
has (discovery landing in ~1 s of its 2 s bound; a 200 ms join round trip).

| viewport | path | visible intro | locked preview | `data-intro-ms` |
|---|---|---|---|---|
| 390×844, 4× CPU | queue worst | **2072 ms** | 677 ms | 2056 |
| | queue typical | 3035 ms | 678 ms | 3046 |
| | bot worst | **2071 ms** | 682 ms | 2047 |
| | bot typical | 2332 ms | 679 ms | 2324 |
| 360×800, 4× CPU | queue worst | **2062 ms** | 681 ms | 2043 |
| | queue typical | 3027 ms | 676 ms | 3019 |
| | bot worst | **2074 ms** | 677 ms | 2046 |
| | bot typical | 2361 ms | 679 ms | 2347 |
| 1440×900 | queue worst | **2024 ms** | 694 ms | 2021 |
| | queue typical | 3023 ms | 695 ms | 3017 |
| | bot worst | **2022 ms** | 690 ms | 2016 |
| | bot typical | 2331 ms | 675 ms | 2312 |

* Visible intro **≥ 2016 ms in all twelve runs**; never below the floor.
* Locked preview **675–695 ms in all twelve runs** — including the surplus
  cases, where the extra second went to the card and the preview did not move.
* A 4×-throttled phone and an unthrottled desktop get the same beat to within
  50 ms, and the queue and bot worst cases are within 50 ms of each other.
* The card's own `data-intro-ms` agrees with the wall clock to within ~20 ms
  everywhere, which is what makes the contract checkable from the DOM.
* Input stayed tied to the server's instant in every run.

**Against the first draft** (queue 5800 / bot 3800, ceiling 2600): the queue
intro swung 2021–2596 ms and its preview reached 2119 ms; the bot worst case
fell to ~1.7 s. **Against `origin/main`**: the queue intro swung 421–2428 ms
and the bot card was 121–418 ms.

### Countdown — real-clock cadence

Ordinary run (no injected latency), gaps between visible changes:

| viewport | n | min | max | avg |
|---|---|---|---|---|
| 390×844 | 6 | 997 | 1009 | **1001** |
| 360×800 | 6 | 988 | 1015 | **1001** |
| 1440×900 | 10 | 976 | 1018 | **1000** |

Sample: `0:30@3647 → 0:29@5343 → 0:28@6345 → 0:27@7348 → 0:26@8349 →
0:25@9351 → 0:24@10356 → …`. The first interval is longer by design: `30` is
pinned through the lead-in by `projectTimer`'s duration cap and then owns its
own second from `started_at`.

**With production-shaped latency** (110–260 ms varying per poll, shimmed over
the probe's interceptor — the probe alone answers instantly from the same
clock and cannot reproduce the defect), 1440×900, 22 intervals each:

| | min | max | avg | spread |
|---|---|---|---|---|
| before (`origin/main`) | **881 ms** | **1122 ms** | 997 | **241 ms** |
| after (`rfx1/phase2b3`) | 981 ms | 1013 ms | 1000 | **32 ms** |

### Module transition (browser, same latency)

| | reveal | module-intro | total |
|---|---|---|---|
| before | 1569→2475 (906 ms) | 2475→3495 (1020 ms) | 3495 ms |
| after | 1707→2609 (902 ms) | 2609→3639 (1030 ms) | 3639 ms |
| after, media never settles | 1604→2519 (915 ms) | 2519→3515 (996 ms) | 3515 ms |

Unchanged, as intended, and stable whether or not media ever loads.

### Match complete (browser, same latency; ms from the completion snapshot)

| | before | after | after, media never settles |
|---|---|---|---|
| final result feedback begins | — (never) | 850 | 717 |
| outro begins | — | 2349 | 2234 |
| end screen | **311** | 3557 | 3431 |
| final reveal duration | 0 | **1499 ms** | 1517 ms |
| outro duration | 0 | **1208 ms** | 1197 ms |

No blank frame and no overlap in any run: exactly one of the arena and the end
screen is mounted in every sample.

Geometry: no document scroll and no nested scroll at any viewport. The 4 px
horizontal overflow at 390/360 is the probe's own fixed state-picker toolbar —
identical on `origin/main`, pre-existing, and on no product route (2B2's
Remaining issue 5).

---

## Tests

Frontend, new files:

* `src/lib/ranked-core/timerMath.countdown.test.ts` (18) — ceiling semantics,
  no negative, boundary arithmetic (whole second at a whole second, remainder
  from an arbitrary instant, skew-corrected, null past the deadline, a 30 s
  round walking exactly 30 boundaries), the module-title floor (nominal /
  shortened / skipped / never below the swap gate's guarantee), the outro
  constant's bounds, and the skew rule (seeds, keeps the highest, adopts a
  real correction, bounds its error, holds the boundaries still).
* `src/lib/ranked-core/flow/useCountdownNow.test.tsx` (6, fake timers) —
  a stable `30 → 29 → 28 …` sequence with min = max = avg = 1000 ms;
  transitions on deadline boundaries and not on mount + k·1000; twenty
  rerenders cannot move the digit; a tiny resync produces no duplicate tick;
  a backgrounded tab snaps to the truth and animates nothing; `0` is terminal
  and `1` owns its second.
* `src/pages/quiz-ranked/QuizRankedMatch.rfx1b3.test.tsx` (16, real controller
  and real arena) — the intro holds its minimum with instant media and is
  capped; the locked question is up before `started_at` and input opens AT it;
  critical loading may extend, bounded by the preview margin; reduced motion
  keeps the duration; a recovery and a spent lead play no intro. Desktop and
  mobile show the same value from the same deadline, and a poll does not
  restart the cadence. The ending: the exact sampled lifecycle
  `answering → revealing → match-outro → end-screen` with each beat's
  measured duration, no blank or overlapping state across the swap, no
  end-screen flash under 250 ms of injected read latency, reduced motion
  preserving the beat, no replay after it, and neither a refresh nor a
  reconnect onto a completed match ever playing it.

Frontend, updated: `flow/rankedFlow.test.ts` (the entry contract rewritten for
the new formula — floor, ceiling, the server's hard clip, the holding
boundary, unresolved vs unparseable), and `QuizRankedMatch.forfeit.test.tsx` /
`QuizRankedMatch.revealBeat.test.tsx` (end-screen waits extended past the
outro beat).

Backend: `test_ranked_answerable_boundary.py` — the lead arithmetic rewritten
term by term for both paths, plus
`test_every_real_entry_path_can_pay_for_the_whole_presentation`, which is
where the floor is actually proved: the frontend only ever clips, so
"every fresh match gets the same minimum intro" IS the claim that each path's
lead covers its own worst-reasonable client spend plus the presentation.

### Results

* Ranked suites: **131 files / 1623 tests passing**.
* Whole frontend suite: **733 files / 11744 passing**; the 15 failing files /
  79 failing tests are **byte-identical to the set on clean `origin/main`**,
  verified by a full baseline run in a separate worktree. Zero regressions;
  +43 tests, +3 files.
* Production `vite build`: clean.
* Backend Ranked suites: **86 passing**.
  `test_ranked_prototype.py::test_two_human_match_defaults_to_production_and_not_bot`
  fails identically with the branch stashed — the fresh worktree's empty stub
  DB has no `quiz_questions`. Pre-existing and environmental.

---

## Files changed

**Frontend** — new:
`src/lib/ranked-core/flow/useCountdownNow.ts`,
`src/lib/ranked-core/flow/matchOutro.ts`,
plus the three test files above.

Modified:
* `src/lib/ranked-core/timerMath.ts` — `msUntilSecondBoundary`,
  `SKEW_RESYNC_THRESHOLD_MS`, `reconciledSkewMs`;
* `src/lib/ranked-core/pacing.ts` — `ENTRY_INTRO_MIN_MS`,
  `entryIntroExitMs` (the reveal, pinned to `started_at`), `entryIntroHolding`
  and `entryIntroDurationMs` (both on the real first paint),
  `MODULE_TITLE_MIN_MS`, `MATCH_OUTRO_MS`, and the floor inside
  `moduleTitleWindowMs`;
* `src/lib/ranked-core/flow/useEntryIntro.ts` — the entry presentation
  coordinator: the first-paint anchor, the local-instant exit, the latch, and
  the `EntryIntroWindow` return carrying the measured `visibleMs`;
* `src/components/ranked-arena/RankedEntryIntro.tsx` — the optional
  `visibleMs` prop, published as `data-intro-ms` (measurement only; nothing
  drawn changes);
* `src/lib/ranked-core/flow/rankedFlow.ts` — the `match-outro` phase;
* `src/pages/quiz-ranked/useRankedMatch.ts` — the `match_outro` phase, the
  outro state and its two refs, the scoped final-round hold, the scoped
  match-over release, the beat effect, `matchOutroId`, and the reconciled
  skew;
* `src/pages/quiz-ranked/QuizRankedMatch.tsx` — `useCountdownNow` feeding
  `projectTimer`, the outro payload and placeholder, the surface guard for a
  completed match;
* `src/components/ranked-arena/CanonicalArena.tsx` — the optional `outro`
  seam;
* `src/index.css` — the placeholder's two rules and its reduced-motion
  variant;
* this handoff.

**Backend** — `ranked_public/pacing.py` (`ENTRY_ROUTE_PAINT_MS`,
`ENTRY_INTRO_MIN_MS`, `ENTRY_ARENA_PREVIEW_MS`, `ENTRY_PRESENTATION_MS`, and
`_ENTRY_PATHS` rewritten) and `test_ranked_answerable_boundary.py`. Nothing
else: `started_at` is still written once, inside the creation transaction, by
the same `_open_segment` mechanism, and the configured answer window is
unchanged — it simply begins later.

---

## Unresolved / notes

1. **`ENTRY_JOIN_RTT_MS` 500 is a bound, not a measurement.** It is the only
   term in either lead that was not either a client constant or measured in a
   browser. Phase 1 measured 110–250 ms TTFB against production and bot-match
   creation does question-bank work on top, so 500 ms is a generous upper
   bound — but a production bot join that ever exceeded it would take the
   difference out of the card. Worth one real-network measurement on mogzy.lol
   before anyone tunes it down.
2. **`ENTRY_ROUTE_PAINT_MS` 400 carries deliberate headroom.** The warm SPA
   swap to the card's first paint measured 9–62 ms; the constant is ~6× the
   worst of those and a test pins that multiple. It is the term that absorbs a
   cold device, a GC pause or a slow first render, and it is the first place
   to look if a real entry ever misses the floor.
3. **`SWAP_MEDIA_MIN_LEAD_MS` is still 1000** (2B1 note 4, 2B2 issue 4). With
   the 2B2 derivatives the gate rarely waits at all, and it is what makes
   `MODULE_TITLE_MIN_MS` reachable rather than aspirational — a test pins that
   relationship.
4. **The probe cannot reproduce the clock defect on its own**: its scripted
   server answers instantly from the same clock, so `snapshotSkewMs` reads ~0.
   The latency shim in the scratchpad script is what puts the production round
   trip back, and it must be installed AFTER the probe's own interceptor or it
   is bypassed.
5. **Round 1 no longer plays a module-title face.** 700 ms of preview is below
   `MODULE_TITLE_MIN_MS`, so the title is skipped and the preview shows the
   question and its clock. Deliberate — the duel card is round 1's orientation
   beat now — but it is a visible change from 2B1.

---

## Final Round presentation contract

**Trigger.** The PRESENTED round is the last module of the match, read from
the match contract and never from a constant: `scoring.moduleNumber ===
scoring.matchLength`. An hp match (and any deployment predating RP1) carries a
null `matchLength`, cannot say which round is last, and is owed no warning —
the truthful answer rather than a guess. The backend reaches the same
conclusion independently from the frozen format snapshot
(`_upcoming_presentation_flags`), so a seven-module format's round 7 is the
final round and a hardcoded 10 never appears on either side.

Three things must ALL hold, and each closes a different replay hole:

1. the presented round is special;
2. the server's lead-in still has room for the whole beat
   (`specialTransitionWindowMs`) — which is what makes a reconnect or a late
   discovery skip it silently;
3. THIS MOUNT WATCHED THE ROUND ARRIVE (`advancedInto`, compared by ROUND
   NUMBER, not by snapshot object — every poll returns a fresh object for the
   same round and treating that as a transition let a refresh claim one it
   never saw).

**Duration.** `SPECIAL_TRANSITION_VISIBLE_MS["final-round"]` = **1300 ms**
guaranteed visible, the lower end of the 1200-1500 the owner asked for.
Measured 1501-1604 ms in the browser, because the beat absorbs the poll's
leftover slack (below).

**Interaction with the ordinary module transition — it REPLACES it.** A round
that announces itself does not also need its module name in the header first;
that is two intros back to back for one question, and it was the single
biggest risk in adding these. The substitution is made in both places from the
same two booleans: `module_transition_ms` substitutes the special term for
`MODULE_TITLE_MS`, and `QuizRankedMatch` passes `moduleTitleWindowMs = 0` for
the same round. Ordinary rounds are untouched — same 2900 ms, same
`MODULE_TITLE_MIN_MS` floor, same cutoff.

**Authoritative timing.** The beat lives inside the server-owned window
between a settled round and the next one. `started_at` is still written once,
by the same `_open_segment` mechanism, and the answer window still begins at
it. Input is closed for the whole beat (`phase !== "active"`), and the beat
ends `MODULE_TITLE_END_MARGIN_MS` before `started_at` — measured 127-143 ms
early on every run.

**Replay.** Never on a refresh, a reconnect, a resumed match already in the
final round, or from polling and rerenders. A one-per-round latch (`playedFor`,
a ref) plus the two conditions above.

## Meta Reflex entry presentation contract

**Old duration: 720 ms** (`STING_MS`), and non-blocking by necessity — when it
shipped, the backend started card 1's deadline at the instant it CREATED the
block, so anything that covered the card would have spent the player's own
answer window. RFX1 2B1 removed that premise (`_open_segment` opens a round at
`now + presentation_ms` and `start_card_deadline` anchors on the same
instant), and 2B3 sizes the lead for a real mode-shift beat.

**New duration: 1800 ms** guaranteed visible. Measured 2015-2168 ms in the
browser, ending 132-139 ms before `started_at`.

**Trigger.** The presented round's module is Meta Reflex: module id
`item_cost_duel` AND version >= 4. The version is the only honest
discriminator — v1-v3 share the id but are the legacy five-pair Item Cost
Duel, an ordinary round owed no mode-shift beat — and it is the same rule the
renderer applies with `servesVersion`. Plus the same three conditions as
above.

**It IS the existing sting, extended.** `useEntrySting` gained an optional
`durationMs`; Ranked passes the coordinator's window and everything else (the
Daily, every harness) keeps `STING_MS` and is byte-identical. No second popup
was added. The window reaches the module through one optional
`entryPresentationMs` prop on `ModuleViewportProps`.

**Card 1 behaviour.** Visible and LOCKED underneath, exactly as round 1 is
during its own preview: `started_at` is 1800 ms away, so `answerablePending`
closes input and the backend would refuse a submission anyway. The sting keeps
its `pointer-events: none` shape, which now costs nothing and means a clock
error can only ever produce a harmless banner rather than a curtain over a
live card.

**Block behaviour and replay.** Once per BLOCK, before card 1 only. Cards 2-5
share the block key and replay nothing. A reconnect into a running block finds
its lead-in spent, reads a 0 window and shows nothing.

## Special-transition priority — when the final round IS a Meta Reflex block

**FINAL ROUND wins the message; META REFLEX wins the clock.** One beat, one
phase, deterministic (`resolveSpecialTransition`, mirrored by
`upcoming_round_kind` / `special_transition_ms`):

* the higher-stakes word is shown, because a player at module 10 of 10 already
  knows the modules differ, and two large warnings back to back for one
  question is the failure this phase must not produce;
* on the LONGER of the two durations (1800 ms), because the mode shift is
  still happening and the player still has to re-orient before card 1;
* never the two lengths back to back — a test pins `visible < 1300 + 1800`.

The production ladder does not currently hit this case (Meta Reflex sits at
modules 4 and 9 of 10), so it is contract correctness rather than a live path.
The eventual design may want the Final Round card to also name the module; the
payload carries it.

## The server-owned budget for a special round

```
ordinary            1500 + 1400                      = 2900   (unchanged)
final round         1500 + 1900 + 600 + 1300 + 150   = 5450
Meta Reflex entry   1500 + 1900 + 600 + 1800 + 150   = 5950
                     ^      ^      ^      ^      ^
                     |      |      |      |      cutoff margin
                     |      |      |      the beat's visible promise
                     |      |      headroom (PRESENTATION_HEADROOM_MS)
                     |      discovery: POLL_MS 1500 + one RTT 400
                     result hold
```

**No ordinary round is lengthened by any of this.** The special terms are paid
only by the two or three rounds in a match that actually announce themselves.

Two terms were sized by browser measurement rather than assumption, and both
were wrong on the first pass:

* **discovery is the poll interval PLUS a round trip.** The reveal began
  1798 ms after the server resolved on a throttled phone, not the 1500 ms
  `POLL_MS` alone predicts, and those 298 ms were enough to cancel the beat.
* **`PRESENTATION_HEADROOM_MS` is 600 ms, not 250.** A medium beat is
  all-or-nothing, so an exact fit is a beat that jitter cancels — and browser
  runs reproduced exactly that, the same build playing the beat on one run and
  skipping it on the next. The term it covers is the gap between the reveal
  hold's timer firing and the render that evaluates the window, measured at up
  to ~190 ms on a 4x-throttled phone.

**Which beat absorbs the slack.** The client can be anywhere in its poll
interval when the server resolves. Handing all of that to the warning made a
FINAL ROUND card sit for nearly three seconds on a lucky poll. So the RESULT
BEAT absorbs first (`anchoredRevealHoldMs`'s new `absorbUpToMs`, capped at
`REVEAL_HOLD_LEVEL_UP_MS` 2600) and the warning takes only what is left,
floored at its promise. The player looks at their own result for longer when
their poll was lucky; the announcement stays close to its intended length.
Ordinary rounds pass no cap and are unchanged.

## Measurements — the medium beats

Production build under `vite preview`, the real `/dev/ranked-shell-probe`
driven through a live round 1 -> round 2 transition, production-shaped latency
(110-260 ms varying per poll) layered over the probe's own interceptor,
headless Chromium under CDP throttling.

| viewport | beat | result beat | warning | ends before `started_at` | overlap |
|---|---|---|---|---|---|
| 390x844, 4x CPU | Final Round | 1769→3407 | **1586 ms** | 140 ms | none |
| | Meta Reflex | 1816→3407 | **2036 ms** | 132 ms | none |
| 360x800, 4x CPU | Final Round | 1777→3411 | **1604 ms** | 127 ms | none |
| | Meta Reflex | 1686→3407 | **2168 ms** | 139 ms | none |
| 1440x900 | Final Round | 1877→3407 | **1501 ms** | 137 ms | none |
| | Meta Reflex | 1870→3425 | **2015 ms** | 138 ms | none |

Across six Final Round runs the beat measured 1426-1840 ms and ended 122-143 ms
before `started_at` every time. No answer time is lost: input opens at the
server's instant, and no sample ever had input open while a beat was up
(`OVERLAP none`). No document scroll and no nested scroll at any viewport; the
4 px horizontal overflow at 390/360 is the probe's own fixed toolbar,
identical on `origin/main`.

**A note on what the browser run covers for Meta Reflex.** The figures above
are the coordinator's window (`data-special-transition`), which is the number
the sting is fed synchronously. Driving the sting ELEMENT in the probe would
need a full contract-valid `segment_state` that the overlay cannot fabricate
by hand, so the element's own duration, its once-per-block behaviour, its
reconnect skip and its reduced-motion duration are covered by the integration
tests against the real fixtures instead.

## Tests — the medium beats

`src/lib/ranked-core/specialTransition.test.ts` (14) — the hierarchy is
declared and every beat is in exactly one class; each duration is what the
owner asked for; the budget carries the poll's latency and real headroom;
final-round detection is from the match contract (10-of-10 yes, 9-of-10 no,
7-of-7 yes, null length no); Meta Reflex by id AND version (v3 no, v5 yes);
final+Meta Reflex is one beat with the higher-stakes word on the longer clock,
deterministically; and the window is all-or-nothing, absorbs surplus, and
reads 0 for a round the client is already in.

`QuizRankedMatch.rfx1b3.test.tsx` gained 13 — the live transition triggers the
beat with its deterministic id; it holds its duration, keeps input locked and
ends before `started_at` while input still opens AT it; it REPLACES the module
title (one run, no `module` face, nothing interactive underneath); no replay
from polling or rerenders; a reconnect straight into the final round plays
nothing; a REFRESH inside the final round's own lead-in plays nothing (the
clock alone would allow it — the mount-advance guard refuses); reduced motion
keeps the duration; an ordinary round keeps its ordinary transition. Meta
Reflex: the beat plays before card 1 for its configured duration and is
comfortably longer than the 720 ms it replaced, card 1 is never interactive
underneath it, it plays once per block with cards 2-5 replaying nothing, a
reconnect into a running block plays nothing, and reduced motion keeps the
duration. Plus: a final round that is also Meta Reflex plays ONE beat, with
`data-warning-ms` proving it took the Meta Reflex clock.

Backend `test_ranked_answerable_boundary.py` gained 8 — a medium beat replaces
the module title and never follows it; no ordinary round is lengthened; the
budget is the beat plus the poll's own latency plus headroom; final round wins
the message and Meta Reflex wins the clock; the visible promise survives the
latest discovery with room to spare; the client constants are mirrored
exactly; special rounds are detected from the frozen format (Meta Reflex at
modules 4 and 9 of the real ladder, final at 10); a format with no
`match_length` is owed no final warning; legacy v1-v3 is not a Meta Reflex
entry; and an unreadable snapshot fails closed to no beat.

**Results.** Ranked + Daily suites **137 files / 1774 tests passing**. Whole
frontend suite 734 files / 11773 passing, failure set **byte-identical to
clean `origin/main`**. Production build clean. Backend Ranked suites 61
passing (plus the one pre-existing stub-DB failure).

## Remaining design work

Exactly four items, all the owner's, and none of them started here:

1. **The Ranked Duel intro's visual and content design** — what the pre-match
   presentation looks like and says. 2B2's duel card occupies the window
   today; this phase only decided how long that window is.
2. **The Meta Reflex warning's visual and content design** — the existing
   720 ms sting now holds for 1800 ms, so its entrance animation finishes and
   the element simply holds for the remainder. That is honest for a
   placeholder and is exactly the thing to redesign.
3. **The Final Round warning's visual and content design** — today a neutral
   `FINAL ROUND / GET READY` placeholder in the arena's new `warning` overlay
   seam, unstyled beyond being visible and testable. The words are
   placeholder semantics, not approved copy.
4. **The match outro's visual and content design** — today a neutral
   `MATCH COMPLETE` placeholder in the focus column. `MatchOutroView` states
   what authoritative material the design may draw on.

None of these designs is complete, and nothing in this phase should be read as
approving copy or composition for any of them.
