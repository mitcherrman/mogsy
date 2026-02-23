import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Home, Play, User, Settings, ShoppingBag, Diamond } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import mogsyLogo from "@/assets/mogsy-logo-text.png";

const navItems = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/play", label: "Play", icon: Play },
  { path: "/shop", label: "Shop", icon: ShoppingBag },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Navbar() {
  const location = useLocation();
  const { user } = useAuth();
  const [diamonds, setDiamonds] = useState<number | null>(null);

  useEffect(() => {
    if (user) loadDiamonds();
  }, [user, location.pathname]);

  const loadDiamonds = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("diamonds")
      .eq("user_id", user!.id)
      .single();
    if (data) setDiamonds(data.diamonds ?? 0);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <img src={mogsyLogo} alt="Mogsy" className="h-9" />
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="relative px-3 py-2 text-sm font-medium transition-colors">
                <span className={`flex items-center gap-1.5 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
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

          {/* Diamond balance */}
          {diamonds !== null && (
            <Link
              to="/shop"
              className="ml-2 flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <Diamond className="h-3.5 w-3.5" />
              {diamonds.toLocaleString()}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
