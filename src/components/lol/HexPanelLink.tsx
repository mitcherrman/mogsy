import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Clipped Hextech navigation panel — the hero selector's visual language
 * (chamfered silhouette, layered navy surface, cyan/gold accent border)
 * applied to a full navigation card. Two-layer structure: the outer div is
 * the accent "border", the inner offset div is the panel surface, both
 * sharing the same clip so the chamfer reads as a framed edge.
 *
 * `compact` renders the denser variant used by the League Swipe game grid.
 */

const PANEL_CLIP =
  "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)";

const ACCENTS = {
  cyan: {
    frame: "bg-gradient-to-br from-[#0ac8ff]/50 via-[#0ac8ff]/15 to-[#0ac8ff]/40",
    frameHover: "group-hover:from-[#0ac8ff]/80 group-hover:to-[#0ac8ff]/60",
    icon: "text-[#0ac8ff]",
    iconTile: "border-[#0ac8ff]/30 bg-[#0ac8ff]/10",
    arrowHover: "group-hover:text-[#0ac8ff]",
  },
  gold: {
    frame: "bg-gradient-to-br from-[#c9a84c]/60 via-[#c9a84c]/20 to-[#c9a84c]/45",
    frameHover: "group-hover:from-[#c9a84c]/90 group-hover:to-[#c9a84c]/65",
    icon: "text-[#c9a84c]",
    iconTile: "border-[#c9a84c]/30 bg-[#c9a84c]/10",
    arrowHover: "group-hover:text-[#c9a84c]",
  },
} as const;

export type HexPanelAccent = keyof typeof ACCENTS;

export default function HexPanelLink({
  to,
  title,
  description,
  Icon,
  accent = "cyan",
  compact = false,
  onClick,
}: {
  to: string;
  title: string;
  description?: string;
  Icon: React.ElementType;
  accent?: HexPanelAccent;
  compact?: boolean;
  onClick?: () => void;
}) {
  const a = ACCENTS[accent];
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group relative block transition-transform hover:scale-[1.01] active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none"
    >
      {/* Accent frame layer */}
      <div
        className={`absolute inset-0 ${a.frame} ${a.frameHover} transition-colors`}
        style={{ clipPath: PANEL_CLIP }}
        aria-hidden
      />
      {/* Panel surface — inset focus ring so the clip never cuts the outline */}
      <div
        className={`relative m-[1px] bg-gradient-to-br from-[#0e1e38] via-[#0a1428] to-[#050d1c] group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-[#0ac8ff] ${
          compact ? "p-3" : "p-4"
        }`}
        style={{
          clipPath: PANEL_CLIP,
          boxShadow: "inset 0 0 24px rgba(10,200,255,0.06)",
        }}
      >
        <div className={`flex items-center ${compact ? "gap-2.5" : "gap-3.5"}`}>
          <div
            className={`shrink-0 border ${a.iconTile} ${compact ? "p-2" : "p-2.5"}`}
            style={{
              clipPath:
                "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
            }}
          >
            <Icon className={`${compact ? "h-4 w-4" : "h-5 w-5"} ${a.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`font-bold text-[#f0e6d2] truncate ${compact ? "text-sm" : "text-base"}`}>
                {title}
              </h3>
              <ArrowRight
                className={`shrink-0 h-4 w-4 text-[#a09b8c] transition-all group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 ${a.arrowHover}`}
              />
            </div>
            {description && (
              <p className={`text-[#a09b8c] ${compact ? "text-[11px] mt-0.5 line-clamp-2" : "text-xs mt-1"}`}>
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
