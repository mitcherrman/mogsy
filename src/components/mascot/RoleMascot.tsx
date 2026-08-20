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
 * `facing` is a statement about the CHARACTER, not about the image: it says
 * which way this mascot is looking, and the component works out whether that
 * needs a mirror. The five plates were not drawn to one convention — four lead
 * with their weapon on the viewer's right, `mid` leads with its staff on the
 * left (see `MOGZY_ROLE_ART_FACING`) — so "untouched" and "facing right" are
 * not the same thing, and assuming they were pointed a Mid duelist out of the
 * arena on BOTH columns.
 *
 * `attack` lunges FORWARD and `hit` recoils BACKWARD in the mascot's own
 * terms, and the mirror on the ancestor facing layer turns those into screen
 * directions. So the plate correction lands on the actions for free: a mascot
 * that faces the arena centre also lunges toward it, whichever way its art was
 * drawn. A host never says "the left player moves right" — it says which way
 * its mascot faces, once.
 *
 * THE CLICK REACTION IS THE COMPONENT'S, NOT A HOST'S (AI1 Phase 2B)
 * ─────────────────────────────────────────────────────────────────
 * `interactive` turns on a playful local reaction — squash, hop, stretch,
 * settle — when the mascot is clicked or tapped. It is deliberately NOT in
 * `RoleMascotAction`: a host cannot request it, cannot retime it, and gets no
 * callback for it, so there is nothing for a surface to hang navigation, a
 * route change or a network write on. Every mascot everywhere in Mogzy reacts
 * the same way for free.
 *
 * COMBAT BEATS COSMETICS
 * ──────────────────────
 * Exactly one rule, in one place (`playInternal`): a click is DROPPED while an
 * `attack` or a `hit` is on screen, and an `attack` or a `hit` arriving during
 * a click reaction INTERRUPTS it. Combat is the state change the player has to
 * read; the reaction is a toy. Because every keyframe set starts and ends at
 * the identity transform, the interruption is a continuous snap back to rest.
 */
import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { getRankedRoleArtFacing, getRankedRoleMascotPath } from "./mascot-assets";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";

/** Which way the mascot is turned. `right` is the untouched artwork. */
export type RoleMascotFacing = "left" | "right";

/**
 * A transient motion the mascot performs. Deliberately a small closed set of
 * INTENTS, not a motion vocabulary: adding "what a hit looks like" is a change
 * to this file, never to a host.
 */
export type RoleMascotAction = "attack" | "hit";

/**
 * Everything the action layer can play, including the one motion no host can
 * ask for. `react` is the local click reaction: internal by construction, so
 * the closed public set above stays the whole of a host's vocabulary.
 */
type PlayableAction = RoleMascotAction | "react";

/** The CSS class that carries each action's keyframes (see index.css). */
const ACTION_CLASS: Record<PlayableAction, string> = {
  attack: "role-mascot-attack",
  hit: "role-mascot-hit",
  react: "role-mascot-react",
};

const ALL_ACTION_CLASSES = Object.values(ACTION_CLASS);

/** Combat outranks the click reaction; see COMBAT BEATS COSMETICS above. */
const COMBAT_ACTIONS: readonly string[] = ["attack", "hit"];

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
   * Which way the mascot is turned — a fact about the CHARACTER, not about the
   * image file. Defaults to `right`. This is the ONLY direction input: the
   * mirror, and both actions' forward/backward, are derived from it.
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
  /**
   * Turn on the local click/tap reaction (AI1 Phase 2B).
   *
   * Presentation only, and deliberately callback-free: there is no `onClick`
   * to hand a host, so a mascot reaction can never become a navigation, a
   * selection or a request. Off by default, so every existing mount is
   * byte-identical.
   */
  interactive?: boolean;
  /**
   * How the artwork sits in the host's box — the same "host owns layout"
   * contract as `className`, never a motion knob.
   *
   * `contain` (default) letterboxes the whole 2:3 plate. `cover` fills the box
   * and crops the plate's empty head/foot room, which is what lets a mascot
   * read as a CHARACTER at panel scale instead of a small figure adrift in a
   * tall frame. Cropping is vertical only: the source is taller than every
   * box a host gives it, so no part of the character is ever cut off the side.
   */
  fit?: "contain" | "cover";
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
  interactive = false,
  fit = "contain",
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
  // Which playback currently OWNS the layer. Bumped once per start; only the
  // holder is allowed to put the layer back at rest. See `settle`.
  const playRef = useRef(0);

  /** Put the layer back at rest: no action class, no `data-playing`, and —
   *  because no keyframe set carries a fill mode — no transform either. */
  const settle = useCallback(() => {
    const el = actionRef.current;
    if (!el) return;
    el.classList.remove(...ALL_ACTION_CLASSES);
    delete el.dataset.playing;
  }, []);

  /**
   * The ONE place an animation starts. Every caller — the combat effect below
   * and the click handler — goes through here, so the retrigger technique and
   * the priority rule each exist exactly once.
   *
   * Retrigger by hand: re-adding an animation class that is already present is
   * a no-op, so a second event during the first animation would be swallowed.
   * Drop every action class, force a style recalculation so the removal is
   * committed, then add the one we want — the keyframes restart from 0%. Every
   * keyframe set starts AND ends at the identity transform and carries no fill
   * mode, so restarting mid-flight (attack -> hit, or combat over a reaction)
   * is a continuous snap back to rest, never a visible jump, and nothing can be
   * left stuck in a transform.
   */
  const playInternal = useCallback((next: PlayableAction) => {
    const el = actionRef.current;
    if (!el) return;
    const playing = el.dataset.playing;
    // COMBAT BEATS COSMETICS. A click is dropped outright while an attack or a
    // hit is on screen; combat itself always interrupts whatever is playing,
    // including another combat action.
    if (next === "react" && playing !== undefined && COMBAT_ACTIONS.includes(playing)) return;
    el.classList.remove(...ALL_ACTION_CLASSES);
    void el.offsetWidth;
    el.classList.add(ACTION_CLASS[next]);
    el.dataset.playing = next;

    // Take ownership of the layer, and hand the cleanup to THIS playback's own
    // completion rather than to an event that cannot say which playback it
    // belongs to.
    //
    // This is load-bearing, not tidiness. Dropping the class cancels the
    // running animation, but the browser dispatches that `animationcancel` a
    // FRAME LATER — by which time the replacement is already running on the
    // same element. A listener that clears on cancel therefore wipes out the
    // animation that replaced it, about one frame in. Measured in Chrome: an
    // attack retriggered 90ms into a previous attack was cancelled at 95ms and
    // left the mascot at rest, so the second of two quick events silently did
    // nothing at all. Rounds settle ~1.5s apart so Ranked never saw it; a
    // double-click is exactly the case that does.
    //
    // The token fixes it: a superseded playback's `finished` rejects (cancel)
    // or resolves late, finds a newer token, and stays out of the way.
    const token = ++playRef.current;
    const running = el.getAnimations?.()[0];
    if (running) {
      running.finished.then(
        () => { if (playRef.current === token) settle(); },
        () => { /* cancelled — whatever replaced it owns the layer now */ },
      );
    }
  }, [settle]);

  useEffect(() => {
    if (actionRef.current === null) return;
    if (actionId === null || action === null) return;
    if (actionId === playedRef.current) return;
    playedRef.current = actionId;

    // Respect the motion setting at the SOURCE. The stylesheet also neutralises
    // these keyframes, but not adding the class keeps the DOM honest for tests
    // and for anything that reads `data-playing` later.
    if (prefersReducedMotion()) return;

    playInternal(action);
  }, [action, actionId, playInternal]);

  /**
   * The click reaction. Purely local: it starts an animation and does nothing
   * else — no state, no callback, no navigation, no request. `preventDefault`
   * keeps a tap from becoming a synthesised click on anything beneath, and the
   * mascot stays a plain <span> rather than adding an unlabelled cosmetic
   * control to the page's tab order (the AI1 Phase 1 precedent for Mogzy).
   *
   * Under reduced motion there is no reaction at all: unlike `attack` and
   * `hit`, which are state changes a player needs to read, this one carries no
   * information and is simply dropped.
   */
  const onMascotClick = useCallback((e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (prefersReducedMotion()) return;
    playInternal("react");
  }, [playInternal]);

  // Self-clearing, the belt to the token's braces.
  //
  // Where the Web Animations API exists, `playInternal`'s `finished` handler is
  // the authority — it is the only thing that knows WHICH playback ended — so
  // this listener stands down whenever the layer still has an animation on it.
  // That single guard is what stops a superseded `animationcancel` from wiping
  // out the animation that replaced it. Where the API does NOT exist (jsdom,
  // and anything that fires the event without giving us a handle), this is the
  // whole mechanism, unchanged from Phase 2.
  useEffect(() => {
    const el = actionRef.current;
    if (!el) return;
    const onEnd = () => {
      if (typeof el.getAnimations === "function" && el.getAnimations().length > 0) return;
      settle();
    };
    el.addEventListener("animationend", onEnd);
    el.addEventListener("animationcancel", onEnd);
    return () => {
      el.removeEventListener("animationend", onEnd);
      el.removeEventListener("animationcancel", onEnd);
    };
  }, [settle]);

  const decorative = alt === undefined;
  // Does this plate have to be flipped to LOOK the way the host asked? A fact
  // about the artwork, resolved in exactly one place.
  const plateFlipped = facing !== getRankedRoleArtFacing(role);

  return (
    // Host layer: layout, size, position. Carries NO transform of its own, so
    // a host is free to position with translate/margin without fighting idle.
    <span
      data-testid={testId}
      data-role={role}
      data-facing={facing}
      // The semantic facing is above; this is whether the PLATE had to be
      // flipped to achieve it. Two mascots facing the same way can disagree
      // here, and that is the point — it is a property of the art, not of the
      // column.
      data-plate-flipped={plateFlipped ? "true" : undefined}
      data-interactive={interactive ? "true" : undefined}
      // No role, no tabIndex, no href, no form: an interactive mascot is a
      // decorative surface that wiggles, not a control. Nothing here can
      // navigate or submit, so there is nothing to announce or focus.
      className={`role-mascot ${interactive ? "role-mascot-interactive" : ""} ${className ?? ""}`
        .replace(/\s+/g, " ").trim()}
      style={style}
      onClick={interactive ? onMascotClick : undefined}
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
          // PURELY SEMANTIC. This layer is what makes "forward" a screen
          // direction for the action keyframes below it, so it must follow the
          // facing the host asked for and NOTHING else. Correcting the art's
          // own direction here would drag the lunge along with it and send a
          // Mid duelist charging away from the arena.
          style={{ "--role-mascot-facing": facing === "left" ? -1 : 1 } as CSSProperties}
        >
          {/* Action layer — transient keyframes only; at rest it holds no
              transform at all. */}
          <span ref={actionRef} className="role-mascot-action" data-testid={`${testId}-action`}>
            {/* Plate layer — the art's OWN direction, reconciled once, here.
                Static: it never animates and never transitions. It sits BELOW
                the action layer on purpose, so flipping a plate changes which
                way the character looks without touching which way it lunges;
                those two were the same layer for one revision and a Mid
                duelist lunged backwards for it. */}
            <span
              className="role-mascot-plate"
              data-testid={`${testId}-plate`}
              style={{ "--role-mascot-plate": plateFlipped ? -1 : 1 } as CSSProperties}
            >
            <img
              src={getRankedRoleMascotPath(role)}
              alt={decorative ? "" : alt}
              aria-hidden={decorative ? true : undefined}
              draggable={false}
              loading={loading}
              decoding="async"
              className={`block h-full w-full select-none ${
                fit === "cover" ? "object-cover [object-position:50%_50%]" : "object-contain"
              } ${imageClassName ?? ""}`.trim()}
              data-mogzy-art-category="role"
              data-mogzy-art-name={role}
            />
            </span>
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
