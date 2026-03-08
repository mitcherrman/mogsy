import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AdBanner from "@/components/AdBanner";
import { logAdEvent } from "@/lib/ad-analytics";

export interface AdCreative {
  id: string;
  title: string;
  image_url: string;
  brand_name: string;
  cta_text: string;
  destination_url: string;
  view_duration_seconds: number;
}

interface SwipeAdCardProps {
  creative?: AdCreative | null;
  onSkip: () => void;
  /** When set, renders a Google AdSense unit instead of a custom creative */
  adsenseSlot?: string;
  adsenseClientId?: string;
}

export default function SwipeAdCard({ creative, onSkip, adsenseSlot, adsenseClientId }: SwipeAdCardProps) {
  const duration = creative?.view_duration_seconds ?? 5;
  const [countdown, setCountdown] = useState(duration);

  useEffect(() => {
    setCountdown(duration);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [creative?.id, duration, adsenseSlot]);

  const isAdsense = !!adsenseSlot;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col flex-1 min-h-0 rounded-2xl border border-border bg-card overflow-hidden relative"
    >
      {/* Sponsored badge */}
      <div className="absolute top-2 left-2 z-10">
        <Badge variant="secondary" className="text-[10px] gap-1 bg-secondary/90 backdrop-blur-sm">
          <Megaphone className="h-2.5 w-2.5" /> Sponsored
        </Badge>
      </div>

      {/* Content area */}
      <div className="w-full aspect-[3/4] sm:aspect-[3/4] bg-muted/30 overflow-hidden relative">
        {isAdsense ? (
          <div className="w-full h-full flex items-center justify-center p-2">
            <AdBanner
              slot={adsenseSlot}
              format="rectangle"
              clientId={adsenseClientId}
              className="w-full h-full"
            />
          </div>
        ) : creative?.image_url ? (
          <img
            src={creative.image_url}
            alt={creative?.title || "Ad"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="text-center">
              <p className="text-4xl mb-2">📢</p>
              <p className="text-sm text-muted-foreground">Ad Space</p>
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {countdown > 0 && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-card/90 rounded-full h-16 w-16 flex items-center justify-center border border-border shadow-lg">
              <span className="text-2xl font-black text-foreground tabular-nums">{countdown}</span>
            </div>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="p-3 space-y-2 flex-shrink-0">
        {!isAdsense && creative && (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{creative.brand_name}</p>
            <h3 className="text-sm font-extrabold text-foreground truncate">{creative.title}</h3>
          </>
        )}
        {isAdsense && (
          <p className="text-[10px] text-muted-foreground text-center">Advertisement</p>
        )}

        {countdown > 0 ? (
          <p className="text-[10px] text-muted-foreground text-center">
            Skip in <span className="font-bold text-foreground">{countdown}s</span>
          </p>
        ) : (
          <div className="flex gap-2">
            {!isAdsense && creative?.destination_url && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs h-7"
                onClick={() => window.open(creative.destination_url, "_blank")}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> {creative.cta_text}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className={`text-xs h-7 ${isAdsense ? "w-full" : "flex-1"}`}
              onClick={onSkip}
            >
              Skip
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
