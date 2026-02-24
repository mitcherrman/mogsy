import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useAppSettings();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    // If auth is not required and no user, sign in anonymously
    if (!settingsLoading && !settings.require_auth && !user && !authLoading && !signingIn) {
      setSigningIn(true);
      supabase.auth.signInAnonymously().finally(() => setSigningIn(false));
    }
  }, [user, authLoading, settingsLoading, settings.require_auth, signingIn]);

  if (authLoading || settingsLoading || signingIn) {
    return (
      <div className="min-h-screen bg-background" />
    );
  }

  // If auth is not required, let everyone through (they should have anonymous session now)
  if (!settings.require_auth) return <>{children}</>;

  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
