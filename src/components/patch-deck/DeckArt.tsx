import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckArt as Art } from "@/lib/patch-deck/art";

/**
 * The card's artwork. Wide splash on the stage, portrait loading art on a
 * phone (the stage decides which through `variant`). Decorative: the champion
 * is named in the title block, so the image carries no alt text.
 *
 * Fail-closed: a missing or broken image shows a lettered void, never a broken
 * image glyph. The image fades in once decoded so a slow network never flashes
 * a half-painted splash.
 */
export const DeckArt = ({
  art,
  name,
  variant,
  priority = false,
  className,
}: {
  art: Art;
  name: string;
  variant: "wide" | "portrait";
  /** Eager-load (the current card). Neighbours are lazy. */
  priority?: boolean;
  className?: string;
}) => {
  const src = variant === "wide" ? art.splash ?? art.loading : art.loading ?? art.splash;
  const [state, setState] = useState<"pending" | "ready" | "failed">("pending");
  useEffect(() => setState("pending"), [src]);

  return (
    <div
      className={cn("dk-card__art", variant === "wide" ? "dk-card__art--wide" : "dk-card__art--portrait", state !== "ready" && "dk-card__art--pending", className)}
      data-testid="deck-art"
      data-art-state={state}
      aria-hidden
    >
      {src && state !== "failed" ? (
        <img
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      ) : null}
      {(!src || state !== "ready") && (
        <div className="dk-art-void">
          <span>{name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?"}</span>
        </div>
      )}
    </div>
  );
};
