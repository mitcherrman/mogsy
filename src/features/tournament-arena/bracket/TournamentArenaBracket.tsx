/**
 * The animated bracket.
 *
 * DESKTOP compositions, chosen by measuring the box (most spacious first):
 *   0  full cards, the whole plane at scale 1
 *   1  compact cards, the whole plane scaled down to fit (never below 0.78)
 *   2  compact cards at readable scale on a PANNABLE plane with a round-jump
 *      bar (32 entrants on a laptop). Drag, wheel, or jump to a round.
 * PHONE: one round at a time, swiped or tabbed; landscape phones two across.
 *
 * MOTION: the first paint of a locked bracket staggers rounds left to right
 * (cards rise, connectors draw after their source lands). Every later beat
 * comes from `useBracketBeats` on a revision change, so a resumed bracket
 * never replays. Reduced motion: final state, opacity only.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";

import { DESKTOP_QUERY, LANDSCAPE_QUERY, useMediaQuery } from "@/components/pro-play/worlds-experience/ExperienceContext";
import { ViewTabs } from "@/components/pro-play/worlds-experience/fit";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { cn } from "@/lib/utils";

import { ARENA_SFX, arenaEventId } from "../audio";
import { roundName, type ArenaEvent } from "../contracts";
import { slideTransition, slideVariants, TA } from "../motion";
import { CARD_COMPACT, CARD_FULL, fitScale, layoutBracket, nodesOfRound } from "./layout";
import { TournamentArenaConnectors } from "./TournamentArenaConnectors";
import { TournamentArenaNodeCard } from "./TournamentArenaNodeCard";
import type { BracketBeats } from "./useBracketBeats";

export interface BracketProps {
  event: ArenaEvent;
  viewerId: string | null;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  beats: BracketBeats;
  className?: string;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, box };
}

/** Runs the reveal once per bracket instance (locked → drawn). */
function useReveal(key: string | null, motionOn: boolean) {
  const [revealing, setRevealing] = useState(false);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!key || seen.current === key) return;
    seen.current = key;
    if (!motionOn) return;
    setRevealing(true);
    const t = window.setTimeout(() => setRevealing(false), 1800);
    return () => window.clearTimeout(t);
  }, [key, motionOn]);
  return revealing;
}

export function TournamentArenaBracket({ event, viewerId, selectedId, onSelect, beats, className }: BracketProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const landscape = useMediaQuery(LANDSCAPE_QUERY);
  const reduced = useReducedMotionPreference();
  const motionOn = useMotionAllowed();
  const sfx = useSfx();
  const bracket = event.bracket;
  const revealKey = bracket ? `${event.event_id}:${bracket.nodes.length}` : null;
  const revealing = useReveal(revealKey, motionOn);
  useEffect(() => {
    if (revealing) sfx.play(ARENA_SFX.reveal, { eventId: arenaEventId(event.event_id, "reveal", revealKey ?? "") });
  }, [revealing, sfx, event.event_id, revealKey]);
  if (!bracket) return null;
  const common = { event, viewerId, selectedId, onSelect, beats, revealing, reduced, motionOn };
  return desktop ? <DesktopPlane {...common} className={className} /> : <RoundPager {...common} landscape={landscape} className={className} />;
}

interface Inner extends BracketProps {
  revealing: boolean;
  reduced: boolean;
  motionOn: boolean;
}

function DesktopPlane({ event, viewerId, selectedId, onSelect, beats, revealing, reduced, motionOn, className }: Inner) {
  const bracket = event.bracket!;
  const { ref, box } = useBox<HTMLDivElement>();
  const full = useMemo(() => layoutBracket(bracket, CARD_FULL), [bracket]);
  const compact = useMemo(() => layoutBracket(bracket, CARD_COMPACT), [bracket]);
  const pad = 24;
  const w = Math.max(0, box.w - pad * 2);
  const h = Math.max(0, box.h - pad * 2);
  const fullScale = fitScale(full, w, h, 0);
  const compactScale = fitScale(compact, w, h, 0);
  const level: 0 | 1 | 2 = box.w === 0 ? 0 : fullScale >= 1 ? 0 : compactScale >= 0.78 ? 1 : 2;
  const plane = level === 0 ? full : compact;
  const scale = level === 0 ? 1 : level === 1 ? compactScale : Math.max(0.9, Math.min(1, h / compact.height * 2));
  const planeW = plane.width * scale;
  const planeH = plane.height * scale;
  const stepMs = motionOn ? TA.roundStagger * 1000 : 0;

  // Level 2: a pannable plane. Centre on the viewer's node, else the live one.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);
  const focusNode = useMemo(() => {
    const n = bracket.nodes.find((x) => x.status === "live" && x.slots.some((s) => s.profile_id === viewerId))
      ?? bracket.nodes.find((x) => x.status === "live")
      ?? bracket.nodes.find((x) => x.status === "ready")
      ?? bracket.nodes[0];
    return n?.node_id ?? null;
  }, [bracket, viewerId]);
  const centreOn = (nodeId: string | null, round?: number) => {
    let cx: number;
    let cy: number;
    if (round !== undefined) {
      const col = plane.boxes.filter((b) => b.round === round);
      cx = (col[0]?.x ?? 0) + (col[0]?.width ?? 0) / 2;
      cy = plane.height / 2;
    } else {
      const b = nodeId ? plane.byId.get(nodeId) : null;
      if (!b) return;
      cx = b.x + b.width / 2;
      cy = b.y + b.height / 2;
    }
    const x = Math.min(0, Math.max(w - planeW, w / 2 - cx * scale));
    const y = Math.min(0, Math.max(h - planeH, h / 2 - cy * scale));
    setPan({ x, y });
  };
  const didCentre = useRef<string | null>(null);
  useEffect(() => {
    if (level !== 2 || !w) return;
    const key = `${event.event_id}:${focusNode}`;
    if (didCentre.current === key) return;
    didCentre.current = key;
    centreOn(focusNode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centre once per focus target
  }, [level, w, h, focusNode, event.event_id]);
  const [round, setRound] = useState(1);

  const constraints = { left: Math.min(0, w - planeW), right: 0, top: Math.min(0, h - planeH), bottom: 0 };
  const offsetX = level === 2 ? pan.x : Math.round((w - planeW) / 2);
  const offsetY = level === 2 ? pan.y : Math.round((h - planeH) / 2);

  const cards = (
    <>
      <TournamentArenaConnectors plane={plane} nodes={bracket.nodes} entrants={event.entrants} glides={beats.glides} drawing={revealing} revealStepMs={stepMs} />
      {plane.boxes.map((b) => {
        const n = bracket.nodes.find((x) => x.node_id === b.node_id)!;
        return (
          <TournamentArenaNodeCard
            key={n.node_id}
            node={n}
            nodes={bracket.nodes}
            entrants={event.entrants}
            totalRounds={bracket.rounds}
            viewerId={viewerId}
            selected={selectedId === n.node_id}
            compact={level > 0}
            onSelect={(id) => onSelect(selectedId === id ? null : id)}
            arrivedSlot={beats.arrived[n.node_id] ?? null}
            prevWins={beats.prevWins[n.node_id] ?? null}
            revealDelayMs={revealing ? (n.round - 1) * stepMs + b.position * 30 : undefined}
            style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
          />
        );
      })}
    </>
  );

  return (
    <div ref={ref} className={cn("relative min-h-0 min-w-0 flex-1 overflow-clip", className)} data-testid="ta-bracket" data-level={level} data-scale={scale.toFixed(2)}>
      {/* round headers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-6" style={{ transform: `translateX(${offsetX}px)` }} aria-hidden="true">
        {Array.from({ length: bracket.rounds }, (_, i) => (
          <span
            key={i}
            className={cn("absolute top-0 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[rgba(243,233,207,0.55)]", revealing && "ta-rise")}
            style={{ left: (plane.boxes.find((b) => b.round === i + 1)?.x ?? 0) * scale, width: (plane.boxes[0]?.width ?? 0) * scale, "--ta-delay": `${i * stepMs}ms` } as CSSProperties}
          >
            {roundName(i + 1, bracket.rounds)}
          </span>
        ))}
      </div>
      {level === 2 ? (
        <fm.div
          ref={dragRef}
          drag
          dragConstraints={constraints}
          dragElastic={0.08}
          dragMomentum={false}
          animate={{ x: pan.x, y: pan.y }}
          transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 260, damping: 32 }}
          onDragEnd={(_, info) => setPan((p) => ({ x: Math.min(0, Math.max(constraints.left, p.x + info.offset.x)), y: Math.min(0, Math.max(constraints.top, p.y + info.offset.y)) }))}
          className="ta-plane absolute left-6 top-8 cursor-grab active:cursor-grabbing"
          style={{ width: plane.width, height: plane.height, scale }}
          data-testid="ta-plane"
        >
          {cards}
        </fm.div>
      ) : (
        <div className="ta-plane absolute" style={{ left: pad + offsetX, top: pad + 8 + Math.max(0, offsetY - 8), width: plane.width, height: plane.height, transform: `scale(${scale})` }} data-testid="ta-plane">
          {cards}
        </div>
      )}
      {level === 2 && (
        <div className="absolute bottom-3 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[hsl(214_50%_7%/0.92)] p-1 shadow-lg backdrop-blur" data-testid="ta-round-jump">
          <button type="button" aria-label="Previous round" className="ta-btn ta-btn--sm !min-h-8 !px-2" onClick={() => { const r = Math.max(1, round - 1); setRound(r); centreOn(null, r); }}><ChevronLeft className="h-4 w-4" /></button>
          {Array.from({ length: bracket.rounds }, (_, i) => (
            <button key={i} type="button" aria-pressed={round === i + 1} className={cn("ta-chip !min-h-8", round === i + 1 && "")} onClick={() => { setRound(i + 1); centreOn(null, i + 1); }}>
              {roundName(i + 1, bracket.rounds)}
            </button>
          ))}
          <button type="button" aria-label="Next round" className="ta-btn ta-btn--sm !min-h-8 !px-2" onClick={() => { const r = Math.min(bracket.rounds, round + 1); setRound(r); centreOn(null, r); }}><ChevronRight className="h-4 w-4" /></button>
          <button type="button" aria-label="Centre on the live match" className="ta-btn ta-btn--sm !min-h-8 !px-2" onClick={() => centreOn(focusNode)}><Crosshair className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function RoundPager({ event, viewerId, selectedId, onSelect, beats, revealing, reduced, motionOn, landscape, className }: Inner & { landscape: boolean }) {
  const bracket = event.bracket!;
  const initial = useMemo(() => {
    const live = bracket.nodes.find((n) => n.status === "live") ?? bracket.nodes.find((n) => n.status === "ready");
    return live?.round ?? 1;
  }, [bracket]);
  const [round, setRound] = useState(initial);
  const [dir, setDir] = useState(0);
  const go = (r: number) => {
    const next = Math.max(1, Math.min(bracket.rounds, r));
    setDir(next > round ? 1 : next < round ? -1 : 0);
    setRound(next);
  };
  const nodes = nodesOfRound(bracket.nodes, round);
  const views = Array.from({ length: bracket.rounds }, (_, i) => ({ key: String(i + 1), label: shortRound(i + 1, bracket.rounds), name: roundName(i + 1, bracket.rounds), count: nodesOfRound(bracket.nodes, i + 1).filter((n) => n.status === "live").length || undefined }));
  const stepMs = motionOn ? 60 : 0;
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)} data-testid="ta-bracket" data-level="phone">
      <ViewTabs views={views} value={String(round)} onChange={(k) => go(Number(k))} label="Rounds" testId="ta-round-tabs" />
      <div className="relative min-h-0 flex-1 overflow-clip">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <fm.div
            key={round}
            custom={dir}
            variants={slideVariants(48, reduced)}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition(reduced)}
            drag={reduced ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.x < -70) go(round + 1); else if (info.offset.x > 70) go(round - 1); }}
            className={cn("ta-scroll absolute inset-0 overflow-y-auto pb-2", landscape ? "grid grid-cols-2 content-start gap-2" : "ta-round-list")}
          >
            {nodes.map((n, i) => (
              <TournamentArenaNodeCard
                key={n.node_id}
                node={n}
                nodes={bracket.nodes}
                entrants={event.entrants}
                totalRounds={bracket.rounds}
                viewerId={viewerId}
                selected={selectedId === n.node_id}
                onSelect={(id) => onSelect(selectedId === id ? null : id)}
                arrivedSlot={beats.arrived[n.node_id] ?? null}
                prevWins={beats.prevWins[n.node_id] ?? null}
                revealDelayMs={revealing ? i * stepMs : undefined}
                className="!relative !h-auto w-full"
              />
            ))}
          </fm.div>
        </AnimatePresence>
      </div>
      <p className="shrink-0 text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[rgba(215,205,180,0.5)]">
        {roundName(round, bracket.rounds)} · swipe for more
      </p>
    </div>
  );
}

function shortRound(round: number, total: number) {
  const fromEnd = total - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semis";
  if (fromEnd === 2) return "Quarters";
  return `R${2 ** (fromEnd + 1)}`;
}
