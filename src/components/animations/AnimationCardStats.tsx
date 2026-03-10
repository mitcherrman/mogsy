import { Globe } from "lucide-react";
import EloChangeIndicator from "@/components/EloChangeIndicator";

export interface AnimationCardItem {
  imageUrl: string | null;
  name: string;
  subtitle?: string;
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
}

export default function AnimationCardStats({ item }: { item: AnimationCardItem }) {
  return (
    <div className="px-2 py-1.5 flex-shrink-0 relative z-20">
      <h3 className="text-sm md:text-base lg:text-lg font-extrabold text-foreground truncate text-center">{item.name}</h3>
      {item.subtitle && <p className="text-[10px] md:text-xs text-muted-foreground truncate text-center">{item.subtitle}</p>}
      {item.eloVisible && (
        <div className="flex items-center justify-center gap-3 mt-0.5">
          <span className="text-[10px] md:text-xs text-muted-foreground inline-flex items-center gap-0.5">
            <span className="font-semibold text-primary">{item.localElo ?? 1200}</span>
            {item.rankVisible && item.localRank && (
              <span className="text-muted-foreground/70">#{item.localRank}</span>
            )}
            {item.globalElo !== undefined && (
              <>
                <span className="mx-1 text-muted-foreground/30">|</span>
                <Globe className="h-2.5 w-2.5 text-blue-400/70" />
                <span className="font-semibold text-blue-400">{item.globalElo}</span>
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
