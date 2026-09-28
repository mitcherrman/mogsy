/**
 * HUB6.3E — the Survival analytics room.
 *
 *   compare     depth · correct · accuracy · strikes · longest streak ·
 *               how it ended, vs the previous Survival
 *   the tower   one floor per question, in order, down to this run's depth
 *               (the focal point), the unreached floors dashed down to the
 *               deepest reference; a Journey slot bracketed; the EXACT
 *               strike floors tagged "STRIKE 1 / 2 / 3" from HUB6.3C's
 *               per-question `strike_index` (never inferred here); previous
 *               depth, your average depth and your deepest run ruled on the
 *               same scale and named in a lane that never overlaps (HUB6.3G)
 *   shield      one plate per allowed strike, one cracked per strike used —
 *               only when the server sent the limit (never an assumed 3)
 *   records     deepest run, most correct, longest streak
 *   history     depth · accuracy · longest streak
 *   population  depth (primary) distribution; accuracy and streak dials
 */
import { useMemo, useRef } from "react";
import { CheckCheck, Flame, Castle } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { buildStageViewModel, stageCurrentFacts } from "@/components/quiz/workspace/historyViewModel";
import { occurrenceHighlight, useHighlightControls } from "@/components/quiz/workspace/historyHighlight";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage } from "@/lib/history/contracts";
import { Panel, useElementWidth } from "./charts";
import { RESULT_INK } from "./ink";
import { HistoryPanel, seriesLines } from "./roomParts";
import { PopulationPanel } from "./population";
import { RecordsPanel, StreakPanel } from "./stageShared";
import { recordOf, survivalFloors } from "./derive";
import { COMPLETION_WORDS } from "./copy";

const RUBRIC = "#7a2820";

export default function SurvivalRoom({ stage }: { stage: HistoryStage }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const h = p?.history ?? null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="survival-room">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <DepthShaft stage={stage} />
      </div>
      <RecordsPanel
        stage={stage}
        specs={[
          { metric: "depth", label: "Deepest run", glyph: Castle, shape: "hex" },
          { metric: "correct", label: "Most correct", glyph: CheckCheck, shape: "round" },
          { metric: "longest_streak", label: "Longest streak", glyph: Flame, shape: "shield" },
        ]}
      />
      <StreakPanel stage={stage} />
      {p?.eligible && (
        <div className="[@container(min-width:52rem)]:col-span-2">
          <HistoryPanel
            title="Survival history"
            currentLabel={() => "This Survival"}
            eyebrow="Your matching Survivals"
            testId="stage-history"
            series={p.series}
            metrics={[
              { id: "depth", label: "Depth", average: h?.averages.depth ?? null, record: recordOf(p, "depth")?.historicalBest ?? null },
              { id: "accuracy", label: "Accuracy", fraction: true, average: h?.historicalAccuracy ?? null },
              { id: "longestStreak", label: "Streak", average: h?.averageLongestStreak ?? null, record: recordOf(p, "longest_streak")?.historicalBest ?? null },
            ]}
            describe={(s) => seriesLines(s, <>
              {s.depth != null && <span className="block">Depth {s.depth}</span>}
              {s.strikesUsed != null && <span className="block">{s.strikesUsed} {s.strikesUsed === 1 ? "strike" : "strikes"} used</span>}
            </>)}
          />
        </div>
      )}
      <div className="[@container(min-width:52rem)]:col-span-2">
        <PopulationPanel
          block={stage.population}
          metrics={["depth", "accuracy", "longest_streak"]}
          title="Survival across Mogzy players"
          testId="stage-population"
          accent={RUBRIC}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── the tower

/** One label in the tower's right-hand lane: a strike tag or a rule's name. */
interface LaneLabel {
  key: string;
  /** Where it points: px from the tower's top. */
  at: number;
  kind: "strike" | "previous" | "average" | "deepest";
  word: string;
  value: string;
  testId: string;
  strike?: number;
  depth?: number;
}

/** Every lane label is this tall (px text, so a 200% text scale does not
 *  change it); `stackLabels` keeps them apart by it. */
const LABEL_H = 22;
const LABEL_GAP = 3;

/**
 * Lays the lane's labels top to bottom so none overlaps another: each sits
 * centred on the floor it names unless the one above is in the way, in which
 * case it drops just below it and a leader runs back to its floor. Computed
 * from the labels' own positions — never a hand-tuned offset.
 */
export function stackLabels<T extends { at: number }>(labels: T[], height = LABEL_H, gap = LABEL_GAP): Array<T & { top: number }> {
  const sorted = labels.slice().sort((a, b) => a.at - b.at);
  let floor = -Infinity;
  return sorted.map((l) => {
    const top = Math.max(l.at - height / 2, floor + gap);
    floor = top + height;
    return { ...l, top };
  });
}

type RuleKind = "previous" | "average" | "deepest";
const RULE_INK: Readonly<Record<RuleKind, string>> = {
  previous: LEAGUECRAFT_INK.body,
  average: LEAGUECRAFT_INK.faint,
  deepest: "#7a5610",
};
const RULE_DASH: Readonly<Record<RuleKind, string>> = { previous: "dashed", average: "dotted", deepest: "solid" };

/**
 * The depth tower (HUB6.3G, after HUB6.3E v1's): one floor per question from
 * floor 1 at the top down to this run's depth, each drawn as its result, and
 * — dashed — the unreached floors down to the deepest reference, so previous,
 * average and deepest are rules on one scale. The EXACT strike floors carry
 * "STRIKE n" tags from HUB6.3C's `strike_index` (nothing inferred); the rules
 * are named in the same lane, stacked so nothing overlaps.
 */
function DepthShaft({ stage }: { stage: HistoryStage }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const floors = useMemo(() => survivalFloors(stage, vm), [stage, vm]);
  const f = stageCurrentFacts(stage);
  const p = stage.analytics?.personalFacts.personal ?? null;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1600, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHighlightControls();
  const depth = f.depth ?? floors.length;
  const previous = p?.eligible ? p.previous?.depth ?? null : null;
  const average = p?.history?.averages.depth ?? null;
  const best = recordOf(p, "depth")?.historicalBest ?? null;
  const bottom = Math.max(depth, floors.length, previous ?? 0, Math.ceil(average ?? 0), best ?? 0, 1);
  // Touch is phone-sized: shorter floors keep a deep run from towering.
  const FLOOR = coarse ? 9 : 12;
  // Horizontal geometry in px (a 200% text scale must not widen it): the
  // floor-number gutter, the tower, a 20px leader gap, then the label lane,
  // which needs ~66px. On a very narrow panel the gutter goes and the tower
  // gives way to the lane.
  const boxRef = useRef<HTMLDivElement>(null);
  const { width: boxWidth } = useElementWidth(boxRef);
  const compact = boxWidth > 0 && boxWidth < 230;
  const GUTTER = compact ? 0 : 28;
  const LANE = 70;
  const TOWER = boxWidth > 0
    ? Math.max(36, Math.min(208, Math.round(boxWidth * 0.48), boxWidth - GUTTER - 20 - LANE))
    : 160;
  const height = bottom * FLOOR;
  const pr = reveal.progress;
  const grown = Math.round(floors.length * Math.min(1, pr / 0.75));
  const strikes = floors.filter((fl) => fl.strikeIndex !== null).sort((a, b) => a.strikeIndex! - b.strikeIndex!);
  const strikeShown = (k: number) => pr >= 1 || staggered(Math.max(0, (pr - 0.72) / 0.28), k, Math.max(1, strikes.length), 0.5) > 0.3;
  const rulesShown = pr >= 0.7;
  const ended = f.completionReason ? COMPLETION_WORDS[f.completionReason] : null;
  // Journey (multi-question) slots, bracketed on the tower's left edge.
  const brackets = vm.rounds.filter((r) => r.occurrences.length > 1).map((r) => {
    const first = floors.findIndex((fl) => fl.round === r);
    return { round: r, from: first, to: first + r.occurrences.length };
  });
  const fmtAvg = (v: number) => v.toFixed(1).replace(/\.0$/, "");

  const lane: LaneLabel[] = strikes.map((fl) => ({
    key: `strike-${fl.strikeIndex}`, at: (fl.depth - 0.5) * FLOOR, kind: "strike" as const,
    word: "Strike", value: String(fl.strikeIndex), testId: "shaft-strike", strike: fl.strikeIndex!, depth: fl.depth,
  }));
  if (previous !== null) lane.push({ key: "previous", at: previous * FLOOR, kind: "previous", word: "Previous", value: String(previous), testId: "shaft-previous" });
  if (average !== null) lane.push({ key: "average", at: average * FLOOR, kind: "average", word: "Average", value: fmtAvg(average), testId: "shaft-average" });
  if (best !== null) lane.push({ key: "deepest", at: best * FLOOR, kind: "deepest", word: "Deepest", value: String(best), testId: "shaft-deepest" });
  const placed = stackLabels(lane);
  // The lane may reach past the tower's ends (a label stacked below the last
  // floor, or centred on floor 1): the box grows to hold it.
  const laneTop = Math.min(0, ...placed.map((l) => l.top));
  const laneBottom = Math.max(height, ...placed.map((l) => l.top + LABEL_H));
  const strikeOrder = new Map(strikes.map((fl, k) => [fl.strikeIndex, k]));
  const isShown = (l: LaneLabel) => (l.kind === "strike" ? strikeShown(strikeOrder.get(l.strike ?? -1) ?? 0) : rulesShown);
  const ruleKind = (l: LaneLabel) => l.kind as RuleKind;

  const strikeKey = (k: number) => `${stage.stageId}:strike:${k}`;
  const strikeHl = (fl: (typeof floors)[number]) => ({
    ...occurrenceHighlight(stage, [fl.occurrence.occurrenceId], strikeKey(fl.strikeIndex!)),
    label: `Strike ${fl.strikeIndex} · question ${fl.railPosition}`,
  });

  return (
    <Panel title="The descent" eyebrow="Survival depth" testId="survival-shaft">
      <div ref={reveal.ref} className="grid min-w-0 gap-x-6 gap-y-4 [@container(min-width:34rem)]:grid-cols-[minmax(15rem,24rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div
            ref={boxRef}
            className="relative min-w-0"
            style={{ height: laneBottom - laneTop }}
            role="img"
            aria-label={`Depth ${depth}: ${f.correct} correct, ${f.incorrect} incorrect, ${f.timeout} timed out${strikes.length ? `; strikes at depths ${strikes.map((s) => s.depth).join(", ")}` : ""}${previous !== null ? `; previous depth ${previous}` : ""}${average !== null ? `; your average ${fmtAvg(average)}` : ""}${best !== null ? `; deepest ${best}` : ""}.`}
            data-testid="shaft"
            data-floor={FLOOR}
            data-compact={compact ? "true" : undefined}
          >
            <div className="absolute inset-x-0" style={{ top: -laneTop, height }}>
              {/* Floor numbers: 1, then every fifth. */}
              {!compact && <div aria-hidden="true" className="absolute left-0 top-0 w-[24px]" style={{ height }}>
                {Array.from({ length: bottom }, (_, i) => (i === 0 || (i + 1) % 5 === 0) && (
                  <span key={i} className="absolute right-1 text-[8.5px] tabular-nums leading-none" style={{ top: i * FLOOR + FLOOR / 2 - 4, color: LEAGUECRAFT_INK.faint }}>
                    {i + 1}
                  </span>
                ))}
              </div>}
              {/* The tower: lighter at the surface, darker with depth. */}
              <div className="absolute top-0" style={{ left: GUTTER, width: TOWER, height }}>
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 block rounded-sm"
                  style={{ background: "linear-gradient(180deg, rgba(83,56,8,0.04), rgba(83,56,8,0.22))", border: "1px solid rgba(96,68,28,0.32)" }}
                />
                {Array.from({ length: bottom }, (_, i) => {
                  const fl = floors[i];
                  if (!fl || i >= grown) {
                    return (
                      <span
                        key={`e${i}`}
                        aria-hidden="true"
                        data-testid={fl ? undefined : "shaft-unreached"}
                        className="absolute inset-x-0 block rounded-[2px]"
                        style={{ top: i * FLOOR + 1, height: FLOOR - 2, border: `1px dashed rgba(96,68,28,${fl ? 0.35 : 0.2})` }}
                      />
                    );
                  }
                  const o = fl.occurrence.outcome;
                  return (
                    <span
                      key={fl.occurrence.occurrenceId}
                      aria-hidden="true"
                      data-testid="shaft-floor"
                      data-outcome={o ?? "unknown"}
                      data-strike={fl.strikeIndex ?? undefined}
                      className="absolute inset-x-0 block rounded-[2px]"
                      onPointerEnter={(e) => e.pointerType !== "touch" && preview(occurrenceHighlight(stage, [fl.occurrence.occurrenceId]))}
                      onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                      style={{
                        top: i * FLOOR + 1, height: FLOOR - 2,
                        background: o === "correct"
                          ? "rgba(44,122,75,0.6)"
                          : o === "incorrect"
                            ? `repeating-linear-gradient(45deg, ${RESULT_INK.incorrect} 0 3px, #c46a5c 3px 4.5px)`
                            : o === "timeout"
                              ? `radial-gradient(circle, rgba(255,240,220,0.7) 0.9px, transparent 1.2px) 0 0/4px 4px, ${RESULT_INK.timeout}`
                              : "rgba(96,68,28,0.3)",
                        boxShadow: fl.strikeIndex !== null ? `inset 0 0 0 1.5px ${RUBRIC}` : undefined,
                      }}
                    />
                  );
                })}
                {brackets.map((b) => (
                  <span
                    key={b.round.roundNumber}
                    aria-hidden="true"
                    className="absolute -left-2.5 block w-[4px] rounded-full"
                    style={{ top: b.from * FLOOR + 1, height: (b.to - b.from) * FLOOR - 2, background: "rgba(122,40,32,0.6)", opacity: grown > b.from ? 1 : 0 }}
                    data-testid="shaft-journey"
                  />
                ))}
                {/* The reference rules, across the tower. */}
                {placed.filter((l) => l.kind !== "strike").map((l) => (
                  <span
                    key={`rule-${l.key}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-x-1 block"
                    style={{ top: l.at - 1, borderTop: `2px ${RULE_DASH[ruleKind(l)]} ${RULE_INK[ruleKind(l)]}`, opacity: rulesShown ? 1 : 0 }}
                    data-testid={`${l.testId}-rule`}
                  />
                ))}
              </div>
              {/* Leaders from each floor or rule to its (stacked) label. */}
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute top-0 overflow-visible"
                style={{ left: GUTTER + TOWER + 4, height, width: 14 }}
              >
                {placed.map((l) => (
                  <line
                    key={l.key}
                    x1={0} y1={l.at} x2={14} y2={l.top + LABEL_H / 2}
                    stroke={l.kind === "strike" ? RUBRIC : RULE_INK[ruleKind(l)]}
                    strokeWidth={1.25}
                    strokeDasharray={l.kind === "strike" ? undefined : "2 2"}
                    opacity={isShown(l) ? 1 : 0}
                  />
                ))}
              </svg>
              {/* The lane: strike tags and rule names, never overlapping. */}
              <div aria-hidden="true" className="absolute top-0" style={{ left: GUTTER + TOWER + 20, right: 0, height }}>
                {placed.map((l) => {
                  const shown = isShown(l);
                  return l.kind === "strike" ? (
                    <span
                      key={l.key}
                      data-testid={l.testId}
                      data-strike={l.strike}
                      data-depth={l.depth}
                      data-top={Math.round(l.top)}
                      className="absolute left-0 flex items-center whitespace-nowrap pl-2.5 pr-1.5 text-[9.5px] font-black uppercase tracking-[0.08em] transition-transform duration-300 motion-reduce:transition-none"
                      style={{
                        top: l.top, height: LABEL_H, color: "#fff3df", background: RUBRIC,
                        clipPath: "polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%)",
                        transform: `scale(${shown ? 1 : 0})`, transformOrigin: "left center",
                      }}
                    >
                      {l.word} {l.value}
                    </span>
                  ) : (
                    <span
                      key={l.key}
                      data-testid={l.testId}
                      data-top={Math.round(l.top)}
                      className="absolute left-0 flex flex-col justify-center whitespace-nowrap rounded-sm border-l-2 pl-1 pr-1 leading-none"
                      style={{ top: l.top, height: LABEL_H, borderColor: RULE_INK[ruleKind(l)], color: RULE_INK[ruleKind(l)], opacity: shown ? 1 : 0, background: "rgba(246,236,210,0.85)" }}
                    >
                      <span className="text-[8px] font-bold uppercase tracking-[0.12em]">{l.word}</span>
                      <span className="text-[11px] font-black tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{l.value}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          {/* The run's depth: the focal point. */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2" style={{ paddingLeft: GUTTER }} aria-hidden="true">
            <span className="text-[9.5px] font-black uppercase tracking-[0.14em]" style={{ color: RUBRIC }}>Depth</span>
            <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }} data-testid="shaft-depth">
              {Math.round(depth * Math.min(1, pr / 0.75))}
            </span>
            <span className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>floor 1 at the top · one per question</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <StrikeShield used={f.strikesUsed} max={f.maxStrikes} progress={pr} ended={ended} />
          {strikes.length > 0 && (
            <ul className="grid gap-1" aria-label="Strikes, where they happened" data-testid="strike-list">
              {strikes.map((fl) => {
                const k = strikeKey(fl.strikeIndex!);
                const on = locked?.key === k;
                const o = fl.occurrence.outcome;
                return (
                  <li key={fl.strikeIndex}>
                    <button
                      type="button"
                      aria-pressed={on}
                      data-testid="strike-item"
                      data-strike={fl.strikeIndex!}
                      data-position={fl.railPosition}
                      onPointerEnter={(e) => e.pointerType !== "touch" && preview(strikeHl(fl))}
                      onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                      onFocus={() => preview(strikeHl(fl))}
                      onBlur={() => preview(null)}
                      onClick={() => toggleLock(strikeHl(fl))}
                      className={`flex w-full min-w-0 items-center gap-2 rounded-md border px-2 text-left text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[30px]"}`}
                      style={{ borderColor: on ? LEAGUECRAFT_INK.strong : "rgba(122,40,32,0.3)", background: on ? "rgba(122,40,32,0.1)" : "rgba(255,249,233,0.3)", color: LEAGUECRAFT_INK.body }}
                    >
                      <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center text-[10px] font-black" style={{ color: "#fff3df", background: RUBRIC, clipPath: "polygon(50% 0, 100% 18%, 100% 60%, 50% 100%, 0 60%, 0 18%)" }}>
                        {fl.strikeIndex}
                      </span>
                      <span className="min-w-0">
                        <strong style={{ color: LEAGUECRAFT_INK.strong }}>Strike {fl.strikeIndex}</strong> at depth {fl.depth}
                        <span style={{ color: LEAGUECRAFT_INK.faint }}>
                          {" "}· question {fl.railPosition}{fl.round.occurrences.length > 1 ? " (Journey)" : ""} · {o === "timeout" ? "timed out" : "incorrect"}
                          {fl.occurrence.publicCategory ? ` · ${fl.occurrence.publicCategory.key === "general" ? "General" : fl.occurrence.publicCategory.label}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="shaft-key">
            {previous !== null && <KeyRule kind="previous" label="Previous Survival" />}
            {average !== null && <KeyRule kind="average" label="Your average" />}
            {best !== null && <KeyRule kind="deepest" label="Deepest run" />}
            {brackets.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-3 w-[4px] rounded-full" style={{ background: "rgba(122,40,32,0.6)" }} />
                Journey slot
              </span>
            )}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function KeyRule({ kind, label }: { kind: RuleKind; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="inline-block w-4" style={{ borderTop: `2px ${RULE_DASH[kind]} ${RULE_INK[kind]}` }} />
      {label}
    </span>
  );
}

/**
 * The strike shield: one plate per ALLOWED strike, one cracked per strike
 * used — drawn only when the server sent the limit (`max_strikes`); a limit
 * is never assumed. The count is printed too, and only when the server sent
 * it (`strikes_used`); an unknown count stays unsaid.
 */
function StrikeShield({ used, max, progress, ended }: { used: number | null; max: number | null; progress: number; ended: string | null }) {
  if (used === null && !ended) return null;
  const known = max !== null && max >= 1;
  const plates = known ? Math.min(6, max) : 0;
  const cracks = used ?? 0;
  const on = (i: number) => i < cracks && (progress >= 1 || progress > 0.72 + (i / Math.max(1, plates)) * 0.25);
  const polar = (turn: number, r: number) => [50 + r * Math.sin(turn * Math.PI * 2), 50 - r * Math.cos(turn * Math.PI * 2)];
  const line = used === null ? null : known ? `${used} of ${max} strikes used` : `${used} ${used === 1 ? "strike" : "strikes"} used`;
  return (
    <div className="flex items-center gap-3" data-testid="strike-shield" data-used={used ?? undefined} data-max={known ? max : undefined}>
      {known && used !== null && (
        <svg viewBox="0 0 100 100" width={64} height={64} role="img" aria-label={`${used} of ${max} strikes used`}>
          {Array.from({ length: plates }, (_, i) => {
            const a0 = i / plates + 0.02;
            const a1 = (i + 1) / plates - 0.02;
            const [x0, y0] = polar(a0, 44);
            const [x1, y1] = polar(a1, 44);
            const [x2, y2] = polar(a1, 28);
            const [x3, y3] = polar(a0, 28);
            const cracked = on(i);
            const [cx, cy] = polar((a0 + a1) / 2, 36);
            return (
              <g key={i}>
                <path
                  d={`M${x0},${y0} A44,44 0 0 1 ${x1},${y1} L${x2},${y2} A28,28 0 0 0 ${x3},${y3} Z`}
                  fill={cracked ? RUBRIC : "rgba(255,249,233,0.6)"}
                  stroke={cracked ? "#4a1410" : "rgba(122,40,32,0.45)"}
                  strokeWidth={1.5}
                  data-testid="shield-plate"
                  data-cracked={cracked ? "true" : "false"}
                />
                {cracked && <path d={`M${cx - 4},${cy - 4} L${cx + 1},${cy} L${cx - 2},${cy + 2} L${cx + 4},${cy + 5}`} fill="none" stroke="#f6ecd2" strokeWidth={1.4} />}
              </g>
            );
          })}
          <text x={50} y={57} textAnchor="middle" fontSize={20} fontWeight={900} fill={LEAGUECRAFT_INK.strong}>{used}</text>
        </svg>
      )}
      <div className="min-w-0">
        {line && <div className="text-[13px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="strike-count">{line}</div>}
        {ended && <div className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>{ended}</div>}
      </div>
    </div>
  );
}
