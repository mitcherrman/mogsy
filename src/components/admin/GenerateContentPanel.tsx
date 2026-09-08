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
 * ADMIN UX — SIMPLE MODE OVER THE SAME REGISTRIES
 * The panel asks two operator questions — where are you posting, and what do
 * you want — and answers them by writing the SAME `formats` and `states` the
 * advanced controls write. There is no second vocabulary and no second
 * registry: `DESTINATIONS` maps to `RENDER_FORMATS` keys, `INTENTS` maps to
 * `RENDER_STATES` values, and both derive their selected state by reading the
 * config back, so an advanced edit is reflected in simple mode rather than
 * silently disagreeing with it. Renderer identifiers stay exactly as they
 * are — only the LABELS are operator-facing.
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
  ChevronDown,
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

// ---------------------------------------------------------------------------
// Operator vocabulary.
//
// UI labels only. Every key below is an existing renderer identifier read from
// the registry that owns it, and nothing here renames a constant — the CLI,
// the manifest and the export filenames are untouched.
// ---------------------------------------------------------------------------

/** Renderer format key → the name an operator would use for it. */
const FORMAT_LABELS: Record<string, string> = {
  "mobile-social": "Instagram Portrait",
  vertical: "Vertical / Story",
  portrait: "Instagram Feed",
  square: "Square",
  landscape: "Reddit / X",
  broadcast: "Widescreen",
  "mobile-audit": "Developer QA (mobile)",
  "desktop-audit": "Developer QA (desktop)",
};

const formatLabel = (key: string) => FORMAT_LABELS[key] ?? key;

/** Render state → what the card actually shows. */
const STATE_LABELS: Record<RenderState, string> = {
  question: "Question",
  selected: "Selected answer",
  correct: "Reveal",
  incorrect: "Wrong answer",
  explanation: "Explanation",
};

/** Post composition → the artefact it produces. */
const POST_LABELS: Record<PostType, string> = {
  "single-question": "Single-question post",
  "answer-reveal": "Reveal post",
};

/**
 * "Where are you posting?" — the five publishable destinations, in the order
 * an operator reaches for them. The two audit formats are deliberately absent:
 * they render the harness page as a responsive document and are a developer
 * tool, so they live under Advanced options with an honest name.
 */
const DESTINATIONS: readonly { key: string; label: string; hint: string }[] = [
  { key: "landscape", label: "Reddit / X", hint: "16:9 link card" },
  { key: "mobile-social", label: "Instagram Portrait", hint: "4:5 feed post" },
  { key: "vertical", label: "Vertical / Story", hint: "9:16 Reels / Shorts" },
  { key: "square", label: "Square", hint: "1:1 feed post" },
  { key: "broadcast", label: "Widescreen", hint: "1920×1080 overlay" },
];

/**
 * "What do you want?" — the three state sets that describe a whole post.
 *
 * Order matters: it is the order the cards are captured and posted in, so the
 * arrays are compared positionally rather than as sets.
 */
const INTENTS: readonly { id: string; label: string; states: RenderState[] }[] = [
  { id: "question", label: "Question only", states: ["question"] },
  { id: "reveal", label: "Question + Reveal", states: ["question", "correct"] },
  {
    id: "explained",
    label: "Question + Reveal + Explanation",
    states: ["question", "correct", "explanation"],
  },
];

const sameStates = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** A collapsed disclosure that keeps its content mounted. */
function Disclosure({
  label,
  hint,
  testId,
  children,
}: {
  label: string;
  hint: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border/60 bg-muted/10" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <span>
          {label} <span className="font-normal text-muted-foreground/70">· {hint}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-border/60 px-3 py-3">{children}</div>
    </details>
  );
}

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
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${
        READINESS_TONE[readiness.state] ?? READINESS_TONE.unknown
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
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
      className="h-8 gap-1.5 text-sm"
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
      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
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
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
      data-testid="generate-content-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-base font-semibold">
            Generate Content ({selection.length})
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Generate Content"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Readiness summary ─────────────────────────────────────────── */}
      <div className="space-y-1.5" data-testid="generate-content-readiness">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
              <p className="truncate text-sm">
                {q.reviewKey ? q.reviewKey : `#${q.id}`} {q.text}
              </p>
              {r.blocking && (
                <p className="text-xs text-red-300" data-testid={`readiness-reason-${q.key}`}>
                  {r.detail}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {r.reviewerFlaggedMissingAsset && (
                <span
                  data-testid={`readiness-reviewer-flag-${q.key}`}
                  title="Reviewer annotation: a human flagged this row's art. Separate from the computed checks."
                  className="rounded border border-orange-400/50 bg-orange-400/10 px-1.5 py-0.5 text-[11px] text-orange-300"
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
          <p className="text-xs text-red-200">
            {blocked.length} of {selection.length} selected question
            {selection.length === 1 ? "" : "s"} cannot be published as-is. Fix them,
            or drop them from this handoff.
          </p>
          {onDropBlocked && reviewItems.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              data-testid="generate-content-drop-blocked"
              onClick={() => onDropBlocked(blocked.map((x) => Number(x.q.id)))}
            >
              Drop {blocked.length} blocked
            </Button>
          )}
        </div>
      )}

      {/* ── SIMPLE MODE ────────────────────────────────────────────────
          Two questions, in the order an operator thinks about them. Both
          write the same config the advanced controls do. */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Where are you posting?</p>
        <div className="flex flex-wrap gap-1.5">
          {DESTINATIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              data-testid={`content-destination-${d.key}`}
              aria-pressed={formats.includes(d.key)}
              title={d.hint}
              onClick={() =>
                setFormats((prev) =>
                  prev.includes(d.key) ? prev.filter((k) => k !== d.key) : [...prev, d.key],
                )
              }
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                formats.includes(d.key)
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              }`}
            >
              <span className="block font-medium">{d.label}</span>
              <span className="block text-xs text-muted-foreground">{d.hint}</span>
            </button>
          ))}
        </div>
        {formats.length === 0 && (
          <p className="text-xs text-amber-300">Pick at least one destination.</p>
        )}
        {/* Audit formats are a developer choice, so say so rather than hiding
            that the run will produce them. */}
        {formats.some((k) => !DESTINATIONS.some((d) => d.key === k)) && (
          <p className="text-xs text-muted-foreground">
            Also selected in Advanced options:{" "}
            {formats.filter((k) => !DESTINATIONS.some((d) => d.key === k)).map(formatLabel).join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">What do you want?</p>
        {post !== null ? (
          <p className="text-sm text-muted-foreground">
            A <span className="font-medium text-foreground">{POST_LABELS[post]}</span> — its
            slides are fixed by the composition, so the card choice below does not apply.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setPost(null)}
            >
              Use individual cards instead
            </button>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {INTENTS.map((intent) => (
                <button
                  key={intent.id}
                  type="button"
                  data-testid={`content-intent-${intent.id}`}
                  aria-pressed={sameStates(states, intent.states)}
                  onClick={() => setStates([...intent.states])}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    sameStates(states, intent.states)
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                >
                  {intent.label}
                </button>
              ))}
            </div>
            {!INTENTS.some((i) => sameStates(states, i.states)) && (
              <p className="text-xs text-muted-foreground" data-testid="content-intent-custom">
                Custom cards from Advanced options:{" "}
                {states.length === 0
                  ? "none selected"
                  : states.map((s) => STATE_LABELS[s]).join(" → ")}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── PRIMARY ACTION ─────────────────────────────────────────────
          A plain link: Admin is https and the workspace is loopback http, so
          no probe is possible and none is faked. If the workspace is not
          running the browser says so and the copy routes below still work. */}
      <div className="space-y-1.5" data-testid="generate-content-handoff">
        <Button
          asChild={canHandOff}
          size="sm"
          disabled={!canHandOff}
          className="h-10 w-full gap-2 text-sm font-semibold"
        >
          {canHandOff ? (
            <a
              href={workspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="generate-content-open-workspace"
            >
              <ExternalLink className="h-4 w-4" />
              Open Content Workspace
            </a>
          ) : (
            <span data-testid="generate-content-open-workspace-disabled">
              <ExternalLink className="mr-1 inline h-4 w-4" />
              Open Content Workspace
            </span>
          )}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Opens <code className="rounded bg-muted px-1">{CONTENT_WORKSPACE_START_COMMAND}</code>{" "}
          on this machine with the selection and this configuration already
          loaded, in order. Not running? The link fails in the browser and
          nothing is lost — start the workspace, or paste the copied config
          from Developer tools into its Import panel. Admin seeds the
          workspace; the workspace owns the final generation settings.
        </p>

        {isFailure(handoff) && (
          <ul className="space-y-0.5" data-testid="generate-content-handoff-errors">
            {handoff.errors.map((e) => (
              <li key={e} className="text-xs text-red-300">{e}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── ADVANCED OPTIONS ───────────────────────────────────────────
          Everything the panel used to present as the normal workflow. Still
          complete, still reading the same registries — just no longer the
          first thing an operator has to understand. */}
      <Disclosure
        label="Advanced options"
        hint="exact formats, cards, badge, run name"
        testId="generate-content-advanced"
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Formats
          </p>
          <div className="flex flex-wrap gap-1">
            {RENDER_FORMATS.map((f) => (
              <Toggle
                key={f.key}
                testId={`content-format-${f.key}`}
                active={formats.includes(f.key)}
                title={`${f.key} — ${f.description} — ${f.width}×${f.height}`}
                onClick={() =>
                  setFormats((prev) =>
                    prev.includes(f.key) ? prev.filter((k) => k !== f.key) : [...prev, f.key],
                  )
                }
              >
                {formatLabel(f.key)}
              </Toggle>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Post composition
          </p>
          <div className="flex flex-wrap gap-1">
            <Toggle
              testId="content-post-states"
              active={post === null}
              title="Capture individual question cards rather than a carousel post."
              onClick={() => setPost(null)}
            >
              Question Cards
            </Toggle>
            {POST_TYPES.map((p) => (
              <Toggle
                key={p}
                testId={`content-post-${p}`}
                active={post === p}
                title="A carousel post defines its own ordered slides, so it replaces the card selection."
                onClick={() => setPost(p)}
              >
                {POST_LABELS[p]}
              </Toggle>
            ))}
          </div>
        </div>

        {/* Cards are hidden under a post: the CLI rejects the combination, so
            offering both would build a command the parser refuses. */}
        {post === null && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question Cards
            </p>
            <div className="flex flex-wrap gap-1">
              {RENDER_STATES.map((s) => (
                <Toggle
                  key={s}
                  testId={`content-state-${s}`}
                  active={states.includes(s)}
                  title={s}
                  onClick={() =>
                    setStates((prev) =>
                      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
                    )
                  }
                >
                  {STATE_LABELS[s]}
                </Toggle>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Run name (optional)
            </p>
            <div className="flex items-center gap-1">
              <Input
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="timestamp"
                aria-label="Run name"
                className="h-8 w-40 text-xs"
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
      </Disclosure>

      {/* ── DEVELOPER TOOLS ────────────────────────────────────────────
          The CLI path, unchanged and unabridged. It stops being the first
          thing on screen; it does not stop being available. */}
      <Disclosure
        label="Developer tools"
        hint="copy the config or the exact command"
        testId="generate-content-developer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton
            text={workspaceConfig}
            disabled={!canHandOff}
            label="Copy config"
            successMessage="Workspace config copied — paste it into the local Content Workspace"
            testId="generate-content-copy-config"
            variant="outline"
          />
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
              <li key={e} className="text-xs text-red-300">{e}</li>
            ))}
          </ul>
        )}

        {built.command !== "" && (
          <pre
            data-testid="generate-content-command"
            className={`overflow-x-auto rounded border border-border bg-muted/30 p-2 text-[11px] leading-relaxed ${
              handoffBlocked ? "opacity-50" : ""
            }`}
          >
            <code>{built.command}</code>
          </pre>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Run it in the local checkout. Playwright, the render harness, capture
          QA, the manifest and the exported files all stay local — Admin hands
          over the selection and the configuration, nothing else. Capture QA is
          still the final authority on the image; this readiness check is a
          preflight. Max {MAX_BATCH_LIMIT} questions per run.
        </p>
      </Disclosure>
    </div>
  );
}

export default GenerateContentPanel;
