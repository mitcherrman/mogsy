/**
 * VIS-F1 — showcase (`/dev/dynasty-v2?view=showcase`): the rare, high-drama
 * states side by side for design review and capture, without replaying a run
 * to reach them: Mid closeout (won / lost), game result (victory / defeat),
 * series result (won / lost), run end (champions / run over) and the extreme
 * objective outcomes. Everything is driven by the same synthetic engine.
 */
import { useMemo, useState, type ReactNode } from "react";
import "./vis.css";
import { autoPicks, finishGame, newRun, playGameScripted, startSeries, type Game, type GameSummary, type Run } from "./engine";
import { ORGS, SEASON } from "./fixtures";
import { CloseoutBanner } from "./GameView";
import { OutcomeCard } from "./ObjectivePanel";
import { objectiveOutcome } from "./objectives";
import { Btn, Eyebrow, ProtoBanner } from "./parts";
import { EndScreen, GameResultScreen, SeriesScreen } from "./screens";

interface Fixture { won: { run: Run; game: Game; summary: GameSummary }; lost: { run: Run; game: Game; summary: GameSummary } | null; seriesWon: Run; seriesLost: Run | null; champion: Run; over: Run }

/** Plays synthetic series until it has a won and a lost game, and a won and a lost series. */
function build(): Fixture {
  const org = ORGS[0];
  const stars = org.starCandidates.slice(0, 2).map((p) => p.id);
  let won: Fixture["won"] | null = null, lost: Fixture["lost"] = null, seriesWon: Run | null = null, seriesLost: Run | null = null;
  for (let s = 0; s < 40 && !(won && lost && seriesWon && seriesLost); s++) {
    let run = startSeries(newRun(`showcase-${s}`, org, stars));
    while (run.series && run.series.wins < 3 && run.series.losses < 3) {
      const g = playGameScripted(run, autoPicks(run), () => (s % 2 ? 0 : 2));
      const out = finishGame(run, g);
      if (out.summary.won && !won) won = { run: out.run, game: g, summary: out.summary };
      if (!out.summary.won && !lost) lost = { run: out.run, game: g, summary: out.summary };
      run = out.run;
    }
    if (run.series!.wins >= 3 && !seriesWon) seriesWon = run;
    if (run.series!.losses >= 3 && !seriesLost) seriesLost = { ...run, nodeIdx: 4, series: { ...run.series!, nodeIdx: 4 } };
  }
  const base = seriesWon ?? won!.run;
  const champion: Run = { ...base, series: null, nodeIdx: SEASON.length, finished: true, alive: true, results: SEASON.map(() => "W" as const) };
  const over: Run = { ...base, series: null, nodeIdx: 5, finished: true, alive: false, results: SEASON.map((_, i) => (i < 4 ? "W" : i === 4 ? "L" : null)) };
  return { won: won!, lost, seriesWon: base, seriesLost, champion, over };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center gap-3"><Eyebrow>{title}</Eyebrow><span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#e3c66f]/40 to-transparent" /></div>
      {children}
    </section>
  );
}

export function Showcase() {
  const fx = useMemo(build, []);
  const [take, setTake] = useState(0);
  const noop = () => undefined;
  return (
    <div className="dyn min-h-screen pt-11" data-mood="victory" data-testid="showcase">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-12 pt-4" key={take}>
        <ProtoBanner />
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>VIS-F1 · Showcase</Eyebrow>
            <h1 tabIndex={-1} className="dyn-title dyn-title--gold text-[30px] font-bold leading-tight outline-none sm:text-[36px]">The big moments</h1>
            <p className="text-[13px] text-white/60">Rare and high-stakes states, side by side. Synthetic data; buttons here do nothing.</p>
          </div>
          <Btn testId="showcase-replay" onClick={() => setTake((t) => t + 1)}>Replay motion</Btn>
        </header>

        <Section title="Mid closeout · the game ends here">
          <div className="grid gap-3 sm:grid-cols-2">
            <CloseoutBanner won reason="Closeout: Winning in Early and Mid" notes={["Baron, an ace, and the push ends the game."]} />
            <CloseoutBanner won={false} reason="They closed it out: Losing in Early and Mid" />
          </div>
        </Section>

        <Section title="Objective outcomes · exceptional and disaster">
          <div className="grid gap-3 sm:grid-cols-2">
            <OutcomeCard outcome={objectiveOutcome("baron", 3, { closeoutOffered: true })} testId="showcase-baron-3" />
            <OutcomeCard outcome={objectiveOutcome("baron", 0)} testId="showcase-baron-0" />
            <OutcomeCard outcome={objectiveOutcome("elder", 3)} testId="showcase-elder-3" />
            <OutcomeCard outcome={objectiveOutcome("baron", 1)} testId="showcase-baron-1" />
          </div>
        </Section>

        <Section title="Game result · victory">
          <GameResultScreen run={fx.won.run} game={fx.won.game} summary={fx.won.summary} onNext={noop} />
        </Section>
        {fx.lost ? (
          <Section title="Game result · defeat">
            <GameResultScreen run={fx.lost.run} game={fx.lost.game} summary={fx.lost.summary} onNext={noop} />
          </Section>
        ) : null}

        <Section title="Series result · won">
          <SeriesScreen run={fx.seriesWon} onNext={noop} />
        </Section>
        {fx.seriesLost ? (
          <Section title="Series result · lost in playoffs (elimination)">
            <SeriesScreen run={fx.seriesLost} onNext={noop} />
          </Section>
        ) : null}

        <Section title="Run end · Worlds champions">
          <EndScreen run={fx.champion} onHome={noop} />
        </Section>
        <Section title="Run end · eliminated">
          <EndScreen run={fx.over} onHome={noop} />
        </Section>
      </main>
    </div>
  );
}
