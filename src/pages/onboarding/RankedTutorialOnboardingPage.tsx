// ---------------------------------------------------------------------------
// Ranked Tutorial host page (E2).
//
// Serves BOTH routes:
//   /onboarding/ranked-tutorial — the mandatory first-run onboarding target.
//   /quiz/tutorial              — the permanent Leaguecraft entry, where any
//                                 authenticated user may start or replay it.
//
// Reuses the exact same canonical tutorial implementation as /dev/ranked-tutorial
// (no fork, no duplication). It adds only the production concerns: a minimal
// welcome step, run-mode selection, durable completion persistence, and
// post-completion navigation. The run mode is derived from the account's real
// completion state plus the global tutorial policy, so the two routes cannot
// disagree and neither can corrupt the other's semantics.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useAppSettings } from "@/hooks/useAppSettings";
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
  const { settings, loading: settingsLoading } = useAppSettings();
  const [started, setStarted] = useState(false);

  // Three separate concepts, deliberately not collapsed into one:
  //   `completed` — durable ACCOUNT state: has this user ever finished?
  //   `forced`    — eligibility AND global POLICY: is this run compulsory?
  //   `mode`      — the resulting experience.
  //
  // An incomplete user who is NOT forced (the permanent Leaguecraft route, or
  // the popup while the forced-tutorial policy is off) still gets their first
  // completion recorded — they simply are not trapped here while doing it. That
  // is what makes re-enabling the forced policy accurate later.
  const forced = required && settings.policy.tutorial.completionRequiredForNewUsers;
  const mode: TutorialMode = forced ? "mandatory" : completed ? "replay" : "voluntary";
  const persistsCompletion = mode === "mandatory" || mode === "voluntary";

  const contextValue = useMemo(
    () => ({
      mode,
      returnTo: RANKED_TUTORIAL_RETURN_ROUTE,
      onComplete: persistsCompletion
        ? async () => {
            const ok = await completeTutorial();
            // Only the mandatory flow navigates on success; a voluntary run
            // records quietly and leaves the user in control of where to go.
            if (ok && mode === "mandatory") {
              navigate(RANKED_TUTORIAL_RETURN_ROUTE, { replace: true });
            }
            return ok;
          }
        : undefined,
    }),
    [mode, persistsCompletion, completeTutorial, navigate],
  );

  if (loading || settingsLoading) {
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
            {/* Mogzy is the tutorial's teacher; the heading carries the meaning. */}
            <MogzyMascot pose="explaining" decorative
              className="h-24 w-24 sm:h-28 sm:w-28" />
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
            {/* Anyone not under the mandatory flow may leave; required accounts
                get no skip. */}
            {mode !== "mandatory" && (
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
