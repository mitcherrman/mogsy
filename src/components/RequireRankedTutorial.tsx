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
 * This guard is the FORCED-tutorial authority. The admin-controlled global
 * setting `tutorial_completion_required_for_new_users` switches it off: when
 * disabled the guard becomes a pass-through and never redirects. It writes no
 * completion state in that case (it never did), so
 * `profiles.ranked_tutorial_completed_at` is untouched and re-enabling the
 * setting resumes from each account's real, preserved completion history.
 *
 * The setting is deliberately independent of `tutorial_auto_popup_enabled`
 * (see lib/platform-policy/policy.ts): with the popup off and this on, an
 * incomplete user is simply redirected straight into the tutorial route without
 * ever seeing the optional popup — the two are not collapsed into one.
 *
 * The onboarding/tutorial routes themselves must NOT be wrapped in this guard,
 * or they would redirect to themselves.
 */
export default function RequireRankedTutorial({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useAppSettings();
  const { loading: statusLoading, required, error } = useRankedTutorialStatus();

  if (authLoading || settingsLoading || statusLoading) {
    return <div className="min-h-dvh bg-background" />;
  }

  // Global policy off ⇒ no forced onboarding for anyone.
  if (!settings.policy.tutorial.completionRequiredForNewUsers) return <>{children}</>;

  if (error) return <>{children}</>;
  if (required) return <Navigate to={RANKED_TUTORIAL_ROUTE} replace />;
  return <>{children}</>;
}
