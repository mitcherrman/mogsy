// ---------------------------------------------------------------------------
// Admin › Users › Questions — QI1 Question Intelligence.
//
// One row per canonical question ref, labelled A1, A2, … in the order of the
// current view. Hovering (or focusing) a row drives the side panel: the
// prompt, the ref the label stands for, served / answered, outcome rates, the
// DISPLAYED option grid (A1.1 top-left … A1.4 bottom-right) with where the
// correct answer sat and where wrong picks landed, and per-player repeats.
// Clicking a row pins it so the panel holds still while you read it.
//
// The data is the owner-only Railway read (lib/admin/questionIntelligence/
// api.ts); nothing here aggregates, it only lays the figures out.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Pin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import {
  fetchQuestionIntelligence,
  QI_COHORTS,
  QI_HOSTS,
  QI_SORTS,
  QuestionIntelligenceReadError,
  type QiFilters,
  type QiQuestion,
  type QuestionIntelligence,
} from "@/lib/admin/questionIntelligence/api";
import { describeOption, optionLabel, positionCell, questionLabel } from "@/lib/admin/questionIntelligence/notation";
import { defaultQiFilters, dominantOptionCount } from "@/lib/admin/questionIntelligence/view";
import { cn } from "@/lib/utils";

const HOST_LABELS: Record<QiFilters["host"], string> = {
  all: "All hosts", daily: "Daily child", ranked: "Standalone Ranked", other: "Other hosts",
};
const SORT_LABELS: Record<QiFilters["sort"], string> = {
  served: "Most served", incorrect_rate: "Most wrong", timeout_rate: "Most timeouts",
  correct_rate: "Hardest", repeats: "Most repeated", ref: "Ref A–Z",
};
const COHORT_LABELS: Record<QiFilters["cohort"], string> = {
  product: "Players", playtest: "Playtests", all: "Everything",
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

type Load = (filters: QiFilters, signal?: AbortSignal) => Promise<QuestionIntelligence>;
type State =
  | { s: "loading" }
  | { s: "ok"; data: QuestionIntelligence }
  | { s: "error"; kind: QuestionIntelligenceReadError["kind"] | "unknown"; message: string };

export function QuestionIntelligencePanel({
  load = fetchQuestionIntelligence,
  initialFilters,
}: {
  load?: Load;
  initialFilters?: QiFilters;
}) {
  const [draft, setDraft] = useState<QiFilters>(() => initialFilters ?? defaultQiFilters());
  const [filters, setFilters] = useState<QiFilters>(draft);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State>({ s: "loading" });
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ s: "loading" });
    load(filters, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setState({ s: "ok", data });
        setActive(0);
        setPinned(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState(
          err instanceof QuestionIntelligenceReadError
            ? { s: "error", kind: err.kind, message: err.message }
            : { s: "error", kind: "unknown", message: err instanceof Error ? err.message : "Could not read questions." },
        );
      });
    return () => ctrl.abort();
  }, [filters, nonce, load]);

  const apply = (patch: Partial<QiFilters> = {}) => setFilters({ ...draft, ...patch, offset: patch.offset ?? 0 });
  const page = state.s === "ok" ? state.data.page : null;
  const rows = state.s === "ok" ? state.data.questions : [];
  const focus = pinned ?? active;
  const selected = rows[focus] ?? null;
  const labelOf = useCallback((i: number) => questionLabel((page?.offset ?? 0) + i), [page]);

  return (
    <div className="space-y-4" data-testid="question-intelligence">
      <FilterBar
        draft={draft}
        onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onApply={() => apply()}
        onRefresh={() => setNonce((n) => n + 1)}
        busy={state.s === "loading"}
      />

      {state.s === "error" && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-400/40 bg-red-400/10 p-3 text-xs"
          data-testid="qi-error"
          data-kind={state.kind}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}
      {state.s === "loading" && (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground" data-testid="qi-loading">
          Reading per-question records…
        </p>
      )}

      {state.s === "ok" && (
        <>
          <Totals data={state.data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <AdminPanel
              title="Questions"
              description="A1 is a short label for the row's canonical ref in this view. Hover a row to read it; click to pin."
              testId="qi-table-panel"
            >
              <QuestionTable
                rows={rows}
                labelOf={labelOf}
                focus={focus}
                pinned={pinned}
                onHover={(i) => pinned === null && setActive(i)}
                onPin={(i) => setPinned((p) => (p === i ? null : i))}
              />
              {page && (
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground" data-testid="qi-pager">
                  <span>
                    {page.total === 0
                      ? "No questions"
                      : `${labelOf(0)}–${labelOf(rows.length - 1)} of ${page.total}`}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="sm" variant="outline" className="h-6 text-[11px]"
                      disabled={page.offset === 0}
                      onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - f.limit) }))}
                      data-testid="qi-prev"
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-6 text-[11px]"
                      disabled={page.nextOffset === null}
                      onClick={() => setFilters((f) => ({ ...f, offset: page.nextOffset ?? f.offset }))}
                      data-testid="qi-next"
                    >
                      Next
                    </Button>
                  </span>
                </div>
              )}
            </AdminPanel>
            <div className="lg:sticky lg:top-4 lg:self-start">
              {selected ? (
                <QuestionDetail question={selected} label={labelOf(focus)} pinned={pinned !== null} />
              ) : (
                <AdminPanel title="Question" testId="qi-detail-empty">
                  <p className="text-[11px] text-muted-foreground">No question matches these filters.</p>
                </AdminPanel>
              )}
            </div>
          </div>
          {state.data.limitations.length > 0 && (
            <details className="rounded-md border border-border bg-card/40 p-3 text-[11px] text-muted-foreground" data-testid="qi-limitations">
              <summary className="cursor-pointer font-medium text-foreground">What these numbers cannot show</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {state.data.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ filters

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const inputClass = "h-7 rounded-md border border-border bg-card px-2 text-[11px] normal-case tracking-normal text-foreground";

function FilterBar({
  draft,
  onDraft,
  onApply,
  onRefresh,
  busy,
}: {
  draft: QiFilters;
  onDraft: (patch: Partial<QiFilters>) => void;
  onApply: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card/40 p-3"
      data-testid="qi-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <Field label="From (UTC)">
        <input type="date" className={inputClass} value={draft.from} onChange={(e) => onDraft({ from: e.target.value })} data-testid="qi-from" />
      </Field>
      <Field label="To (UTC)">
        <input type="date" className={inputClass} value={draft.to} onChange={(e) => onDraft({ to: e.target.value })} data-testid="qi-to" />
      </Field>
      <Field label="Host">
        <select className={inputClass} value={draft.host} onChange={(e) => onDraft({ host: e.target.value as QiFilters["host"] })} data-testid="qi-host">
          {QI_HOSTS.map((h) => (
            <option key={h} value={h}>{HOST_LABELS[h]}</option>
          ))}
        </select>
      </Field>
      <Field label="Stage kind">
        <input className={cn(inputClass, "w-28")} placeholder="any" value={draft.stageKind} onChange={(e) => onDraft({ stageKind: e.target.value })} data-testid="qi-stage" />
      </Field>
      <Field label="Namespace">
        <input className={cn(inputClass, "w-24")} placeholder="quiz, mastery…" value={draft.namespace} onChange={(e) => onDraft({ namespace: e.target.value })} data-testid="qi-namespace" />
      </Field>
      <Field label="Family">
        <input className={cn(inputClass, "w-28")} placeholder="any" value={draft.family} onChange={(e) => onDraft({ family: e.target.value })} data-testid="qi-family" />
      </Field>
      <Field label="Min served">
        <input
          type="number" min={1} className={cn(inputClass, "w-16")} value={draft.minServed}
          onChange={(e) => onDraft({ minServed: Math.max(1, Number(e.target.value) || 1) })}
          data-testid="qi-min"
        />
      </Field>
      <Field label="Population">
        <select className={inputClass} value={draft.cohort} onChange={(e) => onDraft({ cohort: e.target.value as QiFilters["cohort"] })} data-testid="qi-cohort">
          {QI_COHORTS.map((c) => (
            <option key={c} value={c}>{COHORT_LABELS[c]}</option>
          ))}
        </select>
      </Field>
      <Field label="Sort">
        <select className={inputClass} value={draft.sort} onChange={(e) => onDraft({ sort: e.target.value as QiFilters["sort"] })} data-testid="qi-sort">
          {QI_SORTS.map((s) => (
            <option key={s} value={s}>{SORT_LABELS[s]}</option>
          ))}
        </select>
      </Field>
      <div className="ml-auto flex gap-1">
        <Button type="submit" size="sm" className="h-7 text-[11px]" data-testid="qi-apply">
          Apply
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onRefresh} disabled={busy} data-testid="qi-refresh">
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} aria-hidden /> Refresh
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ totals

function Totals({ data }: { data: QuestionIntelligence }) {
  const t = data.totals;
  const items: Array<[string, string, string]> = [
    ["served", "Served", t.served.toLocaleString()],
    ["answered", "Answered", t.answered.toLocaleString()],
    ["questions", "Distinct questions", t.questions.toLocaleString()],
    ["timeout", "Timeouts", t.timeout.toLocaleString()],
    ["repeats", `Player repeats (${t.repeats.lookbackDays}d)`, t.repeats.repeatVsPreviousDays.toLocaleString()],
    ["excluded", "Test matches excluded", t.excludedTestMatches.toLocaleString()],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="qi-totals">
      {items.map(([id, label, value]) => (
        <div key={id} className="rounded-md border border-border bg-muted/20 px-3 py-2" data-testid={`qi-total-${id}`}>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="text-base font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ table

function OutcomeBar({ q, className }: { q: QiQuestion; className?: string }) {
  const settled = q.correct + q.incorrect + q.timeout;
  if (!settled) return <div className={cn("h-1.5 rounded-full bg-muted", className)} />;
  const w = (n: number) => `${(n / settled) * 100}%`;
  return (
    <div className={cn("flex h-1.5 overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className="bg-emerald-500/80" style={{ width: w(q.correct) }} />
      <div className="bg-red-500/80" style={{ width: w(q.incorrect) }} />
      <div className="bg-amber-400/80" style={{ width: w(q.timeout) }} />
    </div>
  );
}

function QuestionTable({
  rows,
  labelOf,
  focus,
  pinned,
  onHover,
  onPin,
}: {
  rows: QiQuestion[];
  labelOf: (i: number) => string;
  focus: number;
  pinned: number | null;
  onHover: (i: number) => void;
  onPin: (i: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid="qi-table-empty">
        No question was served in this range with these filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]" data-testid="qi-table">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-2">Q</th>
            <th className="py-1 pr-2">Ref</th>
            <th className="py-1 pr-2 text-right">Served</th>
            <th className="py-1 pr-2 text-right">Answered</th>
            <th className="py-1 pr-2">Outcomes</th>
            <th className="py-1 pr-2 text-right">Wrong</th>
            <th className="py-1 pr-2 text-right">Timeout</th>
            <th className="py-1 pr-2 text-right" title="Daily child / standalone Ranked / other">D·R·O</th>
            <th className="py-1 text-right" title="Same player, previous days">Repeats</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => {
            const label = labelOf(i);
            const on = i === focus;
            return (
              <tr
                key={q.ref}
                tabIndex={0}
                aria-selected={on}
                data-testid={`qi-row-${label}`}
                data-active={on ? "true" : "false"}
                onMouseEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
                onClick={() => onPin(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPin(i);
                  }
                }}
                className={cn(
                  "cursor-pointer border-b border-border/50 outline-none transition-colors",
                  on ? "bg-primary/10" : "hover:bg-muted/40 focus-visible:bg-muted/40",
                )}
              >
                <td className="py-1.5 pr-2 font-mono font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {pinned === i && <Pin className="h-3 w-3 text-primary" aria-label="pinned" />}
                  </span>
                </td>
                <td className="max-w-[260px] truncate py-1.5 pr-2 font-mono text-muted-foreground" title={q.ref}>
                  {q.ref}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{q.served}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{q.answered}</td>
                <td className="w-24 py-1.5 pr-2">
                  <OutcomeBar q={q} />
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{pct(q.rates.incorrect)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{pct(q.rates.timeout)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                  {q.hosts.daily}·{q.hosts.ranked}·{q.hosts.other}
                </td>
                <td className="py-1.5 text-right tabular-nums">{q.repeats.repeatExposures || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ detail

function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function OptionGrid({ q, label }: { q: QiQuestion; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const optionCount = dominantOptionCount(q);
  const cells = useMemo(() => {
    const byPos = new Map(q.positions.byPosition.map((p) => [p.position, p]));
    const n = Math.max(optionCount, q.positions.byPosition.length);
    return Array.from({ length: n }, (_, k) => {
      const position = k + 1;
      return { position, cell: positionCell(position, optionCount), stats: byPos.get(position) };
    });
  }, [q, optionCount]);
  const wrongTotal = q.positions.byPosition.reduce((s, p) => s + p.pickedWrong, 0);

  if (cells.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground" data-testid="qi-grid-none">
        Not a pick-from-a-list question ({q.positions.nonPositionalExposures} exposures): no displayed positions.
      </p>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5" data-testid="qi-grid">
        {cells.map(({ position, cell, stats }) => {
          const wrong = stats?.pickedWrong ?? 0;
          const share = wrongTotal ? wrong / wrongTotal : 0;
          const name = optionLabel(label, position);
          return (
            <div
              key={position}
              data-testid={`qi-cell-${name}`}
              data-cell={cell.name ?? ""}
              data-active={hover === position ? "true" : "false"}
              onMouseEnter={() => setHover(position)}
              onMouseLeave={() => setHover(null)}
              title={describeOption(label, position, optionCount)}
              style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
              className={cn(
                "relative overflow-hidden rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                hover === position ? "border-primary" : "border-border",
              )}
            >
              <div className="absolute inset-y-0 left-0 bg-red-500/15" style={{ width: `${share * 100}%` }} aria-hidden />
              <div className="relative flex items-baseline justify-between gap-1">
                <span className="font-mono font-semibold">{name}</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{cell.name ?? ""}</span>
              </div>
              <div className="relative mt-0.5 tabular-nums">
                <span className="text-red-400">{wrong} wrong</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-emerald-400">{stats?.shownCorrect ?? 0} correct here</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground" data-testid="qi-grid-caption">
        {hover !== null
          ? `${describeOption(label, hover, optionCount)}: the ${hover === 1 ? "1st" : hover === 2 ? "2nd" : hover === 3 ? "3rd" : `${hover}th`} option as the player saw it.`
          : `Positions are the displayed order (randomized per round). ${q.positions.positionalExposures} positional exposures${q.positions.undecoded ? `, ${q.positions.undecoded} undecoded` : ""}.`}
      </p>
    </div>
  );
}

export function QuestionDetail({ question: q, label, pinned }: { question: QiQuestion; label: string; pinned: boolean }) {
  const stages = Object.entries(q.stageKinds);
  return (
    <AdminPanel
      title={`${label} · ${q.namespace || "question"}`}
      description={pinned ? "Pinned — click the row again to release." : "Following the hovered row."}
      testId="qi-detail"
    >
      <div className="space-y-3" data-ref={q.ref}>
        <div>
          <p className="text-sm leading-snug" data-testid="qi-detail-prompt">
            {q.prompt ?? <span className="text-muted-foreground">No prompt recorded for this ref.</span>}
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground" data-testid="qi-detail-ref">
            {q.ref}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {[q.family && `family ${q.family}`, q.modules.length && `module ${q.modules.join(", ")}`, q.firstDay && `${q.firstDay} → ${q.lastDay}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Served" value={q.served} testId="qi-detail-served" />
          <Stat label="Answered" value={q.answered} testId="qi-detail-answered" />
          <Stat label="Players" value={q.players} />
        </div>

        <div>
          <OutcomeBar q={q} className="h-2" />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums" data-testid="qi-detail-rates">
            <span className="text-emerald-400">{q.correct} correct · {pct(q.rates.correct)}</span>
            <span className="text-red-400">{q.incorrect} wrong · {pct(q.rates.incorrect)}</span>
            <span className="text-amber-400">{q.timeout} timeout · {pct(q.rates.timeout)}</span>
          </div>
          {q.unsettled > 0 && <p className="text-[10px] text-muted-foreground">{q.unsettled} served in rounds that never settled.</p>}
        </div>

        <div>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Displayed options</h3>
          <OptionGrid q={q} label={label} />
          {q.positions.wrongChoices.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground" data-testid="qi-wrong-choices">
              Most picked wrong: {q.positions.wrongChoices.map((w) => `${w.label} (${w.count})`).join(", ")}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Repeats · same player, previous {q.repeats.lookbackDays} days
          </h3>
          <div className="grid grid-cols-3 gap-1.5" data-testid="qi-detail-repeats">
            <Stat label="Repeat serves" value={q.repeats.repeatExposures} />
            <Stat label="Players repeated" value={q.repeats.repeatPlayers} />
            <Stat label="Max days, 1 player" value={q.repeats.maxDaysOnePlayer} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-[10px]" data-testid="qi-detail-hosts">
          <span className="rounded border border-border px-1.5 py-0.5">Daily {q.hosts.daily}</span>
          <span className="rounded border border-border px-1.5 py-0.5">Ranked {q.hosts.ranked}</span>
          <span className="rounded border border-border px-1.5 py-0.5">Other {q.hosts.other}</span>
          {stages.map(([k, v]) => (
            <span key={k} className="rounded border border-border bg-muted/30 px-1.5 py-0.5">
              {k} {v}
            </span>
          ))}
        </div>
      </div>
    </AdminPanel>
  );
}
