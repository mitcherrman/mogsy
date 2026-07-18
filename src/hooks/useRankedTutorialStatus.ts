import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  RANKED_TUTORIAL_VERSION,
  evaluateRankedTutorial,
  type RankedTutorialProfileFields,
} from "@/lib/ranked-tutorial/onboarding";

const PROFILE_SELECT =
  "is_anonymous, onboarding_completed, ranked_tutorial_completed_at, ranked_tutorial_version";

export interface RankedTutorialStatus {
  /** True while auth or the profile read is still resolving. */
  loading: boolean;
  /** True if the profile read failed (guards fail open on this). */
  error: boolean;
  /** The account has a durable completion stamp. */
  completed: boolean;
  /** The account must complete the tutorial before gated routes. */
  required: boolean;
  /** Re-read the profile row. */
  refresh: () => Promise<void>;
  /**
   * Durably stamp completion for the current user. First-write-wins and
   * retry-safe: repeated calls never overwrite the original timestamp.
   * Resolves true only once the server confirms a completion stamp exists.
   */
  completeTutorial: () => Promise<boolean>;
}

/**
 * Loads the current user's Ranked Tutorial onboarding state and exposes an
 * authenticated, idempotent completion mutation. Completion is written directly
 * to the user's own profile row under the existing RLS UPDATE policy.
 */
export function useRankedTutorialStatus(): RankedTutorialStatus {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<RankedTutorialProfileFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      if (mounted.current) {
        setProfile(null);
        setError(false);
        setLoading(false);
      }
      return;
    }
    if (mounted.current) {
      setLoading(true);
      setError(false);
    }
    const { data, error: readErr } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!mounted.current) return;
    if (readErr) {
      setError(true);
      setProfile(null);
    } else {
      setProfile((data as RankedTutorialProfileFields | null) ?? null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const completeTutorial = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    // First-write-wins: only stamp when no completion exists yet. On replay this
    // matches zero rows (no error), and the authoritative re-read below still
    // confirms the pre-existing completion, so the caller sees success.
    const { error: updErr } = await supabase
      .from("profiles")
      .update({
        ranked_tutorial_completed_at: new Date().toISOString(),
        ranked_tutorial_version: RANKED_TUTORIAL_VERSION,
      })
      .eq("user_id", user.id)
      .is("ranked_tutorial_completed_at", null);
    if (updErr) return false;

    // Authoritative confirmation: success only if the row now carries a stamp.
    const { data, error: readErr } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readErr || !data) return false;

    const next = data as RankedTutorialProfileFields;
    if (mounted.current) setProfile(next);
    return next.ranked_tutorial_completed_at != null;
  }, [user]);

  const { completed, required } = evaluateRankedTutorial(profile, { hasUser: !!user });

  return {
    loading: authLoading || loading,
    error,
    completed,
    required,
    refresh: load,
    completeTutorial,
  };
}
