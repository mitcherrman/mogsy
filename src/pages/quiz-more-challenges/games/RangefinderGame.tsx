/**
 * PGM2 — Rangefinder, the public bonus game. The same GM-R1 `Rangefinder`
 * primitive and the same server grading as the owner lab, dealt by the PUBLIC
 * player-scoped session route. Ten abilities; each locks once; the reveal is
 * the server's. A results screen closes the run.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { Rangefinder } from "@/components/interaction-grammar/Rangefinder";
import type {
  InteractionPhase, RangefinderPublic, RangefinderResponse, RangefinderReveal, RangefinderValue,
} from "@/lib/interaction-grammar/types";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import type { RangefinderSession } from "@/lib/playtests/api";
import { toRangefinderPublic, toRangefinderReveal } from "@/pages/admin/playtests/RangefinderOwnerPlaytest";
import { useOwnerStageRoom } from "@/pages/admin/playtests/ownerArena";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import { BonusSessionError, bonusSessionsApi, describeBonusError, type BonusSessionsApi } from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import {
  BONUS_GAME_NOTE, GameError, GameLead, GameRail, GameResults, GameState, PHONE_DOCK_RESERVE_PX, RoundBar,
  useBonusRoundReport,
} from "./publicGame";

const MIN_LOCK_BEAT_MS = 420;
const TITLE = "Rangefinder";

interface Stage {
  key: string;
  content: RangefinderPublic;
  phase: InteractionPhase;
  value: RangefinderValue;
  reveal: RangefinderReveal | null;
  onChange: (token: string) => void;
  onLock: (response: RangefinderResponse) => void;
}
const StageContext = createContext<Stage | null>(null);

function Viewport() {
  const s = useContext(StageContext);
  const ref = useRef<HTMLDivElement>(null);
  const maxHeight = useOwnerStageRoom(ref, PHONE_DOCK_RESERVE_PX);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="rangefinder-game-viewport" className="flex min-h-0 flex-col">
      <Rangefinder key={s.key} content={s.content} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onLock={s.onLock} reveal={s.reveal} />
    </div>
  );
}

const RENDERER: ModuleRenderer = {
  moduleId: "bonus_game.rangefinder", moduleVersion: 1,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport, projectQuestion: () => null, summaryLabel: () => null,
};

type Load = { state: "loading" } | { state: "ready"; session: RangefinderSession } | { state: "error"; message: string };

export default function RangefinderGame({ entry, api: injected }: { entry: PublicModeEntry | null; api?: BonusSessionsApi }) {
  const api = useMemo(() => injected ?? bonusSessionsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<RangefinderValue>(null);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<RangefinderReveal | null>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [results, setResults] = useState<Record<number, RangefinderReveal>>({});
  const [finished, setFinished] = useState(false);
  const roundRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.startRangefinder()
      .then((session) => {
        if (cancelled) return;
        setLoad({ state: "ready", session });
        setIndex(0); setValue(null); setPhase("open"); setReveal(null); setError(null); setResults({}); setFinished(false);
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describeBonusError(err) }); });
    return () => { cancelled = true; };
  }, [api, generation]);

  const session = load.state === "ready" ? load.session : null;
  const round = session?.rounds[index] ?? null;
  const roundKey = session && round ? `${session.session_id}:${round.index}` : "";
  roundRef.current = roundKey;
  const content = useMemo(() => (round ? toRangefinderPublic(round) : null), [round]);

  useBonusRoundReport(entry, round && !finished ? {
    runtimeQuestionId: roundKey,
    prompt: `${round.content.prompt} ${round.content.subject.label} (${round.content.subject.sublabel}).`,
    selectedAnswer: reveal ? `${reveal.lockedText} units` : null,
    sessionId: session?.session_id ?? null,
    roundNumber: index + 1,
    moduleType: "rangefinder",
  } : null, reveal ? {
    revealed: true,
    canonicalAnswer: `${reveal.measurement.valueText} units`,
    evidence: reveal.source ? [reveal.source.label, reveal.source.url].filter(Boolean).join(" · ") : null,
  } : { revealed: false });

  const onLock = useCallback((response: RangefinderResponse) => {
    if (!session || !round) return;
    const key = `${session.session_id}:${round.index}`;
    setPhase("locked");
    setError(null);
    const beat = new Promise((r) => window.setTimeout(r, MIN_LOCK_BEAT_MS));
    Promise.all([api.lockRangefinder(session.session_id, round.index, response.stop), beat])
      .then(([result]) => {
        if (roundRef.current !== key) return;
        const next = toRangefinderReveal(result.reveal);
        setReveal(next);
        setResults((v) => ({ ...v, [round.index]: next }));
        setPhase("revealed");
      })
      .catch((err: unknown) => {
        if (roundRef.current !== key) return;
        setPhase("open");
        setError({ message: describeBonusError(err), expired: err instanceof BonusSessionError && err.expired });
      });
  }, [api, session, round]);

  const next = () => { setIndex((i) => i + 1); setValue(null); setPhase("open"); setReveal(null); setError(null); };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <GameState title={TITLE} state="loading" />;
  if (load.state === "error") return <GameState title={TITLE} state="error" message={load.message} onRetry={restart} />;
  if (!session || !round || !content) return <GameState title={TITLE} state="error" message="This game could not be dealt." onRetry={restart} />;

  const played = session.rounds.map((r) => ({ r, res: results[r.index] ?? null }));
  const tally = (v: RangefinderReveal["verdict"]) => played.filter((p) => p.res?.verdict === v).length;

  if (finished) {
    const exact = tally("exact");
    return (
      <GameResults title={TITLE} headline={`${exact} of ${session.rounds.length} exact`}
        stats={[["Exact", String(exact)], ["Short", String(tally("short"))], ["Long", String(tally("long"))]]}
        rows={played.map(({ r, res }) => ({
          label: `${r.content.subject.label} · ${r.content.subject.sublabel}`,
          detail: res ? (res.verdict === "exact" ? `Exact · ${res.measurement.valueText}` : `${res.verdict === "short" ? "Short" : "Long"} ${res.deltaText ?? ""} · ${res.measurement.valueText}`) : "—",
          tone: res?.verdict === "exact" ? "good" : res ? "bad" : "neutral",
        }))}
        onPlayAgain={restart} />
    );
  }

  const stage: Stage = { key: roundKey, content, phase, value, reveal, onChange: setValue, onLock };
  const view = labArenaView({
    title: entry?.title ?? TITLE, renderer: RENDERER, phase, selection: value, reveal: null, verdict: null,
    revealId: 0, onSelect: () => {}, onSubmit: () => {},
    eyebrow: "More Challenges", playtestNote: BONUS_GAME_NOTE,
    left: <GameRail title="Ability" testId="rangefinder-game-rail-left" rows={[
      ["Round", `${index + 1} of ${session.rounds.length}`],
      ["Ability", round.content.subject.label],
      ["Champion", round.content.subject.sublabel],
    ]} />,
    right: <GameRail title="This game" testId="rangefinder-game-rail-right" rows={[
      ["Exact", String(tally("exact"))], ["Short", String(tally("short"))], ["Long", String(tally("long"))],
    ]} />,
  });

  const chrome = (
    <div data-testid="rangefinder-game-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <GameLead title={TITLE} />
      <RoundBar index={index} total={session.rounds.length} revealed={phase === "revealed"}
        onNext={next} onFinish={() => setFinished(true)} />
    </div>
  );

  return (
    <div data-testid="rangefinder-game" data-phase={phase} data-round={index}>
      <StageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </StageContext.Provider>
      {error ? <GameError message={error.message} expired={error.expired} onRestart={restart} /> : null}
    </div>
  );
}
