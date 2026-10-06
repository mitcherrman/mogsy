/**
 * The Match Workspace — the selected game's ten players as five mirrored lane
 * rows inside the Match Center board. Picking a row opens that lane in place.
 *
 * THIS GAME ONLY (PP-IA2). The board answers "what happened in this game?",
 * so every number in a row or its expansion is this game's, from this game's
 * own feed: player, champion, role, K/D/A, CS, gold, level, items, runes,
 * kill participation, damage share, wards, and the lane's gold difference.
 *
 * What used to sit in the expansion and does NOT any more — each a different
 * population that read as part of the game:
 *
 * - the players' CAREER lines (every competition, every year, frozen at the
 *   canonical corpus's last refresh, excluding this game);
 * - the all-time CHAMPION-PAIR record ("Jax vs Gnar 122–125": any role, any
 *   player, 2014 → July 2026, excluding this game) — the expansion's most
 *   prominent number, and not about this game at all.
 *
 * Those systems are unchanged and one click away under GO DEEPER, a labelled
 * scope change: each destination says which population it opens (player
 * profile, champion profile, the historical pair graph, Combat Lab, matchup
 * study, champion reference). No historical number is drawn on the board.
 *
 * No Matchup Explorer link: it is admin-gated front and back, and a public
 * reader would land on an auth wall. No quiz: the Pro Play quiz API cannot
 * filter by match.
 *
 * Props-driven: the hub passes the game and its players.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, ChevronDown, FlaskConical, GraduationCap, User } from "lucide-react";

import { PlayerPortrait } from "@/components/pro-play/media/EntityCrest";
import { ItemStrip, useItemNames } from "@/components/pro-play/media/ItemIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { championMatchupHref } from "@/graph1/championMatchup";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { buildCombatLabMatchupUrl } from "@/lib/combat-lab/matchup-link";
import { championSlug } from "@/lib/league-docs/api";
import { championDocPath } from "@/lib/league-docs/seo";
import type { LiveGameSummary, LivePlayer } from "@/lib/live-esports/api";
import { runeLine, runeSummary } from "@/lib/live-esports/gameTruth";
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
import { matchupStudyHref } from "@/lib/quiz/matchupApi";
import { cn } from "@/lib/utils";
import { ChampionIcon, RuneIcon } from "@/pages/esports/live/components";
import { kgold, num, pct } from "@/pages/esports/live/lib";

type Side = "blue" | "red";

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
        <span className="block whitespace-nowrap text-[11px] tabular-nums text-muted-foreground" data-testid="row-cs-gold">
          {num(player.creep_score)} CS · {kgold(player.total_gold)}
        </span>
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

/** This game's rune page, keystone first — or nothing when the feed sent none. */
function PlayerRunes({ player, red }: { player: LivePlayer; red: boolean }) {
  const runes = runeSummary(player.runes);
  if (!runes) return null;
  return (
    <p
      className={cn("flex items-center gap-1.5 text-xs text-foreground/85", red && "flex-row-reverse")}
      data-testid="lane-runes"
      title={[runeLine(runes), ...runes.minors.map((r) => r.name)].join(" · ")}
    >
      {runes.keystone && <RuneIcon icon={runes.keystone.icon} name={runes.keystone.name} className="h-4 w-4" />}
      <span className="min-w-0 truncate">{runeLine(runes)}</span>
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
      <PlayerRunes player={player} red={red} />
      {/* This game's share of the team's kills and champion damage, and its
          wards — all from this game's own details frame. */}
      <p className="text-xs tabular-nums text-muted-foreground" data-testid="lane-game-stats">
        KP {pct(player.kill_participation)} · Dmg {pct(player.champion_damage_share)} · Wards{" "}
        {num(player.wards_placed)}
      </p>
    </div>
  );
}

/* ── go deeper: a labelled change of scope ──────────────────────────────── */

/** The population a destination opens, printed beside it. */
function ScopeChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded border border-border/60 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      data-testid="scope-chip"
    >
      {children}
    </span>
  );
}

type DeeperLink = { to: string; label: string; scope: string; title: string; Icon: React.ElementType };

/**
 * Every way out of this game into a WIDER population, under a heading that
 * says so. Each link names what it opens; none draws a historical number here.
 */
function GoDeeper({ matchup }: { matchup: LaneMatchup }) {
  const blueChamp = matchup.blue.resolved_champion_name;
  const redChamp = matchup.red.resolved_champion_name;
  const links: DeeperLink[] = [];
  for (const p of [matchup.blue, matchup.red]) {
    const key = lanePlayerKey(p);
    if (key) {
      links.push({
        to: proPlayProfileUrl("player", key),
        label: `${lanePlayerName(p)} profile`,
        scope: "Career",
        title: `${lanePlayerName(p)} across pro play — not only this game`,
        Icon: User,
      });
    }
  }
  if (blueChamp && redChamp && championSlug(blueChamp) !== championSlug(redChamp)) {
    const a = championSlug(blueChamp);
    const b = championSlug(redChamp);
    links.push(
      {
        to: championMatchupHref(a, b),
        label: `${blueChamp} vs ${redChamp} in pro play`,
        scope: "Historical · any role",
        title: "Every pro game with these champions on opposing teams, all years — not these players, not this game",
        Icon: BarChart3,
      },
      {
        to: buildCombatLabMatchupUrl({ attacker: blueChamp, defender: redChamp }),
        label: "Combat Lab",
        scope: "Simulation",
        title: `Simulate ${blueChamp} against ${redChamp}`,
        Icon: FlaskConical,
      },
      {
        to: matchupStudyHref(a, b),
        label: "Matchup study",
        scope: "Study",
        title: "Leaguecraft questions on this champion pair",
        Icon: GraduationCap,
      },
    );
  }
  for (const name of [blueChamp, redChamp]) {
    if (!name) continue;
    links.push(
      {
        to: proPlayProfileUrl("champion", name),
        label: `${name} in pro play`,
        scope: "All pro games",
        title: `${name}'s pro record — every game, not this one`,
        Icon: BarChart3,
      },
      {
        to: championDocPath(championSlug(name)),
        label: `${name} reference`,
        scope: "Game data",
        title: `${name}'s abilities and stats`,
        Icon: BookOpen,
      },
    );
  }
  if (!links.length) return null;
  return (
    <nav aria-labelledby="lane-go-deeper" className="border-t border-border/50 pt-2" data-testid="go-deeper">
      <p id="lane-go-deeper" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c9a84c]">
        Go deeper <span className="normal-case tracking-normal text-muted-foreground">— beyond this game</span>
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        {links.map(({ to, label, scope, title, Icon }) => (
          <li key={`${label}-${to}`}>
            <Link to={to} title={title} className={TEXT_LINK}>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {label}
              <ScopeChip>{scope}</ScopeChip>
            </Link>
          </li>
        ))}
      </ul>
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
  return (
    <div id={id} className="space-y-2 px-3 pb-3 pt-2 sm:px-4" data-testid="lane-matchup">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">This game</p>
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2">
        <LanePlayer player={matchup.blue} side="blue" itemNames={itemNames} />
        <LanePlayer player={matchup.red} side="red" itemNames={itemNames} />
      </div>
      <GoDeeper matchup={matchup} />
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
