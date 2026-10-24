/**
 * Academy Pulse — the broadcasting device (PULSE-1 prototype).
 *
 * A permanent Hextech frame with interchangeable scenes. The frame never
 * changes size: scenes live in an absolutely positioned viewport and the shell
 * gets its height from the Home Hub's layout, so a transition can never move
 * the page. Between scenes the outgoing one dims and softens, the emitter
 * crystal flares in the next scene's colour and a light sweep crosses the
 * glass, then the new scene's pieces arrive in their own choreography.
 *
 *   CONTENT  usePulseContent(provider)   — fixtures in Phase 1
 *   ORDER    usePulseRotation(cadence)   — scheduler + dwell clock + holds
 *   SCENES   SceneRenderer               — one component per kind
 *
 * Rotation holds while the pointer rests on Pulse, while keyboard focus is in
 * it, for ten seconds after any interaction with a scene, while the expanded
 * view is open, while Pulse is off screen or the tab hidden, and when the
 * viewer presses Pause. Under reduced motion it starts paused and every
 * transition is a plain cross-fade.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";

import { getChampionIcon, getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { cn } from "@/lib/utils";

import { fixturePulseProvider } from "./content/pulse-provider";
import { DEFAULT_PULSE_CADENCE } from "./model/pulse-cadence";
import { CATEGORY_LABEL, type PulseCadence, type PulseCatalogue, type PulseContentProvider } from "./model/pulse-types";
import PulseExpanded from "./PulseExpanded";
import SceneRenderer, { SCENE_ACCENT } from "./scenes/SceneRenderer";
import TickerScene from "./scenes/TickerScene";
import { EASE_OUT, PulseArtContext, type PulseArt } from "./scenes/scene-kit";
import { usePulseRotation } from "./usePulseRotation";
import "./academy-pulse.css";

function usePulseContent(provider: PulseContentProvider): PulseCatalogue | null {
  const [catalogue, setCatalogue] = useState<PulseCatalogue | null>(() => provider.peek?.() ?? null);
  useEffect(() => {
    const ctl = new AbortController();
    provider.load(ctl.signal).then((c) => { if (!ctl.signal.aborted) setCatalogue(c); }).catch(() => {
      if (!ctl.signal.aborted) setCatalogue({});
    });
    return () => ctl.abort();
  }, [provider]);
  return catalogue;
}

const EMPTY: PulseCatalogue = {};
/** Below this much glass a full scene is cramped; the ticker takes over. */
export const TICKER_BELOW_PX = 132;

export interface AcademyPulseProps {
  variant?: "desktop" | "mobile";
  provider?: PulseContentProvider;
  cadence?: PulseCadence;
  className?: string;
  /** Open on this item (by id) instead of the cycle's first scene. */
  startAt?: string;
  /** Start with the viewer's Pause on (reduced motion always does). */
  startPaused?: boolean;
}

export default function AcademyPulse({
  variant = "desktop",
  provider = fixturePulseProvider,
  cadence = DEFAULT_PULSE_CADENCE,
  className,
  startAt,
  startPaused = false,
}: AcademyPulseProps) {
  const reduced = useReducedMotionPreference();
  const rootRef = useRef<HTMLElement>(null);
  const catalogue = usePulseContent(provider);
  const rot = usePulseRotation(catalogue ?? EMPTY, cadence, { startPaused: reduced || startPaused, rootRef, startAt });
  const item = rot.current;

  const { data: manifest } = useChampionAssets();
  const art = useMemo<PulseArt>(() => ({
    championIcon: (name) => (name ? getChampionIcon(manifest, name) : null),
    championSplash: (name) => (name ? getChampionSplash(manifest, name) : null),
  }), [manifest]);

  /* ---------------- holds ---------------- */
  const { hold } = rot;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { hold("expanded", expanded); }, [expanded, hold]);
  const onFocus = useCallback(() => hold("focus", true), [hold]);
  const onBlur = useCallback((e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold("focus", false);
  }, [hold]);
  const onRailKey = (e: KeyboardEvent<HTMLElement>) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (dir > 0) rot.next(); else rot.prev();
    // on the pips (a roving set), focus follows the current scene
    if ((e.target as HTMLElement).classList.contains("apulse-pip")) {
      const rail = e.currentTarget;
      requestAnimationFrame(() => rail.querySelector<HTMLElement>('.apulse-pip[data-current="true"]')?.focus());
    }
  };

  // short glass (the shortest laptop screens): every scene becomes a one-line ticker
  const viewportRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.height < TICKER_BELOW_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the first scene arrives without the change flare
  const firstEpoch = useRef(rot.epoch);
  const showFlare = !reduced && rot.epoch !== firstEpoch.current;

  const accent = item ? SCENE_ACCENT[item.kind] : "#7fb4ff";
  const fixture = item?.provenance === "fixture";
  const count = rot.items.length;

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <PulseArtContext.Provider value={art}>
        <section
          ref={rootRef}
          className={cn("apulse", className)}
          data-variant={variant}
          data-kind={item?.kind ?? "none"}
          data-playing={rot.playing ? "true" : "false"}
          data-reduced={reduced ? "true" : "false"}
          data-provenance={item?.provenance}
          style={{ ["--apulse-accent" as string]: accent }}
          aria-roledescription="carousel"
          aria-label="Academy Pulse"
          data-testid="academy-pulse"
          onPointerEnter={(e) => { if (e.pointerType === "mouse") hold("hover", true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") hold("hover", false); }}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {/* ---------- the device ---------- */}
          <div className="apulse-frame" aria-hidden>
            <span className="apulse-frame-glow" />
            {(["tl", "tr", "bl", "br"] as const).map((c) => (
              <svg key={c} className={`apulse-corner apulse-corner-${c}`} viewBox="0 0 32 32" focusable="false">
                <path d="M2 30V12C2 6.5 6.5 2 12 2h18" />
                <path d="M7 30V14c0-3.9 3.1-7 7-7h16" className="apulse-corner-inner" />
                <circle cx="7" cy="7" r="1.6" />
              </svg>
            ))}
          </div>

          <header className="apulse-head">
            <span className="apulse-brand">
              {/* the emitter crystal: it flares in the next scene's colour at every change */}
              <span className="apulse-emitter" key={showFlare ? rot.epoch : "rest"} data-flare={showFlare ? "true" : "false"} aria-hidden>
                <svg viewBox="0 0 20 24" focusable="false"><path d="M10 1 19 7v10l-9 6-9-6V7z" /></svg>
              </span>
              Academy Pulse
            </span>
            <span className="apulse-cat-wrap" aria-hidden>
              <AnimatePresence mode="popLayout" initial={false}>
                {item && (
                  <motion.span
                    key={item.category}
                    className="apulse-cat"
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.25, duration: 0.45, ease: EASE_OUT } }}
                    exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.2 } }}
                  >
                    {CATEGORY_LABEL[item.category]}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {fixture && <span className="apulse-sample" title="Development sample content: not real activity">Sample</span>}
          </header>

          {/* ---------- the glass ---------- */}
          <div
            ref={viewportRef}
            className="apulse-viewport"
            data-compact={compact ? "true" : "false"}
            role="group"
            aria-roledescription="slide"
            aria-label={item ? `${rot.index + 1} of ${count}: ${CATEGORY_LABEL[item.category]}. ${item.title}` : "Academy Pulse"}
            aria-live={rot.playing ? "off" : "polite"}
            data-testid="academy-pulse-viewport"
          >
            <span className="apulse-glass" aria-hidden />
            {item && (
              <span
                key={rot.epoch}
                className="apulse-progress"
                aria-hidden
                style={{ animationDuration: `${rot.dwellMs}ms`, animationPlayState: rot.playing ? "running" : "paused" }}
              />
            )}
            <AnimatePresence mode="wait" initial={!reduced}>
              {item && (
                <motion.div
                  key={`${item.id}:${rot.epoch}`}
                  className="apulse-viewport-inner"
                  initial="enter"
                  animate="show"
                  exit="exit"
                  data-testid="academy-pulse-scene"
                  data-scene={item.kind}
                  data-category={item.category}
                >
                  {compact ? (
                    <TickerScene item={item} reduced={reduced} onInteract={rot.interact} onExpand={() => setExpanded(true)} />
                  ) : (
                    <SceneRenderer item={item} reduced={reduced} onInteract={rot.interact} onExpand={() => setExpanded(true)} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {showFlare && <span key={`flare-${rot.epoch}`} className="apulse-flare" data-dir={rot.direction} aria-hidden />}
            {!item && catalogue && (
              <p className="apulse-empty">The Pulse is quiet right now.</p>
            )}
          </div>

          {/* ---------- the controls ---------- */}
          <nav className="apulse-rail" aria-label="Academy Pulse controls" onKeyDown={onRailKey}>
            <button type="button" className="apulse-icon-btn" onClick={rot.prev} disabled={count < 2} aria-label="Previous scene" data-testid="academy-pulse-prev">
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
            </button>
            <button
              type="button"
              className="apulse-icon-btn apulse-icon-btn-main"
              onClick={rot.toggle}
              disabled={count < 2}
              aria-label={rot.userPaused ? "Play Academy Pulse" : "Pause Academy Pulse"}
              aria-pressed={rot.userPaused}
              data-testid="academy-pulse-toggle"
            >
              {rot.userPaused ? (
                <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M8 5.5v13l11-6.5z" className="apulse-fill" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M8.5 5.5v13M15.5 5.5v13" /></svg>
              )}
            </button>
            <button type="button" className="apulse-icon-btn" onClick={rot.next} disabled={count < 2} aria-label="Next scene" data-testid="academy-pulse-next">
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
            </button>
            <ol className="apulse-pips">
              {rot.items.map((it, i) => (
                <li key={`${it.id}-${i}`}>
                  <button
                    type="button"
                    className="apulse-pip"
                    data-current={i === rot.index ? "true" : "false"}
                    style={{ ["--pip" as string]: SCENE_ACCENT[it.kind] }}
                    aria-label={`Scene ${i + 1}: ${CATEGORY_LABEL[it.category]}`}
                    aria-current={i === rot.index ? "true" : undefined}
                    onClick={() => rot.goTo(i)}
                    tabIndex={i === rot.index ? 0 : -1}
                  />
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="apulse-icon-btn"
              onClick={() => setExpanded(true)}
              disabled={!item}
              aria-label="Expand this scene"
              aria-haspopup="dialog"
              data-testid="academy-pulse-expand"
            >
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" /></svg>
            </button>
          </nav>
          <p className="sr-only" aria-live="polite">{rot.userPaused ? "Academy Pulse paused" : ""}</p>
        </section>

        <PulseExpanded item={item} open={expanded} onOpenChange={setExpanded} reduced={reduced} onInteract={rot.interact} />
      </PulseArtContext.Provider>
    </MotionConfig>
  );
}
