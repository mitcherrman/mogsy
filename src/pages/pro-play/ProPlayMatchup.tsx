// ---------------------------------------------------------------------------
// /lol/pro-play/matchup — the Worlds Matchup Explorer.
//
// A CONFIGURABLE ENGINE, NOT A PAGE PER MATCHUP. Every control writes into one
// selection object, the selection is the query string, and the query string is
// the API request (see `matchupApi.ts`). Swapping Faker's Orianna for his
// Viktor is one field change and one fetch; nothing about the page is rebuilt
// and no matchup is special-cased.
//
// THE FOUR THINGS THIS SCREEN MUST NOT SAY, and where each is prevented:
//
// 1. "Head-to-head." The two cards are each player's OWN record against the
//    whole field. The heading says "Side-by-side record", the server's
//    `head_to_head` flag is asserted false before the section renders, and the
//    server's own sentence is printed underneath.
// 2. "Qualified for Worlds." Team rows print `status` verbatim and the entry
//    panel prints the server's focus note. Nothing here maps a status to a
//    claim; `asserts_qualification` is the only field allowed to, and it is
//    false for every team today.
// 3. "Champions they can play." The pool heading is "Demonstrated picks" and
//    the server's pool note is printed with it. One-game picks are shown; no
//    minimum-game filter exists anywhere in this file.
// 4. "0%." A rate over zero games is null on the wire and an em dash here, via
//    `formatRate`. `ScopeCard` owns the did-not-participate fork so this page
//    cannot get it wrong.
//
// THE MECHANICS PANEL READS THE PUBLIC CHAMPION DOCS AUTHORITY
// (`/api/docs/champions/{slug}`) through the existing `getChampionDoc` client.
// No champion mechanics are computed, cached or re-derived here.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  EmptyRow,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  ResearchBreadcrumb,
  ResearchPage,
  ScopeGrid,
  TableScroll,
} from "@/components/pro-play/ResearchShell";
import {
  formatDate,
  formatRate,
  formatRecord,
  profilePath,
} from "@/lib/pro-play/researchApi";
import { TeamBoard } from "@/pages/pro-play/ProPlayMatchupTeam";
import {
  CONFLICT_CHAMPION_BANNED,
  CONFLICT_CHAMPION_OFF_POOL,
  CONFLICT_PLAYER_OFF_LANE,
  EMPTY_SELECTION,
  fetchMatchup,
  fetchTeamMatchup,
  modeFromParams,
  teamModeUrl,
  teamSelectionFromLane,
  teamSelectionFromParams,
  teamSelectionToParams,
  type TeamMatchupResponse,
  type TeamSelection,
  fetchMatchupContract,
  selectionFromParams,
  selectionToParams,
  withBanToggled,
  withChampion,
  withLane,
  withPlayer,
  withPoolScope,
  withTeam,
  type MatchupContract,
  type MatchupResponse,
  type MatchupSelection,
  type MatchupSide,
} from "@/lib/pro-play/matchupApi";
import { championSlug, getChampionDoc, type ChampionDoc } from "@/lib/league-docs/api";
import {
  Disclosure,
  Dossier,
  DossierSection,
  FinePrint,
  GoldRule,
  MogzyNote,
} from "@/components/pro-play/dossier/DossierChrome";
import { ChampionIcon, PlayerPortrait } from "@/components/pro-play/dossier/DossierMedia";

const CONFLICT_TEXT: Record<string, string> = {
  [CONFLICT_CHAMPION_BANNED]:
    "This champion is banned. It stays selected and its record is still shown — the ban and the selection simply disagree.",
  [CONFLICT_CHAMPION_OFF_POOL]:
    "Not among this player's demonstrated picks in the pool scope. Their record on it over the four scopes is still real.",
  [CONFLICT_PLAYER_OFF_LANE]:
    "The corpus does not show this player in this lane for this team in the pool scope. Their own record is unaffected.",
};

// --- small controls ---------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  testId,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder: string;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
        value={value ?? ""}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A focus status, printed literally. `asserts_qualification` is the only
 *  thing that may change the wording, and it is what the server says. */
function FocusBadge({ side }: { side: MatchupSide }) {
  if (!side.focus) return null;
  return (
    <Badge variant={side.focus.asserts_qualification ? "default" : "secondary"} className="text-[10px]">
      {side.focus.status}
      {side.focus.asserts_qualification ? " · slot claimed" : ""}
    </Badge>
  );
}

// --- configuration ----------------------------------------------------------

function TeamPicker({
  contract,
  selection,
  side,
  onChange,
}: {
  contract: MatchupContract;
  selection: MatchupSelection;
  side: "a" | "b";
  onChange: (next: MatchupSelection) => void;
}) {
  const options = useMemo(
    () =>
      contract.focus_set.teams.map((t) => ({
        value: t.team_key,
        // The owner's short label is shown ALONGSIDE the canonical key, never
        // instead of it: "IG", "DK" and "TL" each match several real orgs, and
        // the canonical page is the thing being selected.
        label: `${t.owner_label} — ${t.team_key} (${t.group})`,
      })),
    [contract],
  );
  return (
    <Field
      label={`Team ${side.toUpperCase()}`}
      testId={`matchup-team-${side}`}
      placeholder="Select a team…"
      value={side === "a" ? selection.team_a : selection.team_b}
      options={options}
      onChange={(v) => onChange(withTeam(selection, side, v))}
    />
  );
}

function PlayerPicker({
  data,
  selection,
  side,
  onChange,
}: {
  data: MatchupResponse;
  selection: MatchupSelection;
  side: "a" | "b";
  onChange: (next: MatchupSelection) => void;
}) {
  const candidates = data.sides[side].lane_candidates;
  const options = (candidates?.players ?? []).map((p) => ({
    value: p.player_lp_page,
    // Games are in the label because a timeshare is a real thing a reader is
    // choosing between, and the split is the whole information.
    label: `${p.display_name} — ${p.games}g`,
  }));
  return (
    <Field
      label={`Player ${side.toUpperCase()}`}
      testId={`matchup-player-${side}`}
      placeholder={candidates ? (options.length ? "Select a player…" : "No player in this lane") : "Pick a team and lane first"}
      disabled={!candidates || options.length === 0}
      value={side === "a" ? selection.player_a : selection.player_b}
      options={options}
      onChange={(v) => onChange(withPlayer(selection, side, v))}
    />
  );
}

function ChampionPicker({
  data,
  selection,
  side,
  onChange,
}: {
  data: MatchupResponse;
  selection: MatchupSelection;
  side: "a" | "b";
  onChange: (next: MatchupSelection) => void;
}) {
  const pool = data.sides[side].pool;
  // Banned champions stay in the list, disabled and labelled. Removing them
  // outright would hide that the reader banned something this player plays.
  const options = (pool?.champions ?? []).map((c) => ({
    value: c.key,
    label: `${c.key} — ${c.games}g${c.banned ? " (banned)" : ""}`,
    disabled: c.banned,
  }));
  return (
    <Field
      label={`Champion ${side.toUpperCase()}`}
      testId={`matchup-champion-${side}`}
      placeholder={pool ? "Select a demonstrated pick…" : "Pick a player first"}
      disabled={!pool || options.length === 0}
      value={side === "a" ? selection.champion_a : selection.champion_b}
      options={options}
      onChange={(v) => onChange(withChampion(selection, side, v))}
    />
  );
}

function BanBar({
  data,
  selection,
  onChange,
}: {
  data: MatchupResponse;
  selection: MatchupSelection;
  onChange: (next: MatchupSelection) => void;
}) {
  // Only champions someone in this matchup demonstrably plays are offered:
  // banning a champion neither player has picked is a no-op set difference,
  // and offering all 170 would suggest a draft model that does not exist.
  const offered = useMemo(() => {
    const keys = new Set<string>();
    for (const side of ["a", "b"] as const) {
      for (const c of data.sides[side].pool?.champions ?? []) keys.add(c.key);
    }
    for (const b of selection.bans) keys.add(b);
    return [...keys].sort();
  }, [data, selection.bans]);

  if (!offered.length) return null;
  return (
    <div data-testid="matchup-bans">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bans ({selection.bans.length})
      </span>
      <div className="flex flex-wrap gap-1.5">
        {offered.map((key) => {
          const banned = selection.bans.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={banned}
              data-testid={`matchup-ban-${key}`}
              onClick={() => onChange(withBanToggled(selection, key))}
              className={[
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                banned
                  ? "border-destructive bg-destructive/10 text-destructive line-through"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {key}
            </button>
          );
        })}
      </div>
      <Note>{data.bans.note}</Note>
    </div>
  );
}

// --- side rendering ---------------------------------------------------------

function SideCard({ side, label }: { side: MatchupSide; label: string }) {
  return (
    <Card className="p-4" data-testid={`matchup-side-${label.toLowerCase()}`}>
      <div className="mb-3 flex items-start gap-3">
        {/* Media slots: empty today, shaped for the portraits and champion art
            a later workstream will source. See DossierMedia. */}
        <PlayerPortrait name={side.player?.display_name ?? "?"} />
        {side.champion_key ? <ChampionIcon champion={side.champion_key} size="md" /> : null}
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {side.player ? (
            <Link
              className="text-lg font-semibold hover:underline"
              to={profilePath("player", side.player.player_lp_page)}
            >
              {side.player.display_name}
            </Link>
          ) : (
            <span className="text-lg font-semibold text-muted-foreground">—</span>
          )}
          {side.champion_key ? (
            // The leading space is real text, not margin: `ml-2` separates
            // these visually but leaves "Fakeron Azir" for anything reading
            // the text — a screen reader, a copy-paste, a snapshot.
            <span className="ml-2 text-sm text-muted-foreground">{" "}on {side.champion_key}</span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {side.team ? (
              <Link
                className="text-xs text-muted-foreground hover:underline"
                to={profilePath("team", side.team.team_key)}
              >
                {side.team.display_name}
              </Link>
            ) : null}
            <FocusBadge side={side} />
          </div>
        </div>
      </div>

      {side.conflicts.map((c) => (
        <p
          key={c}
          className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
          data-testid={`matchup-conflict-${c}`}
        >
          {CONFLICT_TEXT[c] ?? c}
        </p>
      ))}

      {side.comparison ? (
        <ScopeGrid comparison={side.comparison} />
      ) : (
        <EmptyRow label="Select a team, lane, player and champion to see the four-scope record." />
      )}
    </Card>
  );
}

function PoolTable({ side, label }: { side: MatchupSide; label: string }) {
  const pool = side.pool;
  if (!pool) return null;
  return (
    <div data-testid={`matchup-pool-${label.toLowerCase()}`}>
      <div className="mb-1 text-xs font-medium">
        {side.player?.display_name} · {pool.pool_size} demonstrated picks in {pool.scope_label}
      </div>
      {pool.participation === "did_not_participate" ? (
        <EmptyRow label={`Did not participate in ${pool.scope_label}. This is not a record of zero picks.`} />
      ) : (
        <TableScroll>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/60 text-left">
                <th className="py-1 pr-3 font-medium">Champion</th>
                <th className="py-1 pr-3 font-medium">Games</th>
                <th className="py-1 pr-3 font-medium">Record</th>
                <th className="py-1 pr-3 font-medium">Win rate</th>
                <th className="py-1 pr-3 font-medium">Share</th>
                <th className="py-1 font-medium">Last played</th>
              </tr>
            </thead>
            <tbody>
              {pool.champions.map((c) => (
                <tr key={c.key} className={c.banned ? "text-muted-foreground line-through" : undefined}>
                  <td className="py-1 pr-3">{c.key}</td>
                  <td className="py-1 pr-3 tabular-nums">{c.games}</td>
                  <td className="py-1 pr-3 tabular-nums">{formatRecord(c.wins, c.losses)}</td>
                  <td className="py-1 pr-3 tabular-nums">{formatRate(c.win_rate)}</td>
                  <td className="py-1 pr-3 tabular-nums">{formatRate(c.champion_share)}</td>
                  <td className="py-1 tabular-nums">{formatDate(c.last_played_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

function RosterContext({ side, label }: { side: MatchupSide; label: string }) {
  const roster = side.roster;
  if (!roster) return null;
  const lane = side.lane_candidates;
  return (
    <div className="text-xs" data-testid={`matchup-roster-${label.toLowerCase()}`}>
      <div className="font-medium">
        {side.team?.display_name} — {roster.team_games_in_scope} games in {roster.scope_label}
      </div>
      <div className="mt-0.5 text-muted-foreground">
        Demonstrated roster: <span className="font-medium">{roster.completeness.state}</span>
        {roster.completeness.roles_missing.length
          ? ` · no player in ${roster.completeness.roles_missing.join(", ")}`
          : ""}
      </div>
      {lane && lane.ambiguous ? (
        <div className="mt-0.5 text-amber-600 dark:text-amber-500" data-testid={`matchup-lane-ambiguous-${label.toLowerCase()}`}>
          {lane.ambiguous_reason ?? `${lane.lane}: no clear starter`} — pick one; the corpus does not name a starter.
        </div>
      ) : null}
      {lane && !lane.lane_covered ? (
        <div className="mt-0.5 text-muted-foreground">
          Nobody played {lane.lane} for this team in {roster.scope_label}.
        </div>
      ) : null}
    </div>
  );
}

// --- mechanics --------------------------------------------------------------

const MECHANICS_ROWS: { label: string; pick: (d: ChampionDoc) => string }[] = [
  { label: "Resource", pick: (d) => d.champion.resource_type ?? "—" },
  { label: "Attack range", pick: (d) => fmt(d.stats?.attack_range) },
  { label: "Base HP", pick: (d) => fmt(d.stats?.hp) },
  { label: "Base armor", pick: (d) => fmt(d.stats?.armor) },
  { label: "Base MR", pick: (d) => fmt(d.stats?.magic_resist) },
  { label: "Base AD", pick: (d) => fmt(d.stats?.ad) },
  { label: "Move speed", pick: (d) => fmt(d.stats?.move_speed) },
];

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

function abilityLine(doc: ChampionDoc, slot: string): string {
  const ability = doc.abilities.find((a) => a.slot === slot);
  if (!ability) return "—";
  const bits: string[] = [];
  if (ability.name) bits.push(ability.name);
  if (ability.cooldown?.raw) bits.push(`CD ${ability.cooldown.raw}`);
  if (ability.cost?.raw) bits.push(`cost ${ability.cost.raw}`);
  if (ability.range?.raw) bits.push(`range ${ability.range.raw}`);
  return bits.length ? bits.join(" · ") : "—";
}

function MechanicsPanel({ data }: { data: MatchupResponse }) {
  const a = data.sides.a.champion_key;
  const b = data.sides.b.champion_key;
  // Keyed by champion, and only ever ADDED to. Swapping champion A must not
  // refetch champion B's document: the Explorer's whole interaction is
  // changing one side at a time, and a champion's mechanics do not depend on
  // its opponent. Cached across every swap the reader makes on this page.
  const [docs, setDocs] = useState<Record<string, ChampionDoc | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const wanted = [a, b].filter((k): k is string => Boolean(k));
    const missing = [...new Set(wanted)].filter((k) => !(k in docs));
    if (!missing.length) return;
    Promise.all(
      missing.map((k) =>
        getChampionDoc(championSlug(k))
          .then((doc) => [k, doc] as const)
          .catch(() => [k, null] as const),
      ),
    ).then((pairs) => {
      if (!live) return;
      setDocs((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      if (pairs.some(([, doc]) => doc === null)) {
        setError("Champion documentation is unavailable for at least one selection.");
      }
    });
    return () => {
      live = false;
    };
  }, [a, b, docs]);

  if (!a || !b) return null;
  const docA = docs[a];
  const docB = docs[b];
  if (!docA && !docB) return null;

  const rows = [
    ...MECHANICS_ROWS.map((r) => ({
      label: r.label,
      a: docA ? r.pick(docA) : "—",
      b: docB ? r.pick(docB) : "—",
    })),
    ...["P", "Q", "W", "E", "R"].map((slot) => ({
      label: slot === "P" ? "Passive" : slot,
      a: docA ? abilityLine(docA, slot) : "—",
      b: docB ? abilityLine(docB, slot) : "—",
    })),
  ];

  return (
    <>
      {/* Champion A vs Champion B, as an event. The mechanics table below is
          the same League Docs authority Phase 1 rendered — what Phase 3 adds
          is the identification, so the reader sees WHICH duel these numbers
          describe before reading a single cooldown. */}
      <div className="dossier-champvs" data-testid="matchup-champion-vs">
        <div className="dossier-champvs__side">
          <ChampionIcon champion={a} size="lg" />
          <span className="dossier-champvs__name">{a}</span>
        </div>
        <span className="dossier-champvs__glyph" aria-label="versus">
          VS
        </span>
        <div className="dossier-champvs__side is-right">
          <ChampionIcon champion={b} size="lg" />
          <span className="dossier-champvs__name">{b}</span>
        </div>
      </div>
    <Panel
      title="Mechanics Analysis"
      note={
        <>
          Base stats, cooldowns, costs and ranges come from the League Docs champion authority, unchanged.
          Cooldowns and costs are shown per rank exactly as recorded. Full pages:{" "}
          <Link className="underline" to={`/lol/docs/champions/${championSlug(a)}`}>
            {a}
          </Link>{" "}
          ·{" "}
          <Link className="underline" to={`/lol/docs/champions/${championSlug(b)}`}>
            {b}
          </Link>
          .
        </>
      }
    >
      {error ? <Note>{error}</Note> : null}
      <TableScroll>
        <table className="w-full text-xs" data-testid="matchup-mechanics">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/60 text-left">
              <th className="py-1 pr-3 font-medium" />
              <th className="py-1 pr-3 font-medium">{a}</th>
              <th className="py-1 font-medium">{b}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/30 last:border-0">
                <td className="py-1 pr-3 text-muted-foreground">{r.label}</td>
                <td className="py-1 pr-3">{r.a}</td>
                <td className="py-1">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
    </>
  );
}

// --- page -------------------------------------------------------------------

/**
 * Lane mode — Phase 1's explorer, unchanged in behaviour and still the
 * default. It is a component rather than the page body only so that team mode
 * can be the page's other half; every control, rule and label below is the
 * one Phase 1 shipped.
 */
function LaneExplorer({
  contract,
  data,
  selection,
  apply,
  onSwitchToTeam,
}: {
  contract: MatchupContract;
  data: MatchupResponse;
  selection: MatchupSelection;
  apply: (next: MatchupSelection) => void;
  onSwitchToTeam: () => void;
}) {
  return (
    <Dossier>
      {selection.team_a && selection.team_b ? (
        // Back to the board, keeping the teams, bans and scope. The round
        // trip loses only the lane, which is what the reader just chose.
        <div className="mb-3">
          <button
            type="button"
            className="dossier-btn"
            data-testid="lane-to-team"
            onClick={onSwitchToTeam}
          >
            ← Five-lane board for these teams
          </button>
        </div>
      ) : null}
      <Panel
        title="Lane Study · configuration"
        note={
          contract.focus_set.pending_slots.length ? (
            <>
              {contract.focus_set.pending_slots.map((s) => (
                <span key={s.group} data-testid="matchup-pending-slot">
                  {s.count} unresolved {s.group} slot{s.count === 1 ? "" : "s"}: {s.reason}
                </span>
              ))}
            </>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TeamPicker contract={contract} selection={selection} side="a" onChange={apply} />
          <TeamPicker contract={contract} selection={selection} side="b" onChange={apply} />
          <Field
            label="Lane"
            testId="matchup-lane"
            placeholder="Select a lane…"
            value={selection.lane}
            options={contract.lanes.map((l) => ({ value: l, label: l }))}
            onChange={(v) => apply(withLane(selection, v))}
          />
          <Field
            label="Pool scope"
            testId="matchup-pool-scope"
            placeholder="Pool scope"
            value={selection.pool_scope_id}
            options={contract.scopes.map((s) => ({ value: s.scope_id, label: s.label }))}
            onChange={(v) => apply(withPoolScope(selection, v || contract.default_pool_scope_id))}
          />
          <div className="self-end text-[11px] text-muted-foreground">
            Roster and demonstrated picks are drawn from the pool scope. The four comparison cards
            below always cover {contract.scopes.map((s) => s.label).join(", ")}.
          </div>
          <PlayerPicker data={data} selection={selection} side="a" onChange={apply} />
          <PlayerPicker data={data} selection={selection} side="b" onChange={apply} />
          <ChampionPicker data={data} selection={selection} side="a" onChange={apply} />
          <ChampionPicker data={data} selection={selection} side="b" onChange={apply} />
        </div>
        <div className="mt-4">
          <BanBar data={data} selection={selection} onChange={apply} />
        </div>
      </Panel>

      <DossierSection
        title="Independent performance comparison"
        eyebrow="Lane dossier"
        testId="dossier-lane-comparison"
      >
        {/* The flag is asserted, not assumed. If a future payload ever carried
            a true head-to-head this heading would be wrong, so the render is
            conditioned on it being false. The heading now NAMES what this is
            rather than opening with what it is not; the denial itself still
            ships, as the note under the plates. */}
        {data.head_to_head === false ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="matchup-sides">
            <SideCard side={data.sides.a} label="A" />
            <SideCard side={data.sides.b} label="B" />
          </div>
        ) : null}
        <MogzyNote testId="lane-side-by-side-note">{data.notes.side_by_side}</MogzyNote>
      </DossierSection>

      <MechanicsPanel data={data} />

      {data.sides.a.pool || data.sides.b.pool ? (
        <Panel title="Demonstrated picks" note={data.notes.pool}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <PoolTable side={data.sides.a} label="A" />
            <PoolTable side={data.sides.b} label="B" />
          </div>
        </Panel>
      ) : null}

      {data.sides.a.roster || data.sides.b.roster ? (
        <Panel title="Roster context">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RosterContext side={data.sides.a} label="A" />
            <RosterContext side={data.sides.b} label="B" />
          </div>
        </Panel>
      ) : null}
    </Dossier>
  );
}

export function MatchupBody() {
  const [params, setParams] = useSearchParams();
  const [contract, setContract] = useState<MatchupContract | null>(null);
  const [data, setData] = useState<MatchupResponse | null>(null);
  const [teamData, setTeamData] = useState<TeamMatchupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abort = useRef<AbortController | null>(null);

  // The URL is the state, in both modes. Reading it here rather than holding a
  // second copy is what makes back/forward and a pasted link behave
  // identically — including a link that crosses between the two boards.
  const mode = useMemo(() => modeFromParams(params), [params]);
  const selection = useMemo(() => selectionFromParams(params), [params]);
  const teamSelection = useMemo(() => teamSelectionFromParams(params), [params]);

  const apply = useCallback(
    (next: MatchupSelection) => {
      setParams(selectionToParams(next), { replace: false });
    },
    [setParams],
  );

  const applyTeam = useCallback(
    (next: TeamSelection) => {
      setParams(teamSelectionToParams(next), { replace: false });
    },
    [setParams],
  );

  // Crossing between the boards carries everything the other board can hold.
  // Lane -> team drops the lane, the players and the champions, because a
  // board has no place to put them; team -> lane keeps the teams, bans and
  // scope and leaves the lane for the reader.
  const toTeam = useCallback(
    () => applyTeam(teamSelectionFromLane(selection)),
    [applyTeam, selection],
  );
  const toLane = useCallback(() => {
    apply({
      ...EMPTY_SELECTION,
      team_a: teamSelection.team_a,
      team_b: teamSelection.team_b,
      bans: teamSelection.bans,
      pool_scope_id: teamSelection.scope_id,
    });
  }, [apply, teamSelection]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchupContract(controller.signal)
      .then(setContract)
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setError((err as Error).message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    const request =
      mode === "team"
        ? fetchTeamMatchup(teamSelection, controller.signal).then((res) => {
            if (!controller.signal.aborted) setTeamData(res);
          })
        : fetchMatchup(selection, controller.signal).then((res) => {
            if (!controller.signal.aborted) setData(res);
          });
    request
      .then(() => {
        if (!controller.signal.aborted) setError(null);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError((err as Error).message || "Could not load the matchup");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `mode` is derived from the same params as both selections, so the two
    // selection objects are the honest dependency list.
  }, [mode, selection, teamSelection]);

  const ready = mode === "team" ? teamData : data;
  if (error && !ready) return <ErrorBlock message={error} />;
  if (!contract || !ready) return <LoadingBlock />;

  return (
    <ResearchPage>
      <ResearchBreadcrumb trail={[{ label: "Matchup Explorer" }]} />
      <h1 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
        {contract.focus_set.target_event} Matchup Explorer
      </h1>
      {/* The focus-set caveat still ships on every render, in both modes, and
          is one click from every reader — not hidden, and not read only by a
          screen reader. What Phase 3 removed is its place as the first
          paragraph the page shows. It lives here, once, rather than being
          repeated by the dossier header. */}
      <div className="proplay-dossier mb-3">
        <FinePrint testId="matchup-focus-note">{contract.notes.focus}</FinePrint>
      </div>

      <div className="mb-4 flex gap-1" role="tablist" aria-label="Explorer mode">
        {(["team", "lane"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`matchup-mode-${m}`}
            onClick={m === "team" ? toTeam : toLane}
            className={[
              "rounded-md border px-3 py-1 text-xs transition-colors",
              mode === m
                ? "border-foreground/30 bg-muted font-medium"
                : "border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {m === "team" ? "Five-lane board" : "Lane explorer"}
          </button>
        ))}
      </div>

      {error ? <ErrorBlock message={error} /> : null}

      {mode === "team" && teamData ? (
        <TeamBoard
          contract={contract}
          data={teamData}
          selection={teamSelection}
          onChange={applyTeam}
          onSwitchToLane={toLane}
        />
      ) : null}

      {mode !== "team" && data ? (
        <LaneExplorer
          contract={contract}
          data={data}
          selection={selection}
          apply={apply}
          onSwitchToTeam={toTeam}
        />
      ) : null}

      {loading ? <Note>Updating…</Note> : null}
    </ResearchPage>
  );
}

export default function ProPlayMatchup() {
  return (
    <>
      <SEOHead
        title="Worlds Matchup Explorer | Mogzy Pro Play"
        description="Configure a professional lane matchup and compare both players on their chosen champions across four standard scopes."
        path="/lol/pro-play/matchup"
        noindex
      />
      <AdminAuthGate>
        <MatchupBody />
      </AdminAuthGate>
    </>
  );
}
