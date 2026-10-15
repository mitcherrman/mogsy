/**
 * PARCHMENT CONTINUITY — one pane of the Quiz Hub's centre sheet.
 *
 * THE SIZING CONTRACT
 * ───────────────────
 * The centre parchment shows three modes (Daily · Role · Ranked), and its
 * outer box must not change when the reader switches between them. Before
 * this pass each mode was rendered alone and the sheet took the height of
 * whichever one was showing, so Daily shrank the sheet (and on desktop the
 * whole three-sheet rack) and Role's champion grid stretched it.
 *
 * Ownership is now explicit:
 *
 *   SIZER  The Ranked composition — the hub's visual benchmark — is ALWAYS
 *          laid out, in normal flow, and is the only thing that gives the
 *          stage its height. When another mode is showing it stays in the
 *          layout but is hidden (visibility, `inert`, `aria-hidden`), so the
 *          sheet is exactly the box Ranked has always had. Nothing about the
 *          Ranked layout changed; it simply also measures the stage now.
 *   FILL   Daily and Role are laid INTO that box (absolutely, inset 0). They
 *          never contribute to its size. Each owns one flexible region — the
 *          Daily mascot, the Role champion grid — that absorbs whatever space
 *          the stage has, so the same composition works at every viewport.
 *
 * The stage is a flex child of the scroll's content column, whose padding is
 * the parchment's safe area: nothing in a pane can reach the rollers. If a
 * FILL pane's fixed chrome ever exceeds the stage (an extreme text zoom),
 * the pane scrolls as a last resort instead of painting over the roller.
 *
 * The left Ranked Standing and right Academy Record sheets are untouched:
 * their rack row is sized by the same three columns it always was.
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { HubCentreMode } from "@/lib/role-challenge/presentation";

export function CentreModePane({
  mode,
  active,
  sizer = false,
  animate = false,
  className = "",
  testId,
  children,
}: {
  mode: HubCentreMode;
  active: boolean;
  /** True for the one pane whose natural height sizes the stage. */
  sizer?: boolean;
  /** Fade the pane in — only after a mode switch, never on first paint. */
  animate?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `inert` takes a hidden pane out of the tab order and away from pointer
  // and assistive tech while it keeps its box. Set as a property: React 18
  // does not forward the attribute.
  useEffect(() => {
    if (ref.current) ref.current.inert = !active;
  }, [active]);

  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`centre-mode-panel-${mode}`}
      aria-labelledby={`centre-mode-tab-${mode}`}
      aria-hidden={active ? undefined : true}
      data-mode-pane={mode}
      data-active={active ? "true" : "false"}
      data-animate={active && animate ? "true" : undefined}
      data-testid={testId}
      className={`lc-centre-pane ${sizer ? "lc-centre-pane--sizer" : "lc-centre-pane--fill"} ${className}`}
      /* Inline, not a class: the hidden state must hold even where the
         stylesheet is absent (jsdom), since it is what keeps a hidden pane
         out of the accessibility tree there too. */
      style={active ? undefined : { visibility: "hidden" }}
    >
      {children}
    </div>
  );
}
