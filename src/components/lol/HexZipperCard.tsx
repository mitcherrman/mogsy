import { Link } from "react-router-dom";
import { ArrowRight, Shield } from "lucide-react";
import { useState } from "react";
import { useChampionImage } from "@/hooks/useChampionImage";

export type HexZipperSide = "left" | "right";

type Props = {
  to: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  side: HexZipperSide;
  /** Champion name used to look up the portrait via existing asset system. */
  championName?: string;
  /** Larger flagship treatment (used for Combat Lab). */
  flagship?: boolean;
};

/**
 * Hextech-styled clipped-corner card used in the LoL Hub zipper layout.
 * Champion art pops out from the outer edge on hover.
 */
export default function HexZipperCard({
  to,
  title,
  description,
  Icon,
  side,
  championName,
  flagship = false,
}: Props) {
  const championImageUrl = useChampionImage(championName);
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = !!championImageUrl && !imgFailed;

  // Octagonal/hex-ish clip — angled top-left & bottom-right corners.
  const clipPath =
    "polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px)";

  const isRight = side === "right";
  const heightCls = flagship ? "min-h-[240px]" : "min-h-[170px]";
  const titleCls = flagship ? "text-3xl md:text-4xl" : "text-xl md:text-2xl";
  const iconSize = flagship ? "h-14 w-14" : "h-10 w-10";
  const iconBox = flagship ? "p-5" : "p-3.5";
  const championHeight = flagship ? "h-[420px]" : "h-[300px]";

  return (
    <div
      className={`group relative ${heightCls} transition-transform duration-500 ease-out will-change-transform ${
        isRight ? "hover:translate-x-6" : "hover:-translate-x-6"
      } hover:scale-[1.02]`}
    >
      {/* Champion popout — always rendered, sits BEHIND the card and slides out on hover */}
      <div
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${championHeight} aspect-square z-0 transition-all duration-500 ease-out opacity-0 group-hover:opacity-100 ${
          isRight
            ? "right-0 translate-x-2 group-hover:translate-x-[45%]"
            : "left-0 -translate-x-2 group-hover:-translate-x-[45%]"
        }`}
      >
        {hasImage ? (
          <img
            src={championImageUrl}
            alt=""
            aria-hidden
            onError={() => setImgFailed(true)}
            className={`h-full w-full object-contain drop-shadow-[0_15px_40px_rgba(10,200,255,0.45)] ${
              isRight ? "" : "scale-x-[-1]"
            }`}
          />
        ) : (
          // Fallback silhouette so the popout always shows, per spec.
          <div className="relative h-full w-full flex items-center justify-center">
            <div
              className="absolute inset-[15%] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(10,200,255,0.35) 0%, rgba(10,200,255,0.05) 55%, transparent 75%)",
                filter: "blur(8px)",
              }}
            />
            <Shield
              className="relative h-1/2 w-1/2 text-[#0ac8ff]/70"
              strokeWidth={1.25}
            />
          </div>
        )}
      </div>

      {/* Outer Hextech border layer (cyan) */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#0ac8ff]/40 via-[#c9a84c]/20 to-[#0ac8ff]/40 transition-opacity duration-300 group-hover:from-[#0ac8ff]/80 group-hover:to-[#0ac8ff]/80 z-10"
        style={{ clipPath }}
      />
      {/* Animated traveling light pulse around the clipped border */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 overflow-hidden"
        style={{ clipPath }}
        aria-hidden
      >
        <div className="hex-border-pulse absolute inset-[-2px]" />
      </div>

      {/* Inner card body */}
      <Link
        to={to}
        aria-label={title}
        className="absolute inset-[2px] z-20 flex items-center gap-5 px-6 py-5 bg-gradient-to-br from-[#0a1428] via-[#091428] to-[#020610] overflow-hidden"
        style={{
          clipPath,
          boxShadow:
            "inset 0 0 30px rgba(10,200,255,0.08), inset 0 0 0 1px rgba(201,168,76,0.15)",
        }}
      >
        {/* subtle inner glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(10,200,255,0.18) 0%, transparent 70%)",
          }}
        />

        {/* icon */}
        <div
          className={`relative shrink-0 ${iconBox} bg-black/50 border border-[#c9a84c]/40 group-hover:border-[#0ac8ff]/60 transition-colors`}
          style={{
            clipPath:
              "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
          }}
        >
          <Icon className={`${iconSize} text-[#c9a84c] group-hover:text-[#e6c66a] transition-colors`} />
        </div>

        {/* text */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[#0ac8ff]/80">
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold">
              {flagship ? "Flagship" : "Feature"}
            </span>
          </div>
          <h3
            className={`${titleCls} font-extrabold tracking-tight text-[#f0e6d2] group-hover:text-white transition-colors`}
            style={{ textShadow: "0 0 18px rgba(10,200,255,0.25)" }}
          >
            {title}
          </h3>
          <p className="text-xs md:text-sm text-[#a09b8c] mt-1 max-w-md">{description}</p>
        </div>

        <ArrowRight
          className={`relative h-5 w-5 text-[#c9a84c] transition-all duration-300 ${
            isRight ? "group-hover:translate-x-1" : "group-hover:-translate-x-1"
          }`}
        />
      </Link>
    </div>
  );
}