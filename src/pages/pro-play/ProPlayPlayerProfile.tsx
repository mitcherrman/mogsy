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
// other's replacement; the wiki does not link back, because it is public and
// this page is admin-gated.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { Badge } from "@/components/ui/badge";
import {
  ChampionPoolTable,
  EmptyRow,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  ProfileHeader,
  ResearchBreadcrumb,
  ResearchPage,
  ScopeGrid,
  ScopeTabs,
} from "@/components/pro-play/ResearchShell";
import { playerRoute } from "@/lib/league-docs/roster-api";
import {
  decodeRegistryText,
  fetchPlayerProfile,
  formatDate,
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
        setError({
          message: (err as Error).message,
          hint: notFound
            ? "This page exists in the roster registry but has no canonical professional games under the current competition filter, so there is nothing to profile."
            : undefined,
        });
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

  return (
    <ResearchPage>
      <ResearchBreadcrumb trail={[{ label: profile.entity.display_name }]} />
      <ProfileHeader
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

      <Panel title="The four scopes">
        <ScopeGrid comparison={profile.comparison} />
      </Panel>

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
        noindex
      />
      <AdminAuthGate>
        <Body playerKey={decoded} />
      </AdminAuthGate>
    </>
  );
}
