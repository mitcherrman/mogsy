/**
 * Academy Core V3.5 — The Living Hextech Orrery: the production `/lol` home.
 * (The previous Home Hub is kept whole at `/lol/hall`; the preview URLs
 * `/lol/dev/academy-core`, `/dev/academy-core`, `/lol/dev/academy-core-v35` and
 * `/dev/academy-core-v35` redirect here.) It replaces the V3 Four-Book Core,
 * whose navigation, data, loading and analytics contracts it keeps.
 *
 * A large Hextech Core floats in open magical space; the four real Academy
 * books (`AcademyHubBook`, the Hall's own component, with the cover champions,
 * crops and titles of V3) float free of any chassis and orbit it. The real
 * Patch Report book and Academy Radio float beside it. Mogzy hovers at the
 * edge of the scene.
 *
 * NAVIGATION CONTRACTS (as V3; see academy-core-destinations.ts):
 *   · Books   → <Link> to /quiz, /lol/pro-play, /combat-lab, /lol/docs. One
 *     click: the 240 ms activation, then the page navigates itself. Modified
 *     clicks are the browser's; reduced motion navigates at once; a second
 *     press during activation is ignored (useCoreNavigator).
 *   · Crystal → an accessible button that cycles the four previews without
 *     navigating; the two arrows beneath the Core turn the orbit (never navigate).
 *   · the Daily shortcut, Patch book links, radio, Commons and Hall
 *     links: ordinary, immediate client-side <Link>s. A legacy
 *     `/lol#academy-commons` deep link is forwarded to the Hall's Commons.
 *
 * DATA. Read-only, existing authorities only: the champion manifest (one
 * query, warmed by `warmAcademyCore`), the Patch Brief feed, the Daily status.
 *
 * ANALYTICS. As the home surface it emits the canonical `hub_entered` (once per
 * session — the Landing → Hub funnel step), as V3 did. The diagnostic
 * `leaguecraft_cta_clicked` marks the door into /quiz (`academy_core_book`);
 * the canonical open event fires on /quiz itself. (Ranked is disabled, so the
 * Core offers no Ranked shortcut: no button, placeholder or Coming Soon label.)
 *
 * WHAT IS REUSED UNCHANGED
 *   · destinations, routes, copy:  academy-core-destinations (V3)
 *   · the crystal and its four projections:  AcademyCoreInstrument (V3, compact)
 *   · the books:  AcademyHubBook;  the Patch Report:  AcademyBroadcastCenterpiece
 *   · Mogzy:  MogzyOperator;  art warm-up:  warmAcademyCore;  data hooks as V3
 *
 * WHAT IS NEW (./orrery/)
 *   · useCoreNavigator   the V3 focus / 240 ms activation / crystal-cycle logic,
 *                        lifted out of the page (no behaviour change)
 *   · orrery-motion      pure orbit mathematics (unit-tested)
 *   · OrreryEngine       the one rAF loop; writes transforms, never React state
 *   · OrreryCore / OrreryProjections / OrreryEnvironment / academy-core-v35.css
 *                        the presentation
 *
 * LAYOUTS
 *   full (>= 1024 px)  orbiting books; Patch Report and brand in the left column
 *   stacked (< 1024)   no orbit: a composed floating arrangement (two tiers
 *                      around the Core), limited levitation, tap to focus
 *   reduced motion     the full layout, placed once at its rest phase, no loop
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useSurfaceEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site-config";
import AcademyHubBook from "@/components/lol/AcademyHubBook";
import AcademyBroadcastCenterpiece from "@/components/lol/broadcast/AcademyBroadcastCenterpiece";
import { usePatchBriefFeed } from "@/components/lol/broadcast/usePatchBriefFeed";
import { getChampionIcon, getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { useDailyChallengeStatus } from "@/lib/daily-challenge/useDailyChallengeStatus";
import { markHubVisited } from "@/lib/quiz/onboarding-gate";
import { prefetchRoute } from "@/lib/route-prefetch";
import { prepareImage } from "@/lib/ranked-core/media/prepareImage";
import { useAcademyStartupGate } from "@/pages/academy-core/useAcademyStartupGate";
import { useSfx } from "@/lib/audio/useSfx";

import type { CoreMedia } from "@/pages/academy-core/AcademyCoreInstrument";
import MogzyOperator from "@/pages/academy-core/MogzyOperator";
import {
  CORE_FULL_LAYOUT_MEDIA,
  CORE_MEASURE_SHARDS,
  CORE_OBSERVE_ROLES,
  academyCoreSettled,
  warmAcademyCore,
} from "@/pages/academy-core/academy-core-warm";
import { HUB_DESTINATION_ROUTES } from "@/lib/hub/academy-hub-warm";
import {
  ACADEMY_COMMONS_FRAGMENT,
  ACADEMY_COMMONS_HREF,
  ACADEMY_HALL_ROUTE,
  CORE_DESTINATIONS,
  DAILY_ROUTE,
  coreBayDescriptionId,
  destinationById,
  type CoreDestination,
  type CoreFocus,
} from "@/pages/academy-core/academy-core-destinations";
import "@/pages/academy-core/academy-core.css";
import "./orrery/academy-core-v35.css";

import OrreryCore from "./orrery/OrreryCore";
import OrreryEnvironment from "./orrery/OrreryEnvironment";
import { OrreryEngine } from "./orrery/OrreryEngine";
import { useCoreNavigator } from "./orrery/useCoreNavigator";
import { MATCHUP_LINEUP, MYSTERY_CHAMPION, RIFT_CENTRE_ART, type MatchupMedia } from "./orrery/orrery-projections-data";
import { BOOK_ORDER, CALM, DESKTOP_ORBIT, STAGE, STAGE_COMPOSED, type BookId } from "./orrery/orrery-motion";

/** The Hall's own SEO block, carried verbatim from V3: `/lol` is still the indexed home. */
const HOME_TITLE = "Mogzy LoL Quiz | League of Legends Trivia and Training";
const HOME_DESCRIPTION =
  "Play League of Legends quizzes about champions, items, abilities, builds, objectives, patch knowledge, and esports history. Test damage in the Combat Lab. Start playing without an account.";
const HOME_KEYWORDS =
  "league of legends quiz, lol quiz, league trivia, champion quiz, item quiz, ability quiz, esports trivia, league learning game, league of legends training tool, combat lab, lol tier list";

/**
 * Quality tiers. `full` is the whole scene; `lite` keeps the orbit, the books
 * and the Core's crystal / first ring set but drops the decorative extras
 * (fragments, aurora drift, extra comets and gyro rings, sparks, twinkle).
 * Chosen by `?quality=lite|full` (a forced choice is never overridden), else
 * by cheap device hints (Save-Data, <= 2 cores or <= 2 GB), else `full`; and a
 * `full` scene that cannot hold its frame rate steps down to `lite` once.
 */
export type SceneQuality = "full" | "lite";
function readQualityChoice(): "full" | "lite" | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("quality");
  return q === "lite" || q === "full" ? q : null;
}
function initialQuality(): SceneQuality {
  const forced = readQualityChoice();
  if (forced) return forced;
  if (typeof navigator === "undefined") return "full";
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (n.connection?.saveData) return "lite";
  if ((n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2) return "lite";
  return "full";
}

/** How fast the Core's rings and comets turn for each room (1 = rest). */
/** The phone composition's books in clockwise order (the right arrow steps this way). */
const COMPOSED_RING: BookId[] = ["leaguecraft", "pro-play", "archives", "combat-lab"];

const TEMPO: Record<string, number> = { idle: 1, leaguecraft: 1.6, "pro-play": 1.3, "combat-lab": 2.5, archives: 0.65 };
const IDLE_LINE = "Pick a book and I'll take a reading.";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};
/** Run once the browser is idle (or after a short delay where it cannot say). Returns a cancel. */
function whenIdle(cb: () => void): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 200);
  return () => window.clearTimeout(id);
}

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

/** Slow, out-of-step levitation per book (seconds, delay, amplitude in stage units, sway degrees). */
const LEVITATION: Record<BookId, { dur: number; delay: number; amp: number; sway: number; swayDur: number }> = {
  leaguecraft: { dur: 6.4, delay: -1.2, amp: 8, sway: 0.9, swayDur: 9.3 },
  "pro-play": { dur: 7.3, delay: -4.6, amp: 7, sway: 0.8, swayDur: 10.7 },
  "combat-lab": { dur: 5.8, delay: -2.9, amp: 9, sway: 1.0, swayDur: 8.4 },
  archives: { dur: 6.9, delay: -5.8, amp: 7.5, sway: 0.85, swayDur: 11.6 },
};

/** A legacy `#academy-commons` deep link goes to the Hall's Commons, as on the V3 home. */
export default function AcademyCorePage() {
  const { hash } = useLocation();
  if (hash === ACADEMY_COMMONS_FRAGMENT) return <Navigate to={ACADEMY_COMMONS_HREF} replace />;
  return <AcademyCoreOrrery />;
}

function AcademyCoreOrrery() {
  const fullLayout = useMediaQuery(CORE_FULL_LAYOUT_MEDIA);
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();
  const queryClient = useQueryClient();
  const nav = useCoreNavigator(reduced);
  const [quality, setQuality] = useState<SceneQuality>(initialQuality);
  const { focus, pointerFocus, keyboardFocus, pinned, pinSource, activating } = nav;

  // The same session flag the Hall and the V3 Core set on arrival.
  useEffect(() => { markHubVisited(); }, []);
  // The home surface: the funnel's `hub_entered` (once per session — the same
  // boundary the Hall uses) and the Hall's own arrival cue, as on the V3 home.
  useSurfaceEvent("hub_entered");

  /* ---------------- warm, then the covers ---------------- */
  const [warmed, setWarmed] = useState(false);
  // ACADEMY STARTUP S3 — what nobody sees on arrival waits until the first
  // screen's art has settled AND the browser is idle: the four destination
  // pages' code (a hover or focus on a book still fetches its page at once),
  // Mogzy's reaction poses and the projections' champion icons (only shown on
  // hover / the crystal). They used to start with the page and compete with
  // the Patch Report and the covers.
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    let active = true;
    let cancelIdle = () => {};
    warmAcademyCore(queryClient).then(() => { if (active) setWarmed(true); });
    academyCoreSettled().then(() => {
      if (!active) return;
      cancelIdle = whenIdle(() => {
        if (!active) return;
        setDeferredReady(true);
        for (const to of HUB_DESTINATION_ROUTES) prefetchRoute(to);
      });
    });
    return () => { active = false; cancelIdle(); };
  }, [queryClient]);
  const { data: manifest } = useChampionAssets();
  const splashes = useMemo(() => {
    const out: Partial<Record<CoreDestination["id"], string | null>> = {};
    for (const d of CORE_DESTINATIONS) out[d.id] = getChampionSplash(manifest, d.championName);
    return out;
  }, [manifest]);

  /* ---------------- real data, read-only (as V3) ---------------- */
  const { user } = useAuth();
  const daily = useDailyChallengeStatus({ enabled: !!user, identity: user?.id ?? null });
  const dailyResume = daily.known && daily.resumable && !daily.completed;
  const broadcastFeed = usePatchBriefFeed();
  const brief = broadcastFeed.status === "ready" ? broadcastFeed.transmissions[broadcastFeed.index]?.brief ?? null : null;

  /* ---------------- the held entrance veil (ACADEMY STARTUP RC2) ---------------- */
  // Arriving from the Landing (or directly), the app-level veil stays up until
  // this page's first screen is really drawn; `shown` is false only meanwhile.
  const rootRef = useRef<HTMLDivElement>(null);
  const startupCovers = useMemo(
    () => (manifest === undefined ? {} : splashes) as Record<string, string | null | undefined>,
    [manifest, splashes],
  );
  const startup = useAcademyStartupGate(rootRef, { fullLayout, covers: startupCovers, feedStatus: broadcastFeed.status });
  // The Hall's arrival cue, as on the V3 home — at the reveal, not under the veil.
  const cuePlayed = useRef(false);
  useEffect(() => {
    if (!startup.shown || cuePlayed.current) return;
    cuePlayed.current = true;
    sfx.play("hub.application.enter");
  }, [startup.shown, sfx]);

  const media = useMemo<CoreMedia>(() => ({
    art: warmed ? splashes : {},
    strataIcons: brief ? brief.sections.flatMap((s) => s.entries).slice(0, 4).map((e) => e.iconUrl) : [],
    strataLabel: brief ? brief.patchLabel : null,
    measureShards: warmed ? CORE_MEASURE_SHARDS : undefined,
    observeRoles: warmed ? CORE_OBSERVE_ROLES : [],
  }), [warmed, splashes, brief]);

  // ACADEMY STARTUP RC1 — the deferral above is for what nobody has asked to
  // see. The first time a book is engaged (hover, keyboard focus, a press, the
  // arrows or the crystal), its projection art and Mogzy's reactions are wanted
  // NOW: on a slow link the first screen can take many seconds to settle, and
  // Leaguecraft's iris must not open onto empty glass meanwhile. Engaged art is
  // requested at high priority; the rest still waits.
  const [engaged, setEngaged] = useState<ReadonlySet<Exclude<CoreFocus, "idle">>>(() => new Set());
  useEffect(() => {
    if (focus === "idle") return;
    setEngaged((prev) => (prev.has(focus) ? prev : new Set(prev).add(focus)));
  }, [focus]);
  const deferredShown = warmed && deferredReady;
  const matchupShown = deferredShown || engaged.has("pro-play");
  const mysteryShown = deferredShown || engaged.has("leaguecraft");
  const reactionsShown = deferredShown || engaged.size > 0;

  // Pro Play's 5 v 5: manifest icons for the lineup and the Rift image, after the critical art (as the other projections)
  const matchup = useMemo<MatchupMedia | null>(() => (matchupShown ? {
    blue: MATCHUP_LINEUP.blue.map((n) => getChampionIcon(manifest, n)),
    red: MATCHUP_LINEUP.red.map((n) => getChampionIcon(manifest, n)),
    rift: RIFT_CENTRE_ART,
  } : null), [matchupShown, manifest]);
  // Leaguecraft's mystery portrait: the manifest's square Lux icon, on the same schedule
  const mystery = useMemo(
    () => (mysteryShown ? getChampionIcon(manifest, MYSTERY_CHAMPION) : null),
    [mysteryShown, manifest],
  );
  useEffect(() => {
    if (deferredShown) return;
    const urls = [
      ...(engaged.has("leaguecraft") ? [mystery] : []),
      ...(engaged.has("pro-play") && matchup ? [...matchup.blue, ...matchup.red, matchup.rift] : []),
    ];
    for (const url of urls) if (url) void prepareImage(url, { priority: "high" });
  }, [deferredShown, engaged, mystery, matchup]);

  /* ---------------- the orbit engine ---------------- */
  const mode = fullLayout ? "orbit" : "composed";
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookEls = useRef<Record<BookId, HTMLElement | null>>({ leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null });
  const tetherEls = useRef<Record<BookId, SVGPathElement | null>>({ leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null });
  const needleEl = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<OrreryEngine | null>(null);

  // Only the crystal's preview brings a book out of the orbit to rest beside the lens;
  // the arrow selector's book is brought forward BY the orbit and stays in it.
  const front: BookId | null = keyboardFocus !== "idle"
    ? keyboardFocus
    : pointerFocus === "idle" && pinned !== "idle" && pinSource === "crystal" ? pinned : null;
  const targets = useMemo(() => ({
    emphasis: focus === "idle" ? null : focus,
    front,
    calm: pointerFocus !== "idle" ? CALM.pointer : keyboardFocus !== "idle" ? CALM.keyboard : pinned !== "idle" ? CALM.pinned : CALM.free,
    activating: activating && activating !== "idle" ? activating : null,
  }), [focus, front, pointerFocus, keyboardFocus, pinned, activating]);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const [onScreen, setOnScreen] = useState(true);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const hero = heroRef.current;
    if (!stage || !hero) return;
    const animate = !reduced && mode === "orbit";
    const engine = new OrreryEngine(
      {
        books: bookEls.current,
        tethers: tetherEls.current,
        needle: needleEl.current,
        host: stage,
        parallax: animate ? Array.from(hero.querySelectorAll<HTMLElement>("[data-parallax]")) : [],
        tempo: animate ? Array.from(hero.querySelectorAll<HTMLElement>(".o35-comet, .o35-gyro-ring, .o35-ring")) : [],
      },
      {
        mode,
        animate,
        onDegrade: readQualityChoice() === "full" ? undefined : () => setQuality("lite"),
      },
    );
    engineRef.current = engine;
    const r = stage.getBoundingClientRect();
    engine.resize(r.width, r.height);
    engine.setTargets(targetsRef.current);
    engine.start();
    stage.dataset.ready = "true";

    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(([entry]) => engine.resize(entry.contentRect.width, entry.contentRect.height))
      : null;
    ro?.observe(stage);
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
        setOnScreen(entry.isIntersecting);
        engine.setVisible(entry.isIntersecting && !document.hidden);
      }, { threshold: 0.02 })
      : null;
    io?.observe(stage);
    const onVisibility = () => engine.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
    const onMove = (e: PointerEvent) =>
      engine.setPointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
    if (animate && finePointer) window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      engine.stop();
      engineRef.current = null;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      delete stage.dataset.ready;
    };
  }, [mode, reduced]);

  useEffect(() => { engineRef.current?.setTargets(targets); }, [targets]);
  // each room sets the Core's tempo: Measure races, Strata is slow and deliberate
  useEffect(() => { engineRef.current?.setTempo(TEMPO[focus] ?? 1); }, [focus, mode, reduced]);

  /* ---------------- direct manipulation: drag the orbit ---------------- */
  // Only from empty space (never from a book, link or the crystal), so every
  // click contract is untouched; the orbit follows the pointer, a fling keeps
  // its momentum, and the books settle on the nearest symmetric composition.
  const drag = useRef<{ id: number; x: number; t: number } | null>(null);
  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "orbit" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as Element).closest("a,button,.o35-slot")) return;
    // an intentional press on open space lets go of the arrow selector's hold
    engineRef.current?.releaseSelection();
    nav.clearSelection();
    if (reduced) return;
    drag.current = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.dataset.dragging = "true";
    nav.cancelRelease();
    engineRef.current?.grab();
  };
  const onStageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dt = Math.max(0.001, (e.timeStamp - d.t) / 1000);
    engineRef.current?.dragBy(e.clientX - d.x, dt);
    d.x = e.clientX;
    d.t = e.timeStamp;
  };
  const onStageUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    delete e.currentTarget.dataset.dragging;
    engineRef.current?.release();
  };
  // Arrow keys step through the books (a roving aid on top of Tab; never on other controls).
  const onBooksKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    links[(i + dir + links.length) % links.length].focus();
  };

  const ambient = onScreen && !reduced;

  /* ---------------- presentation ---------------- */
  const focused = destinationById(focus);
  const mogzyLine = focused ? focused.preview : IDLE_LINE;
  const previewLabel = focused ? `Previewing ${focused.title}` : "No room previewed";
  const stageSize = fullLayout ? STAGE : STAGE_COMPOSED;
  const anyFocus = focus !== "idle";

  /* ---------------- the arrow selector ---------------- */
  // Desktop: each press turns the whole orbit one book (the engine plans the turn
  // and holds the book at the front). Phones do not orbit: the arrows step the
  // preview around the composed ring (right = clockwise) and the chosen book is lit.
  const onArrow = (dir: 1 | -1) => {
    let id: BookId | null = null;
    if (mode === "orbit") {
      id = engineRef.current?.steer(dir) ?? null;
    } else {
      const i = COMPOSED_RING.indexOf(pinned as BookId);
      id = i < 0 ? (dir > 0 ? COMPOSED_RING[0] : COMPOSED_RING[COMPOSED_RING.length - 1]) : COMPOSED_RING[(i + dir + COMPOSED_RING.length) % COMPOSED_RING.length];
    }
    if (!id) return;
    nav.select(id);
    const d = destinationById(id);
    if (d) prefetchRoute(d.to, { intent: true });
  };
  // The crystal keeps its own preview cycle; using it lets go of an arrow hold first.
  const onCrystal = () => {
    engineRef.current?.releaseSelection();
    nav.cycle();
  };

  const selector = (
    <div className="o35-selector" role="group" aria-label="Turn the orbit" data-testid="academy-core-selector">
      <button type="button" className="o35-arrow" aria-label="Previous book" data-testid="academy-core-arrow-left" onClick={() => onArrow(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
      </button>
      <button type="button" className="o35-arrow" aria-label="Next book" data-testid="academy-core-arrow-right" onClick={() => onArrow(1)}>
        <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
      </button>
    </div>
  );

  const crystalButton = (
    <div className="acore-crystal-hit acore-crystal-hit-compact o35-crystal-hit">
      <button
        type="button"
        className="acore-crystal-button"
        data-testid="academy-core-crystal"
        aria-label="Cycle the room preview in the crystal"
        aria-describedby="acore-preview-readout"
        onClick={onCrystal}
        onPointerEnter={nav.cancelRelease}
      >
        <span className="sr-only">{previewLabel}</span>
      </button>
    </div>
  );

  const renderBook = (d: CoreDestination) => {
    const lev = LEVITATION[d.id];
    return (
      <div
        key={d.id}
        className="o35-book"
        data-bay={d.id}
        ref={(el) => { bookEls.current[d.id] = el; }}
      >
        <div
          className="o35-lev"
          data-active={focus === d.id ? "true" : "false"}
          style={{
            ["--lev-dur" as string]: `${lev.dur}s`,
            ["--lev-delay" as string]: `${lev.delay}s`,
            ["--lev-amp" as string]: String(lev.amp),
            ["--sway" as string]: `${lev.sway}deg`,
            ["--sway-dur" as string]: `${lev.swayDur}s`,
          }}
        >
          <div className="o35-underglow" aria-hidden />
          <div className="o35-pagelight" aria-hidden />
          <div
            className="o35-slot"
            data-bay={d.id}
            data-active={focus === d.id ? "true" : "false"}
            data-activating={activating === d.id ? "true" : "false"}
            data-support={anyFocus && focus !== d.id ? "true" : "false"}
            data-testid={`academy-core-slot-${d.id}`}
            {...nav.bookHandlers(d)}
          >
            <AcademyHubBook
              to={d.to}
              title={d.title}
              coverTitle={d.coverTitle}
              splashUrl={splashes[d.id] ?? null}
              splashPosition={d.splashPosition}
              describedBy={coreBayDescriptionId(d.id)}
              onClick={(e) => nav.onBookClick(d, e)}
            />
          </div>
        </div>
      </div>
    );
  };

  const shortcuts = (
    <div className="acore-shortcuts o35-shortcuts" data-testid="academy-core-shortcuts">
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
    </div>
  );

  const secondScreen = (
    <nav className="acore-second-screen o35-second-screen" aria-label="Academy rooms beyond the Core">
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

  const orbit = DESKTOP_ORBIT;
  const orbitPaths = fullLayout ? (
    <>
      <svg className="o35-orbit-path o35-orbit-path-back" viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} aria-hidden focusable="false">
        <path d={`M ${orbit.cx - orbit.rx},${orbit.cy} A ${orbit.rx} ${orbit.ry} 0 0 1 ${orbit.cx + orbit.rx},${orbit.cy}`} />
      </svg>
      <svg className="o35-orbit-path o35-orbit-path-front" viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} aria-hidden focusable="false">
        <path d={`M ${orbit.cx - orbit.rx},${orbit.cy} A ${orbit.rx} ${orbit.ry} 0 0 0 ${orbit.cx + orbit.rx},${orbit.cy}`} />
      </svg>
      <div className="o35-orbit-plane" aria-hidden />
    </>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="acore-root o35-root"
      data-startup={startup.mark}
      data-layout={fullLayout ? "full" : "stacked"}
      data-ambient={ambient ? "on" : "off"}
      data-reduced={reduced ? "true" : "false"}
      data-quality={quality}
      data-testid="academy-core-v35"
    >
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

      <section ref={heroRef} className="o35-hero" aria-labelledby="acore-title">
        <OrreryEnvironment composed={!fullLayout} />

        {/* ---------------- brand, Daily, the floating Patch Report ---------------- */}
        <div className="o35-island">
          <header className="o35-brand">
            <p className="acore-eyebrow">Mogzy&rsquo;s Hextech Workshop</p>
            <h1 id="acore-title" className="o35-title">Mogzy Academy</h1>
          </header>
          {shortcuts}
          {fullLayout && (
            <div className="o35-patch" data-testid="academy-core-book">
              <div className="o35-patch-halo" aria-hidden />
              <div className="o35-patch-rune" aria-hidden />
              <div className="o35-patch-shadow" aria-hidden />
              <div className="o35-patch-float">
                <AcademyBroadcastCenterpiece feed={broadcastFeed} className="o35-patch-centerpiece" />
              </div>
              <span className="o35-spark o35-spark-1" aria-hidden /><span className="o35-spark o35-spark-2" aria-hidden />
              <span className="o35-spark o35-spark-3" aria-hidden /><span className="o35-spark o35-spark-4" aria-hidden />
            </div>
          )}
          {fullLayout && secondScreen}
        </div>

        {/* ---------------- the orrery ---------------- */}
        <div
          ref={stageRef}
          className="o35-stage"
          data-mode={mode}
          data-focus={focus}
          data-intent={pointerFocus !== "idle" || keyboardFocus !== "idle" ? "book" : "preview"}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
          data-activating={activating ?? ""}
          data-testid="academy-core-stage"
        >
          <div className="o35-scene" style={{ ["--w" as string]: stageSize.width, ["--h" as string]: stageSize.height }}>
            {orbitPaths}
            <svg className="o35-tethers" viewBox={`0 0 ${stageSize.width} ${stageSize.height}`} aria-hidden focusable="false">
              {BOOK_ORDER.map((id) => (
                <path
                  key={id}
                  ref={(el) => { tetherEls.current[id] = el; }}
                  className="o35-tether"
                  data-bay={id}
                  data-on={focus === id ? "true" : "false"}
                  pathLength={100}
                />
              ))}
            </svg>

            <nav className="o35-books" aria-label="Academy rooms" onKeyDown={onBooksKey}>
              {CORE_DESTINATIONS.map((d) => renderBook(d))}
            </nav>

            <OrreryCore focus={focus} activating={activating} ambient={ambient} media={media} matchup={matchup} mystery={mystery} ref={needleEl}>
              {crystalButton}
            </OrreryCore>

            <p id="acore-preview-readout" className="sr-only" data-testid="academy-core-preview" aria-live="polite">
              {previewLabel}
            </p>

            {fullLayout && selector}

            <div className="o35-mogzy">
              <MogzyOperator
                focus={focus}
                line={mogzyLine}
                ambient={ambient}
                reduced={reduced}
                facing="left"
                reactionsReady={reactionsShown}
              />
            </div>
          </div>
        </div>

        {!fullLayout && selector}

        {!fullLayout && (
          <div className="o35-island-mobile">
            <div className="o35-patch o35-patch-mobile" data-testid="academy-core-book-mobile">
              <div className="o35-patch-halo" aria-hidden />
              <div className="o35-patch-shadow" aria-hidden />
              <div className="o35-patch-float">
                <AcademyBroadcastCenterpiece variant="mobile" feed={broadcastFeed} />
              </div>
            </div>
            {secondScreen}
          </div>
        )}
      </section>
    </div>
  );
}
