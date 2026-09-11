// ---------------------------------------------------------------------------
// Team mode — the five-lane board, rendered inside the same Explorer page.
//
// A SECOND BOARD, NOT A SECOND EXPLORER. The page, the shell, the URL rules
// and the admin gate are Phase 1's; `mode=team` in the query string chooses
// which board `ProPlayMatchup` renders and which endpoint it calls. Lane mode
// is untouched and is still the default, so every Phase 1 link ever shared
// keeps working.
//
// THE FIVE THINGS THIS SCREEN MUST NOT SAY, and where each is prevented:
//
// 1. "Head-to-head." Ten records on one screen is the most inviting place in
//    the product to read a series score that is not there. The section is
//    headed "Side-by-side record", the render is conditioned on the server's
//    `head_to_head` being false, and the server's sentence is printed under it.
// 2. "This is the starting five." A lane the roster authority will not call is
//    rendered as a timeshare with every candidate and no highlight; only
//    `is_starter` — its verdict about games ALREADY PLAYED — draws the badge,
//    and the badge says "demonstrated starter".
// 3. "Qualified for Worlds." Focus status prints verbatim through Phase 1's
//    `FocusBadge`, and `asserts_qualification` is the only field allowed to
//    change the wording.
// 4. "Champions they can play." The heading is "Demonstrated picks", the
//    server's pool note is printed, and the collapse at `pool_preview` is a
//    DISPLAY point — every row is in the payload and "Show all N" reveals it.
//    There is no minimum-game filter anywhere in this file.
// 5. Any prediction of a draft, a ban, or a result. The server's `team_mode`
//    note denies all four in words and is printed at the top of the board.
//
// MECHANICS ARE NOT RENDERED HERE. Five mechanics panels would bury the board,
// so mechanics stay where Phase 1 put them: one lane drill-down away, in the
// lane view, reading the same public `/api/docs/champions/{slug}` authority.
//
// PHASE 3 CHANGED WEIGHT, NOT WORDING. Every sentence above still ships and
// still comes from the server; what moved is where the reader meets it. The
// no-prediction note is a margin annotation, the focus caveat and the pool
// notes are behind "What this means", and the five lanes — which used to sit
// under eight form fields — are now the first thing on the page. The parts
// themselves live in `@/components/pro-play/dossier`; this file is the
// composition, the team pickers and the ban bar.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  Dossier,
  DossierSection,
  FinePrint,
} from "@/components/pro-play/dossier/DossierChrome";
import {
  ArchiveWarnings,
  LanePlate,
  MatchHeader,
  ScopeRail,
  TeamSummaryPlate,
} from "@/components/pro-play/dossier/MatchDossier";
import {
  BoardSelectionProvider,
  type ChampionSelection,
} from "@/components/pro-play/dossier/BoardSelection";
import {
  MeetingShell,
  RecentMeetings,
} from "@/components/pro-play/dossier/MeetingDrilldown";
import PlayerChampionDrawer from "@/components/pro-play/dossier/PlayerChampionDrawer";
import {
  sideJourneySelection,
  withStudyOpponent,
  withStudySubject,
  type ExampleNavigation,
  type LaneSide,
  type MatchupContract,
  type MeetingSelection,
  type TeamMatchupResponse,
  type TeamSelection,
  withMeeting,
  withMeetingGame,
  withTeamBanToggled,
  withTeamScope,
  withTeamSide,
  withTeamsSwapped,
} from "@/lib/pro-play/matchupApi";

// --- controls ---------------------------------------------------------------
// Team selection lives in the VS banner (`MatchHeader`), which is the one
// control that changes the subject. What remains here operates on the matchup
// already chosen: scope, sides and bans.

function TeamBanBar({
  data,
  selection,
  onChange,
}: {
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  // Only champions somebody on this board demonstrably plays are offered.
  // Offering all 170 would suggest a draft model that does not exist, and
  // banning a champion nobody picked is a no-op set difference.
  const offered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data.lanes) {
      for (const side of [row.a, row.b]) {
        for (const cand of side?.candidates ?? []) {
          for (const champ of cand.pool?.champions ?? []) {
            counts.set(champ.key, (counts.get(champ.key) ?? 0) + champ.games);
          }
        }
      }
    }
    for (const key of selection.bans) if (!counts.has(key)) counts.set(key, 0);
    // Most-played first: a reader banning by hand reaches for those.
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [data, selection.bans]);

  const [all, setAll] = useState(false);
  if (!offered.length) return null;
  const shown = all ? offered : offered.slice(0, 24);

  return (
    <div data-testid="team-bans">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bans ({selection.bans.length}) — applied to every lane
      </span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(([key]) => {
          const banned = selection.bans.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={banned}
              data-testid={`team-ban-${key}`}
              onClick={() => onChange(withTeamBanToggled(selection, key))}
              className={[
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                banned
                  ? "border-destructive bg-destructive/10 text-destructive line-through"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {key}
            </button>
          );
        })}
        {offered.length > shown.length ? (
          <button
            type="button"
            className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="team-bans-show-all"
            onClick={() => setAll(true)}
          >
            Show all {offered.length}
          </button>
        ) : null}
      </div>
      <FinePrint testId="dossier-bans-note">{data.bans.note}</FinePrint>
    </div>
  );
}

// --- the board --------------------------------------------------------------

/**
 * What a champion click produces in Step 1: the settled question, stated, and
 * an honest note that the answer is not built yet.
 *
 * It deliberately shows NO statistics. Everything it could cheaply repeat is
 * already on the tile that was clicked, and anything more -- this player on
 * this champion INTO that opponent -- is exactly the contextual aggregation
 * Step 2 adds and this step was told not to start. An empty panel promising
 * numbers would be worse than a panel that says what it is.
 */
export function TeamBoard({
  contract,
  data,
  selection,
  onChange,
}: {
  contract: MatchupContract;
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  const headerA = data.teams.a;
  const headerB = data.teams.b;
  const configured = Boolean(headerA && headerB);

  // STEP 3 MOVED THIS INTO THE URL, and it had to. A side journey establishes a
  // different board plus a player, a champion, an opposing player and an
  // opposing champion in ONE navigation; React state local to this component
  // cannot survive that, and a second mechanism beside the query string the
  // board already reads would be two sources of truth for one selection. The
  // clearing rules that used to live here now live in `withTeamSide` and
  // `withTeamScope` beside every other selection rule, so a stale study is
  // impossible rather than merely cleaned up afterwards.
  const study = selection.study ?? null;

  // Step 4's open meeting, read from the same selection the study is. The
  // clearing rules live with every other selection rule in `matchupApi` — a
  // team, scope or study change drops it there, so a meeting belonging to a
  // board that is no longer on screen is impossible rather than tidied up.
  const meeting = selection.meeting ?? null;

  // The board is the authority on who is in which lane. Resolving the study's
  // player against the payload rather than trusting the URL means a link
  // naming somebody this board does not show opens no drawer at all, instead
  // of a drawer with another player's lane and team in its header.
  const selectedChampion = useMemo<ChampionSelection | null>(() => {
    if (!study) return null;
    for (const row of data.lanes) {
      for (const side of [row.a, row.b] as (LaneSide | null)[]) {
        if (!side) continue;
        const candidate = side.candidates.find(
          (c) => c.player_lp_page === study.subject_player,
        );
        if (!candidate) continue;
        return {
          player_lp_page: candidate.player_lp_page,
          display_name: candidate.display_name,
          team_key: side.team_key,
          opponent_team_key:
            side.team_key === headerA?.team_key
              ? headerB?.team_key ?? null
              : headerA?.team_key ?? null,
          lane: row.lane,
          champion: study.subject_champion,
          scope_id: data.scope.scope_id,
          scope_label: data.scope.scope_label,
        };
      }
    }
    return null;
  }, [study, data, headerA, headerB]);

  // The other half of the same lane — the candidates and their demonstrated
  // pools the study's chooser offers. Read off the board payload, so choosing
  // the opposing side costs no request and cannot offer a player the board
  // does not show.
  const opposition = useMemo<LaneSide | null>(() => {
    if (!selectedChampion) return null;
    const row = data.lanes.find((r) => r.lane === selectedChampion.lane);
    if (!row) return null;
    const sides = [row.a, row.b] as (LaneSide | null)[];
    return sides.find((sd) => sd && sd.team_key !== selectedChampion.team_key) ?? null;
  }, [data.lanes, selectedChampion]);

  const boardTeamKeys = useMemo(
    () => [headerA?.team_key, headerB?.team_key].filter(Boolean) as string[],
    [headerA, headerB],
  );

  const boardSelection = useMemo(
    () => ({
      scopeLabel: data.scope.scope_label,
      scopeId: data.scope.scope_id,
      opponentOf: (teamKey: string) =>
        teamKey === headerA?.team_key
          ? headerB?.team_key ?? null
          : teamKey === headerB?.team_key
            ? headerA?.team_key ?? null
            : null,
      // The participation denominator, read off the header the board already
      // has. No second source: `team_games_in_scope` is the very number the
      // server divides by to produce `share_of_team_games`.
      teamGamesIn: (teamKey: string) =>
        teamKey === headerA?.team_key
          ? headerA?.team_games_in_scope ?? null
          : teamKey === headerB?.team_key
            ? headerB?.team_games_in_scope ?? null
            : null,
      selected: selectedChampion,
      onSelect: (next: ChampionSelection) => {
        // Clicking the selected tile again clears it, so the tile is a toggle
        // rather than a trap with no way back. Unchanged behaviour; it now
        // writes the query string instead of local state.
        const same =
          study?.subject_player === next.player_lp_page &&
          study?.subject_champion === next.champion;
        onChange(
          withStudySubject(
            selection,
            same ? null : { player: next.player_lp_page, champion: next.champion },
          ),
        );
      },
    }),
    [data.scope, headerA, headerB, selectedChampion, study, selection, onChange],
  );

  return (
    <Dossier>
      <MatchHeader
        data={data}
        contract={contract}
        selection={selection}
        onChange={onChange}
      />

      {/* The server's team-mode note denies a draft, a ban, a starter and a
          result, in its own words. It is a margin annotation now instead of a
          leading paragraph — but it renders on every board, unedited. */}

      <div className="dossier-controls" data-testid="dossier-controls">
        <ScopeRail
          contract={contract}
          scopeId={selection.scope_id}
          onChange={(next) => onChange(withTeamScope(selection, next))}
        />
        <div className="dossier-controls__actions">
          <button
            type="button"
            className="dossier-btn"
            data-testid="team-swap"
            onClick={() => onChange(withTeamsSwapped(selection))}
          >
            Swap sides
          </button>
          {/* A second "Lane explorer" button stood here. The board no longer
              asks the reader to choose a mode — each lane plate's "Open lane
              dossier" is the one way down, and it carries the lane with it
              instead of dropping them into an empty explorer. `onSwitchToLane`
              is still plumbed for that route. */}
        </div>
      </div>

      {/* Asserted, not assumed. Ten records at once is exactly where a reader
          would invent a series score, so nothing renders unless the server
          says this is not head-to-head. */}
      {data.head_to_head === false ? (
        <DossierSection
          title="Lane Study"
          eyebrow="Each player's own record"
          testId="dossier-lane-study"
        >
          <BoardSelectionProvider value={boardSelection}>
            <div className="dossier-lanes" data-testid="lane-board">
              {data.lanes.map((row) => (
                <LanePlate key={row.lane} row={row} preview={data.pool_preview} />
              ))}
            </div>
          </BoardSelectionProvider>
          {/* STEP 2: the real dossier. The drawer owns the request; the board
              owns only which question is being asked. Rendered unconditionally
              so the sheet can animate closed rather than vanishing. */}
          <PlayerChampionDrawer
            selection={selectedChampion}
            onClose={() => onChange(withStudySubject(selection, null))}
            opposition={opposition}
            opposingPlayer={study?.opposing_player ?? null}
            opposingChampion={study?.opposing_champion ?? null}
            boardTeamKeys={boardTeamKeys}
            onOpposingChange={(player, champion) =>
              onChange(withStudyOpponent(selection, { player, champion }))
            }
            // THE SIDE JOURNEY. One selection change carries the reader to the
            // example's own board with both halves of its study already
            // established — no rebuilding teams, lane, player, champion,
            // opponent and opposing champion by hand. It goes through the same
            // `onChange` every other control uses, so it is one history entry
            // and Back returns to where they were.
            onNavigate={(navigation: ExampleNavigation) =>
              onChange(sideJourneySelection(selection, navigation))
            }
            // THE SECOND ENTRY PATH. From the exact record's own evidence into
            // the meeting that evidences it — the same one selection change,
            // the same history entry, and the meeting shell opens below the
            // board rather than anywhere else.
            onOpenMeeting={(next: MeetingSelection) =>
              onChange(withMeeting(selection, next))
            }
          />
          {/* The no-head-to-head guarantee is carried by the section's own
              eyebrow and by this one line, not by a boxed disclaimer above ten
              records. The server's sentence is still printed verbatim — it is
              the exact wording the semantics are guaranteed in. */}
          <FinePrint testId="dossier-side-by-side-note">{data.notes.side_by_side}</FinePrint>
          {/* Two separate server sentences, rendered separately. Joining them
              into one string would make each unquotable, and these are the
              exact words the pool semantics are guaranteed in. */}
          <FinePrint testId="dossier-pool-fineprint">{data.notes.pool}</FinePrint>
          <FinePrint testId="dossier-pool-bound-fineprint">{data.notes.pool_bound}</FinePrint>
        </DossierSection>
      ) : null}

      {/* STEP 4. The times these two teams played, and the meeting a reader
          opened from here or from the exact matchup above. Both live BELOW the
          board they narrow — a meeting is a deeper layer of this dossier, not
          a fourth mode, and there is deliberately no tab for it. */}
      <RecentMeetings
        meetings={data.meetings}
        total={data.meetings_total}
        note={data.notes.meetings}
        selected={meeting}
        onOpen={(next: MeetingSelection) => onChange(withMeeting(selection, next))}
      />
      <MeetingShell
        selection={meeting}
        scopeId={data.scope.scope_id}
        scopeLabel={data.scope.scope_label}
        onClose={() => onChange(withMeeting(selection, null))}
        // STEP 5. One selection change, one history entry, so Back returns to
        // the meeting with no game open — and `withMeetingGame` refuses to set
        // a game when there is no meeting to number it inside.
        onSelectGame={(gameNumber: number | null) =>
          onChange(withMeetingGame(selection, gameNumber))
        }
      />

      {headerA || headerB ? (
        <DossierSection title="Team Record" eyebrow="Side by side" testId="dossier-team-record">
          <div className="dossier-teamsums">
            <TeamSummaryPlate header={headerA} />
            <TeamSummaryPlate header={headerB} />
          </div>
        </DossierSection>
      ) : null}

      <DossierSection title="Global Bans" eyebrow="Applied to every lane" testId="dossier-bans">
        <TeamBanBar data={data} selection={selection} onChange={onChange} />
      </DossierSection>

      <ArchiveWarnings data={data} />
    </Dossier>
  );
}
