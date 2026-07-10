import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, Swords, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import lolIcon from "@/assets/lol-icon.png";

const SEEN_KEY = "mogsy.lolWelcome.seen.v1";

export function hasSeenLolWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

const STEPS = [
  { icon: BrainCircuit, text: "Mogsy is a League of Legends quiz game." },
  { icon: Swords, text: "Answer questions on champions, items, abilities, builds, objectives, patches and esports." },
  { icon: GraduationCap, text: "Learn one question at a time — no account needed to start." },
];

// Mock answer cards for the animated preview — generic, no Riot art.
const MOCK_ANSWERS = ["Sheen", "Kindlegem", "Bami's Cinder"];

/**
 * First-visit guest welcome overlay for the LoL hub. Shown once per device
 * (localStorage). Guest-first: primary CTA starts the quiz immediately with
 * no signup — the signup prompt comes later, after a completed quiz.
 */
export default function LolWelcomeIntro() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);

  const dismiss = () => {
    markSeen();
    setVisible(false);
  };

  const startQuiz = () => {
    markSeen();
    navigate("/quiz");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-2xl border border-[#c9a84c]/30 bg-gradient-to-br from-[#1a1530]/95 via-[#0a1428]/95 to-[#0a0a1a]/95 p-6 shadow-[0_0_50px_rgba(0,0,0,0.7)]"
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
              Welcome to Mogsy League
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

            {/* Animated mock answer cards */}
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground text-center mb-2">
                Which item builds into Trinity Force?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {MOCK_ANSWERS.map((a, i) => (
                  <motion.div
                    key={a}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      borderColor:
                        i === 0
                          ? ["rgba(201,168,76,0.2)", "rgba(201,168,76,0.8)", "rgba(201,168,76,0.2)"]
                          : undefined,
                    }}
                    transition={{
                      delay: 0.7 + i * 0.12,
                      borderColor: { duration: 2, repeat: Infinity, delay: 1.4 },
                    }}
                    className="rounded-lg border border-[#c9a84c]/20 bg-background/40 px-2 py-2 text-center text-[11px] font-medium text-foreground/80"
                  >
                    {a}
                  </motion.div>
                ))}
              </div>
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mt-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[#c9a84c]/40"
                    animate={{ opacity: i === 0 ? [0.4, 1, 0.4] : 0.4 }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                ))}
              </div>
            </div>

            <Button
              className="w-full mb-2 bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
              onClick={startQuiz}
            >
              Start Quiz — no account needed
            </Button>
            <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={dismiss}>
              Explore the hub first
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
