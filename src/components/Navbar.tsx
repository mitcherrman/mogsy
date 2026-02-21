import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Swords, User, Trophy, LayoutGrid, Zap, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/swipe", label: "Swipe", icon: Swords },
  { path: "/leagues", label: "Leagues", icon: Trophy },
  { path: "/presets", label: "Presets", icon: LayoutGrid },
  { path: "/profile", label: "Profile", icon: User },
];

export default function Navbar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="text-xl font-extrabold tracking-tight text-gradient">MatchRank</span>
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
          {user && (
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
