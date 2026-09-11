import { motion } from "framer-motion";

// PT2E removed the "theme" step — onboarding no longer grants a Premium
// cosmetic. Three dots, three steps.
const STEPS = ["welcome", "profile", "pick"] as const;

interface OnboardingDotsProps {
  current: string;
}

export default function OnboardingDots({ current }: OnboardingDotsProps) {
  const currentIndex = STEPS.indexOf(current as any);

  return (
    <div className="flex gap-2 mt-8">
      {STEPS.map((step, i) => (
        <motion.div
          key={step}
          className={`h-2 rounded-full transition-colors ${
            i <= currentIndex ? "bg-primary" : "bg-muted"
          }`}
          animate={{ width: i === currentIndex ? 24 : 8 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />
      ))}
    </div>
  );
}
