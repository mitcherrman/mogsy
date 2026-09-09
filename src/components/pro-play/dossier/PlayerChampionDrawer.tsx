// ---------------------------------------------------------------------------
// The player x champion scouting dossier — what a champion tile opens.
//
// TWO QUESTIONS, ANSWERED IN THIS ORDER. A reader on "T1 vs Gen.G · 2026" who
// clicks Doran's Olaf wants to know how much of Doran's 2026 Olaf actually is
// and how it has gone (the summary), and then how that looks specifically
// against the team on the other side of the board (the table). Everything else
// is subordinate to those two.
//
// WHY A SHEET AND NOT A BESPOKE PANEL. `@/components/ui/sheet` is the repo's
// Radix dialog: focus trap, Escape, overlay dismissal, `aria-modal` and a close
// button all come with it, already used elsewhere in the app. Building a
// drawer here would mean reimplementing all of that less well. It opens from
// the right on desktop and takes the full width on a phone, which is the same
// component with one width class.
//
// EVERY DEFINITION IS THE SERVER'S. The "X / Y total games" sentence, the
// ban-pressure sentence and the reason Average KDA is absent are all printed
// from `definitions` / `unavailable_metrics` verbatim. Nothing here rewords
// them, and in particular nothing here turns a draft observation into a motive
// or two independent columns into a head-to-head.
//
// WHAT IS DELIBERATELY NOT HERE. No champion-versus-champion record, no
// "vs Kiin", no opposing-player anything. The opponent axis is a TEAM. The
// `Matchup Study` slot at the foot of the drawer is where that later layer
// lands; it renders nothing today rather than a disabled button.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  fetchPlayerChampionDossier,
  MatchupApiError,
  type DossierBanPressure,
  type DossierRecord,
  type PlayerChampionDossier,
} from "@/lib/pro-play/matchupApi";

import type { ChampionSelection } from "./BoardSelection";
import { ChampionIcon, PlayerPortrait, TeamCrest } from "./DossierMedia";

/** The server's own participation word for "was not in this scope at all". */
const DID_NOT_PARTICIPATE = "did_not_participate";

function pct(value: number | null | undefined): string {
  // An em dash, never "0.0%": a rate over zero games is not a rate, and the
  // server sends null precisely so this cannot be rendered as a result.
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function record(r: DossierRecord | null | undefined): string {
  return r ? `${r.wins}–${r.losses}` : "—";
}

/** A date, short. The corpus stores "2026-07-08 08:52:00". */
function shortDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

/** `3 / 8 · 37.5%` — numerator and denominator first, because the ratio is
 *  what makes a small sample readable and the percentage alone hides it. */
function banPressureText(p: DossierBanPressure | null | undefined): string {
  if (!p) return "—";
  if (!p.drafts_with_ban_record) return "no draft record";
  return `${p.banned_in} / ${p.drafts_with_ban_record} · ${pct(p.rate)}`;
}

/** The identity strip: who, on what, for whom, against whom, when. */
function DrawerIdentity({
  selection,
  data,
}: {
  selection: ChampionSelection;
  data: PlayerChampionDossier | null;
}) {
  const teamKey = selection.team_key;
  const opponent = selection.opponent_team_key;
  return (
    <div className="dossier-drawer__id" data-testid="dossier-drawer-identity">
      <PlayerPortrait
        name={selection.display_name}
        entityKey={selection.player_lp_page}
        size="lg"
      />
      <ChampionIcon champion={selection.champion} size="lg" />
      <div className="dossier-drawer__idtext">
        <SheetTitle className="dossier-drawer__name">
          {selection.display_name} · {selection.champion}
        </SheetTitle>
        <SheetDescription className="dossier-drawer__meta">
          <span className="dossier-drawer__crest">
            <TeamCrest name={teamKey} entityKey={teamKey} size="sm" />
            {teamKey}
          </span>
          <span className="dossier-muted">{selection.lane}</span>
          <span className="dossier-drawer__scope">{selection.scope_label}</span>
          {opponent ? (
            <span className="dossier-muted" data-testid="dossier-drawer-opponent">
              vs {data?.entity.opponent_display_name ?? opponent}
            </span>
          ) : null}
        </SheetDescription>
      </div>
    </div>
  );
}

/** One figure in the summary band. */
function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="dossier-drawer__stat" data-testid={testId}>
      <span className="dossier-drawer__statlabel">{label}</span>
      <span className="dossier-drawer__statvalue">{value}</span>
      {hint ? <span className="dossier-drawer__stathint">{hint}</span> : null}
    </div>
  );
}

/**
 * The recent-results strip: `W W L W W`, newest first.
 *
 * NEVER PADDED. Three games render three glyphs, and the count beside it names
 * the true total, so a short strip reads as a short history rather than as a
 * missing one. Each glyph carries its date and opponent as a `title` and in its
 * accessible name — the detail is reachable without making V1 visually heavy.
 */
function RecentForm({ data }: { data: PlayerChampionDossier }) {
  if (!data.recent_form.length) return null;
  const shown = data.recent_form.length;
  return (
    <div className="dossier-drawer__form" data-testid="dossier-drawer-form">
      <span className="dossier-drawer__statlabel">Recent form</span>
      <span className="dossier-drawer__formrow">
        {data.recent_form.map((game) => {
          const detail = `${game.result === "W" ? "Win" : "Loss"} · ${shortDate(
            game.game_date,
          )}${game.opponent_team_key ? ` · vs ${game.opponent_team_key}` : ""}`;
          return (
            <span
              key={game.canonical_game_id}
              className={`dossier-drawer__formglyph dossier-drawer__formglyph--${
                game.win ? "w" : "l"
              }`}
              title={detail}
              aria-label={detail}
              data-testid="dossier-drawer-form-glyph"
            >
              {game.result}
            </span>
          );
        })}
      </span>
      <span className="dossier-drawer__stathint">
        {shown < data.recent_form_total
          ? `last ${shown} of ${data.recent_form_total}`
          : `${shown} game${shown === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

/**
 * Overall against the opponent currently on the board.
 *
 * TABLE-SHAPED ON PURPOSE. League readers read statistics in tables, and two
 * columns of the same metrics is the fastest way to see a difference. It is
 * still not a head-to-head: both columns are this player's OWN record, the
 * second one narrowed to games against that team, and the header says so.
 */
function ComparisonTable({
  data,
  opponentLabel,
}: {
  data: PlayerChampionDossier;
  opponentLabel: string | null;
}) {
  const overall = data.overall;
  const versus = data.versus_opponent;
  const bans = data.ban_pressure;
  const hasOpponent = Boolean(opponentLabel && versus);
  const rows: Array<{ label: string; a: string; b: string; testId: string }> = [
    {
      label: "Games",
      a: `${overall?.games ?? 0}`,
      b: `${versus?.games ?? 0}`,
      testId: "row-games",
    },
    { label: "Record", a: record(overall), b: record(versus), testId: "row-record" },
    {
      label: "Win rate",
      a: pct(overall?.win_rate),
      b: pct(versus?.win_rate),
      testId: "row-winrate",
    },
    {
      label: "Ban pressure",
      a: banPressureText(bans?.overall),
      b: banPressureText(bans?.versus_opponent),
      testId: "row-banpressure",
    },
  ];
  return (
    <table className="dossier-drawer__table" data-testid="dossier-drawer-table">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Overall</th>
          {hasOpponent ? <th scope="col">vs {opponentLabel}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} data-testid={row.testId}>
            <th scope="row">{row.label}</th>
            <td>{row.a}</td>
            {hasOpponent ? <td>{row.b}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The body once the payload has arrived. */
function DossierBody({
  data,
  selection,
}: {
  data: PlayerChampionDossier;
  selection: ChampionSelection;
}) {
  const opponentLabel =
    data.entity.opponent_display_name ?? selection.opponent_team_key ?? null;

  // Did not participate: not a record of zeroes. The scope model keeps these
  // apart on the server and the drawer must not flatten them here.
  if (data.participation === DID_NOT_PARTICIPATE || !data.overall) {
    return (
      <p className="dossier-drawer__empty" data-testid="dossier-drawer-dnp">
        {selection.display_name} has no games in {data.scope.label}, so there is
        nothing to report on {selection.champion} in this scope.
      </p>
    );
  }

  // Participated, never on this champion. A real zero, stated as one — no
  // percentages, no dashes pretending to be figures.
  if (data.overall.games === 0) {
    return (
      <div className="dossier-drawer__body">
        <p className="dossier-drawer__empty" data-testid="dossier-drawer-zero">
          {selection.display_name} played {data.player_games_in_scope} games in{" "}
          {data.scope.label} and did not play {selection.champion} in any of
          them.
        </p>
        {data.ban_pressure ? (
          <p className="dossier-drawer__fineprint" data-testid="dossier-drawer-zero-bans">
            {selection.champion} was banned by the opposing team in{" "}
            {banPressureText(data.ban_pressure.overall)} of those drafts.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dossier-drawer__body">
      <div className="dossier-drawer__stats" data-testid="dossier-drawer-summary">
        {/* THE RATIO IS PRIMARY, and it is not called a share. "13 / 101 total
            games" says the relationship directly; "12.9% pool share" needs the
            reader to reconstruct it. */}
        <Stat
          label={`${selection.champion} games`}
          value={`${data.overall.games} / ${data.player_games_in_scope} total games`}
          hint={pct(data.champion_share)}
          testId="dossier-drawer-ratio"
        />
        <Stat label="Record" value={record(data.overall)} testId="dossier-drawer-record" />
        <Stat
          label="Win rate"
          value={pct(data.overall.win_rate)}
          testId="dossier-drawer-winrate"
        />
        <Stat
          label="Most recent"
          value={shortDate(data.overall.last_played_at)}
          testId="dossier-drawer-recent"
        />
      </div>

      <RecentForm data={data} />

      <ComparisonTable data={data} opponentLabel={opponentLabel} />

      {/* Stated, not omitted. An absent row a reader expects reads as an
          oversight; a named absence with the server's own reason reads as an
          honest limit of the corpus. */}
      {data.unavailable_metrics.length ? (
        <p className="dossier-drawer__fineprint" data-testid="dossier-drawer-unavailable">
          {data.unavailable_metrics
            .map((m) => `${m.label} is not available. ${m.reason}`)
            .join(" ")}
        </p>
      ) : null}

      {/* The server's own sentences, verbatim — these are the words the
          semantics are guaranteed in. */}
      <p className="dossier-drawer__fineprint" data-testid="dossier-drawer-definitions">
        {data.definitions.champion_games} {data.definitions.ban_pressure}
      </p>

      {/* Where the later champion-versus-champion study lands. Nothing renders
          today: a disabled control promising a feature is worse than silence. */}
      <div data-testid="dossier-drawer-study-slot" />
    </div>
  );
}

/**
 * The drawer itself.
 *
 * One request per (player, champion, opponent, scope). A change to any of them
 * is a different question, so the previous answer is dropped rather than shown
 * beside a new heading — which would put one champion's figures under another
 * champion's name for as long as the request took.
 */
export default function PlayerChampionDrawer({
  selection,
  onClose,
}: {
  selection: ChampionSelection | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PlayerChampionDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const key = selection
    ? [
        selection.player_lp_page,
        selection.champion,
        selection.opponent_team_key ?? "",
        selection.scope_id,
      ].join("|")
    : null;

  useEffect(() => {
    if (!selection || !key) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setData(null);
    setError(null);
    setLoading(true);
    fetchPlayerChampionDossier(
      {
        player_lp_page: selection.player_lp_page,
        champion: selection.champion,
        opponent_team_key: selection.opponent_team_key,
        scope_id: selection.scope_id,
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
            : "This dossier could not be loaded.",
        );
        setLoading(false);
      });
    return () => controller.abort();
    // `key` is the whole question; `selection` identity changes on every board
    // render and would refetch for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const open = Boolean(selection);
  const heading = useMemo(
    () =>
      selection ? `${selection.display_name} · ${selection.champion}` : "",
    [selection],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        // `proplay-dossier` travels with the content because a Radix sheet
        // renders in a PORTAL at the document root, outside the Explorer's own
        // subtree — without it none of the dossier's tokens would apply.
        className="proplay-dossier dossier-drawer w-full sm:max-w-xl"
        data-testid="player-champion-drawer"
        aria-label={heading}
      >
        {selection ? (
          <>
            <DrawerIdentity selection={selection} data={data} />
            {loading ? (
              <p className="dossier-drawer__empty" data-testid="dossier-drawer-loading">
                Reading the record…
              </p>
            ) : null}
            {error ? (
              <p className="dossier-drawer__empty" data-testid="dossier-drawer-error">
                {error}
              </p>
            ) : null}
            {data && !loading && !error ? (
              <DossierBody data={data} selection={selection} />
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
