import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCallback, useEffect } from "react";
import { User } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useSfx } from "@/lib/audio/useSfx";


export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sfx = useSfx();

  const playLaunchSound = useCallback(() => {
    sfx.play("landing.enter");
  }, [sfx]);

  const handleLogoClick = () => {
    playLaunchSound();
    setTimeout(() => navigate("/home", { replace: true }), 250);
  };

  const handleEnter = useCallback(() => {
    playLaunchSound();
    setTimeout(() => navigate("/home", { replace: true }), 250);
  }, [playLaunchSound, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only trigger on deliberate enter/space — don't hijack Cmd-L, refresh, devtools, etc.
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      handleEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleEnter]);

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-4 overflow-hidden relative"
    >
      <SEOHead
        title="Mogsy — Vote, Rank, Compete"
        description="Mogsy is a head-to-head voting and ranking platform. Swipe to vote, climb Aura leaderboards, compete in leagues, and see who comes out on top."
      />

      {/* Pulsing glow backdrop */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          background: "radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, hsl(var(--primary) / 0.08) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Secondary accent glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 200,
          height: 200,
          background: "radial-gradient(circle, hsl(var(--ring) / 0.15) 0%, transparent 60%)",
          filter: "blur(30px)",
        }}
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.4, 0.8, 0.4],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
      />

      {/* Logo — clickable */}
      <motion.button
        onClick={handleEnter}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 cursor-pointer focus:outline-none"
        aria-label="Enter Mogsy"
      >
        <motion.img
          src="/mogsy-logo-text.png"
          alt="Mogsy"
          className="h-28 sm:h-36 md:h-44 object-contain drop-shadow-[0_0_25px_hsl(var(--primary)/0.4)]"
          width={264}
          height={176}
          sizes="(min-width: 768px) 176px, (min-width: 640px) 144px, 112px"
          animate={{
            y: [0, -6, 0],
            filter: [
              "drop-shadow(0 0 20px hsl(var(--primary) / 0.3))",
              "drop-shadow(0 0 35px hsl(var(--primary) / 0.5))",
              "drop-shadow(0 0 20px hsl(var(--primary) / 0.3))",
            ],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.button>

      {/* Hint text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="mt-8 text-xs text-muted-foreground/60 tracking-wider relative z-10"
      >
        tap to enter
      </motion.p>

      {/* Bottom-right profile icon */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 0.8 }}
        onClick={() => navigate(user && !user.is_anonymous ? "/profile" : "/auth")}
        className="fixed bottom-6 right-6 z-20 w-9 h-9 rounded-full bg-card/60 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
        aria-label="Profile"
      >
        <User className="h-4 w-4" />
      </motion.button>
    </main>
  );
}
