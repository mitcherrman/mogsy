import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdBanner from "@/components/AdBanner";
import { logAdEvent } from "@/lib/ad-analytics";

interface SwipeAdProps {
  onClose: () => void;
  isPro: boolean;
  /** When set, renders a Google AdSense unit instead of the placeholder */
  adsenseSlot?: string;
  adsenseClientId?: string;
}

export default function SwipeAd({ onClose, isPro, adsenseSlot, adsenseClientId }: SwipeAdProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (isPro) {
      onClose();
      return;
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sponsored</p>
            {isAdsense ? (
              <div className="h-60 rounded-xl overflow-hidden">
                <AdBanner
                  slot={adsenseSlot}
                  format="rectangle"
                  clientId={adsenseClientId}
                  className="w-full h-full"
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
          </div>

          {countdown > 0 ? (
            <p className="text-sm text-muted-foreground">
              Continue in <span className="font-bold text-foreground">{countdown}s</span>
            </p>
          ) : (
            <Button onClick={onClose} variant="outline" className="w-full">
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
