// ---------------------------------------------------------------------------
// /lol/pro-play/player/:key — the strongest of the three profiles.
//
// EVERY NUMBER COMES FROM THE COMPARISON CONTRACT. This page computes nothing:
// it renders the payload the backend returns, in the scope order the backend
// sends, with the labels the backend serves.
//
// WHAT IT REFUSES TO SAY: that a demonstrated champion pool is the set of
// champions a player CAN play; that a watchlist team is qualified; that a
// low-sample row is unimportant. A one-game champion is rendered with its
// date, in the same table as a hundred-game one.
//
// NOT A DUPLICATE OF /lol/docs/pro/players/:lpPage. That page is the roster
// WIKI: dated, DECLARED team memberships from the Leaguepedia identity
// registry, with aliases, A/B/C eligibility and per-row source links, and no
// performance data of any kind. This page is DEMONSTRATED performance from the
// canonical Pro Play corpus. Same subject, disjoint data, opposite direction —
// the same declared-vs-demonstrated split `pro_authority/team_roster.py`
// already draws. The header links out to the wiki so neither reads as the
// other's replacement. Both pages are now public; whether the wiki links back
// is the docs owner's call and is not made here.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  type PerformanceMetric,
} from "@/components/pro-play/ResearchShell";
import { PlayerPortraitSlot, TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { playerRoute } from "@/lib/league-docs/roster-api";
import {
  statsExplorerUrl,
  statsScopeLabel,
  useEntityStats,
} from "@/lib/pro-play/entityStats";
import { graphHandoff } from "@/lib/pro-play/graphHandoff";
import type { ProStatsPlayerRow } from "@/lib/pro-play/statsApi";
import {
  decodeRegistryText,
  fetchPlayerProfile,
  formatDate,
  notFoundMessage,
  ResearchApiError,
  type PlayerProfile,
} from "@/lib/pro-play/researchApi";

function TeamContext({ profile }: { profile: PlayerProfile }) {
  const ctx = profile.team_context;
  return (
    <Panel title="Team" note={ctx.note ?? undefined}>
      <dl className="grid gap-3 sm:grid-cols-2" data-testid="team-context">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Demonstrated</dt>
          <dd className="mt-0.5 text-sm">
            {ctx.demonstrated ? (
              <>
                <Link
                  to={`/lol/pro-play/team/${encodeURIComponent(ctx.demonstrated.team_key)}`}
                  className="font-medium hover:underline"
                >
                  {ctx.demonstrated.team_key}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {ctx.demonstrated.games} games · last {formatDate(ctx.demonstrated.last_played_at)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                No canonical games for any team in these scopes
              </span>
            )}
          </dd>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Who this player actually played for in the corpus.
          </p>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Declared</dt>
          <dd className="mt-0.5 text-sm">
            {ctx.declared ? (
              <>
                <span className="font-medium">{ctx.declared.raw}</span>
                {ctx.declared.resolution === "ambiguous" ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    ambiguous
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Not declared in the registry</span>
            )}
          </dd>
          <p className="mt-1 text-[11px] text-muted-foreground">
            What the roster registry states. Secondary: it is demonstrably
            incomplete.
          </p>
        </div>
      </dl>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Performance — the public statistics contract, composed onto the profile.
// ---------------------------------------------------------------------------

const NUM = new Intl.NumberFormat("en-US");

/** null stays null all the way to the panel, which renders the em dash. A
 *  rate over no statistics is NOT zero, and this is the last place that
 *  distinction could be lost. */
function num(value: number | null, digits: number): string | null {
  return value == null ? null : value.toFixed(digits);
}

function int(value: number | null): string | null {
  return value == null ? null : NUM.format(value);
}

function pct(value: number | null): string | null {
  return value == null ? null : `${(value * 100).toFixed(1)}%`;
}

function playerMetrics(row: ProStatsPlayerRow): PerformanceMetric[] {
  return [
    // CANONICAL — over `games`, present for every season back to 2013.
    { label: "Games", value: NUM.format(row.games), hint: "Canonical professional games." },
    {
      label: "W-L",
      value: `${NUM.format(row.wins)}–${NUM.format(row.losses)}`,
      hint: "Canonical record, over every game.",
    },
    { label: "Win %", value: pct(row.win_rate), hint: "Over canonical games." },
    // STAT-BACKED — over `stat_backed_games`, a subset.
    {
      label: "KDA",
      value: num(row.kda, 2),
      hint: "(Kills + assists) / deaths, over games carrying statistics. Null when deaths are zero.",
    },
    { label: "CS/min", value: num(row.cs_per_min, 2), hint: "Over games carrying statistics." },
    { label: "Gold/min", value: num(row.gold_per_min, 0), hint: "Over games carrying statistics." },
    { label: "Dmg/min", value: num(row.damage_per_min, 0), hint: "Over games carrying statistics." },
  ];
}

function PlayerPerformance({ playerKey }: { playerKey: string }) {
  const stats = useEntityStats("players", playerKey);

  // The graph hand-off is the SHIPPED stats-explorer contract, reused rather
  // than re-derived: Player -> Champions, entity id is the lp_page verbatim.
  // No scope is transferred because this panel is career-wide, so there is no
  // year, league or patch to carry.
  const handoff = graphHandoff({
    view: "players",
    year: null,
    league: null,
    patch: null,
    role: null,
    player: playerKey,
    team: null,
    champion: null,
    minGames: null,
  });

  const actions = (
    <>
      <ProfileAction
        to={statsExplorerUrl("players", playerKey)}
        title="This player as a row in the public statistics table"
      >
        View in Pro Stats
      </ProfileAction>
      {handoff ? (
        <ProfileAction to={handoff.href} title="Race this player's champions">
          Graph champion pool
        </ProfileAction>
      ) : null}
    </>
  );

  if (stats.status === "loading") {
    return (
      <Panel title="Performance">
        <Skeleton className="h-16 w-full" />
      </Panel>
    );
  }
  if (stats.status === "error") {
    // Degraded, never fatal: the identity, record and champion pool above
    // come from a different contract and are unaffected.
    return (
      <Panel title="Performance" note={stats.message}>
        <EmptyRow label="Performance statistics could not be loaded. The record and champion pool above are unaffected." />
      </Panel>
    );
  }
  if (stats.status === "absent") {
    return (
      <Panel title="Performance">
        <EmptyRow label="No rows for this player in the public statistics table." />
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </Panel>
    );
  }

  const row = stats.row as ProStatsPlayerRow;
  return (
    <PerformancePanel
      title="Performance"
      scopeLabel={statsScopeLabel(stats.response)}
      metrics={playerMetrics(row)}
      games={row.games}
      statBackedGames={row.stat_backed_games}
      actions={actions}
      note={
        <>
          A different slice from the four scopes above, which count curated
          major-league games only. This is the whole career across every
          competition, and is the same slice the Pro Stats table shows.
        </>
      }
    />
  );
}

function Body({ playerKey }: { playerKey: string }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError(null);
    fetchPlayerProfile(playerKey, controller.signal)
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
            ? notFoundMessage("player", playerKey)
            : { message: (err as Error).message },
        );
      });
    return () => controller.abort();
  }, [playerKey]);

  if (error) {
    return (
      <ResearchPage>
        <ResearchBreadcrumb trail={[{ label: playerKey }]} />
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
  const pool = active?.stats?.top_champions ?? [];
  const identity = profile.identity as Record<string, string | null>;
  const meta: string[] = [];
  if (profile.roles.roles.length) meta.push(profile.roles.roles.join(" / "));
  if (identity.country) meta.push(String(identity.country));
  if (identity.real_name) meta.push(decodeRegistryText(String(identity.real_name)));

  // SECONDARY IDENTITY, AND ONLY WHERE THE CANONICAL KEY IS UNAMBIGUOUS.
  // `demonstrated.team_key` is who this player actually played for in the
  // corpus and is always a canonical page. The declared value is a fallback and
  // is used ONLY when the registry resolved it — an `ambiguous` resolution is
  // exactly the case where putting a crest on screen would assert something the
  // authority refuses to assert.
  const ctxTeam = profile.team_context;
  const teamKey =
    ctxTeam.demonstrated?.team_key ??
    (ctxTeam.declared && ctxTeam.declared.resolution !== "ambiguous"
      ? ctxTeam.declared.resolved_team_key
      : null);

  return (
    <ResearchPage>
      <ResearchBreadcrumb trail={[{ label: profile.entity.display_name }]} />
      {/* The player's OWN portrait is not requested: no player portrait is
          approved, so asking would spend a round trip to be told so. The team
          crest is the only media this page can show, and it is shown AS the
          team's, never as the player's. */}
      <ProPlayMediaProvider teams={teamKey ? [teamKey] : []}>
      <ProfileHeader
        media={
          <span className="flex items-center gap-2">
            <PlayerPortraitSlot name={profile.entity.display_name} size="xl" />
            {teamKey ? (
              <TeamCrest teamKey={teamKey} name={teamKey} size="md" />
            ) : null}
          </span>
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
            {identity.registry_available ? null : (
              <Badge variant="outline" className="text-[10px]">
                registry unavailable
              </Badge>
            )}
            {/*
              THE OTHER HALF OF THIS PLAYER, NAMED AS SUCH. The roster wiki
              holds dated, declared team memberships with their sources; this
              page holds demonstrated performance. Two pages about one player
              look like rival profiles unless each says what the other is for.
              The link is one-way on purpose: the wiki is public and this page
              is admin-gated, so a link back would offer every visitor a 403.
            */}
            <Link
              to={playerRoute(profile.entity.key)}
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

      <PlayerPerformance playerKey={profile.entity.key} />

      <TeamContext profile={profile} />

      <Panel title="Champion pool" note={profile.champion_pool_note}>
        <ScopeTabs comparison={profile.comparison} active={scope} onSelect={setScope} />
        {active.participation === "did_not_participate" ? (
          <EmptyRow
            label={`${profile.entity.display_name} did not participate in ${active.scope.label}. That is not a record of zero games.`}
          />
        ) : (
          <ChampionPoolTable
            rows={pool}
            emptyLabel={`Present in ${active.scope.label}, with no champions recorded.`}
          />
        )}
        {active.stats?.champion_pool_size &&
        active.stats.champion_pool_size > pool.length ? (
          <Note>
            Showing {pool.length} of {active.stats.champion_pool_size} champions.
          </Note>
        ) : null}
      </Panel>

      <Panel title="Competitions in scope">
        {active.tournaments_in_scope.length ? (
          <ul className="flex flex-wrap gap-1.5" data-testid="tournaments-in-scope">
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

export default function ProPlayPlayerProfile() {
  const { key = "" } = useParams();
  const decoded = decodeURIComponent(key);
  return (
    <>
      <SEOHead
        title={`${decoded} — Pro Play Research | Mogzy`}
        description={`Professional record, champion pool and competition history for ${decoded}.`}
        path={`/lol/pro-play/player/${key}`}
      />
      <Body playerKey={decoded} />
    </>
  );
}
