// Community prediction split — backend aggregate values only. Handles zero
// predictions cleanly; never exposes individual users.
import { Progress } from "@/components/ui/progress";
import { fmtPct } from "@/lib/combat-battles/lifecycle";
import type { PredictionSummary } from "@/lib/combat-battles/types";

type Props = {
  summary: PredictionSummary;
  leftName: string;
  rightName: string;
};

export default function CommunitySplit({ summary, leftName, rightName }: Props) {
  const { left_count, right_count, total_count, left_percent, right_percent } = summary;
  return (
    <div className="space-y-2" aria-label="Community prediction split">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{leftName}</span>
        <span className="text-muted-foreground">
          {total_count === 0 ? "No predictions yet" : `${total_count} prediction${total_count === 1 ? "" : "s"}`}
        </span>
        <span className="font-medium">{rightName}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-right text-sm tabular-nums">{fmtPct(left_percent)}</span>
        <Progress
          value={total_count === 0 ? 50 : left_percent}
          className="h-2 flex-1"
          aria-label={`${leftName} ${fmtPct(left_percent)}, ${rightName} ${fmtPct(right_percent)}`}
        />
        <span className="w-12 text-sm tabular-nums">{fmtPct(right_percent)}</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{left_count} backing {leftName}</span>
        <span>{right_count} backing {rightName}</span>
      </div>
    </div>
  );
}
