# NAV1-E2Q Ranked queue navigation handoff

Status: implemented and certified on 2026-09-29 from `origin/main` at
`55776ec658961697295f445b991c32d7530a729a`.

## Audit: current queue and backend contract

The Railway backend is not stored in this frontend repository. The current
wire contract, client, controller, backend-linked comments, and existing race
tests expose the transaction boundary precisely:

1. `POST /api/ranked/queue` enters matchmaking. It may answer `matched`
   immediately (notably an authorized bot match) or `waiting`.
2. `waiting` owns a live queue row. `DELETE /api/ranked/queue` is the canonical
   cancellation command.
3. Pairing claims both entries before match rows are written. Wire `claimed`
   maps to UI `pairing`, polled every 700 ms.
4. Claimed entries cannot be cancelled. DELETE is rejected with 409
   `RANKED_CANNOT_CANCEL`, or a racing DELETE can return the claimed snapshot.
   Both mean the transaction is still owned.
5. During `pairing`, the client polls queue status and the account-bound
   active-match endpoint because match rows can appear there first.
6. `matched` is accepted only with a real `matchId`. The Play Scroll then
   hands off to `/quiz/ranked` with that id in router state.
7. `/quiz/ranked` owns the live match, can rediscover it after refresh/direct
   arrival, and uses the existing NAV1-E2 active-match guard.
8. `RANKED_ACTIVE_MATCH_EXISTS` offers explicit reconnect only while the
   server says the match remains inside its reconnect window.
9. `cancelled`, `expired`, and `not_queued` return to idle selection. Network
   or invalid-response failures do not prove ownership ended: waiting/pairing
   stays owned and polling continues. Cancellation failure now likewise
   preserves waiting ownership and the existing queue error treatment.

The cancellation boundary is exactly `waiting` (`cancelling` is the same owned
phase while DELETE is in flight). Commitment begins at wire `claimed` / UI
`pairing`. Match ownership begins at the first known `matched + matchId`, from
either queue status or active-match discovery.

## Guard ownership and behavior

`rankedQueueLeaveMode` defines the boundary:

- `waiting` / `cancelling` → cancellable queue owner;
- `pairing` → committed queue owner;
- `matched` and idle/recovery/error/reconnect-selection states → no queue
  blocker.

While waiting, a router departure opens **Leave Ranked queue?**. Stay resets
the captured transition and sends no request. **Cancel Queue & Leave** awaits
the same canonical DELETE used by the Play Scroll. Only an authoritative
cancelled/not-queued result calls `proceed()`, preserving the original
POP/PUSH/REPLACE and destination. Failure keeps the blocker, queue, and retry
action alive.

While pairing, **Leave while your Ranked match is starting?** says that leaving
does not cancel or forfeit the match and that an active match can be
reconnected. Leave proceeds the captured navigation without DELETE or Forfeit.

The queue guard is mounted only under the data router. Practice registers its
blocker only while Practice is active; React Router supports one blocker, so an
inactive Practice blocker must not compete with the queue.

## Queue to Ranked handoff

`matched + matchId` relinquishes queue ownership. The authoritative
`MATCH_HANDOFF` resets any stale blocked queue transition, then navigates to
`/quiz/ranked`. Its callback is ref-stabilized so blocker-reset renders cannot
restart the 800 ms handoff timer. Once Ranked mounts, NAV1-E2 is the only owner.
There is no two-dialog frame and no queue path to Forfeit.

## Races

- **Waiting → pairing while open:** an authoritative poll changes the same
  dialog to committed copy/actions. The click reclassifies current state. A
  claimed response or `RANKED_CANNOT_CANCEL` returns `still_owned`; navigation
  does not proceed.
- **Cancellation success while state updates:** the awaited success proceeds
  once. The controller ref and dialog both prevent duplicate cancellation.
- **Cancellation failure:** state returns to waiting, polling resumes, the
  queue error renders, the original transition stays captured, and retry is
  enabled after busy clears.
- **Pairing → matched while open:** known match authority resets the stale
  queue transition and performs only match handoff. Later leave is NAV1-E2's.
- **Repeated Back/navigation:** one router transition and one dialog remain;
  cancellation is single-flight.
- **Error/timeout:** client failure never disables ownership. Only an
  authoritative terminal queue status does.

## Browser history

For `origin → /quiz?play=1 waiting → Back`, no production history entry is
synthesized. Stay resets that exact POP; URL and `history.length` are unchanged.
A later Back is fresh. Successful cancellation proceeds the original POP, and
native Forward returns to `/quiz?play=1`. HUD Home remains `/lol`; other SPA
destinations and history actions are not reconstructed.

## Play Scroll and document exits

Existing modal ownership is unchanged: Play Scroll close, Escape, and outside
click remain disabled while the transaction is live. The transactional dialog
is layered above that overlay so its safe action is usable at desktop and
390×844.

Refresh, tab close, crash, unload, and network loss send neither cancellation
nor Forfeit. No `beforeunload`, unload fetch, beacon, or synthetic history was
added. On remount, current queue and active-match authority recover the flow.

## Tests

- Policy tests classify every `QueueState`.
- Queue-controller tests cover awaited success/failure, retained ownership,
  cancel-vs-claim, pairing discovery, matched discovery, and reconnect.
- Dialog tests cover safe focus, double-submit, busy state, and retry.
- `e2e/nav1/ranked-queue-exit.spec.ts` covers Back/Stay/Cancel/Forward, HUD
  Home, failure/retry, waiting→pairing, pairing leave, pairing→matched and
  NAV1-E2 takeover, repeated Back, request counts, zero Forfeit, and 390×844.

Certification on the implementation worktree:

- focused queue/navigation unit and component slice: 262/262 across 9 files;
- wider Ranked client/controller/arena slice: 878/878 across 80 files;
- dedicated E2Q Chromium (including 390×844): 8/8;
- full `e2e/nav1` Chromium: 44/44;
- changed-file ESLint excluding `Quiz.tsx`: clean. `Quiz.tsx` reports its 12
  pre-existing `no-explicit-any` errors and one pre-existing hook warning, all
  outside the E2Q diff;
- TypeScript reports the six current-main errors in `OnboardingProfile.tsx`,
  `connections.ts`, and `practiceLeaveContract.test.ts`; the same errors were
  reproduced from the starting checkout and no E2Q file reports an error;
- `git diff --check`: clean.

## Static navigation/network audit

- Queue cancellation has one production caller
  (`useRankedQueue.cancelAndWait`) and one wire implementation
  (`ranked-public/client.cancelQueue`, DELETE `/api/ranked/queue`).
- Queue, Practice, Daily, and active Ranked all use
  `useTransactionalLeaveGuard`; the shared hook is the sole production
  `useBlocker` site.
- Production has no `popstate`, `pushState`, `navigate(+1)`, or `sendBeacon`
  queue-navigation mechanism.
- The only production `beforeunload` registrations are the existing Practice
  and development Team Sim warnings; E2Q adds none.
- Ranked Forfeit remains called only by the active-match controller
  (`useRankedMatch` → `ranked-public/client.forfeitMatch`). Queue navigation
  has no path to it.

## Remaining uncertainties

Backend source is not vendored here. The audit therefore rests on the current
checked-in wire parser/client, backend-linked controller contract, and the
existing deterministic 409/claimed race tests. No frontend ownership-boundary
uncertainty remains.
