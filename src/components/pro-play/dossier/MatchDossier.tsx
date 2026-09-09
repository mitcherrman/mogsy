// ---------------------------------------------------------------------------
// The dossier's own parts: the VS header, the scope rail, the five lane
// plates, and the team-v-team summary.
//
// THE HIERARCHY THIS FILE ENCODES. The old board asked eight questions before
// it answered one. The order here is the reader's:
//
//   1. Who is playing?          -> MatchHeader
//   2. Over what window?        -> ScopeRail
//   3. What are the five lanes? -> LanePlate x5
//   4. Where do I go deeper?    -> each plate's "Open lane dossier"
//
// WHAT IS VISUAL AND WHAT IS SEMANTIC. Phase 3 changes weight, never wording.
// Three states still print distinctly and a starter is still never forced:
//
//   clear_starter — one candidate, wearing "demonstrated starter", which is a
//                   verdict about games ALREADY PLAYED.
//   timeshare     — every candidate, side by side, with the server's own
//                   reason. It is styled as a FINDING (a cyan technical
//                   annotation), not as a warning, because "these two split
//                   the lane" is information, not a failure.
//   uncovered     — an explicit empty plate that says nobody played the lane
//                   in this scope. Not zero games. Not a missing player.
//
// `is_starter` is the only field that may draw the starter badge, and the
// drilldown link is built from the SERVER's selection — so a timeshare side
// still arrives at the lane view unfilled.
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

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
  type TeamSelection,
  withTeamSide,
  type TeamHeader,
  type TeamMatchupResponse,
} from "@/lib/pro-play/matchupApi";
import { PRO_PLAY_MATCHUP_ROUTE } from "@/lib/pro-play/routes";

import { ChampionPoolSummary } from "./ChampionPool";
import { Disclosure, DossierSection, Figure, Parchment } from "./DossierChrome";
import { ChampionIcon, PlayerPortrait, TeamCrest } from "./DossierMedia";

/** Each lane state in the reader's words. All three are about games played. */
const LANE_STATE_TEXT: Record<string, string> = {
  [LANE_CLEAR_STARTER]: "One player demonstrably held this lane in the selected scope.",
  [LANE_TIMESHARE]: "Shared lane — the corpus does not show a clear starter.",
  [LANE_UNCOVERED]: "Nobody played this lane for this team in the selected scope.",
};

const LANE_STATE_LABEL: Record<string, string> = {
  [LANE_TIMESHARE]: "timeshare",
  [LANE_UNCOVERED]: "unresolved",
};

// --- 1. who is playing ------------------------------------------------------

/**
 * One side of the VS banner — and the ONLY way a team is chosen.
 *
 * The Explorer used to carry two selectors: this banner, which showed the
 * matchup, and a disclosure below the dossier, which changed it. Two controls
 * for one decision is one too many, and the one that looked like the subject
 * was not the one that owned it. So the banner IS the control now: the crest,
 * the name and the whole plate are a single click target over a native
 * `<select>`.
 *
 * A NATIVE SELECT ON PURPOSE. It is keyboard-navigable, it is a real form
 * control for a screen reader, and on a phone it opens the platform's own
 * picker rather than a bespoke popover that has to reimplement scroll,
 * dismissal and focus trapping. It is transparent and stretched over the plate,
 * so the visible chrome stays the dossier's while the semantics stay the
 * browser's.
 */
function TeamChooser({
  header,
  align,
  contract,
  selection,
  side,
  onChange,
}: {
  header: TeamHeader | null;
  align: "left" | "right";
  contract: MatchupContract;
  selection: TeamSelection;
  side: "a" | "b";
  onChange: (next: TeamSelection) => void;
}) {
  const value = side === "a" ? selection.team_a : selection.team_b;
  return (
    <div
      className={`dossier-vs__team is-${align}`}
      data-testid={header ? `vs-team-${header.team_key}` : "vs-team-empty"}
    >
      <TeamCrest
        name={header?.display_name ?? "?"}
        shortCode={header?.focus.owner_label ?? "?"}
        entityKey={header?.team_key}
      />
      <div className="dossier-vs__names">
        <span className="dossier-vs__name">
          {header ? header.display_name : "Choose a team"}
        </span>
        {/* The org's own short label and its region. The focus STATUS is not
            printed: with no qualification claimed anywhere on this page there
            is nothing for the word "watchlist" to correct, and it read as a
            label on the team rather than on Mogzy's interest. The field is
            untouched in the payload — see `header.focus`. */}
        <span className="dossier-vs__meta">
          {header
            ? `${header.focus.owner_label}${header.focus.group ? ` · ${header.focus.group}` : ""}`
            : "Select from the focus set"}
          <span className="dossier-vs__change" aria-hidden="true">
            change
          </span>
        </span>
      </div>
      <select
        className="dossier-vs__select"
        value={value ?? ""}
        aria-label={`Team ${side.toUpperCase()}`}
        data-testid={`team-select-${side}`}
        onChange={(e) => onChange(withTeamSide(selection, side, e.target.value || null))}
      >
        <option value="">Select a team…</option>
        {contract.focus_set.teams.map((t) => (
          <option key={t.team_key} value={t.team_key}>
            {t.owner_label} — {t.team_key}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MatchHeader({
  data,
  contract,
  selection,
  onChange,
}: {
  data: TeamMatchupResponse;
  contract: MatchupContract;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  const { a, b } = data.teams;
  return (
    <header className="dossier-vs" data-testid="team-heading">
      <span className="dossier-vs__watermark" aria-hidden="true" />
      {/* The event survives as a kicker, not as the page's name. It says what
          this dossier is curated FOR without putting a year in the title of a
          product that outlives it. */}
      <div className="dossier-vs__eyebrow">
        <span>{contract.focus_set.target_event} · Scouting Dossier</span>
        <span className="dossier-vs__scope" data-testid="dossier-header-scope">
          {data.scope.scope_label}
        </span>
      </div>
      <div className="dossier-vs__row">
        <TeamChooser
          header={a}
          align="left"
          contract={contract}
          selection={selection}
          side="a"
          onChange={onChange}
        />
        <span className="dossier-vs__glyph" aria-label="versus" data-testid="dossier-vs-glyph">
          VS
        </span>
        <TeamChooser
          header={b}
          align="right"
          contract={contract}
          selection={selection}
          side="b"
          onChange={onChange}
        />
      </div>
    </header>
  );
}

// --- 2. the window ----------------------------------------------------------

export function ScopeRail({
  contract,
  scopeId,
  onChange,
}: {
  contract: MatchupContract;
  scopeId: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="dossier-scoperail" role="group" aria-label="Comparison scope" data-testid="dossier-scope-rail">
      <span className="dossier-scoperail__label">Scope</span>
      <div className="dossier-scoperail__options">
        {contract.scopes.map((s) => (
          <button
            key={s.scope_id}
            type="button"
            aria-pressed={s.scope_id === scopeId}
            data-testid={`dossier-scope-${s.scope_id}`}
            className={["dossier-scoperail__btn", s.scope_id === scopeId ? "is-active" : ""].join(" ")}
            onClick={() => onChange(s.scope_id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- 3. the five lanes ------------------------------------------------------

function CandidateFace({
  candidate,
  state,
  preview,
  align,
}: {
  candidate: LaneCandidate;
  state: string;
  preview: number;
  align: "left" | "right";
}) {
  const rec = candidate.record;
  return (
    <div className="dossier-player" data-testid={`candidate-${candidate.player_lp_page}`}>
      <div className={`dossier-player__id is-${align}`}>
        <PlayerPortrait
          name={candidate.display_name}
          entityKey={candidate.player_lp_page}
          size="xl"
        />
        <div className="dossier-player__names">
          <Link className="dossier-player__name" to={profilePath("player", candidate.player_lp_page)}>
            {candidate.display_name}
          </Link>
          <span className="dossier-player__tags">
            {candidate.is_starter && state === LANE_CLEAR_STARTER ? (
              // "demonstrated" is load-bearing and must never be dropped.
              <span className="dossier-badge is-starter" data-testid="starter-badge">
                demonstrated starter
              </span>
            ) : null}
            {candidate.declared_member === false ? (
              <span
                className="dossier-badge is-quiet"
                title="Played in scope, not in the declared roster registry"
              >
                not declared
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {rec ? (
        <div className="dossier-player__figures" data-testid="candidate-record">
          <Figure label="Games" value={rec.games} />
          <Figure label="Record" value={formatRecord(rec.wins, rec.losses)} />
          <Figure label="Win rate" value={formatRate(rec.win_rate)} />
          <Figure
            label="Pool"
            value={rec.champion_pool_size}
            hint={
              candidate.share_of_team_games !== null
                ? `${formatRate(candidate.share_of_team_games)} of team games`
                : undefined
            }
          />
        </div>
      ) : (
        <div className="dossier-player__figures" data-testid="candidate-record">
          <Figure label="Games" value={candidate.games} />
          <Figure label="Wins" value={candidate.wins} />
          <Figure label="Last played" value={formatDate(candidate.last_played_at)} />
        </div>
      )}

      <ChampionPoolSummary
        pool={candidate.pool}
        poolOmitted={candidate.pool_omitted}
        preview={preview}
        testId={`pool-${candidate.player_lp_page}`}
      />
    </div>
  );
}

function LaneHalf({
  side,
  preview,
  align,
}: {
  side: LaneSide | null;
  preview: number;
  align: "left" | "right";
}) {
  if (!side) {
    return (
      <div className="dossier-lane__half" data-testid="lane-half-empty">
        <p className="dossier-muted">Select a team.</p>
      </div>
    );
  }

  if (side.state === LANE_UNCOVERED) {
    return (
      <div className="dossier-lane__half" data-testid={`lane-${side.lane}-${side.team_key}`}>
        <div className="dossier-lane__state" data-testid={`lane-state-${side.lane}-${side.team_key}`}>
          {LANE_STATE_LABEL[LANE_UNCOVERED]}
        </div>
        <p className="dossier-uncovered" data-testid={`lane-uncovered-${side.lane}-${side.team_key}`}>
          {LANE_STATE_TEXT[LANE_UNCOVERED]}
        </p>
      </div>
    );
  }

  const many = side.candidates.length > 1;
  const [lead, ...rest] = side.candidates;

  return (
    <div className="dossier-lane__half" data-testid={`lane-${side.lane}-${side.team_key}`}>
      {LANE_STATE_LABEL[side.state] ? (
        <div className="dossier-lane__state" data-testid={`lane-state-${side.lane}-${side.team_key}`}>
          {LANE_STATE_LABEL[side.state]}
        </div>
      ) : null}

      {side.state === LANE_TIMESHARE ? (
        // A finding, not an error. The server's own reason, verbatim.
        <p className="dossier-finding" data-testid={`lane-timeshare-${side.lane}-${side.team_key}`}>
          {side.ambiguous_reason ?? LANE_STATE_TEXT[LANE_TIMESHARE]}
        </p>
      ) : null}

      {side.candidates_total > side.candidates_with_pool ? (
        <p className="dossier-muted" data-testid="lane-pool-bound">
          Picks loaded for {side.candidates_with_pool} of {side.candidates_total}.
        </p>
      ) : null}

      {lead ? <CandidateFace candidate={lead} state={side.state} preview={preview} align={align} /> : null}

      {/* Every candidate is retained. On a timeshare the rest are expanded by
          default — hiding half of a shared lane would BE the forced starter
          this page refuses to name. */}
      {many ? (
        <Disclosure
          label={`Other players in this lane (${rest.length})`}
          openLabel="Hide other players"
          defaultOpen={side.state === LANE_TIMESHARE}
          testId={`lane-more-${side.lane}-${side.team_key}`}
        >
          {rest.map((c) => (
            <CandidateFace
              key={c.player_lp_page}
              candidate={c}
              state={side.state}
              preview={preview}
              align={align}
            />
          ))}
        </Disclosure>
      ) : null}
    </div>
  );
}

export function LanePlate({ row, preview }: { row: LaneRow; preview: number }) {
  return (
    <Parchment className="dossier-lane" testId={`lane-card-${row.lane}`}>
      <div className="dossier-lane__head">
        <h3 className="dossier-lane__name">{row.lane}</h3>
        {row.drilldown ? (
          <Link
            className="dossier-lane__cta"
            data-testid={`lane-drilldown-${row.lane}`}
            to={drilldownUrl(PRO_PLAY_MATCHUP_ROUTE, row.drilldown)}
          >
            Open lane dossier
            {row.drilldown.player_a_prefilled && row.drilldown.player_b_prefilled
              ? ""
              : " (choose players)"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="dossier-muted">Select both teams to open this lane.</span>
        )}
      </div>
      <div className="dossier-lane__body">
        <LaneHalf side={row.a} preview={preview} align="left" />
        <span className="dossier-lane__divider" aria-hidden="true" />
        <LaneHalf side={row.b} preview={preview} align="right" />
      </div>
    </Parchment>
  );
}

// --- 4. team v team ---------------------------------------------------------

export function TeamSummaryPlate({ header }: { header: TeamHeader | null }) {
  if (!header) return null;
  const s = header.champion_summary;
  const participated = s && s.participation === "participated";

  return (
    <Parchment className="dossier-teamsum" testId={`team-summary-${header.team_key}`}>
      <div className="dossier-teamsum__head">
        <TeamCrest
          name={header.display_name}
          shortCode={header.focus.owner_label}
          size="md"
          entityKey={header.team_key}
        />
        <div>
          <Link className="dossier-teamsum__name" to={profilePath("team", header.team_key)}>
            {header.display_name}
          </Link>
          <span className="dossier-teamsum__roster" data-testid={`team-roster-${header.team_key}`}>
            Roster {header.completeness.state}
            {header.completeness.roles_missing.length
              ? ` · no player in ${header.completeness.roles_missing.join(", ")}`
              : ""}
          </span>
        </div>
      </div>

      {participated ? (
        <>
          <div className="dossier-teamsum__figures">
            <Figure label="Games" value={s!.team_games_in_scope} />
            <Figure label="Record" value={formatRecord(s!.wins, s!.losses)} />
            <Figure label="Win rate" value={formatRate(s!.win_rate)} />
            <Figure label="Champions" value={s!.champion_pool_size} hint="diversity in scope" />
          </div>
          <div className="dossier-teamsum__champs">
            <span className="dossier-pool__cat-label">Team's most-played champions</span>
            <div className="dossier-pool__chips">
              {s!.top_champions.map((c) => (
                <span
                  key={c.key}
                  className={["dossier-champ-chip", c.banned ? "is-banned" : ""].join(" ")}
                  data-testid={`team-champ-${header.team_key}-${c.key}`}
                >
                  <ChampionIcon champion={c.key} muted={c.banned} />
                  <span className="dossier-champ-chip__text">
                    <span className="dossier-champ-chip__name">{c.key}</span>
                    <span className="dossier-champ-chip__stat tabular-nums">
                      {c.games}g · {formatRate(c.win_rate)}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="dossier-muted">No games in {s?.scope_label ?? "this scope"}.</p>
      )}
    </Parchment>
  );
}

export function ArchiveWarnings({ data }: { data: TeamMatchupResponse }) {
  if (!data.warnings.length) return null;
  return (
    <DossierSection title="Archive Evidence" eyebrow="Roster notes" testId="dossier-warnings">
      <ul className="dossier-warnings" data-testid="team-warnings">
        {data.warnings.map((w, i) => (
          <li key={`${w.code}-${w.team_key ?? ""}-${w.lane ?? ""}-${i}`} data-testid={`team-warning-${w.code}`}>
            <span className="dossier-warnings__who">{w.team_key ?? "selection"}</span>
            {w.lane ? ` · ${w.lane}` : ""} — {w.detail}
          </li>
        ))}
      </ul>
    </DossierSection>
  );
}
