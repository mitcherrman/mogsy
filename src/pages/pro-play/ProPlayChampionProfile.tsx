// ---------------------------------------------------------------------------
// /lol/pro-play/champion/:key — the champion's PRO PLAY profile.
//
// NOT THE CHAMPION DOC PAGE. Abilities, ratios and base stats belong to
// /lol/docs/champions and are a separate authority with a separate owner.
// This page answers one question: how does this champion appear in
// professional drafts. It links across rather than restating.
//
// PICK RATE, BAN RATE AND PRESENCE SHARE ONE DENOMINATOR — every canonical
// game in the scope — so they are comparable. They are not summed: a game
// where the champion was picked is not also a game where it was banned.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { Badge } from "@/components/ui/badge";
import {
  EmptyRow,
  EntityTable,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  ProfileHeader,
  ResearchBreadcrumb,
  ResearchPage,
  ScopeTabs,
  TableScroll,
} from "@/components/pro-play/ResearchShell";
import {
  fetchChampionProfile,
  formatRate,
  formatRecord,
  ResearchApiError,
  type ChampionProfile,
} from "@/lib/pro-play/researchApi";

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
        setError({
          message: (err as Error).message,
          hint: notFound ? "No canonical professional games for this champion." : undefined,
        });
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
          <Link
            to={`/lol/docs/champions/${encodeURIComponent(
              profile.entity.key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            )}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Champion abilities and stats →
          </Link>
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

      <Panel title="Draft presence" note={profile.draft_note}>
        <DraftTable profile={profile} />
      </Panel>

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
        noindex
      />
      <AdminAuthGate>
        <Body championKey={decoded} />
      </AdminAuthGate>
    </>
  );
}
