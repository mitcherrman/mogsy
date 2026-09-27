/**
 * HUB6.3E — the Standard analytics room.
 *
 *   compare     score · correct · accuracy · longest streak vs the previous
 *   records     highest score (star), most correct (round), longest streak
 *               (shield)
 *   history     score · accuracy · longest streak
 *   course      the ten production modules in played order — Splash ×4,
 *               Meta Reflex, Splash ×3, Meta Reflex, Journey (five
 *               children) — from the frozen recipe's unit per round
 *               (`stage.modules`), each with its result and C / played;
 *               hover / focus lights its exact questions, click locks them
 *   donut       result × public category
 *   streak      chain + flame
 *   population  score (primary) distribution; accuracy and streak dials
 */
import { useMemo, useState } from "react";
import { CheckCheck, Droplet, Flag, Flame, Layers, Star, Trophy, Zap } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { runHighlight, useHistoryHighlight } from "@/components/quiz/workspace/historyHighlight";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage } from "@/lib/history/contracts";
import { OutcomeMark, Panel } from "./charts";
import { RESULT_INK, categoryInk } from "./ink";
import { HistoryPanel, seriesLines } from "./roomParts";
import { PopulationPanel } from "./population";
import { CategoryDonut, RecordsPanel, StageCompare, StreakPanel } from "./stageShared";
import { UNIT_NAME, courseModules, recordOf, type CourseModule } from "./derive";

export default function StandardRoom({ stage }: { stage: HistoryStage }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const h = p?.history ?? null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="standard-room">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <StageCompare stage={stage} fields={["score", "correct", "accuracy", "streak"]} />
      </div>
      <div className="[@container(min-width:52rem)]:col-span-2">
        <CourseMap stage={stage} />
      </div>
      <RecordsPanel
        stage={stage}
        specs={[
          { metric: "score", label: "Highest score", glyph: Trophy, shape: "star" },
          { metric: "correct", label: "Most correct", glyph: CheckCheck, shape: "round" },
          { metric: "longest_streak", label: "Longest streak", glyph: Flame, shape: "shield" },
        ]}
      />
      {p?.eligible && (
        <HistoryPanel
          title="Standard history"
          eyebrow="Your matching Standards"
          testId="stage-history"
          series={p.series}
          metrics={[
            { id: "score", label: "Score", average: h?.averages.score ?? null, record: recordOf(p, "score")?.historicalBest ?? null },
            { id: "accuracy", label: "Accuracy", fraction: true, average: h?.historicalAccuracy ?? null },
            { id: "longestStreak", label: "Streak", average: h?.averageLongestStreak ?? null, record: recordOf(p, "longest_streak")?.historicalBest ?? null },
          ]}
          describe={(s) => seriesLines(s, s.score != null ? <span className="block">Score {s.score}</span> : null)}
        />
      )}
      <CategoryDonut stage={stage} title="Every question, by result and category" />
      <StreakPanel stage={stage} />
      <div className="[@container(min-width:52rem)]:col-span-2">
        <PopulationPanel
          block={stage.population}
          metrics={["score", "accuracy", "longest_streak"]}
          title="Standard across Mogzy players"
          testId="stage-population"
          accent="rgb(29, 79, 138)"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── course

const UNIT_ICON = { splash: Droplet, meta_reflex: Zap, journey: Layers } as const;

function moduleVerdict(m: CourseModule): "correct" | "incorrect" | "timeout" | "mixed" | null {
  const r = m.round;
  if (!r) return m.played === 0 ? null : m.correct === m.played ? "correct" : "mixed";
  return r.verdict;
}

/**
 * The course: the stage's modules on one road, start flag to finish. A
 * module's shape is its unit — a square Splash tile, a round Meta Reflex
 * seal, a double-ringed Journey gate with its children as pips — its ring is
 * its result, and a multi-question module reads "4/5". Nodes resolve in
 * played order.
 */
function CourseMap({ stage }: { stage: HistoryStage }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const modules = useMemo(() => courseModules(stage, vm), [stage, vm]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1400, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHistoryHighlight();
  const [focus, setFocus] = useState<number | null>(null);
  if (modules.length === 0) return null;
  const n = modules.length;
  const keyOf = (m: CourseModule) => `${stage.stageId}:module:${m.roundNumber}`;
  const hl = (m: CourseModule) => runHighlight(m.ids, {
    key: keyOf(m), stageIds: [stage.stageId],
    label: `Module ${m.position} · ${UNIT_NAME[m.unit ?? ""] ?? "Question"}`,
  });
  const active = focus !== null ? modules[focus] : modules.find((m) => locked?.key === keyOf(m)) ?? null;
  const unitCounts = modules.reduce<Record<string, number>>((a, m) => ({ ...a, [m.unit ?? "?"]: (a[m.unit ?? "?"] ?? 0) + 1 }), {});

  return (
    <Panel
      title="The course"
      eyebrow={`${n} modules · ${Object.entries(unitCounts).map(([u, c]) => `${UNIT_NAME[u] ?? "Question"} ×${c}`).join(" · ")}`}
      testId="standard-course"
    >
      <div ref={reveal.ref} className="min-w-0">
        <ol
          className="relative flex flex-wrap items-start gap-y-4 pr-2 [@container(min-width:40rem)]:flex-nowrap"
          aria-label="Standard modules in played order"
          data-testid="course-modules"
          data-count={n}
        >
          <li className="flex items-start" aria-hidden="true">
            <span className="mt-[10px] grid h-7 w-7 place-items-center rounded-full border" style={{ borderColor: "rgba(29,79,138,0.45)", color: "rgb(29,79,138)" }}>
              <Flag className="h-3.5 w-3.5" />
            </span>
          </li>
          {modules.map((m, i) => {
            const shown = reveal.progress >= 1 || staggered(reveal.progress, i, n, 0.7) > 0.05;
            const verdict = moduleVerdict(m);
            const ring = verdict === "correct" || verdict === "incorrect" || verdict === "timeout" ? RESULT_INK[verdict] : "rgba(138,106,44,0.85)";
            const Icon = UNIT_ICON[(m.unit ?? "splash") as keyof typeof UNIT_ICON] ?? Droplet;
            const cat = m.round?.occurrences[0]?.publicCategory?.key ?? null;
            const isLocked = locked?.key === keyOf(m);
            const unit = m.unit ?? "splash";
            const size = unit === "journey" ? 52 : 44;
            const label = `Module ${m.position} of ${n}, ${UNIT_NAME[unit] ?? "Question"}${m.played > 1 ? `, ${m.correct} of ${m.played} correct` : verdict === "correct" ? ", correct" : verdict === "incorrect" ? ", incorrect" : verdict === "timeout" ? ", timed out" : ""}`;
            return (
              <li key={m.roundNumber} className="flex items-start [@container(min-width:40rem)]:flex-1">
                <span
                  aria-hidden="true"
                  className="mt-[23px] block h-[3px] w-2.5 shrink-0 origin-left rounded-full transition-transform duration-200 motion-reduce:transition-none [@container(min-width:40rem)]:w-auto [@container(min-width:40rem)]:flex-1"
                  style={{ background: "repeating-linear-gradient(90deg, rgba(29,79,138,0.55) 0 4px, transparent 4px 6px)", transform: `scaleX(${shown ? 1 : 0})` }}
                />
                <div className="flex flex-col items-center gap-1" style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(5px) scale(0.85)", transition: "opacity 200ms, transform 240ms" }}>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={isLocked}
                    data-testid="course-module"
                    data-unit={unit}
                    data-played={m.played}
                    data-correct={m.correct}
                    data-outcome={verdict ?? "unknown"}
                    onPointerEnter={(e) => { if (e.pointerType !== "touch") { setFocus(i); preview(hl(m)); } }}
                    onPointerLeave={(e) => { if (e.pointerType !== "touch") { setFocus(null); preview(null); } }}
                    onFocus={() => { setFocus(i); preview(hl(m)); }}
                    onBlur={() => { setFocus(null); preview(null); }}
                    onClick={() => toggleLock(hl(m))}
                    className={`relative grid shrink-0 place-items-center transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${unit === "meta_reflex" ? "rounded-full" : unit === "journey" ? "rounded-xl" : "rounded-md"}`}
                    style={{
                      width: coarse ? Math.max(44, size) : size, height: coarse ? Math.max(44, size) : size,
                      background: unit === "splash" ? "rgba(255,249,233,0.55)" : "rgba(29,79,138,0.1)",
                      border: `2.5px ${verdict === "timeout" ? "dashed" : "solid"} ${ring}`,
                      boxShadow: [
                        unit === "journey" ? `0 0 0 2px #efe2c2, 0 0 0 4px rgba(29,79,138,0.55)` : null,
                        isLocked ? `0 0 0 ${unit === "journey" ? 6 : 3}px #b4862a` : null,
                      ].filter(Boolean).join(", ") || undefined,
                    }}
                  >
                    <Icon className={unit === "journey" ? "h-5 w-5" : "h-4 w-4"} style={{ color: "rgb(29,79,138)" }} aria-hidden="true" />
                    {unit === "splash" && cat && (
                      <span aria-hidden="true" className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: categoryInk(cat) }} />
                    )}
                    {verdict && verdict !== "mixed" && (
                      <span aria-hidden="true" className="absolute -bottom-1.5 -right-1.5"><OutcomeMark result={verdict} size={15} /></span>
                    )}
                  </button>
                  <span className="flex flex-col items-center gap-0.5 text-[9.5px] leading-none" aria-hidden="true">
                    <span className="font-bold tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>{m.position}</span>
                    {m.played > 1 && (
                      <>
                        <span className="flex gap-[2px]">
                          {(m.round?.occurrences ?? []).map((o) => (
                            <span key={o.occurrenceId} className="block h-[5px] w-[5px] rounded-full" style={{
                              background: o.outcome === "correct" ? RESULT_INK.correct : "transparent",
                              border: `1.2px ${o.outcome === "timeout" ? "dotted" : "solid"} ${o.outcome ? RESULT_INK[o.outcome] : "rgba(96,68,28,0.3)"}`,
                            }} />
                          ))}
                        </span>
                        <span className="font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{m.correct}/{m.played}</span>
                      </>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
          <li className="flex items-start [@container(min-width:40rem)]:flex-1" aria-hidden="true">
            <span className="mt-[23px] block h-[3px] w-3 rounded-full [@container(min-width:40rem)]:w-auto [@container(min-width:40rem)]:flex-1" style={{ background: "rgba(29,79,138,0.55)" }} />
            <span className="mt-[10px] grid h-7 w-7 place-items-center rounded-full border" style={{ borderColor: "#7a5610", background: "rgba(180,134,42,0.18)", color: "#7a5610" }}>
              <Star className="h-3.5 w-3.5" />
            </span>
          </li>
        </ol>
        <p className="mt-3 min-h-[2.5em] text-[11px] leading-snug" style={{ color: LEAGUECRAFT_INK.body }} aria-live="polite" data-testid="course-detail">
          {active ? (
            <>
              <strong style={{ color: LEAGUECRAFT_INK.strong }}>Module {active.position} · {UNIT_NAME[active.unit ?? ""] ?? "Question"}</strong>
              {active.played > 1
                ? ` · ${active.correct} / ${active.played} correct${active.round && active.round.timeout > 0 ? ` · ${active.round.timeout} timed out` : ""}`
                : ` · ${active.round?.occurrences[0]?.publicCategory?.label ?? ""} · ${moduleVerdict(active) === "correct" ? "correct" : moduleVerdict(active) === "timeout" ? "timed out" : "incorrect"}`}
              {" "}— lit on the Standard row above.
            </>
          ) : (
            <span style={{ color: LEAGUECRAFT_INK.faint }}>Point at or tab to a module to light its questions on the Standard row; select it to keep them lit.</span>
          )}
        </p>
      </div>
    </Panel>
  );
}
