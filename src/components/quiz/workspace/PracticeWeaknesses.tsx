/**
 * HUB4 — the recurring Practice / Time Trial weaknesses, inside History's
 * contextual Questions section.
 *
 * This is what survives of the old Trends pane in History, and only this: the
 * server's `is_recurring_weak` categories with the existing hand-off to the
 * Practice Builder. The pane's headline figures, category and mode lists and
 * window picker are the Academy carousel's (the same `usePerformanceTrends`
 * source), and Daily comparison is HUB2's run analysis — so none of those
 * is repeated here.
 *
 * It reads only while the section is open, draws nothing for a Free payload
 * (which carries no `is_recurring_weak`) and nothing on a failed read: the
 * Owned/Missed sources beside it state their own errors and paywalls, and a
 * supplementary list has no business adding a third.
 */
import { useMemo } from "react";
import RecurringWeaknesses, { type TrendsPracticePreset } from "@/components/quiz/trends/RecurringWeaknesses";
import { usePerformanceTrends, type TrendsSource } from "@/components/quiz/trends/usePerformanceTrends";

export default function PracticeWeaknesses({
  enabled,
  source,
  onPractise,
}: {
  enabled: boolean;
  source?: TrendsSource;
  onPractise?: (preset: TrendsPracticePreset) => void;
}) {
  const trends = usePerformanceTrends(enabled, source);
  const recurring = useMemo(
    () => (trends.report?.categories ?? []).filter((c) => c.is_recurring_weak === true),
    [trends.report],
  );
  if (!enabled || recurring.length === 0) return null;
  return (
    <div className="mt-3" data-testid="history-practice-weaknesses">
      <RecurringWeaknesses categories={recurring} onPractise={onPractise} />
    </div>
  );
}
