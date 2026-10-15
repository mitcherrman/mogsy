/**
 * CE1 — the Combat Estimate playtest harness. DEVELOPMENT ONLY: registered in
 * App.tsx behind `import.meta.env.DEV`, so a production build drops it and the
 * path 404s.
 *
 * It is the HOST for the prototype. It builds a round from the frozen
 * authority capture, keeps the authority's result in a ref the primitive
 * never receives, and after Lock stands in for the server by grading in that
 * closure and passing only the resulting `EstimateReveal` (and the authority's
 * working) down.
 *
 * It mounts the stage inside the REAL `CanonicalArena` — the production shell,
 * header plate, grid and `ranked-question-stage` folio — by handing the arena
 * a lab-local `ModuleRenderer` whose Viewport draws the stage (Rangefinder's
 * trick). No registry, transport or contract seam is touched.
 *
 *   /dev/combat-estimate?round=jarvan-q-r3-l5-dirk-vs-olaf
 *     &state=open|set|locked|revealed-exact|revealed-over|revealed-under   (pre-arranged states for capture)
 *     &seed=<any>                                                            (pool order)
 *     &motion=reduce                                                         (force the reduced-motion path)
 *     &round=synthetic-demo                                                  (the one visual-only round)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
// NUM-REC2: the arena host (stage context, viewport, renderer, arena view)
// moved, unchanged, to a capture-free module the owner lab shares.
import { CombatEstimateArena, labArenaView, type LabStage, type Phase } from "@/components/combat-estimate/CombatEstimateArena";
import type { EstimateResponse, EstimateValue } from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import {
  buildLabRound, buildSyntheticRound, findCaptured, gradeLabRound, roundOrder, SYNTHETIC_ROUND_ID,
  type LabGrade, type LabRound,
} from "./labAuthority";

const SERVER_LATENCY_MS = 420;
type Prearranged = "open" | "set" | "locked" | "revealed-exact" | "revealed-over" | "revealed-under";

export default function CombatEstimateLab() {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed") ?? "academy";
  const order = useMemo(() => roundOrder(seed), [seed]);
  const requested = params.get("round");
  const synthetic = requested === SYNTHETIC_ROUND_ID;
  const captured = (requested && !synthetic ? findCaptured(requested) : null) ?? order[0];
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  // ---- the round. The secret lives in the round object the host keeps; the primitive gets only `content`.
  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => (synthetic ? buildSyntheticRound() : buildLabRound(captured)), [captured, synthetic]);
  const roundRef = useRef<LabRound>(round);
  roundRef.current = round;

  const [value, setValue] = useState<EstimateValue>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [grade, setGrade] = useState<LabGrade | null>(null);
  const [lastResponse, setLastResponse] = useState<EstimateResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const lockedRef = useRef(false);

  // Reset on a new round (or a regeneration), and apply a pre-arranged state when asked. Any pending reveal timer dies with the round.
  useEffect(() => {
    setGrade(null);
    setLastResponse(null);
    setRevealDone(false);
    lockedRef.current = false;
    if (prearranged === "open") { setValue(null); setPhase("open"); return; }
    const truth = round.secret.secret?.whole ?? round.secret.synthetic?.whole ?? 0;
    const max = round.content.scale.max;
    // A deterministic setting: a plain fraction of the beam, or the truth ± a quarter (wrong), or the truth itself.
    const estimate = prearranged === "revealed-exact" ? truth
      : prearranged === "revealed-over" ? Math.min(max - 1, truth + Math.max(1, Math.round(truth * 0.25)))
      : prearranged === "revealed-under" ? Math.max(0, truth - Math.max(1, Math.round(truth * 0.25)))
      : Math.round(max * 0.42);
    setValue(estimate);
    if (prearranged === "set") { setPhase("open"); return; }
    const response: EstimateResponse = { estimate };
    setLastResponse(response);
    setPhase("locked");
    lockedRef.current = true;
    if (prearranged === "locked") return;
    const t = window.setTimeout(() => { setGrade(gradeLabRound(round, response)); setPhase("revealed"); }, 300);
    return () => window.clearTimeout(t);
  }, [round, generation, prearranged]);

  const revealTimer = useRef<number | null>(null);
  useEffect(() => () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, []);
  const onLock = useCallback((response: EstimateResponse) => {
    // One submission per round: a second Lock (a double-tap, a replayed key) is ignored.
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLastResponse(response);
    setPhase("locked");
    const current = roundRef.current;
    // Stand-in for the server round trip: grade in the host's closure, hand down only the reveal.
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null;
      if (roundRef.current !== current) return; // the round changed under the request
      setGrade(gradeLabRound(current, response));
      setPhase("revealed");
    }, SERVER_LATENCY_MS);
  }, []);
  const onRevealComplete = useCallback(() => setRevealDone(true), []);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const nextRound = () => {
    const i = order.findIndex((r) => r.id === captured.id);
    go({ round: order[(i + 1) % order.length].id, state: null });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, reveal: grade?.reveal ?? null, grade, onChange: setValue, onLock, onRevealComplete,
  }), [round, generation, phase, value, grade, onLock, onRevealComplete]);
  const view = useMemo(() => labArenaView(phase), [phase]);

  const chrome = (
    // `arenaHeaderRowClass` insets the row clear of the GlobalHud's fixed chips, which otherwise sit over the row's ends and swallow clicks.
    <div data-testid="combat-estimate-lab-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="ranked-eyebrow shrink-0">Combat Estimate · CE1 lab</span>
      <span className="shrink-0 font-mono opacity-70" data-testid="lab-round">{round.id}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {(["open", "set", "locked", "revealed-exact", "revealed-over", "revealed-under"] as Prearranged[]).map((s) => (
          <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })} data-active={prearranged === s ? "" : undefined}
            className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]">
            {s}
          </button>
        ))}
        <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined}
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110]">Reduced motion</button>
        <button type="button" onClick={() => go({ round: synthetic ? null : SYNTHETIC_ROUND_ID, state: null })} data-active={synthetic ? "" : undefined} data-testid="lab-synthetic"
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#8d2f33] data-[active]:bg-[#2a1010]">Synthetic</button>
        <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} data-testid="lab-reset" className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
        <button type="button" onClick={nextRound} data-testid="lab-next" className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
        {/* Reserved: these indicators toggle by opacity so the chrome row never reflows. */}
        <span data-testid="lab-response" data-on={lastResponse ? "true" : "false"} className="inline-block w-[4.5rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono opacity-70 data-[on=false]:opacity-0">
          {lastResponse ? `{${lastResponse.estimate}}` : "—"}
        </span>
        <span data-testid="lab-reveal-done" data-on={revealDone ? "true" : "false"} className="inline-block w-[5.5rem] whitespace-nowrap opacity-70 data-[on=false]:opacity-0">reveal done</span>
      </span>
    </div>
  );

  return (
    <div data-testid="combat-estimate-lab">
      <CombatEstimateArena stage={stage} view={view} chrome={chrome} />
    </div>
  );
}
