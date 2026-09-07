/**
 * CON1 Step 2 — Generate Content, the Admin → local Content Factory handoff.
 *
 * Deployed Admin cannot spawn Playwright, write export files, run the local
 * screenshot server or browse run history, so this surface deliberately does
 * none of those things. It owns SELECTION, READINESS and CONFIGURATION, and
 * hands over one deterministic command — the same division of labour
 * `AdminVideoExport` already established for `npm run video:*`.
 *
 * Every vocabulary shown here is read from the Content Factory registry that
 * owns it (`RENDER_FORMATS`, `RENDER_STATES`, `POST_TYPES`, `DIFFICULTY_TIERS`),
 * so there is no Admin-only list of format or state names to drift.
 *
 * BLOCKING POLICY (CON1 Step 2 Part 7)
 * A question with a known failure — unsupported source shape, an unresolved
 * REQUIRED asset, or a projected presentation the production layout system does
 * not draw — cannot be handed off. Copy is disabled while any selected question
 * is blocked, and the operator resolves it explicitly (drop the blocked rows,
 * or go fix them). Blocked rows are NEVER silently dropped from the command:
 * quietly narrowing the operator's selection is how a package comes back short
 * with nobody knowing why.
 *
 * The diagnostic escape hatches `--allow-incomplete-presentation` and
 * `--allow-missing-assets` are NOT offered here. They exist so a developer can
 * capture a known-bad question for diagnosis; putting them beside a Copy button
 * would turn "the gate says no" into a checkbox.
 *
 * CON1 Step 3A — THREE ROUTES, ONE CONFIGURATION
 * The same `ContentCommandConfig` produces all three handoffs, so they can
 * never describe different work:
 *   Copy command             the shell line (unchanged; still the CLI path)
 *   Open Content Workspace   a loopback link that seeds the local workspace
 *   Copy workspace config    the JSON payload, for pasting when the link
 *                            cannot be followed
 * Admin cannot detect whether the local workspace is running — it is https →
 * loopback http, where a probe is blocked long before CORS — so the link is
 * always offered and never claimed to work; the two copy routes are the
 * guaranteed ones. All three carry the SAME selection, and none of them can
 * carry a credential, a backend URL or a gate override.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Terminal,
  X,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReviewQuestion, ReviewUniverseItem } from "@/lib/quiz/api";
import { isFailure } from "@/lib/result-narrowing";
import { RENDER_FORMATS } from "@/lib/quiz-screenshot/formats";
import { RENDER_STATES, type RenderState } from "@/lib/quiz-screenshot/types";
import { POST_TYPES, type PostType } from "@/lib/quiz-screenshot/content-posts";
import { DIFFICULTY_TIERS, type DifficultyTier } from "@/lib/quiz-screenshot/difficulty";
import { DEFAULT_FORMAT_KEYS, DEFAULT_STATES, MAX_BATCH_LIMIT } from "@/lib/quiz-screenshot/cli";
import {
  buildContentCommand,
  type ContentCommandConfig,
} from "@/lib/quiz-screenshot/command";
import {
  evaluateContentReadiness,
  summarizeReadiness,
  type ContentReadiness,
} from "@/lib/quiz-screenshot/readiness";
import {
  contentHandoffFromCommandConfig,
  serializeContentHandoff,
} from "@/lib/content-handoff/schema";
import {
  buildContentWorkspaceUrl,
  CONTENT_WORKSPACE_START_COMMAND,
} from "@/lib/content-handoff/location";

/** Tone per readiness state — the same three-way vocabulary the asset badge uses. */
const READINESS_TONE: Record<string, string> = {
  ready: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10",
  unknown: "border-muted-foreground/30 text-muted-foreground",
  "presentation-incomplete": "border-red-400/50 text-red-300 bg-red-400/10",
  "asset-unresolved": "border-red-400/50 text-red-300 bg-red-400/10",
  unsupported: "border-red-400/50 text-red-300 bg-red-400/10",
};

export function ReadinessBadge({
  readiness,
  compact = false,
}: {
  readiness: ContentReadiness;
  compact?: boolean;
}) {
  const Icon = readiness.blocking
    ? AlertTriangle
    : readiness.state === "ready"
      ? CheckCircle2
      : HelpCircle;
  return (
    <span
      data-content-readiness={readiness.state}
      title={readiness.detail}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
        READINESS_TONE[readiness.state] ?? READINESS_TONE.unknown
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? null : readiness.label}
    </span>
  );
}

function CopyButton({
  text,
  disabled,
  label,
  successMessage,
  testId,
  variant,
}: {
  text: string;
  disabled: boolean;
  label: string;
  successMessage: string;
  testId: string;
  variant?: "outline";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant={variant}
      className="h-7 gap-1 text-[11px]"
      disabled={disabled}
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
          toast.success(successMessage);
        } catch {
          toast.error("Clipboard unavailable — select and copy the text manually.");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function Toggle({
  active,
  onClick,
  title,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${
        active
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground/40"
      }`}
    >
      {children}
    </button>
  );
}

export type GenerateContentPanelProps = {
  /** The selected stored questions, in selection order. */
  questions: readonly ReviewQuestion[];
  /**
   * CON1 Step 3B — selected GENERATED review objects, already resolved through
   * `/api/quiz/admin/review/universe/item`.
   *
   * Resolved rows, not universe rows: readiness runs `adaptScreenshotQuestion`
   * and the production band profile over the row it is given, and a discovery
   * projection carries neither `presentation` nor `asset_status`. Judging one
   * of those would produce a readiness verdict about a payload nobody renders.
   *
   * Mutually exclusive with `questions`, because the runner's source flags are.
   */
  reviewItems?: readonly ReviewUniverseItem[];
  onClose: () => void;
  /** Drop the blocked rows from the selection (the operator's explicit call).
   *  Stored selections only — a generated handoff is one resolved row. */
  onDropBlocked?: (ids: number[]) => void;
};

export function GenerateContentPanel({
  questions,
  reviewItems = [],
  onClose,
  onDropBlocked,
}: GenerateContentPanelProps) {
  const [formats, setFormats] = useState<string[]>([...DEFAULT_FORMAT_KEYS]);
  const [states, setStates] = useState<RenderState[]>([...DEFAULT_STATES]);
  const [post, setPost] = useState<PostType | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyTier | null>(null);
  const [runId, setRunId] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  /**
   * The selection as ONE ordered list, whatever kind it is.
   *
   * `key` is the react/test key and the identity shown to the operator;
   * `reviewKey` is set only for a generated row. Readiness runs over `row`,
   * which for both kinds is the resolved payload the runner would render.
   */
  const selection = useMemo(
    () =>
      reviewItems.length
        ? reviewItems.map((item) => ({
            key: item.review_key,
            reviewKey: item.review_key,
            sourceKind: item.source_kind,
            id: undefined as number | undefined,
            text: item.question_text ?? "",
            row: item,
          }))
        : questions.map((q) => ({
            key: String(q.id),
            reviewKey: undefined as string | undefined,
            sourceKind: "stored_question",
            id: q.id,
            text: q.question_text ?? "",
            row: q,
          })),
    [questions, reviewItems],
  );

  const readiness = useMemo(
    () => selection.map((q) => ({ q, r: evaluateContentReadiness(q.row) })),
    [selection],
  );
  const summary = useMemo(
    () => summarizeReadiness(readiness.map((x) => x.r)),
    [readiness],
  );
  const blocked = readiness.filter((x) => x.r.blocking);

  // ONE configuration object feeds all three handoff routes.
  const config = useMemo<ContentCommandConfig>(
    () => ({
      // Selection order, preserved — a carousel post is an ordered sequence.
      questionIds: reviewItems.length ? [] : questions.map((q) => q.id),
      reviewKeys: reviewItems.map((item) => item.review_key),
      formats,
      states,
      post,
      difficulty,
      runId,
      overwrite,
    }),
    [questions, reviewItems, formats, states, post, difficulty, runId, overwrite],
  );

  const built = useMemo(() => buildContentCommand(config), [config]);

  /** CON1 Step 3A — the same selection as a workspace seed. */
  const handoff = useMemo(() => contentHandoffFromCommandConfig(config), [config]);
  const workspaceUrl = isFailure(handoff) ? "" : buildContentWorkspaceUrl(handoff.handoff);
  const workspaceConfig = isFailure(handoff) ? "" : serializeContentHandoff(handoff.handoff);

  const handoffBlocked = blocked.length > 0;
  const canCopy = !handoffBlocked && built.command !== "";
  const canHandOff = !handoffBlocked && !isFailure(handoff);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
      data-testid="generate-content-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
          <h3 className="text-xs font-semibold">
            Generate Content ({selection.length})
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Generate Content"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Readiness summary ─────────────────────────────────────────── */}
      <div className="space-y-1.5" data-testid="generate-content-readiness">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span data-testid="readiness-ready">{summary.ready} ready</span>
          <span>·</span>
          <span data-testid="readiness-blocked">{summary.blocked} blocked</span>
          {summary.unevaluated > 0 && (
            <>
              <span>·</span>
              <span data-testid="readiness-unevaluated">{summary.unevaluated} not evaluated</span>
            </>
          )}
          {summary.reviewerFlagged > 0 && (
            <>
              <span>·</span>
              {/* The reviewer's annotation, reported as its own thing. It never
                  blocks: it is a human's note, not the computed check. */}
              <span data-testid="readiness-reviewer-flagged" className="text-orange-300">
                {summary.reviewerFlagged} reviewer-flagged
              </span>
            </>
          )}
        </div>

        {readiness.map(({ q, r }) => (
          <div
            key={q.key}
            data-testid={`readiness-row-${q.key}`}
            data-content-readiness={r.state}
            data-source-kind={q.sourceKind}
            className="flex items-start justify-between gap-2 rounded border border-border/50 px-2 py-1"
          >
            <div className="min-w-0">
              <p className="truncate text-[11px]">
                {q.reviewKey ? q.reviewKey : `#${q.id}`} {q.text}
              </p>
              {r.blocking && (
                <p className="text-[10px] text-red-300" data-testid={`readiness-reason-${q.key}`}>
                  {r.detail}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {r.reviewerFlaggedMissingAsset && (
                <span
                  data-testid={`readiness-reviewer-flag-${q.key}`}
                  title="Reviewer annotation: a human flagged this row's art. Separate from the computed checks."
                  className="rounded border border-orange-400/50 bg-orange-400/10 px-1 py-0.5 text-[9px] text-orange-300"
                >
                  Reviewer flag
                </span>
              )}
              <ReadinessBadge readiness={r} />
            </div>
          </div>
        ))}
      </div>

      {handoffBlocked && (
        <div
          className="flex items-center justify-between gap-2 rounded border border-red-400/40 bg-red-400/10 px-2 py-1.5"
          data-testid="generate-content-blocked"
        >
          <p className="text-[10px] text-red-200">
            {blocked.length} of {selection.length} selected question
            {selection.length === 1 ? "" : "s"} cannot be published as-is. Fix them,
            or drop them from this handoff.
          </p>
          {onDropBlocked && reviewItems.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 text-[10px]"
              data-testid="generate-content-drop-blocked"
              onClick={() => onDropBlocked(blocked.map((x) => Number(x.q.id)))}
            >
              Drop {blocked.length} blocked
            </Button>
          )}
        </div>
      )}

      {/* ── Output configuration ──────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Formats
          </p>
          <div className="flex flex-wrap gap-1">
            {RENDER_FORMATS.map((f) => (
              <Toggle
                key={f.key}
                testId={`content-format-${f.key}`}
                active={formats.includes(f.key)}
                title={`${f.description} — ${f.width}×${f.height}`}
                onClick={() =>
                  setFormats((prev) =>
                    prev.includes(f.key) ? prev.filter((k) => k !== f.key) : [...prev, f.key],
                  )
                }
              >
                {f.key}
              </Toggle>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Post mode
          </p>
          <div className="flex flex-wrap gap-1">
            <Toggle
              testId="content-post-states"
              active={post === null}
              title="Capture explicit render states rather than a carousel post."
              onClick={() => setPost(null)}
            >
              states
            </Toggle>
            {POST_TYPES.map((p) => (
              <Toggle
                key={p}
                testId={`content-post-${p}`}
                active={post === p}
                title="A carousel post defines its own ordered slides, so it replaces the state selection."
                onClick={() => setPost(p)}
              >
                {p}
              </Toggle>
            ))}
          </div>
        </div>

        {/* States are hidden under a post: the CLI rejects the combination, so
            offering both would build a command the parser refuses. */}
        {post === null && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Render states
            </p>
            <div className="flex flex-wrap gap-1">
              {RENDER_STATES.map((s) => (
                <Toggle
                  key={s}
                  testId={`content-state-${s}`}
                  active={states.includes(s)}
                  onClick={() =>
                    setStates((prev) =>
                      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
                    )
                  }
                >
                  {s}
                </Toggle>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Difficulty badge
            </p>
            <div className="flex flex-wrap gap-1">
              <Toggle
                testId="content-difficulty-none"
                active={difficulty === null}
                title="Use each question's own metadata.content_difficulty, or no badge."
                onClick={() => setDifficulty(null)}
              >
                per question
              </Toggle>
              {DIFFICULTY_TIERS.map((t) => (
                <Toggle
                  key={t}
                  testId={`content-difficulty-${t}`}
                  active={difficulty === t}
                  onClick={() => setDifficulty(t)}
                >
                  {t}
                </Toggle>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Run name (optional)
            </p>
            <div className="flex items-center gap-1">
              <Input
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="timestamp"
                aria-label="Run name"
                className="h-7 w-40 text-[11px]"
              />
              <Toggle
                testId="content-overwrite"
                active={overwrite}
                title="Allow replacing an existing run directory of the same name."
                onClick={() => setOverwrite((v) => !v)}
              >
                overwrite
              </Toggle>
            </div>
          </div>
        </div>
      </div>

      {/* ── Handoff to the local Content Workspace ────────────────────── */}
      <div className="space-y-1.5" data-testid="generate-content-handoff">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Open in Content Workspace
          </p>
          <div className="flex items-center gap-1">
            {/* A plain link: Admin is https and the workspace is loopback http,
                so no probe is possible and none is faked. If the workspace is
                not running the browser says so and the copy routes below still
                work. */}
            <Button
              asChild={canHandOff}
              size="sm"
              variant="outline"
              disabled={!canHandOff}
              className="h-7 gap-1 text-[11px]"
            >
              {canHandOff ? (
                <a
                  href={workspaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="generate-content-open-workspace"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Content Workspace
                </a>
              ) : (
                <span data-testid="generate-content-open-workspace-disabled">
                  <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
                  Open Content Workspace
                </span>
              )}
            </Button>
            <CopyButton
              text={workspaceConfig}
              disabled={!canHandOff}
              label="Copy config"
              successMessage="Workspace config copied — paste it into the local Content Workspace"
              testId="generate-content-copy-config"
              variant="outline"
            />
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Opens <code className="rounded bg-muted px-1">{CONTENT_WORKSPACE_START_COMMAND}</code>{" "}
          on this machine with the selection and this configuration already
          loaded, in order. Not running? The link fails in the browser and
          nothing is lost — start the workspace, or paste the copied config into
          its Import panel. Admin seeds the workspace; the workspace owns the
          final generation settings.
        </p>

        {isFailure(handoff) && (
          <ul className="space-y-0.5" data-testid="generate-content-handoff-errors">
            {handoff.errors.map((e) => (
              <li key={e} className="text-[10px] text-red-300">{e}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Command handoff ───────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Local command
          </p>
          <CopyButton
            text={built.command}
            disabled={!canCopy}
            label="Copy command"
            successMessage="Command copied — run it in the local checkout"
            testId="generate-content-copy"
          />
        </div>

        {built.errors.length > 0 && (
          <ul className="space-y-0.5" data-testid="generate-content-errors">
            {built.errors.map((e) => (
              <li key={e} className="text-[10px] text-red-300">{e}</li>
            ))}
          </ul>
        )}

        {built.command !== "" && (
          <pre
            data-testid="generate-content-command"
            className={`overflow-x-auto rounded border border-border bg-muted/30 p-2 text-[10px] leading-relaxed ${
              handoffBlocked ? "opacity-50" : ""
            }`}
          >
            <code>{built.command}</code>
          </pre>
        )}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Run it in the local checkout. Playwright, the render harness, capture
          QA, the manifest and the exported files all stay local — Admin hands
          over the selection and the configuration, nothing else. Capture QA is
          still the final authority on the image; this readiness check is a
          preflight. Max {MAX_BATCH_LIMIT} questions per run.
        </p>
      </div>
    </div>
  );
}

export default GenerateContentPanel;
