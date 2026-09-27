/**
 * HUB6.3E — pure view models for the Premium analytics room.
 *
 * Every figure is the server's or a COUNT of the record's own exact
 * questions (their public category and outcome are Free facts). Nothing here
 * infers a strike, a source, a weakness or a population figure: strikes are
 * HUB6.3C's per-question markers, Review links are HUB6.3B's exact
 * `review_sources`, and population numbers are only ever read.
 *
 * All functions are pure and cheap, and the components memoize them per
 * stage/record, so a hover never recomputes a distribution.
 */
import type {
  DailyHistoryRecord,
  HistoryStage,
  PersonalComparison,
  PersonalRecord,
  PersonalSnapshot,
} from "@/lib/history/contracts";
import {
  buildStageViewModel,
  type QuestionOccurrenceVM,
  type QuestionResult,
  type RoundVM,
  type StageViewModel,
} from "@/components/quiz/workspace/historyViewModel";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";
import { stageTone } from "@/components/quiz/workspace/stageTheme";
import { moduleFamily, moduleName, stageKindLabel, type ModuleFamily } from "@/components/quiz/workspace/historyFormat";
import { RESULT_INK, RESULTS, categoryInk, categoryName, categoryRank } from "./ink";

export const CORE_KINDS: readonly string[] = ["standard", "time_trial", "survival"];

// ─────────────────────────────────────────────────────────── donut

export interface DonutSlice {
  /** Stable identity (legend key, highlight key). */
  id: string;
  label: string;
  count: number;
  color: string;
  /** Exact members (question_result_ids). */
  ids: string[];
}

export interface InnerSlice extends DonutSlice {
  outcome: QuestionResult;
}

export interface OuterSlice extends DonutSlice {
  outcome: QuestionResult;
  /** The group within the outcome (a category key or a stage id). */
  group: string;
}

export interface GroupSummary {
  group: string;
  label: string;
  color: string;
  correct: number;
  played: number;
  ids: string[];
  /** Stage ids the group's questions live in (highlight scope). */
  stageIds: string[];
  /** Personal history of this group, when the server sent one. */
  history: { correct: number; played: number; accuracy: number | null; attempts: number } | null;
}

export interface NestedDonutData {
  total: number;
  inner: InnerSlice[];
  outer: OuterSlice[];
  /** One row per group, for the legend. */
  groups: GroupSummary[];
}

interface Member {
  id: string;
  outcome: QuestionResult;
  group: string;
  groupLabel: string;
  color: string;
  stageId: string;
}

function donutFrom(members: Member[], history: Map<string, GroupSummary["history"]> = new Map(), order?: (g: string) => number): NestedDonutData {
  const inner: InnerSlice[] = [];
  const outer: OuterSlice[] = [];
  const groups = new Map<string, GroupSummary>();
  for (const m of members) {
    const g = groups.get(m.group) ?? {
      group: m.group, label: m.groupLabel, color: m.color, correct: 0, played: 0, ids: [], stageIds: [],
      history: history.get(m.group) ?? null,
    };
    g.played += 1;
    if (m.outcome === "correct") g.correct += 1;
    g.ids.push(m.id);
    if (!g.stageIds.includes(m.stageId)) g.stageIds.push(m.stageId);
    groups.set(m.group, g);
  }
  const sortedGroups = [...groups.values()].sort((a, b) =>
    (order ? order(a.group) - order(b.group) : 0) || b.played - a.played || a.label.localeCompare(b.label));
  const rank = new Map(sortedGroups.map((g, i) => [g.group, i]));
  for (const outcome of RESULTS) {
    const of = members.filter((m) => m.outcome === outcome);
    if (of.length === 0) continue;
    inner.push({ id: outcome, outcome, label: outcome, count: of.length, color: RESULT_INK[outcome], ids: of.map((m) => m.id) });
    const byGroup = new Map<string, Member[]>();
    for (const m of of) byGroup.set(m.group, [...(byGroup.get(m.group) ?? []), m]);
    [...byGroup.entries()]
      .sort((a, b) => (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))
      .forEach(([group, ms]) => outer.push({
        id: `${outcome}:${group}`, outcome, group, label: ms[0].groupLabel, count: ms.length,
        color: ms[0].color, ids: ms.map((m) => m.id),
      }));
  }
  return { total: members.length, inner, outer, groups: sortedGroups };
}

function occurrences(vm: StageViewModel): QuestionOccurrenceVM[] {
  return vm.rounds.flatMap((r) => r.occurrences);
}

/**
 * A stage's nested donut: outcome (inner) × public category (outer). The
 * server's exact per-outcome membership when HUB6.3B sent it, else the
 * record's own questions — the two agree by construction (tested).
 */
export function stageCategoryDonut(stage: HistoryStage, vm: StageViewModel = buildStageViewModel(stage)): NestedDonutData {
  const server = stage.analytics?.personalFacts.categories ?? [];
  const members: Member[] = [];
  if (server.length > 0) {
    for (const c of server) {
      for (const outcome of RESULTS) {
        for (const id of c.idsByOutcome[outcome]) {
          members.push({
            id, outcome, group: c.publicCategory.key, color: categoryInk(c.publicCategory.key),
            groupLabel: categoryName(c.publicCategory.key, c.publicCategory.label), stageId: stage.stageId,
          });
        }
      }
    }
  } else {
    for (const o of occurrences(vm)) {
      if (!o.outcome) continue;
      const key = o.publicCategory?.key ?? "general";
      members.push({
        id: o.occurrenceId, outcome: o.outcome, group: key, color: categoryInk(key),
        groupLabel: categoryName(key, o.publicCategory?.label ?? "General"), stageId: stage.stageId,
      });
    }
  }
  // Keep the rail's order within each slice (occurrence order).
  const position = new Map(occurrences(vm).map((o, i) => [o.occurrenceId, i]));
  members.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const history = new Map<string, GroupSummary["history"]>();
  for (const h of stage.analytics?.personalFacts.personal?.categoryHistory ?? []) {
    history.set(h.publicCategory.key, { correct: h.correct, played: h.questionsPlayed, accuracy: h.accuracy, attempts: h.priorAttempts });
  }
  return donutFrom(members, history, categoryRank);
}

/** The Daily's composition donut: outcome (inner) × STAGE or public
 *  CATEGORY (outer), over every exact question of every stage. */
export function dailyDonut(record: DailyHistoryRecord, by: "stage" | "category"): NestedDonutData {
  const members: Member[] = [];
  for (const stage of record.stages) {
    const vm = buildStageViewModel(stage);
    const tone = stageTone(stage.kind);
    for (const o of occurrences(vm)) {
      if (!o.outcome) continue;
      if (by === "stage") {
        members.push({
          id: o.occurrenceId, outcome: o.outcome, group: stage.stageId, groupLabel: stageKindLabel(stage.kind),
          color: tone.ink, stageId: stage.stageId,
        });
      } else {
        const key = o.publicCategory?.key ?? "general";
        members.push({
          id: o.occurrenceId, outcome: o.outcome, group: key, color: categoryInk(key),
          groupLabel: categoryName(key, o.publicCategory?.label ?? "General"), stageId: stage.stageId,
        });
      }
    }
  }
  const stageOrder = new Map(record.stages.map((s) => [s.stageId, s.order]));
  return donutFrom(members, new Map(), by === "stage" ? (g) => stageOrder.get(g) ?? 99 : categoryRank);
}

// ─────────────────────────────────────────────────────────── streaks

/** The current Core Daily longest streak and the stage(s) producing it —
 *  HUB6.3B's Premium `core.current` when present, else the max of the three
 *  core stages' Free basic streaks (the server's own definition). */
export function coreStreak(record: DailyHistoryRecord): { length: number; kinds: string[]; stageIds: string[] } | null {
  const core = record.analytics?.personal?.core;
  const current = core?.eligible ? core.current : null;
  const cores = record.stages.filter((s) => CORE_KINDS.includes(s.kind));
  const lengthOf = (s: HistoryStage) => s.basic.longestStreak ?? s.analytics?.personalFacts.current?.longestStreak ?? null;
  const length = current?.longestStreak ?? cores.reduce<number | null>((m, s) => {
    const v = lengthOf(s);
    return v === null ? m : Math.max(m ?? 0, v);
  }, null);
  if (length === null) return null;
  const kinds = current?.longestStreakStages?.length
    ? current.longestStreakStages
    : cores.filter((s) => lengthOf(s) === length).map((s) => s.kind);
  return { length, kinds, stageIds: cores.filter((s) => kinds.includes(s.kind)).map((s) => s.stageId) };
}

/** The exact questions of a stage's longest streak (its server span, in
 *  rail order), for lighting. */
export function streakIds(stage: HistoryStage, vm: StageViewModel = buildStageViewModel(stage)): string[] {
  const span = stage.basic.longestStreakSpan ?? stage.analytics?.personalFacts.current?.longestStreakSpan ?? null;
  if (!span || !span.startQuestionResultId || !span.endQuestionResultId || span.length === 0) return [];
  const all = occurrences(vm).map((o) => o.occurrenceId);
  const a = all.indexOf(span.startQuestionResultId);
  const b = all.indexOf(span.endQuestionResultId);
  return a < 0 || b < a ? [] : all.slice(a, b + 1);
}

// ─────────────────────────────────────────────────────────── records & series

export function recordOf(p: PersonalComparison | null | undefined, metric: string): PersonalRecord | null {
  return p?.records.find((r) => r.metric === metric) ?? null;
}

export interface SeriesPoint {
  runId: string;
  planDate: string;
  isCurrent: boolean;
  value: number | null;
  snapshot: PersonalSnapshot;
}

export function seriesPoints(series: PersonalSnapshot[], metric: keyof PersonalSnapshot): SeriesPoint[] {
  return series.map((s) => {
    const v = s[metric];
    return { runId: s.runId, planDate: s.planDate, isCurrent: s.isCurrent === true, value: typeof v === "number" ? v : null, snapshot: s };
  });
}

// ─────────────────────────────────────────────────────────── Standard course

export interface CourseModule {
  position: number;
  roundNumber: number;
  /** The raw unit: `splash`, `meta_reflex`, `journey` (legacy `slice`). */
  unit: string | null;
  /** What the module IS (a legacy `slice` is a Journey) — for its shape,
   *  its name and its art; never shown raw. */
  family: ModuleFamily | null;
  correct: number;
  played: number;
  round: RoundVM | null;
  ids: string[];
}

/** The Standard's modules in played order — HUB6.3B's `stage.modules` (the
 *  frozen recipe's unit per round), joined to the rail's rounds. */
export function courseModules(stage: HistoryStage, vm: StageViewModel = buildStageViewModel(stage)): CourseModule[] {
  const byRound = new Map(vm.rounds.map((r) => [r.roundNumber, r]));
  if (stage.modules && stage.modules.length > 0) {
    return stage.modules
      .slice()
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map((m, i) => {
        const round = byRound.get(m.roundNumber) ?? null;
        const unit = m.unit ?? round?.unit ?? null;
        return {
          position: i + 1, roundNumber: m.roundNumber, unit, family: moduleFamily(unit),
          correct: m.correct, played: m.questionsPlayed, round,
          ids: m.questionResultIds.length ? m.questionResultIds : round?.occurrences.map((o) => o.occurrenceId) ?? [],
        };
      });
  }
  return vm.rounds.map((r, i) => ({
    position: i + 1, roundNumber: r.roundNumber, unit: r.unit, family: moduleFamily(r.unit), correct: r.correct,
    played: r.correct + r.incorrect + r.timeout, round: r, ids: r.occurrences.map((o) => o.occurrenceId),
  }));
}

export interface CourseSegment {
  family: ModuleFamily | null;
  modules: CourseModule[];
}

/** The course's recipe: consecutive modules of one type, in played order —
 *  production's Splash ×4 · Meta Reflex · Splash ×3 · Meta Reflex · Journey.
 *  Read from the modules themselves; never a template. */
export function courseSegments(modules: CourseModule[]): CourseSegment[] {
  const out: CourseSegment[] = [];
  for (const m of modules) {
    const last = out[out.length - 1];
    // A Journey is always its own segment: one gate, many children.
    if (last && last.family === m.family && m.family !== "journey") last.modules.push(m);
    else out.push({ family: m.family, modules: [m] });
  }
  return out;
}

/**
 * The frozen review round that is this round's AUTHORITATIVE art — matched by
 * round number only (the review's own ordinal), never by position or by
 * name. Null when the review has not loaded or holds no such round.
 */
export function artRound(review: MatchReviewView | null | undefined, roundNumber: number): ReviewRound | null {
  return review?.rounds.find((r) => r.roundNumber === roundNumber) ?? null;
}

/** A module's name: a legacy `slice` is a Journey (the raw unit stays on
 *  the record); an unknown unit is a plain "Question". */
export function unitName(unit: string | null | undefined): string {
  return moduleName(unit) ?? "Question";
}

// ─────────────────────────────────────────────────────────── Survival

export interface SurvivalFloor {
  /** 1-based depth (occurrence order). */
  depth: number;
  occurrence: QuestionOccurrenceVM;
  round: RoundVM;
  /** HUB6.3C's per-question marker, never inferred here. */
  strikeIndex: number | null;
  /** Position of this floor's round on the rail (1-based). */
  railPosition: number;
}

export function survivalFloors(stage: HistoryStage, vm: StageViewModel = buildStageViewModel(stage)): SurvivalFloor[] {
  const out: SurvivalFloor[] = [];
  for (const round of vm.rounds) {
    for (const o of round.occurrences) {
      out.push({ depth: out.length + 1, occurrence: o, round, strikeIndex: o.strikeIndex, railPosition: round.position });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── Review

export interface ReviewLink {
  allocationOrdinal: number;
  replayId: string;
  replayOutcome: QuestionResult | null;
  replayPosition: number;
  replayRound: RoundVM | null;
  source: {
    stageId: string;
    stageKind: string;
    questionResultId: string;
    outcome: QuestionResult | null;
    /** The source question's rail position in its own stage, when that
     *  stage is part of this run. */
    position: number | null;
    total: number | null;
    round: RoundVM | null;
  } | null;
}

const asResult = (o: string | null | undefined): QuestionResult | null =>
  o === "correct" || o === "incorrect" || o === "timeout" ? o : null;

/** Each served Review replay, linked to its EXACT source miss where the
 *  server sent the link (HUB2.4 / HUB6.3B `review_sources`); a replay with
 *  no stored link says so — nothing is matched by content or order. */
export function reviewLinks(record: DailyHistoryRecord, review: HistoryStage): ReviewLink[] {
  const vm = buildStageViewModel(review);
  const sources = new Map((review.analytics?.personalFacts.reviewSources ?? []).map((s) => [s.questionResultId, s]));
  const stageVms = new Map(record.stages.map((s) => [s.stageId, buildStageViewModel(s)]));
  return vm.rounds.flatMap((round) => round.occurrences.map((o): ReviewLink => {
    const src = sources.get(o.occurrenceId);
    let source: ReviewLink["source"] = null;
    if (src) {
      const svm = stageVms.get(src.source.stageId) ?? null;
      const sround = svm?.rounds.find((r) => r.occurrences.some((x) => x.occurrenceId === src.source.questionResultId)) ?? null;
      source = {
        stageId: src.source.stageId, stageKind: src.source.stageKind, questionResultId: src.source.questionResultId,
        outcome: asResult(src.source.outcome), position: sround?.position ?? null, total: svm?.rounds.length ?? null,
        round: sround,
      };
    }
    return {
      allocationOrdinal: src?.allocationOrdinal ?? round.position,
      replayId: o.occurrenceId, replayOutcome: o.outcome, replayPosition: round.position, replayRound: round, source,
    };
  }));
}

// ─────────────────────────────────────────────────────────── question context

export interface QuestionContextVM {
  outcome: QuestionResult | null;
  category: { key: string; label: string } | null;
  /** This stage's C / played for the question's category (Free count). */
  stageCategory: { correct: number; played: number } | null;
  /** Premium: this exact question's earlier staged-Daily history. The
   *  counts are null when the server could not establish them — never 0. */
  prior: { exposures: number | null; correct: number | null; last: { completedAt: string; outcome: string } | null } | null;
  /** Premium: earlier compatible stages' totals for the category. */
  categoryHistory: { correct: number; played: number; accuracy: number | null; attempts: number } | null;
  strikeIndex: number | null;
  maxStrikes: number | null;
  /** Premium (Review replays): the exact miss it re-asked. */
  replays: { stageKind: string; position: number | null; outcome: QuestionResult | null } | null;
  /** Premium (source stages): its Review replay's result. */
  replayedAs: QuestionResult | null;
}

export function questionContext(
  record: DailyHistoryRecord,
  stage: HistoryStage,
  occurrence: QuestionOccurrenceVM,
  stageVms?: Map<string, StageViewModel>,
): QuestionContextVM {
  const history = stage.analytics?.personalFacts.personal?.categoryHistory ?? [];
  const key = occurrence.publicCategory?.key ?? null;
  const ch = key ? history.find((h) => h.publicCategory.key === key) : undefined;
  let replays: QuestionContextVM["replays"] = null;
  if (occurrence.reviewSource) {
    const src = occurrence.reviewSource;
    const svm = stageVms?.get(src.stageId) ?? (() => {
      const s = record.stages.find((x) => x.stageId === src.stageId);
      return s ? buildStageViewModel(s) : null;
    })();
    const round = svm?.rounds.find((r) => r.occurrences.some((o) => o.occurrenceId === src.questionResultId));
    replays = { stageKind: src.stageKind, position: round?.position ?? null, outcome: asResult(src.outcome) };
  }
  return {
    outcome: occurrence.outcome,
    category: occurrence.publicCategory
      ? { key: occurrence.publicCategory.key, label: categoryName(occurrence.publicCategory.key, occurrence.publicCategory.label) }
      : null,
    stageCategory: occurrence.stageCategory
      ? { correct: occurrence.stageCategory.correct, played: occurrence.stageCategory.questionsPlayed }
      : null,
    prior: occurrence.priorHistory
      ? {
          exposures: occurrence.priorHistory.priorExposures,
          correct: occurrence.priorHistory.priorCorrect,
          last: occurrence.priorHistory.lastPrior
            ? { completedAt: occurrence.priorHistory.lastPrior.completedAt, outcome: occurrence.priorHistory.lastPrior.outcome }
            : null,
        }
      : null,
    categoryHistory: ch ? { correct: ch.correct, played: ch.questionsPlayed, accuracy: ch.accuracy, attempts: ch.priorAttempts } : null,
    strikeIndex: occurrence.strikeIndex,
    maxStrikes: stage.kind === "survival" ? stage.basic.maxStrikes ?? stage.ruleset.maxStrikes : null,
    replays,
    replayedAs: asResult(occurrence.replayedBy?.reviewOutcome),
  };
}
