/**
 * THE DUEL EXPERIENCE: what wraps a match in the Arena.
 *
 *   intro  →  ready check  →  countdown  →  [the match]  →  result  →  rematch
 *
 * The match itself is the existing `QuizRankedMatch` with `host="tournament"`
 * in production (handoff §7.3 "Match handoff"): the Ranked engine is server
 * authoritative and nothing here could stand in for it. What this component
 * owns is the ceremony around it. Under the fixture gateway the match is a
 * SIMULATED round-by-round rundown (clearly marked), whose result is then
 * committed to the bracket node the duel came from.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { ArrowLeft, Check, RefreshCw, Swords, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { RoleMascot } from "@/components/mascot/RoleMascot";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { useViewportLock } from "@/lib/pro-play/worldsExperience/viewportLock";
import { cn } from "@/lib/utils";

import { ARENA_SFX } from "../audio";
import type { ArenaEntrant } from "../contracts";
import { accentFor, accentStyle, entrantRole, hashString } from "../identity";
import { ease } from "../motion";
import { Btn, EntrantAvatar, Eyebrow, Pill, SimulatedBadge, VersusMark } from "../ui/parts";

export type DuelPhase = "intro" | "ready" | "countdown" | "match" | "result";

export interface DuelRound {
  n: number;
  hitA: boolean;
  hitB: boolean;
  ptsA: number;
  ptsB: number;
  msA: number;
  msB: number;
}

export interface DuelOutcome {
  winner: 0 | 1 | null;
  scoreA: number;
  scoreB: number;
}

/** A deterministic rundown for a fixture duel. */
export function scriptedRounds(seed: string, modules = 6, tilt = 0): DuelRound[] {
  const out: DuelRound[] = [];
  for (let i = 1; i <= modules; i++) {
    const h = hashString(`${seed}:${i}`);
    const hitA = (h % 100) < 68 + tilt;
    const hitB = ((h >>> 8) % 100) < 62 - tilt;
    const tier = ((h >>> 16) % 3 === 0 ? 3 : 2);
    const msA = 2200 + ((h >>> 4) % 6000);
    const msB = 2200 + ((h >>> 12) % 6000);
    const ptsA = hitA ? tier + (hitB && msA < msB ? 1 : !hitB ? 1 : 0) : 0;
    const ptsB = hitB ? tier + (hitA && msB < msA ? 1 : !hitA ? 1 : 0) : 0;
    out.push({ n: i, hitA, hitB, ptsA, ptsB, msA, msB });
  }
  return out;
}

export function DuelExperience({ you, opponent, title, kicker, bestOf = 1, seed, onFinished, backHref, onRematch, allowRematch = true, roundCount = 6 }: {
  you: ArenaEntrant;
  opponent: ArenaEntrant;
  title: string;
  kicker?: string;
  bestOf?: number;
  /** Seeds the scripted rundown. */
  seed: string;
  /** The match ended (called once per play-through). */
  onFinished?: (outcome: DuelOutcome) => void;
  backHref: string;
  onRematch?: () => void;
  /** A bracket-bound duel commits its result and offers no rematch. */
  allowRematch?: boolean;
  roundCount?: number;
}) {
  useViewportLock();
  const motion = useMotionAllowed();
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();
  const [phase, setPhase] = useState<DuelPhase>("intro");
  const [readyYou, setReadyYou] = useState(false);
  const [readyOpp, setReadyOpp] = useState(false);
  const [count, setCount] = useState(3);
  const [shown, setShown] = useState(0);
  const rounds = useMemo(() => scriptedRounds(seed, roundCount), [seed, roundCount]);
  const outcome = useMemo<DuelOutcome>(() => {
    const a = rounds.reduce((s, r) => s + r.ptsA, 0);
    const b = rounds.reduce((s, r) => s + r.ptsB, 0);
    return { winner: a > b ? 0 : b > a ? 1 : null, scoreA: a, scoreB: b };
  }, [rounds]);
  const finished = useRef(false);
  const speed = reduced ? 0.5 : 1;

  // intro → ready
  useEffect(() => {
    if (phase !== "intro") return;
    sfx.play(ARENA_SFX.versus, { eventId: `arena:duel:${seed}:versus` });
    const t = window.setTimeout(() => setPhase("ready"), motion ? 2600 : 1200);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") setPhase("ready"); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [phase, motion, sfx, seed]);
  // the opponent readies up shortly after you do
  useEffect(() => {
    if (phase !== "ready" || !readyYou) return;
    const t = window.setTimeout(() => { setReadyOpp(true); sfx.play(ARENA_SFX.ready, { eventId: `arena:duel:${seed}:ready:opp` }); }, 1100 * speed);
    return () => window.clearTimeout(t);
  }, [phase, readyYou, sfx, seed, speed]);
  useEffect(() => {
    if (phase !== "ready" || !readyYou || !readyOpp) return;
    const t = window.setTimeout(() => { setCount(3); setPhase("countdown"); }, 700 * speed);
    return () => window.clearTimeout(t);
  }, [phase, readyYou, readyOpp, speed]);
  // countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      sfx.play("ranked.duel.begin", { eventId: `arena:duel:${seed}:begin` });
      const t = window.setTimeout(() => setPhase("match"), 500 * speed);
      return () => window.clearTimeout(t);
    }
    sfx.play(count === 1 ? "quiz.countdown.final" : "quiz.countdown.urgent", { eventId: `arena:duel:${seed}:count:${count}` });
    const t = window.setTimeout(() => setCount((c) => c - 1), 900 * speed);
    return () => window.clearTimeout(t);
  }, [phase, count, sfx, seed, speed]);
  // the simulated rundown
  useEffect(() => {
    if (phase !== "match") return;
    if (shown >= rounds.length) {
      const t = window.setTimeout(() => setPhase("result"), 900 * speed);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      const r = rounds[shown];
      sfx.play(r.hitA ? "ranked.answer.correct" : "ranked.answer.incorrect", { eventId: `arena:duel:${seed}:r${r.n}` });
      setShown((s) => s + 1);
    }, (shown === 0 ? 500 : 950) * speed);
    return () => window.clearTimeout(t);
  }, [phase, shown, rounds, sfx, seed, speed]);
  useEffect(() => {
    if (phase !== "result" || finished.current) return;
    finished.current = true;
    sfx.play(outcome.winner === 0 ? "ranked.match.victory" : outcome.winner === 1 ? "ranked.match.defeat" : "ranked.match.draw", { eventId: `arena:duel:${seed}:result` });
    onFinished?.(outcome);
  }, [phase, outcome, onFinished, sfx, seed]);

  const restart = useCallback(() => {
    finished.current = false;
    setReadyYou(false); setReadyOpp(false); setShown(0); setCount(3); setPhase("intro");
    onRematch?.();
  }, [onRematch]);

  const runA = rounds.slice(0, shown).reduce((s, r) => s + r.ptsA, 0);
  const runB = rounds.slice(0, shown).reduce((s, r) => s + r.ptsB, 0);
  const maxPts = Math.max(1, outcome.scoreA, outcome.scoreB);

  return (
    <div className={cn("ta ta-stage flex h-[var(--app-viewport-h)] flex-col overflow-clip", motion && "ta--motion")} data-testid="ta-duel" data-phase={phase}>
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-1">
        <Link to={backHref} className="ta-btn ta-btn--sm !px-2" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Eyebrow>{kicker ?? "Arena duel"} · Bo{bestOf}</Eyebrow><SimulatedBadge label="Simulated match" /></div>
          <h1 className="ta-title ta-title--gold truncate text-[18px] font-bold leading-tight sm:text-[22px]">{title}</h1>
        </div>
        <p className="ta-num hidden text-[11px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.5)] sm:block">{phase === "match" ? `Round ${Math.min(shown + 1, rounds.length)} of ${rounds.length}` : phase}</p>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4">
        <AnimatePresence mode="wait">
          {/* ── intro: the VS card ── */}
          {(phase === "intro" || phase === "ready" || phase === "countdown") && (
            <fm.div key="vs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={ease(0.3)} className={cn("relative flex w-full max-w-4xl flex-col items-center gap-5", motion && phase === "intro" && "ta-cine--motion")}>
              <span aria-hidden="true" className="ta-cine-bolt pointer-events-none absolute inset-y-[-20%] left-1/2 w-[22vw] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,243,196,0.3),transparent)] opacity-0" />
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
                <Seat entrant={you} side="left" label="You" ready={phase !== "intro" ? readyYou : null} onReady={phase === "ready" && !readyYou ? () => { setReadyYou(true); sfx.play(ARENA_SFX.ready, { eventId: `arena:duel:${seed}:ready:you` }); } : undefined} />
                <div className="relative flex flex-col items-center gap-3">
                  <span aria-hidden="true" className="ta-cine-vs-ring absolute left-1/2 top-[2.6rem] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f6dd8f]/60 opacity-0 sm:top-[3.1rem] sm:h-32 sm:w-32" />
                  <span className="ta-cine-word"><VersusMark size={84} className="sm:!h-[104px] sm:!w-[104px] sm:!text-[36px]" /></span>
                  <AnimatePresence mode="wait">
                    {phase === "countdown" && (
                      <fm.p key={count} className={cn("ta-count ta-title--gold text-[72px] sm:text-[110px]", motion && "ta-count--tick")} data-testid="ta-count" aria-live="assertive">{count === 0 ? "GO" : count}</fm.p>
                    )}
                    {phase === "ready" && (
                      <fm.p key="ready-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[rgba(215,205,180,0.7)]" aria-live="polite">
                        {readyYou && readyOpp ? "Both ready" : readyYou ? "Waiting for opponent…" : "Ready check"}
                      </fm.p>
                    )}
                    {phase === "intro" && <fm.p key="intro-line" className="ta-cine-rows text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[rgba(215,205,180,0.7)]">{rounds.length} rounds · points · speed bonus</fm.p>}
                  </AnimatePresence>
                </div>
                <Seat entrant={opponent} side="right" label="Opponent" ready={phase !== "intro" ? readyOpp : null} />
              </div>
              {phase === "intro" && <p className="text-[11px] text-[rgba(215,205,180,0.45)]">Tap, Enter or Space to skip</p>}
            </fm.div>
          )}

          {/* ── the simulated match: a round-by-round rundown ── */}
          {phase === "match" && (
            <fm.div key="match" initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease(0.3)} className="flex w-full max-w-3xl flex-col gap-3">
              <ScoreRail you={you} opponent={opponent} a={runA} b={runB} max={maxPts} />
              <ol className="flex flex-col gap-1.5" aria-label="Rounds" data-testid="ta-rounds">
                {rounds.map((r, i) => (
                  <li key={r.n} className={cn("ta-plate ta-round-row grid grid-cols-[2.6rem_1fr_auto_1fr] items-center gap-2 px-3 py-1.5 text-[12.5px]", i < shown ? "ta-round-row--in" : "opacity-25")}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[rgba(215,205,180,0.6)]">R{r.n}</span>
                    <Verdict hit={i < shown ? r.hitA : null} pts={r.ptsA} ms={r.msA} pop={i === shown - 1} align="left" />
                    <span className="ta-title text-[10px] text-[rgba(215,205,180,0.35)]">vs</span>
                    <Verdict hit={i < shown ? r.hitB : null} pts={r.ptsB} ms={r.msB} pop={i === shown - 1} align="right" />
                  </li>
                ))}
              </ol>
              <p className="text-center text-[11px] text-[rgba(215,205,180,0.45)]">Simulated rundown. In production the Ranked match UI plays here (server-graded, server-timed).</p>
            </fm.div>
          )}

          {/* ── result ── */}
          {phase === "result" && (
            <fm.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ease(0.3)} className="relative flex w-full max-w-4xl flex-col items-center gap-4" data-testid="ta-result" data-outcome={outcome.winner === 0 ? "victory" : outcome.winner === 1 ? "defeat" : "draw"}>
              <span aria-hidden="true" className="ta-cine-whiteout pointer-events-none fixed inset-0 bg-[#fff3c4]" />
              <p className={cn("ta-result text-[48px] sm:text-[86px]", outcome.winner === 0 ? "ta-result--victory" : outcome.winner === 1 ? "ta-result--defeat" : "ta-result--draw")}>
                {outcome.winner === 0 ? "Victory" : outcome.winner === 1 ? "Defeat" : "Draw"}
              </p>
              <span className="ta-rule w-[min(28rem,70%)]" aria-hidden="true" />
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
                <Seat entrant={you} side="left" label="You" won={outcome.winner === 0} lost={outcome.winner === 1} action={outcome.winner === 0 ? "celebrate" : outcome.winner === 1 ? "hit" : "focus"} />
                <ScorePlate a={outcome.scoreA} b={outcome.scoreB} winner={outcome.winner} />
                <Seat entrant={opponent} side="right" label="Opponent" won={outcome.winner === 1} lost={outcome.winner === 0} action={outcome.winner === 1 ? "celebrate" : outcome.winner === 0 ? "hit" : "focus"} />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {allowRematch && <Btn tone="primary" onClick={restart} data-testid="ta-rematch"><RefreshCw className="h-4 w-4" aria-hidden="true" />Rematch</Btn>}
                <Link to={backHref} className="ta-btn" data-testid="ta-back-bracket"><Trophy className="h-4 w-4" aria-hidden="true" />Back to the bracket</Link>
              </div>
              {outcome.winner === null && <p className="text-[11px] text-[rgba(215,205,180,0.5)]">Draws replay: one more game decides the node.</p>}
            </fm.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Seat({ entrant, side, label, ready = null, onReady, won = false, lost = false, action }: {
  entrant: ArenaEntrant;
  side: "left" | "right";
  label: string;
  ready?: boolean | null;
  onReady?: () => void;
  won?: boolean;
  lost?: boolean;
  action?: "celebrate" | "hit" | "focus";
}) {
  const role = entrantRole(entrant);
  const accent = accentFor(entrant.profile_id);
  const circumference = 2 * Math.PI * 22;
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2 text-center", side === "left" ? "ta-cine-left" : "ta-cine-right", lost && "opacity-60 saturate-50")} style={accentStyle(entrant.profile_id)} data-testid={`ta-seat-${side}`}>
      <span className={cn("ta-seat__figure ta-seat__figure--float", won && "shadow-[0_0_60px_-10px_rgba(227,198,111,0.8)]")}>
        {role ? (
          <RoleMascot role={role} art="compact" fit="cover" facing={side === "left" ? "right" : "left"} loading="eager" action={action ?? null} actionId={action ?? null} className="h-full w-full" />
        ) : (
          <EntrantAvatar entrant={entrant} size="xl" crown={false} className="!h-full !w-full !rounded-[1.2rem]" />
        )}
        {won && <span className="absolute left-1/2 top-1 -translate-x-1/2"><Pill tone="gold"><Trophy className="h-3 w-3" aria-hidden="true" />Winner</Pill></span>}
      </span>
      <span className="ta-title max-w-full truncate text-[15px] font-semibold text-white sm:text-[19px]">{entrant.display_name}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent.hex }}>{label}{entrant.tier ? ` · ${entrant.tier}` : ""}</span>
      {ready !== null && (
        <span className="relative mt-1 inline-flex h-12 w-12 items-center justify-center" data-testid={`ta-ready-${side}`} data-ready={ready}>
          <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
            <circle cx="24" cy="24" r="22" fill="none" stroke={ready ? "#6ee7b7" : accent.hex} strokeWidth="2.5" strokeDasharray={circumference} strokeDashoffset={ready ? 0 : circumference * 0.75} className="ta-ready-ring" strokeLinecap="round" />
          </svg>
          {onReady ? (
            <button type="button" onClick={onReady} className="ta-btn ta-btn--primary !min-h-0 h-9 w-9 !rounded-full !p-0" aria-label="I am ready"><Swords className="h-4 w-4" /></button>
          ) : (
            <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", ready ? "bg-[rgba(110,231,183,0.18)] text-[#8ff0b8]" : "text-[rgba(215,205,180,0.4)]")}>{ready ? <Check className="h-5 w-5" /> : <span className="text-[10px] font-bold">…</span>}</span>
          )}
        </span>
      )}
    </div>
  );
}

function ScoreRail({ you, opponent, a, b, max }: { you: ArenaEntrant; opponent: ArenaEntrant; a: number; b: number; max: number }) {
  return (
    <div className="ta-plate ta-plate--gold grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 px-3 py-2.5" data-testid="ta-score-rail">
      <EntrantAvatar entrant={you} size="sm" crown={false} />
      <div className="flex flex-col gap-1" style={accentStyle(you.profile_id)}>
        <span className="flex justify-between text-[11px] font-bold uppercase tracking-[0.14em]"><span className="truncate text-white">{you.display_name}</span><span className="ta-num text-[#f1dc9c]">{a}</span></span>
        <span className="ta-bar"><span className="ta-bar__fill" style={{ transform: `scaleX(${a / max})` }} /></span>
      </div>
      <VersusMark size={34} />
      <div className="flex flex-col gap-1" style={accentStyle(opponent.profile_id)}>
        <span className="flex justify-between text-[11px] font-bold uppercase tracking-[0.14em]"><span className="ta-num text-[#f1dc9c]">{b}</span><span className="truncate text-white">{opponent.display_name}</span></span>
        <span className="ta-bar"><span className="ta-bar__fill" style={{ transform: `scaleX(${b / max})`, transformOrigin: "100% 50%" }} /></span>
      </div>
      <EntrantAvatar entrant={opponent} size="sm" crown={false} facing="left" />
    </div>
  );
}

function Verdict({ hit, pts, ms, pop, align }: { hit: boolean | null; pts: number; ms: number; pop: boolean; align: "left" | "right" }) {
  return (
    <span className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
      <span className={cn("ta-verdict", hit === null ? "bg-white/5" : hit ? "ta-verdict--hit" : "ta-verdict--miss", pop && "ta-verdict--pop")} aria-label={hit === null ? "pending" : hit ? "correct" : "wrong"}>{hit === null ? "" : hit ? "✓" : "✕"}</span>
      <span className="ta-num text-[12px] text-[rgba(215,205,180,0.6)]">{hit === null ? "" : `${(ms / 1000).toFixed(1)}s`}</span>
      <span className={cn("ta-num ml-auto text-[13px] font-bold", align === "right" && "ml-0 mr-auto", pts > 0 ? "text-[#f1dc9c]" : "text-[rgba(215,205,180,0.35)]")}>{hit === null ? "" : `+${pts}`}</span>
    </span>
  );
}

function ScorePlate({ a, b, winner }: { a: number; b: number; winner: 0 | 1 | null }) {
  const [shown, setShown] = useState({ a: 0, b: 0 });
  const motion = useMotionAllowed();
  useEffect(() => {
    if (!motion) { setShown({ a, b }); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setShown({ a: Math.round(a * e), b: Math.round(b * e) });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [a, b, motion]);
  return (
    <div className="flex flex-col items-center gap-1" data-testid="ta-score-plate">
      <p className="ta-num ta-title text-[40px] font-black leading-none text-white sm:text-[64px]">
        <span className={cn(winner === 0 && "text-[#f6dd8f]")}>{shown.a}</span>
        <span className="mx-2 text-white/30 sm:mx-4">–</span>
        <span className={cn(winner === 1 && "text-[#f6dd8f]")}>{shown.b}</span>
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgba(215,205,180,0.55)]">Points</p>
    </div>
  );
}

export const duelStyle = (id: string): CSSProperties => accentStyle(id);
