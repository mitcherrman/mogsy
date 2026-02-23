import { forwardRef, ReactNode } from "react";
import mogsyLogo from "@/assets/mogsy-logo.png";

interface MatchupCaptureProps {
  leagueName: string;
  children: ReactNode;
}

const MatchupCapture = forwardRef<HTMLDivElement, MatchupCaptureProps>(
  ({ leagueName, children }, ref) => {
    return (
      <div
        ref={ref}
        className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-card via-background to-card border border-border p-4"
      >
        {/* Branding header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src={mogsyLogo} alt="Mogsy" className="h-6 w-6 rounded-md" />
            <span className="text-sm font-extrabold text-foreground tracking-tight">MOGSY</span>
          </div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {leagueName}
          </span>
        </div>

        {/* Matchup content */}
        {children}

        {/* Footer watermark */}
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground font-medium">mogsy.lovable.app</span>
        </div>
      </div>
    );
  }
);

MatchupCapture.displayName = "MatchupCapture";
export default MatchupCapture;
