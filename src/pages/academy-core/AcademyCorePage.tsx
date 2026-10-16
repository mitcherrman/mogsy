/**
 * Academy Core V3 — the production `/lol` home. (The previous Home Hub is
 * kept whole at `/lol/hall`; `/lol/dev/academy-core` and `/dev/academy-core`
 * redirect here.)
 *
 * The Four-Book Hextech Navigator: the four actual closed Academy books
 * (`AcademyHubBook` — the Hall's own component, with the Hall's cover
 * champions, crops and titles) mounted INSIDE an enlarged Hextech Core, the
 * real Patch Report book with its radio on its own lectern island beside it,
 * Mogzy operating the device, and a compact Daily shortcut.
 *
 * NAVIGATION CONTRACTS (see academy-core-destinations.ts):
 *   · Books   → <Link> to /quiz, /lol/pro-play, /combat-lab, /lol/docs.
 *     One click: a short activation (BOOK_ACTIVATION_MS, ≤ 350 ms) and the
 *     page navigates itself. Modified clicks (Ctrl/Cmd/Shift/Alt, middle)
 *     are left to the browser untouched; reduced motion navigates at once;
 *     a second press during activation is ignored (single timer).
 *   · Crystal → an accessible button that cycles the four previews WITHOUT
 *     navigating; a visible readout names the current preview.
 *   · Daily   → <Link to="/quiz/daily-challenge" state={DAILY_START_STATE}>,
 *     immediate. Ranked shortcut → <Link to="/quiz?play=1">, immediate,
 *     labelled for what it does (opens mode selection).
 *   · Patch book links, radio, Commons and Hall links: ordinary, immediate
 *     client-side <Link>s (`/lol/hall`, `/lol/hall#academy-commons`). A legacy
 *     `/lol#academy-commons` deep link is forwarded to the Hall's Commons.
 *
 * DATA. Read-only, existing authorities only: the champion manifest through
 * the app's one query (the warm fetches it, `useChampionAssets()` reads the
 * cache), the Patch Brief feed the Hall's book uses (shared keys; the
 * Archives projection reuses its icons), and the Daily status (one request,
 * the same the lobby makes). Nothing is invented.
 *
 * LOADING (PERF1 convention, page-scoped): `warmAcademyCore` — frame, Mogzy,
 * book painting at high priority; the four cover splashes as soon as the
 * manifest answers; poses and route chunks after. The Hall's warm is NOT
 * called. Every late asset has reserved geometry (the books' boxes are their
 * frame's canvas; the painting declares its intrinsic size).
 *
 * ANALYTICS. As the home surface it emits the canonical `hub_entered`
 * (once per session, same hook the Hall uses — the Landing → Hub funnel
 * step). The diagnostic `leaguecraft_cta_clicked` is reused for the doors
 * into /quiz with distinct `cta` values; the canonical open event fires on
 * /quiz itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useSurfaceEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site-config";
import AcademyHubBook from "@/components/lol/AcademyHubBook";
import AcademyBroadcastCenterpiece from "@/components/lol/broadcast/AcademyBroadcastCenterpiece";
import { usePatchBriefFeed } from "@/components/lol/broadcast/usePatchBriefFeed";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { useDailyChallengeStatus } from "@/lib/daily-challenge/useDailyChallengeStatus";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { prefetchRoute } from "@/lib/route-prefetch";
import { useSfx } from "@/lib/audio/useSfx";
import { usePlaySfx } from "@/lib/audio/usePlaySfx";

import AcademyCoreInstrument, { BOOK_SLOTS, CORE_VIEWBOX, type CoreMedia } from "./AcademyCoreInstrument";
import MogzyOperator from "./MogzyOperator";
import { CORE_FULL_LAYOUT_MEDIA, CORE_MEASURE_SHARDS, CORE_OBSERVE_ROLES, warmAcademyCore } from "./academy-core-warm";
import {
  ACADEMY_COMMONS_FRAGMENT,
  ACADEMY_COMMONS_HREF,
  ACADEMY_HALL_ROUTE,
  BOOK_ACTIVATION_MS,
  CORE_CYCLE_ORDER,
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
const IDLE_LINE = "Pick a book and I'll take a reading.";
/** How long after navigating the activation state may stay on while the Core is still mounted. */
const ACTIVATION_SETTLE_MS = 1500;

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

/** Percent box for a book cradle, from the instrument's own geometry. */
function slotStyle(id: string): React.CSSProperties {
  const s = BOOK_SLOTS[id];
  return {
    left: `${(s.x / CORE_VIEWBOX.width) * 100}%`,
    top: `${(s.y / CORE_VIEWBOX.height) * 100}%`,
    width: `${(s.w / CORE_VIEWBOX.width) * 100}%`,
  };
}

/** A click the browser should keep (new tab, download, context): never delayed. */
function isModifiedClick(e: React.MouseEvent): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/** The Hall's own SEO block, carried verbatim: `/lol` is still the indexed home. */
const HOME_TITLE = "Mogzy LoL Quiz | League of Legends Trivia and Training";
const HOME_DESCRIPTION =
  "Play League of Legends quizzes about champions, items, abilities, builds, objectives, patch knowledge, and esports history. Test damage in the Combat Lab. Start playing without an account.";
const HOME_KEYWORDS =
  "league of legends quiz, lol quiz, league trivia, champion quiz, item quiz, ability quiz, esports trivia, league learning game, league of legends training tool, combat lab, lol tier list";

/**
 * `/lol#academy-commons` is a legacy deep link: before the Core the Commons
 * was the second screen of `/lol`. The Commons now lives on the Hall, so the
 * fragment is forwarded there (replace, so Back does not bounce).
 */
export default function AcademyCorePage() {
  const { hash } = useLocation();
  if (hash === ACADEMY_COMMONS_FRAGMENT) {
    return <Navigate to={ACADEMY_COMMONS_HREF} replace />;
  }
  return <AcademyCoreHome />;
}

function AcademyCoreHome() {
  const fullLayout = useMediaQuery(CORE_FULL_LAYOUT_MEDIA);
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();
  const playSfx = usePlaySfx();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Same session flag the Hall sets on arrival: the Quiz lobby's onboarding
  // gate bounces a first-time session that has not seen the hub back to /lol.
  useEffect(() => { markHubVisited(); }, []);

  // The home surface: the funnel's `hub_entered` (once per session — the same
  // boundary the Hall uses) and the Hall's own arrival cue.
  useSurfaceEvent("hub_entered");
  useEffect(() => { sfx.play("hub.application.enter"); }, [sfx]);

  /* ---------------- warm, then the covers ---------------- */
  const [warmed, setWarmed] = useState(false);
  useEffect(() => {
    let active = true;
    warmAcademyCore(queryClient).then(() => { if (active) setWarmed(true); });
    return () => { active = false; };
  }, [queryClient]);
  // The covers read the same cache entry the warm fills — one request in all.
  const { data: manifest } = useChampionAssets();
  const splashes = useMemo(() => {
    const out: Partial<Record<CoreDestination["id"], string | null>> = {};
    for (const d of CORE_DESTINATIONS) out[d.id] = getChampionSplash(manifest, d.championName);
    return out;
  }, [manifest]);

  /* ---------------- focus: hover / keyboard, and the crystal's pinned preview ---------------- */
  const [hoverFocus, setHoverFocus] = useState<CoreFocus>("idle");
  const [pinned, setPinned] = useState<CoreFocus>("idle");
  const focus: CoreFocus = hoverFocus !== "idle" ? hoverFocus : pinned;
  const releaseTimer = useRef<number | null>(null);
  const cancelRelease = () => {
    if (releaseTimer.current !== null) { window.clearTimeout(releaseTimer.current); releaseTimer.current = null; }
  };
  const engage = useCallback((id: CoreFocus) => { cancelRelease(); setHoverFocus(id); }, []);
  const release = useCallback(() => {
    cancelRelease();
    releaseTimer.current = window.setTimeout(() => { releaseTimer.current = null; setHoverFocus("idle"); }, FOCUS_RELEASE_MS);
  }, []);
  useEffect(() => () => cancelRelease(), []);

  // The focus cue sounds only for authored interactions (fine pointer / Tab).
  const lastTabAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Tab") lastTabAt.current = Date.now(); };
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
    } else if (Date.now() - lastTabAt.current > 1000) return;
    sfx.play("hub.destination.focus");
  }, [sfx]);

  /* ---------------- activation → navigation ---------------- */
  const [activating, setActivating] = useState<CoreFocus | null>(null);
  const activationTimer = useRef<number | null>(null);
  // The Core is only replaced once the destination has rendered. If that is
  // slow, or the visitor comes straight back (Back, bfcache), the Core is still
  // mounted: the activation state must not stay latched on.
  const settleTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (activationTimer.current !== null) window.clearTimeout(activationTimer.current);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);
  useEffect(() => {
    const release = () => {
      if (settleTimer.current !== null) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
      setActivating(null);
    };
    window.addEventListener("popstate", release);
    window.addEventListener("pageshow", release);
    return () => {
      window.removeEventListener("popstate", release);
      window.removeEventListener("pageshow", release);
    };
  }, []);
  const onBookClick = useCallback((d: CoreDestination, e: React.MouseEvent<HTMLAnchorElement>) => {
    if (d.to === "/quiz") trackFunnelEvent("leaguecraft_cta_clicked", { cta: "academy_core_book" });
    if (isModifiedClick(e)) return; // the browser's own behaviour, untouched
    playSfx.play("bookRuffle"); // the Hall's own book-open cue, gated by the same per-cue setting
    if (reduced) return; // the Link navigates at once
    e.preventDefault();
    if (activationTimer.current !== null) return; // a second press changes nothing
    setActivating(d.id);
    setHoverFocus(d.id);
    activationTimer.current = window.setTimeout(() => {
      activationTimer.current = null;
      navigate(d.to);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        setActivating(null);
      }, ACTIVATION_SETTLE_MS);
    }, BOOK_ACTIVATION_MS);
  }, [navigate, playSfx, reduced]);

  /* ---------------- crystal: cycle previews, never navigate ---------------- */
  const cycle = useCallback(() => {
    setPinned((prev) => {
      const i = CORE_CYCLE_ORDER.indexOf(prev as (typeof CORE_CYCLE_ORDER)[number]);
      return i < 0 ? CORE_CYCLE_ORDER[0] : i === CORE_CYCLE_ORDER.length - 1 ? "idle" : CORE_CYCLE_ORDER[i + 1];
    });
    cancelRelease();
    setHoverFocus("idle");
  }, []);

  /* ---------------- ambient, only while on screen ---------------- */
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

  /* ---------------- the floor: bench edge from the chassis feet ----------------
     Capped: the island's bottom padding derives from this value, so an uncapped
     measurement feeds back into the hero's height on short desktops. */
  const FLOOR_MAX = 140;
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    const hero = heroRef.current;
    if (!stage || !hero || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const s = stage.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      const feetY = s.top + s.height * (814 / CORE_VIEWBOX.height);
      hero.style.setProperty("--acore-floor", `${Math.min(FLOOR_MAX, Math.max(0, Math.round(h.bottom - feetY)))}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(hero);
    return () => ro.disconnect();
  }, [fullLayout]);

  /* ---------------- real data, read-only ---------------- */
  // The Daily read is authenticated: a visitor with no session would only
  // earn a 401 (a request and a console error) for an answer that is
  // "unknown" anyway, which renders the same "Play Daily Challenge" label.
  const { user } = useAuth();
  const daily = useDailyChallengeStatus({ enabled: !!user });
  const dailyResume = daily.known && daily.resumable && !daily.completed;
  const broadcastFeed = usePatchBriefFeed();
  const brief = broadcastFeed.status === "ready" ? broadcastFeed.transmissions[broadcastFeed.index]?.brief ?? null : null;

  const media = useMemo<CoreMedia>(() => ({
    // the projections reuse the cover art already in cache — no extra fetch
    art: warmed ? splashes : {},
    strataIcons: brief ? brief.sections.flatMap((s) => s.entries).slice(0, 4).map((e) => e.iconUrl) : [],
    strataLabel: brief ? brief.patchLabel : null,
    measureShards: warmed ? CORE_MEASURE_SHARDS : undefined,
    observeRoles: warmed ? CORE_OBSERVE_ROLES : [],
  }), [warmed, splashes, brief]);

  const focused = destinationById(focus);
  const mogzyLine = focused ? focused.preview : IDLE_LINE;
  const previewLabel = focused ? `Previewing ${focused.title}` : "No room previewed";

  /* ---------------- a mounted book ---------------- */
  const renderBook = (d: CoreDestination, variant: "mounted" | "tier") => (
    <div
      key={d.id}
      className={`acore-slot acore-slot-${variant} acore-slot-${d.tier}`}
      data-bay={d.id}
      data-active={focus === d.id ? "true" : "false"}
      data-activating={activating === d.id ? "true" : "false"}
      data-testid={`academy-core-slot-${d.id}`}
      style={variant === "mounted" ? slotStyle(d.id) : undefined}
      onPointerEnter={(e) => {
        prefetchRoute(d.to, { intent: true });
        if (e.pointerType === "touch") return;
        engage(d.id);
        cue("pointer");
      }}
      onPointerLeave={() => release()}
      onPointerDown={() => { prefetchRoute(d.to, { intent: true }); engage(d.id); }}
      onFocus={() => { prefetchRoute(d.to, { intent: true }); engage(d.id); cue("keyboard"); }}
      onBlur={() => release()}
    >
      <AcademyHubBook
        to={d.to}
        title={d.title}
        coverTitle={d.coverTitle}
        splashUrl={splashes[d.id] ?? null}
        splashPosition={d.splashPosition}
        describedBy={coreBayDescriptionId(d.id)}
        onClick={(e) => onBookClick(d, e)}
      />
    </div>
  );

  const upper = CORE_DESTINATIONS.filter((d) => d.tier === "upper");
  const lower = CORE_DESTINATIONS.filter((d) => d.tier === "lower");

  const shortcuts = (
    <div className="acore-shortcuts" data-testid="academy-core-shortcuts">
      <Link
        to={DAILY_ROUTE}
        state={DAILY_START_STATE}
        className="acore-cta acore-cta-primary"
        data-testid="academy-core-daily"
        onPointerEnter={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
        onFocus={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
      >
        <span className="acore-cta-key" aria-hidden>▶</span>
        <span className="acore-cta-label">{dailyResume ? "Resume Daily Challenge" : "Play Daily Challenge"}</span>
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
        <span className="acore-cta-hint" aria-hidden>opens mode selection</span>
      </Link>
    </div>
  );

  const secondScreen = (
    <nav className="acore-second-screen" aria-label="Academy rooms beyond the Core">
      <Link
        to={ACADEMY_COMMONS_HREF}
        className="acore-minor-link"
        data-testid="academy-core-commons-link"
        onPointerEnter={() => prefetchRoute(ACADEMY_HALL_ROUTE, { intent: true })}
        onFocus={() => prefetchRoute(ACADEMY_HALL_ROUTE, { intent: true })}
      >
        Academy Commons
      </Link>
      <Link
        to={ACADEMY_HALL_ROUTE}
        className="acore-minor-link"
        data-testid="academy-core-hall-link"
        onPointerEnter={() => prefetchRoute(ACADEMY_HALL_ROUTE, { intent: true })}
        onFocus={() => prefetchRoute(ACADEMY_HALL_ROUTE, { intent: true })}
      >
        Academy Hall
      </Link>
    </nav>
  );

  const crystalButton = (
    <button
      type="button"
      className="acore-crystal-button"
      data-testid="academy-core-crystal"
      aria-label="Cycle the room preview in the crystal"
      aria-describedby="acore-preview-readout"
      onClick={cycle}
      onPointerEnter={() => cancelRelease()}
    >
      <span className="sr-only">{previewLabel}</span>
    </button>
  );

  const stage = (
    <div className="acore-stagewrap">
      <div ref={stageRef} className="acore-stage" data-focus={focus} data-activating={activating ?? ""} data-testid="academy-core-stage">
        <AcademyCoreInstrument focus={focus} activating={activating} compact={!fullLayout} ambient={ambient} media={media} />
        {fullLayout && (
          <nav className="acore-books-mounted" aria-label="Academy rooms">
            {CORE_DESTINATIONS.map((d) => renderBook(d, "mounted"))}
          </nav>
        )}
        <div
          className={`acore-crystal-hit${fullLayout ? "" : " acore-crystal-hit-compact"}`}
          style={fullLayout ? { left: "50%", top: `${(520 / CORE_VIEWBOX.height) * 100}%` } : undefined}
        >
          {crystalButton}
        </div>
        <p id="acore-preview-readout" className="acore-preview-readout" data-testid="academy-core-preview" aria-live="polite">
          {previewLabel}
        </p>
        <MogzyOperator
          focus={focus}
          line={mogzyLine}
          ambient={ambient}
          reduced={reduced}
          facing={fullLayout ? "left" : "right"}
          reactionsReady={warmed}
        />
      </div>
    </div>
  );

  return (
    <div className="acore-root" data-layout={fullLayout ? "full" : "stacked"} data-ambient={ambient ? "on" : "off"} data-testid="academy-core">
      <SEOHead
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        path="/lol"
        keywords={HOME_KEYWORDS}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Mogzy LoL Quiz",
            url: `${SITE_URL}/lol`,
            applicationCategory: "GameApplication",
            operatingSystem: "Web",
            description:
              "League of Legends quiz and training tool: champion, item, ability, build and esports trivia, plus a damage simulator.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        ]}
      />

      <div className="sr-only">
        {CORE_DESTINATIONS.map((d) => <span key={d.id} id={coreBayDescriptionId(d.id)}>{d.preview}</span>)}
      </div>

      <section ref={heroRef} className="acore-hero" aria-labelledby="acore-title">
        <div className="acore-room" aria-hidden>
          <div className="acore-room-wall" />
          <div className="acore-room-pilaster acore-room-pilaster-l" />
          <div className="acore-room-pilaster acore-room-pilaster-r" />
          <div className="acore-room-lamp" />
          <div className="acore-room-hex" />
          <div className="acore-room-bench" />
          <div className="acore-room-bench-edge" />
        </div>

        {/* ---------------- the lectern island: brand, Daily, the real Patch Report book ---------------- */}
        <div className="acore-island">
          <header className="acore-brand">
            <p className="acore-eyebrow">Mogzy&rsquo;s Hextech Workshop</p>
            <h1 id="acore-title" className="acore-title">Mogzy Academy</h1>
          </header>
          {shortcuts}
          {fullLayout && (
            <div className="acore-book" data-testid="academy-core-book">
              <AcademyBroadcastCenterpiece feed={broadcastFeed} className="acore-book-centerpiece" />
            </div>
          )}
          {fullLayout && secondScreen}
        </div>

        {/* ---------------- the Navigator ---------------- */}
        {fullLayout ? (
          stage
        ) : (
          <>
            {/* phones: the upper pair, the crystal band between the tiers, then the lower pair */}
            <nav className="acore-books-tiers" aria-label="Academy rooms">
              <div className="acore-tier acore-tier-upper">{upper.map((d) => renderBook(d, "tier"))}</div>
              {stage}
              <div className="acore-tier acore-tier-lower">{lower.map((d) => renderBook(d, "tier"))}</div>
            </nav>
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
