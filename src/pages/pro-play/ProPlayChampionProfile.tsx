// ---------------------------------------------------------------------------
// /lol/pro-play/champion/:key — THE canonical competitive Champion profile.
//
// THREE CHAMPION SURFACES, THREE JOBS. This one is the primary competitive
// identity page. The other two are deliberately NOT merged into it:
//
//   /lol/docs/champions/:slug      abilities, ratios, base stats — a
//                                  different authority, different owner.
//   /lol/docs/pro/champions/:slug  the REFERENCE/ARCHIVE surface: imported
//                                  rows by year, import status, scoped stats,
//                                  recent games WITH SOURCE URLS, data-quality
//                                  caveats.
//
// WHY THE DOCS YEARLY TABLE IS NOT COPIED HERE, THOUGH IT IS THE RICHEST
// THING ON EITHER PAGE. It is drawn from a DIFFERENT CORPUS
// (`esports_champion_yearly_stats`, the Leaguepedia broad import, 2.53M game
// rows) than everything else on this page (`pro_canonical_*`, 1.08M rows),
// and the two disagree materially — Azir 2016 reads 902 picks there and 807
// here; 2015, 486 against 431. Both are right in their own terms. Putting
// them in one page would print two contradicting pick counts under one
// heading, which is a worse version of the duplication this consolidation
// exists to end. The competitive history here therefore comes from the
// canonical draft record, and the import history stays in Docs behind a
// named link.
//
// PICK RATE, BAN RATE AND PRESENCE SHARE ONE DENOMINATOR — every canonical
// game in the scope — so they are comparable. They are not summed: a game
// where the champion was picked is not also a game where it was banned.
//
// PICK RATE, BAN RATE AND PRESENCE SHARE ONE DENOMINATOR — every canonical
// game in the scope — so they are comparable. They are not summed: a game
// where the champion was picked is not also a game where it was banned.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRow,
  EntityTable,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  PerformancePanel,
  ProfileAction,
  ProfileHeader,
  ResearchBreadcrumb,
  ResearchPage,
  ScopeTabs,
  TableScroll,
  type PerformanceMetric,
} from "@/components/pro-play/ResearchShell";
import { useQuery } from "@tanstack/react-query";
import { championSlug } from "@/lib/league-docs/api";
import { buildProChampionUrl } from "@/lib/league-docs/pro-data-links";
import {
  statsExplorerUrl,
  statsScopeLabel,
  useEntityStats,
} from "@/lib/pro-play/entityStats";
import { graphEntityId, graphUrl } from "@/lib/pro-play/graphHandoff";
import { getProStatsFilterOptions, type ProStatsChampionRow } from "@/lib/pro-play/statsApi";
import {
  fetchChampionProfile,
  formatRate,
  formatRecord,
  notFoundMessage,
  ResearchApiError,
  type ChampionProfile,
} from "@/lib/pro-play/researchApi";

// ---------------------------------------------------------------------------
// Competitive performance — the public statistics contract.
// Same panel as Player and Team; the UNIT is what differs and it matters.
// ---------------------------------------------------------------------------

const NUM = new Intl.NumberFormat("en-US");

function num(value: number | null, digits: number): string | null {
  return value == null ? null : value.toFixed(digits);
}

function pct(value: number | null): string | null {
  return value == null ? null : `${(value * 100).toFixed(1)}%`;
}

/**
 * THE CHAMPION POPULATION UNIT IS **PICKS**, NOT GAMES.
 *
 * A champion picked by both teams in one game is TWO picks and ONE game, and
 * the backend serves both numbers for exactly that reason. Every count below
 * is over `picks` (canonical player-games), except `bans` and the presence
 * numerator/denominator, which are DISTINCT GAMES — a champion banned by both
 * sides of one game is one banned game, not two.
 *
 * Nothing here is recomputed: every value is served by
 * /api/pro-play/stats/champions with the Stats Explorer's own semantics.
 */
function championMetrics(row: ProStatsChampionRow): PerformanceMetric[] {
  return [
    { label: "Picks", value: NUM.format(row.picks), hint: "Canonical player-games. Both sides picking it in one game counts twice." },
    {
      label: "W-L",
      value: `${NUM.format(row.wins)}–${NUM.format(row.losses)}`,
      hint: "Canonical, over picks.",
    },
    { label: "Win %", value: pct(row.win_rate), hint: "Wins over picks." },
    { label: "Bans", value: NUM.format(row.bans), hint: "DISTINCT games it was banned in — never a player-game count." },
    {
      label: "Presence",
      value: pct(row.presence_rate),
      hint: "Distinct games picked OR banned in, over the games in scope that carry draft data. Null where no draft data exists at all.",
    },
    { label: "KDA", value: num(row.kda, 2), hint: "(Kills + assists) / deaths over picks carrying statistics. Null when deaths are zero." },
    { label: "CS/min", value: num(row.cs_per_min, 2), hint: "Over picks carrying statistics." },
    { label: "Gold/min", value: num(row.gold_per_min, 0), hint: "Over picks carrying statistics." },
    { label: "Dmg/min", value: num(row.damage_per_min, 0), hint: "Over picks carrying statistics." },
  ];
}

function ChampionPerformance({ championKey }: { championKey: string }) {
  // THE LATEST SEASON, FROM THE SERVER'S OWN LIST. `years` is newest first and
  // the same one-hour-cached request the Stats Explorer already makes, so this
  // costs nothing extra on a warm client and never hard-codes a year that
  // would quietly rot into the wrong season.
  const { data: options } = useQuery({
    queryKey: ["pro-play-stats", "filters"],
    queryFn: ({ signal }) => getProStatsFilterOptions(signal),
    staleTime: 60 * 60 * 1000,
  });
  const season = options?.years?.[0] ?? null;
  // Wait for the season rather than firing an unbounded request first: see
  // `useEntityStats`, where the champion bound is a structural requirement.
  const stats = useEntityStats("champions", season == null ? "" : championKey, season);

  // BOTH graph families, because a champion genuinely has two. The entity id
  // is the SLUG — the one conversion in the whole identity vocabulary — and
  // `graphEntityId` applies the app's existing `championSlug`, verified equal
  // to the backend's `champion_slug` for all 172 corpus champions. No scope is
  // transferred: this panel is career-wide, so a year or league here would
  // scope the graph to a span the numbers beside it were not computed over.
  const entityId = graphEntityId("champion", championKey);

  const actions = (
    <>
      <ProfileAction
        to={statsExplorerUrl("champions", championKey, season)}
        title="This champion as a row in the public statistics table"
      >
        View in Pro Stats
      </ProfileAction>
      <ProfileAction to={graphUrl("champion", "players", entityId)} title="Race the players who pick it">
        Graph top players
      </ProfileAction>
      <ProfileAction to={graphUrl("champion", "teams", entityId)} title="Race the teams that pick it">
        Graph top teams
      </ProfileAction>
      {/* NO MATCHUP ACTION. The Explorer has no champion-only entry point --
          `champion_a` is meaningful only inside a configured lane matchup --
          so there is nothing honest to link to. Not a disabled teaser either. */}
      <ProfileAction
        to={buildProChampionUrl({ slug: championSlug(championKey) })}
        title="Imported rows by year, scoped stats, recent games and their sources"
      >
        Open reference history
      </ProfileAction>
    </>
  );

  if (season == null || stats.status === "loading") {
    return (
      <Panel title="Competitive Performance">
        <Skeleton className="h-16 w-full" />
      </Panel>
    );
  }
  if (stats.status === "error") {
    return (
      <Panel title="Competitive Performance" note={stats.message}>
        <EmptyRow label="Performance statistics could not be loaded. The draft record and the players and teams above are unaffected." />
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </Panel>
    );
  }
  if (stats.status === "absent") {
    return (
      <Panel title="Competitive Performance">
        <EmptyRow label="No rows for this champion in the public statistics table." />
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </Panel>
    );
  }

  const row = stats.row as ProStatsChampionRow;
  return (
    <PerformancePanel
      title="Competitive Performance"
      scopeLabel={statsScopeLabel(stats.response)}
      metrics={championMetrics(row)}
      // `picks`, NOT `picked_games`: the rates above are over picks, so the
      // coverage line must count the same population it describes.
      games={row.picks}
      statBackedGames={row.stat_backed_games}
      unit="picks"
      actions={actions}
      note={
        <>
          A different slice from the draft record above, which counts curated
          major-league games over four product scopes. This is the current
          season across every competition, and is the same slice the Pro Stats
          table shows. For a champion's whole history, open the reference
          archive.
        </>
      }
    />
  );
}

function DraftTable({ profile }: { profile: ChampionProfile }) {
  const order = profile.comparison?.scope_order ?? Object.keys(profile.draft);
  return (
    <TableScroll>
      <table className="w-full min-w-[720px] text-sm" data-testid="draft-table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Scope</th>
            <th className="py-2 pr-3 text-right font-medium">Games in scope</th>
            <th className="py-2 pr-3 text-right font-medium">Picks</th>
            <th className="py-2 pr-3 text-right font-medium">Bans</th>
            <th className="py-2 pr-3 text-right font-medium">Presence</th>
            <th className="py-2 pr-3 text-right font-medium">Pick rate</th>
            <th className="py-2 pr-3 text-right font-medium">Ban rate</th>
            <th className="py-2 pr-3 text-right font-medium">W–L</th>
            <th className="py-2 text-right font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {order.map((id) => {
            const row = profile.draft[id];
            const label = profile.comparison?.scopes[id]?.scope.label ?? id;
            if (!row) return null;
            return (
              <tr key={id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3 font-medium">{label}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                  {row.games_in_scope}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{row.picks}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{row.games_banned_in}</td>
                <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                  {formatRate(row.presence)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatRate(row.pick_rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatRate(row.ban_rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {formatRecord(row.wins, row.losses)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatRate(row.win_rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

function Body({ championKey }: { championKey: string }) {
  const [profile, setProfile] = useState<ChampionProfile | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError(null);
    fetchChampionProfile(championKey, controller.signal)
      .then((p) => {
        setProfile(p);
        setScope(p.comparison?.scope_order[0] ?? null);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        const notFound = err instanceof ResearchApiError && err.status === 404;
        // A PUBLIC not-found state. The server's detail names an internal
        // filter parameter and is shown only for real failures.
        setError(
          notFound
            ? notFoundMessage("champion", championKey)
            : { message: (err as Error).message },
        );
      });
    return () => controller.abort();
  }, [championKey]);

  if (error) {
    return (
      <ResearchPage>
        <ResearchBreadcrumb trail={[{ label: championKey }]} />
        <ErrorBlock message={error.message} hint={error.hint} />
      </ResearchPage>
    );
  }
  if (!profile) {
    return (
      <ResearchPage>
        <LoadingBlock />
      </ResearchPage>
    );
  }

  const active = scope && profile.comparison ? profile.comparison.scopes[scope] : null;

  return (
    <ResearchPage>
      <ResearchBreadcrumb trail={[{ label: profile.entity.display_name }]} />
      <ProfileHeader
        title={profile.entity.display_name}
        subtitle="Pro Play"
        meta={
          <>
            {/* ONE SLUGIFIER. This link used to inline its own
                `.replace(/[^a-z0-9]+/g,"-")`, which is a second implementation
                that silently disagrees with the app's on every apostrophe —
                "Bel'Veth" became "bel-veth" where the corpus says "belveth".
                MEASURED: the two disagreed for 8 champions (Bel'Veth,
                Cho'Gath, K'Sante, Kai'Sa, Kha'Zix, Kog'Maw, Rek'Sai,
                Vel'Koz) and /api/docs/champions/bel-veth really does 404
                while /belveth is 200 — a live broken link, fixed here.
                `championSlug` matches the backend's own `champion_slug`
                for all 172 corpus champions. */}
            <Link
              to={`/lol/docs/champions/${encodeURIComponent(championSlug(profile.entity.key))}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Champion abilities and stats →
            </Link>
          </>
        }
      />

      {profile.comparison_error ? (
        <Panel title="No professional picks">
          <EmptyRow label={profile.comparison_error} />
          <Note>
            Ban data below is still real: a champion can be banned in drafts it
            was never picked in.
          </Note>
        </Panel>
      ) : null}

      <Panel title="Career Draft Record" note={profile.draft_note}>
        <DraftTable profile={profile} />
        <Note>
          Canonical games over four product scopes, curated major leagues only.
        </Note>
      </Panel>

      <ChampionPerformance championKey={profile.entity.key} />

      {profile.comparison && active && scope ? (
        <>
          <Panel title="Who plays it">
            <ScopeTabs comparison={profile.comparison} active={scope} onSelect={setScope} />
            {active.participation === "did_not_participate" ? (
              <EmptyRow label={`Never picked in ${active.scope.label}.`} />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {active.stats?.distinct_players ?? 0} players
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {active.stats?.distinct_teams ?? 0} teams
                  </Badge>
                </div>
                <EntityTable
                  rows={active.stats?.top_players ?? []}
                  kind="player"
                  heading="Player"
                  emptyLabel="No players recorded in this scope."
                />
              </>
            )}
          </Panel>

          <Panel title="Teams that pick it">
            {active.participation === "did_not_participate" ? (
              <EmptyRow label={`Never picked in ${active.scope.label}.`} />
            ) : (
              <EntityTable
                rows={active.stats?.top_teams ?? []}
                kind="team"
                heading="Team"
                emptyLabel="No teams recorded in this scope."
              />
            )}
          </Panel>
        </>
      ) : null}
    </ResearchPage>
  );
}

export default function ProPlayChampionProfile() {
  const { key = "" } = useParams();
  const decoded = decodeURIComponent(key);
  return (
    <>
      <SEOHead
        title={`${decoded} in pro play — Pro Play Research | Mogzy`}
        description={`Professional pick, ban and presence data for ${decoded}.`}
        path={`/lol/pro-play/champion/${key}`}
      />
      <Body championKey={decoded} />
    </>
  );
}
