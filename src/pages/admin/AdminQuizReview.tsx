import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, AlertTriangle, Star, StarOff, EyeOff, Eye,
  ChevronLeft, ChevronRight, ChevronDown, Search, SlidersHorizontal, X, ImageOff,
  ArrowLeft, Loader2, Wrench, ListChecks, Send, Package, KeyRound, Download,
  Image as ImageIcon, ImageMinus, HelpCircle, Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEOHead from "@/components/SEOHead";
import {
  quizApi,
  resolveQuizAssetUrl,
  QuizAdminAuthError,
  type ReviewQuestion,
  type ReviewFilters,
  type ReviewFilterOptions,
  type ReviewPatchPayload,
  type ReviewUniverseRow,
  type ReviewUniverseItem,
  type QuizQuestion,
} from "@/lib/quiz/api";
import {
  useChampionAssets,
  getChampionIcon,
  getChampionSplash,
  getChampionLoading,
} from "@/hooks/useChampionAssets";
import { upsertPlaylist } from "@/lib/quiz-broadcast/storage";
import type { BroadcastPlaylist } from "@/lib/quiz-broadcast/types";
import { getAdminKey, setAdminKey, subscribeAdminKey } from "@/lib/knowledge-admin/key";
import { QuestionPreviewPanel } from "@/components/question-preview/QuestionPreviewPanel";
import { describeAssetStatus, type AssetStatus } from "@/lib/quiz/assetStatus";
import { evaluateContentReadiness } from "@/lib/quiz-screenshot/readiness";
import {
  GenerateContentPanel,
  ReadinessBadge,
} from "@/components/admin/GenerateContentPanel";
import { reviewRowSupport } from "@/lib/quiz-screenshot/reviewSource";
import { isFailure } from "@/lib/result-narrowing";
import {
  storedCorrectOptionIndex,
  storedQuestionPreviewPayload,
} from "@/lib/question-preview/storedQuestionPreviewSource";

// ---------------------------------------------------------------------------
// Admin key (shared with Knowledge Admin — backend uses one KNOWLEDGE_ADMIN_KEY
// secret for both admin surfaces). Session-scoped; never placed in query keys.
// ---------------------------------------------------------------------------

function useAdminKey(): string | null {
  const [key, setKey] = useState<string | null>(getAdminKey);
  useEffect(() => subscribeAdminKey(() => setKey(getAdminKey())), []);
  return key;
}

function isAuthError(err: unknown): boolean {
  return err instanceof QuizAdminAuthError;
}

function AdminKeyPanel({ invalid }: { invalid: boolean }) {
  const [value, setValue] = useState("");
  const save = () => {
    const v = value.trim();
    if (v) setAdminKey(v);
  };
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold">{invalid ? "Admin key invalid" : "Admin key required"}</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {invalid
            ? "The saved admin key was rejected. Enter the current X-Admin-Key to continue."
            : "Enter the X-Admin-Key (KNOWLEDGE_ADMIN_KEY) to load the review console. Stored for this browser session only, and shared with Knowledge Admin."}
        </p>
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="X-Admin-Key value"
          className="h-8 text-xs"
          autoFocus
        />
        <Button size="sm" className="h-7 w-full text-xs" disabled={!value.trim()} onClick={save}>
          Save key
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = ["unreviewed", "approved", "rejected", "needs_fix", "missing_asset"] as const;

/**
 * The three verdicts a reviewer actually reaches for, and the two that only
 * ever undo or re-route. Splitting them is the whole point of the Review
 * section: five equally-weighted buttons hid the decision the page exists for.
 * Both lists come from REVIEW_STATUSES, so no status can be dropped silently.
 */
const PRIMARY_REVIEW_STATUSES = ["approved", "needs_fix", "rejected"] as const;
const SECONDARY_REVIEW_STATUSES = REVIEW_STATUSES.filter(
  (s) => !(PRIMARY_REVIEW_STATUSES as readonly string[]).includes(s),
);

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  unreviewed:    { label: "Unreviewed",    color: "border-muted-foreground/30 text-muted-foreground",         icon: SlidersHorizontal },
  approved:      { label: "Approved",      color: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10", icon: CheckCircle2 },
  rejected:      { label: "Rejected",      color: "border-red-400/50 text-red-300 bg-red-400/10",             icon: XCircle },
  needs_fix:     { label: "Needs Fix",     color: "border-amber-400/50 text-amber-300 bg-amber-400/10",       icon: Wrench },
  missing_asset: { label: "Missing Asset", color: "border-orange-400/50 text-orange-300 bg-orange-400/10",    icon: ImageOff },
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Recognition", 2: "Recall", 3: "Comparison", 4: "Reasoning", 5: "Simulation",
};

/**
 * CON1 Step 1E — the COMPUTED asset-health badge.
 *
 * Deliberately NOT merged with the `missing_asset` control below it. They are
 * different claims by different authors:
 *
 *   missing_asset  a REVIEWER'S annotation — "a human looked and says the art
 *                  is wrong/absent". Editable, and stays editable.
 *   asset_status   the BACKEND'S computation — the canonical resolver was asked
 *                  whether the files this question requires exist. Read-only
 *                  here; nothing in Admin can set it.
 *
 * Collapsing them into one checkbox would let a computed truth be silently
 * overwritten by an opinion, or an opinion be mistaken for verification. The
 * tooltip on every state says "Computed:" for exactly that reason.
 */
const ASSET_TONE: Record<string, string> = {
  ok:    "border-emerald-400/50 text-emerald-300 bg-emerald-400/10",
  warn:  "border-amber-400/50 text-amber-300 bg-amber-400/10",
  bad:   "border-red-400/50 text-red-300 bg-red-400/10",
  muted: "border-muted-foreground/30 text-muted-foreground",
};

const ASSET_ICON: Record<string, React.ElementType> = {
  resolved: ImageIcon,
  unresolved: ImageOff,
  not_required: ImageMinus,
  unknown: HelpCircle,
};

function AssetBadge({ status, compact = false }: { status?: AssetStatus | null; compact?: boolean }) {
  if (!status) return null;
  const described = describeAssetStatus(status);
  const Icon = ASSET_ICON[status.status] ?? HelpCircle;
  if (compact) {
    return (
      <Icon
        className={`h-4 w-4 ${
          described.tone === "bad" ? "text-red-400"
            : described.tone === "warn" ? "text-amber-400"
            : described.tone === "ok" ? "text-emerald-400"
            : "text-muted-foreground"
        }`}
        aria-label={described.label}
        data-asset-status={status.status}
      >
        <title>{described.help}</title>
      </Icon>
    );
  }
  return (
    <span
      data-asset-status={status.status}
      title={described.help}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
        ASSET_TONE[described.tone] ?? ASSET_TONE.muted
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {described.label}
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  stored_question: "Stored questions", mastery_question: "Mastery", ranked_candidate: "Ranked candidates",
  ranked_fallback: "Ranked fallback", family_definition: "Family definitions",
  meta_reflex_rule: "Meta Reflex rules", meta_reflex_specimen: "Meta Reflex specimens",
  daily_card: "Daily frozen cards",
  pro_question: "Pro Play (current)",
};

/**
 * CON1 Step 5 — the status the backend gives a stored row whose FAMILY is no
 * longer served from the bank.
 *
 * The ~50k stored `pro_champion_scope_comparison` rows are historical: Pro Play
 * generates on demand and has no question bank. `quiz.review_universe` derives
 * this from `pro_authority.on_demand.SUPPORTED_FAMILIES`, so the marking cannot
 * drift from what the product serves. Kept as a LABEL, not a gate — the row is
 * still readable, still addressable by its numeric id, and its publishability
 * is decided by exactly the rules it always was.
 */
const LEGACY_SUPERSEDED_STATUS = "legacy_superseded";

/**
 * CON1 Step 5 — the Pro Play context Admin needs to judge a specimen.
 *
 * Player/team/champion, the metric and the scope. Read off the row's own
 * `metadata`, which for a Pro row is the discovery projection the backend
 * built from the FROZEN presentation contract — nothing is parsed back out of
 * the review key, for the same reason the Daily framing is not.
 */
function proContextOf(row: ReviewUniverseRow): string | null {
  if (row.source_kind !== "pro_question") return null;
  // A bounded specimen REQUEST the current authority cannot answer. It is a
  // row rather than an omission on purpose: "no current supply" and "the
  // collector did not ask" are different facts and a content owner acts on
  // them differently, so the provider's own message is shown in place of the
  // context that does not exist.
  if (row.source_status === "no_current_supply") {
    return row.explanation
      ? `No current supply — ${row.explanation}`
      : "No current supply for this scope.";
  }
  const meta = (row.metadata ?? {}) as {
    scope_label?: string;
    scope_tags?: string[];
    subjects?: string[];
    metric?: string;
  };
  const parts = [
    meta.scope_label,
    (meta.scope_tags ?? []).join(" · "),
    meta.metric ? `metric: ${meta.metric}` : null,
    (meta.subjects ?? []).length ? `vs ${(meta.subjects ?? []).join(" / ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("  —  ") : null;
}

/**
 * CON1 Step 3C — where a frozen Daily card sat in its day.
 *
 * Read from the row's own `metadata`, which for a Daily row IS the backend's
 * framing block. Nothing is parsed out of the review key: the key is an
 * identity, and re-deriving a date from it here would be a second, weaker copy
 * of the grammar the backend owns.
 */
function dailyFramingOf(row: ReviewUniverseRow): string | null {
  if (row.source_kind !== "daily_card") return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const date = typeof meta.challenge_date === "string" ? meta.challenge_date : null;
  if (!date) return null;
  const version = typeof meta.challenge_version === "number" ? meta.challenge_version : null;
  const sequence = typeof meta.sequence === "number" ? meta.sequence : null;
  const count = typeof meta.card_count === "number" ? meta.card_count : null;
  const position =
    sequence === null ? "" : ` · card ${sequence}${count === null ? "" : `/${count}`}`;
  return `${date}${version === null ? "" : ` · v${version}`}${position}`;
}

/**
 * The Ranked candidate id behind a universe row, or null.
 *
 * The universe emits `review_key = "ranked:<candidate_id>"` for the
 * `ranked_candidate` source, which is exactly the id the preview endpoint
 * takes. Reading it here is what lets Ranked questions be *seen as played*
 * from inside Quiz Review — the one genuinely valuable capability of the
 * retired Ranked Duel Review surface, kept rather than deleted with it.
 */
function rankedCandidateIdOf(row: ReviewUniverseRow): string | null {
  if (row.source_kind !== "ranked_candidate") return null;
  const id = row.review_key.startsWith("ranked:") ? row.review_key.slice(7) : "";
  return id.trim() === "" ? null : id;
}

/**
 * Which option is correct, as an INDEX.
 *
 * The preview payload deliberately carries no answer, so the reveal state needs
 * the index from the admin row we already hold. `indexOf` returns -1 when the
 * stored answer text does not match any option — a real defect the bank audit
 * reports — and that is mapped to null so Reveal is simply unavailable rather
 * than highlighting option 0 as correct.
 */
function correctIndexOf(row: ReviewUniverseRow): number | null {
  const i = row.options.indexOf(row.correct_answer);
  return i >= 0 ? i : null;
}

/**
 * CON1 Step 3B — is this universe row publishable through a review key?
 *
 * Decided from the row's declared `source_kind` against the shared policy, so
 * a definition can never LOOK publishable. It is the earliest gate, not the
 * only one: the backend resolver refuses independently, and the capture gates
 * still run after Playwright paints.
 */
function UniverseRow({
  row,
  onGenerate,
}: {
  row: ReviewUniverseRow;
  onGenerate?: (reviewKey: string) => void;
}) {
  const candidateId = rankedCandidateIdOf(row);
  const [previewing, setPreviewing] = useState(false);
  // CON1 Step 3C: the ROW's own verdict when it carries one (a frozen Daily
  // card is publishable or not per card, not per source kind), else the shared
  // source-kind policy. Both are the earliest gate, never the only one.
  const support = reviewRowSupport(row);
  const framing = dailyFramingOf(row) ?? proContextOf(row);
  // A stored row from a family the product now generates on demand. Marked, not
  // hidden: an operator scanning for current content should be able to see at a
  // glance that this row is not it.
  const legacy = row.source_status === LEGACY_SUPERSEDED_STATUS;
  // `strictNullChecks` is off, so a boolean discriminant needs the repo's own
  // narrowing predicate — see src/lib/result-narrowing.ts.
  const refusal = isFailure(support) ? support : null;

  return <div className="border-b px-3 py-2.5 text-sm last:border-b-0">
    <div className="grid grid-cols-[11rem_13rem_1fr_10rem] gap-3">
      <div><div className="font-medium">{SOURCE_LABELS[row.source_kind] ?? row.source_kind}</div><div className="text-muted-foreground">{row.materialization}</div></div>
      <div className="truncate" title={row.family}>{row.family || "—"}</div>
      <div className="min-w-0">
        <div className="truncate font-medium" title={row.question_text}>{row.question_text || row.review_key}</div>
        <div className="truncate text-xs text-muted-foreground">{row.review_key}</div>
        {framing && (
          <div className="truncate text-xs text-muted-foreground" data-testid={`universe-framing-${row.review_key}`}>
            {framing}
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={legacy ? "text-amber-500/90" : undefined}
            data-testid={legacy ? `universe-legacy-${row.review_key}` : undefined}
            title={
              legacy
                ? "This family is served on demand by the Pro Authority; the " +
                  "stored rows are a historical population, not current content."
                : undefined
            }
          >
            {legacy ? "Legacy (superseded)" : row.source_status || "—"}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={row.source_version}>{row.source_version || "—"}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onGenerate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              data-testid={`universe-generate-${row.review_key}`}
              data-source-supported={refusal ? "false" : "true"}
              data-refusal-code={refusal ? refusal.code : undefined}
              disabled={!!refusal}
              title={
                refusal
                  ? refusal.reason
                  : `Hand this ${SOURCE_LABELS[row.source_kind] ?? row.source_kind} row off to the Content Factory.`
              }
              onClick={() => onGenerate(row.review_key)}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden /> Generate
            </Button>
          )}
          {candidateId && (
            <Button
              size="sm"
              variant={previewing ? "secondary" : "ghost"}
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              data-testid={`universe-preview-toggle-${row.review_key}`}
              onClick={() => setPreviewing((v) => !v)}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> {previewing ? "Hide" : "Preview"}
            </Button>
          )}
        </div>
      </div>
    </div>
    {onGenerate && refusal && (
      <p
        className="mt-1 text-xs text-muted-foreground"
        data-testid={`universe-generate-reason-${row.review_key}`}
      >
        {refusal.reason}
      </p>
    )}
    {candidateId && previewing && (
      <div className="mt-2 rounded border border-border/60 bg-muted/10 p-2">
        <QuestionPreviewPanel
          candidateId={candidateId}
          correctAnswerIndex={correctIndexOf(row)}
        />
      </div>
    )}
  </div>;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** One consistent section heading for the detail panel. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unreviewed;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function DiffBadge({ difficulty }: { difficulty?: number }) {
  if (!difficulty) return null;
  const colors = [
    "", "bg-emerald-400/15 text-emerald-300", "bg-sky-400/15 text-sky-300",
    "bg-amber-400/15 text-amber-300", "bg-orange-400/15 text-orange-300", "bg-red-400/15 text-red-300",
  ];
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${colors[difficulty] ?? ""}`}>
      D{difficulty}
    </span>
  );
}

/** Renders a single asset image with load/error state. Accepts relative paths or full URLs. */
function AssetImage({ src, label }: { src?: string | null; label: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  // resolveQuizAssetUrl passes through absolute https:// URLs unchanged
  const url = resolveQuizAssetUrl(src);
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {state === "error" ? (
        <div className="flex h-16 w-16 items-center justify-center rounded border border-red-500/30 bg-red-500/10">
          <ImageOff className="h-6 w-6 text-red-400" />
        </div>
      ) : (
        <img
          src={url}
          alt={label}
          className={`h-16 w-auto max-w-[96px] rounded object-contain transition-opacity ${
            state === "loading" ? "opacity-0" : "opacity-100"
          }`}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
      <span className="text-center text-[11px] text-muted-foreground">{label}</span>
      {state === "error" && <span className="text-[11px] text-red-400">broken</span>}
    </div>
  );
}

function choiceLabel(c: string | { label: string; raw_stats?: string[] }): string {
  return typeof c === "string" ? c : c.label;
}

// ---------------------------------------------------------------------------
// Filters
//
// The primary toolbar carries only what the operator touches every day:
// search, source, review status, and one door to everything else. The eleven
// controls that used to occupy a permanent 240px column are all still here —
// behind "More filters", which also reports how many of them are active so a
// narrowed list is never a mystery.
// ---------------------------------------------------------------------------

type FilterFieldsProps = {
  filters: ReviewFilters;
  onFilters: (f: ReviewFilters) => void;
  filterOptions?: ReviewFilterOptions;
};

/** The filters that live behind "More filters", for the active-count badge. */
const ADVANCED_FILTER_KEYS = [
  "category", "answer_certainty", "format", "is_active", "favorite_for_shorts",
  "missing_asset", "has_image", "difficulty_min", "difficulty_max",
  "ability_slot", "subject_type", "pack_key",
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/**
 * The advanced filter panel.
 *
 * An absolutely-positioned overlay rather than an inline block: opening it
 * must not shove the question list down the page, which is the layout jump the
 * old always-on column was avoiding by never closing.
 */
function MoreFilters({ filters, onFilters, filterOptions }: FilterFieldsProps) {
  const [open, setOpen] = useState(false);
  const set = (key: keyof ReviewFilters, val: ReviewFilters[keyof ReviewFilters]) =>
    onFilters({ ...filters, [key]: val, page: 1 });
  const clear = (key: keyof ReviewFilters) => {
    const next = { ...filters, page: 1 };
    delete next[key];
    onFilters(next);
  };

  const activeCount = ADVANCED_FILTER_KEYS
    .filter((k) => filters[k] !== undefined && filters[k] !== "").length;

  return (
    <div className="relative">
      <Button
        size="sm"
        variant={activeCount > 0 ? "secondary" : "outline"}
        className="h-9 gap-1.5 text-sm"
        aria-expanded={open}
        data-testid="more-filters-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        More filters
        {activeCount > 0 && (
          <span className="rounded bg-primary px-1.5 py-px text-[11px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Button>

      {open && (
        <>
          {/* Click-away. Transparent and behind the panel, so nothing dims. */}
          <div
            className="fixed inset-0 z-20"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="more-filters-panel"
            className="absolute right-0 top-full z-30 mt-2 w-[46rem] max-w-[92vw] animate-in fade-in-0 zoom-in-95 duration-150 rounded-xl border border-border bg-background p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">More filters</span>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <button
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() =>
                      onFilters({
                        page: 1,
                        page_size: filters.page_size,
                        search: filters.search,
                        source_type: filters.source_type,
                        review_status: filters.review_status,
                      })
                    }
                  >
                    Clear all ({activeCount})
                  </button>
                )}
                <button
                  aria-label="Close more filters"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Category">
                <Select value={filters.category ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("category") : set("category", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any category</SelectItem>
                    {filterOptions?.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Answer certainty">
                <Select value={filters.answer_certainty ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("answer_certainty") : set("answer_certainty", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any certainty</SelectItem>
                    <SelectItem value="objective">Objective</SelectItem>
                    <SelectItem value="derived">Derived</SelectItem>
                    <SelectItem value="subjective">Subjective</SelectItem>
                    <SelectItem value="community">Community</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Format">
                <Select value={filters.format ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("format") : set("format", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any format</SelectItem>
                    {filterOptions?.formats.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Ability slot">
                <Select value={filters.ability_slot ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("ability_slot") : set("ability_slot", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any slot</SelectItem>
                    <SelectItem value="passive">Passive</SelectItem>
                    <SelectItem value="q">Q</SelectItem>
                    <SelectItem value="w">W</SelectItem>
                    <SelectItem value="e">E</SelectItem>
                    <SelectItem value="r">R (Ultimate)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Subject type">
                <Select value={filters.subject_type ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("subject_type") : set("subject_type", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any subject</SelectItem>
                    <SelectItem value="champion">Champion</SelectItem>
                    <SelectItem value="ability">Ability</SelectItem>
                    <SelectItem value="item">Item</SelectItem>
                    <SelectItem value="rune">Rune</SelectItem>
                    <SelectItem value="summoner_spell">Summoner Spell</SelectItem>
                    <SelectItem value="objective">Objective</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Live in the app">
                <Select
                  value={filters.is_active !== undefined ? String(filters.is_active) : "__all__"}
                  onValueChange={(v) => v === "__all__" ? clear("is_active") : set("is_active", Number(v))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Live and retired</SelectItem>
                    <SelectItem value="1">Live only</SelectItem>
                    <SelectItem value="0">Retired only</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {(filterOptions?.packs?.length ?? 0) > 0 && (
                <Field label="Set">
                  <Select value={filters.pack_key ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("pack_key") : set("pack_key", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Any set</SelectItem>
                      {filterOptions?.packs?.map((p) => (
                        <SelectItem key={p.pack_key} value={p.pack_key}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="col-span-3">
                <Field label="Difficulty">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((d) => {
                      const active = filters.difficulty_min === d && filters.difficulty_max === d;
                      return (
                        <button
                          key={d}
                          onClick={() =>
                            active
                              ? onFilters({ ...filters, page: 1, difficulty_min: undefined, difficulty_max: undefined })
                              : onFilters({ ...filters, page: 1, difficulty_min: d, difficulty_max: d })
                          }
                          className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {d} · {DIFFICULTY_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <div className="col-span-3">
                <Field label="Shortcuts">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "⭐ Shorts Favorites", key: "favorite_for_shorts" as const, val: 1 },
                      { label: "🚨 Missing Asset",    key: "missing_asset" as const,     val: 1 },
                      { label: "🖼️ Has Image",        key: "has_image" as const,          val: 1 },
                      { label: "No Image",            key: "has_image" as const,          val: 0 },
                    ].map(({ label, key, val }) => {
                      const active = filters[key] === val;
                      return (
                        <button
                          key={`${key}-${val}`}
                          onClick={() => (active ? clear(key) : set(key, val))}
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            active
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-muted/40 text-muted-foreground hover:border-muted-foreground/40"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question list row (with checkbox)
// ---------------------------------------------------------------------------

function QuestionRow({
  q,
  selected,
  checked,
  onClick,
  onCheck,
}: {
  q: ReviewQuestion;
  selected: boolean;
  checked: boolean;
  onClick: () => void;
  onCheck: (q: ReviewQuestion) => void;
}) {
  // CON1 Step 2 — the content preflight for this row. Pure and derived from
  // fields already on it, so no fetch and no extra state; memoized because it
  // runs the runner's own adapter and the production layout authority.
  const readiness = useMemo(() => evaluateContentReadiness(q), [q]);
  return (
    <div
      data-question-id={q.id}
      className={`flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-muted/40"
      } ${!q.is_active ? "opacity-60" : ""}`}
    >
      {/* Checkbox — a real 20px hit target, not a 16px glyph. */}
      <button
        onClick={(e) => { e.stopPropagation(); onCheck(q); }}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary/60"
        }`}
        title={checked ? "Deselect" : "Select for content"}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>

      {/* Row body — clicking opens detail.
          ONE horizontal meta line under the question, and ONE horizontal
          signal cluster on the right. The old row stacked five separate
          badges vertically down the right edge — status, star, reviewer flag,
          asset, readiness — which is what made a row three lines tall and
          unreadable at a glance. Everything below is still here; it is laid
          out to be scanned rather than decoded. */}
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[15px] leading-snug text-foreground">{q.question_text}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">{q.category}</span>
              {q.source_type && (
                <>
                  <span aria-hidden>·</span>
                  <span>{q.source_type}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>#{q.id}</span>
              {q.difficulty && <DiffBadge difficulty={q.difficulty} />}
              {!q.is_active && (
                <span className="rounded border border-border px-1.5 py-px text-[11px]">Retired</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {q.favorite_for_shorts && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-label="Shorts favorite" />
            )}
            {q.missing_asset && (
              <ImageOff
                className="h-4 w-4 text-orange-400"
                aria-label="Flagged by a reviewer as missing an asset"
              />
            )}
            <AssetBadge status={q.asset_status} compact />
            <ReadinessBadge readiness={readiness} compact />
            <StatusBadge status={q.review_status} />
          </div>
        </div>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  questionId,
  onClose,
  onNavigate,
  canPrev,
  canNext,
  onGenerateContent,
}: {
  questionId: number;
  onClose: () => void;
  onNavigate: (dir: "prev" | "next") => void;
  canPrev: boolean;
  canNext: boolean;
  /** CON1 Step 2 — hand this ONE question to the Generate Content panel. */
  onGenerateContent?: (q: ReviewQuestion) => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["review-question", questionId],
    queryFn: () => quizApi.getReviewQuestion(questionId),
    staleTime: 30_000,
    retry: false,
  });

  // Champion asset manifest (globally cached, ~free after first load)
  const { data: champManifest } = useChampionAssets();

  const q = data?.question;

  // A preview belongs to ONE question. Navigating collapses it rather than
  // carrying an open panel onto the next row, where it would briefly show the
  // previous question's surface.
  useEffect(() => setPreviewing(false), [questionId]);

  // Sync note textarea when question loads or navigates
  useEffect(() => {
    setNote(q?.review_note ?? "");
  }, [questionId, q?.review_note]);

  const { mutate: patch, isPending } = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReviewPatchPayload }) =>
      quizApi.patchReviewQuestion(id, payload),
    onSuccess: (_, { payload }) => {
      void queryClient.invalidateQueries({ queryKey: ["review-question", questionId] });
      void queryClient.invalidateQueries({ queryKey: ["review-questions"] });
      toast.success(`Updated: ${Object.keys(payload).join(", ")}`);
    },
    onError: () => toast.error("Failed to update question"),
  });

  const apply = useCallback(
    (payload: ReviewPatchPayload) => patch({ id: questionId, payload }),
    [questionId, patch],
  );

  // Fail safely on an invalid / missing / deleted id (e.g. a stale deep link):
  // don't spin forever — show a clear not-found state with a way out.
  if (!isLoading && (isError || !q)) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
        data-testid="review-detail-not-found"
      >
        <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden />
        <span className="text-sm text-muted-foreground">
          Question #{questionId} was not found. It may have been deleted or the link is invalid.
        </span>
        <Button size="sm" variant="outline" className="mt-1 h-9 text-sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  if (isLoading || !q) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const correctValue = q.correct_answer?.value ?? "";
  // Shape only — see storedQuestionPreviewSource. Null for a row that is not a
  // previewable multiple-choice question, which hides the affordance entirely
  // rather than offering a preview that would render nothing.
  const previewPayload = storedQuestionPreviewPayload(q);
  const assetBase = q.metadata as Record<string, unknown>;
  const assets = (assetBase?.assets as Record<string, unknown>) ?? {};
  const subject = (assets?.subject as Record<string, unknown>) ?? {};
  const subjectType = subject.type as string | undefined;

  // Metadata-stored asset paths (works for all question types)
  const metadataAssets = [
    { key: "icon",             label: "Icon" },
    { key: "splash",           label: "Splash" },
    { key: "loading",          label: "Loading" },
    { key: "item_icon",        label: "Item Icon" },
    { key: "ability_icon",     label: "Ability Icon" },
    { key: "rune_icon",        label: "Rune Icon" },
    { key: "summoner_icon",    label: "Summoner Icon" },
    { key: "champion_icon",    label: "Champion Icon" },
    { key: "champion_splash",  label: "Champion Splash" },
    { key: "champion_loading", label: "Champion Loading" },
  ].filter(({ key }) => subject[key]);

  // Item icons stored as an array (combat_simulation questions)
  const subjectItemIcons: { name: string; icon: string }[] = Array.isArray(subject.item_icons)
    ? (subject.item_icons as Array<Record<string, unknown>>)
        .filter((it) => it.icon)
        .map((it) => ({ name: String(it.name ?? "Item"), icon: String(it.icon) }))
    : [];

  // For ability/combat questions, supplement with champion art from the manifest
  const championName = (
    subjectType === "ability" || subjectType === "combat_cooldown"
      ? (subject.champion as string | undefined)
      : undefined
  ) ?? (assetBase?.champion_name as string | undefined);

  const championManifestAssets: { url: string | null; label: string }[] =
    championName
      ? [
          { url: getChampionIcon(champManifest, championName),    label: `${championName} Icon` },
          { url: getChampionSplash(champManifest, championName),  label: `${championName} Splash` },
          { url: getChampionLoading(champManifest, championName), label: `${championName} Loading` },
        ].filter(({ url }) => url !== null)
      : [];

  const showChampionExpansion = championManifestAssets.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — identity, paging, close. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate("prev")} disabled={!canPrev} aria-label="Previous question" className="rounded p-1 hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="px-1 text-sm font-medium text-muted-foreground">#{q.id}</span>
          <button onClick={() => onNavigate("next")} disabled={!canNext} aria-label="Next question" className="rounded p-1 hover:bg-muted disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
          <StatusBadge status={q.review_status} />
        </div>
        <button onClick={onClose} aria-label="Close detail" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable body.
          The order IS the workflow: read the question, look at it the way a
          player will, judge it, then decide what to do with it. Everything
          that describes the record rather than the question — difficulty,
          certainty, provenance, ids, asset paths, raw metadata — sits under
          Properties at the bottom, where it is one click away instead of
          three sections above the question text. */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

        {/* ── 1. QUESTION ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionLabel>Question</SectionLabel>
          <p className="text-lg font-medium leading-snug text-foreground">{q.question_text}</p>

          {q.image_path && <AssetImage src={q.image_path} label="question image" />}

          <div className="space-y-1.5">
            {q.choices.map((c, i) => {
              const label = choiceLabel(c);
              const isCorrect = label.toLowerCase().trim() === correctValue.toLowerCase().trim();
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    isCorrect
                      ? "border-emerald-400/50 bg-emerald-400/10 font-medium text-emerald-200"
                      : "border-border/40 text-muted-foreground"
                  }`}
                >
                  {isCorrect
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    : <span className="h-4 w-4 shrink-0" aria-hidden />}
                  <span>{label}</span>
                </div>
              );
            })}
          </div>

          {q.explanation && (
            <div className="space-y-1">
              <SectionLabel>Explanation</SectionLabel>
              <p className="text-sm leading-relaxed text-muted-foreground">{q.explanation}</p>
            </div>
          )}
        </section>

        {/* ── 2. PREVIEW ──────────────────────────────────────────────────
            The SAME production surface a Ranked candidate previews through,
            reached the same way: the row's envelope goes through
            `adaptCandidatePreview` -> `scenarioSourceFromPublicQuestion` ->
            `selectFamilyLayout` -> the production scenario band. No premise,
            layout, or scenario decision is made here.

            The scenario comes from the backend's `presentation` and nowhere
            else. A row without one previews as the text-only surface — which
            is what a question with no declared safe premise honestly is, and
            what the `wave` form of minion_xp_level_breakpoint deliberately
            gets until its contract can express a safe premise. */}
        {previewPayload && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Preview</SectionLabel>
              <Button
                size="sm"
                variant={previewing ? "secondary" : "outline"}
                className="h-8 gap-1.5 text-sm"
                data-testid="stored-preview-toggle"
                onClick={() => setPreviewing((v) => !v)}
              >
                <Eye className="h-4 w-4" aria-hidden /> {previewing ? "Hide" : "Preview"}
              </Button>
            </div>
            {previewing && (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <QuestionPreviewPanel
                  payload={previewPayload}
                  correctAnswerIndex={storedCorrectOptionIndex(q)}
                />
              </div>
            )}
          </section>
        )}

        {/* ── 3. REVIEW ───────────────────────────────────────────────────
            The verdict, and only the verdict. Approve / Needs Fix / Reject are
            the three an operator actually presses; "Unreviewed" (undo) and
            "Missing Asset" (a routing state that duplicates the Flag Asset
            annotation below) are kept but demoted, because giving five buttons
            equal weight is what made the primary decision invisible. */}
        <section className="space-y-2">
          <SectionLabel>Review</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {PRIMARY_REVIEW_STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              const active = q.review_status === s;
              return (
                <button
                  key={s}
                  disabled={isPending}
                  onClick={() => apply({ review_status: s })}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? cfg.color + " ring-2 ring-current/30"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SECONDARY_REVIEW_STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              const active = q.review_status === s;
              return (
                <button
                  key={s}
                  disabled={isPending}
                  onClick={() => apply({ review_status: s })}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                    active ? cfg.color + " ring-1 ring-current/40" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Internal note — part of the verdict, not a property. */}
          {noteEditing ? (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Internal review note…"
                className="min-h-[72px] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-sm"
                  disabled={isPending}
                  onClick={() => { apply({ review_note: note }); setNoteEditing(false); }}
                >
                  Save note
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-sm"
                  onClick={() => { setNote(q.review_note ?? ""); setNoteEditing(false); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setNote(q.review_note ?? ""); setNoteEditing(true); }}
              className="w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              {q.review_note || "Add an internal note…"}
            </button>
          )}
        </section>

        {/* ── 4. USE THIS QUESTION ────────────────────────────────────────
            Only routes that exist. Admin Quiz Review has no write path into
            Ranked, Daily or a Set — those are read-only relationships here
            (a Set membership is shown under Properties) — so no button
            pretends otherwise. */}
        <section className="space-y-2">
          <SectionLabel>Use this question</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {onGenerateContent && (
              <Button
                size="sm"
                className="h-9 gap-1.5 text-sm"
                data-testid="generate-content-open"
                title="Set up a Content Factory run for this question."
                onClick={() => onGenerateContent(q)}
              >
                <Terminal className="h-4 w-4" />
                Generate Content
              </Button>
            )}
            <button
              disabled={isPending}
              onClick={() => apply({ favorite_for_shorts: !q.favorite_for_shorts })}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                q.favorite_for_shorts
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-border text-muted-foreground hover:border-amber-400/40 hover:text-foreground"
              }`}
            >
              {q.favorite_for_shorts ? <Star className="h-4 w-4 fill-amber-400" /> : <StarOff className="h-4 w-4" />}
              {q.favorite_for_shorts ? "Shorts Fav" : "Add to Shorts"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AssetBadge status={q.asset_status} />
            <ReadinessBadge readiness={evaluateContentReadiness(q)} />
          </div>
        </section>

        {/* ── 5. PROPERTIES ───────────────────────────────────────────────
            Collapsed by default and native <details>, so its content is
            always in the DOM (no remount, no scroll jump) and the disclosure
            costs no JavaScript. */}
        <details className="group rounded-lg border border-border/60 bg-muted/10" data-testid="detail-properties">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Properties &amp; technical detail
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>

          <div className="space-y-4 border-t border-border/60 px-3 py-3">

            {/* Difficulty */}
            <div className="space-y-1.5">
              <SectionLabel>Difficulty</SectionLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    disabled={isPending}
                    onClick={() => apply({ difficulty: d })}
                    title={DIFFICULTY_LABELS[d]}
                    className={`flex h-8 w-8 items-center justify-center rounded text-sm font-bold transition-colors ${
                      q.difficulty === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {d}
                  </button>
                ))}
                <span className="ml-1 text-xs text-muted-foreground">{DIFFICULTY_LABELS[q.difficulty ?? 1]}</span>
              </div>
            </div>

            {/* Answer certainty */}
            <div className="space-y-1.5">
              <SectionLabel>Answer certainty</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {["objective", "derived", "subjective", "community"].map((c) => (
                  <button
                    key={c}
                    disabled={isPending}
                    onClick={() => apply({ answer_certainty: c })}
                    className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                      q.answer_certainty === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Serving + asset annotations */}
            <div className="flex flex-wrap gap-2">
              <button
                disabled={isPending}
                onClick={() => apply({ is_active: !q.is_active })}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  !q.is_active
                    ? "border-red-400/50 bg-red-400/10 text-red-300"
                    : "border-border text-muted-foreground hover:border-red-400/30"
                }`}
              >
                {q.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {q.is_active ? "Active" : "Inactive"}
              </button>
              <button
                disabled={isPending}
                title={
                  q.missing_asset
                    ? "Reviewer annotation: someone flagged this row's art. Separate from the computed badge beside it."
                    : "Flag this row's art for a human to fix. This is your annotation, not the computed asset check."
                }
                onClick={() => apply({ missing_asset: !q.missing_asset })}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  q.missing_asset
                    ? "border-orange-400/50 bg-orange-400/10 text-orange-300"
                    : "border-border text-muted-foreground hover:border-orange-400/30"
                }`}
              >
                <ImageOff className="h-3.5 w-3.5" />
                {q.missing_asset ? "Asset Missing" : "Flag Asset"}
              </button>
            </div>

            {/* Provenance grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-xs">
              {[
                ["Category",    q.category],
                ["Source",      q.source_type ?? "—"],
                ["Format",      q.format],
                ["Certainty",   q.answer_certainty],
                ["Key",         q.question_key ?? "—"],
                ["Created",     q.created_at ? q.created_at.slice(0, 10) : "—"],
                ["Reviewed by", q.reviewed_by ?? "—"],
                ["Reviewed at", q.reviewed_at ? q.reviewed_at.slice(0, 10) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-1">
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="truncate font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {/* Set membership — read-only: nothing here writes pack membership. */}
            {(q.packs?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {q.packs?.map((pk) => (
                  <span
                    key={pk.pack_key}
                    title={pk.pack_key}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-300"
                  >
                    <Package className="h-3.5 w-3.5" />
                    {pk.title}
                    {pk.position != null && <span className="text-amber-300/60">#{pk.position}</span>}
                  </span>
                ))}
              </div>
            )}

            {/* Metadata assets (icon/splash/loading/item/ability/rune/summoner from stored paths) */}
            {(metadataAssets.length > 0 || subjectItemIcons.length > 0) && (
              <div className="space-y-2">
                <SectionLabel>
                  {subjectType === "ability" ? "Ability asset"
                    : subjectType === "combat_cooldown" ? "Calculation assets"
                    : "Assets"}
                </SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {metadataAssets.map(({ key, label }) => (
                    <AssetImage key={key} src={subject[key] as string} label={label} />
                  ))}
                  {subjectItemIcons.map(({ name, icon }) => (
                    <AssetImage key={`item-${name}`} src={icon} label={name} />
                  ))}
                </div>
              </div>
            )}

            {/* Champion expansion for ability questions */}
            {showChampionExpansion && (
              <div className="space-y-2">
                <SectionLabel>Champion assets — {championName}</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {championManifestAssets.map(({ url, label }) => (
                    <AssetImage key={label} src={url} label={label} />
                  ))}
                </div>
              </div>
            )}

            {/* Raw metadata */}
            <div className="space-y-1">
              <SectionLabel>Metadata</SectionLabel>
              <pre className="max-h-56 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(q.metadata, null, 2)}
              </pre>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/70">Review Console V1</span>
              {" — "}approve, reject, adjust difficulty, flags, notes, and active status.
              Full question editing and playlist building coming next.
            </p>
          </div>
        </details>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

/**
 * The width of the right-hand column (detail, or the Generate Content
 * handoff). Previously a flat `w-[400px]`, which read as cramped on a 1440px
 * screen and absurd on a 1920px one. A viewport fraction with a floor and a
 * ceiling grows the reading area with the display while leaving the question
 * list the larger share.
 */
const DETAIL_WIDTH = "w-[min(38rem,max(26rem,34vw))]";

function toQuizQuestion(q: ReviewQuestion): QuizQuestion {
  return {
    id: q.id,
    category: q.category,
    question_key: q.question_key,
    question_text: q.question_text,
    format: q.format,
    choices: q.choices,
    image_path: q.image_path ?? undefined,
    difficulty: q.difficulty,
    metadata: q.metadata,
    // pass through taxonomy fields that QuizQuestion accepts optionally
    ...(q.source_type ? { source_type: q.source_type } : {}),
    ...(q.answer_certainty ? { answer_certainty: q.answer_certainty } : {}),
  };
}

export default function AdminQuizReview({
  embedded = false,
  selectedQuestionId,
  onSelectQuestion,
  focusFilters,
  focusLabel,
  onClearFocus,
}: {
  embedded?: boolean;
  /**
   * Controlled selection. When provided (the unified workspace passes it from
   * the `?questionId=` URL param), it is the single source of truth for the
   * open question, so deep links and browser Back/Forward drive selection.
   * Omitted → the page owns selection internally (standalone usage/tests).
   */
  selectedQuestionId?: number | null;
  onSelectQuestion?: (id: number | null) => void;
  /**
   * A diagnostic focus arriving from the Diagnostics tab: the exact rows (or
   * family, or search term) a finding concerns. It SEEDS the filter state
   * rather than locking it, so the operator can narrow further from here —
   * and it is cleared explicitly, never by the next unrelated filter change.
   */
  focusFilters?: ReviewFilters;
  focusLabel?: string;
  onClearFocus?: () => void;
} = {}) {
  const [filters, setFilters] = useState<ReviewFilters>(() => ({
    page: 1,
    page_size: PAGE_SIZE,
    ...(focusFilters ?? {}),
  }));

  // A NEW focus (a second click in Diagnostics) replaces the previous one and
  // resets paging. Compared by value: the workspace rebuilds the object from
  // URL params on every render, so an identity check would re-apply the same
  // focus forever and stamp out the operator's own filter edits.
  const focusKey = focusFilters ? JSON.stringify(focusFilters) : null;
  const appliedFocus = useRef<string | null>(focusKey);
  useEffect(() => {
    if (focusKey === appliedFocus.current) return;
    appliedFocus.current = focusKey;
    setFilters((prev) => {
      // Drop the previous focus keys before applying the new one, so two
      // successive diagnostics don't intersect into an empty result.
      const { ids: _ids, family: _family, search: _search, ...rest } = prev;
      return { ...rest, page: 1, ...(focusKey ? JSON.parse(focusKey) : {}) };
    });
  }, [focusKey]);
  const [search, setSearch] = useState("");
  const [exportScope, setExportScope] = useState<"all" | "changed" | "flagged">("all");
  const [exporting, setExporting] = useState(false);
  const [showUniverse, setShowUniverse] = useState(false);
  const [universeSource, setUniverseSource] = useState("all");
  const [universeMaterialization, setUniverseMaterialization] = useState("all");
  const [universeSearch, setUniverseSearch] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<number | null>(null);
  const controlledSelection = selectedQuestionId !== undefined;
  const selectedId = controlledSelection ? (selectedQuestionId ?? null) : internalSelectedId;
  const setSelectedId = useCallback(
    (id: number | null) => {
      if (controlledSelection) onSelectQuestion?.(id);
      else setInternalSelectedId(id);
    },
    [controlledSelection, onSelectQuestion],
  );

  // Scroll the selected row into view when selection changes (e.g. a deep link
  // from the Builder, or Back/Forward). Identity is by ID only, never by text.
  // If the id isn't on the current page/filter the detail still opens (the
  // detail panel fetches by id), so no scroll target is required.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedId == null) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-question-id="${selectedId}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Selection state: map preserves question data across page changes
  const [checkedQuestions, setCheckedQuestions] = useState<Map<number, ReviewQuestion>>(new Map());

  /**
   * CON1 Step 2 — the open Generate Content handoff, or null.
   *
   * Two kinds, ONE panel:
   *   `selection` reads the checked-question map live, so dropping a blocked
   *               row updates the command in place rather than reopening.
   *   `single`    carries the one question the detail panel handed over, which
   *               is deliberately independent of the checkbox selection: an
   *               operator reading one question should not have to check it
   *               first, and opening it must not disturb a package they were
   *               already assembling.
   *
   * Nothing is persisted. The handoff is a command, not a job.
   */
  const [contentHandoff, setContentHandoff] = useState<
    | { kind: "selection" }
    | { kind: "single"; question: ReviewQuestion }
    /**
     * CON1 Step 3B — one GENERATED review object, named by its review key.
     *
     * The key, not the row: the universe row is a discovery projection with no
     * `presentation` and no computed `asset_status`, so readiness over it would
     * be a verdict about a payload nobody renders. The resolved render payload
     * is fetched below.
     */
    | { kind: "review-key"; reviewKey: string }
    | null
  >(null);

  const queryClient = useQueryClient();
  const adminKey = useAdminKey();
  const hasAdminKey = !!adminKey;
  // Embedded in the account-bound workspace: authorized by the shared gate via
  // the Supabase session, so no local admin key is required. Standalone keeps
  // the key gate.
  const authorized = embedded || hasAdminKey;

  // When authorization changes, refetch the review queries. The raw key is
  // never a query key — invalidation is what ties cache freshness to auth.
  useEffect(() => {
    if (!authorized) return;
    void queryClient.invalidateQueries({ queryKey: ["review-filter-options"] });
    void queryClient.invalidateQueries({ queryKey: ["review-questions"] });
    void queryClient.invalidateQueries({ queryKey: ["review-question"] });
  }, [adminKey, authorized, queryClient]);

  const { data: filterOptions } = useQuery({
    queryKey: ["review-filter-options"],
    queryFn: () => quizApi.getReviewFilterOptions(),
    staleTime: 5 * 60_000,
    enabled: authorized,
    retry: false,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["review-questions", filters],
    queryFn: () => quizApi.getReviewQuestions(filters),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    enabled: authorized,
    retry: false,
  });
  const universe = useQuery({
    queryKey: ["review-universe", universeSource, universeMaterialization, universeSearch],
    queryFn: () => quizApi.getReviewUniverse({
      source_kind: universeSource === "all" ? undefined : universeSource,
      materialization: universeMaterialization === "all" ? undefined : universeMaterialization,
      search: universeSearch || undefined, page_size: 200,
    }),
    enabled: authorized && showUniverse,
    staleTime: 30_000,
    retry: false,
  });

  const authError = !authorized || isAuthError(error);

  const questions = data?.questions ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const page = filters.page ?? 1;

  const applySearch = () =>
    setFilters((f) => ({ ...f, search: search.trim() || undefined, page: 1 }));

  const selectedIndex = questions.findIndex((q) => q.id === selectedId);

  const navigate = (dir: "prev" | "next") => {
    const next = dir === "prev" ? selectedIndex - 1 : selectedIndex + 1;
    if (next >= 0 && next < questions.length) setSelectedId(questions[next].id);
  };

  const toggleCheck = (q: ReviewQuestion) => {
    setCheckedQuestions((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.set(q.id, q);
      return next;
    });
  };

  const clearSelection = () => {
    setCheckedQuestions(new Map());
    setContentHandoff((h) => (h?.kind === "selection" ? null : h));
  };
  const checkedCount = checkedQuestions.size;

  /**
   * The resolved render payload behind an open review-key handoff.
   *
   * One focused read of the canonical resolver, not a widening of the universe
   * query: the universe list is the discovery model and stays that way.
   */
  const reviewItemQuery = useQuery({
    queryKey: [
      "review-universe-item",
      contentHandoff?.kind === "review-key" ? contentHandoff.reviewKey : null,
    ],
    queryFn: () =>
      quizApi.getReviewUniverseItem(
        (contentHandoff as { kind: "review-key"; reviewKey: string }).reviewKey,
      ),
    enabled: authorized && contentHandoff?.kind === "review-key",
    staleTime: 30_000,
    retry: false,
  });

  const handoffReviewItems = useMemo<ReviewUniverseItem[]>(() => {
    if (contentHandoff?.kind !== "review-key") return [];
    const payload = reviewItemQuery.data;
    return payload && !isFailure(payload) ? [payload.item] : [];
  }, [contentHandoff, reviewItemQuery.data]);

  /**
   * The questions the open handoff covers.
   *
   * For a `selection` handoff this is `Map.values()` — JavaScript Map
   * iteration is INSERTION order, so the ids reach the command in the order the
   * operator ticked them and stay stable across filtering and pagination
   * (the map holds the row data, not a page index). That order is deliberate:
   * a carousel post is an ordered sequence, so re-sorting the selection would
   * silently change the artefact.
   */
  const handoffQuestions = useMemo<ReviewQuestion[]>(() => {
    if (!contentHandoff) return [];
    if (contentHandoff.kind === "review-key") return [];
    return contentHandoff.kind === "single"
      ? [contentHandoff.question]
      : Array.from(checkedQuestions.values());
  }, [contentHandoff, checkedQuestions]);

  // A `selection` handoff whose selection has emptied has nothing left to say.
  useEffect(() => {
    if (contentHandoff?.kind === "selection" && checkedQuestions.size === 0) {
      setContentHandoff(null);
    }
  }, [contentHandoff, checkedQuestions]);

  const dropBlockedFromSelection = useCallback((ids: number[]) => {
    setCheckedQuestions((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  /**
   * The Generate Content column.
   *
   * Defined once and rendered from BOTH tabs: a review-key handoff starts in
   * the All-sources tab, and sending the operator back to the stored list to
   * see the panel they just opened would lose the list they were working
   * through.
   */
  const contentHandoffColumn = contentHandoff === null ? null : (
    <div className={`flex h-full shrink-0 flex-col overflow-y-auto border-l p-3 ${DETAIL_WIDTH}`}>
      {contentHandoff.kind === "review-key" && handoffReviewItems.length === 0 ? (
        <div
          className="rounded-lg border border-border bg-background p-3 text-sm"
          data-testid="generate-content-review-key-status"
        >
          {reviewItemQuery.isLoading ? (
            <p className="text-muted-foreground">Resolving {contentHandoff.reviewKey}…</p>
          ) : (
            <p className="text-red-300" data-testid="generate-content-review-key-error">
              {reviewItemQuery.data && isFailure(reviewItemQuery.data)
                ? reviewItemQuery.data.error
                : `Could not resolve ${contentHandoff.reviewKey}.`}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-8 text-sm"
            onClick={() => setContentHandoff(null)}
          >
            Close
          </Button>
        </div>
      ) : (
        <GenerateContentPanel
          questions={handoffQuestions}
          reviewItems={handoffReviewItems}
          onClose={() => setContentHandoff(null)}
          onDropBlocked={
            contentHandoff.kind === "selection" ? dropBlockedFromSelection : undefined
          }
        />
      )}
    </div>
  );


  const downloadExport = async () => {
    setExporting(true);
    try {
      const result = await quizApi.downloadReviewExport(exportScope);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = result.filename; anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.filename}`, { description: result.rowCount == null ? undefined : `${result.rowCount.toLocaleString()} rows` });
    } catch (error) {
      toast.error("Question export failed", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally { setExporting(false); }
  };

  const downloadUniverse = async () => {
    setExporting(true);
    try {
      const result = await quizApi.downloadReviewUniverseExport();
      const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.filename}`, { description: result.rowCount == null ? undefined : `${result.rowCount.toLocaleString()} source-explicit rows` });
    } catch (error) { toast.error("Universe export failed", { description: error instanceof Error ? error.message : "Unknown error" }); }
    finally { setExporting(false); }
  };

  const saveToPlaylist = () => {
    const selected = Array.from(checkedQuestions.values());
    const playlist: BroadcastPlaylist = {
      id: `review_${Date.now()}`,
      name: `Review Selection (${selected.length})`,
      createdAt: Date.now(),
      questions: selected.map(toQuizQuestion),
    };
    upsertPlaylist(playlist);
    toast.success(`Saved "${playlist.name}" to Broadcast Playlists`, {
      description: "Open Broadcast Studio → Saved Playlists tab to load it.",
    });
  };

  // Embedded in the unified admin workspace: the workspace owns SEOHead, the
  // breadcrumb, and sizing, so the internal top bar collapses to just the live
  // question count. Standalone, the full top bar and chrome are preserved.
  const rootClass = embedded
    ? "flex h-full min-h-0 flex-col overflow-hidden"
    : "flex h-[var(--app-viewport-h)] flex-col overflow-hidden";

  if (authError) {
    return (
      <div className={rootClass}>
        {!embedded && (
          <>
            <SEOHead title="Quiz Review Console · Admin" description="Inspect and curate quiz questions." path="/admin/quiz-review" />
            <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
              <Link to="/admin/quiz-broadcast" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />
                Broadcast Studio
              </Link>
              <span className="text-muted-foreground/40">/</span>
              <h1 className="text-sm font-semibold">Quiz Review Console</h1>
            </div>
          </>
        )}
        {embedded ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
            Admin authorization is required. Reload the workspace to re-check your session.
          </div>
        ) : (
          <AdminKeyPanel invalid={hasAdminKey} />
        )}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {!embedded && (
        <SEOHead title="Quiz Review Console · Admin" description="Inspect and curate quiz questions." path="/admin/quiz-review" />
      )}

      {/* ── PRIMARY TOOLBAR ──────────────────────────────────────────────
          One row. Find on the left, scope and export on the right.
          Search + Source + Status + More filters is the whole daily control
          set; the eleven remaining filters live behind More filters, and the
          permanent 240px column they used to occupy is gone — the question
          list inherited its width. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        {!embedded && (
          <>
            <h1 className="text-sm font-semibold">Quiz Review Console</h1>
            <span className="text-muted-foreground/40" aria-hidden>/</span>
          </>
        )}

        {!showUniverse && (
          <>
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder="Malphite, ultimate, slot:r, item name…"
                className="h-9 pl-9 text-sm"
              />
              {search && (
                <button
                  aria-label="Clear search"
                  onClick={() => { setSearch(""); setFilters((f) => ({ ...f, search: undefined, page: 1 })); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-9 text-sm" onClick={applySearch}>Search</Button>

            <Select
              value={filters.source_type ?? "__any__"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, page: 1, source_type: v === "__any__" ? undefined : v }))
              }
            >
              <SelectTrigger className="h-9 w-44 text-sm" aria-label="Source"><SelectValue placeholder="Any source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any source</SelectItem>
                {filterOptions?.source_types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={filters.review_status ?? "__any__"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, page: 1, review_status: v === "__any__" ? undefined : v }))
              }
            >
              <SelectTrigger className="h-9 w-40 text-sm" aria-label="Review status"><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any status</SelectItem>
                {REVIEW_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</SelectItem>)}
              </SelectContent>
            </Select>

            <MoreFilters filters={filters} onFilters={setFilters} filterOptions={filterOptions} />
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {/* A diagnostic focus is stated, not silent. An operator who lands
              here from Diagnostics must be able to see WHY the list is short
              and get back to the whole bank in one click. */}
          {focusFilters && (
            <span
              data-testid="review-focus-banner"
              className="inline-flex items-center gap-1.5 rounded border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Diagnostics: {focusLabel ?? "selection"}
              {focusFilters.ids !== undefined && ` (${focusFilters.ids.length})`}
              <button
                type="button"
                aria-label="Clear diagnostic filter"
                className="rounded-sm px-0.5 hover:bg-primary/20"
                onClick={() => {
                  setFilters({ page: 1, page_size: PAGE_SIZE });
                  onClearFocus?.();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}

          <Button
            size="sm"
            variant={showUniverse ? "secondary" : "ghost"}
            className="h-9 text-sm"
            onClick={() => setShowUniverse((value) => !value)}
          >
            {showUniverse ? "Stored review" : "All sources"}
          </Button>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="tabular-nums">{total.toLocaleString()} questions</span>
          )}

          {/* Export is a real capability but not a daily one — it keeps its
              full behaviour inside a disclosure instead of two permanent
              controls at the top of every session. */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground">
              <Download className="h-4 w-4" aria-hidden /> Export
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-64 space-y-2 rounded-lg border border-border bg-background p-3 shadow-xl">
              <Select value={exportScope} onValueChange={(value) => setExportScope(value as typeof exportScope)}>
                <SelectTrigger className="h-9 text-sm" aria-label="Question export mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Export All Questions</SelectItem>
                  <SelectItem value="changed">Export Changed Questions</SelectItem>
                  <SelectItem value="flagged">Export Flagged Questions</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 text-sm" disabled={exporting} onClick={downloadExport}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
              </Button>
              <Button size="sm" variant="ghost" className="h-9 w-full gap-1.5 text-sm" disabled={exporting} onClick={downloadUniverse}>
                <Download className="h-4 w-4" /> Export source universe
              </Button>
            </div>
          </details>
        </div>
      </div>

      {showUniverse && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto bg-background">
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
            <Select value={universeSource} onValueChange={setUniverseSource}>
              <SelectTrigger className="h-9 w-52 text-sm" aria-label="Source kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Every source</SelectItem>{Object.entries(SOURCE_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={universeMaterialization} onValueChange={setUniverseMaterialization}>
              <SelectTrigger className="h-9 w-48 text-sm" aria-label="Materialization"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Stored + generated</SelectItem><SelectItem value="stored">Stored only</SelectItem><SelectItem value="definition">Definitions</SelectItem><SelectItem value="code_generated">Code-generated</SelectItem><SelectItem value="deterministic_specimen">Specimens</SelectItem></SelectContent>
            </Select>
            <Input className="h-9 w-64 text-sm" value={universeSearch} onChange={(event) => setUniverseSearch(event.target.value)} placeholder="Filter family, key, or text…" />
            {universe.data && <div className="ml-auto text-xs text-muted-foreground">
              {universe.data.total.toLocaleString()} rows · schema {universe.data.provenance.schema_version} · baseline {universe.data.provenance.baseline_id.slice(0, 10)} · DB {universe.data.provenance.database.name}
            </div>}
          </div>
          <div className="grid grid-cols-[11rem_13rem_1fr_10rem] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>Source</span><span>Family</span><span>Review material</span><span>Status / version</span></div>
          {universe.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading review sources…</div>
            : universe.isError ? <div className="p-8 text-center text-sm text-red-400">Could not load the source universe.</div>
            : universe.data?.rows.map((row) => (
              <UniverseRow
                key={row.review_key}
                row={row}
                onGenerate={(reviewKey) => setContentHandoff({ kind: "review-key", reviewKey })}
              />
            ))}
          {!!universe.data?.provenance.collector_errors.length && <div className="m-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Some sources were unavailable: {universe.data.provenance.collector_errors.map((item) => item.source).join(", ")}</div>}
        </div>
        {contentHandoffColumn}
        </div>
      )}

      {/* Body — two columns, both allowed to be wide. */}
      {!showUniverse && <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Question list */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r">

          {/* Selection action bar — only shown when items are checked */}
          {checkedCount > 0 && (
            <div className="shrink-0 flex items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{checkedCount} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-sm"
                  data-testid="generate-content-open-selection"
                  onClick={() => setContentHandoff({ kind: "selection" })}
                >
                  <Terminal className="h-4 w-4" />
                  Generate Content ({checkedCount})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-sm"
                  onClick={saveToPlaylist}
                >
                  <Send className="h-4 w-4" />
                  Save to Broadcast Playlists
                </Button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {isError && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Failed to load questions
              </div>
            )}
            {!isLoading && questions.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">No questions match these filters.</p>
            )}
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                selected={selectedId === q.id}
                checked={checkedQuestions.has(q.id)}
                onClick={() => setSelectedId(selectedId === q.id ? null : q.id)}
                onCheck={toggleCheck}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="shrink-0 flex items-center justify-between border-t px-4 py-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-sm"
                disabled={page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">Page {page} / {pages}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-sm"
                disabled={page >= pages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right column — the Generate Content handoff when open, else detail.
            One column, not a third: the operator configures content where they
            were already reading the question, and Quiz Review does not become
            an export dashboard.

            Width is a viewport fraction with a floor and a ceiling, so the
            detail pane grows with the screen instead of staying at the 400px
            it was fixed to on a 1920px display. */}
        {contentHandoff !== null ? (
          contentHandoffColumn
        ) : selectedId !== null ? (
          <div className={`flex h-full shrink-0 flex-col overflow-hidden ${DETAIL_WIDTH}`}>
            <DetailPanel
              questionId={selectedId}
              onClose={() => setSelectedId(null)}
              onNavigate={navigate}
              canPrev={selectedIndex > 0}
              canNext={selectedIndex < questions.length - 1}
              onGenerateContent={(q) => setContentHandoff({ kind: "single", question: q })}
            />
          </div>
        ) : (
          <div className={`flex shrink-0 items-center justify-center px-6 text-center text-sm text-muted-foreground ${DETAIL_WIDTH}`}>
            Select a question to review it, preview it and decide what to do with it.
          </div>
        )}
      </div>}
    </div>
  );
}
