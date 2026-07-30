import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import { LEAGUECRAFT_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

/**
 * Permanent Leaguecraft entry point to the tutorial.
 *
 * Always rendered and always usable: it does not depend on the automatic-popup
 * or forced-tutorial policies, and it is not modal state — it links to a real
 * refresh-safe route (`/quiz/tutorial`) that survives direct navigation.
 *
 * The label distinguishes a first run from a voluntary replay, because with the
 * forced-tutorial policy off a user can legitimately reach /quiz without having
 * completed it. While completion status is still loading (or unreadable) the
 * neutral "Tutorial" label is used rather than guessing wrong.
 */
export default function LeaguecraftTutorialLink({
  className = "",
}: {
  className?: string;
}) {
  const { loading, error, completed } = useRankedTutorialStatus();

  const label =
    loading || error ? "Tutorial" : completed ? "Replay tutorial" : "Start tutorial";

  return (
    <Link
      to={LEAGUECRAFT_TUTORIAL_ROUTE}
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary/80 underline-offset-4 hover:underline ${className}`}
      data-testid="replay-tutorial-link"
    >
      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}
