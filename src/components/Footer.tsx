import { Link, useLocation } from "react-router-dom";
import { Shield, FileText, Info, Mail, Lock, MessageSquarePlus } from "lucide-react";
import { SITE_NAME, LEAGUE_ONLY_MODE } from "@/lib/site-config";

const links = [
  { to: "/about", label: "About", icon: Info },
  // The Feedback Center's only discoverable entry point. /contact is a mailto:
  // form for account and legal matters; product reports belong here, where they
  // are recorded and get a status the reporter can follow.
  { to: "/feedback", label: "Feedback", icon: MessageSquarePlus },
  { to: "/privacy", label: "Privacy Policy", icon: Lock },
  { to: "/terms", label: "Terms of Service", icon: FileText },
  { to: "/security", label: "Security", icon: Shield },
  { to: "/contact", label: "Contact", icon: Mail },
];

/** The trust/compliance subset. Nothing is dropped from the app — these are the
 *  destinations no other surface carries. */
const LEGAL_ONLY = new Set(["/privacy", "/terms", "/security"]);

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
    pathname.startsWith("/dev/stat-check") ||
    // RG1: the dev Ranked shell probe mirrors /quiz/ranked exactly, footer included.
    pathname.startsWith("/dev/ranked-shell-probe") ||
    pathname.startsWith("/admin");
  if (hidden) return null;

  // The /lol hub grew its own community + About/Feedback/Contact band directly
  // above this footer, so repeating those four here would be the same links
  // twice within one screen. On that ONE route the footer narrows to the legal
  // set and its copy, which is what the brief means by a compact conventional
  // footer subordinate to the sections above it. Every other page is unchanged,
  // and no destination becomes unreachable.
  const legalOnly = pathname === "/lol";
  const visibleLinks = legalOnly ? links.filter((l) => LEGAL_ONLY.has(l.to)) : links;

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
          <nav
            aria-label="Footer"
            data-testid="site-footer-nav"
            data-variant={legalOnly ? "legal-only" : "full"}
            className={
              legalOnly
                ? "grid grid-cols-2 sm:grid-cols-3 gap-x-6 text-sm"
                : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 text-sm"
            }
          >
            {visibleLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-1.5 py-2.5 text-muted-foreground hover:text-foreground transition-colors"
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
    </footer>
  );
}