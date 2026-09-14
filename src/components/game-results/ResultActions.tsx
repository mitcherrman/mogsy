/**
 * THE WAY OUT, in three weights.
 *
 * Play Again is the primary, Review Match is a prominent secondary, and Back
 * to Leaguecraft is quiet. That ordering is the product's opinion about what a
 * player should do next, and it is the same opinion in every mode — which is
 * why it lives here and not in five adapters.
 *
 * REVIEW IS NOT A FOOTNOTE. Mogzy is a study product, and a result screen
 * whose only prominent controls are "again" and "leave" is a PvP scoreboard
 * wearing its coat. So review gets a real button, at the same height as the
 * primary, and only the exit is allowed to look like a link.
 */
import { Button } from "@/components/ui/button";
import type { ResultActions as Actions } from "./model";

export function ResultActions({ actions }: { actions: Actions }) {
  const { primary, secondary, tertiary } = actions;
  if (!primary && !secondary && !tertiary) return null;
  return (
    <div data-testid="result-actions" className="space-y-2">
      {(primary || secondary) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {primary && (
            <Button
              type="button"
              data-testid={primary.testId ?? "result-primary"}
              disabled={primary.disabled}
              onClick={primary.onClick}
              className="min-h-[44px] flex-1"
            >
              {primary.label}
            </Button>
          )}
          {secondary && (
            <Button
              type="button"
              variant="outline"
              data-testid={secondary.testId ?? "result-secondary"}
              disabled={secondary.disabled}
              onClick={secondary.onClick}
              className="min-h-[44px] flex-1 border-[#c9a84c]/55 bg-[#f0d78c]/5
                font-semibold text-[#f5e6b8] hover:bg-[#f0d78c]/12 hover:text-[#fdf3d4]"
            >
              {secondary.label}
            </Button>
          )}
        </div>
      )}
      {tertiary && (
        <Button
          type="button"
          variant="ghost"
          data-testid={tertiary.testId ?? "result-tertiary"}
          disabled={tertiary.disabled}
          onClick={tertiary.onClick}
          className="min-h-[44px] w-full text-xs font-medium text-muted-foreground
            hover:text-slate-200"
        >
          {tertiary.label}
        </Button>
      )}
    </div>
  );
}
