import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fetchProEntitlement } from "@/lib/pro/entitlement";
import { useAuth } from "@/hooks/useAuth";

/**
 * PREMIUM SESSION — the signed-in visitor's effective entitlement, resolved
 * once per session and shared by every surface that needs it.
 *
 * This provider was `SitewideThemeProvider`. It carried two unrelated jobs: it
 * resolved Premium entitlement for the ad gate, the Academy record and the hub
 * panel, AND it applied `profiles.custom_theme` as a document-level theme by
 * writing `theme-<id>` onto <html>. PT2E retired the second job — profile
 * themes are profile-only now (see `src/lib/profile-themes.ts`) — and what is
 * left is the entitlement cache the other four consumers were always really
 * using. The name now says so.
 *
 * NOTHING HERE TOUCHES THE DOCUMENT. There is no root className mutation, no
 * theme cycling, no `app_settings` read and no localStorage. `Layout` owns the
 * only remaining root theme class, `theme-lol`, and owns it unconditionally.
 */
interface PremiumSessionContextType {
  /** Effective Premium: Stripe, a valid grant, or Global Premium Access. */
  isPro: boolean;
  /**
   * Entitlement with an explicit unresolved state. "unknown" until the
   * signed-in user's entitlement resolves; guests resolve to "free" once auth
   * has settled. Ads fail closed on "unknown".
   */
  proStatus: "unknown" | "pro" | "free";
}

const PremiumSessionContext = createContext<PremiumSessionContextType>({
  isPro: false,
  proStatus: "unknown",
});

export function PremiumSessionProvider({ children }: { children: ReactNode }) {
  let authUser: ReturnType<typeof useAuth>["user"] = null;
  let authLoading = false;
  try {
    const auth = useAuth();
    authUser = auth.user;
    authLoading = auth.loading;
  } catch {
    // No AuthProvider in the tree; fall back to unauthenticated defaults.
  }
  const user = authUser;
  const [isPro, setIsPro] = useState(false);
  const [proStatus, setProStatus] = useState<"unknown" | "pro" | "free">("unknown");

  useEffect(() => {
    if (!user) {
      // Signed out (auth resolved) = known free/guest; still resolving = unknown.
      setProStatus(authLoading ? "unknown" : "free");
      return;
    }
    setProStatus("unknown");
    // PT1.4: entitlement comes from the canonical resolver, not profiles.is_pro
    // (which is the Stripe-derived half only and would report a comped
    // playtester as Free).
    fetchProEntitlement().then((entitlement) => {
      // A null entitlement is *unknown* — stay unresolved so ads fail closed.
      if (entitlement) {
        setIsPro(entitlement.effectivePro);
        setProStatus(entitlement.effectivePro ? "pro" : "free");
      }
    });
  }, [user, authLoading]);

  return (
    <PremiumSessionContext.Provider value={{ isPro, proStatus }}>
      {children}
    </PremiumSessionContext.Provider>
  );
}

export function usePremiumSession() {
  return useContext(PremiumSessionContext);
}
