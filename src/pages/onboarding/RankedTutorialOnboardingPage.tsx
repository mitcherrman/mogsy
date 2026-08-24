// ---------------------------------------------------------------------------
// Ranked Tutorial host page (E2).
//
// Serves BOTH routes:
//   /onboarding/ranked-tutorial — the mandatory first-run onboarding target.
//   /quiz/tutorial              — the permanent Leaguecraft entry, where any
//                                 authenticated user may start or replay it.
//
// …and, on that second route only, the ADMIN REPLAY: `?adminReplay=1`, honoured
// only for a server-confirmed staff admin, which runs the real tutorial from
// its beginning and records nothing (see `lib/ranked-tutorial/adminReplay`).
//
// Reuses the exact same canonical tutorial implementation as /dev/ranked-tutorial
// (no fork, no duplication). It adds only the production concerns: a minimal
// welcome step, run-mode selection, durable completion persistence, and
// post-completion navigation. The run mode is derived from the account's real
// completion state plus the global tutorial policy, so the two routes cannot
// disagree and neither can corrupt the other's semantics.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAdminAuthority } from "@/hooks/useAdminAuthority";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import {
  ADMIN_REPLAY_PARAM, isAdminReplayRequested, resolveTutorialRun,
} from "@/lib/ranked-tutorial/adminReplay";
import { RANKED_TUTORIAL_RETURN_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import RankedTutorialPage from "@/pages/dev/ranked-tutorial/RankedTutorialPage";
import { useRankedRole } from "@/pages/quiz-ranked/useRankedRole";
import { TutorialOnboardingProvider } from "@/pages/dev/ranked-tutorial/tutorialOnboardingContext";

export default function RankedTutorialOnboardingPage() {
  const navigate = useNavigate();
  const { loading, required, completed, completeTutorial } = useRankedTutorialStatus();
  const { settings, loading: settingsLoading } = useAppSettings();
  const [started, setStarted] = useState(false);
  const rankedRole = useRankedRole();
  const tutorialTrack = rankedRole.loadState === "ready" ? "r1" : "legacy";
  const [params] = useSearchParams();
  // ADMIN REPLAY. The parameter is a REQUEST; `useAdminAuthority` is the
  // answer, and it is the server's (`has_role`). Until the server has replied
  // the hook reports `false`, so an admin replay simply resolves as the
  // ordinary run for that first moment and never as an unauthorized one.
  const adminReplayRequested = isAdminReplayRequested(params.get(ADMIN_REPLAY_PARAM));
  const { isAdmin, loading: adminLoading } = useAdminAuthority();

  // Four separate concepts, deliberately not collapsed into one:
  //   `completed`   — durable ACCOUNT state: has this user ever finished?
  //   forced        — eligibility AND global POLICY: is this run compulsory?
  //   `adminReplay` — an authorized staff rehearsal, which writes nothing;
  //   `mode`        — the resulting experience.
  //
  // An incomplete user who is NOT forced (the permanent Leaguecraft route, or
  // the popup while the forced-tutorial policy is off) still gets their first
  // completion recorded — they simply are not trapped here while doing it. That
  // is what makes re-enabling the forced policy accurate later.
  const run = resolveTutorialRun({
    required,
    policyForcesTutorial: settings.policy.tutorial.completionRequiredForNewUsers,
    completed,
    adminReplayRequested,
    isAdmin,
  });
  const { mode, adminReplay, persistsCompletion } = run;

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

  // An admin replay must not START before the server has answered: beginning
  // as an ordinary (recording) run and switching mid-flight is exactly the
  // write this feature exists to prevent.
  if (loading || settingsLoading || (adminReplayRequested && adminLoading)) {
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
          {adminReplay ? (
            <p className="text-[11px] text-muted-foreground"
              data-testid="admin-replay-notice">
              Admin replay. This runs the real tutorial from the beginning and
              records nothing — your own completion, progression and gating are
              untouched.
            </p>
          ) : completed && (
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
      {/* R1: the ONE place the player-facing tutorial track is chosen.
          Role identity being available is the closest signal this client has
          to "your next Ranked match is a no-progression R1 match" — there is
          no per-match answer before a match exists. Getting it wrong changes
          only which lessons are taught, never a match contract: the tutorial
          is scripted and touches no live match state. A backend without role
          identity keeps the complete legacy tutorial. */}
      <RankedTutorialPage track={tutorialTrack} />
    </TutorialOnboardingProvider>
  );
}
