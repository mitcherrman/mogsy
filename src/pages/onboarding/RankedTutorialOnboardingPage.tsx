// ---------------------------------------------------------------------------
// /onboarding/ranked-tutorial — production Ranked Tutorial onboarding (E2)
//
// Reuses the exact same canonical tutorial implementation as /dev/ranked-tutorial
// (no fork, no duplication). It adds only the production concerns: a minimal
// welcome step, mandatory vs replay mode, durable completion persistence, and
// post-completion navigation.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import { RANKED_TUTORIAL_RETURN_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import RankedTutorialPage from "@/pages/dev/ranked-tutorial/RankedTutorialPage";
import {
  TutorialOnboardingProvider,
  type TutorialMode,
} from "@/pages/dev/ranked-tutorial/tutorialOnboardingContext";

export default function RankedTutorialOnboardingPage() {
  const navigate = useNavigate();
  const { loading, required, completed, completeTutorial } = useRankedTutorialStatus();
  const [started, setStarted] = useState(false);

  // Required incomplete accounts run the mandatory flow; everyone else who
  // reaches this route (completed users, exempt guests) is here voluntarily.
  const mode: TutorialMode = required ? "mandatory" : "replay";

  const contextValue = useMemo(
    () => ({
      mode,
      returnTo: RANKED_TUTORIAL_RETURN_ROUTE,
      onComplete:
        mode === "mandatory"
          ? async () => {
              const ok = await completeTutorial();
              if (ok) navigate(RANKED_TUTORIAL_RETURN_ROUTE, { replace: true });
              return ok;
            }
          : undefined,
    }),
    [mode, completeTutorial, navigate],
  );

  if (loading) {
    return <div className="min-h-dvh bg-background" data-testid="onboarding-loading" />;
  }

  if (!started) {
    return (
      <main className="container max-w-xl mx-auto px-4 py-10">
        <section
          aria-label="Welcome to Ranked training"
          data-testid="onboarding-welcome"
          className="rounded-xl border bg-card p-6 space-y-4 text-center"
        >
          <div className="flex justify-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600/10">
              <GraduationCap className="h-6 w-6 text-emerald-600" aria-hidden />
            </span>
          </div>
          <h1 className="text-2xl font-bold">Welcome to Ranked training</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re about to play a scripted Training Match against the Training Golem
            — practice only, so nothing here counts toward real Ranked. In a few minutes
            you&apos;ll learn everything a Ranked duel uses: the shared timer, answering and
            locking in, dealing damage, earning XP, leveling up, and your Tank abilities.
            We&apos;ll take it one step at a time, and the timer stays paused whenever
            there&apos;s something to read.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button
              size="lg"
              onClick={() => setStarted(true)}
              data-testid="start-tutorial"
            >
              Start Tutorial
            </Button>
            {/* Replay/voluntary visitors may leave; required accounts get no skip. */}
            {mode === "replay" && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate(RANKED_TUTORIAL_RETURN_ROUTE)}
                data-testid="onboarding-back-to-quiz"
              >
                Back to Quiz
              </Button>
            )}
          </div>
          {completed && (
            <p className="text-[11px] text-muted-foreground">
              You&apos;ve already completed this tutorial — replaying won&apos;t change your progress.
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <TutorialOnboardingProvider value={contextValue}>
      <RankedTutorialPage />
    </TutorialOnboardingProvider>
  );
}
