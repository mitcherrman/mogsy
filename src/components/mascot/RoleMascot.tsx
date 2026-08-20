/**
 * AI1 Phase 2 — the reusable Ranked ROLE mascot.
 *
 * One component that owns everything about how a role mascot LOOKS and MOVES:
 * which art a role resolves to, the idle float, which way it faces, and what
 * an `attack` or a `hit` is. A host names an intent and a layout; it never
 * names a distance, a duration, an easing curve or a keyframe.
 *
 *   <RoleMascot role="jungle" facing="right" action="attack" actionId={n} />
 *
 * NO SURFACE COUPLING
 * ───────────────────
 * Nothing here imports from `@/pages/quiz-ranked`, from the arena, or from any
 * Ranked hook, client or damage model. The only imports are the canonical role
 * vocabulary (`roles.ts`) and the canonical art registry (`mascot-assets.ts`),
 * both of which already sit below every surface. Ranked is simply the first
 * consumer; a role picker, a profile, match history or a tutorial can mount
 * this the same way without extracting the motion again.
 *
 * ART HONESTY (inherited from LC1)
 * ────────────────────────────────
 * The art is PRESENTATION ONLY and is `aria-hidden` by default: a role is
 * never communicated by picture or silhouette alone, so every host must still
 * render the role's label from `RANKED_ROLE_LABELS`. Callers that genuinely
 * need the image announced can pass an explicit `alt`.
 *
 * FORWARD IS DERIVED, NEVER PASSED
 * ────────────────────────────────
 * The base artwork is drawn front-on with the weapon/shield held on the
 * viewer's RIGHT, so the untouched image already reads as facing right;
 * `facing="left"` is the mirror. `attack` lunges FORWARD and `hit` recoils
 * BACKWARD in the mascot's own terms, and the mirror on the ancestor facing
 * layer turns those into screen directions. A host therefore never says "the
 * left player moves right" — it says which way its mascot faces, once.
 */
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { getRankedRoleMascotPath } from "./mascot-assets";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";

/** Which way the mascot is turned. `right` is the untouched artwork. */
export type RoleMascotFacing = "left" | "right";

/**
 * A transient motion the mascot performs. Deliberately a small closed set of
 * INTENTS, not a motion vocabulary: adding "what a hit looks like" is a change
 * to this file, never to a host.
 */
export type RoleMascotAction = "attack" | "hit";

/** The CSS class that carries each action's keyframes (see index.css). */
const ACTION_CLASS: Record<RoleMascotAction, string> = {
  attack: "role-mascot-attack",
  hit: "role-mascot-hit",
};

const ALL_ACTION_CLASSES = Object.values(ACTION_CLASS);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}

export interface RoleMascotProps {
  /** Which of the five canonical League roles to draw. */
  role: RankedRole;
  /**
   * Which way the mascot is turned. Defaults to `right` (the untouched art).
   * This is the ONLY direction input: actions derive forward/backward from it.
   */
  facing?: RoleMascotFacing;
  /**
   * The transient motion to play, or null for pure idle.
   *
   * Paired with `actionId`, which is what actually triggers playback — see
   * that prop. `action` alone never retriggers.
   */
  action?: RoleMascotAction | null;
  /**
   * A value that CHANGES once per event the host wants animated.
   *
   * Playback is edge-triggered on this id rather than on `action`, because two
   * consecutive attacks are the same string: a persistent `action="attack"`
   * would re-render to an identical value and React would correctly do
   * nothing, swallowing the second hit. A monotonically increasing round
   * number, a settlement id, or a counter all work; the component only cares
   * that it differs from the previous one.
   */
  actionId?: string | number | null;
  /** Layout and sizing from the host. Applied to the OUTER box only, so the
   *  host owns placement and the component owns motion. */
  className?: string;
  /** Sizing/positioning styles for the outer box, same contract as className. */
  style?: CSSProperties;
  /**
   * Accessible name for the image. Omit to keep the art decorative
   * (`aria-hidden`), which is the correct default wherever the role label is
   * already on screen — which the LC1 art contract requires everywhere.
   */
  alt?: string;
  /** Image loading strategy; `eager` for art that is above the fold. */
  loading?: "lazy" | "eager";
  /** Extra classes for the <img> itself (object-fit, crop position, opacity). */
  imageClassName?: string;
  /** Test hook for the outer box. */
  "data-testid"?: string;
}

export function RoleMascot({
  role,
  facing = "right",
  action = null,
  actionId = null,
  className,
  style,
  alt,
  loading = "lazy",
  imageClassName,
  "data-testid": testId = "role-mascot",
}: RoleMascotProps) {
  const actionRef = useRef<HTMLSpanElement | null>(null);
  // The id the layer has already played. Seeded on mount from the first
  // render's id so a mascot that mounts mid-match does not fire the last
  // event again as an entrance animation.
  const playedRef = useRef<string | number | null>(actionId);

  useEffect(() => {
    const el = actionRef.current;
    if (!el) return;
    if (actionId === null || action === null) return;
    if (actionId === playedRef.current) return;
    playedRef.current = actionId;

    // Respect the motion setting at the SOURCE. The stylesheet also neutralises
    // these keyframes, but not adding the class keeps the DOM honest for tests
    // and for anything that reads `data-playing` later.
    if (prefersReducedMotion()) return;

    // Retrigger by hand: re-adding an animation class that is already present
    // is a no-op, so a second event during the first animation would be
    // swallowed. Drop every action class, force a style recalculation so the
    // removal is committed, then add the one we want — the keyframes restart
    // from 0%. Both endpoints of both actions are the identity transform, so
    // restarting mid-flight (or switching attack -> hit) is a continuous snap
    // back to rest, never a visible jump, and nothing can be left stuck in a
    // transform.
    el.classList.remove(...ALL_ACTION_CLASSES);
    void el.offsetWidth;
    el.classList.add(ACTION_CLASS[action]);
    el.dataset.playing = action;
  }, [action, actionId]);

  // Self-clearing: the keyframes carry no fill mode, so the element is already
  // at rest when they end. Removing the class just keeps `data-playing`
  // truthful and leaves the layer with no transform of its own.
  useEffect(() => {
    const el = actionRef.current;
    if (!el) return;
    const onEnd = () => {
      el.classList.remove(...ALL_ACTION_CLASSES);
      delete el.dataset.playing;
    };
    el.addEventListener("animationend", onEnd);
    el.addEventListener("animationcancel", onEnd);
    return () => {
      el.removeEventListener("animationend", onEnd);
      el.removeEventListener("animationcancel", onEnd);
    };
  }, []);

  const decorative = alt === undefined;

  return (
    // Host layer: layout, size, position. Carries NO transform of its own, so
    // a host is free to position with translate/margin without fighting idle.
    <span
      data-testid={testId}
      data-role={role}
      data-facing={facing}
      className={`role-mascot ${className ?? ""}`.trim()}
      style={style}
    >
      {/* Idle layer — the only looping motion, and the only layer that runs
          when no action is playing. */}
      <span className="role-mascot-idle">
        {/* Facing layer — one scaleX, so the action keyframes below can stay
            written in plain unmirrored "forward is +X" terms. scaleX
            interpolates through 0, so a facing change reads as turning around
            rather than snapping. */}
        <span
          className="role-mascot-facing"
          style={{ "--role-mascot-facing": facing === "left" ? -1 : 1 } as CSSProperties}
        >
          {/* Action layer — transient keyframes only; at rest it holds no
              transform at all. */}
          <span ref={actionRef} className="role-mascot-action" data-testid={`${testId}-action`}>
            <img
              src={getRankedRoleMascotPath(role)}
              alt={decorative ? "" : alt}
              aria-hidden={decorative ? true : undefined}
              draggable={false}
              loading={loading}
              decoding="async"
              className={`block h-full w-full select-none object-contain ${imageClassName ?? ""}`.trim()}
              data-mogzy-art-category="role"
              data-mogzy-art-name={role}
            />
          </span>
        </span>
      </span>
    </span>
  );
}

/** The default accessible name for a role mascot, for the rare host that wants
 *  the image announced rather than treating it as decorative. */
export function roleMascotDefaultAlt(role: RankedRole): string {
  return `${RANKED_ROLE_LABELS[role]} mascot`;
}
