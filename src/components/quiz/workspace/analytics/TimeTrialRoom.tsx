/**
 * HUB6.3E — the Time Trial analytics room.
 *
 *   compare       25 / 28 vs 23 / 29: "+2 correct", "1 fewer question
 *                 played", "89% vs 79% · 10 points higher", "Streak +3"
 *   donut         result (inner) × public category (outer), exact membership,
 *                 lighting the Time Trial rail; slice detail with this
 *                 attempt's and earlier Time Trials' C / played
 *   stopwatch     questions played: one tick per question in order, by
 *                 result, and previous / your average / most played on the
 *                 same bezel
 *   records       most correct, most questions played, longest streak
 *   streak        chain + flame, with the population percentile
 *   history       correct · questions played · accuracy · longest streak
 *   population    correct (primary) distribution + three dials
 */
import { useMemo } from "react";
import { CheckCheck, Flame, Timer } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { instantDateLabel } from "@/components/quiz/workspace/historyFormat";
import { buildStageViewModel, stageCurrentFacts } from "@/components/quiz/workspace/historyViewModel";
import { useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage } from "@/lib/history/contracts";
import { Panel } from "./charts";
import { CHART, RESULT_INK } from "./ink";
import { HistoryPanel, seriesLines } from "./roomParts";
import { PopulationPanel } from "./population";
import { CategoryDonut, RecordsPanel, StageCompare, StreakPanel } from "./stageShared";
import { recordOf } from "./derive";
import { COMPLETION_WORDS } from "./copy";

export default function TimeTrialRoom({ stage }: { stage: HistoryStage }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const h = p?.history ?? null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="time-trial-room">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <StageCompare stage={stage} fields={["correct", "accuracy", "played", "streak", "ended"]} />
      </div>
      <div className="[@container(min-width:52rem)]:col-span-2">
        <CategoryDonut stage={stage} title="Every question, by result and category" />
      </div>
      <Stopwatch stage={stage} />
      <RecordsPanel
        stage={stage}
        specs={[
          { metric: "correct", label: "Most correct", glyph: CheckCheck, shape: "round" },
          { metric: "questions_played", label: "Most questions played", glyph: Timer, shape: "hex" },
          { metric: "longest_streak", label: "Longest streak", glyph: Flame, shape: "shield" },
        ]}
      />
      <StreakPanel stage={stage} />
      {p?.eligible && (
        <HistoryPanel
          title="Time Trial history"
          eyebrow="Your matching Time Trials"
          testId="stage-history"
          series={p.series}
          metrics={[
            { id: "correct", label: "Correct", average: h?.averageCorrect ?? null, record: recordOf(p, "correct")?.historicalBest ?? null },
            { id: "questionsPlayed", label: "Played", average: h?.averageQuestionsPlayed ?? null, record: recordOf(p, "questions_played")?.historicalBest ?? null },
            { id: "accuracy", label: "Accuracy", fraction: true, average: h?.historicalAccuracy ?? null },
            { id: "longestStreak", label: "Streak", average: h?.averageLongestStreak ?? null, record: recordOf(p, "longest_streak")?.historicalBest ?? null },
          ]}
          describe={(s) => seriesLines(s, s.timeout != null && s.timeout > 0
            ? <span className="block">{s.timeout} timed out</span> : null)}
        />
      )}
      <div className="[@container(min-width:52rem)]:col-span-2">
        <PopulationPanel
          block={stage.population}
          metrics={["correct", "questions_played", "accuracy", "longest_streak"]}
          title="Time Trial across Mogzy players"
          testId="stage-population"
          accent="rgb(154, 82, 8)"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── stopwatch

function niceMax(v: number): number {
  return Math.max(10, Math.ceil((v * 1.08) / 5) * 5);
}

/**
 * Throughput as a stopwatch. The face is marked in questions; this attempt's
 * questions tick around it in order — a long solid tick for correct, a short
 * heavy one for incorrect, a dotted one for a timeout — and the hand sweeps
 * to the count. On the bezel: the previous Time Trial (▲), your average
 * (dashed) and your most-played record (◆), on the same scale.
 */
function Stopwatch({ stage }: { stage: HistoryStage }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const f = stageCurrentFacts(stage);
  const p = stage.analytics?.personalFacts.personal ?? null;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1500, delayMs: 120 });
  const results = vm.rounds.flatMap((r) => r.occurrences.map((o) => o.outcome));
  const n = f.questionsPlayed;
  const previous = p?.eligible ? p.previous?.questionsPlayed ?? null : null;
  const average = p?.history?.averageQuestionsPlayed ?? null;
  const record = recordOf(p, "questions_played");
  const best = record?.historicalBest ?? null;
  const scale = niceMax(Math.max(n, previous ?? 0, average ?? 0, best ?? 0));
  const turn = (v: number) => (v / scale) * 360;
  const pr = reveal.progress;
  const shown = Math.round(n * pr);
  const xy = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [100 + r * Math.cos(a), 112 + r * Math.sin(a)] as const;
  };
  const tick = (i: number) => {
    const o = results[i];
    const deg = turn(i + 0.5);
    const [r0, r1] = o === "correct" ? [60, 76] : o === "incorrect" ? [66, 76] : [69, 76];
    const [x0, y0] = xy(deg, r0);
    const [x1, y1] = xy(deg, r1);
    return (
      <line
        key={i}
        x1={x0} y1={y0} x2={x1} y2={y1}
        stroke={o ? RESULT_INK[o] : CHART.frame}
        strokeWidth={o === "incorrect" ? 4.2 : o === "timeout" ? 2.6 : 2.6}
        strokeDasharray={o === "timeout" ? "1.6 1.6" : undefined}
        strokeLinecap={o === "timeout" ? "butt" : "round"}
        data-testid="stopwatch-tick"
        data-outcome={o ?? "unknown"}
      />
    );
  };
  const marker = (v: number, kind: "previous" | "average" | "record") => {
    const deg = turn(v);
    const [x, y] = xy(deg, 88);
    const [xi, yi] = xy(deg, 81);
    if (kind === "average") {
      const [xo, yo] = xy(deg, 95);
      return <line key={kind} x1={xi} y1={yi} x2={xo} y2={yo} stroke={LEAGUECRAFT_INK.faint} strokeWidth={2.2} strokeDasharray="2.5 2" data-testid="stopwatch-average" />;
    }
    return (
      <g key={kind} transform={`translate(${x} ${y}) rotate(${deg})`} data-testid={`stopwatch-${kind}`}>
        {kind === "previous"
          ? <path d="M0,5 L-4.5,-3.5 L4.5,-3.5 Z" fill={LEAGUECRAFT_INK.body} />
          : <path d="M0,-5.5 L4.5,0 L0,5.5 L-4.5,0 Z" fill={CHART.gold} stroke="#7a5610" strokeWidth={1} />}
      </g>
    );
  };
  const [hx, hy] = xy(turn(n * pr), 54);
  const ended = f.completionReason ? COMPLETION_WORDS[f.completionReason] : null;
  const row = (label: React.ReactNode, value: React.ReactNode, testId: string, mark?: React.ReactNode) => (
    <li className="flex min-w-0 items-baseline justify-between gap-3 border-b py-1 last:border-b-0" style={{ borderColor: "rgba(96,68,28,0.14)" }} data-testid={testId}>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]" style={{ color: LEAGUECRAFT_INK.body }}>{mark}{label}</span>
      <span className="text-[14px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{value}</span>
    </li>
  );
  return (
    <Panel title="Questions played" eyebrow="Against the bank" testId="stopwatch">
      <div ref={reveal.ref} className="grid min-w-0 items-center gap-x-4 gap-y-2 [@container(min-width:26rem)]:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)]">
        <svg
          viewBox="0 0 200 212"
          className="mx-auto block h-auto w-full max-w-[13rem]"
          role="img"
          aria-label={`${n} questions played${previous !== null ? `, previous ${previous}` : ""}${average !== null ? `, your average ${average.toFixed(1)}` : ""}${best !== null ? `, most played ${best}` : ""}. ${f.correct} correct, ${f.incorrect} incorrect, ${f.timeout} timed out.`}
        >
          <rect x={90} y={4} width={20} height={12} rx={3} fill={LEAGUECRAFT_INK.brass} />
          <rect x={94} y={14} width={12} height={8} fill={LEAGUECRAFT_INK.brass} />
          <circle cx={100} cy={112} r={96} fill="rgba(83,56,8,0.1)" stroke={LEAGUECRAFT_INK.brass} strokeWidth={3} />
          <circle cx={100} cy={112} r={84} fill={CHART.paper} stroke="rgba(96,68,28,0.35)" strokeWidth={1} />
          {Array.from({ length: scale / 5 + 1 }, (_, k) => {
            const [a, b] = xy(turn(k * 5), 80);
            const [c, d] = xy(turn(k * 5), 84);
            return <line key={k} x1={a} y1={b} x2={c} y2={d} stroke="rgba(96,68,28,0.45)" strokeWidth={1.2} />;
          })}
          {results.slice(0, shown).map((_, i) => tick(i))}
          {previous !== null && marker(previous, "previous")}
          {average !== null && marker(average, "average")}
          {best !== null && marker(best, "record")}
          <line x1={100} y1={112} x2={hx} y2={hy} stroke={LEAGUECRAFT_INK.strong} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={100} cy={112} r={4} fill={LEAGUECRAFT_INK.strong} />
          <text x={100} y={148} textAnchor="middle" fontSize={27} fontWeight={900} fill={LEAGUECRAFT_INK.strong}>{shown}</text>
          <text x={100} y={163} textAnchor="middle" fontSize={8} fontWeight={800} letterSpacing={1.2} fill={LEAGUECRAFT_INK.faint}>PLAYED</text>
        </svg>
        <div className="min-w-0">
          <ul className="grid">
            {row("This Time Trial", n, "throughput-current")}
            {previous !== null && row("Previous", previous, "throughput-previous",
              <span aria-hidden="true" className="text-[9px]" style={{ color: LEAGUECRAFT_INK.body }}>▲</span>)}
            {average !== null && row("Your average", average.toFixed(1).replace(/\.0$/, ""), "throughput-average",
              <span aria-hidden="true" className="inline-block w-3" style={{ borderTop: `2px dashed ${LEAGUECRAFT_INK.faint}` }} />)}
            {best !== null && row(
              <>Most played{record?.status === "new_record" ? " · new record" : record?.status === "tied_record" ? " · tied" : record?.priorBestCompletedAt ? ` · ${instantDateLabel(record.priorBestCompletedAt)}` : ""}</>,
              best, "throughput-record",
              <span aria-hidden="true" className="text-[10px]" style={{ color: CHART.gold }}>◆</span>)}
          </ul>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
            <span><span style={{ color: RESULT_INK.correct }}>▍</span> {f.correct} correct</span>
            <span><span style={{ color: RESULT_INK.incorrect }}>▮</span> {f.incorrect} incorrect</span>
            <span><span style={{ color: RESULT_INK.timeout }}>┆</span> {f.timeout} timed out</span>
            {ended && <span>· {ended}</span>}
          </p>
        </div>
      </div>
    </Panel>
  );
}
