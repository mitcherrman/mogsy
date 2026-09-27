/**
 * HUB6.3E — pieces every analytics room shares: the lock bar, the personal
 * history panel (one chart, a metric toggle, never two scales on one axis),
 * and the series tooltip.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { useHistoryHighlight } from "@/components/quiz/workspace/historyHighlight";
import { planDateLabel } from "@/components/quiz/workspace/historyFormat";
import { useReveal } from "@/lib/motion/useReveal";
import type { PersonalSnapshot } from "@/lib/history/contracts";
import { LineHistory, LineKey, Panel, Segmented, type LinePoint } from "./charts";
import { seriesPoints } from "./derive";

/**
 * While a chart has LOCKED a set of questions, one line says so and offers
 * the way out (Escape does the same). A hover preview says nothing — it ends
 * on its own.
 */
export function HighlightBar() {
  const { locked, clear } = useHistoryHighlight();
  const coarse = useCoarsePointer();
  if (!locked) return null;
  const n = locked.occurrenceIds.size;
  return (
    <div
      role="status"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1 text-[11px]"
      style={{ borderColor: "rgba(96,68,28,0.45)", background: "rgba(246,236,210,0.97)", color: LEAGUECRAFT_INK.body }}
      data-testid="highlight-bar"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#b4862a", boxShadow: "0 0 0 2px rgba(180,134,42,0.3)" }} />
      <span className="min-w-0 font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
        Lighting {n} {n === 1 ? "question" : "questions"}
        {locked.label ? <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.body }}> · {locked.label}</span> : null}
      </span>
      <button
        type="button"
        onClick={clear}
        data-testid="highlight-clear"
        className={`ml-auto inline-flex items-center gap-1 rounded px-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[26px]"}`}
        style={{ color: LEAGUECRAFT_INK.brass }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Clear
      </button>
    </div>
  );
}

export interface HistoryMetric {
  id: keyof PersonalSnapshot;
  label: string;
  fraction?: boolean;
  average?: number | null;
  /** The record (best ever, this attempt included) for the dotted rule. */
  record?: number | null;
  format?: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * A personal series (≤ 20 compatible attempts, oldest first, the current one
 * last) with a metric toggle. Accuracy draws on 0–100%, counts from zero;
 * each metric keeps its own axis.
 */
export function HistoryPanel({
  title,
  eyebrow,
  series,
  metrics,
  describe,
  testId,
  footnote,
}: {
  title: string;
  eyebrow?: string;
  series: PersonalSnapshot[];
  metrics: HistoryMetric[];
  /** Tooltip lines for one attempt. */
  describe: (s: PersonalSnapshot) => React.ReactNode;
  testId?: string;
  footnote?: React.ReactNode;
}) {
  const [id, setId] = useState<string>(metrics[0].id as string);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1300, delayMs: 100 });
  const metric = metrics.find((m) => m.id === id) ?? metrics[0];
  const fmt = metric.format ?? (metric.fraction ? pct : (v: number) => String(Math.round(v * 10) / 10));
  const points: LinePoint[] = seriesPoints(series, metric.id).map((p) => ({
    key: p.runId, value: p.value, isCurrent: p.isCurrent, label: planDateLabel(p.planDate),
  }));
  const bySeries = new Map(series.map((s) => [s.runId, s]));
  return (
    <Panel
      title={title}
      eyebrow={eyebrow}
      testId={testId ?? "history-panel"}
      action={metrics.length > 1 ? (
        <Segmented
          label="History metric"
          options={metrics.map((m) => ({ id: m.id as string, label: m.label }))}
          value={metric.id as string}
          onChange={setId}
          testId="history-metric"
        />
      ) : undefined}
    >
      <div ref={reveal.ref} data-metric={metric.id as string}>
        {points.length >= 2 ? (
          <>
            <LineHistory
              key={metric.id as string}
              points={points}
              fraction={!!metric.fraction}
              average={metric.average ?? null}
              record={metric.record ?? null}
              progress={reveal.progress}
              format={fmt}
              title={`${title}: ${metric.label}`}
              testId="history-line"
              describe={(p) => {
                const s = bySeries.get(p.key);
                return (
                  <>
                    <span className="block font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                      {p.label}{p.isCurrent ? " · this Daily" : ""}
                    </span>
                    {s && describe(s)}
                  </>
                );
              }}
            />
            <LineKey
              average={metric.average !== null && metric.average !== undefined ? `Your average ${fmt(metric.average)}` : null}
              record={metric.record !== null && metric.record !== undefined ? `Record ${fmt(metric.record)}` : null}
            />
          </>
        ) : (
          <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="history-first">
            This is your first matching attempt — the history starts here.
          </p>
        )}
        {footnote && <p className="mt-1.5 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>{footnote}</p>}
      </div>
    </Panel>
  );
}

/** Tooltip lines for a series point: C / played, accuracy, streak. */
export function seriesLines(s: PersonalSnapshot, extra?: React.ReactNode): React.ReactNode {
  return (
    <>
      {s.correct != null && s.questionsPlayed != null && (
        <span className="block tabular-nums">{s.correct} / {s.questionsPlayed} correct{s.accuracy != null ? ` · ${pct(s.accuracy)}` : ""}</span>
      )}
      {s.longestStreak != null && <span className="block tabular-nums">Longest streak {s.longestStreak}</span>}
      {extra}
    </>
  );
}
