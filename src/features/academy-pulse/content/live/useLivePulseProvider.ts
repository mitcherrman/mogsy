/**
 * Academy Pulse — PULSE-2A: who is watching, and the provider for them.
 *
 * The viewer is an ACCOUNT only when the auth session belongs to a permanent
 * user (`is_anonymous !== true`), the same rule `/quiz` uses for History.
 * Anything else — signed out, still resolving, an anonymous guest session, or
 * a host with no AuthProvider (the scene lab, unit tests) — is a guest, and a
 * guest's Pulse reads nothing.
 *
 * The provider is memoised on the viewer, so a sign-in, sign-out or account
 * switch hands the shell a NEW provider (and the shell drops the previous
 * one's catalogue at once); re-renders with the same viewer keep the same one.
 */
import { useMemo } from "react";

import { useAuth } from "@/hooks/useAuth";
import { usePremiumSession } from "@/hooks/usePremiumSession";

import type { PulseContentProvider } from "../../model/pulse-types";
import { GUEST_VIEWER, createLivePulseProvider, type PulseViewer } from "./live-provider";

function useAuthUser(): { id: string; is_anonymous?: boolean } | null {
  try {
    // A hook call that throws only outside an AuthProvider; the call order is the same every render.
    return useAuth().user;
  } catch {
    return null;
  }
}

export function usePulseViewer(): PulseViewer {
  const user = useAuthUser();
  const { proStatus } = usePremiumSession();
  const id = user && user.is_anonymous !== true ? user.id : null;
  return useMemo<PulseViewer>(
    () => (id ? { kind: "account", id, premium: proStatus } : GUEST_VIEWER),
    [id, proStatus],
  );
}

export function useLivePulseProvider(): PulseContentProvider {
  const viewer = usePulseViewer();
  return useMemo(() => createLivePulseProvider(viewer), [viewer]);
}
