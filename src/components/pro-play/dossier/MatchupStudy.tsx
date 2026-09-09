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

function ExactRecordBand({
  data,
  subjectName,
  opposingName,
}: {
  data: ExactMatchupPayload;
  subjectName: string;
  opposingName: string;
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
