/**
 * VIS-F1/F2 — showcase (`/dev/dynasty-v2?view=showcase`): the rare, high-drama
 * states side by side for design review and capture, without replaying a run
 * to reach them. VIS-F2 adds the seven locations (switchable behind the page),
 * the stingers for every signature moment, a story beat, caster and chat
 * pop-ins, the player hierarchy cards and the champion cards.
 */
import { useMemo, useState, type ReactNode } from "react";
import "./vis.css";
import "./vis-f2.css";
import { autoPicks, finishGame, newRun, playGameScripted, startSeries, type Game, type GameSummary, type Run } from "./engine";
import { CHAMPS_BY_ROLE, ORGS, ROLES, SEASON } from "./fixtures";
import { CloseoutBanner } from "./GameView";
import { OutcomeCard } from "./ObjectivePanel";
import { objectiveOutcome } from "./objectives";
import { Btn, Eyebrow, ProtoBanner } from "./parts";
import { EndScreen, GameResultScreen, SeriesScreen } from "./screens";
import { CasterPop, ChatBurst, CrowdMeter, StingerHost, useStinger, type StingerSpec } from "./broadcast";
import { ChampionCard, PlayerCard } from "./cards";
import { MEDIA_SLOTS, SCENE_META, type SceneId } from "./media";
import { Scene } from "./scenes";
import { PanelArt, StoryBeat } from "./story";

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

const STINGERS: StingerSpec[] = [
  { id: "run.start", kicker: "New campaign", title: "Welcome to the house", sub: "Ember Wing · season one", tone: "gold" },
  { id: "org.choose", kicker: "Your organization", title: "Ember Wing", sub: "Front-to-back teamfighting", tone: "gold" },
  { id: "player.sign", kicker: "Signed", title: "Pax Hollis", sub: "SUP · honeymoon on", tone: "gold" },
  { id: "draft.lock", kicker: "Game 1 · vs Moss Lantern", title: "Draft locked", sub: "Walk out.", tone: "gold" },
  { id: "objective.dragon", kicker: "Early", title: "Dragon spawns", sub: "One question for the pit.", tone: "ember" },
  { id: "objective.baron", kicker: "After Mid", title: "Baron window opens", sub: "Three questions. Three clean answers end the game.", tone: "violet" },
  { id: "objective.elder", kicker: "Late · tight game", title: "Elder Dragon", tone: "ice" },
  { id: "objective.result", kicker: "Baron Nashor · 0 of 3", title: "Enemy Baron", tone: "red" },
  { id: "game.win", kicker: "Game 2", title: "Victory", sub: "Series 2–0", tone: "gold" },
  { id: "series.point", kicker: "Match point", title: "Victory · 2–1", tone: "gold" },
  { id: "finals.intro", kicker: "Worlds", title: "The Final", sub: "Ember Wing vs Crown of Ash", tone: "gold" },
  { id: "championship", kicker: "Worlds Dynasty", title: "Champions", tone: "gold" },
  { id: "run.defeat", kicker: "Run complete", title: "The run ends here", tone: "neutral" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center gap-3"><Eyebrow>{title}</Eyebrow><span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#e3c66f]/40 to-transparent" /></div>
      {children}
    </section>
  );
}

function StingerBoard() {
  const sting = useStinger();
  return (
    <div className="flex flex-wrap gap-2" data-testid="stinger-board">
      {STINGERS.map((s) => <Btn key={s.id} testId={`fire-${s.id}`} className="min-h-[36px] px-3 py-1 text-[12px]" onClick={() => sting(s)}>{s.title}</Btn>)}
    </div>
  );
}

export function Showcase() {
  const fx = useMemo(build, []);
  const [take, setTake] = useState(0);
  const [scene, setScene] = useState<SceneId>("stadium");
  const noop = () => undefined;
  const roster = ROLES.map((r) => fx.won.run.starters[r]);
  return (
    <StingerHost>
      <div className="dyn min-h-screen pt-11" data-mood="victory" data-testid="showcase">
        <Scene id={scene} caption={false}>
          <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-12 pt-4" key={take}>
            <ProtoBanner />
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>VIS-F2 · Showcase</Eyebrow>
                <h1 tabIndex={-1} className="dyn-title dyn-title--gold text-[30px] font-bold leading-tight outline-none sm:text-[36px]">The big moments</h1>
                <p className="text-[13px] text-white/60">Rare and high-stakes states, side by side. Synthetic data; buttons here do nothing but replay motion.</p>
              </div>
              <Btn testId="showcase-replay" onClick={() => setTake((t) => t + 1)}>Replay motion</Btn>
            </header>

            <Section title="Locations · seven spaces (behind this page)">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Scene">
                {(Object.keys(SCENE_META) as SceneId[]).map((id) => <Btn key={id} testId={`scene-${id}`} primary={id === scene} className="min-h-[36px] px-3 py-1 text-[12px]" onClick={() => setScene(id)}>{SCENE_META[id].name}</Btn>)}
              </div>
              <p className="text-[12px] text-white/55">Slot <code className="text-white/75">scene.{scene}</code>: {MEDIA_SLOTS[`scene.${scene}`].fill === "mogzy-asset" ? `Mogzy asset ${MEDIA_SLOTS[`scene.${scene}`].src}` : "painted in CSS / SVG"} · brief: {MEDIA_SLOTS[`scene.${scene}`].brief}</p>
            </Section>

            <Section title="Stingers · one per signature moment">
              <StingerBoard />
            </Section>

            <Section title="Story beat · comic panels (never modal, always skippable)">
              <StoryBeat id="showcase.finals" title="Worlds Final" holdMs={8000} panels={[
                { art: <PanelArt kind="tunnel" />, kicker: "The tunnel.", caption: "Ember Wing walk out for the last series of the season." },
                { art: <PanelArt kind="stage" />, caption: "Crown of Ash wait on the other side of the stage. Best of five, Fearless." },
                { art: <PanelArt kind="trophy" />, kicker: "One trophy.", caption: "Whoever lifts it, the season remembers." },
              ]} />
            </Section>

            <Section title="Broadcast layer · casters, chat, crowd">
              <div className="grid gap-3 sm:grid-cols-2">
                <CasterPop moment="objective.offer" k="showcase" ctx={{ objective: "Baron Nashor" }} />
                <CasterPop moment="championship" k="showcase" ctx={{ team: "Ember Wing" }} />
                <ChatBurst moment="objective.result" k="showcase" n={4} />
                <div className="flex flex-col gap-3"><CrowdMeter level={0.35} label="Crowd · even" /><CrowdMeter level={0.7} label="Crowd · Baron" /><CrowdMeter level={1} label="Crowd · title" /></div>
              </div>
            </Section>

            <Section title="Players · hierarchy, form, pressure">
              <div className="grid gap-2 sm:grid-cols-2">
                {roster.map((p, i) => <PlayerCard key={p.id} p={i === 0 ? { ...p, conf: 1, fatigue: 5, traits: ["Overconfident"] } : i === 4 ? { ...p, traits: ["Honeymoon"], kind: "signed" } : p} hierarchy spotlight={p.kind === "star"} />)}
              </div>
            </Section>

            <Section title="Champions · class, curve, relevance">
              <div className="flex flex-wrap gap-2">
                {CHAMPS_BY_ROLE.top.map((c, i) => <ChampionCard key={c.id} c={c} prof={[2, 1, 0, 1, 2][i]} picked={i === 0} used={i === 3} onPick={noop} testId={`show-pick-${c.id}`} name="show-top" relevance={i === 1 ? "Rare play possible" : i === 4 ? "Matches their tempo" : null} />)}
              </div>
            </Section>

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
        </Scene>
      </div>
    </StingerHost>
  );
}
