/**
 * Step 5 — ONE game, and the ten-player box score that is the reason to open
 * it.
 *
 * THE TERMINAL LAYER, and still the same dossier. This renders INSIDE the
 * meeting shell, beneath the game row a reader clicked, so the meeting header
 * and its sibling games stay on screen. It is deliberately not a match page:
 * there is no route of its own, no back button of its own, and no second
 * router — the open game is one number inside the board's existing selection.
 *
 * UNAVAILABLE IS NOT ZERO, and this file never renders one as the other. A
 * game the corpus never enriched arrives with `stats_available: false` and
 * player rows whose `stats` is null; it prints the server's own sentence and
 * the identity it does have — the result, the players, the champions. A zeroed
 * box score would be indistinguishable from a real one.
 *
 * "PERFECT" IS EARNED, NOT INFERRED. `kda_ratio` is null only for deaths = 0,
 * and only ever inside a non-null `stats` object, so an empty slice can never
 * reach this file wearing a perfect game's clothes. A genuine 0/0/0 prints
 * `0 / 0 / 0` and `Perfect` because that is what it was.
 *
 * NO DRAFT ORDER. Bans are drawn as an unordered set of champions per side,
 * labelled as one, in the alphabetical order the server sorted them into
 * precisely so the layout cannot read as a sequence.
 *
 * RESPONSIVE BY SHAPE, NOT BY SHRINKING. A 7-column box score at 375px would
 * be seven unreadable columns or a horizontal scrollbar. The same rows render
 * as stacked cards below `sm`, with the same numbers under short labels.
 */

import { useEffect, useState } from "react";

import { DossierSection, FinePrint, Parchment } from "./DossierChrome";
import { ChampionIcon, PlayerPortrait, TeamCrest } from "./DossierMedia";
import { gameDuration, meetingDate } from "./MeetingDrilldown";
import {
  MatchupApiError,
  fetchGameDetail,
  type GameDetailPayload,
  type GamePlayer,
  type GameTeamRow,
} from "@/lib/pro-play/matchupApi";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * `63.2k` for a gold total, the exact number below 1000.
 *
 * THE SAME CONVENTION LIVE1's `kgold` ALREADY PRINTS, deliberately matched so
 * a reader who has seen a gold figure on the live match centre reads the same
 * shape here. It is re-stated rather than imported: `src/pages/esports/live`
 * is another workstream's page module, and Pro Play quietly depending on its
 * display choices would make one team's restyle the other's bug.
 */
export function compactGold(value: number | null | undefined): string {
  if (value == null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

/** Thousands separators, and an em dash for a value that is genuinely absent.
 *  A missing number must never print as `0`. */
export function statNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString();
}

/** `4 / 2 / 7`. The three components, always, and always directly — a ratio
 *  is a derived convenience and these are the facts. */
export function kdaLine(player: GamePlayer): string {
  const s = player.stats;
  if (!s) return "—";
  return [s.kills, s.deaths, s.assists].map((v) => (v == null ? "—" : v)).join(" / ");
}

/**
 * The ratio, or `Perfect`.
 *
 * NULL MEANS DEATHLESS HERE AND NOTHING ELSE. The server only ever puts
 * `kda_ratio` inside a stats object, and a game with no statistics has no
 * stats object at all — so the empty-slice trap (0/0/0 summing to a perfect
 * game) cannot be expressed in this shape. A player with no stats returns
 * null and the caller renders nothing.
 */
export function kdaRatioLabel(player: GamePlayer): string | null {
  const s = player.stats;
  if (!s) return null;
  if (s.deaths == null || s.kills == null || s.assists == null) return null;
  return s.kda_ratio == null ? "Perfect" : `${s.kda_ratio.toFixed(2)} KDA`;
}

// ---------------------------------------------------------------------------
// Team objective comparison
// ---------------------------------------------------------------------------

/** The metrics the objective table offers, in reading order.
 *
 *  EVERY ONE IS A TRUSTWORTHY STORED FACT. `turret_plates` is not in this list
 *  and never arrives in the payload — its stored values exceed their own
 *  structural ceiling. A metric that is null on BOTH teams is dropped from the
 *  table entirely rather than printed as a row of dashes. */
const OBJECTIVE_ROWS: Array<{ key: string; label: string; gold?: boolean }> = [
  { key: "team_kills", label: "Kills" },
  { key: "total_gold", label: "Gold", gold: true },
  { key: "towers", label: "Towers" },
  { key: "inhibitors", label: "Inhibitors" },
  { key: "dragons", label: "Dragons" },
  { key: "barons", label: "Barons" },
  { key: "heralds", label: "Heralds" },
  { key: "void_grubs", label: "Void grubs" },
  { key: "atakhans", label: "Atakhans" },
  { key: "vision_score", label: "Vision" },
];

export function ObjectiveTable({ teams }: { teams: GameTeamRow[] }) {
  if (teams.length !== 2) return null;
  const [left, right] = teams;
  const rows = OBJECTIVE_ROWS.filter(
    // Absent on both sides is not a comparison; it is a metric this game did
    // not record, and a row of dashes would only take up space saying so.
    (row) => left.objectives[row.key] != null || right.objectives[row.key] != null,
  );
  if (!rows.length) return null;

  return (
    <table className="dossier-game-objectives" data-testid="game-objectives">
      <caption className="sr-only">Team objectives</caption>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col" className="text-right">{left.team_key}</th>
          <th scope="col" className="text-right">{right.team_key}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const format = row.gold ? compactGold : statNumber;
          return (
            <tr key={row.key} data-testid={`objective-${row.key}`}>
              <th scope="row">{row.label}</th>
              <td className="text-right tabular-nums">{format(left.objectives[row.key])}</td>
              <td className="text-right tabular-nums">{format(right.objectives[row.key])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// The box score
// ---------------------------------------------------------------------------

function PlayerRow({ player }: { player: GamePlayer }) {
  const s = player.stats;
  const ratio = kdaRatioLabel(player);
  const name = player.player_lp_page ?? "—";
  return (
    <tr
      className="dossier-game-player"
      data-testid="game-player"
      data-player={name}
      data-team={player.team_key ?? undefined}
    >
      {/* THE FLEX LIVES IN AN INNER SPAN, NOT ON THE CELL. `display: flex` on
          a `<th>`/`<td>` takes it out of table layout and the column stops
          aligning with the header above it — which is exactly what the first
          pass of this table did. */}
      <th scope="row" className="dossier-game-player__who">
        <span className="dossier-game-player__who-inner">
          <PlayerPortrait name={name} entityKey={player.player_lp_page} size="sm" />
          <span className="dossier-game-player__names">
            <span className="dossier-game-player__name">{name}</span>
            <span className="dossier-game-player__role">{player.role ?? "—"}</span>
          </span>
        </span>
      </th>
      <td className="dossier-game-player__champion">
        <span className="dossier-game-player__champion-inner">
          {player.champion_key ? (
            <>
              <ChampionIcon champion={player.champion_key} size="sm" />
              <span className="dossier-game-player__champion-name">{player.champion_key}</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </td>
      {/* `data-label` IS THE MOBILE HEADER. Below 640px the thead is removed
          from view and each cell prints its own column name from this
          attribute, so the seven facts read down the page instead of
          scrolling sideways. The header cells stay in the accessibility tree
          either way. */}
      <td className="text-right tabular-nums" data-label="K / D / A" data-testid="game-player-kda">
        <span className="dossier-game-player__kda">{kdaLine(player)}</span>
        {ratio ? (
          <span className="dossier-game-player__ratio" data-testid="game-player-ratio">
            {ratio}
          </span>
        ) : null}
      </td>
      <td className="text-right tabular-nums" data-label="CS">{statNumber(s?.total_cs)}</td>
      <td className="text-right tabular-nums" data-label="Gold">{compactGold(s?.total_gold)}</td>
      <td className="text-right tabular-nums" data-label="Damage">
        {statNumber(s?.damage_to_champions)}
      </td>
      <td className="text-right tabular-nums" data-label="Vision">
        {statNumber(s?.vision_score)}
      </td>
    </tr>
  );
}

function TeamBoxScore({
  team,
  players,
  winner,
}: {
  team: GameTeamRow | null;
  teamKey: string;
  displayName: string;
  players: GamePlayer[];
  winner: string | null;
}) {
  const key = players[0]?.team_key ?? team?.team_key ?? "—";
  const label = team?.display_name ?? players[0]?.display_name ?? key;
  const won = winner != null ? key === winner : null;
  return (
    <div className="dossier-game-side" data-testid="game-side" data-team={key} data-side={players[0]?.side ?? undefined}>
      <div className="dossier-game-side__head">
        <TeamCrest name={label} entityKey={key} size="sm" />
        <span className="dossier-game-side__name">{label}</span>
        <span className="dossier-game-side__side">{players[0]?.side ?? ""}</span>
        {/* THE CANONICAL RESULT. The statistics below it are Oracle's Elixir's
            and this word is Leaguepedia's, which is why it can never disagree
            with the meeting header above. */}
        {won == null ? null : (
          <span
            className="dossier-game-side__result"
            data-testid="game-side-result"
            data-won={won ? "true" : "false"}
          >
            {won ? "Victory" : "Defeat"}
          </span>
        )}
      </div>
      <table className="dossier-game-table">
        <caption className="sr-only">{`${label} box score`}</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Champion</th>
            <th scope="col" className="text-right">K / D / A</th>
            <th scope="col" className="text-right">CS</th>
            <th scope="col" className="text-right">Gold</th>
            <th scope="col" className="text-right">Damage</th>
            <th scope="col" className="text-right">Vision</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <PlayerRow key={`${player.player_lp_page}-${player.champion_key}`} player={player} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

function Bans({ payload }: { payload: GameDetailPayload }) {
  if (!payload.bans.length) return null;
  return (
    <div className="dossier-game-bans" data-testid="game-bans">
      <span className="dossier-game-bans__title">Bans</span>
      {payload.bans.map((entry) => (
        <div key={`${entry.team_key}-${entry.side}`} className="dossier-game-bans__side">
          <span className="dossier-game-bans__team">{entry.team_key ?? "—"}</span>
          <span className="dossier-game-bans__icons">
            {entry.champions.map((champion) => (
              <ChampionIcon key={champion} champion={champion} size="sm" muted />
            ))}
          </span>
        </div>
      ))}
      {/* THE SERVER'S OWN SENTENCE. Reworded here it would stop being the
          words the absence of an order is guaranteed in. */}
      <FinePrint testId="game-bans-note">{payload.bans_note}</FinePrint>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dossier
// ---------------------------------------------------------------------------

export function GameDossier({
  matchId,
  gameNumber,
  scopeId,
}: {
  matchId: string;
  gameNumber: number;
  scopeId: string;
}) {
  const [payload, setPayload] = useState<GameDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchGameDetail(matchId, gameNumber, scopeId, controller.signal)
      .then((next) => {
        setPayload(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPayload(null);
        setError(err instanceof MatchupApiError ? err.message : "This game could not be read.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [matchId, gameNumber, scopeId]);

  if (loading && !payload) {
    return <p data-testid="game-loading">Reading the game…</p>;
  }
  if (error) {
    return (
      <Parchment>
        <p data-testid="game-error">{error}</p>
      </Parchment>
    );
  }
  if (!payload) return null;

  // Grouped by the team each player's OWN ROW names, never by a roster — the
  // reason a substitute lands on the right side of the board.
  const bySide = new Map<string, GamePlayer[]>();
  for (const player of payload.players) {
    const key = player.team_key ?? "—";
    bySide.set(key, [...(bySide.get(key) ?? []), player]);
  }
  const teamRows = new Map(payload.teams.map((t) => [t.team_key, t]));
  // Blue first, so the two halves read in the order the game was drafted in.
  const order = [payload.blue_team?.team_key, payload.red_team?.team_key].filter(
    (key): key is string => Boolean(key) && bySide.has(key as string),
  );
  for (const key of bySide.keys()) if (!order.includes(key)) order.push(key);

  return (
    <div className="dossier-game" data-testid="game-dossier" data-game-number={payload.game_number}>
      <div className="dossier-game__head" data-testid="game-head">
        <span className="dossier-game__title">
          {payload.blue_team?.display_name ?? payload.blue_team?.team_key} vs{" "}
          {payload.red_team?.display_name ?? payload.red_team?.team_key}
        </span>
        <span className="dossier-game__meta">
          {[
            payload.tournament_name ?? payload.tournament_id,
            payload.meeting.game_count > 1 ? `Game ${payload.game_number}` : "Single game",
            payload.patch ? `Patch ${payload.patch}` : null,
            gameDuration(payload.duration_seconds) ?? "Duration not recorded",
            meetingDate(payload.game_date),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="dossier-game__result" data-testid="game-result">
          {payload.decided && payload.winner_team_key
            ? `${payload.winner_team_key} victory`
            : "Result not recorded"}
        </span>
      </div>

      {/* HONEST ABSENCE, IN THE SERVER'S WORDS. The identity above stays; only
          the numbers are missing, and the reader is told which. */}
      {payload.stats_available ? null : (
        <Parchment>
          <p data-testid="game-stats-unavailable">{payload.stats_note}</p>
        </Parchment>
      )}

      <div className="dossier-game__sides">
        {order.map((key) => (
          <TeamBoxScore
            key={key}
            team={teamRows.get(key) ?? null}
            teamKey={key}
            displayName={teamRows.get(key)?.display_name ?? key}
            players={bySide.get(key) ?? []}
            winner={payload.winner_team_key}
          />
        ))}
      </div>

      <ObjectiveTable teams={payload.teams} />
      <Bans payload={payload} />

      {payload.unavailable_metrics
        // The ban sentence is already printed beside the bans themselves.
        .filter((metric) => metric.metric !== "draft_order")
        .map((metric) => (
          <FinePrint key={metric.metric} testId={`game-unavailable-${metric.metric}`}>
            {metric.reason}
          </FinePrint>
        ))}
    </div>
  );
}

export { GameDossier as default };
