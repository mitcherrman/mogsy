import { useEffect, useMemo, useState } from "react";

function durationLabel(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function NextDailyCountdown({ nextDailyAt, serverNow }: {
  nextDailyAt: string | null;
  serverNow: string | null;
}) {
  const skewMs = useMemo(() => serverNow ? Date.parse(serverNow) - Date.now() : 0, [serverNow]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!nextDailyAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [nextDailyAt]);
  if (!nextDailyAt) return null;
  const remaining = Date.parse(nextDailyAt) - (now + skewMs);
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) {
    return <span data-testid="next-daily-countdown"
      className="whitespace-nowrap text-[9px] text-emerald-300 min-[500px]:text-[10px]">
      New Daily ready
    </span>;
  }
  const value = durationLabel(remaining);
  return (
    <span data-testid="next-daily-countdown" role="timer"
      aria-label={`Next Daily in ${value}`}
      className="whitespace-nowrap font-mono text-[9px] tabular-nums text-[var(--ranked-muted,#a8a29e)] min-[500px]:text-[10px]">
      <span className="hidden min-[440px]:inline">Next Daily in </span>{value}
    </span>
  );
}
