import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useTransform } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { EngineSnapshot, BroadcastVisuals } from "@/lib/quiz-broadcast/types";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import { useRevealTimeline } from "./useRevealTimeline";
import { BroadcastKnowledgeCore } from "./BroadcastKnowledgeCore";

type Props = {
  snapshot: EngineSnapshot | null;
  fitContainer?: boolean;
};

/**
 * BroadcastRenderer V5 — Broadcast Camera Timeline.
 * Presentation-only. No engine/session/channel/studio changes.
 *
 * Layout: 28% subject | 52% question | 20% play-along CTA.
 * Champion questions use cinematic splash art.
 * Item/rune/spell/objective questions use a premium framed collectible card.
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

      {/* Bottom progress timeline */}
      <BottomTimeline
        current={Math.min(snapshot.currentIndex + 1, snapshot.playlistLength)}
        total={snapshot.playlistLength}
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

function StageBackdrop({
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
    </>
  );
}

function GoldTrim() {
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
            <span className="text-[0.95vmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a]">Mogsy</span>
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

function ChromeBadge({ children, tone }: { children: React.ReactNode; tone: "cyan" | "amber" | "gold" | "muted" }) {
  const cls =
    tone === "cyan"
      ? "border-cyan-300/30 text-cyan-100/85 bg-cyan-400/[0.05]"
      : tone === "amber"
        ? "border-amber-300/30 text-amber-100/85 bg-amber-300/[0.05]"
        : tone === "gold"
          ? "border-[#d4b35a]/45 text-[#f3dca0] bg-[#d4b35a]/[0.08]"
          : "border-white/15 text-white/60 bg-white/[0.04]";
  return (
    <span className={`rounded-md border px-2 py-1 text-[0.9vmin] font-semibold uppercase tracking-[0.28em] ${cls}`}>
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
          <SubjectPanel
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
              <div className="text-[1.15vmin] font-bold uppercase tracking-[0.45em] text-[#e8c97a]/90">
                Correct Answer
              </div>
              <div className="mt-2 bg-gradient-to-b from-white via-[#fff2bd] to-[#b8893a] bg-clip-text text-[6vmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
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
            phaseStartedAt={phaseStartedAt}
            phaseDurationMs={phaseDurationMs}
            phaseIsQuestion={phaseIsQuestion}
          />
        </motion.div>

        {/* QR / CTA column — exits with content */}
        <motion.div
          className="flex h-full w-[20%] shrink-0 items-center justify-center"
          style={{ x: qrXStr, opacity: tl.qrOpacity }}
        >
          <RightPanel
            visuals={visuals}
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

/* ────────────────────────────────────────────────────────────────────────
   SubjectPanel — champion splash OR premium framed collectible
   ──────────────────────────────────────────────────────────────────────── */

type SubjectKind = "champion" | "item" | "rune" | "spell" | "objective" | "none";

function classifySubject(question: QuizQuestion): {
  kind: SubjectKind;
  label?: string;
  iconUrl?: string;
} {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;

  //
  // NEW KOS PATH
  //
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as Record<string, unknown> | undefined;

  if (subject) {
    switch (subject.type) {
      case "champion":
        return {
          kind: "champion",
          label: (subject.name as string | undefined) ?? (subject.id as string | undefined),
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "item":
        return {
          kind: "item",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "rune":
        return {
          kind: "rune",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "spell":
      case "ability":
        return {
          kind: "spell",
          label: (subject.name as string | undefined) ?? (subject.slot as string | undefined),
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "objective":
        return {
          kind: "objective",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };
    }
  }

  //
  // ---------- Legacy fallback ----------
  //

  const champion =
    typeof meta.champion === "string"
      ? meta.champion
      : typeof meta.champion_name === "string"
        ? meta.champion_name
        : undefined;

  const itemIcon =
    (typeof meta.item_icon === "string" && meta.item_icon) ||
    (typeof meta.image_path === "string" && question.category?.toLowerCase().includes("item")
      ? meta.image_path
      : undefined);

  const runeIcon = typeof meta.rune_icon === "string" ? meta.rune_icon : undefined;

  const spellIcon =
    (typeof meta.spell_icon === "string" && meta.spell_icon) ||
    (typeof meta.summoner_icon === "string" ? meta.summoner_icon : undefined) ||
    (typeof meta.ability_icon === "string" ? meta.ability_icon : undefined);

  const objective = typeof meta.objective_image === "string" ? meta.objective_image : undefined;

  const category = String(question.category ?? "").toLowerCase();
  const text = questionText(question);
  const isChampionQuestion = category.includes("champion") || /\bchampion\b/.test(text);

  if (champion && isChampionQuestion) return { kind: "champion", label: champion };

  if (itemIcon && !isChampionQuestion)
    return {
      kind: "item",
      label: (meta.item_name as string | undefined) || "Item",
      iconUrl: resolveQuizAssetUrl(itemIcon as string),
    };

  if (runeIcon)
    return {
      kind: "rune",
      label: (meta.rune_name as string | undefined) || "Rune",
      iconUrl: resolveQuizAssetUrl(runeIcon),
    };

  if (spellIcon)
    return {
      kind: "spell",
      label: (meta.spell_name as string | undefined) || (meta.ability_name as string | undefined) || "Ability",
      iconUrl: resolveQuizAssetUrl(spellIcon),
    };

  if (objective)
    return {
      kind: "objective",
      label: (meta.objective_name as string | undefined) || "Objective",
      iconUrl: resolveQuizAssetUrl(objective),
    };

  if (champion)
    return {
      kind: "champion",
      label: champion,
    };

  if (question.image_path) {
    return {
      kind: isChampionQuestion ? "champion" : "item",
      iconUrl: resolveQuizAssetUrl(question.image_path),
    };
  }

  return { kind: "none" };
}

function SubjectPanel({
  question,
  revealActive,
  correctAnswer,
}: {
  question: QuizQuestion;
  revealActive: boolean;
  correctAnswer: string | null;
}) {
  const baseSubject = useMemo(() => classifySubject(question), [question]);
  const revealSubject = useMemo(
    () => deriveRevealSubject(question, baseSubject, correctAnswer),
    [question, baseSubject, correctAnswer],
  );
  const spoiler = useMemo(
    () => isSpoilerSubject(question, baseSubject, correctAnswer),
    [question, baseSubject, correctAnswer],
  );

  const subject = revealActive ? revealSubject : baseSubject;
  const shouldHide = spoiler && !revealActive;

  const node = (() => {
    if (shouldHide) {
      return (
        <SubjectPlaceholderCard
          key="placeholder"
          kind={baseSubject.kind === "none" ? inferKindFromQuestion(question) : baseSubject.kind}
          category={String(question.category ?? "")}
        />
      );
    }
    if (subject.kind === "champion" && subject.label) {
      return <ChampionSplashCard key={`champ-${subject.label}`} champion={subject.label} />;
    }
    if (subject.kind === "champion" && subject.iconUrl) {
      return (
        <CollectibleCard
          key={`champion-icon-${subject.iconUrl}`}
          iconUrl={subject.iconUrl}
          label={subject.label || "Champion"}
          kind="champion"
        />
      );
    }
    if (subject.iconUrl) {
      return (
        <CollectibleCard
          key={`icon-${subject.iconUrl}`}
          iconUrl={subject.iconUrl}
          label={subject.label}
          kind={subject.kind}
        />
      );
    }
    return <SubjectPlaceholder key="empty" />;
  })();

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={node.key ?? "subject"}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-full w-full items-center justify-center"
        >
          {node}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Spoiler heuristics ─────────────────────────────────────────────── */

function normalizeLabel(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function questionChoices(question: QuizQuestion): string[] {
  return (question.choices ?? []).map((c) =>
    typeof c === "string" ? c : typeof c === "object" && c && "label" in c ? String((c as { label: unknown }).label) : "",
  );
}

function questionText(question: QuizQuestion): string {
  return String(question.question_text ?? question.question_key ?? "").toLowerCase();
}

function inferKindFromQuestion(question: QuizQuestion): SubjectKind {
  const t = questionText(question);
  const cat = String(question.category ?? "").toLowerCase();
  if (/\bchampion\b/.test(t) || cat.includes("champion")) return "champion";
  if (/\bitem\b/.test(t) || cat.includes("item")) return "item";
  if (/\brune\b/.test(t) || cat.includes("rune")) return "rune";
  if (/\b(ability|spell|passive|ultimate|summoner)\b/.test(t) || cat.includes("spell") || cat.includes("ability"))
    return "spell";
  if (/\bobjective\b/.test(t) || cat.includes("objective")) return "objective";
  return "none";
}

function isSpoilerSubject(
  question: QuizQuestion,
  subject: { kind: SubjectKind; label?: string },
  correctAnswer: string | null,
): boolean {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;

  // KOS v1 presentation contract.
  // If metadata.presentation exists, it is the source of truth.
  const presentation = meta.presentation as Record<string, unknown> | undefined;
  if (presentation && typeof presentation === "object") {
    if (typeof presentation.spoiler === "boolean") {
      return presentation.spoiler;
    }

    if (presentation.timing === "reveal" || presentation.role === "answer") {
      return true;
    }

    if (
      presentation.timing === "question" ||
      presentation.role === "context" ||
      presentation.role === "clue" ||
      presentation.role === "decorative"
    ) {
      return false;
    }
  }

  // Legacy explicit overrides.
  if (meta.spoiler === true || meta.subject_is_answer === true) return true;
  if (meta.spoiler === false || meta.subject_is_context === true) return false;

  const text = questionText(question);

  // Context cues — subject describes the question, not the answer.
  const statCue =
    /\b(cost|price|gold|stat|range|cooldown|mana|health|hp|ad|ap|armor|mr|magic resist|attack speed|move(?:ment)? speed|damage|recipe|builds? from|builds? into)\b/.test(
      text,
    );
  if (statCue) return false;

  // Identification: "identify this ability / name this spell" → icon is the clue.
  if (subject.kind === "spell" && /\b(identify|name|guess)\b[^.?!]*\b(ability|spell|passive|ultimate)\b/.test(text)) {
    return false;
  }

  const choices = questionChoices(question).map(normalizeLabel).filter(Boolean);
  const subjectLc = normalizeLabel(subject.label);
  const answerLc = normalizeLabel(correctAnswer);

  // Direct: subject label equals an answer choice or the correct answer.
  if (subject.label && subject.kind !== "none") {
    if (answerLc && subjectLc === answerLc) return true;
    if (subjectLc && choices.includes(subjectLc)) return true;
  }

  // Cross-kind: "which champion has this ability?" → ability icon spoils champion answer.
  if (subject.kind === "spell" && /\b(which|what)\s+champion\b[^.?!]*\b(ability|spell|passive|ultimate)\b/.test(text)) {
    return true;
  }
  if (/\bhas this (ability|spell|passive|ultimate|rune|item)\b/.test(text)) {
    return true;
  }

  // Identification intent matching subject noun.
  const idIntent = /\b(which|what|name the|identify|guess)\b/.test(text);
  if (idIntent) {
    if (subject.kind === "champion" && /\bchampion\b/.test(text)) return true;
    if (subject.kind === "item" && /\bitem\b/.test(text)) return true;
    if (subject.kind === "rune" && /\brune\b/.test(text)) return true;
    if (subject.kind === "objective" && /\bobjective\b/.test(text)) return true;
  }

  return false;
}

function deriveRevealSubject(
  question: QuizQuestion,
  base: { kind: SubjectKind; label?: string; iconUrl?: string },
  correctAnswer: string | null,
): { kind: SubjectKind; label?: string; iconUrl?: string } {
  if (!correctAnswer) return base;

  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const presentation = meta.presentation as Record<string, unknown> | undefined;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as Record<string, unknown> | undefined;

  const looksChamp =
    inferKindFromQuestion(question) === "champion" ||
    /\bchampion\b/.test(questionText(question)) ||
    String(question.category ?? "")
      .toLowerCase()
      .includes("champion");

  // KOS answer-reveal champion questions should reveal the answer name explicitly.
  if (
    looksChamp &&
    (presentation?.role === "answer" || presentation?.timing === "reveal" || base.kind === "champion")
  ) {
    return {
      kind: "champion",
      label: (subject?.name as string | undefined) ?? (meta.champion_name as string | undefined) ?? correctAnswer,
      iconUrl: subject?.icon ? resolveQuizAssetUrl(subject.icon as string) : base.iconUrl,
    };
  }

  // If we have nothing to show but the question looks like a champion-id and the answer is a champion name,
  // upgrade to a champion subject so the splash appears on reveal.
  if (base.kind === "none" && looksChamp) {
    return { kind: "champion", label: correctAnswer };
  }

  return base;
}

/* ── Neutral placeholder card (shown when subject would spoil the answer) ── */

function SubjectPlaceholderCard({ kind, category }: { kind: SubjectKind; category: string }) {
  const accent =
    kind === "champion"
      ? { ring: "ring-sky-300/30", glow: "bg-sky-400/15", label: "Champion" }
      : kind === "item"
        ? { ring: "ring-[#d4b35a]/35", glow: "bg-[#d4b35a]/15", label: "Item" }
        : kind === "rune"
          ? { ring: "ring-violet-300/30", glow: "bg-violet-400/15", label: "Rune" }
          : kind === "spell"
            ? { ring: "ring-cyan-300/30", glow: "bg-cyan-400/15", label: "Ability" }
            : kind === "objective"
              ? { ring: "ring-rose-300/30", glow: "bg-rose-400/15", label: "Objective" }
              : { ring: "ring-white/15", glow: "bg-white/10", label: "Mystery" };

  return (
    <motion.div
      className={`relative flex h-[78%] w-[80%] flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#d4b35a]/30 bg-gradient-to-b from-black/55 via-black/40 to-black/60 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]`}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className={`pointer-events-none absolute inset-[6%] rounded-xl ring-1 ring-inset ${accent.ring}`} />
      <div className={`pointer-events-none absolute inset-0 rounded-2xl ${accent.glow} blur-3xl opacity-50`} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[28vmin] font-black leading-none text-white/[0.04]"
      >
        ?
      </div>
      <div className="relative z-10 flex flex-col items-center gap-[3%] px-[8%] text-center">
        <div className="text-[0.95vmin] font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90">{accent.label}</div>
        <div className="text-[1.4vmin] font-semibold uppercase tracking-[0.32em] text-white/55">
          {category.replace(/_/g, " ")}
        </div>
        <div className="mt-[2%] h-[2px] w-[44%] bg-gradient-to-r from-transparent via-[#d4b35a]/60 to-transparent" />
        <div className="mt-[3%] text-[1.15vmin] uppercase tracking-[0.28em] text-white/40">Reveal incoming…</div>
      </div>
    </motion.div>
  );
}

function ChampionSplashCard({ champion }: { champion: string }) {
  const { data: championManifest } = useChampionAssets();
  const [primaryFailed, setPrimaryFailed] = useState(false);

  const url = useMemo(() => {
    if (primaryFailed) return null;
    return getChampionSplash(championManifest, champion);
  }, [championManifest, champion, primaryFailed]);

  return (
    <div className="relative h-[94%] w-[94%] overflow-hidden rounded-2xl border border-[#d4b35a]/30 bg-black/40 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.85)]">
      {/* slow parallax drift */}
      <motion.div
        className="absolute inset-[-6%]"
        initial={{ scale: 1.08, x: 0, y: 0 }}
        animate={{ scale: 1.14, x: -8, y: -6 }}
        transition={{ duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      >
        {url ? (
          <img
            src={url}
            alt={champion}
            onError={() => setPrimaryFailed(true)}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-900 to-slate-800" />
        )}
      </motion.div>

      {/* moving light streak */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-y-1/2 -left-1/3 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/8 to-transparent"
        initial={{ x: "-30%", opacity: 0 }}
        animate={{ x: "260%", opacity: [0, 0.5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", repeatDelay: 4 }}
      />

      {/* cinematic vignette + bottom gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" />
      <div className="pointer-events-none absolute inset-0 [box-shadow:inset_0_0_120px_rgba(0,0,0,0.6)]" />

      {/* gold inner border */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-[#d4b35a]/20" />

      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[6%] opacity-0">
        <div className="text-[1.05vmin] font-bold uppercase tracking-[0.35em] text-[#e8c97a]/90">Champion</div>
        <div className="mt-1 text-[2.6vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]">
          {champion}
        </div>
        <div className="mt-2 h-[2px] w-[40%] bg-gradient-to-r from-[#d4b35a] to-transparent" />
      </div>
    </div>
  );
}

function CollectibleCard({ iconUrl, label, kind }: { iconUrl: string; label?: string; kind: SubjectKind }) {
  const kindLabel =
    kind === "champion"
      ? "Champion"
      : kind === "item"
        ? "Item"
        : kind === "rune"
          ? "Rune"
          : kind === "spell"
            ? "Ability"
            : kind === "objective"
              ? "Objective"
              : "Subject";
  const [errored, setErrored] = useState(false);
  return (
    <motion.div
      className="relative flex h-[78%] w-[80%] flex-col items-center justify-center rounded-2xl border border-[#d4b35a]/35 bg-gradient-to-b from-black/55 via-black/40 to-black/60 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* rotating shine */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-y-1/2 -left-1/4 w-1/3 rotate-[20deg] bg-gradient-to-r from-transparent via-[#f3dca0]/15 to-transparent"
        initial={{ x: "-20%", opacity: 0 }}
        animate={{ x: "260%", opacity: [0, 0.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 3 }}
      />
      {/* gold inner trim */}
      <div className="pointer-events-none absolute inset-[6%] rounded-xl ring-1 ring-inset ring-[#d4b35a]/35" />
      <div className="mt-[8%] text-[0.95vmin] font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90">
        {" "}
        {kindLabel}{" "}
      </div>
      <div className="relative mt-[4%] flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-[#d4b35a]/15 blur-2xl" />
        {!errored ? (
          <img
            src={iconUrl}
            alt={label || kindLabel}
            onError={() => setErrored(true)}
            className="relative h-[11vmin] w-[11vmin] rounded-xl border border-[#d4b35a]/40 object-cover shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <div className="relative flex h-[11vmin] w-[11vmin] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[2vmin] text-white/40">
            ?
          </div>
        )}
      </div>
      {label && (
        <div className="mt-[6%] max-w-[86%] text-center">
          <div className="text-[0.9vmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a]/80">{kindLabel}</div>
          <div className="mt-1 text-[2.05vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]">
            {label}
          </div>
        </div>
      )}
      <div className="mt-3 h-[2px] w-[36%] bg-gradient-to-r from-transparent via-[#d4b35a]/70 to-transparent" />
    </motion.div>
  );
}

function SubjectPlaceholder() {
  return (
    <div className="flex h-[78%] w-[80%] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[1.4vmin] uppercase tracking-[0.3em] text-white/30">
      Mogsy
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
  phaseStartedAt,
  phaseDurationMs,
  phaseIsQuestion,
}: {
  question: QuizQuestion;
  visuals: BroadcastVisuals;
  revealActive: boolean;
  correctAnswer: string | null;
  explanation: string | null;
  phaseStartedAt: number;
  phaseDurationMs: number;
  phaseIsQuestion: boolean;
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
      <CountdownInline
        active={phaseIsQuestion}
        style={visuals.countdownStyle}
        phaseStartedAt={phaseStartedAt}
        phaseDurationMs={phaseDurationMs}
      />
      <div className="relative min-h-[12%]">
        <AnimatePresence>
          {revealActive && explanation && visuals.showTips && (
            <motion.div
              key="reveal-overlay"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="absolute inset-x-0 top-0 rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/12 via-emerald-300/8 to-cyan-300/8 p-[1.4%] text-[1.75vmin] leading-relaxed text-emerald-50 backdrop-blur-md"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <div className="text-[1.05vmin] font-bold uppercase tracking-[0.3em] text-emerald-200/90">
                  Correct Answer
                </div>
                {correctAnswer && (
                  <div className="text-[1.7vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                    {correctAnswer}
                  </div>
                )}
              </div>
              <div className="text-emerald-50/95">{explanation}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const QuestionText = memo(function QuestionText({ text }: { text: string }) {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="text-[4.6vmin] font-black leading-[1.14] tracking-tight text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.7)]"
    >
      <span className="inline-block bg-gradient-to-b from-white via-white to-[#f3dca0] bg-clip-text text-transparent">
        {text}
      </span>
    </motion.h1>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   AnswerGrid
   ──────────────────────────────────────────────────────────────────────── */

const AnswerGrid = memo(function AnswerGrid({
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
              "relative flex min-h-[7vmin] items-center gap-[1.2%] overflow-hidden rounded-xl border px-[2%] py-[1.4%] text-[2.3vmin] font-bold backdrop-blur-md",
              "transition-[background-color,border-color,color,box-shadow,opacity,filter,transform] duration-[320ms] ease-out",
              isCorrect
                ? "border-emerald-300/90 bg-gradient-to-br from-emerald-400/35 via-emerald-400/22 to-cyan-400/22 text-white shadow-[0_0_90px_rgba(16,185,129,0.7)] scale-[1.06] -translate-y-[0.4vmin] z-[2]"
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
                "relative inline-flex h-[3.4vmin] w-[3.4vmin] shrink-0 items-center justify-center rounded-md text-[1.7vmin] font-black tabular-nums",
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

function CountdownInline({
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
  if (!active || phaseDurationMs <= 0) return <div className="h-[2.4vmin]" />;
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
          className="rounded-lg border border-[#d4b35a]/40 bg-black/40 px-[1.4%] py-[0.6%] text-[3.2vmin] font-black tabular-nums text-[#f3dca0] backdrop-blur"
        >
          --
        </div>
      </div>
    );
  }
  if (style === "ring") {
    const C = 2 * Math.PI * 40;
    return (
      <div className="relative mx-auto h-[6vmin] w-[6vmin]">
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
    <div className="relative h-[1.4vmin] w-full overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-[#d4b35a]/20">
      <div
        ref={barRef}
        className="h-full rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-emerald-300 will-change-[width] shadow-[0_0_18px_rgba(212,179,90,0.55)]"
        style={{ width: "100%" }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   RightPanel — decides between QR/website CTA and Hextech Knowledge Core.
   When both showQrCode and showWebsite are OFF, the Knowledge Core occupies
   the right-hand panel. The column wrapper and motion bindings are unchanged.
   ──────────────────────────────────────────────────────────────────────── */

function RightPanel({
  visuals,
  phase,
  questionIndex,
  phaseStartedAt,
  phaseDurationMs,
}: {
  visuals: BroadcastVisuals;
  phase: BroadcastPhase;
  questionIndex: number;
  phaseStartedAt: number;
  phaseDurationMs: number;
}) {
  if (visuals.showQrCode || visuals.showWebsite) {
    return <PlayAlongPanel visuals={visuals} />;
  }
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
   PlayAlongPanel — premium CTA card with QR
   ──────────────────────────────────────────────────────────────────────── */

function PlayAlongPanel({ visuals }: { visuals: BroadcastVisuals }) {
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
        <div className="text-[0.95vmin] font-bold uppercase tracking-[0.4em] text-[#e8c97a]">Play along</div>
        <div className="mt-1 text-[1.4vmin] font-extrabold uppercase tracking-[0.18em] text-white">Scan to join</div>
      </div>
      {visuals.showQrCode && (
        <div className="relative rounded-lg border border-[#d4b35a]/35 bg-white/95 p-[6%] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(`https://${visuals.websiteUrl}`)}`}
            alt=""
            className="h-[8vmin] w-[8vmin]"
          />
        </div>
      )}
      <div className="relative text-center">
        <div className="text-[1.05vmin] uppercase tracking-[0.35em] text-white/55">Web</div>
        <div className="mt-0.5 text-[1.5vmin] font-extrabold tracking-wider text-[#f3dca0]">{visuals.websiteUrl}</div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   BottomTimeline — slim progress styling
   ──────────────────────────────────────────────────────────────────────── */

function BottomTimeline({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-[2%] pb-[1%]">
      <div className="relative h-[0.7vmin] w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-[#d4b35a]/15">
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
      <div className="mb-3 text-[1.5vmin] uppercase tracking-[0.45em] text-[#e8c97a]">Mogsy Quiz Broadcast</div>
      <div className="bg-gradient-to-b from-white to-[#f3dca0] bg-clip-text text-[6.5vmin] font-black uppercase text-transparent">
        Standing by
      </div>
      <div className="mt-3 text-[1.3vmin] uppercase tracking-[0.3em] text-white/40">The host returns shortly</div>
    </div>
  );
}

function ShellFrame({ children, fit, aspect }: { children: React.ReactNode; fit: boolean; aspect: "16:9" | "9:16" }) {
  if (!fit) {
    return <div className="relative h-screen w-screen overflow-hidden bg-black text-white">{children}</div>;
  }
  const ratio = aspect === "16:9" ? "aspect-video" : "aspect-[9/16]";
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-[#d4b35a]/25 bg-black text-white ${ratio}`}
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
              className="absolute h-[44vmin] w-[44vmin] rounded-full border border-[#f3dca0]/60"
              initial={{ opacity: 0.9, scale: 0.15 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
            />

            {/* burst particles */}
            <CountdownBurstParticles seed={n} />

            {/* numeral */}
            <motion.div
              className="relative flex items-center justify-center"
              initial={{ y: "-18vmin", scale: 0.55, opacity: 0, rotate: -3 }}
              animate={{
                y: 0,
                scale: [0.55, n === 1 ? 1.38 : 1.24, 1.05],
                opacity: [0, 1, 1],
                rotate: [n === 1 ? 4 : -3, 0],
              }}
              exit={{ scale: 1.65, opacity: 0, rotate: 3 }}
              transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="absolute -inset-[12vmin] rounded-full bg-[radial-gradient(circle,rgba(243,220,160,0.34),rgba(212,179,90,0.16)_38%,transparent_70%)] blur-xl" />
              <div className="absolute -inset-[6vmin] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_68%)]" />

              <span
                className="relative select-none bg-gradient-to-b from-white via-[#fff0b8] to-[#b7791f] bg-clip-text text-[26vmin] font-black leading-none tracking-[-0.08em] text-transparent drop-shadow-[0_0_42px_rgba(243,220,160,0.85)]"
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
  const qrYStr           = useTransform(tl.qrY,              (v) => `${v}%`);

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
        <SubjectPanel question={question} revealActive={revealActive} correctAnswer={correctAnswer} />

        {/* Name card — always in DOM, opacity from timeline */}
        {revealName && (
          <motion.div
            className="pointer-events-none absolute bottom-[5%] left-1/2 z-20 w-[82%] -translate-x-1/2 rounded-xl border border-[#d4b35a]/45 bg-black/55 px-[4%] py-[1.8%] text-center shadow-[0_14px_36px_rgba(0,0,0,0.65)] backdrop-blur-md"
            style={{ opacity: tl.nameOpacity }}
          >
            <div className="text-[1.15vmin] font-bold uppercase tracking-[0.38em] text-[#e8c97a]/90">
              Correct Answer
            </div>
            <div className="mt-1 bg-gradient-to-b from-white via-white to-[#f3dca0] bg-clip-text text-[3.4vmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_3px_14px_rgba(0,0,0,0.8)]">
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
        {/* Question text */}
        <div className="px-[4%]">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
            className="text-center text-[3.75vmin] font-black leading-[1.14] tracking-tight text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.7)]"
          >
            <span className="inline-block bg-gradient-to-b from-white via-white to-[#f3dca0] bg-clip-text text-transparent">
              {question.question_text}
            </span>
          </motion.h1>
        </div>

        {/* Countdown bar */}
        <div className="px-[6%] py-[1.2%]">
          <CountdownInline
            active={phaseIsQuestion}
            style="bar"
            phaseStartedAt={phaseStartedAt}
            phaseDurationMs={phaseDurationMs}
          />
        </div>

        {/* Answers */}
        <div className="flex flex-1 flex-col justify-center px-[3.5%]">
          <AnswerGrid choices={choices} style="rows" revealActive={revealActive} correctAnswer={correctAnswer} />
        </div>

        {/* Explanation card */}
        <div className="min-h-[11%] px-[3.5%]">
          <AnimatePresence>
            {revealActive && explanation && visuals.showTips && (
              <motion.div
                key="reveal-shorts"
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-xl border border-emerald-300/35 bg-gradient-to-br from-emerald-400/18 via-emerald-300/10 to-cyan-300/10 p-[2.4%] text-[1.95vmin] leading-snug text-emerald-50 shadow-[0_16px_38px_rgba(0,0,0,0.45)] backdrop-blur-md"
              >
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -inset-y-1/2 -left-1/3 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/12 to-transparent"
                  initial={{ x: "-20%", opacity: 0 }}
                  animate={{ x: "260%", opacity: [0, 0.7, 0] }}
                  transition={{ duration: 1.15, ease: "easeOut", delay: 0.15 }}
                />
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div className="text-[1.05vmin] font-bold uppercase tracking-[0.34em] text-emerald-200/90">Insight</div>
                  {revealName && (
                    <div className="max-w-[52%] truncate text-right text-[1.75vmin] font-black uppercase tracking-wide text-white">
                      {revealName}
                    </div>
                  )}
                </div>
                <div className="text-emerald-50/95">{explanation}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* CTA footer — exits with content */}
      <motion.div
        className="relative z-10 flex shrink-0 items-center justify-center gap-3 pb-[1.2%]"
        style={{ y: qrYStr, opacity: tl.qrOpacity }}
      >
        {visuals.showQrCode || visuals.showWebsite ? (
          <>
            {visuals.showQrCode && (
              <div className="rounded-md border border-[#d4b35a]/40 bg-white/95 p-1 shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(`https://${visuals.websiteUrl}`)}`}
                  alt=""
                  className="h-[5vmin] w-[5vmin]"
                />
              </div>
            )}
            {visuals.showWebsite && (
              <div className="flex flex-col text-left">
                <div className="text-[1vmin] uppercase tracking-[0.35em] text-white/55">Play along</div>
                <div className="text-[1.6vmin] font-extrabold tracking-wider text-[#f3dca0]">{visuals.websiteUrl}</div>
              </div>
            )}
          </>
        ) : (
          <BroadcastKnowledgeCore
            phase={phase}
            questionIndex={questionIndex}
            phaseStartedAt={phaseStartedAt}
            phaseDurationMs={phaseDurationMs}
            compact
          />
        )}
      </motion.div>
    </motion.div>
  );
}
