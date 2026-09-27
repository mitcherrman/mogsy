/**
 * HUB6.3E — "how do I compare with other Mogzy players?", from HUB6.3C's
 * aggregates only.
 *
 * WHAT IS SHOWN
 * ─────────────
 *   * the player's own value, their midrank percentile, the median and the
 *     number of players in the cohort — always together, in text too;
 *   * one prominent histogram per surface (metric tabs, never three giant
 *     charts), with the "You" marker and the median;
 *   * compact dials for the secondary metrics;
 *   * the three-mode profile (Standard score, Time Trial correct, Survival
 *     depth) and the server's `strongest_mode` — never recomputed, and never
 *     named when the server names none.
 *
 * WHAT IS NEVER SHOWN: a leaderboard, a rank, another player's value, or a
 * percentile standing in for "not enough players" (the cohort's reason is
 * printed instead).
 *
 * COHORT: HUB6.3C's primary cohort is the rolling 28 days (the default);
 * the same-day cohort is additional. One choice per expanded Daily
 * (`CohortProvider`) made in ONE place (`CohortBar`, HUB6.3G), so every
 * population surface reads the same cohort and none carries its own toggle.
 */
import { createContext, useContext, useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { stageTone } from "@/components/quiz/workspace/stageTheme";
import { planDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import type { DailyHistoryRecord } from "@/lib/history/contracts";
import {
  COHORT_TYPES,
  PRIMARY_COHORT,
  cohortOf,
  strongestFor,
  type CohortType,
  type PopulationCohort,
  type PopulationSubjectBlock,
} from "@/lib/history/population";
import { useReveal } from "@/lib/motion/useReveal";
import { CHART } from "./ink";
import {
  COHORT_LABEL,
  METRIC_LABEL,
  PRIMARY_PHRASE,
  cohortLine,
  cohortReason,
  isFraction,
  metricValue,
  ordinal,
  percentileLabel,
  percentileNumber,
  runPopulationReason,
  strongestReason,
} from "./copy";
import { Distribution, Panel, PercentileDial, Segmented } from "./charts";
import { CORE_KINDS } from "./derive";

// ─────────────────────────────────────────────────────────── cohort choice

interface CohortState {
  type: CohortType;
  setType: (t: CohortType) => void;
}

const CohortContext = createContext<CohortState>({ type: PRIMARY_COHORT, setType: () => {} });

export function CohortProvider({ children }: { children: React.ReactNode }) {
  const [type, setType] = useState<CohortType>(PRIMARY_COHORT);
  const value = useMemo(() => ({ type, setType }), [type]);
  return <CohortContext.Provider value={value}>{children}</CohortContext.Provider>;
}

export function useCohort(): CohortState {
  return useContext(CohortContext);
}

/** The cohorts any of these blocks carries, in the fixed order (primary
 *  first). */
export function cohortsIn(blocks: Array<PopulationSubjectBlock | null | undefined>): CohortType[] {
  return COHORT_TYPES.filter((t) => blocks.some((b) => cohortOf(b, t)));
}

/**
 * HUB6.3G — THE cohort selector: exactly one per expanded Daily, above its
 * analytics region, shown only while the view has a population with more
 * than one cohort. Every population surface (the Overview's mode profile,
 * strongest mode and Core distribution; each core stage's distribution,
 * dials and streak percentile) reads this one choice, and the choice
 * survives switching between the Overview and the stages (`CohortProvider`
 * is the region's, not the view's). The default is the rolling 28 days.
 */
export function CohortBar({ blocks }: { blocks: Array<PopulationSubjectBlock | null | undefined> }) {
  const { type, setType } = useCohort();
  const present = cohortsIn(blocks);
  if (present.length < 2) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1" data-testid="cohort-bar">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
        Compare with Mogzy players from
      </span>
      <Segmented
        label="Compare with Mogzy players from"
        options={present.map((t) => ({ id: t, label: COHORT_LABEL[t] ?? t }))}
        value={present.includes(type) ? type : PRIMARY_COHORT}
        onChange={(t) => setType(t as CohortType)}
        testId="cohort-toggle"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────── one subject

/** Your value · percentile · median · players, in one sentence — the
 *  accessible (and printed) statement every distribution carries. */
export function populationSentence(metric: string, cohort: PopulationCohort): string {
  const m = cohort.metrics[metric];
  if (!m || m.percentile === null) return cohortReason(cohort);
  const parts = [
    `You: ${metricValue(metric, m.value)}`,
    percentileLabel(m.percentile),
    m.median !== null ? `median ${metricValue(metric, m.median)}` : null,
    cohort.users !== null ? `${cohort.users.toLocaleString("en-US")} players` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function Stat({ label, value, testId, strong = false }: { label: string; value: React.ReactNode; testId?: string; strong?: boolean }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: LEAGUECRAFT_INK.faint }}>{label}</div>
      <div className={`${strong ? "text-[20px]" : "text-[15px]"} font-black leading-tight tabular-nums`} style={{ color: strong ? CHART.current : LEAGUECRAFT_INK.strong }}>
        {value}
      </div>
    </div>
  );
}

/**
 * A subject's population: one histogram (metric tabs), the four facts beside
 * it, and compact dials for the other metrics. Falls back to the cohort's
 * factual reason. Null block (Free, older payload): nothing.
 */
export function PopulationPanel({
  block,
  metrics,
  title,
  eyebrow,
  dials = true,
  testId,
  accent = CHART.ink,
}: {
  block: PopulationSubjectBlock | null;
  /** Metric tabs, primary first. */
  metrics: string[];
  title: string;
  eyebrow?: string;
  dials?: boolean;
  testId?: string;
  accent?: string;
}) {
  const { type } = useCohort();
  const [metric, setMetric] = useState(metrics[0]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1200, delayMs: 100 });
  if (!block) return null;
  const chosen = cohortOf(block, type);
  const cohort = chosen ?? cohortOf(block, PRIMARY_COHORT);
  const fellBack = !chosen && !!cohort && type !== PRIMARY_COHORT;
  const available = cohort?.status === "available";
  const m = cohort?.metrics[metric];
  const format = (v: number) => metricValue(metric, v);
  const others = metrics.filter((x) => x !== metric);
  return (
    <Panel
      title={title}
      eyebrow={eyebrow ?? `Mogzy players · ${COHORT_LABEL[cohort?.type ?? PRIMARY_COHORT] ?? ""}`}
      testId={testId ?? "population-panel"}
    >
      <div ref={reveal.ref} className="min-w-0" data-cohort={cohort?.type} data-status={cohort?.status ?? "none"}>
        {fellBack && (
          <p className="mb-2 text-[10.5px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="population-cohort-fallback">
            {COHORT_LABEL[type] ?? "That"} comparison isn't available here — showing {(COHORT_LABEL[PRIMARY_COHORT] ?? "").toLowerCase()}.
          </p>
        )}
        {metrics.length > 1 && (
          <div className="mb-2.5">
            <Segmented
              label="Metric"
              options={metrics.map((x) => ({ id: x, label: METRIC_LABEL[x] ?? x }))}
              value={metric}
              onChange={setMetric}
              testId="population-metric"
            />
          </div>
        )}
        {available && m && m.histogram && m.percentile !== null ? (
          <div className="grid min-w-0 gap-x-5 gap-y-3 [@container(min-width:34rem)]:grid-cols-[minmax(0,1.6fr)_minmax(9rem,1fr)]">
            <Distribution
              histogram={m.histogram}
              value={m.value}
              median={m.median}
              percentile={m.percentile}
              format={format}
              progress={reveal.progress}
              title={`${METRIC_LABEL[metric] ?? metric} across Mogzy players`}
              testId="population-distribution"
            />
            <div className="grid content-start gap-2.5">
              <p className="sr-only" data-testid="population-sentence">{populationSentence(metric, cohort!)}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2" aria-hidden="true">
                <Stat label="You" value={format(m.value ?? 0)} testId="population-you" strong />
                <Stat label="Percentile" value={ordinal(percentileNumber(m.percentile))} testId="population-percentile" strong />
                <Stat label="Median" value={m.median === null ? "—" : format(m.median)} testId="population-median" />
                <Stat label="Players" value={(cohort!.users ?? 0).toLocaleString("en-US")} testId="population-users" />
              </div>
              <p className="text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="population-cohort">
                {cohortLine(cohort!, planDateLabel)}
              </p>
            </div>
          </div>
        ) : (
          <PopulationReason cohort={cohort} metric={metric} />
        )}
        {dials && available && others.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t pt-2.5" style={{ borderColor: "rgba(96,68,28,0.16)" }}>
            {others.map((x) => {
              const mm = cohort!.metrics[x];
              return (
                <PercentileDial
                  key={x}
                  percentile={mm?.percentile ?? null}
                  label={METRIC_LABEL[x] ?? x}
                  sublabel={mm?.value !== null && mm?.value !== undefined ? `You: ${metricValue(x, mm.value)}` : undefined}
                  progress={reveal.progress}
                  size={88}
                  color={accent}
                  testId="population-dial"
                />
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PopulationReason({ cohort, metric }: { cohort: PopulationCohort | null; metric: string }) {
  const own = cohort?.metrics[metric]?.value ?? null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed px-3 py-2.5 text-[11.5px]"
      style={{ borderColor: "rgba(96,68,28,0.3)", color: LEAGUECRAFT_INK.body }}
      data-testid="population-reason"
      data-reason={cohort?.reasonCode ?? cohort?.status ?? "none"}
    >
      <span>{cohortReason(cohort)}</span>
      {own !== null && (
        <span className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          Your {(METRIC_LABEL[metric] ?? metric).toLowerCase()}: {metricValue(metric, own)}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── mode profile

/**
 * The three core modes side by side on the same kind of scale — each mode's
 * PRIMARY percentile (Standard score, Time Trial correct answers, Survival
 * depth) in its own ink — and the server's strongest mode crowned above them.
 */
export function ModeProfile({ record }: { record: DailyHistoryRecord }) {
  const { type } = useCohort();
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1300, delayMs: 150 });
  const pop = record.population;
  const stages = CORE_KINDS.map((k) => record.stages.find((s) => s.kind === k) ?? null);
  const blocks = stages.map((s) => s?.population ?? null);
  if (!pop && blocks.every((b) => !b)) return null;
  const strongest = strongestFor(pop, type);
  const winner = strongest?.stageKind ?? null;

  return (
    <Panel title="Mode profile" eyebrow={`Mogzy players · ${COHORT_LABEL[type] ?? ""}`} testId="mode-profile">
      <div ref={reveal.ref} className="min-w-0">
        <StrongestBanner record={record} type={type} progress={reveal.progress} />
        <ul className="mt-3 grid grid-cols-1 gap-1.5 [@container(min-width:16rem)]:grid-cols-3" aria-label="Each mode's standing" data-testid="mode-dials">
          {CORE_KINDS.map((kind, i) => {
            const stage = stages[i];
            const block = blocks[i];
            const cohort = cohortOf(block, type);
            const metric = block?.primaryMetric ?? (kind === "standard" ? "score" : kind === "time_trial" ? "correct" : "depth");
            const m = cohort?.metrics[metric];
            const pct = cohort?.status === "available" ? m?.percentile ?? null : null;
            const tone = stageTone(kind);
            const Icon = tone.icon;
            const crowned = winner === kind;
            return (
              <li
                key={kind}
                className="relative flex min-w-0 flex-row items-center justify-between gap-3 rounded-lg border px-2.5 py-2 [@container(min-width:16rem)]:flex-col [@container(min-width:16rem)]:justify-start [@container(min-width:16rem)]:gap-0 [@container(min-width:16rem)]:px-1 [@container(min-width:16rem)]:pb-2 [@container(min-width:16rem)]:pt-3"
                style={{
                  borderColor: crowned ? tone.ink : tone.edge,
                  background: crowned ? tone.tint : "rgba(255,249,233,0.25)",
                  boxShadow: crowned ? `0 0 0 1.5px ${tone.ink}` : undefined,
                }}
                data-testid="mode-dial"
                data-kind={kind}
                data-crowned={crowned ? "true" : "false"}
              >
                {crowned && (
                  <span className="absolute -top-2.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border" style={{ background: CHART.goldLight, borderColor: "#7a5610" }} aria-hidden="true">
                    <Crown className="h-3 w-3" style={{ color: "#4a3208" }} />
                  </span>
                )}
                <span className="mb-0.5 flex min-w-0 items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: tone.ink }}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {stageKindLabel(kind)}
                </span>
                <PercentileDial
                  percentile={pct}
                  label={METRIC_LABEL[metric] ?? metric}
                  sublabel={m?.value !== null && m?.value !== undefined ? `You: ${metricValue(metric, m.value)}` : stage ? undefined : "Not played"}
                  progress={reveal.progress}
                  color={tone.ink}
                  size={crowned ? 104 : 94}
                  fluid
                  className="w-[96px] shrink-0 [@container(min-width:16rem)]:w-full [@container(min-width:16rem)]:shrink"
                  emphasis={crowned}
                  reason={pct === null ? shortReason(cohort) : undefined}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function shortReason(c: PopulationCohort | null): string {
  if (!c) return "No comparison";
  if (c.status === "insufficient") return `${c.sufficiency?.observed ?? c.users ?? 0} of ${c.sufficiency?.required ?? 100} players`;
  if (c.reasonCode === "aggregate_not_built") return "Not built yet";
  return "Unavailable";
}

/** The server's verdict, worded: the winner with its percentile and lead,
 *  or — when the server named none — why not. */
function StrongestBanner({ record, type, progress }: { record: DailyHistoryRecord; type: CohortType; progress: number }) {
  const pop = record.population;
  const s = strongestFor(pop, type);
  if (!pop) return null;
  if (!s) {
    return (
      <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="strongest-none" data-reason={pop.reasonCode ?? "none"}>
        {runPopulationReason(pop.reasonCode)}
      </p>
    );
  }
  if (!s.stageKind || s.percentile === null) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2" style={{ borderColor: "rgba(96,68,28,0.3)" }}
        data-testid="strongest-none" data-reason={s.reasonCode ?? "none"}>
        <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: LEAGUECRAFT_INK.faint }}>Strongest relative mode</span>
        <span className="text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.body }}>None named</span>
        <span className="basis-full text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {strongestReason(s.reasonCode)}
          {s.reasonCode === "margin_below_threshold" && s.margin !== null ? ` The top two are ${Math.round(s.margin * 100)} points apart.` : ""}
        </span>
      </div>
    );
  }
  const tone = stageTone(s.stageKind);
  const Icon = tone.icon;
  const lead = s.margin !== null ? Math.round(s.margin * 100) : null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5"
      style={{ borderColor: tone.ink, background: `linear-gradient(90deg, ${tone.tint}, rgba(255,249,233,0.2))` }}
      data-testid="strongest-mode"
      data-kind={s.stageKind}
      aria-label={`${stageKindLabel(s.stageKind)}: strongest relative mode, ${percentileLabel(s.percentile)} for ${PRIMARY_PHRASE[s.stageKind] ?? "its primary result"}${lead !== null ? `, ${lead} points ahead of the next mode` : ""}.`}
      role="group"
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 ${progress >= 1 ? "history-medal-settle" : ""}`}
        style={{ borderColor: "#7a5610", background: `radial-gradient(circle at 35% 30%, ${CHART.goldLight}, #c49a3c 75%)` }}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" style={{ color: "#3a2708" }} />
      </span>
      <span className="min-w-0" aria-hidden="true">
        <span className="block text-[15px] font-black uppercase tracking-[0.08em]" style={{ color: tone.ink }}>{stageKindLabel(s.stageKind)}</span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: LEAGUECRAFT_INK.faint }}>Strongest relative mode</span>
      </span>
      <span className="ml-auto text-right" aria-hidden="true">
        <span className="block text-[20px] font-black leading-none tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{ordinal(percentileNumber(s.percentile))}</span>
        <span className="block text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          percentile · {PRIMARY_PHRASE[s.stageKind] ?? "result"}{lead !== null ? ` · leads by ${lead} points` : ""}
        </span>
      </span>
    </div>
  );
}
