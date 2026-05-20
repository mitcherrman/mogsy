import { motion } from "framer-motion";
import { Crown, Sparkles, Palette, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileThemes } from "@/lib/profile-themes";
import { CARD_ANIMATIONS } from "@/lib/card-animations";

interface ProCinematicAdProps {
  onClose: () => void;
  onSubscribe: () => void;
}

const proThemes = profileThemes.filter(t => t.isPro && t.id !== "cycle");
const proAnimations = CARD_ANIMATIONS.filter(a => a.defaultProOnly);

export default function ProCinematicAd({ onClose, onSubscribe }: ProCinematicAdProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
        className="relative rounded-2xl border border-primary/30 bg-card max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-card p-6 pb-8 text-center">
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-1 w-1 rounded-full bg-primary/40"
                style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
              />
            ))}
          </div>
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30 mb-3"
          >
            <Crown className="h-8 w-8 text-primary" />
          </motion.div>
          <h2 className="text-2xl font-extrabold text-foreground mb-1">Mogsy Pro</h2>
          <p className="text-sm text-muted-foreground">Unlock the full experience</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Themes Showcase */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Premium Themes</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {proThemes.slice(0, 8).map((theme, i) => (
                <motion.div
                  key={theme.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className={`h-12 w-12 rounded-xl ${theme.preview} border border-border/50 shadow-sm`} />
                  <span className="text-[9px] text-muted-foreground font-medium truncate w-full text-center">{theme.label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Animations Showcase */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Swipe Animations</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {proAnimations.map((anim, i) => (
                <motion.div
                  key={anim.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="flex items-center gap-2.5 rounded-xl bg-muted/50 border border-border/50 p-2.5"
                >
                  <span className="text-lg">{anim.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{anim.name}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">{anim.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Extras */}
          <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/15 p-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-foreground">
              <span className="font-bold">Plus:</span> Ad-free experience, custom leagues, priority matchmaking, monthly boosts, and more.
            </p>
          </div>

          {/* CTA */}
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="hero" size="lg" className="w-full gap-2 h-12 text-base" onClick={onSubscribe}>
              <Crown className="h-5 w-5" />
              Start Free Trial — $9.99/mo
            </Button>
          </motion.div>
          <p className="text-[10px] text-muted-foreground text-center">7-day free trial · Cancel anytime</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
