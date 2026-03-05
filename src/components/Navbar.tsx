import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Home, Play, User, Diamond, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import mogsyLogo from "@/assets/mogsy-logo-text.png";
import NavBanner from "./NavBanner";
import UserNotificationBell from "./UserNotificationBell";

const navItems = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/play", label: "Play", icon: Play },
  { path: "/profile", label: "Profile", icon: User },
];

export default function Navbar({ themeId }: { themeId?: string }) {
  const location = useLocation();
  const { user } = useAuth();
  const [diamonds, setDiamonds] = useState<number | null>(null);

  useEffect(() => {
    if (user) loadDiamonds();
  }, [user]);

  const loadDiamonds = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("diamonds")
      .eq("user_id", user!.id)
      .single();
    if (data) setDiamonds(data.diamonds ?? 0);
  };

  const hasTheme = themeId && themeId !== "default";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl"
      style={hasTheme ? { background: "rgba(0,0,0,0.6)", backdropFilter: "blur(20px)", borderColor: "rgba(255,255,255,0.1)" } : undefined}
    >
      <div className="container mx-auto flex h-14 items-center px-4 gap-1">
        <Link to="/" className="flex items-center shrink-0">
          <img src={mogsyLogo} alt="Mogsy" className="h-10 sm:h-12" />
        </Link>

        <NavBanner />

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="relative px-1.5 sm:px-3 py-2 text-sm font-medium transition-colors">
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

          {/* Notification bell */}
          <UserNotificationBell />

          {/* Diamond balance */}
          {diamonds !== null && (
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
  );
}
