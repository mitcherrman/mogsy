/**
 * NUM-REC2 — Combat Estimate, owner playtest. The ORIGINAL CE1 two-beam
 * balance (`EstimateBeam` inside `CombatEstimateStage`, inside the real
 * `CanonicalArena`) fed by the owner lab's authenticated backend instead of
 * the bundled capture.
 *
 * The page holds only PUBLIC rounds. On Lock it posts the estimate; the
 * backend validates it and releases that round's private block, which CE1's
 * own `gradeEstimate` turns into the descriptive reveal (exact / under / over,
 * the errors, the working). No pass mark exists and none is computed here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { CombatEstimateArena, labArenaView, type LabStage, type Phase, type StageRound } from "@/components/combat-estimate/CombatEstimateArena";
import { scenarioFromPublic, secretFromRelease } from "@/lib/combat-estimate/contract";
import { contentFor, revealFor, type RoundGrade } from "@/lib/combat-estimate/rounds";
import type { EstimateResponse, EstimateValue } from "@/lib/interaction-grammar/types";
import { NumericLabApiError, type CombatEstimateRounds, type NumericLabApi } from "@/lib/numeric-lab/api";
import { PROTOTYPE_NOTE } from "@/lib/numeric-lab/labels";
import type { LockedRound } from "./NumericLabPage";

const BTN = "whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70";

export function CombatEstimateOwnerLab({ api, data, onSettled, modeSwitch }: {
  api: NumericLabApi;
  data: CombatEstimateRounds;
  onSettled: (round: LockedRound) => void;
  /** The page's mechanic switch, drawn in the arena's own chrome row. */
  modeSwitch: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const commit = data.capture.backend_commit;
  const rounds: StageRound[] = useMemo(() => data.rounds.map((pub) => {
    const scenario = scenarioFromPublic(pub, commit);
    return { id: pub.id, scenario, content: contentFor(scenario, data.capture.implementation) };
  }), [data, commit]);
  const round = rounds.find((r) => r.id === params.get("round")) ?? rounds[0];
  const roundRef = useRef(round);
  roundRef.current = round;

  const [generation, setGeneration] = useState(0);
  const [value, setValue] = useState<EstimateValue>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [grade, setGrade] = useState<RoundGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = useRef(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    setValue(null); setPhase("open"); setGrade(null); setError(null);
    lockedRef.current = false; startedAt.current = null;
  }, [round, generation]);

  const onChange = useCallback((v: number) => {
    if (startedAt.current === null) startedAt.current = Date.now();
    setValue(v);
  }, []);

  const onLock = useCallback((response: EstimateResponse) => {
    if (lockedRef.current) return; // one submission per round
    lockedRef.current = true;
    setPhase("locked");
    const current = roundRef.current;
    const seconds = startedAt.current === null ? null : Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    api.lockCombatEstimate(current.id, response.estimate).then((release) => {
      if (roundRef.current !== current) return; // the round changed under the request
      const secret = secretFromRelease(current.id, release.released);
      setGrade(revealFor(current.scenario, secret, response.estimate, release.backend_commit));
      setPhase("revealed");
      onSettled({ mode: "combat-estimate", round: current.id, value: response.estimate, seconds });
    }).catch((err: unknown) => {
      if (roundRef.current !== current) return;
      lockedRef.current = false;
      setPhase("open");
      setError(err instanceof NumericLabApiError ? err.message : "The lock could not be recorded.");
    });
  }, [api, onSettled]);
  const onRevealComplete = useCallback(() => {}, []);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const nextRound = () => {
    const i = rounds.findIndex((r) => r.id === round.id);
    go({ round: rounds[(i + 1) % rounds.length].id });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, reveal: grade?.reveal ?? null, grade, onChange, onLock, onRevealComplete,
  }), [round, generation, phase, value, grade, onChange, onLock, onRevealComplete]);
  const view = useMemo(() => labArenaView(phase, { eyebrow: "Combat Estimate · owner playtest", title: "Prototype · historical capture", playtestNote: PROTOTYPE_NOTE }), [phase]);

  const chrome = (
    <div data-testid="owner-ce-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      {modeSwitch}
      <label className="flex shrink-0 items-center gap-1">
        <span className="sr-only">Round</span>
        <select data-testid="owner-ce-round" value={round.id} onChange={(e) => go({ round: e.target.value })}
          className="max-w-[16rem] rounded border border-[#d5b66f]/30 bg-black/60 px-1 py-0.5 font-mono text-[11px] text-[#efe8d6]">
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </label>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" data-testid="lab-reset" onClick={() => setGeneration((g) => g + 1)} className={BTN}>Reset</button>
        <button type="button" data-testid="lab-next" onClick={nextRound}
          className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
      </span>
    </div>
  );

  return (
    <div data-testid="owner-combat-estimate" data-phase={phase}>
      <CombatEstimateArena stage={stage} view={view} chrome={chrome} />
      {error ? <p role="alert" data-testid="owner-ce-error" className="mx-auto max-w-3xl px-4 py-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
