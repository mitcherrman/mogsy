import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, Wrench, CheckCircle2, XCircle, Loader2, Zap, Power, PowerOff, ListChecks, Radio, Settings2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SEOHead from "@/components/SEOHead";
import { quizApi, type QuizReport, type QuizOverride } from "@/lib/quiz/api";
import { supabase } from "@/integrations/supabase/client";

export type QuizOnboardingConfig = {
  hard_gate_enabled: boolean;
  hard_gate_threshold: number;
  soft_nudge_enabled: boolean;
  soft_nudge_threshold: number;
  redirect_to_hub: boolean;
};

const DEFAULT_ONBOARDING_CONFIG: QuizOnboardingConfig = {
  hard_gate_enabled: true,
  hard_gate_threshold: 5,
  soft_nudge_enabled: true,
  soft_nudge_threshold: 3,
  redirect_to_hub: true,
};

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
  // Onboarding config
  const [onboardingConfig, setOnboardingConfig] = useState<QuizOnboardingConfig>(DEFAULT_ONBOARDING_CONFIG);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingSaving, setOnboardingSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "quiz_onboarding_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "object") {
          setOnboardingConfig({ ...DEFAULT_ONBOARDING_CONFIG, ...(data.value as Partial<QuizOnboardingConfig>) });
        }
        setOnboardingLoading(false);
      });
  }, []);

  const saveOnboardingConfig = async () => {
    setOnboardingSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "quiz_onboarding_config", value: onboardingConfig as any }, { onConflict: "key" });
    setOnboardingSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Onboarding settings saved.");
    }
  };

  const [filter, setFilter] = useState<StatusFilter>("open");
  const [reports, setReports] = useState<QuizReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Active overrides
  const [overrides, setOverrides] = useState<QuizOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [overrideBusyId, setOverrideBusyId] = useState<string | null>(null);

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

  const loadOverrides = useCallback(async () => {
    setOverridesLoading(true);
    setOverridesError(null);
    try {
      const data = await quizApi.listOverrides(false);
      setOverrides(data.overrides || []);
    } catch (err: any) {
      setOverridesError(err?.message || "Failed to load overrides.");
      setOverrides([]);
    } finally {
      setOverridesLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  useEffect(() => {
    loadOverrides();
  }, [loadOverrides]);

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
      await loadOverrides();
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply override.");
    } finally {
      setOverrideSubmitting(false);
    }
  }, [overrideTarget, overrideAnswer, overrideExplanation, overrideNotes, filter, load, loadOverrides]);

  const applyExpectedAsOverride = useCallback(
    async (report: QuizReport) => {
      if (!report.expected_answer) {
        toast.error("Report has no expected answer to apply.");
        return;
      }
      setBusyId(String(report.id));
      try {
        await quizApi.overrideQuestion({
          question_id: report.question_id,
          new_correct_answer: report.expected_answer,
          notes: `Quick-apply from report #${report.id}`,
          report_id: report.id,
        });
        toast.success("Expected answer applied as override.");
        await load(filter);
        await loadOverrides();
      } catch (err: any) {
        toast.error(err?.message || "Failed to apply override.");
      } finally {
        setBusyId(null);
      }
    },
    [filter, load, loadOverrides],
  );

  const toggleOverrideActive = useCallback(
    async (o: QuizOverride) => {
      setOverrideBusyId(String(o.id));
      try {
        await quizApi.setOverrideActive(o.id, !(o.active ?? true));
        toast.success(!(o.active ?? true) ? "Override reactivated." : "Override deactivated.");
        await loadOverrides();
      } catch (err: any) {
        toast.error(err?.message || "Failed to update override.");
      } finally {
        setOverrideBusyId(null);
      }
    },
    [loadOverrides],
  );

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
          <Button asChild variant="outline" size="sm" className="gap-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
            <Link to="/admin/quiz-broadcast">
              <Radio className="h-4 w-4" />
              Broadcast Studio
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

      {/* Onboarding & Gate Settings */}
      <div className="mb-8">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <Settings2 className="h-4 w-4 text-primary" />
          Onboarding &amp; Gate Settings
        </h2>
        {onboardingLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardContent className="pt-5 space-y-5">
              {/* Hub redirect */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Redirect /quiz to hub</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Users who land on /quiz directly are instantly sent to /lol first.
                  </p>
                </div>
                <Switch
                  checked={onboardingConfig.redirect_to_hub}
                  onCheckedChange={(v) => setOnboardingConfig((c) => ({ ...c, redirect_to_hub: v }))}
                />
              </div>

              <div className="border-t border-border" />

              {/* Soft nudge */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Soft nudge banner</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show a dismissible "sign up to save progress" banner after N answers.
                  </p>
                </div>
                <Switch
                  checked={onboardingConfig.soft_nudge_enabled}
                  onCheckedChange={(v) => setOnboardingConfig((c) => ({ ...c, soft_nudge_enabled: v }))}
                />
              </div>
              {onboardingConfig.soft_nudge_enabled && (
                <div className="flex items-center gap-3 pl-1">
                  <Label className="text-xs text-muted-foreground w-36 shrink-0">Soft nudge after</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    className="w-24"
                    value={onboardingConfig.soft_nudge_threshold}
                    onChange={(e) =>
                      setOnboardingConfig((c) => ({
                        ...c,
                        soft_nudge_threshold: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">answers</span>
                </div>
              )}

              <div className="border-t border-border" />

              {/* Hard gate */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Hard sign-up gate</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Block anonymous users from continuing after N answers.
                  </p>
                </div>
                <Switch
                  checked={onboardingConfig.hard_gate_enabled}
                  onCheckedChange={(v) => setOnboardingConfig((c) => ({ ...c, hard_gate_enabled: v }))}
                />
              </div>
              {onboardingConfig.hard_gate_enabled && (
                <div className="flex items-center gap-3 pl-1">
                  <Label className="text-xs text-muted-foreground w-36 shrink-0">Hard gate after</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="w-24"
                    value={onboardingConfig.hard_gate_threshold}
                    onChange={(e) =>
                      setOnboardingConfig((c) => ({
                        ...c,
                        hard_gate_threshold: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">answers</span>
                </div>
              )}

              <div className="pt-1">
                <Button onClick={saveOnboardingConfig} disabled={onboardingSaving} className="gap-1.5">
                  {onboardingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save settings
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
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
                    {r.question_key && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {r.question_key}
                      </Badge>
                    )}
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
                  {r.expected_answer && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => applyExpectedAsOverride(r)}
                      disabled={busyId === String(r.id)}
                      className="gap-1"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Apply expected as override
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
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
                    variant="outline"
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

      {/* Active overrides */}
      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            Active Overrides
            <Badge variant="secondary" className="text-[10px]">
              {overrides.length}
            </Badge>
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={loadOverrides}
            disabled={overridesLoading}
            className="gap-1"
          >
            {overridesLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {overridesLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : overridesError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {overridesError}
          </div>
        ) : overrides.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            No overrides yet.
          </div>
        ) : (
          <div className="space-y-3">
            {overrides.map((o) => {
              const active = o.active ?? true;
              return (
                <Card key={String(o.id)} className="bg-card/80 backdrop-blur-sm">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">#{o.id}</Badge>
                      {o.question_key && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {o.question_key}
                        </Badge>
                      )}
                      {o.category && (
                        <Badge variant="secondary" className="text-[10px]">
                          {o.category}
                        </Badge>
                      )}
                      <Badge
                        className={`text-[10px] ${
                          active
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                        variant="outline"
                      >
                        {active ? "Active" : "Inactive"}
                      </Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {fmtDate(o.created_at)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <Field label="Overridden answer" value={o.new_correct_answer} />
                      <Field label="Explanation" value={o.new_explanation} />
                    </div>
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant={active ? "outline" : "default"}
                        onClick={() => toggleOverrideActive(o)}
                        disabled={overrideBusyId === String(o.id)}
                        className="gap-1"
                      >
                        {active ? (
                          <>
                            <PowerOff className="h-3.5 w-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Power className="h-3.5 w-3.5" />
                            Reactivate
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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