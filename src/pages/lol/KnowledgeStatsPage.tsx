import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, BarChart3, BookOpen, CheckCircle2, Database,
  ExternalLink, Filter, Info, RefreshCw, Search, ShieldCheck,
  Sparkles, UsersRound,
} from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_STATS_PATH,
  type EntityType,
  type ModeSummary,
  type KnowledgeStatsMode,
  useKnowledgeStats,
} from "@/lib/public-knowledge-stats/api";
import { entityHref } from "@/lib/public-knowledge-stats/entity-links";

const GOLD = "#d5b85a";

const MODE_LABEL: Record<KnowledgeStatsMode, string> = {
  practice: "Practice",
  time_trial: "Time Trial",
  daily_challenge: "Daily Challenge",
  role_challenge: "Role Challenge",
  ranked: "Ranked",
  journey: "Journeys",
};

const ENTITY_LABEL: Record<EntityType, string> = {
  champion: "Champions",
  item: "Items",
  rune: "Runes",
  summoner_spell: "Summoner Spells",
};

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function AccuracyBar({ value, eligible }: { value: number | null; eligible: boolean }) {
  const width = `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%`;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
      <div
        className={cn("h-full rounded-full", eligible ? "bg-emerald-400" : "bg-slate-500")}
        style={{ width }}
      />
    </div>
  );
}
function MetricCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof BarChart3;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1324]/80 p-4 shadow-[0_14px_45px_rgba(0,0,0,.18)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-[#d5b85a]" />
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
  );
}
function LoadingBoard() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading statistics">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
      ))}
    </div>
  );
}

export function ModeLedger({ modes }: { modes: ModeSummary[] }) {
  return (
    <section className="mt-6" aria-labelledby="mode-ledger-heading">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d5b85a]">All surfaces</div>
      <h2 id="mode-ledger-heading" className="mt-1 text-xl font-black text-white">Mode ledger</h2>
      <p className="mt-1 text-xs text-slate-400">Every mode stays visible, including empty and unavailable sources.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {modes.map((row) => (
          <div key={row.mode} className="rounded-xl border border-white/10 bg-[#0b1324]/80 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{MODE_LABEL[row.mode]}</div>
            {row.available ? (
              <>
                <div className="mt-2 text-xl font-black tabular-nums text-white">{number(row.answers)}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{percent(row.accuracy)} accuracy</div>
                <div className="mt-1 text-[10px] text-slate-500">{number(row.recorded_timeouts)} timeouts</div>
              </>
            ) : (
              <>
                <div className="mt-2 text-xs font-bold text-amber-300">Unavailable</div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500">No authoritative ledger</div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function KnowledgeStatsPage() {
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get("mode") as KnowledgeStatsMode | null;
  const mode = requestedMode && requestedMode in MODE_LABEL ? requestedMode : null;
  const [entityType, setEntityType] = useState<EntityType | "all">("all");
  const [query, setQuery] = useState("");
  const stats = useKnowledgeStats(mode);
  const allModes = useKnowledgeStats(null);
  const modeAuthority = allModes.data ?? (mode === null ? stats.data : undefined);

  const entities = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (stats.data?.entities ?? []).filter((row) =>
      (entityType === "all" || row.entity_type === entityType) &&
      (!needle || row.entity_key.toLocaleLowerCase().includes(needle)),
    );
  }, [entityType, query, stats.data?.entities]);

  const setMode = (next: KnowledgeStatsMode | null) => {
    const copy = new URLSearchParams(params);
    if (next) copy.set("mode", next);
    else copy.delete("mode");
    setParams(copy, { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <SEOHead
        title="Community Knowledge Stats — League of Legends | Mogzy"
        description="See what the Mogzy community knows best across Leaguecraft modes, with transparent answer counts, coverage, and sample sizes."
        path={KNOWLEDGE_STATS_PATH}
        keywords="League of Legends quiz statistics, champion knowledge stats, Mogzy community accuracy"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link to="/lol" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-[#d5b85a]">
          <ArrowLeft className="h-3.5 w-3.5" /> League hub
        </Link>

        <section className="relative mt-3 overflow-hidden rounded-3xl border border-[#d5b85a]/20 bg-[radial-gradient(circle_at_80%_0%,rgba(36,99,235,.22),transparent_38%),linear-gradient(135deg,#111b33,#07101f_60%,#090d18)] p-6 shadow-[0_28px_90px_rgba(0,0,0,.35)] sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-[#d5b85a]/15" />
          <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full border border-[#d5b85a]/20" />
          <div className="relative max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#d5b85a]">
              <Sparkles className="h-3.5 w-3.5" /> The community knowledge map
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              What does Mogzy know?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Real answers from Leaguecraft, resolved against the frozen subject each question tested.
              Counts stay beside accuracy, bots stay out, and small samples never become rankings.
            </p>
          </div>
        </section>

        <section className="mt-5" aria-labelledby="mode-filter-heading">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400" id="mode-filter-heading">
            <Filter className="h-3.5 w-3.5" /> Mode
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter statistics by mode">
            <button onClick={() => setMode(null)} className={cn(
              "shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition",
              mode === null ? "border-[#d5b85a]/60 bg-[#d5b85a]/15 text-[#f3dc8c]" : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20",
            )}>All modes</button>
            {(Object.keys(MODE_LABEL) as KnowledgeStatsMode[]).map((id) => {
              const row = modeAuthority?.modes.find((entry) => entry.mode === id);
              return (
                <button key={id} onClick={() => setMode(id)} disabled={row?.available === false}
                  title={row?.available === false ? "No authoritative ledger is deployed yet" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40",
                    mode === id ? "border-[#d5b85a]/60 bg-[#d5b85a]/15 text-[#f3dc8c]" : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20",
                  )}>
                  {MODE_LABEL[id]}{row && row.answers > 0 ? ` · ${number(row.answers)}` : ""}
                </button>
              );
            })}
          </div>
        </section>

        {stats.isLoading ? <LoadingBoard /> : stats.isError ? (
          <section className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-8 text-center">
            <Database className="mx-auto h-7 w-7 text-rose-300" />
            <h2 className="mt-3 text-lg font-bold text-white">The ledger is unavailable</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-400">No estimates are shown when the authoritative answer record cannot be read.</p>
            <Button variant="outline" className="mt-4 border-white/15 bg-transparent" onClick={() => void stats.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </section>
        ) : stats.data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Knowledge statistics overview">
              <MetricCard label="Human answers" value={number(stats.data.answer_totals.answers)} detail={`${number(stats.data.answer_totals.distinct_question_keys)} distinct frozen questions`} icon={UsersRound} />
              <MetricCard label="Accuracy" value={percent(stats.data.answer_totals.accuracy)} detail={`${number(stats.data.answer_totals.correct)} correct · ${number(stats.data.answer_totals.incorrect)} incorrect`} icon={CheckCircle2} />
              <MetricCard label="Entity coverage" value={percent(stats.data.attribution_totals.answer_coverage)} detail={`${number(stats.data.attribution_totals.attributed_answers)} answers safely attributed`} icon={ShieldCheck} />
              <MetricCard label="Entity signals" value={number(stats.data.attribution_totals.entity_attributions)} detail="Comparisons can credit more than one subject" icon={BarChart3} />
            </section>

            {stats.data.answer_totals.answers === 0 ? (
              <section className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                <BookOpen className="mx-auto h-7 w-7 text-slate-500" />
                <h2 className="mt-3 font-bold text-white">No recorded answers for this mode yet</h2>
                <p className="mt-1 text-sm text-slate-400">The page will fill itself from authoritative answers as people play.</p>
              </section>
            ) : null}

            {modeAuthority ? <ModeLedger modes={modeAuthority.modes} /> : null}

            <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d5b85a]">Discoveries</div>
                    <h2 className="mt-1 text-2xl font-black text-white">Knowledge by entity</h2>
                    <p className="mt-1 text-xs text-slate-400">Sorted by evidence volume. Accuracy is descriptive until the sample threshold is met.</p>
                  </div>
                  <div className="relative sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an entity…" aria-label="Find an entity" className="border-white/10 bg-[#0b1324] pl-9" />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by entity type">
                  <button onClick={() => setEntityType("all")} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", entityType === "all" ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/5")}>All</button>
                  {(Object.keys(ENTITY_LABEL) as EntityType[]).map((id) => (
                    <button key={id} onClick={() => setEntityType(id)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", entityType === id ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/5")}>{ENTITY_LABEL[id]}</button>
                  ))}
                </div>

                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#09111f]">
                  <div className="hidden grid-cols-[minmax(180px,1fr)_92px_92px_110px] gap-4 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:grid">
                    <span>Entity</span><span>Accuracy</span><span>Answers</span><span>Confidence</span>
                  </div>
                  {entities.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-slate-500">No safely attributed entities match this filter.</p>
                  ) : entities.map((row) => {
                    const href = entityHref(row);
                    const content = (
                      <>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-white">{row.entity_key}</span>
                            {href ? <ExternalLink className="h-3 w-3 shrink-0 text-slate-600" /> : null}
                          </div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">{ENTITY_LABEL[row.entity_type]} · {row.role.replace(/_/g, " ")}</div>
                        </div>
                        <div className="sm:text-left">
                          <div className="font-black tabular-nums text-white">{percent(row.accuracy)}</div>
                          <AccuracyBar value={row.accuracy} eligible={row.rank_eligible} />
                        </div>
                        <div className="tabular-nums text-slate-300"><span className="font-bold text-white">{number(row.answers)}</span><span className="ml-1 text-xs text-slate-500">answers</span></div>
                        <div><span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider", row.rank_eligible ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-slate-500/20 bg-slate-500/10 text-slate-400")}>{row.confidence}</span></div>
                      </>
                    );
                    const className = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[minmax(180px,1fr)_92px_92px_110px] sm:gap-4";
                    return href ? <Link key={`${row.entity_type}:${row.entity_key}:${row.role}`} to={href} className={className}>{content}</Link> : <div key={`${row.entity_type}:${row.entity_key}:${row.role}`} className={className}>{content}</div>;
                  })}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#0b1324] p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white"><Info className="h-4 w-4 text-[#d5b85a]" /> How to read this</div>
                  <ul className="mt-3 space-y-2.5 text-xs leading-5 text-slate-400">
                    <li><strong className="text-slate-200">Answer count first.</strong> A shiny percentage on a tiny sample is not a leaderboard.</li>
                    <li><strong className="text-slate-200">{stats.data.methodology.minimum_sample}+ answers</strong> are required before an entity is rank-eligible.</li>
                    <li><strong className="text-slate-200">Timeouts are separate.</strong> They are recorded events, not wrong answers.</li>
                    <li><strong className="text-slate-200">Coverage can be partial.</strong> Ambiguous historical subjects stay unattributed.</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1324] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Coverage ledger</div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Bot records removed</dt><dd className="font-bold tabular-nums text-white">{number(stats.data.coverage.excluded_bot_records)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Timeouts separated</dt><dd className="font-bold tabular-nums text-white">{number(stats.data.coverage.recorded_timeouts_excluded_from_accuracy)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Unsupported answers</dt><dd className="font-bold tabular-nums text-white">{number(stats.data.attribution_totals.unattributed_answers)}</dd></div>
                  </dl>
                  {stats.data.coverage.unavailable_sources.length ? (
                    <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-amber-200/80">
                      {stats.data.coverage.unavailable_sources.map((source) => <p key={source.mode}>{source.mode.replace(/_/g, " ")}: {source.reason}</p>)}
                    </div>
                  ) : null}
                </div>
              </aside>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
