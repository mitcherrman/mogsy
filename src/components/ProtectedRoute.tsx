import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { authHref } from "@/lib/auth/auth-destination";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useAppSettings();
  const location = useLocation();

  if (authLoading || settingsLoading) {
    return <div className="min-h-dvh bg-background" />;
  }

  // If auth is not required, let everyone through (anonymous session already established by AuthProvider)
  if (!settings.require_auth) return <>{children}</>;

  // AUTH1: carry the blocked destination through the interruption. This guard
  // used to send everyone to a bare /auth, so a direct deep link — an invite, a
  // shared profile, a Ranked route — was silently converted into "go to the
  // hub" the moment auth finished. search + hash are included because a
  // destination's parameters ARE the destination (a room code, an invite id).
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={authHref(from)} replace />;
  }
  return <>{children}</>;
}
