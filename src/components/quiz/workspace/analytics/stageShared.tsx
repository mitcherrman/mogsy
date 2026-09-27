/**
 * HUB6.3E — sections several stage rooms share: the current-vs-previous
 * board, the result × category donut, the streak panel and the records row.
 * Every figure is the server's (`stage.analytics.personalFacts`) or a count
 * of this stage's exact questions.
 */
import { useMemo } from "react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { planDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { accuracyComparison, questionsPlayedDelta, wholePercent } from "@/components/quiz/workspace/historyComparisons";
import { stageCurrentFacts, buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { occurrenceHighlight, useHighlightControls, useIsLocked } from "@/components/quiz/workspace/historyHighlight";
import { useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage, PersonalRecord, PersonalSnapshot } from "@/lib/history/contracts";
import { cohortOf } from "@/lib/history/population";
import { NestedDonut, Panel } from "./charts";
import { CompareBoard, RecordMedal, StreakChain, dir, type BoardChange, type BoardFigure, type MedalShape } from "./trophies";
import { recordOf, stageCategoryDonut, streakIds } from "./derive";
import { useDonutHighlight } from "./interact";
import { useCohort } from "./population";
import { COMPLETION_WORDS, depthDelta, percentileLabel, signed } from "./copy";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${wholePercent(v)}%`);

export type CompareField = "score" | "correct" | "played" | "accuracy" | "streak" | "depth" | "strikes" | "ended";

/**
 * The stage's current attempt against its previous compatible attempt:
 * the chosen fields side by side, and the exact change of each.
 */
export function StageCompare({ stage, fields }: { stage: HistoryStage; fields: CompareField[] }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const f = stageCurrentFacts(stage);
  const prev = p?.eligible ? p.previous : null;
  const kind = stageKindLabel(stage.kind);

  const cur: Required<Pick<PersonalSnapshot, "score" | "correct" | "questionsPlayed" | "accuracy" | "longestStreak" | "depth" | "strikesUsed">> & { completionReason: string | null } = {
    score: f.score, correct: f.correct, questionsPlayed: f.questionsPlayed, accuracy: f.accuracy,
    longestStreak: f.longestStreak, depth: f.depth, strikesUsed: f.strikesUsed, completionReason: f.completionReason,
  };
  const fig = (s: typeof cur | PersonalSnapshot, field: CompareField): BoardFigure | null => {
    switch (field) {
      case "score":
        return s.score != null ? { label: "Score", value: String(s.score) } : null;
      case "correct":
        return s.correct != null && s.questionsPlayed != null
          ? { label: "Correct", value: `${s.correct} / ${s.questionsPlayed}`, aria: `${s.correct} of ${s.questionsPlayed} correct` }
          : null;
      case "played":
        return s.questionsPlayed != null ? { label: "Questions played", value: String(s.questionsPlayed) } : null;
      case "accuracy":
        return s.accuracy != null ? { label: "Accuracy", value: pct(s.accuracy) } : null;
      case "streak":
        return s.longestStreak != null ? { label: "Longest streak", value: String(s.longestStreak) } : null;
      case "depth":
        return s.depth != null ? { label: "Depth", value: String(s.depth) } : null;
      case "strikes":
        return s.strikesUsed != null ? { label: "Strikes used", value: `${s.strikesUsed}${f.maxStrikes !== null ? ` of ${f.maxStrikes}` : ""}` } : null;
      case "ended":
        return s.completionReason ? { label: "Ended", value: <span className="text-[13px]">{COMPLETION_WORDS[s.completionReason] ?? "Finished"}</span> } : null;
    }
  };
  const current = fields.map((x) => fig(cur, x)).filter((x): x is BoardFigure => x !== null);
  const previous = prev ? fields.map((x) => fig(prev, x)).filter((x): x is BoardFigure => x !== null) : null;
  const changes: BoardChange[] = [];
  if (prev) {
    for (const field of fields) {
      if (field === "score" && cur.score != null && prev.score != null) {
        const d = cur.score - prev.score;
        changes.push({ text: `Score ${signed(d)}`, direction: dir(d), testId: "change-score" });
      } else if (field === "correct" && prev.correct != null) {
        const d = cur.correct - prev.correct;
        changes.push({ text: `${signed(d)} correct`, direction: dir(d), testId: "change-correct" });
      } else if (field === "played" && prev.questionsPlayed != null) {
        const d = cur.questionsPlayed - prev.questionsPlayed;
        changes.push({ text: questionsPlayedDelta(d), direction: dir(d), testId: "change-played" });
      } else if (field === "accuracy" && cur.accuracy != null && prev.accuracy != null) {
        const a = accuracyComparison(cur.accuracy, prev.accuracy);
        changes.push({ text: `${a.versus} · ${a.change}`, direction: dir(a.points), testId: "change-accuracy" });
      } else if (field === "streak" && cur.longestStreak != null && prev.longestStreak != null) {
        const d = cur.longestStreak - prev.longestStreak;
        changes.push({ text: `Streak ${signed(d)}`, direction: dir(d), testId: "change-streak" });
      } else if (field === "depth" && cur.depth != null && prev.depth != null) {
        const d = cur.depth - prev.depth;
        changes.push({ text: depthDelta(d), direction: dir(d), testId: "change-depth" });
      } else if (field === "strikes" && cur.strikesUsed != null && prev.strikesUsed != null) {
        const d = cur.strikesUsed - prev.strikesUsed;
        // Fewer strikes is not scored as better or worse here: a plain count.
        changes.push({ text: d === 0 ? "Same strikes used" : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} ${Math.abs(d) === 1 ? "strike" : "strikes"} used`, direction: "same", testId: "change-strikes" });
      }
    }
  }
  return (
    <Panel title={`This ${kind} vs the previous one`} eyebrow={kind} testId="stage-compare">
      <CompareBoard
        currentTitle={`This ${kind}`}
        previousTitle={prev ? `Previous · ${planDateLabel(prev.planDate)}` : "Previous"}
        current={current}
        previous={previous}
        changes={changes}
        testId="stage-compare-board"
      />
    </Panel>
  );
}

/** Result (inner) × public category (outer), wired to this stage's rail. */
export function CategoryDonut({ stage, title, eyebrow }: { stage: HistoryStage; title: string; eyebrow?: string }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const data = useMemo(() => stageCategoryDonut(stage, vm), [stage, vm]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1200, delayMs: 80 });
  const wiring = useDonutHighlight(data, `${stage.stageId}-donut`, stage.stageId);
  const kind = stageKindLabel(stage.kind);
  if (data.total === 0) return null;
  return (
    <Panel title={title} eyebrow={eyebrow ?? "Result × category"} testId="category-donut">
      <div ref={reveal.ref}>
        <NestedDonut
          data={data}
          progress={reveal.progress}
          groupNoun="category"
          title={`${kind} questions by result and category`}
          testId="category-donut-chart"
          describeGroup={(g) => {
            const group = data.groups.find((x) => x.group === g);
            if (!group) return null;
            return (
              <>
                <span className="block">
                  <strong>{group.label}</strong>: {group.correct} / {group.played} correct · {Math.round((group.correct / Math.max(1, group.played)) * 100)}% this {kind}
                </span>
                {group.history && group.history.played > 0 && (
                  <span className="block" data-testid="donut-group-history">
                    Your earlier {kind} stages: {group.history.correct} / {group.history.played} correct
                    {group.history.accuracy !== null ? ` · ${Math.round(group.history.accuracy * 100)}%` : ""}
                  </span>
                )}
              </>
            );
          }}
          {...wiring}
        />
      </div>
    </Panel>
  );
}

/** The stage's longest streak (Free current value) against previous and
 *  best (Premium), with its exact span lit on demand. */
export function StreakPanel({ stage }: { stage: HistoryStage }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const ids = useMemo(() => streakIds(stage, vm), [stage, vm]);
  const f = stageCurrentFacts(stage);
  const p = stage.analytics?.personalFacts.personal ?? null;
  const record = recordOf(p, "longest_streak");
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 100 });
  const key = `${stage.stageId}:streak`;
  const locked = useIsLocked(key);
  const { preview, toggleLock } = useHighlightControls();
  const { type } = useCohort();
  const cohort = cohortOf(stage.population, type);
  const sp = cohort?.status === "available" ? cohort.metrics.longest_streak?.percentile ?? null : null;
  if (f.longestStreak === null) return null;
  const h = () => ({ ...occurrenceHighlight(stage, ids, key), label: `Longest streak · ${f.longestStreak}` });
  return (
    <Panel title="Longest streak" eyebrow="Correct in a row" testId="stage-streak">
      <div ref={reveal.ref}>
        <StreakChain
          current={f.longestStreak}
          previous={p?.eligible ? p.previous?.longestStreak ?? null : null}
          best={record?.priorBest ?? null}
          progress={reveal.progress}
          lit={locked}
          onLight={ids.length ? () => toggleLock(h()) : undefined}
          onPreview={ids.length ? (on) => preview(on ? h() : null) : undefined}
          percentileNote={sp !== null ? (
            <span className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="streak-percentile">
              {percentileLabel(sp)} among Mogzy players
            </span>
          ) : null}
        />
      </div>
    </Panel>
  );
}

export interface RecordSpec {
  metric: string;
  label: string;
  glyph: React.ElementType;
  shape: MedalShape;
}

/** The stage's personal records, each its own medal shape. */
export function RecordsPanel({ stage, specs, title = "Personal records" }: { stage: HistoryStage; specs: RecordSpec[]; title?: string }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 120 });
  const records = specs.map((s) => ({ s, r: recordOf(p, s.metric) })).filter((x): x is { s: RecordSpec; r: PersonalRecord } => x.r !== null);
  if (!p?.eligible || records.length === 0) return null;
  return (
    <Panel title={title} eyebrow={stageKindLabel(stage.kind)} testId="stage-records">
      <div ref={reveal.ref} className="grid grid-cols-[repeat(auto-fit,minmax(min(6.75rem,100%),1fr))] gap-3 pt-1">
        {records.map(({ s, r }) => (
          <RecordMedal key={s.metric} record={r} label={s.label} glyph={s.glyph} shape={s.shape} progress={reveal.progress} testId={`record-${s.metric}`} />
        ))}
      </div>
    </Panel>
  );
}
