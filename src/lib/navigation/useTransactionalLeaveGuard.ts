import { useCallback, useEffect, useRef } from "react";
import {
  useBlocker,
  type BlockerFunction,
  type Location,
} from "react-router-dom";
import type { ReactNode } from "react";

export type TransactionalLeaveKind =
  | "ranked_match"
  | "ranked_queue"
  | "daily_run";

export type TransactionalLeaveBypass =
  | "AUTHORITATIVE_TERMINAL"
  | "HOST_RETURN"
  | "AUTH_RECOVERY"
  | "ROUTE_RECOVERY";

export type TransactionalLeaveCopy = {
  title: ReactNode;
  body: ReactNode;
  stayLabel: string;
  leaveLabel: string;
};

export type TransactionalLeaveCandidate = Parameters<BlockerFunction>[0];

export type TransactionalLeaveGuardOptions = {
  active: boolean;
  kind: TransactionalLeaveKind;
  copy: TransactionalLeaveCopy;
  shouldBlock: (candidate: TransactionalLeaveCandidate) => boolean;
};

export type TransactionalLeaveGuard = {
  kind: TransactionalLeaveKind;
  copy: TransactionalLeaveCopy;
  state: "unblocked" | "blocked" | "proceeding";
  confirmationOpen: boolean;
  pendingLocation: Location | null;
  stay: () => void;
  leave: () => void;
  runWithBypass: (
    reason: TransactionalLeaveBypass,
    transition: () => void,
  ) => void;
};

/**
 * The supported SPA leave primitive for NAV1 transactional owners.
 *
 * The flow owner supplies the active predicate, exit predicate, and copy. This
 * hook only preserves the router's captured transition. `stay` resets it and
 * `leave` proceeds it; neither method reconstructs a URL or starts a second
 * navigation.
 */
export function useTransactionalLeaveGuard({
  active,
  kind,
  copy,
  shouldBlock,
}: TransactionalLeaveGuardOptions): TransactionalLeaveGuard {
  const activeRef = useRef(active);
  const shouldBlockRef = useRef(shouldBlock);
  const bypassRef = useRef<TransactionalLeaveBypass | null>(null);
  const handledRef = useRef(false);

  activeRef.current = active;
  shouldBlockRef.current = shouldBlock;

  const blocker = useBlocker(useCallback<BlockerFunction>((candidate) => {
    if (!activeRef.current) return false;

    // A bypass exists only while its owner synchronously initiates one router
    // transition. The first candidate consumes it; finally below clears it if
    // the callback performs no navigation at all.
    if (bypassRef.current !== null) {
      bypassRef.current = null;
      return false;
    }

    return shouldBlockRef.current(candidate);
  }, []));

  useEffect(() => {
    if (blocker.state === "unblocked") handledRef.current = false;
  }, [blocker.state]);

  useEffect(() => {
    if (active || blocker.state !== "blocked" || handledRef.current) return;

    // Authoritative state wins. Cancelling the stale user transition keeps the
    // owner mounted; deactivation must never turn into an implicit proceed.
    handledRef.current = true;
    blocker.reset();
  }, [active, blocker]);

  const stay = useCallback(() => {
    if (blocker.state !== "blocked" || handledRef.current) return;
    handledRef.current = true;
    blocker.reset();
  }, [blocker]);

  const leave = useCallback(() => {
    if (blocker.state !== "blocked" || handledRef.current) return;
    handledRef.current = true;
    blocker.proceed();
  }, [blocker]);

  const runWithBypass = useCallback((
    reason: TransactionalLeaveBypass,
    transition: () => void,
  ) => {
    if (bypassRef.current !== null) {
      throw new Error("A transactional leave bypass is already in progress");
    }

    // A recovery/host transition that wins while a user transition is pending
    // cancels that stale attempt first. It never proceeds the user's captured
    // destination on the system transition's behalf.
    if (blocker.state === "blocked" && !handledRef.current) {
      handledRef.current = true;
      blocker.reset();
    }

    bypassRef.current = reason;
    try {
      transition();
    } finally {
      bypassRef.current = null;
    }
  }, [blocker]);

  return {
    kind,
    copy,
    state: blocker.state,
    confirmationOpen: blocker.state === "blocked",
    pendingLocation: blocker.state === "unblocked" ? null : blocker.location,
    stay,
    leave,
    runWithBypass,
  };
}
