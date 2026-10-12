/**
 * WP1 — the Word Puzzle (Glyph Press) playtest harness. DEVELOPMENT ONLY:
 * registered in App.tsx behind `import.meta.env.DEV`, so a production build
 * drops it and the path 404s.
 *
 * It is the HOST for the prototype. It builds a round from the frozen
 * fixture, keeps the canonical glyphs in a ref the primitive never receives,
 * answers soundings by extending the public ledger after a stand-in latency,
 * and after Lock stands in for the server by grading in that closure and
 * passing only the resulting `GlyphPressReveal` down.
 *
 * It mounts the primitive inside the REAL `CanonicalArena` — the production
 * shell, header plate, 23/54/23 grid and `ranked-question-stage` folio — by
 * handing the arena a lab-local `ModuleRenderer` whose Viewport draws the
 * primitive (the Rangefinder R1 pattern). No registry, transport or contract
 * seam is touched.
 *
 *   /dev/word-puzzle?round=zephyr
 *     &state=open|filled|locked|revealed-right|revealed-wrong|revealed-partial
 *     &seed=<any>            (which glyphs are given + the round order)
 *     &motion=reduce         (force the reduced-motion path)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { GlyphPress, type GlyphPressCue } from "@/components/interaction-grammar/GlyphPress";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { reconcileValue } from "@/lib/interaction-grammar/glyphPress";
import type {
  GlyphPressLedger, GlyphPressResponse, GlyphPressReveal, GlyphPressValue, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import {
  buildLabRound, findRound, gradeLabRound, roundOrder, soundLabRound, type LabRound, type LabSecret,
} from "./labAuthority";

const SERVER_LATENCY_MS = 420;
const SOUNDING_LATENCY_MS = 260;
type Prearranged = "open" | "filled" | "locked" | "revealed-right" | "revealed-wrong" | "revealed-partial";

/** What the lab's viewport draws. The arena never sees it; the renderer's Viewport reads it. */
interface LabStage {
  round: LabRound;
  generation: number;
  phase: InteractionPhase;
  value: GlyphPressValue;
  ledger: GlyphPressLedger;
  reveal: GlyphPressReveal | null;
  onChange: (next: GlyphPressValue) => void;
  onSound: (glyph: string) => void;
  onLock: (response: GlyphPressResponse) => void;
  onRevealComplete: () => void;
  onCue: (cue: GlyphPressCue) => void;
}
const LabStageContext = createContext<LabStage | null>(null);

function LabViewport() {
  const s = useContext(LabStageContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host measures the stage and hands the primitive a definite height, as a Ranked module does.
  const maxHeight = useStageRoom(ref);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="word-puzzle-lab-viewport" className="flex min-h-0 flex-col">
      <GlyphPress key={`${s.round.id}:${s.generation}`}
        content={s.round.content} ledger={s.ledger} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onSound={s.onSound} onLock={s.onLock} reveal={s.reveal}
        onRevealComplete={s.onRevealComplete} onCue={s.onCue} />
    </div>
  );
}

/** A lab-local renderer: the arena mounts its Viewport in the question stage like any module's. */
const LAB_RENDERER: ModuleRenderer = {
  moduleId: "glyph-press-lab", moduleVersion: 1, servesVersion: () => true,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport: LabViewport,
  projectQuestion: () => null,
  summaryLabel: () => null,
};

const combatant = (over: Partial<CombatantView>): CombatantView => ({
  playerId: "you", name: "You", tag: "Mid", side: "player", classId: "mage",
  roleId: "mid", identityMode: "role", score: 0,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});
const rail = (which: "player" | "opponent"): ArenaRail => ({
  kind: "combatant",
  combatant: which === "player" ? combatant({}) : combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top", tag: "Top" }),
  presentation: "banner", damage: [], outcome: null, damageDealt: null, feedback: null, reaction: null, award: null,
});

/** The production arena's input, with the lab's renderer in the surface. The round payload is an ordinary fixture; the Viewport ignores it. */
function labArenaView(phase: InteractionPhase): ArenaViewModel {
  const round = readPublicRound(publicRoundV2());
  return {
    header: {
      eyebrow: "Glyph Press", title: "Playtest", transitionNote: null, playtestNote: null, presenceNote: null,
      timer: { durationSeconds: 60, remainingSeconds: 45, paused: true, urgent: false }, timerLabel: "Timer",
      centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: rail("player"), right: rail("opponent"),
    surface: {
      renderer: LAB_RENDERER,
      publicRound: round, segmentState: round.segmentState ?? null, selection: null,
      permissions: NO_INTERACTIONS,
      actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs: 0, reveal: null, onSelect: () => {}, ownsSubmission: true,
      inputOpen: phase === "open", hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null,
    timeline: {
      visibleNodes: 1, anchorIndex: 0, windowStart: 0, currentIndex: 0, currentRoundNumber: 1, anchored: true,
      nodes: [{ roundNumber: 1, index: 0, visible: true, state: "current", segmentKind: null, outcome: null, tag: null, topic: null }],
    },
    revealHold: false, progressionEnabled: false,
  } as ArenaViewModel;
}

export default function WordPuzzleLab() {
  const [params, setParams] = useSearchParams();
  const seed = params.get("seed") ?? "academy";
  const order = useMemo(() => roundOrder(seed), [seed]);
  const requested = params.get("round");
  const record = (requested ? findRound(requested) : null) ?? order[0];
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  // ---- the round. The secret lives in a ref; the primitive gets only `content` and the ledger.
  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => buildLabRound(record, `${seed}:${generation}`), [record, seed, generation]);
  const secretRef = useRef<LabSecret | null>(null);
  secretRef.current = round.secret;

  const [ledger, setLedger] = useState<GlyphPressLedger>(round.ledger);
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;
  const [value, setValue] = useState<GlyphPressValue>(() => round.secret.glyphs.map(() => null));
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<GlyphPressReveal | null>(null);
  const [lastResponse, setLastResponse] = useState<GlyphPressResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const [lastCue, setLastCue] = useState<string>("");

  // Reset on a new round, and apply a pre-arranged state when asked.
  useEffect(() => {
    const { secret } = round;
    setReveal(null);
    setLastResponse(null);
    setRevealDone(false);
    setLastCue("");
    setLedger(round.ledger);
    const blank = secret.glyphs.map(() => null);
    if (prearranged === "open") { setValue(blank); setPhase("open"); return; }
    // A deterministic fill: the truth, the truth with two sockets wrong, or the truth with the last socket blank.
    const openIdx = secret.givenAtStart.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0);
    const filled: (string | null)[] = secret.glyphs.map((g, i) => (secret.givenAtStart[i] === null ? g : null));
    if (prearranged === "revealed-wrong") {
      for (const i of openIdx.slice(0, 2)) filled[i] = secret.glyphs[i] === "X" ? "Q" : "X";
    } else if (prearranged === "revealed-partial") {
      const i = openIdx[openIdx.length - 1];
      if (i !== undefined) filled[i] = null;
    }
    setValue(filled);
    if (prearranged === "filled") { setPhase("open"); return; }
    const response: GlyphPressResponse = { glyphs: filled.map((g, i) => secret.givenAtStart[i] ?? g) };
    setLastResponse(response);
    setPhase("locked");
    if (prearranged === "locked") return;
    const t = window.setTimeout(() => { setReveal(gradeLabRound(secret, round.ledger, response)); setPhase("revealed"); }, 300);
    return () => window.clearTimeout(t);
  }, [round, prearranged]);

  const onSound = useCallback((glyph: string) => {
    const secret = secretRef.current;
    if (!secret) return;
    // Stand-in for the server round trip: the ledger grows after a beat; the player's value is reconciled with it.
    window.setTimeout(() => {
      const next = soundLabRound(secret, ledgerRef.current, glyph);
      setLedger(next);
      setValue((v) => reconcileValue(v, next));
    }, SOUNDING_LATENCY_MS);
  }, []);

  const onLock = useCallback((response: GlyphPressResponse) => {
    setLastResponse(response);
    setPhase("locked");
    const secret = secretRef.current;
    const ledgerAtLock = ledgerRef.current;
    window.setTimeout(() => {
      if (!secret) return;
      setReveal(gradeLabRound(secret, ledgerAtLock, response));
      setPhase("revealed");
    }, SERVER_LATENCY_MS);
  }, []);
  const onRevealComplete = useCallback(() => setRevealDone(true), []);
  const onCue = useCallback((cue: GlyphPressCue) => setLastCue(cue), []);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const nextRound = () => {
    const i = order.findIndex((r) => r.id === record.id);
    go({ round: order[(i + 1) % order.length].id, state: null });
  };

  const stage: LabStage = useMemo(() => ({
    round, generation, phase, value, ledger, reveal, onChange: setValue, onSound, onLock, onRevealComplete, onCue,
  }), [round, generation, phase, value, ledger, reveal, onSound, onLock, onRevealComplete, onCue]);
  const view = useMemo(() => labArenaView(phase), [phase]);

  const chrome = (
    // `arenaHeaderRowClass` insets the row clear of the GlobalHud's fixed chips (the hat and the identity cluster),
    // which otherwise sit over the row's ends and swallow clicks.
    <div data-testid="word-puzzle-lab-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <span className="ranked-eyebrow shrink-0">Glyph Press · WP1 lab</span>
      <span className="shrink-0 font-mono opacity-70" data-testid="lab-round">{record.id}</span>
      {!record.verified ? <span className="shrink-0 rounded border border-[#d9825a]/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#d9825a]" data-testid="lab-unverified">dev-only · unverified</span> : null}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {(["open", "filled", "locked", "revealed-right", "revealed-wrong", "revealed-partial"] as Prearranged[]).map((s) => (
          <button key={s} type="button" onClick={() => go({ state: s === "open" ? null : s })} data-active={prearranged === s ? "" : undefined}
            className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]">
            {s}
          </button>
        ))}
        <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined}
          className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110]">Reduced motion</button>
        <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
        <button type="button" onClick={nextRound} data-testid="lab-next" className="whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14]">Next</button>
        {/* Reserved: these indicators toggle by opacity so the chrome row never reflows. */}
        <span data-testid="lab-response" data-on={lastResponse ? "true" : "false"} className="inline-block w-[9rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono opacity-70 data-[on=false]:opacity-0">
          {lastResponse ? lastResponse.glyphs.map((g) => g ?? "·").join("") : "—"}
        </span>
        <span data-testid="lab-cue" data-cue={lastCue} className="inline-block w-[5.5rem] overflow-hidden whitespace-nowrap font-mono opacity-70">{lastCue || " "}</span>
        <span data-testid="lab-reveal-done" data-on={revealDone ? "true" : "false"} className="inline-block w-[5.5rem] whitespace-nowrap opacity-70 data-[on=false]:opacity-0">reveal done</span>
      </span>
    </div>
  );

  return (
    <div data-testid="word-puzzle-lab">
      <LabStageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </LabStageContext.Provider>
    </div>
  );
}
