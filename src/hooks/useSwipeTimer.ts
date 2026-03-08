import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SwipeTimerSettings {
  enabled: boolean;
  duration_seconds: number;
}

export function useSwipeTimer(onTimeout: () => void, paused: boolean) {
  const [settings, setSettings] = useState<SwipeTimerSettings>({ enabled: false, duration_seconds: 10 });
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "swipe_timer")
      .single()
      .then(({ data }) => {
        if (data) {
          const val = data.value as any;
          setSettings({ enabled: val?.enabled ?? false, duration_seconds: val?.duration_seconds ?? 10 });
        }
      });
  }, []);

  const resetTimer = useCallback(() => {
    if (settings.enabled) {
      setTimeLeft(settings.duration_seconds);
    }
  }, [settings]);

  // Reset timer when settings load
  useEffect(() => {
    if (settings.enabled) {
      setTimeLeft(settings.duration_seconds);
    }
  }, [settings]);

  // Countdown
  useEffect(() => {
    if (!settings.enabled || paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onTimeoutRef.current();
          return settings.duration_seconds; // reset after timeout
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings.enabled, settings.duration_seconds, paused]);

  return {
    timerEnabled: settings.enabled,
    timeLeft,
    duration: settings.duration_seconds,
    resetTimer,
  };
}
