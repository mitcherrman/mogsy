import { forwardRef, ReactNode } from "react";
import mogsyTextLogo from "@/assets/mogsy-text-logo.png";
import { SITE_DOMAIN } from "@/lib/site-config";
import { cn } from "@/lib/utils";

interface MatchupCaptureProps {
  leagueName: string;
  children: ReactNode;
  centerSlot?: ReactNode;
  isMobile?: boolean;
}

const MatchupCapture = forwardRef<HTMLDivElement, MatchupCaptureProps>(
  ({ leagueName, children, centerSlot, isMobile }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-2xl overflow-hidden bg-card border border-border",
          isMobile ? "p-1.5" : "p-3"
        )}
      >
        {/* Branding header */}
        <div className={cn("flex items-center justify-between", isMobile ? "mb-1" : "mb-2")}>
          <div className="flex items-center">
            <img src={mogsyTextLogo} alt="Mogsy" className={cn("object-contain", isMobile ? "h-4" : "h-5")} />
          </div>
          {centerSlot && (
            <div className="flex items-center justify-center">
              {centerSlot}
            </div>
          )}
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {leagueName}
          </span>
        </div>

        {/* Matchup content */}
        {children}

        {/* Footer watermark */}
        <div className={cn(
          "flex items-center justify-center border-t border-border/50",
          isMobile ? "mt-1 pt-1" : "mt-2 pt-1.5"
        )}>
          <span className="text-[9px] text-muted-foreground font-medium">{SITE_DOMAIN}</span>
        </div>
      </div>
    );
  }
);

MatchupCapture.displayName = "MatchupCapture";
export default MatchupCapture;
