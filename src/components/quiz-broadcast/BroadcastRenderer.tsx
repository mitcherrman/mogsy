import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useTransform } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { EngineSnapshot, BroadcastVisuals } from "@/lib/quiz-broadcast/types";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import type { QuizQuestion } from "@/lib/quiz/api";
import { CalculationBreakdown, ScenarioCard, classifySubject, isSpoilerSubject, normalizeLabel } from "./scenario-cards";
import { useRevealTimeline } from "./useRevealTimeline";
import { BroadcastKnowledgeCore } from "./BroadcastKnowledgeCore";
import { HextechOverloadFX } from "./HextechOverloadFX";

type Props = {
  snapshot: EngineSnapshot | null;
  fitContainer?: boolean;
};

/**
 * BroadcastRenderer V5 — Broadcast Camera Timeline.
 * Presentation-only. No engine/session/channel/studio changes.
 *
 * Layout: 28% subject | 52% question | 20% play-along CTA.
 * The subject panel is rendered by the ScenarioCard framework
 * (./scenario-cards): champion splash, combat calculation, collectible,
 * and placeholder cards, selected via metadata. New question-type visuals
 * are added as ScenarioCard variants, not renderer edits.
 * Question transitions slide horizontally; outer stage never remounts.
 *
 * V5 (Broadcast Camera System):
 *  - useRevealTimeline: single RAF loop drives all animation via MotionValues.
 *    No React re-renders during reveal sequence → no flicker, no UI-state feel.
 *  - Reveal sequence: Launch → Impact → Settle → Name Reveal → Hold.
 *  - Pre-launch tension: sceneScale and darkness build during final 3 s of countdown.
 *  - Subject panel expands via animated width MotionValue (not layout swap).
 *  - Name card is always in DOM; opacity driven by timeline (no AnimatePresence mount).
 *  - 9:16 Shorts: content exits downward, subject expands upward — same timeline.
 *  - FinalCountdownOverlay: unchanged structure, softened final-second flash.
 *  Intentionally NOT changed: BroadcastEngine, session persistence, channel sync,
 *  DeveloperTools, API/backend, classifySubject/isSpoilerSubject contracts.
 */
export default function BroadcastRenderer({ snapshot, fitContainer = false }: Props) {
  if (!snapshot) {
    return (
      <ShellFrame fit={fitContainer} aspect="16:9">
        <StageBackdrop theme="hextech" animation="pulse" />
        <div className="absolute inset-0 z-10 flex items-center justify-center text-white/60">
          Waiting for Broadcast Studio signal…
        </div>
      </ShellFrame>
    );
  }
  return <BroadcastStage snapshot={snapshot} fitContainer={fitContainer} />;
}

/* ────────────────────────────────────────────────────────────────────────
   BroadcastStage — stable outer shell. Mounted once per session.
   ──────────────────────────────────────────────────────────────────────── */

function BroadcastStage({ snapshot, fitContainer }: { snapshot: EngineSnapshot; fitContainer: boolean }) {
  const v = snapshot.config.visuals;
  const phase = snapshot.phase;
  const q = snapshot.currentQuestion;
  const revealActive = phase === "reveal" || phase === "explanation" || phase === "transition";
  const isShorts = v.aspect === "9:16";

  return (
    <ShellFrame fit={fitContainer} aspect={v.aspect}>
      <StageBackdrop theme={v.theme} animation={v.backgroundAnimation} />
      <GoldTrim />

      {/* Hextech overload environment FX — cracks + localized vignette.
          z-[6]: above backdrop/FXLayer, behind all scene content (z-20).
          Anchored to the Knowledge Core, which is now always visible. */}
      <div className="pointer-events-none absolute inset-0 z-[6]">
        <HextechOverloadFX
          phase={phase}
          phaseStartedAt={snapshot.phaseStartedAt}
          phaseDurationMs={snapshot.phaseDurationMs}
          anchorX={isShorts ? 0.5 : 0.88}
          anchorY={isShorts ? 0.96 : 0.49}
          aspect={isShorts ? 9 / 16 : 16 / 9}
        />
      </div>

      {/* Top chrome */}
      <TopChrome snapshot={snapshot} />

      {/* Main scene — slide transitions, never remounts the stage */}
      <div
        className={`absolute inset-x-0 z-20 flex ${isShorts ? "top-[6%] bottom-[6%] px-[3%]" : "top-[7.5%] bottom-[9%] px-[2.5%]"}`}
      >
        {phase === "idle" || !q ? (
          <IdleStanding />
        ) : (
          <SceneSlider questionId={String(q.id)}>
            {isShorts ? (
              <ShortsSceneRow
                question={q}
                visuals={v}
                phase={phase}
                revealActive={revealActive}
                correctAnswer={snapshot.correctAnswer}
                explanation={snapshot.explanation}
                phaseStartedAt={snapshot.phaseStartedAt}
                phaseDurationMs={snapshot.phaseDurationMs}
                phaseIsQuestion={phase === "question"}
                questionIndex={snapshot.currentIndex + 1}
              />
            ) : (
              <SceneRow
                question={q}
                visuals={v}
                phase={phase}
                revealActive={revealActive}
                correctAnswer={snapshot.correctAnswer}
                explanation={snapshot.explanation}
                phaseStartedAt={snapshot.phaseStartedAt}
                phaseDurationMs={snapshot.phaseDurationMs}
                phaseIsQuestion={phase === "question"}
                questionIndex={snapshot.currentIndex + 1}
              />
            )}
          </SceneSlider>
        )}
      </div>

      {/* Shorts crystal core — subtle stage fixture. Anchored to the true stage
          bottom edge so only the ShellFrame/stage overflow crops it. Rendered
          outside SceneSlider so it stays stable across question slides, but kept
          visually behind the main scene content so it reads as atmosphere instead
          of competing with the answers. */}
      {isShorts && phase !== "idle" && q && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[18] opacity-70">
          <div className="relative mx-auto aspect-square w-[76cqmin] translate-y-[48%]">
            <BroadcastKnowledgeCore
              phase={phase}
              questionIndex={snapshot.currentIndex + 1}
              phaseStartedAt={snapshot.phaseStartedAt}
              phaseDurationMs={snapshot.phaseDurationMs}
              compact
            />
          </div>
        </div>
      )}

      {/* Bottom runner lane — the single bottom timing element: the current-
          question countdown platform with Akali running along it. Replaces
          both the playlist BottomTimeline (intentionally no longer rendered)
          and the inline CountdownInline bars. z-[14]: above backdrop FX,
          below the Shorts crystal core (z-[18]) and the main scene (z-20). */}
      <BroadcastRunnerTimerLane
        phase={phase}
        phaseStartedAt={snapshot.phaseStartedAt}
        phaseDurationMs={snapshot.phaseDurationMs}
        isShorts={isShorts}
        hasQuestion={!!q}
      />

      {/* Decorative FX layer */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        <FXLayer revealActive={revealActive} />
      </div>

      {/* Dramatic final 3·2·1 countdown — rAF-driven overlay, mounted once */}
      <FinalCountdownOverlay
        active={phase === "question"}
        phaseStartedAt={snapshot.phaseStartedAt}
        phaseDurationMs={snapshot.phaseDurationMs}
      />
    </ShellFrame>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   StageBackdrop / GoldTrim
   ──────────────────────────────────────────────────────────────────────── */

export function StageBackdrop({
  theme,
  animation,
}: {
  theme: BroadcastVisuals["theme"];
  animation: BroadcastVisuals["backgroundAnimation"];
}) {
  const themeClass =
    theme === "midnight"
      ? "from-[#03040d] via-[#070a1c] to-[#0f0a28]"
      : theme === "classic"
        ? "from-[#070a14] via-[#0a1322] to-[#08111d]"
        : "from-[#03061a] via-[#07112d] to-[#150834]";
  return (
    <>
      <div className={`absolute inset-0 bg-gradient-to-br ${themeClass}`} />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.22),transparent_55%),radial-gradient(circle_at_82%_88%,rgba(217,70,239,0.18),transparent_55%)]" />
      {animation === "particles" && (
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:28px_28px]" />
      )}
      {animation === "pulse" && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_50%_45%,rgba(120,170,255,0.25),transparent_60%)]"
          animate={{ opacity: [0.14, 0.24, 0.14] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
      
      {/* Bottom darkness ramp — fades the lower 25% of the stage to black so bottom UI/assets blend cleanly. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[25%] bg-gradient-to-t from-black via-black/75 to-transparent" />
    </>
  );
}

export function GoldTrim() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#d4b35a]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#d4b35a]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-[#d4b35a]/30 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-[#d4b35a]/30 to-transparent" />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   TopChrome — slim, de-emphasized bar
   ──────────────────────────────────────────────────────────────────────── */

function TopChrome({ snapshot }: { snapshot: EngineSnapshot }) {
  const v = snapshot.config.visuals;
  const q = snapshot.currentQuestion;
  const meta = (q?.metadata ?? {}) as Record<string, unknown>;
  const patch = (meta.patch as string | undefined) ?? "";
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/55 via-black/25 to-transparent px-[2%] py-[0.9%] text-white/80">
      <div className="flex items-center gap-2">
        {v.showLogo && (
          <div className="flex items-center gap-1.5 rounded-md border border-[#d4b35a]/35 bg-black/40 px-2 py-1">
            <Sparkles className="h-3 w-3 text-[#e8c97a]" />
            <span className="text-[1.08cqmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a]">Mogsy</span>
          </div>
        )}
        {v.showCategoryBadge && q && <ChromeBadge tone="cyan">{String(q.category).replace(/_/g, " ")}</ChromeBadge>}
        {v.showDifficultyBadge && q?.difficulty != null && (
          <ChromeBadge tone="amber">Difficulty {q.difficulty}</ChromeBadge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {v.showQuestionNumber && (
          <ChromeBadge tone="gold">
            Q {Math.min(snapshot.currentIndex + 1, snapshot.playlistLength)} / {snapshot.playlistLength}
          </ChromeBadge>
        )}
        {v.showPatchLabel && patch && <ChromeBadge tone="muted">Patch {patch}</ChromeBadge>}
      </div>
    </div>
  );
}

export function ChromeBadge({ children, tone }: { children: React.ReactNode; tone: "cyan" | "amber" | "gold" | "muted" }) {
  const cls =
    tone === "cyan"
      ? "border-cyan-300/30 text-cyan-100/85 bg-cyan-400/[0.05]"
      : tone === "amber"
        ? "border-amber-300/30 text-amber-100/85 bg-amber-300/[0.05]"
        : tone === "gold"
          ? "border-[#d4b35a]/45 text-[#f3dca0] bg-[#d4b35a]/[0.08]"
          : "border-white/15 text-white/60 bg-white/[0.04]";
  return (
    <span className={`rounded-md border px-2 py-1 text-[1.02cqmin] font-semibold uppercase tracking-[0.28em] ${cls}`}>
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   SceneSlider — only the inner scene slides on question change
   ──────────────────────────────────────────────────────────────────────── */

function SceneSlider({ questionId, children }: { questionId: string; children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={questionId}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -80, opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   SceneRow — three-column composition (16:9 only)
   Animation driven entirely by useRevealTimeline MotionValues.
   ──────────────────────────────────────────────────────────────────────── */

function SceneRow({
  question,
  visuals,
  phase,
  revealActive,
  correctAnswer,
  explanation,
  phaseStartedAt,
  phaseDurationMs,
  phaseIsQuestion,
  questionIndex,
}: {
  question: QuizQuestion;
  visuals: BroadcastVisuals;
  phase: BroadcastPhase;
  revealActive: boolean;
  correctAnswer: string | null;
  explanation: string | null;
  phaseStartedAt: number;
  phaseDurationMs: number;
  phaseIsQuestion: boolean;
  questionIndex: number;
}) {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = useMemo(() => classifySubject(question), [question]);
  const isSpoiler = useMemo(
    () => isSpoilerSubject(question, subject, correctAnswer),
    [question, subject, correctAnswer],
  );

  const revealName =
    correctAnswer ||
    (typeof meta.champion_name === "string" ? meta.champion_name : undefined) ||
    subject.label;

  const tl = useRevealTimeline({
    phase,
    phaseStartedAt,
    phaseDurationMs,
    isSpoiler,
    isShorts: false,
    questionId: String(question.id),
  });

  // Convert numeric MotionValues to CSS unit strings for framer-motion style prop
  const subjectWidthStr = useTransform(tl.subjectWidthPct, (v) => `${v}%`);
  const contentXStr     = useTransform(tl.contentX,        (v) => `${v}vw`);
  const qrXStr          = useTransform(tl.qrX,             (v) => `${v}vw`);
  const sceneXStr       = useTransform(tl.sceneX,          (v) => `${v}vw`);

  return (
    <motion.div
      className="relative h-full w-full overflow-hidden will-change-transform"
      style={{ fontSize: `${visuals.fontScale}em`, scale: tl.sceneScale, x: sceneXStr }}
    >
      {/* Cinematic darkness overlay — driven by timeline */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[35] bg-black"
        style={{ opacity: tl.darkness }}
      />

      <div className="relative flex h-full w-full gap-[1.6%]">
        {/* Subject column — width expands from 28% → 82% during spoiler reveal */}
        <motion.div
          className="relative flex shrink-0 items-center justify-center overflow-hidden h-full"
          style={{ width: subjectWidthStr, scale: tl.subjectScale }}
        >
          <ScenarioCard
            question={question}
            revealActive={revealActive}
            correctAnswer={revealName ?? correctAnswer}
          />

          {/* Name card — always in DOM when revealName is known, opacity from timeline.
              This prevents the mount/unmount flicker that made reveals feel like UI changes. */}
          {revealName && (
            <motion.div
              className="pointer-events-none absolute bottom-[5%] left-1/2 z-30 w-[72%] -translate-x-1/2 rounded-2xl border border-[#d4b35a]/55 bg-black/55 px-[5%] py-[2%] text-center shadow-[0_22px_60px_rgba(0,0,0,0.7)] backdrop-blur-md"
              style={{ opacity: tl.nameOpacity }}
            >
              <div className="text-[1.15cqmin] font-bold uppercase tracking-[0.45em] text-[#e8c97a]/90">
                Correct Answer
              </div>
              <div className="mt-2 bg-gradient-to-b from-white via-[#fff2bd] to-[#b8893a] bg-clip-text text-[6cqmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
                {revealName}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Content column — slides off-screen during spoiler reveal */}
        <motion.div
          className="flex min-w-0 flex-1 flex-col justify-center gap-[2%]"
          style={{ x: contentXStr, opacity: tl.contentOpacity }}
        >
          <QuestionPanel
            question={question}
            visuals={visuals}
            revealActive={revealActive}
            correctAnswer={correctAnswer}
            explanation={explanation}
          />
        </motion.div>

        {/* QR / CTA column — exits with content */}
        <motion.div
          className="flex h-full w-[20%] shrink-0 items-center justify-center"
          style={{ x: qrXStr, opacity: tl.qrOpacity }}
        >
          <RightPanel
            phase={phase}
            questionIndex={questionIndex}
            phaseStartedAt={phaseStartedAt}
            phaseDurationMs={phaseDurationMs}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ── Structured explanation for derived calculation questions ─────────── */

type CombatCalcData = {
  baseCooldown: number;
  abilityHaste: number;
  finalExact: number;
  finalDisplay: number;
};

function getCombatCalcData(question: QuizQuestion): CombatCalcData | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (subject?.type !== "combat_cooldown") return null;
  const base = meta.base_cooldown;
  const haste = meta.total_ability_haste;
  const final = meta.final_cooldown;
  if (typeof base !== "number" || typeof haste !== "number" || typeof final !== "number") return null;
  const exact = typeof meta.final_cooldown_exact === "number" ? meta.final_cooldown_exact : final;
  return { baseCooldown: base, abilityHaste: haste, finalExact: exact, finalDisplay: final };
}

/**
 * Explanation card body. Combat-calculation questions get the analyst
 * calculator layout (inputs → computation chain → promoted result) via the
 * generic CalculationBreakdown; everything else keeps plain text.
 */
export function ExplanationBody({ question, explanation }: { question: QuizQuestion; explanation: string | null }) {
  const calc = getCombatCalcData(question);
  if (!calc) return <div className="text-emerald-50/95">{explanation}</div>;

  const { baseCooldown, abilityHaste, finalExact, finalDisplay } = calc;
  const multiplier = Math.round((100 / (100 + abilityHaste)) * 10000) / 10000;
  const exact = Math.round(finalExact * 100) / 100;

  return (
    <div className="text-[1.05em]">
      <CalculationBreakdown
        inputs={[
          { label: "Base cooldown", value: `${baseCooldown}s` },
          { label: "Ability haste", value: String(abilityHaste) },
        ]}
        steps={[
          { expression: `100 / (100 + ${abilityHaste})`, result: String(multiplier) },
          { expression: `${baseCooldown} × ${multiplier}`, result: `${exact}s` },
        ]}
        result={{ label: "Displayed cooldown", value: `${finalDisplay} seconds` }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   QuestionPanel — question, answers, countdown, reveal explanation
   ──────────────────────────────────────────────────────────────────────── */

function QuestionPanel({
  question,
  visuals,
  revealActive,
  correctAnswer,
  explanation,
}: {
  question: QuizQuestion;
  visuals: BroadcastVisuals;
  revealActive: boolean;
  correctAnswer: string | null;
  explanation: string | null;
}) {
  const choices = useMemo(() => (question.choices ?? []).map(choiceLabel), [question]);
  return (
    <div className="flex h-full w-full flex-col justify-center gap-[2.2%] px-[1%]">
      <QuestionText text={question.question_text ?? ""} />
      <AnswerGrid
        choices={choices}
        style={visuals.answerStyle}
        revealActive={revealActive}
        correctAnswer={correctAnswer}
      />
      {/* Current-question countdown now lives in the bottom runner lane
          (BroadcastRunnerTimerLane) — no inline bar here. */}
      <CompactPlayAlongPanel visuals={visuals} size="wide" />
      <div className="relative min-h-[12%]">
        <AnimatePresence>
          {revealActive && explanation && visuals.showTips && visuals.showExplanations && (
            <motion.div
              key="reveal-overlay"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="absolute inset-x-0 top-0 rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/12 via-emerald-300/8 to-cyan-300/8 p-[1.4%] text-[2cqmin] leading-relaxed text-emerald-50 backdrop-blur-md"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <div className="text-[1.2cqmin] font-bold uppercase tracking-[0.3em] text-emerald-200/90">
                  Correct Answer
                </div>
                {correctAnswer && (
                  <div className="text-[1.95cqmin] font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                    {correctAnswer}
                  </div>
                )}
              </div>
              <ExplanationBody question={question} explanation={explanation} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const QuestionText = memo(function QuestionText({ text }: { text: string }) {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="font-sans text-[4.6cqmin] font-black leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.7)]"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <span className="inline-block text-white">
        {text}
      </span>
    </motion.h1>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   AnswerGrid
   ──────────────────────────────────────────────────────────────────────── */

export const AnswerGrid = memo(function AnswerGrid({
  choices,
  style,
  revealActive,
  correctAnswer,
}: {
  choices: string[];
  style: "cards" | "rows" | "grid";
  revealActive: boolean;
  correctAnswer: string | null;
}) {
  const containerClass = style === "rows" ? "flex w-full flex-col gap-[1.2%]" : "grid w-full grid-cols-2 gap-[1.3%]";

  return (
    <div className={containerClass}>
      {choices.map((label, i) => {
        const isCorrect =
          revealActive && correctAnswer != null && normalizeLabel(label) === normalizeLabel(correctAnswer);
        const isWrong =
          revealActive && correctAnswer != null && normalizeLabel(label) !== normalizeLabel(correctAnswer);
        return (
          <motion.div
            key={`${i}-${label}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i + 0.1, duration: 0.32, ease: "easeOut" }}
            className={[
              "relative flex min-h-[7.6cqmin] items-center gap-[1.2%] overflow-hidden rounded-xl border px-[2%] py-[1.4%] text-[2.6cqmin] font-bold backdrop-blur-md",
              "transition-[background-color,border-color,color,box-shadow,opacity,filter,transform] [transition-duration:320ms] ease-out",
              isCorrect
                ? "border-emerald-300/90 bg-gradient-to-br from-emerald-400/35 via-emerald-400/22 to-cyan-400/22 text-white shadow-[0_0_90px_rgba(16,185,129,0.7)] scale-[1.06] -translate-y-[0.4cqmin] z-[2]"
                : isWrong
                  ? "border-white/8 bg-white/[0.02] text-white/25 opacity-35 [filter:grayscale(0.85)_blur(0.5px)]"
                  : "border-[#d4b35a]/25 bg-gradient-to-br from-white/[0.07] to-white/[0.02] text-white hover:border-[#d4b35a]/45",
            ].join(" ")}
          >
            {isCorrect && (
              <>
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -inset-2 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.55),transparent_70%)]"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 0.9, 0.5], scale: [0.6, 1.15, 1] }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -inset-1 rounded-xl bg-[radial-gradient(circle_at_center,rgba(243,220,160,0.45),transparent_70%)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.7, 0.3] }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                />
              </>
            )}
            {/* subtle inner gold ring */}
            <div
              className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ${
                isCorrect ? "ring-emerald-300/40" : "ring-[#d4b35a]/10"
              }`}
            />
            <span
              className={[
                "relative inline-flex h-[3.8cqmin] w-[3.8cqmin] shrink-0 items-center justify-center rounded-md text-[1.9cqmin] font-black tabular-nums",
                isCorrect
                  ? "bg-emerald-400/35 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.6)]"
                  : "bg-[#d4b35a]/15 text-[#f3dca0] ring-1 ring-inset ring-[#d4b35a]/40",
              ].join(" ")}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className="relative min-w-0 flex-1 leading-tight">{label}</span>
            {isCorrect && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl"
                initial={{ boxShadow: "0 0 0 0 rgba(16,185,129,0.5)" }}
                animate={{ boxShadow: "0 0 0 22px rgba(16,185,129,0)" }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   CountdownInline — bar/digits/ring, rAF-driven
   ──────────────────────────────────────────────────────────────────────── */

// No longer rendered in the broadcast layout (the bottom runner lane owns the
// question timer); kept exported for reuse.
export function CountdownInline({
  active,
  style,
  phaseStartedAt,
  phaseDurationMs,
}: {
  active: boolean;
  style: "bar" | "ring" | "digits";
  phaseStartedAt: number;
  phaseDurationMs: number;
}) {
  if (!active || phaseDurationMs <= 0) return <div className="h-[2.4cqmin]" />;
  return <CountdownView style={style} phaseStartedAt={phaseStartedAt} phaseDurationMs={phaseDurationMs} />;
}

function CountdownView({
  style,
  phaseStartedAt,
  phaseDurationMs,
}: {
  style: "bar" | "ring" | "digits";
  phaseStartedAt: number;
  phaseDurationMs: number;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const digitsRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - phaseStartedAt);
      const progress = Math.min(1, elapsed / phaseDurationMs);
      const remainingSec = Math.max(0, Math.ceil((phaseDurationMs - elapsed) / 1000));
      if (barRef.current) barRef.current.style.width = `${(1 - progress) * 100}%`;
      if (digitsRef.current) digitsRef.current.textContent = String(remainingSec);
      if (ringRef.current) {
        const C = 2 * Math.PI * 40;
        ringRef.current.style.strokeDashoffset = String(C * progress);
      }
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phaseStartedAt, phaseDurationMs]);

  if (style === "digits") {
    return (
      <div className="flex items-center justify-center">
        <div
          ref={digitsRef}
          className="rounded-lg border border-[#d4b35a]/40 bg-black/40 px-[1.4%] py-[0.6%] text-[3.2cqmin] font-black tabular-nums text-[#f3dca0] backdrop-blur"
        >
          --
        </div>
      </div>
    );
  }
  if (style === "ring") {
    const C = 2 * Math.PI * 40;
    return (
      <div className="relative mx-auto h-[6cqmin] w-[6cqmin]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={40} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
          <circle
            ref={ringRef}
            cx="50"
            cy="50"
            r={40}
            fill="none"
            stroke="url(#bcastRing)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={0}
          />
          <defs>
            <linearGradient id="bcastRing">
              <stop offset="0%" stopColor="#d4b35a" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }
  return (
    <div className="relative h-[1.4cqmin] w-full overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-[#d4b35a]/20">
      <div
        ref={barRef}
        className="h-full rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-emerald-300 will-change-[width] shadow-[0_0_18px_rgba(212,179,90,0.55)]"
        style={{ width: "100%" }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   RightPanel — the Hextech Knowledge Core. Always rendered; the QR/website
   play-along CTA now lives as a compact strip under the answers instead of
   replacing the core. The column wrapper and motion bindings are unchanged.
   ──────────────────────────────────────────────────────────────────────── */

function RightPanel({
  phase,
  questionIndex,
  phaseStartedAt,
  phaseDurationMs,
}: {
  phase: BroadcastPhase;
  questionIndex: number;
  phaseStartedAt: number;
  phaseDurationMs: number;
}) {
  return (
    <BroadcastKnowledgeCore
      phase={phase}
      questionIndex={questionIndex}
      phaseStartedAt={phaseStartedAt}
      phaseDurationMs={phaseDurationMs}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
   CompactPlayAlongPanel — small supporting CTA strip under the answers.
   Renders nothing when both showQrCode and showWebsite are off. Sized in
   cqmin so it stays a footnote next to the answers rather than a subject.
   ──────────────────────────────────────────────────────────────────────── */

export function CompactPlayAlongPanel({
  visuals,
  size = "wide",
}: {
  visuals: BroadcastVisuals;
  size?: "wide" | "shorts";
}) {
  if (!visuals.showQrCode && !visuals.showWebsite) return null;
  const qrPx = size === "shorts" ? "h-[5cqmin] w-[5cqmin]" : "h-[4.4cqmin] w-[4.4cqmin]";
  const urlText = size === "shorts" ? "text-[1.5cqmin]" : "text-[1.35cqmin]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.25 }}
      className={`flex items-center gap-[1.6cqmin] rounded-xl border border-[#d4b35a]/25 bg-black/40 px-[1.8cqmin] py-[1cqmin] backdrop-blur-md ${
        size === "shorts" ? "self-center" : "self-start"
      }`}
    >
      {visuals.showQrCode && (
        <div className="rounded-md border border-[#d4b35a]/35 bg-white/95 p-[0.5cqmin] shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(`https://${visuals.websiteUrl}`)}`}
            alt=""
            className={qrPx}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-col text-left">
        <div className="text-[1cqmin] font-bold uppercase tracking-[0.35em] text-[#e8c97a]/90">Play along</div>
        {visuals.showWebsite && (
          <div className={`truncate font-extrabold tracking-wider text-[#f3dca0] ${urlText}`}>
            {visuals.websiteUrl}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PlayAlongPanel — premium full-height CTA card with QR. No longer wired
   into the layout (the compact strip replaced it); kept exported for reuse.
   ──────────────────────────────────────────────────────────────────────── */

export function PlayAlongPanel({ visuals }: { visuals: BroadcastVisuals }) {
  if (!visuals.showQrCode && !visuals.showWebsite) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative flex h-[78%] w-[92%] flex-col items-center justify-between rounded-2xl border border-[#d4b35a]/40 bg-gradient-to-b from-black/65 via-black/50 to-black/65 p-[6%] shadow-[0_20px_50px_-18px_rgba(0,0,0,0.85)]"
    >
      <div className="pointer-events-none absolute inset-[4%] rounded-xl ring-1 ring-inset ring-[#d4b35a]/25" />
      <div className="relative text-center">
        <div className="text-[0.95cqmin] font-bold uppercase tracking-[0.4em] text-[#e8c97a]">Play along</div>
        <div className="mt-1 text-[1.4cqmin] font-extrabold uppercase tracking-[0.18em] text-white">Scan to join</div>
      </div>
      {visuals.showQrCode && (
        <div className="relative rounded-lg border border-[#d4b35a]/35 bg-white/95 p-[6%] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(`https://${visuals.websiteUrl}`)}`}
            alt=""
            className="h-[8cqmin] w-[8cqmin]"
          />
        </div>
      )}
      <div className="relative text-center">
        <div className="text-[1.05cqmin] uppercase tracking-[0.35em] text-white/55">Web</div>
        <div className="mt-0.5 text-[1.5cqmin] font-extrabold tracking-wider text-[#f3dca0]">{visuals.websiteUrl}</div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   BroadcastRunnerTimerLane — the single bottom timing element.
   A dark platform lane hugging the stage bottom holds the current-question
   countdown bar; Akali (looping MP4) runs on top of it, left → right in step
   with the remaining question time (late joiners start at the correct
   progress point). On reveal/explanation/transition Akali stays parked at
   the end of the lane and the bar sits empty; the next question resets her
   to the start. Hidden while idle / without a question. Replaces both the
   playlist BottomTimeline and the inline CountdownInline bars. Purely
   presentational: muted looping video, pointer-events-none, aria-hidden —
   no engine/timing involvement.
   ──────────────────────────────────────────────────────────────────────── */

const RUNNER_ASSET_SRC = "/quiz-broadcast/assets/akali-running.mp4";

function BroadcastRunnerTimerLane({
  phase,
  phaseStartedAt,
  phaseDurationMs,
  isShorts,
  hasQuestion,
}: {
  phase: BroadcastPhase;
  phaseStartedAt: number;
  phaseDurationMs: number;
  isShorts: boolean;
  hasQuestion: boolean;
}) {
  const isQuestion = phase === "question" && phaseDurationMs > 0;

  // Late-join support: start from the current countdown progress, not 0.
  // The runner/bar are keyed by phaseStartedAt, so re-renders don't restart
  // the run.
  const elapsed = Math.max(0, Date.now() - phaseStartedAt);
  const progress = Math.min(1, elapsed / Math.max(1, phaseDurationMs));
  const startLeft = 4 + progress * 88; // 4% → 92% track
  const remainingSec = Math.max(0, (phaseDurationMs - elapsed) / 1000);

  if (!hasQuestion || phase === "idle") return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-[2%] z-[14] ${
        isShorts ? "bottom-[1.1%] h-[5.2cqmin]" : "bottom-[1.1%] h-[5.8cqmin]"
      }`}
    >
      {/* Current-question timer bar — thin bottom platform Akali runs above.
          No large lane/card background. */}
      <div className="absolute inset-x-[1.5%] bottom-[0.35cqmin] h-[0.8cqmin] overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-[#d4b35a]/15">
          {isQuestion ? (
            <motion.div
              key={`bar-${phaseStartedAt}`}
              className="h-full rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-emerald-300 shadow-[0_0_18px_rgba(212,179,90,0.55)]"
              initial={{ width: `${(1 - progress) * 100}%` }}
              animate={{ width: "0%" }}
              transition={{ duration: remainingSec, ease: "linear" }}
            />
          ) : (
            <div className="h-full w-0" />
          )}
        </div>

      {/* Akali — simple circular fade only. */}
      <motion.div
        key={isQuestion ? `run-${phaseStartedAt}` : "parked"}
        className={`absolute -translate-x-1/2 ${isShorts ? "bottom-[0.1cqmin]" : "bottom-[-0.1cqmin]"}`}
        initial={isQuestion ? { left: `${startLeft}%`, opacity: 0 } : false}
        animate={{ left: "92%", opacity: isShorts ? 0.78 : 0.92 }}
        transition={{
          left: { duration: isQuestion ? remainingSec : 0.3, ease: "linear" },
          opacity: { duration: 0.45, ease: "easeOut" },
        }}
      >
        <div
          className={`relative overflow-hidden rounded-full ${isShorts ? "h-[18cqmin] w-[18cqmin]" : "h-[16cqmin] w-[16cqmin]"}`}
          style={{
            WebkitMaskImage: "radial-gradient(circle at center, black 0%, black 72%, transparent 96%)",
            maskImage: "radial-gradient(circle at center, black 0%, black 72%, transparent 96%)",
          }}
        >
          <video
            src={RUNNER_ASSET_SRC}
            autoPlay
            loop
            muted
            playsInline
            className="absolute left-1/2 top-1/2 h-[10.2cqmin] w-auto -translate-x-1/2 -translate-y-1/2 scale-[1.55] object-contain mix-blend-screen opacity-95 brightness-125 contrast-150 saturate-125 drop-shadow-[0_0_14px_rgba(212,179,90,0.28)]"
          />
        </div>
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   BottomTimeline — slim progress styling
   ──────────────────────────────────────────────────────────────────────── */

export function BottomTimeline({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-[2%] pb-[1%]">
      <div className="relative h-[0.7cqmin] w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-[#d4b35a]/15">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-cyan-300/80 shadow-[0_0_14px_rgba(212,179,90,0.5)]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   FXLayer — reveal sparkles + gold coins
   ──────────────────────────────────────────────────────────────────────── */

function FXLayer({ revealActive }: { revealActive: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <AnimatePresence>
        {revealActive && (
          <motion.div
            key="reveal-fx"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <GoldCoinShower />
            <SparkleField />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoldCoinShower() {
  const coins = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        duration: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 60,
      })),
    [],
  );
  return (
    <>
      {coins.map((c) => (
        <motion.div
          key={c.id}
          initial={{ y: "-10%", x: 0, opacity: 0, rotate: 0 }}
          animate={{ y: "120%", x: c.drift, opacity: [0, 1, 1, 0], rotate: 540 }}
          transition={{ duration: c.duration, delay: c.delay, ease: "easeIn" }}
          className="absolute rounded-full bg-gradient-to-br from-[#fff3c2] via-[#f3dca0] to-[#b8893a] shadow-[0_0_10px_rgba(243,220,160,0.7)]"
          style={{ left: `${c.left}%`, width: c.size, height: c.size }}
        />
      ))}
    </>
  );
}

function SparkleField() {
  const sparks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: 30 + Math.random() * 50,
        delay: Math.random() * 1.2,
      })),
    [],
  );
  return (
    <>
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{ duration: 1.4, delay: s.delay, repeat: 1, ease: "easeOut" }}
          className="absolute h-1 w-1 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
          style={{ left: `${s.left}%`, top: `${s.top}%` }}
        />
      ))}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   IdleStanding / ShellFrame / helpers
   ──────────────────────────────────────────────────────────────────────── */

function IdleStanding() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center text-white/80">
      <div className="mb-3 text-[1.5cqmin] uppercase tracking-[0.45em] text-[#e8c97a]">Mogsy Quiz Broadcast</div>
      <div className="bg-gradient-to-b from-white to-[#f3dca0] bg-clip-text text-[6.5cqmin] font-black uppercase text-transparent">
        Standing by
      </div>
      <div className="mt-3 text-[1.3cqmin] uppercase tracking-[0.3em] text-white/40">The host returns shortly</div>
    </div>
  );
}

/**
 * ShellFrame — the broadcast stage.
 *
 * The stage is a fixed-aspect canvas (16:9 landscape or 9:16 Shorts) and a
 * CSS size-container: every broadcast component sizes itself in cqmin
 * (container-relative), so composition is identical no matter what shape the
 * pop-out browser window happens to be.
 *
 * fit=false (pop-out / OBS window): the stage letterboxes — centered on a
 * black matte, scaled to the largest size that fits the window while keeping
 * its exact aspect. Recording crops to the stage for a clean 1080x1920 (or
 * 1920x1080) frame.
 *
 * fit=true (Studio embedded preview): same container behavior inside the
 * panel, so the preview is a true miniature of the broadcast.
 */
function ShellFrame({ children, fit, aspect }: { children: React.ReactNode; fit: boolean; aspect: "16:9" | "9:16" }) {
  const ratio = aspect === "16:9" ? "16 / 9" : "9 / 16";
  if (!fit) {
    const width =
      aspect === "16:9"
        ? "min(100vw, calc(100vh * 16 / 9))"
        : "min(100vw, calc(100vh * 9 / 16))";
    return (
      <div className="grid h-screen w-screen place-items-center overflow-hidden bg-black">
        <div
          className="relative overflow-hidden bg-black text-white"
          style={{ aspectRatio: ratio, width, containerType: "size" }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[#d4b35a]/25 bg-black text-white"
      style={{ aspectRatio: ratio, containerType: "size" }}
    >
      {children}
    </div>
  );
}

function choiceLabel(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "label" in c) return String((c as { label: string }).label);
  return String(c ?? "");
}

/* ────────────────────────────────────────────────────────────────────────
   FinalCountdownOverlay — rAF-driven dramatic 3·2·1
   ──────────────────────────────────────────────────────────────────────── */

function FinalCountdownOverlay({
  active,
  phaseStartedAt,
  phaseDurationMs,
}: {
  active: boolean;
  phaseStartedAt: number;
  phaseDurationMs: number;
}) {
  const [n, setN] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    if (!active || phaseDurationMs <= 0) {
      setN(0);
      return;
    }

    let raf = 0;
    let last: 0 | 1 | 2 | 3 = 0;

    const tick = () => {
      const elapsed = Date.now() - phaseStartedAt;
      const remainingMs = phaseDurationMs - elapsed;

      let next: 0 | 1 | 2 | 3 = 0;

      if (remainingMs > 0 && remainingMs <= 3000) {
        if (remainingMs > 2000) next = 3;
        else if (remainingMs > 1000) next = 2;
        else next = 1;
      }

      if (next !== last) {
        last = next;
        setN(next);
      }

      if (remainingMs > -150) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, phaseStartedAt, phaseDurationMs]);

  const intensity = n === 3 ? 0.18 : n === 2 ? 0.28 : n === 1 ? 0.38 : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-[45] overflow-hidden">
      <AnimatePresence>
        {n > 0 && (
          <motion.div
            key={`director-${n}`}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* scene darken / tension */}
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: intensity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            />

            {/* gold edge pressure */}
            <motion.div
              aria-hidden
              className="absolute inset-0 [box-shadow:inset_0_0_0_2px_rgba(212,179,90,0.24),inset_0_0_120px_rgba(212,179,90,0.24)]"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: [0, 0.9, 0.45], scale: [1.05, 1, 1.015] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />

            {/* cinematic bars */}
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[9%] bg-gradient-to-b from-black/90 to-transparent"
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.22 }}
            />
            <motion.div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[9%] bg-gradient-to-t from-black/90 to-transparent"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.22 }}
            />

            {/* shockwave */}
            <motion.div
              aria-hidden
              className="absolute h-[44cqmin] w-[44cqmin] rounded-full border border-[#f3dca0]/60"
              initial={{ opacity: 0.9, scale: 0.15 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
            />

            {/* burst particles */}
            <CountdownBurstParticles seed={n} />

            {/* numeral */}
            <motion.div
              className="relative flex items-center justify-center"
              initial={{ y: "-18cqmin", scale: 0.55, opacity: 0, rotate: -3 }}
              animate={{
                y: 0,
                scale: [0.55, n === 1 ? 1.38 : 1.24, 1.05],
                opacity: [0, 1, 1],
                rotate: [n === 1 ? 4 : -3, 0],
              }}
              exit={{ scale: 1.65, opacity: 0, rotate: 3 }}
              transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="absolute -inset-[12cqmin] rounded-full bg-[radial-gradient(circle,rgba(243,220,160,0.34),rgba(212,179,90,0.16)_38%,transparent_70%)] blur-xl" />
              <div className="absolute -inset-[6cqmin] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_68%)]" />

              <span
                className="relative select-none bg-gradient-to-b from-white via-[#fff0b8] to-[#b7791f] bg-clip-text text-[26cqmin] font-black leading-none tracking-[-0.08em] text-transparent drop-shadow-[0_0_42px_rgba(243,220,160,0.85)]"
                style={{
                  WebkitTextStroke: "2px rgba(255,255,255,0.22)",
                  textShadow: "0 0 32px rgba(243,220,160,0.75), 0 10px 48px rgba(0,0,0,0.85)",
                }}
              >
                {n}
              </span>
            </motion.div>

            {/* final-second atmospheric pulse — warm gold, no harsh white flash */}
            {n === 1 && (
              <motion.div
                aria-hidden
                className="absolute inset-0 bg-[#c8952a]"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.03, 0] }}
                transition={{ duration: 0.35, delay: 0.42 }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CountdownBurstParticles({ seed }: { seed: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: seed === 1 ? 34 : 24 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / (seed === 1 ? 34 : 24);
        const dist = 24 + Math.random() * 34 + (seed === 1 ? 18 : 0);
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 3 + Math.random() * 6,
          delay: Math.random() * 0.08,
        };
      }),
    [seed],
  );

  return (
    <div className="absolute left-1/2 top-1/2">
      {particles.map((p) => (
        <motion.div
          key={`${seed}-${p.id}`}
          className="absolute rounded-full bg-gradient-to-br from-white via-[#f3dca0] to-[#b8893a] shadow-[0_0_14px_rgba(243,220,160,0.9)]"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
          animate={{
            x: `${p.x}vmin`,
            y: `${p.y}vmin`,
            opacity: [0, 1, 0],
            scale: [0.2, 1.1, 0.2],
          }}
          transition={{ duration: 0.85, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   ShortsSceneRow — purpose-built 9:16 layout for TikTok/Reels/Shorts
   Subject art dominates top, question + answers stack below.
   Animation driven by useRevealTimeline (same hook, isShorts=true).
   ──────────────────────────────────────────────────────────────────────── */

function ShortsSceneRow({
  question,
  visuals,
  phase,
  revealActive,
  correctAnswer,
  explanation,
  phaseStartedAt,
  phaseDurationMs,
  phaseIsQuestion,
  questionIndex,
}: {
  question: QuizQuestion;
  visuals: BroadcastVisuals;
  phase: BroadcastPhase;
  revealActive: boolean;
  correctAnswer: string | null;
  explanation: string | null;
  phaseStartedAt: number;
  phaseDurationMs: number;
  phaseIsQuestion: boolean;
  questionIndex: number;
}) {
  const choices = useMemo(() => (question.choices ?? []).map(choiceLabel), [question]);
  const meta = (question.metadata ?? {}) as Record<string, unknown>;

  const subject = useMemo(() => classifySubject(question), [question]);
  const isSpoiler = useMemo(
    () => isSpoilerSubject(question, subject, correctAnswer),
    [question, subject, correctAnswer],
  );

  const revealName =
    correctAnswer ||
    (typeof meta.champion_name === "string" ? meta.champion_name : undefined) ||
    subject.label;

  const tl = useRevealTimeline({
    phase,
    phaseStartedAt,
    phaseDurationMs,
    isSpoiler,
    isShorts: true,
    questionId: String(question.id),
  });

  const subjectHeightStr = useTransform(tl.subjectHeightPct, (v) => `${v}%`);
  const contentYStr      = useTransform(tl.contentY,         (v) => `${v}%`);

  return (
    <motion.div
      className="relative flex h-full w-full flex-col overflow-hidden will-change-transform"
      style={{ fontSize: `${visuals.fontScale}em`, scale: tl.sceneScale }}
    >
      {/* Cinematic darkness overlay */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[35] bg-black"
        style={{ opacity: tl.darkness }}
      />

      {/* Ambient directed background */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_14%,rgba(212,179,90,0.18),transparent_38%),radial-gradient(circle_at_50%_78%,rgba(34,211,238,0.08),transparent_42%)]"
        animate={{ opacity: revealActive ? 0.7 : phaseIsQuestion ? 0.38 : 0.45 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />

      {/* Subject art hero — height expands on reveal */}
      <motion.div
        className="relative z-10 flex w-full shrink-0 items-center justify-center px-[3%] pt-[2.2%]"
        style={{ height: subjectHeightStr, scale: tl.subjectScale }}
      >
        <ScenarioCard question={question} revealActive={revealActive} correctAnswer={correctAnswer} />

        {/* Name card — always in DOM, opacity from timeline */}
        {revealName && (
          <motion.div
            className="pointer-events-none absolute bottom-[5%] left-1/2 z-20 w-[82%] -translate-x-1/2 rounded-xl border border-[#d4b35a]/45 bg-black/55 px-[4%] py-[1.8%] text-center shadow-[0_14px_36px_rgba(0,0,0,0.65)] backdrop-blur-md"
            style={{ opacity: tl.nameOpacity }}
          >
            <div className="text-[1.15cqmin] font-bold uppercase tracking-[0.38em] text-[#e8c97a]/90">
              Correct Answer
            </div>
            <div className="mt-1 bg-gradient-to-b from-white via-white to-[#f3dca0] bg-clip-text text-[3.4cqmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_3px_14px_rgba(0,0,0,0.8)]">
              {revealName}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Stacked content — exits downward on reveal */}
      <motion.div
        className="relative z-10 flex min-h-0 flex-1 flex-col"
        style={{ y: contentYStr, opacity: tl.contentOpacity }}
      >
        {/* Question text — nudged down slightly so the question/insight group
            sits lower without crowding the subject art above. */}
        <div className="px-[4%] pt-[2.2%]">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
            className="text-center text-[4.25cqmin] font-black leading-[1.14] tracking-tight text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.7)]"
          >
            <span className="inline-block bg-gradient-to-b from-white via-white to-[#f3dca0] bg-clip-text text-transparent">
              {question.question_text}
            </span>
          </motion.h1>
        </div>

        {/* Insight flip panel — stable slot below the question, above answers.
            Dormant face during the question phase (unless hidden); flips on
            the Y axis to the explanation face on reveal. Gated by the global
            explanation master switch (showTips && showExplanations); the
            dormant placeholder is independently suppressed by
            hideShortsDormantInsight. When the dormant panel is hidden, the
            slot renders nothing until reveal, then flips the explanation in. */}
        {(() => {
          const explanationsOn = visuals.showTips && visuals.showExplanations;
          const revealedInsight = revealActive && !!explanation;
          const showDormant = !visuals.hideShortsDormantInsight;
          if (!explanationsOn || (!revealedInsight && !showDormant)) return null;
          return (
            <div className="px-[3.5%]">
              <ShortsInsightFlipPanel
                revealed={revealedInsight}
                showDormant={showDormant}
                question={question}
                explanation={explanation}
                revealName={revealName}
              />
            </div>
          );
        })()}

        {/* Current-question countdown now lives in the bottom runner lane
            (BroadcastRunnerTimerLane) — no inline bar here. */}

        {/* Answers — top-aligned so they hug the question/insight group
            instead of floating down toward the core. The compact play-along
            CTA sits directly under the answers (inside the content stack, so
            it exits with the content on reveal) and stays above the stage-
            level crystal core at the bottom edge. */}
        <div className="flex flex-1 flex-col justify-start px-[3.5%] pt-[1.2%]">
          <AnswerGrid choices={choices} style="rows" revealActive={revealActive} correctAnswer={correctAnswer} />
          <div className="mt-[2%] flex justify-center">
            <CompactPlayAlongPanel visuals={visuals} size="shorts" />
          </div>
        </div>
      </motion.div>

      {/* Bottom breathing room so answers never kiss the stage edge */}
      <div className="shrink-0 pb-[2.5%]" />
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   ShortsInsightFlipPanel — Shorts-only insight slot with a cinematic Y-axis
   card flip. The dormant "INSIGHT LOCKED" face occupies the slot during the
   question phase; on reveal the panel turns over to the explanation face.
   Both faces share one grid cell, so the footprint (and therefore layout)
   is identical before/after the flip. 16:9 keeps its own explanation card.
   ──────────────────────────────────────────────────────────────────────── */

function ShortsInsightFlipPanel({
  revealed,
  showDormant,
  question,
  explanation,
  revealName,
}: {
  revealed: boolean;
  showDormant: boolean;
  question: QuizQuestion;
  explanation: string | null;
  revealName: string | null | undefined;
}) {
  // Nothing to show: no dormant placeholder requested and not yet revealed.
  if (!revealed && !showDormant) return null;

  const insightFace = (
    <div
      aria-hidden={!revealed}
      className="relative overflow-hidden rounded-xl border border-emerald-300/35 bg-gradient-to-br from-emerald-400/18 via-emerald-300/10 to-cyan-300/10 p-[2.4%] text-[2.2cqmin] leading-snug text-emerald-50 shadow-[0_16px_38px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      {revealed && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-y-1/2 -left-1/3 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/12 to-transparent"
          initial={{ x: "-20%", opacity: 0 }}
          animate={{ x: "260%", opacity: [0, 0.7, 0] }}
          transition={{ duration: 1.15, ease: "easeOut", delay: 0.4 }}
        />
      )}
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-[1.2cqmin] font-bold uppercase tracking-[0.34em] text-emerald-200/90">Insight</div>
        {revealName && (
          <div className="max-w-[52%] truncate text-right text-[1.95cqmin] font-black uppercase tracking-wide text-white">
            {revealName}
          </div>
        )}
      </div>
      <ExplanationBody question={question} explanation={explanation} />
    </div>
  );

  // Dormant panel suppressed: the slot appears only on reveal and the
  // explanation flips in on its own (no two-faced turn-over needed).
  if (!showDormant) {
    return (
      <div className="mt-[1.6%]" style={{ perspective: "900px" }}>
        <motion.div
          className="[transform-style:preserve-3d]"
          initial={{ rotateY: -90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {insightFace}
        </motion.div>
      </div>
    );
  }

  // Dormant → revealed: a single card turning over on the Y axis. Both faces
  // share one grid cell so the footprint is identical before/after the flip.
  return (
    <div className="mt-[1.6%]" style={{ perspective: "900px" }}>
      <motion.div
        className="relative grid [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Dormant face — dark glass, waiting state */}
        <div
          aria-hidden={revealed}
          className="relative flex min-h-[4.8cqmin] items-center justify-center overflow-hidden rounded-xl border border-cyan-300/20 bg-gradient-to-br from-black/55 via-[#07112d]/60 to-black/55 p-[1.6%] backdrop-blur-md [backface-visibility:hidden] [grid-area:1/1]"
        >
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#d4b35a]/15" />
          <div className="flex items-center gap-[1.6cqmin]">
            <span className="h-[0.9cqmin] w-[0.9cqmin] animate-pulse rounded-full bg-cyan-300/70 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            <span className="h-[0.9cqmin] w-[0.9cqmin] animate-pulse rounded-full bg-[#d4b35a]/70 shadow-[0_0_10px_rgba(212,179,90,0.8)]" />
          </div>
        </div>

        {/* Revealed face — pre-rotated 180° so it reads correctly once turned */}
        <div className="[backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]">
          {insightFace}
        </div>
      </motion.div>
    </div>
  );
}
