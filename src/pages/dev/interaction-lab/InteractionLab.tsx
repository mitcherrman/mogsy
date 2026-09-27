/**
 * MIG1.1 — DEV-ONLY Interaction Lab: `/dev/interaction-lab`.
 *
 * Two reusable interaction primitives (Data Duel, Stat Drop), each shown with
 * a Pro Play and a Leaguecraft fixture, rendered INSIDE THE REAL
 * `CanonicalArena` through lab-only `ModuleRenderer`s.
 *
 * What this is NOT: a mode, a runtime, a question engine, a scoring system or
 * a registry entry. There is no fetch, no persistence, no analytics and no
 * production hook here (a test pins the imports). The only "grading" is the
 * lab controller comparing a Data Duel pick against the fixture's canonical
 * side to choose the overlay stamp — lab-scoped by construction.
 *
 * The route exists only in development builds (`isInteractionLabEnabled`, and
 * the conditional lazy import + route in App.tsx), so it is absent from the
 * production route table and bundle.
 *
 *   /dev/interaction-lab?mechanic=stat-drop&domain=leaguecraft
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import { labFixture, type LabDomain, type LabFixture, type LabMechanic } from "./labFixtures";
import { LabStageProvider, labRendererFor, type LabStage } from "./labRenderers";
import { labArenaView } from "./labArenaView";

/** The suspense beat between LOCK and REVEAL. Shorter, still present, when motion is reduced. */
export const SUSPENSE_MS = 1100;
export const SUSPENSE_REDUCED_MS = 450;

const MECHANICS: { id: LabMechanic; label: string; component: string }[] = [
  { id: "data-duel", label: "Data Duel", component: "DataDuel" },
  { id: "stat-drop", label: "Stat Drop", component: "StatDrop" },
];
const DOMAINS: { id: LabDomain; label: string }[] = [
  { id: "pro-play", label: "Pro Play" },
  { id: "leaguecraft", label: "Leaguecraft" },
];

function readParams(): { mechanic: LabMechanic; domain: LabDomain } {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  return {
    mechanic: p.get("mechanic") === "stat-drop" ? "stat-drop" : "data-duel",
    domain: p.get("domain") === "leaguecraft" ? "leaguecraft" : "pro-play",
  };
}

/** The arena's reveal for a fixture — what a settled round would carry. */
function surfaceRevealFor(fixture: LabFixture, response: SegmentChoice | null): SurfaceReveal {
  if (fixture.mechanic === "data-duel") {
    const { content, hidden } = fixture;
    const picked = response && "selected" in response ? response.selected : null;
    const winner = hidden.canonicalToken === content.left.token ? "left"
      : hidden.canonicalToken === content.right.token ? "right" : null;
    return {
      revealed: true,
      isCorrect: picked === hidden.canonicalToken,
      correctOptionId: hidden.canonicalToken,
      explanation: hidden.evidence ?? null,
      evidence: {
        kind: "comparison", winner,
        left: { label: content.left.label, valueDisplay: hidden.values[content.left.token] ?? null },
        right: { label: content.right.label, valueDisplay: hidden.values[content.right.token] ?? null },
      },
    };
  }
  return { revealed: true, isCorrect: null, correctOptionId: null, explanation: fixture.hidden.evidence ?? null };
}

function Segmented<T extends string>({ label, testId, options, value, onChange }: {
  label: string; testId: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="ranked-eyebrow hidden sm:inline">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-[#b9934c]/50">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} data-testid={`${testId}-${o.id}`}
            onClick={() => onChange(o.id)}
            className={`min-h-[40px] px-3 text-xs font-bold uppercase tracking-[0.14em] transition-colors motion-reduce:transition-none ${
              value === o.id ? "bg-[#2a2110] text-[#f6e6bb]" : "bg-black/40 text-[#a9b3c1] hover:text-[#efe8d6]"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RailCard({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  // Flank panels are desktop furniture: below `lg` the arena stacks, and the
  // interaction must not be pushed under two QA cards on a phone.
  return (
    <aside data-testid={testId} className="ranked-panel hidden h-full flex-col gap-3 p-4 text-[#efe8d6] lg:flex">
      <p className="ranked-eyebrow">{title}</p>
      {children}
    </aside>
  );
}

function Row({ k, v, testId }: { k: string; v: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a9b3c1]">{k}</span>
      <span data-testid={testId} className="break-words text-[13px] leading-snug">{v}</span>
    </div>
  );
}

export function InteractionLab({ suspenseMs }: { suspenseMs?: number } = {}) {
  const initial = useMemo(readParams, []);
  const [mechanic, setMechanic] = useState<LabMechanic>(initial.mechanic);
  const [domain, setDomain] = useState<LabDomain>(initial.domain);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [selection, setSelection] = useState<unknown>(null);
  const [response, setResponse] = useState<SegmentChoice | null>(null);
  const [revealId, setRevealId] = useState(0);
  const timer = useRef<number | null>(null);
  const reduced = useReducedMotionPreference();
  const beat = suspenseMs ?? (reduced ? SUSPENSE_REDUCED_MS : SUSPENSE_MS);

  const fixture = labFixture(mechanic, domain);
  const renderer = labRendererFor(mechanic);
  const meta = MECHANICS.find((m) => m.id === mechanic)!;

  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const reset = () => {
    clearTimer();
    setPhase("open"); setSelection(null); setResponse(null);
  };
  // Any content change is a fresh, unanswered round.
  useEffect(reset, [mechanic, domain]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mechanic", mechanic);
    url.searchParams.set("domain", domain);
    window.history.replaceState(window.history.state, "", url);
  }, [mechanic, domain]);

  const runReveal = () => {
    clearTimer();
    setPhase("locked");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRevealId((n) => n + 1);
      setPhase("revealed");
    }, beat);
  };
  const submit = (choice: SegmentChoice) => {
    if (phase !== "open") return;
    setResponse(choice);
    runReveal();
  };

  const revealed = phase === "revealed";
  const reveal = revealed ? surfaceRevealFor(fixture, response) : null;
  const verdict = revealed && fixture.mechanic === "data-duel" ? (reveal?.isCorrect ? "correct" : "incorrect") : null;
  const stage: LabStage = {
    fixture, phase,
    dropReveal: revealed && fixture.mechanic === "stat-drop" ? fixture.hidden : null,
  };

  const left = (
    <RailCard title="Lab · Interaction" testId="lab-rail-left">
      <Row k="Primitive" v={<code>{meta.component}</code>} testId="lab-primitive" />
      <Row k="Renderer" v={<code>{renderer.moduleId}</code>} testId="lab-renderer" />
      <Row k="Domain" v={DOMAINS.find((d) => d.id === domain)!.label} />
      <Row k="Fixture" v={<code>{fixture.id}</code>} />
      <Row k="Source" v={fixture.provenance} />
    </RailCard>
  );
  const right = (
    <RailCard title="Lab · Transport" testId="lab-rail-right">
      <Row k="Phase" v={phase.toUpperCase()} testId="lab-phase" />
      <Row k="Pending selection" v={selection === null ? "—" : <code>{String(selection)}</code>} />
      <Row k="Emitted SegmentChoice" testId="lab-response"
        v={response ? <code>{JSON.stringify(response)}</code> : "— (not locked)"} />
      {verdict && <Row k="Lab verdict (fixture)" v={verdict.toUpperCase()} testId="lab-verdict" />}
      <p className="mt-auto text-[11px] leading-snug text-[#a9b3c1]">
        Nothing leaves this page: no request, no analytics, no attempt record.
      </p>
    </RailCard>
  );

  const view = labArenaView({
    title: meta.label, renderer, phase, selection, reveal, verdict, revealId,
    onSelect: (s) => { if (phase === "open") setSelection(s); },
    onSubmit: submit, left, right,
  });

  const chrome = (
    // `lg:pl-12 lg:pr-64` keep the controls clear of the global HUD, whose logo
    // and account pill float over this row's two ends from `lg` up.
    <div data-testid="lab-controls" className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1 lg:pl-12 lg:pr-64">
      <Segmented<LabMechanic> label="Interaction" testId="lab-mechanic" options={MECHANICS} value={mechanic} onChange={setMechanic} />
      <Segmented<LabDomain> label="Domain" testId="lab-domain" options={DOMAINS} value={domain} onChange={setDomain} />
      <div role="group" aria-label="State" className="flex items-center gap-2">
        <button type="button" data-testid="lab-reset" onClick={reset}
          className="min-h-[40px] rounded-md border border-[#b9934c]/50 bg-black/40 px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#efe8d6] hover:bg-black/60">
          Reset
        </button>
        <button type="button" data-testid="lab-replay" onClick={runReveal} disabled={!revealed}
          className="min-h-[40px] rounded-md border border-[#b9934c]/50 bg-black/40 px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#efe8d6] hover:bg-black/60 disabled:opacity-40">
          Replay reveal
        </button>
      </div>
    </div>
  );

  return (
    <div data-testid="interaction-lab" data-mechanic={mechanic} data-domain={domain} data-phase={phase}>
      <LabStageProvider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageProvider>
    </div>
  );
}

export default function InteractionLabPage() {
  // Belt and braces: the route is already absent from production builds.
  if (!import.meta.env.DEV) return null;
  return <InteractionLab />;
}
