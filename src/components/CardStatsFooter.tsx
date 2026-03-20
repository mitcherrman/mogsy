import React from "react";
import { Globe, Flag } from "lucide-react";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import { type CardStatsConfig, DEFAULT_CARD_STATS_CONFIG } from "@/hooks/useAppSettings";

const FONT_SIZE_CLASS: Record<string, string> = {
  "2xs": "text-[8px]", "xs": "text-[10px]", "sm": "text-xs", "base": "text-sm", "lg": "text-base",
};
const FONT_WEIGHT_CLASS: Record<string, string> = {
  normal: "font-normal", medium: "font-medium", semibold: "font-semibold", bold: "font-bold",
};
const COLOR_SCHEME_CLASSES: Record<string, { aura: string; rank: string; global: string }> = {
  default: { aura: "text-primary", rank: "text-muted-foreground/70", global: "text-blue-400" },
  muted: { aura: "text-muted-foreground", rank: "text-muted-foreground/50", global: "text-muted-foreground/70" },
  accent: { aura: "text-accent-foreground", rank: "text-accent-foreground/70", global: "text-accent-foreground" },
  custom: { aura: "text-primary", rank: "text-muted-foreground/70", global: "text-blue-400" },
};

interface Props {
  config: CardStatsConfig;
  isMobile: boolean;
  itemName: string;
  subtitle?: string;
  titleImageUrl?: string | null;
  titleImageStyle?: React.CSSProperties;
  localElo: number;
  localRank?: number;
  globalElo?: number;
  globalRank?: number;
  eloChange?: number | null;
  rankOld?: number | null;
  rankNew?: number | null;
  globalDirection?: "up" | "down" | "none";
  statsHidden: boolean;
  hasMultipleImages: boolean;
  onChoose: () => void;
  onReport: () => void;
}

export default function CardStatsFooter({
  config, isMobile, itemName, subtitle, titleImageUrl, titleImageStyle,
  localElo, localRank, globalElo, globalRank,
  eloChange, rankOld, rankNew, globalDirection,
  statsHidden, hasMultipleImages, onChoose, onReport,
}: Props) {
  const c = config || DEFAULT_CARD_STATS_CONFIG;
  const fontSize = FONT_SIZE_CLASS[c.font_size] || "text-[10px]";
  const fontWeight = FONT_WEIGHT_CLASS[c.font_weight] || "font-semibold";
  const colors = COLOR_SCHEME_CLASSES[c.color_scheme] || COLOR_SCHEME_CLASSES.default;

  const positionClass = c.position === "bottom-left" ? "text-left" :
    c.position === "bottom-right" ? "text-right" : "text-center";

  const justifyClass = c.position === "bottom-left" ? "justify-start" :
    c.position === "bottom-right" ? "justify-end" : "justify-center";

  return (
    <div className={`${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} flex-shrink-0 relative z-20 ${titleImageUrl ? 'overflow-visible' : ''}`}>
      {/* Name row */}
      <div className={`flex items-center gap-1 ${justifyClass}`}>
        <div className={`min-w-0 ${positionClass} flex-1`}>
          {titleImageUrl ? (
            <img src={titleImageUrl} alt={itemName} className="w-auto object-contain cursor-pointer" style={titleImageStyle} draggable={false} onClick={onChoose} />
          ) : (
            <>
              <h3 className={`${isMobile ? 'text-xs' : 'text-sm md:text-base lg:text-lg'} font-extrabold text-foreground truncate`}>{itemName}</h3>
              {!isMobile && subtitle && <p className="text-[10px] md:text-xs text-muted-foreground truncate">{subtitle}</p>}
            </>
          )}
        </div>
        {hasMultipleImages && (
          <button onClick={(e) => { e.stopPropagation(); onReport(); }}
            className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors shrink-0`}
            title="Report image">
            <Flag className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* Stats row — fixed bottom position */}
      <div className={`flex items-center ${justifyClass} gap-1 mt-0.5 ${statsHidden ? "invisible" : ""}`}>
        <span className={`${fontSize} text-muted-foreground inline-flex items-center gap-0.5 whitespace-nowrap`}>
          {c.show_aura && (
            <span className={`${fontWeight} ${colors.aura}`}>{localElo}</span>
          )}
          {c.show_rank && localRank && (
            <span className={colors.rank}>{c.rank_label}{localRank}</span>
          )}
          {c.show_global && globalElo && (
            <>
              <span className="mx-0.5 text-muted-foreground/30">|</span>
              <Globe className="h-2.5 w-2.5 text-blue-400/70" />
              <span className={`${fontWeight} ${colors.global}`}>{globalElo}</span>
              {c.show_rank && globalRank && (
                <span className="text-blue-400/70">{c.rank_label}{globalRank}</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Elo change indicator */}
      {c.show_elo_change && (
        <div className={`flex ${justifyClass} mt-0.5 ${statsHidden ? "invisible" : ""}`}>
          <EloChangeIndicator
            change={eloChange ?? null}
            oldRank={rankOld ?? null}
            newRank={rankNew ?? null}
            globalDirection={globalDirection}
          />
        </div>
      )}
    </div>
  );
}
