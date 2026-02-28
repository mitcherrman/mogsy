import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CardAnimationPrefs {
  swipeAnimation: string;
  elocheckAnimation: string;
  loading: boolean;
  setSwipeAnimation: (id: string) => Promise<void>;
  setElocheckAnimation: (id: string) => Promise<void>;
  logUsage: (animationId: string, context: "swipe" | "elocheck") => void;
}

export function useCardAnimation(): CardAnimationPrefs {
  const { user } = useAuth();
  const [swipeAnimation, setSwipeAnim] = useState("default");
  const [elocheckAnimation, setElocheckAnim] = useState("default");
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const logBuffer = useRef<{ profile_id: string; animation_id: string; context: string }[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("profiles")
      .select("id, swipe_animation, elocheck_animation")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfileId(data.id);
          setSwipeAnim((data as any).swipe_animation || "default");
          setElocheckAnim((data as any).elocheck_animation || "default");
        }
        setLoading(false);
      });
  }, [user]);

  const setSwipeAnimation = useCallback(async (id: string) => {
    setSwipeAnim(id);
    if (profileId) {
      await supabase.from("profiles").update({ swipe_animation: id } as any).eq("id", profileId);
    }
  }, [profileId]);

  const setElocheckAnimation = useCallback(async (id: string) => {
    setElocheckAnim(id);
    if (profileId) {
      await supabase.from("profiles").update({ elocheck_animation: id } as any).eq("id", profileId);
    }
  }, [profileId]);

  // Batch log usage to avoid spamming DB
  const flushLogs = useCallback(() => {
    if (logBuffer.current.length === 0) return;
    const batch = [...logBuffer.current];
    logBuffer.current = [];
    supabase.from("animation_usage_logs").insert(batch).then(() => {});
  }, []);

  const logUsage = useCallback((animationId: string, context: "swipe" | "elocheck") => {
    if (!profileId) return;
    logBuffer.current.push({ profile_id: profileId, animation_id: animationId, context });
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushLogs, 5000);
  }, [profileId, flushLogs]);

  // Flush on unmount
  useEffect(() => () => { flushLogs(); }, [flushLogs]);

  return {
    swipeAnimation,
    elocheckAnimation,
    loading,
    setSwipeAnimation,
    setElocheckAnimation,
    logUsage,
  };
}
