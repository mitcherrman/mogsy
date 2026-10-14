/**
 * Academy Core V1 — `/lol/dev/academy-core` (alias `/dev/academy-core`).
 *
 * The approved Home Hub concept as a working page inside the real shell: one
 * precision instrument (AcademyCoreInstrument), four permanently labelled room
 * entrances mounted on it, and the two play actions in immediate reach.
 *
 * NAVIGATION CONTRACTS (see academy-core-destinations.ts):
 *   · Daily   → <Link to="/quiz/daily-challenge" state={DAILY_START_STATE}>
 *   · Ranked  → <Link to="/quiz?play=1"> — the lobby opens its Play record
 *   · Rooms   → <Link> to /quiz, /combat-lab, /lol/docs, /lol/pro-play
 * Every entrance navigates on the first click / tap / Enter. Hover and focus
 * only animate the instrument and show the one-line preview; nothing is
 * gated behind them.
 *
 * DATA. Two reads, both existing authorities and both read-only: the Daily
 * status (`useDailyChallengeStatus`, one request, the same the Quiz lobby
 * makes) and the Patch Reports list under the Hall's own query key (shared
 * cache). Status copy renders only once the service has actually answered —
 * nothing here invents completion, streaks, ranks or XP.
 *
 * ANALYTICS. Deliberately NO `hub_entered` from a preview route — that would
 * inflate the real Hall's count. The diagnostic `leaguecraft_cta_clicked` is
 * reused for the two doors that lead into /quiz, with distinct `cta` values,
 * exactly as the Hall's book does; the canonical open event fires on /quiz.
 *
 * ISOLATION. New styles live in ./academy-core.css (scoped `.acore-*`), not
 * in index.css. The route is lazily loaded from App.tsx; the production Hall
 * at /lol and the site root are untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Radio } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { useDailyChallengeStatus } from "@/lib/daily-challenge/useDailyChallengeStatus";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import { fetchPatchReports } from "@/lib/patch-reports/api";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { prefetchRoute } from "@/lib/route-prefetch";
import { useSfx } from "@/lib/audio/useSfx";

import AcademyCoreInstrument, { BAY_PLATE, CORE_VIEWBOX, bayAnchor } from "./AcademyCoreInstrument";
import {
  ACADEMY_COMMONS_HREF,
  ACADEMY_HALL_ROUTE,
  CORE_DESTINATIONS,
  CORE_IDLE_READOUT,
  DAILY_ROUTE,
  PATCH_REPORTS_ROUTE,
  RANKED_ROUTE,
  coreBayDescriptionId,
  destinationById,
  type CoreDestination,
  type CoreFocus,
} from "./academy-core-destinations";
import "./academy-core.css";

/** Same grace the Mogzy guide uses before a leave clears a hover message. */
const FOCUS_RELEASE_MS = 140;
/** Full (instrument-mounted bays) composition from here up; stacked below. */
const FULL_LAYOUT_QUERY = "(min-width: 1024px)";

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
  const fullLayout = useMediaQuery(FULL_LAYOUT_QUERY);
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();

  // Same session flag the Hall sets on arrival. The Quiz lobby's onboarding
  // gate (`redirect_to_hub`) bounces a first-time session that has not seen
  // the hub back to /lol; this page IS the hub candidate, so Ranked and the
  // Leaguecraft bay must not be answered with a detour. sessionStorage only.
  useEffect(() => {
    markHubVisited();
  }, []);

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

  const patchList = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
  const latestPatch = patchList.data?.patches?.[0] ?? null;
  const patchHref = latestPatch
    ? `${PATCH_REPORTS_ROUTE}?patch=${encodeURIComponent(latestPatch.patch_version)}`
    : PATCH_REPORTS_ROUTE;

  const focused = destinationById(focus);
  const readoutLine = focused
    ? `BAY ${focused.bay} · ${focused.readout} — ${focused.preview}`
    : `${CORE_IDLE_READOUT} — Select a bay to take a reading.`;

  /* The broadcast gateway and the way on to the existing second screen. In
     the full composition it sits under the actions in the console; stacked,
     it follows the four rooms so the entrances are never pushed below them. */
  const gateway = (
    <>
      {/* ---------------- broadcast gateway + second screen ---------------- */}
      <div className="acore-gateway" data-testid="academy-core-gateway">
        <Link to={patchHref} className="acore-transmitter" data-testid="academy-core-patch-link">
          <span className="acore-transmitter-dial" aria-hidden>
            <Radio strokeWidth={1.6} />
          </span>
          <span className="acore-transmitter-text">
            <span className="acore-transmitter-eyebrow">Academy Broadcast</span>
            <span className="acore-transmitter-title">
              {latestPatch ? `Patch ${latestPatch.patch_version} brief` : "Patch Reports"}
            </span>
            {latestPatch && (
              <span className="acore-transmitter-meta">
                {latestPatch.change_count} changes · {latestPatch.card_count} cards
              </span>
            )}
          </span>
          <ArrowUpRight className="acore-bay-arrow" aria-hidden />
        </Link>
        <nav className="acore-second-screen" aria-label="Academy rooms beyond the Core">
          <a href={ACADEMY_COMMONS_HREF} className="acore-minor-link" data-testid="academy-core-commons-link">
            Academy Commons
          </a>
          <Link to={ACADEMY_HALL_ROUTE} className="acore-minor-link" data-testid="academy-core-hall-link">
            Academy Hall
          </Link>
        </nav>
      </div>
    </>
  );

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

  return (
    <div className="acore-root" data-layout={fullLayout ? "full" : "stacked"} data-testid="academy-core">
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

      <section className="acore-hero" aria-labelledby="acore-title">
        {/* ---------------- console: brand + actions ---------------- */}
        <div className="acore-console">
          <p className="acore-eyebrow">The Academy Core</p>
          <h1 id="acore-title" className="acore-title">Mogzy Academy</h1>
          <p className="acore-lede">
            One instrument. Four rooms. Start with today&rsquo;s Daily.
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

          {fullLayout && gateway}
        </div>

        {/* ---------------- the instrument ---------------- */}
        <div className="acore-stagewrap">
          <div
            ref={stageRef}
            className="acore-stage"
            data-focus={focus}
            data-testid="academy-core-stage"
          >
            <div className="acore-operator" aria-hidden>
              <MogzyMascot pose="peeking" scale="compact" decorative className="acore-operator-art" />
            </div>
            <AcademyCoreInstrument
              focus={focus}
              compact={!fullLayout}
              ambient={onScreen && !reduced}
            />
            {fullLayout && (
              <nav className="acore-bays-mounted" aria-label="Academy rooms">
                {CORE_DESTINATIONS.map((d) => renderBay(d, "mounted"))}
              </nav>
            )}
          </div>
          <p className="acore-readout-line" data-testid="academy-core-readout" aria-hidden>
            {readoutLine}
          </p>
        </div>

        {!fullLayout && (
          <>
            <nav className="acore-bays-rows" aria-label="Academy rooms">
              {CORE_DESTINATIONS.map((d) => renderBay(d, "row"))}
            </nav>
            <div className="acore-console acore-console-tail">{gateway}</div>
          </>
        )}
      </section>
    </div>
  );
}
