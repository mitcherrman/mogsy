/**
 * NUM-REC2 — Stat Drop, owner playtest. The ORIGINAL MIG1.2 `StatDrop`
 * primitive through MIG1's own lab renderer, inside the real `CanonicalArena`,
 * fed by the owner lab's authenticated backend instead of `labFixtures.ts`.
 *
 * The page holds only PUBLIC rounds. On Lock it posts the value; the backend
 * validates it and releases the round's hidden reveal (the authority value,
 * its display, the evidence and the source), which the primitive DISPLAYS —
 * ACTUAL flag, gap, under / over / exact in words. MIG1.2 has no grading
 * policy (Stat Drop is on HOLD); nothing here invents one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import type { InteractionPhase, StatDropReveal } from "@/lib/interaction-grammar/types";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import { NumericLabApiError, type NumericLabApi, type StatDropPublicRound, type StatDropRounds } from "@/lib/numeric-lab/api";
// MIG1's renderer, arena view and cues hold no fixture (labRenderers imports
// fixture TYPES only), so the owner lab reuses them rather than forking them.
import { LabStageProvider, LAB_STAT_DROP_RENDERER, type PublicDropRound } from "@/pages/dev/interaction-lab/labRenderers";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import { useLabCues } from "@/pages/dev/interaction-lab/labCues";
import { PROTOTYPE_NOTE } from "@/lib/numeric-lab/labels";
import type { LockedRound } from "./NumericLabPage";

/** MIG1.2's suspense beats (InteractionLab.SUSPENSE_MS / _REDUCED_MS). */
const SUSPENSE_MS = 900;
const SUSPENSE_REDUCED_MS = 200;

function toPublicRound(r: StatDropPublicRound): PublicDropRound {
  const subject = r.content.subject;
  const media = subject?.media ? { ...subject.media, src: resolveAssetUrl(subject.media.src) } : subject?.media ?? null;
  return {
    id: r.id, mechanic: "stat-drop", domain: r.domain, title: r.title, shape: r.shape, provenance: r.provenance_label,
    content: { ...r.content, subject: subject ? { ...subject, media } : subject },
  };
}

function Rail({ title, testId, rows }: { title: string; testId: string; rows: [string, React.ReactNode][] }) {
  return (
    <aside data-testid={testId} className="ranked-panel hidden h-full flex-col gap-3 p-4 text-[#efe8d6] lg:flex">
      <p className="ranked-eyebrow">{title}</p>
      <dl className="flex flex-col gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#a9b3c1]">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function StatDropOwnerLab({ api, data, onSettled, modeSwitch }: {
  api: NumericLabApi;
  data: StatDropRounds;
  onSettled: (round: LockedRound) => void;
  /** The page's mechanic switch, drawn in the arena's own chrome row. */
  modeSwitch: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const rounds = data.rounds.map(toPublicRound);
  const fixture = rounds.find((r) => r.id === params.get("round")) ?? rounds[0];
  const fixtureRef = useRef(fixture.id);
  fixtureRef.current = fixture.id;

  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [selection, setSelection] = useState<unknown>(null);
  const [response, setResponse] = useState<SegmentChoice | null>(null);
  const [dropReveal, setDropReveal] = useState<StatDropReveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealId, setRevealId] = useState(0);
  const [round, setRound] = useState(0);
  const startedAt = useRef<number | null>(null);
  const reduced = useReducedMotionPreference();
  const beat = reduced ? SUSPENSE_REDUCED_MS : SUSPENSE_MS;
  const cues = useLabCues();

  useEffect(() => {
    setPhase("open"); setSelection(null); setResponse(null); setDropReveal(null); setError(null);
    startedAt.current = null;
    setRound((n) => n + 1);
  }, [fixture.id]);

  const submit = useCallback((choice: SegmentChoice) => {
    if (phase !== "open" || !("selected" in choice) || typeof choice.selected !== "number") return;
    const value = choice.selected;
    const id = fixture.id;
    const seconds = startedAt.current === null ? null : Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    setResponse(choice);
    setPhase("locked");
    cues.cue("lock", `${round}:lock`);
    const minBeat = new Promise((r) => window.setTimeout(r, beat));
    Promise.all([api.lockStatDrop(id, value), minBeat]).then(([release]) => {
      if (fixtureRef.current !== id) return;
      setDropReveal(release.released);
      setRevealId((n) => n + 1);
      cues.cue("resolve", `${round}:reveal`);
      setPhase("revealed");
      onSettled({ mode: "stat-drop", round: id, value, seconds });
    }).catch((err: unknown) => {
      if (fixtureRef.current !== id) return;
      setPhase("open");
      setError(err instanceof NumericLabApiError ? err.message : "The lock could not be recorded.");
    });
  }, [phase, fixture.id, api, beat, cues, round, onSettled]);

  const select = (next: unknown) => {
    if (phase !== "open") return;
    if (startedAt.current === null) startedAt.current = Date.now();
    setSelection(next);
  };
  const choose = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("round", id);
    setParams(p, { replace: true });
  };
  const resetRound = () => {
    setPhase("open"); setSelection(null); setResponse(null); setDropReveal(null); setError(null);
    startedAt.current = null; setRound((n) => n + 1);
  };
  const step = (delta: number) => {
    const at = rounds.findIndex((r) => r.id === fixture.id);
    choose(rounds[(at + delta + rounds.length) % rounds.length].id);
  };

  const revealed = phase === "revealed";
  const reveal: SurfaceReveal | null = revealed
    ? { revealed: true, isCorrect: null, correctOptionId: null, explanation: dropReveal?.evidence ?? null }
    : null;
  const view = labArenaView({
    title: "Prototype · historical capture", renderer: LAB_STAT_DROP_RENDERER, phase, selection, reveal, verdict: null, revealId,
    onSelect: select, onSubmit: submit,
    eyebrow: "Stat Drop · owner playtest", playtestNote: PROTOTYPE_NOTE,
    left: <Rail title="Round" testId="owner-sd-rail-left" rows={[
      ["Round", <code key="id">{fixture.id}</code>], ["Shape", fixture.shape], ["Source", fixture.provenance],
    ]} />,
    right: <Rail title="Transport" testId="owner-sd-rail-right" rows={[
      ["Phase", phase.toUpperCase()],
      ["Sent", response ? <code key="r">{JSON.stringify(response)}</code> : "— (not locked)"],
      ["Grading", "None. Stat Drop has no approved policy (MIG1.2: HOLD)."],
    ]} />,
  });

  const chrome = (
    <div data-testid="owner-sd-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      {modeSwitch}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" data-testid="owner-sd-prev" onClick={() => step(-1)} aria-label="Previous round"
          className="min-h-[28px] min-w-[28px] rounded border border-[#d5b66f]/30">◀</button>
        <select data-testid="owner-sd-round" value={fixture.id} onChange={(e) => choose(e.target.value)} aria-label="Round"
          className="max-w-[14rem] rounded border border-[#d5b66f]/30 bg-black/60 px-1 py-0.5 text-[11px] text-[#efe8d6]">
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <button type="button" data-testid="owner-sd-next" onClick={() => step(1)} aria-label="Next round"
          className="min-h-[28px] min-w-[28px] rounded border border-[#d5b66f]/30">▶</button>
        <button type="button" data-testid="owner-sd-reset" onClick={resetRound}
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
      </span>
    </div>
  );

  return (
    <div data-testid="owner-stat-drop" data-phase={phase}>
      <LabStageProvider value={{ fixture, phase, dropReveal: revealed ? dropReveal : null }}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageProvider>
      {error ? <p role="alert" data-testid="owner-sd-error" className="mx-auto max-w-3xl px-4 py-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
