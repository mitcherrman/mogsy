// ---------------------------------------------------------------------------
// Step 3 — the exact matchup study, inside the dossier the reader already has.
//
// ONE LAYER DEEPER, NOT A SECOND APPLICATION. This renders at the foot of
// `PlayerChampionDrawer`, in the same drawer, with the same tokens, the same
// density and the same rule that every definition on screen is the server's.
// It answers the one question the dossier above it deliberately cannot:
// "Doran's Olaf against KIIN'S K'SANTE", joined on the game rather than on the
// team.
//
// WHY THE OPPOSING SIDE IS CHOSEN IN HERE AND NOT ON THE BOARD. The drawer is
// a Radix sheet with a modal overlay: while it is open the board behind it is
// readable but not clickable, so "now click the other lane's tile" is not a
// gesture that exists. The opposing lane's own candidates and their
// demonstrated pools are ALREADY in the board payload, so the chooser is the
// same player-then-champion mechanic the board uses, rendered where the reader
// is, and it costs no request. No second picker, no champion catalogue, no
// modal on a modal.
//
// THE ZERO STATE IS NEVER HIDDEN, and it is never one sentence. "Kiin was not
// in this scope", "Kiin was here but never played K'Sante" and "both played
// their champions but never met" are three different facts, and the server
// sends the standing of both players precisely so this can say which.
//
// OTHER PRO EXAMPLES IS NOT AN EMPTY-STATE FALLBACK. It renders whatever the
// exact sample size is, because "who else has actually played this matchup" is
// a question with its own value. Every row is a real game; the ordering rule
// is the server's and is printed.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

import {
  fetchExactMatchup,
  MatchupApiError,
  REL_BOARD_TEAM,
  REL_SAME_OPPONENT,
  REL_SAME_SUBJECT,
  type ExactMatchupPayload,
  type ExactPlayerFacts,
  type ExactMeeting,
  type ExactStatistics,
  type MeetingSelection,
  type ExampleNavigation,
  type LaneSide,
  type OtherProExample,
  type PoolChampion,
} from "@/lib/pro-play/matchupApi";

import type { ChampionSelection } from "./BoardSelection";
import { ChampionIcon, PlayerPortrait } from "./DossierMedia";

const DID_NOT_PARTICIPATE = "did_not_participate";

/** How many of the opposing player's demonstrated picks the chooser shows
 *  before "Show all". A LAYOUT number, never printed as a fact — the reader
 *  sees "Show all 24", the true size of the pool. Same rule as the board. */
const OPPOSING_POOL_PREVIEW = 12;

/** The relation tiers, in words. The server sends the code; these are the
 *  headings, and every one of them names a counted relation rather than a
 *  judgement — there is no "best", "signature" or "elite" here because there
 *  is no statistic behind those. */
const RELATION_LABEL: Record<string, string> = {
  [REL_SAME_SUBJECT]: "Same player, other opponents",
  [REL_SAME_OPPONENT]: "Same opponent, other players",
  [REL_BOARD_TEAM]: "Involving a team on this board",
};
const RELATION_FALLBACK = "Elsewhere in the professional record";

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function shortDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

// --- choosing the other side ------------------------------------------------

/**
 * The opposing lane, as the board already knows it.
 *
 * Player first, then that player's demonstrated picks — the same order and the
 * same vocabulary as a lane plate, so the reader is doing something they have
 * already done once rather than learning a control.
 */
function OpposingChooser({
  opposition,
  opposingPlayer,
  opposingChampion,
  onChange,
}: {
  opposition: LaneSide;
  opposingPlayer: string | null;
  opposingChampion: string | null;
  onChange: (player: string | null, champion: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const candidates = opposition.candidates ?? [];
  const active = candidates.find((c) => c.player_lp_page === opposingPlayer) ?? null;
  // A lane with exactly one demonstrated player still shows the chip: naming
  // who is being studied is the point, and a chooser that appears only
  // sometimes is harder to find than one that is always there.
  const pool: PoolChampion[] = active?.pool?.champions ?? [];
  const shown = showAll ? pool : pool.slice(0, OPPOSING_POOL_PREVIEW);

  return (
    <div className="dossier-study__chooser" data-testid="study-chooser">
      <span className="dossier-drawer__statlabel">
        {opposition.lane} · {opposition.team_key}
      </span>
      <div className="dossier-study__players">
        {candidates.map((candidate) => {
          const selected = candidate.player_lp_page === opposingPlayer;
          return (
            <button
              key={candidate.player_lp_page}
              type="button"
              aria-pressed={selected}
              className={`dossier-study__player${selected ? " is-selected" : ""}`}
              data-testid="study-opposing-player"
              onClick={() =>
                // Clicking the chosen player again clears the whole opposing
                // side, so the control is a toggle rather than a trap.
                onChange(selected ? null : candidate.player_lp_page, null)
              }
            >
              <PlayerPortrait
                name={candidate.display_name}
                entityKey={candidate.player_lp_page}
                size="sm"
              />
              <span>{candidate.display_name}</span>
            </button>
          );
        })}
      </div>

      {active ? (
        pool.length ? (
          <>
            <div className="dossier-study__champions">
              {shown.map((champion) => {
                const selected = champion.key === opposingChampion;
                return (
                  <button
                    key={champion.key}
                    type="button"
                    aria-pressed={selected}
                    title={`${champion.key} — ${champion.wins}/${champion.games}`}
                    aria-label={`${champion.key}, ${champion.wins} of ${champion.games}`}
                    className={`dossier-study__champion${selected ? " is-selected" : ""}`}
                    data-testid="study-opposing-champion"
                    onClick={() =>
                      onChange(active.player_lp_page, selected ? null : champion.key)
                    }
                  >
                    <ChampionIcon champion={champion.key} size="sm" />
                    <span className="dossier-study__championrec">
                      {champion.wins}/{champion.games}
                    </span>
                  </button>
                );
              })}
            </div>
            {pool.length > OPPOSING_POOL_PREVIEW ? (
              <button
                type="button"
                className="dossier-btn dossier-study__more"
                data-testid="study-pool-toggle"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show fewer" : `Show all ${pool.length}`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="dossier-drawer__fineprint" data-testid="study-no-pool">
            The board carries no demonstrated picks for {active.display_name} in
            this scope, so there is nothing here to study them on.
          </p>
        )
      ) : (
        <p className="dossier-drawer__fineprint" data-testid="study-prompt">
          Choose the player on the other side of this lane, then the champion
          they played, to see whether these two have actually met.
        </p>
      )}
    </div>
  );
}

// --- the exact record -------------------------------------------------------

/**
 * The truthful zero, in the reader's own terms.
 *
 * WHICH zero this is comes from the server's standing for both players; a
 * single sentence covering all three would be wrong two thirds of the time.
 * Nothing here falls back to the team-level sample in the table above — that
 * is a different question and substituting it would be the exact dishonesty
 * this layer exists to avoid.
 */
function ExactZeroState({
  data,
  subjectName,
  opposingName,
}: {
  data: ExactMatchupPayload;
  subjectName: string;
  opposingName: string;
}) {
  const subject = data.subject;
  const opposing = data.opposing;
  const scope = data.scope.label;

  const absent = [
    subject.participation === DID_NOT_PARTICIPATE ? subjectName : null,
    opposing.participation === DID_NOT_PARTICIPATE ? opposingName : null,
  ].filter(Boolean) as string[];

  let sentence: string;
  if (absent.length) {
    sentence = `${absent.join(" and ")} ${
      absent.length > 1 ? "have" : "has"
    } no games at all in ${scope}, so there is no meeting to report.`;
  } else if (!subject.champion_games_in_scope || !opposing.champion_games_in_scope) {
    const which = !subject.champion_games_in_scope
      ? `${subjectName} did not play ${subject.champion_key}`
      : `${opposingName} did not play ${opposing.champion_key}`;
    sentence = `${which} in ${scope}, so this matchup has no games to report.`;
  } else {
    sentence =
      `No recorded ${subjectName} ${subject.champion_key} vs ${opposingName} ` +
      `${opposing.champion_key} games in ${scope}.`;
  }

  return (
    <div className="dossier-study__zero" data-testid="study-zero">
      <p className="dossier-drawer__empty">{sentence}</p>
      {/* The counts that make the sentence checkable rather than assertable. */}
      <p className="dossier-drawer__fineprint" data-testid="study-zero-counts">
        {subjectName}: {subject.champion_games_in_scope} game
        {subject.champion_games_in_scope === 1 ? "" : "s"} on{" "}
        {subject.champion_key}. {opposingName}:{" "}
        {opposing.champion_games_in_scope} game
        {opposing.champion_games_in_scope === 1 ? "" : "s"} on{" "}
        {opposing.champion_key}.
      </p>
      <p className="dossier-drawer__fineprint">{data.definitions.no_exact_games}</p>
    </div>
  );
}

/**
 * STEP 7 — the exact sample's scouting figures.
 *
 * WHAT THIS SECTION IS FOR. The record above answers "how often, and who
 * won". These answer the next question a scout asks of that answer: "and what
 * did those games typically look like". They are drawn from THE SAME GAMES —
 * the server measures nothing wider — so they support the record rather than
 * competing with it.
 *
 * IT SUPPORTS THE MATCHUP IDENTITY AND MUST NOT DOMINATE IT. The reader still
 * reads who, which champions, how many games and the record BEFORE any of
 * this, so it renders as one compact strip of label-and-value pairs in the
 * drawer's quietest voice — not a stat-card grid, not a table, not a second
 * panel, and never at a larger size than the players' names.
 *
 * NOTHING HERE IS RENDERED WHEN THE SAMPLE IS EMPTY. The zero state above is
 * already the whole answer, and a row of em dashes beneath it would suggest
 * there were figures to be missing.
 *
 * SIGNS ARE CLAIMS. `+286` and `-286` say which way the lane went; `0` is a
 * measured tie and is printed WITHOUT a sign, because a tie has no direction.
 * This is `signedNumber`'s rule from the game dossier, restated rather than
 * imported: that module is Step 5's box score and this is a different surface,
 * so one restyling it should not silently change the other.
 */
function signedFigure(value: number): string {
  if (value === 0) return "0";
  // A median over an even sample really can land on .5, and the server does
  // not round. One decimal is kept only when there is one to keep — "+286.0"
  // would imply a precision the sample does not have.
  const magnitude = Math.abs(value);
  const text = Number.isInteger(magnitude)
    ? magnitude.toLocaleString()
    : magnitude.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : "-"}${text}`;
}

/** The KDA figure, on the dossier's own convention. */
function exactKdaText(stats: ExactStatistics): string {
  const { kda } = stats;
  if (!kda.games) return "—";
  // Deaths really were zero across games that exist. An empty sample cannot
  // reach this branch: the server reports `perfect: false` over zero games,
  // and the block does not render at all.
  if (kda.perfect) return "Perfect";
  return kda.ratio === null ? "—" : kda.ratio.toFixed(2);
}

/**
 * The coverage sentence, or null when there is nothing worth saying.
 *
 * CONCISE PRODUCT LANGUAGE, NOT AN ENGINEERING EXPLANATION. It says how many
 * games a figure covers. It does not name a data source, a pipeline or a
 * table, and a test asserts none of those words can reach it.
 *
 * SILENT WHEN EVERY FIGURE COVERS EVERY GAME — a note printed on every study
 * stops being read, and there is nothing to warn about when the denominators
 * agree.
 */
function exactCoverageNote(stats: ExactStatistics): string | null {
  const total = stats.coverage.exact_games;
  if (!total) return null;
  const games = (n: number) => `${n} of ${total} game${total === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (stats.kda.games && stats.kda.games < total) {
    parts.push(`KDA based on ${games(stats.kda.games)}`);
  }
  const at15 = stats.gold_diff_at15.games;
  if (at15 && at15 < total) {
    parts.push(`15-minute figures based on ${games(at15)}`);
  }
  if (!parts.length) return null;
  return `${parts.join(". ")}.`;
}

/**
 * STEP 8 — the games one figure was measured over.
 *
 * THIS IS THE LAST LINK IN A CHAIN THE REST OF THE EXPLORER ALREADY BUILT.
 * The board is a claim, the dossier is the sample behind it, the exact study
 * is the sample behind THAT, and the source meetings are its games. Until now
 * the STATISTICS were the one thing on screen a reader had to take on trust:
 * `+217 median` named no game. These rows are the two it is the middle of,
 * and each one opens in the same meeting-and-game dossier the source meetings
 * open — no new route, no new state, no modal on a modal.
 *
 * THE SERVER DECIDES WHAT CONTRIBUTED. This component renders `evidence` and
 * never reconstructs it by intersecting the meetings with a coverage count:
 * a game can be in the exact record and out of the 15-minute figure for four
 * genuinely different reasons, and a client re-deriving that would be a
 * second, weaker copy of a rule that is measured on the corpus.
 *
 * ONE OPEN AT A TIME. Three lists inside a drawer that already scrolls would
 * push the source meetings and the other pro examples off the bottom, so
 * opening one figure closes the others and clicking the open one closes it.
 * The open figure is LOCAL STATE and deliberately not in the URL: the URL
 * carries what a link must be able to re-establish — the board, the scope and
 * the four study keys — and which disclosure a reader last poked is not part
 * of the study, only of this glance at it.
 */
function EvidenceRow({
  row,
  value,
  onOpenMeeting,
}: {
  row: ExactMeeting;
  value: string;
  onOpenMeeting: (meeting: MeetingSelection) => void;
}) {
  const openable = Boolean(row.match_id);
  const body = (
    <>
      <span className="dossier-study__evidenceteams">
        {row.subject_team_key} vs {row.opposing_team_key}
      </span>
      <span className="dossier-study__evidencemeta">
        {shortDate(row.game_date)}
        {row.game_number !== null ? ` · Game ${row.game_number}` : ""}
      </span>
      <span className="dossier-study__evidencevalue">{value}</span>
    </>
  );
  if (!openable) {
    // A game with no meeting identity is still the evidence for the figure,
    // so it is LISTED rather than dropped — but it is not dressed as a link
    // that would go nowhere.
    return (
      <span className="dossier-study__evidence" data-testid="study-evidence-row">
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="dossier-study__evidence dossier-study__evidence--open"
      data-testid="study-evidence-row"
      data-match-id={row.match_id as string}
      data-game-number={row.game_number ?? undefined}
      onClick={() =>
        onOpenMeeting({
          match_id: row.match_id as string,
          // The game number rides along exactly as it does from a source
          // meeting, so an evidence click lands on the GAME that produced the
          // number rather than on the meeting that contains it.
          game_number: row.game_number,
        })
      }
    >
      {body}
    </button>
  );
}

/** "2 contributing games", or "2 of 6 exact games contributed" when the figure
 *  covers fewer than the record. The reason a game did not contribute lives at
 *  game level, where it can be read against the game itself. */
function evidenceCountText(shown: number, total: number): string {
  const games = `${shown} game${shown === 1 ? "" : "s"}`;
  if (shown === total) return `${games} contributed`;
  return `${shown} of ${total} exact games contributed`;
}

function ExactSampleStats({
  data,
  onOpenMeeting,
}: {
  data: ExactMatchupPayload;
  onOpenMeeting: (meeting: MeetingSelection) => void;
}) {
  const stats = data.statistics;
  const [openMetric, setOpenMetric] = useState<string | null>(null);
  // The empty sample renders NOTHING. See the block comment above.
  if (!stats || !stats.coverage.exact_games) return null;

  const gold = stats.gold_diff_at15;
  const cs = stats.cs_diff_at15;
  const note = exactCoverageNote(stats);
  const total = stats.coverage.exact_games;

  // A figure with no games behind it is left OUT rather than dashed. The
  // sample is small by nature and three dashes under a two-game record read
  // as a broken panel; the coverage note carries the fact instead.
  const rows: Array<{
    key: string;
    label: string;
    value: string;
    title?: string;
    /** The rendered evidence, or none — a figure with no contributing games
     *  gets NO affordance at all rather than a control that opens an empty
     *  panel and reads as broken. */
    evidence: Array<{ row: ExactMeeting; value: string }>;
  }> = [];
  if (stats.kda.games) {
    rows.push({
      key: "kda",
      label: "KDA",
      value: exactKdaText(stats),
      title:
        stats.kda.kills === null
          ? undefined
          : `${stats.kda.kills} / ${stats.kda.deaths} / ${stats.kda.assists} over ${
              stats.kda.games
            } game${stats.kda.games === 1 ? "" : "s"}`,
      // The per-game line is the RECORDED counts. A deathless game reads
      // `4 / 0 / 7` here and not "Perfect": the row's whole job is to be the
      // source the figure above can be checked against.
      evidence: (stats.kda.evidence ?? []).map((e) => ({
        row: e,
        value: `${e.subject_kills} / ${e.subject_deaths} / ${e.subject_assists}`,
      })),
    });
  }
  if (gold.median !== null) {
    rows.push({
      key: "gold15",
      label: "Gold @15",
      // "median" is stated on the figure rather than left to a legend: the
      // reader must not read a middle value as a total or an average.
      value: `${signedFigure(gold.median)} median`,
      title: data.statistics.definitions.median_at15,
      evidence: (gold.evidence ?? []).map((e) => ({
        row: e,
        value: signedFigure(e.value),
      })),
    });
  }
  if (cs.supported && cs.median !== null) {
    rows.push({
      key: "cs15",
      label: "CS @15",
      value: `${signedFigure(cs.median)} median`,
      title: data.statistics.definitions.median_at15,
      evidence: (cs.evidence ?? []).map((e) => ({
        row: e,
        value: signedFigure(e.value),
      })),
    });
  }
  if (!rows.length && !note) return null;

  const open = rows.find((row) => row.key === openMetric && row.evidence.length);

  return (
    <div className="dossier-study__sample" data-testid="study-sample-stats">
      <span className="dossier-drawer__stathint">Exact sample</span>
      {rows.length ? (
        <ul className="dossier-study__samplelist">
          {rows.map((row) => {
            const expandable = row.evidence.length > 0;
            const expanded = open?.key === row.key;
            return (
              <li
                key={row.key}
                className="dossier-study__samplestat"
                data-testid={`study-sample-${row.key}`}
                title={row.title}
              >
                <span className="dossier-study__samplelabel">{row.label}</span>
                {expandable ? (
                  <button
                    type="button"
                    className={`dossier-study__samplevalue dossier-study__samplevalue--open${
                      expanded ? " is-open" : ""
                    }`}
                    data-testid={`study-sample-toggle-${row.key}`}
                    aria-expanded={expanded}
                    onClick={() => setOpenMetric(expanded ? null : row.key)}
                  >
                    {row.value}
                    <span aria-hidden="true" className="dossier-study__samplecaret">
                      {expanded ? "▴" : "▾"}
                    </span>
                  </button>
                ) : (
                  <span className="dossier-study__samplevalue">{row.value}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {open ? (
        <div className="dossier-study__evidencegroup" data-testid="study-evidence">
          <span className="dossier-drawer__stathint" data-testid="study-evidence-count">
            {open.label} · {evidenceCountText(open.evidence.length, total)}
          </span>
          {open.evidence.map((item) => (
            <EvidenceRow
              key={item.row.canonical_game_id}
              row={item.row}
              value={item.value}
              onOpenMeeting={onOpenMeeting}
            />
          ))}
        </div>
      ) : null}
      {note ? (
        <span className="dossier-drawer__stathint" data-testid="study-sample-coverage">
          {note}
        </span>
      ) : null}
    </div>
  );
}

function ExactRecordBand({
  data,
  subjectName,
  opposingName,
  onOpenMeeting,
}: {
  data: ExactMatchupPayload;
  subjectName: string;
  opposingName: string;
  onOpenMeeting: (meeting: MeetingSelection) => void;
}) {
  const record = data.exact.record;
  return (
    <div className="dossier-study__record" data-testid="study-record">
      <span className="dossier-study__headline" data-testid="study-headline">
        {record.games} game{record.games === 1 ? "" : "s"} · {record.wins}–
        {record.losses} · {pct(record.win_rate)}
      </span>
      <span className="dossier-study__seq" data-testid="study-sequence">
        {data.exact.result_sequence.map((result, i) => (
          <span
            key={`${result}-${i}`}
            className={`dossier-drawer__formglyph dossier-drawer__formglyph--${result.toLowerCase()}`}
          >
            {result}
          </span>
        ))}
        {data.exact.meetings_total > data.exact.result_sequence.length ? (
          <span className="dossier-drawer__stathint">
            last {data.exact.result_sequence.length} of {data.exact.meetings_total}
          </span>
        ) : null}
      </span>
      {data.exact.most_recent ? (
        <span className="dossier-drawer__stathint" data-testid="study-most-recent">
          Most recent {shortDate(data.exact.most_recent.game_date)} ·{" "}
          {data.exact.most_recent.subject_team_key} vs{" "}
          {data.exact.most_recent.opposing_team_key}
        </span>
      ) : null}
      {/* Orientation stated, because "1–1" is meaningless until you know whose
          side it is read from. */}
      <span className="dossier-drawer__stathint">
        {subjectName} vs {opposingName}. {data.definitions.record_orientation}
      </span>
      {/* The figures sit BELOW the record and the orientation sentence and
          ABOVE the source meetings, so the reading order stays who -> which
          champions -> how many games -> the record -> then the scouting
          figures -> then the evidence they were drawn from. */}
      <ExactSampleStats data={data} onOpenMeeting={onOpenMeeting} />
      <SourceMeetings data={data} onOpenMeeting={onOpenMeeting} />
    </div>
  );
}

/**
 * STEP 4 — the source meetings behind the record above.
 *
 * AGGREGATE CLAIM -> EVIDENCE -> SOURCE MEETING, which is the research move
 * this whole study exists to make possible. "2 games · 2–0" is a count; these
 * are the meetings it counted, and clicking one opens it in the same Explorer.
 *
 * DEDUPED BY `match_id`, because two games of one best-of are ONE meeting to
 * open, not two — listing it twice would suggest the pair met twice.
 */
function SourceMeetings({
  data,
  onOpenMeeting,
}: {
  data: ExactMatchupPayload;
  onOpenMeeting: (meeting: MeetingSelection) => void;
}) {
  const seen = new Set<string>();
  const rows = data.exact.meetings.filter((m) => {
    if (!m.match_id || seen.has(m.match_id)) return false;
    seen.add(m.match_id);
    return true;
  });
  if (!rows.length) return null;

  return (
    <div className="dossier-study__sources" data-testid="study-source-meetings">
      <span className="dossier-drawer__stathint">
        {rows.length === 1 ? "Source meeting" : "Source meetings"}
      </span>
      {rows.map((m) => (
        <button
          key={m.match_id as string}
          type="button"
          className="dossier-study__source"
          data-testid="study-source-meeting"
          data-match-id={m.match_id as string}
          onClick={() =>
            onOpenMeeting({
              match_id: m.match_id as string,
              // The game number rides along so the meeting opens knowing
              // WHICH of its games this record counted. Step 5 renders it.
              game_number: m.game_number,
            })
          }
        >
          {shortDate(m.game_date)} · {m.subject_team_key} vs {m.opposing_team_key}
          {m.tournament_id ? ` · ${m.tournament_id}` : ""}
        </button>
      ))}
    </div>
  );
}

// --- other pro examples -----------------------------------------------------

/**
 * One real professional example of the same champion matchup.
 *
 * CLICKABLE WHERE IT CAN BE. The board only accepts the curated focus set, so
 * an example between two teams outside it is real evidence the Explorer cannot
 * currently be pointed at. It is still shown — hiding it would quietly redefine
 * "other professional examples" as "other focus-set examples" — as a row with
 * the reason, rather than as a link that would fail.
 */
function ExampleRow({
  example,
  onNavigate,
}: {
  example: OtherProExample;
  onNavigate: (navigation: ExampleNavigation) => void;
}) {
  const { subject, opposing, record, navigation } = example;
  const body = (
    <>
      <span className="dossier-study__exampleside">
        <ChampionIcon champion={subject.champion_key} size="sm" />
        <span className="dossier-study__examplename">{subject.display_name}</span>
        <span className="dossier-muted">{subject.team_display_name}</span>
      </span>
      <span className="dossier-study__examplevs">vs</span>
      <span className="dossier-study__exampleside">
        <ChampionIcon champion={opposing.champion_key} size="sm" />
        <span className="dossier-study__examplename">{opposing.display_name}</span>
        <span className="dossier-muted">{opposing.team_display_name}</span>
      </span>
      <span className="dossier-study__examplerecord">
        {record.games}g · {record.wins}–{record.losses} · {shortDate(record.last_played_at)}
      </span>
    </>
  );

  if (!navigation.explorer_navigable) {
    return (
      <div className="dossier-study__example is-static" data-testid="study-example">
        {body}
        <span className="dossier-drawer__stathint" data-testid="study-example-blocked">
          No board for {navigation.teams_outside_explorer_pool.join(" or ")} yet — evidence
          only
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="dossier-study__example"
      data-testid="study-example"
      data-navigable="true"
      onClick={() => onNavigate(navigation)}
    >
      {body}
      <span className="dossier-study__examplego" aria-hidden="true">
        →
      </span>
      <span className="sr-only">
        Open {navigation.team_a} vs {navigation.team_b} on this matchup
      </span>
    </button>
  );
}

function OtherProExamples({
  data,
  onNavigate,
}: {
  data: ExactMatchupPayload;
  onNavigate: (navigation: ExampleNavigation) => void;
}) {
  const examples = data.other_pro_examples;
  return (
    <div className="dossier-study__examples" data-testid="study-examples">
      <span className="dossier-drawer__statlabel">Other pro examples</span>
      {examples.length ? (
        <>
          <ul className="dossier-study__examplelist">
            {examples.map((example, i) => {
              const label = RELATION_LABEL[example.relation] ?? RELATION_FALLBACK;
              const first =
                i === 0 || examples[i - 1].relation !== example.relation;
              return (
                <li key={`${example.subject.player_lp_page}|${example.opposing.player_lp_page}`}>
                  {/* The tier is a heading rather than a badge on every row:
                      the rows are already grouped by it, and repeating it
                      per row would triple the ink for no extra fact. */}
                  {first ? (
                    <span
                      className="dossier-study__examplegroup"
                      data-testid="study-example-group"
                    >
                      {label}
                    </span>
                  ) : null}
                  <ExampleRow example={example} onNavigate={onNavigate} />
                </li>
              );
            })}
          </ul>
          <p className="dossier-drawer__fineprint" data-testid="study-examples-note">
            {data.definitions.other_pro_examples} {data.definitions.ranking}
          </p>
        </>
      ) : (
        <p className="dossier-drawer__fineprint" data-testid="study-examples-empty">
          No other professional games in {data.scope.label} pair these two
          champions on opposing sides.
        </p>
      )}
    </div>
  );
}

// --- the section -------------------------------------------------------------

/**
 * The whole Step 3 layer: choose the other side, then read the record and the
 * other real examples of it.
 *
 * One request per (subject, opposing, scope). The board teams ride along and
 * affect ONE TIER of the example ordering — never which games qualify.
 */
export default function MatchupStudy({
  selection,
  opposition,
  opposingPlayer,
  opposingChampion,
  boardTeamKeys,
  onOpposingChange,
  onNavigate,
  onOpenMeeting,
}: {
  selection: ChampionSelection;
  /** The other side of this lane, straight off the board payload. Null when
   *  the board could not resolve one — an uncovered lane is a fact. */
  opposition: LaneSide | null;
  opposingPlayer: string | null;
  opposingChampion: string | null;
  boardTeamKeys: string[];
  onOpposingChange: (player: string | null, champion: string | null) => void;
  onNavigate: (navigation: ExampleNavigation) => void;
  /** STEP 4: open the meeting a counted game was played in. */
  onOpenMeeting: (meeting: MeetingSelection) => void;
}) {
  const [data, setData] = useState<ExactMatchupPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const ready = Boolean(opposingPlayer && opposingChampion);
  const key = ready
    ? [
        selection.player_lp_page,
        selection.champion,
        opposingPlayer,
        opposingChampion,
        selection.scope_id,
        boardTeamKeys.join(","),
      ].join("|")
    : null;

  useEffect(() => {
    if (!key || !opposingPlayer || !opposingChampion) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setData(null);
    setError(null);
    setLoading(true);
    fetchExactMatchup(
      {
        subject_player: selection.player_lp_page,
        subject_champion: selection.champion,
        opposing_player: opposingPlayer,
        opposing_champion: opposingChampion,
        scope_id: selection.scope_id,
        board_team_keys: boardTeamKeys,
      },
      controller.signal,
    )
      .then((payload) => {
        // A superseded request must never paint: the reader has already asked
        // a different question.
        if (id !== requestId.current) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current || controller.signal.aborted) return;
        setError(
          err instanceof MatchupApiError
            ? err.message
            : "This matchup could not be loaded.",
        );
        setLoading(false);
      });
    return () => controller.abort();
    // `key` is the whole question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const subjectName = selection.display_name;
  const opposingName =
    data?.opposing.display_name ??
    opposition?.candidates.find((c) => c.player_lp_page === opposingPlayer)
      ?.display_name ??
    opposingPlayer ??
    "the opposing player";

  return (
    <section className="dossier-study" data-testid="dossier-study">
      <h3 className="dossier-study__title">Matchup study</h3>
      <p className="dossier-study__subject" data-testid="study-subject">
        {selection.champion} vs {opposingChampion ?? "—"}
        <span className="dossier-muted">
          {" "}
          · {subjectName} vs {opposingChampion ? opposingName : "—"}
        </span>
      </p>

      {opposition ? (
        <OpposingChooser
          opposition={opposition}
          opposingPlayer={opposingPlayer}
          opposingChampion={opposingChampion}
          onChange={onOpposingChange}
        />
      ) : (
        <p className="dossier-drawer__fineprint" data-testid="study-no-opposition">
          The board shows nobody demonstrably in this lane for the other team in
          the selected scope, so there is no opposing side to study.
        </p>
      )}

      {loading ? (
        <p className="dossier-drawer__empty" data-testid="study-loading">
          Reading the record…
        </p>
      ) : null}
      {error ? (
        <p className="dossier-drawer__empty" data-testid="study-error">
          {error}
        </p>
      ) : null}

      {data && !loading && !error ? (
        <>
          {data.exact.record.games ? (
            <ExactRecordBand
              data={data}
              subjectName={subjectName}
              opposingName={opposingName}
              onOpenMeeting={onOpenMeeting}
            />
          ) : (
            <ExactZeroState
              data={data}
              subjectName={subjectName}
              opposingName={opposingName}
            />
          )}
          <p className="dossier-drawer__fineprint" data-testid="study-definition">
            {data.definitions.exact_matchup}
          </p>
          {/* NOT conditioned on the sample size. "Who else has played this
              matchup" is a question in its own right, not a consolation for an
              empty one. */}
          <OtherProExamples data={data} onNavigate={onNavigate} />
          {data.other_pro_examples.some((e) => !e.navigation.explorer_navigable) ? (
            <p className="dossier-drawer__fineprint" data-testid="study-navigation-limit">
              {data.definitions.navigation_limit}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
