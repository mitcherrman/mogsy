import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  HelpCircle,
  Loader2,
  RefreshCw,
  Server,
  Stethoscope,
  Trophy,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { quizApi, type QuizSet, type QuizQuestion, type QuizStats, type QuizProgress, type QuizAchievement, type QuizAchievementsResponse, resolveQuizAssetUrl } from "@/lib/quiz/api";
import QuizAchievementsCard from "@/components/quiz/QuizAchievementsCard";

/* ─────────────── helpers ─────────────── */

const ENV_API =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) || "";

type CheckResult = {
  ok: boolean;
  status?: number;
  url: string;
  durationMs: number;
  data?: any;
  error?: string;
};

async function timedFetchQuiz(
  path: string,
  init?: RequestInit
): Promise<CheckResult> {
  const url = `${quizApi.baseUrl}${path}`;
  const start = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const dur = performance.now() - start;
    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        url,
        durationMs: dur,
        data,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    return { ok: true, status: res.status, url, durationMs: dur, data };
  } catch (err: any) {
    return {
      ok: false,
      url,
      durationMs: performance.now() - start,
      error: err?.message || String(err),
    };
  }
}

function getChoiceLabel(choice: string | { label: string }): string {
  return typeof choice === "string" ? choice : choice.label;
}

/* ─────────────── small UI primitives ─────────────── */

function Panel({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/40 bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {k}
      </span>
      <span className="break-all font-mono text-xs text-foreground">{v}</span>
    </div>
  );
}

function StatusPill({
  state,
  labels = { ok: "OK", fail: "FAIL", pending: "…" },
}: {
  state: "ok" | "fail" | "pending" | "idle";
  labels?: { ok?: string; fail?: string; pending?: string; idle?: string };
}) {
  if (state === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        {labels.pending}
      </Badge>
    );
  }
  if (state === "ok") {
    return (
      <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        {labels.ok}
      </Badge>
    );
  }
  if (state === "fail") {
    return (
      <Badge className="gap-1 border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/20">
        <XCircle className="h-3 w-3" />
        {labels.fail}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      {labels.idle || "idle"}
    </Badge>
  );
}

function JsonViewer({
  data,
  defaultOpen = false,
  label = "JSON",
}: {
  data: unknown;
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const text = useMemo(() => {
    if (data === undefined) return "undefined";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {label}
            <span className="ml-1 text-foreground/50">
              ({text.length.toLocaleString()} chars)
            </span>
          </button>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={copy}
        >
          <Clipboard className="h-3 w-3" />
          Copy
        </Button>
      </div>
      <CollapsibleContent>
        <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border/40 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─────────────── endpoint definitions ─────────────── */

const ENDPOINTS = [
  {
    key: "health",
    label: "Health",
    path: "/api/health",
  },
  {
    key: "sets",
    label: "Quiz Sets",
    path: "/api/quiz/sets",
  },
  {
    key: "sampleQuestions",
    label: "Sample Questions",
    path: `/api/quiz/questions?set=${encodeURIComponent("New Player Basics")}&limit=3`,
  },
  {
    key: "stats",
    label: "Quiz Stats",
    path: "/api/quiz/stats",
  },
  {
    key: "progress",
    label: "Quiz Progress (anonymous)",
    path: "/api/quiz/progress/anonymous",
  },
] as const;

/* ─────────────── page ─────────────── */

export default function QuizDiagnostics() {
  const frontendUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const mode = import.meta.env.MODE;

  const [results, setResults] = useState<
    Record<string, CheckResult | undefined>
  >({});
  const [loading, setLoading] = useState(false);

  const [sets, setSets] = useState<QuizSet[] | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [statsData, setStatsData] = useState<QuizStats | null>(null);
  const [progressData, setProgressData] = useState<QuizProgress | null>(null);
  const [achievementsRaw, setAchievementsRaw] = useState<QuizAchievementsResponse | null>(null);
  const [achievementsList, setAchievementsList] = useState<QuizAchievement[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [achievementsError, setAchievementsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAchievementsLoading(true);
    setAchievementsError(null);
    quizApi
      .getAchievements("anonymous")
      .then((data) => {
        if (cancelled) return;
        setAchievementsRaw(data);
        const list = data.achievements
          ? data.achievements
          : [
              ...(data.unlocked || []).map((a) => ({ ...a, unlocked: true })),
              ...(data.locked || []).map((a) => ({ ...a, unlocked: false })),
            ];
        setAchievementsList(list);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setAchievementsError(err?.message || "Achievements unavailable.");
        setAchievementsList([]);
        setAchievementsRaw(null);
      })
      .finally(() => {
        if (!cancelled) setAchievementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runCheck = async (key: string, path: string) => {
    const res = await timedFetchQuiz(path);
    setResults((s) => ({ ...s, [key]: res }));
    return res;
  };

  const runAll = async () => {
    setLoading(true);
    for (const ep of ENDPOINTS) {
      await runCheck(ep.key, ep.path);
    }
    setLoading(false);
  };

  // On mount, auto-run all checks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      for (const ep of ENDPOINTS) {
        if (cancelled) break;
        await runCheck(ep.key, ep.path);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive sets and questions from results
  useEffect(() => {
    const setsResult = results["sets"];
    if (setsResult?.ok && setsResult.data) {
      const d = setsResult.data;
      if (Array.isArray(d.sets)) setSets(d.sets);
      else if (Array.isArray(d)) setSets(d);
      else setSets([]);
    } else if (setsResult && !setsResult.ok) {
      setSets(null);
    }

    const qResult = results["sampleQuestions"];
    if (qResult?.ok && qResult.data) {
      const d = qResult.data;
      if (Array.isArray(d.questions)) setQuestions(d.questions);
      else if (Array.isArray(d)) setQuestions(d);
      else setQuestions([]);
    } else if (qResult && !qResult.ok) {
      setQuestions(null);
    }

    const statsResult = results["stats"];
    if (statsResult?.ok && statsResult.data) {
      const d = statsResult.data;
      if (d.stats) setStatsData(d.stats);
      else setStatsData(d);
    } else if (statsResult && !statsResult.ok) {
      setStatsData(null);
    }

    const progressResult = results["progress"];
    if (progressResult?.ok && progressResult.data) {
      const d = progressResult.data;
      setProgressData((d?.progress as QuizProgress) || (d as QuizProgress));
    } else if (progressResult && !progressResult.ok) {
      setProgressData(null);
    }
  }, [results]);

  // Debug summary
  const summary = useMemo(() => {
    const health = results["health"];
    const setsRes = results["sets"];
    const qRes = results["sampleQuestions"];
    const statsRes = results["stats"];

    const healthOk = !!health?.ok;
    const setsOk = !!setsRes?.ok;
    const setsEmpty = setsOk && (sets?.length ?? 0) === 0;
    const qOk = !!qRes?.ok;
    const statsOk = !!statsRes?.ok;
    const statsHasQuestions = statsOk && (statsData?.total_questions ?? 0) > 0;

    const firstError = [
      health?.error,
      setsRes?.error,
      qRes?.error,
      statsRes?.error,
    ].find(Boolean) as string | undefined;

    let issue = "";
    if (!healthOk) {
      issue = "Combat Lab API is unreachable from frontend.";
    } else if (statsRes?.status === 404) {
      issue = "Quiz stats endpoint is missing on the Railway backend.";
    } else if (setsRes?.status === 404) {
      issue = "Quiz endpoints are missing on the Railway backend.";
    } else if (setsOk && statsOk && statsHasQuestions) {
      issue = "Quiz stats endpoint healthy.";
    } else if (setsOk && statsOk && !statsHasQuestions) {
      issue = "Quiz stats endpoint works but no active questions are present.";
    } else if (setsOk && !statsOk) {
      issue = "Quiz sets work, but stats endpoint is missing or failing.";
    } else if (setsEmpty) {
      issue =
        "Backend is online, but quiz tables/endpoints may not be deployed or seeded.";
    } else if (setsOk && sets && sets.length > 0) {
      issue = "Quiz backend appears healthy and seeded.";
    } else {
      issue = "Quiz endpoint exists but quiz data is missing.";
    }

    return {
      issue,
      firstError,
      healthOk,
      setsOk,
      qOk,
      statsOk,
      statsHasQuestions,
      setsEmpty,
    };
  }, [results, sets, statsData]);

  const copyDebugReport = async () => {
    const health = results["health"];
    const setsRes = results["sets"];
    const qRes = results["sampleQuestions"];
    const statsRes = results["stats"];

    const reportLines = [
      `Quiz Diagnostics Report`,
      `Generated: ${new Date().toISOString()}`,
      `Frontend URL: ${frontendUrl}`,
      `Base URL: ${quizApi.baseUrl}`,
      `VITE_COMBAT_API_URL: ${ENV_API || "not set"}`,
      ``,
      `--- Health Check ---`,
      `URL: ${health?.url || `${quizApi.baseUrl}/api/health`}`,
      `Status: ${health?.ok ? "OK" : "FAILED"}`,
      health?.status ? `HTTP: ${health.status}` : null,
      health?.durationMs ? `Duration: ${Math.round(health.durationMs)} ms` : null,
      health?.error ? `Error: ${health.error}` : null,
      ``,
      `--- Quiz Sets ---`,
      `URL: ${setsRes?.url || `${quizApi.baseUrl}/api/quiz/sets`}`,
      `Status: ${setsRes?.ok ? "OK" : "FAILED"}`,
      setsRes?.status ? `HTTP: ${setsRes.status}` : null,
      setsRes?.durationMs ? `Duration: ${Math.round(setsRes.durationMs)} ms` : null,
      `Set count: ${sets?.length ?? "N/A"}`,
      setsRes?.error ? `Error: ${setsRes.error}` : null,
      ``,
      `--- Sample Questions ---`,
      `URL: ${qRes?.url || `${quizApi.baseUrl}/api/quiz/questions?set=New+Player+Basics&limit=3`}`,
      `Status: ${qRes?.ok ? "OK" : "FAILED"}`,
      qRes?.status ? `HTTP: ${qRes.status}` : null,
      qRes?.durationMs ? `Duration: ${Math.round(qRes.durationMs)} ms` : null,
      `Question count: ${questions?.length ?? "N/A"}`,
      qRes?.error ? `Error: ${qRes.error}` : null,
      ``,
      `--- Quiz Stats ---`,
      `URL: ${statsRes?.url || `${quizApi.baseUrl}/api/quiz/stats`}`,
      `Status: ${statsRes?.ok ? "OK" : "FAILED"}`,
      statsRes?.status ? `HTTP: ${statsRes.status}` : null,
      statsRes?.durationMs ? `Duration: ${Math.round(statsRes.durationMs)} ms` : null,
      statsData ? `Total questions: ${statsData.total_questions}` : null,
      statsData ? `Total attempts: ${statsData.total_attempts}` : null,
                statsData ? `Overall accuracy: ${Number(statsData.overall_accuracy ?? 0).toFixed(2)}%` : null,
      statsData ? `Category count: ${statsData.categories.length}` : null,
      statsData ? `Set count: ${statsData.sets.length}` : null,
      statsRes?.error ? `Error: ${statsRes.error}` : null,
      ``,
      `--- Summary ---`,
      summary.issue,
      summary.firstError ? `First error: ${summary.firstError}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(reportLines);
      toast({
        title: "Debug report copied",
        description: "Paste it into ChatGPT or a bug report.",
      });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const overallState: "ok" | "fail" | "pending" | "idle" = loading
    ? "pending"
    : !results["health"]
    ? "idle"
    : summary.healthOk && summary.setsOk && summary.statsOk
    ? "ok"
    : "fail";

  return (
    <div className="px-4 md:px-0 py-6 md:py-10">
      <SEOHead
        title="Quiz Diagnostics — Mogsy"
        description="Developer diagnostics for the League Quiz backend integration."
      />

      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80">
            <Stethoscope className="h-3.5 w-3.5" />
            League Quiz · Diagnostics
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Backend integration console
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Probes the Railway quiz backend, verifies quiz endpoints, and
            fetches sample data to confirm the integration is healthy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/quiz">
              <ArrowLeft className="h-4 w-4" />
              Back to Quiz
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/quiz/admin">
              <Stethoscope className="h-4 w-4" />
              Admin
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={runAll}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-test All
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1"
            onClick={copyDebugReport}
          >
            <Clipboard className="h-4 w-4" />
            Copy Debug Report
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Environment */}
        <Panel title="Environment" icon={Server}>
          <KV k="Frontend URL" v={frontendUrl || "—"} />
          <KV
            k="VITE_COMBAT_API_URL"
            v={
              ENV_API ? (
                ENV_API
              ) : (
                <span className="text-amber-300">not set</span>
              )
            }
          />
          <KV k="Quiz API Base" v={<span className="text-emerald-300">{quizApi.baseUrl}</span>} />
          <KV k="Current Location" v={typeof window !== "undefined" ? window.location.pathname : "—"} />
          <KV k="Timestamp" v={new Date().toISOString()} />
          <KV k="App Mode" v={mode} />
        </Panel>

        {/* Overall Status */}
        <Panel
          title="Overall Status"
          icon={overallState === "ok" ? Wifi : overallState === "pending" ? Activity : WifiOff}
          right={<StatusPill state={overallState} labels={{ ok: "Healthy", fail: "Unhealthy", pending: "Checking…", idle: "Idle" }} />}
        >
          <KV k="Health" v={results["health"]?.ok ? "Online" : results["health"] ? "Failed" : "Pending"} />
          <KV k="Quiz Sets" v={results["sets"]?.ok ? "Reachable" : results["sets"] ? "Failed" : "Pending"} />
          <KV k="Sample Questions" v={results["sampleQuestions"]?.ok ? "Reachable" : results["sampleQuestions"] ? "Failed" : "Pending"} />
          <KV k="Quiz Stats" v={results["stats"]?.ok ? "Reachable" : results["stats"] ? "Failed" : "Pending"} />
        </Panel>

        {/* Endpoint checks */}
        <div className="lg:col-span-2">
          <Panel
            title="Endpoint Checks"
            icon={Activity}
            right={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={runAll}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Re-test
              </Button>
            }
          >
            <div className="space-y-3">
              {ENDPOINTS.map((ep) => {
                const r = results[ep.key];
                const state: "ok" | "fail" | "pending" | "idle" =
                  loading && !r
                    ? "pending"
                    : !r
                    ? "idle"
                    : r.ok
                    ? "ok"
                    : "fail";
                const count =
                  ep.key === "sets"
                    ? sets?.length ?? null
                    : ep.key === "sampleQuestions"
                    ? questions?.length ?? null
                    : ep.key === "stats"
                    ? statsData?.total_questions ?? null
                    : null;

                return (
                  <motion.div
                    key={ep.key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-md border border-border/40 bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {ep.label}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {ep.path}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {count !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            {count} {ep.key === "sets" ? "sets" : ep.key === "stats" ? "total" : "questions"}
                          </span>
                        )}
                        {r?.durationMs !== undefined && (
                          <span className="text-[11px] text-muted-foreground">
                            {Math.round(r.durationMs)}ms
                          </span>
                        )}
                        <StatusPill state={state} />
                      </div>
                    </div>
                    {r?.error && (
                      <div className="mt-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                        {r.error}
                      </div>
                    )}
                    {r?.data !== undefined && (
                      <div className="mt-2">
                        <JsonViewer data={r.data} label="Response" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Quiz sets report */}
        <Panel
          title="Quiz Sets Report"
          icon={HelpCircle}
          right={
            sets === null ? (
              <span className="text-[11px] text-muted-foreground">Not loaded</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{sets.length} sets</span>
            )
          }
        >
          {sets === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-sm text-muted-foreground">
              No quiz sets returned.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {sets.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {s.question_count} Qs
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Sample questions report */}
        <Panel
          title="Sample Questions Report"
          icon={HelpCircle}
          right={
            questions === null ? (
              <span className="text-[11px] text-muted-foreground">Not loaded</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{questions.length} questions</span>
            )
          }
        >
          {questions === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-sm text-muted-foreground">
              No questions returned.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-auto">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {q.category}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ID: {q.id}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug">
                    {q.question_text}
                  </p>
                  {q.choices && q.choices.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {q.choices.map((c, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          {String.fromCharCode(65 + i)}. {getChoiceLabel(c)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {q.difficulty !== undefined && <span>Difficulty: {q.difficulty}</span>}
                    {q.image_path && <span>Has image</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Quiz Stats Report */}
        <Panel
          title="Quiz Stats Report"
          icon={Activity}
          right={
            statsData === null ? (
              <span className="text-[11px] text-muted-foreground">Not loaded</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {(statsData.total_questions ?? 0)} Q / {(statsData.total_attempts ?? 0)} A
              </span>
            )
          }
        >
          {statsData === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Questions</div>
                  <div className="text-lg font-semibold">{statsData.total_questions}</div>
                </div>
                <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Attempts</div>
                  <div className="text-lg font-semibold">{statsData.total_attempts}</div>
                </div>
                <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Overall Accuracy</div>
                  <div className="text-lg font-semibold">{Number(statsData.overall_accuracy ?? 0).toFixed(2)}%</div>
                </div>
              </div>

              {statsData.formats && (Array.isArray(statsData.formats) ? statsData.formats.length > 0 : Object.keys(statsData.formats).length > 0) && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Formats</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(statsData.formats)
                      ? (statsData.formats as any[]).map((f, i) => {
                          const name = f?.format ?? f?.name ?? String(i);
                          const count = f?.question_count ?? f?.count ?? 0;
                          return [name, count] as [string, number];
                        })
                      : Object.entries(statsData.formats as Record<string, number>)
                    ).map(([fmt, count]) => (
                      <Badge key={String(fmt)} variant="secondary" className="text-[10px]">
                        {String(fmt)}: {String(count)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {statsData.categories && statsData.categories.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Categories</div>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {statsData.categories.map((cat) => (
                      <div
                        key={cat.name}
                        className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-1.5"
                      >
                        <span className="text-sm">{cat.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {cat.question_count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {statsData.sets && statsData.sets.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Sets</div>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {statsData.sets.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-1.5"
                      >
                        <span className="text-sm">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {s.question_count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Debug summary card */}
        <div className="lg:col-span-2">
          {/* Quiz Progress */}
          <div className="mb-6">
            <Panel
              title="Quiz Progress (anonymous)"
              icon={Activity}
              right={
                <StatusPill
                  state={
                    !results["progress"]
                      ? "idle"
                      : results["progress"].ok
                      ? "ok"
                      : "fail"
                  }
                />
              }
            >
              {!progressData ? (
                <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-xs text-muted-foreground">
                  No progression data returned yet.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {progressData.rank_icon && (
                      <img
                        src={resolveQuizAssetUrl(progressData.rank_icon)}
                        alt={(typeof progressData.rank === "string" ? progressData.rank : progressData.rank_name) || "Rank"}
                        className="h-12 w-12 object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold">
                        {progressData.rank_name || (typeof progressData.rank === "string" ? progressData.rank : undefined) || "Unranked"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Next: {progressData.next_rank_name || (typeof progressData.next_rank === "string" ? progressData.next_rank : undefined) || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <KV k="XP" v={progressData.xp ?? "—"} />
                    <KV
                      k="Accuracy"
                      v={progressData.accuracy !== undefined ? `${Number(progressData.accuracy).toFixed(2)}%` : "—"}
                    />
                    <KV k="Streak" v={progressData.current_streak ?? "—"} />
                    <KV k="Best Streak" v={progressData.best_streak ?? "—"} />
                    <KV k="Attempts" v={progressData.attempts ?? "—"} />
                    <KV
                      k="Progress"
                      v={progressData.progress_percent !== undefined ? `${Number(progressData.progress_percent).toFixed(2)}%` : "—"}
                    />
                  </div>
                  <JsonViewer data={progressData} label="Raw JSON" />
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Debug Summary" icon={Stethoscope}>
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                summary.healthOk && summary.setsOk && summary.statsOk && summary.statsHasQuestions
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : summary.healthOk && summary.setsOk && summary.statsOk
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : summary.healthOk
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold mb-1">
                {summary.healthOk && summary.setsOk && summary.statsOk && summary.statsHasQuestions ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Likely Issue
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Likely Issue
                  </>
                )}
              </div>
              <p className="text-xs leading-relaxed opacity-90">
                {summary.issue}
              </p>
              {summary.firstError && (
                <p className="text-[11px] mt-1.5 opacity-80">
                  First error: {summary.firstError}
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
