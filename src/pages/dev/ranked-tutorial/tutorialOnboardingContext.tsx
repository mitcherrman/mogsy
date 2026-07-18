import { createContext, useContext, type ReactNode } from "react";
import { RANKED_TUTORIAL_RETURN_ROUTE } from "@/lib/ranked-tutorial/onboarding";

/**
 * How the shared tutorial is being run:
 *  - "dev":       the isolated /dev route — no auth, no persistence (default).
 *  - "mandatory": required onboarding — completion must persist before leaving.
 *  - "replay":    a completed user replaying voluntarily — no persistence.
 */
export type TutorialMode = "dev" | "mandatory" | "replay";

export interface TutorialOnboardingContextValue {
  mode: TutorialMode;
  /**
   * Final completion action. In "mandatory" mode this persists completion and
   * resolves true only after the authoritative write succeeds; the host page is
   * responsible for navigating on success. In "replay"/"dev" it is undefined and
   * the completion panel falls back to an ordinary return link.
   */
  onComplete?: () => Promise<boolean>;
  /** Where "return"/exit links point. */
  returnTo: string;
}

const defaultValue: TutorialOnboardingContextValue = {
  mode: "dev",
  returnTo: RANKED_TUTORIAL_RETURN_ROUTE,
};

const TutorialOnboardingContext =
  createContext<TutorialOnboardingContextValue>(defaultValue);

export function TutorialOnboardingProvider({
  value,
  children,
}: {
  value: TutorialOnboardingContextValue;
  children: ReactNode;
}) {
  return (
    <TutorialOnboardingContext.Provider value={value}>
      {children}
    </TutorialOnboardingContext.Provider>
  );
}

/**
 * Read the current tutorial run-mode. Defaults to "dev" when no provider is
 * present, preserving the standalone /dev/ranked-tutorial behavior unchanged.
 */
export function useTutorialOnboarding(): TutorialOnboardingContextValue {
  return useContext(TutorialOnboardingContext);
}
