import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdBanner from "@/components/AdBanner";
import { logAdEvent } from "@/lib/ad-analytics";

interface SwipeAdProps {
  onClose: () => void;
  isPro: boolean;
  adsenseSlot?: string;
  adsenseClientId?: string;
  placement?: string;
  adSource?: string;
  profileId?: string;
}

export default function SwipeAd({ onClose, isPro, adsenseSlot, adsenseClientId, placement = "swipe", adSource = "custom", profileId }: SwipeAdProps) {
  const [countdown, setCountdown] = useState(5);
  const [adStatus, setAdStatus] = useState<"waiting" | "filled" | "unfilled">("waiting");
  const logged = useRef(false);

  useEffect(() => {
    if (isPro) {
      onClose();
      return;
    }
    if (!logged.current) {
      logged.current = true;
      logAdEvent({ eventType: "impression", placement, adMode: "popup", adSource, profileId });
    }
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
  }, [isPro, onClose]);

  if (isPro) return null;

  const isAdsense = !!adsenseSlot;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card p-8 text-center"
        >
          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Sponsored</p>
              {isAdsense && <AdSenseStatusPill status={adStatus} />}
            </div>
            {isAdsense ? (
              <div className="h-60 rounded-xl overflow-hidden">
                <AdBanner
                  slot={adsenseSlot}
                  format="rectangle"
                  clientId={adsenseClientId}
                  className="w-full h-full"
                  onStatusChange={setAdStatus}
                />
              </div>
            ) : (
              <div className="h-60 rounded-xl bg-secondary flex items-center justify-center">
                <div className="text-center">
                  <p className="text-4xl mb-2">📢</p>
                  <p className="text-sm text-muted-foreground">Ad space</p>
                  <p className="text-xs text-muted-foreground mt-1">Google AdSense will display here</p>
                </div>
              </div>
            )}
            {isAdsense && adStatus === "unfilled" && (
              <p className="mt-2 text-[11px] text-amber-500 flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Google didn't return an ad for this slot.
              </p>
            )}
          </div>

          {countdown > 0 ? (
            <p className="text-sm text-muted-foreground">
              Continue in <span className="font-bold text-foreground">{countdown}s</span>
            </p>
          ) : (
            <Button onClick={() => {
              logAdEvent({ eventType: "skip", placement, adMode: "popup", adSource, profileId });
              onClose();
            }} variant="outline" className="w-full">
              <X className="h-4 w-4 mr-1" /> Continue Swiping
            </Button>
          )}

          <p className="text-[10px] text-muted-foreground mt-4">
            Remove ads with <span className="text-primary font-medium">Mogsy Pro</span>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AdSenseStatusPill({ status }: { status: "waiting" | "filled" | "unfilled" }) {
  if (status === "filled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
        <CheckCircle2 className="h-2.5 w-2.5" /> AdSense live
      </span>
    );
  }
  if (status === "unfilled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold">
        <AlertTriangle className="h-2.5 w-2.5" /> No fill from Google
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
      <Loader2 className="h-2.5 w-2.5 animate-spin" /> AdSense pending
    </span>
  );
}
