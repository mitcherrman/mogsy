import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Listens to auth state changes and invalidates the React Query cache
 * so that all data-fetching hooks re-run with the correct user context.
 * Mount this once inside both QueryClientProvider and AuthProvider.
 */
export function useAuthQuerySync() {
  const queryClient = useQueryClient();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUserId = session?.user?.id ?? null;

        // Only act when the identity actually changed
        if (newUserId !== prevUserId.current) {
          prevUserId.current = newUserId;

          // Clear all cached data so screens refetch with the new identity
          queryClient.clear();
        }

        if (event === "SIGNED_OUT") {
          // Extra safety: remove all queries so no stale user data leaks
          queryClient.clear();
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [queryClient]);
}
