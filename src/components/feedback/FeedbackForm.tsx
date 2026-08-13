import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ENTRY_INTENT_LABELS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_LIMITS,
  FEEDBACK_REPRODUCIBILITIES,
  FEEDBACK_REPRODUCIBILITY_LABELS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SEVERITY_LABELS,
  type FeedbackCategory,
  type FeedbackEntryIntent,
  type FeedbackReproducibility,
  type FeedbackSeverity,
} from "@/lib/feedback/contract";
import {
  SCREENSHOT_ERROR_MESSAGES,
  ScreenshotProcessingError,
  imageFromClipboard,
  prepareScreenshot,
  type PreparedScreenshot,
} from "@/lib/feedback/screenshot";

const GOLD = "#c9a84c";

export interface FeedbackFormValues {
  category: FeedbackCategory;
  title: string;
  body: string;
  severity: FeedbackSeverity | null;
  reproducibility: FeedbackReproducibility | null;
  expectedResult: string | null;
  actualResult: string | null;
  evidenceUrl: string | null;
  screenshot: PreparedScreenshot | null;
}

interface Props {
  intent: FeedbackEntryIntent;
  defaultCategory: FeedbackCategory;
  submitting: boolean;
  onSubmit: (values: FeedbackFormValues) => void;
  onCancel: () => void;
}

/**
 * Copy is per entry point rather than generic. "Describe your feedback" gets
 * you a shrug; "What went wrong?" gets you a bug report.
 */
const BODY_COPY: Record<FeedbackEntryIntent, { label: string; placeholder: string }> = {
  bug: {
    label: "What happened?",
    placeholder: "Describe the problem and what you were doing when it happened…",
  },
  feature: {
    label: "What problem would this solve?",
    placeholder: "What are you trying to do that Mogzy makes hard or impossible today?",
  },
  gameplay: {
    label: "What's on your mind?",
    placeholder:
      "Question quality, difficulty, pacing, clarity, balance — anything that affected how it felt to play.",
  },
  other: {
    label: "Your feedback",
    placeholder: "Tell us what you think…",
  },
};

export default function FeedbackForm({
  intent,
  defaultCategory,
  submitting,
  onSubmit,
  onCancel,
}: Props) {
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity | "">("");
  const [reproducibility, setReproducibility] = useState<FeedbackReproducibility | "">("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");

  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [screenshot, setScreenshot] = useState<PreparedScreenshot | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBug = intent === "bug";
  const copy = BODY_COPY[intent];

  // Object URLs are a leak if they outlive the preview.
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  const acceptImage = useCallback(
    async (file: File) => {
      setProcessing(true);
      setScreenshotError(null);
      try {
        const prepared = await prepareScreenshot(file);
        setScreenshot(prev => {
          void prev;
          return prepared;
        });
        setScreenshotPreview(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(prepared.blob);
        });
      } catch (err) {
        const reason =
          err instanceof ScreenshotProcessingError
            ? SCREENSHOT_ERROR_MESSAGES[err.reason]
            : "That image couldn't be processed.";
        setScreenshotError(reason);
      } finally {
        setProcessing(false);
      }
    },
    [],
  );

  /**
   * Paste-to-attach. Win+Shift+S / Cmd+Ctrl+Shift+4 put a PNG on the clipboard,
   * so this is the shortest path from "I see a bug" to "it's attached". A paste
   * carrying no image falls through untouched so normal text pasting works.
   */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const file = imageFromClipboard(event.clipboardData?.items);
      if (!file) return;
      event.preventDefault();
      void acceptImage(file);
    },
    [acceptImage],
  );

  const clearScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validEvidence = () => {
    const trimmed = evidenceUrl.trim();
    if (!trimmed) return true;
    return /^https?:\/\/\S+$/i.test(trimmed) && trimmed.length <= FEEDBACK_LIMITS.evidenceUrl;
  };

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting && !processing;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validEvidence()) {
      setEvidenceError("Enter a full link starting with http:// or https://");
      return;
    }
    setEvidenceError(null);
    onSubmit({
      category,
      title: title.trim().slice(0, FEEDBACK_LIMITS.title),
      body: body.trim().slice(0, FEEDBACK_LIMITS.body),
      severity: isBug && severity ? severity : null,
      reproducibility: isBug && reproducibility ? reproducibility : null,
      expectedResult: isBug && expectedResult.trim() ? expectedResult.trim().slice(0, 1000) : null,
      actualResult: isBug && actualResult.trim() ? actualResult.trim().slice(0, 1000) : null,
      evidenceUrl: evidenceUrl.trim() ? evidenceUrl.trim() : null,
      screenshot,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      onPaste={handlePaste}
      data-testid="feedback-form"
      className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-5 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: GOLD }}>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {ENTRY_INTENT_LABELS[intent]}
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onCancel}>
          Back
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fb-title">Title</Label>
        <Input
          id="fb-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={FEEDBACK_LIMITS.title}
          placeholder={isBug ? "Short summary of the problem" : "Short summary"}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fb-category">Where in Mogzy?</Label>
        <Select value={category} onValueChange={v => setCategory(v as FeedbackCategory)}>
          <SelectTrigger id="fb-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fb-body">{copy.label}</Label>
        <Textarea
          id="fb-body"
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={FEEDBACK_LIMITS.body}
          rows={5}
          placeholder={copy.placeholder}
          className="resize-none"
          required
        />
        <div className="text-right text-[10px] text-muted-foreground">
          {body.length}/{FEEDBACK_LIMITS.body}
        </div>
      </div>

      {/* Bug-only fields. Progressive disclosure: nobody filing a compliment
          should have to scroll past "Steps to reproduce". */}
      {isBug && (
        <div data-testid="feedback-bug-fields" className="space-y-5 rounded-xl bg-muted/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-expected">What did you expect?</Label>
              <Textarea
                id="fb-expected"
                value={expectedResult}
                onChange={e => setExpectedResult(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Optional"
                className="resize-none text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-actual">What actually happened?</Label>
              <Textarea
                id="fb-actual"
                value={actualResult}
                onChange={e => setActualResult(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Optional"
                className="resize-none text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-severity">How much did it block you?</Label>
              <Select value={severity} onValueChange={v => setSeverity(v as FeedbackSeverity)}>
                <SelectTrigger id="fb-severity">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_SEVERITIES.map(s => (
                    <SelectItem key={s} value={s}>
                      {FEEDBACK_SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-repro">Does it happen again?</Label>
              <Select
                value={reproducibility}
                onValueChange={v => setReproducibility(v as FeedbackReproducibility)}
              >
                <SelectTrigger id="fb-repro">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_REPRODUCIBILITIES.map(r => (
                    <SelectItem key={r} value={r}>
                      {FEEDBACK_REPRODUCIBILITY_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Evidence stays collapsed: most reports need none, and an empty
          "Screenshot" slot on every form reads as a chore. */}
      {!showEvidence && !screenshot ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowEvidence(true)}
        >
          <ImagePlus className="h-3.5 w-3.5" /> Add a screenshot or link
        </Button>
      ) : (
        <div className="space-y-4 rounded-xl border border-border/50 p-4">
          <div className="space-y-2">
            <Label>Screenshot</Label>
            {screenshotPreview ? (
              <div className="relative inline-block">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="max-h-48 rounded-lg border border-border"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Remove screenshot"
                  className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                  onClick={clearScreenshot}
                >
                  <X className="h-3 w-3" />
                </Button>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {screenshot?.width}×{screenshot?.height} · {Math.round((screenshot?.bytes ?? 0) / 1024)} KB
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void acceptImage(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={processing}
                  className="gap-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {processing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  {processing ? "Processing…" : "Choose an image"}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  …or paste one straight into this form. PNG, JPEG or WebP, up to 5 MB.
                </p>
              </>
            )}
            {screenshotError && (
              <p role="alert" className="text-xs text-destructive">
                {screenshotError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-evidence" className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Video or other link
            </Label>
            <Input
              id="fb-evidence"
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
              maxLength={FEEDBACK_LIMITS.evidenceUrl}
              placeholder="https://…"
              inputMode="url"
            />
            <p className="text-[10px] text-muted-foreground">
              A clip on YouTube, Streamable, Medal or Discord works well. We don't host video.
            </p>
            {evidenceError && (
              <p role="alert" className="text-xs text-destructive">
                {evidenceError}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
        <p className="text-[10px] text-muted-foreground">
          We attach your browser and screen size to help us reproduce it.
        </p>
        <Button type="submit" disabled={!canSubmit} className="gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? "Sending…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
