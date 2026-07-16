/**
 * /dev/content-studio — local Content Post Studio.
 *
 * Drives the local studio server (scripts/content-studio/server.ts): search
 * and select questions, choose a post mode (classic / single-question /
 * answer-reveal / multi-question / daily-package), assign difficulty,
 * generate, preview slides, and browse prior runs.
 *
 * Local dev/admin tooling only: not linked from navigation; useful only when
 * the loopback studio server is running. No credentials in the browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Play, Plus, RefreshCw, Search, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_STUDIO_API_BASE,
  studioApi,
  type StudioHealth,
  type StudioJobStatus,
  type StudioQuestion,
  type StudioRunDetail,
  type StudioRunListEntry,
} from "@/lib/content-studio/api";
import {
  STUDIO_MODES,
  STUDIO_PLATFORMS,
  validateStudioJob,
  type StudioModeKey,
} from "@/lib/quiz-screenshot/studio-request";
import { DIFFICULTY_TIERS, type DifficultyTier } from "@/lib/quiz-screenshot/difficulty";
import { MID_CTA_VARIANTS, REPEAT_COPY_VARIANTS } from "@/lib/quiz-screenshot/challenge";
import { RENDER_FORMATS } from "@/lib/quiz-screenshot/formats";
import { RENDER_STATES } from "@/lib/quiz-screenshot/types";

const MODE_INFO: Record<StudioModeKey, { title: string; blurb: string }> = {
  classic: { title: "Classic", blurb: "State-driven screenshots (question/correct/…) per question." },
  "single-question": { title: "Single question", blurb: "2 slides: question + app CTA." },
  "answer-reveal": { title: "Answer reveal", blurb: "3 slides: recap + answer + community." },
  "multi-question": { title: "Multi-question challenge", blurb: "Opening + N questions + answer blueprint + ending." },
  "daily-package": { title: "Daily package", blurb: "All three coordinated posts from one selection." },
};

type SelectedQuestion = StudioQuestion & { difficultyOverride: DifficultyTier | "" };

function StateBadge({ state }: { state: StudioJobStatus["state"] | "idle" }) {
  const styles: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    queued: "bg-amber-500/20 text-amber-300",
    running: "bg-cyan-500/20 text-cyan-300",
    succeeded: "bg-emerald-500/20 text-emerald-300",
    "succeeded-with-warnings": "bg-amber-500/20 text-amber-300",
    failed: "bg-red-500/20 text-red-300",
  };
  return <Badge className={styles[state] ?? ""}>{state}</Badge>;
}

function RunPreview({ apiBase, detail }: { apiBase: string; detail: StudioRunDetail }) {
  const slides = detail.manifest?.slides ?? null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{detail.run_id}</Badge>
        {detail.manifest ? (
          <>
            <Badge variant="outline">mode: {detail.manifest.mode}</Badge>
            {detail.manifest.package_type ? (
              <Badge variant="outline">{detail.manifest.package_type}</Badge>
            ) : null}
            <Badge variant="outline">
              {detail.manifest.failure_count} failures / {detail.manifest.warning_count} warnings
            </Badge>
            {detail.manifest.difficulty_default ? (
              <Badge variant="outline">difficulty: {detail.manifest.difficulty_default}</Badge>
            ) : null}
          </>
        ) : (
          <Badge variant="outline">legacy run (no manifest)</Badge>
        )}
        {detail.has_contact_sheet ? (
          <a
            className="text-cyan-400 underline"
            href={studioApi.contactSheetUrl(apiBase, detail.run_id)}
            target="_blank"
            rel="noreferrer"
          >
            contact sheet
          </a>
        ) : null}
        <a className="text-cyan-400 underline" href={studioApi.zipUrl(apiBase, detail.run_id)}>
          download zip
        </a>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigator.clipboard?.writeText(`quiz_content_exports/runs/${detail.run_id}`)}
        >
          copy output path
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="slide-grid">
        {(slides
          ? slides.map((s) => ({
              file: s.file,
              label: `${String(s.index).padStart(2, "0")} · ${s.slide_kind}${s.question_id !== undefined ? ` · #${s.question_id}` : ""}${s.difficulty ? ` · ${s.difficulty}` : ""}`,
              dims: s.width && s.height ? `${s.width}×${s.height}` : null,
            }))
          : detail.images.map((f) => ({ file: f, label: f, dims: null }))
        ).map((slide) => (
          <figure key={slide.file} className="space-y-1">
            <a
              href={studioApi.fileUrl(apiBase, detail.run_id, slide.file)}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={studioApi.fileUrl(apiBase, detail.run_id, slide.file)}
                alt={slide.label}
                loading="lazy"
                className="w-full rounded-md border border-border"
              />
            </a>
            <figcaption className="text-xs text-muted-foreground">
              {slide.label}
              {slide.dims ? ` · ${slide.dims}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
      {Array.isArray(detail.failures) && detail.failures.length > 0 ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs">
          <p className="mb-1 font-bold text-red-300">Failures</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(detail.failures, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default function ContentStudioPage() {
  const [apiBase, setApiBase] = useState(DEFAULT_STUDIO_API_BASE);
  const [health, setHealth] = useState<StudioHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Search
  const [searchText, setSearchText] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<StudioQuestion[]>([]);

  // Selection
  const [selected, setSelected] = useState<SelectedQuestion[]>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);

  // Settings
  const [mode, setMode] = useState<StudioModeKey>("single-question");
  const [runId, setRunId] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [formats, setFormats] = useState<string[]>(["mobile-social"]);
  const [states, setStates] = useState<string[]>(["question", "correct"]);
  const [difficulty, setDifficulty] = useState<DifficultyTier | "">("");
  const [platform, setPlatform] = useState("generic");
  const [reuseFeatured, setReuseFeatured] = useState(true);
  const [repeatVariant, setRepeatVariant] = useState<0 | 1 | 2>(1);
  const [midCta, setMidCta] = useState<0 | 1 | 2 | 3>(0);

  // Job
  const [job, setJob] = useState<StudioJobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Runs
  const [runs, setRuns] = useState<StudioRunListEntry[]>([]);
  const [runDetail, setRunDetail] = useState<StudioRunDetail | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  const refreshHealth = useCallback(async (base: string) => {
    try {
      setHealth(await studioApi.health(base));
      setHealthError(null);
    } catch (err) {
      setHealth(null);
      setHealthError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => {
    void refreshHealth(apiBase);
  }, [apiBase, refreshHealth]);

  const refreshRuns = useCallback(async () => {
    try {
      const { runs: list } = await studioApi.listRuns(apiBase);
      setRuns(list);
      setRunsError(null);
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : String(err));
    }
  }, [apiBase]);

  const runSearch = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const idLike = /^[0-9]+$/.test(searchText.trim());
      if (idLike && searchText.trim()) {
        try {
          const { question } = await studioApi.getQuestion(apiBase, searchText.trim());
          setResults([question]);
          return;
        } catch {
          /* fall through to text search */
        }
      }
      const { questions } = await studioApi.searchQuestions(apiBase, {
        search: searchText.trim() || undefined,
        category: searchCategory.trim() || undefined,
        limit: 25,
      });
      setResults(questions);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addQuestion = (q: StudioQuestion) => {
    setSelected((prev) =>
      prev.some((p) => String(p.id) === String(q.id))
        ? prev
        : [...prev, { ...q, difficultyOverride: "" }],
    );
  };
  const removeQuestion = (id: string) => {
    setSelected((prev) => prev.filter((p) => String(p.id) !== id));
    if (featuredId === id) setFeaturedId(null);
  };
  const move = (idx: number, delta: -1 | 1) => {
    setSelected((prev) => {
      const next = [...prev];
      const j = idx + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  // Build the job request body (shared with server-side validation).
  const jobBody = useMemo(() => {
    const ids = selected.map((s) => String(s.id));
    const overrides: Record<string, string> = {};
    for (const s of selected) {
      if (s.difficultyOverride) overrides[String(s.id)] = s.difficultyOverride;
    }
    const body: Record<string, unknown> = {
      mode,
      questionIds:
        mode === "daily-package" && featuredId && reuseFeatured
          ? ids.filter((id) => id !== featuredId)
          : mode === "daily-package" && featuredId
            ? ids.filter((id) => id !== featuredId)
            : ids,
      runId: runId.trim() || undefined,
      overwrite,
      formats,
      difficulty: difficulty || undefined,
      difficultyOverrides: Object.keys(overrides).length ? overrides : undefined,
      platform,
      challenge: {
        repeatVariant:
          (mode === "multi-question" || mode === "daily-package") && repeatVariant
            ? repeatVariant
            : null,
        midCtaVariant:
          (mode === "multi-question" || mode === "daily-package") && midCta ? midCta : null,
      },
    };
    if (mode === "classic") body.states = states;
    if (mode === "daily-package" && featuredId) {
      body.daily = { featuredQuestionId: featuredId, reuseFeaturedAsOpener: reuseFeatured };
    }
    return body;
  }, [selected, mode, featuredId, reuseFeatured, runId, overwrite, formats, difficulty, platform, repeatVariant, midCta, states]);

  const validation = useMemo(() => validateStudioJob(jobBody), [jobBody]);
  const jobRunning = job?.state === "queued" || job?.state === "running";

  const startGenerate = async () => {
    setJobError(null);
    try {
      const { job_id } = await studioApi.createJob(apiBase, jobBody);
      const status = await studioApi.getJob(apiBase, job_id);
      setJob(status);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : String(err));
    }
  };

  // Poll the active job.
  useEffect(() => {
    if (!job || !(job.state === "queued" || job.state === "running")) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const status = await studioApi.getJob(apiBase, job.id);
        setJob(status);
        if (status.state !== "queued" && status.state !== "running") {
          if (status.run_ids[0]) {
            setRunDetail(await studioApi.getRun(apiBase, status.run_ids[0]));
          }
          void refreshRuns();
        }
      } catch (err) {
        setJobError(err instanceof Error ? err.message : String(err));
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [job, apiBase, refreshRuns]);

  const openRun = async (id: string) => {
    try {
      setRunDetail(await studioApi.getRun(apiBase, id));
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : String(err));
    }
  };

  const disabledReason = !health
    ? "Studio server unreachable — start it with: npm run content-studio"
    : jobRunning
      ? "A generation job is already running"
      : !validation.ok
        ? validation.errors[0]
        : null;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">Content Post Studio</h1>
          <Badge variant="outline">local</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Input
              aria-label="Studio API base"
              className="w-80 text-xs"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={() => void refreshHealth(apiBase)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {health ? (
              <Badge className={health.backend_configured ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>
                {health.backend_configured ? "backend ready" : "backend not configured"}
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-300">server offline</Badge>
            )}
          </div>
        </header>
        {healthError ? (
          <p className="text-sm text-amber-400">
            Studio server unreachable ({healthError}). Start it with{" "}
            <code className="rounded bg-muted px-1">npm run content-studio</code>.
          </p>
        ) : null}

        <Tabs defaultValue="create" onValueChange={(v) => v === "runs" && void refreshRuns()}>
          <TabsList>
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="runs">Previous runs</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* ── Left: search + selection ── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Questions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runSearch();
                    }}
                  >
                    <Input
                      placeholder="Search text or exact ID…"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                    <Input
                      placeholder="Category"
                      className="w-28"
                      value={searchCategory}
                      onChange={(e) => setSearchCategory(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={searching}>
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </form>
                  {searchError ? <p className="text-xs text-red-400">{searchError}</p> : null}
                  <div className="max-h-64 space-y-1 overflow-auto" data-testid="search-results">
                    {results.length === 0 && !searching ? (
                      <p className="text-xs text-muted-foreground">
                        No results yet — search by prompt text or a question ID.
                      </p>
                    ) : null}
                    {results.map((q) => (
                      <div key={String(q.id)} className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            #{q.id} {q.category ? <span className="text-muted-foreground">· {q.category}</span> : null}{" "}
                            {q.content_difficulty ? <Badge variant="outline">{q.content_difficulty}</Badge> : null}{" "}
                            {!q.compatible ? (
                              <Badge className="bg-red-500/20 text-red-300">{q.incompatible_reason}</Badge>
                            ) : null}
                          </p>
                          <p className="truncate">{q.prompt}</p>
                          <p className="text-muted-foreground">
                            ✓ {q.correct_label ?? "?"} · {q.choices.length} choices
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!q.compatible}
                          onClick={() => addQuestion(q)}
                          aria-label={`Add question ${q.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">Selected ({selected.length})</p>
                    {selected.length ? (
                      <Button size="sm" variant="ghost" onClick={() => { setSelected([]); setFeaturedId(null); }}>
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-1" data-testid="selected-list">
                    {selected.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing selected. Challenge order follows this list (top = Q1).
                      </p>
                    ) : null}
                    {selected.map((q, i) => (
                      <div key={String(q.id)} className="flex items-center gap-1 rounded-md border border-border p-2 text-xs">
                        <span className="w-5 text-center font-extrabold text-amber-400">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">#{q.id} — {q.prompt}</p>
                        </div>
                        {(mode === "daily-package" || mode === "multi-question") && (
                          <Button
                            size="sm"
                            variant={featuredId === String(q.id) ? "default" : "ghost"}
                            title="Mark as featured / repeated opener"
                            aria-label={`Feature question ${q.id}`}
                            onClick={() =>
                              setFeaturedId(featuredId === String(q.id) ? null : String(q.id))
                            }
                          >
                            <Star className="h-3 w-3" />
                          </Button>
                        )}
                        <select
                          aria-label={`Difficulty for ${q.id}`}
                          className="rounded border border-border bg-background p-1"
                          value={q.difficultyOverride}
                          onChange={(e) =>
                            setSelected((prev) =>
                              prev.map((p) =>
                                String(p.id) === String(q.id)
                                  ? { ...p, difficultyOverride: e.target.value as DifficultyTier | "" }
                                  : p,
                              ),
                            )
                          }
                        >
                          <option value="">default</option>
                          {DIFFICULTY_TIERS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label="Move down">
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeQuestion(String(q.id))} aria-label={`Remove ${q.id}`}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ── Center: mode + settings + generate ── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Post mode & settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-1" role="radiogroup" aria-label="Post mode">
                    {STUDIO_MODES.map((m) => (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(m)}
                        className={`w-full rounded-md border p-2 text-left text-xs ${
                          mode === m ? "border-cyan-400 bg-cyan-500/10" : "border-border"
                        }`}
                      >
                        <span className="font-bold">{MODE_INFO[m].title}</span>
                        <span className="block text-muted-foreground">{MODE_INFO[m].blurb}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Run ID (blank = auto)</span>
                      <Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder={`studio-${mode}-…`} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Default difficulty</span>
                      <select
                        className="block w-full rounded-md border border-border bg-background p-2"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as DifficultyTier | "")}
                      >
                        <option value="">none / per-question</option>
                        {DIFFICULTY_TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {RENDER_FORMATS.filter((f) => f.kind === "social").map((f) => (
                      <label key={f.key} className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={formats.includes(f.key)}
                          onCheckedChange={(c) =>
                            setFormats((prev) =>
                              c ? [...prev, f.key] : prev.filter((k) => k !== f.key),
                            )
                          }
                        />
                        {f.key}
                      </label>
                    ))}
                  </div>

                  {mode === "classic" ? (
                    <div className="flex flex-wrap gap-3">
                      {RENDER_STATES.map((s) => (
                        <label key={s} className="flex items-center gap-1 text-xs">
                          <Checkbox
                            checked={states.includes(s)}
                            onCheckedChange={(c) =>
                              setStates((prev) => (c ? [...prev, s] : prev.filter((k) => k !== s)))
                            }
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {(mode === "multi-question" || mode === "daily-package") && (
                    <div className="space-y-2 rounded-md border border-border p-2 text-xs">
                      <p className="font-bold">Challenge options</p>
                      {mode === "daily-package" ? (
                        <label className="flex items-center gap-2">
                          <Checkbox checked={reuseFeatured} onCheckedChange={(c) => setReuseFeatured(c === true)} />
                          Reuse featured (★) question as challenge Q1
                        </label>
                      ) : null}
                      <label className="block space-y-1">
                        <span>Repeated-opener copy {mode === "multi-question" ? "(★ marks the repeat)" : ""}</span>
                        <select
                          className="block w-full rounded-md border border-border bg-background p-1"
                          value={repeatVariant}
                          onChange={(e) => setRepeatVariant(Number(e.target.value) as 0 | 1 | 2)}
                        >
                          <option value={0}>none</option>
                          {REPEAT_COPY_VARIANTS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.line1} {v.line2}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span>Mid-challenge CTA (off by default)</span>
                        <select
                          className="block w-full rounded-md border border-border bg-background p-1"
                          value={midCta}
                          onChange={(e) => setMidCta(Number(e.target.value) as 0 | 1 | 2 | 3)}
                        >
                          <option value={0}>disabled</option>
                          {MID_CTA_VARIANTS.map((v) => (
                            <option key={v.id} value={v.id}>{v.text}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold">Platform</span>
                      <select
                        className="block w-full rounded-md border border-border bg-background p-2"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        {STUDIO_PLATFORMS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-xs">
                      <Checkbox checked={overwrite} onCheckedChange={(c) => setOverwrite(c === true)} />
                      Overwrite existing run
                    </label>
                  </div>

                  <Button
                    className="w-full"
                    disabled={!!disabledReason}
                    onClick={() => void startGenerate()}
                    data-testid="generate-button"
                  >
                    <Play className="mr-2 h-4 w-4" /> Generate
                  </Button>
                  {disabledReason ? (
                    <p className="text-xs text-muted-foreground" data-testid="disabled-reason">
                      {disabledReason}
                    </p>
                  ) : null}
                  {jobError ? <p className="text-xs text-red-400">{jobError}</p> : null}
                </CardContent>
              </Card>

              {/* ── Right: job status + preview ── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Job status <StateBadge state={job?.state ?? "idle"} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {job.id} · {job.mode} · runs: {job.run_ids.join(", ") || "—"}
                      </p>
                      {job.result ? (
                        <p className="text-xs">
                          {job.result.capture_count} captures · {job.result.failure_count} failures ·{" "}
                          {job.result.warning_count} warnings
                        </p>
                      ) : null}
                      {job.error ? <p className="text-xs text-red-400">{job.error}</p> : null}
                      <pre
                        className="max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[10px] leading-tight"
                        data-testid="job-log"
                      >
                        {job.log.join("\n") || "…"}
                      </pre>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No job yet. Select questions, pick a mode, and Generate.
                    </p>
                  )}
                  {runDetail ? <RunPreview apiBase={apiBase} detail={runDetail} /> : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="runs">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Previous runs
                    <Button size="sm" variant="ghost" onClick={() => void refreshRuns()} aria-label="Refresh runs">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {runsError ? <p className="text-xs text-red-400">{runsError}</p> : null}
                  {runs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs found (or press refresh).</p>
                  ) : null}
                  {runs.map((r) => (
                    <button
                      key={r.run_id}
                      onClick={() => void openRun(r.run_id)}
                      className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.run_id}</span>
                      {r.mode ? <Badge variant="outline">{r.mode}</Badge> : null}
                      <span className="text-muted-foreground">{r.image_count} img</span>
                      {r.failure_count ? (
                        <Badge className="bg-red-500/20 text-red-300">{r.failure_count} fail</Badge>
                      ) : null}
                      <span className="text-muted-foreground">
                        {r.modified_at ? new Date(r.modified_at).toLocaleString() : ""}
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Run detail</CardTitle>
                </CardHeader>
                <CardContent>
                  {runDetail ? (
                    <RunPreview apiBase={apiBase} detail={runDetail} />
                  ) : (
                    <p className="text-xs text-muted-foreground">Select a run to inspect its slides.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
