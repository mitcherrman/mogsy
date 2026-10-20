/**
 * UX-1 / VIS-F1 — Worlds Dynasty clickable gameplay prototype (DEV ONLY, SYNTHETIC).
 *
 * Route: `/dev/dynasty-v2` (registered only under `import.meta.env.DEV`).
 *        `?view=objectives`  objective gallery (Baron 0-3, Dragon, Elder).
 *        `?view=showcase`    VIS-F1 showcase: closeout, result, series and run-end heroes.
 *        `?seed=abc`          start with a given run seed.
 *
 * This is a flow prototype. It is NOT connected to the authoritative Combat
 * v2 / Event E0 simulator, any backend, auth or real data. See `engine.ts`.
 *
 * VIS-F1 adds the visual shell: the `.dyn` atmosphere (one stage light whose
 * hue follows the game's mood), the org accent, and a run bar with the crest.
 * Flow, state and every test id are unchanged from UX-1.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import "./vis.css";
import { useSfx } from "@/lib/audio/useSfx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  applyPrep, applyTactic, finishGame, finishSeries, newRun, signPlayer, startSeries,
  type Game, type GameSummary, type PrepPick, type Run,
} from "./engine";
import { SEASON, type Org, type Player, type Role } from "./fixtures";
import { GameView, type GameMood } from "./GameView";
import { ObjectiveGallery } from "./ObjectiveGallery";
import { Showcase } from "./Showcase";
import { Crest, Pips, ProtoBanner, accentStyle } from "./parts";
import {
  DraftScreen, EndScreen, GameResultScreen, HomeScreen, OrgScreen, PrepScreen, RecruitScreen, RosterList, RosterScreen,
  ScoutScreen, SeasonScreen, SeriesScreen, StarsScreen, TacticScreen,
} from "./screens";

type ScreenId = "home" | "org" | "stars" | "roster" | "season" | "recruit" | "prep" | "scout" | "draft" | "game" | "result" | "tactic" | "series" | "end";

export default function DynastyV2Prototype() {
  const [params] = useSearchParams();
  const view = params.get("view");
  if (view === "objectives") return <ObjectiveGallery />;
  if (view === "showcase") return <Showcase />;
  return <Flow initialSeed={params.get("seed") ?? "ux1-0001"} />;
}

function Flow({ initialSeed }: { initialSeed: string }) {
  const sfx = useSfx();
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
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo?.(0, 0);
    mainRef.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
  }, [screen]);

  const go = useCallback((s: ScreenId) => { sfx.play("ui.button.press"); setScreen(s); }, [sfx]);

  const beginSeries = () => {
    if (!run) return;
    const r = startSeries(run);
    setRun(r); setPrep([]); setOffer(null);
    go(SEASON[r.nodeIdx].window === "transfer" ? "recruit" : "prep");
  };

  const finishCurrentGame = (g: Game) => {
    const out = finishGame(run!, g);
    setRun(out.run); setGame(g); setSummary(out.summary);
    sfx.play(out.summary.won ? "ranked.match.victory" : "ranked.match.defeat");
    setScreen("result");
  };

  const afterSeries = () => {
    const r = finishSeries(run!);
    setRun(r);
    go(r.finished && !r.alive ? "end" : r.finished ? "end" : "season");
  };

  let body;
  switch (screen) {
    case "home":
      body = <HomeScreen run={run} seed={seed} onSeed={setSeed} onNew={() => { setRun(null); go("org"); }} onResume={() => go(run!.series ? "season" : run!.finished ? "end" : "season")} />;
      break;
    case "org":
      body = <OrgScreen onChoose={(o) => { setOrg(o); setStars([]); go("stars"); }} />;
      break;
    case "stars":
      body = <StarsScreen org={org!} selected={stars} onToggle={(id) => setStars((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s))}
        onConfirm={() => { setRun(newRun(seed, org!, stars)); go("roster"); }} />;
      break;
    case "roster":
      body = <RosterScreen run={run!} onNext={() => go("season")} />;
      break;
    case "season":
      body = <SeasonScreen run={run!} onBegin={beginSeries} />;
      break;
    case "recruit":
      body = <RecruitScreen run={run!} picked={offer} onPick={setOffer} onSign={(p: Player) => { setRun(signPlayer(run!, p)); go("prep"); }} onSkip={() => go("prep")} />;
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
        onLock={() => { setGame(null); go("game"); }} />;
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
            <Sheet open={rosterOpen} onOpenChange={setRosterOpen}>
              <SheetTrigger asChild><button type="button" data-testid="roster-open" aria-label="Open roster" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors hover:border-[#e3c66f]/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]"><Users className="h-4 w-4" aria-hidden /></button></SheetTrigger>
              <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="roster-sheet" style={accentStyle(activeOrg?.id)}>
                <SheetHeader><SheetTitle className="dyn-title text-white">Roster</SheetTitle><SheetDescription className="text-white/60">Five starters and two bench slots.</SheetDescription></SheetHeader>
                <div className="mt-4"><RosterList run={run!} /></div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      ) : null}
      <main ref={mainRef} className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-8 pt-4" data-testid="dynasty-v2-main">
        {screen !== "home" ? <ProtoBanner compact={screen === "game"} /> : null}
        {body}
      </main>
    </div>
  );
}
