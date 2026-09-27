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
 *
 * HUB6.3G: the course owns the MACRO recipe the rail cannot show — the
 * run of modules grouped into its segments (Splash ×4 · Meta Reflex · …),
 * each module's type by its frame, its result, and a Journey's children — and
 * each module wears the question's own authoritative art from its frozen
 * review (never art guessed from a name), else its module sigil.
 */
import { useMemo, useState } from "react";
import { CheckCheck, Droplet, Flame, Layers, Trophy, Zap } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import ModuleSigil from "@/components/quiz/workspace/ModuleSigil";
import { IconFace } from "@/components/quiz/workspace/questionTimelineParts";
import { resolveQuestionIcon } from "@/components/quiz/workspace/questionIcons";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { runHighlight, useHighlightControls } from "@/components/quiz/workspace/historyHighlight";
import type { ModuleFamily } from "@/components/quiz/workspace/historyFormat";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { HistoryStage } from "@/lib/history/contracts";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";
import { OutcomeMark, Panel } from "./charts";
import { RESULT_INK, categoryName } from "./ink";
import { HistoryPanel, seriesLines } from "./roomParts";
import { PopulationPanel } from "./population";
import { CategoryDonut, RecordsPanel, StageCompare, StreakPanel } from "./stageShared";
import { artRound, courseModules, courseSegments, recordOf, unitName, type CourseModule } from "./derive";

export default function StandardRoom({ stage, review = null }: { stage: HistoryStage; review?: MatchReviewView | null }) {
  const p = stage.analytics?.personalFacts.personal ?? null;
  const h = p?.history ?? null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="standard-room">
      <div className="[@container(min-width:52rem)]:col-span-2">
        <StageCompare stage={stage} fields={["score", "correct", "accuracy", "streak"]} />
      </div>
      <div className="[@container(min-width:52rem)]:col-span-2">
        <CourseMap stage={stage} review={review} />
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

const STANDARD_INK = "rgb(29,79,138)";
const SIGIL: Record<ModuleFamily, React.ElementType> = { splash: Droplet, meta_reflex: Zap, journey: Layers, review_replay: Droplet };

function moduleVerdict(m: CourseModule): "correct" | "incorrect" | "timeout" | "mixed" | null {
  const r = m.round;
  if (!r) return m.played === 0 ? null : m.correct === m.played ? "correct" : "mixed";
  return r.verdict;
}

/**
 * A module's face, in the HUB6.2 art priority: the question's own proven art
 * from its frozen review (an entity portrait, or its category's tile); else
 * the module's sigil (Meta Reflex's bolt, a Journey's stack, a Splash drop) —
 * never a picture built from a name.
 */
function ModuleFace({ art, family }: { art: ReviewRound | null; family: ModuleFamily | null }) {
  const proven = art ? resolveQuestionIcon(art.iconHint) : null;
  if (art && proven?.src) {
    return (
      <span className="block h-full w-full overflow-hidden rounded-[inherit]" data-testid="course-art" data-art="proven" data-specific={proven.specific ? "true" : "false"}>
        <IconFace round={art} />
      </span>
    );
  }
  if (family === "journey") return <span data-testid="course-art" data-art="sigil"><ModuleSigil kind="mastery_slice" className="h-5 w-5" ink={STANDARD_INK} /></span>;
  const Icon = SIGIL[family ?? "splash"];
  return <Icon className="h-4 w-4" style={{ color: STANDARD_INK }} aria-hidden="true" data-testid="course-art" data-art="sigil" />;
}

/**
 * The course: the stage's modules in played order, grouped into the recipe's
 * segments (each labelled, e.g. "SPLASH ×4"), start to finish. A module's
 * FRAME is its type — a square Splash tile, a round Meta Reflex seal, a
 * double-ringed Journey gate with its children as pips — its ring is its
 * result, and a multi-question module reads "4/5". Nodes resolve in order.
 */
function CourseMap({ stage, review }: { stage: HistoryStage; review: MatchReviewView | null }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const modules = useMemo(() => courseModules(stage, vm), [stage, vm]);
  const segments = useMemo(() => courseSegments(modules), [modules]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1400, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHighlightControls();
  const [focus, setFocus] = useState<number | null>(null);
  if (modules.length === 0) return null;
  const n = modules.length;
  const keyOf = (m: CourseModule) => `${stage.stageId}:module:${m.roundNumber}`;
  const hl = (m: CourseModule) => runHighlight(m.ids, {
    key: keyOf(m), stageIds: [stage.stageId],
    label: `Module ${m.position} · ${unitName(m.unit)}`,
  });
  const active = focus !== null ? modules[focus - 1] ?? null : modules.find((m) => locked?.key === keyOf(m)) ?? null;
  const activeCategory = active?.round?.occurrences[0]?.publicCategory ?? null;
  const recipe = segments.map((g) => (g.modules.length > 1 ? `${unitName(g.family)} ×${g.modules.length}` : unitName(g.family))).join(" · ");

  return (
    <Panel title="The course" eyebrow={`${n} modules · ${recipe}`} testId="standard-course">
      <div ref={reveal.ref} className="min-w-0">
        <ol
          className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-3 [@container(min-width:40rem)]:flex-nowrap"
          aria-label="Standard modules in played order, by segment"
          data-testid="course-modules"
          data-count={n}
        >
          {segments.map((g, gi) => (
            <li
              key={g.modules[0].roundNumber}
              className="flex min-w-0 flex-col [@container(min-width:40rem)]:flex-1"
              style={{ flexGrow: g.modules.length }}
              data-testid="course-segment"
              data-family={g.family ?? "unknown"}
              data-size={g.modules.length}
            >
              {/* The segment's name over a bracket spanning its modules. */}
              <span className="mb-1 flex min-w-0 items-center gap-1 whitespace-nowrap px-0.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: STANDARD_INK }} aria-hidden="true">
                {unitName(g.family)}
                {g.modules.length > 1 && <span style={{ color: LEAGUECRAFT_INK.faint }}>×{g.modules.length}</span>}
              </span>
              <span aria-hidden="true" className="mb-1.5 block h-1.5 rounded-t-sm border-x-2 border-t-2" style={{ borderColor: "rgba(29,79,138,0.35)" }} />
              <ol className="flex items-start gap-1.5 [@container(min-width:40rem)]:justify-around" aria-label={`${unitName(g.family)}${g.modules.length > 1 ? ` ×${g.modules.length}` : ""}`}>
                {g.modules.map((m) => {
                  const i = m.position - 1;
                  const shown = reveal.progress >= 1 || staggered(reveal.progress, i, n, 0.7) > 0.05;
                  const verdict = moduleVerdict(m);
                  const ring = verdict === "correct" || verdict === "incorrect" || verdict === "timeout" ? RESULT_INK[verdict] : "rgba(138,106,44,0.85)";
                  const family = m.family ?? "splash";
                  const isLocked = locked?.key === keyOf(m);
                  const size = family === "journey" ? 52 : 44;
                  const art = artRound(review, m.roundNumber);
                  const label = `Module ${m.position} of ${n}, ${unitName(m.unit)}${m.played > 1 ? `, ${m.correct} of ${m.played} correct` : verdict === "correct" ? ", correct" : verdict === "incorrect" ? ", incorrect" : verdict === "timeout" ? ", timed out" : ""}`;
                  return (
                    <li key={m.roundNumber} className="flex flex-col items-center gap-1" style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(5px) scale(0.85)", transition: "opacity 200ms, transform 240ms" }}>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={isLocked}
                        data-testid="course-module"
                        data-unit={family}
                        data-raw-unit={m.unit ?? undefined}
                        data-played={m.played}
                        data-correct={m.correct}
                        data-outcome={verdict ?? "unknown"}
                        onPointerEnter={(e) => { if (e.pointerType !== "touch") { setFocus(m.position); preview(hl(m)); } }}
                        onPointerLeave={(e) => { if (e.pointerType !== "touch") { setFocus(null); preview(null); } }}
                        onFocus={() => { setFocus(m.position); preview(hl(m)); }}
                        onBlur={() => { setFocus(null); preview(null); }}
                        onClick={() => toggleLock(hl(m))}
                        className={`relative grid shrink-0 place-items-center p-[3px] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${family === "meta_reflex" ? "rounded-full" : family === "journey" ? "rounded-xl" : "rounded-md"}`}
                        style={{
                          width: coarse ? Math.max(44, size) : size, height: coarse ? Math.max(44, size) : size,
                          background: family === "splash" ? "rgba(255,249,233,0.55)" : "rgba(29,79,138,0.1)",
                          border: `2.5px ${verdict === "timeout" ? "dashed" : "solid"} ${ring}`,
                          boxShadow: [
                            family === "journey" ? "0 0 0 2px #efe2c2, 0 0 0 4px rgba(29,79,138,0.55)" : null,
                            isLocked ? `0 0 0 ${family === "journey" ? 6 : 3}px #b4862a` : null,
                          ].filter(Boolean).join(", ") || undefined,
                        }}
                      >
                        <span className={`grid h-full w-full place-items-center overflow-hidden ${family === "meta_reflex" ? "rounded-full" : "rounded-[4px]"}`}>
                          <ModuleFace art={art} family={family} />
                        </span>
                        {verdict && verdict !== "mixed" && (
                          <span aria-hidden="true" className="absolute -bottom-1.5 -right-1.5"><OutcomeMark result={verdict} size={15} /></span>
                        )}
                      </button>
                      <span className="flex flex-col items-center gap-0.5 text-[9.5px] leading-none" aria-hidden="true">
                        <span className="font-bold tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>{m.position}</span>
                        {m.played > 1 && (
                          <>
                            <span className="flex gap-[2px]" data-testid="course-children" data-count={m.round?.occurrences.length ?? m.played}>
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
                    </li>
                  );
                })}
              </ol>
              {gi < segments.length - 1 && <span className="sr-only">then</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 min-h-[2.5em] text-[11px] leading-snug" style={{ color: LEAGUECRAFT_INK.body }} aria-live="polite" data-testid="course-detail">
          {active ? (
            <>
              <strong style={{ color: LEAGUECRAFT_INK.strong }}>Module {active.position} · {unitName(active.unit)}</strong>
              {active.played > 1
                ? ` · ${active.correct} / ${active.played} correct${active.round && active.round.timeout > 0 ? ` · ${active.round.timeout} timed out` : ""}`
                : `${activeCategory ? ` · ${categoryName(activeCategory.key, activeCategory.label)}` : ""} · ${moduleVerdict(active) === "correct" ? "correct" : moduleVerdict(active) === "timeout" ? "timed out" : "incorrect"}`}
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
