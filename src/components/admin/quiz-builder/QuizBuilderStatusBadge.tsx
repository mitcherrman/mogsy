import { CheckCircle2, AlertTriangle, HelpCircle, Circle, Send, XCircle, FileText } from "lucide-react";
import { COVERAGE_META } from "@/lib/quiz-builder/logic";
import type { QuizBuilderCoverageStatus, QuizBuilderDraftStatus } from "@/lib/quiz/api";

const TONE_CLASS: Record<"ok" | "warn" | "muted", string> = {
  ok: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/50 bg-amber-400/10 text-amber-300",
  muted: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

const COVERAGE_ICON: Record<QuizBuilderCoverageStatus, React.ElementType> = {
  complete: CheckCircle2,
  partial: AlertTriangle,
  in_progress: AlertTriangle,
  unavailable: Circle,
  unknown: HelpCircle,
};

/** Coverage badge — icon + label, tone by production-readiness. */
export function CoverageBadge({ status }: { status: QuizBuilderCoverageStatus }) {
  const meta = COVERAGE_META[status] ?? COVERAGE_META.unknown;
  const Icon = COVERAGE_ICON[status] ?? HelpCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASS[meta.tone]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {/* status word is also spelled out so it isn't color-only */}
      {meta.label}
    </span>
  );
}

const DRAFT_STATUS_CONFIG: Record<
  QuizBuilderDraftStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  draft: { label: "Draft", className: "border-sky-400/50 bg-sky-400/10 text-sky-300", icon: FileText },
  rejected: { label: "Rejected", className: "border-red-400/50 bg-red-400/10 text-red-300", icon: XCircle },
  sent_to_review: { label: "Sent to reviewer", className: "border-violet-400/50 bg-violet-400/10 text-violet-300", icon: Send },
};

/** Draft lifecycle badge. */
export function DraftStatusBadge({ status }: { status: QuizBuilderDraftStatus }) {
  const cfg = DRAFT_STATUS_CONFIG[status] ?? DRAFT_STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {cfg.label}
    </span>
  );
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Recognition", 2: "Recall", 3: "Comparison", 4: "Reasoning", 5: "Simulation",
};

/** Compact difficulty chip, e.g. "D2 · Recall". */
export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      title={DIFFICULTY_LABELS[difficulty]}
    >
      D{difficulty}
      <span className="font-normal">· {DIFFICULTY_LABELS[difficulty] ?? "—"}</span>
    </span>
  );
}
