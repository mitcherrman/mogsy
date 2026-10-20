import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import { anchorFor, focalFor, objectPositionFor, toObjectPosition, type ArtSide } from "@/lib/patch-deck/focal";

/**
 * The card's artwork. Wide splash on the stage, portrait loading art on a
 * phone. Decorative: the champion is named in the title block, so the image
 * carries no alt text.
 *
 * The splash is positioned from the champion's authored focal point: the box
 * is measured, and `object-position` is solved so the face lands on the side's
 * anchor (see `lib/patch-deck/focal`). Portrait loading art is composed around
 * the character already, so it keeps a fixed upper-centre crop.
 *
 * Fail-closed: a missing or broken image shows a lettered void, never a broken
 * image glyph. The image fades in once decoded.
 */
export const DeckArt = ({
  art,
  name,
  variant,
  side = "left",
  priority = false,
  className,
}: {
  art: Art;
  name: string;
  variant: "wide" | "portrait";
  side?: ArtSide;
  /** Eager-load (the current card). Neighbours are lazy. */
  priority?: boolean;
  className?: string;
}) => {
  const src = variant === "wide" ? art.splash ?? art.loading : art.loading ?? art.splash;
  const usingSplash = variant === "wide" && Boolean(art.splash);
  const [state, setState] = useState<"pending" | "ready" | "failed">("pending");
  const [focus, setFocus] = useState<string>("50% 18%");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setState("pending"), [src]);

  // Solve the crop for the measured box; re-solve when the box changes
  // (a face switching the panel width, a window resize).
  useLayoutEffect(() => {
    if (!usingSplash) {
      setFocus("50% 12%");
      return;
    }
    const el = box.current;
    if (!el) return;
    const focal = focalFor(art.champion);
    const anchor = anchorFor(side);
    const solve = () => {
      const rect = el.getBoundingClientRect();
      setFocus(toObjectPosition(objectPositionFor(focal, anchor, { width: rect.width, height: rect.height })));
    };
    solve();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(solve);
    observer.observe(el);
    return () => observer.disconnect();
  }, [usingSplash, art.champion, side]);

  return (
    <div
      ref={box}
      className={cn("dk-card__art", state !== "ready" && "dk-card__art--pending", className)}
      style={{ ["--dk-focus" as string]: focus }}
      data-testid="deck-art"
      data-art-state={state}
      data-art-focus={focus}
      aria-hidden
    >
      {src && state !== "failed" ? (
        <img
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // React 18 only knows the lowercase DOM attribute; the camelCase prop warns.
          {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
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
