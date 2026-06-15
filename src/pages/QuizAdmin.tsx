import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SEOHead from "@/components/SEOHead";
import { quizApi, type QuizReport } from "@/lib/quiz/api";

type StatusFilter = "open" | "resolved" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open reports" },
  { key: "resolved", label: "Resolved reports" },
  { key: "all", label: "All reports" },
];

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function QuizAdmin() {
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [reports, setReports] = useState<QuizReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Override dialog state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<QuizReport | null>(null);
  const [overrideAnswer, setOverrideAnswer] = useState("");
  const [overrideExplanation, setOverrideExplanation] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const load = useCallback(async (f: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await quizApi.getReports(f === "all" ? undefined : f);
      setReports(data.reports || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const handleResolve = useCallback(
    async (report: QuizReport, resolution: "resolved" | "invalid") => {
      setBusyId(String(report.id));
      try {
        await quizApi.resolveReport(report.id, { resolution });
        toast.success(resolution === "resolved" ? "Marked resolved." : "Marked invalid.");
        await load(filter);
      } catch (err: any) {
        toast.error(err?.message || "Failed to update report.");
      } finally {
        setBusyId(null);
      }
    },
    [filter, load]
  );

  const openOverride = useCallback((report: QuizReport) => {
    setOverrideTarget(report);
    setOverrideAnswer(report.expected_answer || "");
    setOverrideExplanation("");
    setOverrideNotes("");
    setOverrideOpen(true);
  }, []);

  const submitOverride = useCallback(async () => {
    if (!overrideTarget) return;
    if (!overrideAnswer.trim()) {
      toast.error("New correct answer is required.");
      return;
    }
    setOverrideSubmitting(true);
    try {
      await quizApi.overrideQuestion({
        question_id: overrideTarget.question_id,
        new_correct_answer: overrideAnswer.trim(),
        new_explanation: overrideExplanation.trim() || undefined,
        notes: overrideNotes.trim() || undefined,
        report_id: overrideTarget.id,
      });
      toast.success("Override applied.");
      setOverrideOpen(false);
      await load(filter);
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply override.");
    } finally {
      setOverrideSubmitting(false);
    }
  }, [overrideTarget, overrideAnswer, overrideExplanation, overrideNotes, filter, load]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <SEOHead
        title="Quiz Admin — Mogsy"
        description="Review and resolve user-submitted League Quiz reports."
        path="/quiz/admin"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            League Quiz · Admin
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">Quiz Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review user-submitted reports and apply overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/quiz/diagnostics">
              <ArrowLeft className="h-4 w-4" />
              Diagnostics
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => load(filter)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Overrides fix the live quiz immediately but do not change the source generator data.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          No reports found for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={String(r.id)} className="bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">Report #{r.id}</Badge>
                    <Badge variant="secondary" className="text-[10px]">Q #{r.question_id}</Badge>
                    {r.category && (
                      <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    )}
                    {r.report_type && (
                      <Badge variant="outline" className="text-[10px]">{r.report_type}</Badge>
                    )}
                    {r.status && (
                      <Badge
                        variant={r.status === "open" ? "default" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {r.status}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtDate(r.created_at)}</span>
                </div>
                {r.question_text && (
                  <CardTitle className="text-base font-semibold leading-snug pt-2">
                    {r.question_text}
                  </CardTitle>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Current correct answer" value={r.current_correct_answer} />
                  <Field label="Reported answer" value={r.reported_answer} />
                  <Field label="Expected answer" value={r.expected_answer} />
                  <Field label="Reporter" value={r.reporter_id} />
                </div>
                {r.reason && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Reason
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                      {r.reason}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleResolve(r, "resolved")}
                    disabled={busyId === String(r.id)}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark resolved
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResolve(r, "invalid")}
                    disabled={busyId === String(r.id)}
                    className="gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Mark invalid
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openOverride(r)}
                    className="gap-1"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Apply override
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply override</DialogTitle>
            <DialogDescription>
              Updates the live quiz answer for question #{overrideTarget?.question_id}.
              Source generator data is not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">New correct answer</Label>
              <Input
                value={overrideAnswer}
                onChange={(e) => setOverrideAnswer(e.target.value)}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New explanation</Label>
              <Textarea
                value={overrideExplanation}
                onChange={(e) => setOverrideExplanation(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="Internal notes (optional)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)} disabled={overrideSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitOverride} disabled={overrideSubmitting || !overrideAnswer.trim()}>
              {overrideSubmitting ? "Applying..." : "Apply override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-sm text-foreground/90 break-words">
        {value ? value : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}