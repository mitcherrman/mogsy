import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import OnboardingWelcome from "./onboarding/OnboardingWelcome";
import OnboardingProfile from "./onboarding/OnboardingProfile";
import OnboardingCategories from "./onboarding/OnboardingCategories";
import OnboardingTheme from "./onboarding/OnboardingTheme";

type Step = "welcome" | "profile" | "pick" | "theme";

interface OnboardingFlowProps {
  onComplete: (categories: string[]) => void;
  skipToTheme?: boolean;
}

export default function OnboardingFlow({ onComplete, skipToTheme }: OnboardingFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(skipToTheme ? "theme" : "welcome");
  const [selected, setSelected] = useState<string[]>([]);
  const [chosenTheme, setChosenTheme] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    if (!skipToTheme && (selected.length < 3 || !user)) return;
    setSaving(true);

    if (chosenTheme) {
      localStorage.setItem("mogsy-chosen-free-theme", chosenTheme);
      localStorage.setItem("mogsy-active-theme", chosenTheme);
    }

    if (!skipToTheme && user) {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          preferred_categories: selected,
          custom_theme: chosenTheme || "default",
        })
        .eq("user_id", user.id);
    }

    setSaving(false);
    onComplete(selected);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center px-4 overflow-y-auto py-8">
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <OnboardingWelcome onNext={() => setStep("profile")} />
        )}
        {step === "profile" && (
          <OnboardingProfile onNext={() => setStep("pick")} />
        )}
        {step === "pick" && (
          <OnboardingCategories
            selected={selected}
            setSelected={setSelected}
            onNext={() => setStep("theme")}
          />
        )}
        {step === "theme" && (
          <OnboardingTheme
            chosenTheme={chosenTheme}
            setChosenTheme={setChosenTheme}
            onFinish={handleFinish}
            saving={saving}
            skipToTheme={skipToTheme}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
