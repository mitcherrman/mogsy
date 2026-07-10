import { Link, useLocation } from "react-router-dom";
import { Shield, FileText, Info, Mail, Lock } from "lucide-react";
import { SITE_NAME, LEAGUE_ONLY_MODE } from "@/lib/site-config";

const links = [
  { to: "/about", label: "About", icon: Info },
  { to: "/privacy", label: "Privacy Policy", icon: Lock },
  { to: "/terms", label: "Terms of Service", icon: FileText },
  { to: "/security", label: "Security", icon: Shield },
  { to: "/contact", label: "Contact", icon: Mail },
];

/**
 * Sitewide footer rendered inside Layout. Hidden on immersive gameplay routes
 * where the bottom mobile navbar overlaps and the swipe surface needs the
 * full viewport. All trust/compliance pages remain reachable via direct URL.
 */
export default function Footer() {
  const { pathname } = useLocation();
  const hidden =
    pathname.startsWith("/swipe-game") ||
    pathname.startsWith("/swipe/preset") ||
    pathname.startsWith("/multiplayer/game") ||
    pathname.startsWith("/combat-lab/diagnostics") ||
    pathname.startsWith("/quiz") ||
    pathname.startsWith("/admin");
  if (hidden) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="relative z-20 mt-16 border-t border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div className="max-w-sm">
            <div className="text-lg font-bold tracking-tight text-foreground">{SITE_NAME}</div>
            <p className="mt-2 text-sm text-muted-foreground">
              {LEAGUE_ONLY_MODE
                ? "League of Legends quizzes, game knowledge, and esports trivia."
                : "Community-driven ranking games, quizzes, and competitions for gamers everywhere."}
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-2 text-sm">
            {links.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
          <span>© {year} {SITE_NAME}. All rights reserved.</span>
          <span>Made for gamers and online communities.</span>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
          {SITE_NAME} is an unofficial fan project. {SITE_NAME} isn't endorsed by Riot Games and
          doesn't reflect the views or opinions of Riot Games or anyone officially involved in
          producing or managing Riot Games properties. Riot Games and League of Legends are
          trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
      <div className="h-16 sm:h-0" aria-hidden="true" />
    </footer>
  );
}