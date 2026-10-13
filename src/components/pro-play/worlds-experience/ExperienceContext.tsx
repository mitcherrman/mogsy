/**
 * The Worlds experience's navigation state (UX1): where the reader is (from
 * the URL, via `navigation.ts`), which way the last move went, and the
 * actions that move them. Every move is a router navigation, so the browser's
 * back / forward and a pasted link go through exactly the same path.
 *
 * HISTORY RULES
 * - A screen or stage change is a new history entry (back returns to it).
 * - Opening the match detail is a new entry, so back (or the phone's back
 *   gesture) closes it; switching between matches while it is open replaces
 *   that entry, and closing pops it — the detail never piles up history.
 * - A Swiss round choice replaces the entry: it is a view setting, not a place.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import type { TournamentContextV2, TournamentStateV2 } from "@/lib/pro-play/tournamentApi";
import { defaultStageKey } from "@/lib/pro-play/worldsExperience/experienceView";
import {
  buildHref,
  navDirection,
  parseLocation,
  stageKeyFromSlug,
  type Direction,
  type ExperienceLocation,
  type NavPosition,
  type Target,
} from "@/lib/pro-play/worldsExperience/navigation";

/** Desktop = the side-panel workspace; below it, the stacked phone layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

export function useMediaQuery(query: string) {
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return matches;
}

interface PanelState {
  ux1Panel?: boolean;
}

export interface Experience {
  base: string;
  loc: ExperienceLocation;
  /** The resolved stage on the Stages screen (the path's, else the default). */
  stageKey: string | null;
  stageKeys: string[];
  move: { level: "screen" | "stage" | "none"; dir: Direction };
  desktop: boolean;
  reduced: boolean;
  hrefFor: (target: Target) => string;
  go: (target: Target) => void;
  /** Select a match for the detail (toggles off when it is already selected). */
  selectMatch: (matchId: string | null) => void;
  selectRound: (round: number) => void;
}

const ExperienceCtx = createContext<Experience | null>(null);

export function useExperience(): Experience {
  const x = useContext(ExperienceCtx);
  if (!x) throw new Error("useExperience outside ExperienceProvider");
  return x;
}

export function ExperienceProvider({ base, ctx, state, desktop: forcedDesktop, children }: {
  base: string;
  ctx: Pick<TournamentContextV2, "stages">;
  state: Pick<TournamentStateV2, "phase" | "phase_detail">;
  /** Tests pin the layout; the page reads the viewport. */
  desktop?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const measured = useMediaQuery(DESKTOP_QUERY);
  const desktop = forcedDesktop ?? measured;
  const reduced = useReducedMotion() === true;
  const stageKeys = useMemo(() => ctx.stages.map((s) => s.key), [ctx.stages]);

  const loc = useMemo(() => parseLocation(base, location.pathname, location.search), [base, location.pathname, location.search]);
  const pathStage = stageKeyFromSlug(loc.stageSlug ?? undefined, stageKeys);
  const fallbackStage = defaultStageKey(state, ctx);
  const stageKey = loc.screen === "stages" ? (pathStage ?? fallbackStage) : null;

  // Direction of the move that produced this entry, read against the last one.
  const pos: NavPosition = { screen: loc.screen, stageKey };
  const last = useRef<{ key: string; pos: NavPosition; move: Experience["move"] } | null>(null);
  if (!last.current || last.current.key !== location.key) {
    last.current = { key: location.key, pos, move: navDirection(last.current?.pos ?? null, pos, stageKeys) };
  }
  const move = last.current.move;

  // A path this build has no screen for, or a stage the event does not have,
  // is corrected in place (replace), never left half-drawn.
  useEffect(() => {
    if (loc.unresolved) navigate(buildHref(base, { screen: "overview" }, location.search), { replace: true });
    else if (loc.screen === "stages" && loc.stageSlug && !pathStage && fallbackStage) {
      navigate(buildHref(base, { screen: "stages", stageKey: fallbackStage, matchId: loc.matchId, round: loc.round }, location.search), { replace: true });
    }
  }, [loc, pathStage, fallbackStage, base, location.search, navigate]);

  const hrefFor = useCallback((target: Target) => buildHref(base, target, location.search), [base, location.search]);

  const go = useCallback(
    (target: Target) => {
      const href = buildHref(base, target, location.search);
      // Opening a match from elsewhere (the Overview's "View in bracket") is
      // the same history entry as opening it in place.
      navigate(href, target.matchId ? { state: { ux1Panel: true } satisfies PanelState } : undefined);
    },
    [base, location.search, navigate],
  );

  const selectMatch = useCallback(
    (matchId: string | null) => {
      const open = loc.matchId;
      const target = (id: string | null) => buildHref(base, { screen: "stages", stageKey, matchId: id, round: loc.round }, location.search);
      if (!matchId || matchId === open) {
        if (!open) return;
        if ((location.state as PanelState | null)?.ux1Panel) navigate(-1);
        else navigate(target(null), { replace: true });
        return;
      }
      if (open) navigate(target(matchId), { replace: true, state: location.state });
      else navigate(target(matchId), { state: { ux1Panel: true } satisfies PanelState });
    },
    [loc.matchId, loc.round, base, stageKey, location.search, location.state, navigate],
  );

  const selectRound = useCallback(
    (round: number) => {
      navigate(buildHref(base, { screen: "stages", stageKey, matchId: loc.matchId, round }, location.search), {
        replace: true,
        state: location.state,
      });
    },
    [base, stageKey, loc.matchId, location.search, location.state, navigate],
  );

  const value = useMemo<Experience>(
    () => ({ base, loc, stageKey, stageKeys, move, desktop, reduced, hrefFor, go, selectMatch, selectRound }),
    [base, loc, stageKey, stageKeys, move, desktop, reduced, hrefFor, go, selectMatch, selectRound],
  );
  return <ExperienceCtx.Provider value={value}>{children}</ExperienceCtx.Provider>;
}
