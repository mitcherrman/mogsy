/**
 * ACADEMY STARTUP RC2 — the veil above the router.
 *
 * Mounted in `AppRouterRoot`, beside the radio controller, so it outlives the
 * Landing → /lol route change (the Landing's own veil unmounts at navigate).
 * It paints whatever `veil-store` says is held:
 *
 *   entrance  the Landing veil at its peak — the same gradient over the same
 *             navy, so the hand-over is pixel-identical — which, if the hold
 *             runs past ~0.3 s, eases into a calmer gold-on-navy glow with a
 *             slow breath (owner decision 2026-10-18; opacity/transform only,
 *             no blur, so it costs the compositor nothing it would not spend
 *             anyway);
 *   direct    the flat /lol startup surface (today's first paint on a direct
 *             visit), held until the Orrery is ready, then crossfaded.
 *
 * Never fully opaque (alpha 0.985): a fully covered page is not rasterised
 * until it is revealed, which measured as a 100 ms hitch at the reveal.
 * Pointer events are blocked while held, so nothing under it is clicked
 * blind; it is aria-hidden, and the page beneath stays in the accessibility
 * tree and the DOM (crawlers read the real /lol).
 *
 * Direct visits: on the first render at /lol (no hash redirect) it takes the
 * hold and starts the Orrery's warm at boot — chunk, settings, manifest, art,
 * Patch feed — instead of after the page has mounted (ACADEMY STARTUP S6).
 *
 * Leaving /lol while held (Back, a link, the #academy-commons redirect) drops
 * the veil at once.
 */
import { useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { QueryClientContext } from "@tanstack/react-query";

import { prefetchAppSettings } from "@/hooks/useAppSettings";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import {
  cancelAcademyVeil,
  claimAcademyBootCheck,
  getAcademyStartup,
  holdAcademyVeil,
  subscribeAcademyStartup,
} from "@/lib/academy-startup/veil-store";
import { prefetchRoute } from "@/lib/route-prefetch";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { baseBackgroundForPath } from "@/lib/startup-shell";
import { ENTRANCE_VEIL_GRADIENT } from "@/lib/academy-startup/veil-gradient";
import "./academy-veil.css";

export default function AcademyVeil() {
  const s = useSyncExternalStore(subscribeAcademyStartup, getAcademyStartup, getAcademyStartup);
  const { pathname, hash } = useLocation();
  // The app's query client when there is one (tests may render the root without a provider).
  const queryClient = useContext(QueryClientContext) ?? null;
  const reduced = useReducedMotionPreference();
  const seenHome = useRef(false);

  // A direct visit: decided once per page load, before the first paint.
  useLayoutEffect(() => {
    if (!claimAcademyBootCheck()) return;
    if (pathname !== LEAGUE_HOME_ROUTE || hash) return;
    holdAcademyVeil("direct");
    prefetchRoute(LEAGUE_HOME_ROUTE, { intent: true });
    prefetchAppSettings();
    // Imported on demand: this component is in every page's entry chunk, the
    // warm (and the Patch feed it fills) belongs to the Academy's.
    void import("@/pages/academy-core/academy-core-warm")
      .then((m) => m.warmAcademyCore(queryClient))
      .catch(() => undefined);
  }, [pathname, hash, queryClient]);

  // Leaving the Academy home while held drops the veil. Only after the hold
  // has SEEN /lol: the entrance (the root, or its /dev preview) takes it a
  // moment before its navigate(). A hold that never reaches /lol ends at its cap.
  useLayoutEffect(() => {
    const held = s.phase === "held" || s.phase === "revealing";
    if (!held) { seenHome.current = false; return; }
    if (pathname === LEAGUE_HOME_ROUTE && !hash) { seenHome.current = true; return; }
    if (seenHome.current) cancelAcademyVeil();
  }, [s.phase, pathname, hash]);

  if (s.phase !== "held" && s.phase !== "revealing") return null;
  return (
    <div
      className="academy-veil"
      data-testid="academy-veil"
      data-source={s.source ?? undefined}
      data-phase={s.phase}
      data-reduced={reduced ? "true" : "false"}
      aria-hidden="true"
      style={{ background: s.source === "direct" ? baseBackgroundForPath(LEAGUE_HOME_ROUTE) : undefined }}
    >
      {s.source === "entrance" && (
        <>
          <div className="academy-veil-flash" style={{ ["--veil-flash" as string]: ENTRANCE_VEIL_GRADIENT }} />
          <div className="academy-veil-calm" />
        </>
      )}
    </div>
  );
}
