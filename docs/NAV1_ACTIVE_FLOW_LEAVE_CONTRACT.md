# NAV1-E — Active Ranked / Daily leave contract

Status: E1 substrate, E2 standalone Ranked wiring, and E3 Daily parent wiring complete; E4 combined core certification recorded below; E2Q deferred

## E4 integration certification record (2026-09-28)

The combined line was rebuilt from fetched `origin/main` at
`3011a416cb1e1ce85bf33bea117b20dc91c42865`. NAV1 A–E, PLAY1, E1, E2, and E3
were missing from main and were applied in dependency order. Main already carried
the upstream SFX2 commits through `dd510777`; E2's local `cfa79d72`/`17fd030d`
copies were patch-equivalent and were not replayed.

Real Chromium certifies active and locked standalone Ranked POP attempts,
Stay/Leave/Forward, terminal authority cancelling a pending POP, mobile dialog
focus/layout, Daily parent Back/Continue/Exit/Forward, and Daily completion while
the parent dialog is open. Request logs prove ordinary leave sends no Forfeit,
abandon, cancellation, or invented termination request. Hosted Ranked remains
owned by Daily and has no standalone blocker. E2Q queue protection and PLAY1
user-initiated exit policy remain intentionally deferred.

The dedicated E4 lane does not yet contain a server-driven ordinary-round
reveal fixture, a separately named Daily hidden-settling scenario, or a
stage-result warning/recovery scenario. E4 must not be marked fully complete
until those remaining named scenarios are added and pass.
Audit base: `576e9dd309094d725afafc837408e329815d927c` (`NAV1-D`)  
Frontend remote observed after fetch: `origin/main` = `4b3be0cbe2767d3107f4462082755066b26b398b`  
Backend remote observed after fetch: `origin/master` = `acb2a946d65e8afb0deba02a5dec9165d8414716`

## 1. Executive conclusion

Navigation is not forfeiture. Browser Back, an in-app link, refresh, tab close,
browser death and network loss are all ambiguous disappearance. They must stop
the client heartbeat when the page unmounts, but they must not send
`POST /api/ranked/matches/{id}/forfeit`. Only the existing, separately
confirmed **Forfeit Match** control means “I concede; award this match to my
opponent and record it.”

The coherent contract is:

1. While a standalone Ranked match is not authoritatively terminal, every SPA
   navigation away (POP, PUSH or REPLACE) is blocked once and described as an
   ordinary leave. The user can **Stay in Match** or **Leave Match**. Leave
   proceeds with the originally attempted navigation and makes no server
   mutation. The existing Forfeit control remains separate.
2. While a started Daily run is active, the Daily parent applies the same
   mechanism with **Continue Daily** / **Exit Daily Challenge**. Exit preserves
   the parent run and makes no forfeit/abandon request. If a hosted child is
   live, its heartbeat stops and the ordinary Ranked reconnect deadline still
   applies. There is no Daily abandon state or endpoint today, so the UI must
   not offer “Abandon Daily.”
3. Refresh, tab close, browser close and network loss are not intercepted and
   never forfeit. Recovery is the protection. A generic `beforeunload` prompt
   cannot offer the product choices, cannot reliably send a forfeit, and adds
   little value while server recovery exists.
4. Daily-hosted Ranked never owns the URL, browser history, exit UI, Forfeit,
   stage result or next-stage decision. The Daily parent owns the leave guard.
5. A blocked POP is restored by the router without adding an entry. Cancel
   calls `reset()`; confirm calls `proceed()` exactly once. No sentinel entries,
   `navigate(+1)` repair, or history loops are allowed.

This is implementable, but the current `<BrowserRouter>` is a hard prerequisite
issue: React Router's supported `useBlocker` API requires a data router. The
first code batch must mechanically adopt `createBrowserRouter` /
`RouterProvider` (or obtain an explicit owner decision to use a different
supported router design). A hand-written `popstate` trap is not approved by
this contract.

## 2. Evidence and authority

The audit read current production code rather than inheriting NAV1-D's design
assumptions. Primary frontend authority:

- `src/App.tsx`: declarative `BrowserRouter`; `/quiz`, `/quiz/ranked`,
  `/quiz/daily-challenge`, `/quiz/playtest`.
- `src/components/quiz/play-scroll/RankedPlayScroll.tsx`,
  `PlayScrollRecord.tsx`, `RankedQueueView.tsx`; and
  `src/pages/quiz-ranked/useRankedQueue.ts`: matchmaking.
- `src/pages/quiz-ranked/QuizRankedPage.tsx`, `QuizRankedMatch.tsx`,
  `useRankedMatch.ts`, `RankedRouteHeader.tsx`; and
  `src/lib/ranked-public/client.ts`: standalone entry, presentation, recovery,
  heartbeat and Forfeit.
- `src/lib/ranked-core/flow/matchHost.ts`: hosted-child boundary.
- `src/lib/daily-challenge/run/{contracts,flow,client}.ts` and
  `src/pages/quiz-daily-challenge/run/{useDailyRun,DailyRunPage,DailyStageChrome}.tsx`:
  Daily authority and presentation.

Backend authority was inspected read-only at `League_Combat_Simulator`
`origin/master`, especially `ranked_public/service.py`,
`ranked_public/persistence.py`, `routes/ranked_public.py`,
`daily_challenge/run/service.py`, `daily_challenge/wiring.py`,
`routes/daily_run.py`, their migrations, and lifecycle/Daily integration tests.

Targeted handoff reads included `docs/ranked-public-frontend.md`,
`docs/RANKED_BOT_WORKSTREAM_HANDOFF.md`, PLAY1's
`docs/PLAYTEST_DIRECTOR_HANDOFF.md` at `c4958b73`,
`DCMOD_E_HANDOFF.md`, `DCMOD_INTEGRATION_HANDOFF.md`,
`DAILY_STAGE_RESULT_HANDOFF.md`, `DAILY_SURVIVAL_UX_HANDOFF.md` and
`JOURNEY5_FRONTEND_HANDOFF.md`, in addition to the two NAV1 documents. Those
handoffs were treated as ownership/history evidence; current code and current
backend service paths remained behavioral authority.

The repository search found no Ranked or Daily `beforeunload`, `popstate`,
`useBlocker`, `unstable_useBlocker` or route guard. Ranked/Daily visibility
handling only resynchronizes clocks/presentation. Analytics observes
`pagehide`; it owns no gameplay consequence. The Team Simulator's unrelated
`beforeunload` handler is not precedent.

## 3. Current standalone Ranked state machine

There are two connected state machines: matchmaking lives inside the Play
record on `/quiz`; an assigned match lives at `/quiz/ranked`.

| Product state | Actual code state / owner | Authority and reconstructibility | Current leave behavior |
|---|---|---|---|
| No match / role choice | `selecting_class`; `RankedPlayScroll` + `useRankedQueue`; `/quiz` | Client selection plus server queue availability; no active obligation | Safe. Play record can close; browser/HUD navigation is ordinary. |
| Queue discovery | `recovering`; same owner/route | Server queue/active-match read; client does not yet know whether work exists | Record currently treats close as safe. A recovered queue or match may arrive after the read. |
| Join in flight | `joining` | Server decides whether an entry was accepted or an active match already exists | Play record refuses close, but browser/HUD navigation remains unguarded. |
| Matchmaking | `waiting` | Queue row is server-owned and polled; explicit Cancel is legal | Record refuses close; visible Cancel calls queue DELETE. Route leave does not cancel. |
| Assignment committed | `pairing` | Server has claimed the queue entry; cancellation is no longer legal; controller polls at 700 ms | Record refuses close. Browser/HUD leave can hide an imminent match. |
| Match assigned | `matched` with `matchId` | Server match exists; delayed handoff navigates to `/quiz/ranked` with `location.state.matchId` | Record refuses close; route leave is unguarded until handoff. |
| Existing match offered | `reconnect_required` with `reconnectMatch` | Server active-match discovery; user must explicitly Reconnect in the Play record | Record refuses close; external route leave is unguarded. |
| Route assignment / fresh intro | handoff ID, `entry="fresh"`; `RankedMatchHost` then `QuizRankedMatch`; `/quiz/ranked` | ID is a hint. First public/private snapshots are authoritative. Intro/preparing is client presentation only | Active header is a normal PUSH Link labelled “Back to Quiz”; browser/HUD navigation unguarded. |
| Recovery / newly opened route | `recovering`; no handoff, then `getActiveMatch()` | Account-bound server discovery. Daily child redirects REPLACE to Daily. Standalone ID mounts recovered arena | Route is unguarded while discovering and while the first snapshot is loading. |
| Active question | controller `active`; presentation `answering` | Round/deadline/score/server clock authoritative. Current unsent selection is client-only | Explicit Forfeit shown for standalone. All navigation unguarded. |
| Submitted / waiting | controller `locked`; presentation `waiting` | Submitted answer is on server. Local disabled/action state is not authority | Same. |
| Answer reveal | `revealHold`; presentation `revealing` | Settlement is server data; the decision to replay/hold this reveal is mount-local | Same; leaving loses the local reveal beat, not the settlement. |
| Between rounds / module intro | `publicRound === null` with sticky round, or presentation `module-intro` | Server next-round schedule authoritative; sticky header and intro timing are client-only | Same. |
| Meta Reflex / special stage | projected special transition plus segment state | Segment/challenge actions server-owned; special transition window is client presentation | Same. |
| Final-round warning | special transition kind `final-round` | Server format/round authoritative; warning observation is client-only | Same. |
| Conclusion pending | controller `match_outro`; presentation `match-outro` | Match is already authoritatively complete, but this mount still owes final reveal/outro | Active chrome remains mounted and unguarded today. No further forfeit is meaningful. |
| Terminal result | `match_over` | Result/history server-owned. Recovered completed ID skips live-only outro | NAV1-D: header and all result exits REPLACE. No active guard should run. |
| Fatal/unresolved | `fatal` (declared `recovering_error` is not currently selected) | Client has not necessarily proved terminality | Retry uses document reload. A known, not-proved-terminal match must remain protected; a discovery response of no active match safely REPLACEs to `/quiz`. |

`reviewing` remains in the `MatchPhase` union but is not selected by the current
phase projection. “Pre-match” in this document means an assigned match's
loading/intro, not merely the safe `selecting_class` lobby state.

### Queue contract

The queue is a transaction but not a match and is not a Forfeit surface.

- `selecting_class`, `unavailable`, `fatal`: no guard.
- `recovering`: do not newly guard until the server reports an obligation; the
  user has not initiated one on this mount.
- `joining`, `waiting`, `cancelling`: leaving the Play record remains withheld.
  A later route-level integration may present **Leave Ranked queue?** with
  **Stay in Queue** and **Cancel Queue and Leave**. Confirm must await the
  existing authoritative cancellation. If cancellation races into `pairing`,
  do not navigate; switch to the committed-assignment contract.
- `pairing`, `matched`, `reconnect_required`: cancellation is unavailable or a
  match already exists. Do not claim “cancel.” The match/assignment leave copy
  must say that leaving does not cancel the match and recovery is time-limited.

Queue route protection is a separate E2 sub-batch because the queue is mounted
inside a local Play record on `/quiz`. It must not delay protection of the
actual `/quiz/ranked` route.

## 4. Current Daily state machine

The parent route is always `/quiz/daily-challenge`. Stages are presentation
state, not routes or history entries.

| Product state | Actual state / owner | Persistence / recovery | Current leave behavior |
|---|---|---|---|
| Invalid/unavailable | `load="unavailable"` or read error; `DailyRunPage` | No usable run snapshot | Safe Back Link to `/quiz`. |
| Not started | `load="ready"`, `run=null` | `readToday()` found no run. Begin calls idempotent `startToday()` | Safe; no attempt exists yet. |
| Daily intro | flow `daily-intro` | Run already exists server-side; intro latch is client-only and may replay only for an untouched current-day run | Header Link exits by PUSH, no guard. |
| Stage intro | `stage-intro`; stage `pending`, `launching`, or newly `in_progress` under a local tag | Stage creation is idempotent and server-persisted. The child can already be live behind the tag | Header Link exits by PUSH, no guard. |
| Hosted stage active | `stage-play`; stage `in_progress` + `childMatchId` | Canonical Bot Ranked child is server-persisted. Standard, Time Trial, Survival and Review all use the same hosted arena; Time Trial/Survival add parent ruleset state | Daily chrome Back exits parent by PUSH; child shows no Forfeit/standalone result. |
| Hosted reveal | still `stage-play`; child reports `revealing` | Child settlement server-owned; reveal latch client-only | Same. |
| Survival player finished | `stage-settling`, possibly `settlingChildMatchId` | Parent keeps hidden child mounted so canonical match can finish; run has not advanced until server sync | Same header exit; leaving removes the hidden poll/heartbeat. |
| Child settled / parent sync | `stage-settling`, `settledChild` | Child terminal; parent sync retries up to six times. Latch/error is client-only | Same. Refresh reads parent; a finished-but-unsynced child can be advanced by later sync/recovery. |
| Stage result | `stage-result`, `resultFor` | Stage/result persisted; showing this interstitial is mount-local and only occurs for a transition this mount observed | Same. Exit loses this one-time interstitial; return starts from current server stage. |
| Parent transition | result Continue clears only local latch; controller introduces/launches current server stage | Server already chose the next stage | No URL/history mutation. |
| Review | stage kind `review`, otherwise the same intro/hosted/result states | Review child and misses are server-persisted; perfect runs may skip it | Same parent ownership. |
| Complete | flow `complete`, run `status="completed"` | Outcome and all stages persisted | Safe terminal UI; active guard disabled. |

Pure parent-owned UI: Daily intro, stage tags, settling/result interstitials,
Continue, completion and the stage ladder/chrome. Hosted gameplay: every
playable stage, including Review, is a canonical Bot Ranked child. Time Trial
and Survival are not alternate client games: they are server-persisted Daily
rulesets projected through the child arena. The parent run, stage statuses,
child IDs, results, misses, ruleset live data and outcome are server-owned;
intro/result latches, presented child phase, strike display floor and local
retry/busy state are client-only.

## 5. Reconnect contract proved from current code

1. The server identifies an active match by authenticated account membership,
   not browser storage. `GET /api/ranked/active-match` settles expired matches
   before returning an account's active one. It returns `match_id`, bot flag,
   host, `reconnect_deadline` and `within_reconnect_window`.
2. `/quiz/ranked` uses `location.state.matchId` for a fresh handoff. Without
   one it calls `getActiveMatch()`. A Daily-hosted child REPLACEs to its parent;
   a standalone child mounts with `entry="recovered"`; no active match REPLACEs
   to `/quiz` with the Play record requested open.
3. A player may leave for 30 seconds and return, provided lifecycle evaluation
   has not passed the configured deadline. The default is 45 seconds total:
   20 seconds disconnect detection plus 25 seconds grace. A recent heartbeat
   moves that effective deadline; copy must say “about 45 seconds,” not promise
   a fresh 45 seconds at the moment the dialog appears.
4. Server round and ruleset clocks are absolute and do not pause. Progression
   is request/lifecycle driven: a connected opponent keeps polling, while an
   unattended bot does not independently run a browser. A later request can
   settle elapsed deadlines. Therefore “resume exactly where you left” is not
   truthful; the match may have advanced or ended.
5. Public/private snapshots, answers already accepted by the server, latest
   settlement, damage/segment state and result are authoritative and rebuilt.
   An unsent selection, intro, reveal already seen, special-transition beat,
   outro, local errors and audio cannot be reconstructed and deliberately are
   not replayed on recovery.
6. The client polls about every 1.5 seconds and heartbeats every 10 seconds.
   Unmount aborts reads and timers; it sends neither Forfeit nor an unload
   command.
7. On lifecycle evaluation, one human beyond the window forfeits and the other
   wins; two absent humans produce no contest. Bot participants are exempt from
   being considered disconnected. Explicit Forfeit and timed disconnect share
   the authoritative terminal settlement path, but only the endpoint proves
   intent.
8. There is no eager “left route” backend event. Expiry is applied by the
   lifecycle worker when enabled or lazily on relevant requests. The observable
   outcome remains deadline-based, not route-based.
9. Ranked history records terminal reason/result. A match completed while away
   is no longer returned by active discovery. A route opened with its known ID
   can render the terminal result; a fresh `/quiz/ranked` discovery returns to
   `/quiz`.

## 6. Explicit Forfeit versus ordinary leave

### Explicit Forfeit

- Surface: standalone `ForfeitControl`; intentionally absent in `MatchHost`.
- Confirmation today: “Forfeit? Your opponent wins this match and it counts.”
  Cancel precedes Forfeit and does nothing.
- Command: `POST /api/ranked/matches/{matchId}/forfeit`, authenticated and
  idempotent. A terminal match returns success with `forfeited: false` /
  `already_complete: true`.
- Server consequence: terminal `forfeit`; opponent wins; participant/history
  record the reason; normal PvP rating policy applies. Bot Ranked remains
  unrated under its existing policy.
- Client consequence: no local loss is invented. Poll reads the authoritative
  terminal result. Current Forfeit does not navigate.
- Availability: active standalone arena states, including answer/wait/reveal;
  not Daily-hosted, not terminal, not the queue. During initial recovery it is
  absent until the arena can render its quiet control.

### Ordinary leave

- Meaning: “continue to the destination I requested and stop presenting this
  session here.”
- Server consequence: none immediately. Poll/heartbeat stops after unmount;
  reconnect/lifecycle rules then operate normally.
- It must never call Forfeit, queue cancellation or Daily abandonment unless
  the user chose a separately named action that says exactly that.
- The leave confirmation does not offer “Forfeit and leave.” Keeping the two
  actions separate avoids turning a navigation dialog into a loss command and
  preserves the already-known-good Forfeit control. A player who wants to
  concede chooses **Stay in Match**, then **Forfeit Match**.

## 7. Active-leave inventory and proposed semantics

### Standalone Ranked match

| Surface | Runtime state | User action | Current behavior | Server consequence | Client consequence | Reconnect? | Explicit intent? | Current → proposed semantic | Confirm? / on confirm / on cancel | History | Mobile / risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ranked | assigned pre-snapshot, intro, active, locked, reveal, inter-round, special/final warning | Browser Back | Immediate POP | None; heartbeat later stops | Route unmount, local beat lost | Conditional, deadline-based | Navigation only | raw POP → ordinary leave | Yes; proceed original POP / reset | blocked POP, then POP or unchanged | System/swipe Back same; **P1** |
| Ranked | same | Browser Forward after a cancelled Back | Usually no forward destination; if one exists, current behavior follows it | None | May unmount | Conditional | History manipulation | raw POP → new leave attempt only if it actually targets another entry | Same; never auto-proceed | stack unchanged by prior cancel | Browser-specific gestures; **P1** |
| Ranked | same | Header “Back to Quiz” | PUSH `/quiz` | None | Match unmounts | Conditional | Deliberate route leave, not concession | mislabeled Back → **Leave Match** | Yes; PUSH `/quiz` / stay | requested PUSH preserved | 44px/mobile access; **P1** |
| Ranked | same | HUD hat | PUSH HOME `/lol` | None | Match unmounts | Conditional | Deliberate HOME | HOME → guarded HOME | Yes; PUSH `/lol` / stay | requested PUSH preserved | Hat remains HOME; **P1** |
| Ranked | same | Other same-origin Link or `navigate()` away | Immediate PUSH/REPLACE/POP | None | Match unmounts | Conditional | Depends on control; never concession by itself | internal navigation → guarded original intent | Yes except bypasses below | preserve original action | Capture all router navigation; **P1** |
| Ranked | same | Address bar/deep link to another document | Document unload | None | Full unmount | Conditional | Ambiguous document leave | document navigation → allow | No custom unload prompt | browser-owned | Mobile address/app switch; **P2** |
| Ranked | same | Refresh | Full remount | No Forfeit | Discovery/resume; local presentation resets | Yes if in window | No | recovery | No | same entry/document reload | Pull-to-refresh equivalent; **P2** |
| Ranked | same | Tab/browser close | Unmount | No immediate command; lifecycle deadline | No UI | Conditional on return | No | ambiguous disappearance | No | browser-owned | Async Forfeit forbidden; **P1 if conflated** |
| Ranked | same | Network loss | Poll/heartbeat fail/back off | Lifecycle window | Route may remain with error/stale clock | Conditional | No | connectivity loss | No leave dialog | none | Offline mobile common; **P1 if conflated** |
| Ranked | same | Explicit Forfeit | Existing inline confirmation and POST | Immediate authoritative forfeit if still active | Poll renders result; no route change | No active match afterward | **Yes** | concession → unchanged | Existing confirmation only | none until terminal action REPLACE | Keep separate; **P1** |
| Ranked | `match_outro` | Any SPA leave | Unguarded | Match already complete | Owed outro may be lost | Result recoverable | Navigation | completed presentation → ordinary leave allowed | No active guard once terminal authority is known | requested action | **P2** presentation loss |
| Ranked | `match_over` | Header/result action/Back | NAV1-D REPLACE for visible exits; browser POP otherwise | None | Leaves terminal UI | N/A | Navigation | terminal navigation → unchanged | No | NAV1-D REPLACE preserved | **Regression P1** |

Guard activation is based on authority, not visual state: a known match ID is
protected until a snapshot proves it terminal. A fatal client error does not
prove terminality. Conversely, `match_outro` is already authoritatively
terminal and must not demand “leave an active match” confirmation.

### Daily and Daily-hosted Ranked

| Surface | Runtime state | User action | Current behavior | Server consequence | Client consequence | Reconnect/resume? | Explicit intent? | Current → proposed semantic | Confirm? / on confirm / on cancel | History | Mobile / risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Daily | not started / unavailable | Back, HUD, internal nav | Immediate navigation | None | Leaves entry | N/A | Navigation | safe navigation | No | original action | Low |
| Daily | active parent: intro or stage intro with no live child | Browser Back | Immediate POP | Run remains active | Local intro/tag lost or recomputed by recovery rules | Same UTC plan date | Navigation | ordinary Daily exit | Yes; original POP / reset | blocked POP, then POP or unchanged | System Back same; **P1** |
| Daily | hosted stage active/reveal or live child behind tag | Browser Back | Immediate POP | Child heartbeat stops; no explicit Forfeit; deadline continues | Parent/child unmount | Parent resumes today; child only within lifecycle window | Navigation | ordinary Daily exit with live-stage warning | Yes; original POP / reset | same | **P1** |
| Daily | settling | Browser/header/HUD/internal | Immediate navigation | May remove hidden polling before child/parent settle | Recovery reads canonical state; result beat may not replay | Conditional | Navigation | ordinary exit, stage may finish away | Yes | original action | **P1** |
| Daily | stage result | Browser/header/HUD/internal | Immediate navigation | None; stage already persisted | One-time result interstitial is lost on return | Run resumes | Navigation | ordinary exit with result-screen truth | Yes | original action | **P2** |
| Daily | any active state | Daily header “Back to Quiz” | PUSH `/quiz` | As above | As above | As above | Deliberate parent-flow exit | mislabeled Back → **Exit Daily Challenge** | Yes; PUSH `/quiz` / stay | PUSH preserved | **P1** |
| Daily | any active state | HUD Home | PUSH `/lol` | As above | As above | As above | Deliberate HOME | HOME → guarded HOME | Yes; PUSH `/lol` / stay | PUSH preserved | **P1** |
| Daily | any active state | Refresh | Remount/read today | No abandon or explicit Forfeit | Local beats reset according to recovery rules | Same current UTC plan date; child deadline applies | No | recovery | No | reload | **P2** |
| Daily | any active state | Tab close / browser close / network loss | Unmount or failed requests | No Daily abandon; child lifecycle may later settle | No UI | Conditional | No | ambiguous disappearance | No | browser-owned/none | **P1 if conflated** |
| Daily | complete | Any nav | Immediate navigation | None | Leaves final summary | Completed run readable today | Navigation | terminal exit | No | original/NAV1 policy | Low |
| Hosted child | any child phase | Child Forfeit/standalone Back/result | Not exposed today | None | Parent remains owner | Parent rules | N/A | forbidden child behavior → unchanged | Never | none | **P1 invariant** |

Direct same-document hash/search changes that do not leave the owning active
route are not exits and should not open a leave dialog. A direct address-bar
navigation is a document unload and remains browser-owned.

## 8. Daily Exit semantics

Current capability supports Option A only: leave the UI, preserve the run and
resume. It does **not** support permanent abandon (Option B), mandatory abandon
(Option C), or a durable stage-dependent abandon status (Option D).

- `startToday` creates or resumes one deterministic official run per
  `(user, policy, UTC plan_date)`; the database uniqueness constraint prevents
  a second run that day.
- Run/stage status, child IDs, completed-stage results, score, misses, Review
  inputs and outcome are persisted. Presentation latches are not.
- There is no `paused` or `abandoned` run/stage status and no abandon endpoint.
- Leaving after Begin does not consume an additional token, but the one run for
  that plan date already exists. A new attempt cannot be created.
- A live hosted child is reconstructible only under normal Ranked lifecycle
  rules. Parent progress remains; the current child may advance or end while
  away. A result interstitial already observed to begin will not replay after
  remount.
- Review is generated from persisted completed-stage misses. A child that
  settles while the UI is absent can later be synced and the run can continue;
  there is no parent “abandoned” outcome to suppress Review.
- Ranked history excludes Daily child matches, correctly preventing a hosted
  timeout/forfeit from masquerading as a standalone duel. Current user History
  has no canonical incomplete/abandoned Daily row. NAV1-E must not invent one.
- `readToday` is keyed to the current UTC date. An incomplete prior-date run is
  persisted in the database but is not resumed by today's frontend route.
  Copy should say “before the Daily resets,” not promise indefinite resume.

Therefore **Exit Daily Challenge** means: navigate to the requested destination,
preserve every server-committed stage, do not create an abandoned status, do
not Forfeit explicitly, and allow same-day recovery subject to the active
child's deadline and the UTC Daily rollover.

## 9. Hosted Ranked ownership contract

| Concern | Owner | Child permission / prohibition |
|---|---|---|
| URL and browser history | Daily route/parent | Child must never navigate to standalone Ranked, Quiz or result routes. |
| Browser/internal leave guard | Daily parent | Child must not mount a second blocker. |
| Header / Exit copy | Daily parent (`DailyStageChrome`) | Child may render passed `chrome`; it does not choose its destination. |
| Match polling, heartbeat, answer submission | Ranked child | Allowed and required while mounted. |
| Explicit Forfeit | Standalone Ranked only | Hosted child must never expose or call it. |
| Stage completion observation | Ranked child reports once through `MatchHost` | Child may report settlement/player-finished/presentation; it must not advance the run. |
| Stage result / Continue | Daily parent | Child suppresses standalone result. |
| Next stage / Review / Daily completion | Daily server + parent | Child must not decide or navigate. |
| Host-directed checkpoint/unmount | Owning host (Daily or PLAY1 wrapper) | This is a system transition and must bypass an ordinary user-leave guard. |

The guard belongs at `DailyRunPage`, where the parent snapshot and original
navigation intent coexist. Shared code may provide blocker mechanics and a
dialog shell, but never Ranked/Daily policy. Do not duplicate a guard in the
hosted `QuizRankedMatch`.

## 10. Browser-history model

### Standalone Ranked

Let the stack be `[Q=/quiz, R=/quiz/ranked]`, index at `R`.

- Back attempt: router observes POP toward `Q`, restores the URL/UI to `R`
  without PUSH, and exposes one blocked transition.
- **Stay in Match**: `blocker.reset()`. Stack remains `[Q, R]`, index `R`.
  There is no newly created Forward entry. A later Back is a fresh attempt.
- **Leave Match**: `blocker.proceed()` after restoration. The original delta is
  replayed once. Stack remains `[Q, R]`, index `Q`. Forward now targets `R`.
- Forward back to `R`: the route recovers by its handoff ID if retained in
  history state, otherwise account discovery. If active, protection remounts;
  if terminal, result/no-active behavior follows server authority.
- Header confirm: preserve its intended PUSH, producing `[Q, R, Q]` at the
  last entry. Back from the lobby returns to `R` and attempts recovery. This is
  truthful browser history, not a trap. HUD Home similarly produces
  `[Q, R, /lol]`.
- Explicit Forfeit: no navigation and no stack change. Once terminal, NAV1-D's
  visible result exit REPLACEs `R`, producing `[Q, destination]` in the simple
  entry case.
- Terminal discovery with no active match: current route REPLACEs to `/quiz`.

While a blocker is already `blocked` or `proceeding`, further Back/Forward
input is ignored/coalesced; it must not overwrite the captured destination or
open another dialog.

### Daily

Let `[Q=/quiz, D=/quiz/daily-challenge]`, index at `D`. Stage 1, 2, 3, Review
and completion do not add entries.

- Back during any active stage blocks the POP and restores `D` without PUSH.
- **Continue Daily** resets; `[Q, D]`, index `D`.
- **Exit Daily Challenge** proceeds; `[Q, D]`, index `Q`; Forward targets `D`
  and remounts from the current server snapshot.
- Header Exit PUSHes `/quiz` after confirmation, resulting `[Q, D, Q]`.
- Back never means “previous Daily stage.” Server stage order is not browser
  history and cannot be rewound.

## 11. Router capability and implementation architecture

`package-lock.json` resolves `react-router-dom` 6.30.1. The checked workspace's
installed pnpm tree was 6.30.6, a local install drift; the relevant 6.30 API
and blocker implementation are the same. The lockfile is the implementation
target.

- `useBlocker` handles SPA POP/PUSH/REPLACE and returns
  `unblocked | blocked | proceeding` with the attempted location plus
  `proceed()`/`reset()`.
- It calls `useDataRouterContext`; it cannot run under the current
  `<BrowserRouter><Routes>...` tree.
- For a blocked router-created POP, the router restores the URL with the
  inverse delta, then `proceed()` replays the original delta. `reset()` only
  clears blocker state. This is the required no-duplicate history model.
- The router warns that POP entries created outside router APIs may not have a
  usable delta. Product code must not mix raw `history.pushState` with guarded
  routes.
- The router supports only one active blocker. Standalone and Daily are
  mutually exclusive routes; hosted child must not add another.
- `unstable_usePrompt` is rejected. Its own source warns of incorrect behavior
  when users click additional Back/Forward while `window.confirm` is open.
- `useBeforeUnload` only installs a document lifecycle callback and does not
  protect SPA navigation. It is not needed for this contract.

### Smallest approved architecture

1. **Data-router prerequisite.** Mechanically express the existing route tree
   with `createBrowserRouter(createRoutesFromElements(...))` and render it via
   `RouterProvider`, preserving provider placement, routes, lazy boundaries,
   Layout and Academy audio lifetime. No loaders/actions are required.
2. **One shared mechanic.** Add a narrow
   `useTransactionalLeaveGuard({active, kind, copy})` around `useBlocker` and a
   reusable accessible modal shell. `kind` is `ranked_match | ranked_queue |
   daily_run`; it is not a universal navigation-intent framework.
3. **Flow-owned policy.** Standalone `QuizRankedMatch` enables its guard only
   when not hosted and a known match has not been proved terminal. `DailyRunPage`
   enables its guard for `run.status === "active"` and chooses copy based on
   whether the current stage has a live child/result. Queue integration is
   separately owned by the Play record/controller.
4. **Captured transition.** The hook retains the router's blocked transition;
   cancel calls `reset`; ordinary confirm calls `proceed`. It never issues its
   own replacement navigation and never reconstructs a path string.
5. **Bypasses.** A typed bypass is allowed only for:
   `AUTHORITATIVE_TERMINAL`, `HOST_RETURN`, `AUTH_RECOVERY`, and
   `ROUTE_RECOVERY`. Terminal NAV1-D actions normally need no flag because the
   active predicate is already false; the explicit name prevents race-prone
   ad hoc booleans. Daily child handback/next stage is local and does not touch
   history. PLAY1 host checkpoint unmount is `HOST_RETURN`.
6. **Auth/recovery.** A redirect required because the session is no longer
   usable, a Daily child was discovered on `/quiz/ranked`, or discovery proves
   no active match may bypass. User-initiated auth/profile/Home navigation may
   not. Bypasses are one-shot and cleared after use.
7. **No unload behavior.** Do not add `beforeunload`, `sendBeacon`, fetch with
   `keepalive`, pagehide settlement or visibility-based Forfeit.

If the router migration is not accepted, implementation stops for an owner
decision. A custom `popstate` listener plus click capture would miss or
reimplement programmatic navigation, POP delta restoration, Forward behavior
and concurrency; it is not a safe “smaller” implementation.

## 12. UX and exact copy

### Standalone live match

Active header label: **Leave Match** (destination remains `/quiz`).

Dialog title: **Leave this Ranked match?**

Body: **Leaving will not forfeit immediately. The match keeps running. You can
reconnect for about 45 seconds, but it may advance or end while you are away.**

Actions, safe action first in reading/tab order:

- **Stay in Match** — reset the blocked transition.
- **Leave Match** — proceed to the exact requested destination; no server call.

Do not put a Forfeit button in this dialog. Existing **Forfeit Match** remains
the explicit concession and retains its existing consequence copy.

For a committed assignment without a mounted arena, replace the body with:
**Your match is being created. Leaving will not cancel it. If it starts, you
will have only a short time to reconnect.**

### Daily with no live child

Active header label: **Exit Daily Challenge**.

Dialog title: **Exit Daily Challenge?**

Body: **Your completed stages are saved. You can resume before the Daily
resets. This is your one run for today.**

Actions: **Continue Daily** / **Exit Daily Challenge**.

On `stage-result`, append: **This stage result screen will not be shown again
when you return.**

### Daily with a live or settling child

Dialog title: **Exit Daily Challenge?**

Body: **Your completed stages are saved, but this stage is still live. Leaving
does not forfeit immediately. Return within about 45 seconds or the stage may
end, and there is no second Daily run today.**

Actions: **Continue Daily** / **Exit Daily Challenge**.

This copy describes the default lifecycle without promising a fresh deadline.
If a future API exposes a stable displayable remaining duration, copy may show
that value instead of “about 45 seconds.”

## 13. Failure/race contract

| Failure mode | Required handling |
|---|---|
| Double-click Back | First blocked transition wins. One dialog, one stored destination; ignore further POP until reset/proceed. |
| Rapid Back then Forward | Do not replace the pending destination. Router completes restoration before either reset or proceed. A post-reset Forward is treated from the restored index. |
| Back while dialog open | Ignore/coalesce. Never stack dialogs or synthetic history. |
| Reveal transition during dialog | Server polling/heartbeat continue because route remains mounted. Copy/state may update; pending destination stays. |
| Match becomes terminal while dialog open | Close/reset the leave dialog automatically, disable the guard, and show the authoritative terminal/outro flow. Do not auto-proceed a stale leave request. |
| Opponent/bot finishes while deciding | Same terminal rule. Forfeit is never sent. |
| Daily stage finishes while dialog open | Recompute copy from the new parent/child state without losing the blocked destination. If the whole run completes, close/reset and show completion. |
| Ordinary leave then reconnect | Recover from account/match authority; do not replay unseen/previously seen presentation beats. |
| Recovery redirect while blocked | Only a typed `ROUTE_RECOVERY` may reset/bypass. Never call `proceed()` toward an obsolete user destination. |
| Auth expiry | Stop protected gameplay and use `AUTH_RECOVERY`; preserve a safe return target where current auth flow supports it. Do not trap the user behind the dialog. |
| Network loss while dialog open | Dialog remains local; Stay keeps retry/recovery behavior. Leave proceeds locally with no promise of server acknowledgement. |
| Mobile swipe-back cancellation | A browser-cancelled gesture produces no committed POP/dialog. A committed POP follows the same blocker. Certify on real mobile engine/emulation. |
| React StrictMode | Effects may mount twice in tests/dev. Register one router blocker, clean it on unmount, make dialog opening and bypass consumption idempotent. |
| Forfeit confirmation and leave dialog | Never allow two confirmations at once. Opening the route-leave dialog leaves the existing Forfeit surface inert behind modal focus; it does not transform the action. |
| Same-route/hash navigation | Do not block when the active-flow owner remains mounted and transactional state is unchanged. |

## 14. Later implementation test matrix

Unit/component tests prove predicates, copy and callbacks. They are necessary
but not sufficient; POP restoration and Forward must use a real Playwright
browser with actual history.

### Ranked

1. Enter from `/quiz`, start an authoritative match, browser Back during an
   unanswered round: one guard, URL/UI restored to `/quiz/ranked`.
2. Stay: exact match DOM/controller remains mounted; poll/heartbeat continue;
   no Forfeit/cancel request.
3. Assert `history.length`, current URL and Back/Forward destinations are
   unchanged after cancel.
4. Back then Leave: original POP reaches `/quiz`; no Forfeit request.
5. Forward to `/quiz/ranked`: active discovery/handoff recovers the same match
   within deadline and does not replay fresh intro.
6. Existing Forfeit confirmation sends exactly one POST, records terminal
   Forfeit and does not navigate until the existing terminal UI action.
7. Active header reads Leave Match and uses the same guard; confirm reaches
   `/quiz` with PUSH, cancel stays.
8. HUD hat keeps HOME `/lol`; same guard, confirm reaches `/lol`.
9. Refresh during active/locked/reveal: no unload prompt or Forfeit; recovered
   server state is correct and unsent selection/local reveal rules hold.
10. `match_outro`/`match_over`: no active leave dialog; all NAV1-D terminal
    actions and header still REPLACE, including browser-history assertions.
11. Cancelled Back followed by Forward: no accidental destination/proceed and
    no duplicate entry.
12. Rapid repeated Back/Back-Forward: one dialog, one proceed, coherent index.
13. Match becomes terminal while dialog open: dialog closes; terminal result
    wins; stale POP is not replayed.
14. Active fatal/recovery states: known not-proved-terminal match protected;
    no-active and Daily-host discovery redirects bypass exactly once.
15. Queue: waiting cancel-and-leave waits for success; cancel/pairing race does
    not navigate; committed assignment copy never claims cancellation.
16. Mobile viewport/system Back equivalent and swipe-cancel smoke test.

### Daily

1. Back during active Daily intro/pending stage: parent guard and truthful copy.
2. Continue Daily: same run/component remains, no API mutation, history stable.
3. Exit: exact attempted destination, parent run remains active.
4. Back/header/HUD during hosted Ranked answer, wait and reveal: only parent
   dialog, no child Forfeit, no standalone navigation.
5. Parent-owned stage intro and settling use the correct live-child variant.
6. Stage result copy warns that the interstitial will not replay; exit/return
   lands on canonical current stage.
7. Refresh at intro, active child, settling and result: no unload prompt;
   `readToday` reconstruction and latch rules are exact.
8. HUD Home remains `/lol`, guarded by Daily parent.
9. Cancelled POP/Forward and confirmed POP/Forward maintain `[Q,D]` semantics;
   Forward resumes server state and never means previous/next stage.
10. Daily completion disables guard and leaves completion/NAV1 behavior intact.
11. Survival third-strike hidden-child settlement while dialog is open.
12. UTC rollover: previous run is not falsely presented as resumable today.
13. PLAY1 host checkpoint/unmount bypasses without a user-leave dialog; user
    navigation from the playtest remains owned and tested by PLAY1.

Playwright must assert request logs (no Forfeit/abandon), URLs, `history.length`,
Back/Forward reachability, modal count/focus and recovery identity. MemoryRouter
tests cannot certify browser POP ordering.

## 15. Workstream collision map

Refs were refreshed before this audit. `9be28689` (Ranked lifecycle) and
`4defb73e` (recovery) are ancestors of NAV1-D. Daily result `d0111b11`, Survival
UX `fe33aaa7`, integration `7be2413a` and Journey release work are also already
represented in the NAV1-D ancestry. The relevant live side refs are PLAY1
`c4958b73446d612507f91273255470d2b461b19b` and SFX2
`2153d4c8c438fc1f8f48a23e464ffee0e21ce89a`; neither is an ancestor of NAV1-D.
PLAY1's tip is documentation-only over its implementation and SFX2 touches the
Ranked SFX observer/hook. Neither changes the server contract.

| File / area | Likely NAV1-E work | Current adjacent owner | Conflict |
|---|---|---|---|
| `src/App.tsx` | BrowserRouter → data-router prerequisite, route tree/provider preservation | PLAY1 route; broad app routing owners | **HIGH** |
| new `src/lib/navigation/useTransactionalLeaveGuard.ts` | Shared blocker state machine | none | **LOW** |
| new leave dialog component + tests | Accessible modal/copy slots | design system only | **LOW** |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | Standalone-only authoritative active predicate/guard | lifecycle/Journey; SFX integration observes its phases | **HIGH** |
| `src/pages/quiz-ranked/RankedRouteHeader.tsx` | Active label Leave Match; terminal label/back unchanged | NAV1-D | **MEDIUM** |
| `src/components/ranked-arena/ForfeitControl.tsx` | **No change required** | Ranked lifecycle | **BLOCKED from semantic changes** |
| `src/components/quiz/play-scroll/{RankedPlayScroll,PlayScrollRecord}.tsx`, `useRankedQueue.ts` | Optional queue transaction guard/cancel race | PLAY1 match entry | **HIGH; separate sub-batch** |
| `src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` | Parent guard/copy selection | Daily/Journey/Survival | **HIGH** |
| `src/pages/quiz-daily-challenge/run/DailyStageChrome.tsx` | Active label Exit Daily Challenge | Daily/Journey | **MEDIUM/HIGH** |
| `useDailyRun.ts`, `matchHost.ts` | Prefer no change; consume existing run/host state | Daily lifecycle | **BLOCKED unless evidence forces API change** |
| `src/components/hud/GlobalHud.tsx` | No semantic/code change; Link is caught centrally | global HUD | **LOW/no-touch** |
| PLAY1 host/gate | Typed `HOST_RETURN` certification, possibly owner wiring | PLAY1 `c4958b73` | **HIGH owner boundary** |
| `useRankedMatchSfx.ts` | No change; regression coverage only | SFX2 `2153d4c8` | **LOW direct / MEDIUM integration** |
| new `e2e/nav1/active-flow-leave.spec.ts`, Playwright config/fixtures | Real history/recovery tests | NAV1 test lane | **LOW/MEDIUM** |

Safest integration order: integrate/rebase the current PLAY1 route owner first;
integrate SFX2 and retain its observer behavior; land NAV1-E1 router mechanics;
then E2 and E3 may proceed on disjoint surface files; finish with E4 combined
browser certification. Do not replace entire Ranked/Daily components during
conflict resolution.

## 16. Exact implementation batches

### NAV1-E1 — supported blocker substrate

Files:

- `src/App.tsx`
- new shared navigation hook/state tests
- new accessible leave-dialog shell/tests
- route/provider regression tests, including `EntryMusicController` lifetime

Work: mechanical data-router adoption; one-blocker wrapper; blocked/proceeding/
reset discipline; typed bypasses; no flow wiring and no product copy decisions.

Dependencies: integrate the current PLAY1 `App.tsx` route first.  
Conflict: **HIGH** in `App.tsx`, otherwise LOW.  
Parallel: no other router-owner change may run concurrently.

### NAV1-E2 — standalone Ranked match contract

Files:

- `src/pages/quiz-ranked/QuizRankedMatch.tsx` and focused tests
- `src/pages/quiz-ranked/RankedRouteHeader.tsx` and tests
- shared dialog copy configuration only if E1 left it flow-neutral

Work: standalone-only active predicate; Leave Match copy; POP/PUSH/HUD coverage;
terminal/race bypass. Do not edit Forfeit semantics, hosted behavior or NAV1-D
terminal REPLACE.

Dependencies: E1; integrate SFX2 first or rebase carefully.  
Conflict: **HIGH**.  
Parallel: may run with E3 after E1 because the surface files are disjoint.

### NAV1-E2Q — Ranked queue transaction boundary

Files:

- `src/components/quiz/play-scroll/RankedPlayScroll.tsx`
- `src/components/quiz/play-scroll/PlayScrollRecord.tsx`
- possibly `src/pages/quiz-ranked/useRankedQueue.ts` only to expose an awaited
  authoritative cancel result
- focused queue race tests

Work: guard live queue obligations; explicit cancel-and-leave only while legal;
committed-assignment copy; never Forfeit.

Dependencies: E1 and current PLAY1 owner.  
Conflict: **HIGH**.  
Parallel: not with PLAY1; may be deferred without weakening E2's active-match
contract.

### NAV1-E3 — Daily parent Exit contract

**Implemented.** `DailyRunPage` owns one `daily_run` blocker while the
canonical run has `status === "active"`. Its predicate blocks only departure
from `/quiz/daily-challenge`, so owner-preserving search/hash changes and every
stage transition remain local. The header is **Exit Daily Challenge** for an
active run; pre-run, unavailable, and completed views retain safe navigation.

Copy is projected on every render from the newest parent state. A canonical
in-progress/launching child is live even behind a stage tag, and Survival's
hidden `settlingChildMatchId` remains live. A terminal child already handed
back while parent sync is pending uses normal saved-progress copy. Only the
mount-local `stage-result` view gets the approved non-replay warning. State
changes update copy without replacing the pending destination; completion
resets that stale transition and leaves the completion mounted.

No Daily endpoint, Forfeit call, child blocker, unload handler, history marker,
or PLAY1 policy was added. Hosted `QuizRankedMatch` remains unchanged. E1's
typed `HOST_RETURN` bypass remains available, but E3 needs no such navigation:
host handback is local parent state, and PLAY1's route does not satisfy the
Daily-route departure predicate.

Files:

- `src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` and tests
- `src/pages/quiz-daily-challenge/run/DailyStageChrome.tsx` and tests

Work: parent-owned active predicate, state-dependent copy, Exit label,
hosted-child invariant, completion disablement. No abandon endpoint, child
Forfeit or per-stage history.

Dependencies: E1 and current Daily/Journey/Survival integration.  
Conflict: **HIGH**.  
Parallel: safe with E2 after E1; unsafe with concurrent Daily-owner edits.

### NAV1-E4 — browser-history and host certification

Files:

- new Playwright NAV1 active-flow suite/fixtures
- only narrowly necessary test seams in Ranked/Daily/PLAY1
- this document/handoff if observed behavior changes

Work: real POP restoration, cancel/proceed, Forward, rapid input, terminal
races, refresh/recovery, mobile equivalent, no forbidden requests, NAV1-D and
PLAY1/SFX2 regression.

Dependencies: E2 + E3; E2Q if queue scope is included.  
Conflict: **LOW/MEDIUM**.  
Parallel: test authoring can begin earlier; certification/merge is last.

## 17. Unresolved owner decisions

Only these require owner input before code:

1. **Approve the data-router prerequisite.** The supported blocker cannot run
   under current `BrowserRouter`. This contract rejects a custom POP/history
   trap; if the route migration is not acceptable, implementation must pause.
2. **Schedule queue protection.** E2Q is required for a complete entry-to-match
   transaction contract, but it collides with PLAY1 and need not block the P1
   active-match/Daily fixes.
3. **PLAY1 user-exit ownership.** PLAY1's deliberate host checkpoint is a
   bypass, but its own browser/header/HUD exit policy must be confirmed by the
   PLAY1 owner rather than inherited from standalone Ranked or Daily.

No owner decision is needed on Forfeit versus leave, Daily permanent abandon,
per-stage history, unload Forfeit, or HUD destination: current authority makes
those answers unambiguous.

## 18. Recommendation

Implement NAV1-E1 first because every correct POP/PUSH/REPLACE contract depends
on supported router-level blocking and exact history restoration. Rebase it
after PLAY1's current route ownership. Then run E2 and E3 in parallel with one
owner per high-conflict surface, and certify them together in E4. Defer E2Q
only if PLAY1 ownership cannot be scheduled; do not substitute a partial
browser-Back-only handler.

## 19. NAV1-E1 implementation status

NAV1-E1 is implemented on the reconciled NAV1-E + PLAY1 route base. The app
now uses a module-scope `createBrowserRouter(createRoutesFromElements(...))`
and `RouterProvider`. The previous route JSX is preserved beneath one pathless
root route. That root owns `AcademyRadioController` and an `Outlet`, preserving
the controller's former lifetime inside the router and across ordinary route
changes. Query, auth, admin-auth, premium-session, tooltip and toast providers
remain outside the router in their previous order and retain their prior
lifetimes. The root's error element rethrows the data-router route error so E1
does not silently adopt React Router's default error UI as a product behavior.

The shared `useTransactionalLeaveGuard` accepts `active`, a closed flow
`kind`, owner copy and an owner-supplied `shouldBlock(candidate)` predicate.
It exposes the router blocker state, pending location, `stay()`/`reset`,
`leave()`/`proceed`, and `runWithBypass(reason, transition)`. The bypass reason
is restricted to `AUTHORITATIVE_TERMINAL`, `HOST_RETURN`, `AUTH_RECOVERY` or
`ROUTE_RECOVERY`; it is scoped to one synchronous transition, consumed by the
first candidate and cleared in `finally`. Deactivation while blocked resets
the stale attempt and never proceeds it. A system bypass that wins while a
user attempt is pending also resets the stale attempt before initiating the
system transition. No URL is reconstructed and no synthetic history entry is
created.

`TransactionalLeaveDialog` reuses the existing Radix AlertDialog primitive.
It places Stay first, moves and contains focus, maps Escape/dismiss to Stay,
aria-hides the underlying surface, prevents double submission and supports a
busy/proceeding state. It contains no Ranked or Daily policy or copy.

Owner reconciliation used current fetched refs. `origin/main` remained
`4b3be0cbe2767d3107f4462082755066b26b398b`. SFX2 remains outside that
ancestry: its side commit is `2153d4c8c438fc1f8f48a23e464ffee0e21ce89a`,
with integration merge `dd510777` on a separate Journey/release line. E1 does
not need or include that line and does not alter SFX behavior. PLAY1 had not
landed and remained the two-commit side branch ending at
`c4958b73446d612507f91273255470d2b461b19b`; those commits were applied on top
of NAV1-E before the router migration, making the PLAY1 route tree the routing
authority.

Focused substrate tests, the route/auth/Ranked/Daily/PLAY1 regression slice and
the complete NAV1 Chromium suite pass. Chromium proves cancel and confirm for
real POP history, Forward after confirm, exact PUSH/REPLACE behavior, repeated
Back/Forward while blocked, one dialog and safe initial focus. The broad
frontend suite retains unrelated base failures documented in the handoff; no
failing file is changed by E1. No Ranked match, Ranked queue or Daily run is
guarded yet, and no unload, `popstate`, beacon, keepalive or history-repair
mechanic was added.

## 20. NAV1-E2 standalone Ranked implementation status

NAV1-E2 is implemented on E1 plus the two SFX2 owner commits (`02ac1b47`,
`2153d4c8`). The SFX2 commits were replayed directly; merge `dd510777` was not
used because its other parent belongs to an unrelated release line.

`RankedMatchHost` owns the single standalone blocker. A known match is protected
from assignment/pre-snapshot through recovering, active, locked, reviewing,
recovering-error and fatal states. The child reports its authoritative phase;
`match_outro` and `match_over` immediately deactivate/reset a pending block, so
terminal authority wins without replaying a stale destination. The exact
`/quiz/ranked` route is the owner: search/hash/state-only changes preserve it;
another pathname exits and is blocked. Hosted `MatchHost` children mount no
blocker or standalone dialog.

The active route header now says **Leave Match** and remains an ordinary PUSH
Link to `/quiz`. The terminal header remains **Back to Quiz** with NAV1-D
REPLACE. Browser POP, header, HUD Home and other router navigation all use the
captured E1 transition. Neither Stay nor Leave calls Forfeit. The one-mount
fresh handoff is marked recovered in router state after consumption, retaining
the match id while preventing a fresh intro replay on refresh/Forward.

No unload, queue, Daily, PLAY1 exit, auth, Forfeit or sound policy was added.
Recovery redirects occur before a known standalone owner is mounted, so no
active-guard bypass is needed on the current code paths; E2 did not invent one.
