import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BrainCircuit, Swords, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import lolIcon from "@/assets/lol-icon.png";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

const STEPS = [
  { icon: BrainCircuit, text: "Mogsy is a League of Legends quiz game." },
  { icon: Swords, text: "Test yourself on champions, items, abilities, builds, and esports." },
  { icon: GraduationCap, text: "Start with a short guided tutorial — no account needed." },
];

/**
 * First-visit tutorial-onboarding overlay for the LoL hub.
 *
 * Visibility is decided entirely by the caller from authoritative auth/tutorial
 * status (anonymous + not completed). This component is deliberately NOT
 * dismissible: its single action starts the mandatory tutorial. It does not
 * touch localStorage — a guest who opens but abandons the tutorial still has an
 * incomplete profile, so the caller shows the popup again on their next visit.
 */
export default function LolWelcomeIntro() {
  const navigate = useNavigate();

  const startTutorial = () => {
    trackFunnelEvent("lol_start_tutorial_clicked", { cta: "welcome_intro" });
    navigate(RANKED_TUTORIAL_ROUTE);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-background/90 backdrop-blur-md px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Mogzy — start the tutorial"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#c9a84c]/30 bg-gradient-to-br from-[#1a1530]/95 via-[#0a1428]/95 to-[#0a0a1a]/95 p-6 max-[430px]:p-5 shadow-[0_0_50px_rgba(0,0,0,0.7)]"
      >
        {/* Glowing logo */}
        <div className="flex justify-center mb-4">
          <motion.img
            src={lolIcon}
            alt="Mogsy League"
            className="h-16 w-16 rounded-xl"
            animate={{
              filter: [
                "drop-shadow(0 0 10px hsl(var(--primary) / 0.4))",
                "drop-shadow(0 0 24px hsl(var(--primary) / 0.7))",
                "drop-shadow(0 0 10px hsl(var(--primary) / 0.4))",
              ],
            }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <h2 className="text-center text-xl font-bold text-[#f5e9c8] mb-4">
          Welcome to Mogsy LoL
        </h2>

        <div className="space-y-2.5 mb-5">
          {STEPS.map(({ icon: Icon, text }, i) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.15 }}
              className="flex items-start gap-2.5 text-sm text-foreground/90"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0 text-[#f0d78c]" />
              <span>{text}</span>
            </motion.div>
          ))}
        </div>

        <Button
          className="w-full bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
          onClick={startTutorial}
          data-testid="lol-welcome-start-tutorial"
        >
          Start Tutorial
        </Button>
      </motion.div>
    </motion.div>
  );
}
