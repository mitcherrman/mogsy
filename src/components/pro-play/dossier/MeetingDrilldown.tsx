/**
 * Step 4 — historical MEETINGS, and one meeting's games in order.
 *
 * TWO COMPONENTS, ONE LAYER. `RecentMeetings` is the compact section under the
 * five-lane board — the answer to "when did these two teams play", three
 * fields a row. `MeetingShell` is what opens when a reader clicks one, or
 * clicks the source meeting of an exact matchup: the same dossier, one layer
 * deeper.
 *
 * MEETING, NOT SERIES. 59% of the corpus's `match_id`s carry exactly ONE game,
 * because Bo1 leagues are most of it. The server reports `kind` and this file
 * renders the word it is given — a single game is labelled "Game", never
 * "Series", and its `1–0` is printed as the factual result it is rather than
 * dressed up as a best-of.
 *
 * STEP 9 ADDED THE LINEUPS between the two: who ACTUALLY played each position
 * across the whole meeting, and the champion each of them took game by game.
 * It is built from the same participant rows the game list below it renders,
 * so the summary and the games can never name different players.
 *
 * NOT A MATCH PAGE. There is no per-player K/D/A, CS, gold, damage, vision or
 * objective row here, and no draft order anywhere — `sequence` is -1 on every
 * pick/ban row in the corpus, so an ordered draft would be invented. The
 * server's `unavailable_metrics` names each absence in words, and this renders
 * those words rather than writing its own.
 */

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";

import { DossierSection, FinePrint, Parchment } from "./DossierChrome";
import { ChampionIcon } from "./DossierMedia";
import { GameDossier } from "./GameDetail";
import {
  MEETING_SERIES,
  MatchupApiError,
  fetchMeeting,
  type MeetingGame,
  type MeetingLineupPlayer,
  type MeetingLineupPosition,
  type MeetingLineupTeam,
  type MeetingPayload,
  type MeetingScoreEntry,
  type MeetingSelection,
  type MeetingSummary,
} from "@/lib/pro-play/matchupApi";

/** `2026-05-16 08:06:00` → `16 May 2026`. The corpus stores a timestamp; the
 *  time of day is not something a reader is placing a meeting by. */
export function meetingDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Seconds → `31:42`. Null stays null: 80% of the corpus carries a duration
 *  and a zero would be a lie about a game that was played. */
export function gameDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** The word for what this is. The ONE piece of vocabulary this file decides,
 *  and it decides it from the server's measured `kind`. */
export function meetingKindLabel(kind: string, gameCount: number): string {
  return kind === MEETING_SERIES ? `Series · ${gameCount} games` : "Single game";
}

/**
 * `T1 3–1 Gen.G` — the conventional shape, with the two names on the outside
 * and the numbers meeting in the middle.
 *
 * THE ORDER IS THE SERVER'S. `score_line` arrives winner-first, so this decides
 * nothing about who won; it only lays out what it is handed. A meeting with no
 * derivable winner arrives in a stable order too, and renders the same way
 * without implying one.
 */
function ScoreLine({ score }: { score: MeetingScoreEntry[] }) {
  const [left, right] = score;
  if (!left) return null;
  return (
    <span className="dossier-meeting__score" data-testid="meeting-score">
      <span className="dossier-meeting__score-team">{left.team_key}</span>
      <span className="dossier-meeting__score-wins">{left.wins}</span>
      {right ? (
        <>
          <span className="dossier-meeting__score-sep">–</span>
          <span className="dossier-meeting__score-wins">{right.wins}</span>
          <span className="dossier-meeting__score-team">{right.team_key}</span>
        </>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The board's compact section
// ---------------------------------------------------------------------------

export function RecentMeetings({
  meetings,
  total,
  note,
  selected,
  onOpen,
}: {
  meetings: MeetingSummary[];
  total: number;
  note: string;
  selected: MeetingSelection | null;
  onOpen: (meeting: MeetingSelection) => void;
}) {
  // Nothing to say is said by not saying it: an unresolved board, or a pair
  // who have not met inside this scope, gets no empty section.
  if (!meetings.length) return null;

  return (
    <DossierSection
      title="Recent Meetings"
      eyebrow={total > meetings.length ? `${meetings.length} of ${total}` : "Newest first"}
      testId="dossier-meetings"
    >
      <ul className="dossier-meetings" data-testid="meeting-list">
        {meetings.map((meeting) => {
          const isOpen = selected?.match_id === meeting.match_id;
          return (
            <li key={meeting.match_id}>
              <button
                type="button"
                className="dossier-meeting"
                data-testid="meeting-row"
                data-match-id={meeting.match_id}
                data-kind={meeting.kind}
                aria-current={isOpen ? "true" : undefined}
                onClick={() =>
                  onOpen({
                    match_id: meeting.match_id,
                    // A ONE-GAME MEETING IS ENTERED WITH ITS GAME NAMED —
                    // there is no series above it to choose from.
                    game_number: meeting.single_game_number,
                  })
                }
              >
                <ScoreLine score={meeting.score_line} />
                <span className="dossier-meeting__meta">
                  {[
                    meeting.tournament_id,
                    meetingDate(meeting.started_at),
                    meeting.patch ? `Patch ${meeting.patch}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="dossier-meeting__kind" data-testid="meeting-kind">
                  {meetingKindLabel(meeting.kind, meeting.game_count)}
                </span>
                {meeting.undecided > 0 ? (
                  <span className="dossier-meeting__undecided">
                    {meeting.undecided} game{meeting.undecided > 1 ? "s" : ""} unresolved
                  </span>
                ) : null}
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <FinePrint testId="dossier-meetings-note">{note}</FinePrint>
    </DossierSection>
  );
}

// ---------------------------------------------------------------------------
// Step 9 — the meeting's lineups
// ---------------------------------------------------------------------------

/** `Top` → `TOP`. The corpus's own five words, set in the dossier's small
 *  caps rather than remapped to a vocabulary the payload does not use. */
function positionLabel(position: string): string {
  return position.toUpperCase();
}

/**
 * One player's champions across the meeting, in game order.
 *
 * THE GAME NUMBER IS PRINTED ONLY WHEN THERE IS MORE THAN ONE GAME. On a Bo1
 * `G1` in front of the only pick is noise; across a Bo5 it is the whole point,
 * because it is what makes `G1 Olaf · G2 K'Sante · G3 Olaf` a story about
 * adaptation rather than a bag of three champions. The sequence is NEVER
 * deduplicated and never sorted here — the server ordered it by `game_number`
 * and a repeat is a fact, not a duplicate.
 *
 * NOTHING HERE IMPLIES A DRAFT. There is no pick order in the corpus
 * (`sequence` is -1 on all 2,235,030 rows), so these are the champions each
 * player ended a game on and are labelled by the GAME, never by a position in
 * a draft.
 */
function ChampionSequence({
  games,
  showGameNumbers,
}: {
  games: MeetingLineupPlayer["games"];
  showGameNumbers: boolean;
}) {
  return (
    <span className="dossier-lineup__picks" data-testid="lineup-picks">
      {games.map((entry) => (
        <span
          key={entry.game_number}
          className="dossier-lineup__pick"
          data-testid="lineup-pick"
          data-game-number={entry.game_number}
        >
          {showGameNumbers ? (
            <span className="dossier-lineup__pickgame">G{entry.game_number}</span>
          ) : null}
          {entry.champion_key ? (
            <>
              <ChampionIcon champion={entry.champion_key} size="sm" />
              <span className="dossier-lineup__pickname">{entry.champion_key}</span>
            </>
          ) : (
            // He played the game; the champion is simply not in the record.
            // Dropping the entry would shorten a real sequence, and naming a
            // champion would invent one.
            <span className="dossier-lineup__pickname dossier-lineup__pickname--absent">
              Champion not recorded
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * One position, and every player who actually occupied it.
 *
 * TWO PLAYERS IS A PARTICIPANT CHANGE, AND THAT IS ALL IT IS SAID TO BE. The
 * corpus records who played; it does not record why, so the marker reads
 * "2 players" and no word here is "substitution reason", "benched" or
 * "tactical". The two players' own game numbers make the change legible on
 * their own — `Gloryy G1–G2`, `Aress G3–G5` — which is the honest version of
 * the same information.
 */
function LineupPosition({
  position,
  showGameNumbers,
}: {
  position: MeetingLineupPosition;
  showGameNumbers: boolean;
}) {
  const changed = position.players.length > 1;
  return (
    <li
      className="dossier-lineup__row"
      data-testid="lineup-position"
      data-position={position.position}
      data-players={position.players.length}
    >
      <span className="dossier-lineup__position">
        {positionLabel(position.position)}
        {changed ? (
          <span className="dossier-lineup__changed" data-testid="lineup-changed">
            {position.players.length} players
          </span>
        ) : null}
      </span>
      <span className="dossier-lineup__players">
        {position.players.map((player) => (
          <span
            key={player.player_lp_page}
            className="dossier-lineup__player"
            data-testid="lineup-player"
            data-player={player.player_lp_page}
          >
            <span className="dossier-lineup__name">{player.player_lp_page}</span>
            <ChampionSequence games={player.games} showGameNumbers={showGameNumbers} />
            {/* SECONDARY, AND ONLY WHEN IT REPEATS. The sequence above is the
                primary fact; this says he came back to it. No percentage — a
                three-game sample is not a pick rate. */}
            {player.repeat_picks.length ? (
              <span className="dossier-lineup__repeats" data-testid="lineup-repeats">
                {player.repeat_picks
                  .map((repeat) => `${repeat.champion_key} ×${repeat.count}`)
                  .join(" · ")}
              </span>
            ) : null}
          </span>
        ))}
      </span>
    </li>
  );
}

/**
 * WHO ACTUALLY PLAYED THIS MEETING, AND WHAT THEY PICKED — the section
 * between the meeting's result and its list of games.
 *
 * ACTUAL PARTICIPANTS ONLY. Every name here has a row in one of this
 * meeting's own games. Nothing is read from a roster, a starting five, a depth
 * chart, a player profile or the five-lane board above: those answer "who is
 * on this team", and this answers "who took the field", which in a Bo5 with a
 * substitution are two different lists.
 *
 * IT DOES NOT REPLACE THE GAMES. The per-game list still sits under it with
 * its own picks and its own way in to a box score; this is the summary a
 * reader wants BEFORE choosing which game to open, and it is deliberately
 * short enough to be read on the way past.
 *
 * NO PERFORMANCE FIGURE. There is no K/D/A, gold, CS, vision, rating or
 * leader here, and there is no ban summary: bans are an unordered set of five
 * per side and a count of them beside a lineup would be read as draft
 * priority. The box score inside each game is where performance lives.
 */
export function MeetingLineups({
  lineups,
  kind,
  scoreLine,
}: {
  lineups: MeetingLineupTeam[] | undefined;
  kind: string;
  scoreLine: MeetingScoreEntry[];
}) {
  // A SERVER THAT DOES NOT SERVE THIS RENDERS THE MEETING IT ALWAYS DID.
  // `lineups` is optional and a meeting whose games carry no player rows gets
  // no empty scaffold — 46,396 of the corpus's games are short of a full ten.
  if (!lineups?.length) return null;
  const withPlayers = lineups.filter((team) => team.positions.length);
  if (!withPlayers.length) return null;

  const showGameNumbers = kind === MEETING_SERIES;
  // The score already put the two teams in an order a reader has just read.
  // Following it here means the lineups are not a second, different order.
  const order = scoreLine.map((entry) => entry.team_key);
  const teams = [...withPlayers].sort(
    (a, b) => order.indexOf(a.team_key) - order.indexOf(b.team_key),
  );

  return (
    <div className="dossier-lineups" data-testid="meeting-lineups">
      <p className="dossier-lineups__title">
        {showGameNumbers ? "Players used · picks by game" : "Lineups"}
      </p>
      {teams.map((team) => {
        const incomplete = team.game_coverage.filter((game) => !game.complete);
        return (
          <div
            className="dossier-lineup"
            key={team.team_key}
            data-testid="meeting-lineup-team"
            data-team-key={team.team_key}
          >
            <div className="dossier-lineup__head">
              <span className="dossier-lineup__team">
                {team.display_name ?? team.team_key}
              </span>
              {/* Only worth saying when it is not the plain five. */}
              {team.players_used > 5 ? (
                <span className="dossier-lineup__used" data-testid="lineup-players-used">
                  {team.players_used} players used
                </span>
              ) : null}
            </div>
            <ul className="dossier-lineup__rows">
              {team.positions.map((position) => (
                <LineupPosition
                  key={position.position}
                  position={position}
                  showGameNumbers={showGameNumbers}
                />
              ))}
            </ul>
            {/* REPORTED, NOT REPAIRED. A game whose record is short of five
                players says so, in a product sentence rather than a count of
                rows, and no name is filled in from anywhere. */}
            {incomplete.length ? (
              <p className="dossier-lineup__gap" data-testid="lineup-incomplete">
                {showGameNumbers
                  ? `Player records are incomplete for ${incomplete
                      .map((game) => `Game ${game.game_number}`)
                      .join(", ")}.`
                  : "Player records for this game are incomplete."}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The meeting shell
// ---------------------------------------------------------------------------

/**
 * One game inside the meeting — the summary row, and, when it is the selected
 * one, the full box score beneath it.
 *
 * STEP 5 MADE THIS ROW A BUTTON, and changed nothing else about it. The
 * summary a reader scans (result, duration, the ten champions) stays exactly
 * where it was; the dossier opens UNDER it, inside the same meeting shell, so
 * the header and the sibling games never leave the screen. Selecting is a
 * TOGGLE: clicking the open game closes it and leaves the meeting open, which
 * is the only way back out that does not also lose the meeting.
 */
function GameRow({
  game,
  kind,
  matchId,
  scopeId,
  selected,
  onSelect,
}: {
  game: MeetingGame;
  kind: string;
  matchId: string;
  scopeId: string;
  selected: boolean;
  onSelect: (gameNumber: number | null) => void;
}) {
  const duration = gameDuration(game.duration_seconds);
  const label = kind === MEETING_SERIES ? `Game ${game.game_number}` : "Game";
  // Champions grouped by the side that took them. This IS the pick list; there
  // is no ordering here and none exists in the corpus to render.
  const sides = new Map<string, MeetingGame["participants"]>();
  for (const p of game.participants) {
    const key = p.team_key ?? "—";
    sides.set(key, [...(sides.get(key) ?? []), p]);
  }

  return (
    <li
      className="dossier-meeting-game"
      data-testid="meeting-game"
      data-game-number={game.game_number}
      data-selected={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="dossier-meeting-game__open"
        data-testid="meeting-game-open"
        aria-expanded={selected}
        onClick={() => onSelect(selected ? null : game.game_number)}
      >
        <div className="dossier-meeting-game__head">
          <span className="dossier-meeting-game__label">{label}</span>
          <span className="dossier-meeting-game__result" data-testid="meeting-game-result">
            {game.decided && game.winner_team_key
              ? `${game.winner_team_key} win`
              : "Result not recorded"}
          </span>
          {/* Absent rather than zeroed: the statistics reach ~81% of the corpus. */}
          <span className="dossier-meeting-game__duration">
            {duration ?? "Duration not recorded"}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </div>
        {game.participants.length ? (
          <div className="dossier-meeting-game__sides">
            {[...sides.entries()].map(([teamKey, players]) => (
              <div key={teamKey} className="dossier-meeting-game__side" data-testid="meeting-game-side">
                <span className="dossier-meeting-game__team">{teamKey}</span>
                <span className="dossier-meeting-game__picks">
                  {players.map((p) => (
                    <span
                      key={`${p.player_lp_page}-${p.champion_key}`}
                      className="dossier-meeting-game__pick"
                      title={`${p.player_lp_page ?? "—"} — ${p.champion_key ?? "—"}`}
                    >
                      {p.champion_key ? <ChampionIcon champion={p.champion_key} size="sm" /> : null}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="dossier-meeting-game__empty" data-testid="meeting-game-empty">
            No player rows are recorded for this game.
          </p>
        )}
      </button>
      {selected ? (
        <GameDossier matchId={matchId} gameNumber={game.game_number} scopeId={scopeId} />
      ) : null}
    </li>
  );
}

export function MeetingShell({
  selection,
  scopeId,
  scopeLabel,
  onClose,
  onSelectGame,
}: {
  selection: MeetingSelection | null;
  scopeId: string;
  scopeLabel: string;
  onClose: () => void;
  /** STEP 5. Sets `game_number` INSIDE the open meeting — never a state of
   *  its own, which is why nothing can strand a game without a meeting. */
  onSelectGame: (gameNumber: number | null) => void;
}) {
  const [payload, setPayload] = useState<MeetingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const matchId = selection?.match_id ?? null;

  useEffect(() => {
    if (!matchId) {
      setPayload(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchMeeting(matchId, scopeId, controller.signal)
      .then((next) => {
        setPayload(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPayload(null);
        setError(
          err instanceof MatchupApiError ? err.message : "This meeting could not be read.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [matchId, scopeId]);

  if (!selection) return null;

  return (
    <DossierSection
      title="Meeting"
      eyebrow={payload ? meetingKindLabel(payload.kind, payload.game_count) : "Loading"}
      testId="dossier-meeting-shell"
      actions={
        <button
          type="button"
          className="dossier-btn"
          data-testid="meeting-close"
          onClick={onClose}
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Close meeting
        </button>
      }
    >
      {loading ? <p data-testid="meeting-loading">Reading the meeting…</p> : null}
      {error ? (
        <Parchment>
          <p data-testid="meeting-error">{error}</p>
        </Parchment>
      ) : null}
      {payload ? (
        <>
          <div className="dossier-meeting-head" data-testid="meeting-head">
            <ScoreLine score={payload.score_line} />
            {payload.winner_team_key ? null : (
              <span className="dossier-meeting__undecided" data-testid="meeting-no-winner">
                {payload.undecided > 0 ? "Not every game is recorded" : "No winner"}
              </span>
            )}
            <span className="dossier-meeting__meta">
              {[
                payload.tournament_name ?? payload.tournament_id,
                meetingDate(payload.started_at),
                payload.patch ? `Patch ${payload.patch}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {/* THE SCOPE STAYS VISIBLE AS CONTEXT, and says plainly when the
                meeting sits outside it — rather than the scope silently
                narrowing a meeting the reader chose by name. */}
            <span className="dossier-meeting__scope" data-testid="meeting-scope">
              {payload.in_scope === false
                ? `Outside the selected scope (${scopeLabel})`
                : `Within ${scopeLabel}`}
            </span>
          </div>

          {/* STEP 9. Between the result and the games, because it is what a
              reader wants BEFORE choosing which game to open — and above the
              game list rather than instead of it: the games keep their own
              picks and their own way in to a box score. */}
          <MeetingLineups
            lineups={payload.lineups}
            kind={payload.kind}
            scoreLine={payload.score_line}
          />

          {/* ORDERED HERE, NOT TRUSTED FROM THE ARRAY. The server orders by
              `game_number` and the client asserts it again: a meeting drawn in
              the wrong order is a wrong meeting, and `(match_id, game_number)`
              is unique across all 113,815 canonical games, so this sort is
              total. Never the draft — `sequence` is -1 everywhere. */}
          <ul className="dossier-meeting-games" data-testid="meeting-games">
            {[...payload.games]
              .sort((a, b) => a.game_number - b.game_number)
              .map((game) => (
                <GameRow
                  key={game.canonical_game_id}
                  game={game}
                  kind={payload.kind}
                  matchId={payload.match_id}
                  scopeId={scopeId}
                  selected={selection.game_number === game.game_number}
                  onSelect={onSelectGame}
                />
              ))}
          </ul>

          {/* The server's own sentences for what is not here. Reworded in the
              client they would stop being the words the absence is guaranteed
              in. */}
          {payload.unavailable_metrics.map((metric) => (
            <FinePrint key={metric.metric} testId={`meeting-unavailable-${metric.metric}`}>
              {metric.reason}
            </FinePrint>
          ))}
        </>
      ) : null}
    </DossierSection>
  );
}
