/**
 * PERFECT TIMING — THE STATIC DEMO. DEVELOPMENT ONLY.
 *
 * A page that mounts the PT1 components on fake, labelled view models so the
 * presentation can be reviewed, screenshotted and specced without a backend
 * or the timing engine. It is NOT registered anywhere by PT1: PT4 may mount it
 * at a DEV-only route (`import.meta.env.DEV ? lazy(...) : null`, the Numeric
 * Lab's pattern) so it is dropped from production builds.
 *
 *   ?scene=stage&phase=armed|running|stopped|submitting|interrupted|error|loading
 *   ?scene=reveal&case=early|late|exact|miss|unverified|farLate
 *   ?scene=results
 *   &motion=reduce        force the reduced-motion path
 *   &icon=<url>           an ability icon to draw on the seal (none by default)
 *
 * THE "LIVE" SCENE has a demo press surface that flips armed → running →
 * stopped → revealed on each press, with a fixed demo reveal — it measures
 * nothing. It exists so the one-shot cast flash and the lock can be seen.
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { PtPhase, PtPressSurfaceProps, PtStageModel } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingArena } from "../PerfectTimingArena";
import { PerfectTimingResults } from "../PerfectTimingResults";
import { DEMO_HUD, DEMO_LABEL, DEMO_REVEALS, DEMO_ROUNDS, DEMO_SUMMARY, demoPress } from "./demoViewModels";

type Scene = "stage" | "reveal" | "results" | "live";
const PHASES: PtPhase[] = ["loading", "armed", "running", "stopped", "submitting", "interrupted", "error"];
const CASES = Object.keys(DEMO_REVEALS) as (keyof typeof DEMO_REVEALS)[];

const BTN = "whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 text-[11px] hover:border-[#d5b66f]/70 aria-pressed:border-[#d5b66f] aria-pressed:bg-[#2a2110] aria-pressed:text-[#f6e6bb]";

/** A demo press surface: the same props shape PT2's hook returns, with no clock behind it. */
function useDemoPress(phase: PtPhase, advance: () => void): PtPressSurfaceProps {
  const live = phase === "armed" || phase === "running";
  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    if (live) advance();
  }, [live, advance]);
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    if (live) advance();
  }, [live, advance]);
  return {
    onPointerDown, onKeyDown, tabIndex: 0, role: "button",
    "aria-label": phase === "armed" ? "Cast the ability" : phase === "running" ? "The ability is back up" : "Timing seal",
    "aria-disabled": !live,
  };
}

export default function PerfectTimingDemo() {
  const [params, setParams] = useSearchParams();
  const scene = (params.get("scene") as Scene | null) ?? "live";
  const phaseParam = (params.get("phase") as PtPhase | null) ?? "armed";
  const caseParam = (params.get("case") as keyof typeof DEMO_REVEALS | null) ?? "early";
  const forceReduce = params.get("motion") === "reduce";
  const iconUrl = params.get("icon");
  const roundIndex = Math.min(5, Math.max(1, Number(params.get("round") ?? 2)));

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };

  const round = useMemo(() => ({ ...DEMO_ROUNDS[roundIndex - 1], iconUrl: iconUrl ?? null }), [roundIndex, iconUrl]);

  // ---- the live scene's demo state machine (no clock, no measurement).
  const [livePhase, setLivePhase] = useState<PtPhase>("armed");
  const [liveCase, setLiveCase] = useState<keyof typeof DEMO_REVEALS>("early");
  const advance = useCallback(() => {
    setLivePhase((p) => {
      if (p === "armed") return "running";
      if (p === "running") {
        window.setTimeout(() => setLivePhase("submitting"), 180);
        window.setTimeout(() => setLivePhase("revealed"), 900);
        return "stopped";
      }
      return p;
    });
  }, []);
  const livePress = useDemoPress(livePhase, advance);
  const onNext = useCallback(() => {
    setLiveCase((c) => CASES[(CASES.indexOf(c) + 1) % CASES.length]);
    setLivePhase("armed");
  }, []);

  const model: PtStageModel = useMemo(() => {
    if (scene === "live") {
      return { round, phase: livePhase, press: livePress, reveal: livePhase === "revealed" ? DEMO_REVEALS[liveCase] : null, onNext, hud: DEMO_HUD };
    }
    if (scene === "reveal") {
      return { round, phase: "revealed", press: demoPress("Timing seal", true), reveal: DEMO_REVEALS[caseParam], onNext: () => {}, hud: DEMO_HUD };
    }
    const phase = PHASES.includes(phaseParam) ? phaseParam : "armed";
    return {
      round: phase === "loading" ? null : round,
      phase,
      press: demoPress(phase === "armed" ? "Cast the ability" : phase === "running" ? "The ability is back up" : "Timing seal", !(phase === "armed" || phase === "running")),
      statusText: phase === "error" ? "The archive did not answer. The round was not recorded." : null,
      reveal: null,
      onNext: () => {},
      hud: DEMO_HUD,
    };
  }, [scene, round, livePhase, livePress, liveCase, onNext, caseParam, phaseParam]);

  const chrome = (
    <div data-testid="pt-demo-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="shrink-0 rounded border border-amber-400/60 bg-amber-950/60 px-2 py-0.5 uppercase tracking-[0.14em] text-amber-100">{DEMO_LABEL} · fake values</span>
      <nav aria-label="Scene" className="flex shrink-0 gap-1">
        {(["live", "stage", "reveal", "results"] as Scene[]).map((s) => (
          <button key={s} type="button" aria-pressed={scene === s} onClick={() => go({ scene: s })} className={BTN}>{s}</button>
        ))}
      </nav>
      {scene === "stage" && (
        <select aria-label="Phase" value={phaseParam} onChange={(e) => go({ phase: e.target.value })}
          className="rounded border border-[#d5b66f]/30 bg-black/60 px-1 py-0.5 font-mono text-[11px] text-[#efe8d6]">
          {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      {scene === "reveal" && (
        <select aria-label="Case" value={caseParam} onChange={(e) => go({ case: e.target.value })}
          className="rounded border border-[#d5b66f]/30 bg-black/60 px-1 py-0.5 font-mono text-[11px] text-[#efe8d6]">
          {CASES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" aria-pressed={forceReduce} onClick={() => go({ motion: forceReduce ? null : "reduce" })} className={BTN}>reduce motion</button>
      </span>
    </div>
  );

  return (
    <div data-testid="perfect-timing-demo" data-scene={scene} className="min-h-screen w-full bg-[#050b15] pb-10 text-[#efe8d6]">
      {scene === "results" ? (
        <div className="mx-auto w-full max-w-3xl px-3 pt-4">
          <div className="mb-3">{chrome}</div>
          <PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => go({ scene: "live" })} onExit={() => go({ scene: "stage" })} />
        </div>
      ) : (
        <PerfectTimingArena model={model} chrome={chrome} header={{ eyebrow: "Perfect Timing · demo", playtestNote: "Demo · fake values" }} />
      )}
    </div>
  );
}
