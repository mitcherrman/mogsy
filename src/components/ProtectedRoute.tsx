import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useAppSettings();

  if (authLoading || settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // If auth is not required, let everyone through
  if (!settings.require_auth) return <>{children}</>;

  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
