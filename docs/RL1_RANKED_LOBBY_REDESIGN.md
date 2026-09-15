# RL1 — Ranked Lobby UI redesign (lobby only)

**Branch** `rl1/ranked-lobby-redesign` · **Worktree** `/Users/macmoney/mogsy-wt-rlr1`
(the worktree DIRECTORY still carries the old `rlr1` spelling, and so does the
dev-server entry `rlr1-lobby-fe`; the workstream, the branch and this document
are `RL1`. Renaming the directory would break the launch-config path for no
gain — do it only alongside that entry.)
**Base** `origin/main` @ `a3a35921` (the Ranked role mascot merge) · **State** pass 1 (the swap) + pass 2 (scoped cleanup) implemented, tests green, **uncommitted**

## Objective

Swap the left and centre RESPONSIBILITIES of the three parchment scrolls in the
`/quiz` Ranked lobby, and nothing else.

* **Left — Ranked Standing.** "Where do I stand in Ranked?" Crest, tier, rating,
  progression, placement state, and the Ranked record that standing was earned
  with.
* **Centre — Choose Role + Play.** The page's one decision, read top to bottom:
  `LEAGUECRAFT / RANKED → CHOOSE YOUR ROLE → mascot + role name + arrows → PLAY
  seal → match stakes`.
* **Right — Academy Record.** Unchanged.

## Pass 2 — approved scoped cleanup (RL1)

**Centre parchment.** Removed, with nothing put in their place: the
`LEAGUECRAFT` wordmark (`h1`), the small `RANKED` eyebrow, every role
description line (`RANKED_ROLE_BLURBS` — "The centre lane.", "The bot-lane
partner.", …) and the whole Win/Loss XP stakes footer including its
`TrendingUp`/`TrendingDown` icons. `CHOOSE YOUR ROLE` is the sheet's only
heading and the PLAY seal is the last element in the column — a test asserts
`seal.nextElementSibling === null`.

**The selected role label moved down.** It no longer sits at the mascot's feet;
it is printed in the stage-control row between the two arrows, in the slot the
blurb vacated, carrying the same accent ink and the same manuscript underline.
The per-slide span is KEPT as `sr-only` on the centre slide — it is the radio's
accessible name, and deleting it would leave the selected role unnamed to a
screen reader. Flank slides still print their own names. `Saving…` still takes
that slot while a role write is in flight: state, not flavour.

**`RANKED_ROLE_BLURBS` still exists** in `src/lib/ranked-public/roles.ts` —
`pages/quiz-ranked/RankedRolePicker.tsx` renders it and is out of scope. Only
the lobby stopped reading it. The now-dead `blurb` key was dropped from both
carousel surface skins.

**Right parchment.** The Mogzy portrait `<img>` is removed and **its space is
deliberately left empty** — `hero-portrait-space` keeps the exact
`h-[210px] sm:h-[248px] lg:h-[280px]` steps the portrait held, so the name, the
Academy crown and the records ledger below land exactly where they did. No
replacement visual, no collapsed spacing. `avatarUrl` stays on the component's
prop contract (the host still passes it) and is deliberately unread.

## Pass 3 — diff hygiene (no behaviour change)

The first draft centred the standing block with a wrapper
`<div className="mt-1 flex w-full flex-col items-center text-center">`, which
re-indented ~120 otherwise-untouched lines. The wrapper is gone: `.lc-emblem`
is a fixed-width flex item in the panel's content column, so `mx-auto` on the
`RankEmblem` centres it directly, and the tier heading and the status box carry
their own `text-center` / `mx-auto`. Trimmed comment sentences were restored,
one shortened box-rule put back, and two stacked comments merged. Rendering is
byte-identical — the emblem's centre and the sheet's centre both measure 291px.

`RankedLobbyHero.tsx` went **476 → 309** changed lines, of which only ~2 are
indentation. What remains is irreducible: git cannot express a block MOVE, so
the two swapped columns appear once as a deletion and once as an insertion.

## Decisions

1. **The swap is presentation only.** No rating, placement, history, role or
   matchmaking logic changed — same props, same callbacks, same derivations,
   different columns. Every figure is still the backend's own.
2. **Nothing sits between the stage and the seal.** `RankedPlayGem` is the
   carousel's very next sibling, and a test asserts `stage.nextElementSibling
   === seal`. The adjacency *is* the instruction.
3. **The stakes row (Win +X / Loss −X) stayed with PLAY.** It is queue
   information about the thing you are about to press, not part of where you
   stand today.
4. **Both result ledgers went left.** `RecentRankedLedger` (results made the
   standing) and `RoleMasteryLedger` (the record for the role the CENTRE stage
   is pointing at — `browsedRole` still flows from the carousel's
   `onViewChange`, so spinning the ring updates the record across the page).
5. **No ceremonial rank art in the centre.** `RankEmblem` moved whole to the
   standing sheet; a test asserts the centre contains no `.lc-emblem`.
6. **Mascots reuse the ONE map.** `getRankedRoleMascotPath` /
   `MOGZY_ROLE_ASSETS` in `src/components/mascot/mascot-assets.ts`, consumed
   inside `RankedClassCarousel`. **No second mapping was created.**
7. **`className="mt-0.5 w-full"` on the carousel is load-bearing.** The stage is
   `flex flex-col items-center` with no width of its own; inside the centre
   scroll's `items-center` content column it shrank to 181px of a 295px writing
   area and the mascot rendered at flank size. Do not drop `w-full`.
8. **Column testid renamed** `hero-role-column` → `hero-standing-column`.
   Nothing outside this component and its test referenced it.
9. Grid ratio `0.85/1.05/0.9` → `0.9/1.2/0.9`: the centre now holds the stage.

## Files

Written (4):

* `src/components/quiz/RankedLobbyHero.tsx` — the swap, then the cleanup.
* `src/components/quiz/RankedLobbyHero.test.tsx` — the IA and cleanup guards.
* `src/components/quiz/RankedClassCarousel.tsx` — blurb removed, selected label
  moved into the control row.
* `src/components/quiz/workspace/LeaguecraftWorkspace.test.tsx` — one line: the
  lobby's `h1` count is now 0.

Read-only but relevant:

* `src/components/quiz/LobbyPanel.tsx` — scroll/vellum/plate shell, `order` stagger.
* `src/components/quiz/RankedPlayGem.tsx` — the wax seal.
* `src/components/quiz/LeaguecraftHub.tsx` — sole host; passes every prop.
* `src/components/mascot/mascot-assets.ts`, `src/index.css` (`.lc-scroll*`),
  `src/components/quiz/leaguecraft-ink.ts`.

**Untouched by design:** the Ranked match screen (`src/pages/quiz-ranked/*`), the
match-entry / queue record (`src/components/quiz/play-scroll/*`), results and end
screens, and every backend file. `RankEmblem` and `RankCrown` are shared with
those surfaces, so only their *call sites* inside the hero were edited.

## Tests

```bash
cd /Users/macmoney/mogsy-wt-rlr1
npx vitest run src/components/quiz src/pages/Quiz.rankedRole.test.tsx src/components/ranked
```

* `RankedLobbyHero` + `RankedClassCarousel` + `LeaguecraftWorkspace` — **133/133 pass.**
* Whole set (incl. `src/pages/quiz-ranked`) — 1757 pass, **1 fail**: `Quiz.rankedRole.test.tsx > … > commits
  NOTHING for Practice after a role change`. **Pre-existing** — verified by
  stashing the change in this worktree and re-running on clean base.
* `npx tsc --noEmit -p tsconfig.app.json` — no error in either changed file; the
  repo's own baseline errors (AdminBots, team-sim, admin-users, pglite) are
  untouched. Compare failure **sets**, never totals.

## Preview

Dev server config `rlr1-lobby-fe` (port 5996) was added to
`/Users/macmoney/League_Combat_Simulator/.claude/launch.json`, pointing at this
worktree. Route: `http://localhost:5996/dev/lobby-preview` (Timmy demo fixture).
Verified at 1440×900 (all three columns 778px, `docW` 1425 — no overflow),
768×1024 and 390×844 (stacked, Play sheet first, no horizontal overflow).

## Next task

1. Owner review of the screenshots / the preview route.
2. Commit on this branch — **CLAUDE.md forbids committing without an explicit
   instruction**, so the tree is deliberately left dirty.
3. Re-fetch `origin/main` before any push; it moves often.
4. Merging is not shipping: mogsy reaches mogzy.lol only when the owner presses
   **Publish** in Lovable.
