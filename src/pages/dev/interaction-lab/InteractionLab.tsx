/**
 * MIG1.1/1.2 — DEV-ONLY Interaction Lab: `/dev/interaction-lab`.
 *
 * Two reusable interaction primitives (Data Duel, Stat Drop), each certified
 * against several Pro Play and Leaguecraft fixtures, rendered INSIDE THE REAL
 * `CanonicalArena` through lab-only `ModuleRenderer`s.
 *
 * What this is NOT: a mode, a runtime, a question engine, a scoring system or
 * a registry entry. There is no fetch, no persistence (beyond a per-viewer
 * "lab cues" switch), no analytics and no production hook here (a test pins
 * the imports). The only "grading" is the lab controller comparing a Data Duel
 * pick against the fixture's canonical side to choose the overlay stamp —
 * lab-scoped by construction.
 *
 * The route exists only in development builds (`isInteractionLabEnabled`, and
 * the conditional lazy import + route in App.tsx), so it is absent from the
 * production route table and bundle.
 *
 *   /dev/interaction-lab?fixture=drop.lc.zed-shadow-slash
 *   /dev/interaction-lab?mechanic=stat-drop&domain=leaguecraft
 */
import { useEffect, useRef, useState } from "react";
import { Repeat, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import {
  labFixtureById, labFixturesFor, type LabDomain, type LabFixture, type LabMechanic,
} from "./labFixtures";
import { LabStageProvider, labRendererFor, type LabStage } from "./labRenderers";
import { labArenaView } from "./labArenaView";
import { useLabCues } from "./labCues";

/**
 * The suspense beat between LOCK and REVEAL. Tuned for Daily/Ranked pace: long
 * enough to feel the lock land, short enough not to stall a run. Under reduced
 * motion the beat is only a state change — the player is not made to wait
 * through an animation that is not playing.
 */
export const SUSPENSE_MS = 900;
export const SUSPENSE_REDUCED_MS = 200;

const MECHANICS: { id: LabMechanic; label: string; component: string }[] = [
  { id: "data-duel", label: "Data Duel", component: "DataDuel" },
  { id: "stat-drop", label: "Stat Drop", component: "StatDrop" },
];
const DOMAINS: { id: LabDomain; label: string }[] = [
  { id: "pro-play", label: "Pro Play" },
  { id: "leaguecraft", label: "Leaguecraft" },
];

function readInitialFixture(): LabFixture {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const byId = labFixtureById(p.get("fixture") ?? "");
  if (byId) return byId;
  const mechanic: LabMechanic = p.get("mechanic") === "stat-drop" ? "stat-drop" : "data-duel";
  const domain: LabDomain = p.get("domain") === "leaguecraft" ? "leaguecraft" : "pro-play";
  return labFixturesFor(mechanic, domain)[0];
}

/** The arena's reveal for a fixture — what a settled round would carry. */
function surfaceRevealFor(fixture: LabFixture, response: SegmentChoice | null): SurfaceReveal {
  if (fixture.mechanic === "data-duel") {
    const { content, hidden } = fixture;
    const picked = response && "selected" in response ? response.selected : null;
    // A tie has no winning SIDE: `winner: null` is exactly RG3's "the payload
    // did not name a side", and `correctOptionId` still names the tie token.
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

const CONTROL = "min-h-[40px] rounded-md border border-[#b9934c]/50 bg-black/40 px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#efe8d6] hover:bg-black/60 disabled:opacity-40";

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
  const [fixtureId, setFixtureId] = useState<string>(() => readInitialFixture().id);
  const fixture = labFixtureById(fixtureId) ?? readInitialFixture();
  const { mechanic, domain } = fixture;
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [selection, setSelection] = useState<unknown>(null);
  const [response, setResponse] = useState<SegmentChoice | null>(null);
  const [revealId, setRevealId] = useState(0);
  // Bumps on every fresh round, so a cue's eventId never collides across rounds.
  const [round, setRound] = useState(0);
  const picks = useRef(0);
  const timer = useRef<number | null>(null);
  const reduced = useReducedMotionPreference();
  const beat = suspenseMs ?? (reduced ? SUSPENSE_REDUCED_MS : SUSPENSE_MS);
  const cues = useLabCues();

  const renderer = labRendererFor(mechanic);
  const meta = MECHANICS.find((m) => m.id === mechanic)!;
  const siblings = labFixturesFor(mechanic, domain);
  const cycle = labFixturesFor(mechanic);

  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const reset = () => {
    clearTimer();
    setPhase("open"); setSelection(null); setResponse(null);
    setRound((n) => n + 1);
  };
  // Any content change is a fresh, unanswered round.
  useEffect(reset, [fixtureId]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", fixtureId);
    url.searchParams.delete("mechanic");
    url.searchParams.delete("domain");
    window.history.replaceState(window.history.state, "", url);
  }, [fixtureId]);

  const chooseMechanic = (m: LabMechanic) => setFixtureId((labFixturesFor(m, domain)[0] ?? labFixturesFor(m)[0]).id);
  const chooseDomain = (d: LabDomain) => setFixtureId(labFixturesFor(mechanic, d)[0].id);
  const step = (delta: number) => {
    const at = cycle.findIndex((f) => f.id === fixtureId);
    setFixtureId(cycle[(at + delta + cycle.length) % cycle.length].id);
  };

  const runReveal = (committed: SegmentChoice | null) => {
    clearTimer();
    setPhase("locked");
    const nextReveal = revealId + 1;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // ONE cue per settlement, keyed to it.
      if (fixture.mechanic === "data-duel") {
        const picked = committed && "selected" in committed ? committed.selected : null;
        cues.cue(picked === fixture.hidden.canonicalToken ? "correct" : "incorrect", `${round}:reveal:${nextReveal}`);
      } else {
        cues.cue("resolve", `${round}:reveal:${nextReveal}`);
      }
      setRevealId(nextReveal);
      setPhase("revealed");
    }, beat);
  };
  const submit = (choice: SegmentChoice) => {
    if (phase !== "open") return;
    setResponse(choice);
    cues.cue("lock", `${round}:lock`);
    runReveal(choice);
  };
  const select = (next: unknown) => {
    if (phase !== "open") return;
    // A Duel pick is a discrete choice and gets a tick; a Stat Drop drag
    // reports every step and would chatter, so it stays silent.
    if (mechanic === "data-duel" && next !== selection) cues.cue("select", `${round}:pick:${++picks.current}`);
    setSelection(next);
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
      <Row k="Fixture" v={<code>{fixture.id}</code>} testId="lab-fixture-id" />
      <Row k="Certifies" v={fixture.shape} />
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
      <Row k="Sound" testId="lab-sound-state"
        v={cues.globallyMuted ? "Muted globally (Settings)" : cues.enabled ? "Lab cues on" : "Lab cues off"} />
      <p className="mt-auto text-[11px] leading-snug text-[#a9b3c1]">
        Nothing leaves this page: no request, no analytics, no attempt record.
      </p>
    </RailCard>
  );

  const view = labArenaView({
    title: meta.label, renderer, phase, selection, reveal, verdict, revealId,
    onSelect: select, onSubmit: submit, left, right,
  });

  const chrome = (
    // `lg:pl-12 lg:pr-64` keep the controls clear of the global HUD, whose logo
    // and account pill float over this row's two ends from `lg` up.
    // Compact on a phone (two rows): the controls are QA furniture and must
    // not push the arena off the first screen.
    <div data-testid="lab-controls" className="flex flex-col gap-2 py-1 lg:pl-12 lg:pr-64">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<LabMechanic> label="Interaction" testId="lab-mechanic" options={MECHANICS} value={mechanic} onChange={chooseMechanic} />
        <Segmented<LabDomain> label="Domain" testId="lab-domain" options={DOMAINS} value={domain} onChange={chooseDomain} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Fixture" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <button type="button" data-testid="lab-fixture-prev" aria-label="Previous fixture" onClick={() => step(-1)}
            className={CONTROL}>◀</button>
          {/* One native select until `xl`; only a wide screen gets the chips, so the
              controls stay two rows and never eat the arena's height. */}
          <select data-testid="lab-fixture-select" aria-label="Fixture" value={fixtureId}
            onChange={(e) => setFixtureId(e.currentTarget.value)}
            className="min-h-[40px] min-w-0 flex-1 rounded-md border border-[#b9934c]/50 bg-black/60 px-2 text-xs text-[#efe8d6] xl:hidden">
            {siblings.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          {siblings.map((f) => (
            <button key={f.id} type="button" data-testid={`lab-fixture-${f.id}`} aria-pressed={f.id === fixtureId}
              onClick={() => setFixtureId(f.id)}
              className={`hidden min-h-[40px] rounded-md border px-2.5 text-[11px] font-semibold tracking-[0.04em] xl:inline-block ${
                f.id === fixtureId ? "border-[#d5b66f]/80 bg-[#2a2110] text-[#f6e6bb]" : "border-[#b9934c]/35 bg-black/40 text-[#a9b3c1] hover:text-[#efe8d6]"}`}>
              {f.title}
            </button>
          ))}
          <button type="button" data-testid="lab-fixture-next" aria-label="Next fixture" onClick={() => step(1)}
            className={CONTROL}>▶</button>
        </div>
        <div role="group" aria-label="State" className="flex items-center gap-1.5">
          <button type="button" data-testid="lab-reset" aria-label="Reset" onClick={reset} className={CONTROL}>
            <RotateCcw aria-hidden className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Reset</span>
          </button>
          <button type="button" data-testid="lab-replay" aria-label="Replay reveal" onClick={() => runReveal(response)}
            disabled={!revealed} className={CONTROL}>
            <Repeat aria-hidden className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Replay</span>
          </button>
          <button type="button" data-testid="lab-cues" aria-pressed={cues.enabled}
            aria-label={cues.enabled ? "Lab sound cues on" : "Lab sound cues off"} onClick={cues.toggle} className={CONTROL}>
            {cues.enabled ? <Volume2 aria-hidden className="h-4 w-4 sm:hidden" /> : <VolumeX aria-hidden className="h-4 w-4 sm:hidden" />}
            <span className="hidden sm:inline">{cues.enabled ? "Cues on" : "Cues off"}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid="interaction-lab" data-mechanic={mechanic} data-domain={domain} data-phase={phase}
      data-fixture={fixture.id}>
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
