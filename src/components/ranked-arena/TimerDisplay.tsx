/**
 * Shared round-timer display (F1 canonical arena, Phase B).
 *
 * Purely controlled: renders an externally supplied TimerView. It owns no
 * interval, computes no deadline, and never resolves timeouts — the backend
 * is authoritative and controllers (live polling, tutorial director) feed the
 * countdown (see lib/ranked-core/timerMath for the skew-safe derivation).
 * Supports paused (tutorial), urgent, and zero states. Ticking digits are
 * aria-live="off" so screen readers are not flooded; controllers announce
 * warnings through their own live region.
 */
import { Badge } from "@/components/ui/badge";
import { TimerView } from "@/lib/ranked-core/viewTypes";

const format = (totalSeconds: number): string => {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export function TimerDisplay({ timer, label = "Round timer" }: { timer: TimerView; label?: string }) {
  const { remainingSeconds, durationSeconds, paused, urgent, modifierNotices } = timer;
  const expired = remainingSeconds <= 0;
  return (
    <section aria-label={label} data-testid="timer-display" className="text-center space-y-1">
      <div
        aria-live="off"
        aria-label={`Time remaining ${format(remainingSeconds)}`}
        data-testid="timer-value"
        data-timer-state={paused ? "paused" : expired ? "zero" : urgent ? "urgent" : "running"}
        className={`font-mono text-3xl font-bold tabular-nums ${
          expired || urgent ? "text-destructive" : "text-foreground"
        }`}
      >
        {format(remainingSeconds)}
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        of {format(durationSeconds)} shared round
      </div>
      {paused && (
        <Badge variant="secondary" data-testid="timer-paused">
          Paused
        </Badge>
      )}
      {expired && !paused && (
        <div role="status" className="text-xs text-muted-foreground">
          Time's up — waiting for the round to resolve.
        </div>
      )}
      {(modifierNotices ?? []).map((notice) => (
        <div key={notice} className="text-xs text-amber-500" data-testid="timer-notice">
          {notice}
        </div>
      ))}
    </section>
  );
}
