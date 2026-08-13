import type { AcademyMode } from "./academyModes";

/**
 * One mode preview plate.
 *
 * Two of the four modes have finished Academy artwork with the mode name
 * engraved into the image; the other two do not. Rather than let the row read
 * as "two designed cards and two placeholders", both paths render the same
 * frame, the same aspect box, and the same caption underneath — only the inside
 * of the plate differs. The composed fallback deliberately mirrors the artwork's
 * construction (sparkle, ringed emblem, engraved name, diamond) so the four read
 * as one set.
 *
 * The cards are NOT links. This stage is a preview, not a menu: making them
 * navigable would fork the introduction halfway through and strand the visitor
 * without ever recording an outcome. The choice comes on the next stage.
 */
export default function AcademyModeCard({ mode }: { mode: AcademyMode }) {
  const { title, description, Icon, art } = mode;

  return (
    <figure className="flex flex-col items-center text-center">
      <div
        className={[
          "relative w-full overflow-hidden rounded-xl",
          "border border-[#c9a84c]/25 bg-[#0a0d18]",
          "shadow-[0_10px_30px_rgba(0,0,0,0.55)]",
          // 7:8 is chosen to sit between the two supplied plates' own ratios
          // (0.875 and 0.896), so `cover` below trims only a few pixels.
          "aspect-[7/8]",
        ].join(" ")}
      >
        {art ? (
          // `cover`, not `contain`. The artwork is itself a finished dark plate
          // with a small bright emblem — mean luma is ~23/255 — so letterboxing
          // it inside this card's own dark frame reads as an empty box with a
          // speck in the middle. Filling the frame makes the artwork BE the card
          // face. Both plates are wider than 7:8, so the crop is horizontal
          // only and the engraved name at the bottom is never cut.
          <img
            src={art}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <ComposedPlate title={title} Icon={Icon} />
        )}
      </div>

      {/*
        Every plate — painted or composed — already shows the mode name inside
        the frame, so this heading is the assistive-tech equivalent rather than
        a second visible label. It is always present (and always hidden) so the
        heading structure is identical across all four cards no matter which
        ones have artwork yet.
      */}
      <h2 className="sr-only">{title}</h2>

      <figcaption className="mt-3 text-[13px] leading-snug text-[#cfc4a5]/80 sm:text-sm">
        {description}
      </figcaption>
    </figure>
  );
}

/** Four-point sparkle, echoing the ornament at the top of the finished plates. */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 0.5 L9.6 6.4 L15.5 8 L9.6 9.6 L8 15.5 L6.4 9.6 L0.5 8 L6.4 6.4 Z"
        fill="#c8a2ff"
        opacity="0.75"
      />
    </svg>
  );
}

/**
 * Stand-in plate for a mode with no finished artwork yet (Combat Lab, Stat
 * Check). Built from the same parts as the real plates so the set stays
 * coherent; replacing it later is a one-line change in academyModes.ts.
 */
function ComposedPlate({ title, Icon }: { title: string; Icon: React.ElementType }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
      {/* Warm pool of light behind the emblem, as on the painted plates. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 42%, rgba(201,168,76,0.16) 0%, rgba(201,168,76,0.05) 45%, transparent 72%)",
        }}
      />

      <Sparkle className="absolute left-1/2 top-[7%] h-3 w-3 -translate-x-1/2" />

      <div className="relative flex h-[42%] w-[42%] items-center justify-center rounded-full border border-[#c9a84c]/45">
        <div
          className="absolute inset-[6%] rounded-full"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(240,215,140,0.13) 0%, transparent 70%)",
          }}
        />
        <Icon className="relative h-1/2 w-1/2 text-[#f0d78c]" aria-hidden="true" />
      </div>

      {/* Engraved name, positioned to match where the painted plates carry it. */}
      <span
        className="ranked-title relative mt-[12%] text-balance text-[clamp(0.8rem,1.6vw,1rem)] leading-tight text-[#e3d7b2]"
        aria-hidden="true"
      >
        {title}
      </span>
      <svg viewBox="0 0 12 12" className="relative mt-1.5 h-2 w-2" fill="none" aria-hidden="true">
        <path d="M6 1 L10 6 L6 11 L2 6 Z" fill="#c9a84c" opacity="0.6" />
      </svg>
    </div>
  );
}
