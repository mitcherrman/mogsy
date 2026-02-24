import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Play, User, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import SEOHead from "@/components/SEOHead";

const navButtons = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/play", label: "Play", icon: Play },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <SEOHead title="Mogsy — Vote, Rank, Compete" description="Mogsy is a head-to-head voting and ranking platform. Swipe to vote, climb Elo leaderboards, compete in leagues, and see who comes out on top." />
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mb-16"
      >
        <img src="/mogsy-logo-text.png" alt="" className="h-28 sm:h-36 md:h-44 object-contain" width={264} height={176} sizes="(min-width: 768px) 264px, (min-width: 640px) 216px, 168px" fetchPriority="high" />
      </motion.div>

      {/* 4 Icon buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex gap-8 sm:gap-12"
      >
        {navButtons.map((item, i) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
          >
            <Link
              to={item.path === "/profile" && !user ? "/auth" : item.path}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-border bg-card transition-all duration-200 group-hover:border-primary/50 group-hover:shadow-[0_0_20px_hsl(210_80%_60%/0.15)] group-hover:scale-105 active:scale-95">
                <item.icon className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                {item.label}
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {/* Auth prompt */}
      {!user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12"
        >
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Sign in to get started →
          </Link>
        </motion.div>
      )}
    </div>
  );
}
