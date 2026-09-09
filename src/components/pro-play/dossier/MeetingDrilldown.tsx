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
