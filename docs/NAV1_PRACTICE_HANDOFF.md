# NAV1-P1 — Practice exit safety

Practice remains the local `Quiz.tsx` state machine on `/quiz`: `sets →
loading-questions → active → result`, with `error` as load failure. HUB4/HUB7
remain authoritative: Quick Study leads into Practice, History is the only
record surface, Owned & Missed lives inside it, and legacy `#review`/`#trends`
arrivals canonicalize to `#history`. Practice Builder and the old Trends pane
are not normal `/quiz` consumer surfaces.

## Leave contract

Only `loading-questions` and `active` are unfinished. This covers category,
set, and missed-question replay sessions. `sets`, `error`, and terminal
`result` are not guarded.

The existing `useTransactionalLeaveGuard` owns every real router departure:
POP, PUSH, REPLACE, and changed `/quiz` search/hash. Stay resets the captured
transition; Leave proceeds that exact transition. No completion/cancellation
request, sentinel entry, `popstate`, `pushState`, `navigate(+1)`, or per-question
history is added. Copy is “Leave practice?”, “This practice run can’t be
resumed if you leave.”, “Stay in Practice”, and “Leave Practice”.

Because the run cannot survive a document exit, a native `beforeunload`
listener exists only during those two unfinished phases. It makes no request,
uses browser-owned copy, and is best effort only; mobile unload is not claimed
as reliable. It is removed immediately at result, hub, or error.

## Terminal result and Review

Result remains terminal local presentation. Browser Back follows real history
without a Practice confirmation; explicit actions remain Play again, practise
misses, Review, and return to Leaguecraft/set choice. No fake result entry was
added. Forward back to `/quiz` reconstructs the ordinary hub, not an old run.

The no-misses Review action now resets local result state and uses React Router
to enter `/quiz#review`. HUB4 then opens/focuses Owned & Missed and replaces the
legacy hash with `/quiz#history`. There is no document reload and Review is not
resurrected as a peer tab.

## Verification and remaining work

Focused contract/component tests cover phase classification, hash/search
departure, exact POP reset/proceed, missed replay, terminal behavior, Review
reset/canonicalization, and `beforeunload`. `e2e/nav1/practice-exit.spec.ts`
covers desktop Back/Forward/history length, header, HUD, replay, result, Review
without reload, and a 390×844 viewport.

Practice persistence/refresh recovery is intentionally not implemented.
PLAY1/RB3 playtest exits, Daily completion, Stat Check, Team Sim, and true
Safari/iOS swipe behavior remain separate work.
