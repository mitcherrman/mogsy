import { Globe } from "lucide-react";
import { motion } from "framer-motion";
import EloChangeIndicator from "@/components/EloChangeIndicator";

export interface AnimationCardItem {
  imageUrl: string | null;
  imageStyle?: React.CSSProperties;
  name: string;
  subtitle?: string;
  titleImageUrl?: string;
  titleImageScale?: number;
  titleImageOffsetY?: number;
  titleImageMaxHeight?: number;
  localElo?: number;
  localRank?: number;
  globalElo?: number;
  globalRank?: number;
  eloVisible?: boolean;
  rankVisible?: boolean;
  eloChange?: number | null;
  rankOld?: number | null;
  rankNew?: number | null;
  globalDirection?: "up" | "down" | "none";
  showGlobalStats?: boolean;
}

function getTitleImgStyle(item: AnimationCardItem, compact: boolean): React.CSSProperties {
  const scale = item.titleImageScale ?? 1;
  const offsetY = item.titleImageOffsetY ?? 0;
  const maxHeight = item.titleImageMaxHeight && item.titleImageMaxHeight > 0
    ? `${item.titleImageMaxHeight}px`
    : undefined;
  return {
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    marginTop: `${offsetY}px`,
    maxHeight,
  };
}

function AuraChangeOverlay({ item }: { item: AnimationCardItem }) {
  const change = item.eloChange;
  if (change === null || change === undefined) return null;

  const isPositive = change > 0;
  const rankChanged = item.rankOld != null && item.rankNew != null && item.rankOld !== item.rankNew;

  return (
    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center gap-0.5 z-[60] pointer-events-none mb-1">
      <motion.div
        initial={{ scale: 0, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.05 }}
        className={`px-3 py-1 rounded-full font-extrabold text-lg shadow-lg ${
          isPositive
            ? "bg-emerald-500/85 text-white shadow-emerald-500/30"
            : "bg-red-500/85 text-white shadow-red-500/30"
        }`}
      >
        {isPositive ? "+" : ""}{change}
      </motion.div>

      {rankChanged && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            item.rankNew! < item.rankOld!
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          #{item.rankOld} → #{item.rankNew} {item.rankNew! < item.rankOld! ? "▲" : "▼"}
        </motion.div>
      )}
    </div>
  );
}

export default function AnimationCardStats({ item, compact = false }: { item: AnimationCardItem; compact?: boolean }) {
  if (compact) {
    return (
      <div className="px-1.5 py-0.5 flex-shrink-0 relative z-20">
        <AuraChangeOverlay item={item} />
        <div className="flex items-center justify-between gap-1">
          {item.titleImageUrl ? (
                    <img src={item.titleImageUrl} alt={item.name} className="w-auto object-contain" style={getTitleImgStyle(item, true)} draggable={false} />
                  ) : (
                    <h3 className="text-xs font-extrabold text-foreground truncate">{item.name}</h3>
                  )}
          {item.eloVisible && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 whitespace-nowrap shrink-0">
              <span className="font-semibold text-primary">{item.localElo ?? 1200}</span>
              {item.rankVisible && item.localRank && (
                <span className="text-muted-foreground/70">#{item.localRank}</span>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 flex-shrink-0 relative z-20">
      <AuraChangeOverlay item={item} />
      {item.titleImageUrl ? (
        <img src={item.titleImageUrl} alt={item.name} className="w-auto object-contain mx-auto" style={getTitleImgStyle(item, false)} draggable={false} />
      ) : (
        <h3 className="text-sm md:text-base lg:text-lg font-extrabold text-foreground truncate text-center">{item.name}</h3>
      )}
      {!item.titleImageUrl && item.subtitle && <p className="text-[10px] md:text-xs text-muted-foreground truncate text-center">{item.subtitle}</p>}
      {item.eloVisible && (
        <div className="flex items-center justify-center gap-3 mt-0.5">
          <span className="text-[10px] md:text-xs text-muted-foreground inline-flex items-center gap-0.5">
            <span className="font-semibold text-primary">{item.localElo ?? 1200}</span>
            {item.rankVisible && item.localRank && (
              <span className="text-muted-foreground/70">#{item.localRank}</span>
            )}
            {item.showGlobalStats !== false && (
              <>
                <span className="mx-1 text-muted-foreground/30">|</span>
                <Globe className="h-2.5 w-2.5 text-blue-400/70" />
                <span className="font-semibold text-blue-400">{item.globalElo ?? 1200}</span>
                {item.rankVisible && item.globalRank && (
                  <span className="text-blue-400/70">#{item.globalRank}</span>
                )}
              </>
            )}
          </span>
        </div>
      )}
      <div className="flex justify-center mt-0.5">
        <EloChangeIndicator
          change={item.eloChange ?? null}
          oldRank={item.rankOld ?? null}
          newRank={item.rankNew ?? null}
          globalDirection={item.globalDirection}
        />
      </div>
    </div>
  );
}
