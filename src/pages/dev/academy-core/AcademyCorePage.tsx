/**
 * Academy Core V2 — `/lol/dev/academy-core` (alias `/dev/academy-core`).
 *
 * Mogzy's Hextech workshop as a working page inside the real shell: one
 * refined precision instrument (AcademyCoreInstrument) with Mogzy at its
 * controls (MogzyOperator), the real Patch Report book
 * (AcademyBroadcastCenterpiece, live feed and radio controls) standing beside
 * it on the same bench, and the two play actions in immediate reach.
 *
 * NAVIGATION CONTRACTS (see academy-core-destinations.ts):
 *   · Daily   → <Link to="/quiz/daily-challenge" state={DAILY_START_STATE}>
 *   · Ranked  → <Link to="/quiz?play=1"> — the lobby opens its Play record
 *   · Rooms   → <Link> to /quiz, /combat-lab, /lol/docs, /lol/pro-play
 * Every entrance navigates on the first click / tap / Enter. Hover and focus
 * only animate the instrument and Mogzy; nothing is gated behind them.
 *
 * DATA. Read-only, and all existing authorities: the Patch Brief feed the
 * Hall's book uses (`usePatchBriefFeed`, shared query keys and cache — the
 * Archives projection reuses its icons, so no second patch read), the Daily
 * status (`useDailyChallengeStatus`, one request, the same the lobby makes;
 * copy renders only once the service has answered), and the champion manifest
 * through the app's one query definition (the warm fetches it; the feed hook
 * then finds it cached). Nothing invents completion, streaks, ranks or XP.
 *
 * LOADING (PERF1 convention, page-scoped): `warmAcademyCore` prepares Mogzy's
 * plate and, on desktop, the book at high priority; reaction poses, projection
 * icons and the four route chunks follow. The Hall's own warm is deliberately
 * NOT called — it would fetch the old library / book-frame art this page does
 * not draw. Every late asset has reserved geometry.
 *
 * ANALYTICS. No `hub_entered` from a preview route. The diagnostic
 * `leaguecraft_cta_clicked` is reused for the two doors into /quiz with
 * distinct `cta` values; the canonical open event fires on /quiz itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import AcademyBroadcastCenterpiece from "@/components/lol/broadcast/AcademyBroadcastCenterpiece";
import { usePatchBriefFeed } from "@/components/lol/broadcast/usePatchBriefFeed";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { useDailyChallengeStatus } from "@/lib/daily-challenge/useDailyChallengeStatus";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { prefetchRoute } from "@/lib/route-prefetch";
import { useSfx } from "@/lib/audio/useSfx";

import AcademyCoreInstrument, { BAY_PLATE, CORE_VIEWBOX, bayAnchor, type CoreMedia } from "./AcademyCoreInstrument";
import MogzyOperator from "./MogzyOperator";
import {
  CORE_FULL_LAYOUT_MEDIA,
  CORE_MEASURE_SHARDS,
  CORE_OBSERVE_ROLES,
  warmAcademyCore,
} from "./academy-core-warm";
import {
  ACADEMY_COMMONS_HREF,
  ACADEMY_HALL_ROUTE,
  CORE_DESTINATIONS,
  DAILY_ROUTE,
  RANKED_ROUTE,
  coreBayDescriptionId,
  destinationById,
  type CoreDestination,
  type CoreFocus,
} from "./academy-core-destinations";
import "./academy-core.css";

/** Same grace the Mogzy guide uses before a leave clears a hover message. */
const FOCUS_RELEASE_MS = 140;
/** Mogzy's idle line. Touch-neutral: phones have no hover. */
const IDLE_LINE = "Pick a room and I'll take a reading.";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia?.(query)?.matches === true : false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [query]);
  return matches;
}

/** Percent box for a bay's HTML overlay, from the instrument's own geometry. */
function bayOverlayStyle(d: CoreDestination): React.CSSProperties {
  const a = bayAnchor(d.angle);
  return {
    left: `${(a.x / CORE_VIEWBOX.width) * 100}%`,
    top: `${((a.y - BAY_PLATE.height / 2) / CORE_VIEWBOX.height) * 100}%`,
    width: `${(BAY_PLATE.width / CORE_VIEWBOX.width) * 100}%`,
    height: `${(BAY_PLATE.height / CORE_VIEWBOX.height) * 100}%`,
  };
}

export default function AcademyCorePage() {
  const fullLayout = useMediaQuery(CORE_FULL_LAYOUT_MEDIA);
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();
  const queryClient = useQueryClient();

  // Same session flag the Hall sets on arrival. The Quiz lobby's onboarding
  // gate (`redirect_to_hub`) bounces a first-time session that has not seen
  // the hub back to /lol; this page IS the hub candidate. sessionStorage only.
  useEffect(() => {
    markHubVisited();
  }, []);

  /* ---------------- warm: the Core's critical art, then the rest ---------------- */
  const [projections, setProjections] = useState<{ inquiryIcon: string | null; observeIcon: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    warmAcademyCore(queryClient).then((icons) => { if (active) setProjections(icons); });
    return () => { active = false; };
  }, [queryClient]);

  /* ---------------- focus state ---------------- */
  const [focus, setFocus] = useState<CoreFocus>("idle");
  const releaseTimer = useRef<number | null>(null);
  const cancelRelease = () => {
    if (releaseTimer.current !== null) {
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
  };
  const engage = useCallback((id: CoreFocus) => {
    cancelRelease();
    setFocus(id);
  }, []);
  const release = useCallback(() => {
    cancelRelease();
    releaseTimer.current = window.setTimeout(() => {
      releaseTimer.current = null;
      setFocus("idle");
    }, FOCUS_RELEASE_MS);
  }, []);
  useEffect(() => () => cancelRelease(), []);

  // The focus cue sounds only for authored interactions: a fine pointer, or a
  // Tab-driven focus — never for focus restored by code (same rule as the Hall).
  const lastTabAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") lastTabAt.current = Date.now();
    };
    const onPointerDown = () => { lastTabAt.current = Number.NEGATIVE_INFINITY; };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  const cue = useCallback((input: "pointer" | "keyboard") => {
    if (input === "pointer") {
      if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches !== true) return;
    } else if (Date.now() - lastTabAt.current > 1000) {
      return;
    }
    sfx.play("hub.destination.focus");
  }, [sfx]);

  /* ---------------- ambient: only while the stage is on screen ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const ambient = onScreen && !reduced;

  /* ---------------- the floor: one line the bench, the book and Mogzy share ----------------
     The chassis feet sit at a fixed fraction of the stage (582/640 of its
     height). The bench edge and the console's resting line are driven from
     that measurement through one CSS variable, so the book's base, Mogzy's
     feet and the instrument's feet land on the same physical surface at every
     viewport. ResizeObserver only: nothing runs per frame. */
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    const hero = heroRef.current;
    if (!stage || !hero || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const s = stage.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      const feetY = s.top + s.height * (582 / 640);
      hero.style.setProperty("--acore-floor", `${Math.max(0, Math.round(h.bottom - feetY))}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(hero);
    return () => ro.disconnect();
  }, [fullLayout]);

  /* ---------------- real data, read-only ---------------- */
  const daily = useDailyChallengeStatus();
  const dailyResume = daily.known && daily.resumable && !daily.completed;
  const dailyStatusLine = !daily.known
    ? null
    : daily.completed
      ? "Today's Daily is complete."
      : daily.resumable
        ? "A run is in progress — pick up where you left off."
        : null;

  // One Patch Brief feed serves the book AND the Archives projection.
  const broadcastFeed = usePatchBriefFeed();
  const brief = broadcastFeed.status === "ready"
    ? broadcastFeed.transmissions[broadcastFeed.index]?.brief ?? null
    : null;

  const media = useMemo<CoreMedia>(() => ({
    inquiryIcon: projections?.inquiryIcon ?? null,
    observeIcon: projections?.observeIcon ?? null,
    // The book has already requested these exact URLs; the strata reuse them.
    strataIcons: brief ? brief.sections.flatMap((s) => s.entries).slice(0, 4).map((e) => e.iconUrl) : [],
    strataLabel: brief ? brief.patchLabel : null,
    measureShards: projections ? CORE_MEASURE_SHARDS : undefined,
    observeRoles: projections ? CORE_OBSERVE_ROLES : [],
  }), [projections, brief]);

  const focused = destinationById(focus);
  const mogzyLine = focused ? focused.preview : IDLE_LINE;

  /* ---------------- bay handlers ---------------- */
  const bayHandlers = useMemo(() => {
    const map = new Map<CoreDestination["id"], {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onPointerDown: () => void;
      onFocus: () => void;
      onBlur: () => void;
      onClick: () => void;
    }>();
    for (const d of CORE_DESTINATIONS) {
      map.set(d.id, {
        onPointerEnter: (e) => {
          prefetchRoute(d.to, { intent: true });
          if (e.pointerType === "touch") return;
          engage(d.id);
          cue("pointer");
        },
        onPointerLeave: () => release(),
        onPointerDown: () => {
          prefetchRoute(d.to, { intent: true });
          engage(d.id);
        },
        onFocus: () => {
          prefetchRoute(d.to, { intent: true });
          engage(d.id);
          cue("keyboard");
        },
        onBlur: () => release(),
        onClick: () => {
          if (d.to === "/quiz") {
            // Diagnostic "which door" only — canonical leaguecraft_opened fires on /quiz.
            trackFunnelEvent("leaguecraft_cta_clicked", { cta: "academy_core_bay" });
          }
        },
      });
    }
    return map;
  }, [engage, release, cue]);

  const renderBay = (d: CoreDestination, variant: "mounted" | "row") => {
    const h = bayHandlers.get(d.id)!;
    const active = focus === d.id;
    return (
      <Link
        key={d.id}
        to={d.to}
        className={`acore-bay-link acore-bay-link-${variant}`}
        data-bay={d.id}
        data-active={active ? "true" : "false"}
        data-testid={`academy-core-bay-${d.id}`}
        aria-describedby={coreBayDescriptionId(d.id)}
        style={variant === "mounted" ? bayOverlayStyle(d) : undefined}
        {...h}
      >
        <span className="acore-bay-lampcell" aria-hidden />
        <span className="acore-bay-glyph" aria-hidden>
          <d.Icon strokeWidth={1.75} />
        </span>
        <span className="acore-bay-text">
          <span className="acore-bay-eyebrow" aria-hidden>Bay {d.bay} · {d.readout}</span>
          <span className="acore-bay-title">{d.title}</span>
          {/* Visible on rows (no hover on phones); the same sentence reaches AT
              through aria-describedby, so it stays out of the accessible name. */}
          {variant === "row" && <span className="acore-bay-preview" aria-hidden>{d.preview}</span>}
        </span>
        <ArrowUpRight className="acore-bay-arrow" aria-hidden />
      </Link>
    );
  };

  const secondScreen = (
    <nav className="acore-second-screen" aria-label="Academy rooms beyond the Core">
      <a href={ACADEMY_COMMONS_HREF} className="acore-minor-link" data-testid="academy-core-commons-link">
        Academy Commons
      </a>
      <Link to={ACADEMY_HALL_ROUTE} className="acore-minor-link" data-testid="academy-core-hall-link">
        Academy Hall
      </Link>
    </nav>
  );

  return (
    <div className="acore-root" data-layout={fullLayout ? "full" : "stacked"} data-ambient={ambient ? "on" : "off"} data-testid="academy-core">
      <SEOHead
        title="Academy Core — Mogzy Academy (preview)"
        description="Preview of the Academy Core home hub."
        path="/lol/dev/academy-core"
        noindex
      />

      {/* sr-only bay descriptions, referenced by aria-describedby */}
      <div className="sr-only">
        {CORE_DESTINATIONS.map((d) => (
          <span key={d.id} id={coreBayDescriptionId(d.id)}>{d.preview}</span>
        ))}
      </div>

      <section ref={heroRef} className="acore-hero" aria-labelledby="acore-title">
        {/* The workshop: wall, bench, and two pools of light — one warm over the
            console and book, one Hextech over the Core. Pointer-inert. */}
        <div className="acore-room" aria-hidden>
          <div className="acore-room-wall" />
          <div className="acore-room-pilaster acore-room-pilaster-l" />
          <div className="acore-room-pilaster acore-room-pilaster-r" />
          <div className="acore-room-lamp" />
          <div className="acore-room-hex" />
          <div className="acore-room-bench" />
          <div className="acore-room-bench-edge" />
        </div>

        {/* ---------------- console: brand + actions + the book ---------------- */}
        <div className="acore-console">
          <p className="acore-eyebrow">Mogzy&rsquo;s Hextech Workshop</p>
          <h1 id="acore-title" className="acore-title">Mogzy Academy</h1>
          <p className="acore-lede">
            One peculiar instrument. Four rooms. Start with today&rsquo;s Daily.
          </p>

          <div className="acore-actions">
            <Link
              to={DAILY_ROUTE}
              state={DAILY_START_STATE}
              className="acore-cta acore-cta-primary"
              data-testid="academy-core-daily"
              onPointerEnter={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
              onFocus={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
            >
              <span className="acore-cta-key" aria-hidden>▶</span>
              <span className="acore-cta-label">
                {dailyResume ? "Resume Daily Challenge" : "Play Daily Challenge"}
              </span>
            </Link>
            <Link
              to={RANKED_ROUTE}
              className="acore-cta acore-cta-secondary"
              data-testid="academy-core-ranked"
              onPointerEnter={() => prefetchRoute("/quiz", { intent: true })}
              onFocus={() => prefetchRoute("/quiz", { intent: true })}
              onClick={() => trackFunnelEvent("leaguecraft_cta_clicked", { cta: "academy_core_ranked" })}
            >
              <span className="acore-cta-label">Ranked</span>
              <span className="acore-cta-hint" aria-hidden>enter the queue</span>
            </Link>
          </div>
          {dailyStatusLine && (
            <p className="acore-status" data-testid="academy-core-daily-status">{dailyStatusLine}</p>
          )}

          {/* The real Patch Report book, on the bench below the actions (desktop).
              Its layout box is the drawn book (geometry reserved by the painting's
              intrinsic size), with the radio dock as its control deck. */}
          {fullLayout && (
            <div className="acore-book" data-testid="academy-core-book">
              <AcademyBroadcastCenterpiece feed={broadcastFeed} className="acore-book-centerpiece" />
            </div>
          )}
          {fullLayout && secondScreen}
        </div>

        {/* ---------------- the instrument, with Mogzy at the controls ---------------- */}
        <div className="acore-stagewrap">
          <div ref={stageRef} className="acore-stage" data-focus={focus} data-testid="academy-core-stage">
            <AcademyCoreInstrument focus={focus} compact={!fullLayout} ambient={ambient} media={media} />
            {fullLayout && (
              <nav className="acore-bays-mounted" aria-label="Academy rooms">
                {CORE_DESTINATIONS.map((d) => renderBay(d, "mounted"))}
              </nav>
            )}
            <MogzyOperator
              focus={focus}
              line={mogzyLine}
              ambient={ambient}
              reduced={reduced}
              reactionsReady={projections !== null}
            />
          </div>
        </div>

        {!fullLayout && (
          <>
            <nav className="acore-bays-rows" aria-label="Academy rooms">
              {CORE_DESTINATIONS.map((d) => renderBay(d, "row"))}
            </nav>
            {/* Phones: the existing mobile Patch Report variant follows the rooms. */}
            <div className="acore-book acore-book-mobile" data-testid="academy-core-book-mobile">
              <AcademyBroadcastCenterpiece variant="mobile" feed={broadcastFeed} />
            </div>
            {secondScreen}
          </>
        )}
      </section>
    </div>
  );
}
