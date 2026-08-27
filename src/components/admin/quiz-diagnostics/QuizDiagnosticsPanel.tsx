// ---------------------------------------------------------------------------
// Diagnostics — quiz-system health, inside the Quiz Review workspace.
//
// This is a VIEW over the backend audit harness (the same one
// `./scripts/quiz_audit.sh` runs), not a second opinion about question
// quality. Every number below is computed by that harness, which delegates each
// rule to the module that owns it; nothing is re-judged here. The CLI remains
// the engineering fallback — this is the normal owner workflow.
//
// The organising rule is that a count is a DESTINATION, not a decoration.
// Anything the harness can tie to question rows renders as a button that
// switches to Quiz Review already filtered to exactly those rows, so there is
// no card the operator can read and then be unable to act on.
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Database, Download, FlaskConical,
  GitBranch, Info, Loader2, Package, RefreshCw, Sparkles, Users, Wrench,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  quizApi,
  type AuditGroup,
  type AuditTarget,
  type DbDriftReport,
  type QuizAuditReport,
  type ReviewFilters,
} from "@/lib/quiz/api";

/** A diagnostic target, translated into the Quiz Review filter that shows it. */
export function targetToFilters(target: AuditTarget): ReviewFilters | null {
  switch (target.kind) {
    case "ids":
      // Sent even when empty — an empty selection means "no rows", and the
      // backend treats a supplied-but-empty `ids` as exactly that.
      return { ids: target.ids, page: 1 };
    case "family":
      return target.family ? { family: target.family, page: 1 } : null;
    case "search":
      return target.search ? { search: target.search, page: 1 } : null;
    default:
      return null;
  }
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-400/50 bg-red-400/10 text-red-200",
  warn: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
};

function num(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

/* -------------------------------------------------------------------------- */
/* Presentational primitives                                                  */
/* -------------------------------------------------------------------------- */

function Section({
  title, icon: Icon, children, note,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
        {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** A number that is also a link, when the harness can say where it points. */
function Stat({
  label, value, tone = "default", onOpen, openLabel,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "bad" | "good";
  onOpen?: () => void;
  openLabel?: string;
}) {
  const toneClass =
    tone === "bad" ? "text-red-300" : tone === "good" ? "text-emerald-300" : "";
  const body = (
    <>
      <div className={`text-lg font-semibold leading-tight ${toneClass}`}>{value}</div>
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
    </>
  );
  if (!onOpen) {
    return <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel ?? `Open ${label} in Quiz Review`}
      className="group rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/10"
    >
      {body}
      <span className="mt-0.5 flex items-center gap-0.5 text-[9px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open in Review <ChevronRight className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

/** One finding group: a headline count, and where it goes. */
function GroupRow({
  group, onOpen,
}: {
  group: AuditGroup;
  onOpen: (target: AuditTarget, label: string) => void;
}) {
  const filters = targetToFilters(group.target);
  const clickable = filters !== null;
  // "10 defects" over 8 distinct questions is normal (a row can fail two
  // gates). Saying so is better than a card that opens fewer rows than its
  // own number without explanation.
  const rowNote =
    group.target.kind === "ids" && group.target.matched !== group.count
      ? `${num(group.target.matched)} question${group.target.matched === 1 ? "" : "s"}`
      : null;

  return (
    <div
      data-testid={`diag-group-${group.id}`}
      className={`rounded-md border px-3 py-2 ${SEVERITY_STYLE[group.severity] ?? SEVERITY_STYLE.info}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold tabular-nums">{num(group.count)}</span>
            <span className="text-xs font-medium">{group.label}</span>
            {rowNote && (
              <span className="text-[10px] opacity-70">→ {rowNote}</span>
            )}
          </div>
          {group.detail && (
            <p className="mt-0.5 truncate text-[10px] opacity-70" title={group.detail}>
              {group.detail}
            </p>
          )}
          {group.target.truncated && (
            <p className="mt-0.5 text-[10px] opacity-70">
              Showing the first {num(group.target.ids.length)} — export the CSV for the full list.
            </p>
          )}
        </div>
        {clickable && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 gap-1 border-current/30 bg-background/40 text-[10px]"
            onClick={() => onOpen(group.target, group.label)}
          >
            Review <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Findings that name an ITEM rather than a question: each item is still
          a destination, via Quiz Review's metadata search. */}
      {group.chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {group.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              title={chip.detail}
              onClick={() => onOpen(chip.target, chip.label)}
              className="rounded border border-current/30 bg-background/40 px-1.5 py-0.5 text-[10px] transition-colors hover:bg-background/80"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local vs production alignment                                              */
/* -------------------------------------------------------------------------- */

/**
 * Is this deployment's canonical database aligned with production?
 *
 * Answers the question that used to need manual archaeology ("is local a
 * champion behind?" — it once was, and stayed that way unnoticed). Neither
 * database is copied: each side reduces itself to a few kilobytes of counts,
 * names and digests, and only those are compared.
 *
 * `gated` and `unreachable` are rendered as their own state, never as MATCH —
 * a check that could not read production must not look like a passing one.
 */
function DbAlignmentCard() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<DbDriftReport>({
      queryKey: ["quiz-db-drift"],
      queryFn: () => quizApi.getDbDrift(),
      staleTime: Infinity,
      retry: false,
    });

  const status = data?.status;
  const aligned = status === "MATCH";
  const blocked = status === "gated" || status === "unreachable";
  const tone = aligned
    ? "border-emerald-400/50 bg-emerald-400/10"
    : blocked
      ? "border-border/60 bg-muted/20"
      : "border-amber-400/50 bg-amber-400/10";

  return (
    <Section title="Local vs production" icon={ServerCog}>
      <div className={`rounded-md border p-3 ${isError ? "border-red-400/50 bg-red-400/10" : tone}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLoading || isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : aligned ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <AlertTriangle className={`h-4 w-4 ${blocked ? "text-muted-foreground" : "text-amber-300"}`} />
            )}
            <div>
              <div className="text-xs font-semibold" data-testid="db-drift-status">
                {isError
                  ? "Alignment check failed"
                  : isLoading
                    ? "Checking…"
                    : `LOCAL vs PRODUCTION: ${status ?? "unknown"}`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isError
                  ? (error instanceof Error ? error.message : "Could not run the check.")
                  : data?.reason
                    ? data.reason
                    : data
                      ? `${data.local_source ?? "local"} ${data.local_roster ?? "?"} champions · ${data.remote_source ?? "production"} ${data.remote_roster ?? "?"}`
                      : ""}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3 w-3" /> Check alignment
          </Button>
        </div>

        {!!data?.differences?.length && (
          <ul className="mt-2 space-y-1" data-testid="db-drift-differences">
            {data.differences.map((d, i) => (
              <li key={`${d.area}-${i}`} className="text-[10px] leading-relaxed">
                <span className="font-semibold">{d.area}:</span> {d.detail}
                {!!d.missing_locally?.length && (
                  <div className="pl-3 text-red-300">
                    missing locally: {d.missing_locally.join(", ")}
                  </div>
                )}
                {!!d.missing_remotely?.length && (
                  <div className="pl-3 text-amber-300">
                    missing remotely: {d.missing_remotely.join(", ")}
                  </div>
                )}
                {d.families?.slice(0, 8).map((f) => (
                  <div key={f.family} className="pl-3 text-muted-foreground">
                    {f.family}: local {num(f.local)}, production {num(f.remote)}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}

        {blocked && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Engineering fallback, no key on this machine:{" "}
            <code>./scripts/db_drift.sh --local-only &gt; local.json</code>, fetch
            production&rsquo;s fingerprint from a trusted shell, then{" "}
            <code>./scripts/db_drift.sh --remote-file prod.json</code>.
          </p>
        )}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export type QuizDiagnosticsPanelProps = {
  /** Switch to Quiz Review, filtered to what the operator clicked. */
  onOpenInReview: (filters: ReviewFilters, label: string) => void;
};

export function QuizDiagnosticsPanel({ onOpenInReview }: QuizDiagnosticsPanelProps) {
  const queryClient = useQueryClient();
  const [withTests, setWithTests] = useState(false);
  const [withBaseline, setWithBaseline] = useState(false);
  const [exporting, setExporting] = useState(false);

  // The mount read is cached server-side; only Run Audit re-runs the harness.
  const { data, isLoading, isError, error } = useQuery<QuizAuditReport>({
    queryKey: ["quiz-audit", withTests, withBaseline],
    queryFn: () => quizApi.getQuizAudit({ tests: withTests, baseline: withBaseline }),
    staleTime: Infinity,
    retry: false,
  });

  const runAudit = useMutation({
    mutationFn: () =>
      quizApi.getQuizAudit({ refresh: true, tests: withTests, baseline: withBaseline }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["quiz-audit", withTests, withBaseline], fresh);
      toast.success(
        `Audit complete — ${fresh.status}`,
        { description: `${num(fresh.summary.questions_audited)} questions in ${fresh.elapsed_seconds ?? "?"}s` },
      );
    },
    onError: (err: unknown) =>
      toast.error("Audit failed", { description: err instanceof Error ? err.message : String(err) }),
  });

  const open = useCallback(
    (target: AuditTarget, label: string) => {
      const filters = targetToFilters(target);
      if (filters) onOpenInReview(filters, label);
    },
    [onOpenInReview],
  );

  const exportFlagged = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await quizApi.downloadAuditFlaggedCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading diagnostics" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6" data-testid="diagnostics-error">
        <div className="mx-auto max-w-md space-y-3 rounded-lg border border-red-400/40 bg-red-400/10 p-5 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-red-300" />
          <p className="text-xs text-red-200">
            {error instanceof Error ? error.message : "Could not load the quiz audit."}
          </p>
          <Button size="sm" className="h-7 text-[11px]" onClick={() => runAudit.mutate()}>
            Run Audit
          </Button>
        </div>
      </div>
    );
  }

  const s = data.summary;
  const passing = data.status === "PASS";
  const groups = data.groups;

  // Every group is rendered EXACTLY once. The critical list at the top is the
  // whole point of the page, so it claims its groups first; the domain
  // sections below then show only what the top list did not already show, and
  // "Lower severity" sweeps up the remainder. Without this a warn-level
  // realism finding appeared under Realism AND under Lower severity, and a
  // critical drift finding appeared at the top AND under Reconstruction —
  // duplicate cards that read as duplicate problems.
  const claimed = new Set<string>();
  const claim = (list: AuditGroup[]) => {
    const fresh = list.filter((g) => !claimed.has(g.id));
    fresh.forEach((g) => claimed.add(g.id));
    return fresh;
  };
  const critical = claim(groups.filter((g) => g.severity === "critical"));
  const realismGroups = claim(groups.filter((g) => g.section === "realism"));
  const refreshGroups = claim(
    groups.filter((g) => g.section === "reconstruction" || g.section === "refresh"),
  );
  const baselineGroups = claim(groups.filter((g) => g.section === "baseline"));
  const rest = claim(groups);
  const gen = data.sections.generator ?? {};
  const tests = data.sections.tests ?? {};
  const families = data.sections.families ?? {};
  const bank = data.sections.bank ?? {};
  const recon = data.sections.reconstruction ?? {};
  const refresh = data.sections.refresh ?? {};
  const realism = data.sections.realism ?? {};
  const items = data.sections.items ?? {};
  const running = runAudit.isPending;

  return (
    <div className="h-full space-y-5 overflow-y-auto px-4 py-4" data-testid="quiz-diagnostics">
      {/* ---- A. Overall status + actions ---------------------------------- */}
      <div
        className={`rounded-lg border p-3 ${
          passing ? "border-emerald-400/50 bg-emerald-400/10" : "border-amber-400/50 bg-amber-400/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {passing ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-300" />
            )}
            <div>
              <div
                className={`text-sm font-semibold ${passing ? "text-emerald-200" : "text-amber-200"}`}
                data-testid="audit-status"
              >
                {data.status}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {data.generated_at
                  ? `Audited ${new Date(data.generated_at).toLocaleString()}`
                  : "Not yet run"}
                {data.cached ? " · cached" : ""}
                {typeof data.elapsed_seconds === "number" ? ` · ${data.elapsed_seconds}s` : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={withTests}
                onChange={(e) => setWithTests(e.target.checked)}
              />
              Tests
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={withBaseline}
                onChange={(e) => setWithBaseline(e.target.checked)}
              />
              vs master
            </label>
            <Button
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={running}
              onClick={() => runAudit.mutate()}
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Run Audit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={!groups.some((g) => targetToFilters(g.target))}
              onClick={() => {
                // The worst thing with somewhere to go — `groups` is already
                // ordered worst-first by the backend.
                const first = groups.find((g) => targetToFilters(g.target));
                if (first) open(first.target, first.label);
              }}
            >
              <Wrench className="h-3 w-3" /> Review Flagged
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={exporting}
              onClick={exportFlagged}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export Flagged CSV
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Database className="h-3 w-3" /> {data.database.name}
          </span>
          {data.revision && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> {data.revision.slice(0, 12)}
            </span>
          )}
          <span>{num(data.findings_total)} findings</span>
          <span>{data.tests_ran ? "tests run" : "tests skipped"}</span>
          <span>{data.baseline_ran ? "baseline compared" : "no baseline"}</span>
        </div>
        {data.baseline_error && (
          <p className="mt-1 text-[10px] text-amber-300">
            Baseline unavailable — {data.baseline_error}. This is not "no regressions".
          </p>
        )}
      </div>

      {/* ---- Local vs production alignment --------------------------------- */}
      <DbAlignmentCard />

      {/* ---- The problems, worst first ------------------------------------ */}
      {critical.length > 0 && (
        <Section title="Needs attention" icon={AlertTriangle}>
          <div className="space-y-1.5">
            {critical.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={open} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- B. Roster / data health -------------------------------------- */}
      <Section
        title="Roster & data health"
        icon={Users}
        note={s.expected_roster_source ? `expected from ${s.expected_roster_source}` : undefined}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="DB / expected roster"
            value={`${num(s.database_roster_count)}/${num(s.expected_roster_count)}`}
            tone={s.roster_complete ? "good" : "bad"}
          />
          <Stat
            label="Missing champions"
            value={num(s.roster_missing_from_database.length)}
            tone={s.roster_missing_from_database.length ? "bad" : "default"}
          />
          <Stat
            label="Unresolved champions"
            value={num(data.sections.champions?.unresolved?.length ?? 0)}
            tone={(data.sections.champions?.unresolved?.length ?? 0) ? "bad" : "default"}
          />
          <Stat label="Items referenced" value={num(items.items_referenced)} />
          <Stat
            label="Invalid items"
            value={num(s.invalid_items)}
            tone={s.invalid_items ? "bad" : "default"}
          />
          <Stat
            label="Retired items in play"
            value={num(items.retired_items?.length ?? 0)}
            tone={(items.retired_items?.length ?? 0) ? "bad" : "default"}
          />
          <Stat
            label="Questions on retired items"
            value={num(s.retired_item_references)}
            tone={s.retired_item_references ? "bad" : "default"}
          />
          <Stat
            label="Item authority defects"
            value={num(Object.values(items.authority_findings ?? {}).reduce((a, b) => a + b, 0))}
            onOpen={() => {
              const g = groups.find((x) => x.id === "items:authority");
              if (g) open(g.target, g.label);
            }}
          />
        </div>
        {s.roster_missing_from_database.length > 0 && (
          <p className="text-[10px] text-red-300">
            Missing: {s.roster_missing_from_database.join(", ")}
          </p>
        )}
      </Section>

      {/* ---- C. Question-bank health -------------------------------------- */}
      <Section title="Question bank" icon={Sparkles}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Questions audited" value={num(s.questions_audited)} />
          <Stat
            label="Suspicious questions"
            value={num(s.suspicious_questions)}
            tone={s.suspicious_questions ? "bad" : "good"}
          />
          <Stat
            label="Live answer defects"
            value={num(bank.live_answer_defects)}
            tone={bank.live_answer_defects ? "bad" : "good"}
            onOpen={() => {
              const g = groups.find((x) => x.id === "bank:live_answer_defects");
              if (g) open(g.target, g.label);
            }}
          />
          <Stat label="Lower-severity backlog" value={num(s.review_backlog)} />
          <Stat label="Families declared" value={num(families.families)} />
          <Stat label="Active families" value={num(families.active_families)} />
          <Stat
            label="Unregenerable families"
            value={num(families.unregenerable?.length ?? 0)}
          />
          <Stat
            label="Families needing review"
            value={num(s.families_needing_review.length)}
            tone={s.families_needing_review.length ? "bad" : "good"}
          />
        </div>
        {s.families_needing_review.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {s.families_needing_review.map((family) => (
              <button
                key={family}
                type="button"
                onClick={() => onOpenInReview({ family, page: 1 }, `family ${family}`)}
                className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200 transition-colors hover:bg-amber-400/20"
              >
                {family}
              </button>
            ))}
          </div>
        )}
        {Object.keys(bank.gates ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(bank.gates ?? {}).map(([gate, count]) => {
              const g = groups.find((x) => x.id === `bank:gate:${gate}`);
              return (
                <button
                  key={gate}
                  type="button"
                  disabled={!g}
                  onClick={() => g && open(g.target, g.label)}
                  className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] transition-colors enabled:hover:border-primary/60 enabled:hover:bg-primary/10 disabled:opacity-60"
                >
                  {gate.replace(/_/g, " ")} <span className="font-semibold">{num(count)}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* ---- D. Realism health -------------------------------------------- */}
      <Section
        title="Realism"
        icon={FlaskConical}
        note={realism.checked_family ? `family ${realism.checked_family}` : undefined}
      >
        {(realism.total ?? 0) === 0 ? (
          <p className="text-[10px] text-muted-foreground">No realism violations.</p>
        ) : realismGroups.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {num(realism.total)} violation(s) — listed under “Needs attention”.
          </p>
        ) : (
          <div className="space-y-1.5">
            {realismGroups.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={open} />
            ))}
          </div>
        )}
      </Section>

      {/* ---- E. Refresh / reconstruction health ---------------------------- */}
      <Section title="Refresh & reconstruction" icon={RefreshCw}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Rebuilt from metadata" value={`${num(recon.reconstructed)}/${num(recon.checked)}`} />
          <Stat
            label="Reconstruction failures"
            value={num(recon.total_failures)}
            tone={recon.total_failures ? "bad" : "good"}
          />
          <Stat
            label="Refresh backlog"
            value={num(refresh.affected)}
            tone={refresh.affected ? "bad" : "good"}
          />
          <Stat
            label="Would be retired / skipped"
            value={num(
              Object.entries(refresh.by_reason ?? {})
                .filter(([k]) => k.startsWith("skip:"))
                .reduce((a, [, v]) => a + v, 0),
            )}
          />
        </div>
        {refreshGroups.length > 0 && (
          <div className="space-y-1.5">
            {refreshGroups.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={open} />
            ))}
          </div>
        )}
      </Section>

      {/* ---- F. Generator health ------------------------------------------ */}
      <Section title="Generator" icon={Package}>
        {gen.ran ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Would create" value={num(gen.would_create)} />
              <Stat label="Already present" value={num(gen.already_present)} />
              <Stat label="Skipped" value={num(gen.skipped_total)} />
              <Stat label="Dry run" value="OK" tone="good" />
            </div>
            {Object.keys(gen.skipped_by_reason ?? {}).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(gen.skipped_by_reason ?? {}).map(([reason, count]) => (
                  <span
                    key={reason}
                    className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {reason.replace(/_/g, " ")} <span className="font-semibold">{num(count)}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[10px] text-red-300">
            Generator dry run failed: {gen.error ?? "unknown error"}
          </p>
        )}
      </Section>

      {/* ---- G. Regression health ------------------------------------------ */}
      <Section title="Regressions vs clean master" icon={GitBranch}>
        {!data.baseline_ran ? (
          <p className="text-[10px] text-muted-foreground">
            Not compared. Tick “vs master” and run the audit to diff this checkout
            against a clean origin/master worktree.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="New vs master"
                value={num(data.baseline?.new_count)}
                tone={data.baseline?.new_count ? "bad" : "good"}
              />
              <Stat label="New criticals" value={num(data.baseline?.new_critical)} />
              <Stat label="No longer reported" value={num(data.baseline?.fixed_count)} tone="good" />
              <Stat label="Baseline" value={(data.baseline?.rev ?? "master").slice(0, 12)} />
            </div>
            {baselineGroups.length > 0 && (
              <div className="space-y-1.5">
                {baselineGroups.map((g) => (
                  <GroupRow key={g.id} group={g} onOpen={open} />
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {/* ---- Test slice ---------------------------------------------------- */}
      <Section title="Quiz test slice" icon={FlaskConical}>
        {tests.ran ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(tests.counts ?? {}).map(([outcome, count]) => (
              <span
                key={outcome}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  outcome === "failed" || outcome === "errors"
                    ? "border-red-400/50 bg-red-400/10 text-red-200"
                    : "border-border/60 bg-muted/30 text-muted-foreground"
                }`}
              >
                {outcome} <span className="font-semibold">{num(count)}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Not run ({tests.reason ?? "skipped"}). Tick “Tests” and run the audit to include it.
          </p>
        )}
      </Section>

      {/* ---- Everything else ------------------------------------------------ */}
      {rest.length > 0 && (
        <Section title="Lower severity" icon={Info}>
          <div className="space-y-1.5">
            {rest.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={open} />
            ))}
          </div>
        </Section>
      )}

      <p className="pb-4 text-[10px] leading-relaxed text-muted-foreground">
        Read-only. Every verdict comes from the backend quiz-audit harness (the same
        one <code>./scripts/quiz_audit.sh</code> runs); this page never regenerates,
        promotes, repairs or deletes a question.
      </p>
    </div>
  );
}

export default QuizDiagnosticsPanel;
