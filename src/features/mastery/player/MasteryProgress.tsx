/**
 * Question progress indicator (G5.2B). Presentation only.
 */

export function MasteryProgress({ index, total }: { index: number; total: number }) {
  const current = Math.min(index + 1, total);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div data-testid="mastery-progress" className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Question {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-label="Mastery Set progress"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
