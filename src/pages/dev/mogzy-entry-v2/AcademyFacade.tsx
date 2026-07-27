import { memo } from "react";

import academySkyline from "@/academy/academy-skyline.png";

import AcademyDoorway from "./AcademyDoorway";
import { STRUCTURE_PRESENCE } from "./AcademyScene";
import type { ViewportTier } from "./useViewportTier";

/**
 * The Academy entrance.
 *
 * The skyline is a decorative PNG while the doorway, mascot, title, CTA,
 * interaction, and transition remain live application elements.
 */
interface AcademyFacadeProps {
  tier: ViewportTier;
  /** Retained because the parent already measures and supplies it. */
  parapetY: number;
  /** Viewport x of the doorway centre. */
  doorCx: number;
  /** Viewport y of the doorway board's top edge. */
  doorTop: number;
  /** Door width in pixels. */
  doorWidth: number;
  /** Viewport y where the doorway meets the ground. */
  groundY: number;
  /** Warms the doorway while the entry control has hover/focus. */
  lit: boolean;
  entering: boolean;
  /** Suppresses doorway breathing. */
  still: boolean;
  /** Pointer drift applied to the distant skyline. */
  skyDrift: { x: number; y: number };
}

const AcademyFacade = memo(function AcademyFacade({
  tier,
  parapetY,
  doorCx,
  doorTop,
  doorWidth,
  groundY,
  lit,
  entering,
  still,
  skyDrift,
}: AcademyFacadeProps) {
  const presence = STRUCTURE_PRESENCE[tier];

  const isPhone =
    tier === "phone" || tier === "phone-landscape";

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
      data-testid="academy-facade"
      data-presence={presence}
    >
      {/* -------------------------------------------------------------- */}
      {/* Castle skyline PNG                                             */}
      {/* -------------------------------------------------------------- */}
      <img
        src={academySkyline}
        alt=""
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-0 max-w-none select-none"
        style={{
          /*
          * Keep the original image box, then visually scale the artwork down.
          * This is more reliable than changing width alone because the asset's
          * internal transparent canvas is much larger than the visible castle.
          */
          width: isPhone ? "150%" : "110%",
          height: isPhone
            ? Math.max(180, parapetY + 100)
            : Math.max(260, parapetY + 150),

          objectFit: "contain",
          objectPosition: "center top",

          /*
          * Move the castle lower and shrink it substantially.
          */
          transform: `translate3d(
            calc(-50% + ${skyDrift.x}px),
            ${isPhone ? 38 + skyDrift.y : -150 + skyDrift.y}px,
            0
          ) scale(${isPhone ? 0.72 : 2})`,

          transformOrigin: "top center",

          /*
          * The castle itself is still dark, but the subtle gold edges and
          * window marks should now read more clearly.
          */
          opacity: isPhone
            ? presence * 0.88
            : presence,

          WebkitMaskImage:
            "linear-gradient(180deg, #000 0%, #000 72%, rgba(0,0,0,0.68) 84%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, #000 0%, #000 72%, rgba(0,0,0,0.68) 84%, transparent 100%)",

          filter:
            "brightness(1.28) contrast(1.22) saturate(0.95)",

          transition:
            "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 500ms ease",
        }}
      />

      {/* Extra darkness below the skyline so the title and mascot dominate. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: isPhone
            ? Math.max(190, parapetY + 100)
            : Math.max(270, parapetY + 160),

          background:
            "linear-gradient(180deg, transparent 0%, rgba(4,7,15,0.015) 58%, rgba(4,7,15,0.24) 84%, rgba(4,7,15,0.68) 100%)",
        }}
      />

      {/* -------------------------------------------------------------- */}
      {/* Doorway                                                        */}
      {/* -------------------------------------------------------------- */}
      <div
        className="absolute"
        style={{
          left: doorCx,
          top: doorTop,
          width: doorWidth,
          transform: "translateX(-50%)",
        }}
      >
        <AcademyDoorway
          lit={lit}
          entering={entering}
          still={still}
          outline={presence}
        />
      </div>

      {/* Light pooling at the foot of the doorway. */}
      <div
        className="absolute"
        style={{
          left: doorCx,
          top: groundY,
          width: doorWidth * 2.4,
          height: doorWidth * 0.55,
          marginLeft: -doorWidth * 1.2,
          marginTop: -doorWidth * 0.14,
          background: `radial-gradient(
            closest-side,
            rgba(240,215,140,${lit ? 0.11 : 0.07}) 0%,
            rgba(240,215,140,0.025) 42%,
            transparent 76%
          )`,
          transition: "background 500ms ease",
        }}
      />
    </div>
  );
});

export default AcademyFacade;