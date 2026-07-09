import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Video, Copy, Check, Clock, ListOrdered, Terminal, Film,
  Star, KeyRound, Radio, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import SEOHead from "@/components/SEOHead";
import { quizApi } from "@/lib/quiz/api";
import { getAdminKey } from "@/lib/knowledge-admin/key";
import {
  DEFAULT_VIDEO_EXPORT_CONFIG,
  SEGMENT_REFERENCE,
  buildCommands,
  estimateTiming,
  type VideoExportConfig,
} from "@/lib/video-export/commands";

function fmtSeconds(s: number): string {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const ss = total % 60;
  return m > 0 ? `${m}m ${ss}s` : `${ss}s`;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5 shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Clipboard unavailable — select and copy manually.");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}

function CommandBlock({ title, command }: { title: string; command: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
        <CopyButton text={command} />
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs font-mono leading-relaxed text-foreground/90">
        {command}
      </pre>
    </div>
  );
}

export default function AdminVideoExport() {
  const [config, setConfig] = useState<VideoExportConfig>(DEFAULT_VIDEO_EXPORT_CONFIG);
  const set = <K extends keyof VideoExportConfig>(key: K, value: VideoExportConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  // Populate suggestion lists ONLY when an admin key already exists in this
  // browser session (shared with Quiz Review / Knowledge Admin). Never prompts
  // for a key — inputs degrade to free text when options aren't available.
  const hasSessionKey = Boolean(getAdminKey());
  const { data: filterOptions } = useQuery({
    queryKey: ["video-export", "filter-options"],
    queryFn: () => quizApi.getReviewFilterOptions(),
    enabled: hasSessionKey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const commands = useMemo(() => buildCommands(config), [config]);
  const estimate = useMemo(() => estimateTiming(config), [config]);

  const categories = filterOptions?.categories ?? [];
  const reviewStatuses = filterOptions?.review_statuses ?? [];
  const packs = filterOptions?.packs ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <SEOHead
        title="Video Export — Mogsy Admin"
        description="Configure quiz video exports and generate the render CLI commands + timestamp preview."
        path="/admin/quiz-video-export"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80">
            <Video className="h-3.5 w-3.5" />
            League Quiz · Video Export
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">Quiz Video Export</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure a quiz video, copy the CLI commands, and preview the estimated length &amp; YouTube timestamps.
            Rendering runs locally via the Remotion pipeline — nothing renders in the browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/quiz/admin">
              <ArrowLeft className="h-4 w-4" />
              Quiz Admin
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
            <Link to="/admin/quiz-review">
              <ClipboardList className="h-4 w-4" />
              Review Console
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: configuration ─────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-primary" />
                Question selection
              </CardTitle>
              <CardDescription>Which questions the prepare step pulls from the Review Console.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Number of questions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={config.numQuestions}
                    onChange={(e) => set("numQuestions", Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="flex items-end justify-between gap-2 pb-1">
                  <div>
                    <Label className="text-xs">Favorites only</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Shorts-favorited rows</p>
                  </div>
                  <Switch
                    checked={config.favoritesOnly}
                    onCheckedChange={(v) => set("favoritesOnly", v)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input
                    list="video-export-categories"
                    placeholder="any"
                    value={config.category}
                    onChange={(e) => set("category", e.target.value)}
                  />
                  <datalist id="video-export-categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pack key</Label>
                  <Input
                    list="video-export-packs"
                    placeholder="any"
                    value={config.pack}
                    onChange={(e) => set("pack", e.target.value)}
                  />
                  <datalist id="video-export-packs">
                    {packs.map((p) => <option key={p.pack_key} value={p.pack_key}>{p.title}</option>)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Difficulty min</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    placeholder="—"
                    value={config.difficultyMin}
                    onChange={(e) => set("difficultyMin", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Difficulty max</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    placeholder="—"
                    value={config.difficultyMax}
                    onChange={(e) => set("difficultyMax", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Review status</Label>
                  <Input
                    list="video-export-statuses"
                    placeholder="any"
                    value={config.reviewStatus}
                    onChange={(e) => set("reviewStatus", e.target.value)}
                  />
                  <datalist id="video-export-statuses">
                    {reviewStatuses.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>
              {!hasSessionKey && (
                <p className="text-[11px] text-muted-foreground">
                  Tip: open the{" "}
                  <Link to="/admin/quiz-review" className="underline hover:text-foreground">Review Console</Link>{" "}
                  first to load category / pack / status suggestions. Free-text values still work.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Film className="h-4 w-4 text-primary" />
                Branding &amp; output
              </CardTitle>
              <CardDescription>Title cards, footer branding, and output file paths.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input value={config.title} onChange={(e) => set("title", e.target.value)} placeholder="Mogsy League Quiz" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subtitle</Label>
                <Input value={config.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="optional" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Patch label</Label>
                  <Input value={config.patch} onChange={(e) => set("patch", e.target.value)} placeholder="e.g. 14.20" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Website / branding line</Label>
                  <Input value={config.website} onChange={(e) => set("website", e.target.value)} placeholder="mogsy.net/quiz" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Output JSON path</Label>
                  <Input value={config.outJsonPath} onChange={(e) => set("outJsonPath", e.target.value)} placeholder="out/quiz-video-input.json" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Output MP4 path</Label>
                  <Input value={config.outMp4Path} onChange={(e) => set("outMp4Path", e.target.value)} placeholder="out/mogsy-quiz.mp4" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Video format</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={config.format === "16:9" ? "default" : "outline"}
                    onClick={() => set("format", "16:9")}
                  >
                    16:9 · Landscape
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    className="opacity-60"
                    title="9:16 Shorts composition is not built yet"
                  >
                    9:16 · Shorts
                    <Badge variant="secondary" className="ml-1.5 text-[9px]">Soon</Badge>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: output ───────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Estimated duration */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Estimated duration
              </CardTitle>
              <CardDescription>
                From the same timing model the renderer uses ({estimate.fps} fps).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Intro" value={fmtSeconds(estimate.introSeconds)} />
                <Stat label="Per question" value={fmtSeconds(estimate.perQuestionSeconds)} />
                <Stat label="Outro" value={fmtSeconds(estimate.outroSeconds)} />
                <Stat label="Questions" value={String(estimate.numQuestions)} />
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
                <span className="text-sm font-medium">Total estimated length</span>
                <span className="text-lg font-bold tabular-nums">{estimate.totalTimestamp}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  Assume every question has an explanation card
                </Label>
                <Switch
                  checked={config.assumeExplanations}
                  onCheckedChange={(v) => set("assumeExplanations", v)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Estimate assumes default segment lengths (question {SEGMENT_REFERENCE.question}s,
                countdown {SEGMENT_REFERENCE.countdown}s, reveal {SEGMENT_REFERENCE.reveal}s,
                explanation {SEGMENT_REFERENCE.explanation}s, transition {SEGMENT_REFERENCE.transition}s).
                Actual length depends on real questions and any per-question duration overrides.
              </p>
            </CardContent>
          </Card>

          {/* CLI commands */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Terminal className="h-4 w-4 text-primary" />
                CLI commands
              </CardTitle>
              <CardDescription>Run these locally from the repo root.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CommandBlock title="Step 1 · Prepare quiz JSON" command={commands.prepare} />
              <CommandBlock title="Step 2 · Render MP4" command={commands.render} />
              <CommandBlock title="Timestamps only (optional)" command={commands.timestamps} />
              <CopyButton
                text={`${commands.prepare}\n${commands.render}`}
                label="Copy prepare + render"
              />
            </CardContent>
          </Card>

          {/* Timestamp preview */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  YouTube timestamp preview
                </CardTitle>
                <CopyButton
                  text={estimate.chapters.map((c) => `${c.timestamp} ${c.label}`).join("\n")}
                  label="Copy timestamps"
                />
              </div>
              <CardDescription>Approximate — regenerated exactly by the render/timestamps step.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs font-mono leading-relaxed text-foreground/90">
                {estimate.chapters.map((c) => `${c.timestamp} ${c.label}`).join("\n")}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Workflow instructions */}
      <Card className="mt-6 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-primary" />
            Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground/90">
          <ol className="list-decimal space-y-2 pl-5">
            <li><strong>Prepare</strong> — run the Step 1 command to build the quiz video JSON from real Review Console questions.</li>
            <li><strong>Render</strong> — run the Step 2 command to render the MP4 (and its timestamp/metadata files) into <code className="text-xs">out/</code>.</li>
            <li><strong>Timestamps</strong> — copy <code className="text-xs">out/&lt;name&gt;-timestamps.txt</code> (or the preview above) into the YouTube description for chapters.</li>
            <li><strong>Upload / edit</strong> — upload the MP4 to YouTube, or import it into CapCut for further editing.</li>
          </ol>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
            <div className="flex items-center gap-2 font-medium mb-1">
              <KeyRound className="h-3.5 w-3.5" />
              Admin key
            </div>
            <p className="text-xs leading-relaxed">
              The <code>video:prepare</code> step reads the admin review endpoint. Provide the key via the{" "}
              <code>ADMIN_KEY</code> or <code>KNOWLEDGE_ADMIN_KEY</code> environment variable, or append{" "}
              <code>--admin-key &lt;key&gt;</code> to the prepare command. This page never stores admin keys.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
