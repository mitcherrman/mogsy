/**
 * Shared GRAPH1 entity avatar — presentation only.
 *
 * Extracted verbatim from RaceRenderer (Phase 5) so the race and the stat
 * board resolve entity media through ONE ladder rather than two that can
 * drift: validated image -> role-enhanced initials -> plain initials.
 * `media.role` is only ever present on initials media and only for a lane
 * position, so an unresolved or non-playing role simply lands on the last
 * rung — there is no broken-image state to fall back from.
 */
import type { ComponentType } from "react";

import type { Graph1EntityPresentation } from "@/graph1/contract";
import { entityColor } from "@/graph1/colors";
import RoleGlyph from "./RoleGlyph";

/** Injectable <img> substitute. The Remotion composition passes remotion's
 * <Img> (which delays frame capture until the asset is decoded, keeping
 * renders deterministic); the live app keeps the lazy native element. */
export type Graph1ImageComponent = ComponentType<{
  src: string;
  alt: string;
  className?: string;
}>;

export const NativeLazyImg: Graph1ImageComponent = ({
  src,
  alt,
  className,
}) => <img src={src} alt={alt} loading="lazy" className={className} />;

export default function EntityAvatar({
  entity,
  imageComponent: ImageComponent = NativeLazyImg,
  className = "h-9 w-9",
}: {
  entity: Graph1EntityPresentation;
  imageComponent?: Graph1ImageComponent;
  /** size/shape only — the media ladder itself never varies by caller */
  className?: string;
}) {
  if (entity.media.kind === "image") {
    return (
      <ImageComponent
        src={entity.media.src}
        alt={entity.displayName}
        className={`${className} shrink-0 rounded-md object-cover bg-muted`}
      />
    );
  }
  const role = entity.media.kind === "initials" ? entity.media.role : undefined;
  return (
    <div
      aria-hidden
      data-avatar={role ? "role-initials" : "initials"}
      className={`${className} relative shrink-0 rounded-md flex items-center justify-center text-xs font-bold text-white`}
      style={{ backgroundColor: entityColor(entity.id).base }}
    >
      {entity.media.value}
      {role && (
        <RoleGlyph
          role={role}
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-sm bg-background/80 p-px text-foreground"
        />
      )}
    </div>
  );
}
