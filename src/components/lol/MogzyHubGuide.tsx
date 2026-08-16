import { useRef } from "react";

import {
  HUB_GUIDE_MODES,
  type HubGuideMode,
  type HubGuideModeId,
} from "./hub-guide";

/**
 * Mogzy's contextual hub guide (Phase 1) — the visual half of hub-guide.ts.
 *
 * Renders the hub mascot with its reaction to the active mode: Mogzy leans a
 * few pixels toward the hovered side of the hub and a compact speech bubble
 * names and describes the mode. Idle bob (`.academy-mogzy-float`, index.css)
 * and the contextual lean live on SEPARATE wrapper layers so the two
 * transforms never compete.
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
        className="relative transition-transform duration-500 ease-out [transform:translate(var(--guide-lean-x,0px),var(--guide-lean-y,0px))] motion-reduce:transition-none motion-reduce:[transform:none]"
        style={
          {
            "--guide-lean-x": `${activeMode?.lean.x ?? 0}px`,
            "--guide-lean-y": `${activeMode?.lean.y ?? 0}px`,
          } as React.CSSProperties
        }
      >
        {/* Speech bubble — absolutely positioned above Mogzy so it can never
            reflow the page. Fades/slides in when a mode is active; under
            reduced motion it simply appears. */}
        <div
          data-testid="mogzy-guide-bubble"
          data-visible={activeMode ? "true" : "false"}
          data-active-mode={activeMode?.id ?? ""}
          className={`absolute bottom-[calc(100%+10px)] left-1/2 w-[clamp(170px,15vw,230px)] -translate-x-1/2 rounded-lg border border-[#c9a84c]/40 bg-[#0a1020]/90 px-3 py-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
            activeMode
              ? "translate-y-0 opacity-100"
              : "translate-y-1 opacity-0 motion-reduce:translate-y-0"
          }`}
        >
          {displayMode && (
            <>
              <p className="text-[13px] font-semibold leading-tight text-[#f0d78c]">
                {displayMode.title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#cfc4a5]">
                {displayMode.description}
              </p>
            </>
          )}
          {/* Bubble tail pointing down at Mogzy */}
          <div
            className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[#c9a84c]/40 bg-[#0a1020]/90"
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
        <img
          src="/mascot/mogzy-mascot-base-v1.png"
          alt=""
          draggable={false}
          className="relative w-[clamp(110px,11vw,190px)] drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
        />
      </div>
    </div>
  );
}
