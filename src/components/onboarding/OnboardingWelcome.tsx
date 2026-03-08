import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import mogsyLogo from "@/assets/mogsy-logo-text.png";
import OnboardingDots from "./OnboardingDots";

interface Props {
  onNext: () => void;
}

export default function OnboardingWelcome({ onNext }: Props) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center max-w-sm"
    >
      <motion.img
        src={mogsyLogo}
        alt="Mogsy"
        className="h-20 sm:h-28 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
      />
      <h1 className="text-3xl font-extrabold text-foreground mb-3">
        Welcome to Mogsy!
      </h1>
      <p className="text-muted-foreground text-sm mb-2">
        Swipe, rank, and discover who (or what) comes out on top.
      </p>
      <p className="text-muted-foreground text-xs mb-8">
        Pick your favorite in head-to-head matchups across collections — or compete against other users to climb the leaderboard.
      </p>
      <Button onClick={onNext} className="gap-2 rounded-full px-8" size="lg">
        Let's Go <ChevronRight className="h-4 w-4" />
      </Button>
      <OnboardingDots current="welcome" />
    </motion.div>
  );
}
