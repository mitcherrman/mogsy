/**
 * NUM-LAB — the Stat Drop + Combat Estimate playtest harness. PROTOTYPE ONLY.
 *
 * Mounted twice, never publicly:
 *   * `/dev/numeric-modes`          — DEVELOPMENT ONLY (`import.meta.env.DEV`),
 *                                     the capture target for the e2e spec.
 *   * `/admin/numeric-modes-lab`    — inside the /admin layout gate, so the
 *                                     owner can play it on a deployed build.
 * It is not linked from Quiz, Daily or Ranked, sends nothing to the backend and
 * stores nothing.
 *
 * It is the HOST: it holds the lab authority (answers in a closure), passes the
 * primitive only `content`, and after Lock stands in for the server — a short
 * fake latency, then a `NumericReveal`. The values are SYNTHETIC fixtures; the
 * banner says so on every screen.
 *
 *   ?round=<id>
 *   &state=open|placed|revealed-exact|revealed-within|revealed-outside
 *   &motion=reduce
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { StatDrop } from "@/components/interaction-grammar/StatDrop";
import { CombatEstimate } from "@/components/interaction-grammar/CombatEstimate";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import type { NumericResponse, NumericReveal } from "@/lib/interaction-grammar/numericModes";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import { createLabAuthority, type BaselineComparison, type LabRound } from "./labAuthority";

const SERVER_LATENCY_MS = 420;
type Prearranged = "open" | "placed" | "revealed-exact" | "revealed-within" | "revealed-outside";
const STATES: readonly Prearranged[] = ["open", "placed", "revealed-exact", "revealed-within", "revealed-outside"];

const BTN = "whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]";

export default function NumericModesLab() {
  const authority = useMemo(() => createLabAuthority(), []);
  const [params, setParams] = useSearchParams();
  const round: LabRound = authority.rounds.find((r) => r.id === params.get("round")) ?? authority.rounds[0];
  const forceReduce = params.get("motion") === "reduce";
  const rawState = params.get("state") as Prearranged | null;
  const prearranged: Prearranged = rawState && STATES.includes(rawState) ? rawState : "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [value, setValue] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [reveal, setReveal] = useState<NumericReveal | null>(null);
  const [baseline, setBaseline] = useState<BaselineComparison | null>(null);
  const timer = useRef<number | null>(null);

  const resolve = useCallback((response: NumericResponse, delay: number) => {
    setPhase("locked");
    if (timer.current) window.clearTimeout(timer.current);
    // Stand-in for the server round trip: grade in the authority's closure, hand down only the reveal.
    timer.current = window.setTimeout(() => {
      const graded = authority.grade(round, response);
      setReveal(graded.reveal);
      setBaseline(graded.baseline);
      setPhase("revealed");
    }, delay);
  }, [authority, round]);

  useEffect(() => {
    setReveal(null);
    setBaseline(null);
    setPhase("open");
    setValue(null);
    setText("");
    if (prearranged === "open") return;
    const kind = prearranged === "placed" ? "within" : (prearranged.replace("revealed-", "") as "exact" | "within" | "outside");
    const guess = authority.sampleGuess(round, kind);
    setValue(guess);
    setText(String(guess));
    if (prearranged.startsWith("revealed")) resolve({ selected: guess }, 200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [round, prearranged, generation, authority, resolve]);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const nextRound = () => {
    const i = authority.rounds.findIndex((r) => r.id === round.id);
    go({ round: authority.rounds[(i + 1) % authority.rounds.length].id, state: null });
  };
  const onLock = (response: NumericResponse) => resolve(response, SERVER_LATENCY_MS);

  return (
    <div data-testid="numeric-modes-lab" className="min-h-screen w-full bg-[#050b15] text-[#efe8d6]">
      <div className="mx-auto w-full max-w-[960px] px-2 py-2 sm:px-4 sm:py-3">
        <div role="note" data-testid="lab-prototype-banner"
          className="mb-2 flex items-start gap-2 rounded border border-amber-400/60 bg-amber-950/60 px-3 py-2 text-[12px] leading-snug text-amber-100">
          <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="uppercase tracking-[0.14em]">Prototype · visual lab — not authoritatively graded.</strong>{" "}
            Synthetic fixture values, not game facts. No server authority, no patch, not in Quiz, Daily or Ranked.
          </span>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#a9b3c1]">
          <span className="ranked-eyebrow shrink-0">Numeric modes · lab</span>
          <nav aria-label="Round" className="flex flex-wrap gap-1">
            {authority.rounds.map((r) => (
              <button key={r.id} type="button" onClick={() => go({ round: r.id, state: null })}
                data-active={r.id === round.id ? "" : undefined} className={BTN}>
                {r.mode === "stat-drop" ? "Stat Drop" : "Combat Est."} · {r.title}
              </button>
            ))}
          </nav>
          <span className="flex flex-wrap items-center gap-1 sm:ml-auto">
            {STATES.map((s) => (
              <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })}
                data-active={prearranged === s ? "" : undefined} className={BTN}>{s}</button>
            ))}
            <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })}
              data-active={forceReduce ? "" : undefined} className={BTN}>Reduced motion</button>
            <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} className={BTN}>Reset</button>
          </span>
        </div>

        <div className="rounded-lg bg-[#efe6cf] px-3 py-4 text-[#2c2417] sm:px-6 sm:py-6">
          {round.mode === "stat-drop" ? (
            <StatDrop key={`${round.id}:${generation}`} content={round.content} phase={phase}
              value={value} onChange={setValue} onLock={onLock} reveal={reveal} />
          ) : (
            <CombatEstimate key={`${round.id}:${generation}`} content={round.content} phase={phase}
              text={text} onTextChange={setText} onLock={onLock} reveal={reveal} />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#a9b3c1]">
          {baseline ? <span data-testid="lab-baseline">{baseline.summary}</span> : <span>Lock an answer to compare the lab band rule with the production exact-cell baseline.</span>}
          {phase === "revealed" ? (
            <button type="button" onClick={nextRound} data-testid="lab-next"
              className="ml-auto rounded border border-[#d5b66f] bg-[#2a2110] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f6e6bb] hover:bg-[#3a2d14]">
              Next round
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
