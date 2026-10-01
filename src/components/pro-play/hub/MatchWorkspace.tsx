/**
 * The Match Workspace — the selected game's ten players, one lane at a time.
 *
 * WHAT IT IS ALLOWED TO SAY. Every surface here is an existing public system
 * keyed by identities the live feed already resolved:
 *
 * - the lane pair comes from the game's own `role` + `side`;
 * - each player's career row is `useEntityStats` — the Stats Explorer's own
 *   request, career across all competitions, printed with its own scope;
 * - the champion pair is GRAPH1's `/champion-matchup` through the public
 *   `ChampionMatchupPanel`, which says on screen that it is the broad
 *   professional sample and NOT these two players;
 * - the study links are the existing Combat Lab, Leaguecraft matchup study,
 *   Pro Data pair graph and Archives contracts.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No Matchup Explorer link: it is
 * admin-gated front and back, and a public reader would land on an auth wall
 * (the team profile removed its link for the same reason). No quiz: the Pro
 * Play quiz API cannot filter by match, and a general quiz under a heading
 * about this game would be a claim it cannot keep. No head-to-head record for
 * the two PLAYERS: that is the Explorer's exact study, gated.
 *
 * Props-driven: the hub passes the game and its players.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BarChart3, BookOpen, FlaskConical, GraduationCap } from "lucide-react";

import ChampionMatchupPanel from "@/components/graph1/ChampionMatchupPanel";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { Skeleton } from "@/components/ui/skeleton";
import { championMatchupHref } from "@/graph1/championMatchup";
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
  laneMatchups,
  lanePlayerKey,
  lanePlayerName,
  type HubLane,
  type LaneMatchup,
} from "@/lib/pro-play/hubSelection";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import type { ProStatsPlayerRow } from "@/lib/pro-play/statsApi";
import { matchupStudyHref } from "@/lib/quiz/matchupApi";
import { cn } from "@/lib/utils";
import { ChampionIcon } from "@/pages/esports/live/components";
import { kgold, matchTitle, num, teamLabel } from "@/pages/esports/live/lib";

import HubSection from "./HubSection";

const PCT = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

/* ── small pieces ───────────────────────────────────────────────────────── */

function WorkspaceLink({
  to,
  children,
  title,
}: {
  to: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Link
      to={to}
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/40 px-2 py-1 text-xs font-medium text-foreground/90 transition-colors hover:border-[#c9a84c]/60 hover:text-[#e3c66f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title} className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/* ── one lane player ────────────────────────────────────────────────────── */

function CareerStats({ playerKey }: { playerKey: string }) {
  const stats = useEntityStats("players", playerKey);
  if (stats.status === "loading") return <Skeleton className="h-10 w-full" />;
  if (stats.status === "error")
    return <p className="text-xs text-muted-foreground">Career statistics are unavailable right now.</p>;
  if (stats.status === "absent")
    return <p className="text-xs text-muted-foreground">No games for this player in the Pro Play statistics yet.</p>;
  const row = stats.row as ProStatsPlayerRow;
  return (
    <div>
      <dl className="grid grid-cols-4 gap-2">
        <Stat label="Games" value={num(row.games)} title="Canonical games" />
        <Stat label="W–L" value={`${num(row.wins)}–${num(row.losses)}`} />
        <Stat label="Win %" value={PCT(row.win_rate)} />
        <Stat
          label="KDA"
          value={row.kda == null ? "—" : row.kda.toFixed(2)}
          title={`Over ${num(row.stat_backed_games)} games carrying statistics`}
        />
      </dl>
      <p className="mt-1 text-[10px] text-muted-foreground" data-testid="career-scope">
        Career · {statsScopeLabel(stats.response)}
      </p>
    </div>
  );
}

function LanePlayer({
  player,
  side,
  team,
  manifest,
}: {
  player: LivePlayer;
  side: "blue" | "red";
  team: LiveGameSummary["teams"]["blue"];
  manifest: ChampionManifest | null | undefined;
}) {
  const key = lanePlayerKey(player);
  const name = lanePlayerName(player);
  const champion = player.resolved_champion_name;
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card/60 p-3",
        side === "blue" ? "border-sky-500/25" : "border-rose-500/25",
      )}
      data-testid={`lane-player-${side}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-3 left-0 w-0.5 rounded-r",
          side === "blue" ? "bg-sky-500" : "bg-rose-500",
        )}
      />
      <div className="flex items-center gap-3">
        <ChampionIcon
          championId={player.champion_id}
          championName={champion}
          manifest={manifest}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {key ? (
              <Link
                to={proPlayProfileUrl("player", key)}
                className="truncate text-sm font-semibold hover:text-[#e3c66f] hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold" title="Not matched to a Pro Play profile">
                {name}
              </span>
            )}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {team?.code || teamLabel(team)}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {champion ?? "Champion unknown"}
            <span className="mx-1.5">·</span>
            <span className="tabular-nums">
              {num(player.kills)}/{num(player.deaths)}/{num(player.assists)}
            </span>
            <span className="mx-1.5">·</span>
            <span className="tabular-nums">{num(player.creep_score)} CS</span>
            <span className="mx-1.5">·</span>
            <span className="tabular-nums">{kgold(player.total_gold)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        {key ? (
          <CareerStats playerKey={key} />
        ) : (
          <p className="text-xs text-muted-foreground">
            This player isn't matched to a Pro Play profile, so there is no career
            record to show.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {key && (
          <>
            <WorkspaceLink to={proPlayProfileUrl("player", key)}>Profile</WorkspaceLink>
            <WorkspaceLink
              to={graphUrl("player", "champions", graphEntityId("player", key))}
              title="Race this player's champions in Pro Data"
            >
              Champion graph
            </WorkspaceLink>
            <WorkspaceLink
              to={statsExplorerUrl("players", key)}
              title="This player as a row in the Pro Stats table"
            >
              Stats row
            </WorkspaceLink>
          </>
        )}
        {champion && (
          <WorkspaceLink to={proPlayProfileUrl("champion", champion)} title={`${champion} in pro play`}>
            {champion} in pro play
          </WorkspaceLink>
        )}
      </div>
    </div>
  );
}

/* ── the champion pair ──────────────────────────────────────────────────── */

function ChampionPair({ blue, red }: { blue: string; red: string }) {
  const subject = championSlug(blue);
  const opponent = championSlug(red);
  const same = subject === opponent;
  const pair = useGraph1ChampionMatchup(subject, opponent, undefined, { enabled: !same });

  if (same) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
        Both sides played {blue} in this lane, so there is no champion matchup to compare.
      </p>
    );
  }
  if (pair.isLoading) return <Skeleton className="h-48 w-full" data-testid="pair-loading" />;
  if (pair.isError || !pair.data) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
        The professional record for {blue} vs {red} couldn't be loaded right now.
      </p>
    );
  }
  return <ChampionMatchupPanel data={pair.data} />;
}

function StudyLinks({ blue, red }: { blue: string; red: string }) {
  const a = championSlug(blue);
  const b = championSlug(red);
  const items = [
    {
      to: buildCombatLabMatchupUrl({ attacker: blue, defender: red }),
      label: "Combat Lab",
      hint: `Simulate ${blue} against ${red}`,
      Icon: FlaskConical,
    },
    {
      to: matchupStudyHref(a, b),
      label: "Matchup study",
      hint: "Leaguecraft questions on this champion pair",
      Icon: GraduationCap,
    },
    {
      to: championMatchupHref(a, b),
      label: "Pro Data",
      hint: "The full pair graph",
      Icon: BarChart3,
    },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Study this lane
      </p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {items.map(({ to, label, hint, Icon }) => (
          <Link
            key={label}
            to={to}
            className="group flex items-start gap-2 rounded-lg border border-border/70 bg-background/40 p-2.5 transition-colors hover:border-[#c9a84c]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium">
                {label}
                <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </span>
              <span className="block text-[11px] text-muted-foreground">{hint}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5 text-[#c9a84c]" aria-hidden="true" />
        <span>Archives:</span>
        {[blue, red].map((name) => (
          <WorkspaceLink key={name} to={championDocPath(championSlug(name))}>
            {name}
          </WorkspaceLink>
        ))}
      </div>
    </div>
  );
}

/* ── lane picker + body ─────────────────────────────────────────────────── */

function LanePicker({
  lanes,
  value,
  onChange,
  manifest,
}: {
  lanes: LaneMatchup[];
  value: HubLane;
  onChange: (lane: HubLane) => void;
  manifest: ChampionManifest | null | undefined;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-color:rgba(201,168,76,0.35)_transparent] [scrollbar-width:thin]" role="group" aria-label="Choose a lane">
      {lanes.map(({ lane, blue, red }) => {
        const active = lane === value;
        return (
          <button
            key={lane}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(lane)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-[#c9a84c]/70 bg-[#c9a84c]/10 text-[#e3c66f]"
                : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="scale-75">
              <ChampionIcon championId={blue.champion_id} championName={blue.resolved_champion_name} manifest={manifest} />
            </span>
            {HUB_LANE_LABEL[lane]}
            <span className="scale-75">
              <ChampionIcon championId={red.champion_id} championName={red.resolved_champion_name} manifest={manifest} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  const [lane, setLane] = useState<HubLane | null>(null);

  // A new game starts on its first lane; a lane the new game cannot offer is
  // never carried over from the old one.
  useEffect(() => setLane(null), [game.game_id]);
  const current = lanes.find((l) => l.lane === lane) ?? lanes[0] ?? null;

  const teams = (["blue", "red"] as const).map((side) => ({ side, team: game.teams[side] }));

  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton className="h-64 w-full" data-testid="workspace-loading" />;
  } else if (failed || !players?.length) {
    body = (
      <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
        No player data was published for this game, so there are no lanes to study.
      </p>
    );
  } else if (!current) {
    body = (
      <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
        This game's player roles weren't published, so its lanes can't be paired.
      </p>
    );
  } else {
    const blueChamp = current.blue.resolved_champion_name;
    const redChamp = current.red.resolved_champion_name;
    body = (
      <div className="space-y-4">
        <LanePicker lanes={lanes} value={current.lane} onChange={setLane} manifest={manifest} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* The lane itself stays in view while the reader works down the
              longer evidence column beside it. */}
          <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {HUB_LANE_LABEL[current.lane]} lane · this game
            </p>
            <LanePlayer player={current.blue} side="blue" team={game.teams.blue} manifest={manifest} />
            <LanePlayer player={current.red} side="red" team={game.teams.red} manifest={manifest} />
            {blueChamp && redChamp && <StudyLinks blue={blueChamp} red={redChamp} />}
          </div>
          <div className="space-y-3" data-testid="lane-matchup">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {blueChamp && redChamp
                ? `${blueChamp} vs ${redChamp} · across pro play`
                : "Champion matchup"}
            </p>
            {blueChamp && redChamp ? (
              <ChampionPair blue={blueChamp} red={redChamp} />
            ) : (
              <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                A champion in this lane wasn&apos;t identified, so there is no champion
                matchup to look up.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <HubSection
      id="match-workspace"
      kicker="Match Workspace"
      title="Lane by lane"
      description={`The ten players in ${matchTitle(game)} — pick a lane to see who was in it, their pro careers, and how the champion matchup goes across professional play.`}
      action={teams.map(({ side, team }) =>
        team?.resolved_page ? (
          <Link
            key={side}
            to={proPlayProfileUrl("team", team.resolved_page)}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-[#c9a84c]/60"
          >
            <TeamCrest teamKey={team.resolved_page} name={teamLabel(team)} shortCode={team.code} size="xs" />
            {teamLabel(team)} profile
          </Link>
        ) : null,
      )}
    >
      {body}
    </HubSection>
  );
}
