# JOURNEY5: frontend release candidate

The full record is the backend's `JOURNEY5_RELEASE_HANDOFF.md`, with its
operator sheet `DAILY_RELEASE_CHECKLIST.md` (League_Combat_Simulator,
branch `journey5/release`).

| | |
|---|---|
| Branch | `journey5/release` (worktree `.worktrees/journey5-release`) |
| Base | production `origin/main` `dd987084` + `merge --no-ff d0111b11` (UI3; code `083e55ee`) → `9559329d`, no conflicts |
| Code | `9be28689` |
| Status | local only, **not pushed, not deployed** |

## What changed

* **Final Journey child reveal.** The reveal plays during the server's final
  window (`own_reveal_until`), with the clock held. There is no fallback to
  the round deadline. The client polls at the window's end, and a reconnect
  after the window replays nothing.
* **Structured Combat reveal.** `lib/journey/combatWorking.ts` reads
  `combat_working.v1` through a strict allowlist and fails closed.
  `components/journey/JourneyCombatWorking.tsx` renders only the served
  numbers; the client does **no** Combat arithmetic and parses no prose. It
  appears in the inline reveal, the challenge surface and
  `QuestionReviewCard`, with the prose kept under "Explanation".
* **`ability_component`** is shown in the question sentence, e.g. Pantheon E
  "unempowered cast (no Mortal Will)".
* **Survival strike chrome.** `useDailyRun` keeps the highest strike count
  the server has reported per stage, so the terminal chrome stays at 3/3.
* **Found in the live non-stubbed Daily:**
  * The `/private` read now runs beside the poll loop (single-flight). A
    slow read had stranded the Survival slot-6 Journey on its lead-in.
  * The lead-in reads "Step 1 of N is opening…".
  * A child is `inert` until it opens.
  * 409 `RANKED_ROUND_NOT_OPEN` and `RANKED_CARD_NOT_OPEN` release the pending
    answer silently.
  * Quiz tablets refuse input before the round opens.

All accepted UI3 fixes are preserved.

## Verification

* Focused suites: 240 files, 3173 tests, 3167 passed. The 6 failures are the
  known pre-existing set: `QuestionMotifLayer.qf1` 1,
  `AnswerGrid.elimination` 2, `QuestionStageGeometry` 3.
* `tsc -p tsconfig.app.json --noEmit`: 0 errors. `npm run build`: passes.
* Six complete live Dailies against the RC backend at 375, 390, 1024 and
  1440, plus a harness sweep at 375, 390, 1024, 1280 and 1440 on real J4
  captures.
