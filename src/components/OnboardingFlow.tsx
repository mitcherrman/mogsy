import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import OnboardingWelcome from "./onboarding/OnboardingWelcome";
import OnboardingProfile from "./onboarding/OnboardingProfile";
import OnboardingCategories from "./onboarding/OnboardingCategories";

/**
 * PT2E retired the fourth step, "Choose Your Vibe", which offered every new
 * account one Premium theme to try for free. It was a legacy Mogsy grant for a
 * cosmetic that recoloured the whole application — the only part of the product
 * that ever made the offer meaningful. Its "entitlement" was a localStorage key
 * (`mogsy-chosen-free-theme`) that any visitor could write, so it was never a
 * grant the server could honour, and keeping it would have forced a
 * once-per-account carve-out into the new server authority purely to preserve
 * an obsolete giveaway. Onboarding now ends on the categories step; a profile
 * theme is chosen on the Profile page, where it belongs.
 */
type Step = "welcome" | "profile" | "pick";

interface OnboardingFlowProps {
  onComplete: (categories: string[]) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    if (selected.length < 3 || !user) return;
    setSaving(true);

    // `custom_theme` is no longer written here. Onboarding does not hand out a
    // cosmetic, so the profile keeps the column's default and the account
    // starts on the default profile theme like every other free account.
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        preferred_categories: selected,
      })
      .eq("user_id", user.id);

    // Surface the failure and stay on this step so the user can retry — never
    // advance (or hand off to the tutorial) on an unpersisted write.
    if (error) {
      setSaving(false);
      toast.error("We couldn't save your setup. Please check your connection and try again.");
      return;
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
            onNext={handleFinish}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
