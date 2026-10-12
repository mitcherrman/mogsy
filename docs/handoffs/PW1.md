# PW1 — Worlds 2026 Match Center and Hub integration

| | |
|---|---|
| Branch | `pw1/worlds-hub` (worktree `.worktrees/pw1-worlds-hub`). Pushed as a review branch only. **Not merged, not published, no Lovable Publish** |
| Base | `origin/main` `b1f65a9c` (PPQ2-E main integration), fetched at the start |
| Code commit | `333ae964` (this file lands in a second commit so it can name the first; see §10) |
| Scope | Frontend only: Hub selection, the Match Center's presentation of a Worlds match, tests, this handoff |
| PW1-A | Final selection safety patch on top of `ffa42573` — see §12 |
| PW1-C | Worlds-filtered schedule integrated on top of `2c3953a3` — see §13. Head of the branch |
| Status | **Verified. STOP for control-center review** |

## 0. Result in one paragraph

On production today (2026-10-12, before Worlds opens on 15 Oct) the hub opened on a VCS final. It now opens on the next
officially scheduled Worlds match, **FUR vs MVK, Play-Ins, Thu 15 Oct**, with a restrained gold Worlds treatment and
the Worlds fixtures first in UP NEXT. During the event it will feature a live Worlds game, else the most recently
completed one, with the next Worlds fixtures one click away. With no Worlds game or fixture in the feeds the hub behaves
exactly as before. Nothing is invented: a slot upstream still calls TBD is drawn TBD. One thing the brief asked for
cannot be done honestly from the frontend: **there is no Worlds league art in the media authority**, so the mark is the
designed `WORLDS` monogram (§4, §7).

## 1. What was verified in production first

Captured with `curl` against the app's own backend (`VITE_COMBAT_API_URL`) at 2026-10-12T01:15Z; the data is in
`docs/handoffs/pw1/production-evidence.json`.

| Question | Finding |
|---|---|
| Does `/api/live-esports/upcoming` expose Worlds fixtures? | **Yes, as league slug `worlds`**, name `Worlds`, region `INTERNATIONAL`, block `Play-Ins`, Bo5: FUR vs MVK (15 Oct 18:00Z) and C9 vs KC (15 Oct 23:00Z). |
| How is that feed bounded? | `limit: 12` across **all** leagues, `horizon_days: 14`, time-ordered. `?limit=` only narrows (3 → 3 rows; 50 → 12). `?league=worlds`, `?league_slug=worlds`, `?horizon_days=30` are ignored. |
| Where do the Worlds rows sit? | Positions **11 and 12 of 12**, behind DCGI, CBLOL Promotion, LCS Promotion and EMEA Masters fixtures. The old rail showed the first four non-TBD rows, so it never reached them. |
| Is the slug the same namespace as played games? | Yes for every other league checked: `lcs_promotion` is the league slug on both its `/upcoming` fixture and its games in `/live`'s `recent`; `demacia_cup`, `cblol_promotion`, `lcs_promotion` and `emea_masters` (all four `/upcoming` leagues) appear identically in the game store's league facets, as does `vcs` (a `/live` league). No Worlds game is stored yet (store range 2026-08-13 to 2026-10-11), so a live Worlds game's slug is **inferred from that, not observed** (§8). |
| Independent confirmation of the slug | The backend's own DCGI registry lists `related[0] = { name: "World Championship 2026", league_slug: "worlds", starts 2026-10-15, ends 2026-11-14 }`. |
| Is there a Worlds tournament context? | **No.** `/api/live-esports/tournament/worlds-2026`, `worlds`, `worlds2026`, `worlds_2026` all 404; only `dcgi-2026` exists. The featured pill therefore stays on DCGI (`PRO_PLAY_FEATURED_TOURNAMENT` untouched). |
| League media for Worlds? | `/api/pro-play/media/resolve?league=worlds` → `state: "fallback", reason: "no_media"`. (`demacia_cup` → `state: "art"`.) |
| Official reference | The Worlds 2026 primer: Play-Ins 15–18 Oct (Los Angeles), Swiss 23–31 Oct (Allen, TX), Knockout 3–14 Nov, Final 14 Nov (Brooklyn). Matches the schedule feed's dates. |

No league id was hardcoded or guessed: the identity is upstream's slug, read from the feeds the hub already uses.

## 2. Selection rules (`hubSelection.pickHubSelection` / `nextHubAutoPick`)

Applied only when nobody has chosen (`?game=` / `?next=` absent):

1. a **live Worlds game**;
2. else the **most recently completed Worlds game** (a stale Worlds row is not a result and does not count) — this
   outranks an unrelated live game, per the brief;
3. else the **next officially scheduled Worlds fixture** — TBD sides included, ordered by start time;
4. else the previous rule, unchanged (`pickHubGame`: live → finished → anything recent).

Properties:

- **Explicit choice wins, one at a time.** `?game=` and `?next=` are never overridden by the automatic pick, including across
  upcoming → live → completed. Choosing a fixture clears `?game=`; choosing a game clears `?next=` (PW1-A, §12).
- **The automatic pick is never written to the URL**, so a shared link stays the reader's own choice.
- **Sticky within a tier, never across one.** Two live Worlds games do not swap on poll order; a held completed pick is not
  yanked by a newer completed one; but a pick made before Worlds data arrived (the feed lands before the schedule) gives way
  to Worlds, and a live Worlds game replaces a held completed one.
- **Never stuck on an expired fixture.** An upcoming pick is recomputed from the current schedule each render. An explicit
  `?next=` whose match has started **follows that match into its games** (same `match_id`): the live game, else its latest.
  One that left the schedule entirely falls back to the automatic pick, with a one-line note (PW1-A, §12).
- **Stale schedule entries are not featured**: a fixture more than 30 minutes past its start (`WORLDS_FIXTURE_GRACE_MS`) is
  ignored, as is one with no parseable start. Never a time that was not published.
- **No flash of the unrelated match.** The schedule is a second request behind the feed. The automatic pick waits for it
  for at most 2.5 s (`SCHEDULE_SETTLE_MS`) behind the existing loading frame; an explicit `?game=` never waits.

## 3. UP NEXT rail (`hubSeries.railUpcoming`)

Worlds fixtures lead the group, soonest first, and — unlike other leagues' — keep their both-TBD slots (a scheduled
Worlds knockout match whose teams are not yet named is still a Worlds match). Every other league's rows keep the feed's
order and the existing both-TBD rule. The cap stays 4. A chip with an unnamed side also prints its stage ("Quarterfinals")
so a bare `TBD vs TBD` says which slot it is.

## 4. Presentation (restrained, existing design language)

| Where | Change |
|---|---|
| Rail chips | A small gold `WORLDS` tag on Worlds series and fixtures, so Worlds reads at a glance beside regional matches. |
| Event band | A faint gold wash from the league mark (`data-accent="worlds"`) and `Worlds` → **`Worlds 2026`**. The year is read from the match's own start (UTC), not written into the page; it is left alone when the competition line already carries a year (e.g. a tournament named "… 2026"). |
| Frame | The board's border takes a gold tint (`data-event="worlds"`). |
| Upcoming board | When a side is TBD: "TBD means the official schedule has not named that team yet." No team is invented; no profile link is drawn for an unresolved side. |
| League mark | Unchanged component (`EventMark`): the media authority's art for slug `worlds` when it serves some, else the designed `WORLDS` monogram. A test pins both states. |

Not changed: the name Pro Play, page structure, header, search, Explore band, the featured DCGI pill, SEO tags, Match
Workspace, lanes, series grouping, game tabs, official-result rules, `?game=` / `?next=` routes. No Worlds homepage.

**Media.** The brief asked for "authentic Worlds-related event media … already supported by Mogzy's media
infrastructure". The infrastructure supports league art by slug through the media authority, and **the authority has none
for `worlds`**. Bundling a logo or pulling an upstream image would break the media contract (`mediaApi.ts`: no page
reaches an external host; upstream's league image is never loaded). So no art was added. The slot lights up by itself the
moment the authority serves a `worlds` league logo (`uses the league mark the media authority serves for worlds` pins it).

## 5. Files

| File | Change |
|---|---|
| `src/lib/pro-play/worlds.ts` | **New.** Worlds identity (`slug === "worlds"`), fixture ordering/staleness, year helpers. Pure. |
| `src/lib/pro-play/hubSelection.ts` | `HubPick`, `pickHubSelection`, `nextHubAutoPick`, `samePick`. Legacy `pickHubGame` / `nextHubAutoGame` untouched and still the fallback. |
| `src/lib/pro-play/hubSeries.ts` | `railUpcoming`: Worlds first, TBD Worlds slots kept. |
| `src/pages/ProPlayHub.tsx` | Auto pick as remembered state (adjusted during render, so no lagging frame), schedule-settling hold, `?next=` follow, media request includes the featured fixture's teams and league. |
| `src/components/pro-play/hub/MatchCenter.tsx` | Worlds tag, band accent, frame tint, year, TBD note and stage, `selecting` loading frame. |
| `src/lib/pro-play/worlds.test.ts` | **New.** 10 tests. |
| `src/lib/pro-play/hubSelection.test.ts` | +15 tests. |
| `src/lib/pro-play/hubSeries.test.ts` | +4 tests. |
| `src/pages/ProPlayHub.test.tsx` | +27 tests (`PW1 ·` describes) and a gated-schedule / client-handle helper. |
| `docs/handoffs/pw1/` | Screenshots, production evidence, test summary. |

Backend, quiz generation, PPQ2 Arena, Studio, graphs, Matchup Explorer and shared historical data: **not touched**.

## 6. Verification

Worktree reuses the main checkout's `node_modules` through a junction (identical `package.json`, content-wise); no Docker.

| Check | Clean main `b1f65a9c` | `pw1/worlds-hub` |
|---|---|---|
| Focused regression set (`ProPlayHub.test.tsx`, `lib/pro-play`, `components/pro-play`, `lib/live-esports`, `pages/esports`, `route-prefetch`) | **1300 / 1300**, 258 suites | **1356 / 1356**, 270 suites (+56 new, 0 failures) |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors (`OnboardingProfile.tsx`, `identity/connections.ts`) | the same 2, nothing new |
| `eslint` on the 9 touched source/test files | — | 0 problems |
| `vite build` | — | succeeds (output to a scratch directory) |

Scenarios covered (all in `ProPlayHub.test.tsx` unless noted):

| Scenario | Test |
|---|---|
| Pre-event: next Worlds fixture replaces the unrelated recent match; URL stays clean; rail selected chip + order | `features the next scheduled Worlds match …` |
| Unrelated **live** match does not outrank the next Worlds match, stays in the rail | `an unrelated LIVE match does not take the board …` |
| TBD slot: drawn TBD, stage shown, no links, no invented team | `shows a Worlds slot with unnamed sides as TBD …` |
| Live Worlds ahead of unrelated live + Worlds fixture | `shows a live Worlds game ahead of …` |
| Completed Worlds over an unrelated live game; upcoming stays discoverable | `with nothing Worlds live, features the most recently completed …` |
| Stale Worlds row is not a result | `does not treat a stale Worlds row as a result …` |
| Explicit `?game=` / `?next=`; rail pick sticks | `PW1 · explicit selection is never overridden` |
| `?next=` whose match started follows it; `?next=` that left the schedule falls back | same describe |
| upcoming → live → completed, no pin; and with an explicit pin held throughout; featured fixture withdrawn | `PW1 · transitions as the sources change` |
| Stale schedule entry, no start time, row with no league, no Worlds fixture, older backend (404), feed down | `PW1 · pre-event …` / `PW1 · load order and missing data` |
| Schedule-late: no flash of the unrelated match; explicit pin does not wait; hung schedule stops waiting at 2.5 s | `PW1 · load order and missing data` |
| DCGI pill intact; no link or request to a Worlds tournament page | `keeps DCGI as the featured event …` |
| Pure rules | `worlds.test.ts`, `hubSelection.test.ts`, `hubSeries.test.ts` |

## 7. Screenshots (`docs/handoffs/pw1/`, desktop 1440×900 and laptop 1280×720; mobile QA deferred by the owner)

| File | What | Real or simulated |
|---|---|---|
| `before-prod-1440x900.png`, `before-prod-1280x720.png` | Clean main: VCS final SGW 0–3 MVKA, UP NEXT shows only DCGI / CBLOL / LCS fixtures | **Real**, production data, 2026-10-12 |
| `after-prod-1440x900.png`, `after-prod-1280x720.png` | This branch: Worlds Play-Ins FUR vs MVK featured; Worlds chips first and tagged; gold band | **Real**, production data, same moment |
| `sim-tbd-1440x900.png` | A both-TBD `Quarterfinals` Worlds slot, with the TBD note | **Simulated**: the production schedule response replaced by one invented-for-test slot (Playwright route interception). No such fixture exists upstream yet |
| `sim-completed-1440x900.png` | The played-match board with the Worlds treatment | **Simulated**: the real VCS final with its league label rewritten to `worlds` in every response. **The teams and result are VCS's, not Worlds'.** Shows the accent on a played board only |
| `before-prod.json`, `after-prod.json` | DOM read-out behind the real screenshots (selection, rail, pressed chip, marks, page errors: none) | Real |
| `production-evidence.json`, `test-summary.txt` | §1 and §6 data | Real |

## 8. Dependencies, blockers and risks

None of these block the review. Each is a precise fact for the owner of the named system.

1. **`/upcoming` is capped at 12 across all leagues and ignores any league filter** (backend,
   `live_esports/upcoming.py` / `routes/live_esports.py`). Worlds fixtures sit at positions 11–12 today. If two or more
   non-Worlds fixtures are scheduled ahead of 15 Oct 18:00Z, the first Worlds fixture falls out of the response and the hub
   shows the old live/latest pick (a safe degrade, but the Worlds feature is then absent until the window moves). Once
   Worlds is in play it dominates the window, so the risk is the **pre-event days**. Suggested backend fix: honour
   `?league=<slug>` (or guarantee Worlds rows regardless of the cap). The frontend would then request it; it does not
   guess today.
2. **No `worlds` league logo in the media authority** (media store / `assets/esports/leagues/`, the same registry DCGI1
   filled for `demacia_cup`). Until one is registered with an approved credit, the mark is the monogram. No frontend work
   is needed afterwards.
3. **No Worlds tournament context** in the backend registry, so there is nothing for a Worlds link to point at; the
   featured pill stays on DCGI (which ends 17 Oct). If a `worlds-2026` context is added, switching
   `PRO_PLAY_FEATURED_TOURNAMENT` (or choosing by phase) is a one-line frontend change.
4. **A live Worlds game's league slug is inferred, not observed.** It is the same LIVE1 league registry that stamps every
   other league identically in schedule and games (§1), and the first Play-In game is on 15 Oct. If the live feed ever
   labelled it differently, the hub would degrade to the old behaviour for live/completed games while still featuring
   fixtures. Worth one look at the first live Worlds game.
5. **A delayed match falls through a gap.** `/upcoming` drops a fixture the moment its scheduled start passes, but a late
   start is not in the live feed until frames arrive. In that window the hub features the next Worlds fixture (or the
   old pick), then the live game once it appears. A backend change could keep unstarted-but-past fixtures.
6. **Stale-schedule grace (30 min), settle wait (2.5 s) and rail cap (4)** are named constants chosen here, not owner
   decisions.

## 9. Open product decisions for review

1. **A TBD-vs-TBD slot can be the featured match.** The brief says "the next officially scheduled Worlds match", and a
   knockout slot with both sides unnamed, scheduled before a named one, is exactly that. The alternative — prefer the next
   fixture with at least one named side — is a one-line change in `worlds.nextWorldsFixture`. Not done, because it
   would not be "the next scheduled match".
2. **A completed Worlds game outranks the next Worlds fixture** (including the gaps between stages: after the Play-In
   final on 18 Oct the hub leads with that result until Swiss play on 23 Oct). That is the literal reading of "live,
   otherwise the most recently completed"; the fixtures stay first in UP NEXT. A "next match is within N hours" rule would
   be a small addition.
3. **The Worlds Final stays featured** until six newer finished games push it out of the feed's `recent` window (the
   backend's bound). There is no time cap.
4. The upcoming board is short (no lanes or scoreboard yet), so below it the page has more empty space than with a played
   match. It is the existing PPH3 board; redesigning it was out of scope.

## 10. Commits

| | |
|---|---|
| Code, tests, screenshots | `333ae964` (`333ae964e8367e44d45761b0e18ce7011875225d`) |
| This handoff | the commit after it on `pw1/worlds-hub` |

## 11. Remaining work

- Backend: league filter or Worlds reservation on `/upcoming` (§8.1); league logo for `worlds` (§8.2); optional Worlds
  tournament context (§8.3).
- First live Worlds game on 15 Oct: confirm the slug (§8.4) and capture a real live and a real completed Worlds board to
  replace the two simulated screenshots.
- Mobile QA of the new chip tag and TBD stage text (deferred by the owner).
- After the event: decide whether the Worlds treatment retires by date or by data (it already disappears when the feeds
  carry no Worlds game or fixture).

## 12. PW1-A — final selection safety patch

Two bounded corrections to `ProPlayHub.tsx` / `MatchCenter.tsx`. Worlds priority, styling, hub architecture and everything
outside the hub are untouched.

### Fix 1 — one explicit choice at a time

**Defect (real).** `selectUpcoming` set `?next=` and left any `?game=` in place. From `?game=R1`, picking a Worlds fixture gave
`?game=R1&next=w1`; once `w1` started and left `/upcoming`, the board went back to R1, away from the match the reader chose.

| Change | Where |
|---|---|
| Selecting an upcoming match now deletes `?game=` (the inverse already deleted `?next=`) | `ProPlayHub.selectUpcoming` |
| **Older or shared links that still carry both** resolve to the fixture — the later, more specific choice — once it starts, rather than the stale pin. If the fixture is gone and unfollowable, the pin is used | `explicitGameId = followedGameId ?? pinnedId` |

### Fix 2 — an explicit fixture the schedule is slow or unable to produce

**Defect (real).** After the 2.5 s settle bound, `?next=<id>` with a still-pending or failed schedule fell through to the
automatic pick: an unrelated match, on the board, under a link that named a fixture, with nothing saying so.

An explicit `?next=` the schedule cannot produce now has one of four outcomes, none of which shows an unrelated match as the selection:

| State | Condition | What the reader sees |
|---|---|---|
| waiting | schedule pending, within 2.5 s (unchanged bound) | the existing loading frame |
| **slow** | still pending past 2.5 s | "Still loading that match" + **Try again** + **Show the latest match**; the board is *not* an unrelated match; resolves by itself if the schedule answers later |
| **unavailable** | schedule request failed, or upstream's own read failed (`source_ok: false`) and the fixture is not in the (possibly stale) page | "Couldn't load that match" + the same two actions |
| **gone** | schedule healthy and no longer lists it, and no game of that `match_id` is in the feed | the automatic pick, under a one-line status: "The match in this link is no longer on the schedule, so the latest match is shown instead." |

Unchanged: a started match is followed into its game (no wait, no notice); a `?game=`-only link never waits; an ordinary visit
with no link keeps the pre-PW1-A behaviour (after the bound it shows what it has, silently, since no fixture was named).
"Show the latest match" clears both params and returns the automatic pick. The reader's URL is never rewritten by any state.

### Tests (+10, `ProPlayHub.test.tsx`)

| Test | Pins |
|---|---|
| `selecting a fixture from a ?game= link leaves only that fixture in the URL, and it stays featured through live and completed` | the requested regression: `?game=R1` → pick fixture → URL is exactly `?next=w1` → fixture → live → completed keeps FUR vs MVK, URL unchanged |
| `selecting a played game from a ?next= link leaves only that game in the URL` | the inverse |
| `an older link that still carries both follows the fixture …` | `?game=R1&next=w1` once `w1` started |
| `holds the loading frame within the bound, then says so …` | delayed schedule: skeleton, then "slow"; no unrelated match, no workspace, URL untouched |
| `resolves by itself when the slow schedule finally answers` | recovery without a click |
| `says the schedule is unavailable when it fails …` | unavailable schedule + **Try again** recovers |
| `'Show the latest match' clears the link's fixture …` | escape hatch, URL `""` |
| `treats a schedule whose upstream read failed as unavailable, not as 'gone'` | `source_ok: false` |
| `a healthy schedule that does not list the fixture is 'gone' …` | labelled fallback |
| `shows no such note on an ordinary visit, or when a started match is followed` | no false notices |

(The existing "does not stick on a ?next= that left the schedule" test additionally asserts the `gone` note.)

### Verification (clean main `b1f65a9c` baseline is unchanged from §6)

| Check | PW1 `ffa42573` | PW1-A |
|---|---|---|
| Focused regression set (same paths as §6) | 1356 / 1356, 270 suites | **1366 / 1366**, 272 suites, 0 failures |
| `tsc --noEmit -p tsconfig.app.json` | the 2 errors already on main | the same 2, nothing new |
| `eslint` on the 3 touched files | 0 | 0 |
| `vite build` | succeeds | succeeds (48 s, scratch outDir) |

Screenshots reused from §7; the production "after" frames are unaffected (a fixture that resolves renders exactly as before).
Two new, **simulated** frames show the new state, taken on a real fixture deep link (`?next=` FUR vs MVK, production match id)
with `/upcoming` blocked or held in the browser: `sim-next-unavailable-1440x900.png` (HTTP 503) and
`sim-next-slow-1440x900.png` (held past 2.5 s). Nothing about the schedule was changed upstream.

### Not changed, on purpose

Worlds priority and tiers, the rail, accent and year, the `settle` bound (2.5 s), the stale-fixture grace (30 min), the
backend dependencies in §8, and the open decisions in §9 — all as reviewed.

## 13. PW1-C — the Worlds-filtered schedule (closes §8.1)

Backend PW1-B (`8829fc3c`) filters the cached schedule by exact slug **before** the 12-row cap:
`GET /api/live-esports/upcoming?league=worlds` echoes `league: "worlds"` in the ordinary envelope. Unfiltered requests are unchanged.

| Piece | Behaviour |
|---|---|
| `fetchUpcoming(league?)` (`api.ts`) | Adds `?league=`. `UpcomingResponse.league` is the echo |
| `useUpcoming()` | Unchanged semantics, key `["live-esports","upcoming"]` (made an arrow so react-query's context is never read as a league) |
| `useSchedule()` (`hooks.ts`) | Adds a **separate** query, key `["live-esports","upcoming","worlds"]`, same 120 s poll, `retry:false`. Merges by `match_id` (no duplicates), time-ordered (`mergeUpcoming`). Hub, rail and automatic pick all read the merged list |
| Old backend | A filtered answer counts **only if it echoes `league: "worlds"`**. Otherwise it is the ordinary list again: it is not treated as verified Worlds and adds nothing |
| Filtered read fails | Worlds rows in the ordinary response are kept; unrelated fixtures are never hidden; the hub behaves as before PW1-C |
| Unavailable ≠ empty | `worldsVerifiedEmpty` is true only for a successful, honoured, `source_ok` read with no rows. `stale` / `sourceOk` are exposed from both reads |
| Pending | Either read pending = pending. An explicit `?next=` is **not** "gone" while only the unfiltered read has answered; "slow" still appears after 2.5 s, and it resolves when the filtered read lands. The automatic pick does not wait on the second read once a Worlds fixture is already known |
| Unavailable | Either read failing (or `source_ok:false`) with the fixture unresolved ⇒ `unavailable`, not `gone` |
| "gone" copy | "…isn't in the current schedule response (it lists only the next few matches), so the latest match is shown instead." Absence from a bounded response is not proof Riot removed it |

Unchanged: selection tiers, rail ordering, TBD handling, media, styling, `?game=`/`?next=` ownership (§12).

### Tests (+14)
`ProPlayHub.test.tsx` `PW1-C ·` (12) + `mergeUpcoming.test.ts` (2): full cap of unrelated fixtures with Worlds only in the filtered read;
duplicates across reads; old backend (Worlds present / absent, never shown as filtered); filtered failure with and without ordinary Worlds rows;
both unavailable; filtered slower than ordinary (not gone, then resolves; and not delaying a known fixture); gone only when both answered;
fixture → live → completed with the filtered read as sole source; explicit `?game=` / `?next=` (non-Worlds fixture selectable).

| Check | PW1-A `2c3953a3` | PW1-C |
|---|---|---|
| Focused set (clean main 1300 / 1300) | 1366 / 1366 | **1380 / 1380**, 275 suites |
| `tsc` | 2 errors already on main | same 2 |
| eslint (6 touched files) | 0 | 0 |
| `vite build` | OK | OK |

### Production verification (2026-10-12T03:46Z, independent of tests)
- `/api/live-esports/upcoming` → 12 rows: 6 demacia_cup, 1 cblol_promotion, 1 lcs_promotion, 2 emea_masters, 2 worlds; no `league` key.
- `/api/live-esports/upcoming?league=worlds` → `league: "worlds"`, `source_ok: true`, `stale: false`, **12 rows, all `worlds`** (FUR vs MVK, C9 vs KC, then TBD Play-Ins slots).
- This branch's hub against production (dev server, headless Chromium): FUR vs MVK featured and selected in UP NEXT, no page errors.
- One 502 ("Application failed to respond") was seen at ~03:39Z while Railway was deploying; the same endpoints returned 200 on every later call. **Not** a frontend issue, but note the hub degrades to the previous pick if both reads fail.
- Not verified: behaviour during live Worlds play (no live Worlds game exists yet). Screenshots unchanged.
