import { forwardRef, ReactNode } from "react";
import mogsyLogo from "@/assets/mogsy-logo.png";
import { SITE_DOMAIN } from "@/lib/site-config";

interface MatchupCaptureProps {
  leagueName: string;
  children: ReactNode;
}

const MatchupCapture = forwardRef<HTMLDivElement, MatchupCaptureProps>(
  ({ leagueName, children }, ref) => {
    return (
      <div
        ref={ref}
        className="relative rounded-2xl overflow-hidden bg-card border border-border p-3"
      >
        {/* Branding header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <img src={mogsyLogo} alt="Mogsy" className="h-5 w-5 rounded-md" />
            <span className="text-xs font-extrabold text-foreground tracking-tight">MOGSY</span>
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {leagueName}
          </span>
        </div>

        {/* Matchup content */}
        {children}

        {/* Footer watermark */}
        <div className="flex items-center justify-center mt-2 pt-1.5 border-t border-border/50">
          <span className="text-[9px] text-muted-foreground font-medium">{SITE_DOMAIN}</span>
        </div>
      </div>
    );
  }
);

MatchupCapture.displayName = "MatchupCapture";
export default MatchupCapture;
