# UX2 — Worlds 2026 Teams & Schedule

| | |
|---|---|
| Branch | `ux2/worlds-teams-schedule` (worktree `C:\Users\mlmit\mogzy-wt\ux2-worlds`), pushed as a review branch. **Not merged, deployed or published** |
| Base | UX1 `56fd28bc4682681260cc9116d0251fa668f55c4d`, as instructed. FE `origin/main` is still `20a252ec` (UX1's base); the UX1 branch is unchanged |
| Route | **`/lol/dev/worlds-experience`** (development builds only), now with `/teams` and `/schedule` |
| Scope | Frontend prototype only. **No production file changed** (`git diff 56fd28bc` touches only `components/pro-play/worlds-experience/`, `lib/pro-play/worldsExperience/` and the dev page). No backend, Supabase, Railway or Lovable change |
| Status | **Built and verified locally. STOP for command-center review** |
| UX2A | Navigation-consistency corrections for the Schedule date / stage filter and the Teams region: see **§14** |

## 1. Objective and scope

Complete the operational half of the approved UX1 application:
- **Teams**: an explorer for the 19-team field.
- **Schedule**: an interactive match calendar.

Also carry forward the four UX1 acceptance improvements (A–D). Discover stays visible and unavailable.

## 2. UX1 decisions carried forward

All seven are kept.

1. **Viewport frame and horizontal directional transitions** now span four screens (Overview 01 · Stages 02 · Teams 03 · Schedule 04). Measured mid-flight in a real browser:
   - Overview → Teams and Teams → Schedule enter from the right.
   - Schedule → Stages enters from the left.
   - Back reverses each move.
2. **Swiss pool map** remains the desktop centrepiece. On a phone, the round's fixtures and the records lead (A).
3. **Pre-draw Knockout schematic**: unchanged.
4. **Adaptive context column** (B, below).
5. **Nested screen paths plus query selections**, extended in §4.
6. **Top navigation on mobile**: unchanged. Its five slots now hold four live links.
7. **Conditional elimination wording**: before a result, the detail's rows read **"If they win" / "If they lose"**; once completed, "Winner" / "Loser". Nobody is called eliminated before the result exists (`MatchDetail` `rowLabel`).

## 3. Architecture

```
WorldsExperience (shell, unchanged frame)          components/pro-play/worlds-experience/
├─ OverviewScreen   + "Full schedule →" and "The field →" entry points
├─ StagesScreen     uses ContextColumn / MatchSheet from Detail.tsx
├─ TeamsScreen      RegionFilter · Selector (crest tiles) · focus: FieldFocus | TeamFocus · phone BottomSheet
├─ ScheduleScreen   StageFilter · DateRail · DayBoard (FixtureRow) · ContextColumn(DayBrief) · phone MatchSheet
├─ Detail.tsx       ContextColumn (adaptive) · BottomSheet · MatchSheet — the ONE detail surface
├─ MatchDetail.tsx  the ONE match detail (Stages, Schedule, both sheets)
└─ matchCentreLink.ts   Match Centre availability (§6)
lib/pro-play/worldsExperience/
├─ navigation.ts    URL model (screens, per-screen keys)
├─ teamsView.ts     participant lookup, regions, identity-safe matches, status, path, certified lineup
└─ scheduleView.ts  local-day grouping, default day, gaps, filter counts
```

**Teams (desktop)**
- **Left: a selector.**
  - Region chips (All 19 · LPL 4 · LCK 4 · LEC 3 · LCS 3 · LCP 3 · CBLOL 2), then crest tiles grouped by region.
  - Each tile shows code and entry (T1–T4 / PI). It is dimmed when the team is out, and dotted when it has a served headline status.
  - A filtered region shows larger tiles with names. The card shrinks to its content.
- **Right: one focus workspace.**
  - **Nothing selected:** the field's shape. The 15 Swiss seeds are shown by tier, the four Play-In teams with the Play-In format note, and every crest selects its team.
  - **A team selected:**
    - official name (handles two-line names, e.g. "Shanghai Invictus Gaming Meituan" at 1280);
    - code, region, "Qualified as CBLOL1", and an entry chip;
    - the served status pill, or "No result yet";
    - a series record from completed matches;
    - a gold **Team profile** button (`proPlayProfileUrl("team", team_key)`);
    - **Way through Worlds**: a three-step track. Served facts are upright, what the format leaves open is *italic* (e.g. *"Open to the Play-In winner"*);
    - **Matches**: the team's official fixtures. Each opens in the Schedule on its day. With none, there is an honest "no match named yet, pairings by the official draw" line;
    - **Worlds lineup**;
    - **Also from <region>**.

**Teams (phone)**
- Region chips that scroll sideways.
- A two-column crest grid with names.
- The team opens in a focus-trapped bottom sheet. Close, drag, overlay tap, Escape and Back all dismiss it.

**Schedule (desktop)**
- **Stage filter** with counts (All 46 · Play-In 6 · Swiss 33 · Knockouts 7).
- **Date rail**: every local day with a served fixture, grouped under stage labels.
  - Each cell shows weekday, date and month.
  - A dot per match: live green, played grey, otherwise the stage colour.
  - Live days pulse, and the current day says "Today".
  - Gaps between match days are drawn as gaps (`···`, with an sr-only "N days without matches").
  - All 19 match days fit at 1440. At 1280 the rail scrolls locally.
  - Previous / next buttons; arrow keys rove the rail and Enter picks.
- **Day board**: the day's header, then one row per fixture with:
  - local time and caption (the stage is dropped on single-stage days);
  - both sides, with crest, code and name;
  - score or "vs", and a state badge.
  - Unnamed pairings say "Winner of FUR v MVK v Winner of C9 v KC" or "Pairing published by the official draw".
  - Changing day slides the board in calendar order.
- **Context column**: the shared match detail. When nothing is selected it is a collapsible **Day brief**.

**Schedule (phone)**: filter chips, a date rail (60 px cells), compact fixture rows (state as "Live" / "Final" text), and the match sheet.

## 4. Navigation and selection contracts

| Screen | Path | Query (owned) | Kind |
|---|---|---|---|
| Overview | `<base>` | — | — |
| Stages | `<base>/stages/<play-in\|swiss\|knockouts>` | `match` (detail), `round` (Swiss, view), **`step`** (phone Play-In round = upstream cell slug, view) | — |
| Teams | `<base>/teams` | `team` (detail, code), `region` (view) | — |
| Schedule | `<base>/schedule` | `match` (detail), `day` (`YYYY-MM-DD`, local, view), `stage` (slug, view) | — |
| Discover | — | — | not routable; its path is corrected to Overview |

- **Details** (match, team) push one entry when opened. Switching replaces that entry, and closing pops it. A deep-linked detail closes in place. Back therefore closes a detail on desktop and in the phone sheets.
- **View settings** (`round`, `step`, `day`, `stage`, `region`) replace the entry. They are in the URL, so refresh and links restore them. (UX2A, §14: a setting that does not fit the open detail clears it, and an entry whose view has moved closes in place rather than popping.)
- **Changing screens** drops the keys of the screen left behind (`buildHref` clears every owned key). History brings them back (tested: Teams `?team=KC&region=LEC` → Schedule → Back).
- **`selectMatch`** is now screen-aware:
  - on Stages and Schedule it stays on the screen;
  - on Schedule it also moves `day` to the match's local day, and clears a filter that would hide the match;
  - elsewhere (a team's match) it opens the match in the Schedule.
- **`selectTeam`** works the same way on Teams, and from any other screen it opens Teams. A detail's team code links there, but only when code and canonical key agree.
- **Deliberate cross-links** in the shared detail footer: "Show in Play-In / Swiss / Knockouts" (from Schedule) and "Show in Schedule" (from Stages). Each pushes a new entry.
- Unrelated keys (`scenario`, `now`) are carried through every move.

## 5. Carried-forward improvements

- **A. Mobile Swiss**: round tabs, then **the round's fixtures**, then **Records** (served W–L groups with Through / Out marks and "no tiebreak is published"). Before a result it shows the certified seeding instead. **Explore the format** is a disclosure (`aria-expanded`) holding that round's pools, the outcomes and a legend.
- **B. Adaptive context column** (`Detail.tsx`):
  - a selected match opens it (360 px; 320 px below 1536 px);
  - otherwise it folds to a 48 px rail ("Swiss brief", "Day brief") and the workspace gets the width;
  - the reader's open/closed choice is kept for the session (sessionStorage, try/catch).
  - Teams needs no column: its focus workspace *is* the detail.
- **C. Phone Play-In round** is `?step=<cell slug>` (`upper_bracket_semifinals`…), a replace-style view setting kept separate from Swiss `?round=`. Verified in a real browser across a refresh.
- **D. Structure vs verified**:
  - Swiss pool sizes now read "**places**", with a legend: places = the format's arithmetic; crests = teams on that record from verified results; wins solid, losses dashed.
  - The Teams path renders open, structural steps in italic, with a "italic: still open" key.
  - Simulated data gets a **Simulated** chip inside the match detail too (the sheet covers the bar on a phone), only for live or completed matches and only when the page says the data is simulated.

## 6. Match Centre boundary (investigated and fixed for the prototype; hub risk documented)

**What I found** (production GETs, 2026-10-13 05:55Z):
- `/upcoming` and `/upcoming?league=worlds` each return `limit: 12, horizon_days: 14`.
- 12 of the 46 tournament fixtures are in them.
- Only 2 of the 46 produce a `?next=` link today (C9 v KC, FUR v MVK), and both resolve. `matchHref` gives no link for all-TBD fixtures.

**Demonstrated in a real browser** (`ux2/match-centre-*.png`, `match-centre-probe.json`):
- `/lol/pro-play?next=115660588583171786` (C9 v KC, in the feed) shows the fixture.
- `/lol/pro-play?next=115660540726095133` (the Knockout Final, a valid fixture outside the feed) shows the hub's notice *"isn't in the current schedule response … so the latest match is shown instead"* and an **unrelated** match.
- So a named fixture beyond the next 12 / 14 days would send a reader to the wrong match.

**Fix (frontend-only, inside the prototype)**: `matchCentreLink.ts` decides the Match Centre button.
- **`?game=`**: always offered (the game is stored).
- **`?next=`**: offered only when the hub's own schedule reads (`useSchedule`, the same query keys, so the cache is shared) list the fixture.
- Otherwise the detail says why: "checking", "isn't in the Match Centre's upcoming list yet … closer to the start", or "schedule isn't answering".
- It never links to the wrong match. This is tested (listed / not listed / all-TBD / stored game).

**Remaining hub risk, for a separate change**: the hub itself (`ProPlayHub.tsx`) still answers any out-of-window `?next=` (shared links, other surfaces) with the "gone" notice and an unrelated match. The smallest separate fix, in one of two places:
- **frontend:** when `?next=` is not in the schedule but is a known tournament fixture (`useTournament` for the featured event), show that fixture's card as "upcoming, not yet in the live schedule" instead of the latest match; or
- **backend:** let `/upcoming` accept `match_id=` to fetch one fixture outside the window.

Not done here: it changes the published hub.

## 7. Data rules applied

- **Identity**: `TournamentParticipantV2.code` + `team_key`. A match side is attributed to a team only when both agree (`teamMatches`); a side with a null key is not. The profile URL always uses `team_key`. Display uses `participant.name`.
- **Status** (`teamStatus`, latest stage first):
  - champion and Knockout eliminations need `knockout.bracket_authority === "standings"`;
  - Play-In winner and eliminations need `play_in.bracket_authority === "standings"`;
  - "In the Knockouts" comes from `knockout_teams`;
  - Swiss comes from served `records[].status`;
  - "Placed in Swiss" comes from `swiss.placed_codes`.
  - Nothing comes from dates. Pre-event, every team is "No result yet".
- **Lineups**: shown only for `lineup_status === "registered"` with entries. Otherwise: *"Mogzy hasn't certified a Worlds lineup for X yet. That's about what Mogzy has verified, not whether the team has registered its players."* This links to roster history on the profile. No roster is built from team history.
- **Schedule**:
  - only `state.matches` is used; coverage drives "Showing the 40 of 46 fixtures that could be read", and the shell's status strip carries the partial / stale / unavailable lines;
  - `unknown` shows an empty-state message and no rail;
  - live / completed / upcoming come from `match.state` only;
  - days come from `localDayKey` (viewer timezone; tests pin LA, Seoul and UTC);
  - the opening day is the linked day if it has fixtures, else a live day, else today, else the next day, else the last day.

## 8. Changed files (vs UX1 `56fd28bc`)

| File | Change |
|---|---|
| `lib/pro-play/worldsExperience/navigation.ts` | Teams/Schedule ready; per-screen keys `step`, `team`, `region`, `day`, `stage`; owned-key clearing |
| `lib/pro-play/worldsExperience/teamsView.ts` | new |
| `lib/pro-play/worldsExperience/scheduleView.ts` | new |
| `worlds-experience/ExperienceContext.tsx` | screen-aware detail selection; `selectTeam`, `selectStep`, `setDay`, `setFilter`, `setRegion`, `hereHref`; `simulated` |
| `worlds-experience/Detail.tsx` | new: adaptive `ContextColumn`, `BottomSheet`, `MatchSheet` |
| `worlds-experience/TeamsScreen.tsx`, `ScheduleScreen.tsx` | new |
| `worlds-experience/matchCentreLink.ts` | new (§6) |
| `worlds-experience/MatchDetail.tsx` | conditional wording; team links; profile icons in rows; one footer with Show in Stage / Schedule and the Match Centre guard; Simulated chip |
| `worlds-experience/StagesScreen.tsx` | uses the shared column and sheet |
| `worlds-experience/SwissWorkspace.tsx` | phone order (A); "places" and legend (D) |
| `worlds-experience/PlayInWorkspace.tsx` | `?step=` (C) |
| `worlds-experience/WorldsExperience.tsx`, `OverviewScreen.tsx` | screens wired; Escape for teams; announcer; Overview entry links |
| `pages/dev/worlds-experience/WorldsExperienceDev.tsx` | passes `simulated` |
| tests | `navigation.test.ts` (rewritten for four screens), `teamsSchedule.test.ts` (new), `TeamsSchedule.test.tsx` (new), `WorldsExperience.test.tsx` (UX1 tests updated for the intended contract changes) |

## 9. Tests and build

| Run | UX1 branch `56fd28bc` | UX2 |
|---|---|---|
| Focused Vitest (`src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, dev worlds-experience, `hub5Isolation`, `App.teamSimRoutes`, `Layout`) | 47 files / 1661 passed | **49 files / 1720 passed**, 0 failed |
| UX experience suites alone | 4 files / 71 | 6 files / **130** |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`, both on `main` too) | the same 2, none new |
| ESLint (UX files) | — | 0 errors; 7 `react-refresh/only-export-components` warnings (UX1 had 6 of these; +1 for `useBriefPreference`) |
| `vite build` (production, esbuild-JSX scratch config) | — | succeeds. The only prototype trace in the bundle is Layout's existing `startsWith("/lol/dev/worlds-experience")`. Zero files contain Teams/Schedule/Detail/scenario code |

Changed UX1 tests, all intended contract changes:
- the nav has four links;
- the Discover path is corrected (previously `/teams`);
- the context panel starts `collapsed`;
- the brief opens via its toggle;
- roving reaches Schedule;
- mobile Swiss puts fixtures and records before the format.

New coverage:
- all four destinations, and Discover inert;
- region filtering;
- team select, switch, deselect (close / re-click / Escape / Back) and direct links;
- canonical profile mapping, including null-key attribution;
- certified vs uncertified lineups;
- verified status across phases;
- day navigation (cell, previous / next, linked day, fallback);
- stage filters;
- LA / Seoul / UTC grouping;
- live / completed / upcoming rows;
- partial and unavailable schedules;
- Schedule match selection, edge-following moving the day, and Show in stage / Show in Schedule;
- Back/Forward across four screens and selections;
- mobile sheets (team and match);
- `?step=` persistence;
- mobile Swiss order and disclosure;
- conditional wording;
- the Simulated chip;
- the Match Centre guard;
- reduced motion.

## 10. Real-browser verification

Headless Edge against the UX2 review server. **36/36 interaction checks pass** (`ux2/interaction-results.json`):
- **Transitions:** all three forward transitions and three back transitions, sampled 90 ms in. Forward to Teams, then the prototype keys are still carried.
- **Discover** is shown, `aria-disabled`, not a link, and inert when clicked.
- **Teams:**
  - region filter;
  - select and switch, then Back in one step;
  - Escape;
  - canonical profile href.
- **Schedule:**
  - day cell, next, arrow roving and Enter on the rail;
  - the Knockouts filter jumps to 3 Nov;
  - a fixture opens the detail in place;
  - **refresh restores day and match**;
  - "Show in Play-In" then Back.
- **Context column:** a 48 px rail that opens to 320 px; the choice survives a reload.
- No page errors.
- Reduced motion produces no travel.
- **Phone:**
  - `?step=` is written and survives a refresh;
  - team sheet, and Back;
  - match sheet, and close;
  - nav, day, filter and fixture targets are all ≥ 44 px;
  - no horizontal page overflow.

**Screenshots** (`docs/handoffs/ux2/`, 28 captures plus 3 mid-transition frames, 2 interaction frames and 2 Match Centre frames). Each was reviewed. Real data is the 13 Oct snapshot; files marked `sim` are simulated.

| | Files |
|---|---|
| 1440 × 900 | `ux2-teams-default-1440` (after Overview → Teams), `ux2-teams-selected-1440`, `ux2-teams-region-switch-1440`, `ux2-schedule-default-1440` (after Teams → Schedule), `ux2-schedule-selected-date-1440`, `ux2-schedule-selected-match-1440`, `ux2-overview-1440`, `ux2-stages-play-in-1440`, `ux2-stages-play-in-detail-1440`, `ux2-stages-swiss-adaptive-1440` (column folded), `ux2-stages-swiss-brief-open-1440`; simulated: `ux2-sim-teams-kc-1440`, `ux2-sim-teams-champion-1440`, `ux2-sim-schedule-live-1440`, `ux2-sim-schedule-knockouts-1440` |
| 1280 × 800 | `ux2-teams-long-name-1280` (IG, two-line name), `ux2-schedule-detail-filter-1280` (Swiss filter + live detail, sim), `ux2-overview-1280` |
| 390 × 844 | `ux2-m-teams-default-390` (after Overview → Teams), `ux2-m-teams-region-390`, `ux2-m-teams-selected-390` (sheet), `ux2-m-schedule-default-390`, `ux2-m-schedule-day-390` (sim), `ux2-m-schedule-sheet-390` (sim), `ux2-m-swiss-390` and `ux2-m-swiss-format-390` (sim, full page), `ux2-m-play-in-step-390`, `ux2-m-overview-390` |
| Transitions | `transition-mid-overview-to-teams-1440`, `-teams-to-schedule-`, `-schedule-to-stages-` |

Defects found in review and fixed:
- record text overlapping tier chips in the compact tiles;
- the date rail clipping the later match days at 1440;
- wrapped times on phone fixture rows;
- the "Through the Play-In" label wrapping;
- two stacked footers squeezing the match detail (now one row, with profile icons in the team rows);
- truncated captions (the stage is dropped on single-stage days);
- the filtered selector card stretching empty;
- the phone "COMPLETED" badge covering a crest (now "Final" / "Live" text).

## 11. Remaining limitations

- At 1280 × 800 the match detail's lower rows (e.g. "If they lose") scroll inside the column. At 1440 they fit. The Swiss stage at 1280 still scrolls locally (UX1 §10).
- Before the event, Teams' right column below Lineup / Region is sparse for Swiss teams (no fixtures named yet). It fills from the draw onward (see `ux2-sim-teams-*`).
- Day and filter are replace-style view settings: Back does not step back through days. This is by design and consistent with Swiss rounds.
- The date rail's "Today" uses the viewer's clock (or `?now=`). A viewer far from the venues sees local days, which can differ from the broadcast day. Tested intentionally.
- The Match Centre guard needs the hub's two schedule reads. While they are pending, the detail says "Checking…" for a `?next=` fixture.
- Lineups: no participant is `registered` in production yet, so the certified path is exercised only by tests.

## 12. Release implications

- Nothing ships: everything is behind the DEV-only route, and the build check confirms none of it is in the bundle. The published `/lol/pro-play/tournament/worlds-2026`, the hub, the featured policy and DCGI are byte-identical to `56fd28bc`.
- A future production switch would mount `WorldsExperience` at `/lol/pro-play/tournament/worlds-2026/*` with `base` swapped. Because the URL contract is screen-nested, that is the only routing change.
- The §6 hub change should land **before** any production experience links `?next=` beyond the feed window.

## 13. Recommended UX3

1. **Discover**: define the verified-intelligence contract (sources, certification, what counts as a discovery) before any UI.
2. The **hub `?next=` fallback** (§6), as its own small, owner-approved change.
3. **Production switch plan**: flag, route, `/lol/pro-play/tournament/worlds-2026/*`, and SEO for the nested paths and per-screen titles.
4. A **Teams** lineup view once lineups are certified, plus per-team head-to-head across the event from served matches only.
5. **Housekeeping**: move `knockoutPreDraw` / `useBriefPreference` / bracket helpers into lib modules (clears the fast-refresh warnings).

## 14. UX2A — navigation consistency (Schedule date / stage, Teams region)

Review found three suspected state-consistency risks in `ExperienceContext`. I reproduced each against `c0542e12` with failing tests before changing code.

| | Reproduced? | Behaviour at `c0542e12` | Root cause |
|---|---|---|---|
| **A** Schedule date | yes | Pick another date with a match open: the board shows the new day and the detail still shows the previous day's match (URL `?day=<new>&match=<old>`). | `setDay` replaced `day` only; `matchId` was carried by `here()`. |
| **B** Stage filter | yes | An excluded match stayed open. A shown day with no fixtures under the filter stayed in the URL while the board silently fell back (URL `day=2026-10-23`, board 15 Oct). | `setFilter` replaced `filterKey` only. The fallback happens in `pickDay` at render, so nothing wrote it back. |
| **C** Teams region | yes | A team outside the chosen region stayed selected: LCK tiles beside a TLAW (LCS) focus. | `setRegion` replaced `region` only. UX2's own test asserted this ("without dropping the selection"); it is changed here. |

Found while reproducing (same family, fixed with them):
- **Contradicting links.** `?day=<other>&match=<id>` and `?stage=swiss&match=<a Play-In match>` showed a board and a detail that disagreed. A link `?match=<id>` with no day opened the default day rather than the match's.
- **Invisible detail.** `?team=ZZZ` showed the field, but Escape rewrote the URL, because the key handler reads the raw `team`.
- **Closing snapped the view back.** Open a match, change the filter (the match fits), close it: the close popped the detail's entry and the filter reverted to what it was before the match. Teams did the same with a region. The marker said "pop to close" although the workspace under it had changed.

### Rules now

| Action | Result |
|---|---|
| Date | The match stays only if it is played that day; otherwise it is cleared. |
| Stage filter | The match stays only if it belongs to the stage; otherwise it is cleared. The day is the one the board will show: the same day if it has fixtures under the new filter, else `pickDay`'s choice. It is written to the URL. No fixtures under the filter: no day is written and none is invented. |
| Region | The team stays only if it plays in the region; otherwise it is cleared. |
| Link, read the other way | The detail leads, as selecting a match already did: the match's day and stage, the team's region (`reconcileSchedule`, `reconcileTeams`). A link's bogus day or unknown team code is no selection. |

History:
- Opening a detail is still one pushed entry, switching still replaces it, and Back still closes it.
- A view setting that **moves** or **clears** a detail's entry removes its `ux1Panel` marker, so closing afterwards happens in place and keeps the new view. An untouched detail still pops as before. A deep-linked detail still closes in place.
- Edge-following inside a detail (which moves the day with the match) is a detail switch and is unchanged: closing pops to the workspace beneath it, as designed.

### Changed files (vs `c0542e12`)

| File | Change |
|---|---|
| `lib/pro-play/worldsExperience/scheduleView.ts` | `reconcileSchedule`; `ServedMatches` (read-only matches) for `scheduleDays` / `filterCounts` |
| `lib/pro-play/worldsExperience/teamsView.ts` | `reconcileTeams` |
| `worlds-experience/ExperienceContext.tsx` | `loc` is the reconciled reading; `setDay`, `setFilter`, `setRegion` clear what does not fit; `replaceHere` drops the stale marker; takes `now` |
| `worlds-experience/WorldsExperience.tsx` | passes `now` (one line) |
| `worlds-experience/NavigationConsistency.test.tsx` | new, 31 tests |
| `worlds-experience/TeamsSchedule.test.tsx` | the region test now asserts the corrected rule |
| `docs/handoffs/ux2a/` | interaction results and 5 targeted screenshots |

No production file, route, API or Match Centre code changed; `?next=` behaviour and the hub are untouched.

### Verification

| Run | `c0542e12` | UX2A |
|---|---|---|
| New file against the unmodified code | 19 of 31 fail (the other 12 guard what must not change) | **31 / 31 pass** |
| UX experience suites (7 files incl. isolation) | 6 files / 130 | **7 files / 161** |
| Focused Vitest, same command on both (`src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, `src/pages/dev/worlds-experience`, `hub5Isolation`, `App.teamSimRoutes`, `Layout`) | 52 files / 1804 | **53 files / 1835**, 0 failed |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors | the same 2 (`OnboardingProfile.tsx`, `identity/connections.ts`), none new |
| ESLint, `worlds-experience` and `worldsExperience` | 0 errors, 7 warnings | 0 errors, the same 7 `react-refresh` warnings |
| `vite build` (production) | — | succeeds. None of `reconcileSchedule`, `Day brief`, `ux1Panel`, `Filter teams by region` is in the bundle; the only `worlds-experience` string is Layout's path check; the only `Filter the schedule by stage` is the published tournament page's own |

New tests cover: a date with a match open (other / same / previous-next); a compatible and an incompatible stage; a day the filter excludes, and one it keeps; links with a contradicting day or stage, and a link with no day; a region that keeps / clears the team, and a contradicting team link; an unknown team and Escape; partial and unavailable schedules; the marker and Back / Forward after a clearing change; closing in place after a kept change; an untouched detail still popping; a deep-linked detail; reload; and the phone sheets.

**Real browser** (headless Edge against the review server, `docs/handoffs/ux2a/interaction-results.json`): **34 / 34**, no page errors.
- Desktop 1440 × 900: all the date, stage and region cases above, with `history.state` and `history.length` read after each step.
- Phone 390 × 844 (touch): match sheet and Back, new date after closing, a linked match's own day under its sheet, team sheet inside a region and Back, a region change afterwards opening nothing, a linked team over the whole field, and no horizontal overflow.

Screenshots: `ux2a-schedule-date-clears-match-1440`, `ux2a-schedule-filter-clears-match-1440`, `ux2a-teams-region-clears-team-1440`, `ux2a-m-schedule-linked-sheet-390`, `ux2a-m-teams-linked-sheet-390`.

Not a defect: on a phone, an open sheet is a modal dialog over the date rail, filter and region chips, so none of those can be changed with a sheet open. The remaining route to that state is history or a link, and both are covered.

### Remaining limitations

- Back from a detail whose entry has moved goes to the workspace as it was **before the detail opened**, including its older day / filter. That is the browser's step; there is no second history layer to undo a view setting separately.
- After a clearing change, the detail's former entry stays in the stack as an ordinary entry under the new view (one extra Back step to leave the Schedule).
- A link that contradicts itself is displayed reconciled but its URL is not rewritten until the next move. This is deliberate: under partial data the link's own day or match may be served later.
- If a link's day or match is missing from a partial read, the next write drops it from the URL; the status strip already says the read is partial.
- `ExperienceProvider` now takes the page's clock (`now`), because the day the Schedule opens on can depend on it. The only caller (`WorldsExperience`) passes it.

### Commits

- Starting point: `c0542e12d43bdfdfdd2ec009316dd09b89065e11` (UX1 base `56fd28bc4682681260cc9116d0251fa668f55c4d`, an ancestor).
- Code, tests and evidence: `961a30020832133693a1ab14b219439e16a1ed71` (`UX2A: Worlds experience navigation consistency`).
- This section: the branch tip, a docs-only commit on top of it.
