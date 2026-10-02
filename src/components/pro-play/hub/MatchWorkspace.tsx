/**
 * The Match Workspace — the selected game's ten players as five mirrored lane
 * rows inside the Match Center board. Picking a row opens that lane in place:
 * both players' careers, the champion pair across pro play, and the study
 * destinations.
 *
 * WHAT IT IS ALLOWED TO SAY. Every surface here is an existing public system
 * keyed by identities the live feed already resolved:
 *
 * - the lane pair comes from the game's own `role` + `side`;
 * - the per-lane gold difference is the two players' own `total_gold`;
 * - each player's career line is `useEntityStats` — the Stats Explorer's own
 *   request, career across all competitions, with its scope on the line;
 * - the champion pair is GRAPH1's `/champion-matchup`, and the line under it
 *   says on screen that it is the broad professional sample and NOT these two
 *   players;
 * - the study links are the existing Combat Lab, Leaguecraft matchup study,
 *   Pro Data pair graph and Archives contracts.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No Matchup Explorer link: it is
 * admin-gated front and back, and a public reader would land on an auth wall.
 * No quiz: the Pro Play quiz API cannot filter by match. No head-to-head
 * record for the two PLAYERS: that is the Explorer's exact study, gated.
 *
 * Props-driven: the hub passes the game and its players.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, ChevronDown, FlaskConical, GraduationCap } from "lucide-react";

import { PlayerPortrait } from "@/components/pro-play/media/EntityCrest";
import { ItemStrip, useItemNames } from "@/components/pro-play/media/ItemIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { championMatchupHref, matchupPct } from "@/graph1/championMatchup";
import { useGraph1ChampionMatchup } from "@/graph1/useGraph1ChampionMatchup";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { buildCombatLabMatchupUrl } from "@/lib/combat-lab/matchup-link";
import { championSlug } from "@/lib/league-docs/api";
import { championDocPath } from "@/lib/league-docs/seo";
import type { LiveGameSummary, LivePlayer } from "@/lib/live-esports/api";
import { statsExplorerUrl, statsScopeLabel, useEntityStats } from "@/lib/pro-play/entityStats";
import { graphEntityId, graphUrl } from "@/lib/pro-play/graphHandoff";
import {
  HUB_LANE_LABEL,
  HUB_LANE_SHORT,
  laneGoldDiff,
  laneMatchups,
  lanePlayerKey,
  lanePlayerName,
  laneRowName,
  laneRowShortName,
  signedKGold,
  type HubLane,
  type LaneMatchup,
} from "@/lib/pro-play/hubSelection";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import type { ProStatsPlayerRow } from "@/lib/pro-play/statsApi";
import { matchupStudyHref } from "@/lib/quiz/matchupApi";
import { cn } from "@/lib/utils";
import { ChampionIcon } from "@/pages/esports/live/components";
import { kgold, num } from "@/pages/esports/live/lib";

type Side = "blue" | "red";

const PCT = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

/** Text links in the expansion. Full 44px tap height on touch layouts. */
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 font-medium text-foreground/85 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0";

/* ── one lane row ───────────────────────────────────────────────────────── */

function ChampionWithLevel({
  player,
  manifest,
}: {
  player: LivePlayer;
  manifest: ChampionManifest | null | undefined;
}) {
  return (
    <span className="relative shrink-0">
      <ChampionIcon
        championId={player.champion_id}
        championName={player.resolved_champion_name}
        manifest={manifest}
        className="h-10 w-10 rounded-md sm:h-11 sm:w-11"
      />
      {player.level != null && (
        <span
          className="absolute -bottom-1 -right-1 min-w-[1.05rem] rounded-full border border-border bg-background px-0.5 text-center text-[9px] font-bold leading-[0.95rem] tabular-nums text-foreground/90"
          title={`Level ${player.level}`}
        >
          {player.level}
        </span>
      )}
    </span>
  );
}

/**
 * One side of a lane row: player → champion, mirrored on red so the two
 * champions meet in the middle. On tablet and desktop the second line under
 * the name is the player's inventory; on a phone it is CS · gold and the
 * inventory moves into the lane's expansion, so the row keeps its height.
 */
function RowSide({
  player,
  side,
  teamCode,
  manifest,
  itemNames,
}: {
  player: LivePlayer;
  side: Side;
  teamCode: string | null | undefined;
  manifest: ChampionManifest | null | undefined;
  itemNames: Map<number, string>;
}) {
  const red = side === "red";
  const kda = `${num(player.kills)}/${num(player.deaths)}/${num(player.assists)}`;
  const csGold = `${num(player.creep_score)} CS · ${kgold(player.total_gold)}`;
  const name = laneRowShortName(player, teamCode);
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 sm:gap-2",
        red && "flex-row-reverse text-right",
      )}
    >
      <PlayerPortrait
        playerKey={lanePlayerKey(player)}
        name={name}
        size="sm"
        artOnly
        className="hidden sm:inline-flex"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground sm:text-[15px]" title={lanePlayerName(player)}>
          {name}
        </span>
        <span className="block text-sm font-bold tabular-nums text-foreground/90 sm:hidden">{kda}</span>
        <span className="block truncate text-xs tabular-nums text-muted-foreground sm:hidden">{csGold}</span>
        <ItemStrip
          items={player.items}
          names={itemNames}
          size="2xs"
          mirrored={red}
          className="mt-1 hidden sm:inline-flex"
        />
      </span>
      <span className={cn("hidden shrink-0 sm:block", red ? "text-left" : "text-right")} title={csGold}>
        <span className="block text-base font-bold leading-tight tabular-nums text-foreground/90">{kda}</span>
        <span className="block whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{kgold(player.total_gold)}</span>
      </span>
      <ChampionWithLevel player={player} manifest={manifest} />
    </span>
  );
}

function LaneRow({
  matchup,
  active,
  onPick,
  manifest,
  panelId,
  codes,
  itemNames,
}: {
  codes: { blue: string | null | undefined; red: string | null | undefined };
  itemNames: Map<number, string>;
  matchup: LaneMatchup;
  active: boolean;
  onPick: () => void;
  manifest: ChampionManifest | null | undefined;
  panelId: string;
}) {
  const diff = laneGoldDiff(matchup);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-expanded={active}
      aria-controls={active ? panelId : undefined}
      data-testid={`lane-row-${matchup.lane}`}
      className={cn(
        "relative grid w-full grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-1 rounded-lg border px-1.5 py-2 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-3 sm:px-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // A thin side stripe at each end: the only team colour on the row.
        "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r before:bg-sky-500/70",
        "after:absolute after:inset-y-2 after:right-0 after:w-0.5 after:rounded-l after:bg-rose-500/70",
        active
          ? "border-[#c9a84c]/45 bg-[#c9a84c]/[0.06]"
          : "border-transparent hover:bg-muted/30",
      )}
    >
      <RowSide player={matchup.blue} side="blue" teamCode={codes.blue} manifest={manifest} itemNames={itemNames} />
      <span className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-[0.1em]",
            active ? "text-[#e3c66f]" : "text-muted-foreground",
          )}
        >
          <span className="sm:hidden" aria-hidden="true">{HUB_LANE_SHORT[matchup.lane]}</span>
          <span className="sr-only sm:not-sr-only">{HUB_LANE_LABEL[matchup.lane]}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn("h-3.5 w-3.5 transition-transform", active && "rotate-180")}
          />
        </span>
        {diff != null && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              diff > 0 ? "text-sky-300" : diff < 0 ? "text-rose-300" : "text-muted-foreground",
            )}
            title="Gold difference between the two players in this game (blue minus red)"
          >
            {signedKGold(diff)}
          </span>
        )}
      </span>
      <RowSide player={matchup.red} side="red" teamCode={codes.red} manifest={manifest} itemNames={itemNames} />
    </button>
  );
}

/* ── the expansion ──────────────────────────────────────────────────────── */

function CareerLine({ playerKey }: { playerKey: string }) {
  const stats = useEntityStats("players", playerKey);
  if (stats.status === "loading") return <Skeleton className="h-4 w-40" />;
  if (stats.status === "error")
    return <p className="text-xs text-muted-foreground">Career statistics are unavailable right now.</p>;
  if (stats.status === "absent")
    return <p className="text-xs text-muted-foreground">No games in the Pro Play statistics yet.</p>;
  const row = stats.row as ProStatsPlayerRow;
  const scope = statsScopeLabel(stats.response);
  return (
    <p className="text-xs text-muted-foreground" data-testid="career-line" title={`Career · ${scope}`}>
      <span data-testid="career-scope">Career</span>{" "}
      <span className="font-semibold tabular-nums text-foreground/90">
        {num(row.games)} games · {num(row.wins)}–{num(row.losses)} · {PCT(row.win_rate)} · KDA{" "}
        {row.kda == null ? "—" : row.kda.toFixed(2)}
      </span>
    </p>
  );
}

function LanePlayer({
  player,
  side,
  itemNames,
}: {
  player: LivePlayer;
  side: Side;
  itemNames: Map<number, string>;
}) {
  const key = lanePlayerKey(player);
  const name = lanePlayerName(player);
  const red = side === "red";
  return (
    <div className={cn("min-w-0 space-y-0.5", red && "text-right")} data-testid={`lane-player-${side}`}>
      <p className={cn("flex items-center gap-2 text-sm font-bold", red && "flex-row-reverse")}>
        {/* Phones only: the row itself has no room for the face or the items. */}
        <PlayerPortrait playerKey={key} name={name} size="sm" artOnly className="sm:hidden" />
        <span className="min-w-0 truncate" title={key ? name : "Not matched to a Pro Play profile"}>
          {name}
        </span>
        <span className="hidden shrink-0 text-xs font-medium tabular-nums text-muted-foreground sm:inline">
          {num(player.creep_score)} CS
        </span>
      </p>
      <ItemStrip
        items={player.items}
        names={itemNames}
        size="sm"
        mirrored={red}
        className="flex-wrap sm:hidden"
      />
      {key ? (
        <>
          <CareerLine playerKey={key} />
          <p className={cn("flex flex-wrap gap-x-3 text-xs", red && "justify-end")}>
            <Link to={proPlayProfileUrl("player", key)} className={TEXT_LINK}>
              Profile
            </Link>
            <Link
              to={graphUrl("player", "champions", graphEntityId("player", key))}
              className={TEXT_LINK}
              title="Race this player's champions in Pro Data"
            >
              Champion graph
            </Link>
            <Link to={statsExplorerUrl("players", key)} className={TEXT_LINK} title="This player as a row in the Pro Stats table">
              Stats row
            </Link>
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not matched to a Pro Play profile — no career record.
        </p>
      )}
    </div>
  );
}

function ChampionPair({ blue, red }: { blue: string; red: string }) {
  const subject = championSlug(blue);
  const opponent = championSlug(red);
  const same = subject === opponent;
  const pair = useGraph1ChampionMatchup(subject, opponent, undefined, { enabled: !same });

  const names = (
    <p className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      <Link to={proPlayProfileUrl("champion", blue)} className="inline-flex min-h-11 items-center hover:text-foreground hover:underline sm:min-h-0" title={`${blue} in pro play`}>
        {blue}
      </Link>{" "}
      vs{" "}
      <Link to={proPlayProfileUrl("champion", red)} className="inline-flex min-h-11 items-center hover:text-foreground hover:underline sm:min-h-0" title={`${red} in pro play`}>
        {red}
      </Link>
    </p>
  );

  let body: React.ReactNode;
  if (same) {
    body = <p className="text-xs text-muted-foreground">Both sides played {blue}: no champion matchup to compare.</p>;
  } else if (pair.isLoading) {
    body = <Skeleton className="mx-auto h-10 w-40" data-testid="pair-loading" />;
  } else if (pair.isError || !pair.data) {
    body = <p className="text-xs text-muted-foreground">The professional record couldn't be loaded right now.</p>;
  } else if (pair.data.games === 0) {
    body = <p className="text-xs text-muted-foreground">No professional games between these champions yet.</p>;
  } else {
    const d = pair.data;
    const rate = d.record.winRate ?? 0;
    body = (
      <>
        <p className="text-2xl font-bold leading-none tabular-nums">
          <span className="text-sky-300">{d.record.wins}</span>
          <span className="px-1 text-muted-foreground/50">–</span>
          <span className="text-rose-300">{d.record.losses}</span>
        </p>
        <div className="mx-auto mt-1.5 flex h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-rose-400/70" aria-hidden="true">
          <span className="bg-sky-400" style={{ width: `${Math.round(rate * 1000) / 10}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {num(d.games)} games · {blue} {matchupPct(d.record.winRate)}
          {d.byYear.length > 0 && (
            <span className="hidden sm:inline">
              {" · "}
              {d.byYear.slice(-2).map((y) => `${y.year}: ${y.games}`).join(", ")}
            </span>
          )}
        </p>
      </>
    );
  }
  return (
    <div className="min-w-0 text-center" data-testid="champion-matchup">
      {names}
      <div className="sm:mt-1">{body}</div>
    </div>
  );
}

function StudyLinks({ blue, red }: { blue: string; red: string }) {
  const a = championSlug(blue);
  const b = championSlug(red);
  const items = [
    { to: buildCombatLabMatchupUrl({ attacker: blue, defender: red }), label: "Combat Lab", title: `Simulate ${blue} against ${red}`, Icon: FlaskConical },
    { to: matchupStudyHref(a, b), label: "Matchup study", title: "Leaguecraft questions on this champion pair", Icon: GraduationCap },
    { to: championMatchupHref(a, b), label: "Pro Data pair graph", title: "The full pair graph", Icon: BarChart3 },
  ];
  return (
    <nav aria-label="Study this lane" className="flex flex-wrap items-center justify-center gap-x-3 text-xs sm:gap-x-4">
      {items.map(({ to, label, title, Icon }) => (
        <Link key={label} to={to} title={title} className={TEXT_LINK}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {label}
        </Link>
      ))}
      <span className="inline-flex items-center gap-x-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Archives:
        </span>
        {[blue, red].map((name) => (
          <Link key={name} to={championDocPath(championSlug(name))} className={TEXT_LINK}>
            {name}
          </Link>
        ))}
      </span>
    </nav>
  );
}

function LaneDetail({
  matchup,
  id,
  itemNames,
}: {
  matchup: LaneMatchup;
  id: string;
  itemNames: Map<number, string>;
}) {
  const blueChamp = matchup.blue.resolved_champion_name;
  const redChamp = matchup.red.resolved_champion_name;
  return (
    <div id={id} className="space-y-2 px-3 pb-3 pt-2 sm:px-4" data-testid="lane-matchup">
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_minmax(0,1fr)]">
        <LanePlayer player={matchup.blue} side="blue" itemNames={itemNames} />
        <div className="order-first col-span-2 sm:order-none sm:col-span-1">
          {blueChamp && redChamp ? (
            <ChampionPair blue={blueChamp} red={redChamp} />
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              A champion in this lane wasn&apos;t identified, so there is no champion matchup to look up.
            </p>
          )}
        </div>
        <LanePlayer player={matchup.red} side="red" itemNames={itemNames} />
      </div>
      {blueChamp && redChamp && (
        <>
          <p className="text-center text-[11px] text-muted-foreground">
            Record: every pro game with these champions on opposing teams — not a specific pair of players.
          </p>
          <div className="flex justify-center border-t border-border/50 pt-1">
            <StudyLinks blue={blueChamp} red={redChamp} />
          </div>
        </>
      )}
    </div>
  );
}

/* ── the board ──────────────────────────────────────────────────────────── */

export default function MatchWorkspace({
  game,
  players,
  loading,
  failed,
  manifest,
}: {
  game: LiveGameSummary;
  players: LivePlayer[] | null | undefined;
  loading: boolean;
  failed: boolean;
  manifest: ChampionManifest | null | undefined;
}) {
  const lanes = useMemo(() => laneMatchups(players), [players]);
  const itemNames = useItemNames();
  const [lane, setLane] = useState<HubLane | null>(null);

  // A new game starts on its first lane; a lane the new game cannot offer is
  // never carried over from the old one.
  useEffect(() => setLane(null), [game.game_id]);
  const current = lanes.find((l) => l.lane === lane) ?? lanes[0] ?? null;

  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton className="h-72 w-full" data-testid="workspace-loading" />;
  } else if (failed || !players?.length) {
    body = (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No player data was published for this game, so there are no lanes to show.
      </p>
    );
  } else if (!current) {
    body = (
      <p className="p-6 text-center text-sm text-muted-foreground">
        This game's player roles weren't published, so its lanes can't be paired.
      </p>
    );
  } else {
    body = (
      <div role="group" aria-label="Choose a lane" className="space-y-0.5">
        {lanes.map((m) => {
          const active = m.lane === current.lane;
          const panelId = `lane-detail-${m.lane}`;
          return (
            <div key={m.lane}>
              <LaneRow
                matchup={m}
                active={active}
                onPick={() => setLane(m.lane)}
                manifest={manifest}
                panelId={panelId}
                codes={{ blue: game.teams.blue?.code, red: game.teams.red?.code }}
                itemNames={itemNames}
              />
              {active && <LaneDetail matchup={m} id={panelId} itemNames={itemNames} />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section id="match-workspace" aria-label="Lanes" className="px-1 py-2 sm:px-3">
      {body}
    </section>
  );
}
