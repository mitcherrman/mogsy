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
import { autoPicks, finishGame, newRun, playGameScripted, startSeries, type Game, type GameSummary, type Run, type Series } from "./engine";
import { CHAMPS_BY_ROLE, ORGS, ROLES, SEASON } from "./fixtures";
import { CloseoutBanner } from "./GameView";
import { OutcomeCard } from "./ObjectivePanel";
import { objectiveOutcome } from "./objectives";
import { Btn, Eyebrow, ProtoBanner } from "./parts";
import { EndScreen, GameResultScreen, SeriesScreen } from "./screens";
import { CasterPop, ChatBurst, CrowdMeter, StingerHost, useStinger, type StingerSpec } from "./broadcast";
import { ChampionCard, PlayerCard } from "./cards";
import { MEDIA_SLOTS, SCENE_META, type SceneId } from "./media";
import { Scene, type StadiumVariant } from "./scenes";
import { CineFrame, FullFrame, type FullFrameKind } from "./cinematics";
import { ObjectiveSpectacle } from "./spectacle";
import { AmbiencePanel } from "./ambience";
import "./vis-f3.css";
import "./vis-f4.css";
import { WalkoutSequence } from "./walkout";
import { DraftLockSequence } from "./lock";
import type { EnvMood, EnvState } from "./environments";
import { ORG_ACCENT } from "./parts";
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
  const [variant, setVariant] = useState<StadiumVariant>("normal");
  const [full, setFull] = useState<FullFrameKind | null>(null);
  const [mood, setMood] = useState<EnvMood>("neutral");
  const [lock, setLock] = useState(false);
  const [walk, setWalk] = useState(0);
  const showRun = fx.won.run;
  const env: EnvState = { accent: ORG_ACCENT[showRun.org.id]?.hex, mono: ORG_ACCENT[showRun.org.id]?.mono, team: showRun.org.name, opp: SEASON[showRun.nodeIdx].opp.name, roster: ROLES.map((r) => ({ name: showRun.starters[r].name, role: r, kind: showRun.starters[r].kind })), cohesion: showRun.cohesion, results: ["W", "W", "L", "W", null, null, null, null], mood, signed: mood === "signing" ? showRun.starters.mid.name : undefined, lead: mood === "win" ? 3 : mood === "loss" ? -2 : 0, score: "2–1", stageLabel: "Game 4 · Worlds Semi · Mid" };
  const noop = () => undefined;
  const roster = ROLES.map((r) => fx.won.run.starters[r]);
  return (
    <StingerHost>
      <div className="dyn min-h-screen pt-11" data-mood="victory" data-testid="showcase">
        {full ? <FullFrame kind={full} org={fx.won.run.org} opp="SYN Crown of Ash" team={fx.won.run.org.name.replace(/^SYN /, "")} roster={ROLES.map((r) => showRun.starters[r].name)} score="3–2" onDone={() => setFull(null)} /> : null}
        {lock ? <DraftLockSequence run={{ ...showRun, series: showRun.series ?? { nodeIdx: showRun.nodeIdx, wins: 2, losses: 1, games: [], used: [], scoutTier: 1, prepTeam: { early: 0, mid: 0, late: 0 }, prepPlayer: {} } as Series }} picks={autoPicks(showRun)} onDone={() => setLock(false)} /> : null}
        <Scene id={scene} caption={false} variant={variant} env={env} champion>
          <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-12 pt-4" key={take}>
            <ProtoBanner />
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>VIS-F2 / F3 · Showcase</Eyebrow>
                <h1 tabIndex={-1} className="dyn-title dyn-title--gold text-[30px] font-bold leading-tight outline-none sm:text-[36px]">The big moments</h1>
                <p className="text-[13px] text-white/60">Rare and high-stakes states, side by side. Synthetic data; buttons here do nothing but replay motion.</p>
              </div>
              <Btn testId="showcase-replay" onClick={() => setTake((t) => t + 1)}>Replay motion</Btn>
            </header>

            <Section title="Locations · seven spaces (behind this page)">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Scene">
                {(Object.keys(SCENE_META) as SceneId[]).map((id) => <Btn key={id} testId={`scene-${id}`} primary={id === scene} className="min-h-[36px] px-3 py-1 text-[12px]" onClick={() => setScene(id)}>{SCENE_META[id].name}</Btn>)}
              </div>
              {scene === "stadium" ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Stadium variant">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Variant</span>
                  {(["normal", "elimination", "finals"] as StadiumVariant[]).map((v) => <Btn key={v} testId={`scene-variant-${v}`} primary={v === variant} className="min-h-[32px] px-3 py-1 text-[12px] capitalize" onClick={() => setVariant(v)}>{v}</Btn>)}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Room state">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">State</span>
                {(["neutral", "win", "loss", "signing", "worlds"] as EnvMood[]).map((m) => <Btn key={m} testId={`env-mood-${m}`} primary={m === mood} className="min-h-[32px] px-3 py-1 text-[12px] capitalize" onClick={() => setMood(m)}>{m}</Btn>)}
              </div>
              <p className="text-[12px] text-white/55">Slot <code className="text-white/75">scene.{scene}</code>: {MEDIA_SLOTS[`scene.${scene}`].fill === "mogzy-asset" ? `Mogzy asset ${MEDIA_SLOTS[`scene.${scene}`].src}` : "painted in CSS / SVG"} · brief: {MEDIA_SLOTS[`scene.${scene}`].brief}</p>
            </Section>

            <Section title="W3 full frames · ≤ 3 s, skippable, static under reduced motion">
              <div className="flex flex-wrap gap-2">
                <Btn testId="fire-frame-finals_intro" onClick={() => setFull("finals_intro")}>Worlds Final intro</Btn>
                <Btn testId="fire-frame-championship" onClick={() => setFull("championship")}>Championship</Btn>
              </div>
              <p className="text-[12px] text-white/55">In the run these fire once: the Final intro at draft lock of game 1 of the Worlds Final, the championship when the series is won.</p>
            </Section>

            <Section title="Walking onto the stage · the walkout sequence (skippable, two beats)">
              <WalkoutSequence key={walk} env={{ ...env, variant }} picks={autoPicks(showRun)} gameLabel="Game 1 · Worlds Semi" onDone={() => undefined} />
              <div className="flex flex-wrap gap-2"><Btn testId="walkout-replay" onClick={() => setWalk((n) => n + 1)}>Replay the walkout</Btn><Btn testId="fire-lock" onClick={() => setLock(true)}>Draft lock-in sequence</Btn></div>
            </Section>

            <Section title="Fighting for Baron · escalation and the four outcomes">
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((t) => <div key={t} className="dyn-plate dyn-plate--ornate overflow-hidden p-4" data-testid={`showcase-baron-t${t}`}><ObjectiveSpectacle kind="baron" phase={t === 0 ? "stakes" : "ask"} intensity={t} accent={env.accent}><p className="dyn-title text-[14px] text-white">{t === 0 ? "Stakes · the window opens" : `Question ${t} of 3 · tension ${t}`}</p></ObjectiveSpectacle></div>)}
                {(["great", "good", "mixed", "bad"] as const).map((tone) => <div key={tone} className="dyn-plate overflow-hidden p-4" data-testid={`showcase-baron-${tone}`}><ObjectiveSpectacle kind="baron" phase="outcome" tone={tone} accent={env.accent}><p className="dyn-title text-[14px] capitalize text-white">Baron · {tone === "great" ? "3 of 3 · exceptional" : tone === "good" ? "2 of 3 · success" : tone === "mixed" ? "1 of 3 · partial" : "0 of 3 · disaster"}</p></ObjectiveSpectacle></div>)}
              </div>
            </Section>

            <Section title="Dragon (tempo) and Elder (the last confrontation) · prototype-only">
              <div className="grid gap-3 sm:grid-cols-2">
                {(["dragon", "elder"] as const).map((k) => <div key={k} className="dyn-plate overflow-hidden p-4" data-testid={`showcase-spectacle-${k}`}><ObjectiveSpectacle kind={k} phase="stakes" accent={env.accent}><p className="dyn-title text-[16px] font-semibold capitalize text-white">{k} · prototype-only</p></ObjectiveSpectacle></div>)}
              </div>
            </Section>

            <Section title="Comic frames · W2, in the flow, never blocking">
              <div className="grid gap-3 sm:grid-cols-2">
                <CineFrame kind="signing" kicker="Transfer window" title="Rex Dunmore signs for Ember Wing" caption="Cohesion dips, the honeymoon lifts confidence for one series." />
                <CineFrame kind="tunnel" kicker="Game 1 · Worlds Final" title="Walking out" caption="Ember Wing vs Crown of Ash" />
                <CineFrame kind="outplay" kicker="Rare event · generated in-run" title="Top turns a 1v2 into a turret" caption="A 1v2 turned into a turret." />
                <CineFrame kind="elim_victory" kicker="Facing elimination" title="Victory · 2–2" caption="Still alive. One more." />
              </div>
            </Section>

            <Section title="Ambience & sound · the controls (04 rule 5)">
              <div className="dyn-plate p-4"><AmbiencePanel /></div>
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
                <CasterPop moment="objective.offer" k="showcase" ctx={{ objective: "Baron Nashor" }} exempt />
                <CasterPop moment="championship" k="showcase" ctx={{ team: "Ember Wing" }} exempt />
                <ChatBurst moment="objective.result" k="showcase" n={4} exempt />
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
