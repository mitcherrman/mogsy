import { createContext, useContext, type ReactNode } from "react";
import { RANKED_TUTORIAL_RETURN_ROUTE } from "@/lib/ranked-tutorial/onboarding";

/**
 * How the shared tutorial is being run:
 *  - "dev":       the isolated /dev route — no auth, no persistence (default).
 *  - "mandatory": required onboarding — completion must persist before leaving.
 *  - "voluntary": a NOT-yet-completed user who chose to be here (the permanent
 *                 Leaguecraft tutorial route, or the popup while the
 *                 forced-tutorial policy is off). Escapable like a replay, but
 *                 this is still the account's FIRST completion, so it IS
 *                 recorded — otherwise turning the forced-tutorial policy off
 *                 would silently stop recording completions, and re-enabling it
 *                 would wrongly re-force everyone who trained in the meantime.
 *  - "replay":    an ALREADY-completed user replaying — never persists, so a
 *                 replay cannot overwrite or corrupt the original completion.
 */
export type TutorialMode = "dev" | "mandatory" | "voluntary" | "replay";

export interface TutorialOnboardingContextValue {
  mode: TutorialMode;
  /**
   * Final completion action, defined only when this run is the account's first
   * completion ("mandatory" and "voluntary").
   *
   * In "mandatory" mode an explicit blocking action invokes it and it resolves
   * true only after the authoritative write succeeds; the host page navigates on
   * success. In "voluntary" mode the panel records completion in the background
   * and never blocks the user. In "replay"/"dev" it is undefined and nothing is
   * written.
   *
   * The underlying write is first-write-wins and idempotent, so invoking it more
   * than once can never overwrite an existing completion timestamp.
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
