// ---------------------------------------------------------------------------
// The app's ONE React Query client.
//
// Extracted from App.tsx (AUTH1) so that code which must clear the cache —
// sign-out, which has to leave no signed-in data behind — can reach the same
// instance the provider hands to components, WITHOUT calling useQueryClient().
//
// That distinction matters: useQueryClient() throws outright when no
// QueryClientProvider is above it, which would make the global HUD unmountable
// anywhere the provider is absent (every existing HUD unit test, for one).
// Sign-out is not a data-fetching concern and should not add a provider
// requirement to a piece of chrome that never had one.
// ---------------------------------------------------------------------------

import { QueryClient } from "@tanstack/react-query";

// Keep cached data warm so navigating back to a screen doesn't refetch.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min — most lists/configs don't change second-to-second
      gcTime: 10 * 60_000,      // keep cache 10 min after unmount
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
