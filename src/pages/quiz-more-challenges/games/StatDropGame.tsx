/**
 * PGM2 — Stat Drop, the public bonus game. The ORIGINAL MIG1.2 `StatDrop`
 * primitive through MIG1's own lab renderer, inside the real `CanonicalArena`,
 * dealt as a PUBLIC player-scoped session: six rounds, each locks once, and
 * the historical value is released only by that lock.
 *
 * UNGRADED by owner decision: the reveal is the authority's value and the
 * primitive's own under / over / exact words, plus the error the server
 * computed. No pass mark, tolerance or points exist anywhere here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import type { InteractionPhase, StatDropReveal } from "@/lib/interaction-grammar/types";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { StatDropPublicRound } from "@/lib/numeric-lab/api";
import { LabStageProvider, LAB_STAT_DROP_RENDERER, type PublicDropRound } from "@/pages/dev/interaction-lab/labRenderers";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import {
  BonusSessionError, bonusSessionsApi, describeBonusError, type BonusSessionsApi, type NumericFeedback, type NumericSession,
} from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import {
  BONUS_GAME_NOTE, GameError, GameLead, GameRail, GameResults, GameState, RoundBar, useBonusRoundReport,
} from "./publicGame";

const SUSPENSE_MS = 900;
const SUSPENSE_REDUCED_MS = 200;
const TITLE = "Stat Drop";

function toPublicRound(r: StatDropPublicRound): PublicDropRound {
  const subject = r.content.subject;
  const media = subject?.media ? { ...subject.media, src: resolveAssetUrl(subject.media.src) } : subject?.media ?? null;
  return {
    id: r.id, mechanic: "stat-drop", domain: r.domain, title: r.title, shape: r.shape, provenance: r.provenance_label,
    content: { ...r.content, subject: subject ? { ...subject, media } : subject },
  };
}

export function percentText(relative: number | null): string | null {
  if (relative === null) return null;
  const pct = relative * 100;
  return pct > 0 && pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

type Load = { state: "loading" } | { state: "ready"; session: NumericSession<StatDropPublicRound> } | { state: "error"; message: string };
interface Settled { reveal: StatDropReveal; feedback: NumericFeedback }

export default function StatDropGame({ entry, api: injected }: { entry: PublicModeEntry | null; api?: BonusSessionsApi }) {
  const api = useMemo(() => injected ?? bonusSessionsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [selection, setSelection] = useState<unknown>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [revealId, setRevealId] = useState(0);
  const [results, setResults] = useState<Record<number, Settled>>({});
  const [finished, setFinished] = useState(false);
  const reduced = useReducedMotionPreference();
  const beat = reduced ? SUSPENSE_REDUCED_MS : SUSPENSE_MS;
  const roundRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.startStatDrop()
      .then((session) => {
        if (cancelled) return;
        setLoad({ state: "ready", session });
        setIndex(0); setPhase("open"); setSelection(null); setError(null); setResults({}); setFinished(false);
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describeBonusError(err) }); });
    return () => { cancelled = true; };
  }, [api, generation]);

  const session = load.state === "ready" ? load.session : null;
  const wire = session?.public.rounds[index] ?? null;
  const fixture = useMemo(() => (wire ? toPublicRound(wire) : null), [wire]);
  const roundKey = session && wire ? `${session.session_id}:${index}` : "";
  roundRef.current = roundKey;
  const settled = results[index] ?? null;

  useBonusRoundReport(entry, wire && !finished ? {
    runtimeQuestionId: roundKey,
    prompt: `${wire.content.prompt} (${wire.content.metricLabel}${wire.content.unit ? `, ${wire.content.unit}` : ""})`,
    selectedAnswer: settled ? String(settled.feedback.guess) : null,
    sessionId: session?.session_id ?? null,
    roundNumber: index + 1,
    moduleType: "stat_drop",
  } : null, settled ? {
    revealed: true,
    canonicalAnswer: settled.reveal.canonicalDisplay,
    evidence: [settled.reveal.evidence, settled.reveal.source].filter(Boolean).join(" · ") || null,
  } : { revealed: false });

  const submit = useCallback((choice: SegmentChoice) => {
    if (!session || phase !== "open" || !("selected" in choice) || typeof choice.selected !== "number") return;
    const value = choice.selected;
    const key = roundKey;
    const at = index;
    setPhase("locked");
    setError(null);
    const minBeat = new Promise((r) => window.setTimeout(r, beat));
    Promise.all([api.lockStatDrop(session.session_id, at, value), minBeat]).then(([out]) => {
      if (roundRef.current !== key) return;
      setResults((r) => ({ ...r, [at]: { reveal: out.release.released as unknown as StatDropReveal, feedback: out.feedback } }));
      setRevealId((n) => n + 1);
      setPhase("revealed");
    }).catch((err: unknown) => {
      if (roundRef.current !== key) return;
      setPhase("open");
      setError({ message: describeBonusError(err), expired: err instanceof BonusSessionError && err.expired });
    });
  }, [api, session, phase, index, roundKey, beat]);

  const select = (next: unknown) => { if (phase === "open") setSelection(next); };
  const next = () => { setIndex((i) => i + 1); setPhase("open"); setSelection(null); setError(null); };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <GameState title={TITLE} state="loading" />;
  if (load.state === "error") return <GameState title={TITLE} state="error" message={load.message} onRetry={restart} />;
  if (!session || !wire || !fixture) return <GameState title={TITLE} state="error" message="This game could not be dealt." onRetry={restart} />;

  const total = session.public.rounds.length;
  if (finished) {
    const done = session.public.rounds.map((r, i) => ({ r, s: results[i] ?? null }));
    const rel = done.map((d) => d.s?.feedback.relative_error).filter((x): x is number => typeof x === "number");
    const mean = rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : null;
    const best = rel.length ? Math.min(...rel) : null;
    return (
      <GameResults title={TITLE} headline={mean === null ? "Run complete" : `Off by ${percentText(mean)} on average`}
        stats={[["Rounds", String(done.filter((d) => d.s).length)], ["Average error", percentText(mean) ?? "—"],
          ["Closest", percentText(best) ?? "—"]]}
        rows={done.map(({ r, s }) => ({
          label: r.title,
          detail: s ? `You ${s.feedback.guess} · Actual ${s.reveal.canonicalDisplay}${percentText(s.feedback.relative_error) ? ` · ${percentText(s.feedback.relative_error)} off` : ""}` : "—",
          tone: "neutral",
        }))}
        onPlayAgain={restart} />
    );
  }

  const revealed = phase === "revealed" && settled !== null;
  const reveal: SurfaceReveal | null = revealed
    ? { revealed: true, isCorrect: null, correctOptionId: null, explanation: settled?.reveal.evidence ?? null }
    : null;
  const view = labArenaView({
    title: entry?.title ?? TITLE, renderer: LAB_STAT_DROP_RENDERER, phase, selection, reveal, verdict: null, revealId,
    onSelect: select, onSubmit: submit,
    eyebrow: "More Challenges", playtestNote: BONUS_GAME_NOTE,
    left: <GameRail title="Stat" testId="stat-drop-game-rail-left" rows={[
      ["Round", `${index + 1} of ${total}`], ["Stat", wire.content.metricLabel], ["Source", wire.provenance_label],
    ]} />,
    right: <GameRail title="Your error" testId="stat-drop-game-rail-right" rows={[
      ["This stat", settled ? `${settled.feedback.error > 0 ? "+" : ""}${settled.feedback.error}${percentText(settled.feedback.relative_error) ? ` (${percentText(settled.feedback.relative_error)})` : ""}` : "—"],
      ["Graded", "No — estimation only"],
    ]} />,
  });

  const chrome = (
    <div data-testid="stat-drop-game-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <GameLead title={TITLE} />
      <RoundBar index={index} total={total} revealed={revealed} onNext={next} onFinish={() => setFinished(true)} />
    </div>
  );

  return (
    <div data-testid="stat-drop-game" data-phase={phase} data-round={index}>
      <LabStageProvider value={{ fixture, phase, dropReveal: revealed ? settled!.reveal : null }}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageProvider>
      {error ? <GameError message={error.message} expired={error.expired} onRestart={restart} /> : null}
    </div>
  );
}
