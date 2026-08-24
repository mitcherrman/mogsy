// ---------------------------------------------------------------------------
// ADMIN TUTORIAL REPLAY — the policy, as a pure function (ARENA1 Step 4 §19).
//
// An administrator needs to be able to open the REAL Ranked Tutorial, from its
// beginning, whenever they want, as many times as they want, without that run
// touching their own account's onboarding state and without any of it changing
// what an ordinary player experiences.
//
// Two rules make that safe, and both live here rather than in a component:
//
//  1. THE QUERY PARAMETER IS A REQUEST, NEVER AN AUTHORIZATION. `?adminReplay=1`
//     is honoured only when the SERVER has already confirmed the viewer holds a
//     staff admin role (`has_role`, the security-definer RPC every admin route
//     is gated on — see `useAdminAuthority`). A signed-in ordinary player who
//     types the parameter gets the ordinary tutorial, unchanged: same mode,
//     same completion recording, same gate.
//
//  2. AN ADMIN REPLAY NEVER WRITES. It resolves to `replay`, the run mode that
//     has always been defined as "an already-completed user going again —
//     records nothing". That is what keeps a testing run from stamping an
//     admin's first completion (which would silently satisfy their own forced-
//     tutorial gate) and from overwriting an existing one. It also does not
//     clear anything: suppressing a write is not the same as a reset, and no
//     part of this deletes an admin's completion or progression.
//
// It is deliberately NOT a bypass of the forced-tutorial gate. An admin who has
// never completed the tutorial is still required to complete it before the
// guarded routes open — an admin replay is a rehearsal, not a completion.
// ---------------------------------------------------------------------------

import type { TutorialMode } from "@/pages/dev/ranked-tutorial/tutorialOnboardingContext";

/** The URL parameter an admin entry point adds. Truthy values only. */
export const ADMIN_REPLAY_PARAM = "adminReplay";

/** The admin entry point itself: the REAL tutorial route, in replay mode. */
export const ADMIN_TUTORIAL_REPLAY_ROUTE = `/quiz/tutorial?${ADMIN_REPLAY_PARAM}=1`;

/** Is this parameter value a request for admin replay? */
export function isAdminReplayRequested(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

export interface TutorialRunInput {
  /** The account has no completion stamp yet. */
  required: boolean;
  /** The global forced-tutorial policy is on. */
  policyForcesTutorial: boolean;
  /** The account has a durable completion stamp. */
  completed: boolean;
  /** `?adminReplay=1` is present on the URL. */
  adminReplayRequested: boolean;
  /** The SERVER confirmed a staff admin role. Never a client-side guess. */
  isAdmin: boolean;
}

export interface TutorialRun {
  mode: TutorialMode;
  /** This run is an explicit admin rehearsal — surfaced in the UI, and the
   *  reason nothing will be written. */
  adminReplay: boolean;
  /** Does this run record the account's completion when it finishes? */
  persistsCompletion: boolean;
}

/**
 * Resolve how this run of the tutorial behaves.
 *
 * The three ordinary outcomes are exactly the ones the host page has always
 * computed; the admin branch is additive and sits in front of them.
 */
export function resolveTutorialRun(input: TutorialRunInput): TutorialRun {
  if (input.adminReplayRequested && input.isAdmin) {
    return { mode: "replay", adminReplay: true, persistsCompletion: false };
  }
  const forced = input.required && input.policyForcesTutorial;
  const mode: TutorialMode = forced
    ? "mandatory" : input.completed ? "replay" : "voluntary";
  return {
    mode,
    adminReplay: false,
    persistsCompletion: mode === "mandatory" || mode === "voluntary",
  };
}
