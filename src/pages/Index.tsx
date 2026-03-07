import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCallback, useRef, useEffect } from "react";
import { User } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { useSoundSettings, SoundSettings } from "@/hooks/useSoundSettings";
import { useAuth } from "@/hooks/useAuth";


export default function Landing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const ctxRef = useRef<AudioContext | null>(null);
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => { settingsRef.current = soundSettings; }, [soundSettings]);

  const playLaunchSound = useCallback(() => {
    if (!settingsRef.current.launch_chime) return;
    try {
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      const t = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(600, t);
      osc1.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
      g1.gain.setValueAtTime(0.12, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc1.connect(g1);
      g1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.35);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(900, t + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(1800, t + 0.2);
      g2.gain.setValueAtTime(0.06, t + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + 0.05);
      osc2.stop(t + 0.4);
    } catch {
      /* silent */
    }
  }, []);

  const handleLogoClick = () => {
    playLaunchSound();
    setTimeout(() => navigate("/home", { replace: true }), 250);
  };



  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden relative">
      <SEOHead
        title="Mogsy — Vote, Rank, Compete"
        description="Mogsy is a head-to-head voting and ranking platform. Swipe to vote, climb Elo leaderboards, compete in leagues, and see who comes out on top."
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
        onClick={handleLogoClick}
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
    </div>
  );
}
