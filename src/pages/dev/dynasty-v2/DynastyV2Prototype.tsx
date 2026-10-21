/**
 * UX-1 / VIS-F1 — Worlds Dynasty clickable gameplay prototype (DEV ONLY, SYNTHETIC).
 *
 * Route: `/dev/dynasty-v2` (registered only under `import.meta.env.DEV`).
 *        `?view=objectives`  objective gallery (Baron 0-3, Dragon, Elder).
 *        `?view=showcase`    VIS-F1 showcase: closeout, result, series and run-end heroes.
 *        `?seed=abc`          start with a given run seed.
 *        `?view=bo5`          UX-3: the server-driven BO5 (recorded E1 machine output).
 *        `?view=bo5&transport=live[&policy=broad_mid_win]`  UX-4: the same BO5 on the live E2 series API.
 *
 * This is a flow prototype. It is NOT connected to the authoritative Combat
 * v2 / Event E0 simulator, any backend, auth or real data. See `engine.ts`.
 *
 * VIS-F1 adds the visual shell: the `.dyn` atmosphere (one stage light whose
 * hue follows the game's mood), the org accent, and a run bar with the crest.
 * Flow, state and every test id are unchanged from UX-1.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import "./vis.css";
import "./vis-f2.css";
import "./vis-f3.css";
import "./vis-f4.css";
import { DraftLockSequence } from "./lock";
import type { EnvState } from "./environments";
import { installDynastyAudioUnlock, playMoment } from "./audio";
import { AmbienceButton } from "./ambience";
import { FullFrame, type FullFrameKind } from "./cinematics";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  applyPrep, applyTactic, finishGame, finishSeries, newRun, signPlayer, startSeries,
  type Game, type GameSummary, type PrepPick, type Run,
} from "./engine";
import { SEASON, type Org, type Player, type Role, ROLES } from "./fixtures";
import { GameView, type GameMood } from "./GameView";
import { ObjectiveGallery } from "./ObjectiveGallery";
import { Showcase } from "./Showcase";
import { StingerHost, ambientNewGame, useStinger } from "./broadcast";
import { Scene } from "./scenes";
import type { SceneId } from "./media";
import { Crest, Pips, ProtoBanner, accentStyle, ORG_ACCENT } from "./parts";
import {
  DraftScreen, EndScreen, GameResultScreen, HomeScreen, OrgScreen, PrepScreen, RecruitScreen, RosterList, RosterScreen,
  ScoutScreen, SeasonScreen, SeriesScreen, StarsScreen, TacticScreen,
} from "./screens";

// UX-3: the server-driven BO5 (recorded E1 output through the adapter boundary). Lazy: it carries the fixture.
const Bo5Flow = lazy(() => import("./bo5/Bo5Flow").then((m) => ({ default: m.Bo5Flow })));

type ScreenId = "home" | "org" | "stars" | "roster" | "season" | "recruit" | "prep" | "scout" | "draft" | "game" | "result" | "tactic" | "series" | "end";

export default function DynastyV2Prototype() {
  const [params] = useSearchParams();
  const view = params.get("view");
  if (view === "objectives") return <ObjectiveGallery />;
  if (view === "showcase") return <Showcase />;
  if (view === "bo5") return <StingerHost><Suspense fallback={<div className="dyn min-h-screen pt-11" data-testid="bo5-loading" />}><Bo5Flow /></Suspense></StingerHost>;
  return <StingerHost><Flow initialSeed={params.get("seed") ?? "ux1-0001"} /></StingerHost>;
}

/** Which of the seven spaces a screen plays in. The game picks its own (tunnel, then stadium). */
const SCENE_FOR: Record<Exclude<ScreenId, "game">, SceneId> = {
  home: "hq", org: "hq", stars: "hq", roster: "hq", season: "hq",
  recruit: "practice", prep: "practice",
  scout: "warroom", draft: "warroom",
  result: "backstage", tactic: "backstage", series: "backstage",
  end: "trophy",
};

function Flow({ initialSeed }: { initialSeed: string }) {
  const [screen, setScreen] = useState<ScreenId>("home");
  const [seed, setSeed] = useState(initialSeed);
  const [org, setOrg] = useState<Org | null>(null);
  const [stars, setStars] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [prep, setPrep] = useState<PrepPick[]>([]);
  const [offer, setOffer] = useState<string | null>(null);
  const [picks, setPicks] = useState<Partial<Record<Role, string>>>({});
  const [game, setGame] = useState<Game | null>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [gameMood, setGameMood] = useState<GameMood>("early");
  // W3 full-frame cinematics: the Worlds Final intro and the championship (≤ 3 s, skippable).
  const [cine, setCine] = useState<FullFrameKind | null>(null);
  const [locking, setLocking] = useState(false);
  const closeCine = useCallback(() => setCine(null), []);
  const mainRef = useRef<HTMLElement>(null);
  const sting = useStinger();

  useEffect(() => installDynastyAudioUnlock(), []);
  useEffect(() => {
    window.scrollTo?.(0, 0);
    mainRef.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
    if (screen !== "game") ambientNewGame(`${screen}|${run?.nodeIdx ?? 0}|${run?.series?.games.length ?? 0}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by screen on purpose
  }, [screen]);

  const go = useCallback((s: ScreenId) => { playMoment("dyn.ui.advance"); setScreen(s); }, []);

  const beginSeries = () => {
    if (!run) return;
    const r = startSeries(run);
    setRun(r); setPrep([]); setOffer(null);
    go(SEASON[r.nodeIdx].window === "transfer" ? "recruit" : "prep");
  };

  const finishCurrentGame = (g: Game) => {
    const out = finishGame(run!, g);
    setRun(out.run); setGame(g); setSummary(out.summary);
    playMoment(out.summary.won ? "dyn.result.game_win" : "dyn.result.game_loss");
    if (out.summary.won && SEASON[out.run.nodeIdx].kind !== "regular") playMoment("dyn.crowd.roar");
    const s = out.run.series!;
    const seriesWon = s.wins >= 3, seriesLost = s.losses >= 3;
    const score = `${s.wins}–${s.losses}`;
    if (seriesWon || seriesLost) sting({ id: seriesWon ? "series.won" : "series.lost", kicker: "Series", title: seriesWon ? `Series won ${score}` : `Series lost ${score}`, tone: seriesWon ? "gold" : "red", ms: 2200, cue: "dynasty.series.point" });
    else if (s.wins === 2 || s.losses === 2) sting({ id: "series.point", kicker: s.wins === 2 ? "Match point" : "They have match point", title: out.summary.won ? `Victory · ${score}` : `Defeat · ${score}`, tone: s.wins === 2 ? "gold" : "red", ms: 2200, cue: "dynasty.series.match_point" });
    else sting({ id: out.summary.won ? "game.win" : "game.loss", kicker: `Game ${g.idx}`, title: out.summary.won ? "Victory" : "Defeat", sub: `Series ${score}`, tone: out.summary.won ? "gold" : "red" });
    setScreen("result");
  };

  const afterSeries = () => {
    const r = finishSeries(run!);
    setRun(r);
    if (r.finished && r.alive && r.results[SEASON.length - 1] === "W") setCine("championship");
    if (r.finished) sting({ id: r.alive && r.results[SEASON.length - 1] === "W" ? "championship" : "run.defeat", kicker: r.alive && r.results[SEASON.length - 1] === "W" ? "Worlds Dynasty" : "Run complete", title: r.alive && r.results[SEASON.length - 1] === "W" ? "Champions" : "The run ends here", tone: r.alive && r.results[SEASON.length - 1] === "W" ? "gold" : "neutral", ms: 2600, cue: r.alive && r.results[SEASON.length - 1] === "W" ? undefined : "dynasty.end.defeat" });
    go(r.finished && !r.alive ? "end" : r.finished ? "end" : "season");
  };

  // Draft lock-in: the sequence plays over the draft, then the stinger, the Final intro (game 1 of the Final) and the game.
  const finishLock = () => {
    setLocking(false);
    sting({ id: "draft.lock", kicker: `Game ${run!.series!.games.length + 1} · vs ${SEASON[run!.nodeIdx].opp.name.replace(/^SYN /, "")}`, title: "Draft locked", sub: "Walk out.", tone: "gold" });
    if (run!.nodeIdx === SEASON.length - 1 && run!.series!.games.length === 0) setCine("finals_intro");
    go("game");
  };

  let body;
  switch (screen) {
    case "home":
      body = <HomeScreen run={run} seed={seed} onSeed={setSeed} onNew={() => { setRun(null); go("org"); }} onResume={() => go(run!.series ? "season" : run!.finished ? "end" : "season")} />;
      break;
    case "org":
      body = <OrgScreen onChoose={(o) => { setOrg(o); setStars([]); sting({ id: "org.choose", kicker: "Your organization", title: o.name.replace(/^SYN /, ""), sub: o.trait, tone: "gold", cue: "dynasty.org.choose" }); go("stars"); }} />;
      break;
    case "stars":
      body = <StarsScreen org={org!} selected={stars} onToggle={(id) => setStars((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s))}
        onConfirm={() => { setRun(newRun(seed, org!, stars)); sting({ id: "run.start", kicker: "New campaign", title: "Welcome to the house", sub: `${org!.name.replace(/^SYN /, "")} · season one`, tone: "gold", ms: 2200, cue: "dynasty.season.segment" }); go("roster"); }} />;
      break;
    case "roster":
      body = <RosterScreen run={run!} onNext={() => go("season")} />;
      break;
    case "season":
      body = <SeasonScreen run={run!} onBegin={beginSeries} />;
      break;
    case "recruit":
      body = <RecruitScreen run={run!} picked={offer} onPick={setOffer} onSign={(p: Player) => { setRun(signPlayer(run!, p)); sting({ id: "player.sign", kicker: "Signed", title: p.name.replace(/^SYN-/, ""), sub: `${p.role.toUpperCase()} · honeymoon on`, tone: "gold", cue: "dynasty.recruit.sign" }); go("prep"); }} onSkip={() => go("prep")} />;
      break;
    case "prep":
      body = <PrepScreen run={run!} picks={prep}
        onToggle={(id) => setPrep((p) => (p.find((x) => x.id === id) ? p.filter((x) => x.id !== id) : p.length < 2 ? [...p, { id }] : p))}
        onTarget={(id, playerId) => setPrep((p) => p.map((x) => (x.id === id ? { ...x, playerId } : x)))}
        onConfirm={() => { setRun(applyPrep(run!, prep).run); setPicks({}); go("scout"); }} />;
      break;
    case "scout":
      body = <ScoutScreen run={run!} onNext={() => go("draft")} />;
      break;
    case "draft":
      body = <DraftScreen run={run!} picks={picks} onPick={(r, id) => setPicks((p) => ({ ...p, [r]: id }))}
        onLock={() => { setGame(null); setLocking(true); }} />;
      break;
    case "game":
      body = <GameView key={`${run!.nodeIdx}-${run!.series!.games.length}`} run={run!} picks={picks as Record<Role, string>} onDone={finishCurrentGame} onMood={setGameMood} />;
      break;
    case "result":
      body = <GameResultScreen run={run!} game={game!} summary={summary!} onNext={() => go(summary!.seriesOver ? "series" : "tactic")} />;
      break;
    case "tactic":
      body = <TacticScreen run={run!} onChoose={(id) => { if (id) setRun(applyTactic(run!, id)); setPicks({}); go("draft"); }} />;
      break;
    case "series":
      body = <SeriesScreen run={run!} onNext={afterSeries} />;
      break;
    case "end":
      body = <EndScreen run={run!} onHome={() => go("home")} />;
      break;
  }

  const inRun = !!run && screen !== "home" && screen !== "org" && screen !== "stars";
  const mood: string =
    screen === "game" ? gameMood
      : screen === "result" ? (summary?.won ? "victory" : "defeat")
      : screen === "series" ? ((run?.series?.wins ?? 0) >= 3 ? "victory" : "defeat")
      : screen === "end" ? (run?.alive && run.results[SEASON.length - 1] === "W" ? "victory" : "defeat")
      : screen === "scout" || screen === "draft" ? "early"
      : "home";
  const activeOrg = run?.org ?? org;
  const node = run ? SEASON[Math.min(run.nodeIdx, SEASON.length - 1)] : null;
  const champion = !!run && run.alive && run.results[SEASON.length - 1] === "W";
  // What the rooms show: the org, the five starters, the results wall, a welcome banner after a signing, the opponent on the boards.
  const env: EnvState = run && node ? {
    accent: ORG_ACCENT[run.org.id]?.hex, mono: ORG_ACCENT[run.org.id]?.mono, team: run.org.name, opp: node.opp.name,
    roster: ROLES.map((r) => ({ name: run.starters[r].name, role: r, kind: run.starters[r].kind })), cohesion: run.cohesion, results: run.results,
    signed: run.signedThisWindow ? ROLES.map((r) => run.starters[r]).find((p) => p.traits.includes("Honeymoon"))?.name : undefined,
    mood: screen === "result" || screen === "series" || screen === "tactic" ? (mood === "victory" ? "win" : "loss") : node.kind === "worlds" ? "worlds" : "neutral",
  } : { accent: ORG_ACCENT[activeOrg?.id ?? ""]?.hex, mono: ORG_ACCENT[activeOrg?.id ?? ""]?.mono, team: activeOrg?.name };

  return (
    <div className="dyn min-h-screen pt-11" data-testid="dynasty-v2" data-screen={screen} data-mood={mood} style={accentStyle(activeOrg?.id)}>
      {inRun ? (
        <div className="sticky top-11 z-20 border-b border-white/10 bg-[#07111f]/90 backdrop-blur" data-testid="run-bar">
          <div className="mx-auto flex h-11 max-w-4xl items-center gap-2.5 px-4 text-xs">
            <Crest org={run!.org} size={26} />
            <span className="dyn-title hidden truncate text-[13px] font-semibold text-white sm:inline">{run!.org.name.replace(/^SYN /, "")}</span>
            <span className="hidden text-white/50 sm:inline">{SEASON[Math.min(run!.nodeIdx, SEASON.length - 1)].label}</span>
            {run!.series ? <span data-testid="run-bar-series" className="whitespace-nowrap text-white/70">Series <b className="dyn-num text-white">{run!.series.wins}–{run!.series.losses}</b></span> : null}
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Cohesion <Pips n={run!.cohesion} max={5} label="Cohesion" /></span>
            <AmbienceButton />
            <Sheet open={rosterOpen} onOpenChange={setRosterOpen}>
              <SheetTrigger asChild><button type="button" data-testid="roster-open" aria-label="Open roster" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors hover:border-[#e3c66f]/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Users className="h-4 w-4" aria-hidden /></button></SheetTrigger>
              <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="roster-sheet" style={accentStyle(activeOrg?.id)}>
                <SheetHeader><SheetTitle className="dyn-title text-white">Roster</SheetTitle><SheetDescription className="text-white/60">Five starters and two bench slots.</SheetDescription></SheetHeader>
                <div className="mt-4"><RosterList run={run!} /></div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      ) : <div className="fixed right-3 top-[3.25rem] z-20"><AmbienceButton /></div>}
      <main ref={mainRef} className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-8 pt-4" data-testid="dynasty-v2-main">
        {screen !== "home" ? <ProtoBanner compact={screen === "game"} /> : null}
        {screen === "game" ? body : <Scene id={SCENE_FOR[screen]} caption={screen !== "home"} env={env} champion={screen === "end" && champion}>{body}</Scene>}
      </main>
      {cine && run ? <FullFrame kind={cine} org={run.org} opp={SEASON[Math.min(run.nodeIdx, SEASON.length - 1)].opp.name} team={run.org.name.replace(/^SYN /, "")} roster={ROLES.map((r) => run.starters[r].name)} score={run.series ? `${run.series.wins}–${run.series.losses}` : undefined} onDone={closeCine} cue={cine === "finals_intro" ? "dyn.series.finals_intro" : "dyn.end.championship"} /> : null}
      {locking && run ? <DraftLockSequence run={run} picks={picks} onDone={finishLock} /> : null}
    </div>
  );
}
