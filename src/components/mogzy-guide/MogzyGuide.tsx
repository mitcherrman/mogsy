import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";

import {
  GUIDE_BUBBLE_VIEWPORT_MARGIN,
  computeViewportShift,
  facingForTarget,
  leanOffsetExpr,
  resolvePlacement,
} from "./placement";
import { isAnnouncedPriority } from "./priority";
import { useGuideLayout } from "./useGuideLayout";
import type {
  GuideLayout,
  GuideMessage,
  GuidePlacements,
  MogzyMascotPose,
} from "./types";

/**
 * MG-A — the reusable Mogzy Guide: canonical `MogzyMascot` + speech bubble.
 *
 * It renders whatever `message` it is given and nothing else: product state,
 * message choice and persistence live in the surface and `useMogzyGuide`.
 *
 * Motion reuses the Hub guide's existing stack (index.css) — one transform per
 * nested layer so they compose instead of fighting:
 *
 *   root (authored position, no transform)
 *   └ float   .academy-mogzy-float   idle bob
 *     └ lean  .mogzy-lean-glide      glide toward `message.target`
 *       ├ bubble pos → bubble        parchment bubble (rides the lean)
 *       └ facing .mogzy-facing-turn  mirror toward left/right targets
 *         └ react .mogzy-click-react hop (cue / tap)
 *           └ <MogzyMascot>
 *
 * Under reduced motion (OS setting OR the app's `html.reduce-motion`) none of
 * the motion layers are applied; the bubble still appears (no slide) and the
 * text carries all the information.
 *
 * ACCESSIBILITY: the visible bubble is always `aria-hidden`. `contextual` and
 * `first-use` text is announced through ONE persistent polite live region;
 * `hover` and `ambient` text is never announced — a surface exposes hover copy
 * to AT itself (e.g. `aria-describedby` on the hovered control). Mount the
 * guide OUTSIDE any `aria-hidden` subtree if its announced messages matter.
 * The mascot is decorative unless `interactive`, which renders a labelled
 * button (and is the way a `dismissible` message is dismissed by pointer).
 */
export interface MogzyGuideProps {
  /** Same string passed to `useMogzyGuide`. Namespaces test ids. */
  surface: string;
  /** Active message from `useMogzyGuide`, or null for idle (bubble hidden). */
  message: GuideMessage | null;
  placement: GuidePlacements;
  /** Force a layout instead of reading the viewport (tests, storybook-style previews). */
  layout?: GuideLayout;
  /** Rest pose. Default `"base"`. A message's `pose` overrides it while active. */
  pose?: MogzyMascotPose;
  /** Render the mascot as a labelled button (tap → hop + `onActivate`). Default false. */
  interactive?: boolean;
  /** Accessible name for the interactive button. Default "Mogzy, guide". */
  triggerLabel?: string;
  /** Interactive tap. Never navigates by itself. */
  onActivate?: () => void;
  /** Called on Escape / tap when the active message is `dismissible`. Wire to `controller.dismiss`. */
  onDismiss?: () => void;
  className?: string;
}

const HOP_CLASS = "mogzy-click-react";

/** Restart a one-shot animation class from frame 0 (a repeat tap must not be swallowed). */
function replayClass(el: HTMLElement | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function MogzyGuide({
  surface,
  message,
  placement: placements,
  layout: layoutProp,
  pose = "base",
  interactive = false,
  triggerLabel = "Mogzy, guide",
  onActivate,
  onDismiss,
  className,
}: MogzyGuideProps) {
  const detected = useGuideLayout();
  const layout = layoutProp ?? detected;
  const placement = resolvePlacement(placements, layout);
  const reduced = useReducedMotionPreference();
  const testId = `mogzy-guide-${surface}`;

  // Hold the last message so the text doesn't blank while the bubble fades out.
  const lastRef = useRef<GuideMessage | null>(null);
  if (message) lastRef.current = message;
  const shown = message ?? lastRef.current;
  const visible = message !== null;

  const target = reduced ? undefined : message?.target;
  const lean = leanOffsetExpr(target);
  const restFacing = placement.restFacing ?? "left";
  const facing = facingForTarget(target, restFacing);
  const activePose = message?.pose ?? pose;
  const bubbleWidth = placement.bubbleWidth ?? "min(220px, 60vw)";

  // --- hop (one-shot cue on activation, and on tap) --------------------------
  const hopRef = useRef<HTMLDivElement | null>(null);
  const hop = useCallback(() => {
    if (reduced) return;
    replayClass(hopRef.current, HOP_CLASS);
  }, [reduced]);

  useEffect(() => {
    const el = hopRef.current;
    if (!el) return;
    const onEnd = () => el.classList.remove(HOP_CLASS);
    el.addEventListener("animationend", onEnd);
    el.addEventListener("animationcancel", onEnd);
    return () => {
      el.removeEventListener("animationend", onEnd);
      el.removeEventListener("animationcancel", onEnd);
    };
  }, []);

  const cueId = message?.cue === "hop" ? message.id : null;
  useEffect(() => {
    if (cueId) hop();
  }, [cueId, hop]);

  // --- viewport clamp (bubble only) ------------------------------------------
  // The shift lives on a static wrapper (no transition), separate from the
  // bubble's own fade, so measuring the wrapper never reads mid-animation.
  const posRef = useRef<HTMLDivElement | null>(null);
  const shiftRef = useRef({ x: 0, y: 0 });

  const clampBubble = useCallback(() => {
    const el = posRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // not laid out (jsdom / display:none)
    const cur = shiftRef.current;
    const natural = {
      left: r.left - cur.x,
      right: r.right - cur.x,
      top: r.top - cur.y,
      bottom: r.bottom - cur.y,
    };
    const next = computeViewportShift(
      natural,
      { width: window.innerWidth, height: window.innerHeight },
      GUIDE_BUBBLE_VIEWPORT_MARGIN,
    );
    shiftRef.current = next;
    el.style.setProperty("--guide-clamp-x", `${next.x}px`);
    el.style.setProperty("--guide-clamp-y", `${next.y}px`);
  }, []);

  useLayoutEffect(() => {
    if (visible) clampBubble();
  }, [visible, message?.id, layout, placement.bubbleSide, bubbleWidth, clampBubble]);

  // Re-clamp whenever the geometry settles or changes: viewport resize, the
  // mascot image finishing its load (the lean layer grows), webfont swap
  // (the bubble grows). The first layout pass alone can run before any of those.
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", clampBubble);
    const el = posRef.current;
    let ro: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(clampBubble);
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    // The bubble rides the lean glide; once it lands, clamp against the FINAL
    // position (a measurement taken mid-glide is the wrong place).
    const lean = el?.parentElement;
    const onLand = (e: TransitionEvent) => {
      if (e.propertyName === "transform") clampBubble();
    };
    lean?.addEventListener("transitionend", onLand);
    return () => {
      window.removeEventListener("resize", clampBubble);
      ro?.disconnect();
      lean?.removeEventListener("transitionend", onLand);
    };
  }, [visible, clampBubble]);

  // --- dismissal --------------------------------------------------------------
  const dismissActive = useCallback(() => {
    if (message?.dismissible) onDismiss?.();
  }, [message, onDismiss]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && message?.dismissible) {
      e.stopPropagation();
      dismissActive();
    }
  };

  const onTrigger = () => {
    hop();
    onActivate?.();
    dismissActive();
  };

  // --- layout styles ----------------------------------------------------------
  const anchor = placement.anchor;
  const rootStyle: CSSProperties = anchor
    ? {
        position: "absolute",
        top: anchor.top,
        bottom: anchor.bottom,
        ...(anchor.centerX
          ? { left: 0, right: 0, display: "flex", justifyContent: "center" }
          : { left: anchor.left, right: anchor.right }),
      }
    : { position: "relative" };

  const leanStyle = {
    width: placement.size,
    "--guide-lean-x": reduced ? "0px" : lean.x,
    "--guide-lean-y": reduced ? "0px" : lean.y,
  } as CSSProperties;

  const announce =
    message && isAnnouncedPriority(message.priority)
      ? message.title
        ? `${message.title}. ${message.text}`
        : message.text
      : "";

  return (
    <div
      data-testid={testId}
      data-surface={surface}
      data-layout={layout}
      data-pose={activePose}
      data-motion={reduced ? "still" : "full"}
      data-active-message={message?.id ?? ""}
      className={`mogzy-guide pointer-events-none ${className ?? ""}`}
      style={rootStyle}
      onKeyDown={onKeyDown}
    >
      {/* The one announcement path: persistent so AT registers the region
          before its content changes; empty for hover/ambient/idle. */}
      <div
        data-testid={`${testId}-live`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announce}
      </div>

      <div className={reduced ? undefined : "academy-mogzy-float"}>
        <div
          data-testid={`${testId}-lean`}
          className={`relative ${reduced ? "" : "mogzy-lean-glide"}`}
          style={leanStyle}
        >
          <div
            ref={posRef}
            className="mogzy-guide-bubble-pos"
            data-side={placement.bubbleSide}
            style={{ "--mogzy-guide-bubble-w": bubbleWidth } as CSSProperties}
          >
            <div
              data-testid={`${testId}-bubble`}
              data-visible={visible ? "true" : "false"}
              data-priority={shown?.priority ?? ""}
              data-message-id={shown?.id ?? ""}
              data-direction={message?.target?.direction ?? ""}
              aria-hidden
              className="mogzy-guide-bubble"
            >
              {shown && (
                <>
                  {shown.title && <p className="mogzy-guide-bubble-title">{shown.title}</p>}
                  <p className="mogzy-guide-bubble-text">{shown.text}</p>
                </>
              )}
              <div className="mogzy-guide-bubble-tail" aria-hidden />
            </div>
          </div>

          <div
            data-testid={`${testId}-facing`}
            data-facing={facing}
            className={reduced ? undefined : "mogzy-facing-turn"}
            // The base artwork natively looks LEFT (see MogzyHubGuide), so only
            // a rightward look needs the mirror. Reduced motion keeps the
            // authored rest facing but never turns.
            style={
              reduced
                ? restFacing === "right"
                  ? { transform: "scaleX(-1)" }
                  : undefined
                : ({ "--mogzy-facing": facing === "left" ? 1 : -1 } as CSSProperties)
            }
          >
            <div ref={hopRef} data-testid={`${testId}-react`}>
              {interactive ? (
                <button
                  type="button"
                  aria-label={triggerLabel}
                  data-testid={`${testId}-trigger`}
                  onClick={onTrigger}
                  className="pointer-events-auto block w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/80"
                >
                  <MogzyMascot
                    pose={activePose}
                    decorative
                    loading="eager"
                    className="w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]"
                  />
                </button>
              ) : (
                <MogzyMascot
                  pose={activePose}
                  decorative
                  loading="eager"
                  className="w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
