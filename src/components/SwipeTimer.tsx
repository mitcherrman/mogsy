import { Timer } from "lucide-react";

interface SwipeTimerProps {
  timeLeft: number;
  duration: number;
}

export default function SwipeTimer({ timeLeft, duration }: SwipeTimerProps) {
  const pct = (timeLeft / duration) * 100;
  const isUrgent = timeLeft <= 3;

  return (
    <div className="flex items-center gap-1.5">
      <Timer className={`h-3.5 w-3.5 ${isUrgent ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${isUrgent ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-bold tabular-nums ${isUrgent ? "text-destructive" : "text-muted-foreground"}`}>
        {timeLeft}s
      </span>
    </div>
  );
}
