/**
 * RFX1 Phase 2B1 — Tier 1, started from the lobby.
 *
 * When the queue reports `matched`, the lobby holds its "opponent found" beat
 * for `DEFAULT_HANDOFF_MS` (800 ms) before it navigates. Only the match id is
 * known then — no question, no opponent role — but three things the arena
 * will certainly need are:
 *
 *   * the Ranked route's code (`QuizRankedPage` and what it imports), which
 *     is otherwise fetched only after navigation;
 *   * the arena's persistent chrome (backdrop, vellum, banner);
 *   * the viewer's OWN role mascot — the role they queued as, which is the
 *     role the match froze for them.
 *
 * This starts all three and returns immediately. It adds no delay to the
 * handoff and waits on nothing; the arena's own preparation later joins the
 * same requests (`prepareImage` dedupes by URL). Nothing unrelated to the
 * Ranked arena is warmed.
 *
 * No `preconnect` is added: the lobby has been polling the Ranked queue on the
 * same API origin the whole time it was open, so that connection is warm.
 */
import type { RankedRole } from "@/lib/ranked-public/roles";
import { prepareImage } from "./prepareImage";
import { prepareRankedChrome, rankedRoleMascotUrl } from "./rankedChrome";

let routeWarmed = false;

export function warmRankedEntry(role: RankedRole | null | undefined): void {
  if (typeof window === "undefined") return;
  try { performance.mark("ranked-prep:tier1:start"); } catch { /* measurement only */ }
  if (!routeWarmed) {
    routeWarmed = true;
    // The same specifier `App.tsx` lazily imports, so the module graph (and
    // its chunks) is shared rather than fetched twice.
    void import("@/pages/quiz-ranked/QuizRankedPage").catch(() => { routeWarmed = false; });
  }
  // The backdrop encode this VIEWPORT will paint — the lobby and the arena are
  // the same window, so the warm and the render agree.
  prepareRankedChrome();
  void prepareImage(rankedRoleMascotUrl(role), { priority: "auto" });
}
