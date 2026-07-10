import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Play, User, Diamond, ChevronRight, Users, Palette, Flame } from "lucide-react";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import mogsyLogo from "@/assets/mogsy-logo-text.png";
import lolIcon from "@/assets/lol-icon.png";
import NavBanner from "./NavBanner";
import UserNotificationBell from "./UserNotificationBell";
import { prefetchRoute } from "@/lib/route-prefetch";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";

const baseNavItems = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/play", label: "Play", icon: Play, mode: "play" as const },
  { path: "/swipe", label: "Swipe", icon: Flame, mode: "swipe" as const },

  { path: "/profile", label: "Profile", icon: User },
];

// League-only public mode: nav is trimmed to the League experience.
const leagueNavItems = [
  { path: LEAGUE_HOME_ROUTE, label: "Home", icon: Home },
  { path: "/quiz", label: "Quiz", icon: Play },
  { path: "/profile", label: "Profile", icon: User },
];

function MobileNavButton({ icon: Icon, label, hasTheme, themeId, onClick, badge }: {
  icon: React.ElementType; label: string; hasTheme: boolean; themeId?: string; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-0.5 py-1 px-2">
      <div className="relative">
        <Icon className="h-5 w-5 text-muted-foreground" style={hasTheme ? { color: "hsl(0,0%,70%)" } : undefined} />
        {badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium text-muted-foreground" style={hasTheme ? { color: "hsl(0,0%,70%)" } : undefined}>
        {label}
      </span>
    </button>
  );
}

export default function Navbar({ themeId }: { themeId?: string }) {
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const [navRevealed, setNavRevealed] = useState(false);

  const navItems = LEAGUE_ONLY_MODE
    ? leagueNavItems
    : baseNavItems.filter(item => {
        if (!("mode" in item) || !item.mode) return true;
        return item.mode === settings.nav_tab_mode;
      });

  // Detect game routes where bottom nav should auto-hide
  const isGameRoute = location.pathname.startsWith("/swipe") || location.pathname.includes("/multiplayer/game");

  // Auto-hide nav when route changes
  useEffect(() => {
    setNavRevealed(false);
  }, [location.pathname]);

  // Auto-hide after 6 seconds when revealed on game routes
  useEffect(() => {
    if (navRevealed && isGameRoute) {
      const timer = setTimeout(() => setNavRevealed(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [navRevealed, isGameRoute]);

  useEffect(() => {
    if (user) loadDiamonds();
    else setDiamonds(null);
  }, [user?.id]);

  const loadDiamonds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("diamonds")
      .eq("user_id", user.id)
      .single();
    if (data) setDiamonds(data.diamonds ?? 0);
  };
  const [diamonds, setDiamonds] = useState<number | null>(null);
  const { pendingRequests } = useFriends();
  const pendingCount = pendingRequests.length;

  const hasTheme = themeId && themeId !== "default";

  return (
    <>
      {/* Top bar */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl"
        style={hasTheme ? { background: themeId === "light" ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(20px)", borderColor: themeId === "light" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.1)" } : undefined}
      >
        <div className="container mx-auto flex h-14 items-center px-4 gap-1">
          <Link to="/" className="flex items-center shrink-0">
            <img src={mogsyLogo} alt="Mogsy" className="h-10 sm:h-12 -ml-2 sm:ml-0" />
          </Link>

          <Link
            to="/lol"
            onMouseEnter={() => prefetchRoute("/lol")}
            onFocus={() => prefetchRoute("/lol")}
            onTouchStart={() => prefetchRoute("/lol")}
            aria-label="League of Legends hub"
            title="League of Legends"
            className="shrink-0 rounded-md ring-1 ring-transparent hover:ring-primary/40 transition-all hover:scale-105 active:scale-95"
          >
            <img src={lolIcon} alt="League of Legends" className="h-7 w-7 sm:h-8 sm:w-8 rounded" />
          </Link>

          {/* Rotating swipe-league banner is general Mogsy content — hidden in League-only mode */}
          {LEAGUE_ONLY_MODE ? <div className="flex-1 min-w-0" /> : <NavBanner />}

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {/* Desktop nav items */}
            <div className="hidden sm:flex items-center gap-0.5 sm:gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={() => prefetchRoute(item.path)}
                    onFocus={() => prefetchRoute(item.path)}
                    onTouchStart={() => prefetchRoute(item.path)}
                    className="relative px-1.5 sm:px-3 py-2 text-sm font-medium transition-colors"
                  >
                    <span className={`flex items-center gap-1 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} style={hasTheme && !isActive ? { color: "hsl(0,0%,70%)" } : hasTheme && isActive ? { color: "hsl(0,0%,95%)" } : undefined}>
                      <item.icon className="h-4 w-4" />
                      <span className="hidden md:inline text-xs">{item.label}</span>
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute bottom-0 left-1 right-1 h-0.5 bg-gradient-primary rounded-full"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Notification bell */}
            <UserNotificationBell />

            {/* Diamond balance — shop is hidden in League-only mode */}
            {!LEAGUE_ONLY_MODE && diamonds !== null && (
              <Link
                to="/shop"
                className="ml-1 flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-all hover:scale-105 active:scale-95 border border-primary/20 hover:border-primary/40"
              >
                <Diamond className="h-3.5 w-3.5" />
                <span>{diamonds.toLocaleString()}</span>
                <ChevronRight className="h-3 w-3 opacity-60" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <AnimatePresence>
        {isGameRoute && !navRevealed && (
          <motion.button
            key="nav-handle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setNavRevealed(true)}
            className="fixed bottom-2 left-3 z-50 sm:hidden p-1"
          >
            <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(!isGameRoute || navRevealed) && (
          <motion.div
            key="nav-bar"
            initial={isGameRoute ? { y: "100%" } : false}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-border bg-background/80 backdrop-blur-xl"
            style={hasTheme ? { background: themeId === "light" ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(20px)", borderColor: themeId === "light" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.1)" } : undefined}
          >
            {/* Minimize handle inside navbar - top left */}
            {isGameRoute && (
              <button
                onClick={() => setNavRevealed(false)}
                className="absolute left-3 top-1 p-1 z-10"
              >
                <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
              </button>
            )}
            <div className="flex items-center justify-center gap-4 h-14 px-4">
              {/* Friends button */}
              <MobileNavButton
                icon={Users}
                label="Friends"
                hasTheme={!!hasTheme}
                themeId={themeId}
                onClick={() => window.dispatchEvent(new CustomEvent("open-friends-panel"))}
                badge={pendingCount > 0 ? pendingCount : undefined}
              />

              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onTouchStart={() => prefetchRoute(item.path)}
                    onMouseEnter={() => prefetchRoute(item.path)}
                    className="relative flex flex-col items-center gap-0.5 py-1 px-3"
                  >
                    <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} style={hasTheme && !isActive ? { color: "hsl(0,0%,70%)" } : hasTheme && isActive ? { color: "hsl(0,0%,95%)" } : undefined} />
                    <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`} style={hasTheme && !isActive ? { color: "hsl(0,0%,70%)" } : hasTheme && isActive ? { color: "hsl(0,0%,95%)" } : undefined}>
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator-mobile"
                        className="absolute top-0 left-2 right-2 h-0.5 bg-gradient-primary rounded-full"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}

              {/* Theme button */}
              <MobileNavButton
                icon={Palette}
                label="Theme"
                hasTheme={!!hasTheme}
                themeId={themeId}
                onClick={() => window.dispatchEvent(new CustomEvent("open-theme-picker"))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
