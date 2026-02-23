import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Updates last_seen_at on the user's profile periodically.
 * Drop this hook into a top-level layout component.
 */
export function useTrackActivity() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const update = () => {
      supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .then(() => {});
    };

    // Update immediately on mount
    update();

    // Then every 5 minutes
    const interval = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);
}
