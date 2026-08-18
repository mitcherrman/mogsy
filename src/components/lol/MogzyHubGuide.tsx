import { useRef } from "react";

import {
  HUB_GUIDE_MODES,
  type HubGuideMode,
  type HubGuideModeId,
} from "./hub-guide";

/**
 * Mogzy's contextual hub guide (Phase 1) — the visual half of hub-guide.ts.
 *
 * Renders the hub mascot with its reaction to the active mode: Mogzy glides
 * clearly toward the hovered side of the hub (staying anchored to the central
 * lane) and a compact speech bubble rides with him, naming and describing the
 * mode. Idle bob (`.academy-mogzy-float`, index.css) and the contextual glide
 * live on SEPARATE wrapper layers so the two transforms never compete.
 *
 * The guide is strictly decorative/additive: it renders inside the hub's
 * aria-hidden, pointer-events-none central lane and everything here is
 * absolutely positioned, so it never takes clicks and never affects layout.
 * Navigation stays on the cards themselves.
 */
export default function MogzyHubGuide({
  activeModeId,
}: {
  activeModeId: HubGuideModeId | null;
}) {
  const activeMode = activeModeId ? HUB_GUIDE_MODES[activeModeId] : null;

  // Horizontal glide, capped at 7vw: the lean values are tuned against the
  // wide (≥1440px) layout, where 7vw ≥ every configured |x| — so wide
  // viewports get the full configured travel. Below that the central lane
  // holds its 200px minimum while the cards close in, so the same px travel
  // would crowd Mogzy and his bubble into the neighbouring card's text;
  // scaling with the viewport keeps the glide proportional to the room the
  // layout actually has. Idle stays a plain 0px (asserted by LolHub tests).
  const leanX = activeMode?.lean.x ?? 0;
  const leanXExpr =
    leanX === 0 ? "0px" : leanX < 0 ? `max(${leanX}px, -7vw)` : `min(${leanX}px, 7vw)`;

  // The bubble's lateral offset scales down the same way (6.5vw ≥ every
  // configured |x| from ~1385px up, so wide desktops get the full side
  // placement). The bubble travels lean + bubble.x together — leaving this
  // uncapped would push it toward the viewport edge at the 200px lane
  // minimum, where the composition has no side room to give.
  const bubbleX = activeMode?.bubble?.x ?? 0;
  const bubbleXExpr =
    bubbleX === 0
      ? "0px"
      : bubbleX < 0
        ? `max(${bubbleX}px, -6.5vw)`
        : `min(${bubbleX}px, 6.5vw)`;

  // Vertical drop. Plain px unless the mode declares a narrow-desktop value,
  // in which case it interpolates linearly in vw through the two calibration
  // points (1024px viewport → yNarrow, 1440px → y): quiz-history's card
  // title drifts ~60px relative to Mogzy across that range, and the ramp
  // keeps the bubble attached at wide widths while lifting it exactly as
  // fast as the title closes in. Below 1024 the line continues (bounded) so
  // the narrow-md squeeze degrades toward title-safety, above 1440 it holds
  // the wide value.
  const bubbleY = activeMode?.bubble?.y ?? 0;
  const bubbleYNarrow = activeMode?.bubble?.yNarrow;
  let bubbleYExpr = `${bubbleY}px`;
  if (bubbleYNarrow !== undefined) {
    const slopePerVw = (bubbleY - bubbleYNarrow) / ((1440 - 1024) / 100);
    const intercept = bubbleYNarrow - slopePerVw * (1024 / 100);
    const lo = Math.min(bubbleY, bubbleYNarrow) - 60;
    const hi = Math.max(bubbleY, bubbleYNarrow);
    bubbleYExpr = `clamp(${lo}px, calc(${slopePerVw.toFixed(3)}vw + ${intercept.toFixed(1)}px), ${hi}px)`;
  }

  // Keep the last real mode so the bubble's text doesn't blank out while it
  // fades away after the user leaves the cards.
  const lastModeRef = useRef<HubGuideMode | null>(null);
  if (activeMode) lastModeRef.current = activeMode;
  const displayMode = activeMode ?? lastModeRef.current;

  return (
    // Idle bob layer — unchanged from the pre-guide hub markup.
    <div className="academy-mogzy-float absolute inset-x-0 bottom-[16%] flex justify-center">
      {/* Contextual lean layer. Separate from the float so the idle keyframe
          and the acknowledgement shift compose instead of fighting over one
          transform. Reduced motion pins Mogzy in place (the bubble still
          carries the information). */}
      <div
        data-testid="mogzy-guide-lean"
        // 340ms with a whisper of overshoot (control point y > 1): deliberate
        // glide out, gentle settle — tuned for the ~90px travel; 500ms read
        // as sluggish at this distance and plain ease-out read as mechanical.
        className="relative transition-transform duration-[340ms] ease-[cubic-bezier(0.3,1.06,0.35,1)] [transform:translate(var(--guide-lean-x,0px),var(--guide-lean-y,0px))] motion-reduce:transition-none motion-reduce:[transform:none]"
        style={
          {
            "--guide-lean-x": leanXExpr,
            "--guide-lean-y": `${activeMode?.lean.y ?? 0}px`,
          } as React.CSSProperties
        }
      >
        {/* Speech bubble — absolutely positioned so it can never reflow the
            page. It lives INSIDE the lean layer, so it rides every glide for
            free; on top of that the mode config places it BESIDE Mogzy's
            head on the hovered side (--guide-bubble-x pushes it laterally,
            --guide-bubble-y drops it from hat-height to head-height), so the
            reaction reads as one gesture and the bubble leaves the radio
            dock's vertical band entirely. Collision priority, in order: the
            hovered card's own title stays readable; dock overlap is avoided;
            the bubble stays visually attached to Mogzy; everything stays in
            the useful viewport. Both offsets live in the TRANSFORM (not in
            `bottom`/`left`) so the single motion-reduce override cancels the
            side placement together with the slide: under reduced motion
            Mogzy doesn't move, and a side bubble next to a static mascot
            would look detached, so it simply appears centered above him.
            Fades/slides in when a mode is active. z-10 keeps the parchment in
            front of the mascot img (a later sibling): beside his head the
            bubble's near edge overlaps his hat by ~20px, and a speech bubble
            reads as being in front of its speaker — behind him it occludes
            the first words of the line instead.

            Material: Academy parchment, not chrome. The fill is the Ranked
            folio's own gradient (index.css `.ranked-academy .ranked-folio`)
            at near-full opacity over its `--ranked-vellum` base, with the
            folio's brass border and inner paper highlight; the vellum
            texture PNG is deliberately NOT reused — its baked vignette is
            authored for a large panel and turns into a dark rim at bubble
            scale. Ink follows the Academy Broadcast book beside it (navy
            headline, slate body), which is the parchment the hub already
            speaks — Ranked's warmer ink would visibly clash next to it. */}
        <div
          data-testid="mogzy-guide-bubble"
          data-visible={activeMode ? "true" : "false"}
          data-active-mode={activeMode?.id ?? ""}
          style={
            {
              "--guide-bubble-x": bubbleXExpr,
              "--guide-bubble-y": bubbleYExpr,
              backgroundImage:
                "linear-gradient(178deg, rgba(247,239,217,0.97) 0%, rgba(232,218,186,0.95) 46%, rgba(208,190,152,0.97) 100%)",
            } as React.CSSProperties
          }
          className={`absolute bottom-[calc(100%-6px)] left-1/2 z-10 w-[clamp(170px,15vw,230px)] rounded-lg border border-[#b9934c]/60 bg-[#c6b48f] px-3 py-2 text-center shadow-[inset_0_0_0_1px_rgba(255,248,226,0.45),0_10px_24px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-[340ms] ease-[cubic-bezier(0.3,1.06,0.35,1)] motion-reduce:transition-none motion-reduce:[transform:translate(-50%,0)] ${
            activeMode
              ? "[transform:translate(calc(-50%+var(--guide-bubble-x,0px)),var(--guide-bubble-y,0px))] opacity-100"
              : "[transform:translate(calc(-50%+var(--guide-bubble-x,0px)),calc(var(--guide-bubble-y,0px)+6px))] opacity-0"
          }`}
        >
          {displayMode && (
            <>
              <p
                className="text-[13px] font-semibold leading-tight text-[#1d2b47]"
                style={{
                  fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
                }}
              >
                {displayMode.title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#3f4a63]">
                {displayMode.description}
              </p>
            </>
          )}
          {/* Bubble tail. Counter-shifted by the bubble's own lateral offset,
              which by construction parks it over Mogzy's head: bubble-local
              `50% - x` is global `bubble-center - x` = the head's center. With
              the side placement that lands on the bubble's INNER lower corner
              — a left bubble points from its lower-right at Mogzy, a right
              bubble from its lower-left — and the clamp keeps the diamond
              inside the parchment when the bubble narrows on small viewports
              (170px wide, |x| 90 would otherwise push it past the edge).
              Reduced motion re-centers it with the bubble. The fill is the
              gradient's bottom stop so the seam where the tail overlaps the
              bubble's border disappears into the parchment. */}
          <div
            className="absolute left-[clamp(14px,calc(50%-var(--guide-bubble-x,0px)),calc(100%-14px))] top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[#b9934c]/60 bg-[#d0be98] transition-[left] duration-[340ms] ease-[cubic-bezier(0.3,1.06,0.35,1)] motion-reduce:transition-none motion-reduce:left-1/2"
            aria-hidden
          />
        </div>

        {/* Ambient glow + mascot — unchanged from the pre-guide hub markup. */}
        <div
          className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,214,140,0.28) 0%, rgba(120,160,255,0.12) 45%, transparent 70%)",
            filter: "blur(14px)",
          }}
        />
        {/* ~88% of the original clamp(110px,11vw,190px): the host stays the
            anchor of the Academy, but the slimmer silhouette clears the
            radio dock above him and gives the stronger glide (±60–100px)
            room to read without crowding the inner book edges. */}
        <img
          src="/mascot/mogzy-mascot-base-v1.png"
          alt=""
          draggable={false}
          className="relative w-[clamp(97px,9.7vw,167px)] drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
        />
      </div>
    </div>
  );
}
