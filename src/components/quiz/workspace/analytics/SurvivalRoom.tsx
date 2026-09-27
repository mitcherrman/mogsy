/**
 * HUB6.3E — the Survival analytics room.
 *
 *   compare     depth · correct · accuracy · strikes · longest streak ·
 *               how it ended, vs the previous Survival
 *   the shaft   one floor per question, in order, down to this run's depth
 *               (the focal point); a Journey slot bracketed; the EXACT
 *               strike floors badged 1 / 2 / 3 from HUB6.3C's per-question
 *               `strike_index` (never inferred here); previous depth, your
 *               average depth and your deepest run ruled on the same shaft
 *   shield      three plates, one cracked per strike used
 *   records     deepest run, most correct, longest streak
 *   history     depth · accuracy · longest streak
 *   population  depth (primary) distribution; accuracy and streak dials
 */
import { useMemo } from "react";
import { CheckCheck, Flame, Castle } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { buildStageViewModel, stageCurrentFacts } from "@/components/quiz/workspace/historyViewModel";
import { occurrenceHighlight, useHighlightControls } from "@/components/quiz/workspace/historyHighlight";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage } from "@/lib/history/contracts";
import { Panel } from "./charts";
import { RESULT_INK } from "./ink";
import { HistoryPanel, seriesLines } from "./roomParts";
import { PopulationPanel } from "./population";
import { RecordsPanel, StageCompare, StreakPanel } from "./stageShared";
import { recordOf, survivalFloors } from "./derive";
import { COMPLETION_WORDS } from "./copy";

const RUBRIC = "#7a2820";

export default function SurvivalRoom({ stage }: { stage: HistoryStage }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const h = p?.history ?? null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="survival-room">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <StageCompare stage={stage} fields={["depth", "correct", "accuracy", "strikes", "streak", "ended"]} />
      </div>
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

// ─────────────────────────────────────────────────────────── the shaft

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
  const deepest = recordOf(p, "depth");
  const best = deepest?.historicalBest ?? null;
  const bottom = Math.max(depth, previous ?? 0, Math.ceil(average ?? 0), best ?? 0, 1);
  const FLOOR = 8; // px per floor
  const height = bottom * FLOOR;
  const pr = reveal.progress;
  const grown = Math.round(floors.length * Math.min(1, pr / 0.75));
  const strikes = floors.filter((fl) => fl.strikeIndex !== null).sort((a, b) => a.strikeIndex! - b.strikeIndex!);
  const strikeShown = (k: number) => pr >= 1 || staggered(Math.max(0, (pr - 0.72) / 0.28), k, Math.max(1, strikes.length), 0.5) > 0.3;
  const maxStrikes = f.maxStrikes ?? 3;
  const ended = f.completionReason ? COMPLETION_WORDS[f.completionReason] : null;
  // Journey (multi-question) slots, bracketed on the shaft's left.
  const brackets = vm.rounds.filter((r) => r.occurrences.length > 1).map((r) => {
    const first = floors.findIndex((fl) => fl.round === r);
    return { round: r, from: first, to: first + r.occurrences.length };
  });
  const rule = (v: number, label: string, style: string, testId: string, color: string) => (
    <div
      key={testId}
      className="pointer-events-none absolute inset-x-0 flex items-center"
      style={{ top: v * FLOOR - 1 }}
      data-testid={testId}
    >
      <span className="block h-0 flex-1" style={{ borderTop: `2px ${style} ${color}` }} />
      <span className="ml-1 whitespace-nowrap rounded px-1 text-[9.5px] font-bold tabular-nums leading-tight" style={{ color, background: "rgba(246,236,210,0.9)" }}>
        {label}
      </span>
    </div>
  );
  const strikeKey = (k: number) => `${stage.stageId}:strike:${k}`;
  const strikeHl = (fl: (typeof floors)[number]) => ({
    ...occurrenceHighlight(stage, [fl.occurrence.occurrenceId], strikeKey(fl.strikeIndex!)),
    label: `Strike ${fl.strikeIndex} · question ${fl.railPosition}`,
  });

  return (
    <Panel title="The descent" eyebrow="Survival depth" testId="survival-shaft">
      <div ref={reveal.ref} className="grid min-w-0 gap-x-5 gap-y-4 [@container(min-width:30rem)]:grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)]">
        {/* The shaft: floor 1 at the top, the run's depth at the bottom. */}
        <div className="relative min-w-0 pb-7 pl-4 pr-16" role="img"
          aria-label={`Depth ${depth}: ${f.correct} correct, ${f.incorrect} incorrect, ${f.timeout} timed out${strikes.length ? `; strikes at questions ${strikes.map((s) => s.depth).join(", ")}` : ""}${previous !== null ? `; previous depth ${previous}` : ""}${average !== null ? `; your average ${average.toFixed(1)}` : ""}${best !== null ? `; deepest ${best}` : ""}.`}
          data-testid="shaft">
          <div className="relative" style={{ height }}>
            {/* The walls. */}
            <span aria-hidden="true" className="absolute -inset-y-1 left-0 right-0 block rounded-sm" style={{ background: "linear-gradient(90deg, rgba(83,56,8,0.14), rgba(83,56,8,0.04) 40%, rgba(83,56,8,0.14))", border: "1px solid rgba(96,68,28,0.3)" }} />
            {floors.slice(0, grown).map((fl, i) => {
              const o = fl.occurrence.outcome;
              return (
                <span
                  key={fl.occurrence.occurrenceId}
                  aria-hidden="true"
                  data-testid="shaft-floor"
                  data-outcome={o ?? "unknown"}
                  data-strike={fl.strikeIndex ?? undefined}
                  className="absolute left-1 right-1 block rounded-[2px]"
                  onPointerEnter={(e) => e.pointerType !== "touch" && preview(occurrenceHighlight(stage, [fl.occurrence.occurrenceId]))}
                  onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                  style={{
                    top: i * FLOOR + 1, height: FLOOR - 2,
                    background: o === "correct"
                      ? "rgba(44,122,75,0.55)"
                      : o === "incorrect"
                        ? `repeating-linear-gradient(45deg, ${RESULT_INK.incorrect} 0 3px, #c46a5c 3px 4.5px)`
                        : `radial-gradient(circle, rgba(255,240,220,0.7) 0.9px, transparent 1.2px) 0 0/4px 4px, ${RESULT_INK.timeout}`,
                  }}
                />
              );
            })}
            {brackets.map((b) => (
              <span key={b.round.roundNumber} aria-hidden="true" className="absolute -left-3 block w-2 rounded-l-sm"
                style={{ top: b.from * FLOOR + 1, height: (b.to - b.from) * FLOOR - 2, border: "1.5px solid rgba(122,40,32,0.6)", borderRight: "none", opacity: grown > b.from ? 1 : 0 }}
                data-testid="shaft-journey" />
            ))}
            {pr >= 0.7 && previous !== null && previous !== depth && rule(previous, `Prev ${previous}`, "dashed", "shaft-previous", LEAGUECRAFT_INK.body)}
            {pr >= 0.7 && average !== null && rule(average, `Avg ${average.toFixed(1).replace(/\.0$/, "")}`, "dotted", "shaft-average", LEAGUECRAFT_INK.faint)}
            {pr >= 0.7 && best !== null && best !== depth && rule(best, `Deepest ${best}`, "solid", "shaft-deepest", "#7a5610")}
            {strikes.map((fl, k) => (
              <span
                key={fl.strikeIndex}
                aria-hidden="true"
                data-testid="shaft-strike"
                data-strike={fl.strikeIndex!}
                data-depth={fl.depth}
                className="absolute -right-8 grid h-5 w-5 place-items-center text-[10px] font-black tabular-nums transition-transform duration-300 motion-reduce:transition-none"
                style={{
                  top: (fl.depth - 1) * FLOOR + FLOOR / 2 - 10,
                  color: "#fff3df", background: RUBRIC,
                  clipPath: "polygon(50% 0, 100% 18%, 100% 60%, 50% 100%, 0 60%, 0 18%)",
                  transform: `scale(${strikeShown(k) ? 1 : 0})`,
                }}
              >
                {fl.strikeIndex}
              </span>
            ))}
          </div>
          {/* The run's depth: the focal point. */}
          <div className="absolute bottom-0 left-4 right-16 flex items-baseline justify-between gap-2" aria-hidden="true">
            <span className="text-[9.5px] font-black uppercase tracking-[0.14em]" style={{ color: RUBRIC }}>Depth</span>
            <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }} data-testid="shaft-depth">
              {Math.round(depth * Math.min(1, pr / 0.75))}
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <StrikeShield used={f.strikesUsed ?? strikes.length} max={maxStrikes} progress={pr} ended={ended} />
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
          <dl className="grid grid-cols-3 gap-2 text-center" data-testid="shaft-figures">
            {[
              ["Previous", previous],
              ["Your average", average !== null ? Number(average.toFixed(1)) : null],
              ["Deepest", best],
            ].map(([label, v]) => (
              <div key={label as string} className="min-w-0 rounded-md border px-1 py-1.5" style={{ borderColor: "rgba(96,68,28,0.2)" }}>
                <dt className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: LEAGUECRAFT_INK.faint }}>{label}</dt>
                <dd className="text-[16px] font-black tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{v === null ? "—" : v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Panel>
  );
}

/** Three plates round a boss; one cracks per strike used. The count is
 *  printed too — the plates are never the only statement. */
function StrikeShield({ used, max, progress, ended }: { used: number; max: number; progress: number; ended: string | null }) {
  const plates = Math.max(1, Math.min(6, max));
  const arcs = Array.from({ length: plates }, (_, i) => i);
  const on = (i: number) => i < used && (progress >= 1 || progress > 0.72 + (i / plates) * 0.25);
  const polar = (turn: number, r: number) => [50 + r * Math.sin(turn * Math.PI * 2), 50 - r * Math.cos(turn * Math.PI * 2)];
  return (
    <div className="flex items-center gap-3" data-testid="strike-shield" data-used={used} data-max={max}>
      <svg viewBox="0 0 100 100" width={64} height={64} role="img" aria-label={`${used} of ${max} strikes used`}>
        {arcs.map((i) => {
          const a0 = i / plates + 0.02;
          const a1 = (i + 1) / plates - 0.02;
          const [x0, y0] = polar(a0, 44);
          const [x1, y1] = polar(a1, 44);
          const [x2, y2] = polar(a1, 28);
          const [x3, y3] = polar(a0, 28);
          const cracked = on(i);
          return (
            <g key={i}>
              <path d={`M${x0},${y0} A44,44 0 0 1 ${x1},${y1} L${x2},${y2} A28,28 0 0 0 ${x3},${y3} Z`}
                fill={cracked ? RUBRIC : "rgba(255,249,233,0.6)"} stroke={cracked ? "#4a1410" : "rgba(122,40,32,0.45)"} strokeWidth={1.5}
                data-testid="shield-plate" data-cracked={cracked ? "true" : "false"} />
              {cracked && (() => {
                const [cx, cy] = polar((a0 + a1) / 2, 36);
                return <path d={`M${cx - 4},${cy - 4} L${cx + 1},${cy} L${cx - 2},${cy + 2} L${cx + 4},${cy + 5}`} fill="none" stroke="#f6ecd2" strokeWidth={1.4} />;
              })()}
            </g>
          );
        })}
        <text x={50} y={57} textAnchor="middle" fontSize={20} fontWeight={900} fill={LEAGUECRAFT_INK.strong}>{used}</text>
      </svg>
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong }}>{used} of {max} strikes used</div>
        {ended && <div className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>{ended}</div>}
      </div>
    </div>
  );
}

