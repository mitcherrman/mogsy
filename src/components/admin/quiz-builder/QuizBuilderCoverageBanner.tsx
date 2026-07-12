import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { COVERAGE_META, isProductionReady } from "@/lib/quiz-builder/logic";
import type { QuizBuilderCoverageStatus } from "@/lib/quiz/api";

type Props = {
  year: number;
  scopeLabel: string;
  status: QuizBuilderCoverageStatus;
  warnings?: string[];
};

/**
 * Prominent coverage banner shown on candidate/draft previews. For complete
 * data it's a compact confirmation; for incomplete data it's a warning that
 * spells out that the item can be saved but not sent to the reviewer.
 */
export function QuizBuilderCoverageBanner({ year, scopeLabel, status, warnings = [] }: Props) {
  const ready = isProductionReady(status);
  const meta = COVERAGE_META[status] ?? COVERAGE_META.unknown;

  if (ready) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-200"
        role="status"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-medium">
          {year} · {scopeLabel} · {meta.label}
        </span>
      </div>
    );
  }

  return (
    <Alert variant="destructive" className="border-amber-400/40 bg-amber-400/10 text-amber-200">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle className="text-xs font-semibold">
        TEST DATA — historical import is incomplete
      </AlertTitle>
      <AlertDescription className="space-y-1 text-[11px] text-amber-200/90">
        <p>
          {year} · {scopeLabel} · {meta.label}. This candidate may be saved as a draft but
          cannot be sent to the reviewer, and rankings should not be treated as final.
        </p>
        {warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
