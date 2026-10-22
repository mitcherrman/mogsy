# Tournament Arena & Match Host Portal — Visual Prototype Handoff

**Status:** working visual prototype on `feat/tournament-arena-visual` (base `origin/main` 0fd1bb6a). DEV-only route, fixture gateway, no backend, no production route, no deploy.
**Date:** 2026-10-21
**Built against:** the audit `docs/tournament/MOGZY_TOURNAMENT_HANDOFF.md` (branch `docs/tournament-arena-handoff` @ f3b5d29d, not merged). Section numbers below refer to that document.
**Audience:** the owner (visual review) and the backend session that builds `/api/arena/*`.

## 1. What to open

Run the frontend (`npm run dev`) and visit:

| Route | What it is |
|---|---|
| `/lol/dev/tournament-arena` | Arena home: hero, three doors, every fixture scenario as an event card |
| `/lol/dev/tournament-arena/event/:id` | An event. `:id` is a scenario id (`lobby-8`, `locked-8`, `live-4`, `mid-8`, `byes-6`, `final-16`, `champion-16`, `open-32`, `duel`) or an event the portal created in this tab (`aev_host_…`) |
| `/lol/dev/tournament-arena/host` | Match Host Portal (five-step create wizard → launch transition → the new event's lobby) |
| `/lol/dev/tournament-arena/duel` | The duel experience standalone; with `?event=&node=` it plays a bracket node and commits its result |
| `…?motion=reduce` | Forces the app's own Reduce Motion for the visit (every beat has a static parity frame) |

The route is registered only when `import.meta.env.DEV` (App.tsx), exactly like the Worlds experience prototype, so the chunk and every fixture are dead code in a production build and the path 404s there. It sits under `/lol/` for the LoL theme; `Layout.tsx` gives it the same full-bleed, fixed-viewport frame as `/lol/dev/worlds-experience`.

Fixture-only controls on the event page: **Step next result** (commits the next scripted game), **Step result** on a node, **Reset scenario**. Organizer controls that would be real: **Lock bracket**, **Start round**, **Walkover · name**. The viewer is always `fx_you` (the organizer in every scenario).

## 2. Screenshots

`docs/tournament/screenshots/` (captured from the built-in browser at 1440×900 and 375×812):

| File | Screen |
|---|---|
| `01-arena-home-desktop.jpg`, `17-arena-home-phone.jpg` | Arena home |
| `02-bracket-8-live-desktop.jpg`, `13-bracket-8-phone.jpg` | 8-player Bo3, QF3 live at 1–1 with match point; phone one-round pager |
| `03-…node-detail-desktop.jpg`, `19-…node-detail-live-desktop.jpg`, `14-node-detail-sheet-phone.jpg` | Expanded match detail (final ready; live series with games); phone bottom sheet |
| `04-bracket-16-champion-desktop.jpg` | 16-player bracket complete, whole bracket on one screen (compact level) |
| `05-champion-celebration-desktop.jpg` | Championship frame: rays, trophy, confetti, name, mascot |
| `06-bracket-32-pannable-desktop.jpg` | 32-player bracket on the pannable plane with the round-jump bar |
| `07-event-lobby-desktop.jpg` | Lobby: ready states, join code, format, Lock bracket |
| `08–10-host-portal-*.jpg`, `16-host-portal-phone.jpg` | Portal steps: Event, Rules, Players; phone Game step |
| `11-duel-ready-check-desktop.jpg`, `18-finals-intro-desktop.jpg` | VS card with ready check; finals intro mid-slide |
| `12-duel-victory-desktop.jpg`, `15-duel-victory-phone.jpg` | Result reveal |

Verified interactively in the browser: stepping results (winner glides along the connector, pips stamp, round stingers fire), the champion celebration on completion and on Replay, the finals intro from the final's detail, the whole portal flow through Launch into a lobby, Lock → bracket reveal → Start, the duel from VS to result and back into the bracket with its result committed, phone sheet and swipe paging.

## 3. Where the code is

Everything new lives under `src/features/tournament-arena/` (components prefixed `TournamentArena*`, CSS prefixed `ta-`), plus the DEV pages under `src/pages/dev/tournament-arena/`.

| Area | Files | Notes |
|---|---|---|
| Contract | `contracts.ts` (+ test) | §6 shape as `arena_event.v1`, with `isArenaEvent` / `isArenaNode` validators (refuses any `user_id`), `roundName` / `nodeLabel` / `slotSourceLabel` derived from the count |
| Pure layout | `bracket/layout.ts` (+ test) | `generateBracket` (2–32, standard seed order, byes against top seeds), `layoutBracket` (positions + connector paths from `(round, position)`, no DOM measuring), `fitScale`, `nextSlotOf` |
| Advancement | `engine/advance.ts` (+ test) | `lockEvent`, `startEvent`, `goLive`, `recordGame` (series, draw replay, elimination, champion), `walkover`, `scriptedResult`. Pure; this is the fixture stand-in for the backend's `arena.on_match_terminal` |
| Gateway seam | `gateway/types.ts`, `fixtureArenaGateway.ts`, `httpArenaGateway.ts`, `useArenaEvent.ts` | `ArenaGateway` interface in the `rankedInvite.ts` style. The HTTP gateway reports **unavailable** with finished copy and never pretends. The fixture gateway keeps scripted scenarios plus portal-created events in memory + sessionStorage |
| Fixtures | `fixtures/roster.ts`, `scenarios.ts`, `catalog.ts` | Invented entrants (`fx_*` ids), scenarios built by running the engine (not hand-drawn states), the §2.4 eligible game types with a settings schema each |
| Bracket | `bracket/TournamentArenaBracket.tsx`, `TournamentArenaNodeCard.tsx`, `TournamentArenaConnectors.tsx`, `useBracketBeats.ts` | Desktop fit cascade (full → compact scaled → pannable plane with round jump); phone round pager with swipe; beats from revision diffs |
| Ceremony | `ceremony/FinalsIntro.tsx`, `ChampionCelebration.tsx`, `RoundStinger.tsx`, `SeriesPips.tsx`, `Trophy.tsx`, `LaunchTransition.tsx` | Ports of the Dynasty `FullFrame`, `StingerHost`, `BoPips`, `TrophyArt` and confetti, renamed `ta-` and re-scoped |
| Event | `event/EventPage.tsx`, `EventLobby.tsx`, `NodeDetail.tsx`, `BottomSheet.tsx` | Fixed-viewport frame; lobby → bracket; desktop detail column / phone sheet |
| Portal | `portal/HostPortal.tsx` | Event → Game → Rules → Players → Launch |
| Duel | `duel/DuelExperience.tsx` | intro → ready check → countdown → (simulated rundown) → result → rematch |
| Identity, motion, audio, styles | `identity.ts`, `motion.ts`, `audio.ts`, `ui/parts.tsx`, `tournament-arena.css` | Deterministic accent per `profile_id`; one ease; `arena.*` cue ids; the scoped stylesheet |
| Shared registry | `src/lib/audio/sfx-registry.ts`, `sfx-renderers.ts` | Seven `arena.*` events (group `arena`) with built-in synth voices ported from the Dynasty moment cues. No assets, no second engine |
| App | `src/App.tsx`, `src/components/Layout.tsx` | DEV route registration; full-bleed + fixed-viewport flags |

## 4. What was reused, forked or ported (audit §3)

- **Reused as-is:** `useReducedMotionPreference` / `useMotionAllowed` (the only reduced-motion source), `EASE_OUT` and the slide variants pattern from `worlds-experience/motion.ts`, `DESKTOP_QUERY` / `LANDSCAPE_QUERY` / `useMediaQuery` from `ExperienceContext`, `ViewTabs` from `worlds-experience/fit.tsx`, `useViewportLock`, `RoleMascot` (compact art, `celebrate` / `hit` / `focus` actions), `resolveCrownArt`, `isRankedRole`, `useSfx`, `MODE_ACCENT` from `public-modes/gallery`, `cn`.
- **Forked (not edited):** `BracketMatchCard` → `TournamentArenaNodeCard` (people instead of teams; no `bracket_authority` / `useKit` / `TeamCrest` / `matchHref`); the Worlds `BottomSheet` → `event/BottomSheet.tsx`; `singleElimRounds` / `winnerEdges` → the pure layout.
- **Ported from `origin/ux/ux6-dynasty-management`** (read with `git show`, nothing merged): `FullFrame` finals intro and championship sequence (black → flash → trophy → rays → confetti → title → roster), `StingerHost` / `useStinger`, `BoPips` / `Pips`, `TrophyArt`, `accentStyle`, the `dyn-*` keyframes that mattered (renamed `ta-*`, gated behind `.ta--motion` / `.ta-cine--motion`), and the `MOMENT_CUES` sound shapes as `sfx-renderers` generators.
- **Not touched:** `src/components/pro-play/tournament/*`, `worlds-experience/*` (Worlds is live), Ranked, Daily, any backend, any Supabase file.

## 5. Motion and accessibility

- Every beat from §7.3 exists: bracket reveal (rounds stagger, connectors draw with `stroke-dashoffset`), live node breathing ring, pips stamping with "Match point", advancement (winner chip travels the connector via CSS `offset-path`, connector turns gold, loser row desaturates), round-complete stinger (`aria-live`), finals intro (auto-dismiss, tap/Esc/Enter/Space), champion celebration (Replay in the header), the launch transition.
- **Idempotent on resume:** `useBracketBeats` treats the first event it sees as the baseline. Opening a finished event shows the final state; only a revision change seen in this session plays a beat.
- **Reduced motion:** `useReducedMotionPreference` (OS or app toggle) → `useMotionAllowed`. Keyframes only run under `.ta--motion` / `.ta-cine--motion`, which JS adds; the resting frame is always the full design. `?motion=reduce` demonstrates the parity frames.
- Only `transform`, `opacity`, `filter`, SVG `stroke-dashoffset` and `offset-distance` animate. No layout property moves.
- Bracket nodes are buttons with full accessible names ("QF3: Aurelion Sage versus Clockwork, Live"), `aria-pressed` for selection, `aria-current="step"` on the viewer's live node; ceremonies are `role="status"` and keyboard-dismissible; the round pager is a `role="tablist"` with arrow keys.
- Truthfulness: an unfilled slot prints its source ("Winner of SF1"); a winner renders only when the contract names one; every fixture screen carries the **Simulated** marker.

## 6. Fixture limitations (what is not real)

1. **No server.** `httpArenaGateway` is a stub that reports the Arena unavailable; the DEV route uses `fixtureArenaGateway` only.
2. **Match play is simulated.** The duel's "match" phase is a scripted round-by-round rundown (`scriptedRounds`), clearly marked. In production the match is `QuizRankedMatch host="tournament"` (audit §7.3 "Match handoff"); the duel component owns only the ceremony around it.
3. **Identity is invented.** Entrants are `fx_*` fixtures; the viewer is `fx_you`. No Supabase reads, no friends/blocks, no auth.
4. **Ready states, join codes and invites** are local UI state. No invite inbox exists.
5. **Seeding is join order** (or the order the lobby passes); there is no manual seeding UI yet.
6. **Audio** plays through the real `useSfx` engine, but the new `arena.*` voices are synthesized placeholders until Audio Studio binds assets.
7. **Clock:** `server_now` is fixed; no `ready_deadline` countdown runs.

## 7. Backend integration requirements (to turn the prototype live)

Everything the visual layer needs is in audit §5–§6. Concretely, from this code's point of view:

- **Endpoints** `GET /api/arena/catalog`, `POST /api/arena/events`, `GET /api/arena/events?scope=`, `GET /api/arena/events/{id}?since_revision=N`, `POST …/join|leave|check-in|lock|start|cancel`, `POST …/nodes/{node}/play|resolve`, invites inbox. Projection must be `arena_event.v1` as in `contracts.ts` (never a `user_id`; `join_code` for the organizer only; `current_match_id` only on the viewer's own node).
- **Gateway:** implement `ArenaGateway` in `httpArenaGateway.ts` with `getBackendAuthHeaders()` and validate every body with `isArenaEvent`. `subscribe` becomes revision polling (5 s live / 15 s idle / paused while hidden). `commitGame` and `stepResult` are fixture-only and should throw there.
- **Advancement** happens server-side in the Ranked commit transaction (`arena.on_match_terminal`); the client's `engine/advance.ts` is reference behaviour for byes, series, draw replay (decision D4), walkovers and champion.
- **Match handoff:** `NodeDetail` "Play your match" → `POST …/nodes/{node}/play` → mount `QuizRankedMatch` with `host="tournament"`, then return to `/event/:id?from=<node>` so the bracket plays that node's advancement. `MATCH_HOST` needs a `tournament` value mirroring `HOST_TOURNAMENT`.
- **Flags:** `ARENA_ENABLED`, `app_settings.queue_arena_enabled`, `RANKED_PUBLIC_ENABLED`, `RANKED_LIFECYCLE_WORKER_ENABLED` (no-show sweeps).
- **Production routes:** `/quiz/arena/*` (theme pre-paint) registered before the `/:slug` catch-all; owner moderation under `/admin/arena` inside `AdminRoute`. The DEV route stays as the fixture harness.
- **Owner decisions still open:** D1 rated (prototype assumes unrated), D2 who may organize, D3 size/format (prototype allows 2–32, Bo1/3/5), D4 draw rule (replay implemented), D5 game types (catalog marks Role Challenge and Champion Card Duel "later"), D9 wording ("Challenge" / "Join code" used), D10 no-show deadline (portal slider, default 10 min).

## 8. Tests and verification

- `src/features/tournament-arena/**/*.test.ts`: 34 tests (bracket generation for 2–32 with byes and seed order; pure layout positions, connectors, determinism; engine lock/series/draw/walkover/champion/scenarios; contract validation incl. the no-`user_id` rule; both gateways). Run: `npx vitest run src/features/tournament-arena`.
- Audio registry suites (`play-sfx`, `sfx-registry.reward`, `chronometerSfx`) still pass with the `arena` group added.
- `tsc -p tsconfig.app.json --noEmit`: no errors in any touched file (the two pre-existing errors on main in `connections.ts` and `OnboardingProfile.tsx` are unchanged).
- Browser verification was done in the desktop app's built-in browser pane, not with local Edge/Chrome automation (AGENTS.md). No CI browser workflow was added; a `playwright.tournament-arena.config.ts` + GitHub Actions geometry spec in the `quiz-hub-main-fit.yml` style is the next verification step.

## 9. Known gaps and next steps

- No manual seeding UI (drag order) in the lobby; no organizer console beyond Lock/Start/Walkover.
- The pannable 32-player plane hides the round headers once panned down (they live above the plane); a sticky header row is a small follow-up.
- Entrant avatars use the five role mascots cropped to the face plus a monogram fallback; a true per-user avatar system does not exist on main.
- Bracket "replay" scrubbing (the Combat Theater pattern) was not built.
- CI browser matrix, copy review and the production `/quiz/arena/*` wiring follow the backend (audit §10, F4–F7).
