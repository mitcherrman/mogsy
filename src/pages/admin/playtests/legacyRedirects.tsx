/**
 * UGMP — the retired lab URLs keep working as bookmarks. They mount nothing:
 * each lands on the canonical place (the Playtests hub, or the mode's own play
 * route, which is behind `AdminRoute` like the hub).
 *
 *   /admin/interaction-labs              → Ranked → Playtests
 *   /admin/interaction-labs/rangefinder  → /admin/playtests/rangefinder
 *   /admin/interaction-labs/word-puzzle  → /admin/playtests/glyph-press
 *   /admin/numeric-lab[?mode=…]          → /admin/playtests/{stat-drop|combat-estimate}
 *   /admin/perfect-timing                → /admin/playtests/perfect-timing (PT4.1)
 */
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { PLAYTESTS_HUB_ROUTE, labModeRoute } from "@/lib/playtests/modes";

export function InteractionLabsRedirect() {
  const { lab } = useParams();
  const to = lab === "rangefinder" ? labModeRoute("rangefinder")
    : lab === "word-puzzle" ? labModeRoute("glyph-press")
    : PLAYTESTS_HUB_ROUTE;
  return <Navigate to={to} replace />;
}

export function PerfectTimingRedirect() {
  return <Navigate to={labModeRoute("perfect-timing")} replace />;
}

export function NumericLabRedirect() {
  const [params] = useSearchParams();
  const to = params.get("mode") === "combat-estimate" ? labModeRoute("combat-estimate") : labModeRoute("stat-drop");
  return <Navigate to={to} replace />;
}
