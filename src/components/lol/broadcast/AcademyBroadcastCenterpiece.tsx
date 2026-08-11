import { cn } from "@/lib/utils";
import { useAcademyRadio } from "@/lib/audio/academy-radio";
import AcademyRadioDock from "@/components/audio/AcademyRadioDock";
import AcademyBroadcastSurface from "./AcademyBroadcastSurface";
import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "./broadcast-content";

/**
 * Academy Broadcast — the /lol centerpiece.
 *
 * One deliberate central object with a fixed vertical hierarchy:
 *
 *   1. the open magic-book broadcast surface (content);
 *   2. the compact Academy Radio dock, attached beneath it as the tome's
 *      lower control deck;
 *
 * with the Mogzy mascot sitting below the whole assembly (the hub owns that
 * placement). The composition is the only thing this component decides: the
 * surface stays a prop-driven view over the content model, the dock stays a
 * view over the shared audio transport, and neither knows about the other.
 * The radio snapshot is read here solely to tell the surface whether the
 * Academy is audibly transmitting, which drives its energy glow.
 */

type Variant = "desktop" | "mobile";

export default function AcademyBroadcastCenterpiece({
  variant = "desktop",
  feed = INITIAL_BROADCAST_FEED,
  className,
}: {
  variant?: Variant;
  /** Injectable so a future provider (or a test) can swap the content. */
  feed?: BroadcastFeed;
  className?: string;
}) {
  const radio = useAcademyRadio();
  const suffix = variant === "desktop" ? "" : "-mobile";

  return (
    <div
      data-testid={`academy-broadcast-centerpiece${suffix}`}
      className={cn("relative", className)}
    >
      <AcademyBroadcastSurface
        feed={feed}
        energized={radio.isPlaying}
        variant={variant}
      />
      {/* The dock is the tome's control deck: a small breathing gap below the
          painted base keeps them related but not fused. Desktop spans the
          tome's full width because the lane can run as narrow as 200px and
          the track title must stay readable. Mobile has room to inset it. */}
      <AcademyRadioDock
        variant={variant}
        className={cn("mx-auto mt-1.5", variant === "desktop" ? "w-full" : "w-[92%]")}
      />
    </div>
  );
}
