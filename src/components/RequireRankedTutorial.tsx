import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useRankedTutorialStatus } from "@/hooks/useRankedTutorialStatus";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

/**
 * Route guard that keeps an eligible-but-incomplete account inside onboarding.
 *
 * Resolution order mirrors ProtectedRoute: wait for auth, app settings, and the
 * profile read before deciding, so we never redirect on a still-loading state
 * (which would flicker or loop). On a profile-read error we fail OPEN — a broken
 * read must never permanently trap a user behind onboarding.
 *
 * The onboarding route itself must NOT be wrapped in this guard, or it would
 * redirect to itself.
 */
export default function RequireRankedTutorial({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading: authLoading } = useAuth();
  const { loading: settingsLoading } = useAppSettings();
  const { loading: statusLoading, required, error } = useRankedTutorialStatus();

  if (authLoading || settingsLoading || statusLoading) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (error) return <>{children}</>;
  if (required) return <Navigate to={RANKED_TUTORIAL_ROUTE} replace />;
  return <>{children}</>;
}
