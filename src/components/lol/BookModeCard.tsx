import { useState } from "react";
import { Link } from "react-router-dom";
import bookFrame from "@/academy/hub/book-mode-frame.png";

/**
 * Open-book destination card for the /lol academy library hub.
 *
 * One reusable transparent book PNG (`book-mode-frame.png`, 1536×1024) frames
 * every destination: live champion splash art is clipped into the left cover's
 * inner gold-trim panel and the title/subtitle render as real HTML on the
 * right cover. The covers in the frame art are opaque leather, so the splash
 * layers ABOVE the frame, clipped to the measured inner-panel region — this
 * reads as art inlaid into the cover while the gold trim stays crisp.
 *
 * Measured frame geometry (percent of the PNG canvas):
 *   book bbox      x 6.3–93.3%, y 11.5–83.5%  (opaque-alpha bounding box)
 *   left panel     x 10.0–44.0%, y 16.6–78.4%  (inside the gold trim)
 *   right panel    x 56.0–90.0%, y 16.6–78.4%
 */

type Props = {
  to: string;
  title: string;
  subtitle: string;
  /** Resolved champion splash URL from the asset manifest; falls back to plain leather. */
  splashUrl?: string | null;
  /**
   * Per-champion `object-position` for the splash crop. The inner panel is
   * portrait (≈0.83:1) and splash art is landscape (≈1.7:1), so `object-cover`
   * fills the panel's height and crops horizontally only — the X value is what
   * frames the champion's face; the Y value is inert. Lower X = further left.
   */
  splashPosition?: string;
  onClick?: () => void;
};

export default function BookModeCard({
  to,
  title,
  subtitle,
  splashUrl,
  splashPosition = "60% center",
  onClick,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = !!splashUrl && !imgFailed;

  return (
    <Link
      to={to}
      aria-label={title}
      onClick={onClick}
      className="book-mode-card group relative block w-full select-none focus-visible:outline-none [container-type:inline-size]"
    >
      {/* Canvas-aspect stage. Negative margins reclaim ALL of the frame PNG's
          transparent padding (measured opaque bbox: x 6.3–93.3%, y 11.5–83.5%
          of the canvas) so the LAYOUT BOX EQUALS THE DRAWN BOOK: the book fills
          the card's width exactly and stacked books pack with no dead space.
          Every % margin resolves against the PARENT's width. The horizontal
          pair widens the stage to 1.13 × card width, so the stage's height is
          0.7533 × card width and the vertical pair converts through that:
            left  -6.3%   right -6.7%
            top   -0.115 × 0.7533 = -8.66%
            bot   -0.165 × 0.7533 = -12.43%
          The card's own height is therefore card width × 0.542 — the constant
          LolHub's viewport-height cap is built on. */}
      <div
        className="relative aspect-[3/2] transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.015] group-active:scale-[0.99] motion-reduce:transform-none"
        style={{
          marginLeft: "-6.3%",
          marginRight: "-6.7%",
          marginTop: "-8.66%",
          marginBottom: "-12.43%",
        }}
      >
        {/* Book frame — base layer, includes its own soft baked glow */}
        <img
          src={bookFrame}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full transition-[filter] duration-300 group-hover:drop-shadow-[0_10px_28px_rgba(10,120,220,0.35)]"
        />

        {/* Champion splash — clipped to the left cover's inner panel */}
        <div
          className="absolute overflow-hidden rounded-[3px]"
          style={{ left: "10.4%", top: "17.6%", width: "33.2%", height: "59.8%" }}
        >
          {hasImage && (
            <img
              src={splashUrl ?? undefined}
              alt=""
              aria-hidden
              draggable={false}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
              style={{ objectPosition: splashPosition }}
            />
          )}
          {/* Readability / inlay shading so the art sits INTO the cover */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: "inset 0 0 18px rgba(0,0,0,0.65), inset 0 0 2px rgba(0,0,0,0.9)",
              background:
                "linear-gradient(to top, rgba(4,8,18,0.35) 0%, transparent 30%)",
            }}
            aria-hidden
          />
        </div>

        {/* Title + subtitle — real HTML on the right cover */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{ left: "56.5%", top: "17.6%", width: "32.8%", height: "59.8%" }}
        >
          <h3
            className="book-mode-card-title book-title-glimmer text-balance bg-clip-text font-medium leading-tight text-transparent"
            style={{
              fontSize: "clamp(1rem, 5.1cqw, 2.5rem)",
              fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {title}
          </h3>
          <p
            className="mt-[6%] text-[#a5987b] leading-snug"
            style={{ fontSize: "clamp(0.78rem, 3cqw, 1.3rem)" }}
          >
            {subtitle}
          </p>
        </div>

        {/* Hover gem glow on the spine emblem (measured ~50%, 46.5%) */}
        <div
          className="pointer-events-none absolute opacity-0 transition-opacity duration-400 group-hover:opacity-100"
          style={{
            left: "46%",
            top: "36%",
            width: "8%",
            height: "20%",
            background:
              "radial-gradient(ellipse at center, rgba(80,140,255,0.55) 0%, rgba(80,140,255,0.15) 45%, transparent 72%)",
            filter: "blur(6px)",
          }}
          aria-hidden
        />

        {/* Inset focus ring on the book body for keyboard users */}
        <div
          className="pointer-events-none absolute rounded-md group-focus-visible:ring-2 group-focus-visible:ring-[#0ac8ff]"
          style={{ left: "6.3%", top: "11.5%", width: "87%", height: "72%" }}
          aria-hidden
        />
      </div>
    </Link>
  );
}
