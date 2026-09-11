// ---------------------------------------------------------------------------
// /lol/pro-play/team/:key — team record, champion usage and demonstrated roster.
//
// WORKS FOR ANY TEAM. Worlds focus status is a block on the page, never a
// condition of the page existing.
//
// A PARTIAL ROSTER RENDERS AS PARTIAL. The backend names the roles it could
// not fill and this page prints them. It never pads a lineup from the declared
// registry to make five, and it never breaks a timeshare tie into a starter.
//
// PUBLIC. The canonical competitive identity page for a team.
//
// NOT A DUPLICATE OF /lol/docs/pro/teams/:lpPage — see the player profile's
// header for the full split. In one line: that page lists DECLARED membership
// history with sources, this one shows the DEMONSTRATED roster and record.
// The roster table here even labels the difference per player, in the
// "Declared" column.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChampionPoolTable,
  EmptyRow,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  PerformancePanel,
  ProfileAction,
  ProfileHeader,
  ResearchBreadcrumb,
  ResearchPage,
  ScopeGrid,
  ScopeTabs,
  TableScroll,
  type PerformanceMetric,
} from "@/components/pro-play/ResearchShell";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { teamRoute } from "@/lib/league-docs/roster-api";
import {
  statsExplorerUrl,
  statsScopeLabel,
  useEntityStats,
} from "@/lib/pro-play/entityStats";
import { graphHandoff } from "@/lib/pro-play/graphHandoff";
import type { ProStatsTeamRow } from "@/lib/pro-play/statsApi";
import {
  fetchTeamProfile,
  formatDate,
  formatRate,
  notFoundMessage,
  ResearchApiError,
  type Roster,
  type TeamProfile,
} from "@/lib/pro-play/researchApi";

function RosterPanel({ roster, note, error }: { roster: Roster | null; note: string; error: string | null }) {
  if (error) {
    return (
      <Panel title="Roster">
        <ErrorBlock message="The roster registry could not be read." hint={error} />
      </Panel>
    );
  }
  if (!roster) {
    return (
      <Panel title="Roster">
        <EmptyRow label="No roster available for this scope." />
      </Panel>
    );
  }
  const c = roster.completeness;
  const missing = c.roles_missing ?? [];
  return (
    <Panel title={`Roster — ${roster.scope_label}`} note={note}>
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="roster-completeness">
        <Badge variant={c.state === "complete" ? "secondary" : "outline"} className="text-[10px] uppercase">
          {c.state}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {roster.players.length} of 5 roles demonstrated · {roster.team_games_in_scope} team games
        </span>
      </div>
      {missing.length ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs"
          data-testid="roster-gap"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            No player demonstrated for {missing.join(", ")} in this scope. The
            lineup shown is incomplete; it has not been filled in from declared
            memberships.
          </p>
        </div>
      ) : null}
      {roster.players.length ? (
        <TableScroll>
          <table className="w-full min-w-[560px] text-sm" data-testid="roster-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Player</th>
                <th className="py-2 pr-3 text-right font-medium">Games</th>
                <th className="py-2 pr-3 text-right font-medium">Share</th>
                <th className="py-2 pr-3 text-right font-medium">Last played</th>
                <th className="py-2 text-right font-medium">Declared</th>
              </tr>
            </thead>
            <tbody>
              {roster.players.map((p) => (
                <tr key={p.player_lp_page} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-3 text-muted-foreground">{p.role ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    <Link
                      to={`/lol/pro-play/player/${encodeURIComponent(p.player_lp_page)}`}
                      className="hover:underline"
                    >
                      {p.display_name}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.games}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatRate(p.share_of_team_games)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {formatDate(p.last_played_at)}
                  </td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">
                    {p.declared_member ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <EmptyRow label="No players demonstrated for this team in this scope." />
      )}
      <Note>
        “Declared: no” means the roster registry does not list an open
        membership for this player. It is a gap in the registry, not a doubt
        about the games — Faker is missing from T1's declared memberships and
        played every one of their 2026 games.
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Performance — the public statistics contract, composed onto the profile.
// Same shape as the player profile's; only the metric list differs.
// ---------------------------------------------------------------------------

const NUM = new Intl.NumberFormat("en-US");

/** null stays null all the way to the panel, which renders the em dash. Each
 *  team metric has its OWN non-null denominator on the backend (COUNT(col)
 *  skips nulls), so one absent column never blanks its neighbours. */
function num(value: number | null, digits: number): string | null {
  return value == null ? null : value.toFixed(digits);
}

function pct(value: number | null): string | null {
  return value == null ? null : `${(value * 100).toFixed(1)}%`;
}

function teamMetrics(row: ProStatsTeamRow): PerformanceMetric[] {
  return [
    // CANONICAL. `win` per team-game is the game's own blue_win, inverted for
    // the red side; the statistics row's own win flag is never read -- it
    // disagrees with canonical on 308 team-rows live.
    { label: "Games", value: NUM.format(row.games), hint: "Canonical team-games." },
    {
      label: "W-L",
      value: `${NUM.format(row.wins)}–${NUM.format(row.losses)}`,
      hint: "Canonical record. An undecided game counts in Games and in neither column.",
    },
    { label: "Win %", value: pct(row.win_rate), hint: "Over canonical DECIDED games." },
    // STAT-BACKED, each over its own non-null denominator.
    { label: "Kills/G", value: num(row.kills_per_game, 1), hint: "Over games recording team kills." },
    { label: "Gold/min", value: num(row.gold_per_min, 0), hint: "Team gold over the duration of games recording it." },
    { label: "Towers/G", value: num(row.towers_per_game, 1), hint: "Over games recording towers." },
    { label: "Dragons/G", value: num(row.dragons_per_game, 1), hint: "Over games recording dragons." },
    { label: "Barons/G", value: num(row.barons_per_game, 2), hint: "Over games recording barons." },
  ];
}

function TeamPerformance({
  teamKey,
  explorerPool,
}: {
  teamKey: string;
  explorerPool: boolean;
}) {
  const stats = useEntityStats("teams", teamKey);

  // The SHIPPED hand-off, reused: Team -> Champions, entity id is the
  // team_key verbatim. No scope is transferred because this panel is
  // career-wide -- fabricating a year or league here would scope the graph to
  // a span the numbers beside it were not computed over.
  const handoff = graphHandoff({
    view: "teams",
    year: null,
    league: null,
    patch: null,
    role: null,
    player: null,
    team: teamKey,
    champion: null,
    minGames: null,
  });

  const actions = (
    // The pool marker is published on the DOM even while the action is
    // deferred, so the plumbing from backend field to profile stays covered
    // by a test instead of decaying into an unused prop.
    <span className="contents" data-explorer-pool={String(explorerPool)}>
      <ProfileAction
        to={statsExplorerUrl("teams", teamKey)}
        title="This team as a row in the public statistics table"
      >
        View in Pro Stats
      </ProfileAction>
      {handoff ? (
        <ProfileAction to={handoff.href} title="Race this team's champions">
          Graph champion pool
        </ProfileAction>
      ) : null}
      {/* NAVIGATION DEFERRED — ELIGIBILITY CONTRACT RETAINED.
          =====================================================
          The Matchup Explorer action is NOT rendered, because this profile is
          public and the Explorer is still admin-gated: every signed-out
          reader who clicked it landed on "Sign in required". A public entry
          point that dead-ends in an auth wall is the exact defect this whole
          workstream exists to remove.

          NOTHING ABOUT THE ELIGIBILITY WORK IS THROWN AWAY. The backend still
          serves `explorer_pool.in_explorer_pool` (LIVE4's own
          `is_explorer_team`, NOT `worlds_focus` -- pool 38 vs focus set 16,
          and the 22 in between are why that distinction matters), the
          discriminating backend tests still run, `matchupHandoff.ts` still
          builds the URL from LIVE4's own serializer, and `explorerPool` is
          still plumbed to this component and asserted.

          TO RESTORE, once the Explorer is public: render the action below
          under `explorerPool`. That is the whole change.

            {explorerPool ? (
              <ProfileAction to={matchupExplorerUrl(teamKey)}>   // from matchupHandoff
                Open in Matchup Explorer
              </ProfileAction>
            ) : null}
      */}
    </span>
  );

  if (stats.status === "loading") {
    return (
      <Panel title="All-Competition Performance">
        <Skeleton className="h-16 w-full" />
      </Panel>
    );
  }
  if (stats.status === "error") {
    // Degraded, never fatal: the record, roster and champion usage come from
    // a different contract and are unaffected.
    return (
      <Panel title="All-Competition Performance" note={stats.message}>
        <EmptyRow label="Performance statistics could not be loaded. The record, roster and champion usage above are unaffected." />
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </Panel>
    );
  }
  if (stats.status === "absent") {
    return (
      <Panel title="All-Competition Performance">
        <EmptyRow label="No rows for this team in the public statistics table." />
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </Panel>
    );
  }

  const row = stats.row as ProStatsTeamRow;
  return (
    <PerformancePanel
      title="All-Competition Performance"
      scopeLabel={statsScopeLabel(stats.response)}
      metrics={teamMetrics(row)}
      games={row.games}
      statBackedGames={row.stat_backed_games}
      unit="team-games"
      actions={actions}
      note={
        <>
          A different slice from the four scopes above, which count curated
          major-league games only. This is every competition, all seasons, and
          is the same slice the Pro Stats table shows.
        </>
      }
    />
  );
}

function Body({ teamKey }: { teamKey: string }) {
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError(null);
    fetchTeamProfile(teamKey, controller.signal)
      .then((p) => {
        setProfile(p);
        setScope(p.comparison.scope_order[0] ?? null);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        const notFound = err instanceof ResearchApiError && err.status === 404;
        // A PUBLIC not-found state. The server's detail names an internal
        // filter parameter and is shown only for real failures.
        setError(
          notFound
            ? notFoundMessage("team", teamKey)
            : { message: (err as Error).message },
        );
      });
    return () => controller.abort();
  }, [teamKey]);

  if (error) {
    return (
      <ResearchPage>
        <ResearchBreadcrumb trail={[{ label: teamKey }]} />
        <ErrorBlock message={error.message} hint={error.hint} />
      </ResearchPage>
    );
  }
  if (!profile || !scope) {
    return (
      <ResearchPage>
        <LoadingBlock />
      </ResearchPage>
    );
  }

  const active = profile.comparison.scopes[scope];
  const identity = profile.identity as Record<string, string | boolean | null>;
  const meta: string[] = [];
  if (identity.short) meta.push(String(identity.short));
  if (identity.region) meta.push(String(identity.region));
  if (identity.is_disbanded) meta.push("disbanded");
  if (identity.renamed_to) meta.push(`renamed to ${identity.renamed_to}`);

  return (
    <ResearchPage>
      <ResearchBreadcrumb trail={[{ label: profile.entity.display_name }]} />
      {/* One request for the one entity this page is about. `entity.key` IS the
          canonical `esports_teams.lp_page` the profile was loaded by, so the
          crest and the name cannot disagree. */}
      <ProPlayMediaProvider teams={[profile.entity.key]}>
      <ProfileHeader
        media={
          <TeamCrest
            teamKey={profile.entity.key}
            name={profile.entity.display_name}
            shortCode={identity.short ? String(identity.short) : null}
            size="xl"
          />
        }
        title={profile.entity.display_name}
        subtitle={profile.entity.key !== profile.entity.display_name ? profile.entity.key : undefined}
        focus={profile.worlds_focus}
        meta={
          <>
            {meta.map((m) => (
              <Badge key={m} variant="outline" className="text-[10px]">
                {m}
              </Badge>
            ))}
            {/* See the player profile: declared roster history lives in the
                public wiki, demonstrated performance lives here. Both are
                public now; whether the wiki links back is the docs owner's
                call and is not made here. */}
            <Link
              to={teamRoute(profile.entity.key)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Roster history &amp; aliases (League Docs) &rarr;
            </Link>
          </>
        }
      />

      <Panel title="Career Pro Record">
        <ScopeGrid comparison={profile.comparison} />
        <Note>
          Canonical games over four product scopes, curated major leagues only.
        </Note>
      </Panel>

      <TeamPerformance
        teamKey={profile.entity.key}
        explorerPool={profile.explorer_pool?.in_explorer_pool ?? false}
      />

      <RosterPanel roster={profile.roster} note={profile.roster_note} error={profile.roster_error} />

      <Panel title="Champion usage">
        <ScopeTabs comparison={profile.comparison} active={scope} onSelect={setScope} />
        {active.participation === "did_not_participate" ? (
          <EmptyRow
            label={`${profile.entity.display_name} did not participate in ${active.scope.label}.`}
          />
        ) : (
          <ChampionPoolTable
            rows={active.stats?.top_champions ?? []}
            emptyLabel={`Present in ${active.scope.label}, with no champions recorded.`}
          />
        )}
      </Panel>

      <Panel title="Competitions in scope">
        {active.tournaments_in_scope.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {active.tournaments_in_scope.map((t) => (
              <li key={t}>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {t}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow label={`No competitions recorded in ${active.scope.label}.`} />
        )}
      </Panel>
      </ProPlayMediaProvider>
    </ResearchPage>
  );
}

export default function ProPlayTeamProfile() {
  const { key = "" } = useParams();
  const decoded = decodeURIComponent(key);
  return (
    <>
      <SEOHead
        title={`${decoded} — Pro Play Research | Mogzy`}
        description={`Professional record, roster and champion usage for ${decoded}.`}
        path={`/lol/pro-play/team/${key}`}
      />
      <Body teamKey={decoded} />
    </>
  );
}
