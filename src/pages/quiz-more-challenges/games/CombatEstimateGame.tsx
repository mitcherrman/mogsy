/**
 * PGM2 — Combat Estimate, the public bonus game. The ORIGINAL CE1 two-beam
 * balance (`CombatEstimateArena`) dealt as a PUBLIC player-scoped session: six
 * hits, each locks once, and the authority's damage is released only by that
 * lock. CE1's own `gradeEstimate` words the comparison (exact / under / over,
 * the error); the server's feedback carries the same error. UNGRADED by owner
 * decision: no pass mark or points.
 *
 * The owner lab's arena view stages a paused clock and two combatant rails;
 * a public game has no opponent and no clock, so this view draws neither.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { CombatEstimateArena, labArenaView, type LabStage, type Phase, type StageRound } from "@/components/combat-estimate/CombatEstimateArena";
import {
  gradeEstimate, scenarioFromPublic, secretFromRelease, type CombatEstimateScenario, type CombatEstimateSecret,
  type PublicCapturedScenario,
} from "@/lib/combat-estimate/contract";
import { CE_IMPLEMENTATION, contentFor, type RoundGrade } from "@/lib/combat-estimate/rounds";
import type { EstimateResponse, EstimateValue } from "@/lib/interaction-grammar/types";
import type { ArenaViewModel } from "@/lib/ranked-core/arenaView";
import {
  BonusSessionError, bonusSessionsApi, describeBonusError, type BonusSessionsApi, type NumericFeedback, type NumericSession,
} from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import {
  BONUS_GAME_NOTE, GameError, GameLead, GameRail, GameResults, GameState, RoundBar, useBonusRoundReport,
} from "./publicGame";
import { percentText } from "./StatDropGame";

const TITLE = "Combat Estimate";

/** CE1's reveal, worded for players: the authority's working and its items,
 *  never a backend build. */
export function publicGrade(scenario: CombatEstimateScenario, secret: CombatEstimateSecret, estimate: number): RoundGrade {
  const reveal = gradeEstimate(secret, estimate, "Combat authority");
  const component = scenario.ability.component;
  const items = (secret.provenance.get("item_revisions") as string) || "none";
  return {
    reveal: { ...reveal, note: component ? `Modelled component: ${component}.` : null },
    working: secret.working,
    sourceLine: `${(secret.provenance.get("implementation") as string) ?? CE_IMPLEMENTATION} · formula ${secret.formulaTier.toLowerCase()} · items ${items}`,
  };
}

type Load =
  | { state: "loading" }
  | { state: "ready"; session: NumericSession<PublicCapturedScenario> & { public: { capture?: { implementation?: string } } } }
  | { state: "error"; message: string };
interface Settled { grade: RoundGrade; feedback: NumericFeedback }

export default function CombatEstimateGame({ entry, api: injected }: { entry: PublicModeEntry | null; api?: BonusSessionsApi }) {
  const api = useMemo(() => injected ?? bonusSessionsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<EstimateValue>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [results, setResults] = useState<Record<number, Settled>>({});
  const [finished, setFinished] = useState(false);
  const lockedRef = useRef(false);
  const roundRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.startCombatEstimate()
      .then((session) => {
        if (cancelled) return;
        setLoad({ state: "ready", session: session as never });
        setIndex(0); setValue(null); setPhase("open"); setError(null); setResults({}); setFinished(false);
        lockedRef.current = false;
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describeBonusError(err) }); });
    return () => { cancelled = true; };
  }, [api, generation]);

  const session = load.state === "ready" ? load.session : null;
  const implementation = session?.public.capture?.implementation ?? CE_IMPLEMENTATION;
  const rounds: StageRound[] = useMemo(() => (session?.public.rounds ?? []).map((pub) => {
    const scenario = scenarioFromPublic(pub, "");
    return { id: pub.id, scenario, content: contentFor(scenario, implementation) };
  }), [session, implementation]);
  const round = rounds[index] ?? null;
  const roundKey = session && round ? `${session.session_id}:${index}` : "";
  roundRef.current = roundKey;
  const settled = results[index] ?? null;

  useBonusRoundReport(entry, round && !finished ? {
    runtimeQuestionId: roundKey,
    prompt: `${round.content.prompt} ${round.content.definition ?? ""}`.trim(),
    selectedAnswer: settled ? String(settled.feedback.guess) : null,
    sessionId: session?.session_id ?? null,
    roundNumber: index + 1,
    moduleType: "combat_estimate",
  } : null, settled ? {
    revealed: true,
    canonicalAnswer: settled.grade.reveal.truth.valueText,
    evidence: settled.grade.sourceLine,
  } : { revealed: false });

  const onChange = useCallback((v: number) => setValue(v), []);
  const onLock = useCallback((response: EstimateResponse) => {
    if (!session || !round || lockedRef.current) return;
    lockedRef.current = true;
    const key = roundKey;
    const at = index;
    setPhase("locked");
    setError(null);
    api.lockCombatEstimate(session.session_id, at, response.estimate).then((out) => {
      if (roundRef.current !== key) return;
      const secret = secretFromRelease(round.id, out.release.released as never);
      setResults((r) => ({ ...r, [at]: { grade: publicGrade(round.scenario, secret, response.estimate), feedback: out.feedback } }));
      setPhase("revealed");
    }).catch((err: unknown) => {
      if (roundRef.current !== key) return;
      lockedRef.current = false;
      setPhase("open");
      setError({ message: describeBonusError(err), expired: err instanceof BonusSessionError && err.expired });
    });
  }, [api, session, round, roundKey, index]);
  const onRevealComplete = useCallback(() => {}, []);

  const stage: LabStage | null = useMemo(() => (round ? {
    round, generation: generation * 100 + index, phase, value, reveal: settled?.grade.reveal ?? null,
    grade: settled?.grade ?? null, onChange, onLock, onRevealComplete,
  } : null), [round, generation, index, phase, value, settled, onChange, onLock, onRevealComplete]);

  const next = () => { setIndex((i) => i + 1); setValue(null); setPhase("open"); setError(null); lockedRef.current = false; };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <GameState title={TITLE} state="loading" />;
  if (load.state === "error") return <GameState title={TITLE} state="error" message={load.message} onRetry={restart} />;
  if (!session || !round || !stage) return <GameState title={TITLE} state="error" message="This game could not be dealt." onRetry={restart} />;

  const total = rounds.length;
  if (finished) {
    const done = rounds.map((r, i) => ({ r, s: results[i] ?? null }));
    const rel = done.map((d) => d.s?.feedback.relative_error).filter((x): x is number => typeof x === "number");
    const mean = rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : null;
    const exact = done.filter((d) => d.s?.grade.reveal.verdict === "exact").length;
    return (
      <GameResults title={TITLE} headline={mean === null ? "Run complete" : `Off by ${percentText(mean)} on average`}
        stats={[["Hits", String(done.filter((d) => d.s).length)], ["Exact", String(exact)], ["Average error", percentText(mean) ?? "—"]]}
        rows={done.map(({ r, s }) => ({
          label: `${r.scenario.ability.name} → ${r.scenario.target.champion}`,
          detail: s ? `You ${s.feedback.guess} · Actual ${s.grade.reveal.truth.valueText}${s.grade.reveal.error.relativeText ? ` · ${s.grade.reveal.error.relativeText}` : ""}` : "—",
          tone: s?.grade.reveal.verdict === "exact" ? "good" : "neutral",
        }))}
        onPlayAgain={restart} />
    );
  }

  const base = labArenaView(phase, { eyebrow: "More Challenges", title: entry?.title ?? TITLE, playtestNote: BONUS_GAME_NOTE });
  const view: ArenaViewModel = {
    ...base,
    header: { ...base.header, timer: null, timerLabel: "" },
    left: { kind: "panel", node: <GameRail title="Hit" testId="combat-estimate-game-rail-left" rows={[
      ["Round", `${index + 1} of ${total}`],
      ["Ability", `${round.scenario.ability.name} (rank ${round.scenario.ability.rank})`],
      ["Target", round.scenario.target.champion],
    ]} /> },
    right: { kind: "panel", node: <GameRail title="Your error" testId="combat-estimate-game-rail-right" rows={[
      ["This hit", settled ? settled.grade.reveal.error.signedText : "—"],
      ["Graded", "No — estimation only"],
    ]} /> },
    timeline: null,
  } as ArenaViewModel;

  const chrome = (
    <div data-testid="combat-estimate-game-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <GameLead title={TITLE} />
      <RoundBar index={index} total={total} revealed={phase === "revealed"} onNext={next} onFinish={() => setFinished(true)} />
    </div>
  );

  return (
    <div data-testid="combat-estimate-game" data-phase={phase} data-round={index}>
      <CombatEstimateArena stage={stage} view={view} chrome={chrome} />
      {error ? <GameError message={error.message} expired={error.expired} onRestart={restart} /> : null}
    </div>
  );
}
