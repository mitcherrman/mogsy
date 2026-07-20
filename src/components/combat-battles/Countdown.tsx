// Presentation-only countdown. On reaching the server-provided target it fires
// `onBoundary` so the caller refetches authoritative state — it never unlocks,
// reveals, or settles anything locally.
import { Clock } from "lucide-react";
import { useCountdown, formatDuration } from "@/hooks/useCombatBattles";

type Props = {
  label: string;
  targetIso: string | null;
  onBoundary?: () => void;
  className?: string;
};

export default function Countdown({ label, targetIso, onBoundary, className }: Props) {
  const remaining = useCountdown(targetIso, onBoundary);
  if (!targetIso || remaining == null) return null;
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" aria-hidden />
        <span>{label}</span>
        <span
          className="font-semibold tabular-nums text-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          {remaining <= 0 ? "now" : formatDuration(remaining)}
        </span>
      </div>
    </div>
  );
}
