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
