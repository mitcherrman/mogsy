import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useAppSettings();

  if (authLoading || settingsLoading) {
    return <div className="min-h-dvh bg-background" />;
  }

  // If auth is not required, let everyone through (anonymous session already established by AuthProvider)
  if (!settings.require_auth) return <>{children}</>;

  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
