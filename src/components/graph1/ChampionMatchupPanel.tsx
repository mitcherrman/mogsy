/**
 * The champion-pair sample, drawn.
 *
 * WHAT THIS IS CAREFUL NOT TO CLAIM
 *
 * 1. **It is not the Matchup Explorer's exact record.** Every figure here is
 *    over "every professional game in which these two champions were on
 *    opposing teams" — a broader population than "these two players on these
 *    two champions". The sample line says so in words, on screen, always.
 * 2. **The position split is context, not a lane claim.** Olaf appearing in
 *    the Jungle in six of these games says where he was played, never that he
 *    laned against K'Sante. The Explorer owns the lane-opponent semantic and
 *    it is measured there; nothing here infers it.
 * 3. **Zero is a real answer.** A pair with no professional meetings shows a
 *    zero state. It never falls back to one champion's data and it never
 *    widens the scope to find something to show — either would answer a
 *    question the reader did not ask, under the heading of the one they did.
 *
 * The whole surface is SUBJECT-ORIENTED: the record, the year rows and the
 * side split are the subject champion's, and every one of them is labelled
 * with the subject's name so it cannot be read as the pair's.
 */
import type {
  Graph1ChampionMatchup,
  Graph1MatchupGameRef,
  Graph1MatchupSplit,
} from "@/graph1/championMatchup";
import { matchupPct } from "@/graph1/championMatchup";

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One labelled split. The bar is proportional to the largest row, so a small
 *  sample is not drawn as if it filled the chart. */
function SplitRows({
  splits,
  subjectName,
  testid,
}: {
  splits: Record<string, Graph1MatchupSplit>;
  subjectName: string;
  testid: string;
}) {
  const rows = Object.entries(splits);
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No games in this sample.</p>;
  }
  const max = Math.max(...rows.map(([, v]) => v.games));
  return (
    <ul className="space-y-1.5" data-testid={testid}>
      {rows.map(([name, split]) => (
        <li key={name} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 truncate capitalize">{name}</span>
          <span className="h-2 min-w-[2px] flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-[#c9a84c]"
              style={{ width: `${Math.max(2, (split.games / max) * 100)}%` }}
            />
          </span>
          <span className="w-28 shrink-0 text-right tabular-nums text-muted-foreground">
            {split.games} {split.games === 1 ? "game" : "games"}
            <span className="sr-only">, {subjectName} won {split.wins}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function GameLine({
  label,
  game,
  subjectName,
}: {
  label: string;
  game: Graph1MatchupGameRef;
  subjectName: string;
}) {
  const where = game.tournament || game.league || game.region;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label} </span>
      <span className="tabular-nums">{game.date.slice(0, 10)}</span>
      {where ? <span className="text-muted-foreground"> · {where}</span> : null}
      <span className="text-muted-foreground">
        {" "}
        · {game.subjectTeam} vs {game.opponentTeam} ·{" "}
      </span>
      <span className={game.subjectWon ? "text-emerald-600" : "text-muted-foreground"}>
        {subjectName} {game.subjectWon ? "won" : "lost"}
      </span>
    </p>
  );
}

export default function ChampionMatchupPanel({
  data,
}: {
  data: Graph1ChampionMatchup;
}) {
  const subject = data.subject.name;
  const opponent = data.opponent.name;

  if (data.games === 0) {
    return (
      <div
        role="status"
        data-testid="matchup-zero"
        className="space-y-2 rounded-md border border-dashed border-border px-4 py-8 text-center"
      >
        <p className="text-sm text-muted-foreground">
          No professional games found for this champion matchup in the selected
          scope.
        </p>
        <p className="text-xs text-muted-foreground">
          {subject} and {opponent} have not been on opposing teams in a game
          this scope admits.
        </p>
      </div>
    );
  }

  const yearMax = Math.max(...data.byYear.map((y) => y.games), 1);

  return (
    <div className="space-y-4" data-testid="champion-matchup">
      <section className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Figure
            label="Games"
            value={String(data.games)}
            hint="both champions, opposing teams"
          />
          <Figure
            label={`${subject} record`}
            value={`${data.record.wins}–${data.record.losses}`}
          />
          <Figure
            label={`${subject} win rate`}
            value={matchupPct(data.record.winRate)}
            hint={`against ${opponent}`}
          />
        </div>
        {/* The sample definition is not a footnote a reader can miss: it is the
            one line that stops this being read as a player's record. */}
        <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Professional games in which {subject} and {opponent} appeared on
          opposing teams. This is the broader professional sample — not a
          specific pair of players.
        </p>
      </section>

      <Section
        title="By year"
        note={`Games in this matchup, and how many ${subject} won.`}
      >
        <ul className="space-y-1.5" data-testid="matchup-by-year">
          {data.byYear.map((year) => (
            <li key={year.year} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 tabular-nums">{year.year}</span>
              <span className="h-2 min-w-[2px] flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-[#c9a84c]"
                  style={{ width: `${Math.max(2, (year.games / yearMax) * 100)}%` }}
                />
              </span>
              <span className="w-28 shrink-0 text-right tabular-nums text-muted-foreground">
                {year.games} · {year.wins}W
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section
          title={`${subject} played as`}
          note="Where the champion was played in these games. Not a claim that the two laned against each other."
        >
          <SplitRows
            splits={data.subjectPositions}
            subjectName={subject}
            testid="matchup-subject-positions"
          />
        </Section>
        <Section
          title={`${opponent} played as`}
          note="The same context for the other side."
        >
          <SplitRows
            splits={data.opponentPositions}
            subjectName={opponent}
            testid="matchup-opponent-positions"
          />
        </Section>
      </div>

      <Section title={`${subject}'s side`} note="Blue and red, in this matchup.">
        <SplitRows
          splits={data.subjectSides}
          subjectName={subject}
          testid="matchup-sides"
        />
      </Section>

      <Section title="When" note="The span this sample covers.">
        <div className="space-y-1">
          {data.firstGame ? (
            <GameLine label="First" game={data.firstGame} subjectName={subject} />
          ) : null}
          {data.latestGame ? (
            <GameLine label="Latest" game={data.latestGame} subjectName={subject} />
          ) : null}
        </div>
      </Section>
    </div>
  );
}
