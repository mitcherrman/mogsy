import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { EngineSnapshot, BroadcastVisuals } from "@/lib/quiz-broadcast/types";
import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { useChampionImage } from "@/hooks/useChampionImage";

type Props = {
  snapshot: EngineSnapshot | null;
  /** When true, fits to parent (preview). When false, fills viewport (window). */
  fitContainer?: boolean;
};

/**
 * BroadcastRenderer V2 — production polish pass.
 * --------------------------------------------------------------------------
 * Stable outer Stage that mounts once per session and never keys by question
 * or phase. Inner regions own their own AnimatePresence:
 *   - QuestionBlock + AnswerGrid are keyed only by `question.id` so phase
 *     changes (question → reveal → explanation → transition) do NOT remount
 *     the visible content. Reveal styling is applied in place.
 *   - The countdown ticker runs on requestAnimationFrame inside its own
 *     component, so it never re-renders siblings.
 *   - The explanation overlay fades in over the answers during reveal and
 *     does not introduce a separate scene.
 * The redundant "unanswered same-question" frame between reveal and the next
 * question is eliminated because the renderer only ever pairs a question id
 * with one revealed/unrevealed state, and crossfades directly to the next
 * question id when the engine advances.
 */
export default function BroadcastRenderer({ snapshot, fitContainer = false }: Props) {
  if (!snapshot) {
    return (
      <ShellFrame fit={fitContainer} aspect="16:9">
        <div className="flex h-full w-full items-center justify-center text-white/60">
          Waiting for Broadcast Studio signal…
        </div>
      </ShellFrame>
    );
  }
  return <Stage snapshot={snapshot} fitContainer={fitContainer} />;
}

// ===========================================================================
// Stage — stable outer shell. Mounts once per session, never keyed by phase.
// ===========================================================================

function Stage({ snapshot, fitContainer }: { snapshot: EngineSnapshot; fitContainer: boolean }) {
  const v = snapshot.config.visuals;
  const q = snapshot.currentQuestion;
  const phase = snapshot.phase;
  // Reveal is "active" any time we're past the question-asking phase and the
  // engine has produced a correct answer. This is the only signal that
  // toggles answer styling — keeps the answer grid mounted across phases.
  const revealActive = phase !== "question" && phase !== "idle" && !!snapshot.correctAnswer;

  const themeClass =
    v.theme === "midnight"
      ? "from-[#05060f] via-[#0a0b1f] to-[#15103a]"
      : v.theme === "classic"
      ? "from-[#0b0f1a] via-[#0e1626] to-[#0a1322]"
      : "from-[#06091a] via-[#0a1530] to-[#1a0f3a]";

  return (
    <ShellFrame fit={fitContainer} aspect={v.aspect}>
      {/* Background layer — stable, never remounts */}
      <div className={`absolute inset-0 bg-gradient-to-br ${themeClass}`} />
      {v.backgroundAnimation === "pulse" && (
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_25%_15%,rgba(120,150,255,0.22),transparent_45%),radial-gradient(circle_at_80%_85%,rgba(255,120,200,0.16),transparent_50%)]" />
      )}
      {v.backgroundAnimation === "particles" && (
        <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:24px_24px]" />
      )}
      {/* Subtle vignette so question text reads cleanly on any theme */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />

      {/* Top chrome — de-emphasized */}
      <TopChrome snapshot={snapshot} />

      {/* Main stage — single AnimatePresence keyed on question id */}
      <div className="absolute inset-x-0 top-[8%] bottom-[10%] z-0 flex items-stretch px-[3%]">
        {phase === "idle" || !q ? (
          <IdleStanding />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={String(q.id)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex h-full w-full"
            >
              <QuestionScene
                question={q}
                visuals={v}
                revealActive={revealActive}
                correctAnswer={snapshot.correctAnswer}
                explanation={snapshot.explanation}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Countdown — only during the asking phase. Lives outside the
          question AnimatePresence so its mount/unmount never disturbs
          the question block. */}
      <CountdownLayer
        active={phase === "question"}
        style={v.countdownStyle}
        phaseStartedAt={snapshot.phaseStartedAt}
        phaseDurationMs={snapshot.phaseDurationMs}
      />

      {/* Bottom chrome — QR + website, low priority */}
      <BottomChrome visuals={v} />
    </ShellFrame>
  );
}

// ===========================================================================
// QuestionScene — question + answers + (optional) art + reveal overlay.
// Stays mounted across question → reveal → explanation → transition. Only
// changes when the question id changes.
// ===========================================================================

function QuestionScene({
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
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const champion = (meta.champion as string | undefined) ?? "";
  const isVertical = visuals.aspect === "9:16";

  const artUrl = useSubjectArt(question);
  const hasArt = !!artUrl;

  return (
    <div
      className={[
        "relative flex h-full w-full gap-[2.2%]",
        isVertical ? "flex-col" : "flex-row",
      ].join(" ")}
      style={{ fontSize: `${visuals.fontScale}em` }}
    >
      {hasArt && (
        <div
          className={[
            "relative flex shrink-0 items-center justify-center",
            isVertical ? "h-[30%] w-full" : "h-full w-[28%]",
          ].join(" ")}
        >
          <SubjectArt url={artUrl} label={champion} vertical={isVertical} />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-[2.4%]">
        <QuestionText text={question.question_text ?? ""} />

        <AnswerGrid
          choices={choices}
          style={visuals.answerStyle}
          revealActive={revealActive}
          correctAnswer={correctAnswer}
        />

        {/* Reserved vertical space for the reveal overlay so the layout
            never jumps when it appears. */}
        <div className="relative min-h-[14%]">
          <AnimatePresence>
            {revealActive && explanation && visuals.showTips && (
              <motion.div
                key="reveal-overlay"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="absolute inset-x-0 top-0 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-[1.6%] text-[1.9vmin] leading-relaxed text-cyan-50 backdrop-blur-md"
              >
                <div className="mb-1 text-[1.15vmin] font-bold uppercase tracking-[0.25em] text-cyan-200/90">
                  {champion ? `${champion} · Insight` : "Insight"}
                </div>
                {explanation}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// QuestionText
// ===========================================================================

const QuestionText = memo(function QuestionText({ text }: { text: string }) {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="text-[4.2vmin] font-extrabold leading-[1.18] tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] sm:text-[4.8vmin]"
    >
      {text}
    </motion.h1>
  );
});

// ===========================================================================
// AnswerGrid — stable across phases. Reveal styling applied in place via
// CSS transitions on existing nodes; no remount when correctAnswer flips.
// ===========================================================================

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
  const containerClass =
    style === "rows"
      ? "flex w-full flex-col gap-[1.4%]"
      : "grid w-full grid-cols-2 gap-[1.6%]";

  return (
    <div className={containerClass}>
      {choices.map((label, i) => {
        const isCorrect = revealActive && correctAnswer != null && label === correctAnswer;
        const isWrong = revealActive && correctAnswer != null && label !== correctAnswer;
        return (
          <motion.div
            key={`${i}-${label}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i + 0.08, duration: 0.32, ease: "easeOut" }}
            className={[
              "relative flex min-h-[7.5vmin] items-center gap-[1.2%] overflow-hidden rounded-2xl border px-[2.2%] py-[1.6%] text-[2.4vmin] font-semibold backdrop-blur-md",
              "transition-[background-color,border-color,color,box-shadow,opacity,filter,transform] duration-[280ms] ease-out",
              isCorrect
                ? "border-emerald-400/80 bg-emerald-400/20 text-emerald-50 shadow-[0_0_42px_rgba(16,185,129,0.4)] scale-[1.015]"
                : isWrong
                ? "border-white/8 bg-white/[0.03] text-white/40 opacity-60 [filter:grayscale(0.4)]"
                : "border-white/15 bg-white/[0.06] text-white",
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-[3.4vmin] w-[3.4vmin] shrink-0 items-center justify-center rounded-lg text-[1.7vmin] font-black tabular-nums uppercase tracking-widest",
                isCorrect
                  ? "bg-emerald-400/30 text-emerald-50"
                  : "bg-white/10 text-cyan-200",
              ].join(" ")}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">{label}</span>
          </motion.div>
        );
      })}
    </div>
  );
});

// ===========================================================================
// SubjectArt — content-aware artwork. Champion via useChampionImage;
// item/rune/spell/ability via metadata icon path; otherwise nothing.
// Loads are best-effort, never block the rest of the stage.
// ===========================================================================

function useSubjectArt(question: QuizQuestion): string | undefined {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const champ = typeof meta.champion === "string" ? meta.champion : undefined;
  const championUrl = useChampionImage(champ);

  // Direct image fields (any of these can resolve immediately).
  const candidates: Array<string | undefined> = [
    typeof meta.ability_icon === "string" ? meta.ability_icon : undefined,
    typeof meta.item_icon === "string" ? meta.item_icon : undefined,
    typeof meta.rune_icon === "string" ? meta.rune_icon : undefined,
    typeof meta.spell_icon === "string" ? meta.spell_icon : undefined,
    typeof meta.summoner_icon === "string" ? meta.summoner_icon : undefined,
    typeof meta.objective_image === "string" ? meta.objective_image : undefined,
    typeof meta.image_path === "string" ? meta.image_path : undefined,
    question.image_path,
  ];
  const direct = candidates.find(Boolean);
  if (direct) return resolveQuizAssetUrl(direct);
  return championUrl;
}

function SubjectArt({ url, label, vertical }: { url: string; label?: string; vertical: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
        vertical ? "max-h-full" : "",
      ].join(" ")}
    >
      <img
        src={url}
        alt={label || "Subject"}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={[
          "h-full w-full object-cover transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      {label && (
        <div className="absolute bottom-[4%] left-[5%] right-[5%] text-[1.5vmin] font-bold uppercase tracking-[0.25em] text-white/90 drop-shadow">
          {label}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// TopChrome / BottomChrome / IdleStanding
// ===========================================================================

function TopChrome({ snapshot }: { snapshot: EngineSnapshot }) {
  const v = snapshot.config.visuals;
  const q = snapshot.currentQuestion;
  const meta = (q?.metadata ?? {}) as Record<string, unknown>;
  const patch = (meta.patch as string | undefined) ?? "";
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-[1.6%] text-white/80">
      <div className="flex items-center gap-[0.8%]">
        {v.showLogo && (
          <div className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-white/75">
            <Sparkles className="h-3 w-3 text-cyan-300/80" />
            <span className="text-[1vmin] font-semibold uppercase tracking-[0.22em]">Mogsy</span>
          </div>
        )}
        {v.showCategoryBadge && q && (
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[0.95vmin] uppercase tracking-[0.22em] text-white/55">
            {String(q.category).replace(/_/g, " ")}
          </span>
        )}
        {v.showDifficultyBadge && q?.difficulty != null && (
          <span className="rounded-full bg-amber-300/8 px-2.5 py-1 text-[0.95vmin] uppercase tracking-[0.22em] text-amber-200/80">
            Diff {q.difficulty}
          </span>
        )}
        {v.showPatchLabel && patch && (
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[0.95vmin] uppercase tracking-[0.22em] text-white/55">
            Patch {patch}
          </span>
        )}
      </div>
      <div className="flex items-center gap-[0.8%]">
        {v.showQuestionNumber && (
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[0.95vmin] font-semibold uppercase tracking-[0.22em] text-white/65 tabular-nums">
            {Math.min(snapshot.currentIndex + 1, snapshot.playlistLength)} / {snapshot.playlistLength}
          </span>
        )}
      </div>
    </div>
  );
}

function BottomChrome({ visuals: v }: { visuals: BroadcastVisuals }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-end p-[1.6%] text-white/70">
      {v.showQrCode ? (
        <div className="flex items-center gap-2 rounded-xl bg-black/30 p-[0.7%] backdrop-blur">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(`https://${v.websiteUrl}`)}`}
            alt=""
            className="h-[5.5vmin] w-[5.5vmin] rounded-md opacity-90"
          />
          <div className="pr-2 text-[0.9vmin] uppercase tracking-[0.22em] text-white/55">
            Play along
            <div className="text-[1.1vmin] font-bold tracking-[0.18em] text-white/90">{v.websiteUrl}</div>
          </div>
        </div>
      ) : v.showWebsite ? (
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[1vmin] font-semibold uppercase tracking-[0.22em] text-white/55">
          {v.websiteUrl}
        </span>
      ) : null}
    </div>
  );
}

function IdleStanding() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center text-white/80">
      <div className="mb-3 text-[1.8vmin] uppercase tracking-[0.4em] text-cyan-200/80">Mogsy Quiz Broadcast</div>
      <div className="text-[6vmin] font-extrabold">Standing by…</div>
      <div className="mt-3 text-[1.4vmin] text-white/45">The host will be back shortly.</div>
    </div>
  );
}

// ===========================================================================
// CountdownLayer — rAF-driven. Owns its own ticking so the rest of the
// renderer doesn't re-render at 60fps.
// ===========================================================================

function CountdownLayer({
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
  if (!active || phaseDurationMs <= 0) return null;
  return (
    <CountdownView
      style={style}
      phaseStartedAt={phaseStartedAt}
      phaseDurationMs={phaseDurationMs}
    />
  );
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
  const ringDigitsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - phaseStartedAt);
      const progress = Math.min(1, elapsed / phaseDurationMs);
      const remainingSec = Math.max(0, Math.ceil((phaseDurationMs - elapsed) / 1000));
      if (barRef.current) barRef.current.style.width = `${(1 - progress) * 100}%`;
      if (digitsRef.current) digitsRef.current.textContent = String(remainingSec);
      if (ringDigitsRef.current) ringDigitsRef.current.textContent = String(remainingSec);
      if (ringRef.current) {
        const C = 2 * Math.PI * 40;
        ringRef.current.style.strokeDashoffset = String(C * progress);
      }
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phaseStartedAt, phaseDurationMs]);

  if (style === "bar") {
    return (
      <div className="absolute inset-x-[6%] bottom-[8.5%] z-10">
        <div className="h-[1vmin] w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={barRef}
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 will-change-[width]"
            style={{ width: "100%" }}
          />
        </div>
      </div>
    );
  }
  if (style === "digits") {
    return (
      <div
        ref={digitsRef}
        className="absolute right-[4%] top-[10%] z-10 rounded-2xl border border-white/15 bg-black/40 px-[1.6%] py-[1%] text-[5vmin] font-black tabular-nums text-white backdrop-blur"
      >
        --
      </div>
    );
  }
  const C = 2 * Math.PI * 40;
  return (
    <div className="absolute right-[4%] top-[12%] z-10 h-[10vmin] w-[10vmin]">
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
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
      </svg>
      <div
        ref={ringDigitsRef}
        className="absolute inset-0 flex items-center justify-center text-[2.6vmin] font-black tabular-nums text-white"
      >
        --
      </div>
    </div>
  );
}

// ===========================================================================
// ShellFrame + helpers
// ===========================================================================

function ShellFrame({
  children,
  fit,
  aspect,
}: {
  children: React.ReactNode;
  fit: boolean;
  aspect: "16:9" | "9:16";
}) {
  if (!fit) {
    return <div className="relative h-screen w-screen overflow-hidden bg-black text-white">{children}</div>;
  }
  const ratio = aspect === "16:9" ? "aspect-video" : "aspect-[9/16]";
  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black ${ratio}`}>
      {children}
    </div>
  );
}

function choiceLabel(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "label" in c) return String((c as { label: string }).label);
  return String(c ?? "");
}