// ---------------------------------------------------------------------------
// Team mode — the five-lane board, rendered inside the same Explorer page.
//
// A SECOND BOARD, NOT A SECOND EXPLORER. The page, the shell, the URL rules
// and the admin gate are Phase 1's; `mode=team` in the query string chooses
// which board `ProPlayMatchup` renders and which endpoint it calls. Lane mode
// is untouched and is still the default, so every Phase 1 link ever shared
// keeps working.
//
// THE FIVE THINGS THIS SCREEN MUST NOT SAY, and where each is prevented:
//
// 1. "Head-to-head." Ten records on one screen is the most inviting place in
//    the product to read a series score that is not there. The section is
//    headed "Side-by-side record", the render is conditioned on the server's
//    `head_to_head` being false, and the server's sentence is printed under it.
// 2. "This is the starting five." A lane the roster authority will not call is
//    rendered as a timeshare with every candidate and no highlight; only
//    `is_starter` — its verdict about games ALREADY PLAYED — draws the badge,
//    and the badge says "demonstrated starter".
// 3. "Qualified for Worlds." Focus status prints verbatim through Phase 1's
//    `FocusBadge`, and `asserts_qualification` is the only field allowed to
//    change the wording.
// 4. "Champions they can play." The heading is "Demonstrated picks", the
//    server's pool note is printed, and the collapse at `pool_preview` is a
//    DISPLAY point — every row is in the payload and "Show all N" reveals it.
//    There is no minimum-game filter anywhere in this file.
// 5. Any prediction of a draft, a ban, or a result. The server's `team_mode`
//    note denies all four in words and is printed at the top of the board.
//
// MECHANICS ARE NOT RENDERED HERE. Five mechanics panels would bury the board,
// so mechanics stay where Phase 1 put them: one lane drill-down away, in the
// lane view, reading the same public `/api/docs/champions/{slug}` authority.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  EmptyRow,
  Note,
  Panel,
  TableScroll,
} from "@/components/pro-play/ResearchShell";
import { formatDate, formatRate, formatRecord, profilePath } from "@/lib/pro-play/researchApi";
import {
  LANE_CLEAR_STARTER,
  LANE_TIMESHARE,
  LANE_UNCOVERED,
  drilldownUrl,
  type LaneCandidate,
  type LaneRow,
  type LaneSide,
  type MatchupContract,
  type TeamHeader,
  type TeamMatchupResponse,
  type TeamSelection,
  withTeamBanToggled,
  withTeamScope,
  withTeamSide,
  withTeamsSwapped,
} from "@/lib/pro-play/matchupApi";
import { PRO_PLAY_MATCHUP_ROUTE } from "@/lib/pro-play/routes";

/** What each lane state means, in the reader's words. Every one of these is a
 *  statement about games already played — none is about a future lineup. */
const LANE_STATE_TEXT: Record<string, string> = {
  [LANE_CLEAR_STARTER]: "One player demonstrably held this lane in the selected scope.",
  [LANE_TIMESHARE]: "Shared lane — the corpus does not show a clear starter.",
  [LANE_UNCOVERED]: "Nobody played this lane for this team in the selected scope.",
};

/** The lane-level chip. A clear lane carries NO chip: the candidate already
 *  wears the "demonstrated starter" badge, and printing the same words twice
 *  in one card reads as two different claims. Only the two states worth
 *  flagging get a chip. */
const LANE_STATE_LABEL: Record<string, string> = {
  [LANE_TIMESHARE]: "timeshare",
  [LANE_UNCOVERED]: "unresolved",
};

// --- controls ---------------------------------------------------------------

function TeamSelect({
  contract,
  selection,
  side,
  onChange,
}: {
  contract: MatchupContract;
  selection: TeamSelection;
  side: "a" | "b";
  onChange: (next: TeamSelection) => void;
}) {
  const value = side === "a" ? selection.team_a : selection.team_b;
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Team {side.toUpperCase()}
      </span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        value={value ?? ""}
        aria-label={`Team ${side.toUpperCase()}`}
        data-testid={`team-select-${side}`}
        onChange={(e) => onChange(withTeamSide(selection, side, e.target.value || null))}
      >
        <option value="">Select a team…</option>
        {contract.focus_set.teams.map((t) => (
          // The owner's short label beside the canonical key, and the status
          // verbatim. "watchlist" is never rewritten into anything warmer.
          <option key={t.team_key} value={t.team_key}>
            {t.owner_label} — {t.team_key} ({t.status})
          </option>
        ))}
      </select>
    </label>
  );
}

function TeamBanBar({
  data,
  selection,
  onChange,
}: {
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  // Only champions somebody on this board demonstrably plays are offered.
  // Offering all 170 would suggest a draft model that does not exist, and
  // banning a champion nobody picked is a no-op set difference.
  const offered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data.lanes) {
      for (const side of [row.a, row.b]) {
        for (const cand of side?.candidates ?? []) {
          for (const champ of cand.pool?.champions ?? []) {
            counts.set(champ.key, (counts.get(champ.key) ?? 0) + champ.games);
          }
        }
      }
    }
    for (const key of selection.bans) if (!counts.has(key)) counts.set(key, 0);
    // Most-played first: a reader banning by hand reaches for those.
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [data, selection.bans]);

  const [all, setAll] = useState(false);
  if (!offered.length) return null;
  const shown = all ? offered : offered.slice(0, 24);

  return (
    <div data-testid="team-bans">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bans ({selection.bans.length}) — applied to every lane
      </span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(([key]) => {
          const banned = selection.bans.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={banned}
              data-testid={`team-ban-${key}`}
              onClick={() => onChange(withTeamBanToggled(selection, key))}
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
        {offered.length > shown.length ? (
          <button
            type="button"
            className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="team-bans-show-all"
            onClick={() => setAll(true)}
          >
            Show all {offered.length}
          </button>
        ) : null}
      </div>
      <Note>{data.bans.note}</Note>
    </div>
  );
}

// --- one candidate ----------------------------------------------------------

function PoolStrip({ candidate, preview }: { candidate: LaneCandidate; preview: number }) {
  const [all, setAll] = useState(false);
  const pool = candidate.pool;

  if (candidate.pool_omitted) {
    // Declared, not silently absent. The roster row is still here with its
    // games; only the champion-pool FETCH was bounded, and the lane view
    // serves this player's complete pool.
    return (
      <p className="mt-1 text-[11px] text-muted-foreground" data-testid="pool-omitted">
        Demonstrated picks not loaded for this candidate — open the lane to see them in full.
      </p>
    );
  }
  if (!pool) return null;
  if (pool.participation === "did_not_participate") {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Did not participate in {pool.scope_label}. This is not a record of zero picks.
      </p>
    );
  }
  if (!pool.champions.length) {
    return <p className="mt-1 text-[11px] text-muted-foreground">No picks in {pool.scope_label}.</p>;
  }

  const shown = all ? pool.champions : pool.champions.slice(0, preview);
  return (
    <div className="mt-1.5" data-testid="pool-strip">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Demonstrated picks · {pool.pool_size} in {pool.scope_label}
      </div>
      <TableScroll>
        <table className="w-full text-[11px]">
          <tbody>
            {shown.map((c) => (
              <tr
                key={c.key}
                className={c.banned ? "text-muted-foreground line-through" : undefined}
                data-testid={`pool-row-${c.key}`}
              >
                <td className="py-0.5 pr-2">{c.key}</td>
                <td className="py-0.5 pr-2 tabular-nums">{c.games}g</td>
                <td className="py-0.5 pr-2 tabular-nums">{formatRecord(c.wins, c.losses)}</td>
                <td className="py-0.5 pr-2 tabular-nums">{formatRate(c.win_rate)}</td>
                <td className="py-0.5 tabular-nums text-muted-foreground">{formatRate(c.champion_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {pool.champions.length > shown.length ? (
        // A DISPLAY toggle over data already in hand — not a fetch, and not a
        // filter. The low-presence tail is one click away and always present.
        <button
          type="button"
          className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground"
          data-testid="pool-show-all"
          onClick={() => setAll(true)}
        >
          Show all {pool.champions.length} demonstrated picks
        </button>
      ) : null}
    </div>
  );
}

function CandidateBlock({
  candidate,
  preview,
  state,
}: {
  candidate: LaneCandidate;
  preview: number;
  state: string;
}) {
  return (
    <div className="mb-2 last:mb-0" data-testid={`candidate-${candidate.player_lp_page}`}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <Link
          className="text-sm font-semibold hover:underline"
          to={profilePath("player", candidate.player_lp_page)}
        >
          {candidate.display_name}
        </Link>
        {candidate.is_starter && state === LANE_CLEAR_STARTER ? (
          // The roster authority's verdict about games already played. The
          // word "demonstrated" is load-bearing and must not be dropped.
          <Badge variant="secondary" className="text-[9px]" data-testid="starter-badge">
            demonstrated starter
          </Badge>
        ) : null}
        {candidate.declared_member === false ? (
          <span className="text-[10px] text-muted-foreground" title="Played in scope, not in the declared roster registry">
            not declared
          </span>
        ) : null}
      </div>
      {candidate.record ? (
        <div className="text-[11px] text-muted-foreground tabular-nums" data-testid="candidate-record">
          {candidate.record.games} games · {formatRecord(candidate.record.wins, candidate.record.losses)} ·{" "}
          {formatRate(candidate.record.win_rate)} · {candidate.record.champion_pool_size} champions
          {candidate.share_of_team_games !== null
            ? ` · ${formatRate(candidate.share_of_team_games)} of team games`
            : ""}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {candidate.games} games · {candidate.wins}W
          {candidate.last_played_at ? ` · last ${formatDate(candidate.last_played_at)}` : ""}
        </div>
      )}
      <PoolStrip candidate={candidate} preview={preview} />
    </div>
  );
}

// --- one lane, one side -----------------------------------------------------

function LaneHalf({ side, preview }: { side: LaneSide | null; preview: number }) {
  if (!side) return <EmptyRow label="Select a team." />;
  return (
    <div data-testid={`lane-${side.lane}-${side.team_key}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {LANE_STATE_LABEL[side.state] ? (
          <span
            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500"
            data-testid={`lane-state-${side.lane}-${side.team_key}`}
          >
            {LANE_STATE_LABEL[side.state]}
          </span>
        ) : null}
        {side.candidates_total > side.candidates_with_pool ? (
          <span className="text-[10px] text-muted-foreground" data-testid="lane-pool-bound">
            picks loaded for {side.candidates_with_pool} of {side.candidates_total}
          </span>
        ) : null}
      </div>

      {side.state === LANE_UNCOVERED ? (
        <EmptyRow label={LANE_STATE_TEXT[LANE_UNCOVERED]} />
      ) : (
        <>
          {side.state === LANE_TIMESHARE ? (
            <p
              className="mb-1.5 text-[11px] text-amber-700 dark:text-amber-500"
              data-testid={`lane-timeshare-${side.lane}-${side.team_key}`}
            >
              {side.ambiguous_reason ?? LANE_STATE_TEXT[LANE_TIMESHARE]}
            </p>
          ) : null}
          {side.candidates.map((c) => (
            <CandidateBlock key={c.player_lp_page} candidate={c} preview={preview} state={side.state} />
          ))}
        </>
      )}
    </div>
  );
}

function LaneCard({
  row,
  preview,
  data,
}: {
  row: LaneRow;
  preview: number;
  data: TeamMatchupResponse;
}) {
  return (
    <Card className="p-3" data-testid={`lane-card-${row.lane}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">{row.lane}</h3>
        {row.drilldown ? (
          // URL-driven, and built from the SERVER's drilldown selection — the
          // teams, lane, bans and scope carry over, and a player is pre-filled
          // only where the roster authority named one.
          <Link
            className="text-[11px] underline text-muted-foreground hover:text-foreground"
            data-testid={`lane-drilldown-${row.lane}`}
            to={drilldownUrl(PRO_PLAY_MATCHUP_ROUTE, row.drilldown)}
          >
            Open lane
            {row.drilldown.player_a_prefilled && row.drilldown.player_b_prefilled ? "" : " (choose players)"}
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LaneHalf side={row.a} preview={preview} />
        <LaneHalf side={row.b} preview={preview} />
      </div>
      {row.drilldown ? null : (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Select both teams to open this lane in detail.
        </p>
      )}
      <span className="sr-only">{data.notes.side_by_side}</span>
    </Card>
  );
}

// --- secondary panels -------------------------------------------------------

function TeamSummaryCard({ header }: { header: TeamHeader | null }) {
  if (!header) return null;
  const summary = header.champion_summary;
  return (
    <div className="text-xs" data-testid={`team-summary-${header.team_key}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <Link className="font-semibold hover:underline" to={profilePath("team", header.team_key)}>
          {header.display_name}
        </Link>
        {/* Verbatim status. `asserts_qualification` is the only field that may
            change this wording, and it is the server's. */}
        <Badge
          variant={header.focus.asserts_qualification ? "default" : "secondary"}
          className="text-[9px]"
          data-testid={`team-focus-${header.team_key}`}
        >
          {header.focus.status}
          {header.focus.asserts_qualification ? " · slot claimed" : ""}
        </Badge>
        <span className="text-muted-foreground">
          roster {header.completeness.state}
          {header.completeness.roles_missing.length
            ? ` · no player in ${header.completeness.roles_missing.join(", ")}`
            : ""}
        </span>
      </div>
      {summary && summary.participation === "participated" ? (
        <>
          <div className="mb-1 text-muted-foreground tabular-nums">
            {summary.team_games_in_scope} games · {formatRecord(summary.wins, summary.losses)} ·{" "}
            {formatRate(summary.win_rate)} · {summary.champion_pool_size} champions in {summary.scope_label}
          </div>
          <div className="flex flex-wrap gap-1">
            {summary.top_champions.map((c) => (
              <span
                key={c.key}
                className={[
                  "rounded border border-border px-1.5 py-0.5 text-[10px] tabular-nums",
                  c.banned ? "text-muted-foreground line-through" : "",
                ].join(" ")}
                data-testid={`team-champ-${header.team_key}-${c.key}`}
              >
                {c.key} {c.games}g {formatRate(c.win_rate)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <EmptyRow label={`No games in ${summary?.scope_label ?? "this scope"}.`} />
      )}
    </div>
  );
}

function WarningList({ data }: { data: TeamMatchupResponse }) {
  if (!data.warnings.length) return null;
  return (
    <ul className="space-y-1 text-xs" data-testid="team-warnings">
      {data.warnings.map((w, i) => (
        <li key={`${w.code}-${w.team_key ?? ""}-${w.lane ?? ""}-${i}`} data-testid={`team-warning-${w.code}`}>
          <span className="font-medium">{w.team_key ?? "selection"}</span>
          {w.lane ? ` · ${w.lane}` : ""} — {w.detail}
        </li>
      ))}
    </ul>
  );
}

// --- the board --------------------------------------------------------------

export function TeamBoard({
  contract,
  data,
  selection,
  onChange,
  onSwitchToLane,
}: {
  contract: MatchupContract;
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
  onSwitchToLane: () => void;
}) {
  const headerA = data.teams.a;
  const headerB = data.teams.b;

  return (
    <>
      <Panel title="Teams" note={data.notes.team_mode}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TeamSelect contract={contract} selection={selection} side="a" onChange={onChange} />
          <TeamSelect contract={contract} selection={selection} side="b" onChange={onChange} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Scope
            </span>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={selection.scope_id}
              aria-label="Scope"
              data-testid="team-scope"
              onChange={(e) => onChange(withTeamScope(selection, e.target.value))}
            >
              {contract.scopes.map((s) => (
                <option key={s.scope_id} value={s.scope_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
              data-testid="team-swap"
              onClick={() => onChange(withTeamsSwapped(selection))}
            >
              Swap sides
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
              data-testid="team-to-lane"
              onClick={onSwitchToLane}
            >
              Lane explorer
            </button>
          </div>
        </div>
        <div className="mt-3">
          <TeamBanBar data={data} selection={selection} onChange={onChange} />
        </div>
      </Panel>

      {headerA && headerB ? (
        <h2 className="mb-2 mt-1 text-lg font-semibold tracking-tight" data-testid="team-heading">
          {headerA.display_name} vs {headerB.display_name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{data.scope.scope_label}</span>
        </h2>
      ) : null}

      <Panel title="Side-by-side record" note={data.notes.side_by_side}>
        {/* Asserted, not assumed. Ten records at once is exactly where a
            reader would invent a series score, so nothing renders unless the
            server says this is not head-to-head. */}
        {data.head_to_head === false ? (
          <div className="space-y-3" data-testid="lane-board">
            {data.lanes.map((row) => (
              <LaneCard key={row.lane} row={row} preview={data.pool_preview} data={data} />
            ))}
          </div>
        ) : null}
        <Note>{data.notes.pool}</Note>
        <Note>{data.notes.pool_bound}</Note>
      </Panel>

      {headerA || headerB ? (
        <Panel title="Team champion summary" note={data.notes.team_summary}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TeamSummaryCard header={headerA} />
            <TeamSummaryCard header={headerB} />
          </div>
        </Panel>
      ) : null}

      {data.warnings.length ? (
        <Panel title="Roster notes">
          <WarningList data={data} />
        </Panel>
      ) : null}
    </>
  );
}
