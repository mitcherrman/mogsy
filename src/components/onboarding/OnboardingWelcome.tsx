import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import mogsyLogo from "@/assets/mogsy-logo-text.png";

interface Props {
  onNext: () => void;
}

function Particles() {
  const dots = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 4,
    duration: Math.random() * 3 + 3,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute rounded-full bg-primary/30"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1.2, 0],
            y: [0, -30, -60],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingWelcome({ onNext }: Props) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-[101] flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 45%, hsl(var(--primary) / 0.15) 0%, hsl(var(--background)) 70%)",
      }}
    >
      <Particles />

      {/* Logo */}
      <motion.img
        src={mogsyLogo}
        alt="Mogsy"
        className="h-24 sm:h-36 mb-8 drop-shadow-[0_0_40px_hsl(var(--primary)/0.4)]"
        initial={{ scale: 0.3, filter: "blur(20px)", opacity: 0 }}
        animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      />

      {/* Headline */}
      <motion.h1
        className="text-4xl sm:text-5xl font-extrabold text-foreground mb-4 tracking-tight text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.9 }}
      >
        Welcome to{" "}
        <span
          className="text-primary"
          style={{ textShadow: "0 0 30px hsl(var(--primary) / 0.5)" }}
        >
          Mogsy
        </span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        className="text-muted-foreground text-base sm:text-lg max-w-xs sm:max-w-sm text-center mb-2 font-medium"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.3 }}
      >
        Swipe. Rank. Discover who comes out on top.
      </motion.p>

      <motion.p
        className="text-muted-foreground/70 text-xs sm:text-sm max-w-xs text-center mb-12"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.6 }}
      >
        Head-to-head matchups across collections — compete and climb the leaderboard.
      </motion.p>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 2.0, type: "spring", stiffness: 200 }}
      >
        <motion.div
          animate={{ boxShadow: [
            "0 0 0px hsl(var(--primary) / 0)",
            "0 0 40px hsl(var(--primary) / 0.4)",
            "0 0 0px hsl(var(--primary) / 0)",
          ]}}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-full"
        >
          <Button
            onClick={onNext}
            className="gap-2 rounded-full px-10 text-base"
            size="xl"
            variant="hero"
          >
            Get Started <ChevronRight className="h-5 w-5" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
