/**
 * HUB6.3E — the Premium Daily Overview: the analytics room under an expanded
 * Daily when no stage is selected. The stage rows and rails above it never
 * move; this room only reads the record.
 *
 *   This Daily vs the previous Daily   owner-approved factual comparison:
 *                                      correct, questions played, accuracy
 *                                      ("88% vs 92%", "4 points lower"), a
 *                                      note when the stage sets differ
 *   Core Daily records                 most correct, longest streak —
 *                                      never the raw Daily score (Review
 *                                      awards points after misses), never
 *                                      best accuracy
 *   Core Daily history                 Standard + Time Trial + Survival,
 *                                      accuracy / correct / longest streak
 *   The Daily's questions              nested donut: result × stage
 *   Mode profile + strongest mode      HUB6.3C, never recomputed
 *   Mogzy players (Core Daily)         one distribution, metric tabs
 */
import { useMemo } from "react";
import { CheckCheck, Flame } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { planDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import {
  accuracyComparison,
  correctOfPlayed,
  questionsPlayedDelta,
  wholePercent,
} from "@/components/quiz/workspace/historyComparisons";
import { useReveal } from "@/lib/motion/useReveal";
import type { DailyAnalytics, DailyHistoryRecord } from "@/lib/history/contracts";
import { NestedDonut, Panel } from "./charts";
import { CompareBoard, RecordMedal, dir, type BoardChange, type BoardFigure } from "./trophies";
import { HistoryPanel, seriesLines } from "./roomParts";
import { ModeProfile, PopulationPanel } from "./population";
import { coreStreak, dailyDonut, recordOf } from "./derive";
import { useDonutHighlight } from "./interact";
import { signed } from "./copy";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${wholePercent(v)}%`);

/**
 * The Daily donut's outer ring: STAGE (HUB6.3E checkpoint 1). Evaluated in
 * the Analytics Lab against public category: at Daily level the category
 * ring broke into ~11 thin slices and a 12-row legend that repeats the stage
 * rooms' category donuts, while the stage ring maps one-to-one onto the five
 * stage rows above it and lights whole rails coherently.
 */
export const DAILY_DONUT_BY = "stage" as const;

export default function DailyOverview({ record, analytics }: { record: DailyHistoryRecord; analytics: DailyAnalytics }) {
  const personal = analytics.personal;
  const core = personal?.core?.eligible ? personal.core : null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="daily-overview">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <ThisDaily record={record} analytics={analytics} />
      </div>
      {core && <CoreRecords record={record} />}
      {core && (
        <HistoryPanel
          title="Core Daily history"
          eyebrow="Standard · Time Trial · Survival"
          testId="core-history"
          series={core.series}
          metrics={[
            { id: "accuracy", label: "Accuracy", fraction: true, average: core.history?.historicalAccuracy ?? null },
            { id: "correct", label: "Correct", average: core.history?.averageCorrect ?? null, record: recordOf(core, "correct")?.historicalBest ?? null },
            { id: "longestStreak", label: "Longest streak", average: core.history?.averageLongestStreak ?? null, record: recordOf(core, "longest_streak")?.historicalBest ?? null },
          ]}
          describe={(s) => seriesLines(s)}
          footnote={core.history && core.history.attempts > 0
            ? `Averages over your ${core.history.attempts} earlier Core Dailies.`
            : null}
        />
      )}
      <DailyDonut record={record} />
      <ModeProfile record={record} />
      <div className="[@container(min-width:52rem)]:col-span-2">
        <PopulationPanel
          block={record.population?.core ?? null}
          metrics={["correct", "accuracy", "longest_streak"]}
          title="Core Daily across Mogzy players"
          testId="core-population"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── this vs previous

function ThisDaily({ record, analytics }: { record: DailyHistoryRecord; analytics: DailyAnalytics }) {
  const pd = analytics.personal?.previousDaily ?? null;
  const cur = pd?.current;
  const prev = pd?.previous ?? null;
  const streak = coreStreak(record);
  const core = analytics.personal?.core;
  const correct = cur?.correct ?? record.basic.correct;
  const played = cur?.questionsPlayed ?? record.basic.questionsPlayed;
  const accuracy = cur?.accuracy ?? record.basic.accuracy;

  const current: BoardFigure[] = [
    { key: "correct", label: "Correct", value: `${correct} / ${played}`, aria: correctOfPlayed(correct, played) },
    { key: "accuracy", label: "Accuracy", value: pct(accuracy) },
  ];
  if (streak) {
    current.push({
      key: "streak",
      label: "Core longest streak",
      value: (
        <span data-testid="daily-core-streak">
          {streak.length}
          <span className="ml-1 text-[11px] font-bold" style={{ color: LEAGUECRAFT_INK.faint }}>
            {streak.kinds.map(stageKindLabel).join(", ")}
          </span>
        </span>
      ),
      aria: `Core longest streak ${streak.length}, in ${streak.kinds.map(stageKindLabel).join(" and ")}`,
    });
  }

  let previous: BoardFigure[] | null = null;
  const changes: BoardChange[] = [];
  if (prev && prev.correct != null && prev.questionsPlayed != null) {
    previous = [
      { key: "correct", label: "Correct", value: `${prev.correct} / ${prev.questionsPlayed}`, aria: correctOfPlayed(prev.correct, prev.questionsPlayed) },
      { key: "accuracy", label: "Accuracy", value: pct(prev.accuracy) },
    ];
    // The previous Core streak only when Core's previous IS that Daily.
    const prevStreak = core?.previous?.runId === prev.runId ? core.previous.longestStreak ?? null : null;
    if (streak && prevStreak !== null) previous.push({ key: "streak", label: "Core longest streak", value: String(prevStreak) });
    const dc = correct - prev.correct;
    changes.push({ text: `${signed(dc)} correct`, direction: dir(dc), testId: "daily-change-correct", metric: "correct" });
    const dp = played - prev.questionsPlayed;
    changes.push({ text: questionsPlayedDelta(dp), direction: dir(dp), testId: "daily-change-played", metric: "correct" });
    if (accuracy != null && prev.accuracy != null) {
      const a = accuracyComparison(accuracy, prev.accuracy);
      changes.push({ text: `${a.versus} · ${a.change}`, direction: dir(a.points), testId: "daily-change-accuracy", metric: "accuracy" });
    }
    if (streak && prevStreak !== null) {
      const ds = streak.length - prevStreak;
      changes.push({ text: `Streak ${signed(ds)}`, direction: dir(ds), testId: "daily-change-streak", metric: "streak" });
    }
  }
  const composition = pd && pd.sameStageKinds === false && prev
    ? `Different stage composition: this Daily had ${cur?.stageCount ?? record.stages.length} stages, the previous one ${prev.stageCount ?? "a different set"}.`
    : null;

  return (
    <Panel title="This Daily" eyebrow={planDateLabel(record.planDate)} testId="this-daily">
      <CompareBoard
        currentTitle="Today"
        previousTitle={prev ? `Previous Daily · ${planDateLabel(prev.planDate)}` : "Previous Daily"}
        current={current}
        previous={previous}
        changes={changes}
        note={composition}
        testId="daily-compare"
      />
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────── records

function CoreRecords({ record }: { record: DailyHistoryRecord }) {
  const core = record.analytics?.personal?.core;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 150 });
  if (!core?.eligible) return null;
  const mostCorrect = recordOf(core, "correct");
  const streak = recordOf(core, "longest_streak");
  if (!mostCorrect && !streak) return null;
  return (
    <Panel title="Core Daily records" eyebrow="Standard · Time Trial · Survival" testId="core-records">
      <div ref={reveal.ref} className="grid grid-cols-1 gap-3 pt-1 [@container(min-width:16rem)]:grid-cols-2" data-testid="records-grid" data-count={2}>
        <RecordMedal record={mostCorrect} label="Most correct" glyph={CheckCheck} shape="round" progress={reveal.progress} testId="core-record-correct" />
        <RecordMedal record={streak} label="Longest streak" glyph={Flame} shape="shield" progress={reveal.progress} testId="core-record-streak" />
      </div>
      <p className="mt-2 text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>
        The Daily's total score is not kept as a record: Review awards points after misses, so a higher total can mean a harder day.
      </p>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────── donut

function DailyDonut({ record }: { record: DailyHistoryRecord }) {
  const data = useMemo(() => dailyDonut(record, DAILY_DONUT_BY), [record]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1200, delayMs: 100 });
  const wiring = useDonutHighlight(data, `daily-donut-${DAILY_DONUT_BY}`, null);
  if (data.total === 0) return null;
  return (
    <Panel title="This Daily's questions" eyebrow={DAILY_DONUT_BY === "stage" ? "Result × stage" : "Result × category"} testId="daily-donut">
      <div ref={reveal.ref}>
        <NestedDonut
          data={data}
          progress={reveal.progress}
          groupNoun={DAILY_DONUT_BY}
          title="This Daily's questions by result and stage"
          testId="daily-donut-chart"
          {...wiring}
        />
      </div>
    </Panel>
  );
}
